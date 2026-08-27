// Tests for pts-background-steward/lib/patch-validator.js — schema subset
// compliance and the stewardship policy table.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	STEWARDSHIP_SCHEMA_VERSION,
	STEWARDSHIP_RESULT_SCHEMA,
	validateResult,
} from '../lib/patch-validator.js';

const HASHES = {
	'learning-design.md': 'sha256:aaa',
	'learning-landscape.md': 'sha256:bbb',
	'decisions.yml': null,
	'planning-board.yml': 'sha256:ccc',
	'temporal-plan.yml': 'sha256:ddd',
};

function expectation(overrides = {}) {
	return { sessionId: 'session-123', turn: 42, hashes: HASHES, messageIds: new Set(['m1', 'm2', 'm3']), ...overrides };
}

function validResult(overrides = {}) {
	return {
		schema: STEWARDSHIP_SCHEMA_VERSION,
		session_id: 'session-123',
		turn: 42,
		base: { ...HASHES },
		observations: [
			{ type: 'teacher_statement', evidence: 'm3', content: 'Der Fall soll einen 14-jährigen Jugendlichen zeigen.' },
		],
		operations: [
			{ target: 'learning-design.md', kind: 'set-section', section: 'Context', value: '- Der Fall spielt um einen 14-Jährigen.' },
		],
		teacher_decisions: [],
		next_turn_hint: { kind: 'open_question', content: 'Was erzählt der Jugendliche seinen Eltern?' },
		service_intents: [],
		forbidden_effects: [],
		...overrides,
	};
}

// ——— Schema subset compliance (dsh-tools enforced subset) ———

const ALLOWED_KEYWORDS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function assertSubset(node, at) {
	assert.equal(typeof node, 'object', `${at} ist kein Knoten`);
	for (const key of Object.keys(node)) {
		assert.ok(ALLOWED_KEYWORDS.has(key), `${at}: Schlüssel "${key}" liegt außerhalb der erzwungenen Teilmenge`);
	}
	if (node.type !== undefined) {
		assert.ok(ALLOWED_TYPES.has(node.type), `${at}: Typ "${node.type}" ist kein Einzeltyp der Teilmenge`);
	}
	// Die erzwungene Teilmenge verlangt: enum/const nur zusammen mit type (oder oneOf).
	// Ohne type lehnt dsh-tools das Schema beim Lauf ab (JsonSchemaError).
	if ((node.enum !== undefined || node.const !== undefined) && node.type === undefined && node.oneOf === undefined) {
		assert.fail(`${at}: enum/const brauchen ein type (oder oneOf) in der erzwungenen Teilmenge`);
	}
	if (node.oneOf !== undefined) {
		assert.ok(Array.isArray(node.oneOf) && node.oneOf.length >= 2, `${at}: oneOf braucht mindestens zwei Zweige`);
		node.oneOf.forEach((branch, i) => assertSubset(branch, `${at}.oneOf[${i}]`));
	}
	if (node.properties) {
		for (const [name, child] of Object.entries(node.properties)) assertSubset(child, `${at}.${name}`);
	}
	if (node.required !== undefined) {
		assert.ok(Array.isArray(node.required), `${at}: required muss ein Array sein`);
		if (node.properties) {
			for (const name of node.required) assert.ok(name in node.properties, `${at}: required("${name}") fehlt in properties`);
		}
	}
	if (node.additionalProperties !== undefined) {
		assert.equal(typeof node.additionalProperties, 'boolean', `${at}: additionalProperties muss boolean sein (keine Schemaknoten erlaubt)`);
	}
	if (node.items !== undefined) assertSubset(node.items, `${at}.items`);
}

test('STEWARDSHIP_RESULT_SCHEMA bleibt in der von dsh-tools erzwungenen Teilmenge (objektgewurzelt)', () => {
	assert.equal(STEWARDSHIP_RESULT_SCHEMA.type, 'object');
	assertSubset(STEWARDSHIP_RESULT_SCHEMA, '$');
});

// ——— Happy path ———

test('vollständiges gültiges Ergebnis besteht alle Prüfungen', () => {
	const r = validateResult(validResult(), expectation());
	assert.equal(r.ok, true);
});

test('Ergebnis ohne Operationen und mit null-Hint ist gültig', () => {
	const r = validateResult(validResult({
		operations: [],
		teacher_decisions: [],
		next_turn_hint: null,
	}), expectation());
	assert.equal(r.ok, true);
});

// ——— Integrität: Auftragsbindung ———

test('falsche Schema-Version wird abgelehnt', () => {
	const r = validateResult(validResult({ schema: 'ptspace.stewardship-result/v2' }), expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('schema')));
});

test('Fremde session_id oder turn wird abgelehnt', () => {
	let r = validateResult(validResult({ session_id: 'other-session' }), expectation());
	assert.equal(r.ok, false);
	r = validateResult(validResult({ turn: 41 }), expectation());
	assert.equal(r.ok, false);
});

test('Verfälschte oder unvollständige base-Hashes werden abgelehnt', () => {
	const tampered = validResult();
	tampered.base['decisions.yml'] = 'sha256:fabricated';
	let r = validateResult(tampered, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('decisions.yml')));

	const missing = validResult();
	delete missing.base['planning-board.yml'];
	r = validateResult(missing, expectation());
	assert.equal(r.ok, false);
});

test('Evidence außerhalb des Gesprächsfensters wird abgelehnt', () => {
	const result = validResult({
		observations: [{ type: 'open_question', evidence: 'm99', content: 'x' }],
	});
	const r = validateResult(result, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('evidence')));
});

// ——— Politik: Entscheidungen, Board, Landschaft, Temporal ———

test('decisions.yml ohne explizite belegte Lehrkraftentscheidung wird abgelehnt', () => {
	const result = validResult({
		operations: [{ target: 'decisions.yml', kind: 'add-decision', value: 'X.', evidence: 'm3' }],
		teacher_decisions: [{ evidence: 'm3', explicit: false }],
	});
	let r = validateResult(result, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('decisions.yml')));

	const ok = validResult({
		operations: [{ target: 'decisions.yml', kind: 'add-decision', value: 'Fall auf 14 Jahre festgelegt.', evidence: 'm3' }],
		teacher_decisions: [{ evidence: 'm3', explicit: true }],
	});
	r = validateResult(ok, expectation());
	assert.equal(r.ok, true);
});

test('temporal-plan.yml ist als Ziel tabu', () => {
	const result = validResult({
		operations: [{ target: 'temporal-plan.yml', kind: 'set-section', section: 'Windows', value: 'x' }],
	});
	const r = validateResult(result, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('temporal-plan')));
});

test('set-section gilt nur für learning-design.md', () => {
	const result = validResult({
		operations: [{ target: 'learning-landscape.md', kind: 'set-section', section: 'Lernmomente', value: 'Massenersatz' }],
	});
	const r = validateResult(result, expectation());
	assert.equal(r.ok, false);
});

test('unvollständiger Lernmoment-Entwurf wird abgelehnt; vollständiger besteht', () => {
	const incomplete = validResult({
		operations: [{
			target: 'learning-landscape.md', kind: 'add-draft-moment',
			title: 'Moment ohne Pflichtfelder', moment_type: 'impulse',
			value: 'Kurzbeschreibung.',
		}],
	});
	let r = validateResult(incomplete, expectation());
	assert.equal(r.ok, false);

	const complete = validResult({
		operations: [{
			target: 'learning-landscape.md', kind: 'add-draft-moment',
			title: 'Fallimpuls', moment_type: 'impulse',
			moment_function: 'Persönlicher Zugang', learning_activity: 'Fall lesen',
			expected_experience: 'Fälle sind nicht neutral.',
			value: 'Kurzbeschreibung des Moments.',
		}],
	});
	r = validateResult(complete, expectation());
	assert.equal(r.ok, true);
});

test('höchstens ein Planning-Board-Vorschlag pro Lauf', () => {
	const two = validResult({
		operations: [
			{ target: 'planning-board.yml', kind: 'propose-board-item', title: 'A klären', board_kind: 'clarify', value: 'Begründung A.' },
			{ target: 'planning-board.yml', kind: 'propose-board-item', title: 'B klären', board_kind: 'clarify', value: 'Begründung B.' },
		],
	});
	const r = validateResult(two, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('höchstens ein Planning-Board-Vorschlag')));
});

test('Wertlängengrenzen werden durchgesetzt', () => {
	const long = 'x'.repeat(4001);
	const result = validResult({
		operations: [{ target: 'learning-design.md', kind: 'set-section', section: 'Context', value: long }],
	});
	const r = validateResult(result, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('4000')));
});

// ——— Politik: Service-Intents (begrenzter Knowledge-Request) ———

function validIntent(overrides = {}) {
	return {
		task: 'verify_curriculum_alignment',
		reason: 'Die Lehrkraft fragt, ob das Thema in die 11. Klasse in NRW passt.',
		authorization: { type: 'implied_bounded_request', evidence: 'm2' },
		scope: {
			jurisdiction: 'NRW', subject: 'Religionslehre', phase: 'gymnasiale Oberstufe',
			grade: '11', topic: 'Utopie und Hoffnung', denomination: 'unknown',
		},
		return_to: 'critical_friend',
		...overrides,
	};
}

function intentExpectation(overrides = {}) {
	return {
		sessionId: 'session-123', turn: 42, hashes: HASHES,
		messageIds: new Set(['m1', 'm2', 'm3']),
		userMessageIds: new Set(['m2']),
		...overrides,
	};
}

test('ein autorisierter, belegter Knowledge-Request besteht', () => {
	const r = validateResult(validResult({ service_intents: [validIntent()] }), intentExpectation());
	assert.equal(r.ok, true);
	assert.equal(r.result.service_intents.length, 1);
});

test('mehr als ein Service-Intent pro Lauf wird abgelehnt', () => {
	const r = validateResult(validResult({ service_intents: [validIntent(), validIntent()] }), intentExpectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('höchstens ein')));
});

test('Evidence "context" genügt für einen Service-Intent nicht', () => {
	const intent = validIntent({ authorization: { type: 'implied_bounded_request', evidence: 'context' } });
	const r = validateResult(validResult({ service_intents: [intent] }), intentExpectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('belegte Nachricht der Lehrkraft')));
});

test('Evidence einer Assistenten-Nachricht (nicht Lehrkraft) wird abgelehnt', () => {
	const intent = validIntent({ authorization: { type: 'implied_bounded_request', evidence: 'm3' } });
	const r = validateResult(validResult({ service_intents: [intent] }), intentExpectation({ userMessageIds: new Set(['m2']) }));
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('belegte Nachricht der Lehrkraft')));
});

test('offener Scope (fehlendes Pflichtfeld) wird abgelehnt', () => {
	const intent = validIntent();
	delete intent.scope.grade;
	const r = validateResult(validResult({ service_intents: [intent] }), intentExpectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('scope.grade')));
});

test('personenbezogenes/fremdes Scope-Feld wird abgelehnt', () => {
	const intent = validIntent();
	intent.scope.student_name = 'Max Mustermann';
	const r = validateResult(validResult({ service_intents: [intent] }), intentExpectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('student_name')));
});

test('unerlaubte Task wird abgelehnt', () => {
	const intent = validIntent({ task: 'compare_pedagogical_approaches' });
	const r = validateResult(validResult({ service_intents: [intent] }), intentExpectation());
	assert.equal(r.ok, false);
});

test('unbekannte Konfession blockiert den Intent nicht', () => {
	const intent = validIntent({ scope: { ...validIntent().scope, denomination: 'unknown' } });
	const r = validateResult(validResult({ service_intents: [intent] }), intentExpectation());
	assert.equal(r.ok, true);
});

