import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { designAndCompile, rendererCapabilities } from './renderer.mjs';

export const name = 'pts-whiteboard-renderer';
export const inject = ['webServer'];

const TOOL_NAME = 'pts_whiteboard_render';
const STATE_TOOL = 'whiteboard_state';
const LOW_LEVEL_TOOL = 'whiteboard_render_plan';
const MAX_BODY = 256 * 1024;

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

function sessionIdFrom(exec) {
	return exec?.agent?.id ? String(exec.agent.id) : null;
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

function decorateResourceLinks(plan, sessionId) {
	return {
		...plan,
		elements: plan.elements.map((element) => {
			if (element.source === 'material' && element.material?.path && !element.material.href) {
				return { ...element, material: { ...element.material, href: `/pts-whiteboard-renderer/resource?session=${encodeURIComponent(sessionId ?? '')}&path=${encodeURIComponent(element.material.path)}` } };
			}
			if (element.source === 'document' && element.document?.path && !element.document.href) {
				return { ...element, document: { ...element.document, href: `/pts-whiteboard-renderer/resource?session=${encodeURIComponent(sessionId ?? '')}&path=${encodeURIComponent(element.document.path)}` } };
			}
			return element;
		}),
	};
}

export function apply(ctx) {
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
		description: 'Semantic Phase-1 Whiteboard-Auftrag: interpretiert einen semantischen Auftrag, validiert einen strukturierten RenderPlan und delegiert ihn als einen gemeinsamen Auftrag an den deterministischen Whiteboard-Renderer. Keine LearningMoment-Domainpersistenz.',
		parameters: { type: 'object', properties: { operation: { type: 'string' }, page: { type: 'object' }, heading: { type: 'object' }, layout: { type: 'object' }, elements: { type: 'array' }, links: { type: 'array' }, overview: { type: 'object' }, detach: { type: 'array' }, renderPlan: { type: 'object' } } },
		output: { schema: { type: 'object', additionalProperties: true }, render: jsonRender },
		isConcurrencySafe: () => false,
		execute: async (request, exec) => {
			const stateTool = tools.get(STATE_TOOL);
			if (!stateTool || typeof stateTool.execute !== 'function') return { ok: false, status: 'blocked', error: { code: 'whiteboard-unavailable', message: 'whiteboard_state ist nicht verfügbar' } };
			const snapshotResult = await stateTool.execute({}, exec);
			if (snapshotResult?.live !== true || snapshotResult?.available !== true || !snapshotResult.snapshot) return { ok: false, status: 'blocked', error: { code: 'whiteboard-not-live', message: 'Whiteboard-Tab muss geöffnet sein' } };
			const capabilities = rendererCapabilities(toolsVisible(ctx));
			try {
				const { plan: designedPlan } = await designAndCompile(request, snapshotResult.snapshot, capabilities);
				const plan = decorateResourceLinks(designedPlan, sessionIdFrom(exec));
				const { command } = await designAndCompile({ renderPlan: plan }, snapshotResult.snapshot, capabilities);
				const lowLevel = tools.get(LOW_LEVEL_TOOL);
				if (!lowLevel || typeof lowLevel.execute !== 'function') return { ok: false, status: 'blocked', plan, error: { code: 'capability-missing', message: 'Generischer dsh-whiteboard Render-Plan-Seam fehlt', capabilities } };
				const queued = await lowLevel.execute(command, exec);
				return lossless({ ok: true, status: 'queued', renderer: 'deterministic', designer: plan.designer, plan, queued, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: 1, subagentTurns: 0 } });
			} catch (error) {
				return { ok: false, status: 'rejected', error: { code: error.code ?? 'render-plan-error', message: error.message, details: error.details ?? {} }, metrics: { visibleToolCalls: 1, stateQueries: 1, lowLevelOperations: 0, subagentTurns: 0 } };
			}
		},
	};
	ctx.effect(() => tools.register(renderTool), `tool:${TOOL_NAME}`);
	console.log('[pts-whiteboard-renderer] Phase-1 seam bereit (wartet auf generischen dsh-whiteboard Render-Plan-Seam)');
}
