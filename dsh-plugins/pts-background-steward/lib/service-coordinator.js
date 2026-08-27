// pts-background-steward — GENERIC capability dispatcher.
//
// The steward never researches itself. When a reflection run returns a
// validated `service_intents` entry, this dispatcher runs it through ONE generic
// path — there is no per-capability JavaScript route:
//   1. resolve the capability from capabilities/registry.yml (single source);
//   2. deduplicate (in-memory guard + the canonical request's on-disk lifecycle
//      status — only a running/completed request blocks; failed/invalid retry);
//   3. preflight the capability's declared DSH tools against the research route;
//   4. load the capability INSTRUCTION and SCHEMA from files (never duplicated
//      in JS) and interpolate the prompt from the request scope;
//   5. write the canonical Service Request under service-requests/ and drive its
//      lifecycle (authorized -> running -> completed | failed | invalid);
//   6. delegate execution to the web-enabled research subagent seam;
//   7. store the validated result and return a Companion follow-up.
//
// It owns no pedagogical judgement and no capability rules: those live in the
// registry and the capability files.

import { promises as fsp } from 'node:fs';

import { runResearch, scopeKey, outputTargetFor, wantsKnowledgeProposal } from './research-job.js';
import { isDispatchable } from './registry.js';
import { getCapability } from './capability-catalog.js';
import { loadCapabilityArtifacts, interpolatePrompt } from './capability-loader.js';
import { requestPathFor, writeRequest, readRequestStatus, isBlocking } from './service-request.js';
import { getHandler } from './output-handlers.js';
import { appendExecution } from './execution-log.js';

async function pathExists(p) {
	try {
		await fsp.access(p);
		return true;
	} catch {
		return false;
	}
}

function storageOf(intent) {
	return wantsKnowledgeProposal(intent) ? 'knowledge_proposal' : 'draft';
}

function buildRecord(intent, cap, sessionId, storage) {
	return {
		task: intent.task,
		capability_version: cap.capability_version,
		reason: intent.reason,
		authorization: intent.authorization,
		scope: intent.scope,
		expected_output: storage === 'knowledge_proposal'
			? { type: 'knowledge_proposal', location: (intent.expected_output && intent.expected_output.location) || 'knowledge-proposals/' }
			: { type: 'draft' },
		result_schema: cap.result_schema,
		return_to: intent.return_to || 'critical_friend',
		session_id: sessionId,
		requested_at: new Date().toISOString(),
	};
}

/**
 * Create the generic capability dispatcher.
 * @param {object} ports
 * @param {object} ports.subagents - ctx.subagents
 * @param {object|undefined} ports.jobs - ctx.jobs (optional)
 * @param {(msg: string) => void} [ports.log]
 * @param {(msg: string) => void} [ports.logError]
 * @param {AbortSignal} [ports.externalSignal] - fiber-owned cancellation
 */
export function createServiceCoordinator({ subagents, jobs, log = () => {}, logError = () => {}, externalSignal } = {}) {
	// Dedup keys currently running (guards rapid duplicate turns within a run).
	const active = new Set();
	// Keys successfully completed this process (belt-and-braces with the on-disk
	// lifecycle). A FAILED key is never added here, so it stays retryable.
	const done = new Set();
	let disposed = false;

	async function runIntent(context, intent, researchConfig) {
		const { dir, slug, sessionId, parentAgent, childSessionIds, ptsRoot, registry, allowTrial } = context;

		const cap = registry ? getCapability(registry, intent.task) : undefined;
		if (!cap || !isDispatchable(cap)) {
			log(`${slug}: "${intent.task}" ist keine dispatchbare Capability im Katalog — kein Lauf`);
			return { status: 'no-capability', key: `${dir}::${intent.task}` };
		}
		// A `trial` capability may only run inside a controlled trial (allowTrial).
		// A NORMAL request must never use a trial capability as if it were active.
		if (cap.status === 'trial' && allowTrial !== true) {
			log(`${slug}: "${intent.task}" ist erst im Trial — normale Requests nutzen sie nicht wie aktiv`);
			return { status: 'not-active', key: `${dir}::${intent.task}` };
		}

		const storage = storageOf(intent);
		const sk = scopeKey(intent);
		const capVersion = Number(cap.capability_version) || 1;
		// Dedup key includes storage target AND capability version: a draft run
		// never blocks a later knowledge_proposal run, and a new capability
		// version re-runs.
		const key = `${dir}::${intent.task}::${sk}::${storage}::v${capVersion}`;
		const reqFile = requestPathFor(dir, intent.task, `${sk}-${storage}-v${capVersion}`);
		const record = buildRecord(intent, cap, sessionId, storage);

		if (active.has(key) || done.has(key)) {
			log(`${slug}: identischer Request läuft/erledigt — kein doppelter Auftrag`);
			return { status: 'deduplicated', key };
		}
		// Cross-restart dedup: a completed output OR a running/completed request
		// blocks; a failed/invalid/cancelled request is explicitly retryable.
		const statusRec = await readRequestStatus(reqFile);
		if (await pathExists(outputTargetFor(dir, intent)) || isBlocking(statusRec)) {
			done.add(key);
			log(`${slug}: Request bereits aktiv/erfolgreich (${statusRec ? statusRec.status : 'Ergebnis vorhanden'}) — kein doppelter Auftrag`);
			return { status: 'deduplicated', key };
		}
		const attempts = (statusRec && statusRec.attempts) ? statusRec.attempts : 0;

		if (!researchConfig || researchConfig.enabled === false) {
			await writeRequest(reqFile, { ...record, status: 'proposed', attempts }).catch(() => {});
			log(`${slug}: Recherche deaktiviert — Request bleibt proposed (kein Anlauf)`);
			return { status: 'proposed', key };
		}

		// Tool preflight against the REAL DSH tool names declared by the capability.
		const requiredTools = Array.isArray(cap.dsh_tools) ? cap.dsh_tools : [];
		const available = new Set(researchConfig.allowedTools || []);
		const missing = requiredTools.filter((t) => !available.has(t));
		if (missing.length > 0) {
			const detail = `Tool-Preflight fehlgeschlagen: ${missing.join(', ')} nicht in der Recherche-Allowlist (${[...available].join(', ') || 'leer'})`;
			await writeRequest(reqFile, { ...record, status: 'failed', attempts, detail }).catch(() => {});
			logError(`${slug}: ${detail}`);
			return { status: 'failed', key, detail }; // retryable: not added to done
		}

		active.add(key);
		try {
			const handler = getHandler(cap.output_handler);
			if (!handler) {
				const detail = `kein Ergebnis-Handler für output_handler "${cap.output_handler}"`;
				await writeRequest(reqFile, { ...record, status: 'failed', attempts, detail }).catch(() => {});
				active.delete(key);
				return { status: 'failed', key, detail };
			}
			const art = await loadCapabilityArtifacts(ptsRoot, cap);
			const promptText = interpolatePrompt(art.promptTemplate, intent.scope, intent.reason);
			const toolAllow = requiredTools.filter((t) => available.has(t));
			const nextAttempt = attempts + 1;
			await writeRequest(reqFile, { ...record, status: 'running', attempts: nextAttempt });

			const outcome = await runResearch({
				subagents,
				jobs,
				researchConfig,
				intent,
				dir,
				slug,
				parentAgent,
				childSessionIds,
				signal: externalSignal,
				artifacts: { persona: art.persona, promptText, outputSchema: art.schema },
				toolAllow,
				handler,
				capability: { task: cap.task, capability_version: capVersion },
				ptsRoot,
				log,
				logError,
			});

			await appendExecution(dir, {
				capability: cap.task,
				capability_version: capVersion,
				status: cap.status,
				request_file: `service-requests/${intent.task}-${sk}-${storage}-v${capVersion}.yml`,
				tools: toolAllow,
				output_handler: cap.output_handler,
				result_status: outcome.status,
				result_location: outcome.outputRel || null,
				validation: outcome.status === 'completed-research' ? 'passed' : (outcome.status === 'invalid' ? 'failed' : outcome.status),
				revision_suggested: outcome.status === 'invalid',
			});

			if (outcome.status === 'completed-research') {
				await writeRequest(reqFile, { ...record, status: 'completed', attempts: nextAttempt, result_location: outcome.outputRel });
				done.add(key);
			} else if (outcome.status === 'invalid') {
				await writeRequest(reqFile, { ...record, status: 'invalid', attempts: nextAttempt, detail: outcome.detail });
			} else if (outcome.status === 'aborted') {
				await writeRequest(reqFile, { ...record, status: 'cancelled', attempts: nextAttempt, detail: outcome.detail });
			} else {
				await writeRequest(reqFile, { ...record, status: 'failed', attempts: nextAttempt, detail: outcome.detail });
			}
			return { status: outcome.status, key, outcome };
		} catch (error) {
			const detail = String((error && error.message) || error);
			await writeRequest(reqFile, { ...record, status: 'failed', attempts: attempts + 1, detail }).catch(() => {});
			logError(`${slug}: Request fehlgeschlagen (betrifft nur den Hintergrund): ${String((error && error.stack) || error)}`);
			return { status: 'failed', key, detail };
		} finally {
			active.delete(key);
		}
	}

	return {
		/**
		 * Route validated, authorized intents through the generic dispatcher.
		 * @param {object} context - { dir, slug, sessionId, parentAgent, intents, childSessionIds, researchConfig, ptsRoot, registry }
		 * @returns {Promise<object[]>} per-intent results
		 */
		async handle(context) {
			if (disposed) return [];
			const intents = Array.isArray(context.intents) ? context.intents : [];
			const results = [];
			for (const intent of intents) {
				if (disposed) break;
				try {
					results.push(await runIntent(context, intent, context.researchConfig));
				} catch (error) {
					logError(`${context.slug}: unerwarteter Dispatcher-Fehler: ${String((error && error.stack) || error)}`);
					results.push({ status: 'failed', detail: String((error && error.message) || error) });
				}
			}
			return results;
		},
		snapshot() {
			return { active: [...active], done: done.size };
		},
		dispose() {
			disposed = true;
			active.clear();
			done.clear();
		},
	};
}
