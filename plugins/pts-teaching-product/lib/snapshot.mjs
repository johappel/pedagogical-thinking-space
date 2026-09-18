// Product Snapshot — the deliberate, documented boundary between Denkraum and
// product (Spike §4/§5). It is NOT the chat log, NOT the whiteboard and NOT the
// activity stream: it carries only the confirmed pedagogical ground the teacher
// selected to cross into product building.
//
// Fail-closed contract (Spike §21, §23):
//   * a selected decision MUST be teacher_confirmed — an assistant hypothesis or
//     a rejected framing selected by mistake THROWS, it is never silently taken;
//   * a selected open question MUST be teacher_open;
//   * a selected learning moment MUST exist in the domain ledger and is pinned
//     to its current version, so provenance survives later moment edits;
//   * nothing crosses the boundary that was not explicitly named.
//
// Pure: no IO, no clock beyond the injectable `now`. The snapshot is the input
// to `createProductFromSnapshot` and stays referenceable as provenance.

export const PRODUCT_SNAPSHOT_SCHEMA = 'ptspace.product-snapshot/v1';

// Reuse of the Denkstand contract without importing it: these are the epistemic
// statuses the snapshot is allowed to reason about.
const STATUS_CONFIRMED = 'teacher_confirmed';
const STATUS_OPEN = 'teacher_open';
const SIGNIFICANCE_ANCHOR = 'anchor';

export class SnapshotError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'SnapshotError';
		this.code = code;
		this.detail = detail;
	}
}

const defaultNow = () => new Date().toISOString();
let seq = 0;
const defaultId = (prefix) => `${prefix}-${(seq += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function indexDenkstand(entries) {
	const map = new Map();
	for (const entry of entries ?? []) {
		if (entry && typeof entry.id === 'string') map.set(entry.id, entry);
	}
	return map;
}

function indexMoments(ledgerOrList) {
	const list = Array.isArray(ledgerOrList) ? ledgerOrList : (ledgerOrList?.moments ?? []);
	const map = new Map();
	for (const moment of list) {
		if (moment && typeof moment.domainId === 'string') map.set(moment.domainId, moment);
	}
	return map;
}

/**
 * Build a Product Snapshot from the current Denkstand and the LearningMoment
 * ledger, driven by an explicit teacher selection. Every id in the selection is
 * validated against its source; unknown or non-eligible ids fail closed.
 *
 * @param {object} input
 * @param {Array}  input.denkstandEntries current Denkstand entries
 * @param {object|Array} input.momentLedger LearningMoment ledger (or moment list)
 * @param {object} input.selection { learningMomentIds, decisionIds, openQuestionIds }
 * @param {number|string} input.sourceRevision Denkstand revision at snapshot time
 * @param {object} [options] { now, id }
 */
export function createProductSnapshot(input = {}, options = {}) {
	const now = options.now ?? defaultNow;
	const id = options.id ?? defaultId;
	const selection = input.selection ?? {};
	const denkstand = indexDenkstand(input.denkstandEntries);
	const moments = indexMoments(input.momentLedger);

	const learningMomentIds = unique(selection.learningMomentIds, 'learningMomentIds');
	const decisionIds = unique(selection.decisionIds, 'decisionIds');
	const openQuestionIds = unique(selection.openQuestionIds, 'openQuestionIds');

	const learningMoments = learningMomentIds.map((domainId) => {
		const moment = moments.get(domainId);
		if (!moment) throw new SnapshotError('unknown-moment', `LearningMoment nicht im Ledger: ${domainId}`, { domainId });
		return { domainId, version: Number.isInteger(moment.version) && moment.version >= 1 ? moment.version : 1 };
	});

	const decisions = [];
	const anchors = [];
	for (const entryId of decisionIds) {
		const entry = denkstand.get(entryId);
		if (!entry) throw new SnapshotError('unknown-decision', `Denkstand-Eintrag nicht gefunden: ${entryId}`, { entryId });
		if (entry.status !== STATUS_CONFIRMED) {
			// This is the fail-closed core: hypotheses and rejected framings never
			// cross the boundary, not even when explicitly selected by mistake.
			throw new SnapshotError('decision-not-confirmed', `Nur bestätigte Entscheidungen dürfen in den Snapshot: ${entryId} ist „${entry.status}"`, { entryId, status: entry.status });
		}
		decisions.push(entryId);
		if (entry.significance === SIGNIFICANCE_ANCHOR) anchors.push(entryId);
	}

	const openQuestions = openQuestionIds.map((entryId) => {
		const entry = denkstand.get(entryId);
		if (!entry) throw new SnapshotError('unknown-question', `Denkstand-Eintrag nicht gefunden: ${entryId}`, { entryId });
		if (entry.status !== STATUS_OPEN) {
			throw new SnapshotError('question-not-open', `Nur offene Fragen dürfen als openQuestion in den Snapshot: ${entryId} ist „${entry.status}"`, { entryId, status: entry.status });
		}
		return { id: entryId, statement: String(entry.statement ?? '').trim() };
	});

	return {
		schema: PRODUCT_SNAPSHOT_SCHEMA,
		snapshotId: id('snapshot'),
		createdAt: now(),
		sourceRevision: input.sourceRevision ?? null,
		learningMoments,
		decisions,
		anchors,
		openQuestions,
	};
}

function unique(list, label) {
	if (list === undefined || list === null) return [];
	if (!Array.isArray(list)) throw new SnapshotError('invalid-selection', `${label} muss eine Liste sein`);
	const seen = new Set();
	for (const value of list) {
		if (typeof value !== 'string' || value.trim() === '') throw new SnapshotError('invalid-selection', `${label} enthält eine ungültige id`);
		if (seen.has(value)) throw new SnapshotError('duplicate-selection', `${label} enthält ein Duplikat: ${value}`, { value });
		seen.add(value);
	}
	return [...seen];
}

/** A source reference string as used on lessons/phases, e.g. `learning-moment:lm-03`. */
export function sourceRef(kind, id) {
	if (!['learning-moment', 'decision', 'anchor', 'open-question'].includes(kind)) {
		throw new SnapshotError('invalid-source-ref', `Unbekannte Herkunftsart: ${kind}`, { kind });
	}
	if (typeof id !== 'string' || id.trim() === '') throw new SnapshotError('invalid-source-ref', 'sourceRef braucht eine id');
	return `${kind}:${id}`;
}
