// pts-background-steward — canonical Service Request records with lifecycle.
//
// A dispatched capability owns exactly one canonical Service Request under
// workspace/<slug>/service-requests/. NO request or dedup marker may live under
// drafts/. The request carries a lifecycle status so a failed/invalid run is
// repeatable and no permanent "done" marker is written before success.
//
//   proposed -> authorized -> running -> completed
//                                    \-> failed | invalid | cancelled  (retryable)

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const REQUEST_STATES = Object.freeze(['proposed', 'authorized', 'running', 'completed', 'failed', 'invalid', 'cancelled']);
// A request in one of these states must NOT be re-dispatched (active/successful).
export const BLOCKING_STATES = Object.freeze(['running', 'completed']);
// A request in one of these states MAY be retried.
export const RETRYABLE_STATES = Object.freeze(['proposed', 'authorized', 'failed', 'invalid', 'cancelled']);

/** Canonical request file path inside a Denkraum's service-requests/ folder. */
export function requestPathFor(dir, task, key) {
	return path.join(dir, 'service-requests', `${task}-${key}.yml`);
}

function yamlScalar(value) {
	const s = String(value ?? '');
	return /[:#\-?{}[\],&*!|>'"%@`\n]/.test(s) || s.trim() !== s || s === '' ? JSON.stringify(s) : s;
}

/** Serialize a canonical request record to human-readable YAML. */
export function serializeRequest(record) {
	const s = record.scope || {};
	const eo = record.expected_output || { type: 'draft' };
	const lines = [
		'service: knowledge',
		'mode: research',
		`task: ${yamlScalar(record.task)}`,
		`capability_version: ${Number(record.capability_version) || 1}`,
		`reason: ${yamlScalar(record.reason)}`,
		'authorization:',
		`  type: ${yamlScalar(record.authorization?.type)}`,
		`  evidence: ${yamlScalar(record.authorization?.evidence)}`,
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
		`  storage: ${yamlScalar(eo.type || 'draft')}`,
		`  format: ${yamlScalar(record.result_schema || 'curriculum_alignment_brief')}`,
		...(eo.type === 'knowledge_proposal' && eo.location ? [`  location: ${yamlScalar(eo.location)}`] : []),
		`return_to: ${yamlScalar(record.return_to || 'critical_friend')}`,
		'requested_by: pts-background-steward',
		`session_id: ${yamlScalar(record.session_id)}`,
		`requested_at: ${record.requested_at || new Date().toISOString()}`,
		`updated_at: ${new Date().toISOString()}`,
		`attempts: ${Number(record.attempts) || 0}`,
		`status: ${record.status || 'proposed'}`,
		...(record.detail ? [`detail: ${yamlScalar(record.detail)}`] : []),
		...(record.result_location ? [`result_location: ${yamlScalar(record.result_location)}`] : []),
		'',
	];
	return lines.join('\n');
}

/** Read a request file's status line (or null when the file is absent). */
export async function readRequestStatus(file) {
	let text;
	try {
		text = await fsp.readFile(file, 'utf8');
	} catch {
		return null;
	}
	const m = text.match(/^status:\s*(\S+)\s*$/m);
	const a = text.match(/^attempts:\s*(\d+)\s*$/m);
	return { status: m ? m[1] : 'proposed', attempts: a ? Number(a[1]) : 0 };
}

async function atomicWriteFile(file, text) {
	await fsp.mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.req-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
	await fsp.writeFile(tmp, text, 'utf8');
	try {
		await fsp.rename(tmp, file);
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}

/** Atomically write/overwrite a canonical request record. */
export async function writeRequest(file, record) {
	await atomicWriteFile(file, serializeRequest(record));
}

/**
 * Whether a request in the given on-disk state blocks a fresh dispatch. Absent
 * (null) does not block; running/completed block; failed/invalid/cancelled and
 * proposed/authorized are retryable.
 */
export function isBlocking(statusRecord) {
	return Boolean(statusRecord) && BLOCKING_STATES.includes(statusRecord.status);
}
