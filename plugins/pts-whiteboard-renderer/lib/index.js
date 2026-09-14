import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { designAndCompile, rendererCapabilities } from './renderer.mjs';

export const name = 'pts-whiteboard-renderer';
export const inject = ['webServer', 'agents'];

const TOOL_NAME = 'pts_whiteboard_render';
const STATE_TOOL = 'whiteboard_state';
const OPEN_TOOL = 'whiteboard_request_open';
const LOW_LEVEL_TOOL = 'whiteboard_render_plan';
const MAX_BODY = 256 * 1024;
const PRESET_ID = 'pts-companion';
const CONTEXT_NAME = 'pts:whiteboard-render-plan';

export const RENDER_PLAN_GUIDANCE = `## Whiteboard-Ausfuehrung (pts_whiteboard_render)
Wenn eine Idee aus dem Gespraech auf das Whiteboard soll, fuehre genau einen
Aufruf von pts_whiteboard_render mit einem vollstaendigen RenderPlan aus. Nutze
keine Whiteboard-Primitiven und erfinde keine Operationen.

Erlaubte operation-Werte sind: create_learning_moment_workspace,
update_learning_moment_workspace, materialize_selection oder
compact_document_reference. page.action ist ensure oder use_current. Ein
minimaler gueltiger Auftrag sieht so aus:
{"operation":"create_learning_moment_workspace","page":{"action":"ensure","title":"Erntedank – Brainstorming"},"heading":{"text":"Erntedank – erste Ideen"},"layout":{"template":"learning_moment_workspace"},"elements":[{"key":"dankbar","source":"new","role":"open_question","text":"Wofuer sind wir dankbar?"},{"key":"feld-tisch","source":"new","role":"method_idea","text":"Vom Feld auf den Tisch"}],"links":[]}

Erweitern statt ersetzen: Ein Plan mit page.action="use_current" und demselben
heading.text wie ein bereits vorhandener Rahmen ersetzt genau diesen Arbeitsraum
(Aktualisierung). Ein NEUER heading.text auf derselben Seite legt einen ZWEITEN
Rahmen unter dem bestehenden an und laesst vorhandene Inhalte, menschliche Zettel
und Pfeile unangetastet. Fuer einen ganz neuen Ort nutze page.action="ensure" mit
neuem title (neue Seite). Waehle bewusst: gleicher Titel = aktualisieren; neuer
Titel = daneben erweitern; ensure = neue Seite. Willst du neuen Inhalt mit einem
vorhandenen Zettel verknuepfen, nimm diesen Zettel als source="existing" mit
seiner ref in denselben Plan und setze einen links-Eintrag zwischen den keys.

Operationen: create_learning_moment_workspace fuer einen neuen Arbeitsraum,
update_learning_moment_workspace fuer das Aktualisieren desselben (gleicher
Titel), materialize_selection um eine bestehende Auswahl in einen neuen
Arbeitsraum zu ueberfuehren (das Original bleibt erhalten),
compact_document_reference fuer eine kompakte Dokumentkarte.

Fuer jedes neue Brainstorming-Element gilt: source="new" und text enthaelt
den exakten Inhalt der Lehrkraft. role ist optional: Ohne role entsteht eine
neutrale Karte. role="open_question", role="method_idea" und
role="learning_moment" steuern nur die Darstellung; sie duerfen weder Icon
noch Kategorie-Text vor elements[].text setzen. heading.text ist ausschliesslich
der Frame-Titel und darf niemals den Inhalt von elements[].text ersetzen.
Soll ein alter Agenten-Zettel mit einem solchen Kategorie-Praefix bereinigt
werden, verwende source="existing", seine exakte ref und die passende role;
der Renderer ersetzt ausschliesslich seinen eigenen Treffer durch den Text ohne
Praefix. Menschliche Zettel werden dabei nicht veraendert.

Freitext ohne Zettel wird ausschliesslich als source="new",
role="free_text" und text verwendet. Er ist fuer kurze Ueberschriften,
Achsenbeschriftungen oder Erlaeuterungen gedacht und wird als neutrale
Text-Shape gerendert; bestehende Zettel, Materialien und Dokumente duerfen
nicht als Freitext umgedeutet werden.

Verfuegbare layout.template-Werte: learning_moment_workspace, comparison,
pro_con, cause_effect, sequence, cluster, matrix und timeline. comparison,
pro_con und cause_effect lesen die Elemente paarweise von links nach rechts;
sequence und timeline lesen sie in zeitlicher Reihenfolge. Fuer eine gewuenschte
Darstellung ausserhalb dieser Liste benenne die Grenze ehrlich statt einen neuen
Board-Skill zu behaupten.

Nicht verwenden: operation="create", type="card", body oder overview.enabled.
Freitext ist nur als role="free_text" innerhalb eines vollstaendigen
RenderPlans erlaubt. overview darf nur mit
action="ensure_navigation_reference" angegeben werden. status="verified" bedeutet,
dass der Browser die Command-ID bestaetigt und einen neuen Board-Snapshot geliefert
hat. Bei status="pending" oder "failed" musst du whiteboard_state lesen, die Ursache
pruefen und den semantischen Auftrag begrenzt erneut ausfuehren; behaupte niemals eine
sichtbare Aenderung ohne verified.`;

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx) ?? agent?.session?.header?.agentPreset;
}

function installPromptGuidance(ctx) {
	const agents = ctx.get('agents');
	if (!agents) return;
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = !isSubagent(agent) && composedPreset(ctx, agent) === PRESET_ID;
		const current = installed.get(agent);
		if (shouldInstall && current === undefined) {
			const stop = agent.ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
				const base = await next();
				const contexts = Array.isArray(base?.contexts) ? base.contexts : [];
				if (contexts.some((entry) => entry?.name === CONTEXT_NAME)) return base;
				return { ...base, contexts: [...contexts, { name: CONTEXT_NAME, text: RENDER_PLAN_GUIDANCE }] };
			});
			ctx.effect(() => (typeof stop === 'function' ? stop : () => {}), `pts-whiteboard-renderer: guidance for ${String(agent?.id)}`);
			installed.set(agent, true);
		}
		if (!shouldInstall && current !== undefined) installed.delete(agent);
	};
	for (const agent of agents.list()) reconcile(agent);
	ctx.on('agent/created', ({ agent }) => reconcile(agent));
	ctx.on('agent/disposed', ({ agent }) => installed.delete(agent));
}

function jsonRender(_args, value) {
	return [{ type: 'text', text: JSON.stringify(value) }];
}

// DSH validates tool results as lossless JSON before handing them to the
// model. Plans are assembled from optional request fields and may contain
// objects created by another runtime layer, so project the public result to a
// fresh, bounded plain-JSON graph instead of returning internal objects.
function lossless(value, seen = new Set()) {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : null;
	if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
	if (seen.has(value)) throw new TypeError('cyclic tool result');
	seen.add(value);
	let result;
	if (Array.isArray(value)) {
		result = value.map((item) => {
			const projected = lossless(item, seen);
			return projected === undefined ? null : projected;
		});
	} else {
		result = {};
		for (const key of Object.keys(value)) {
			const projected = lossless(value[key], seen);
			if (projected !== undefined) result[key] = projected;
		}
	}
	seen.delete(value);
	return result;
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCommandResult(stateTool, exec, commandId, timeoutMs = 6000) {
	const deadline = Date.now() + timeoutMs;
	let latest;
	do {
		latest = await stateTool.execute({}, exec);
		const results = Array.isArray(latest?.snapshot?.commandResults) ? latest.snapshot.commandResults : [];
		const result = results.find((entry) => entry?.commandId === commandId);
		if (result) return { state: latest, result };
		if (Date.now() >= deadline) break;
		await delay(250);
	} while (Date.now() < deadline);
	return { state: latest, result: null };
}

async function liveSnapshotOrRequestOpen(stateTool, openTool, exec) {
	let result = await stateTool.execute({}, exec);
	if (result?.live === true && result?.available === true && result.snapshot) return result;

	// The browser opener lives in the shell overlay, so it can only react to a
	// host-side request. Do this before returning "not live": otherwise the
	// Companion can never open the board that it needs for its own render.
	if (!openTool || typeof openTool.execute !== 'function') return result;
	await openTool.execute({}, exec);

	// Opening the sidebar and posting its first snapshot are asynchronous. Wait
	// briefly, bounded, and re-read the session-scoped state. A closed or
	// disconnected browser still fails closed after the timeout.
	const deadline = Date.now() + 8000;
	do {
		await delay(250);
		result = await stateTool.execute({}, exec);
		if (result?.live === true && result?.available === true && result.snapshot) return result;
	} while (Date.now() < deadline);
	return result;
}

function workspaceFor(ctx, sessionId) {
	const session = sessionId ? ctx.get('sessions')?.get?.(sessionId) : undefined;
	return session?.header?.cwd ?? ctx.get('sandboxPolicy')?.workspaceRoot ?? process.cwd();
}

function safeRelative(root, candidate) {
	const absoluteRoot = path.resolve(root);
	const absolute = path.resolve(absoluteRoot, candidate);
	const relative = path.relative(absoluteRoot, absolute);
	if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
	return absolute;
}

function resourceMime(file) {
	const ext = path.extname(file).toLocaleLowerCase();
	return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })[ext] ?? null;
}

async function readBody(req) {
	return await new Promise((resolve, reject) => {
		let data = '';
		req.on('data', (chunk) => {
			data += chunk;
			if (data.length > MAX_BODY) reject(new Error('body too large'));
		});
		req.on('end', () => {
			try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
		});
		req.on('error', reject);
	});
}

function response(res, status, value, headers = {}) {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
	res.end(JSON.stringify(value));
}

function toolsVisible(ctx) {
	const tools = ctx.get('tools');
	return ['whiteboard_state', LOW_LEVEL_TOOL].filter((name) => tools?.get?.(name) !== undefined);
}

function decorateResourceLinks(plan) {
	return {
		...plan,
		elements: plan.elements.map((element) => {
			if (element.source === 'material' && element.material?.path && !element.material.href) {
				return { ...element, material: { ...element.material, href: `/pts-whiteboard-renderer/resource?path=${encodeURIComponent(element.material.path)}` } };
			}
			if (element.source === 'document' && element.document?.path && !element.document.href) {
				return { ...element, document: { ...element.document, href: `/pts-whiteboard-renderer/resource?path=${encodeURIComponent(element.document.path)}` } };
			}
			return element;
		}),
	};
}

export function apply(ctx) {
	installPromptGuidance(ctx);
	const webServer = ctx.get('webServer');
	const tools = ctx.get('tools');
	if (!webServer || !tools) {
		console.error('[pts-whiteboard-renderer] webServer oder tools fehlt');
		return;
	}

	const resourceRoute = webServer.register({
		kind: 'prefix', path: '/pts-whiteboard-renderer/resource',
		handler(req, res) {
			const sessionId = req.headers?.['x-dsh-session-id'] ? String(req.headers['x-dsh-session-id']) : null;
			try {
				const url = new URL(req.url ?? '/', 'http://localhost');
				const relative = url.searchParams.get('path');
				const requestSessionId = sessionId ?? url.searchParams.get('session');
				const file = relative ? safeRelative(workspaceFor(ctx, requestSessionId), relative) : null;
				const mime = file ? resourceMime(file) : null;
				if (!file || !mime) return response(res, 400, { ok: false, error: 'unsupported-resource' });
				return fsp.stat(file).then((stat) => {
					if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return response(res, 413, { ok: false, error: 'resource-limit' });
					return fsp.readFile(file).then((body) => { res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox" }); res.end(body); });
				}).catch(() => response(res, 404, { ok: false, error: 'resource-not-found' }));
			} catch { return response(res, 400, { ok: false, error: 'bad-resource-request' }); }
		},
	});
	ctx.effect(() => resourceRoute, 'pts-whiteboard-renderer:resource');

	const renderTool = {
		name: TOOL_NAME,
		description: 'Fuehrt genau einen vollstaendigen semantischen Phase-1-RenderPlan aus. Uebergib operation, page, layout und elements direkt als Felder (kein description/prompt). Ein neuer heading.text auf derselben Seite erweitert das Board um einen zweiten Rahmen; derselbe Titel ersetzt den vorhandenen Arbeitsraum. Neue Karten duerfen ohne role als neutrale Zettel erscheinen; optionale Rollen steuern nur die Darstellung und schreiben keinen Kategorie-Praefix in elements[].text. Der Inhalt muss in elements[].text stehen; heading.text ist nur der Frame-Titel. Keine type=card/body/operation=create und keine Whiteboard-Primitiven. Keine LearningMoment-Domainpersistenz.',
		parameters: {
			type: 'object',
			required: ['operation', 'page', 'layout', 'elements'],
			properties: {
				operation: { type: 'string', enum: ['create_learning_moment_workspace', 'update_learning_moment_workspace', 'materialize_selection', 'compact_document_reference'] },
				page: { type: 'object', required: ['action', 'title'], properties: { action: { type: 'string', enum: ['ensure', 'use_current'] }, title: { type: 'string', minLength: 1, maxLength: 120 } } },
				heading: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 600 } } },
				layout: { type: 'object', required: ['template'], properties: { template: { type: 'string', enum: ['learning_moment_workspace', 'comparison', 'pro_con', 'cause_effect', 'sequence', 'cluster', 'matrix', 'timeline'] } } },
				elements: { type: 'array', maxItems: 40, items: { type: 'object', required: ['source'], properties: { key: { type: 'string' }, source: { type: 'string', enum: ['existing', 'new', 'material', 'document'] }, role: { type: 'string', enum: ['note', 'learning_moment', 'method_idea', 'open_question', 'document_reference', 'material_reference', 'page_reference', 'free_text'] }, ref: { type: 'object' }, text: { type: 'string', maxLength: 600 }, document: { type: 'object' }, material: { type: 'object' } } } },
				links: { type: 'array' },
				overview: { type: 'object' },
				detach: { type: 'array' },
			},
		},
		output: { schema: { type: 'object', additionalProperties: true }, render: jsonRender },
		isConcurrencySafe: () => false,
		execute: async (request, exec) => {
			const stateTool = tools.get(STATE_TOOL);
			if (!stateTool || typeof stateTool.execute !== 'function') return { ok: false, status: 'blocked', error: { code: 'whiteboard-unavailable', message: 'whiteboard_state ist nicht verfügbar' } };
			const snapshotResult = await liveSnapshotOrRequestOpen(stateTool, tools.get(OPEN_TOOL), exec);
			if (snapshotResult?.live !== true || snapshotResult?.available !== true || !snapshotResult.snapshot) return { ok: false, status: 'blocked', error: { code: 'whiteboard-not-live', message: 'Whiteboard-Tab muss geöffnet sein' } };
			const capabilities = rendererCapabilities(toolsVisible(ctx));
			try {
				const { plan: designedPlan } = await designAndCompile(request, snapshotResult.snapshot, capabilities);
				const plan = decorateResourceLinks(designedPlan);
				const { command } = await designAndCompile({ renderPlan: plan }, snapshotResult.snapshot, capabilities);
				const lowLevel = tools.get(LOW_LEVEL_TOOL);
				if (!lowLevel || typeof lowLevel.execute !== 'function') return { ok: false, status: 'blocked', plan, error: { code: 'capability-missing', message: 'Generischer dsh-whiteboard Render-Plan-Seam fehlt', capabilities } };
				let queued;
				let verification;
				let attempts = 0;
				for (; attempts < 2; attempts++) {
					queued = await lowLevel.execute(command, exec);
					if (!queued?.accepted || !queued.commandId) {
						return { ok: false, status: 'blocked', plan, queued, error: { code: 'command-ack-unavailable', message: 'Generischer Render-Seam liefert keine bestaetigbare Command-ID' }, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: attempts + 1, subagentTurns: 0 } };
					}
					verification = await waitForCommandResult(stateTool, exec, queued.commandId);
					if (verification.result?.ok === true) break;
					// Re-submit the same idempotency key once. The generic client
					// ignores a command it already applied, can execute it if the
					// first event was lost during startup, and gets one chance to
					// recover from a transient client-side execution failure.
					command.commandId = queued.commandId;
				}
				if (verification?.result?.ok === true) {
					return lossless({ ok: true, status: 'verified', renderer: 'deterministic', designer: plan.designer, plan, queued, verification: verification.result, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: attempts, subagentTurns: 0 } });
				}
				if (verification?.result && verification.result.ok === false) {
					return lossless({ ok: false, status: 'failed', plan, queued, error: { code: 'client-command-failed', message: verification.result.error || 'Browser konnte den Render-Auftrag nicht ausfuehren' }, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: attempts, subagentTurns: 0 } });
				}
				return lossless({ ok: false, status: 'pending', plan, queued, error: { code: 'whiteboard-command-timeout', message: 'Browser-Ack und Folge-Snapshot blieben aus; der Auftrag ist nicht sichtbar bestaetigt' }, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: attempts, subagentTurns: 0 } });
			} catch (error) {
				return lossless({ ok: false, status: 'rejected', error: { code: error.code ?? 'render-plan-error', message: String(error?.message ?? error ?? 'Render-Plan abgelehnt'), details: error.details ?? {} }, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: 0, subagentTurns: 0 } });
			}
		},
	};
	ctx.effect(() => tools.register(renderTool), `tool:${TOOL_NAME}`);
	console.log('[pts-whiteboard-renderer] Phase-1 seam bereit (wartet auf generischen dsh-whiteboard Render-Plan-Seam)');
}
