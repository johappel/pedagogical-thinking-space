// pts-background-steward — trial reviewer + bounded auto-activation.
//
// A trial capability's result is reviewed by DETERMINISTIC gates (a separate
// step from execution). Auto-activation trial -> active is allowed ONLY when the
// capability uses exclusively already-permitted tools and permissions and stays
// inside the safe output targets. New tools/plugins, external writes, sensitive
// data or runtime code keep the capability at trial and require human approval.
//
// Capability versions are never overwritten: activation flips THIS version's
// status to `active` and appends a traceable activation record.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { validateAgainstSchema } from './output-handlers.js';

// Tools already granted to the research route — the only ones eligible for
// hands-off auto-activation.
export const ACTIVATION_ALLOWED_TOOLS = Object.freeze(['read', 'glob', 'grep', 'web_search', 'web_fetch']);
export const ACTIVATION_ALLOWED_AUTHZ = Object.freeze(['board_item', 'bounded_session', 'implied_bounded_request', 'explicit_chat']);
export const ACTIVATION_ALLOWED_TARGETS = Object.freeze(['draft', 'knowledge_proposal']);

/**
 * Deterministic review gates over a trial run.
 * @param {object} args
 * @param {object} args.entry - the trial capability entry
 * @param {object} args.schema - the loaded result schema (object-rooted)
 * @param {unknown} args.resultStructured - the trial run's structured result
 * @param {string[]} args.toolsUsed - tools the child was actually allowed/used
 * @param {object} args.tests - { positive, negative }
 * @returns {{ pass: boolean, autoActivate: boolean, reasons: string[] }}
 */
export function reviewTrial({ entry, schema, resultStructured, toolsUsed, tests }) {
	const reasons = [];
	// Gate 1: the trial result validates against the capability's own schema.
	const resultErrors = validateAgainstSchema(schema, resultStructured);
	if (resultErrors.length > 0) reasons.push(`Ergebnis verletzt das Capability-Schema (${resultErrors.length})`);
	// Gate 2: positive test validates, negative test does not.
	if (tests && tests.positive !== undefined) {
		if (validateAgainstSchema(schema, tests.positive).length > 0) reasons.push('Positiv-Testfall besteht das Schema nicht');
	} else {
		reasons.push('kein Positiv-Testfall');
	}
	if (tests && tests.negative !== undefined) {
		if (validateAgainstSchema(schema, tests.negative).length === 0) reasons.push('Negativ-Testfall wird fälschlich akzeptiert');
	} else {
		reasons.push('kein Negativ-Testfall');
	}
	const pass = reasons.length === 0;

	// Auto-activation eligibility: only already-allowed tools/permissions/targets.
	const tools = Array.isArray(entry.dsh_tools) ? entry.dsh_tools : [];
	const usedOk = (Array.isArray(toolsUsed) ? toolsUsed : []).every((t) => ACTIVATION_ALLOWED_TOOLS.includes(t));
	const toolsOk = tools.every((t) => ACTIVATION_ALLOWED_TOOLS.includes(t));
	const authzOk = (entry.authorizations || []).every((a) => ACTIVATION_ALLOWED_AUTHZ.includes(a));
	const targetsOk = (entry.output_targets || []).every((o) => ACTIVATION_ALLOWED_TARGETS.includes(o));
	const handlerOk = entry.output_handler === 'generic' || entry.output_handler === 'draft';
	const escalations = [];
	if (!toolsOk || !usedOk) escalations.push('nutzt Werkzeuge außerhalb der bereits erlaubten Menge');
	if (!authzOk) escalations.push('verlangt eine nicht freigegebene Autorisierung');
	if (!targetsOk) escalations.push('schreibt außerhalb der sicheren Ausgabeziele');
	if (!handlerOk) escalations.push('nutzt keinen freigegebenen generischen Handler');
	if (escalations.length > 0) reasons.push(`Auto-Aktivierung nicht zulässig: ${escalations.join('; ')}`);
	const autoActivate = pass && escalations.length === 0;

	return { pass: pass && autoActivate, autoActivate, reasons };
}

/**
 * Flip a trial capability version to `active` and append an activation record.
 * Never overwrites the contract; only the lifecycle status of this version.
 * @param {string} ptsRoot
 * @param {object} entry - the trial capability entry (needs instruction_file path root)
 */
export async function activateProposal(ptsRoot, entry) {
	// The version dir is the parent of the instruction_file.
	const versionDirRel = path.dirname(entry.instruction_file); // capabilities/_proposals/<service>/<id>/vN
	const metaPath = path.join(ptsRoot, ...versionDirRel.split('/'), 'meta.yml');
	const text = await fsp.readFile(metaPath, 'utf8');
	const next = text.replace(/^(\s*)status:\s*\S+\s*$/m, `$1status: active`);
	await fsp.writeFile(metaPath, next, 'utf8');
	const activationPath = path.join(ptsRoot, ...versionDirRel.split('/'), 'activation.log');
	const rec = { at: new Date().toISOString(), event: 'auto-activated', task: entry.task, version: entry.capability_version, by: 'deterministic-review-gates' };
	await fsp.appendFile(activationPath, `${JSON.stringify(rec)}\n`, 'utf8').catch(() => {});
}
