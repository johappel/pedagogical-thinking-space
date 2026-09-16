import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
	emptyLedger, parseLedger, serializeLedger, captureLearningMoment,
	bumpVersion, deleteLearningMoment, findMoment, isDomainId, DomainError,
} from '../plugins/pts-learning-moment-binding/lib/domain.mjs';
import {
	bindProjection, addProjection, moveProjection, detachProjection,
	projectionsFor, findProjection, isStaleProjection, syncProjections,
} from '../plugins/pts-learning-moment-binding/lib/bindings.mjs';
import { classifyReaction, usagesFromImpact, RED_THREAD_FIELDS } from '../plugins/pts-learning-moment-binding/lib/reactions.mjs';

const NOW = '2026-09-16T10:00:00.000Z';

function captured(domainId = 'lm-danke', createdFrom = { type: 'whiteboard', sourceId: 'shape:abc' }) {
	return captureLearningMoment(emptyLedger(), { domainId, createdFrom, confirmedAt: NOW });
}

// ---------------------------------------------------------------- Domain

test('a canonical id is a stable landscape moment id, not a shape/session id', () => {
	assert.ok(isDomainId('lm-danke'));
	assert.ok(isDomainId('lm-17'));
	assert.ok(!isDomainId('shape:abc'));
	assert.ok(!isDomainId('P-101'));
	assert.ok(!isDomainId('Danke'));
});

test('a confirmed capture creates exactly one domain object', () => {
	const { ledger, created, moment } = captured();
	assert.equal(created, true);
	assert.equal(ledger.moments.length, 1);
	assert.equal(moment.domainId, 'lm-danke');
	assert.equal(moment.version, 1);
	assert.equal(moment.provenance.confirmedBy, 'teacher');
	assert.equal(moment.provenance.confirmedAt, NOW);
	assert.deepEqual(moment.provenance.createdFrom, { type: 'whiteboard', sourceId: 'shape:abc' });
});

test('a whiteboard card without teacher confirmation never becomes a domain object', () => {
	// There is no path from a card role to a domain object; capture demands a
	// teacher confirmation timestamp and fails closed without it.
	assert.throws(() => captureLearningMoment(emptyLedger(), { domainId: 'lm-danke' }), (e) => e instanceof DomainError && e.code === 'confirmation-required');
	assert.throws(() => captureLearningMoment(emptyLedger(), { domainId: 'shape:abc', confirmedAt: NOW }), (e) => e.code === 'invalid-domain-id');
});

test('a second capture of the same id is idempotent — no duplicate', () => {
	const first = captured();
	const second = captureLearningMoment(first.ledger, { domainId: 'lm-danke', confirmedAt: '2026-09-16T11:00:00.000Z' });
	assert.equal(second.created, false);
	assert.equal(second.ledger.moments.length, 1);
	assert.equal(second.moment.provenance.confirmedAt, NOW); // original provenance preserved
});

test('a canonical content change bumps the version and keeps id + provenance', () => {
	const { ledger } = captured();
	const bumped = bumpVersion(ledger, { domainId: 'lm-danke' });
	assert.equal(bumped.ok, true);
	assert.equal(bumped.versionBefore, 1);
	assert.equal(bumped.versionAfter, 2);
	const moment = findMoment(bumped.ledger, 'lm-danke');
	assert.equal(moment.domainId, 'lm-danke'); // a title change never changes identity
	assert.equal(moment.provenance.confirmedAt, NOW);
});

test('an explicit domain deletion is separate and removes the object', () => {
	const { ledger } = captured();
	const removed = deleteLearningMoment(ledger, { domainId: 'lm-danke' });
	assert.equal(removed.ledger.moments.length, 0);
	assert.throws(() => deleteLearningMoment(emptyLedger(), { domainId: 'lm-x' }), (e) => e.code === 'unknown-domain-id');
});

// ---------------------------------------------------------------- Binding

test('one LearningMoment can carry several projections with distinct ids on one domain id', () => {
	let { ledger } = captured();
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', page: 'Übersicht' }).ledger;
	ledger = addProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', page: 'LM · Danke' }).ledger;
	const projections = projectionsFor(ledger, 'lm-danke');
	assert.equal(projections.length, 2);
	assert.deepEqual(projections.map((p) => p.projectionId).sort(), ['P-101', 'P-102']);
	// distinct projection ids, one domain id
	for (const p of projections) assert.equal(findProjection(ledger, p.projectionId).length, 1);
});

test('a projectionId can never bind two objects (fail-closed on duplicate)', () => {
	let { ledger } = captured();
	ledger = captureLearningMoment(ledger, { domainId: 'lm-andere', confirmedAt: NOW }).ledger;
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101' }).ledger;
	assert.throws(() => bindProjection(ledger, { domainId: 'lm-andere', projectionId: 'P-101' }), (e) => e.code === 'duplicate-projection');
});

test('binding to an unknown domain id fails closed', () => {
	assert.throws(() => bindProjection(emptyLedger(), { domainId: 'lm-unknown', projectionId: 'P-1' }), (e) => e.code === 'unknown-domain-id');
});

test('detaching a projection keeps the LearningMoment — even the last one', () => {
	let { ledger } = captured();
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101' }).ledger;
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102' }).ledger;

	const afterOne = detachProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102' });
	assert.equal(afterOne.domainRetained, true);
	assert.equal(afterOne.orphanedDomain, false);
	assert.ok(findMoment(afterOne.ledger, 'lm-danke'));

	const afterLast = detachProjection(afterOne.ledger, { domainId: 'lm-danke', projectionId: 'P-101' });
	assert.equal(afterLast.orphanedDomain, true);
	assert.ok(findMoment(afterLast.ledger, 'lm-danke'), 'the last detach does not delete the domain object');
	assert.equal(projectionsFor(afterLast.ledger, 'lm-danke').length, 0);
});

// ---------------------------------------------------------------- Move vs Copy

test('move keeps the same projectionId and only changes the page', () => {
	let { ledger } = captured();
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', page: 'Page A' }).ledger;
	const moved = moveProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', toPage: 'Page B' });
	assert.equal(moved.projection.projectionId, 'P-101');
	assert.equal(moved.projection.page, 'Page B');
	assert.equal(projectionsFor(moved.ledger, 'lm-danke').length, 1, 'move must not create a second projection');
});

test('an additional representation is a NEW projectionId (copy semantics)', () => {
	let { ledger } = captured();
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', page: 'Page A' }).ledger;
	ledger = addProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', page: 'Page B' }).ledger;
	const projections = projectionsFor(ledger, 'lm-danke');
	assert.equal(projections.length, 2);
	assert.deepEqual(projections.map((p) => p.page).sort(), ['Page A', 'Page B']);
});

// ---------------------------------------------------------------- Reactions

test('automatic: a relabel or a display-only change re-syncs projections, no approval', () => {
	const relabel = classifyReaction({ domainId: 'lm-danke', changedFields: ['title'], intent: 'relabel', usages: [{ type: 'lesson-phase', id: 'l1.p1' }] });
	assert.equal(relabel.reaction, 'automatic');

	const displayOnly = classifyReaction({ domainId: 'lm-danke', changedFields: ['materials'], intent: 'semantic' });
	assert.equal(displayOnly.reaction, 'automatic');
});

test('confirm: a bounded semantic change with a known dependent needs approval', () => {
	const impact = { usages: [{ lessonId: 'lesson-2', lessonTitle: 'Stunde 2', phaseId: 'phase-1', phaseTitle: 'Einstieg' }] };
	const reaction = classifyReaction({
		domainId: 'lm-danke', versionBefore: 1, versionAfter: 2,
		changedFields: ['learning_activity'], intent: 'semantic', scope: 'local',
		usages: usagesFromImpact(impact),
	});
	assert.equal(reaction.reaction, 'confirm');
	assert.equal(reaction.affected.length, 1);
	assert.equal(reaction.affected[0].id, 'lesson-2.phase-1');
});

test('clarify: a core reframe with several plausible consequences is a conversation', () => {
	const multiField = classifyReaction({ domainId: 'lm-danke', changedFields: ['title', 'function', 'learning_activity'], intent: 'semantic' });
	assert.equal(multiField.reaction, 'clarify');
	assert.ok(multiField.affected.some((a) => a.type === 'possible-area'));

	const redesign = classifyReaction({ domainId: 'lm-danke', changedFields: ['title'], intent: 'semantic', scope: 'redesign' });
	assert.equal(redesign.reaction, 'clarify');

	const typeChange = classifyReaction({ domainId: 'lm-danke', changedFields: ['type'], intent: 'semantic' });
	assert.equal(typeChange.reaction, 'clarify');
});

test('red-thread fields stay in step with moment-impact', () => {
	assert.deepEqual(RED_THREAD_FIELDS, ['title', 'function', 'learning_activity', 'expected_experience', 'open_questions']);
});

// ---------------------------------------------------------------- Safety

test('a stale version overwrites nothing (fail-closed)', () => {
	const { ledger } = captured();
	const bumped = bumpVersion(ledger, { domainId: 'lm-danke' }).ledger; // now v2
	const stale = bumpVersion(bumped, { domainId: 'lm-danke', expectedVersion: 1 });
	assert.equal(stale.ok, false);
	assert.equal(stale.code, 'stale');
	assert.equal(findMoment(stale.ledger, 'lm-danke').version, 2, 'the stale write did not change the version');
});

test('a stale projection is detected and re-synced only through the domain', () => {
	let { ledger } = captured();
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101' }).ledger; // boundVersion 1
	ledger = bumpVersion(ledger, { domainId: 'lm-danke' }).ledger; // domain v2
	assert.equal(isStaleProjection(ledger, 'lm-danke', 'P-101'), true);
	ledger = syncProjections(ledger, 'lm-danke').ledger;
	assert.equal(isStaleProjection(ledger, 'lm-danke', 'P-101'), false);
});

test('the renderer creates no domain objects and never writes the ledger', async () => {
	const source = await readFile(new URL('../plugins/pts-whiteboard-renderer/lib/index.js', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /learning-moment-bindings/);
	assert.doesNotMatch(source, /captureLearningMoment/);
	assert.doesNotMatch(source, /bumpVersion/);
});

// ---------------------------------------------------------------- Persistence

test('the ledger round-trips losslessly across serialize/parse (reload/restart)', () => {
	let { ledger } = captured();
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', page: 'Übersicht' }).ledger;
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', page: 'LM · Danke' }).ledger;
	ledger = bumpVersion(ledger, { domainId: 'lm-danke' }).ledger;

	const round = parseLedger(serializeLedger(ledger));
	const moment = findMoment(round, 'lm-danke');
	assert.equal(moment.version, 2);
	assert.equal(moment.provenance.confirmedAt, NOW);
	assert.deepEqual(moment.provenance.createdFrom, { type: 'whiteboard', sourceId: 'shape:abc' });
	assert.equal(projectionsFor(round, 'lm-danke').length, 2);
	assert.equal(projectionsFor(round, 'lm-danke')[0].boundVersion, 1);
});

test('a missing or empty ledger is an empty ledger, a wrong schema fails closed', () => {
	assert.deepEqual(parseLedger('').moments, []);
	assert.deepEqual(parseLedger(undefined).moments, []);
	assert.throws(() => parseLedger('{"schema":"other","moments":[]}'), (e) => e.code === 'ledger-corrupt');
	assert.throws(() => parseLedger('not json'), (e) => e.code === 'ledger-corrupt');
});
