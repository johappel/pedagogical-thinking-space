// pts-background-steward — capability builder materializer.
//
// The BUILDER itself is a native DSH subagent (dispatched through the generic
// dispatcher as the `build_capability` capability); this module only turns its
// structured Capability Proposal into a versioned set of files under
// capabilities/_proposals/<service>/<capability-id>/v<N>/, at status `trial`.
// Nested JSON (the new capability's result schema and its test cases) travels
// as JSON STRING fields so the builder's own outputSchema stays inside the DSH
// enforced subset.
//
// Capability versions are never overwritten: a new build writes a new vN folder.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const CAPABILITY_PROPOSAL_SCHEMA_VERSION = 'ptspace.capability-proposal/v1';

// The builder subagent's outputSchema is loaded at runtime from
// capabilities/workers/build_capability.schema.json (not duplicated here).

function isPlainObject(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function yamlScalar(value) {
	const s = String(value ?? '');
	return /[:#\-?{}[\],&*!|>'"%@`\n]/.test(s) || s.trim() !== s || s === '' ? JSON.stringify(s) : s;
}

function proposalDir(ptsRoot, service, capId, version) {
	return path.join(ptsRoot, 'capabilities', '_proposals', service, capId, `v${version}`);
}

function metaYaml(entry) {
	const lines = [
		'version: 1',
		'capabilities:',
		`  - task: ${yamlScalar(entry.task)}`,
		`    capability_version: ${entry.capability_version}`,
		`    service: ${yamlScalar(entry.service)}`,
		`    mode: ${yamlScalar(entry.mode)}`,
		`    status: ${yamlScalar(entry.status)}`,
		`    instruction_file: ${yamlScalar(entry.instruction_file)}`,
		`    schema_file: ${yamlScalar(entry.schema_file)}`,
		'    authorizations:',
		...entry.authorizations.map((a) => `      - ${yamlScalar(a)}`),
		'    dsh_tools:',
		...entry.dsh_tools.map((t) => `      - ${yamlScalar(t)}`),
		`    result_schema: ${yamlScalar(entry.result_schema)}`,
		`    output_handler: ${yamlScalar(entry.output_handler)}`,
		'    output_targets:',
		...entry.output_targets.map((o) => `      - ${yamlScalar(o)}`),
		`    model_hint: ${yamlScalar(entry.model_hint)}`,
		`    provenance: ${yamlScalar(entry.provenance)}`,
		'',
	];
	return lines.join('\n');
}

/**
 * Validate + materialize a Capability Proposal into a versioned proposal folder
 * at status `trial`. Returns the created capability entry and its test cases.
 * @param {string} ptsRoot
 * @param {object} proposal - the builder subagent's structured output
 * @param {object} [opts]
 * @param {number} [opts.version=1]
 * @returns {Promise<{ entry: object, tests: object, dir: string, errors?: string[] }>}
 */
export async function materializeProposal(ptsRoot, proposal, opts = {}) {
	const version = Number(opts.version) || 1;
	const errors = [];
	if (!isPlainObject(proposal)) return { errors: ['proposal ist kein Objekt'] };
	if (proposal.schema !== CAPABILITY_PROPOSAL_SCHEMA_VERSION) errors.push('proposal.schema unzulässig');
	const capId = String(proposal.capability_id || '').trim();
	if (!/^[a-z][a-z0-9_]{2,60}$/.test(capId)) errors.push('capability_id muss snake_case sein');
	const service = String(proposal.service || '').trim();
	if (!['knowledge', 'worker', 'renderer', 'review', 'memory'].includes(service)) errors.push('service unzulässig');
	if (typeof proposal.instruction_persona !== 'string' || proposal.instruction_persona.trim() === '') errors.push('instruction_persona fehlt');
	if (typeof proposal.instruction_prompt !== 'string' || proposal.instruction_prompt.trim() === '') errors.push('instruction_prompt fehlt');
	let resultSchema; let testPos; let testNeg;
	try { resultSchema = JSON.parse(proposal.result_schema_json); } catch { errors.push('result_schema_json ist kein gültiges JSON'); }
	try { testPos = JSON.parse(proposal.test_positive_json); } catch { errors.push('test_positive_json ist kein gültiges JSON'); }
	try { testNeg = JSON.parse(proposal.test_negative_json); } catch { errors.push('test_negative_json ist kein gültiges JSON'); }
	if (resultSchema && (!isPlainObject(resultSchema) || resultSchema.type !== 'object')) errors.push('result_schema ist kein objektgewurzeltes Schema');
	if (errors.length > 0) return { errors };

	const dir = proposalDir(ptsRoot, service, capId, version);
	const rel = (name) => `capabilities/_proposals/${service}/${capId}/v${version}/${name}`;
	const schemaVersion = (resultSchema.properties && resultSchema.properties.schema && resultSchema.properties.schema.const) || `ptspace.${capId}/v${version}`;

	const instruction = `## Persona\n\n${proposal.instruction_persona.trim()}\n\n## Prompt\n\n${proposal.instruction_prompt.trim()}\n`;
	const schemaDoc = JSON.stringify({ schema_version: schemaVersion, schema: resultSchema }, null, 2);
	const tests = { positive: testPos, negative: testNeg };

	const entry = {
		task: capId,
		capability_version: version,
		service,
		mode: String(proposal.mode || 'draft'),
		status: 'proposed',
		instruction_file: rel('instruction.md'),
		schema_file: rel('schema.json'),
		authorizations: Array.isArray(proposal.authorizations) && proposal.authorizations.length > 0 ? proposal.authorizations : ['board_item'],
		dsh_tools: Array.isArray(proposal.dsh_tools) ? proposal.dsh_tools : [],
		result_schema: schemaVersion,
		output_handler: String(proposal.output_handler || 'generic'),
		output_targets: ['draft'],
		model_hint: String(proposal.model_hint || 'careful_reasoning'),
		provenance: String(proposal.provenance || 'capability builder'),
	};

	await fsp.mkdir(dir, { recursive: true });
	await fsp.writeFile(path.join(dir, 'instruction.md'), instruction, 'utf8');
	await fsp.writeFile(path.join(dir, 'schema.json'), schemaDoc, 'utf8');
	await fsp.writeFile(path.join(dir, 'tests.json'), JSON.stringify(tests, null, 2), 'utf8');
	await fsp.writeFile(path.join(dir, 'meta.yml'), metaYaml(entry), 'utf8');
	return { entry, tests, dir };
}
