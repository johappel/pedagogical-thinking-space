// pts-background-steward — structured execution log.
//
// Every capability execution appends one JSON line to the Denkraum's
// execution-log.jsonl: capability id + version, the canonical request, the DSH
// subagent + model route, the tools used, the result status, the validation /
// review verdict, detected gaps and whether a revision is suggested. Recurring
// failures or manual corrections may later trigger a capability-revision
// request. Appends are best-effort and never block a run.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export function executionLogPath(dir) {
	return path.join(dir, 'execution-log.jsonl');
}

/**
 * Append one execution record. Never throws into the caller.
 * @param {string} dir - Denkraum directory
 * @param {object} record - execution record fields
 */
export async function appendExecution(dir, record) {
	try {
		const entry = { at: new Date().toISOString(), ...record };
		await fsp.appendFile(executionLogPath(dir), `${JSON.stringify(entry)}\n`, 'utf8');
	} catch {
		// logging must never break a background run
	}
}

/** Read all execution records (for review/inspection/tests). */
export async function readExecutions(dir) {
	let text;
	try {
		text = await fsp.readFile(executionLogPath(dir), 'utf8');
	} catch {
		return [];
	}
	return text.split(/\r?\n/).filter(Boolean).map((line) => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);
}
