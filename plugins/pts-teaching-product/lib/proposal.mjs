// Product Proposal — the deliberate intermediate step between the Product
// Snapshot and the Teaching Product (Spike Phase 3 §8–§15). The snapshot is the
// confirmed pedagogical ground; the proposal is a *suggested* didactic
// dramaturgy over that ground. It is NOT the product: the Companion may create
// it, but only the teacher's Accept turns it into a Teaching Product.
//
// Hard invariants:
//   * a LearningMoment is NOT a lesson (Spike §9/§17): the synthesis lays the
//     moments across a dramaturgical arc, so lesson count is driven by the arc,
//     never by the moment count;
//   * provenance survives: every moment/decision/open-question the snapshot
//     carried is referenced on some lesson/phase as a `sourceRef`;
//   * the proposal is a draft — `status` stays 'draft' until Accept builds the
//     product through the existing domain.
//
// Pure functions over plain objects; `now`/`id` are injectable for tests. No IO.

import {
	createProductFromSnapshot,
	addLesson,
	addPhase,
	addBlock,
	commit,
} from './product.mjs';

export const PRODUCT_PROPOSAL_SCHEMA = 'ptspace.product-proposal/v1';
const PRODUCT_SNAPSHOT_SCHEMA = 'ptspace.product-snapshot/v1';

export class ProposalError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'ProposalError';
		this.code = code;
		this.detail = detail;
	}
}

const defaultNow = () => new Date().toISOString();
let seq = 0;
const defaultId = (prefix) => `${prefix}-${(seq += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => structuredClone(value);

function opts(options) {
	return { now: options.now ?? defaultNow, id: options.id ?? defaultId };
}

// The dramaturgical arc. A fixed didactic backbone the synthesis fills with the
// snapshot's grounding. Deliberately NOT one-lesson-per-moment: this is where
// "LearningMoment ≠ Lesson" is realised as a template.
const ARC = Object.freeze([
	{
		title: 'Zugang',
		intention: 'Vorwissen und erste Assoziationen sichtbar machen.',
		phases: [
			{ title: 'Einstieg', purpose: 'Erste Assoziationen sammeln.' },
			{ title: 'Sammlung', purpose: 'Beiträge sichten und grob ordnen.' },
		],
	},
	{
		title: 'Vergleich',
		intention: 'Zuschreibungen gegenüberstellen und Unterschiede herausarbeiten.',
		phases: [
			{ title: 'Gegenüberstellung', purpose: 'Perspektiven nebeneinanderlegen.' },
			{ title: 'Sicherung', purpose: 'Unterschiede festhalten.' },
		],
	},
	{
		title: 'Vertiefung',
		intention: 'Die zentrale Denkbewegung vertiefen.',
		phases: [
			{ title: 'Erarbeitung', purpose: 'Die Kernidee genauer untersuchen.' },
			{ title: 'Diskussion', purpose: 'Deutungen abwägen.' },
		],
	},
	{
		title: 'Weiterdenken',
		intention: 'Offene Fragen aufgreifen und übertragen.',
		phases: [
			{ title: 'Transfer', purpose: 'Den Gedanken auf Neues übertragen.' },
			{ title: 'Reflexion', purpose: 'Offene Fragen benennen.' },
		],
	},
]);

/**
 * Synthesise a Product Proposal from a Product Snapshot. The snapshot's moments,
 * decisions and open questions are laid across the dramaturgical arc; the result
 * is a draft the teacher can accept, reshape or reject.
 */
export function createProposalFromSnapshot(snapshot, input = {}, options = {}) {
	if (!snapshot || snapshot.schema !== PRODUCT_SNAPSHOT_SCHEMA) {
		throw new ProposalError('invalid-snapshot', 'Ein gültiger Product Snapshot ist erforderlich');
	}
	const { id, now } = opts(options);

	const momentRefs = (snapshot.learningMoments ?? []).map((m) => `learning-moment:${m.domainId}`);
	const anchorSet = new Set(snapshot.anchors ?? []);
	// Anchors carry the highest didactic weight, so they seed the first stage.
	const sortedDecisions = [...(snapshot.decisions ?? [])].sort((a, b) => (anchorSet.has(b) ? 1 : 0) - (anchorSet.has(a) ? 1 : 0));
	const decisionRefs = sortedDecisions.map((d) => `decision:${d}`);
	const questionRefs = (snapshot.openQuestions ?? []).map((q) => `open-question:${q.id}`);

	const stages = ARC.map((s) => ({ ...s, moments: [], decisions: [], questions: [] }));
	momentRefs.forEach((ref, i) => stages[i % stages.length].moments.push(ref));
	decisionRefs.forEach((ref, i) => stages[i % stages.length].decisions.push(ref));
	// Open questions belong to the closing stage of the arc (transfer/reflection).
	stages[stages.length - 1].questions.push(...questionRefs);

	const grounded = stages.filter((s) => s.moments.length || s.decisions.length || s.questions.length);
	const active = grounded.length ? grounded : [stages[0]];

	const lessons = active.map((s) => ({
		proposedLessonId: id('plesson'),
		title: s.title,
		intention: s.intention,
		sourceRefs: [...s.moments, ...s.decisions, ...s.questions],
		phases: s.phases.map((p) => ({ title: p.title, purpose: p.purpose, sourceRefs: [...s.moments] })),
	}));

	const rationale = `Aus ${momentRefs.length} Lernmoment(en), ${decisionRefs.length} bestätigten Entscheidung(en)`
		+ ` und ${questionRefs.length} offenen Frage(n) entsteht eine Dramaturgie in ${lessons.length} Stunde(n).`;

	return {
		schema: PRODUCT_PROPOSAL_SCHEMA,
		proposalId: id('proposal'),
		snapshotId: snapshot.snapshotId,
		snapshotRevision: snapshot.sourceRevision ?? null,
		createdAt: now(),
		series: { title: title(input.title ?? '', 'title'), rationale },
		lessons,
		openQuestions: (snapshot.openQuestions ?? []).map((q) => ({ id: q.id, statement: String(q.statement ?? '') })),
		status: 'draft',
	};
}

// ── proposal edits (Spike §14) — pure, fail-closed on unknown lesson ──────────

export function renameProposalLesson(proposal, { proposedLessonId, title: value } = {}) {
	const next = clone(proposal);
	findProposalLesson(next, proposedLessonId).title = title(value, 'title');
	return next;
}

export function setProposalLessonIntention(proposal, { proposedLessonId, intention } = {}) {
	const next = clone(proposal);
	findProposalLesson(next, proposedLessonId).intention = title(intention, 'intention', 600);
	return next;
}

export function removeProposalLesson(proposal, { proposedLessonId } = {}) {
	const next = clone(proposal);
	findProposalLesson(next, proposedLessonId); // fail closed if unknown
	next.lessons = next.lessons.filter((l) => l.proposedLessonId !== proposedLessonId);
	return next;
}

export function addProposalLesson(proposal, { title: value = '', intention = '' } = {}, options = {}) {
	const { id } = opts(options);
	const next = clone(proposal);
	next.lessons.push({
		proposedLessonId: id('plesson'),
		title: title(value, 'title'),
		intention: title(intention, 'intention', 600),
		sourceRefs: [],
		phases: [{ title: 'Einstieg', purpose: '', sourceRefs: [] }],
	});
	return next;
}

export function reorderProposalLessons(proposal, { order } = {}) {
	const next = clone(proposal);
	if (!Array.isArray(order) || order.length !== next.lessons.length) {
		throw new ProposalError('invalid-order', 'order muss alle Stunden-Ids genau einmal enthalten');
	}
	const byId = new Map(next.lessons.map((l) => [l.proposedLessonId, l]));
	const reordered = [];
	for (const lessonId of order) {
		const lesson = byId.get(lessonId);
		if (!lesson || reordered.includes(lesson)) throw new ProposalError('invalid-order', `order ist keine Permutation: ${lessonId}`);
		reordered.push(lesson);
	}
	next.lessons = reordered;
	return next;
}

/**
 * Accept the proposal into a Teaching Product through the EXISTING product
 * domain (Spike §15). Stable domain ids are minted by the domain; every
 * proposal `sourceRef` is carried onto the lesson/phase; each phase is seeded
 * with one editable paragraph block from its purpose so the Quill editor has
 * something to open. One initial revision records the creation.
 */
export function acceptProposal(proposal, snapshot, options = {}) {
	if (!proposal || proposal.schema !== PRODUCT_PROPOSAL_SCHEMA) {
		throw new ProposalError('invalid-proposal', 'Ein gültiger Product Proposal ist erforderlich');
	}
	if (!snapshot || snapshot.schema !== PRODUCT_SNAPSHOT_SCHEMA) {
		throw new ProposalError('invalid-snapshot', 'Ein gültiger Product Snapshot ist erforderlich');
	}
	if (proposal.snapshotId !== snapshot.snapshotId) {
		throw new ProposalError('snapshot-mismatch', 'Proposal und Snapshot gehören nicht zusammen', {
			proposalSnapshot: proposal.snapshotId, snapshot: snapshot.snapshotId,
		});
	}
	const { id, now } = opts(options);

	let product = createProductFromSnapshot(snapshot, { title: proposal.series?.title ?? '' }, { id, now });
	const changes = [];
	for (const pl of proposal.lessons) {
		const addedLesson = addLesson(product, { title: pl.title, sourceRefs: pl.sourceRefs }, { id });
		product = addedLesson.product;
		changes.push(addedLesson.change);
		const lessonId = product.series.lessons.at(-1).id;
		for (const ph of pl.phases ?? []) {
			const addedPhase = addPhase(product, { lessonId, title: ph.title, sourceRefs: ph.sourceRefs }, { id });
			product = addedPhase.product;
			changes.push(addedPhase.change);
			const phaseId = product.series.lessons.at(-1).phases.at(-1).id;
			const addedBlock = addBlock(product, { lessonId, phaseId, type: 'paragraph', content: String(ph.purpose ?? '') }, { id });
			product = addedBlock.product;
			changes.push(addedBlock.change);
		}
	}
	if (changes.length === 0) return product; // an empty proposal yields an empty product
	// The teacher's Accept is the acting party for the initial revision.
	return commit(product, changes, { actor: 'teacher', now }).product;
}

// ── finders / validators ──────────────────────────────────────────────────────

export function findProposalLesson(proposal, proposedLessonId) {
	const lesson = (proposal.lessons ?? []).find((l) => l.proposedLessonId === proposedLessonId);
	if (!lesson) throw new ProposalError('unknown-lesson', `Stunde nicht gefunden: ${proposedLessonId}`, { proposedLessonId });
	return lesson;
}

function title(value, label, max = 400) {
	if (typeof value !== 'string') throw new ProposalError('invalid-text', `${label} muss Text sein`);
	if (value.length > max) throw new ProposalError('invalid-text', `${label} ist zu lang`);
	return value;
}
