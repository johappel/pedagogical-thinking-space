// Proof of the dynamic capability lifecycle through the SAME generic dispatcher:
// a meaningful, low-risk, prompt/schema-only capability that does NOT exist at
// start is proposed by the builder subagent, deterministically preflighted to
// trial, tried, reviewed by a SEPARATE reviewer subagent, and only then
// auto-activated — after which a normal request uses it. Controlled LLM edge
// (stub subagents); the real DSH-agent variant lives in dsh-agents-e2e.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';

import { createServiceCoordinator } from '../lib/service-coordinator.js';
import { loadCatalog, getCapability } from '../lib/capability-catalog.js';
import { runCapabilityLifecycle } from '../lib/capability-lifecycle.js';
import { promoteToTrial } from '../lib/capability-review.js';
import { readExecutions } from '../lib/execution-log.js';

const REAL_ROOT = path.resolve(import.meta.dirname, '../../..');
const LIB_DIR = path.resolve(import.meta.dirname, '../lib');

const MINI_REGISTRY = [
	'version: 1', 'capabilities:',
	'  - task: build_capability', '    capability_version: 1', '    service: worker', '    mode: draft', '    status: active',
	'    capability_file: capabilities/workers/README.md',
	'    instruction_file: capabilities/workers/build_capability.instruction.md',
	'    schema_file: capabilities/workers/build_capability.schema.json',
	'    authorizations:', '      - board_item', '    dsh_tools:', '      - read',
	'    result_schema: ptspace.capability-proposal/v1', '    output_handler: capability_proposal',
	'    output_targets:', '      - draft', '    model_hint: careful_reasoning', '    provenance: test',
	'  - task: review_capability', '    capability_version: 1', '    service: worker', '    mode: review', '    status: active',
	'    capability_file: capabilities/workers/README.md',
	'    instruction_file: capabilities/workers/review_capability.instruction.md',
	'    schema_file: capabilities/workers/review_capability.schema.json',
	'    authorizations:', '      - board_item', '    dsh_tools:', '      - read',
	'    result_schema: ptspace.capability-review/v1', '    output_handler: capability_review',
	'    output_targets:', '      - draft', '    model_hint: careful_reasoning', '    provenance: test', '',
].join('\n');

async function makeRoot() {
	const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pts-lc2-'));
	await fsp.mkdir(path.join(root, 'capabilities', 'workers'), { recursive: true });
	await fsp.writeFile(path.join(root, 'capabilities', 'registry.yml'), MINI_REGISTRY, 'utf8');
	for (const f of ['build_capability.instruction.md', 'build_capability.schema.json', 'review_capability.instruction.md', 'review_capability.schema.json']) {
		await fsp.copyFile(path.join(REAL_ROOT, 'capabilities', 'workers', f), path.join(root, 'capabilities', 'workers', f));
	}
	const dir = path.join(root, 'workspace', 'testraum');
	await fsp.mkdir(dir, { recursive: true });
	await fsp.writeFile(path.join(dir, 'learning-design.md'), '# LD\nOffene Frage: Wozu Religion in der Schule?', 'utf8');
	return { root, dir };
}

const NEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['schema', 'open_questions'], properties: { schema: { type: 'string', const: 'ptspace.extract_open_questions/v1' }, open_questions: { type: 'array', items: { type: 'string' } } } };
const proposal = {
	schema: 'ptspace.capability-proposal/v1', capability_id: 'extract_open_questions', service: 'worker', mode: 'draft',
	purpose: 'Extrahiert offene Fragen aus dem Learning Design.', allowed_tasks: 'offene Fragen auflisten', forbidden_tasks: 'keine Entscheidungen',
	dsh_tools: ['read'], output_handler: 'generic', model_hint: 'careful_reasoning', authorizations: ['board_item'],
	instruction_persona: 'Du extrahierst offene Fragen aus dem Learning Design.', instruction_prompt: '# Learning Design\n{{topic}}\nListe die offenen Fragen.',
	result_schema_json: JSON.stringify(NEW_SCHEMA),
	test_positive_json: JSON.stringify({ schema: 'ptspace.extract_open_questions/v1', open_questions: ['Wozu Religion?'] }),
	test_negative_json: JSON.stringify({ schema: 'ptspace.extract_open_questions/v1' }),
	provenance: 'lifecycle proof',
};
const trialResult = { schema: 'ptspace.extract_open_questions/v1', open_questions: ['Wozu Religion in der Schule?'] };
const reviewApproved = { schema: 'ptspace.capability-review/v1', verdict: 'approved', reasons: ['bleibt im Worker-Service, nur read'] };

const researchConfig = { enabled: true, provider: 'p', model: 'm', maxTokens: 4096, runTimeoutMs: 60000, allowedTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch'], source: 'patch-row' };

function kindOf(request) {
	const props = request.outputSchema && request.outputSchema.properties;
	if (props && props.capability_id) return 'builder';
	if (props && props.verdict) return 'reviewer';
	return 'capability';
}
function makeStub(children) {
	return {
		start: async (_provider, request) => {
			const kind = kindOf(request);
			const id = `child-${children.length + 1}-${kind}`;
			children.push({ id, kind, tools: [...(request.toolFilter?.allow || [])] });
			const structured = kind === 'builder' ? proposal : (kind === 'reviewer' ? reviewApproved : trialResult);
			return { id, result: Promise.resolve({ stopReason: 'completed', structured }), dispose: async () => {} };
		},
	};
}

async function hashLib() {
	const files = (await fsp.readdir(LIB_DIR)).filter((f) => f.endsWith('.js')).sort();
	const h = createHash('sha256');
	for (const f of files) h.update(f).update(await fsp.readFile(path.join(LIB_DIR, f)));
	return { files, hash: h.digest('hex') };
}
async function readStatus(root, entry) {
	const meta = await fsp.readFile(path.join(root, ...path.dirname(entry.instruction_file).split('/'), 'meta.yml'), 'utf8');
	return meta.match(/^\s*status:\s*(\S+)\s*$/m)[1];
}
async function readLifecycleEvents(root, entry) {
	const p = path.join(root, ...path.dirname(entry.instruction_file).split('/'), 'lifecycle.log');
	const text = await fsp.readFile(p, 'utf8');
	return text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).event);
}

test('Builder→Preflight→Trial→Reviewer→Auto-Aktivierung→aktiver Lauf; getrennte Sessions, Reihenfolge, keine neue JS-Route', async () => {
	const { root, dir } = await makeRoot();
	const children = [];
	const coordinator = createServiceCoordinator({ subagents: makeStub(children), jobs: undefined });
	const baseCtx = { dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, childSessionIds: new Set(), researchConfig };
	const libBefore = await hashLib();

	// 0. existiert nicht.
	assert.equal(getCapability(await loadCatalog(root), 'extract_open_questions'), undefined);

	// 1.-6. Vollständiger Lebenszyklus über den Companion/Dispatcher-Seam.
	const report = await runCapabilityLifecycle({ coordinator, baseCtx, ptsRoot: root, build: { need: 'offene Fragen extrahieren', service: 'worker', purpose: proposal.purpose, trialScope: { topic: 'LD' } } });
	assert.equal(report.result, 'activated', `Report: ${JSON.stringify(report.steps)}`);
	assert.equal(report.finalStatus, 'active');
	assert.equal(report.task, 'extract_open_questions');
	assert.equal(report.capability_version, 1);

	// proposed -> trial -> active in dieser Reihenfolge.
	const entry = getCapability(await loadCatalog(root), 'extract_open_questions');
	assert.deepEqual(await readLifecycleEvents(root, entry), ['promoted-to-trial', 'auto-activated']);

	// Builder-Child und Reviewer-Child sind unterschiedliche Sessions.
	const builder = children.find((c) => c.kind === 'builder');
	const reviewer = children.find((c) => c.kind === 'reviewer');
	assert.ok(builder && reviewer && builder.id !== reviewer.id, 'Builder- und Reviewer-Session sind getrennt');

	// 6. Zweiter, NORMALER Auftrag über die nun aktive Capability (kein allowTrial).
	const catalog = await loadCatalog(root);
	const normal = await coordinator.handle({ ...baseCtx, intents: [{ task: 'extract_open_questions', reason: 'nochmal', authorization: { type: 'implied_bounded_request', evidence: 'm2' }, scope: { topic: 'LD2' }, return_to: 'critical_friend' }], ptsRoot: root, registry: catalog });
	assert.equal(normal[0].outcome.status, 'completed-research');

	// Keine neue capability-spezifische JS-Datei zwischen Erzeugung und zweitem Lauf.
	const libAfter = await hashLib();
	assert.deepEqual(libAfter.files, libBefore.files, 'keine JS-Datei ergänzt/entfernt');
	assert.equal(libAfter.hash, libBefore.hash, 'keine lib/*.js-Datei verändert');

	// Execution-Log verbindet Capability-ID/Version über alle Läufe.
	const execs = await readExecutions(dir);
	assert.ok(execs.some((e) => e.capability === 'build_capability'));
	assert.ok(execs.some((e) => e.capability === 'review_capability'));
	const runs = execs.filter((e) => e.capability === 'extract_open_questions' && e.capability_version === 1);
	assert.ok(runs.length >= 2, 'Trial + aktiver Lauf im Log');
});

test('normale Requests nutzen proposed/trial NICHT wie aktive Capabilities', async () => {
	const { root, dir } = await makeRoot();
	const children = [];
	const coordinator = createServiceCoordinator({ subagents: makeStub(children), jobs: undefined });
	const baseCtx = { dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, childSessionIds: new Set(), researchConfig };
	const normalIntent = { task: 'extract_open_questions', reason: 'x', authorization: { type: 'implied_bounded_request', evidence: 'm2' }, scope: { topic: 'LD' }, return_to: 'critical_friend' };

	// Vor dem Build: unbekannt.
	let r = await coordinator.handle({ ...baseCtx, intents: [normalIntent], ptsRoot: root, registry: await loadCatalog(root) });
	assert.equal(r[0].status, 'no-capability');

	// Build -> proposed. Normaler Request: proposed ist NICHT dispatchbar.
	const built = await coordinator.handle({ ...baseCtx, intents: [{ task: 'build_capability', reason: 'need', authorization: { type: 'implied_bounded_request', evidence: 'm2' }, scope: { need: 'x', service: 'worker' }, return_to: 'critical_friend' }], ptsRoot: root, registry: await loadCatalog(root) });
	const entry = getCapability(await loadCatalog(root), 'extract_open_questions');
	assert.equal(entry.status, 'proposed');
	r = await coordinator.handle({ ...baseCtx, intents: [normalIntent], ptsRoot: root, registry: await loadCatalog(root) });
	assert.equal(r[0].status, 'no-capability');

	// Promote to trial. Normaler Request (kein allowTrial): not-active.
	await promoteToTrial(root, entry);
	r = await coordinator.handle({ ...baseCtx, intents: [normalIntent], ptsRoot: root, registry: await loadCatalog(root) });
	assert.equal(r[0].status, 'not-active');

	// Nur mit allowTrial (kontrollierter Trial) läuft sie.
	r = await coordinator.handle({ ...baseCtx, intents: [normalIntent], ptsRoot: root, registry: await loadCatalog(root), allowTrial: true });
	assert.equal(r[0].outcome.status, 'completed-research');
	assert.ok(built[0].outcome.proposalEntry);
});
