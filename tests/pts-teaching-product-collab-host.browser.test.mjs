// Phase 2C — real-host BROWSER E2E (§19). A real Chromium page served by the
// ACTUAL dsh-host-webserver collaborates with a programmatic worker over the
// real collab WebSocket. Proves the central Phase-2C case end to end.
// Run: node --test --test-force-exit tests/pts-teaching-product-collab-host.browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { startDshHostCollabHarness } from './support/dsh-host-collab-harness.mjs';

const shotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'pts-teaching-product-collab-host');

test('Phase 2C real DSH host: teacher + programmatic worker on one block', { timeout: 180000 }, async (t) => {
	await mkdir(shotDir, { recursive: true });
	const harness = await startDshHostCollabHarness();
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 760, height: 560 } });
	const teacher = await ctx.newPage();
	const errors = [];
	teacher.on('pageerror', (e) => errors.push(String(e)));
	t.after(async () => { await ctx.close(); await browser.close(); await harness.close(); await rm(harness.root, { recursive: true, force: true }); });

	const T = harness.target;
	const workerEdit = (find, replace) => fetch(`${harness.origin}${harness.prefix}/api/worker-edit`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sessionId: T.sessionId, lessonId: T.lessonId, phaseId: T.phaseId, blockId: T.blockId, find, replace }),
	});
	const stats = async () => (await fetch(`${harness.origin}${harness.prefix}/api/collab-stats?session=${T.sessionId}&lesson=${T.lessonId}&phase=${T.phaseId}&block=${T.blockId}`)).json();
	const product = async () => (await (await fetch(`${harness.origin}${harness.prefix}/api/product?sessionId=${T.sessionId}`)).json()).product;

	await teacher.goto(harness.pageUrl('teacher'));
	await teacher.waitForFunction(() => window.__collabReady === true && window.__collab.connected === true);
	await teacher.waitForFunction(() => document.querySelector('.ql-editor') && document.querySelector('.ql-editor').innerText.includes('Erster Teil bleibt'));

	// teacher edits the first paragraph
	const editor = teacher.locator('.ql-editor');
	await editor.focus();
	await teacher.keyboard.press('Control+Home');
	await editor.pressSequentially('Lehrkraft: ');
	await teacher.waitForFunction(() => document.querySelector('.ql-editor').innerText.includes('Lehrkraft:'));

	// the worker/companion runtime edits ONLY the last paragraph, programmatically
	const res = await workerEdit('Zweiter Teil folgt.', 'Companion-Fassung des Auftrags.');
	assert.equal(res.status, 200);
	await teacher.waitForFunction(() => document.querySelector('.ql-editor').innerText.includes('Companion-Fassung'));
	const live = await editor.innerText();
	assert.ok(live.includes('Lehrkraft:'), 'teacher edit preserved under live worker edit');
	assert.ok(live.includes('Erster Teil bleibt.'), 'untouched teacher text preserved');
	await teacher.screenshot({ path: path.join(shotDir, 'A-teacher-and-worker-live.png') });

	// many live updates so far, still zero domain revisions
	const before = await stats();
	assert.ok(before.updateCount >= 10, `many live updates (${before.updateCount})`);
	assert.equal(before.revisionCount, 0);

	// settle → exactly one domain revision with both contributors
	await teacher.getByRole('button', { name: 'Commit (settle)' }).click();
	await teacher.waitForFunction(() => window.__collab.lastCommitted && window.__collab.lastCommitted.revision >= 1);
	const after = await stats();
	assert.equal(after.revisionCount, 1, 'one PTS revision from many updates on the real host');
	const prod1 = await product();
	assert.equal(prod1.revisions.length, 1);
	assert.equal(prod1.revisions[0].actor, 'collaborative');
	assert.deepEqual(prod1.revisions[0].contributors, ['companion', 'teacher']);
	assert.equal(prod1.revisions[0].delta.entries[0].classification, 'content');
	await teacher.screenshot({ path: path.join(shotDir, 'B-committed.png') });

	// reconnect: teacher reloads; a worker edit lands; teacher converges after reconnect
	await workerEdit('Companion-Fassung des Auftrags.', 'Companion-Fassung, erneut geschärft.');
	await teacher.reload();
	await teacher.waitForFunction(() => window.__collab && window.__collab.connected === true);
	await teacher.waitForFunction(() => document.querySelector('.ql-editor') && document.querySelector('.ql-editor').innerText.includes('erneut geschärft'));
	const reconnected = await editor.innerText();
	assert.ok(reconnected.includes('Lehrkraft:'), 'teacher contribution still present after reconnect');
	await teacher.screenshot({ path: path.join(shotDir, 'C-reconnect.png') });

	// reload/no-duplicate: same block id, still exactly one block
	const prod2 = await product();
	assert.equal(prod2.series.lessons[0].phases[1].blocks.length, 1, 'no duplicate block');
	assert.equal(prod2.series.lessons[0].phases[1].blocks[0].id, T.blockId, 'stable block id');

	assert.deepEqual(errors, [], 'no uncaught page errors');
});
