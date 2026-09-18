// Domain → moment source adapter.
//
// The canonical LearningMoment domain (`learning-moments.json`, see
// plugins/pts-learning-moment-binding/lib/domain.mjs) is the SINGLE structured
// moment source. This adapter presents each domain moment in the shape the older
// pts-web UI and the legacy Teaching Product engine already consume
// (`{ id, title, type, function, learning_activity, expected_experience,
// material_needs, materials, open_questions, status }`), so those consumers read
// the domain instead of parsing a removed `learning-landscape.md`.
//
// Two entry points: a pure sync mapper over already-read store text (for the
// sync snapshot/engine paths) and an async reader (for the route handlers).

import { parseStore, listLearningMoments } from '../../plugins/pts-learning-moment-binding/lib/domain.mjs';

/** Map one canonical domain moment to the landscape-shaped moment object. */
export function momentToLandscapeShape(m) {
	return {
		id: m.domainId,
		title: typeof m.title === 'string' ? m.title : '',
		type: typeof m.type === 'string' ? m.type : '',
		function: typeof m.function === 'string' ? m.function : '',
		learning_activity: typeof m.learning_activity === 'string' ? m.learning_activity : '',
		expected_experience: typeof m.expected_experience === 'string' ? m.expected_experience : '',
		material_needs: Array.isArray(m.material_needs) ? m.material_needs : [],
		materials: Array.isArray(m.materials) ? m.materials : [],
		open_questions: Array.isArray(m.open_questions) ? m.open_questions : [],
		status: typeof m.status === 'string' ? m.status : 'draft',
		provenance: typeof m.provenance === 'string' ? m.provenance : '',
		time_estimate: Number.isFinite(m.time_estimate) ? m.time_estimate : null,
	};
}

/** Sync: landscape-shaped moments from already-read `learning-moments.json` text. */
export function momentsFromStoreRaw(rawText) {
	return parseStore(rawText).moments.map(momentToLandscapeShape);
}

/** Async: landscape-shaped moments read from the Denkraum domain store. */
export async function readDomainMoments(root) {
	return (await listLearningMoments(root)).map(momentToLandscapeShape);
}
