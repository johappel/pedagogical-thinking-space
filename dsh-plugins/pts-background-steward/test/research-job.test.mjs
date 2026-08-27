// Tests for pts-background-steward/lib/research-job.js — schema subset,
// result validation, dedup keying, prompt shaping and brief formatting.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	CURRICULUM_BRIEF_SCHEMA_VERSION,
	CURRICULUM_BRIEF_SCHEMA,
	validateResearchResult,
	scopeKey,
	buildResearchPrompt,
	buildResearcherPersona,
	formatBriefMarkdown,
	buildFollowupBriefing,
} from '../lib/research-job.js';

const ALLOWED_KEYWORDS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function assertSubset(node, at) {
	assert.equal(typeof node, 'object', `${at} ist kein Knoten`);
	for (const key of Object.keys(node)) {
		assert.ok(ALLOWED_KEYWORDS.has(key), `${at}: Schlüssel "${key}" außerhalb der Teilmenge`);
	}
	if (node.type !== undefined) assert.ok(ALLOWED_TYPES.has(node.type), `${at}: Typ "${node.type}" unzulässig`);
	if (node.properties) for (const [name, child] of Object.entries(node.properties)) assertSubset(child, `${at}.${name}`);
	if (node.items !== undefined) assertSubset(node.items, `${at}.items`);
	if (node.additionalProperties !== undefined) assert.equal(typeof node.additionalProperties, 'boolean', `${at}: additionalProperties boolean`);
}

const intent = {
	task: 'verify_curriculum_alignment',
	reason: 'Passt das Thema in Jahrgang 11?',
	authorization: { type: 'implied_bounded_request', evidence: 'm2' },
	scope: { jurisdiction: 'NRW', subject: 'Religionslehre', phase: 'gymnasiale Oberstufe', grade: '11', topic: 'Utopie und Hoffnung', denomination: 'unknown' },
	return_to: 'critical_friend',
};

function validBrief(overrides = {}) {
	return {
		schema: CURRICULUM_BRIEF_SCHEMA_VERSION,
		task: 'verify_curriculum_alignment',
		summary: 'Das Thema ist in beiden Konfessionen anschlussfähig.',
		findings: [
			{ denomination: 'evangelisch', alignment: 'yes', competence_areas: 'Hoffnung/Eschatologie', statement: 'Passt zum inhaltlichen Schwerpunkt.' },
			{ denomination: 'katholisch', alignment: 'partial', statement: 'Teilweise abgedeckt.' },
		],
		sources: [
			{ title: 'Kernlehrplan Religionslehre NRW (SII)', url: 'https://example.gov', official: true, accessed: '2026-08-27' },
		],
		uncertainties: ['Konkrete Jahrgangszuordnung schulintern.'],
		...overrides,
	};
}

test('CURRICULUM_BRIEF_SCHEMA bleibt in der erzwungenen Teilmenge', () => {
	assert.equal(CURRICULUM_BRIEF_SCHEMA.type, 'object');
	assertSubset(CURRICULUM_BRIEF_SCHEMA, '$');
});

test('vollständiger Brief besteht', () => {
	const r = validateResearchResult(validBrief());
	assert.equal(r.ok, true);
});

test('Brief ohne Quelle wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({ sources: [] }));
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('sources')));
});

test('Brief ohne Befund wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({ findings: [] }));
	assert.equal(r.ok, false);
});

test('falsche Schema-Version wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({ schema: 'x/v9' }));
	assert.equal(r.ok, false);
});

test('scopeKey ist stabil und scope-abhängig (Dedup-Basis)', () => {
	const a = scopeKey(intent);
	const b = scopeKey({ ...intent, scope: { ...intent.scope } });
	assert.equal(a, b);
	const c = scopeKey({ ...intent, scope: { ...intent.scope, grade: '12' } });
	assert.notEqual(a, c);
});

test('Prompt fordert bei unbekannter Konfession beide Konfessionen', () => {
	const prompt = buildResearchPrompt(intent);
	assert.match(prompt, /evangelische UND katholische/);
	assert.match(prompt, /darf die Prüfung nicht blockieren/);
});

test('Prompt nennt bekannte Konfession direkt', () => {
	const prompt = buildResearchPrompt({ ...intent, scope: { ...intent.scope, denomination: 'evangelisch' } });
	assert.match(prompt, /Konfession: evangelisch/);
});

test('Persona verbietet Entscheidung und Material', () => {
	const persona = buildResearcherPersona();
	assert.match(persona, /KEINE pädagogische Entscheidung/);
	assert.match(persona, /KEIN Unterrichtsmaterial/);
});

test('Brief-Markdown ist ein Draft mit Quellen', () => {
	const md = formatBriefMarkdown(validBrief(), intent, '2026-08-27');
	assert.match(md, /Status: draft/);
	assert.match(md, /## Quellen/);
	assert.match(md, /Kernlehrplan Religionslehre NRW/);
});

test('Follow-up-Briefing ist eine interne Notiz, keine Roh-Ausgabe', () => {
	const briefing = buildFollowupBriefing(validBrief(), intent, 'drafts/curriculum-alignment-abc.md');
	assert.match(briefing, /INTERNE NOTIZ/);
	assert.match(briefing, /kurzen, quellenbasierten Anschlussbeitrag/);
	assert.match(briefing, /keine erneute allgemeine Recherche-Erlaubnisfrage/);
});
