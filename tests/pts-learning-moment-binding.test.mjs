import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
	emptyStore, parseStore, serializeStore, createMoment, updateMoment, deleteMoment,
	findMoment, listMoments, isDomainId, DomainError,
} from '../plugins/pts-learning-moment-binding/lib/domain.mjs';
import {
	emptyLedger, parseLedger, serializeLedger, bindProjection, addProjection, moveProjection,
	detachProjection, projectionsFor, findProjection, isStaleProjection, syncProjections, BindingError,
} from '../plugins/pts-learning-moment-binding/lib/bindings.mjs';
import { classifyReaction, usagesFromImpact, RED_THREAD_FIELDS } from '../plugins/pts-learning-moment-binding/lib/reactions.mjs';

const NOW = '2026-09-16T10:00:00.000Z';
const clock = () => NOW;

function created(domainId = 'lm-danke', input = {}) {
	return createMoment(emptyStore(), { domainId, title: 'Danke erkennen', createdFrom: { type: 'whiteboard', sourceId: 'shape:abc' }, ...input }, { now: clock });
}

// ---------------------------------------------------------------- Domain store

test('a canonical id is stable and never a shape/session id', () => {
	assert.ok(isDomainId('lm-danke'));
	assert.ok(isDomainId('lm-17'));
	assert.ok(!isDomainId('shape:abc'));
	assert.ok(!isDomainId('P-101'));
	assert.ok(!isDomainId('Danke'));
});

test('createLearningMoment produces a stable domainId, version 1 and timestamps', () => {
	const { created: didCreate, moment, store } = created();
	assert.equal(didCreate, true);
	assert.equal(store.moments.length, 1);
	assert.equal(moment.domainId, 'lm-danke');
	assert.equal(moment.title, 'Danke erkennen');
	assert.equal(moment.version, 1);
	assert.equal(moment.status, 'draft');
	assert.equal(moment.createdAt, NOW);
	assert.equal(moment.updatedAt, NOW);
	assert.equal(moment.provenance.confirmedBy, 'teacher');
	assert.deepEqual(moment.provenance.createdFrom, { type: 'whiteboard', sourceId: 'shape:abc' });
});

test('create fails closed without a valid id or a title', () => {
	assert.throws(() => createMoment(emptyStore(), { domainId: 'lm-x' }), (e) => e instanceof DomainError && e.code === 'title-required');
	assert.throws(() => createMoment(emptyStore(), { domainId: 'shape:abc', title: 'X' }), (e) => e.code === 'invalid-domain-id');
});

test('a second create of the same id is idempotent — no duplicate', () => {
	const first = created();
	const second = createMoment(first.store, { domainId: 'lm-danke', title: 'Anders' }, { now: clock });
	assert.equal(second.created, false);
	assert.equal(second.store.moments.length, 1);
	assert.equal(second.moment.title, 'Danke erkennen'); // original content preserved
});

test('updateLearningMoment bumps the version in place and keeps id + provenance (rename ≠ new identity)', () => {
	const { store } = created();
	const upd = updateMoment(store, 'lm-danke', { title: 'Dankbarkeit erkennen' }, { now: () => '2026-09-16T12:00:00.000Z' });
	assert.equal(upd.ok, true);
	assert.equal(upd.versionBefore, 1);
	assert.equal(upd.versionAfter, 2);
	const moment = findMoment(upd.store, 'lm-danke');
	assert.equal(moment.domainId, 'lm-danke'); // a title change never changes identity
	assert.equal(moment.title, 'Dankbarkeit erkennen');
	assert.equal(moment.provenance.confirmedAt, NOW);
	assert.equal(moment.updatedAt, '2026-09-16T12:00:00.000Z');
});

test('a content edit bumps the version; a no-op patch does not', () => {
	const { store } = created('lm-danke', { content: 'Erste Fassung' });
	const changed = updateMoment(store, 'lm-danke', { content: 'Zweite Fassung' }, { now: clock });
	assert.equal(changed.versionAfter, 2);
	const noop = updateMoment(changed.store, 'lm-danke', { content: 'Zweite Fassung' }, { now: clock });
	assert.equal(noop.versionAfter, 2, 'an unchanged content patch is a no-op, no version churn');
	assert.deepEqual(noop.changedFields, []);
});

test('a stale update overwrites nothing (fail-closed)', () => {
	const v2 = updateMoment(created().store, 'lm-danke', { title: 'v2' }, { now: clock }).store; // version 2
	const stale = updateMoment(v2, 'lm-danke', { title: 'späte Fassung' }, { expectedVersion: 1, now: clock });
	assert.equal(stale.ok, false);
	assert.equal(stale.code, 'stale');
	assert.equal(findMoment(stale.store, 'lm-danke').version, 2, 'the stale write did not change the version');
	assert.equal(findMoment(stale.store, 'lm-danke').title, 'v2');
});

test('deleteLearningMoment is explicit and removes exactly one object', () => {
	const { store } = created();
	const removed = deleteMoment(store, 'lm-danke');
	assert.equal(removed.store.moments.length, 0);
	assert.throws(() => deleteMoment(emptyStore(), 'lm-x'), (e) => e.code === 'unknown-domain-id');
});

test('the store round-trips losslessly across serialize/parse (reload/restart)', () => {
	let store = created('lm-danke', { content: 'Text', function: 'Zugang', status: 'stable' }).store;
	store = updateMoment(store, 'lm-danke', { title: 'Neu' }, { now: clock }).store;
	const round = parseStore(serializeStore(store));
	const moment = findMoment(round, 'lm-danke');
	assert.equal(moment.version, 2);
	assert.equal(moment.title, 'Neu');
	assert.equal(moment.status, 'stable');
	assert.equal(moment.function, 'Zugang');
	assert.deepEqual(moment.provenance.createdFrom, { type: 'whiteboard', sourceId: 'shape:abc' });
});

test('a missing or empty store is empty; a wrong schema fails closed', () => {
	assert.deepEqual(parseStore('').moments, []);
	assert.deepEqual(parseStore(undefined).moments, []);
	assert.throws(() => parseStore('{"schema":"other","moments":[]}'), (e) => e.code === 'store-corrupt');
	assert.throws(() => parseStore('not json'), (e) => e.code === 'store-corrupt');
});

test('listLearningMoments returns every domain object in a stable order', () => {
	let store = created('lm-02', { title: 'B' }).store;
	store = createMoment(store, { domainId: 'lm-01', title: 'A' }, { now: clock }).store;
	assert.deepEqual(listMoments(store).map((m) => m.domainId), ['lm-01', 'lm-02']);
});

// ---------------------------------------------------------------- Projection ledger (content-free)

test('the projection ledger carries no title/content/status — projections only', () => {
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101', page: 'Übersicht', version: 3 }).ledger;
	const raw = JSON.parse(serializeLedger(ledger));
	assert.deepEqual(Object.keys(raw.moments[0]), ['domainId', 'projections']);
	assert.deepEqual(Object.keys(raw.moments[0].projections[0]).sort(), ['boundVersion', 'page', 'projectionId', 'projectionType', 'shapeId']);
	assert.equal(raw.moments[0].projections[0].boundVersion, 3);
});

test('one LearningMoment can carry several projections with distinct ids on one domain id', () => {
	let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101', page: 'Übersicht', version: 1 }).ledger;
	ledger = addProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', page: 'LM · Danke', version: 1 }).ledger;
	const projections = projectionsFor(ledger, 'lm-danke');
	assert.equal(projections.length, 2);
	assert.deepEqual(projections.map((p) => p.projectionId).sort(), ['P-101', 'P-102']);
	for (const p of projections) assert.equal(findProjection(ledger, p.projectionId).length, 1);
});

test('a projectionId can never bind two objects (fail-closed on duplicate)', () => {
	let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101' }).ledger;
	assert.throws(() => bindProjection(ledger, { domainId: 'lm-andere', projectionId: 'P-101' }), (e) => e instanceof BindingError && e.code === 'duplicate-projection');
});

test('move keeps the same projectionId and only changes the page', () => {
	let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101', page: 'Page A' }).ledger;
	const moved = moveProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', toPage: 'Page B' });
	assert.equal(moved.projection.projectionId, 'P-101');
	assert.equal(moved.projection.page, 'Page B');
	assert.equal(projectionsFor(moved.ledger, 'lm-danke').length, 1, 'move must not create a second projection');
});

test('an additional representation is a NEW projectionId (copy semantics)', () => {
	let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101', page: 'Page A' }).ledger;
	ledger = addProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', page: 'Page B' }).ledger;
	assert.deepEqual(projectionsFor(ledger, 'lm-danke').map((p) => p.page).sort(), ['Page A', 'Page B']);
});

test('detaching a projection keeps the ledger entry — even the last one (domain stays authoritative)', () => {
	let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101' }).ledger;
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102' }).ledger;
	const afterOne = detachProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102' });
	assert.equal(afterOne.domainRetained, true);
	assert.equal(afterOne.orphanedProjections, false);
	const afterLast = detachProjection(afterOne.ledger, { domainId: 'lm-danke', projectionId: 'P-101' });
	assert.equal(afterLast.orphanedProjections, true);
	assert.equal(projectionsFor(afterLast.ledger, 'lm-danke').length, 0);
});

test('staleness is measured against the domain version passed in, then re-synced', () => {
	let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101', version: 1 }).ledger;
	assert.equal(isStaleProjection(ledger, 'lm-danke', 'P-101', 2), true);
	ledger = syncProjections(ledger, 'lm-danke', 2).ledger;
	assert.equal(isStaleProjection(ledger, 'lm-danke', 'P-101', 2), false);
});

// ---------------------------------------------------------------- Reactions

test('automatic: a relabel or a display-only change, no approval', () => {
	assert.equal(classifyReaction({ domainId: 'lm-danke', changedFields: ['title'], intent: 'relabel' }).reaction, 'automatic');
	assert.equal(classifyReaction({ domainId: 'lm-danke', changedFields: ['materials'], intent: 'semantic' }).reaction, 'automatic');
});

test('confirm: a bounded semantic change with a known dependent needs approval', () => {
	const impact = { usages: [{ lessonId: 'lesson-2', lessonTitle: 'Stunde 2', phaseId: 'phase-1', phaseTitle: 'Einstieg' }] };
	const reaction = classifyReaction({ domainId: 'lm-danke', changedFields: ['learning_activity'], intent: 'semantic', scope: 'local', usages: usagesFromImpact(impact) });
	assert.equal(reaction.reaction, 'confirm');
	assert.equal(reaction.affected[0].id, 'lesson-2.phase-1');
});

test('clarify: a core reframe with several plausible consequences is a conversation', () => {
	assert.equal(classifyReaction({ domainId: 'lm-danke', changedFields: ['title', 'function', 'learning_activity'], intent: 'semantic' }).reaction, 'clarify');
	assert.equal(classifyReaction({ domainId: 'lm-danke', changedFields: ['title'], intent: 'semantic', scope: 'redesign' }).reaction, 'clarify');
	assert.equal(classifyReaction({ domainId: 'lm-danke', changedFields: ['type'], intent: 'semantic' }).reaction, 'clarify');
});

test('red-thread fields stay in step with moment-impact', () => {
	assert.deepEqual(RED_THREAD_FIELDS, ['title', 'function', 'learning_activity', 'expected_experience', 'open_questions']);
});

// ---------------------------------------------------------------- Renderer isolation

test('the renderer creates no domain objects and never writes the store or ledger', async () => {
	const source = await readFile(new URL('../plugins/pts-whiteboard-renderer/lib/index.js', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /learning-moment-bindings/);
	assert.doesNotMatch(source, /learning-moments\.json/);
	assert.doesNotMatch(source, /createLearningMoment/);
	assert.doesNotMatch(source, /updateMoment/);
});
