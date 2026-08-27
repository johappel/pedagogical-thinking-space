// pts-background-steward — capability preflight, trial gates + bounded activation.
//
// Lifecycle: a builder result is materialized as `proposed`. A successful
// DETERMINISTIC preflight promotes it to `trial` (the builder never sets trial
// itself). After the trial run, auto-activation trial -> active requires ALL of:
//   1. deterministic policy + schema gates passed;
//   2. a successful trial;
//   3. a separate SEMANTIC reviewer subagent verdict `approved`;
//   4. no new tools, permissions, output targets or runtime code paths.
// Otherwise the capability stays at trial and needs human approval.
//
// Capability versions are never overwritten: transitions flip THIS version's
// status and append a traceable record.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { validateAgainstSchema } from './output-handlers.js';

export const CAPABILITY_REVIEW_SCHEMA_VERSION = 'ptspace.capability-review/v1';

// Tools/permissions/targets already granted — the only ones eligible for
// hands-off activation. Anything beyond stays trial (human approval).
export const ACTIVATION_ALLOWED_TOOLS = Object.freeze(['read', 'glob', 'grep', 'web_search', 'web_fetch']);
export const ACTIVATION_ALLOWED_AUTHZ = Object.freeze(['board_item', 'bounded_session', 'implied_bounded_request', 'explicit_chat']);
export const ACTIVATION_ALLOWED_TARGETS = Object.freeze(['draft', 'knowledge_proposal']);
export const ACTIVATION_ALLOWED_HANDLERS = Object.freeze(['generic', 'draft']);

function policyReasons(entry) {
	const reasons = [];
	const tools = Array.isArray(entry.dsh_tools) ? entry.dsh_tools : [];
	if (!tools.every((t) => ACTIVATION_ALLOWED_TOOLS.includes(t))) reasons.push('nutzt Werkzeuge außerhalb der bereits erlaubten Menge');
	if (!(entry.authorizations || []).every((a) => ACTIVATION_ALLOWED_AUTHZ.includes(a))) reasons.push('verlangt eine nicht freigegebene Autorisierung');
	if (!(entry.output_targets || []).every((o) => ACTIVATION_ALLOWED_TARGETS.includes(o))) reasons.push('schreibt außerhalb der sicheren Ausgabeziele');
	if (!ACTIVATION_ALLOWED_HANDLERS.includes(entry.output_handler)) reasons.push('nutzt keinen freigegebenen generischen Handler');
	return reasons;
}

/**
 * Deterministic preflight BEFORE a trial: policy + schema + test-case coherence.
 * A pass promotes proposed -> trial. The builder must not set trial itself.
 * @returns {{ pass: boolean, reasons: string[] }}
 */
export function preflightProposal({ entry, schema, tests }) {
	const reasons = [];
	if (!schema || schema.type !== 'object') reasons.push('Ergebnis-Schema ist nicht objektgewurzelt');
	if (tests && tests.positive !== undefined) {
		if (validateAgainstSchema(schema, tests.positive).length > 0) reasons.push('Positiv-Testfall besteht das Schema nicht');
	} else reasons.push('kein Positiv-Testfall');
	if (tests && tests.negative !== undefined) {
		if (validateAgainstSchema(schema, tests.negative).length === 0) reasons.push('Negativ-Testfall wird fälschlich akzeptiert');
	} else reasons.push('kein Negativ-Testfall');
	reasons.push(...policyReasons(entry));
	return { pass: reasons.length === 0, reasons };
}

/** Deterministic gates over the TRIAL result. */
export function reviewGates({ entry, schema, resultStructured, toolsUsed }) {
	const reasons = [];
	const resultErrors = validateAgainstSchema(schema, resultStructured);
	if (resultErrors.length > 0) reasons.push(`Trial-Ergebnis verletzt das Capability-Schema (${resultErrors.length})`);
	if (!(Array.isArray(toolsUsed) ? toolsUsed : []).every((t) => ACTIVATION_ALLOWED_TOOLS.includes(t))) {
		reasons.push('Trial nutzte Werkzeuge außerhalb der erlaubten Menge');
	}
	reasons.push(...policyReasons(entry));
	return { pass: reasons.length === 0, reasons };
}

/**
 * Combine every activation precondition. Auto-activation requires the
 * deterministic preflight + trial success + deterministic trial gates + a
 * semantic reviewer verdict `approved` + no new tools/permissions.
 * @returns {{ activate: boolean, reasons: string[] }}
 */
export function combineActivation({ preflight, trialOk, gates, reviewerVerdict, entry, toolsUsed }) {
	const reasons = [];
	if (!preflight || !preflight.pass) reasons.push('deterministischer Preflight nicht bestanden');
	if (!trialOk) reasons.push('Trial nicht erfolgreich');
	if (!gates || !gates.pass) reasons.push('deterministische Trial-Gates nicht bestanden');
	if (reviewerVerdict !== 'approved') reasons.push(`semantischer Reviewer nicht approved (${reviewerVerdict ?? 'kein Verdikt'})`);
	reasons.push(...policyReasons(entry));
	if (!(Array.isArray(toolsUsed) ? toolsUsed : []).every((t) => ACTIVATION_ALLOWED_TOOLS.includes(t))) reasons.push('Lauf nutzte nicht freigegebene Werkzeuge');
	return { activate: reasons.length === 0, reasons };
}

async function flipStatus(ptsRoot, entry, next, event) {
	const versionDirRel = path.dirname(entry.instruction_file);
	const metaPath = path.join(ptsRoot, ...versionDirRel.split('/'), 'meta.yml');
	const text = await fsp.readFile(metaPath, 'utf8');
	await fsp.writeFile(metaPath, text.replace(/^(\s*)status:\s*\S+\s*$/m, `$1status: ${next}`), 'utf8');
	const logPath = path.join(ptsRoot, ...versionDirRel.split('/'), 'lifecycle.log');
	const rec = { at: new Date().toISOString(), event, task: entry.task, version: entry.capability_version, status: next };
	await fsp.appendFile(logPath, `${JSON.stringify(rec)}\n`, 'utf8').catch(() => {});
}

/** proposed -> trial after a successful deterministic preflight. */
export async function promoteToTrial(ptsRoot, entry) {
	await flipStatus(ptsRoot, entry, 'trial', 'promoted-to-trial');
}

/** trial -> active after all activation preconditions hold. */
export async function activateProposal(ptsRoot, entry) {
	await flipStatus(ptsRoot, entry, 'active', 'auto-activated');
}

/** proposed/trial -> revision-needed when review fails. */
export async function markRevisionNeeded(ptsRoot, entry) {
	await flipStatus(ptsRoot, entry, 'revision-needed', 'revision-needed');
}
