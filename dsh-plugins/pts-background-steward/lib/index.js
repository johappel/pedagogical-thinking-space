// pts-background-steward — host half.
//
// Watches COMPLETED top-level dialog turns and hands each affected Denkraum
// to a background steward run:
//
//   Teacher <-> Companion (visible, never waits)
//                       |  (turn/end, completed, after debounce)
//                       v
//            Background Steward (native in-process subagent, own model,
//            steward persona, read-only tool allowlist, structured result)
//                       |
//                       v
//        validated + revision-checked atomic workspace patch
//
// Hard rules implemented here:
// - The visible conversation is never delayed: everything below starts AFTER
//   the turn has durably ended, off the model's critical path.
// - Child-agent turns (header.parentSession set, or sessions this plugin
//   spawned itself) never re-trigger the steward.
// - At most one active run per Denkraum; rapid consecutive turns coalesce.
// - Stale results are discarded, never applied (hash re-check before write).
// - Every error stays inside the background job; the chat is untouched.
//
// This package deliberately imports NO @deepseek-ai modules: it is mounted
// through a junction whose realpath lies outside the harness installation,
// where such specifiers would not resolve. Services arrive through inject.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeConfig, resolveModelConfig, resolveResearchConfig } from './config.js';
import { createScheduler } from './scheduler.js';
import { createReflectionRunner } from './reflection-job.js';
import { createServiceCoordinator } from './service-coordinator.js';
import { readStewardModelSettings, readProviderCatalog, writeStewardSettingsSection } from './settings-source.js';
import { CANONICAL_FILES } from './workspace-state.js';
import { loadCatalog, dispatchableTasksForService } from './capability-catalog.js';

export const inject = ['sessions', 'agents', 'subagents'];

function textFromBlocks(blocks) {
	if (typeof blocks === 'string') return blocks;
	if (!Array.isArray(blocks)) return '';
	return blocks
		.filter((b) => b && b.type === 'text' && typeof b.text === 'string')
		.map((b) => b.text)
		.join(' ')
		.trim();
}

/**
 * Extract an OWNED plain-data copy of the recent dialogue window from a live
 * session (leaf fields only, no live objects retained).
 */
function extractDialogue(session, config) {
	let messages;
	try {
		messages = session.deriveMessages();
	} catch {
		return { dialogue: [], messageIds: new Set(), lastUserText: '' };
	}
	const relevant = [];
	for (const m of messages) {
		if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
		if (m.role === 'user' && m.source && m.source.kind !== 'user') continue; // tool results etc.
		relevant.push(m);
	}
	const window = relevant.slice(-Math.max(2, config.recentTurnsWindow * 2));
	const dialogue = [];
	const messageIds = new Set();
	const userMessageIds = new Set();
	let used = 0;
	for (let i = 0; i < window.length; i += 1) {
		const m = window[i];
		const text = textFromBlocks(m.content);
		if (text === '') continue;
		if (used + text.length > config.recentTurnsMaxChars && dialogue.length > 0) break;
		const id = `m${i + 1}`;
		dialogue.push({ id, role: m.role, text: text.slice(0, Math.max(200, config.recentTurnsMaxChars)) });
		messageIds.add(id);
		if (m.role === 'user') userMessageIds.add(id);
		used += text.length;
	}
	let lastUserText = '';
	for (let i = window.length - 1; i >= 0; i -= 1) {
		const m = window[i];
		if (m.role === 'user') { lastUserText = textFromBlocks(m.content); break; }
	}
	return { dialogue, messageIds, userMessageIds, lastUserText };
}

export function apply(ctx, rawConfig) {
	const { config, warnings } = normalizeConfig(rawConfig);
	const log = (msg) => console.log(`[pts-background-steward] ${msg}`);
	const logError = (msg) => console.error(`[pts-background-steward] ${msg}`);
	for (const w of warnings) logError(`Konfiguration: ${w}`);

	if (!config.enabled) {
		log('deaktiviert (enabled: false) — keine Beobachtung, keine Läufe');
		return;
	}

	const sessions = ctx.sessions;
	const agents = ctx.agents;
	const subagents = ctx.subagents;
	const jobs = ctx.get('jobs'); // optional: native visibility only, never required

	// Optional settings service (steward model section). The settings provider
	// may become available AFTER apply() — same activation race as webServer —
	// so capture it reactively instead of a one-time ctx.get.
	let settingsService = undefined;
	ctx.inject(['settings'], (subCtx) => {
		settingsService = subCtx.get('settings');
	});

	// Effective model config for one run/status: settings block > patch row.
	async function effectiveModelConfig() {
		const settingsModel = await readStewardModelSettings(settingsService);
		return resolveModelConfig(config, settingsModel);
	}

	// Effective research route (separate model + web-enabled allowlist). Empty
	// values inherit the steward model but keep the research tool allowlist.
	async function effectiveResearchConfig() {
		const settingsModel = await readStewardModelSettings(settingsService);
		const stewardModel = resolveModelConfig(config, settingsModel);
		return resolveResearchConfig(config, stewardModel, settingsModel);
	}

	// Dispatchable knowledge capability task ids from the DERIVED catalogue
	// (capabilities/registry.yml + capabilities/_proposals). Cached; failures
	// degrade to an empty catalogue (fail-closed: no routable service intent).
	let cachedRegistryPromise = null;
	async function dispatchableKnowledgeTasks() {
		try {
			if (!cachedRegistryPromise) {
				const root = await ptsRoot();
				cachedRegistryPromise = root ? loadCatalog(root) : Promise.resolve({ capabilities: [] });
			}
			return dispatchableTasksForService(await cachedRegistryPromise, 'knowledge');
		} catch (error) {
			logError(`Capability-Katalog nicht ladbar (${String((error && error.message) || error)}) — keine dispatchbaren Tasks`);
			return [];
		}
	}

	// Fiber-owned cancellation: plugin stop/update/unload aborts any active
	// background run and disposes the scheduler.
	const fiberAbort = new AbortController();
	const childSessionIds = new Set();
	const lastOutcomeByDir = new Map();

	log(`aktiv (provider=${config.provider || 'Eltern-Provider'}, model=${config.model || 'Eltern-Modell'}, debounce=${config.debounceMs} ms)`);

	// ————— PTS root + Denkraum resolution (marker-validated, cached) —————
	let cachedRootPromise = null;

	async function looksLikePtsRoot(dir) {
		for (const marker of ['AGENTS.md', 'workspace']) {
			try {
				await fsp.access(path.join(dir, marker));
			} catch {
				return false;
			}
		}
		return true;
	}

	function ptsRoot() {
		if (cachedRootPromise) return cachedRootPromise;
		cachedRootPromise = (async () => {
			const candidates = [];
			if (typeof process.env.PTS_ROOT === 'string' && process.env.PTS_ROOT.trim() !== '') {
				candidates.push(process.env.PTS_ROOT.trim());
			}
			try {
				let dir = path.dirname(fileURLToPath(import.meta.url));
				for (let i = 0; i < 8; i += 1) {
					candidates.push(dir);
					const parent = path.dirname(dir);
					if (parent === dir) break;
					dir = parent;
				}
			} catch {
				// import.meta.url unavailable; env/cwd remain
			}
			if (typeof process.cwd() === 'string') candidates.push(process.cwd());
			for (const candidate of candidates) {
				if (await looksLikePtsRoot(candidate)) return path.resolve(candidate);
			}
			return null;
		})();
		return cachedRootPromise;
	}

	async function resolveDenkraum(rawCwd) {
		if (typeof rawCwd !== 'string' || rawCwd === '') return null;
		const root = await ptsRoot();
		if (root === null) return null;
		let real;
		try {
			real = await fsp.realpath(rawCwd);
		} catch {
			return null;
		}
		const wsDir = path.join(root, 'workspace');
		const rel = path.relative(wsDir, real);
		if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
		const segments = rel.split(/[\\/]+/);
		if (segments.length !== 1) return null; // exactly one Denkraum level
		const slug = segments[0];
		if (slug.startsWith('.')) return null;
		return { slug, dir: real };
	}

	// ————— Reflection runner + scheduler —————
	const reflect = createReflectionRunner({ subagents, jobs, config, log, logError, externalSignal: fiberAbort.signal });
	// Bounded knowledge-request seam: the steward proposes, this coordinator
	// deduplicates and routes to the separate web-enabled research subagent.
	const coordinator = createServiceCoordinator({ subagents, jobs, log, logError, externalSignal: fiberAbort.signal });

	async function runWorkspaceJob(key, metas) {
		const last = metas[metas.length - 1];
		const parent = agents.get(last.sessionId);
		if (parent === undefined) {
			logError(`${key}: auslösende Session ist nicht mehr live — Lauf übersprungen`);
			lastOutcomeByDir.set(key, { at: Date.now(), outcome: { status: 'skipped', detail: 'Session nicht mehr live' } });
			return;
		}
		const job = {
			key,
			dir: key,
			sessionId: last.sessionId,
			turn: last.turn,
			dialogue: last.dialogue,
			messageIds: last.messageIds,
			userMessageIds: last.userMessageIds,
			parentAgent: parent,
			childSessionIds,
			modelConfig: await effectiveModelConfig(),
			allowedTasks: await dispatchableKnowledgeTasks(),
		};
		const outcome = await reflect(job);
		lastOutcomeByDir.set(key, { at: Date.now(), outcome });

		// Route any validated bounded knowledge-request intents. This happens
		// AFTER reflection and never blocks the visible conversation; the
		// research runs in its own owned job and returns via a Companion
		// follow-up. Duplicate turns are deduplicated inside the coordinator.
		const intents = Array.isArray(outcome && outcome.serviceIntents) ? outcome.serviceIntents : [];
		if (intents.length > 0) {
			const researchConfig = await effectiveResearchConfig();
			const root = await ptsRoot();
			const registry = root ? await cachedRegistryPromise : null;
			coordinator.handle({
				dir: key,
				slug: path.basename(key),
				sessionId: last.sessionId,
				parentAgent: parent,
				intents,
				childSessionIds,
				researchConfig,
				ptsRoot: root,
				registry,
			}).catch((error) => logError(`${key}: Coordinator-Fehler: ${String((error && error.stack) || error)}`));
		}
	}

	const scheduler = createScheduler({
		debounceMs: config.debounceMs,
		maxConcurrentPerWorkspace: config.maxConcurrentPerWorkspace,
		rerunAfterBusyTurns: config.rerunAfterBusyTurns,
		runner: runWorkspaceJob,
		log: logError,
	});

	async function handleTurnEnd(session, turnNumber) {
		const header = session.header;
		const place = await resolveDenkraum(header.cwd);
		if (place === null) return; // kernel-root or foreign session: not a Denkraum dialog
		const extracted = extractDialogue(session, config);
		if (config.minPromptChars > 0) {
			const t = extracted.lastUserText;
			const trivial = t.length < config.minPromptChars && !t.includes('?');
			if (trivial) {
				log(`${place.slug}: Turn ${turnNumber} ohne substanziellen Beitrag — kein Steward-Lauf`);
				return;
			}
		}
		scheduler.notify(place.dir, {
			sessionId: header.id || session.id,
			turn: turnNumber,
			dialogue: extracted.dialogue,
			messageIds: extracted.messageIds,
			userMessageIds: extracted.userMessageIds,
		});
	}

	// ————— Trigger observation —————
	ctx.on('session/event', (session, event) => {
		try {
			if (!event || event.type !== 'turn/end') return;
			const reason = event.data && event.data.reason;
			if (!reason || reason.kind !== 'completed') return;
			const header = session && session.header;
			if (!header) return;
			if (header.parentSession) return; // child-agent turns never retrigger
			const sessionId = header.id || session.id;
			if (childSessionIds.has(sessionId)) return; // belt and braces
			handleTurnEnd(session, Number(event.data && event.data.turn) || 0)
				.catch((error) => logError(`Trigger-Auflösung fehlgeschlagen: ${String((error && error.stack) || error)}`));
		} catch (error) {
			logError(`Fehler im Session-Observer: ${String((error && error.stack) || error)}`);
		}
	}, { global: true });

	// ————— Optional status surface for future UI consumers —————
	// GET /api/pts-background-steward/status — plain JSON, no UI, no chat side
	// effects. pts-activity-stream MAY later render one discreet chip from it.
	//
	// webServer can become available AFTER this plugin's apply() runs (the
	// webserver row activates on its own schedule). A one-time ctx.get at
	// apply time would miss it — so we reactively wait via ctx.inject and
	// register the route as soon as the service appears. This keeps webServer
	// OPTIONAL: without a web host the steward still reflects in the background.
	ctx.inject(['webServer'], (subCtx) => {
		const webServer = subCtx.get('webServer');
		if (webServer === undefined || typeof webServer.register !== 'function') {
			log('webServer nicht verfügbar — Status-Route deaktiviert (Steward bleibt funktionsfähig)');
			return;
		}
		ctx.effect(() => webServer.register({
			kind: 'prefix',
			path: '/api/pts-background-steward',
			handler: async (req, res) => {
				const sendJson = (status, body) => {
					res.statusCode = status;
					res.setHeader('content-type', 'application/json; charset=utf-8');
					res.setHeader('cache-control', 'no-store');
					res.end(JSON.stringify(body));
				};
				const readBody = () => new Promise((resolve, reject) => {
					const chunks = [];
					let size = 0;
					req.on('data', (c) => { size += c.length; if (size > 16384) { req.destroy(); reject(new Error('body zu groß')); } else chunks.push(c); });
					req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
					req.on('error', reject);
				});
				const configPayload = (mc, rc) => ({
					providerName: config.providerName,
					provider: mc.provider || null,
					model: mc.model || null,
					maxTokens: mc.maxTokens,
					reasoningEffort: mc.reasoningEffort || null,
					reasoningEffortApplied: false,
					modelSource: mc.source,
					research: rc ? {
						enabled: rc.enabled,
						provider: rc.provider || null,
						model: rc.model || null,
						maxTokens: rc.maxTokens,
						allowedTools: [...rc.allowedTools],
						source: rc.source,
					} : null,
					debounceMs: config.debounceMs,
					maxConcurrentPerWorkspace: config.maxConcurrentPerWorkspace,
					runTimeoutMs: config.runTimeoutMs,
					allowedTools: [...config.allowedTools],
					canonicalFiles: [...CANONICAL_FILES],
					defaultsUsed: rawConfig === undefined || rawConfig === null,
				});
				try {
					const rawPath = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';
					if (rawPath === '/api/pts-background-steward/status') {
						if (req.method !== 'GET') { sendJson(405, { ok: false, error: 'method-not-allowed' }); return; }
						const root = await ptsRoot();
						const workspaces = scheduler.snapshot().map((entry) => ({
							dir: entry.key,
							slug: path.basename(entry.key),
							state: entry.running ? 'running' : entry.pending > 0 || entry.dirty ? 'pending' : 'idle',
							pending: entry.pending,
							dirty: entry.dirty,
							lastRunAt: entry.lastRunAt,
							lastOutcome: lastOutcomeByDir.get(entry.key)?.outcome ?? null,
						}));
						sendJson(200, {
							ok: true,
							version: '0.1.0',
							schemaVersion: 'ptspace.stewardship-result/v1',
							config: configPayload(await effectiveModelConfig(), await effectiveResearchConfig()),
							ptsRoot: root,
							activeChildSessions: [...childSessionIds],
							workspaces,
						});
						return;
					}
					if (rawPath === '/api/pts-background-steward/config') {
						if (req.method === 'GET') {
							const mc = await effectiveModelConfig();
							const rc = await effectiveResearchConfig();
							const providers = await readProviderCatalog(settingsService);
							const section = (await readStewardModelSettings(settingsService)) ?? {};
							sendJson(200, { ok: true, effective: configPayload(mc, rc), providers, section });
							return;
						}
						if (req.method === 'POST') {
							let body;
							try { body = JSON.parse((await readBody()) || '{}'); } catch { sendJson(400, { ok: false, error: 'ungültiges JSON' }); return; }
							const provider = typeof body.provider === 'string' ? body.provider.trim() : undefined;
							const model = typeof body.model === 'string' ? body.model.trim() : undefined;
							if (provider === undefined || model === undefined) { sendJson(400, { ok: false, error: 'provider und model werden erwartet' }); return; }
							const maxTokens = body.maxTokens === undefined ? undefined : Number(body.maxTokens);
							if (maxTokens !== undefined && (!Number.isFinite(maxTokens) || maxTokens < 0 || maxTokens > 200000)) { sendJson(400, { ok: false, error: 'maxTokens außerhalb des erlaubten Bereichs' }); return; }
							const doc = settingsService && settingsService.documentPath;
							if (typeof doc !== 'string' || doc === '') { sendJson(503, { ok: false, error: 'Settings-Dokument nicht verfügbar' }); return; }
							const current = (await readStewardModelSettings(settingsService)) ?? {};
							// Optional research route: persisted as a nested block.
							let research = current.research ?? undefined;
							if (body.research !== undefined) {
								if (body.research === null) {
									research = undefined;
								} else if (typeof body.research === 'object' && !Array.isArray(body.research)) {
									const rProvider = typeof body.research.provider === 'string' ? body.research.provider.trim() : (current.research?.provider ?? '');
									const rModel = typeof body.research.model === 'string' ? body.research.model.trim() : (current.research?.model ?? '');
									const rMaxRaw = body.research.maxTokens === undefined ? (current.research?.maxTokens) : Number(body.research.maxTokens);
									if (rMaxRaw !== undefined && (!Number.isFinite(rMaxRaw) || rMaxRaw < 0 || rMaxRaw > 200000)) { sendJson(400, { ok: false, error: 'research.maxTokens außerhalb des erlaubten Bereichs' }); return; }
									research = { provider: rProvider, model: rModel, ...(Number.isFinite(rMaxRaw) ? { maxTokens: rMaxRaw } : {}) };
								} else {
									sendJson(400, { ok: false, error: 'research muss ein Objekt oder null sein' }); return;
								}
							}
							await writeStewardSettingsSection(doc, {
								provider,
								model,
								maxTokens: maxTokens !== undefined ? maxTokens : current.maxTokens ?? 8192,
								reasoningEffort: current.reasoningEffort ?? '',
								research,
							});
							log(`Modellwahl über die Oberfläche aktualisiert: Steward ${provider}/${model}${research && (research.provider || research.model) ? `, Recherche ${research.provider || '—'}/${research.model || '—'}` : ''}`);
							sendJson(200, { ok: true, effective: configPayload(await effectiveModelConfig(), await effectiveResearchConfig()) });
							return;
						}
						sendJson(405, { ok: false, error: 'method-not-allowed' });
						return;
					}
					sendJson(404, { ok: false, error: 'not-found' });
				} catch (error) {
					sendJson(500, { ok: false, error: String((error && error.message) || error) });
				}
			},
		}), 'pts-background-steward-route');
		log('Routen /api/pts-background-steward/status und /config registriert');
	});

	// ————— Ordered teardown —————
	ctx.effect(() => () => {
		scheduler.dispose();
		coordinator.dispose();
		fiberAbort.abort(new Error('Plugin wird entladen'));
		childSessionIds.clear();
	}, 'pts-background-steward-cleanup');
}
