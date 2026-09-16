// Phase 2 — reaction model.
//
// A domain change is classified into exactly one of three reactions. This is a
// small, explainable classification, NOT a general semantic impact AI:
//
//   automatic  a technical / display-only change, or an explicit relabel:
//              no new pedagogical decision arises. Projections re-sync.
//   confirm    a bounded pedagogical change that touches a KNOWN dependent
//              artefact. A follow-up needs teacher approval before it happens.
//   clarify    a semantic core change whose consequences are not mechanically
//              determinable. No automatic follow-up mutation; the Companion
//              makes the consequence a subject of the conversation.
//
// The red-thread fields mirror moment-impact.mjs so the two stay in step.

export const RED_THREAD_FIELDS = Object.freeze(['title', 'function', 'learning_activity', 'expected_experience', 'open_questions']);

// Areas a teacher may want to revisit when a core learning moment is reframed.
// These are conversation prompts, never automatic edits.
const POSSIBLE_AREAS = Object.freeze(['Lernziel', 'Methodenauswahl', 'Material', 'Reihenfolge', 'Übergang']);

/**
 * @param {object} input
 *  - domainId
 *  - versionBefore, versionAfter
 *  - changedFields: string[]  field ids that actually changed
 *  - intent: 'relabel' | 'semantic'   how the teacher framed the change
 *  - scope:  'local'  | 'redesign'    optional explicit breadth
 *  - usages: Array<{ type, id, reason? }>  known dependent artefacts
 * @returns {object} DomainImpact
 */
export function classifyReaction(input = {}) {
	const {
		domainId,
		versionBefore = null,
		versionAfter = null,
		changedFields = [],
		intent = 'semantic',
		scope = 'local',
		usages = [],
	} = input;

	const redThread = changedFields.filter((field) => RED_THREAD_FIELDS.includes(field));
	// A pedagogical type change is a semantic core change even though it is not a
	// red-thread text field; a redesign scope is likewise never display-only.
	const structuralSignal = scope === 'redesign' || changedFields.includes('type');
	const displayOnly = redThread.length === 0 && !structuralSignal;

	const source = { domainType: 'learning_moment', domainId, versionBefore, versionAfter };

	// An explicit relabel, or a purely technical/display change, carries no new
	// decision.
	if (intent === 'relabel' || displayOnly) {
		return {
			source,
			reaction: 'automatic',
			reason: intent === 'relabel'
				? 'Als kanonische Umbenennung behandelt; die Bezeichnung wird in den Projektionen aktualisiert.'
				: 'Nur technische bzw. anzeigebezogene Felder geändert; keine neue pädagogische Entscheidung.',
			affected: [],
		};
	}

	// A core reframe with several plausible consequences is not mechanically
	// resolvable — even a single title change, when the teacher frames it as a
	// redesign, escalates here.
	const structural = structuralSignal || redThread.length >= 2;
	if (structural) {
		return {
			source,
			reaction: 'clarify',
			reason: 'Semantische Kernänderung mit mehreren möglichen Folgen; die Konsequenz muss geklärt werden.',
			affected: [
				...usages.map((usage) => ({ type: usage.type ?? 'lesson-phase', id: usage.id, reason: usage.reason ?? 'bekannte abhängige Darstellung' })),
				...POSSIBLE_AREAS.map((area) => ({ type: 'possible-area', id: area, reason: 'könnte betroffen sein' })),
			],
		};
	}

	// A bounded semantic change with a known dependent → propose, then confirm.
	return {
		source,
		reaction: 'confirm',
		reason: usages.length > 0
			? 'Begrenzte pädagogische Änderung mit bekannter abhängiger Darstellung; Folgeänderung erst nach Bestätigung.'
			: 'Begrenzte pädagogische Änderung; vor einer Übernahme in Folgeartefakte ist eine Bestätigung nötig.',
		affected: usages.map((usage) => ({ type: usage.type ?? 'lesson-phase', id: usage.id, reason: usage.reason ?? 'bekannte abhängige Darstellung' })),
	};
}

/**
 * Adapt a moment-impact.mjs result (buildMomentImpact) into classifier input,
 * so the existing dependency preview drives the reaction without duplicating
 * the usage-scan.
 */
export function usagesFromImpact(impact) {
	return (impact?.usages ?? []).map((usage) => ({
		type: 'lesson-phase',
		id: `${usage.lessonId}.${usage.phaseId}`,
		reason: `${usage.lessonTitle} · ${usage.phaseTitle}`,
	}));
}
