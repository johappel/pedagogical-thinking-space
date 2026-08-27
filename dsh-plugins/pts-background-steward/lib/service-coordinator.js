// pts-background-steward — service coordinator for bounded knowledge requests.
//
// The steward never researches itself. When a reflection run returns a
// validated `service_intents` entry, this coordinator:
//   1. deduplicates it (a duplicate turn must not start a second identical run
//      — in-memory guard plus an on-disk request/draft marker across restarts);
//   2. persists the authorized request for traceability;
//   3. delegates execution to the separate web-enabled research subagent
//      (`research-job.js`), which returns a draft and a Companion follow-up.
//
// It owns no pedagogical judgement: it only routes an already-validated,
// already-authorized intent to the research seam.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { runResearch, scopeKey, outputTargetFor, wantsKnowledgeProposal } from './research-job.js';

function requestPathFor(dir, intent) {
	return path.join(dir, 'drafts', `curriculum-alignment-${scopeKey(intent)}.request.yaml`);
}

async function pathExists(p) {
	try {
		await fsp.access(p);
		return true;
	} catch {
		return false;
	}
}

function yamlScalar(value) {
	const s = String(value ?? '');
	return /[:#\-?{}\[\],&*!|>'"%@`\n]/.test(s) || s.trim() !== s || s === '' ? JSON.stringify(s) : s;
}

/** Serialize the authorized request as a small, human-readable YAML record. */
function serializeRequest(intent, meta) {
	const s = intent.scope || {};
	const storage = wantsKnowledgeProposal(intent) ? 'knowledge_proposal' : 'draft';
	const location = storage === 'knowledge_proposal'
		? (intent.expected_output && intent.expected_output.location) || 'knowledge-proposals/'
		: undefined;
	const lines = [
		'service: knowledge',
		'mode: research',
		`task: ${yamlScalar(intent.task)}`,
		`reason: ${yamlScalar(intent.reason)}`,
		'authorization:',
		`  type: ${yamlScalar(intent.authorization.type)}`,
		`  evidence: ${yamlScalar(intent.authorization.evidence)}`,
		'scope:',
		`  jurisdiction: ${yamlScalar(s.jurisdiction)}`,
		`  subject: ${yamlScalar(s.subject)}`,
		`  phase: ${yamlScalar(s.phase)}`,
		`  grade: ${yamlScalar(s.grade)}`,
		`  topic: ${yamlScalar(s.topic)}`,
		`  denomination: ${yamlScalar(s.denomination ?? 'unknown')}`,
		'source_requirements:',
		'  official_sources_first: true',
		'  citations_required: true',
		'expected_output:',
		'  format: curriculum_alignment_brief',
		`  storage: ${yamlScalar(storage)}`,
		...(location ? [`  location: ${yamlScalar(location)}`] : []),
		`return_to: ${yamlScalar(intent.return_to)}`,
		`requested_by: pts-background-steward`,
		`session_id: ${yamlScalar(meta.sessionId)}`,
		`requested_at: ${new Date().toISOString()}`,
		'status: authorized',
		'',
	];
	return lines.join('\n');
}

/**
 * Create the service coordinator.
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
	// Keys completed this process (belt-and-braces with the on-disk marker).
	const done = new Set();
	let disposed = false;

	async function runIntent(context, intent, researchConfig) {
		const { dir, slug, sessionId, parentAgent, childSessionIds } = context;
		const key = `${dir}::${scopeKey(intent)}`;

		if (active.has(key)) {
			log(`${slug}: identischer Knowledge-Request läuft bereits — kein doppelter Auftrag`);
			return { status: 'deduplicated', key };
		}
		if (done.has(key)) {
			log(`${slug}: Knowledge-Request in dieser Sitzung bereits erledigt — übersprungen`);
			return { status: 'deduplicated', key };
		}
		// Cross-restart dedup: an existing output or request marker means done.
		if (await pathExists(outputTargetFor(dir, intent)) || await pathExists(requestPathFor(dir, intent))) {
			done.add(key);
			log(`${slug}: Knowledge-Request bereits als Ergebnis/Marker vorhanden — kein doppelter Auftrag`);
			return { status: 'deduplicated', key };
		}

		if (!researchConfig || researchConfig.enabled === false) {
			log(`${slug}: Recherche deaktiviert — Request bleibt proposed (kein Anlauf)`);
			return { status: 'proposed', key };
		}

		active.add(key);
		try {
			// Persist the authorized request first (also the dedup marker).
			const reqPath = requestPathFor(dir, intent);
			await fsp.mkdir(path.dirname(reqPath), { recursive: true });
			await fsp.writeFile(reqPath, serializeRequest(intent, { sessionId }), 'utf8');

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
				log,
				logError,
			});
			done.add(key);
			return { status: outcome.status, key, outcome };
		} catch (error) {
			logError(`${slug}: Knowledge-Request fehlgeschlagen (betrifft nur den Hintergrund): ${String((error && error.stack) || error)}`);
			return { status: 'failed', key, detail: String((error && error.message) || error) };
		} finally {
			active.delete(key);
		}
	}

	return {
		/**
		 * Route validated, authorized intents to the research seam.
		 * @param {object} context - { dir, slug, sessionId, parentAgent, intents, childSessionIds, researchConfig }
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
					logError(`${context.slug}: unerwarteter Coordinator-Fehler: ${String((error && error.stack) || error)}`);
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
