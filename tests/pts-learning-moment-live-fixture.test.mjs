// Live-representative fixture test.
//
// Unlike pts-learning-moment-wiring.test.mjs (which calls runDomainOperation
// with a plain root), this drives the FULL model-facing tool `pts_learning_moment`
// through apply() → its execute → rootForExec → the REAL workspaceRoot() gate,
// against an on-disk PTS Denkraum in the exact layout the live contract demands:
//
//   <base>/AGENTS.md
//   <base>/workspace/<Denkraum>/learning-moments.json   (canonical domain store)
//
// It uses a real `lm-anerkennung` canonical moment and a mocked board (a live
// tldraw canvas is the only part that needs the browser). This is the
// deterministic proof that the whole PTS domain layer binds and moves against a
// proper PTS Denkraum, including the workspace gate that the whiteboard-spike
// Denkräume on the live instance do not satisfy.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { apply, TOOL_NAME } from '../plugins/pts-learning-moment-binding/lib/index.js';
import { createLearningMoment, getLearningMoment } from '../plugins/pts-learning-moment-binding/lib/domain.mjs';
import { parseLedger, projectionsFor } from '../plugins/pts-learning-moment-binding/lib/bindings.mjs';

async function seedMoment(root) {
	await createLearningMoment(root, {
		domainId: 'lm-anerkennung', title: 'Anerkennung wahrnehmen', type: 'positioning',
		function: 'Eigene Deutungen sichtbar machen', learning_activity: 'Lernende positionieren sich zu Danke und Anerkennung.',
		expected_experience: 'Danke ist nicht selbstverständlich.', status: 'draft',
	});
}

// Build the exact workspaceRoot()-valid PTS Denkraum layout on disk.
async function ptsDenkraum() {
	const base = await mkdtemp(path.join(tmpdir(), 'pts-denkraum-'));
	await writeFile(path.join(base, 'AGENTS.md'), '# marker\n', 'utf8');
	const cwd = path.join(base, 'workspace', 'Phase2b');
	await mkdir(cwd, { recursive: true });
	await seedMoment(cwd);
	return { base, cwd };
}

// A ctx that captures the registered model-facing tool and serves mocked board
// tools; sessions.get maps a session id to the Denkraum cwd.
function harness(cwd, board) {
	let tool = null;
	const calls = { move: [] };
	const boardTools = {
		whiteboard_state: { execute: async () => ({ live: true, available: true, snapshot: board.snapshot }) },
		whiteboard_move_shape: { execute: async (args) => { calls.move.push(args); return board.move; } },
	};
	const ctx = {
		get: (name) => ({
			webServer: { register: () => () => {} },
			sessions: { get: (id) => (id === 'sess-1' ? { header: { cwd } } : undefined) },
			agents: { list: () => [], on: () => {} },
			tools: { register: (t) => { if (t.name === TOOL_NAME) tool = t; return () => {}; }, get: (n) => boardTools[n] },
		}[name]),
		on: () => {},
		effect: (fn) => { fn(); },
	};
	apply(ctx);
	assert.ok(tool, 'pts_learning_moment must be registered');
	const exec = { agent: { session: { id: 'sess-1', header: { cwd } } } };
	return { tool, exec, calls };
}

test('bind + real move against a proper PTS Denkraum (through workspaceRoot)', async () => {
	const { base, cwd } = await ptsDenkraum();
	try {
		const { tool, exec } = harness(cwd, {
			snapshot: { page: { name: 'Übersicht' }, notes: [{ id: 'shape:danke', text: 'Danke ist nicht selbstverständlich', actor: 'human' }] },
			move: { accepted: true, op: 'move-shape', commandId: 'cmd-1' },
		});

		// 1) bind an existing card to the canonical lm-anerkennung moment.
		const bound = await tool.execute({ operation: 'bind', domainId: 'lm-anerkennung', ref: { text: 'Danke ist nicht selbstverständlich' } }, exec);
		assert.equal(bound.ok, true, JSON.stringify(bound));
		assert.equal(bound.projection.shapeId, 'shape:danke');
		const projectionId = bound.projection.projectionId;

		assert.equal((await getLearningMoment(cwd, 'lm-anerkennung')).provenance.confirmedBy, 'teacher');
		let ledger = parseLedger(await readFile(path.join(cwd, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(ledger, 'lm-anerkennung').length, 1);

		// 2) real move: the façade drives whiteboard_move_shape and only records
		// the new page after the board verifies the command.
		const board2 = { snapshot: { page: { name: 'Übersicht' }, notes: [], commandResults: [{ commandId: 'cmd-1', op: 'move-shape', ok: true }] }, move: { accepted: true, op: 'move-shape', commandId: 'cmd-1' } };
		const h2 = harness(cwd, board2);
		const moved = await h2.tool.execute({ operation: 'move_projection', domainId: 'lm-anerkennung', projectionId, toPage: 'Arbeitsseite' }, h2.exec);
		assert.equal(moved.ok, true, JSON.stringify(moved));
		assert.equal(moved.status, 'verified');
		assert.equal(moved.projection.projectionId, projectionId, 'identity preserved across the move');
		assert.equal(h2.calls.move[0].shapeId, 'shape:danke');
		assert.equal(h2.calls.move[0].targetPageTitle, 'Arbeitsseite');

		ledger = parseLedger(await readFile(path.join(cwd, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(ledger, 'lm-anerkennung')[0].page, 'Arbeitsseite');

		// 3) detach keeps the canonical moment.
		const detached = await h2.tool.execute({ operation: 'detach_projection', domainId: 'lm-anerkennung', projectionId }, h2.exec);
		assert.equal(detached.ok, true);
		assert.equal(detached.orphanedProjections, true);
		assert.ok(await getLearningMoment(cwd, 'lm-anerkennung'), 'lm-anerkennung survives the last detach');
	} finally { await rm(base, { recursive: true, force: true }); }
});

test('bind fails closed on a Denkraum without the canonical moment', async () => {
	const { base, cwd } = await ptsDenkraum();
	try {
		const { tool, exec } = harness(cwd, { snapshot: { page: { name: 'Übersicht' }, notes: [{ id: 'shape:x', text: 'irgendwas', actor: 'human' }] } });
		const res = await tool.execute({ operation: 'bind', domainId: 'lm-gibt-es-nicht', ref: { text: 'irgendwas' } }, exec);
		assert.equal(res.ok, false);
		assert.equal(res.error.code, 'moment-required');
	} finally { await rm(base, { recursive: true, force: true }); }
});

// The live instance's Denkräume are raw folders (e.g. F:\dsh-workspaces\pts\<name>)
// with no scaffolded `workspace/` parent, so the strict workspaceRoot() layout
// rejects them. The façade must still resolve the Denkraum root from the live
// session cwd via the canonical store marker — that is what makes it usable on
// real Denkräume.
test('bind resolves against a raw live Denkraum cwd (no workspace/ parent)', async () => {
	const cwd = await mkdtemp(path.join(tmpdir(), 'pts-raw-denkraum-'));
	try {
		await seedMoment(cwd); // learning-moments.json is a Denkraum marker
		const { tool, exec } = harness(cwd, { snapshot: { page: { name: 'Übersicht' }, notes: [{ id: 'shape:danke', text: 'Danke ist nicht selbstverständlich', actor: 'human' }] } });
		const bound = await tool.execute({ operation: 'bind', domainId: 'lm-anerkennung', ref: { text: 'Danke ist nicht selbstverständlich' } }, exec);
		assert.equal(bound.ok, true, JSON.stringify(bound));
		assert.equal(bound.projection.shapeId, 'shape:danke');
		assert.ok(await getLearningMoment(cwd, 'lm-anerkennung'));
	} finally { await rm(cwd, { recursive: true, force: true }); }
});
