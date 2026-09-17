// Current Denkstand — the canonical "what holds right now" model.
//
// The Denkstand files (learning-design.md, decisions.yml, …) are written
// additively, so a discarded framing, a corrected reading and the current one
// keep standing next to each other. This module adds the missing distinction
// the companion actually needs before a turn: a small CURRENT state that can be
// updated and pruned, backed by an APPEND-ONLY history that keeps every earlier
// version traceable.
//
//     Current Denkstand   (mutable)   → what holds now, grouped by epistemic status
//     History / Provenance (append-only) → how it got there, never rewritten
//
// The five epistemic categories are the load-bearing contract. They MUST
// survive compaction and model switches unchanged (see projectCurrentState):
//
//     teacher_confirmed    the teacher confirmed it — the only decided ground
//     teacher_open         the teacher left it open — a live question
//     assistant_hypotheses the companion offered it — NOT decided, ever
//     rejected             a framing that was dropped — off the active state
//     facts                a sourced fact — true regardless of stance
//
// Invariants this module guarantees:
//   * an assistant hypothesis never becomes teacher_confirmed by itself —
//     confirming is a distinct act that records `confirmedBy: teacher`;
//   * a teacher edit supersedes an older assistant reading, not the reverse;
//   * a rejected framing leaves the active state but stays in history;
//   * every status change appends one immutable history entry.
//
// Storage: JSON sidecar `.pts/denkstand-state.json` in the Denkraum, matching
// the learning-moment-bindings and conversation-bindings ledgers. No YAML
// dependency, no schema service, no write path beyond these pure functions.

export const DENKSTAND_STATE_SCHEMA = 'ptspace.denkstand-state/v1';
export const DENKSTAND_STATE_DIR = '.pts';
export const DENKSTAND_STATE_FILE = 'denkstand-state.json';

/** The five epistemic categories of the current Denkstand. */
export const STATUS = Object.freeze({
	CONFIRMED: 'teacher_confirmed',
	OPEN: 'teacher_open',
	HYPOTHESIS: 'assistant_hypotheses',
	REJECTED: 'rejected',
	FACT: 'facts',
});
const STATUS_VALUES = Object.freeze(new Set(Object.values(STATUS)));

/** The active current-state categories (rejected is history-only, not active). */
export const ACTIVE_STATUS = Object.freeze([
	STATUS.CONFIRMED,
	STATUS.OPEN,
	STATUS.HYPOTHESIS,
	STATUS.FACT,
]);

/** Significance drives the board projection policy; it is not epistemic. */
export const SIGNIFICANCE = Object.freeze({
	ANCHOR: 'anchor',
	SUPPORTING: 'supporting',
	DETAIL: 'detail',
});
const SIGNIFICANCE_VALUES = Object.freeze(new Set(Object.values(SIGNIFICANCE)));

/** Actors allowed to author a change. Only `teacher` can confirm. */
export const ACTOR = Object.freeze({ TEACHER: 'teacher', ASSISTANT: 'assistant', SYSTEM: 'system' });

const MAX_STATEMENT = 600;
const MAX_HISTORY = 500;

export class DenkstandError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'DenkstandError';
		this.code = code;
		this.detail = detail;
	}
}

let idCounter = 0;
function generateId(prefix = 'ds') {
	idCounter += 1;
	return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function clampStatement(value) {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	if (text === '') throw new DenkstandError('empty-statement', 'statement fehlt oder ist leer');
	return text.length <= MAX_STATEMENT ? text : text.slice(0, MAX_STATEMENT);
}

function requireStatus(status) {
	if (!STATUS_VALUES.has(status)) {
		throw new DenkstandError('invalid-status', 'Unbekannter epistemischer Status', { status });
	}
	return status;
}

function normalizeEntry(raw) {
	if (raw === null || typeof raw !== 'object') return null;
	if (typeof raw.id !== 'string' || raw.id.trim() === '') return null;
	if (!STATUS_VALUES.has(raw.status)) return null;
	const entry = {
		id: raw.id,
		status: raw.status,
		statement: String(raw.statement ?? '').slice(0, MAX_STATEMENT),
		kind: typeof raw.kind === 'string' ? raw.kind : null,
		significance: SIGNIFICANCE_VALUES.has(raw.significance) ? raw.significance : SIGNIFICANCE.SUPPORTING,
		visibility: raw.visibility === 'internal' ? 'internal' : 'teacher',
		author: Object.values(ACTOR).includes(raw.author) ? raw.author : ACTOR.SYSTEM,
		createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
		confirmedBy: raw.confirmedBy === ACTOR.TEACHER ? ACTOR.TEACHER : null,
		source: typeof raw.source === 'string' ? raw.source : null,
		supersedes: Array.isArray(raw.supersedes) ? raw.supersedes.filter((id) => typeof id === 'string') : [],
	};
	return entry;
}

function normalizeHistory(raw) {
	if (raw === null || typeof raw !== 'object') return null;
	if (typeof raw.entryId !== 'string') return null;
	return {
		at: typeof raw.at === 'string' ? raw.at : null,
		entryId: raw.entryId,
		from: typeof raw.from === 'string' ? raw.from : null,
		to: typeof raw.to === 'string' ? raw.to : null,
		actor: Object.values(ACTOR).includes(raw.actor) ? raw.actor : ACTOR.SYSTEM,
		statement: typeof raw.statement === 'string' ? raw.statement.slice(0, MAX_STATEMENT) : null,
		note: typeof raw.note === 'string' ? raw.note.slice(0, 240) : null,
	};
}

/** An empty, valid Denkstand state. */
export function emptyState() {
	return { schema: DENKSTAND_STATE_SCHEMA, revision: 0, entries: [], history: [] };
}

/** Parse a state ledger; tolerant, fail-safe to an empty state on bad input. */
export function parseState(text) {
	if (typeof text !== 'string' || text.trim() === '') return emptyState();
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return emptyState();
	}
	if (value === null || typeof value !== 'object') return emptyState();
	const entries = (Array.isArray(value.entries) ? value.entries : []).map(normalizeEntry).filter((e) => e !== null);
	const history = (Array.isArray(value.history) ? value.history : []).map(normalizeHistory).filter((h) => h !== null);
	const revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
	return { schema: DENKSTAND_STATE_SCHEMA, revision, entries, history };
}

/** Serialize a state ledger to stable, pretty JSON. */
export function serializeState(state) {
	const safe = {
		schema: DENKSTAND_STATE_SCHEMA,
		revision: Number.isSafeInteger(state?.revision) ? state.revision : 0,
		entries: Array.isArray(state?.entries) ? state.entries : [],
		history: Array.isArray(state?.history) ? state.history.slice(-MAX_HISTORY) : [],
	};
	return `${JSON.stringify(safe, null, 2)}\n`;
}

function findEntry(state, id) {
	return state.entries.find((entry) => entry.id === id);
}

function withHistory(state, record) {
	const history = [...state.history, record].slice(-MAX_HISTORY);
	return { ...state, revision: state.revision + 1, history };
}

/**
 * Record a new statement. Requires an explicit status; `teacher_confirmed`
 * additionally requires the author to be the teacher, so a companion can never
 * write a confirmed entry directly.
 * @returns {{ state: object, entry: object }}
 */
export function record(state, input = {}) {
	const status = requireStatus(input.status);
	const author = Object.values(ACTOR).includes(input.author) ? input.author : ACTOR.SYSTEM;
	if (status === STATUS.CONFIRMED && author !== ACTOR.TEACHER) {
		throw new DenkstandError('confirm-requires-teacher', 'Nur die Lehrkraft bestätigt einen Stand', { author });
	}
	if (status === STATUS.FACT && (typeof input.source !== 'string' || input.source.trim() === '')) {
		throw new DenkstandError('fact-requires-source', 'Ein Fakt braucht eine Quelle', {});
	}
	const at = typeof input.at === 'string' ? input.at : new Date().toISOString();
	const entry = {
		id: typeof input.id === 'string' && input.id.trim() !== '' ? input.id : generateId(),
		status,
		statement: clampStatement(input.statement),
		kind: typeof input.kind === 'string' ? input.kind : null,
		significance: SIGNIFICANCE_VALUES.has(input.significance) ? input.significance : SIGNIFICANCE.SUPPORTING,
		visibility: input.visibility === 'internal' ? 'internal' : 'teacher',
		author,
		createdAt: at,
		updatedAt: at,
		confirmedBy: status === STATUS.CONFIRMED ? ACTOR.TEACHER : null,
		source: status === STATUS.FACT ? input.source.trim() : (typeof input.source === 'string' ? input.source : null),
		supersedes: Array.isArray(input.supersedes) ? input.supersedes.filter((id) => typeof id === 'string') : [],
	};
	if (findEntry(state, entry.id) !== undefined) {
		throw new DenkstandError('duplicate-id', 'Eintrag-ID ist bereits vergeben', { id: entry.id });
	}
	const next = { ...state, entries: [...state.entries, entry] };
	return {
		state: withHistory(next, { at, entryId: entry.id, from: null, to: status, actor: author, statement: entry.statement, note: input.note ?? null }),
		entry,
	};
}

/** Companion offers a reading. Always lands as assistant_hypotheses. */
export function hypothesize(state, input = {}) {
	return record(state, { ...input, status: STATUS.HYPOTHESIS, author: ACTOR.ASSISTANT });
}

/**
 * Move an existing entry to a new status. This is the ONLY path that can turn a
 * hypothesis into a confirmed statement, and it insists on `actor === teacher`
 * for that transition — the model can never do it as a side effect.
 * @returns {{ state: object, entry: object }}
 */
export function transition(state, id, toStatus, input = {}) {
	const status = requireStatus(toStatus);
	const current = findEntry(state, id);
	if (current === undefined) throw new DenkstandError('unknown-entry', 'Eintrag nicht gefunden', { id });
	const actor = Object.values(ACTOR).includes(input.actor) ? input.actor : ACTOR.SYSTEM;
	if (status === STATUS.CONFIRMED && actor !== ACTOR.TEACHER) {
		throw new DenkstandError('confirm-requires-teacher', 'Nur die Lehrkraft bestätigt einen Stand', { id, actor });
	}
	if (current.status === status) return { state, entry: current };
	const at = typeof input.at === 'string' ? input.at : new Date().toISOString();
	const updated = {
		...current,
		status,
		updatedAt: at,
		confirmedBy: status === STATUS.CONFIRMED ? ACTOR.TEACHER : (status === STATUS.HYPOTHESIS ? null : current.confirmedBy),
	};
	const next = { ...state, entries: state.entries.map((e) => (e.id === id ? updated : e)) };
	return {
		state: withHistory(next, { at, entryId: id, from: current.status, to: status, actor, statement: updated.statement, note: input.note ?? null }),
		entry: updated,
	};
}

/** Confirm an entry as the teacher's decided ground. */
export function confirm(state, id, input = {}) {
	return transition(state, id, STATUS.CONFIRMED, { ...input, actor: ACTOR.TEACHER });
}

/** Reject a framing: it leaves the active state but stays in history. */
export function reject(state, id, input = {}) {
	return transition(state, id, STATUS.REJECTED, input);
}

/**
 * Supersede an older entry with a new statement. The old entry is rejected (so
 * it drops out of the active state but stays in history) and a new entry is
 * recorded that links back via `supersedes`. A teacher edit superseding an
 * assistant hypothesis is the canonical case: teacher input wins.
 * @returns {{ state: object, entry: object, superseded: string }}
 */
export function supersede(state, oldId, input = {}) {
	const current = findEntry(state, oldId);
	if (current === undefined) throw new DenkstandError('unknown-entry', 'Eintrag nicht gefunden', { id: oldId });
	const at = typeof input.at === 'string' ? input.at : new Date().toISOString();
	const rejected = reject(state, oldId, { actor: input.author ?? ACTOR.TEACHER, at, note: input.note ?? 'ersetzt' });
	const recorded = record(rejected.state, {
		...input,
		at,
		supersedes: [...(Array.isArray(input.supersedes) ? input.supersedes : []), oldId],
	});
	return { state: recorded.state, entry: recorded.entry, superseded: oldId };
}

/**
 * The current-state view: active entries grouped by epistemic status plus the
 * rejected list. This is the structure that MUST be handed across compaction
 * and model switches without collapsing hypotheses into confirmed ground.
 * @returns {{ revision: number, teacher_confirmed: object[], teacher_open: object[],
 *   assistant_hypotheses: object[], facts: object[], rejected: object[] }}
 */
export function projectCurrentState(state) {
	const parsed = state?.entries !== undefined ? state : emptyState();
	const groups = {
		revision: parsed.revision ?? 0,
		[STATUS.CONFIRMED]: [],
		[STATUS.OPEN]: [],
		[STATUS.HYPOTHESIS]: [],
		[STATUS.FACT]: [],
		[STATUS.REJECTED]: [],
	};
	for (const entry of parsed.entries) {
		if (groups[entry.status] !== undefined) groups[entry.status].push(entry);
	}
	return groups;
}

/** History for one entry (or the whole ledger), oldest first. Append-only. */
export function historyOf(state, entryId = undefined) {
	const history = Array.isArray(state?.history) ? state.history : [];
	return entryId === undefined ? [...history] : history.filter((record) => record.entryId === entryId);
}
