// pts-background-steward — capability lifecycle orchestrator.
//
// This is the COMPANION/DISPATCHER seam for capability authoring, NOT a steward
// responsibility. The Background Steward only maintains the Denkstand; it never
// builds, tries, reviews or activates capabilities and never proposes the meta
// capabilities. When a needed capability is missing, the Companion/dispatcher
// invokes this orchestrator, which drives the whole lifecycle through the SAME
// generic dispatcher and the SAME canonical service-request lifecycle:
//
//   build_capability (subagent)  -> proposal materialized as `proposed`
//   deterministic preflight       -> proposed -> trial
//   trial run (generic dispatch)  -> trial result
//   deterministic trial gates
//   review_capability (subagent)  -> semantic verdict
//   combined activation gate      -> trial -> active   (or revision-needed)
//
// No per-capability JavaScript is added: the built capability is prompt/schema
// only and runs through the generic `output_handler`.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { loadCatalog, getCapability } from './capability-catalog.js';
import { loadCapabilityArtifacts } from './capability-loader.js';
import {
	preflightProposal, reviewGates, combineActivation,
	promoteToTrial, activateProposal, markRevisionNeeded,
} from './capability-review.js';

async function readTests(ptsRoot, entry) {
	const versionDirRel = path.dirname(entry.instruction_file);
	try {
		const text = await fsp.readFile(path.join(ptsRoot, ...versionDirRel.split('/'), 'tests.json'), 'utf8');
		return JSON.parse(text);
	} catch {
		return { positive: undefined, negative: undefined };
	}
}

/**
 * Drive the full capability lifecycle. Each dispatch runs through the provided
 * dispatcher (coordinator.handle) so builder, trial and reviewer are all native
 * DSH subagents on the same generic path.
 *
 * @param {object} ports
 * @param {object} ports.coordinator - the generic dispatcher (createServiceCoordinator)
 * @param {object} ports.baseCtx - { dir, slug, sessionId, parentAgent, childSessionIds, researchConfig }
 * @param {string} ports.ptsRoot
 * @param {object} ports.build - { need, service, purpose, trialScope }
 * @returns {Promise<object>} lifecycle report
 */
export async function runCapabilityLifecycle(ports) {
	const { coordinator, baseCtx, ptsRoot, build } = ports;
	const dispatch = async (task, scope, opts = {}) => {
		const catalog = await loadCatalog(ptsRoot);
		const intents = [{
			task,
			reason: build.need,
			authorization: { type: 'implied_bounded_request', evidence: 'm-companion' },
			scope,
			return_to: 'critical_friend',
		}];
		const results = await coordinator.handle({ ...baseCtx, intents, ptsRoot, registry: catalog, allowTrial: opts.allowTrial === true });
		return results[0];
	};

	const report = { steps: [] };

	// 1. Builder subagent -> proposal materialized as `proposed`.
	const built = await dispatch('build_capability', { need: build.need, service: build.service, purpose: build.purpose });
	report.steps.push({ step: 'build', status: built.status, capability: built.outcome && built.outcome.proposalEntry && built.outcome.proposalEntry.task });
	const proposedEntry = built.outcome && built.outcome.proposalEntry;
	if (!proposedEntry) { report.result = 'build-failed'; return report; }

	// 2. Deterministic preflight -> proposed -> trial.
	let catalog = await loadCatalog(ptsRoot);
	let entry = getCapability(catalog, proposedEntry.task);
	const art = await loadCapabilityArtifacts(ptsRoot, entry);
	const tests = await readTests(ptsRoot, entry);
	const preflight = preflightProposal({ entry, schema: art.schema, tests });
	report.steps.push({ step: 'preflight', pass: preflight.pass, status: entry.status, reasons: preflight.reasons });
	if (!preflight.pass) { await markRevisionNeeded(ptsRoot, entry); report.result = 'preflight-failed'; return report; }
	await promoteToTrial(ptsRoot, entry);

	// 3. Trial run through the generic dispatcher.
	catalog = await loadCatalog(ptsRoot);
	entry = getCapability(catalog, proposedEntry.task);
	report.steps.push({ step: 'promoted', status: entry.status });
	const trial = await dispatch(entry.task, { ...(build.trialScope || {}) }, { allowTrial: true });
	const trialOk = trial.status === 'completed-research';
	const trialStructured = trial.outcome && trial.outcome.structured;
	report.steps.push({ step: 'trial', status: trial.status, capability_version: entry.capability_version });

	// 4. Deterministic trial gates.
	const gates = reviewGates({ entry, schema: art.schema, resultStructured: trialStructured, toolsUsed: entry.dsh_tools });
	report.steps.push({ step: 'gates', pass: gates.pass, reasons: gates.reasons });

	// 5. Semantic reviewer subagent -> verdict.
	const review = await dispatch('review_capability', {
		capability_id: entry.task,
		service: entry.service,
		purpose: build.purpose,
		proposal_summary: `${entry.task} v${entry.capability_version}, Tools ${(entry.dsh_tools || []).join(', ')}`,
		trial_result: JSON.stringify(trialStructured || {}),
	});
	const verdict = review.outcome && review.outcome.reviewVerdict;
	report.steps.push({ step: 'review', status: review.status, verdict });

	// 6. Combined activation gate.
	const decision = combineActivation({ preflight, trialOk, gates, reviewerVerdict: verdict, entry, toolsUsed: entry.dsh_tools });
	report.steps.push({ step: 'decision', activate: decision.activate, reasons: decision.reasons });
	if (decision.activate) {
		await activateProposal(ptsRoot, entry);
		report.result = 'activated';
	} else {
		await markRevisionNeeded(ptsRoot, entry);
		report.result = 'revision-needed';
	}
	catalog = await loadCatalog(ptsRoot);
	report.finalStatus = getCapability(catalog, proposedEntry.task).status;
	report.task = entry.task;
	report.capability_version = entry.capability_version;
	return report;
}
