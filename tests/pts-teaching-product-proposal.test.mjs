// Product Proposal domain tests (Spike Phase 3 §8–§15/§24). Pure domain: the
// synthesis, the proposal edits, the Accept into the existing Teaching Product
// domain, and the fail-closed boundaries. No IO except the sidecar store test.
//
// Run: node --test tests/pts-teaching-product-proposal.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildDemoSnapshot } from '../plugins/pts-teaching-product/lib/demo.mjs';
import {
	createProposalFromSnapshot,
	renameProposalLesson,
	setProposalLessonIntention,
	removeProposalLesson,
	addProposalLesson,
	reorderProposalLessons,
	acceptProposal,
	ProposalError,
	PRODUCT_PROPOSAL_SCHEMA,
} from '../plugins/pts-teaching-product/lib/proposal.mjs';
import {
	loadProposal, saveProposal, deleteProposal, loadSnapshot, saveSnapshot,
} from '../plugins/pts-teaching-product/lib/proposal-store.mjs';
import { TEACHING_PRODUCT_SCHEMA } from '../plugins/pts-teaching-product/lib/product.mjs';

// Deterministic id/now so assertions are stable.
function det() {
	let n = 0;
	return { id: (prefix) => `${prefix}-${(n += 1)}`, now: () => '2026-09-18T00:00:00.000Z' };
}

function allRefs(proposal) {
	const refs = new Set();
	for (const l of proposal.lessons) for (const r of l.sourceRefs) refs.add(r);
	return refs;
}

test('synthesis: a proposal is a dramaturgy, not one-lesson-per-moment', () => {
	const d = det();
	const snapshot = buildDemoSnapshot(d);
	const proposal = createProposalFromSnapshot(snapshot, { title: 'KI und Gottesbild' }, d);

	assert.equal(proposal.schema, PRODUCT_PROPOSAL_SCHEMA);
	assert.equal(proposal.status, 'draft');
	assert.equal(proposal.snapshotId, snapshot.snapshotId);
	assert.equal(proposal.snapshotRevision, snapshot.sourceRevision);
	assert.equal(proposal.series.title, 'KI und Gottesbild');

	// LearningMoment ≠ Lesson: the demo snapshot has 3 moments; the arc yields a
	// different number of lessons.
	assert.notEqual(proposal.lessons.length, snapshot.learningMoments.length);
	assert.ok(proposal.lessons.length >= 1);

	// At least one lesson references more than one source — a synthesis, not a 1:1 map.
	assert.ok(proposal.lessons.some((l) => l.sourceRefs.length >= 2));

	// Every phase carries a title, a purpose and (where grounded) source refs.
	for (const l of proposal.lessons) {
		assert.ok(l.phases.length >= 1);
		for (const ph of l.phases) { assert.ok(ph.title); assert.ok('purpose' in ph); assert.ok(Array.isArray(ph.sourceRefs)); }
	}
});

test('synthesis: provenance is complete — every moment/decision/question is referenced', () => {
	const d = det();
	const snapshot = buildDemoSnapshot(d);
	const proposal = createProposalFromSnapshot(snapshot, {}, d);
	const refs = allRefs(proposal);

	for (const m of snapshot.learningMoments) assert.ok(refs.has(`learning-moment:${m.domainId}`), `moment ${m.domainId} referenced`);
	for (const d of snapshot.decisions) assert.ok(refs.has(`decision:${d}`), `decision ${d} referenced`);
	for (const q of snapshot.openQuestions) assert.ok(refs.has(`open-question:${q.id}`), `question ${q.id} referenced`);

	// Open questions are also mirrored explicitly on the proposal.
	assert.deepEqual(proposal.openQuestions.map((q) => q.id).sort(), snapshot.openQuestions.map((q) => q.id).sort());
});

test('proposal edits: rename, intention, add, remove, reorder', () => {
	const d = det();
	const snapshot = buildDemoSnapshot(d);
	let proposal = createProposalFromSnapshot(snapshot, {}, d);
	const firstId = proposal.lessons[0].proposedLessonId;

	proposal = renameProposalLesson(proposal, { proposedLessonId: firstId, title: 'Was verbinden wir mit Gott und KI?' });
	assert.equal(proposal.lessons[0].title, 'Was verbinden wir mit Gott und KI?');

	proposal = setProposalLessonIntention(proposal, { proposedLessonId: firstId, intention: 'Erste Assoziationen einfangen.' });
	assert.equal(proposal.lessons[0].intention, 'Erste Assoziationen einfangen.');

	const before = proposal.lessons.length;
	proposal = addProposalLesson(proposal, { title: 'Zusatzstunde', intention: 'x' }, d);
	assert.equal(proposal.lessons.length, before + 1);
	const addedId = proposal.lessons.at(-1).proposedLessonId;

	proposal = removeProposalLesson(proposal, { proposedLessonId: addedId });
	assert.equal(proposal.lessons.length, before);

	const order = proposal.lessons.map((l) => l.proposedLessonId).reverse();
	proposal = reorderProposalLessons(proposal, { order });
	assert.deepEqual(proposal.lessons.map((l) => l.proposedLessonId), order);
});

test('proposal edits fail closed on unknown lesson and bad order', () => {
	const d = det();
	const snapshot = buildDemoSnapshot(d);
	const proposal = createProposalFromSnapshot(snapshot, {}, d);
	assert.throws(() => renameProposalLesson(proposal, { proposedLessonId: 'nope', title: 'x' }), ProposalError);
	assert.throws(() => removeProposalLesson(proposal, { proposedLessonId: 'nope' }), ProposalError);
	assert.throws(() => reorderProposalLessons(proposal, { order: ['nope'] }), ProposalError);
});

test('accept: builds a Teaching Product through the domain, preserving provenance', () => {
	const d = det();
	const snapshot = buildDemoSnapshot(d);
	const proposal = createProposalFromSnapshot(snapshot, { title: 'KI und Gottesbild' }, d);
	const product = acceptProposal(proposal, snapshot, d);

	assert.equal(product.schema, TEACHING_PRODUCT_SCHEMA);
	assert.equal(product.series.title, 'KI und Gottesbild');
	assert.equal(product.series.lessons.length, proposal.lessons.length);
	assert.equal(product.provenance.snapshotId, snapshot.snapshotId);
	assert.ok(product.revision >= 1, 'an initial revision was recorded');
	assert.equal(product.revisions.at(-1).actor, 'teacher');

	// Every proposal sourceRef survives onto the product lessons/phases; each phase
	// has one editable block so the Quill editor has content to open.
	proposal.lessons.forEach((pl, i) => {
		const lesson = product.series.lessons[i];
		assert.deepEqual(lesson.sourceRefs, pl.sourceRefs, 'lesson sourceRefs preserved');
		assert.equal(lesson.phases.length, pl.phases.length);
		lesson.phases.forEach((phase, j) => {
			assert.deepEqual(phase.sourceRefs, pl.phases[j].sourceRefs, 'phase sourceRefs preserved');
			assert.ok(phase.blocks.length >= 1, 'phase has an editable block');
		});
	});

	// Stable ids: every lesson/phase/block carries a unique id.
	const ids = new Set();
	for (const l of product.series.lessons) {
		assert.ok(l.id && !ids.has(l.id)); ids.add(l.id);
		for (const p of l.phases) { assert.ok(p.id && !ids.has(p.id)); ids.add(p.id); for (const b of p.blocks) { assert.ok(b.id && !ids.has(b.id)); ids.add(b.id); } }
	}
});

test('accept fails closed when the snapshot does not match the proposal', () => {
	const d = det();
	const snapshot = buildDemoSnapshot(d);
	const other = buildDemoSnapshot(); // default (random) ids → a different snapshotId
	const proposal = createProposalFromSnapshot(snapshot, {}, d);
	assert.throws(() => acceptProposal(proposal, other, d), /snapshot/i);
});

test('store: proposal + snapshot round-trip and delete', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-proposal-'));
	try {
		assert.equal(await loadProposal(root), null);
		assert.equal(await loadSnapshot(root), null);

		const d = det();
		const snapshot = buildDemoSnapshot(d);
		const proposal = createProposalFromSnapshot(snapshot, { title: 'KI und Gottesbild' }, d);
		await saveSnapshot(root, snapshot);
		await saveProposal(root, proposal);

		const loadedSnap = await loadSnapshot(root);
		const loadedProp = await loadProposal(root);
		assert.equal(loadedSnap.snapshotId, snapshot.snapshotId);
		assert.equal(loadedProp.proposalId, proposal.proposalId);
		assert.equal(loadedProp.schema, PRODUCT_PROPOSAL_SCHEMA);

		await deleteProposal(root);
		assert.equal(await loadProposal(root), null);
		// the snapshot survives a proposal delete (provenance stays available)
		assert.ok(await loadSnapshot(root));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
