// Proof of the dynamic capability lifecycle: a capability that does NOT exist at
// start is proposed by the builder, tried through the GENERIC dispatcher,
// reviewed by deterministic gates, auto-activated, and then used again — with no
// new capability-specific JavaScript route and no dispatcher change. Uses a
// hermetic temp PTS root, the real capability files, and stub subagents.

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { createServiceCoordinator } from '../lib/service-coordinator.js';
import { loadCatalog, getCapability } from '../lib/capability-catalog.js';
import { loadCapabilityArtifacts } from '../lib/capability-loader.js';
import { reviewTrial, activateProposal } from '../lib/capability-review.js';
import { readExecutions } from '../lib/execution-log.js';

const REAL_ROOT = path.resolve(import.meta.dirname, '../../..');

// A minimal registry that only knows the builder capability at start.
const MINI_REGISTRY = [
	'version: 1',
	'capabilities:',
	'  - task: build_capability',
	'    capability_version: 1',
	'    service: worker',
	'    mode: draft',
	'    status: active',
	'    capability_file: capabilities/workers/README.md',
	'    instruction_file: capabilities/workers/build_capability.instruction.md',
	'    schema_file: capabilities/workers/build_capability.schema.json',
	'    authorizations:',
	'      - board_item',
	'    dsh_tools:',
	'      - read',
	'    result_schema: ptspace.capability-proposal/v1',
	'    output_handler: capability_proposal',
	'    output_targets:',
	'      - draft',
	'    model_hint: careful_reasoning',
	'    provenance: test',
	'',
].join('\n');

async function makeRoot() {
	const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pts-lifecycle-'));
	await fsp.mkdir(path.join(root, 'capabilities', 'workers'), { recursive: true });
	await fsp.writeFile(path.join(root, 'capabilities', 'registry.yml'), MINI_REGISTRY, 'utf8');
	for (const f of ['build_capability.instruction.md', 'build_capability.schema.json']) {
		await fsp.copyFile(path.join(REAL_ROOT, 'capabilities', 'workers', f), path.join(root, 'capabilities', 'workers', f));
	}
	const dir = path.join(root, 'workspace', 'testraum');
	await fsp.mkdir(dir, { recursive: true });
	return { root, dir };
}

// The new capability the builder will propose.
const NEW_SCHEMA = {
	type: 'object', additionalProperties: false, required: ['schema', 'note'],
	properties: { schema: { type: 'string', const: 'ptspace.echo_note/v1' }, note: { type: 'string' } },
};
const proposalStructured = {
	schema: 'ptspace.capability-proposal/v1',
	capability_id: 'echo_note',
	service: 'worker',
	mode: 'draft',
	purpose: 'Fasst eine kurze Notiz strukturiert zusammen.',
	allowed_tasks: 'eine Notiz strukturiert zurückgeben',
	forbidden_tasks: 'keine Entscheidungen, kein Material',
	dsh_tools: ['read'],
	output_handler: 'generic',
	model_hint: 'cheap_fast',
	authorizations: ['board_item'],
	instruction_persona: 'Du gibst eine Notiz strukturiert zurück.',
	instruction_prompt: '# Notiz\n{{note_in}}',
	result_schema_json: JSON.stringify(NEW_SCHEMA),
	test_positive_json: JSON.stringify({ schema: 'ptspace.echo_note/v1', note: 'ok' }),
	test_negative_json: JSON.stringify({ schema: 'ptspace.echo_note/v1' }),
	provenance: 'trial proof',
};
const echoResult = { schema: 'ptspace.echo_note/v1', note: 'aus dem Lauf' };

const researchConfig = { enabled: true, provider: 'p', model: 'm', maxTokens: 4096, runTimeoutMs: 60000, allowedTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch'], source: 'patch-row' };

// One stub subagent runtime for the WHOLE flow. It returns the right structured
// output based on the requested outputSchema — the builder gets a proposal, the
// echo_note capability gets an echo. Counts children per dispatch.
function makeStub(counter) {
	return {
		start: async (_provider, request) => {
			counter.count += 1;
			counter.tools.push([...(request.toolFilter?.allow || [])]);
			const isBuilder = Boolean(request.outputSchema?.properties?.capability_id);
			const structured = isBuilder ? proposalStructured : echoResult;
			return { id: `child-${counter.count}`, result: Promise.resolve({ stopReason: 'completed', structured }), dispose: async () => {} };
		},
	};
}

async function ctx(root, dir, task, extraScope = {}) {
	const catalog = await loadCatalog(root);
	return {
		dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, childSessionIds: new Set(),
		researchConfig, ptsRoot: root, registry: catalog,
		intents: [{ task, reason: 'Bedarf', authorization: { type: 'implied_bounded_request', evidence: 'm2' }, scope: { need: 'kurze Notiz', service: 'worker', ...extraScope }, return_to: 'critical_friend' }],
	};
}

test('Builder → Trial → Review → Auto-Aktivierung → erneuter Lauf, ohne neue JS-Route', async () => {
	const { root, dir } = await makeRoot();
	const counter = { count: 0, tools: [] };
	const dispatcher = createServiceCoordinator({ subagents: makeStub(counter), jobs: undefined });

	// 0. echo_note existiert zu Beginn NICHT.
	assert.equal(getCapability(await loadCatalog(root), 'echo_note'), undefined);

	// 1./2. Bedarf -> Builder erstellt ein Capability Proposal (über den generischen Dispatcher).
	const built = await dispatcher.handle(await ctx(root, dir, 'build_capability'));
	assert.equal(built[0].outcome.status, 'completed-research');
	const proposalDir = path.join(root, 'capabilities', '_proposals', 'worker', 'echo_note', 'v1');
	assert.ok(await fsp.stat(path.join(proposalDir, 'meta.yml')).then(() => true, () => false), 'meta.yml materialisiert');

	// 3. Der Katalog kennt echo_note jetzt als trial.
	let catalog = await loadCatalog(root);
	let echo = getCapability(catalog, 'echo_note');
	assert.ok(echo, 'echo_note im Katalog');
	assert.equal(echo.status, 'trial');

	// 3b. Trial-Lauf über DENSELBEN generischen Dispatcher.
	const trial = await dispatcher.handle(await ctx(root, dir, 'echo_note', { note_in: 'hallo' }));
	assert.equal(trial[0].outcome.status, 'completed-research');
	assert.ok(await fsp.stat(path.join(dir, 'drafts', `echo_note-${trial[0].key.split('::')[2]}.md`)).then(() => true, () => false).catch(() => true) !== false);

	// 4. Getrennter Reviewer: deterministische Gates.
	const art = await loadCapabilityArtifacts(root, echo);
	const tests = JSON.parse(await fsp.readFile(path.join(proposalDir, 'tests.json'), 'utf8'));
	const review = reviewTrial({ entry: echo, schema: art.schema, resultStructured: echoResult, toolsUsed: ['read'], tests });
	assert.equal(review.pass, true, `Review-Gründe: ${review.reasons.join('; ')}`);
	assert.equal(review.autoActivate, true);

	// 5. Auto-Aktivierung (nur erlaubte Tools/Rechte) -> active, Version nicht überschrieben.
	await activateProposal(root, echo);
	catalog = await loadCatalog(root);
	echo = getCapability(catalog, 'echo_note');
	assert.equal(echo.status, 'active');
	assert.ok(await fsp.stat(path.join(proposalDir, 'activation.log')).then(() => true, () => false), 'activation.log geschrieben');

	// 6. Zweiter passender Auftrag über die nun AKTIVE Capability.
	const childrenBefore = counter.count;
	const second = await dispatcher.handle(await ctx(root, dir, 'echo_note', { note_in: 'welt', topic: 'zweiter' }));
	assert.equal(second[0].outcome.status, 'completed-research');
	assert.equal(counter.count, childrenBefore + 1, 'genau ein weiterer DSH-Child');

	// 7. Execution-Log verbindet Capability-ID/Version mit jedem Lauf.
	const execs = await readExecutions(dir);
	assert.ok(execs.some((e) => e.capability === 'build_capability'));
	assert.ok(execs.some((e) => e.capability === 'echo_note' && e.capability_version === 1));
});
