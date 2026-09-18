// Phase 2B unit tests — the CRDT⇄domain commit boundary (the core of the spike).
// Proves: many Yjs updates → one PTS revision; convergence; contributor
// provenance; semanticDelta stays domain logic; CRDT does not solve structural
// conflicts. No browser — Yjs runs headless in Node with socket stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';

import { buildDemoProduct } from '../plugins/pts-teaching-product/lib/demo.mjs';
import { saveProduct, saveCollaborativeEdit, loadProduct } from '../plugins/pts-teaching-product/lib/store.mjs';
import { findBlock, commit, createProductFromSnapshot, addLesson, addPhase, addBlock, ProductError } from '../plugins/pts-teaching-product/lib/product.mjs';
import { createProductSnapshot } from '../plugins/pts-teaching-product/lib/snapshot.mjs';
import { createCollabHub } from '../dsh-plugins/pts-teaching-product-editor/lib/collab.mjs';

const b64e = (u8) => Buffer.from(u8).toString('base64');
const b64d = (s) => new Uint8Array(Buffer.from(String(s), 'base64'));
const visible = (s) => String(s).replace(/\n+$/, ''); // Quill docs always end in a newline

async function setupRoom(content) {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-collab-'));
	const product = buildDemoProduct();
	const lesson = product.series.lessons[0];
	const phase = lesson.phases[1];
	const block = phase.blocks[0];
	block.content = content;
	await saveProduct(root, product);
	const target = { sessionId: 's', lessonId: lesson.id, phaseId: phase.id, blockId: block.id };
	const hub = createCollabHub({ resolveRoot: () => root, loadProduct, findBlock, saveCollaborativeEdit, idleMs: 0 });
	return { root, hub, target, lesson, phase, block };
}

async function makeClient(hub, target, role, committed) {
	const doc = new Y.Doc();
	const socket = {
		send(data) {
			const m = JSON.parse(data);
			if (m.type === 'sync' || m.type === 'update') Y.applyUpdate(doc, b64d(m.update), 'remote');
			else if (m.type === 'committed' && committed) committed.push(m);
		},
	};
	const room = await hub.join(target, socket);
	doc.on('update', (u, origin) => { if (origin !== 'remote') hub.applyClientUpdate(room, role, b64e(u), socket); });
	return { doc, socket, room, ytext: doc.getText('quill') };
}

test('many overlapping Yjs updates converge to ONE domain revision with both contributors', async (t) => {
	const { root, hub, target } = await setupRoom('Gott antwortet auf Fragen.');
	t.after(() => rm(root, { recursive: true, force: true }));
	const committed = [];
	const teacher = await makeClient(hub, target, 'teacher', committed);
	const companion = await makeClient(hub, target, 'companion', committed);

	// both start from the seeded text
	assert.equal(visible(teacher.ytext.toString()), 'Gott antwortet auf Fragen.');
	assert.equal(visible(companion.ytext.toString()), 'Gott antwortet auf Fragen.');

	// teacher inserts "persönliche " before "Fragen" — char by char (keystrokes)
	const insertAt = 'Gott antwortet auf '.length;
	const teacherWord = 'persönliche ';
	for (let i = 0; i < teacherWord.length; i += 1) teacher.ytext.insert(insertAt + i, teacherWord[i]);

	// companion prepends "Vielleicht " at the very start — char by char
	const companionWord = 'Vielleicht ';
	for (let i = 0; i < companionWord.length; i += 1) companion.ytext.insert(i, companionWord[i]);

	// convergence WITHOUT a manual merge dialog
	assert.equal(teacher.ytext.toString(), companion.ytext.toString(), 'both clients converge');
	assert.ok(teacher.ytext.toString().includes('persönliche'), 'teacher contribution present');
	assert.ok(teacher.ytext.toString().includes('Vielleicht'), 'companion contribution present');

	const room = hub.roomFor(target);
	assert.ok(room.updateCount >= 20, `many live updates (${room.updateCount})`);
	assert.equal(room.revisionCount, 0, 'no revision from live updates alone');

	// the single controlled commit
	const result = await hub.forceSettle(room);
	assert.equal(result.noop, false);
	assert.equal(room.revisionCount, 1, 'exactly one domain revision from many updates');

	const product = await loadProduct(root);
	assert.equal(product.revisions.length, 1);
	const rev = product.revisions[0];
	assert.equal(rev.actor, 'collaborative');
	assert.deepEqual(rev.contributors, ['companion', 'teacher'], 'both contributors recorded, sorted');
	assert.equal(rev.delta.entries[0].classification, 'content');
	assert.equal(product.series.lessons[0].phases[1].blocks[0].content, visible(teacher.ytext.toString()));

	// the committed broadcast reached the clients
	assert.ok(committed.some((m) => m.classification === 'content'));

	// a settle with no new edits creates no revision
	const again = await hub.forceSettle(room);
	assert.equal(again, null);
	assert.equal(room.revisionCount, 1);
});

test('a settle whose merged text only changed formatting classifies as formatting', async (t) => {
	const { root, hub, target } = await setupRoom('Vergleicht die Bilder.');
	t.after(() => rm(root, { recursive: true, force: true }));
	const teacher = await makeClient(hub, target, 'teacher');
	// bold the whole line — visible text unchanged, only markup differs
	teacher.ytext.format(0, 'Vergleicht die Bilder.'.length, { bold: true });

	const room = hub.roomFor(target);
	const result = await hub.forceSettle(room);
	assert.equal(result.noop, false);
	const product = await loadProduct(root);
	assert.equal(product.revisions[0].delta.entries[0].classification, 'formatting');
	assert.equal(product.revisions[0].delta.pedagogicallyRelevant, false, 'formatting must not be pedagogically relevant');
});

test('the companion does not get one pedagogical event per keystroke', async (t) => {
	const { root, hub, target } = await setupRoom('Hallo');
	t.after(() => rm(root, { recursive: true, force: true }));
	const committed = [];
	const teacher = await makeClient(hub, target, 'teacher', committed);
	const word = ' Welt daraus wird ein Satz.'; // 27 keystrokes
	for (let i = 0; i < word.length; i += 1) teacher.ytext.insert(teacher.ytext.length, word[i]);

	const room = hub.roomFor(target);
	assert.ok(room.updateCount >= 14, `>= 14 live updates (${room.updateCount})`);
	await hub.forceSettle(room);
	assert.equal(room.revisionCount, 1, 'one commit, not one per keystroke');
	assert.equal(committed.length, 1, 'clients see exactly one committed event');
});

test('CRDT does not resolve a structural conflict: settling a deleted block fails closed', async (t) => {
	const { root, hub, target, lesson, phase } = await setupRoom('Text.');
	t.after(() => rm(root, { recursive: true, force: true }));
	const teacher = await makeClient(hub, target, 'teacher');
	teacher.ytext.insert(teacher.ytext.length, ' mehr');

	// meanwhile the block is structurally removed (a conflict CRDT cannot merge)
	const product = await loadProduct(root);
	product.series.lessons[0].phases[1].blocks = [];
	await saveProduct(root, product);
	void lesson; void phase;

	const room = hub.roomFor(target);
	await assert.rejects(() => hub.forceSettle(room), (err) => err instanceof ProductError && err.code === 'unknown-block');
});

test('only the teacher edited → contributors is [teacher]', async (t) => {
	const { root, hub, target } = await setupRoom('Start.');
	t.after(() => rm(root, { recursive: true, force: true }));
	const teacher = await makeClient(hub, target, 'teacher');
	teacher.ytext.insert(teacher.ytext.length, ' Ende.');
	const room = hub.roomFor(target);
	await hub.forceSettle(room);
	const product = await loadProduct(root);
	assert.deepEqual(product.revisions[0].contributors, ['teacher']);
});

test('domain commit records contributors and rejects an unknown contributor', () => {
	const snap = createProductSnapshot({
		denkstandEntries: [{ id: 'd1', status: 'teacher_confirmed', significance: 'anchor', statement: 'x' }],
		momentLedger: { schema: 'ptspace.learning-moment-bindings/v1', moments: [{ domainId: 'lm-01', version: 1 }] },
		sourceRevision: 1,
		selection: { learningMomentIds: ['lm-01'], decisionIds: ['d1'], openQuestionIds: [] },
	}, { now: () => 'T', id: (p) => `${p}-1` });
	let p = createProductFromSnapshot(snap, { title: 'S' }, { now: () => 'T', id: (p2) => `${p2}-1` });
	p = addLesson(p, { title: 'L' }, { id: (x) => `${x}-1` }).product;
	const lessonId = p.series.lessons[0].id;
	p = addPhase(p, { lessonId, title: 'P' }, { id: (x) => `${x}-1` }).product;
	const phaseId = p.series.lessons[0].phases[0].id;
	p = addBlock(p, { lessonId, phaseId, type: 'task', content: 'a' }, { id: (x) => `${x}-1` }).product;
	const blockId = p.series.lessons[0].phases[0].blocks[0].id;

	const change = { operation: 'block.replace', lessonId, phaseId, blockId, blockType: 'task', before: 'a', after: 'b' };
	const committed = commit(p, [change], { actor: 'collaborative', contributors: ['companion', 'teacher', 'teacher'], now: () => 'T' });
	assert.deepEqual(committed.revision.contributors, ['companion', 'teacher']);
	assert.throws(() => commit(p, [change], { actor: 'collaborative', contributors: ['nobody'] }), (err) => err instanceof ProductError && err.code === 'invalid-contributors');
});
