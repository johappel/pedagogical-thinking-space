// Phase 2A test matrix (§19) — Quill adapter, persistence, dirty/conflict state.
// The existing pts-teaching-product.test.mjs (domain) must stay green alongside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { markupToOps, opsToMarkup, visibleText } from '../plugins/pts-teaching-product/lib/markup.mjs';
import { domainBlockToEditorState, editorStateToDomainMutation, applyEditorState } from '../plugins/pts-teaching-product/lib/quill-adapter.mjs';
import { classifyChange, semanticDelta, FORMATTING } from '../plugins/pts-teaching-product/lib/delta.mjs';
import { createProductSnapshot } from '../plugins/pts-teaching-product/lib/snapshot.mjs';
import { createProductFromSnapshot, addLesson, addPhase, addBlock, commit } from '../plugins/pts-teaching-product/lib/product.mjs';
import {
	openBlock, markEdited, beginSave, saveSucceeded, externalChange,
	resolveKeepMine, resolveTakeTheirs, canLeave, canAutoApplyExternal, EDITOR_STATE,
} from '../plugins/pts-teaching-product/lib/editor-session.mjs';
import { initProduct, loadProduct, saveBlockEdit, StoreError } from '../plugins/pts-teaching-product/lib/store.mjs';
import { companionReplaceBlock } from '../plugins/pts-teaching-product/lib/companion-edit.mjs';

const NOW = '2026-09-18T12:00:00.000Z';

function idGen() {
	const counters = new Map();
	return (prefix) => { const n = (counters.get(prefix) ?? 0) + 1; counters.set(prefix, n); return `${prefix}-${n}`; };
}
const det = () => ({ now: () => NOW, id: idGen() });

function snapshot() {
	return createProductSnapshot({
		denkstandEntries: [{ id: 'decision-17', status: 'teacher_confirmed', significance: 'anchor', statement: 'Gottesbild als Denkhebel' }],
		momentLedger: { schema: 'ptspace.learning-moment-bindings/v1', moments: [{ domainId: 'lm-03', version: 3 }] },
		sourceRevision: 42,
		selection: { learningMomentIds: ['lm-03'], decisionIds: ['decision-17'], openQuestionIds: [] },
	}, det());
}

// A product with one lesson, one phase, one task block carrying rich markup.
function seeded(content = 'Vergleicht die **Bilder**.') {
	const o = det();
	let p = createProductFromSnapshot(snapshot(), { title: 'KI und Gottesbild' }, o);
	p = addLesson(p, { title: 'Stunde 1', sourceRefs: ['learning-moment:lm-03', 'decision:decision-17'] }, o).product;
	const lessonId = p.series.lessons[0].id;
	p = addPhase(p, { lessonId, title: 'Erarbeitung', durationMinutes: 15 }, o).product;
	const phaseId = p.series.lessons[0].phases[0].id;
	p = addBlock(p, { lessonId, phaseId, type: 'task', content }, o).product;
	const blockId = p.series.lessons[0].phases[0].blocks[0].id;
	return { product: p, lessonId, phaseId, blockId };
}

// ───────────────────────────────────────────── markup ⇄ Quill Delta

test('markup round-trips through Quill Delta ops for the supported subset', () => {
	const samples = [
		'Ein einfacher Absatz.',
		'Vergleicht die **Bilder** und _notiert_ Unterschiede.',
		'# Überschrift',
		'## Kleinere Überschrift',
		'- erster Punkt\n- zweiter Punkt',
		'Siehe [Quelle](https://example.org).',
		'Ein `code` Fragment.',
	];
	for (const markup of samples) {
		assert.equal(opsToMarkup(markupToOps(markup)), markup, `round-trip: ${markup}`);
	}
});

test('an unsafe link scheme is dropped, not rendered', () => {
	const ops = markupToOps('[klick](javascript:alert(1))');
	assert.ok(!ops.some((op) => op.attributes && op.attributes.link));
});

test('visibleText strips all markup so formatting is detectable', () => {
	assert.equal(visibleText('# Titel'), 'Titel');
	assert.equal(visibleText('- **fett** und _kursiv_'), 'fett und kursiv');
	assert.equal(visibleText('[Wikipedia](https://x)'), 'Wikipedia');
});

// ───────────────────────────────────────────── Quill adapter

test('domainBlockToEditorState projects a block without mutating the product', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const before = JSON.stringify(product);
	const state = domainBlockToEditorState(product, { lessonId, phaseId, blockId });
	assert.equal(state.blockId, blockId);
	assert.equal(state.type, 'task');
	assert.ok(Array.isArray(state.editorDelta.ops));
	assert.equal(JSON.stringify(product), before); // pure read, no mutation
});

test('editorStateToDomainMutation yields editor-neutral content for the same block id', () => {
	const { lessonId, phaseId, blockId } = seeded();
	const editorDelta = { ops: [{ insert: 'Neuer ' }, { insert: 'Auftrag', attributes: { bold: true } }, { insert: '\n' }] };
	const mutation = editorStateToDomainMutation({ lessonId, phaseId, blockId }, editorDelta);
	assert.equal(mutation.blockId, blockId);
	assert.equal(mutation.content, 'Neuer **Auftrag**'); // markdown, NOT a Quill delta
});

test('applyEditorState changes exactly the target block in place (id preserved)', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const editorDelta = { ops: [{ insert: 'Vergleicht die Bilder und notiert drei Unterschiede.\n' }] };
	const result = applyEditorState(product, { lessonId, phaseId, blockId }, editorDelta);
	assert.equal(result.change.operation, 'block.replace');
	assert.equal(result.change.blockId, blockId);
	assert.equal(result.product.series.lessons[0].phases[0].blocks[0].content, 'Vergleicht die Bilder und notiert drei Unterschiede.');
});

test('a pure formatting edit through the adapter classifies as formatting', () => {
	const { product, lessonId, phaseId, blockId } = seeded('Vergleicht die Bilder.');
	// Same visible words, now bold + heading — only markup differs.
	const editorDelta = { ops: [{ insert: 'Vergleicht die Bilder.', attributes: { bold: true } }, { insert: '\n', attributes: { header: 1 } }] };
	const result = applyEditorState(product, { lessonId, phaseId, blockId }, editorDelta);
	assert.equal(classifyChange(result.change), FORMATTING);
});

test('a real content edit through the adapter classifies as content', () => {
	const { product, lessonId, phaseId, blockId } = seeded('Vergleicht die Bilder.');
	const editorDelta = { ops: [{ insert: 'Vergleicht die Bilder und benennt drei Unterschiede.\n' }] };
	const result = applyEditorState(product, { lessonId, phaseId, blockId }, editorDelta);
	assert.equal(classifyChange(result.change), 'content');
});

// ───────────────────────────────────────────── dirty / conflict state machine

test('opening, focusing and switching never make the editor dirty', () => {
	let session = openBlock({ blockId: 'block-1', baseRevision: 3 });
	assert.equal(session.status, EDITOR_STATE.CLEAN);
	assert.ok(canLeave(session)); // switching phases is safe while clean
});

test('an edit makes it dirty and a dirty editor may not be silently left', () => {
	let session = openBlock({ blockId: 'block-1', baseRevision: 3 });
	session = markEdited(session);
	assert.equal(session.status, EDITOR_STATE.DIRTY);
	assert.ok(!canLeave(session));
});

test('a clean editor adopts an external change; a dirty editor turns it into a conflict', () => {
	let clean = openBlock({ blockId: 'block-1', baseRevision: 3 });
	const adopted = externalChange(clean, 4);
	assert.equal(adopted.status, EDITOR_STATE.CLEAN);
	assert.equal(adopted.adopt, true);
	assert.ok(canAutoApplyExternal(clean));

	let dirty = markEdited(openBlock({ blockId: 'block-1', baseRevision: 3 }));
	const conflict = externalChange(dirty, 4);
	assert.equal(conflict.status, EDITOR_STATE.EXTERNALLY_CHANGED);
	assert.equal(conflict.adopt, false);
	assert.equal(conflict.conflictRevision, 4);
	assert.ok(!canAutoApplyExternal(dirty));
});

test('a conflict can be resolved either way without losing the other version', () => {
	let dirty = markEdited(openBlock({ blockId: 'block-1', baseRevision: 3 }));
	const conflict = externalChange(dirty, 4);
	assert.equal(resolveKeepMine(conflict).status, EDITOR_STATE.DIRTY);
	const took = resolveTakeTheirs(conflict);
	assert.equal(took.status, EDITOR_STATE.CLEAN);
	assert.equal(took.baseRevision, 4);
});

test('a successful save returns to clean at the new revision', () => {
	let session = markEdited(openBlock({ blockId: 'block-1', baseRevision: 3 }));
	session = beginSave(session);
	assert.equal(session.status, EDITOR_STATE.SAVING);
	session = saveSucceeded(session, 4);
	assert.equal(session.status, EDITOR_STATE.CLEAN);
	assert.equal(session.baseRevision, 4);
});

// ───────────────────────────────────────────── persistence + conflict backbone

test('store: seed, load, teacher save is one revision with actor teacher', async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-tp-'));
	t.after(() => rm(root, { recursive: true, force: true }));

	await initProduct(root, snapshot(), { title: 'KI und Gottesbild' }, det());
	// build one lesson/phase/block via load → mutate → saveProduct
	let product = await loadProduct(root);
	const { saveProduct } = await import('../plugins/pts-teaching-product/lib/store.mjs');
	product = addLesson(product, { title: 'Stunde 1', sourceRefs: ['learning-moment:lm-03'] }, det()).product;
	const lessonId = product.series.lessons[0].id;
	product = addPhase(product, { lessonId, title: 'Erarbeitung', durationMinutes: 15 }, det()).product;
	const phaseId = product.series.lessons[0].phases[0].id;
	product = addBlock(product, { lessonId, phaseId, type: 'task', content: 'Vergleicht die Bilder.' }, det()).product;
	const blockId = product.series.lessons[0].phases[0].blocks[0].id;
	await saveProduct(root, product);

	const committed = await saveBlockEdit(root, {
		lessonId, phaseId, blockId, content: 'Vergleicht die Bilder und notiert drei Unterschiede.',
		actor: 'teacher', expectedRevision: product.revision,
	}, { now: () => NOW });

	assert.equal(committed.revision.actor, 'teacher');
	assert.equal(committed.revision.changes.length, 1);

	const persisted = JSON.parse(await readFile(path.join(root, '.pts', 'teaching-product.json'), 'utf8'));
	assert.equal(persisted.series.lessons[0].phases[0].blocks[0].content, 'Vergleicht die Bilder und notiert drei Unterschiede.');
	assert.equal(persisted.series.lessons[0].phases[0].blocks[0].id, blockId); // stable id
	assert.deepEqual(persisted.series.lessons[0].sourceRefs, ['learning-moment:lm-03']); // provenance kept
});

test('store: a stale expectedRevision is rejected as a conflict (no silent overwrite)', async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-tp-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const { saveProduct } = await import('../plugins/pts-teaching-product/lib/store.mjs');

	await initProduct(root, snapshot(), { title: 'S' }, det());
	let product = await loadProduct(root);
	product = addLesson(product, { title: 'Stunde 1' }, det()).product;
	const lessonId = product.series.lessons[0].id;
	product = addPhase(product, { lessonId, title: 'Erarbeitung' }, det()).product;
	const phaseId = product.series.lessons[0].phases[0].id;
	product = addBlock(product, { lessonId, phaseId, type: 'task', content: 'Start.' }, det()).product;
	const blockId = product.series.lessons[0].phases[0].blocks[0].id;
	await saveProduct(root, product);

	// companion advances the revision on the same block
	await saveBlockEdit(root, { lessonId, phaseId, blockId, content: 'Companion-Fassung.', actor: 'companion', expectedRevision: product.revision }, { now: () => NOW });

	// teacher still holds the old revision → conflict
	await assert.rejects(
		saveBlockEdit(root, { lessonId, phaseId, blockId, content: 'Lehrkraft-Fassung.', actor: 'teacher', expectedRevision: product.revision }, { now: () => NOW }),
		(err) => err instanceof StoreError && err.code === 'conflict',
	);
	const persisted = await loadProduct(root);
	assert.equal(persisted.series.lessons[0].phases[0].blocks[0].content, 'Companion-Fassung.'); // teacher edit did not overwrite
});

test('store: the companion write path preserves neighbouring blocks and ids', async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-tp-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const { saveProduct } = await import('../plugins/pts-teaching-product/lib/store.mjs');

	await initProduct(root, snapshot(), { title: 'S' }, det());
	let product = await loadProduct(root);
	product = addLesson(product, { title: 'Stunde 1' }, det()).product;
	const lessonId = product.series.lessons[0].id;
	product = addPhase(product, { lessonId, title: 'Erarbeitung' }, det()).product;
	const phaseId = product.series.lessons[0].phases[0].id;
	product = addBlock(product, { lessonId, phaseId, type: 'task', content: 'Block A.' }, det()).product;
	product = addBlock(product, { lessonId, phaseId, type: 'note', content: 'Block B.' }, det()).product;
	const [a, b] = product.series.lessons[0].phases[0].blocks.map((x) => x.id);
	await saveProduct(root, product);

	await saveBlockEdit(root, { lessonId, phaseId, blockId: a, content: 'Block A neu.', actor: 'companion', expectedRevision: product.revision }, { now: () => NOW });
	const persisted = await loadProduct(root);
	assert.equal(persisted.series.lessons[0].phases[0].blocks[0].content, 'Block A neu.');
	assert.equal(persisted.series.lessons[0].phases[0].blocks[1].content, 'Block B.'); // neighbour untouched
	assert.deepEqual(persisted.series.lessons[0].phases[0].blocks.map((x) => x.id), [a, b]); // ids stable
});
