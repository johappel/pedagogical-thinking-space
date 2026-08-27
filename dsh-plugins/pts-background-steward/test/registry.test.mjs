// Tests for pts-background-steward/lib/registry.js — the single routing source.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
	parseRegistryYaml,
	validateRegistry,
	loadRegistry,
	getCapability,
	dispatchableTasks,
	dispatchableTasksForService,
	isDispatchable,
} from '../lib/registry.js';

const PTS_ROOT = path.resolve(import.meta.dirname, '../../..');

test('parseRegistryYaml liest Skalare und einfache Listen', () => {
	const reg = parseRegistryYaml([
		'version: 1',
		'capabilities:',
		'  - task: verify_curriculum_alignment',
		'    capability_version: 2',
		'    service: knowledge',
		'    status: active',
		'    capability_file: capabilities/knowledge/VERIFY_CURRICULUM_ALIGNMENT.md',
		'    instruction_file: capabilities/knowledge/verify_curriculum_alignment.instruction.md',
		'    schema_file: capabilities/knowledge/verify_curriculum_alignment.schema.json',
		'    authorizations:',
		'      - implied_bounded_request',
		'    dsh_tools:',
		'      - web_search',
		'      - web_fetch',
		'    result_schema: ptspace.curriculum-alignment-brief/v2',
		'    output_handler: curriculum_alignment',
	].join('\n'));
	assert.equal(reg.version, 1);
	assert.equal(reg.capabilities.length, 1);
	const c = reg.capabilities[0];
	assert.equal(c.task, 'verify_curriculum_alignment');
	assert.equal(c.capability_version, 2);
	assert.deepEqual(c.dsh_tools, ['web_search', 'web_fetch']);
	assert.deepEqual(c.authorizations, ['implied_bounded_request']);
});

test('validateRegistry lehnt doppelte task-ids und unzulässige Werte ab', () => {
	const bad = { version: 1, capabilities: [
		{ task: 'x', service: 'knowledge', status: 'active', capability_file: 'capabilities/x.md', authorizations: ['implied_bounded_request'], dsh_tools: [], result_schema: '', output_handler: '' },
	] };
	const r = validateRegistry(bad);
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('dsh_tools')));
});

test('die reale Registry lädt und validiert', async () => {
	const reg = await loadRegistry(PTS_ROOT);
	assert.equal(reg.version, 1);
	const vca = getCapability(reg, 'verify_curriculum_alignment');
	assert.ok(vca, 'verify_curriculum_alignment fehlt');
	assert.equal(vca.status, 'active');
	assert.equal(vca.service, 'knowledge');
	assert.deepEqual(vca.dsh_tools, ['web_search', 'web_fetch']);
	assert.equal(isDispatchable(vca), true);
	assert.equal(vca.capability_version, 2);
	assert.match(vca.instruction_file, /instruction\.md$/);
	assert.match(vca.schema_file, /schema\.json$/);
});

test('nur verify_curriculum_alignment ist derzeit als knowledge dispatchbar', async () => {
	const reg = await loadRegistry(PTS_ROOT);
	assert.deepEqual(dispatchableTasksForService(reg, 'knowledge'), ['verify_curriculum_alignment']);
	// Worker-Capabilities sind noch `proposed` (kein DSH-Executor).
	assert.equal(dispatchableTasks(reg).includes('research_pedagogical_alternatives'), false);
});
