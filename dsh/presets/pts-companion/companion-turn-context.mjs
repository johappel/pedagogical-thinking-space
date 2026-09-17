// Companion turn context — the small structured brief the companion gets.
//
// Before a turn the companion receives a compact, STRUCTURED context, not a
// prose summary that a later model could mistake for confirmed ground:
//
//   CURRENT DENKSTAND      grouped by epistemic status (never collapsed)
//   BOARD CHANGES          only the delta since the last seen revision
//   SELECTED CONTEXT       board elements the teacher chose to talk about
//
// It also owns two boundaries the conversation stream must respect:
//   * selected board context is kept technically separate from the teacher's
//     message (makeSelectedContext) — chosen shapes are never spliced into the
//     teacher's words;
//   * background/subagent technical reports are NOT treated as teacher messages
//     (classifyConversationEvent) — the companion gets the pedagogical
//     consequence, not "Background subagent … finished" as if the teacher said it.
//
// Pure formatting and classification only; no I/O, no runtime coupling.

import { STATUS, projectCurrentState } from './denkstand-state.mjs';
import { summarizeDelta, isMeaningful } from './board-delta.mjs';

/** Hard budget for the whole turn brief. */
export const TURN_CONTEXT_BUDGET = 3000;

const STATUS_LABEL = Object.freeze({
	[STATUS.CONFIRMED]: 'Bestätigt (Lehrkraft)',
	[STATUS.OPEN]: 'Aktiv offen',
	[STATUS.HYPOTHESIS]: 'Companion-Hypothesen (nicht bestätigt)',
	[STATUS.FACT]: 'Fakten / Quellen',
	[STATUS.REJECTED]: 'Verworfen',
});
/** Order the categories are shown in; rejected last so it never reads as ground. */
const RENDER_ORDER = Object.freeze([STATUS.CONFIRMED, STATUS.OPEN, STATUS.HYPOTHESIS, STATUS.FACT, STATUS.REJECTED]);
const MAX_PER_GROUP = 8;

function clip(value, max) {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Render the current Denkstand as labeled categories. This is the structure
 * that MUST survive compaction and a model switch: a new model must be able to
 * see that an assistant hypothesis is a hypothesis and a rejected framing is
 * rejected, never inferring confirmation from an older, well-phrased sentence.
 * @param {object} currentState - a denkstand-state ledger or its projection.
 * @returns {string}
 */
export function renderCurrentDenkstand(currentState) {
	const groups = currentState?.entries !== undefined ? projectCurrentState(currentState) : (currentState ?? {});
	const lines = ['## CURRENT DENKSTAND (strukturierte Übergabe — nicht als Prosa verdichten)'];
	let any = false;
	for (const status of RENDER_ORDER) {
		const entries = Array.isArray(groups[status]) ? groups[status] : [];
		if (entries.length === 0) continue;
		any = true;
		lines.push(`${STATUS_LABEL[status]}:`);
		for (const entry of entries.slice(0, MAX_PER_GROUP)) {
			const suffix = status === STATUS.FACT && entry.source ? ` (Quelle: ${clip(entry.source, 60)})` : '';
			lines.push(`- ${clip(entry.statement, 160)}${suffix}`);
		}
		if (entries.length > MAX_PER_GROUP) lines.push(`- … (+${entries.length - MAX_PER_GROUP} weitere)`);
	}
	if (!any) lines.push('- (noch kein strukturierter Stand erfasst)');
	lines.push('Regel: Ein Companion-Satz ist keine Lehrkraft-Bestätigung. Verworfenes ist nicht der aktuelle Stand.');
	return lines.join('\n');
}

/** Render only the board changes since the companion's last seen revision. */
export function renderBoardChanges(delta) {
	if (delta === null || delta === undefined || !isMeaningful(delta)) return '';
	const lines = ['## BOARD CHANGES SEIT DEM LETZTEN TURN'];
	if (delta.boardRevision !== null && delta.boardRevision !== undefined) {
		lines.push(`(Board-Revision ${delta.boardRevision})`);
	}
	for (const bullet of summarizeDelta(delta)) lines.push(`- ${bullet}`);
	return lines.join('\n');
}

// ── Selected context (the Context Picker payload) ──────────────────────────

export const SELECTED_CONTEXT_SCHEMA = 'ptspace.selected-context/v1';
/** Sources the picker may draw from; only whiteboard is wired today. */
export const SELECTED_CONTEXT_SOURCES = Object.freeze(['whiteboard', 'learning_moment', 'material', 'teaching_window', 'document']);

/**
 * Build a validated selected-context payload. This is a SEPARATE structure from
 * the teacher's message text: the picker fills it, the composer sends it
 * alongside the message, and the companion is told which elements the teacher
 * chose — it must never read them as the teacher's own words.
 * @param {{ source?: string, pageId?: string, shapeIds?: string[],
 *   snapshotRevision?: number, items?: {id: string, text?: string}[] }} input
 * @returns {{ schema: string, source: string, pageId: string|null,
 *   shapeIds: string[], snapshotRevision: number|null, items: object[] }}
 */
export function makeSelectedContext(input = {}) {
	const source = SELECTED_CONTEXT_SOURCES.includes(input.source) ? input.source : 'whiteboard';
	const items = (Array.isArray(input.items) ? input.items : [])
		.filter((item) => item !== null && typeof item === 'object' && typeof item.id === 'string')
		.map((item) => ({ id: item.id, text: typeof item.text === 'string' ? clip(item.text, 200) : null }));
	const shapeIds = Array.isArray(input.shapeIds)
		? input.shapeIds.filter((id) => typeof id === 'string')
		: items.map((item) => item.id);
	return {
		schema: SELECTED_CONTEXT_SCHEMA,
		source,
		pageId: typeof input.pageId === 'string' ? input.pageId : null,
		shapeIds,
		snapshotRevision: Number.isSafeInteger(input.snapshotRevision) ? input.snapshotRevision : null,
		items,
	};
}

/** Render the selected context as a clearly non-teacher block. */
export function renderSelectedContext(selectedContext) {
	const items = Array.isArray(selectedContext?.items) ? selectedContext.items : [];
	if (items.length === 0) return '';
	const sourceLabel = selectedContext.source === 'whiteboard' ? 'Board' : selectedContext.source;
	const lines = [`## SELECTED CONTEXT (von der Lehrkraft ausgewählt — keine Aussage der Lehrkraft)`, `Aus dem ${sourceLabel} · ${items.length} Element${items.length === 1 ? '' : 'e'}`];
	for (const item of items.slice(0, 12)) lines.push(`- „${clip(item.text ?? item.id, 120)}“`);
	return lines.join('\n');
}

/**
 * Assemble the full turn brief from its structured parts.
 * @param {{ currentState?: object, boardDelta?: object|null,
 *   selectedContext?: object|null, budget?: number }} input
 * @returns {string}
 */
export function buildTurnContext(input = {}) {
	const blocks = [renderCurrentDenkstand(input.currentState ?? {})];
	const board = renderBoardChanges(input.boardDelta ?? null);
	if (board !== '') blocks.push(board);
	const selected = input.selectedContext ? renderSelectedContext(input.selectedContext) : '';
	if (selected !== '') blocks.push(selected);
	const text = blocks.join('\n\n');
	const budget = input.budget ?? TURN_CONTEXT_BUDGET;
	return text.length <= budget ? text : `${text.slice(0, budget - 1).trimEnd()}…`;
}

// ── Conversation stream classification (subagent events out of teacher role) ─

/** The distinct roles the conversation stream must keep apart. */
export const EVENT_ROLE = Object.freeze({
	TEACHER: 'teacher',
	ASSISTANT: 'assistant',
	TOOL_RESULT: 'tool_result',
	ACTIVITY: 'activity',
	STATE_CHANGE: 'state_change',
});

/** Kinds that are machinery, never teacher speech, regardless of role. */
const MACHINERY_KINDS = Object.freeze(new Set(['subagent-settled', 'subagent/start', 'subagent/end', 'job', 'job-output', 'activity', 'state-change', 'denkstand_changed']));
/** Bodies that are technical worker/subagent reports, never teacher speech. */
const TECHNICAL_BODY = [
	/\bbackground\s+subagent\b.*\bfinished\b/i,
	/\bsubagent\b.*\b(finished|completed|failed|started)\b/i,
	/\bhintergrund-?(worker|subagent|auftrag)\b/i,
	/\bstarted\s+subagent\b/i,
	/\bjob\s+(output|completed|finished)\b/i,
];

function bodyText(event) {
	if (typeof event?.text === 'string') return event.text;
	if (typeof event?.body === 'string') return event.body;
	if (Array.isArray(event?.content)) return event.content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join(' ');
	return '';
}

/**
 * Classify one conversation event. A background/subagent report that arrives on
 * the user role is reclassified as activity — it must not be fed back as a
 * teacher message.
 * @param {{ role?: string, kind?: string, text?: string, body?: string, content?: any[] }} event
 * @returns {string} one of EVENT_ROLE.
 */
export function classifyConversationEvent(event = {}) {
	const kind = typeof event.kind === 'string' ? event.kind : '';
	if (MACHINERY_KINDS.has(kind)) return kind === 'denkstand_changed' || kind === 'state-change' ? EVENT_ROLE.STATE_CHANGE : EVENT_ROLE.ACTIVITY;
	const role = typeof event.role === 'string' ? event.role.toLowerCase() : '';
	if (role === 'assistant') return EVENT_ROLE.ASSISTANT;
	if (role === 'tool' || kind === 'tool-result' || kind === 'tool-call') return EVENT_ROLE.TOOL_RESULT;
	if (role === 'user' || role === 'teacher') {
		const body = bodyText(event);
		if (TECHNICAL_BODY.some((re) => re.test(body))) return EVENT_ROLE.ACTIVITY;
		return EVENT_ROLE.TEACHER;
	}
	return EVENT_ROLE.ACTIVITY;
}

/** Guard: is this event a genuine teacher message the companion may treat as such? */
export function isTeacherMessage(event) {
	return classifyConversationEvent(event) === EVENT_ROLE.TEACHER;
}

/**
 * Fold a background/subagent settlement into a structured `denkstand_changed`
 * consequence instead of leaking its technical report into the stream.
 * @param {{ confirmed?: string[], rejected?: string[], hypotheses?: string[], facts?: string[] }} consequence
 * @returns {{ kind: 'denkstand_changed', changes: string[] }}
 */
export function toDenkstandChanged(consequence = {}) {
	const changes = [];
	for (const s of consequence.confirmed ?? []) changes.push(`bestätigt: ${clip(s, 120)}`);
	for (const s of consequence.rejected ?? []) changes.push(`verworfen: ${clip(s, 120)}`);
	for (const s of consequence.hypotheses ?? []) changes.push(`Hypothese: ${clip(s, 120)}`);
	for (const s of consequence.facts ?? []) changes.push(`Fakt: ${clip(s, 120)}`);
	return { kind: 'denkstand_changed', changes };
}
