// Spike demo seed (§17 minimal test case). Builds a realistic starting product
// — one series, one lesson, three phases, one task block each — from a small
// confirmed Denkstand, so the browser E2E has something to edit. It goes through
// the SAME snapshot boundary as the real flow: nothing crosses that is not
// teacher_confirmed, and a learning moment is NOT turned into a lesson
// automatically (the lesson is built explicitly).

import { createProductSnapshot, sourceRef } from './snapshot.mjs';
import { createProductFromSnapshot, addLesson, addPhase, addBlock } from './product.mjs';

const DEMO_DENKSTAND = [
	{ id: 'decision-17', status: 'teacher_confirmed', significance: 'anchor', statement: 'Gottesbild als Denkhebel' },
	{ id: 'decision-22', status: 'teacher_confirmed', significance: 'supporting', statement: 'Zwei Darstellungen vergleichen' },
	{ id: 'q-01', status: 'teacher_open', statement: 'Wie stark soll die Schlussphase persönlich werden?' },
];
const DEMO_LEDGER = {
	schema: 'ptspace.learning-moment-bindings/v1',
	moments: [{ domainId: 'lm-01', version: 1 }, { domainId: 'lm-02', version: 1 }, { domainId: 'lm-03', version: 1 }],
};

export function buildDemoSnapshot(options = {}) {
	return createProductSnapshot({
		denkstandEntries: DEMO_DENKSTAND,
		momentLedger: DEMO_LEDGER,
		sourceRevision: 42,
		selection: {
			learningMomentIds: ['lm-01', 'lm-02', 'lm-03'],
			decisionIds: ['decision-17', 'decision-22'],
			openQuestionIds: ['q-01'],
		},
	}, options);
}

export function buildDemoProduct(options = {}) {
	const snapshot = buildDemoSnapshot(options);
	let product = createProductFromSnapshot(snapshot, { title: 'KI und Gottesbild' }, options);
	const lesson = addLesson(product, {
		title: 'Stunde 1',
		sourceRefs: [sourceRef('learning-moment', 'lm-03'), sourceRef('decision', 'decision-17')],
	}, options);
	product = lesson.product;
	const lessonId = product.series.lessons[0].id;

	const phases = [
		{ title: 'Einstieg', durationMinutes: 10, refs: ['lm-01'], block: 'Betrachtet die beiden Bilder. Was fällt euch **sofort** auf?' },
		{ title: 'Erarbeitung', durationMinutes: 20, refs: ['lm-03'], block: 'Vergleicht die Darstellungen und notiert drei Unterschiede.' },
		{ title: 'Sicherung', durationMinutes: 15, refs: ['lm-02'], block: 'Formuliert in einem Satz, was das jeweilige _Gottesbild_ prägt.' },
	];
	for (const phase of phases) {
		const added = addPhase(product, {
			lessonId, title: phase.title, durationMinutes: phase.durationMinutes,
			sourceRefs: phase.refs.map((id) => sourceRef('learning-moment', id)),
		}, options);
		product = added.product;
		const phaseId = product.series.lessons[0].phases.at(-1).id;
		product = addBlock(product, { lessonId, phaseId, type: 'task', content: phase.block }, options).product;
	}
	return product;
}
