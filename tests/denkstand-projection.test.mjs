// Tests for the Denkstand → Board reconciliation driver
// (dsh/presets/pts-companion/denkstand-projection.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, SIGNIFICANCE, ACTOR, emptyState, record, hypothesize, reject } from '../dsh/presets/pts-companion/denkstand-state.mjs';
import { PAGE_TITLE } from '../dsh/presets/pts-companion/projection-policy.mjs';
import { planBoardReconcile, reconcileBoard, OVERVIEW_FRAME_HEADING } from '../dsh/presets/pts-companion/denkstand-projection.mjs';

function anchorState() {
	let state = emptyState();
	state = record(state, { status: STATUS.CONFIRMED, statement: 'Gott als Gegenüber', author: ACTOR.TEACHER, id: 'a', significance: SIGNIFICANCE.ANCHOR }).state;
	state = record(state, { status: STATUS.OPEN, statement: 'Erste lose Idee', author: ACTOR.TEACHER, id: 'p', significance: SIGNIFICANCE.SUPPORTING }).state;
	state = hypothesize(state, { statement: 'Companion-Vermutung', id: 'h' }).state;
	return state;
}

test('a confirmed anchor is planned onto the Übersicht page', () => {
	const plan = planBoardReconcile(anchorState());
	const overview = plan.requests.find((r) => r.page.title === PAGE_TITLE.UEBERSICHT);
	assert.ok(overview, 'expected an Übersicht request');
	assert.equal(overview.page.action, 'ensure');
	assert.equal(overview.heading.text, OVERVIEW_FRAME_HEADING);
	assert.ok(overview.elements.some((e) => e.text === 'Gott als Gegenüber'));
	// The hypothesis is not projected; the anchor is.
	assert.ok(!overview.elements.some((e) => e.text === 'Companion-Vermutung'));
	assert.ok(plan.pages.includes(PAGE_TITLE.UEBERSICHT));
});

test('a preliminary thought is planned onto Sammeln', () => {
	const plan = planBoardReconcile(anchorState());
	const sammeln = plan.requests.find((r) => r.page.title === PAGE_TITLE.SAMMELN);
	assert.ok(sammeln, 'expected a Sammeln request');
	assert.ok(sammeln.elements.some((e) => e.text === 'Erste lose Idee'));
});

test('a confirmed learning moment gets its own page', () => {
	let state = emptyState();
	state = record(state, { status: STATUS.CONFIRMED, statement: 'Lernmoment: Der Widerspruch', author: ACTOR.TEACHER, id: 'm', kind: 'moment' }).state;
	const plan = planBoardReconcile(state);
	assert.ok(plan.momentPages.includes('Lernmoment: Der Widerspruch'));
	assert.ok(plan.requests.some((r) => r.page.title === 'Lernmoment: Der Widerspruch'));
});

test('re-running produces an update of the same frame, not a duplicate page', () => {
	const state = anchorState();
	const a = planBoardReconcile(state);
	const b = planBoardReconcile(state);
	const pageA = a.requests.filter((r) => r.page.title === PAGE_TITLE.UEBERSICHT);
	const pageB = b.requests.filter((r) => r.page.title === PAGE_TITLE.UEBERSICHT);
	assert.equal(pageA.length, 1);
	assert.equal(pageB.length, 1);
	// Same title + update operation → the facade updates in place.
	assert.equal(pageB[0].operation, 'update_learning_moment_workspace');
});

test('a rejected framing is not projected', () => {
	let state = anchorState();
	state = reject(state, 'a', { actor: ACTOR.TEACHER }).state;
	const plan = planBoardReconcile(state);
	const overview = plan.requests.find((r) => r.page.title === PAGE_TITLE.UEBERSICHT);
	assert.ok(!overview || !overview.elements.some((e) => e.text === 'Gott als Gegenüber'));
});

test('reconcileBoard drives the render seam and reports applied pages', async () => {
	const seen = [];
	const render = async (request) => { seen.push(request.page.title); return { ok: true, status: 'verified' }; };
	const result = await reconcileBoard(render, anchorState());
	assert.equal(result.ok, true);
	assert.ok(seen.includes(PAGE_TITLE.UEBERSICHT));
	assert.ok(seen.includes(PAGE_TITLE.SAMMELN));
});

test('reconcileBoard skips cleanly when the board is not live', async () => {
	const render = async () => ({ ok: false, error: { code: 'whiteboard-not-live' } });
	const result = await reconcileBoard(render, anchorState());
	assert.equal(result.ok, false);
	assert.equal(result.skipped, 'whiteboard-not-live');
});

test('reconcileBoard does nothing on an empty state', async () => {
	const result = await reconcileBoard(async () => ({ ok: true }), emptyState());
	assert.equal(result.ok, true);
	assert.deepEqual(result.applied, []);
});
