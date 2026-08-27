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

import { CANONICAL_FILES, WRITABLE_FILES, MOMENT_TYPES, BOARD_KINDS } from './workspace-state.js';

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
	'add-draft-moment',
	'add-decision',
	'propose-board-item',
]);

// Bounded, source-grounded knowledge tasks a steward may propose as a service
// intent are NOT a hardcoded allowlist here. The set of routable tasks is
// derived at runtime from the capability registry (capabilities/registry.yml,
// dispatchable knowledge capabilities) and injected as `expectation.allowedTasks`.
// This keeps the registry the single routing source.

// Only the sole authorization form that lets a steward-proposed knowledge
// request start without a separate permission turn.
export const SERVICE_INTENT_AUTHORIZATIONS = Object.freeze(['implied_bounded_request']);

// Where a completed research result is stored. `draft` is the default (a
// reviewable draft under drafts/). `knowledge_proposal` is only reached when
// the teacher explicitly asked to store the verified information in Knowledge;
// it stays a not-yet-curated proposal under knowledge-proposals/.
export const SERVICE_INTENT_OUTPUT_TYPES = Object.freeze(['draft', 'knowledge_proposal']);

// Public, non-personal scope fields for verify_curriculum_alignment. Anything
// outside this allowlist is rejected as an open/unbounded or personal scope.
export const CURRICULUM_SCOPE_REQUIRED = Object.freeze(['jurisdiction', 'subject', 'phase', 'grade', 'topic']);
export const CURRICULUM_SCOPE_OPTIONAL = Object.freeze(['denomination']);

const VALUE_MAX_CHARS = 4000;
const TITLE_MAX_CHARS = 200;
const SECTION_MAX_CHARS = 80;

/** Object-rooted JSON Schema in the dsh-tools enforced subset. */
export const STEWARDSHIP_RESULT_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['schema', 'session_id', 'turn', 'base', 'observations', 'operations', 'teacher_decisions', 'service_intents', 'next_turn_hint', 'forbidden_effects'],
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
					title: { type: 'string', description: 'Titel für add-draft-moment oder propose-board-item.' },
					moment_type: { type: 'string', enum: [...MOMENT_TYPES] },
					moment_function: { type: 'string' },
					learning_activity: { type: 'string' },
					expected_experience: { type: 'string' },
					open_questions: { type: 'string' },
					material_needs: { type: 'string' },
					board_kind: { type: 'string', enum: [...BOARD_KINDS] },
					evidence: { type: 'string', description: 'Pflicht bei add-decision: Beleg-Nachrichten-ID der expliziten Lehrkraftentscheidung.' },
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
		service_intents: {
			type: 'array',
			description: 'Höchstens ein begrenzter, quellengebundener Knowledge-Request; leer ist der Normalfall.',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['task', 'reason', 'authorization', 'scope', 'return_to'],
				properties: {
					task: { type: 'string', description: 'Stabile Capability-Task-ID; gegen den Capability-Katalog geprüft.' },
					reason: { type: 'string' },
					authorization: {
						type: 'object',
						additionalProperties: false,
						required: ['type', 'evidence'],
						properties: {
							type: { type: 'string', enum: [...SERVICE_INTENT_AUTHORIZATIONS] },
							evidence: { type: 'string', description: 'Nachrichten-ID der Lehrkraft aus dem Gesprächsfenster.' },
						},
					},
					scope: {
						type: 'object',
						additionalProperties: false,
						required: [...CURRICULUM_SCOPE_REQUIRED],
						properties: {
							jurisdiction: { type: 'string' },
							subject: { type: 'string' },
							phase: { type: 'string' },
							grade: { type: 'string' },
							topic: { type: 'string' },
							denomination: { type: 'string' },
						},
					},
					expected_output: {
						type: 'object',
						additionalProperties: false,
						required: ['type'],
						description: 'Optional. Ablageziel des Rechercheergebnisses. Fehlt es, gilt draft.',
						properties: {
							type: { type: 'string', enum: [...SERVICE_INTENT_OUTPUT_TYPES] },
							location: { type: 'string', description: 'Nur bei knowledge_proposal: Ablageort unter knowledge-proposals/.' },
						},
					},
					return_to: { type: 'string', const: 'critical_friend' },
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
	for (const key of ['observations', 'operations', 'teacher_decisions', 'service_intents', 'forbidden_effects']) {
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
 * @param {Set<string>} [expectation.userMessageIds] - subset authored by the teacher (defaults to messageIds)
 * @param {Set<string>} [expectation.allowedTasks] - dispatchable capability task ids from the registry
 * @returns {{ ok: true, result: object } | { ok: false, errors: string[] }}
 */
export function validateResult(structured, expectation) {
	const errors = checkShape(structured);
	if (errors.length > 0) return { ok: false, errors };
	const r = structured;
	// A service intent must be grounded in a TEACHER message, not any window id
	// and not "context": the authorization models the teacher's own question.
	const userMessageIds = expectation.userMessageIds instanceof Set
		? expectation.userMessageIds
		: expectation.messageIds;
	// Routable tasks come from the capability registry (single source). Fail
	// closed: without an injected catalogue, no service intent is routable.
	const allowedTasks = expectation.allowedTasks instanceof Set
		? expectation.allowedTasks
		: new Set();

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
	let obsIdx = 0;
	for (const o of r.observations ?? []) {
		obsIdx += 1;
		if (!isPlainObject(o)) { errors.push(`observations[${obsIdx}] ist kein Objekt`); continue; }
		if (!OBSERVATION_TYPES.includes(o.type)) errors.push(`observations[${obsIdx}].type unbekannt: ${String(o.type)}`);
		if (!evidenceOk(o.evidence)) errors.push(`observations[${obsIdx}].evidence verweist nicht auf das angebotene Gesprächsfenster`);
		if (typeof o.content !== 'string' || o.content.trim() === '') errors.push(`observations[${obsIdx}].content fehlt`);
	}

	// Policy table over operations.
	const explicitEvidence = new Set((r.teacher_decisions ?? [])
		.filter((d) => isPlainObject(d) && d.explicit === true && typeof d.evidence === 'string')
		.map((d) => d.evidence.trim()));
	let boardItems = 0;
	let opIdx = 0;
	for (const op of r.operations ?? []) {
		opIdx += 1;
		const label = `operations[${opIdx}]`;
		if (!isPlainObject(op)) { errors.push(`${label} ist kein Objekt`); continue; }
		if (!CANONICAL_FILES.includes(op.target)) { errors.push(`${label}.target ist keine kanonische Datei`); continue; }
		if (op.target === 'temporal-plan.yml') { errors.push(`${label}: temporal-plan.yml ist kein Steward-Ziel (bindende Terminierung braucht Lehrkraft-Freigabe)`); continue; }
		if (!WRITABLE_FILES.includes(op.target)) { errors.push(`${label}.target ist schreibgeschützt für den Steward`); continue; }
		if (typeof op.value !== 'string' || op.value.trim() === '') { errors.push(`${label}.value fehlt`); continue; }
		if (op.value.length > VALUE_MAX_CHARS) { errors.push(`${label}.value überschreitet ${VALUE_MAX_CHARS} Zeichen`); }
		switch (op.kind) {
			case 'set-section':
			case 'append-under-section': {
				if (op.target !== 'learning-design.md') { errors.push(`${label}: ${op.kind} ist nur an learning-design.md erlaubt`); break; }
				if (typeof op.section !== 'string' || op.section.trim() === '') errors.push(`${label}.section fehlt`);
				else if (op.section.length > SECTION_MAX_CHARS) errors.push(`${label}.section ist zu lang`);
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
			default:
				errors.push(`${label}.kind ist unbekannt: ${String(op.kind)}`);
		}
	}

	for (const d of r.teacher_decisions ?? []) {
		if (!isPlainObject(d)) { errors.push('teacher_decisions-Eintrag ist kein Objekt'); continue; }
		if (typeof d.explicit !== 'boolean') errors.push('teacher_decisions.explicit muss boolean sein');
		if (!evidenceOk(d.evidence)) errors.push('teacher_decisions.evidence verweist nicht auf das angebotene Gesprächsfenster');
	}

	// Bounded knowledge-request intents: at most one per run, source-grounded
	// only, grounded in a teacher message, tightly bounded and non-personal.
	if ((r.service_intents ?? []).length > 1) {
		errors.push('service_intents: höchstens ein begrenzter Knowledge-Request pro Lauf');
	}
	let siIdx = 0;
	for (const si of r.service_intents ?? []) {
		siIdx += 1;
		const label = `service_intents[${siIdx}]`;
		if (!isPlainObject(si)) { errors.push(`${label} ist kein Objekt`); continue; }
		if (!allowedTasks.has(si.task)) {
			errors.push(`${label}.task "${String(si.task)}" ist keine dispatchbare Capability im Katalog (registry-getrieben)`);
		}
		if (typeof si.reason !== 'string' || si.reason.trim() === '') errors.push(`${label}.reason fehlt`);
		if (si.return_to !== 'critical_friend') errors.push(`${label}.return_to muss critical_friend sein`);
		const auth = si.authorization;
		if (!isPlainObject(auth)) {
			errors.push(`${label}.authorization fehlt`);
		} else {
			if (!SERVICE_INTENT_AUTHORIZATIONS.includes(auth.type)) {
				errors.push(`${label}.authorization.type muss implied_bounded_request sein`);
			}
			const ev = typeof auth.evidence === 'string' ? auth.evidence.trim() : '';
			// "context" is explicitly insufficient: a belegter Nutzerauftrag is required.
			if (ev === '' || ev === 'context' || !userMessageIds.has(ev)) {
				errors.push(`${label}.authorization.evidence verweist nicht auf eine belegte Nachricht der Lehrkraft`);
			}
		}
		const scope = si.scope;
		if (!isPlainObject(scope)) {
			errors.push(`${label}.scope fehlt`);
		} else if (si.task === 'verify_curriculum_alignment') {
			for (const field of CURRICULUM_SCOPE_REQUIRED) {
				if (typeof scope[field] !== 'string' || scope[field].trim() === '') {
					errors.push(`${label}.scope.${field} fehlt (offener oder unbegrenzter Scope)`);
				}
			}
			const allowedScopeKeys = new Set([...CURRICULUM_SCOPE_REQUIRED, ...CURRICULUM_SCOPE_OPTIONAL]);
			for (const key of Object.keys(scope)) {
				if (!allowedScopeKeys.has(key)) {
					errors.push(`${label}.scope.${key} ist kein zulässiges, öffentliches Scope-Feld (mögliche personenbezogene Daten)`);
				}
			}
		}
		// Optional storage target. Absent → draft. A knowledge_proposal is only
		// valid with a knowledge-proposals/ location and must never write into
		// curated knowledge/ (no automatic curation).
		if (si.expected_output !== undefined) {
			const eo = si.expected_output;
			if (!isPlainObject(eo)) {
				errors.push(`${label}.expected_output muss ein Objekt sein`);
			} else {
				if (!SERVICE_INTENT_OUTPUT_TYPES.includes(eo.type)) {
					errors.push(`${label}.expected_output.type muss draft oder knowledge_proposal sein`);
				}
				if (eo.type === 'knowledge_proposal') {
					const loc = typeof eo.location === 'string' ? eo.location.replace(/\\/g, '/').trim() : '';
					if (loc === '') {
						errors.push(`${label}.expected_output.location fehlt (ein Knowledge Proposal braucht einen Ablageort unter knowledge-proposals/)`);
					} else if (!loc.includes('knowledge-proposals/')) {
						errors.push(`${label}.expected_output.location muss unter knowledge-proposals/ liegen (keine direkte Ablage im kuratierten knowledge/)`);
					}
				}
			}
		}
	}

	if (r.next_turn_hint !== null) {
		const h = r.next_turn_hint;
		if (!['none', 'open_question'].includes(h.kind)) errors.push('next_turn_hint.kind ist unzulässig');
		if (typeof h.content !== 'string' || h.content.trim() === '') errors.push('next_turn_hint.content fehlt');
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, result: r };
}
