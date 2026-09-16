import { promises as fs } from 'node:fs';
import path from 'node:path';
import { workspaceRoot } from '../../../dsh-presets/pts-companion/teaching-product.mjs';
import { readProduct } from '../../../dsh-presets/pts-companion/teaching-product.mjs';
import { parseLandscape } from '../../../dsh-presets/pts-companion/workspace-parsers.mjs';
import { buildMomentImpact } from '../../../dsh-presets/pts-companion/moment-impact.mjs';
import { resolveShapeReference, RenderPlanError } from '../../pts-whiteboard-renderer/lib/render-plan.mjs';
import { captureLearningMoment, bumpVersion, deleteLearningMoment, findMoment, parseLedger, serializeLedger, emptyLedger } from './domain.mjs';
import { bindProjection, moveProjection, detachProjection, projectionsFor, findProjection, isStaleProjection, syncProjections } from './bindings.mjs';
import { classifyReaction, usagesFromImpact } from './reactions.mjs';

export const name = 'pts-learning-moment-binding';
export const inject = ['webServer', 'sessions', 'agents'];

const LEDGER_FILE = 'learning-moment-bindings.json';
const PRESET_ID = 'pts-companion';
const TOOL_NAME = 'pts_learning_moment';
const STATE_TOOL = 'whiteboard_state';
const MOVE_TOOL = 'whiteboard_move_shape';
const CONTEXT_NAME = 'pts:learning-moment-binding';

function send(res, status, value) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(JSON.stringify(value));
}

async function readRequestJson(req) {
	let raw = '';
	for await (const chunk of req) raw += chunk;
	return JSON.parse(raw || '{}');
}

async function readLedger(root) {
	try {
		return parseLedger(await fs.readFile(path.join(root, LEDGER_FILE), 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') return emptyLedger();
		throw error;
	}
}

async function writeLedger(root, ledger) {
	await fs.writeFile(path.join(root, LEDGER_FILE), serializeLedger(ledger), 'utf8');
}

async function landscapeMoment(root, domainId) {
	try {
		const landscape = parseLandscape(await fs.readFile(path.join(root, 'learning-landscape.md'), 'utf8'));
		return landscape.moments.find((entry) => entry.id === domainId) ?? null;
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		throw error;
	}
}

// The Denkraum root is the session working directory. Prefer the strict
// scaffolded `<base>/workspace/<name>` layout (repo Denkräume) for its realpath
// escape checks; fall back to the live Denkraum cwd itself, which is how the
// Companion and pts_edit already operate on real Denkräume. This does NOT relax
// the domain contract: learning-landscape.md stays required and fail-closed.
async function resolveDenkraumRoot(cwd) {
	if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;
	try { return await workspaceRoot(cwd); } catch { /* not a scaffolded workspace/ layout */ }
	try { return await fs.realpath(path.resolve(cwd)); } catch { return null; }
}

async function rootFor(ctx, sessionId) {
	const session = ctx.get('sessions')?.get?.(sessionId);
	if (!session?.header?.cwd) return null;
	return await resolveDenkraumRoot(session.header.cwd);
}

// Domain-Write-Seam: every mutation goes through one of these handlers. The
// renderer never touches the ledger; this is the only path that creates a
// canonical LearningMoment, binds a projection or bumps a version.
const HANDLERS = {
	// Capture gate. The teacher deliberately holds a moment as canonical. The
	// moment must already exist in the landscape; a bare card role never
	// reaches here.
	async capture(root, body) {
		const moment = await landscapeMoment(root, body.domainId);
		if (!moment) return { status: 404, value: { ok: false, error: 'landscape-moment-required', domainId: body.domainId } };
		const ledger = await readLedger(root);
		const result = captureLearningMoment(ledger, {
			domainId: body.domainId,
			createdFrom: body.createdFrom,
			confirmedAt: new Date().toISOString(),
		});
		if (result.created) await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, created: result.created, moment: result.moment } };
	},

	async bind(root, body) {
		const ledger = await readLedger(root);
		const result = bindProjection(ledger, { domainId: body.domainId, projectionId: body.projectionId, projectionType: body.projectionType, page: body.page });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, projection: result.projection } };
	},

	async move(root, body) {
		const ledger = await readLedger(root);
		const result = moveProjection(ledger, { domainId: body.domainId, projectionId: body.projectionId, toPage: body.toPage });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, projection: result.projection } };
	},

	async detach(root, body) {
		const ledger = await readLedger(root);
		const result = detachProjection(ledger, { domainId: body.domainId, projectionId: body.projectionId });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, domainRetained: result.domainRetained, orphanedDomain: result.orphanedDomain } };
	},

	// Record a canonical content change and classify the reaction. This never
	// rewrites a dependent artefact; a confirm/clarify follow-up stays with the
	// teacher and Companion.
	async update(root, body) {
		const moment = await landscapeMoment(root, body.domainId);
		if (!moment) return { status: 404, value: { ok: false, error: 'landscape-moment-required', domainId: body.domainId } };
		const ledger = await readLedger(root);
		const bump = bumpVersion(ledger, { domainId: body.domainId, expectedVersion: body.expectedVersion });
		if (!bump.ok) return { status: 409, value: { ok: false, error: 'stale-version', currentVersion: bump.currentVersion } };
		const impact = buildMomentImpact({ moment, fields: body.fields || {}, product: await readProduct(root).catch(() => null) });
		const reaction = classifyReaction({
			domainId: body.domainId,
			versionBefore: bump.versionBefore,
			versionAfter: bump.versionAfter,
			changedFields: (impact.changedFields || []).map((entry) => entry.id),
			intent: body.intent === 'relabel' ? 'relabel' : 'semantic',
			scope: body.scope === 'redesign' ? 'redesign' : 'local',
			usages: usagesFromImpact(impact),
		});
		let ledgerAfter = bump.ledger;
		// Only an automatic reaction re-syncs projections to the new version.
		if (reaction.reaction === 'automatic') ledgerAfter = syncProjections(ledgerAfter, body.domainId).ledger;
		await writeLedger(root, ledgerAfter);
		return { status: 200, value: { ok: true, version: bump.versionAfter, impact: reaction } };
	},

	// Explicit, deliberate domain deletion — never a side effect of a board action.
	async delete(root, body) {
		const ledger = await readLedger(root);
		const result = deleteLearningMoment(ledger, { domainId: body.domainId });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, removed: result.removed.domainId } };
	},
};

export const DOMAIN_GUIDANCE = `## Lernmoment-Bindung (pts_learning_moment)
Ein Lernmoment im Denkraum ist der kanonische pädagogische Gegenstand; eine
Whiteboard-Karte ist nur seine Darstellung. Nutze pts_learning_moment, um eine
BESTEHENDE Whiteboard-Darstellung mit einem BEREITS vorhandenen Lernmoment zu
verbinden, eine Darstellung wirklich zu verschieben, zu lösen oder eine
kanonische Änderung einzuordnen.

operation="bind": verbinde eine bestehende Karte (ref: {text} oder {id}) mit
einem vorhandenen Lernmoment (domainId, z. B. lm-danke). Frage die Lehrkraft
vorher um Zustimmung ("Soll ich die Karte mit dem Lernmoment … verbinden?").
Das erzeugt keinen neuen Lernmoment und keine neue Karte. Bei mehrdeutiger oder
fehlender Referenz wird fail-closed abgebrochen — rate nicht.

operation="create_projection": binde eine ZUSÄTZLICHE bestehende Darstellung
(neue projectionId) an denselben Lernmoment, etwa eine Karte auf einer eigenen
Arbeitsseite. Der Lernmoment muss bereits gebunden sein.

operation="move_projection": verschiebe eine Darstellung (projectionId) auf eine
andere Seite (toPage). Die Projection-Identität bleibt gleich; es entsteht keine
Kopie. Nutze das für "Verschiebe diese Darstellung in den Arbeitsraum".

operation="detach_projection": entferne die Bindung einer Darstellung. Der
Lernmoment bleibt bestehen — auch wenn es die letzte Darstellung war.

operation="update": ordne eine kanonische Änderung ein. Das Ergebnis liefert
impact.reaction:
- "automatic": reine Umbenennung/Anzeige; die Projektionen dürfen ohne Rückfrage
  aktualisiert werden. Keine Positionen oder menschlichen Zettel überschreiben.
- "confirm": die Änderung betrifft eine bekannte Darstellung. Führe KEINE
  Folgeänderung aus, bevor die Lehrkraft zugestimmt hat. Frage in natürlicher
  Sprache ("Diese Änderung betrifft auch … – soll ich sie dort übernehmen?").
- "clarify": die Folge ist unklar und möglicherweise größer. Führe KEINE
  automatische Folgeänderung aus; mache die möglichen Auswirkungen zum
  Gesprächsgegenstand.

operation="impact": reine Vorschau ohne Änderung.

Ein neuer Lernmoment aus einer rohen Whiteboard-Karte wird hier NICHT erzeugt.
Existiert kein passender kanonischer Lernmoment, melde das ehrlich und lege ihn
zuerst auf dem üblichen Weg an. Sprich mit der Lehrkraft nie über domainId,
projectionId oder Version — nur über den Lernmoment und seine Darstellungen.`;

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx) ?? agent?.session?.header?.agentPreset;
}

// Scoped, idempotent prompt guidance for the root Companion only (never a
// subagent), mirroring the renderer's system-prompt/assemble contribution.
function installDomainGuidance(ctx) {
	const agents = ctx.get('agents');
	if (!agents) return;
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = !isSubagent(agent) && composedPreset(ctx, agent) === PRESET_ID;
		if (shouldInstall && installed.get(agent) === undefined) {
			const stop = agent.ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
				const base = await next();
				const contexts = Array.isArray(base?.contexts) ? base.contexts : [];
				if (contexts.some((entry) => entry?.name === CONTEXT_NAME)) return base;
				return { ...base, contexts: [...contexts, { name: CONTEXT_NAME, text: DOMAIN_GUIDANCE }] };
			});
			ctx.effect(() => (typeof stop === 'function' ? stop : () => {}), `pts-learning-moment-binding: guidance for ${String(agent?.id)}`);
			installed.set(agent, true);
		}
		if (!shouldInstall && installed.get(agent) !== undefined) installed.delete(agent);
	};
	for (const agent of agents.list()) reconcile(agent);
	ctx.on('agent/created', ({ agent }) => reconcile(agent));
	ctx.on('agent/disposed', ({ agent }) => installed.delete(agent));
}

async function rootForExec(ctx, exec) {
	const session = exec?.agent?.session;
	if (session?.header?.cwd) return resolveDenkraumRoot(session.header.cwd);
	const sessionId = session?.id ?? exec?.agent?.id;
	const resolved = sessionId ? ctx.get('sessions')?.get?.(sessionId) : undefined;
	return resolved?.header?.cwd ? resolveDenkraumRoot(resolved.header.cwd) : null;
}

/** A stable, board-independent projection id: wb-<domainId>-<n>. */
function nextProjectionId(ledger, domainId) {
	let n = projectionsFor(ledger, domainId).length + 1;
	let candidate = `wb-${domainId}-${n}`;
	while (findProjection(ledger, candidate).length > 0) { n += 1; candidate = `wb-${domainId}-${n}`; }
	return candidate;
}

function projectResult(value, seen = new Set()) {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
	if (seen.has(value)) return undefined;
	seen.add(value);
	let result;
	if (Array.isArray(value)) result = value.map((item) => { const p = projectResult(item, seen); return p === undefined ? null : p; });
	else { result = {}; for (const key of Object.keys(value)) { const p = projectResult(value[key], seen); if (p !== undefined) result[key] = p; } }
	seen.delete(value);
	return result;
}

async function liveSnapshot(tools, exec) {
	const stateTool = tools?.get?.(STATE_TOOL);
	if (!stateTool || typeof stateTool.execute !== 'function') return { ok: false, code: 'whiteboard-unavailable' };
	const state = await stateTool.execute({}, exec);
	if (state?.live !== true || state?.available !== true || !state.snapshot) return { ok: false, code: 'whiteboard-not-live' };
	return { ok: true, snapshot: state.snapshot, stateTool };
}

async function verifyCommand(stateTool, exec, commandId, timeoutMs = 6000) {
	const deadline = Date.now() + timeoutMs;
	do {
		const latest = await stateTool.execute({}, exec);
		const results = Array.isArray(latest?.snapshot?.commandResults) ? latest.snapshot.commandResults : [];
		const hit = results.find((entry) => entry?.commandId === commandId);
		if (hit) return hit;
		if (Date.now() >= deadline) break;
		await new Promise((resolve) => setTimeout(resolve, 250));
	} while (Date.now() < deadline);
	return null;
}

// The semantic Companion façade. It owns domain authority (capture, bind,
// version, reaction) and drives the GENERIC dsh-whiteboard move seam; it never
// exposes the ledger file or the low-level board tools to the model.
function registerDomainTool(ctx) {
	const tools = ctx.get('tools');
	if (!tools || typeof tools.register !== 'function') return;

	const tool = {
		name: TOOL_NAME,
		description: 'Verbindet eine bestehende Whiteboard-Darstellung mit einem bereits vorhandenen kanonischen Lernmoment, verschiebt/löst eine Darstellung wirklich oder ordnet eine kanonische Änderung als automatic/confirm/clarify ein. Erzeugt keinen neuen Lernmoment aus einer rohen Karte und keine neue Karte. operation ∈ bind, create_projection, move_projection, detach_projection, update, impact.',
		parameters: {
			type: 'object',
			required: ['operation', 'domainId'],
			properties: {
				operation: { type: 'string', enum: ['bind', 'create_projection', 'move_projection', 'detach_projection', 'update', 'impact'] },
				domainId: { type: 'string', description: 'Kanonische Lernmoment-ID, z. B. lm-danke.' },
				ref: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, description: 'Referenz auf eine bestehende Whiteboard-Karte (für bind/create_projection).' },
				projectionId: { type: 'string' },
				page: { type: 'string' },
				toPage: { type: 'string' },
				fields: { type: 'object', description: 'Geänderte Lernmoment-Felder (für update/impact).' },
				intent: { type: 'string', enum: ['relabel', 'semantic'] },
				scope: { type: 'string', enum: ['local', 'redesign'] },
				expectedVersion: { type: 'number' },
			},
		},
		output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
		isConcurrencySafe: () => false,
		execute: async (args, exec) => {
			try {
				const root = await rootForExec(ctx, exec);
				if (!root) return { ok: false, status: 'blocked', error: { code: 'session-workspace-unavailable' } };
				const result = await runDomainOperation(ctx, tools, root, args, exec);
				return projectResult(result);
			} catch (error) {
				if (error instanceof RenderPlanError) return projectResult({ ok: false, status: 'rejected', error: { code: error.code, message: String(error.message), details: error.details ?? {} } });
				return projectResult({ ok: false, status: 'rejected', error: { code: error?.code ?? 'domain-error', message: String(error?.message ?? error) } });
			}
		},
	};
	ctx.effect(() => tools.register(tool), `tool:${TOOL_NAME}`);
}

async function runDomainOperation(ctx, tools, root, args, exec) {
	const operation = args?.operation;
	const domainId = args?.domainId;

	if (operation === 'impact') {
		const moment = await landscapeMoment(root, domainId);
		if (!moment) return { ok: false, status: 'blocked', error: { code: 'landscape-moment-required', domainId } };
		const impact = buildMomentImpact({ moment, fields: args.fields || {}, product: await readProduct(root).catch(() => null) });
		return { ok: true, operation, impact };
	}

	if (operation === 'update') {
		const { status, value } = await HANDLERS.update(root, { domainId, fields: args.fields, intent: args.intent, scope: args.scope, expectedVersion: args.expectedVersion });
		return status === 200 ? { ok: true, operation, ...value } : { ok: false, status: 'blocked', ...value };
	}

	if (operation === 'bind' || operation === 'create_projection') {
		const moment = await landscapeMoment(root, domainId);
		if (!moment) return { ok: false, status: 'blocked', error: { code: 'landscape-moment-required', domainId } };
		const live = await liveSnapshot(tools, exec);
		if (!live.ok) return { ok: false, status: 'blocked', error: { code: live.code } };
		// Fails closed on an ambiguous or missing reference (RenderPlanError).
		const shape = resolveShapeReference(args.ref ?? {}, live.snapshot);
		let ledger = await readLedger(root);
		if (operation === 'create_projection' && !findMoment(ledger, domainId)) {
			return { ok: false, status: 'blocked', error: { code: 'capture-required', message: 'Für eine zusätzliche Projektion muss der Lernmoment bereits gebunden sein.' } };
		}
		const captured = captureLearningMoment(ledger, { domainId, createdFrom: { type: 'whiteboard', sourceId: String(shape.id) }, confirmedAt: new Date().toISOString() });
		ledger = captured.ledger;
		const projectionId = nextProjectionId(ledger, domainId);
		const bound = bindProjection(ledger, { domainId, projectionId, shapeId: String(shape.id), page: typeof args.page === 'string' ? args.page : (live.snapshot.page?.name ?? null) });
		await writeLedger(root, bound.ledger);
		return { ok: true, operation, domainId, capturedNow: captured.created, projection: bound.projection };
	}

	if (operation === 'move_projection') {
		const ledger = await readLedger(root);
		const moment = findMoment(ledger, domainId);
		if (!moment) return { ok: false, status: 'blocked', error: { code: 'unknown-domain-id', domainId } };
		const projection = moment.projections.find((p) => p.projectionId === args.projectionId);
		if (!projection) return { ok: false, status: 'blocked', error: { code: 'unknown-projection', projectionId: args.projectionId } };
		if (!projection.shapeId) return { ok: false, status: 'blocked', error: { code: 'projection-has-no-board-handle', projectionId: args.projectionId } };
		const moveTool = tools?.get?.(MOVE_TOOL);
		if (!moveTool || typeof moveTool.execute !== 'function') return { ok: false, status: 'blocked', error: { code: 'move-seam-missing' } };
		const live = await liveSnapshot(tools, exec);
		if (!live.ok) return { ok: false, status: 'blocked', error: { code: live.code } };
		const queued = await moveTool.execute({ shapeId: projection.shapeId, targetPageTitle: args.toPage, commandId: undefined }, exec);
		if (!queued?.accepted || !queued.commandId) return { ok: false, status: 'blocked', error: { code: 'command-ack-unavailable' }, queued };
		const verified = await verifyCommand(live.stateTool, exec, queued.commandId);
		if (verified?.ok !== true) return { ok: false, status: verified ? 'failed' : 'pending', error: { code: verified ? 'client-move-failed' : 'whiteboard-command-timeout', message: verified?.error }, queued };
		// Only record the page change after the board confirmed the move.
		const moved = moveProjection(ledger, { domainId, projectionId: args.projectionId, toPage: args.toPage });
		await writeLedger(root, moved.ledger);
		return { ok: true, operation, status: 'verified', projection: moved.projection };
	}

	if (operation === 'detach_projection') {
		const { status, value } = await HANDLERS.detach(root, { domainId, projectionId: args.projectionId });
		return status === 200 ? { ok: true, operation, ...value } : { ok: false, status: 'blocked', ...value };
	}

	return { ok: false, status: 'rejected', error: { code: 'unknown-operation', operation } };
}

export function apply(ctx) {
	const webServer = ctx.get('webServer');
	const sessions = ctx.get('sessions');
	if (!webServer || !sessions) return;

	installDomainGuidance(ctx);
	registerDomainTool(ctx);

	const disposeMutations = webServer.register({
		kind: 'prefix', path: '/api/pts-learning-moment/',
		handler: async (req, res) => {
			try {
				if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
				const action = new URL(req.url, 'http://pts.local').pathname.split('/').filter(Boolean).pop();
				const handler = HANDLERS[action];
				if (!handler) return send(res, 404, { error: 'unknown action' });
				const body = await readRequestJson(req);
				const root = await rootFor(ctx, body.sessionId);
				if (!root) return send(res, 404, { error: 'session not found' });
				const { status, value } = await handler(root, body);
				return send(res, status, value);
			} catch (error) {
				return send(res, 400, { error: error.message, code: error.code });
			}
		},
	});

	// Read-only debug view: domainId/projectionId/version are developer data,
	// not part of the normal teacher interface.
	const disposeView = webServer.register({
		kind: 'exact', path: '/api/pts-learning-moment',
		handler: async (req, res) => {
			try {
				if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
				const args = Object.fromEntries(new URL(req.url, 'http://pts.local').searchParams);
				const root = await rootFor(ctx, args.sessionId);
				if (!root) return send(res, 404, { error: 'session not found' });
				const ledger = await readLedger(root);
				const moments = ledger.moments.map((moment) => ({
					...moment,
					staleProjections: moment.projections.filter((p) => isStaleProjection(ledger, moment.domainId, p.projectionId)).map((p) => p.projectionId),
				}));
				return send(res, 200, { ok: true, moments });
			} catch (error) {
				return send(res, 400, { error: error.message });
			}
		},
	});

	ctx.effect(() => () => { disposeMutations(); disposeView(); }, 'pts-learning-moment-binding: domain write-seam and debug view');
}

export { findMoment, projectionsFor, runDomainOperation, nextProjectionId, TOOL_NAME };
