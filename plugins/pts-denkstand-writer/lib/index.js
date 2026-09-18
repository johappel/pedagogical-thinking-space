// pts-denkstand-writer — the single write-seam for the current Denkstand.
//
// Phase 1 created the current-state model (denkstand-state.mjs) but nothing wrote
// it, so it risked becoming a parallel structure next to the additive Markdown.
// This plugin closes that gap: it registers ONE model-facing tool, `pts_denkstand`,
// that the Documentarian (and, when a teacher decision is explicit, the Companion)
// uses to move the canonical current state through its epistemic transitions:
//
//     record · confirm · open · hypothesize · reject · supersede · current
//
// The canonical current state lives in `.pts/denkstand-state.json` in the
// Denkraum, beside the existing bindings ledgers. The additive Markdown files
// (learning-design.md, decisions.yml) stay as human-facing narrative; the
// structured current state is what reaches the Companion before a turn (see
// pts-context.mjs). This is the write path, not a second model.
//
// It publishes no service and registers no HTTP route: a Denkraum ledger, a tool,
// nothing else. Removing the profile row removes the tool; PTS Core is untouched.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
	STATUS,
	SIGNIFICANCE,
	ACTOR,
	DenkstandError,
	emptyState,
	parseState,
	serializeState,
	record,
	hypothesize,
	confirm,
	reject,
	transition,
	supersede,
	projectCurrentState,
} from '../../../dsh/presets/pts-companion/denkstand-state.mjs';
import { reconcileBoard } from '../../../dsh/presets/pts-companion/denkstand-projection.mjs';

export const name = 'pts-denkstand-writer';
export const inject = ['webServer', 'agents'];

const TOOL_NAME = 'pts_denkstand';
const RENDER_TOOL = 'pts_whiteboard_render';
const STATE_DIR = '.pts';
const STATE_FILE = 'denkstand-state.json';

/** Map the tool's status alias to a canonical STATUS (accepts short forms). */
const STATUS_ALIAS = Object.freeze({
	teacher_confirmed: STATUS.CONFIRMED,
	confirmed: STATUS.CONFIRMED,
	teacher_open: STATUS.OPEN,
	open: STATUS.OPEN,
	assistant_hypotheses: STATUS.HYPOTHESIS,
	hypothesis: STATUS.HYPOTHESIS,
	facts: STATUS.FACT,
	fact: STATUS.FACT,
});

function resolveStatus(value) {
	return STATUS_ALIAS[String(value ?? '').trim()] ?? value;
}

/**
 * Apply one Denkstand operation to a parsed state. Pure and total: it returns
 * either the next state with a result, or a structured error — never throws for
 * a domain problem. This is the unit-testable core of the tool.
 * @param {object} state - the parsed denkstand-state ledger.
 * @param {object} args - the tool arguments.
 * @returns {{ ok: boolean, state?: object, result?: object, error?: object }}
 */
export function runOperation(state, args = {}) {
	const op = String(args.operation ?? '').trim();
	try {
		if (op === 'current' || op === '') {
			return { ok: true, state, result: { current: projectCurrentState(state) } };
		}
		if (op === 'record') {
			const out = record(state, {
				status: resolveStatus(args.status),
				statement: args.statement,
				author: args.author ?? (resolveStatus(args.status) === STATUS.CONFIRMED ? ACTOR.TEACHER : ACTOR.SYSTEM),
				kind: args.kind,
				significance: args.significance,
				visibility: args.visibility,
				source: args.source,
				id: args.id,
				note: args.note,
			});
			return { ok: true, state: out.state, result: { entry: out.entry } };
		}
		if (op === 'hypothesize') {
			const out = hypothesize(state, { statement: args.statement, kind: args.kind, significance: args.significance, id: args.id, note: args.note });
			return { ok: true, state: out.state, result: { entry: out.entry } };
		}
		if (op === 'confirm') {
			const out = confirm(state, args.id, { note: args.note });
			return { ok: true, state: out.state, result: { entry: out.entry } };
		}
		if (op === 'open') {
			const out = transition(state, args.id, STATUS.OPEN, { actor: args.actor ?? ACTOR.TEACHER, note: args.note });
			return { ok: true, state: out.state, result: { entry: out.entry } };
		}
		if (op === 'reject') {
			const out = reject(state, args.id, { actor: args.actor ?? ACTOR.TEACHER, note: args.note });
			return { ok: true, state: out.state, result: { entry: out.entry } };
		}
		if (op === 'supersede') {
			const out = supersede(state, args.oldId ?? args.id, {
				status: resolveStatus(args.status ?? STATUS.CONFIRMED),
				statement: args.statement,
				author: args.author ?? ACTOR.TEACHER,
				kind: args.kind,
				significance: args.significance,
				source: args.source,
				note: args.note,
			});
			return { ok: true, state: out.state, result: { entry: out.entry, superseded: out.superseded } };
		}
		return { ok: false, error: { code: 'unknown-operation', operation: op } };
	} catch (error) {
		if (error instanceof DenkstandError) return { ok: false, error: { code: error.code, message: error.message, detail: error.detail } };
		return { ok: false, error: { code: 'denkstand-error', message: String(error?.message ?? error) } };
	}
}

function denkraumRoot(exec) {
	const cwd = exec?.agent?.session?.header?.cwd;
	return typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null;
}

async function readState(root) {
	try {
		return parseState(await fs.readFile(path.join(root, STATE_DIR, STATE_FILE), 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') return emptyState();
		throw error;
	}
}

async function writeState(root, state) {
	const dir = path.join(root, STATE_DIR);
	await fs.mkdir(dir, { recursive: true });
	const target = path.join(dir, STATE_FILE);
	const tmp = `${target}.tmp-${process.pid}`;
	await fs.writeFile(tmp, serializeState(state), 'utf8');
	await fs.rename(tmp, target);
}

const GUIDANCE = 'Kanonischer aktueller Denkstand. operation ∈ record, confirm, open, hypothesize, reject, supersede, current. '
	+ 'record legt einen Eintrag mit epistemischem Status an (teacher_confirmed/teacher_open/facts). '
	+ 'hypothesize legt eine Companion-Deutung an (assistant_hypotheses). confirm(id) macht daraus bestätigten Lehrkraft-Stand. '
	+ 'reject(id) nimmt eine Rahmung aus dem aktiven Stand (bleibt in der Historie). '
	+ 'supersede(oldId, …) ersetzt eine ältere Fassung durch eine neue. current liest den aktuellen Stand. '
	+ 'Bestätigen ist ausschließlich eine Lehrkraft-Handlung; eine Hypothese wird nie stillschweigend zu bestätigtem Stand. '
	+ 'significance ∈ anchor, supporting, detail steuert die Board-Projektion.';

export function apply(ctx) {
	const tools = ctx.get('tools');
	if (!tools || typeof tools.register !== 'function') {
		console.error('[pts-denkstand-writer] tools-Registry nicht verfügbar — kein Denkstand-Writer');
		return;
	}
	const tool = {
		name: TOOL_NAME,
		description: GUIDANCE,
		parameters: {
			type: 'object',
			required: ['operation'],
			properties: {
				operation: { type: 'string', enum: ['record', 'confirm', 'open', 'hypothesize', 'reject', 'supersede', 'current'] },
				statement: { type: 'string', description: 'Aussagetext (für record/hypothesize/supersede).' },
				status: { type: 'string', enum: ['teacher_confirmed', 'teacher_open', 'facts'], description: 'Epistemischer Status für record.' },
				significance: { type: 'string', enum: [SIGNIFICANCE.ANCHOR, SIGNIFICANCE.SUPPORTING, SIGNIFICANCE.DETAIL], description: 'Tragweite; steuert die Board-Projektion.' },
				kind: { type: 'string', description: 'Semantische Art, z. B. moment, tension, decision, question.' },
				source: { type: 'string', description: 'Quelle (erforderlich für facts).' },
				id: { type: 'string', description: 'Eintrag-ID (für confirm/open/reject) oder Wunsch-ID für record.' },
				oldId: { type: 'string', description: 'Zu ersetzende Eintrag-ID (für supersede).' },
				note: { type: 'string', description: 'Kurze Begründung für die Historie.' },
			},
		},
		output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
		isConcurrencySafe: () => false,
		execute: async (args, exec) => {
			const root = denkraumRoot(exec);
			if (root === null) return { ok: false, status: 'blocked', error: { code: 'session-workspace-unavailable' } };
			let state;
			try {
				state = await readState(root);
			} catch (error) {
				return { ok: false, status: 'blocked', error: { code: 'state-unreadable', message: String(error?.message ?? error) } };
			}
			const outcome = runOperation(state, args);
			if (!outcome.ok) return { ok: false, status: 'rejected', error: outcome.error };
			if (outcome.state !== state) {
				try {
					await writeState(root, outcome.state);
				} catch (error) {
					return { ok: false, status: 'blocked', error: { code: 'state-unwritable', message: String(error?.message ?? error) } };
				}
			}
			const nextState = outcome.state ?? state;
			// Live board projection: a confirmed anchor must actually reach the
			// Übersicht. Best-effort — a board that is not live never fails the write.
			let projection;
			if (outcome.state !== state) {
				const renderTool = tools.get(RENDER_TOOL);
				const render = renderTool && typeof renderTool.execute === 'function' ? (request) => renderTool.execute(request, exec) : undefined;
				try {
					projection = await reconcileBoard(render, nextState);
				} catch (error) {
					projection = { ok: false, applied: [], pages: [], skipped: String(error?.message ?? error) };
				}
			}
			return { ok: true, status: 'ok', operation: args.operation, ...outcome.result, current: projectCurrentState(nextState), projection };
		},
	};
	ctx.effect(() => tools.register(tool), `tool:${TOOL_NAME}`);
	console.log('[pts-denkstand-writer] pts_denkstand registriert — Schreibfassade für den aktuellen Denkstand');
	return undefined;
}
