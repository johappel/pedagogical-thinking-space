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
	if (node.enum !== undefined || node.const !== undefined) {
		assert.ok(
			node.type !== undefined || node.oneOf !== undefined,
			`${at}: enum/const braucht type oder oneOf (dsh-tools Laufzeitvertrag)`,
		);
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

test('Beobachtungen mit ungültiger Evidence werden einzeln verworfen, nicht das Ergebnis', () => {
	const result = validResult({
		observations: [
			{ type: 'open_question', evidence: 'm99', content: 'falscher Beleg' },
			{ type: 'teacher_statement', evidence: 'm3', content: 'gültig bleibt' },
			{ type: 'unbekannt', evidence: 'm3', content: 'unbekannter Typ' },
			{ type: 'teacher_statement', evidence: 'm3', content: '' },
		],
	});
	const r = validateResult(result, expectation());
	assert.equal(r.ok, true);
	assert.deepEqual(r.result.observations.map((o) => o.content), ['gültig bleibt']);
	assert.equal(r.dropped.observations, 3);
});

test('teacher_decisions mit ungültiger Evidence werden einzeln verworfen (keine Autorisierung)', () => {
	const result = validResult({
		observations: [],
		operations: [{ target: 'decisions.yml', kind: 'add-decision', value: 'X.', evidence: 'm3' }],
		teacher_decisions: [{ evidence: 'm99', explicit: true }, { evidence: 'm3', explicit: false }],
	});
	const r = validateResult(result, expectation());
	// Der add-decision wird separat abgelehnt (kein expliziter, belegter
	// Entscheid überlebt), aber das ERGEBNIS selbst ist gültig.
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('decisions.yml')));
	assert.equal(r.dropped.teacher_decisions, 1);
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

test('temporal-plan.yml wird nur als Vorschlag beschrieben', () => {
	// Freie Section-Operation auf temporal-plan bleibt abgelehnt.
	const free = validResult({
		operations: [{ target: 'temporal-plan.yml', kind: 'set-section', section: 'Windows', value: 'x' }],
	});
	let r = validateResult(free, expectation());
	assert.equal(r.ok, false);

	// Gültiger Fenster-Vorschlag mit Beleg besteht.
	const window = validResult({
		operations: [{
			target: 'temporal-plan.yml', kind: 'propose-window',
			title: 'Stunde 1 – Irritation', window_kind: 'lesson',
			duration_minutes: 45, evidence: 'm3', value: 'Fenster aus dem Gespräch.',
		}],
	});
	r = validateResult(window, expectation());
	assert.equal(r.ok, true);
});

test('propose-window: ungültige Art, fehlender Beleg oder Dopplung wird abgelehnt', () => {
	const badKind = validResult({
		operations: [{
			target: 'temporal-plan.yml', kind: 'propose-window',
			title: 'X', window_kind: 'block', duration_minutes: 45, evidence: 'm3', value: 'Begründung.',
		}],
	});
	let r = validateResult(badKind, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('window_kind')));

	const noEvidence = validResult({
		operations: [{
			target: 'temporal-plan.yml', kind: 'propose-window',
			title: 'X', window_kind: 'lesson', duration_minutes: 45, value: 'Begründung.',
		}],
	});
	r = validateResult(noEvidence, expectation());
	assert.equal(r.ok, true);
	assert.deepEqual(r.result.operations, []);
	assert.equal(r.dropped.operations, 1);

	const two = validResult({
		operations: [
			{ target: 'temporal-plan.yml', kind: 'propose-window', title: 'A', window_kind: 'lesson', duration_minutes: 45, evidence: 'm3', value: 'x' },
			{ target: 'temporal-plan.yml', kind: 'propose-window', title: 'B', window_kind: 'lesson', duration_minutes: 45, evidence: 'm3', value: 'x' },
		],
	});
	r = validateResult(two, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('höchstens ein Fenster-Vorschlag')));
});

test('propose-placement: gültig mit Beleg; fehlende Pflichtfelder abgelehnt', () => {
	const placement = validResult({
		operations: [{
			target: 'temporal-plan.yml', kind: 'propose-placement',
			moment_id: 'lm-impuls', window_id: 'tw-01',
			start_minute: 0, duration_minutes: 8,
			dramaturgical_role: 'opening', mode: 'common',
			evidence: 'm3', value: 'Platzierung aus dem Gespräch.',
		}],
	});
	let r = validateResult(placement, expectation());
	assert.equal(r.ok, true);

	const missing = validResult({
		operations: [{
			target: 'temporal-plan.yml', kind: 'propose-placement',
			moment_id: 'lm-impuls', window_id: 'tw-01',
			start_minute: 0, duration_minutes: 8,
			dramaturgical_role: 'opening',
			evidence: 'm3', value: 'Platzierung.',
		}],
	});
	r = validateResult(missing, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('mode')));
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

test('update-draft-moment erlaubt belegte Teilfortschreibung vorhandener Entwürfe', () => {
	const good = validResult({ operations: [{
		target: 'learning-landscape.md', kind: 'update-draft-moment', moment_id: 'lm-a',
		moment_function: 'Vom Reflektieren ins Handeln führen.', value: 'Funktion konkretisiert.', evidence: 'm3',
	}] });
	let r = validateResult(good, expectation());
	assert.equal(r.ok, true);
	const emptyPatch = validResult({ operations: [{
		target: 'learning-landscape.md', kind: 'update-draft-moment', moment_id: 'lm-a',
		value: 'ohne Feld', evidence: 'm3',
	}] });
	r = validateResult(emptyPatch, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('mindestens ein Moment-Feld')));
});

test('fremde Evidence verwirft nur die betroffene Operation, nicht den gültigen Rest', () => {
	const mixed = validResult({ operations: [
		{ target: 'learning-design.md', kind: 'set-section', section: 'Current Status', value: 'Gültiger Stand.' },
		{ target: 'learning-landscape.md', kind: 'update-draft-moment', moment_id: 'lm-a', moment_function: 'x', value: 'x', evidence: 'm99' },
	] });
	const r = validateResult(mixed, expectation());
	assert.equal(r.ok, true);
	assert.equal(r.result.operations.length, 1);
	assert.equal(r.result.operations[0].kind, 'set-section');
	assert.equal(r.dropped.operations, 1);
});

test('add-draft-transition: gültig bei vorhandenen Momenten; fehlende Felder abgelehnt', () => {
	const valid = validResult({
		operations: [{
			target: 'learning-landscape.md', kind: 'add-draft-transition',
			from_id: 'lm-a', to_id: 'lm-b', transition_type: 'required',
			value: 'Erst die Irritation, dann die Position.', evidence: 'm3',
		}],
	});
	let r = validateResult(valid, expectation());
	assert.equal(r.ok, true);

	const noTo = validResult({
		operations: [{
			target: 'learning-landscape.md', kind: 'add-draft-transition',
			from_id: 'lm-a', transition_type: 'required', value: 'x', evidence: 'm3',
		}],
	});
	r = validateResult(noTo, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('to_id')));

	const badType = validResult({
		operations: [{
			target: 'learning-landscape.md', kind: 'add-draft-transition',
			from_id: 'lm-a', to_id: 'lm-b', transition_type: 'chaos', value: 'x', evidence: 'm3',
		}],
	});
	r = validateResult(badType, expectation());
	assert.equal(r.ok, false);

	const self = validResult({
		operations: [{
			target: 'learning-landscape.md', kind: 'add-draft-transition',
			from_id: 'lm-a', to_id: 'lm-a', transition_type: 'required', value: 'x', evidence: 'm3',
		}],
	});
	r = validateResult(self, expectation());
	assert.equal(r.ok, false);
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

test('settle-board-item braucht im selben Lauf eine dokumentierende Operation (Anti-Blur)', () => {
	const settleOnly = validResult({
		operations: [
			{ target: 'planning-board.yml', kind: 'settle-board-item', item_id: 'pb-1', value: 'decisions.yml#irgendwas', evidence: 'm3' },
		],
	});
	let r = validateResult(settleOnly, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('settle-board-item braucht im selben Lauf')));

	// Mit dokumentierender Op (add-design-accent) im selben Lauf: gültig.
	const withDoc = validResult({
		operations: [
			{ target: 'learning-design.md', kind: 'add-design-accent', title: 'Hoffnung als Grund statt Projektion', value: 'Christliche Hoffnung gründet im Kreuz.', evidence: 'm3' },
			{ target: 'planning-board.yml', kind: 'settle-board-item', item_id: 'pb-1', value: 'learning-design.md#educational-intention', evidence: 'm3' },
		],
	});
	r = validateResult(withDoc, expectation());
	assert.equal(r.ok, true);
});

test('add-design-accent: Evidence-Pflicht, Ziel-Datei, höchstens drei pro Lauf', () => {
	const good = validResult({
		operations: [
			{ target: 'learning-design.md', kind: 'add-design-accent', title: 'Leitfrage als roter Faden', value: 'Wovon hoffst du, wenn die Fakten dagegen sprechen?', evidence: 'm3' },
		],
	});
	let r = validateResult(good, expectation());
	assert.equal(r.ok, true);

	const noEvidence = validResult({
		operations: [
			{ target: 'learning-design.md', kind: 'add-design-accent', title: 't', value: 'x', evidence: 'm99' },
		],
	});
	r = validateResult(noEvidence, expectation());
	assert.equal(r.ok, true);
	assert.deepEqual(r.result.operations, []);
	assert.equal(r.dropped.operations, 1);

	const wrongTarget = validResult({
		operations: [
			{ target: 'planning-board.yml', kind: 'add-design-accent', title: 't', value: 'x', evidence: 'm3' },
		],
	});
	r = validateResult(wrongTarget, expectation());
	assert.equal(r.ok, false);

	const four = validResult({
		operations: [1, 2, 3, 4].map((i) => ({
			target: 'learning-design.md', kind: 'add-design-accent',
			title: 'Leitidee ' + i, value: 'Text ' + i, evidence: 'm3',
		})),
	});
	r = validateResult(four, expectation());
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('höchstens drei Leitideen-Akzente')));
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
