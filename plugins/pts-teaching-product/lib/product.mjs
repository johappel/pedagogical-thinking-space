// Teaching Product — the product domain (Spike §6/§9). A series holds lessons,
// a lesson holds phases, a phase holds stable content blocks. The product is
// created FROM a Product Snapshot and keeps its provenance, but evolves
// independently afterwards (Spike §7/§16): editing a phase never touches a
// LearningMoment.
//
// Principles enforced here (Spike §21):
//   * stable domain identity — every lesson, phase and block has a stable id;
//   * no delete+recreate — a content edit mutates the block in place;
//   * no silent reinterpretation — a mutation changes exactly its target;
//   * revisions are explicit — collected changes become one revision on commit,
//     tagged with the acting party (teacher or companion).
//
// Pure functions over a plain product object. `now`/`id` are injectable so the
// tests are deterministic and there is no hidden IO.

import { semanticDelta } from './delta.mjs';

export const TEACHING_PRODUCT_SCHEMA = 'ptspace.teaching-product-spike/v1';
export const BLOCK_TYPES = Object.freeze(['heading', 'paragraph', 'task', 'list', 'note', 'link', 'image']);
// 'collaborative' is a Phase-2B commit whose text was merged by a CRDT from more
// than one contributor; the single-writer `actor` is then no longer meaningful,
// so such a revision additionally carries `contributors`.
export const ACTORS = Object.freeze(['teacher', 'companion', 'collaborative']);
export const CONTRIBUTORS = Object.freeze(['teacher', 'companion']);

export class ProductError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'ProductError';
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

/**
 * Create an empty Teaching Product from a Product Snapshot. It has NO lessons:
 * a LearningMoment is not automatically a lesson (Spike §7/§17). The teacher (or
 * the Companion) builds lessons explicitly, wiring their provenance by hand.
 */
export function createProductFromSnapshot(snapshot, input = {}, options = {}) {
	if (!snapshot || snapshot.schema !== 'ptspace.product-snapshot/v1') {
		throw new ProductError('invalid-snapshot', 'Ein gültiger Product Snapshot ist erforderlich');
	}
	const { id } = opts(options);
	return {
		schema: TEACHING_PRODUCT_SCHEMA,
		id: id('series'),
		revision: 0,
		series: { id: id('series-body'), title: text(input.title ?? '', 'title'), lessons: [] },
		provenance: {
			snapshotId: snapshot.snapshotId,
			sourceRevision: snapshot.sourceRevision ?? null,
			learningMoments: (snapshot.learningMoments ?? []).map((m) => ({ ...m })),
			decisions: [...(snapshot.decisions ?? [])],
		},
		revisions: [],
	};
}

// ── mutations: each returns { product, change } and does NOT bump the revision;
//    a revision is created only on commit (Spike §11: collect then save). ──────

export function addLesson(product, { title = '', sourceRefs = [] } = {}, options = {}) {
	const { id } = opts(options);
	const next = clone(product);
	const lessonId = id('lesson');
	next.series.lessons.push({ id: lessonId, title: text(title, 'title'), sourceRefs: refs(sourceRefs), phases: [] });
	return { product: next, change: { operation: 'lesson.add', lessonId, title } };
}

export function addPhase(product, { lessonId, title = '', durationMinutes = null, sourceRefs = [] } = {}, options = {}) {
	const { id } = opts(options);
	const next = clone(product);
	const lesson = findLesson(next, lessonId);
	const phaseId = id('phase');
	lesson.phases.push({ id: phaseId, title: text(title, 'title'), durationMinutes: duration(durationMinutes), sourceRefs: refs(sourceRefs), blocks: [] });
	return { product: next, change: { operation: 'phase.add', lessonId, phaseId, title } };
}

export function renamePhase(product, { lessonId, phaseId, title } = {}) {
	const next = clone(product);
	const phase = findPhase(next, lessonId, phaseId);
	const before = phase.title;
	phase.title = text(title, 'title');
	return { product: next, change: { operation: 'phase.rename', lessonId, phaseId, before, after: phase.title } };
}

export function reorderPhases(product, { lessonId, order } = {}) {
	const next = clone(product);
	const lesson = findLesson(next, lessonId);
	if (!Array.isArray(order) || order.length !== lesson.phases.length) {
		throw new ProductError('invalid-order', 'order muss alle Phasen-Ids genau einmal enthalten');
	}
	const before = lesson.phases.map((p) => p.id);
	const byId = new Map(lesson.phases.map((p) => [p.id, p]));
	const reordered = [];
	for (const phaseId of order) {
		const phase = byId.get(phaseId);
		if (!phase || reordered.includes(phase)) throw new ProductError('invalid-order', `order ist keine Permutation: ${phaseId}`);
		reordered.push(phase);
	}
	lesson.phases = reordered;
	return { product: next, change: { operation: 'phase.reorder', lessonId, before, after: order.slice() } };
}

export function setPhaseDuration(product, { lessonId, phaseId, durationMinutes } = {}) {
	const next = clone(product);
	const phase = findPhase(next, lessonId, phaseId);
	const before = phase.durationMinutes;
	phase.durationMinutes = duration(durationMinutes);
	return { product: next, change: { operation: 'phase.duration.change', lessonId, phaseId, before, after: phase.durationMinutes } };
}

export function addBlock(product, { lessonId, phaseId, type, content = '' } = {}, options = {}) {
	const { id } = opts(options);
	const next = clone(product);
	const phase = findPhase(next, lessonId, phaseId);
	if (!BLOCK_TYPES.includes(type)) throw new ProductError('invalid-block-type', `Unbekannter Blocktyp: ${type}`, { type });
	const blockId = id('block');
	phase.blocks.push({ id: blockId, type, content: text(content, 'content', 8000) });
	return { product: next, change: { operation: 'block.add', lessonId, phaseId, blockId, blockType: type, after: content } };
}

/** Targeted in-place content edit — no delete+recreate, id preserved. */
export function replaceBlock(product, { lessonId, phaseId, blockId, content } = {}) {
	const next = clone(product);
	const { block } = findBlock(next, lessonId, phaseId, blockId);
	const before = block.content;
	block.content = text(content, 'content', 8000);
	return { product: next, change: { operation: 'block.replace', lessonId, phaseId, blockId, blockType: block.type, before, after: block.content } };
}

export function removeBlock(product, { lessonId, phaseId, blockId } = {}) {
	const next = clone(product);
	const { phase, block } = findBlock(next, lessonId, phaseId, blockId);
	phase.blocks = phase.blocks.filter((b) => b.id !== blockId);
	return { product: next, change: { operation: 'block.remove', lessonId, phaseId, blockId, blockType: block.type, before: block.content } };
}

/**
 * Turn a list of collected changes into one revision (Spike §11). Bumps the
 * revision counter, stamps the actor and time, and attaches the semantic delta.
 * The product content is already mutated by the calls above; commit only
 * records the boundary.
 */
export function commit(product, changes, { actor, contributors, now = defaultNow } = {}) {
	if (!ACTORS.includes(actor)) throw new ProductError('invalid-actor', `Unbekannter Actor: ${actor}`, { actor });
	if (!Array.isArray(changes) || changes.length === 0) throw new ProductError('empty-revision', 'Eine Revision braucht mindestens eine Änderung');
	const contribs = normalizeContributors(contributors);
	const next = clone(product);
	next.revision = product.revision + 1;
	const record = { revision: next.revision, actor, at: now(), changes: clone(changes) };
	if (contribs) record.contributors = contribs;
	record.delta = semanticDelta(record);
	next.revisions = [...(product.revisions ?? []), record];
	return { product: next, revision: record, delta: record.delta };
}

function normalizeContributors(contributors) {
	if (contributors === undefined || contributors === null) return null;
	if (!Array.isArray(contributors)) throw new ProductError('invalid-contributors', 'contributors muss eine Liste sein');
	const set = new Set();
	for (const value of contributors) {
		if (!CONTRIBUTORS.includes(value)) throw new ProductError('invalid-contributors', `Unbekannter Contributor: ${value}`, { value });
		set.add(value);
	}
	if (set.size === 0) throw new ProductError('invalid-contributors', 'contributors darf nicht leer sein');
	return [...set].sort();
}

// ── finders (fail-closed) ─────────────────────────────────────────────────────

export function findLesson(product, lessonId) {
	const lesson = (product.series?.lessons ?? []).find((l) => l.id === lessonId);
	if (!lesson) throw new ProductError('unknown-lesson', `Stunde nicht gefunden: ${lessonId}`, { lessonId });
	return lesson;
}

export function findPhase(product, lessonId, phaseId) {
	const phase = findLesson(product, lessonId).phases.find((p) => p.id === phaseId);
	if (!phase) throw new ProductError('unknown-phase', `Phase nicht gefunden: ${phaseId}`, { lessonId, phaseId });
	return phase;
}

export function findBlock(product, lessonId, phaseId, blockId) {
	const phase = findPhase(product, lessonId, phaseId);
	const block = phase.blocks.find((b) => b.id === blockId);
	if (!block) throw new ProductError('unknown-block', `Block nicht gefunden: ${blockId}`, { lessonId, phaseId, blockId });
	return { phase, block };
}

// ── small validators ──────────────────────────────────────────────────────────

function text(value, label, max = 400) {
	if (typeof value !== 'string') throw new ProductError('invalid-text', `${label} muss Text sein`);
	if (value.length > max) throw new ProductError('invalid-text', `${label} ist zu lang`);
	return value;
}

function duration(value) {
	if (value === null || value === undefined) return null;
	if (!Number.isFinite(value) || value <= 0) throw new ProductError('invalid-duration', 'durationMinutes muss > 0 oder null sein');
	return value;
}

function refs(list) {
	if (!Array.isArray(list)) throw new ProductError('invalid-source-refs', 'sourceRefs muss eine Liste sein');
	return list.map((value) => {
		if (typeof value !== 'string' || !/^(learning-moment|decision|anchor|open-question):.+/.test(value)) {
			throw new ProductError('invalid-source-refs', `Ungültige Herkunftsreferenz: ${value}`, { value });
		}
		return value;
	});
}
