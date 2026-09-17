// Unit tests for the Current Denkstand model (dsh/presets/pts-companion/denkstand-state.mjs).
// Pure functions only: no DSH runtime, no Denkraum on disk.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	STATUS,
	ACTOR,
	SIGNIFICANCE,
	DenkstandError,
	emptyState,
	parseState,
	serializeState,
	record,
	hypothesize,
	confirm,
	reject,
	supersede,
	transition,
	projectCurrentState,
	historyOf,
} from '../dsh/presets/pts-companion/denkstand-state.mjs';

test('record + confirm: a confirmed statement is teacher ground', () => {
	let state = emptyState();
	const added = record(state, { status: STATUS.OPEN, statement: 'Gott als Gegenüber', author: ACTOR.TEACHER, id: 'e1' });
	state = added.state;
	assert.equal(added.entry.status, STATUS.OPEN);
	const confirmed = confirm(state, 'e1', { at: '2026-01-01T00:00:00Z' });
	assert.equal(confirmed.entry.status, STATUS.CONFIRMED);
	assert.equal(confirmed.entry.confirmedBy, ACTOR.TEACHER);
});

test('a companion hypothesis is never a teacher decision', () => {
	let state = emptyState();
	const hyp = hypothesize(state, { statement: 'Vielleicht geht es um Nähe', id: 'h1' });
	state = hyp.state;
	assert.equal(hyp.entry.status, STATUS.HYPOTHESIS);
	assert.equal(hyp.entry.author, ACTOR.ASSISTANT);
	assert.equal(hyp.entry.confirmedBy, null);
	// The assistant cannot confirm — only the teacher can.
	assert.throws(() => transition(state, 'h1', STATUS.CONFIRMED, { actor: ACTOR.ASSISTANT }), DenkstandError);
	// Writing a confirmed entry as assistant is rejected too.
	assert.throws(() => record(state, { status: STATUS.CONFIRMED, statement: 'x', author: ACTOR.ASSISTANT }), DenkstandError);
	// The teacher confirming it is fine and records the transition.
	const promoted = confirm(state, 'h1');
	assert.equal(promoted.entry.status, STATUS.CONFIRMED);
	assert.equal(promoted.entry.confirmedBy, ACTOR.TEACHER);
});

test('a confirmed thought supersedes the older assistant reading', () => {
	let state = emptyState();
	state = hypothesize(state, { statement: 'Gott als Freund', id: 'h1' }).state;
	const sup = supersede(state, 'h1', { status: STATUS.CONFIRMED, statement: 'Gott als Gegenüber', author: ACTOR.TEACHER, id: 'e2' });
	state = sup.state;
	const view = projectCurrentState(state);
	// The old hypothesis is gone from the active state …
	assert.equal(view[STATUS.HYPOTHESIS].length, 0);
	// … it is now rejected, and the new confirmed statement stands.
	assert.equal(view[STATUS.REJECTED][0].id, 'h1');
	assert.equal(view[STATUS.CONFIRMED][0].statement, 'Gott als Gegenüber');
	assert.deepEqual(view[STATUS.CONFIRMED][0].supersedes, ['h1']);
});

test('a rejected framing stays in history but leaves the active state', () => {
	let state = emptyState();
	state = record(state, { status: STATUS.OPEN, statement: 'These/Gegenthese', author: ACTOR.TEACHER, id: 'e1' }).state;
	state = reject(state, 'e1', { actor: ACTOR.TEACHER, note: 'nicht tragend' }).state;
	const view = projectCurrentState(state);
	assert.equal(view[STATUS.OPEN].length, 0);
	assert.equal(view[STATUS.REJECTED].length, 1);
	// History keeps every transition of that entry.
	const trail = historyOf(state, 'e1');
	assert.ok(trail.length >= 2);
	assert.equal(trail.at(-1).to, STATUS.REJECTED);
});

test('projectCurrentState preserves the epistemic categories for the handoff', () => {
	let state = emptyState();
	state = record(state, { status: STATUS.CONFIRMED, statement: 'C', author: ACTOR.TEACHER, id: 'c' }).state;
	state = record(state, { status: STATUS.OPEN, statement: 'O', author: ACTOR.TEACHER, id: 'o' }).state;
	state = hypothesize(state, { statement: 'H', id: 'h' }).state;
	state = record(state, { status: STATUS.FACT, statement: 'F', source: 'https://example.org', id: 'f' }).state;
	state = reject(record(state, { status: STATUS.OPEN, statement: 'R', author: ACTOR.TEACHER, id: 'r' }).state, 'r').state;
	const view = projectCurrentState(state);
	assert.equal(view[STATUS.CONFIRMED][0].statement, 'C');
	assert.equal(view[STATUS.OPEN][0].statement, 'O');
	assert.equal(view[STATUS.HYPOTHESIS][0].statement, 'H');
	assert.equal(view[STATUS.FACT][0].source, 'https://example.org');
	assert.equal(view[STATUS.REJECTED][0].statement, 'R');
});

test('a fact requires a source', () => {
	assert.throws(() => record(emptyState(), { status: STATUS.FACT, statement: 'no source' }), DenkstandError);
});

test('parse/serialize round-trips and drops corrupt entries', () => {
	let state = emptyState();
	state = record(state, { status: STATUS.CONFIRMED, statement: 'C', author: ACTOR.TEACHER, id: 'c', significance: SIGNIFICANCE.ANCHOR }).state;
	const round = parseState(serializeState(state));
	assert.equal(round.entries.length, 1);
	assert.equal(round.entries[0].significance, SIGNIFICANCE.ANCHOR);
	// Corrupt input fails safe to empty.
	assert.deepEqual(parseState('not json').entries, []);
	const withJunk = JSON.stringify({ entries: [{ id: 'x' }, { id: 'ok', status: STATUS.OPEN, statement: 's' }] });
	assert.equal(parseState(withJunk).entries.length, 1);
});
