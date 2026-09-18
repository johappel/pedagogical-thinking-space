// Runtime wiring & projection move (PTS side).
//
// Contract tests for the semantic Companion façade pts_learning_moment, the
// profile row, the tool boundary and the real move that drives the generic
// dsh-whiteboard move seam. The generic move itself is covered upstream in
// F:\code\dsh-tldraw\plugin\dsh-whiteboard\test\move-shape.test.mjs.
//
// Canonical LearningMoment content lives in the domain store
// (learning-moments.json); the ledger is a pure projection sidecar. No
// learning-landscape.md is read or written anywhere.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	runDomainOperation, nextProjectionId, TOOL_NAME, apply,
} from '../plugins/pts-learning-moment-binding/lib/index.js';
import { createLearningMoment, getLearningMoment } from '../plugins/pts-learning-moment-binding/lib/domain.mjs';
import { emptyLedger, serializeLedger, parseLedger, bindProjection, projectionsFor } from '../plugins/pts-learning-moment-binding/lib/bindings.mjs';
import { HIDDEN_FROM_COMPANION } from '../dsh/presets/pts-companion/companion-tool-boundary.mjs';

// Build a Denkraum whose canonical lm-danke moment already exists in the store,
// optionally with a pre-seeded projection ledger.
async function denkraum(ledger, { withMoment = true } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-lm-'));
	if (withMoment) await createLearningMoment(root, { domainId: 'lm-danke', title: 'Danke erkennen', function: 'Zugang', learning_activity: 'Reagieren' });
	if (ledger) await writeFile(path.join(root, 'learning-moment-bindings.json'), serializeLedger(ledger), 'utf8');
	return root;
}

function boardTools({ snapshot, move } = {}) {
	const calls = { move: [] };
	const stateTool = { execute: async () => ({ live: true, available: true, snapshot }) };
	const moveTool = { execute: async (args) => { calls.move.push(args); return move; } };
	return {
		calls,
		get: (name) => (name === 'whiteboard_state' ? stateTool : name === 'whiteboard_move_shape' ? moveTool : undefined),
	};
}

// ---------------------------------------------------------------- Wiring facts

test('the profile installs the domain-binding row with the right injects', () => {
	const patch = readFileSync(new URL('../dsh/profiles/pts/cordis.patch.yml', import.meta.url), 'utf8');
	assert.match(patch, /- id: pts-learning-moment-binding/);
	assert.match(patch, /plugins\/pts-learning-moment-binding\/lib\/index\.js'\s*\n\s*inject: \[webServer, sessions, agents\]/);
});

test('the generic move seam is hidden from the Companion (façade only)', () => {
	assert.ok(HIDDEN_FROM_COMPANION.includes('whiteboard_move_shape'));
});

test('apply registers exactly the semantic façade tool for the model', () => {
	const registered = [];
	const ctx = {
		get: (name) => ({
			webServer: { register: () => () => {} },
			sessions: { get: () => undefined },
			agents: { list: () => [], on: () => {} },
			tools: { register: (t) => { registered.push(t.name); return () => {}; }, get: () => undefined },
		}[name]),
		on: () => {},
		effect: (fn) => { fn(); },
	};
	apply(ctx);
	assert.ok(registered.includes(TOOL_NAME));
	assert.equal(TOOL_NAME, 'pts_learning_moment');
});

// ---------------------------------------------------------------- Bind

test('bind attaches an existing card to an existing canonical moment', async () => {
	const root = await denkraum();
	try {
		const tools = boardTools({ snapshot: { page: { name: 'Übersicht' }, notes: [{ id: 'shape:1', text: 'Danke erkennen', actor: 'human' }] } });
		const result = await runDomainOperation({ get: () => undefined }, tools, root, { operation: 'bind', domainId: 'lm-danke', ref: { text: 'Danke erkennen' } }, {});
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.projection.shapeId, 'shape:1');
		assert.equal(result.projection.page, 'Übersicht');

		const ledger = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		const projections = projectionsFor(ledger, 'lm-danke');
		assert.equal(projections.length, 1);
		assert.equal(projections[0].shapeId, 'shape:1');
		// content/provenance live in the domain store, never in the ledger
		assert.equal((await getLearningMoment(root, 'lm-danke')).provenance.confirmedBy, 'teacher');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('bind fails closed on an ambiguous card reference', async () => {
	const root = await denkraum();
	try {
		const tools = boardTools({ snapshot: { page: { name: 'Übersicht' }, notes: [
			{ id: 'shape:1', text: 'Danke erkennen', actor: 'human' },
			{ id: 'shape:2', text: 'Danke erkennen', actor: 'human' },
		] } });
		await assert.rejects(
			runDomainOperation({ get: () => undefined }, tools, root, { operation: 'bind', domainId: 'lm-danke', ref: { text: 'Danke erkennen' } }, {}),
			(e) => e.code === 'ambiguous-reference',
		);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('bind on a missing canonical moment is blocked, never invents a moment', async () => {
	const root = await denkraum();
	try {
		const tools = boardTools({ snapshot: { page: { name: 'Übersicht' }, notes: [] } });
		const result = await runDomainOperation({ get: () => undefined }, tools, root, { operation: 'bind', domainId: 'lm-fehlt', ref: { text: 'x' } }, {});
		assert.equal(result.ok, false);
		assert.equal(result.error.code, 'moment-required');
	} finally { await rm(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- Real move

test('move_projection drives the generic move seam and records the page only after verified', async () => {
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', shapeId: 'shape:1', page: 'Übersicht', version: 1 }).ledger;
	const root = await denkraum(ledger);
	try {
		const tools = boardTools({
			snapshot: { page: { name: 'Übersicht' }, notes: [], commandResults: [{ commandId: 'cmd-move-1', op: 'move-shape', ok: true }] },
			move: { accepted: true, op: 'move-shape', commandId: 'cmd-move-1' },
		});
		const result = await runDomainOperation({ get: () => undefined }, tools, root, { operation: 'move_projection', domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', toPage: 'LM · Danke' }, {});
		assert.equal(result.ok, true);
		assert.equal(result.status, 'verified');
		assert.equal(result.projection.projectionId, 'wb-lm-danke-1', 'the projection identity is preserved');
		assert.equal(result.projection.page, 'LM · Danke');
		assert.equal(tools.calls.move[0].shapeId, 'shape:1');
		assert.equal(tools.calls.move[0].targetPageTitle, 'LM · Danke');

		const persisted = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(persisted, 'lm-danke')[0].page, 'LM · Danke');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('a failed board move does not record the page change', async () => {
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', shapeId: 'shape:1', page: 'Übersicht', version: 1 }).ledger;
	const root = await denkraum(ledger);
	try {
		const tools = boardTools({
			snapshot: { page: { name: 'Übersicht' }, notes: [], commandResults: [{ commandId: 'cmd-move-1', op: 'move-shape', ok: false, error: 'Ziel-Page nicht gefunden' }] },
			move: { accepted: true, op: 'move-shape', commandId: 'cmd-move-1' },
		});
		const result = await runDomainOperation({ get: () => undefined }, tools, root, { operation: 'move_projection', domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', toPage: 'Fehlt' }, {});
		assert.equal(result.ok, false);
		assert.equal(result.status, 'failed');
		const persisted = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(persisted, 'lm-danke')[0].page, 'Übersicht', 'the page stays until the board confirms');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('move fails closed on an unknown domain and on a projection without a board handle', async () => {
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', page: 'Übersicht', version: 1 }).ledger; // no shapeId
	const root = await denkraum(ledger);
	try {
		const tools = boardTools({ snapshot: { page: { name: 'Übersicht' }, notes: [] } });
		const unknown = await runDomainOperation({ get: () => undefined }, tools, root, { operation: 'move_projection', domainId: 'lm-x', projectionId: 'p', toPage: 'B' }, {});
		assert.equal(unknown.error.code, 'unknown-domain-id');
		const noHandle = await runDomainOperation({ get: () => undefined }, tools, root, { operation: 'move_projection', domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', toPage: 'B' }, {});
		assert.equal(noHandle.error.code, 'projection-has-no-board-handle');
		assert.equal(tools.calls.move.length, 0, 'no board move is attempted when the domain check fails');
	} finally { await rm(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- Detach keeps the moment

test('detach_projection removes the binding but keeps the canonical moment', async () => {
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', shapeId: 'shape:1', page: 'Übersicht', version: 1 }).ledger;
	const root = await denkraum(ledger);
	try {
		const result = await runDomainOperation({ get: () => undefined }, boardTools({ snapshot: {} }), root, { operation: 'detach_projection', domainId: 'lm-danke', projectionId: 'wb-lm-danke-1' }, {});
		assert.equal(result.ok, true);
		assert.equal(result.orphanedProjections, true);
		assert.ok(await getLearningMoment(root, 'lm-danke'), 'the moment survives the last detach');
		const persisted = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(persisted, 'lm-danke').length, 0);
	} finally { await rm(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- shapeId persistence

test('the projection board handle round-trips through the ledger', () => {
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', shapeId: 'shape:99', page: 'A', version: 1 }).ledger;
	const round = parseLedger(serializeLedger(ledger));
	assert.equal(projectionsFor(round, 'lm-danke')[0].shapeId, 'shape:99');
	assert.equal(nextProjectionId(round, 'lm-danke'), 'wb-lm-danke-2');
});
