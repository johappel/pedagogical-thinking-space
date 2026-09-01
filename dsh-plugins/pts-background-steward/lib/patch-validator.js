// pts-background-steward — validation of the structured stewardship result.
//
// Two layers:
// 1. STEWARDSHIP_RESULT_SCHEMA is the object-rooted JSON Schema handed to the
//    subagent seam as `outputSchema`. It uses ONLY the enforced schema subset
//    of @deepseek-ai/dsh-tools (type/properties/required/additionalProperties/
//    items/enum/const/oneOf + annotations), so `assertObjectJsonSchema` in the
//    structured-output runtime accepts it and the child must capture a
//    conforming value via its `structured_output` tool.
// 2. validateResult() re-checks the captured value against the run
//    expectations (schema version, session, turn, base hashes, known message
//    ids) and against the stewardship policy from services/STEWARDSHIP.md —
//    independent of whatever the provider enforced.

import { CANONICAL_FILES, WRITABLE_FILES, MOMENT_TYPES, BOARD_KINDS, WINDOW_KINDS, DRAMATURGICAL_ROLES, PLACEMENT_MODES, TRANSITION_TYPES } from './workspace-state.js';

export const STEWARDSHIP_SCHEMA_VERSION = 'ptspace.stewardship-result/v1';

export const OBSERVATION_TYPES = Object.freeze([
	'teacher_statement',
	'open_question',
	'interpretation',
	'hypothesis',
	'decision_signal',
	'contradiction',
	'focus_shift',
]);

export const OPERATION_KINDS = Object.freeze([
	'set-section',
	'append-under-section',
	'add-design-accent',
	'add-draft-moment',
	'add-draft-transition',
	'add-decision',
	'propose-board-item',
	'settle-board-item',
	'propose-window',
	'propose-placement',
]);

const VALUE_MAX_CHARS = 4000;
const TITLE_MAX_CHARS = 200;
const SECTION_MAX_CHARS = 80;

/** Object-rooted JSON Schema in the dsh-tools enforced subset. */
export const STEWARDSHIP_RESULT_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['schema', 'session_id', 'turn', 'base', 'observations', 'operations', 'teacher_decisions', 'next_turn_hint', 'forbidden_effects'],
	properties: {
		schema: { type: 'string', const: STEWARDSHIP_SCHEMA_VERSION },
		session_id: { type: 'string', description: 'Session-ID des auslösenden Gesprächs (aus dem Auftrag übernehmen).' },
		turn: { type: 'integer', description: 'Turn-Nummer des auslösenden Gesprächs (aus dem Auftrag übernehmen).' },
		base: {
			type: 'object',
			description: 'Vom Auftrag übernommene Basis-Hashes der kanonischen Dateien (Dateiname -> Hash oder null).',
		},
		observations: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['type', 'evidence', 'content'],
				properties: {
					type: { type: 'string', enum: [...OBSERVATION_TYPES] },
					evidence: { type: 'string', description: 'Beleg als Nachrichten-ID aus dem Gesprächsausschnitt (z. B. m3) oder "context".' },
					content: { type: 'string' },
				},
			},
		},
		operations: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['target', 'kind', 'value'],
				properties: {
					target: { type: 'string', enum: [...CANONICAL_FILES] },
					kind: { type: 'string', enum: [...OPERATION_KINDS] },
					value: { type: 'string', description: 'Inhalt: Absatztext, Entscheidungsaussage bzw. Kurzbegründung.' },
					section: { type: 'string', description: 'Nur für set-section / append-under-section an learning-design.md.' },
					title: { type: 'string', description: 'Titel für add-draft-moment, propose-board-item oder add-design-accent.' },
					moment_type: { type: 'string', enum: [...MOMENT_TYPES] },
					moment_function: { type: 'string' },
					learning_activity: { type: 'string' },
					expected_experience: { type: 'string' },
					open_questions: { type: 'string' },
					material_needs: { type: 'string' },
					board_kind: { type: 'string', enum: [...BOARD_KINDS] },
					item_id: { type: 'string', description: 'Vorhandene Board-Item-ID für settle-board-item (offene Klärung, die die Lehrkraft im Gespräch beantwortet hat).' },
					window_kind: { type: 'string', enum: [...WINDOW_KINDS] },
					duration_minutes: { type: 'integer', description: 'Fenster-/Platzierungsdauer in Minuten (propose-window / propose-placement).' },
					moment_id: { type: 'string', description: 'Lernmoment-ID für propose-placement.' },
					window_id: { type: 'string', description: 'Fenster-ID für propose-placement.' },
					start_minute: { type: 'integer', description: 'Startminute innerhalb des Fensters (propose-placement).' },
					dramaturgical_role: { type: 'string', enum: [...DRAMATURGICAL_ROLES] },
					mode: { type: 'string', enum: [...PLACEMENT_MODES] },
					from_id: { type: 'string', description: 'Von-Lernmoment-ID für add-draft-transition.' },
					to_id: { type: 'string', description: 'Zu-Lernmoment-ID für add-draft-transition.' },
					transition_type: { type: 'string', enum: [...TRANSITION_TYPES] },
					evidence: { type: 'string', description: 'Pflicht bei add-decision und add-design-accent: Beleg-Nachrichten-ID der expliziten Lehrkraftäußerung; bei settle-board-item: Beleg der Antwort; bei propose-window/propose-placement: Beleg aus dem Gesprächsfenster.' },
				},
			},
		},
		teacher_decisions: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['evidence', 'explicit'],
				properties: {
					evidence: { type: 'string' },
					explicit: { type: 'boolean' },
					statement: { type: 'string' },
				},
			},
		},
		next_turn_hint: {
			oneOf: [
				{ type: 'null' },
				{
					type: 'object',
					additionalProperties: false,
					required: ['kind', 'content'],
					properties: {
						kind: { type: 'string', enum: ['none', 'open_question'] },
						content: { type: 'string' },
					},
				},
			],
		},
		forbidden_effects: { type: 'array', items: { type: 'string' } },
	},
});

function isPlainObject(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Structural self-check of the result without importing dsh-tools. */
function checkShape(result) {
	const errors = [];
	if (!isPlainObject(result)) return ['result ist kein Objekt'];
	const r = result;
	if (r.schema !== STEWARDSHIP_SCHEMA_VERSION) errors.push(`schema muss "${STEWARDSHIP_SCHEMA_VERSION}" sein`);
	if (typeof r.session_id !== 'string' || r.session_id === '') errors.push('session_id fehlt');
	if (!Number.isInteger(r.turn)) errors.push('turn muss eine Ganzzahl sein');
	if (!isPlainObject(r.base)) errors.push('base muss ein Objekt sein');
	for (const key of ['observations', 'operations', 'teacher_decisions', 'forbidden_effects']) {
		if (!Array.isArray(r[key])) errors.push(`${key} muss ein Array sein`);
	}
	if (r.next_turn_hint !== null && !isPlainObject(r.next_turn_hint)) errors.push('next_turn_hint muss null oder ein Objekt sein');
	return errors;
}

/**
 * Validate one captured structured result against this run's expectations
 * and the stewardship policy.
 *
 * @param {unknown} structured - captured structured_output value
 * @param {object} expectation
 * @param {string} expectation.sessionId - triggering session id
 * @param {number} expectation.turn - triggering turn number
 * @param {Record<string, string|null>} expectation.hashes - base hashes snapshot
 * @param {Set<string>} expectation.messageIds - dialogue ids offered to the child (m1, m2, …)
 * @returns {{ ok: true, result: object } | { ok: false, errors: string[] }}
 */
export function validateResult(structured, expectation) {
	const errors = checkShape(structured);
	if (errors.length > 0) return { ok: false, errors };
	const r = structured;

	if (r.session_id !== expectation.sessionId) {
		errors.push(`session_id "${r.session_id}" entspricht nicht der erwarteten Session ${expectation.sessionId}`);
	}
	if (r.turn !== expectation.turn) {
		errors.push(`turn ${r.turn} entspricht nicht dem erwarteten Turn ${expectation.turn}`);
	}

	// Base hashes must be echoed exactly as offered — fabrication or omission
	// means the child did not ground its view in the provided state.
	const expectedKeys = Object.keys(expectation.hashes).sort();
	const actualKeys = Object.keys(r.base ?? {}).sort();
	if (expectedKeys.join('|') !== actualKeys.join('|')) {
		errors.push(`base-Schlüssel weichen ab (erwartet: ${expectedKeys.join(', ')})`);
	} else {
		for (const key of expectedKeys) {
			if (r.base[key] !== expectation.hashes[key]) {
				errors.push(`base-Hash für ${key} stimmt nicht mit dem Auftragsstand überein`);
			}
		}
	}

	// Evidence references must resolve into the offered window.
	const evidenceOk = (evidence) => typeof evidence === 'string'
		&& evidence.trim() !== ''
		&& (evidence === 'context' || expectation.messageIds.has(evidence.trim()));

	// Observations are protocol notes, not authorizations: a broken entry
	// (unknown evidence, unknown type, missing content) drops the SINGLE
	// observation instead of the whole run. The canonical files quote old
	// message ids ("vgl. m4"), so an over-eager child occasionally cites one
	// — killing the entire maintenance pass for that was disproportionate.
	const keptObservations = [];
	let droppedObservations = 0;
	let obsIdx = 0;
	for (const o of r.observations ?? []) {
		obsIdx += 1;
		if (!isPlainObject(o)) { droppedObservations += 1; continue; }
		if (!OBSERVATION_TYPES.includes(o.type)
			|| !evidenceOk(o.evidence)
			|| typeof o.content !== 'string' || o.content.trim() === '') {
			droppedObservations += 1;
			continue;
		}
		keptObservations.push(o);
	}

	// teacher_decisions only feed the add-decision policy gate: invalid
	// entries are dropped individually (they then cannot authorize a
	// decision, which keeps that gate conservative).
	const keptDecisions = [];
	let droppedDecisions = 0;
	for (const d of r.teacher_decisions ?? []) {
		if (!isPlainObject(d) || typeof d.explicit !== 'boolean' || !evidenceOk(d.evidence)) {
			droppedDecisions += 1;
			continue;
		}
		keptDecisions.push(d);
	}

	// Policy table over operations.
	const explicitEvidence = new Set(keptDecisions
		.filter((d) => d.explicit === true && typeof d.evidence === 'string')
		.map((d) => d.evidence.trim()));
	let boardItems = 0;
	let settleItems = 0;
	let designAccents = 0;
	let documentingOps = 0;
	let windowProposals = 0;
	let placementProposals = 0;
	let opIdx = 0;
	for (const op of r.operations ?? []) {
		opIdx += 1;
		const label = `operations[${opIdx}]`;
		if (!isPlainObject(op)) { errors.push(`${label} ist kein Objekt`); continue; }
		if (!CANONICAL_FILES.includes(op.target)) { errors.push(`${label}.target ist keine kanonische Datei`); continue; }
		if (!WRITABLE_FILES.includes(op.target)) { errors.push(`${label}.target ist schreibgeschützt für den Steward`); continue; }
		if (typeof op.value !== 'string' || op.value.trim() === '') { errors.push(`${label}.value fehlt`); continue; }
		if (op.value.length > VALUE_MAX_CHARS) { errors.push(`${label}.value überschreitet ${VALUE_MAX_CHARS} Zeichen`); }
		// Documenting ops carry the pedagogical CONTENT into its canonical home
		// (Learning Design prose / accent, decisions.yml). settle-board-item is
		// only allowed in a run that documents — a Klärung is closed only when
		// the answer has landed somewhere canonical.
		if (op.kind === 'set-section' || op.kind === 'append-under-section' || op.kind === 'add-decision' || op.kind === 'add-design-accent') documentingOps += 1;
		switch (op.kind) {
			case 'set-section':
			case 'append-under-section': {
				if (op.target !== 'learning-design.md') { errors.push(`${label}: ${op.kind} ist nur an learning-design.md erlaubt`); break; }
				if (typeof op.section !== 'string' || op.section.trim() === '') errors.push(`${label}.section fehlt`);
				else if (op.section.length > SECTION_MAX_CHARS) errors.push(`${label}.section ist zu lang`);
				break;
			}
			case 'add-design-accent': {
				if (op.target !== 'learning-design.md') { errors.push(`${label}: add-design-accent ist nur an learning-design.md erlaubt`); break; }
				designAccents += 1;
				if (designAccents > 3) errors.push(`${label}: höchstens drei Leitideen-Akzente pro Lauf`);
				if (typeof op.title !== 'string' || op.title.trim() === '') errors.push(`${label}.title fehlt`);
				else if (op.title.length > TITLE_MAX_CHARS) errors.push(`${label}.title ist zu lang`);
				if (!evidenceOk(op.evidence)) errors.push(`${label}.evidence verweist nicht auf das angebotene Gesprächsfenster`);
				break;
			}
			case 'add-draft-moment': {
				if (op.target !== 'learning-landscape.md') { errors.push(`${label}: add-draft-moment ist nur an learning-landscape.md erlaubt`); break; }
				for (const field of ['title', 'moment_function', 'learning_activity', 'expected_experience']) {
					if (typeof op[field] !== 'string' || op[field].trim() === '') errors.push(`${label}.${field} fehlt (Ein vollständiger Entwurf braucht alle Pflichtfelder)`);
					else if (op[field].length > TITLE_MAX_CHARS && field === 'title') errors.push(`${label}.title ist zu lang`);
				}
				if (!MOMENT_TYPES.includes(op.moment_type)) errors.push(`${label}.moment_type ist kein zulässiger Lerntyp`);
				break;
			}
			case 'add-draft-transition': {
				if (op.target !== 'learning-landscape.md') { errors.push(`${label}: add-draft-transition ist nur an learning-landscape.md erlaubt`); break; }
				if (typeof op.from_id !== 'string' || op.from_id.trim() === '') errors.push(`${label}.from_id fehlt`);
				if (typeof op.to_id !== 'string' || op.to_id.trim() === '') errors.push(`${label}.to_id fehlt`);
				if (typeof op.from_id === 'string' && typeof op.to_id === 'string' && op.from_id.trim() !== '' && op.from_id.trim() === op.to_id.trim()) errors.push(`${label}: from und to müssen verschiedene Lernmomente sein`);
				if (!TRANSITION_TYPES.includes(op.transition_type)) errors.push(`${label}.transition_type ist unzulässig`);
				if (!evidenceOk(op.evidence)) errors.push(`${label}.evidence verweist nicht auf das angebotene Gesprächsfenster`);
				break;
			}
			case 'add-decision': {
				if (op.target !== 'decisions.yml') { errors.push(`${label}: add-decision ist nur an decisions.yml erlaubt`); break; }
				const ev = typeof op.evidence === 'string' ? op.evidence.trim() : '';
				if (ev === '' || !explicitEvidence.has(ev)) {
					errors.push(`${label}: decisions.yml wird nur bei einer eindeutigen, belegten Lehrkraftentscheidung geändert (teacher_decisions explicit=true mit passender evidence)`);
				}
				if (!evidenceOk(op.evidence)) errors.push(`${label}.evidence verweist nicht auf das angebotene Gesprächsfenster`);
				break;
			}
			case 'propose-board-item': {
				if (op.target !== 'planning-board.yml') { errors.push(`${label}: propose-board-item ist nur an planning-board.yml erlaubt`); break; }
				boardItems += 1;
				if (boardItems > 1) errors.push(`${label}: höchstens ein Planning-Board-Vorschlag pro Lauf`);
				if (typeof op.title !== 'string' || op.title.trim() === '') errors.push(`${label}.title fehlt`);
				else if (op.title.length > TITLE_MAX_CHARS) errors.push(`${label}.title ist zu lang`);
				if (op.board_kind !== undefined && !BOARD_KINDS.includes(op.board_kind)) errors.push(`${label}.board_kind ist unzulässig`);
				break;
			}
			case 'settle-board-item': {
				if (op.target !== 'planning-board.yml') { errors.push(`${label}: settle-board-item ist nur an planning-board.yml erlaubt`); break; }
				settleItems += 1;
				if (settleItems > 1) errors.push(`${label}: höchstens eine Klärung pro Lauf abschließen`);
				if (typeof op.item_id !== 'string' || op.item_id.trim() === '') errors.push(`${label}.item_id fehlt`);
				if (!evidenceOk(op.evidence)) errors.push(`${label}.evidence verweist nicht auf das angebotene Gesprächsfenster`);
				break;
			}
			case 'propose-window': {
				if (op.target !== 'temporal-plan.yml') { errors.push(`${label}: propose-window ist nur an temporal-plan.yml erlaubt`); break; }
				windowProposals += 1;
				if (windowProposals > 1) errors.push(`${label}: höchstens ein Fenster-Vorschlag pro Lauf`);
				if (typeof op.title !== 'string' || op.title.trim() === '') errors.push(`${label}.title fehlt`);
				else if (op.title.length > TITLE_MAX_CHARS) errors.push(`${label}.title ist zu lang`);
				if (!WINDOW_KINDS.includes(op.window_kind)) errors.push(`${label}.window_kind ist unzulässig`);
				if (!Number.isInteger(op.duration_minutes) || op.duration_minutes <= 0) errors.push(`${label}.duration_minutes fehlt oder ist ungültig`);
				if (!evidenceOk(op.evidence)) errors.push(`${label}.evidence verweist nicht auf das angebotene Gesprächsfenster`);
				break;
			}
			case 'propose-placement': {
				if (op.target !== 'temporal-plan.yml') { errors.push(`${label}: propose-placement ist nur an temporal-plan.yml erlaubt`); break; }
				placementProposals += 1;
				if (placementProposals > 1) errors.push(`${label}: höchstens ein Platzierungs-Vorschlag pro Lauf`);
				for (const field of ['moment_id', 'window_id']) {
					if (typeof op[field] !== 'string' || op[field].trim() === '') errors.push(`${label}.${field} fehlt`);
				}
				if (!Number.isInteger(op.start_minute) || op.start_minute < 0) errors.push(`${label}.start_minute ist ungültig`);
				if (!Number.isInteger(op.duration_minutes) || op.duration_minutes <= 0) errors.push(`${label}.duration_minutes ist ungültig`);
				if (!DRAMATURGICAL_ROLES.includes(op.dramaturgical_role)) errors.push(`${label}.dramaturgical_role ist unzulässig`);
				if (!PLACEMENT_MODES.includes(op.mode)) errors.push(`${label}.mode ist unzulässig`);
				if (!evidenceOk(op.evidence)) errors.push(`${label}.evidence verweist nicht auf das angebotene Gesprächsfenster`);
				break;
			}
			default:
				errors.push(`${label}.kind ist unbekannt: ${String(op.kind)}`);
		}
	}

	// Anti-blur guard: a board Klärung is closed only when the answer content
	// lands in its canonical home in the SAME run — never as board prose.
	if (settleItems > 0 && documentingOps === 0) {
		errors.push('settle-board-item braucht im selben Lauf eine dokumentierende Operation (set-section/append-under-section an learning-design.md, add-decision oder add-design-accent) — der Antworttext gehört nicht ins Board, sondern ins Learning Design bzw. decisions.yml');
	}

	if (r.next_turn_hint !== null) {
		const h = r.next_turn_hint;
		if (!['none', 'open_question'].includes(h.kind)) errors.push('next_turn_hint.kind ist unzulässig');
		if (typeof h.content !== 'string' || h.content.trim() === '') errors.push('next_turn_hint.content fehlt');
	}

	if (errors.length > 0) return { ok: false, errors, dropped: { observations: droppedObservations, teacher_decisions: droppedDecisions } };
	return {
		ok: true,
		result: { ...r, observations: keptObservations, teacher_decisions: keptDecisions },
		dropped: { observations: droppedObservations, teacher_decisions: droppedDecisions },
	};
}
