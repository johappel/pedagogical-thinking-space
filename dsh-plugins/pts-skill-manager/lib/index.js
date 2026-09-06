// pts-skill-manager — host half.
//
// Exposes the skill library and the role↔skill matrix to the web tab:
//
//   GET  /api/pts-skills/list       -> library entries + current matrix
//   POST /api/pts-skills/import     -> import a SKILL.md (content or sourcePath)
//   POST /api/pts-skills/delete     -> remove skills/<id>/ (verified needs confirm)
//   POST /api/pts-skills/assignment -> write the matrix atomically into the
//                                      `pts-worker-skills:` settings section
//
// The matrix is the only control surface; DSH-side enforcement lives in the
// preset plugin worker-skill-scope.mjs (role detection, hard `skill` guard,
// prompt section). This package imports no @deepseek-ai modules: it is mounted
// through a junction whose realpath lies outside the harness installation.
// Settings come from `ctx.settings.documentPath`, never from the namespace
// registry.

import {
	listLibrary,
	importSkill,
	deleteSkill,
	skillsRoot,
	repoRoot,
} from './skill-library.js';
import {
	readWorkerSkillsMatrix,
	normalizeMatrix,
	validateMatrixAgainstLibrary,
	writeWorkerSkillsSection,
	WORKER_ROLES,
} from './settings-source.js';
import {
	readWorkerRoutesSection,
	writeWorkerRoutesSection,
	normalizeWorkerRoutes,
	effectiveRoutesBySlug,
	ROUTE_WORKERS,
} from './worker-routes-source.js';

export const inject = ['webServer'];

const ROOT = '/api/pts-skills';
const ROUTES_ROOT = '/api/pts-worker-routes';

export function apply(ctx) {
	let settingsService = undefined;
	ctx.inject(['settings'], (subCtx) => {
		settingsService = subCtx.get('settings');
	});

	ctx.inject(['webServer'], (subCtx) => {
		const webServer = subCtx.get('webServer');
		if (webServer === undefined || typeof webServer.register !== 'function') {
			console.error('[pts-skill-manager] webServer service missing - plugin inactive');
			return;
		}

		const log = (msg) => console.log(`[pts-skill-manager] ${msg}`);

		// NOTE: readBody must take the request as a parameter — it is defined
		// in the inject-callback scope, where the handler's `req` does not
		// exist (the handler passes it explicitly).
		const readBody = (request) => new Promise((resolve, reject) => {
			const chunks = [];
			let size = 0;
			request.on('data', (c) => {
				size += c.length;
				if (size > 16384) {
					request.destroy();
					reject(new Error('body zu groß'));
				} else {
					chunks.push(c);
				}
			});
			request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			request.on('error', reject);
		});

		ctx.effect(() => webServer.register({
			kind: 'prefix',
			path: ROOT,
			handler: async (req, res) => {
				try {
					const rawUrl = typeof req.url === 'string' ? req.url : '/';
					const qIndex = rawUrl.indexOf('?');
					const sub = (qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl).replace(/\/+$/, '') || ROOT;
					const method = req.method || 'GET';

					const sendJson = (status, value) => {
						res.statusCode = status;
						res.setHeader('content-type', 'application/json; charset=utf-8');
						res.setHeader('cache-control', 'no-store');
						res.end(JSON.stringify(value));
					};
					const parseBody = async () => {
						try {
							return JSON.parse((await readBody(req)) || '{}');
						} catch {
							sendJson(400, { ok: false, error: 'ungültiges JSON' });
							return null;
						}
					};

					if (sub === `${ROOT}/list`) {
						if (method !== 'GET') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const skills = await listLibrary();
						const matrix = await readWorkerSkillsMatrix(settingsService);
						sendJson(200, { ok: true, root: skillsRoot(), skills, matrix });
						return;
					}

					if (sub === `${ROOT}/import`) {
						if (method !== 'POST') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const body = await parseBody();
						if (body === null) return;
						const result = await importSkill(body, repoRoot());
						if (result.ok !== true) { sendJson(result.status ?? 400, { ok: false, error: result.error }); return; }
						log(`Skill "${result.skill.id}" importiert${result.adjusted ? ' (name ergänzt)' : ''}`);
						sendJson(200, { ok: true, skill: result.skill, adjusted: result.adjusted });
						return;
					}

					if (sub === `${ROOT}/delete`) {
						if (method !== 'POST') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const body = await parseBody();
						if (body === null) return;
						const result = await deleteSkill(body);
						if (result.ok !== true) { sendJson(result.status ?? 400, { ok: false, error: result.error }); return; }
						const id = typeof body.id === 'string' ? body.id.trim() : null;
						if (id !== null && settingsService && typeof settingsService.documentPath === 'string' && settingsService.documentPath !== '') {
							try {
								const current = (await readWorkerSkillsMatrix(settingsService)) ?? {};
								let changed = false;
								const next = { ...current };
								for (const role of WORKER_ROLES) {
									if (Array.isArray(next[role]) && next[role].includes(id)) {
										next[role] = next[role].filter((x) => x !== id);
										changed = true;
									}
								}
								if (changed) await writeWorkerSkillsSection(settingsService.documentPath, next);
							} catch (error) {
								log(`Matrix-Bereinigung nach Löschen fehlgeschlagen: ${String(error && error.message || error)}`);
							}
						}
						log(`Skill "${id}" gelöscht`);
						sendJson(200, { ok: true });
						return;
					}

					if (sub === `${ROOT}/assignment`) {
						if (method !== 'POST') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const body = await parseBody();
						if (body === null) return;
						if (!body.matrix || typeof body.matrix !== 'object' || Array.isArray(body.matrix)) {
							sendJson(400, { ok: false, error: 'matrix wird erwartet' });
							return;
						}
						const matrix = normalizeMatrix(body.matrix);
						const skills = await listLibrary();
						const knownIds = new Set(skills.map((s) => s.id));
						const problems = validateMatrixAgainstLibrary(matrix, knownIds);
						if (problems.length > 0) {
							sendJson(400, { ok: false, error: `unbekannte Skills in der Matrix: ${problems.join(', ')}` });
							return;
						}
						const doc = settingsService && settingsService.documentPath;
						if (typeof doc !== 'string' || doc === '') {
							sendJson(503, { ok: false, error: 'Settings-Dokument nicht verfügbar' });
							return;
						}
						await writeWorkerSkillsSection(doc, matrix);
						log('Matrix aktualisiert (wirkt für neue Worker-Ausführungen)');
						sendJson(200, { ok: true, matrix });
						return;
					}

					sendJson(404, { ok: false, error: 'not-found' });
				} catch (error) {
					sendJson(500, { ok: false, error: String((error && error.message) || error) });
				}
			},
		}), 'pts-skill-manager-route');

		ctx.effect(() => webServer.register({
			kind: 'prefix',
			path: ROUTES_ROOT,
			handler: async (req, res) => {
				try {
					const rawUrl = typeof req.url === 'string' ? req.url : '/';
					const qIndex = rawUrl.indexOf('?');
					const sub = (qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl).replace(/\/+$/, '') || ROUTES_ROOT;
					const method = req.method || 'GET';

					const sendJson = (status, value) => {
						res.statusCode = status;
						res.setHeader('content-type', 'application/json; charset=utf-8');
						res.setHeader('cache-control', 'no-store');
						res.end(JSON.stringify(value));
					};
					const parseBody = async () => {
						try {
							return JSON.parse((await readBody(req)) || '{}');
						} catch {
							sendJson(400, { ok: false, error: 'ungültiges JSON' });
							return null;
						}
					};

					if (sub === `${ROUTES_ROOT}/get`) {
						if (method !== 'GET') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const doc = settingsService && settingsService.documentPath;
						if (typeof doc !== 'string' || doc === '') {
							sendJson(503, { ok: false, error: 'Settings-Dokument nicht verfügbar' });
							return;
						}
						const routesBySlug = await readWorkerRoutesSection(settingsService);
						const workers = ROUTE_WORKERS.map(({ slug, id, label }) => ({ slug, id, label }));
						sendJson(200, { ok: true, workers, routes: effectiveRoutesBySlug(routesBySlug) });
						return;
					}

					if (sub === `${ROUTES_ROOT}/save`) {
						if (method !== 'POST') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const body = await parseBody();
						if (body === null) return;
						if (!body.routes || typeof body.routes !== 'object' || Array.isArray(body.routes)) {
							sendJson(400, { ok: false, error: 'routes wird erwartet' });
							return;
						}
						const routesBySlug = normalizeWorkerRoutes(body.routes);
						const doc = settingsService && settingsService.documentPath;
						if (typeof doc !== 'string' || doc === '') {
							sendJson(503, { ok: false, error: 'Settings-Dokument nicht verfügbar' });
							return;
						}
						await writeWorkerRoutesSection(doc, routesBySlug);
						log('Worker-Routen gespeichert (wirken nach DSH-Neustart)');
						sendJson(200, { ok: true, routes: effectiveRoutesBySlug(routesBySlug) });
						return;
					}

					sendJson(404, { ok: false, error: 'not-found' });
				} catch (error) {
					sendJson(500, { ok: false, error: String((error && error.message) || error) });
				}
			},
		}), 'pts-worker-routes-route');
		log(`Routen ${ROOT}/* und ${ROUTES_ROOT}/* registriert`);
	});
}
