// Pure dependency preview for a Learning Moment edit. The preview is advisory:
// it never rewrites a product or decides whether the teacher's change is right.

const FIELD_LABELS = Object.freeze({
	title: 'Titel',
	type: 'Typ',
	function: 'Didaktische Funktion',
	learning_activity: 'Lernaktivität',
	expected_experience: 'Erwartete Lernerfahrung',
	material_needs: 'Materialbedarfe',
	open_questions: 'Offene Fragen',
});

const RED_THREAD_FIELDS = new Set(['title', 'function', 'learning_activity', 'expected_experience', 'open_questions']);

function comparable(value) {
	if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
	return String(value ?? '').trim();
}

function same(a, b) {
	return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

export function buildMomentImpact({ moment, fields = {}, product = null }) {
	if (!moment?.id) throw new Error('moment required');
	const changedFields = Object.keys(FIELD_LABELS).filter((field) => Object.hasOwn(fields, field) && !same(moment[field], fields[field]));
	const usages = [];
	for (const lesson of product?.series?.lessons || []) {
		for (const phase of lesson.phases || []) {
			if (phase.momentIds?.includes(moment.id)) usages.push({
				lessonId: lesson.id,
				lessonTitle: lesson.title || lesson.id,
				phaseId: phase.id,
				phaseTitle: phase.title || phase.id,
			});
		}
	}
	const redThreadFields = changedFields.filter((field) => RED_THREAD_FIELDS.has(field));
	return {
		momentId: moment.id,
		momentTitle: moment.title || moment.id,
		changedFields: changedFields.map((field) => ({ id: field, label: FIELD_LABELS[field] })),
		usages,
		requiresReview: usages.length > 0 && changedFields.length > 0,
		redThreadCheck: redThreadFields.length > 0,
		redThreadFields: redThreadFields.map((field) => FIELD_LABELS[field]),
	};
}

