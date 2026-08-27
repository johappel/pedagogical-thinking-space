// Tests for pts-background-steward/lib/capability-loader.js

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { parseInstruction, denominationLine, interpolatePrompt, loadCapabilityArtifacts } from '../lib/capability-loader.js';
import { loadRegistry, getCapability } from '../lib/registry.js';

const PTS_ROOT = path.resolve(import.meta.dirname, '../../..');

test('parseInstruction trennt Persona und Prompt (Prompt behält eigene ##-Überschriften)', () => {
	const { persona, promptTemplate } = parseInstruction([
		'<!-- comment -->', '', '## Persona', 'Du bist X.', 'Regel.', '',
		'## Prompt', '# Titel', '## Rahmen', '- Fach: {{subject}}',
	].join('\n'));
	assert.match(persona, /Du bist X\./);
	assert.doesNotMatch(persona, /Titel/);
	assert.match(promptTemplate, /## Rahmen/);
	assert.match(promptTemplate, /\{\{subject\}\}/);
});

test('denominationLine: unbekannt -> beide Konfessionen, nicht blockierend', () => {
	assert.match(denominationLine('unknown'), /evangelische UND katholische/);
	assert.match(denominationLine(''), /darf die Prüfung nicht blockieren/);
	assert.match(denominationLine('evangelisch'), /Konfession: evangelisch/);
});

test('interpolatePrompt füllt Platzhalter aus dem Scope', () => {
	const out = interpolatePrompt('Fach: {{subject}} / Jg: {{grade}} / {{denomination_line}}', { subject: 'Religionslehre', grade: '11', denomination: 'unknown' }, 'weil');
	assert.match(out, /Fach: Religionslehre/);
	assert.match(out, /Jg: 11/);
	assert.match(out, /evangelische UND katholische/);
});

test('loadCapabilityArtifacts lädt Instruktion + Schema der realen Capability', async () => {
	const reg = await loadRegistry(PTS_ROOT);
	const cap = getCapability(reg, 'verify_curriculum_alignment');
	const art = await loadCapabilityArtifacts(PTS_ROOT, cap);
	assert.match(art.persona, /quellengebundener Recherche-Subagent/);
	assert.match(art.promptTemplate, /Rechercheauftrag: Lehrplan-Zuordnung/);
	assert.equal(art.schema.type, 'object');
	assert.equal(art.schemaVersion, 'ptspace.curriculum-alignment-brief/v2');
	// The prompt still carries its placeholders for interpolation.
	assert.match(art.promptTemplate, /\{\{topic\}\}/);
});

const ALLOWED_KEYWORDS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
function assertSubset(node, at) {
	assert.equal(typeof node, 'object', `${at} ist kein Knoten`);
	for (const key of Object.keys(node)) assert.ok(ALLOWED_KEYWORDS.has(key), `${at}: Schlüssel "${key}" außerhalb der Teilmenge`);
	if (node.type !== undefined) assert.ok(ALLOWED_TYPES.has(node.type), `${at}: Typ "${node.type}" unzulässig`);
	if (node.properties) for (const [name, child] of Object.entries(node.properties)) assertSubset(child, `${at}.${name}`);
	if (node.items !== undefined) assertSubset(node.items, `${at}.items`);
	if (node.additionalProperties !== undefined) assert.equal(typeof node.additionalProperties, 'boolean', `${at}: additionalProperties boolean`);
}

test('das geladene Schema bleibt in der erzwungenen dsh-tools-Teilmenge', async () => {
	const reg = await loadRegistry(PTS_ROOT);
	const cap = getCapability(reg, 'verify_curriculum_alignment');
	const art = await loadCapabilityArtifacts(PTS_ROOT, cap);
	assertSubset(art.schema, '$');
});
