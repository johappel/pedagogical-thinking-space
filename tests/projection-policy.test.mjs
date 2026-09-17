// Unit tests for the Board Projection Policy (dsh/presets/pts-companion/projection-policy.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, SIGNIFICANCE } from '../dsh/presets/pts-companion/denkstand-state.mjs';
import { BOARD, projectEntry, planProjection } from '../dsh/presets/pts-companion/projection-policy.mjs';

const entry = (over) => ({ status: STATUS.OPEN, significance: SIGNIFICANCE.SUPPORTING, kind: null, ...over });

test('a confirmed load-bearing thought goes to the Übersicht', () => {
	const t = projectEntry(entry({ status: STATUS.CONFIRMED, significance: SIGNIFICANCE.ANCHOR }));
	assert.equal(t.board, BOARD.UEBERSICHT);
});

test('a preliminary thought lands at most on Sammeln', () => {
	const t = projectEntry(entry({ status: STATUS.OPEN, significance: SIGNIFICANCE.SUPPORTING }));
	assert.equal(t.board, BOARD.SAMMELN);
});

test('a confirmed learning moment projects to Übersicht and gets its own page', () => {
	const t = projectEntry(entry({ status: STATUS.CONFIRMED, kind: 'moment' }));
	assert.equal(t.board, BOARD.UEBERSICHT);
	assert.equal(t.ownPage, true);
});

test('a companion hypothesis is not projected automatically', () => {
	const t = projectEntry(entry({ status: STATUS.HYPOTHESIS, significance: SIGNIFICANCE.ANCHOR }));
	assert.equal(t.board, BOARD.NONE);
});

test('a fact only projects when it is currently relevant', () => {
	assert.equal(projectEntry(entry({ status: STATUS.FACT })).board, BOARD.NONE);
	assert.equal(projectEntry(entry({ status: STATUS.FACT }), { relevantNow: true }).board, BOARD.UEBERSICHT);
});

test('a small detail decision is normally not projected', () => {
	assert.equal(projectEntry(entry({ status: STATUS.CONFIRMED, significance: SIGNIFICANCE.DETAIL })).board, BOARD.NONE);
});

test('re-projecting the same entry updates, never duplicates', () => {
	const e = entry({ status: STATUS.CONFIRMED, significance: SIGNIFICANCE.ANCHOR });
	const existing = { projectionId: 'wb-1', board: BOARD.UEBERSICHT, page: 'Übersicht' };
	const plan = planProjection(e, existing);
	assert.equal(plan.op, 'update');
	assert.equal(plan.projectionId, 'wb-1');
});

test('a new entry creates a projection; a status change to a new board moves it', () => {
	const created = planProjection(entry({ status: STATUS.CONFIRMED, significance: SIGNIFICANCE.ANCHOR }), null);
	assert.equal(created.op, 'create');
	const moved = planProjection(
		entry({ status: STATUS.OPEN, significance: SIGNIFICANCE.SUPPORTING }),
		{ projectionId: 'wb-1', board: BOARD.UEBERSICHT },
	);
	assert.equal(moved.op, 'move');
	assert.equal(moved.projectionId, 'wb-1');
	assert.equal(moved.board, BOARD.SAMMELN);
});

test('removing a projection keeps the domain object', () => {
	const plan = planProjection(entry({ status: STATUS.REJECTED }), { projectionId: 'wb-1', board: BOARD.UEBERSICHT });
	assert.equal(plan.op, 'remove');
	assert.equal(plan.domainRetained, true);
});
