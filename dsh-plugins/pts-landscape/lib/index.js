// pts-landscape — host half.
//
// Two route families over the current Denkraum (workspace of the session):
//
//   GET  /api/pts-landscape?sessionId=<id>
//        -> JSON { root, title, structure, moments, transitions, layout,
//                  temporal, decisions, errors }
//   POST /api/pts-landscape/layout   body { sessionId, layout }
//        -> writes learning-landscape.layout.json (positions only)
//   GET  /api/pts-landscape/materials?sessionId=<id>
//        -> { materials: [relative paths under materials/ and rendered/] }
//   POST /api/pts-landscape/materials body { sessionId, momentId, materials }
//        -> writes `- Materialien: [...]` into the moment block
//   POST /api/pts-landscape/temporal  body { sessionId, title, windows, placements }
//        -> validates + serializes the complete timeline into temporal-plan.yml
//   GET  /api/pts-artifact/raw?sessionId=&file=  (editor read)
//   POST /api/pts-artifact/save      body { sessionId, file, content }
//        -> atomic write of a teacher-edited md/yml/json/txt file inside the
//           Denkraum, with the same hard path boundary as pts-workspaces
//
// No external YAML dependency: the compact parser covers the subset the PTS
// schema files actually use (see pts-denkstand for the same approach).
// The workspace root is resolved per request from the session header cwd.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { registerProductRoutes } from './product-routes.mjs';
import { readProduct, productTemporal, PRODUCT_FILE } from '../../../dsh-presets/pts-companion/teaching-product.mjs';

export const inject = ['webServer'];

const ALLOWED_SAVE_EXT = new Set(['.md', '.yml', '.yaml', '.json', '.txt', '.html', '.htm']);
const MAX_SAVE_BYTES = 512 * 1024;
const LANDSCAPE_FILE = 'learning-landscape.md';
const LAYOUT_FILE = 'learning-landscape.layout.json';
const TEMPORAL_FILE = 'temporal-plan.yml';
const DECISIONS_FILE = 'decisions.yml';

// ————————————————————————————————————————————————
// Minimal YAML parser (PTS subset; identical contract to pts-denkstand)
// ————————————————————————————————————————————————

import { parseYaml, parseLandscape, parseLayout, parseTemporal, parseDecisions, parseMaterialMeta, serializeTemporal, validateTemporalInput, setMomentEstimate, addTransition, removeTransition, updateMoment, setMomentMaterials } from '../../../dsh-presets/pts-companion/workspace-parsers.mjs';
export { parseYaml, parseLandscape, parseLayout, parseTemporal, parseDecisions, parseMaterialMeta, serializeTemporal, validateTemporalInput, setMomentEstimate, addTransition, removeTransition, updateMoment, setMomentMaterials };

function toPosix(p) {
	return String(p).split(path.sep).join('/');
}

function sendJson(res, status, obj) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(JSON.stringify(obj));
}

function isContained(rootReal, targetReal) {
	const rel = path.relative(rootReal, targetReal);
	return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Atomic write inside dir (temp file + rename), local route safety. */
export async function atomicWriteFile(dir, name, content) {
	const tmp = path.join(dir, `.${name}.pts-landscape-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, content, 'utf8');
	try {
		await fsp.rename(tmp, path.join(dir, name));
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}

/**
 * Resolve a teacher-supplied relative file against the workspace with a hard
 * boundary: the parent directory must exist and resolve inside the workspace,
 * the extension must be allowed, and the content size must be bounded.
 */
export async function resolveWorkspaceFile(workspaceDir, file, byteLength) {
	const rel = String(file ?? '').replace(/\\/g, '/').trim();
	if (rel === '' || rel.includes('..') || path.isAbsolute(rel)) return { ok: false, reason: 'outside' };
	if (byteLength > MAX_SAVE_BYTES) return { ok: false, reason: 'too-large' };
	const target = path.resolve(workspaceDir, rel);
	const ext = path.extname(target).toLowerCase();
	if (!ALLOWED_SAVE_EXT.has(ext)) return { ok: false, reason: 'extension-not-allowed' };
	const parentReal = await fsp.realpath(path.dirname(target)).catch(() => null);
	if (parentReal === null || !isContained(workspaceDir, parentReal)) return { ok: false, reason: 'outside' };
	return { ok: true, target: path.join(parentReal, path.basename(target)) };
}

// ————————————————————————————————————————————————
// Plugin entry
// ————————————————————————————————————————————————

export function apply(ctx) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined) {
		console.error('[pts-landscape] webServer service missing - plugin inactive');
		return;
	}
	const sessionsStore = ctx.get('sessions');
	registerProductRoutes(ctx);
	const policy = ctx.get('sandboxPolicy');
	const fallbackRoot = policy !== undefined && typeof policy.workspaceRoot === 'string'
		? policy.workspaceRoot
		: process.cwd();

	function sessionWorkspace(sessionId) {
		if (typeof sessionId !== 'string' || sessionId === '' || sessionsStore === undefined) return null;
		try {
			const session = sessionsStore.get(sessionId);
			const header = session !== undefined && session !== null ? session.header : undefined;
			if (header !== undefined && header !== null && typeof header.cwd === 'string' && header.cwd.trim() !== '') {
				return header.cwd;
			}
		} catch {
			// live data guard
		}
		return null;
	}

	async function readWorkspaceFile(base, relName) {
		try {
			const abs = path.resolve(base, relName);
			const stat = await fsp.stat(abs).catch(() => null);
			if (stat === null || !stat.isFile()) return { ok: false, missing: true };
			const raw = await fsp.readFile(abs, 'utf8');
			return { ok: true, raw };
		} catch (e) {
			return { ok: false, error: String(e && e.message ? e.message : e) };
		}
	}

	function readBody(req) {
		return new Promise((resolve, reject) => {
			const chunks = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			req.on('error', reject);
		});
	}

	// — GET /api/pts-landscape
	const disposeGet = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape',
		handler: async (req, res) => {
			try {
				const rawUrl = typeof req.url === 'string' ? req.url : '';
				const qIndex = rawUrl.indexOf('?');
				const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
				let sessionId = '';
				for (const part of query.split('&')) {
					const eq = part.indexOf('=');
					if (eq <= 0) continue;
					const key = part.slice(0, eq);
					const value = decodeURIComponent(part.slice(eq + 1));
					if (key === 'sessionId') sessionId = value;
				}

				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const result = {
					root: toPosix(base),
					title: '',
					structure: '',
					moments: [],
					transitions: [],
					layout: { positions: {} },
					temporal: null,
					decisions: null,
					errors: [],
				};

				const landscape = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (landscape.ok) {
					try {
						const parsed = parseLandscape(landscape.raw);
						result.title = typeof parsed.front.title === 'string' ? parsed.front.title : '';
						result.structure = typeof parsed.front.structure === 'string' ? parsed.front.structure : '';
						result.moments = parsed.moments;
						result.transitions = parsed.transitions;
					} catch (e) {
						result.errors.push({ file: LANDSCAPE_FILE, message: 'Landscape-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) });
					}
				} else if (landscape.missing) {
					result.errors.push({ file: LANDSCAPE_FILE, message: 'learning-landscape.md fehlt im Denkraum.' });
				}

				const layout = await readWorkspaceFile(base, LAYOUT_FILE);
				if (layout.ok) {
					try { result.layout = parseLayout(layout.raw); }
					catch { result.layout = { positions: {} }; }
				}

				const temporal = await readWorkspaceFile(base, TEMPORAL_FILE);
				if (temporal.ok) {
					try { result.temporal = parseTemporal(temporal.raw); }
					catch (e) { result.errors.push({ file: TEMPORAL_FILE, message: 'YAML-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) }); }
				}

				const decisions = await readWorkspaceFile(base, DECISIONS_FILE);
				if (decisions.ok) {
					try { result.decisions = parseDecisions(decisions.raw); }
					catch (e) { result.errors.push({ file: DECISIONS_FILE, message: 'YAML-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) }); }
				}

				try {
					const product = await readProduct(base);
					if (product) { result.temporal = productTemporal(product); result.productRevision = product.revision; }
				} catch (e) { result.errors.push({ file: PRODUCT_FILE, message: e.message }); result.temporal = null; }
				sendJson(res, 200, result);
			} catch (e) {
				sendJson(res, 500, { error: 'internal' });
			}
		},
	});

	// — POST /api/pts-landscape/layout (positions only, no semantic change)
	const disposeLayout = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/layout',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const layout = body.layout;
				if (layout === null || typeof layout !== 'object') {
					sendJson(res, 400, { ok: false, error: 'layout fehlt' });
					return;
				}
				const payload = { schema: 'ptspace.learning-landscape.layout/v1', positions: layout.positions ?? layout, groups: Array.isArray(layout.groups) ? layout.groups : [] };
				await atomicWriteFile(base, LAYOUT_FILE, JSON.stringify(payload, null, 2) + '\n');
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	async function listFilesUnder(baseDir, maxDepth) {
		const out = [];
		async function walk(dir, depth) {
			if (depth > maxDepth) return;
			let entries;
			try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
			for (const e of entries) {
				const name = e.name;
				if (name.startsWith('.') || name.endsWith('.tmp')) continue;
				const abs = path.join(dir, name);
				if (e.isDirectory()) await walk(abs, depth + 1);
				else if (e.isFile()) out.push(toPosix(path.relative(baseDir, abs)));
			}
		}
		await walk(baseDir, 0);
		return out.sort();
	}

	// — /api/pts-landscape/materials (GET: list files for assignment;
	//   POST: assign material ids to a moment). One exact route, dispatched by
	//   method — the web server rejects duplicate exact paths.
	const disposeMaterials = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/materials',
		handler: async (req, res) => {
			try {
				const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
				if (method === 'GET') {
					const rawUrl = typeof req.url === 'string' ? req.url : '';
					const qIndex = rawUrl.indexOf('?');
					const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
					let sessionId = '';
					for (const part of query.split('&')) {
						const eq = part.indexOf('=');
						if (eq <= 0) continue;
						const key = part.slice(0, eq);
						const value = decodeURIComponent(part.slice(eq + 1));
						if (key === 'sessionId') sessionId = value;
					}
					const base = sessionWorkspace(sessionId) ?? fallbackRoot;
					const materials = [];
					for (const sub of ['materials', 'rendered']) {
						const dir = path.join(base, sub);
						const stat = await fsp.stat(dir).catch(() => null);
						if (stat === null || !stat.isDirectory()) continue;
						const files = await listFilesUnder(dir, 5);
						for (const f of files) {
							let meta = null;
							if (f.endsWith('.md')) {
								const content = await fsp.readFile(path.join(base, sub, f), 'utf8').catch(() => '');
								meta = parseMaterialMeta(content);
							}
							// workspace-relative path so /api/pts-artifact/raw|save
							// can resolve it against the Denkraum root.
							materials.push({ path: toPosix(path.relative(base, path.join(base, sub, f))), meta: meta });
						}
					}
					sendJson(res, 200, { materials });
					return;
				}
				if (method === 'POST') {
					const body = JSON.parse(await readBody(req) || '{}');
					const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
					const momentId = typeof body.momentId === 'string' ? body.momentId : '';
					const materials = Array.isArray(body.materials) ? body.materials : [];
					const base = sessionWorkspace(sessionId) ?? fallbackRoot;
					const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
					if (!file.ok || file.missing) {
						sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
						return;
					}
					const r = setMomentMaterials(file.raw, momentId, materials);
					if (!r.ok) {
						sendJson(res, 400, { ok: false, error: r.reason === 'unknown-moment-id' ? 'Lernmoment nicht gefunden' : 'Datei fehlt' });
						return;
					}
					await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
					sendJson(res, 200, { ok: true });
					return;
				}
				sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt' });
			} catch (e) {
				sendJson(res, method === 'POST' ? 400 : 500, { ok: false, error: method === 'POST' ? String(e && e.message ? e.message : e) : 'internal' });
			}
		},
	});

	// — POST /api/pts-landscape/moment-estimate (teacher time estimate per moment)
	const disposeEstimate = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/moment-estimate',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const momentId = typeof body.momentId === 'string' ? body.momentId : '';
				const minutes = body.minutes;
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (!file.ok || file.missing) {
					sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
					return;
				}
				const r = setMomentEstimate(file.raw, momentId, minutes);
				if (!r.ok) {
					sendJson(res, 400, { ok: false, error: r.reason === 'unknown-moment-id' ? 'Lernmoment nicht gefunden' : 'Datei fehlt' });
					return;
				}
				await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — POST /api/pts-landscape/moment (structured update of one moment)
	const disposeMoment = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/moment',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const momentId = typeof body.momentId === 'string' ? body.momentId : '';
				const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (!file.ok || file.missing) {
					sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
					return;
				}
				const r = updateMoment(file.raw, momentId, fields);
				if (!r.ok) {
					sendJson(res, 400, { ok: false, error: r.reason === 'unknown-moment-id' ? 'Lernmoment nicht gefunden' : 'Datei fehlt' });
					return;
				}
				await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — POST /api/pts-landscape/transitions (create a teacher transition)
	const disposeTransitions = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/transitions',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (!file.ok || file.missing) {
					sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
					return;
				}
				const r = addTransition(file.raw, { from: body.from, to: body.to, type: body.type, rationale: body.rationale });
				if (!r.ok) {
					sendJson(res, 400, { ok: false, error: r.reason === 'invalid-transition' ? 'Übergang braucht zwei verschiedene Lernmomente' : (r.reason === 'invalid-type' ? 'Übergangstyp unzulässig' : 'Datei fehlt') });
					return;
				}
				await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — POST /api/pts-landscape/transitions/remove (delete a transition)
	const disposeTransitionsRemove = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/transitions/remove',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const id = typeof body.id === 'string' ? body.id : '';
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (!file.ok || file.missing) {
					sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
					return;
				}
				const r = removeTransition(file.raw, id);
				if (!r.ok) {
					sendJson(res, 400, { ok: false, error: r.reason === 'unknown-transition-id' ? 'Übergang nicht gefunden' : 'Datei fehlt' });
					return;
				}
				await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — POST /api/pts-landscape/temporal (full validated timeline write)
	const disposeTemporal = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/temporal',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				if (await readProduct(base)) { sendJson(res, 409, { error: 'Zeitplanung wurde migriert; Unterrichtsreihe verwenden.' }); return; }
				const errors = validateTemporalInput({
					title: body.title,
					windows: body.windows,
					placements: body.placements,
				});
				if (errors.length > 0) {
					sendJson(res, 400, { ok: false, error: errors.slice(0, 5).join('; ') });
					return;
				}
				const yaml = serializeTemporal({
					title: body.title,
					windows: body.windows,
					placements: body.placements,
				});
				await atomicWriteFile(base, TEMPORAL_FILE, yaml);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — GET /api/pts-artifact/raw (read a file for the editor; boundary-checked)
	const disposeRaw = webServer.register({
		kind: 'exact',
		path: '/api/pts-artifact/raw',
		handler: async (req, res) => {
			try {
				const rawUrl = typeof req.url === 'string' ? req.url : '';
				const qIndex = rawUrl.indexOf('?');
				const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
				let sessionId = '';
				let file = '';
				for (const part of query.split('&')) {
					const eq = part.indexOf('=');
					if (eq <= 0) continue;
					const key = part.slice(0, eq);
					const value = decodeURIComponent(part.slice(eq + 1));
					if (key === 'sessionId') sessionId = value;
					else if (key === 'file') file = value;
				}
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const resolved = await resolveWorkspaceFile(base, file, 0);
				if (!resolved.ok) {
					sendJson(res, 400, { ok: false, error: 'Pfad außerhalb des Denkraums oder Dateityp nicht erlaubt' });
					return;
				}
				const stat = await fsp.stat(resolved.target).catch(() => null);
				if (stat === null || !stat.isFile()) {
					sendJson(res, 404, { ok: false, error: 'Datei nicht gefunden' });
					return;
				}
				const content = await fsp.readFile(resolved.target, 'utf8');
				sendJson(res, 200, { ok: true, content });
			} catch (e) {
				sendJson(res, 500, { error: 'internal' });
			}
		},
	});

	// — POST /api/pts-artifact/save (teacher edits; hard path boundary)
	const disposeSave = webServer.register({
		kind: 'exact',
		path: '/api/pts-artifact/save',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const file = typeof body.file === 'string' ? body.file : '';
				const normalizedFile = file.replace(/\\/g, '/').toLowerCase();
				if (normalizedFile === PRODUCT_FILE || normalizedFile.startsWith('.teaching-product')) { sendJson(res, 403, { error: 'Use canonical product API' }); return; }
				const content = typeof body.content === 'string' ? body.content : null;
				if (content === null) {
					sendJson(res, 400, { ok: false, error: 'content fehlt' });
					return;
				}
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				if (normalizedFile === TEMPORAL_FILE && await readProduct(base)) { sendJson(res, 409, { error: 'Legacy-Zeitplan ist nach Migration schreibgeschuetzt.' }); return; }
				const resolved = await resolveWorkspaceFile(base, file, Buffer.byteLength(content, 'utf8'));
				if (!resolved.ok) {
					sendJson(res, 400, { ok: false, error: resolved.reason === 'outside' ? 'Pfad außerhalb des Denkraums' : (resolved.reason === 'extension-not-allowed' ? 'Dateityp nicht erlaubt' : 'Datei zu groß') });
					return;
				}
				const canonicalName = path.relative(base, resolved.target).replace(/\\/g, '/').toLowerCase();
				if (canonicalName === PRODUCT_FILE || canonicalName.startsWith('.teaching-product')) { sendJson(res, 403, { error: 'Use canonical product API' }); return; }
				if (canonicalName === TEMPORAL_FILE && await readProduct(base)) { sendJson(res, 409, { error: 'Legacy-Zeitplan ist nach Migration schreibgeschuetzt.' }); return; }
				await atomicWriteFile(path.dirname(resolved.target), path.basename(resolved.target), content);
				sendJson(res, 200, { ok: true, path: toPosix(path.relative(base, resolved.target)) });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	ctx.effect(() => disposeGet, 'pts-landscape: route /api/pts-landscape');
	ctx.effect(() => disposeLayout, 'pts-landscape: route /api/pts-landscape/layout');
	ctx.effect(() => disposeMaterials, 'pts-landscape: route /api/pts-landscape/materials');
	ctx.effect(() => disposeEstimate, 'pts-landscape: route /api/pts-landscape/moment-estimate');
	ctx.effect(() => disposeMoment, 'pts-landscape: route /api/pts-landscape/moment');
	ctx.effect(() => disposeTransitions, 'pts-landscape: route /api/pts-landscape/transitions');
	ctx.effect(() => disposeTransitionsRemove, 'pts-landscape: route /api/pts-landscape/transitions/remove');
	ctx.effect(() => disposeTemporal, 'pts-landscape: route /api/pts-landscape/temporal');
	ctx.effect(() => disposeRaw, 'pts-landscape: route /api/pts-artifact/raw');
	ctx.effect(() => disposeSave, 'pts-landscape: route /api/pts-artifact/save');

	console.log('[pts-landscape] host half active; routes: /api/pts-landscape (+layout, +materials, +moment-estimate, +moment, +transitions[/remove], +temporal), /api/pts-artifact/raw|save');
}
