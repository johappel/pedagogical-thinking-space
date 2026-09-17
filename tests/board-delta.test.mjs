// Unit tests for the Board Revision & Delta (dsh/presets/pts-companion/board-delta.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';

import { CHANGE, diffBoard, nextRevision, isMeaningful, summarizeDelta } from '../dsh/presets/pts-companion/board-delta.mjs';

const snap = (notes, page = { id: 'p1', name: 'Übersicht' }) => ({ page, notes });

test('a teacher reformulation appears as a semantic delta', () => {
	const before = snap([{ id: 'n1', text: 'Gott als Freund', x: 0, y: 0, actor: 'human' }]);
	const after = snap([{ id: 'n1', text: 'Gott als Gegenüber', x: 0, y: 0, actor: 'human' }]);
	const delta = diffBoard(before, after);
	assert.deepEqual(delta.updatedShapeIds, ['n1']);
	assert.equal(delta.changes[0].type, CHANGE.REFORMULATE);
	assert.match(summarizeDelta(delta)[0], /umformuliert/);
	assert.equal(isMeaningful(delta), true);
});

test('a pure move produces no pedagogical decision', () => {
	const before = snap([{ id: 'n1', text: 'A', x: 0, y: 0 }]);
	const after = snap([{ id: 'n1', text: 'A', x: 400, y: 400 }]);
	const delta = diffBoard(before, after);
	assert.deepEqual(delta.movedShapeIds, ['n1']);
	assert.deepEqual(delta.updatedShapeIds, []);
	assert.deepEqual(delta.createdShapeIds, []);
	// A move alone is not something the companion must be told about.
	assert.equal(isMeaningful(delta), false);
});

test('a new note and a removed note are classified', () => {
	const before = snap([{ id: 'n1', text: 'A', x: 0, y: 0 }]);
	const after = snap([{ id: 'n2', text: 'Ist KI attraktiver?', x: 0, y: 0, actor: 'human' }]);
	const delta = diffBoard(before, after);
	assert.deepEqual(delta.createdShapeIds, ['n2']);
	assert.deepEqual(delta.deletedShapeIds, ['n1']);
	const lines = summarizeDelta(delta);
	assert.ok(lines.some((l) => /neuer Zettel/.test(l)));
	assert.ok(lines.some((l) => /entfernt/.test(l)));
});

test('the companion only sees changes since the last seen revision', () => {
	const r0 = snap([{ id: 'n1', text: 'A', x: 0, y: 0 }]);
	const r0b = snap([{ id: 'n1', text: 'A', x: 10, y: 10 }]); // jitter under epsilon
	// Signature unchanged (jitter) → revision does not advance.
	assert.equal(nextRevision(r0, r0b, 5), 5);
	const r1 = snap([{ id: 'n1', text: 'A', x: 0, y: 0 }, { id: 'n2', text: 'B', x: 0, y: 0 }]);
	assert.equal(nextRevision(r0, r1, 5), 6);
	// Delta is computed against the last seen snapshot only.
	const delta = diffBoard(r0, r1, { boardRevision: 6 });
	assert.deepEqual(delta.createdShapeIds, ['n2']);
	assert.equal(delta.boardRevision, 6);
});

test('the delta carries page and actor metadata', () => {
	const before = snap([]);
	const after = snap([{ id: 'n1', text: 'X', x: 0, y: 0, actor: 'human' }]);
	const delta = diffBoard(before, after, { pageId: 'p1', actor: 'teacher', reason: 'note added', at: '2026-01-01T00:00:00Z' });
	assert.equal(delta.pageId, 'p1');
	assert.equal(delta.actor, 'teacher');
	assert.equal(delta.timestamp, '2026-01-01T00:00:00Z');
	assert.deepEqual(delta.affectedShapeIds, ['n1']);
});
