// Browser E2E (Phase 2A §18) — real Chromium, real client.js, real Quill, real
// route handler + store. Proves the three acceptance scenarios end to end:
//   A  teacher edits a block in Quill, saves, reload persists, actor=teacher
//   B  a targeted companion edit changes the same block, ids stable, actor=companion
//   C  companion edits under an unsaved teacher edit → conflict, no silent overwrite
//
// Run: node --test tests/pts-teaching-product-editor.browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { startHarness } from './support/teaching-product-harness.mjs';

const shotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'pts-teaching-product');

async function readDebug(page) {
	const summary = page.locator('.ptp-debug summary');
	if (await summary.count()) {
		const open = await page.locator('.ptp-debug').evaluate((el) => el.open).catch(() => false);
		if (!open) await summary.click();
	}
	const text = await page.locator('.ptp-debug pre').first().textContent();
	return JSON.parse(text);
}

async function selectPhase(page, title) {
	await page.locator('.ptp-phase', { hasText: title }).click();
	await page.waitForFunction((t) => {
		const ed = document.querySelector('.ql-editor');
		return ed && ed.innerText && ed.innerText.trim().length > 0 && document.querySelector('.ptp-phase-title')?.textContent?.includes(t);
	}, title);
}

test('Phase 2A browser E2E: teacher edit, companion edit, conflict', { timeout: 180000 }, async (t) => {
	await mkdir(shotDir, { recursive: true });
	const harness = await startHarness();
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
	t.after(async () => { await page.context().close(); await browser.close(); await harness.close(); await rm(harness.root, { recursive: true, force: true }); });

	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto(harness.url);
	await page.waitForFunction(() => window.__harnessReady === true);

	// ── Scenario A: teacher ────────────────────────────────────────────────────
	await page.getByText('Demo-Unterrichtsreihe erstellen').click();
	await page.waitForSelector('.ql-editor');
	await selectPhase(page, 'Erarbeitung');

	const beforeEdit = await readDebug(page);
	const blockId = beforeEdit.blockId;
	assert.ok(blockId, 'a block id is present');
	assert.deepEqual(beforeEdit.provenance.learningMoments.map((m) => m.domainId).sort(), ['lm-01', 'lm-02', 'lm-03']);

	const editor = page.locator('.ql-editor');
	await editor.focus();
	await page.keyboard.press('Control+End');
	await editor.pressSequentially(' Nennt drei konkrete Unterschiede.');
	await page.waitForSelector('text=ungespeicherte Änderungen');
	await page.screenshot({ path: path.join(shotDir, 'A1-teacher-dirty.png') });

	await page.getByRole('button', { name: 'Speichern' }).click();
	await page.waitForSelector('text=gespeichert');
	const afterSave = await readDebug(page);
	assert.equal(afterSave.lastChange.actor, 'teacher', 'saved revision actor is teacher');
	assert.equal(afterSave.blockId, blockId, 'block id stable across save');
	assert.ok(afterSave.baseRevision > beforeEdit.baseRevision, 'a new revision exists');
	// the teacher edit is a real content change, classified as content
	assert.ok(afterSave.lastChange.delta.entries.some((e) => e.classification === 'content'));
	await page.screenshot({ path: path.join(shotDir, 'A2-teacher-saved.png') });

	// reload → persistence
	await page.reload();
	await page.waitForFunction(() => window.__harnessReady === true);
	await page.waitForSelector('.ql-editor');
	await selectPhase(page, 'Erarbeitung');
	assert.ok((await editor.innerText()).includes('Nennt drei konkrete Unterschiede.'), 'teacher edit persisted across reload');
	const afterReload = await readDebug(page);
	assert.equal(afterReload.blockId, blockId, 'block id unchanged after reload');

	// ── Scenario B: companion (clean editor adopts) ────────────────────────────
	await page.getByRole('button', { name: 'Companion-Edit (Demo)' }).click();
	await page.waitForFunction(() => {
		const ed = document.querySelector('.ql-editor');
		return ed && ed.innerText.includes('Companion');
	});
	const afterCompanion = await readDebug(page);
	assert.equal(afterCompanion.lastChange.actor, 'companion', 'companion edit recorded');
	assert.equal(afterCompanion.blockId, blockId, 'block id stable under companion edit');
	assert.equal(afterCompanion.lessonId, afterReload.lessonId, 'lesson id stable');
	assert.equal(afterCompanion.phaseId, afterReload.phaseId, 'phase id stable');
	await page.screenshot({ path: path.join(shotDir, 'B-companion-edit.png') });

	// ── Scenario C: conflict (dirty editor is not overwritten) ─────────────────
	await editor.focus();
	await page.keyboard.press('Control+End');
	await editor.pressSequentially(' Lehrkraft-Zusatz ohne Speichern.');
	await page.waitForSelector('text=ungespeicherte Änderungen');
	const dirtyText = await editor.innerText();

	await page.getByRole('button', { name: 'Companion-Edit (Demo)' }).click();
	await page.waitForSelector('.ptp-conflict-msg');
	const stillDirty = await editor.innerText();
	assert.ok(stillDirty.includes('Lehrkraft-Zusatz ohne Speichern.'), 'unsaved teacher edit is NOT silently overwritten');
	assert.equal(stillDirty, dirtyText, 'editor content unchanged while conflict pending');
	await page.screenshot({ path: path.join(shotDir, 'C1-conflict.png') });

	// resolve by loading the incoming version
	await page.getByRole('button', { name: 'Neue Fassung laden' }).click();
	await page.waitForSelector('.ptp-conflict-msg', { state: 'detached' });
	assert.ok((await editor.innerText()).includes('Companion'), 'taking theirs loads the companion version');
	await page.screenshot({ path: path.join(shotDir, 'C2-resolved.png') });

	assert.deepEqual(errors, [], 'no uncaught page errors');
});
