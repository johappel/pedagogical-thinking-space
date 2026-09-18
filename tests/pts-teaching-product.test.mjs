// Spike test matrix — Werkstatt-Board → Teaching Product (§23).
// Deterministic ids/clock are injected so every assertion is reproducible.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
	createProductSnapshot, sourceRef, SnapshotError,
} from '../plugins/pts-teaching-product/lib/snapshot.mjs';
import {
	createProductFromSnapshot, addLesson, addPhase, renamePhase, reorderPhases,
	setPhaseDuration, addBlock, replaceBlock, commit, ProductError,
} from '../plugins/pts-teaching-product/lib/product.mjs';
import {
	classifyChange, semanticDelta, deltaSince, FORMATTING,
} from '../plugins/pts-teaching-product/lib/delta.mjs';
import {
	companionReplaceBlock, companionUpdatePhaseDuration,
} from '../plugins/pts-teaching-product/lib/companion-edit.mjs';

const NOW = '2026-09-18T10:00:00.000Z';

// A deterministic id factory: prefix-N so assertions can name ids up front.
function idGen() {
	const counters = new Map();
	return (prefix) => {
		const n = (counters.get(prefix) ?? 0) + 1;
		counters.set(prefix, n);
		return `${prefix}-${n}`;
	};
}
const det = () => ({ now: () => NOW, id: idGen() });

// A small realistic Denkstand + moment ledger from the spec's KI-und-Gottesbild
// example: three confirmed learning moments, one confirmed anchor decision, one
// open question, plus an assistant hypothesis and a rejected framing that MUST
// never cross the boundary.
function fixtures() {
	const denkstandEntries = [
		{ id: 'decision-17', status: 'teacher_confirmed', significance: 'anchor', statement: 'Gottesbild als Denkhebel' },
		{ id: 'decision-22', status: 'teacher_confirmed', significance: 'supporting', statement: 'Vergleich zweier Darstellungen' },
		{ id: 'q-01', status: 'teacher_open', statement: 'Wie stark soll die Schlussphase persönlich werden?' },
		{ id: 'hyp-09', status: 'assistant_hypotheses', significance: 'supporting', statement: 'Vielleicht mit einem Bild starten' },
		{ id: 'old-03', status: 'rejected', statement: 'Frontaler Lehrervortrag' },
	];
	const momentLedger = {
		schema: 'ptspace.learning-moment-bindings/v1',
		moments: [
			{ domainId: 'lm-01', version: 1 },
			{ domainId: 'lm-02', version: 2 },
			{ domainId: 'lm-03', version: 3 },
		],
	};
	return { denkstandEntries, momentLedger };
}

function snapshot(selectionOverride = {}) {
	const { denkstandEntries, momentLedger } = fixtures();
	return createProductSnapshot({
		denkstandEntries,
		momentLedger,
		sourceRevision: 42,
		selection: {
			learningMomentIds: ['lm-01', 'lm-02', 'lm-03'],
			decisionIds: ['decision-17', 'decision-22'],
			openQuestionIds: ['q-01'],
			...selectionOverride,
		},
	}, det());
}

// ─────────────────────────────────────────────────── Snapshot (§4/§23)

test('snapshot contains only confirmed, explicitly selected content', () => {
	const snap = snapshot();
	assert.equal(snap.schema, 'ptspace.product-snapshot/v1');
	assert.equal(snap.sourceRevision, 42);
	assert.deepEqual(snap.decisions, ['decision-17', 'decision-22']);
	assert.deepEqual(snap.anchors, ['decision-17']); // only the anchor-significant one
	assert.deepEqual(snap.openQuestions.map((q) => q.id), ['q-01']);
});

test('snapshot pins each learning moment to its current version (stable source refs)', () => {
	const snap = snapshot();
	assert.deepEqual(snap.learningMoments, [
		{ domainId: 'lm-01', version: 1 },
		{ domainId: 'lm-02', version: 2 },
		{ domainId: 'lm-03', version: 3 },
	]);
});

test('an assistant hypothesis is never taken into the snapshot, even if selected', () => {
	assert.throws(() => snapshot({ decisionIds: ['decision-17', 'hyp-09'] }), (err) => err instanceof SnapshotError && err.code === 'decision-not-confirmed');
});

test('a rejected framing is never taken into the snapshot, even if selected', () => {
	assert.throws(() => snapshot({ decisionIds: ['old-03'] }), (err) => err instanceof SnapshotError && err.code === 'decision-not-confirmed');
});

test('an unknown learning moment fails closed', () => {
	assert.throws(() => snapshot({ learningMomentIds: ['lm-99'] }), (err) => err instanceof SnapshotError && err.code === 'unknown-moment');
});

test('an open question selected as a decision is rejected', () => {
	assert.throws(() => snapshot({ decisionIds: ['q-01'] }), (err) => err instanceof SnapshotError && err.code === 'decision-not-confirmed');
});

// ─────────────────────────────────────────────────── Teaching Product (§6/§7/§23)

test('a learning moment is NOT automatically a lesson', () => {
	const product = createProductFromSnapshot(snapshot(), { title: 'KI und Gottesbild' }, det());
	assert.equal(product.series.lessons.length, 0);
	assert.equal(product.provenance.snapshotId, 'snapshot-1');
	assert.deepEqual(product.provenance.learningMoments, [
		{ domainId: 'lm-01', version: 1 }, { domainId: 'lm-02', version: 2 }, { domainId: 'lm-03', version: 3 },
	]);
});

test('lessons, phases and blocks get stable ids; a content edit keeps the block id', () => {
	const o = det();
	let p = createProductFromSnapshot(snapshot(), { title: 'KI und Gottesbild' }, o);
	p = addLesson(p, { title: 'Stunde 1', sourceRefs: [sourceRef('learning-moment', 'lm-03'), sourceRef('decision', 'decision-17')] }, o).product;
	const lessonId = p.series.lessons[0].id;
	p = addPhase(p, { lessonId, title: 'Erarbeitung', durationMinutes: 15 }, o).product;
	const phaseId = p.series.lessons[0].phases[0].id;
	p = addBlock(p, { lessonId, phaseId, type: 'task', content: 'Vergleicht die Bilder.' }, o).product;
	const blockId = p.series.lessons[0].phases[0].blocks[0].id;

	const edited = replaceBlock(p, { lessonId, phaseId, blockId, content: 'Vergleicht die Bilder und notiert drei Unterschiede.' });
	assert.equal(edited.change.blockId, blockId); // id preserved, no delete+recreate
	assert.equal(edited.product.series.lessons[0].phases[0].blocks[0].content, 'Vergleicht die Bilder und notiert drei Unterschiede.');
	assert.deepEqual(p.series.lessons[0].phases[0].blocks[0].id, blockId); // original unchanged (pure)
});

test('phase rename, reorder and duration change are structural/pedagogical operations', () => {
	const o = det();
	let p = createProductFromSnapshot(snapshot(), { title: 'S' }, o);
	p = addLesson(p, { title: 'Stunde 1' }, o).product;
	const lessonId = p.series.lessons[0].id;
	p = addPhase(p, { lessonId, title: 'Einstieg', durationMinutes: 10 }, o).product;
	p = addPhase(p, { lessonId, title: 'Erarbeitung', durationMinutes: 20 }, o).product;
	const [ph1, ph2] = p.series.lessons[0].phases.map((ph) => ph.id);

	const renamed = renamePhase(p, { lessonId, phaseId: ph1, title: 'Irritation' });
	assert.equal(renamed.change.operation, 'phase.rename');
	assert.equal(classifyChange(renamed.change), 'structural');

	const reordered = reorderPhases(p, { lessonId, order: [ph2, ph1] });
	assert.deepEqual(reordered.product.series.lessons[0].phases.map((ph) => ph.id), [ph2, ph1]);
	assert.equal(classifyChange(reordered.change), 'structural');

	const retimed = setPhaseDuration(p, { lessonId, phaseId: ph2, durationMinutes: 25 });
	assert.equal(retimed.change.before, 20);
	assert.equal(retimed.change.after, 25);
	assert.equal(classifyChange(retimed.change), 'pedagogical');
});

test('reorder rejects a non-permutation', () => {
	const o = det();
	let p = createProductFromSnapshot(snapshot(), { title: 'S' }, o);
	p = addLesson(p, { title: 'Stunde 1' }, o).product;
	const lessonId = p.series.lessons[0].id;
	p = addPhase(p, { lessonId, title: 'A' }, o).product;
	p = addPhase(p, { lessonId, title: 'B' }, o).product;
	assert.throws(() => reorderPhases(p, { lessonId, order: ['nope', 'nope'] }), (err) => err instanceof ProductError && err.code === 'invalid-order');
});

// ─────────────────────────────────────────────────── Revision + semantic delta (§11–§13/§23)

// Helper: a product with one lesson, one phase, one task block.
function seeded() {
	const o = det();
	let p = createProductFromSnapshot(snapshot(), { title: 'KI und Gottesbild' }, o);
	p = addLesson(p, { title: 'Stunde 2', sourceRefs: [sourceRef('learning-moment', 'lm-03'), sourceRef('decision', 'decision-17')] }, o).product;
	const lessonId = p.series.lessons[0].id;
	p = addPhase(p, { lessonId, title: 'Erarbeitung', durationMinutes: 15 }, o).product;
	const phaseId = p.series.lessons[0].phases[0].id;
	p = addBlock(p, { lessonId, phaseId, type: 'task', content: 'Vergleicht die Bilder.' }, o).product;
	const blockId = p.series.lessons[0].phases[0].blocks[0].id;
	return { product: p, lessonId, phaseId, blockId, o };
}

test('a teacher edit creates a revision with the teacher as actor and a correct semantic delta', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const e1 = replaceBlock(product, { lessonId, phaseId, blockId, content: 'Vergleicht die Bilder und notiert drei Unterschiede.' });
	const e2 = setPhaseDuration(e1.product, { lessonId, phaseId, durationMinutes: 20 });
	const committed = commit(e2.product, [e1.change, e2.change], { actor: 'teacher', now: () => NOW });

	assert.equal(committed.revision.revision, 1);
	assert.equal(committed.revision.actor, 'teacher');
	const classes = committed.delta.entries.map((e) => e.classification).sort();
	assert.deepEqual(classes, ['content', 'pedagogical']);
	assert.ok(committed.delta.entries.some((e) => e.summary.includes('15 → 20')));
});

test('a pure formatting change is not reported as a pedagogical change', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const formatted = replaceBlock(product, { lessonId, phaseId, blockId, content: '**Vergleicht die Bilder.**' });
	assert.equal(classifyChange(formatted.change), FORMATTING);
	const committed = commit(formatted.product, [formatted.change], { actor: 'teacher', now: () => NOW });
	assert.equal(committed.delta.pedagogicallyRelevant, false);
	const context = deltaSince(committed.product, 0);
	assert.equal(context.text, ''); // formatting-only never reaches the companion
});

test('the companion receives only the changes since the revision it last saw', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	// revision 1 (teacher, already seen)
	const r1 = commit(replaceBlock(product, { lessonId, phaseId, blockId, content: 'Erste Fassung.' }).product,
		[replaceBlock(product, { lessonId, phaseId, blockId, content: 'Erste Fassung.' }).change], { actor: 'teacher', now: () => NOW });
	// revision 2 (teacher, new)
	const r2 = commit(setPhaseDuration(r1.product, { lessonId, phaseId, durationMinutes: 20 }).product,
		[setPhaseDuration(r1.product, { lessonId, phaseId, durationMinutes: 20 }).change], { actor: 'teacher', now: () => NOW });

	const since = deltaSince(r2.product, 1); // companion last saw revision 1
	assert.equal(since.fromRevision, 1);
	assert.equal(since.toRevision, 2);
	assert.ok(since.text.includes('15 → 20'));
	assert.ok(!since.text.includes('Erste Fassung'));
});

// ─────────────────────────────────────────────────── Companion edit (§14/§15/§23)

test('the companion can change exactly one block without regenerating the document', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const result = companionReplaceBlock(product, { lessonId, phaseId, blockId, content: 'Beschreibt, was euch an den Bildern auffällt.' }, { now: () => NOW });
	assert.equal(result.revision.actor, 'companion');
	assert.equal(result.revision.changes.length, 1);
	assert.equal(result.revision.changes[0].operation, 'block.replace');
	assert.equal(result.revision.changes[0].blockId, blockId);
	assert.equal(result.product.series.lessons[0].phases[0].blocks[0].content, 'Beschreibt, was euch an den Bildern auffällt.');
	// nothing else moved: still one lesson, one phase, one block
	assert.equal(result.product.series.lessons.length, 1);
	assert.equal(result.product.series.lessons[0].phases[0].blocks.length, 1);
});

test('teacher and companion changes stay distinguishable in the history', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const teacherEdit = replaceBlock(product, { lessonId, phaseId, blockId, content: 'Lehrkraft-Fassung.' });
	const afterTeacher = commit(teacherEdit.product, [teacherEdit.change], { actor: 'teacher', now: () => NOW });
	const afterCompanion = companionUpdatePhaseDuration(afterTeacher.product, { lessonId, phaseId, durationMinutes: 25 }, { now: () => NOW });
	assert.deepEqual(afterCompanion.product.revisions.map((r) => r.actor), ['teacher', 'companion']);
});

// ─────────────────────────────────────────────────── Provenance (§16/§23)

test('a lesson keeps its link to the snapshot and learning moments while staying independently editable', () => {
	const { product, lessonId, phaseId, blockId } = seeded();
	const before = product.series.lessons[0].sourceRefs.slice();
	const edited = companionReplaceBlock(product, { lessonId, phaseId, blockId, content: 'Neu.' }, { now: () => NOW });
	// provenance untouched by the content edit
	assert.deepEqual(edited.product.series.lessons[0].sourceRefs, before);
	assert.ok(before.includes('learning-moment:lm-03'));
	assert.ok(before.includes('decision:decision-17'));
	assert.equal(edited.product.provenance.snapshotId, product.provenance.snapshotId);
});
