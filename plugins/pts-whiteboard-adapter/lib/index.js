// pts-whiteboard-adapter — Host half (ESM)
//
// M1-Spike: the pedagogical companion and the teacher share one whiteboard.
//
// This capability knows BOTH sides and changes NEITHER:
//   * it reads the board through the EXISTING `whiteboard_state` tool definition
//     (no second whiteboard API, no snapshot store, no polling);
//   * it contributes one dynamic prompt context to `pts-companion` sessions
//     through the EXISTING `system-prompt/assemble` waterfall.
//
// It publishes no service, registers no tool, listens to no board event and
// never starts a turn: a board change cannot trigger an agent reaction. The
// human presses a trigger in the whiteboard UI; the next Companion turn simply
// finds the board in its context.
//
// Why the assembly waterfall instead of `systemPrompt.context(...)`:
// `PromptContext.text` is synchronous, and the board state is only reachable
// asynchronously. The waterfall is the one registered seam that is async AND
// scoped to the agent whose prompt is being assembled.
//
// Two seams were verified live before this file existed (M1 probe):
//   * `tools.get('whiteboard_state', scope)` resolves the definition the scope
//     sees, and that definition carries `execute` (dsh-tools/lib/index.js:2890).
//     NOTE for future plugins: the DYNAMIC host sandbox hands out a reduced
//     `tools` facade whose `get` returns only the model-facing schema fields, so
//     this read pattern can only be verified in an installed host row.
//   * `agent.ctx.on('system-prompt/assemble', …)` runs for that agent only, and a
//     context appended to the returned assembly reaches the model as a sourced
//     user-role snapshot.
// A failed `apply` does NOT unwind listeners registered on an AGENT context, so
// every listener below is additionally owned by this capability's own fiber via
// `ctx.effect`: removing the row removes the listeners.
// `systemPrompt` is provided AFTER the inserted profile rows mount, so this
// module resolves its services at USE time (first boot of the row proved the
// eager `ctx.get('systemPrompt')` in `apply` finds nothing).
//
// Removal: delete the profile row (`pts-whiteboard-adapter`). PTS Core and
// dsh-whiteboard are untouched either way.

export const name = 'pts-whiteboard-adapter';

export const inject = ['agents'];

/** The only preset that receives the board projection. */
export const PRESET_ID = 'pts-companion';
/** Registered prompt-context name (also the shadowing key). */
export const CONTEXT_NAME = 'pts:whiteboard';
/** The existing tool this adapter reads through. */
export const TOOL_NAME = 'whiteboard_state';
/** Hard budget for the whole contribution. */
export const MAX_CHARS = 900;
/** Bounded list sizes — the prompt gets a summary, never the tldraw state. */
const MAX_NOTES = 12;
const MAX_FRAMES = 4;
const MAX_SELECTION = 4;
/** Closing rule line: always present, never clipped away. */
const RULE_LINE = '- Regel: Board = Interaktionsschicht, keine Datenquelle. Agent-Vorschläge gelten erst, wenn die Lehrkraft sie übernimmt; nichts davon ist Denkstand.';
/** Room reserved for the delta line when a previous turn exists. */
const DELTA_RESERVE = 300;
/** Ceilings for the two short list lines. */
const SELECTION_MAX = 200;
const FRAMES_MAX = 200;

/** One-time diagnostic guard: `dsh-whiteboard` may not be installed. */
let warnedMissingTool = false;

const OP_LABELS = {
	'add-note': 'Zettel ergänzt',
	'rename-frame': 'Cluster umbenannt',
	'frame-to-back': 'Frame nach hinten gelegt',
	'bind-frame': 'Frame-Kinderverbindung',
	'arrange-sequence': 'Reihenfolge geordnet',
	'propose-clusters': 'Cluster vorgeschlagen',
	'connect-notes': 'Verbindung vorgeschlagen',
	'highlight-notes': 'Zettel hervorgehoben',
};

function clip(value, max) {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	if (text === '') return '';
	return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}

function noteLine(note) {
	const who = note?.actor === 'agent' ? '🤖 ' : '';
	return who + clip(note?.text ?? note?.id, 60);
}

function frameName(frame) {
	return clip(frame?.clusterTitle ?? frame?.name ?? frame?.id, 40);
}

function selectionKey(snapshot) {
	const selection = Array.isArray(snapshot?.selection) ? snapshot.selection : [];
	return selection.map((entry) => String(entry?.id ?? '')).sort().join('|');
}

/**
 * Describe what changed since the adapter last showed the board to this agent.
 *
 * The whiteboard's own client semantics are used instead of guessing: adopting a
 * proposal flips `meta.proposal` to false on the same frame id (client.js), so an
 * adopted cluster is visible as `proposal: true -> false`, while a frame that
 * disappeared entirely was discarded (or turned into something else).
 * @param {object} previous - the snapshot shown on the previous turn.
 * @param {object} next - the snapshot read now.
 * @returns {string} compact German delta, or an empty string.
 */
export function describeDelta(previous, next) {
	const prevNotes = new Map((previous?.notes ?? []).map((note) => [note.id, note]));
	const nextNotes = new Map((next?.notes ?? []).map((note) => [note.id, note]));
	const prevFrames = new Map((previous?.frames ?? []).map((frame) => [frame.id, frame]));
	const nextFrames = new Map((next?.frames ?? []).map((frame) => [frame.id, frame]));
	const parts = [];

	const added = [...nextNotes.values()].filter((note) => !prevNotes.has(note.id));
	if (added.length > 0) {
		const listed = added.slice(0, 3).map((note) => (note.actor === 'agent' ? '🤖 ' : '🧑 ') + clip(note.text, 40));
		parts.push(`+${added.length} Zettel (${listed.join(', ')}${added.length > 3 ? ', …' : ''})`);
	}
	const removed = [...prevNotes.values()].filter((note) => !nextNotes.has(note.id));
	if (removed.length > 0) parts.push(`−${removed.length} Zettel entfernt`);

	const moved = [...nextNotes.values()].filter((note) => {
		const before = prevNotes.get(note.id);
		if (before === undefined) return false;
		return Math.abs((before.x ?? 0) - (note.x ?? 0)) > 40 || Math.abs((before.y ?? 0) - (note.y ?? 0)) > 40;
	});
	if (moved.length > 0) parts.push(`${moved.length} Zettel verschoben`);

	const proposed = [...nextFrames.values()].filter((frame) => frame.proposal === true && !prevFrames.has(frame.id));
	if (proposed.length > 0) parts.push(`Vorschlag ergänzt: ${proposed.map((f) => `„${frameName(f)}“`).join(', ')}`);

	const adopted = [...nextFrames.values()].filter((frame) => {
		const before = prevFrames.get(frame.id);
		return before?.proposal === true && frame.proposal !== true;
	});
	if (adopted.length > 0) parts.push(`übernommen: ${adopted.map((f) => `„${frameName(f)}“`).join(', ')}`);

	const discarded = [...prevFrames.values()].filter((frame) => frame.proposal === true && !nextFrames.has(frame.id));
	if (discarded.length > 0) parts.push(`verworfen oder umgebaut: ${discarded.map((f) => `„${frameName(f)}“`).join(', ')}`);

	const renamed = [...nextFrames.values()].filter((frame) => {
		const before = prevFrames.get(frame.id);
		return before !== undefined && (before.name ?? '') !== (frame.name ?? '') && (frame.name ?? '') !== '';
	});
	if (renamed.length > 0) {
		parts.push(`umbenannt: ${renamed.map((f) => `„${clip(prevFrames.get(f.id)?.name, 24)}“ → „${clip(f.name, 24)}“`).join(', ')}`);
	}

	if (previous !== undefined && selectionKey(previous) !== selectionKey(next)) parts.push('Auswahl der Lehrkraft geändert');

	const commands = Array.isArray(next?.commandResults) ? next.commandResults : [];
	const ops = [];
	for (const entry of commands) {
		const op = typeof entry?.op === 'string' ? entry.op : undefined;
		if (op === undefined || OP_LABELS[op] === undefined) continue;
		if (!ops.includes(OP_LABELS[op])) ops.push(OP_LABELS[op]);
	}
	if (ops.length > 0) parts.push(`zuletzt ausgeführt: ${ops.slice(-3).join(', ')}`);

	return parts.join('; ');
}

/**
 * Render the companion-facing board projection.
 *
 * Returns an empty string when there is nothing to say (no live snapshot, or an
 * empty board) — the adapter then contributes no context at all.
 * @param {object|undefined} snapshot - the whiteboard snapshot, or undefined when not live.
 * @param {object|undefined} previous - the snapshot shown on the previous turn.
 * @returns {string} compact projection text, bounded by {@link MAX_CHARS}.
 */
export function renderWhiteboardContext(snapshot, previous = undefined) {
	if (snapshot === null || typeof snapshot !== 'object') return '';
	const counts = snapshot.counts ?? {};
	const notes = Array.isArray(snapshot.notes) ? snapshot.notes : [];
	const frames = Array.isArray(snapshot.frames) ? snapshot.frames : [];
	const proposals = Array.isArray(snapshot.proposals) ? snapshot.proposals : [];
	const selection = Array.isArray(snapshot.selection) ? snapshot.selection : [];
	const page = snapshot.page !== null && typeof snapshot.page === 'object' ? snapshot.page : null;
	if (notes.length === 0 && frames.length === 0 && selection.length === 0) return '';

	const lines = ['## Whiteboard (automatische Kontextprojektion)'];
	const total = Number.isFinite(counts.notes) ? counts.notes : notes.length;
	const human = Number.isFinite(counts.human) ? counts.human : notes.filter((n) => n?.actor !== 'agent').length;
	const agent = Number.isFinite(counts.agent) ? counts.agent : notes.filter((n) => n?.actor === 'agent').length;
	const pageName = clip(page?.name, 40);
	const pages = Number.isFinite(page?.pageCount) && page.pageCount > 1 ? ` von ${page.pageCount}` : '';
	lines.push(
		`- Zettel: ${total} (🧑 ${human} · 🤖 ${agent})`
		+ (pageName === '' ? '' : ` | Seite: „${pageName}“${pages}`)
		+ (proposals.length > 0 ? ` | offene Vorschläge: ${proposals.length}` : ''),
	);

	const delta = previous === undefined ? '' : describeDelta(previous, snapshot);

	if (selection.length > 0) {
		const listed = selection.slice(0, MAX_SELECTION).map((entry) => `„${clip(entry?.text ?? entry?.id, 45)}“`);
		lines.push(clip(`- Auswahl der Lehrkraft (${selection.length}): ${listed.join(', ')}${selection.length > MAX_SELECTION ? ', …' : ''}`, SELECTION_MAX));
	}

	if (frames.length > 0) {
		const listed = frames.slice(0, MAX_FRAMES).map((frame) => {
			const members = Array.isArray(frame?.memberIds) ? frame.memberIds.length : 0;
			return frame?.proposal === true
				? `🤖 Vorschlag „${frameName(frame)}“ (${members} Zettel, unbestätigt)`
				: `„${frameName(frame)}“ (${members} Zettel)`;
		});
		lines.push(clip(`- Cluster/Frames: ${listed.join('; ')}${frames.length > MAX_FRAMES ? `; +${frames.length - MAX_FRAMES} weitere` : ''}`, FRAMES_MAX));
	}

	// The note list is the only unbounded list, so it is filled from whatever room
	// is left AFTER the reserve for the delta line and the closing rule: those two
	// must survive. The number of notes that are not shown belongs to the line
	// itself, so a later clip can never swallow it silently.
	if (notes.length > 0) {
		const reserve = (delta === '' ? 0 : DELTA_RESERVE) + RULE_LINE.length + 8;
		const room = MAX_CHARS - lines.join('\n').length - reserve;
		if (room > 80) {
			const parts = [];
			let used = 0;
			for (const entry of notes.slice(0, MAX_NOTES)) {
				const rendered = noteLine(entry);
				if (rendered === '') continue;
				if (parts.length > 0 && used + rendered.length + 3 > room) break;
				parts.push(rendered);
				used += rendered.length + 3;
			}
			const remaining = notes.length - parts.length;
			lines.push(`- Zettel: ${parts.join(' · ')}${remaining > 0 ? ` (+${remaining} weitere)` : ''}`);
		}
	}

	if (delta !== '') lines.push(clip(`- Seit dem letzten Turn: ${delta}`, DELTA_RESERVE));

	lines.push(RULE_LINE);

	const text = lines.join('\n');
	return text.length <= MAX_CHARS ? text : text.slice(0, MAX_CHARS - 1).trimEnd() + '…';
}

/**
 * Contribution while the board is OPEN but still empty.
 *
 * Reached only when the browser polls (tab open) yet has never posted a
 * snapshot. That combination is a sound signal for "nothing on the board": the
 * client starts with an empty `lastBoardSig` and posts as soon as any shape
 * exists (`lib/client.js:1135`, `:1184`), so every non-empty board pushes within
 * one 450 ms poll. The wording states what the host last received, so it cannot
 * claim more than it knows.
 * @returns {string} one factual line about the open, empty board.
 */
export function renderOpenBoardContext() {
	return '## Whiteboard (automatische Kontextprojektion)\n- Das Board ist geöffnet; es liegt derzeit nichts darauf (kein Zettel, kein Frame, keine Auswahl).';
}

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx) ?? agent?.session?.header?.agentPreset;
}

/**
 * Read the live board through the existing whiteboard tool definition.
 *
 * `execute` is called directly, NOT through `tools.execute(...)`, and WITHOUT an
 * execution context. Directly, because the dispatch pipeline would materialize a
 * tool call the model never made (a phantom card in the transcript); without an
 * execution context, because the whiteboard's `captureSession(exec)` would
 * otherwise overwrite the session key that binds the browser board to the
 * Companion session.
 * The services are resolved at USE time, never at boot: `systemPrompt` is
 * provided AFTER the inserted profile rows mount, so an eager `ctx.get()` in
 * `apply` finds nothing (observed in the first boot of this row).
 * @param {import('cordis').Context} ctx - this capability's host context.
 * @returns {Promise<object|undefined>} the raw `whiteboard_state` result.
 */
async function readBoard(ctx) {
	const definition = ctx.get('tools')?.get?.(TOOL_NAME);
	if (definition === undefined || typeof definition.execute !== 'function') {
		if (!warnedMissingTool) {
			warnedMissingTool = true;
			console.error(`[pts-whiteboard-adapter] ${TOOL_NAME} ist nicht als ausführbare Definition sichtbar — kein Board-Kontext`);
		}
		return undefined;
	}
	return await definition.execute({});
}

/** @param {import('cordis').Context} ctx - the host context of this capability. */
export function apply(ctx) {
	const installed = new WeakMap();
	const shown = new WeakMap();

	const handlerFor = (agent) => async (assembly, _context, next) => {
		const base = await next();
		try {
			const result = await readBoard(ctx);
			const live = result?.live === true;
			const available = live && result?.available === true && result?.snapshot !== null && typeof result?.snapshot === 'object';
			let text = available ? renderWhiteboardContext(result.snapshot, shown.get(agent)) : '';
			// Tab open, nothing posted yet: the board is empty, and the Companion
			// should know the surface exists before it has any content.
			if (text === '' && live) text = renderOpenBoardContext();
			if (text === '') return base;
			if (available) shown.set(agent, result.snapshot);
			const contexts = Array.isArray(base?.contexts) ? base.contexts : [];
			if (contexts.some((entry) => entry?.name === CONTEXT_NAME)) return base;
			return { ...base, contexts: [...contexts, { name: CONTEXT_NAME, text }] };
		} catch (error) {
			console.error('[pts-whiteboard-adapter] Board-Kontext fehlgeschlagen:', error?.message ?? error);
			return base;
		}
	};

	const reconcile = (agent) => {
		const should = composedPreset(ctx, agent) === PRESET_ID && !isSubagent(agent);
		const current = installed.get(agent);
		if (should && current === undefined) {
			const stop = agent.ctx.on('system-prompt/assemble', handlerFor(agent));
			// The listener is scoped to the AGENT, so its lifetime must be bound to
			// this capability explicitly — otherwise removing the profile row would
			// leave it injecting context into living sessions.
			ctx.effect(() => (typeof stop === 'function' ? stop : () => {}), `pts-whiteboard-adapter: wb context for ${String(agent?.id)}`);
			installed.set(agent, true);
		}
		if (!should && current !== undefined) {
			installed.delete(agent);
			shown.delete(agent);
		}
	};

	for (const agent of ctx.agents.list()) reconcile(agent);
	ctx.on('agent/created', ({ agent }) => reconcile(agent));
	ctx.on('agent/disposed', ({ agent }) => {
		installed.delete(agent);
		shown.delete(agent);
	});
	console.log('[pts-whiteboard-adapter] Host-Hälfte bereit — Board-Kontext für pts-companion-Sessions über system-prompt/assemble');
	return undefined;
}
