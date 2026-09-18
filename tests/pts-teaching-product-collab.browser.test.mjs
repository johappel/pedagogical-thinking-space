// Phase 2B browser E2E — two independent browser contexts (teacher + companion)
// editing the SAME block live over Yjs, converging without a merge dialog, and
// producing exactly ONE PTS revision at an explicit settle. Real Chromium, real
// y-quill, real WebSocket, real store.
//
// Run: node --test tests/pts-teaching-product-collab.browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { startCollabHarness } from './support/teaching-product-collab-harness.mjs';

const shotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'pts-teaching-product-collab');

async function readySeeded(page) {
	await page.waitForFunction(() => window.__collabReady === true && window.__collab.connected === true);
	await page.waitForFunction(() => {
		const ed = document.querySelector('.ql-editor');
		return ed && ed.innerText.includes('Gott antwortet');
	});
}

async function typeAtEnd(page, text) {
	const editor = page.locator('.ql-editor');
	await editor.focus();
	await page.keyboard.press('Control+End');
	await editor.pressSequentially(text);
}

async function waitConverge(a, b, timeoutMs = 8000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const ta = (await a.locator('.ql-editor').innerText()).trim();
		const tb = (await b.locator('.ql-editor').innerText()).trim();
		if (ta === tb && ta.includes('Lehrkraftteil') && ta.includes('Companionteil')) return ta;
		await a.waitForTimeout(120);
	}
	const ta = (await a.locator('.ql-editor').innerText()).trim();
	const tb = (await b.locator('.ql-editor').innerText()).trim();
	throw new Error(`no convergence:\n teacher="${ta}"\n companion="${tb}"`);
}

test('Phase 2B browser E2E: live collab, single commit, provenance, reload', { timeout: 180000 }, async (t) => {
	await mkdir(shotDir, { recursive: true });
	const harness = await startCollabHarness();
	const browser = await chromium.launch();
	const teacherCtx = await browser.newContext({ viewport: { width: 720, height: 560 } });
	const companionCtx = await browser.newContext({ viewport: { width: 720, height: 560 } });
	const teacher = await teacherCtx.newPage();
	const companion = await companionCtx.newPage();
	const errors = [];
	teacher.on('pageerror', (e) => errors.push('teacher: ' + e));
	companion.on('pageerror', (e) => errors.push('companion: ' + e));
	t.after(async () => { await teacherCtx.close(); await companionCtx.close(); await browser.close(); await harness.close(); await rm(harness.root, { recursive: true, force: true }); });

	const stats = async () => (await fetch(harness.url + 'stats')).json();
	const product = async () => (await fetch(harness.url + 'product')).json();

	await teacher.goto(harness.url + '?role=teacher');
	await companion.goto(harness.url + '?role=companion');
	await readySeeded(teacher);
	await readySeeded(companion);

	// ── Scenario A: live collaboration, both edit the same block ────────────────
	await typeAtEnd(teacher, ' Lehrkraftteil.');
	await typeAtEnd(companion, ' Companionteil.');
	const converged = await waitConverge(teacher, companion);
	assert.ok(converged.includes('Lehrkraftteil') && converged.includes('Companionteil'), 'both contributions visible on both clients');
	await teacher.screenshot({ path: path.join(shotDir, 'A-teacher-live.png') });
	await companion.screenshot({ path: path.join(shotDir, 'A-companion-live.png') });

	// ── Scenario B: many live updates → exactly one PTS revision at settle ──────
	const before = await stats();
	assert.ok(before.updateCount >= 20, `many live Yjs updates before commit (${before.updateCount})`);
	assert.equal(before.revisionCount, 0, 'no domain revision from live editing');

	await teacher.getByRole('button', { name: 'Commit (settle)' }).click();
	await teacher.waitForFunction(() => window.__collab.lastCommitted && window.__collab.lastCommitted.revision >= 1);
	const after = await stats();
	assert.equal(after.revisionCount, 1, 'exactly one PTS revision from many updates');

	const prod1 = await product();
	assert.equal(prod1.revisions.length, 1, 'one revision persisted');
	assert.equal(prod1.revisions[0].actor, 'collaborative');
	await teacher.screenshot({ path: path.join(shotDir, 'B-committed.png') });

	// ── Scenario C: provenance — both actors recorded ──────────────────────────
	assert.deepEqual(prod1.revisions[0].contributors, ['companion', 'teacher'], 'contributor provenance covers both actors');
	assert.equal(prod1.revisions[0].delta.entries[0].classification, 'content', 'semanticDelta stays domain logic');
	// both clients received the single committed event
	const teacherCommit = await teacher.evaluate(() => window.__collab.lastCommitted);
	const companionCommit = await companion.evaluate(() => window.__collab.lastCommitted);
	assert.equal(teacherCommit.revision, 1);
	assert.equal(companionCommit.revision, 1);

	// ── Scenario D: reload — same block, same ids, same content, no duplicate ───
	const blockId = harness.target.blockId;
	await teacher.reload();
	await companion.reload();
	await readySeeded(teacher).catch(() => {}); // seeded text now includes the edits; re-check below
	await teacher.waitForFunction(() => window.__collab && window.__collab.connected);
	await companion.waitForFunction(() => window.__collab && window.__collab.connected);
	await teacher.waitForFunction(() => document.querySelector('.ql-editor') && document.querySelector('.ql-editor').innerText.includes('Lehrkraftteil'));
	const reloaded = (await teacher.locator('.ql-editor').innerText()).trim();
	assert.ok(reloaded.includes('Lehrkraftteil') && reloaded.includes('Companionteil'), 'committed content present after reload');

	const prod2 = await product();
	assert.equal(prod2.series.lessons[0].phases[1].blocks.length, 1, 'no duplicate block after reload');
	assert.equal(prod2.series.lessons[0].phases[1].blocks[0].id, blockId, 'block id stable across reload');
	await teacher.screenshot({ path: path.join(shotDir, 'D-reload.png') });

	assert.deepEqual(errors, [], 'no uncaught page errors');
});
