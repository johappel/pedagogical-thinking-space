// Phase 2C — real DSH host seam tests. Boots the ACTUAL dsh-host-webserver via
// cordis and drives the collaboration WebSocket with real ws clients + real
// Yjs. Proves the production upgrade/auth/settle path headlessly and fast.
// Run: node --test --test-force-exit tests/pts-teaching-product-collab-host.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import * as Y from 'yjs';

import { startDshHostCollabHarness } from './support/dsh-host-collab-harness.mjs';
import { loadProduct, saveProduct } from '../plugins/pts-teaching-product/lib/store.mjs';

const b64e = (u8) => Buffer.from(u8).toString('base64');
const b64d = (s) => new Uint8Array(Buffer.from(String(s), 'base64'));
const visible = (s) => String(s).replace(/\n+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
	const start = Date.now();
	while (Date.now() - start < ms) { if (await fn()) return true; await sleep(40); }
	throw new Error('waitFor timed out');
}

function connect(harness, { role = 'teacher', block } = {}) {
	const t = harness.target;
	const blockId = block === undefined ? t.blockId : block;
	const url = `${harness.wsUrl}?session=${t.sessionId}&lesson=${t.lessonId}&phase=${t.phaseId}&block=${blockId}&role=${role}`;
	return new Promise((resolve, reject) => {
		const doc = new Y.Doc();
		const ytext = doc.getText('quill');
		const committed = [];
		const box = { invalidated: null };
		const ws = new WebSocket(url);
		let resolved = false;
		ws.on('message', (data) => {
			const m = JSON.parse(data.toString());
			if (m.type === 'sync' || m.type === 'update') Y.applyUpdate(doc, b64d(m.update), 'remote');
			if (m.type === 'sync' && !resolved) { resolved = true; resolve(client); }
			else if (m.type === 'committed') committed.push(m);
			else if (m.type === 'invalidated') box.invalidated = m;
		});
		doc.on('update', (u, origin) => { if (origin !== 'remote' && ws.readyState === 1) ws.send(JSON.stringify({ type: 'update', role, update: b64e(u) })); });
		ws.on('error', (err) => { if (!resolved) reject(err); });
		ws.on('unexpected-response', (_req, res) => { if (!resolved) reject(new Error('upgrade-rejected:' + res.statusCode)); });
		const client = {
			ws, doc, ytext, committed, box,
			settle: () => ws.send(JSON.stringify({ type: 'settle' })),
			close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
		};
	});
}

test('real DSH webServer carries the collab upgrade; many updates → one revision', async (t) => {
	const harness = await startDshHostCollabHarness();
	t.after(async () => { await harness.close(); await rm(harness.root, { recursive: true, force: true }); });
	const teacher = await connect(harness);
	assert.equal(visible(teacher.ytext.toString()), 'Erster Teil bleibt. Zweiter Teil folgt.');

	const add = ' Ergänzung mit vielen Zeichen.';
	for (let i = 0; i < add.length; i += 1) teacher.ytext.insert(teacher.ytext.length - 1, add[i]);
	await sleep(150);
	const statsUrl = `${harness.origin}${harness.prefix}/api/collab-stats?session=${harness.target.sessionId}&lesson=${harness.target.lessonId}&phase=${harness.target.phaseId}&block=${harness.target.blockId}`;
	const before = await (await fetch(statsUrl)).json();
	assert.ok(before.updateCount >= 20, `many updates on the real host (${before.updateCount})`);
	assert.equal(before.revisionCount, 0);

	teacher.settle();
	await waitFor(() => teacher.committed.length === 1);
	const after = await (await fetch(statsUrl)).json();
	assert.equal(after.revisionCount, 1, 'exactly one revision from many updates');
	const product = await loadProduct(harness.root);
	assert.equal(product.revisions.length, 1);
	assert.equal(product.revisions[0].actor, 'collaborative');
	await teacher.close();
});

test('room authorization is fail-closed: an unknown block is rejected at upgrade', async (t) => {
	const harness = await startDshHostCollabHarness();
	t.after(async () => { await harness.close(); await rm(harness.root, { recursive: true, force: true }); });
	await assert.rejects(() => connect(harness, { block: 'block-does-not-exist' }), (err) => /upgrade-rejected:404/.test(String(err.message)));
});

test('actor cannot be faked by the client: a browser edit is attributed to teacher', async (t) => {
	const harness = await startDshHostCollabHarness();
	t.after(async () => { await harness.close(); await rm(harness.root, { recursive: true, force: true }); });
	// The client claims companion in its query, but the server assigns teacher.
	const faker = await connect(harness, { role: 'companion' });
	faker.ytext.insert(faker.ytext.length - 1, ' x');
	await sleep(80);
	faker.settle();
	await waitFor(() => faker.committed.length === 1);
	const product = await loadProduct(harness.root);
	assert.deepEqual(product.revisions[0].contributors, ['teacher'], 'claimed companion was ignored');
	await faker.close();
});

test('a structural conflict invalidates the room and fails closed (no silent recreate)', async (t) => {
	const harness = await startDshHostCollabHarness();
	t.after(async () => { await harness.close(); await rm(harness.root, { recursive: true, force: true }); });
	const teacher = await connect(harness);
	teacher.ytext.insert(teacher.ytext.length - 1, ' mehr');
	await sleep(80);

	// the block is structurally removed while it is being edited live
	const product = await loadProduct(harness.root);
	product.series.lessons[0].phases[1].blocks = [];
	await saveProduct(harness.root, product);

	teacher.settle();
	await waitFor(() => teacher.box.invalidated !== null);
	assert.match(teacher.box.invalidated.reason, /unknown-block/);
	const reloaded = await loadProduct(harness.root);
	assert.equal(reloaded.series.lessons[0].phases[1].blocks.length, 0, 'no silent recreate of the deleted block');
	await teacher.close();
});

test('partial worker edit on the same Y.Doc keeps teacher text and yields both contributors', async (t) => {
	const harness = await startDshHostCollabHarness();
	t.after(async () => { await harness.close(); await rm(harness.root, { recursive: true, force: true }); });
	const teacher = await connect(harness);
	teacher.ytext.insert(0, 'Lehrkraft: ');
	await sleep(80);

	// the worker/companion runtime edits ONLY the last paragraph, programmatically
	await harness.wiring.workerReplace(harness.target, { find: 'Zweiter Teil folgt.', replace: 'Companion-Fassung des Auftrags.' });
	await waitFor(() => teacher.ytext.toString().includes('Companion-Fassung'));

	const text = teacher.ytext.toString();
	assert.ok(text.includes('Lehrkraft:'), 'teacher edit preserved');
	assert.ok(text.includes('Erster Teil bleibt.'), 'untouched teacher text preserved');
	assert.ok(text.includes('Companion-Fassung des Auftrags.'), 'worker edit is live');

	teacher.settle();
	await waitFor(() => teacher.committed.length === 1);
	const product = await loadProduct(harness.root);
	assert.deepEqual(product.revisions[0].contributors, ['companion', 'teacher']);
	assert.equal(product.revisions[0].actor, 'collaborative');
	assert.equal(product.series.lessons[0].phases[1].blocks[0].id, harness.target.blockId, 'block id stable');
	void path; void readFile;
	await teacher.close();
});
