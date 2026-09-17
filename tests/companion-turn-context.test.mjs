// Unit tests for the companion turn context builder
// (dsh/presets/pts-companion/companion-turn-context.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, ACTOR, emptyState, record, hypothesize, reject } from '../dsh/presets/pts-companion/denkstand-state.mjs';
import { diffBoard } from '../dsh/presets/pts-companion/board-delta.mjs';
import {
	EVENT_ROLE,
	renderCurrentDenkstand,
	renderBoardChanges,
	renderSelectedContext,
	makeSelectedContext,
	buildTurnContext,
	classifyConversationEvent,
	isTeacherMessage,
	toDenkstandChanged,
} from '../dsh/presets/pts-companion/companion-turn-context.mjs';

function sampleState() {
	let state = emptyState();
	state = record(state, { status: STATUS.CONFIRMED, statement: 'Gott als Gegenüber', author: ACTOR.TEACHER, id: 'c' }).state;
	state = record(state, { status: STATUS.OPEN, statement: 'Ist KI attraktiver?', author: ACTOR.TEACHER, id: 'o' }).state;
	state = hypothesize(state, { statement: 'Vielleicht geht es um Nähe', id: 'h' }).state;
	state = reject(record(state, { status: STATUS.OPEN, statement: 'These/Gegenthese', author: ACTOR.TEACHER, id: 'r' }).state, 'r').state;
	return state;
}

test('current Denkstand renders labeled categories, hypotheses never as confirmed', () => {
	const text = renderCurrentDenkstand(sampleState());
	assert.match(text, /Bestätigt \(Lehrkraft\):[\s\S]*Gott als Gegenüber/);
	assert.match(text, /Companion-Hypothesen \(nicht bestätigt\):[\s\S]*Nähe/);
	assert.match(text, /Verworfen:[\s\S]*These\/Gegenthese/);
	// The confirmed block comes before the hypotheses block.
	assert.ok(text.indexOf('Bestätigt') < text.indexOf('Companion-Hypothesen'));
});

test('board changes show only meaningful deltas since last turn', () => {
	const before = { page: { id: 'p1' }, notes: [{ id: 'n1', text: 'A', x: 0, y: 0 }] };
	const after = { page: { id: 'p1' }, notes: [{ id: 'n1', text: 'B', x: 0, y: 0 }] };
	const text = renderBoardChanges(diffBoard(before, after, { boardRevision: 3 }));
	assert.match(text, /BOARD CHANGES/);
	assert.match(text, /umformuliert/);
	// A no-op delta renders nothing.
	assert.equal(renderBoardChanges(diffBoard(before, before)), '');
});

test('selected context is a separate structure, never the teacher message', () => {
	const selected = makeSelectedContext({
		source: 'whiteboard',
		pageId: 'p1',
		snapshotRevision: 142,
		items: [{ id: 'n1', text: 'Gott als Gegenüber' }, { id: 'n2', text: 'Ist KI attraktiver?' }],
	});
	assert.equal(selected.source, 'whiteboard');
	assert.deepEqual(selected.shapeIds, ['n1', 'n2']);
	assert.equal(selected.snapshotRevision, 142);
	const text = renderSelectedContext(selected);
	assert.match(text, /keine Aussage der Lehrkraft/);
	assert.match(text, /Gott als Gegenüber/);
	// buildTurnContext keeps selected context in its own block, apart from the state.
	const full = buildTurnContext({ currentState: sampleState(), selectedContext: selected });
	assert.match(full, /CURRENT DENKSTAND/);
	assert.match(full, /SELECTED CONTEXT/);
	assert.ok(full.indexOf('CURRENT DENKSTAND') < full.indexOf('SELECTED CONTEXT'));
});

test('a technical subagent report is not treated as a teacher message', () => {
	const settled = { role: 'user', text: 'Background subagent pts-documentarian finished with 2 updates.' };
	assert.equal(classifyConversationEvent(settled), EVENT_ROLE.ACTIVITY);
	assert.equal(isTeacherMessage(settled), false);
	// A genuine teacher message classifies as teacher.
	assert.equal(isTeacherMessage({ role: 'user', text: 'Was unterscheidet diese drei Gedanken?' }), true);
	// Roles and kinds are kept apart.
	assert.equal(classifyConversationEvent({ role: 'assistant', text: '…' }), EVENT_ROLE.ASSISTANT);
	assert.equal(classifyConversationEvent({ kind: 'tool-result', text: '…' }), EVENT_ROLE.TOOL_RESULT);
	assert.equal(classifyConversationEvent({ kind: 'subagent-settled' }), EVENT_ROLE.ACTIVITY);
	assert.equal(classifyConversationEvent({ kind: 'denkstand_changed' }), EVENT_ROLE.STATE_CHANGE);
});

test('a subagent consequence is folded into a structured denkstand_changed', () => {
	const event = toDenkstandChanged({ confirmed: ['statement X'], rejected: ['hypothesis Y'] });
	assert.equal(event.kind, 'denkstand_changed');
	assert.deepEqual(event.changes, ['bestätigt: statement X', 'verworfen: hypothesis Y']);
});
