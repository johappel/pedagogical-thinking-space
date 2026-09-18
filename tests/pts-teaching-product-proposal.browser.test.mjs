// Browser E2E (Spike Phase 3 §22/§23/§24) — real Chromium, real client.js, real
// route handler + store. Proves the whole teacher-facing transition end to end:
//
//   opener "Unterrichtsreihe" → Zustand A → "Ersten Entwurf entwickeln"
//   → Product Proposal (Zustand B) → a change to the proposal → "So übernehmen"
//   → Teaching Product editor (Zustand C) → Quill edit + save → companion edit
//   → reload persists the product → "Zur Werkstatt" leaves the product intact.
//
// Run: node --test tests/pts-teaching-product-proposal.browser.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { startProposalHarness } from './support/teaching-product-proposal-harness.mjs';

const shotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'pts-teaching-product-proposal');

async function openTab(page) {
	await page.locator('.tp-opener').click();
	await page.waitForSelector('.ptp-root');
}

test('Phase 3 browser E2E: Werkstatt → Proposal → Teaching Product', { timeout: 180000 }, async (t) => {
	await mkdir(shotDir, { recursive: true });
	const harness = await startProposalHarness();
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
	t.after(async () => { await page.context().close(); await browser.close(); await harness.close(); await rm(harness.root, { recursive: true, force: true }); });

	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto(harness.url);
	await page.waitForFunction(() => window.__harnessReady === true);

	// ── The opener sits in the frame overlay, teacher-facing "Unterrichtsreihe" ──
	await page.waitForSelector('.tp-opener');
	assert.match(await page.locator('.tp-opener').innerText(), /Unterrichtsreihe/);
	await page.screenshot({ path: path.join(shotDir, '1-opener.png') });

	// ── Zustand A: no product yet ───────────────────────────────────────────────
	await openTab(page);
	await page.waitForSelector('text=Ersten Entwurf entwickeln');
	await page.screenshot({ path: path.join(shotDir, '2-zustand-A.png') });

	// ── Develop a first draft → Product Proposal (Zustand B) ────────────────────
	await page.getByRole('button', { name: 'Ersten Entwurf entwickeln' }).click();
	await page.waitForSelector('text=Vorschlag für die Unterrichtsreihe');
	const proposedCount = await page.locator('.ptp-plesson').count();
	assert.ok(proposedCount >= 2, 'the proposal has a multi-lesson dramaturgy');
	// the opener reflects the draft state
	await page.waitForFunction(() => /Entwurf/.test(document.querySelector('.tp-opener')?.innerText || ''));
	await page.screenshot({ path: path.join(shotDir, '3-proposal.png') });

	// ── Change the proposal together (remove one lesson) ────────────────────────
	await page.getByRole('button', { name: 'Gemeinsam verändern' }).click();
	await page.locator('.ptp-plesson', { hasText: 'Stunde' }).last().getByRole('button', { name: 'Entfernen' }).click();
	await page.waitForFunction((n) => document.querySelectorAll('.ptp-plesson').length === n - 1, proposedCount);
	const afterEdit = await page.locator('.ptp-plesson').count();
	assert.equal(afterEdit, proposedCount - 1, 'the proposal change took effect');
	await page.screenshot({ path: path.join(shotDir, '4-proposal-edited.png') });

	// ── Accept → Teaching Product (Zustand C) ───────────────────────────────────
	await page.getByRole('button', { name: 'So übernehmen' }).click();
	await page.waitForSelector('.ql-editor');
	const lessonTabs = await page.locator('.ptp-tab').count();
	assert.equal(lessonTabs, afterEdit, 'the accepted product has one lesson per accepted proposal lesson');
	assert.match(await page.locator('.ptp-focus').innerText(), /Wir arbeiten gerade an:/);
	await page.screenshot({ path: path.join(shotDir, '5-teaching-product.png') });

	// ── Edit a phase block in Quill and save ────────────────────────────────────
	const editor = page.locator('.ql-editor');
	await editor.focus();
	await page.keyboard.press('Control+End');
	await editor.pressSequentially(' Konkrete Aufgabe für die Klasse.');
	await page.waitForSelector('text=ungespeicherte Änderungen');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await page.waitForSelector('text=gespeichert');
	await page.screenshot({ path: path.join(shotDir, '6-quill-saved.png') });

	// ── A targeted companion edit lands on the same block ───────────────────────
	const summary = page.locator('.ptp-debug summary');
	if (!(await page.locator('.ptp-debug').evaluate((el) => el.open).catch(() => false))) await summary.click();
	await page.getByRole('button', { name: 'Companion-Edit (Demo)' }).click();
	await page.waitForFunction(() => (document.querySelector('.ql-editor')?.innerText || '').includes('Companion'));

	// ── Reload → the product persists (Zustand C returns) ───────────────────────
	// ── Reload → the product persists (Zustand C returns) ───────────────────────
	// The demo companion edit is authoritative and replaces the block, so the
	// latest persisted content is the companion version; that is what must return.
	await page.reload();
	await page.waitForFunction(() => window.__harnessReady === true);
	await openTab(page);
	await page.waitForSelector('.ql-editor');
	await page.waitForFunction(() => (document.querySelector('.ql-editor')?.innerText || '').includes('Companion'));
	assert.ok((await editor.innerText()).includes('Companion'), 'the latest (companion) edit persisted across reload');
	assert.equal(await page.locator('.ptp-tab').count(), afterEdit, 'lesson structure persisted');

	// ── Zurück zur Werkstatt — the product is not changed by returning ──────────
	await page.getByRole('button', { name: 'Zur Werkstatt' }).click();
	await page.waitForFunction(() => window.__workshopOpened === true);
	await page.screenshot({ path: path.join(shotDir, '7-workshop.png') });

	// reopening the product still shows the same Teaching Product
	await openTab(page);
	await page.waitForSelector('.ql-editor');
	assert.equal(await page.locator('.ptp-tab').count(), afterEdit, 'product intact after returning from workshop');

	assert.deepEqual(errors, [], 'no uncaught page errors');
});
