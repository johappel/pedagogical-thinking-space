// Reaction façade + multi-projection detach, driven through runDomainOperation
// against an on-disk canonical LearningMoment store (learning-moments.json) and
// a projection ledger. No learning-landscape.md is involved anywhere.
//
//   confirm  a bounded semantic change (one red-thread field) → reaction=confirm.
//            The domain version bumps (the teacher DID change the moment) but NO
//            follow-up propagation happens: the bound projection stays stale
//            (boundVersion < domain version). That is the ledger-level proof of
//            "keine Mutation vor Zustimmung".
//   clarify  a core reframe (scope=redesign / type change / ≥2 red-thread
//            fields) → reaction=clarify, again no projection sync.
//   automatic an explicit relabel → reaction=automatic AND the projection is
//            re-synced (boundVersion == domain version).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runDomainOperation } from '../plugins/pts-learning-moment-binding/lib/index.js';
import { createLearningMoment, getLearningMoment } from '../plugins/pts-learning-moment-binding/lib/domain.mjs';
import { emptyLedger, serializeLedger, parseLedger, bindProjection, projectionsFor, isStaleProjection } from '../plugins/pts-learning-moment-binding/lib/bindings.mjs';

const NO_BOARD = { get: () => undefined };

// A Denkraum with lm-danke as a canonical domain object (v1, carrying the
// pedagogical fields the reaction model diffs) and a single bound projection.
async function denkraumWithProjection() {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-react-'));
	await createLearningMoment(root, {
		domainId: 'lm-danke', title: 'Danke erkennen', type: 'impulse',
		function: 'Zugang', learning_activity: 'Reagieren', expected_experience: 'Danke ist nicht selbstverständlich', status: 'draft',
	});
	const ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', shapeId: 'shape:1', page: 'Übersicht', version: 1 }).ledger;
	await writeFile(path.join(root, 'learning-moment-bindings.json'), serializeLedger(ledger), 'utf8');
	return root;
}

test('a bounded semantic change classifies as confirm and does NOT propagate to the projection', async () => {
	const root = await denkraumWithProjection();
	try {
		const result = await runDomainOperation(NO_BOARD, NO_BOARD, root, {
			operation: 'update', domainId: 'lm-danke', intent: 'semantic', scope: 'local',
			fields: { learning_activity: 'Lernende positionieren sich begründet.' },
		}, {});
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.impact.reaction, 'confirm');

		assert.equal((await getLearningMoment(root, 'lm-danke')).version, 2, 'the canonical change is recorded in the domain store');
		const ledger = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(ledger, 'lm-danke')[0].boundVersion, 1, 'the projection was NOT re-synced');
		assert.equal(isStaleProjection(ledger, 'lm-danke', 'wb-lm-danke-1', 2), true, 'the projection is left stale until the teacher confirms');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('a core reframe (scope=redesign) classifies as clarify and does NOT propagate', async () => {
	const root = await denkraumWithProjection();
	try {
		const result = await runDomainOperation(NO_BOARD, NO_BOARD, root, {
			operation: 'update', domainId: 'lm-danke', intent: 'semantic', scope: 'redesign',
			fields: { learning_activity: 'Ganz anderes Vorgehen.' },
		}, {});
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.impact.reaction, 'clarify');

		const ledger = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(ledger, 'lm-danke')[0].boundVersion, 1, 'clarify never auto-syncs a projection');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('a type change also escalates to clarify', async () => {
	const root = await denkraumWithProjection();
	try {
		const result = await runDomainOperation(NO_BOARD, NO_BOARD, root, {
			operation: 'update', domainId: 'lm-danke', intent: 'semantic', fields: { type: 'positioning' },
		}, {});
		assert.equal(result.impact.reaction, 'clarify');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('an explicit relabel is automatic AND re-syncs the projection', async () => {
	const root = await denkraumWithProjection();
	try {
		const result = await runDomainOperation(NO_BOARD, NO_BOARD, root, {
			operation: 'update', domainId: 'lm-danke', intent: 'relabel', fields: { title: 'Dankbarkeit erkennen' },
		}, {});
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.impact.reaction, 'automatic');

		assert.equal((await getLearningMoment(root, 'lm-danke')).version, 2);
		const ledger = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(ledger, 'lm-danke')[0].boundVersion, 2, 'automatic re-syncs the projection without asking');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('impact is a pure preview and never mutates the store or the ledger', async () => {
	const root = await denkraumWithProjection();
	try {
		const ledgerBefore = await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8');
		const storeBefore = await readFile(path.join(root, 'learning-moments.json'), 'utf8');
		const result = await runDomainOperation(NO_BOARD, NO_BOARD, root, {
			operation: 'impact', domainId: 'lm-danke', fields: { learning_activity: 'X' },
		}, {});
		assert.equal(result.ok, true);
		assert.equal(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'), ledgerBefore, 'impact writes no ledger');
		assert.equal(await readFile(path.join(root, 'learning-moments.json'), 'utf8'), storeBefore, 'impact writes no store');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('detach one of two projections keeps the other and the moment', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-detach-'));
	try {
		await createLearningMoment(root, { domainId: 'lm-danke', title: 'Danke erkennen' });
		let ledger = bindProjection(emptyLedger(), { domainId: 'lm-danke', projectionId: 'P-101', shapeId: 'shape:101', page: 'A', version: 1 }).ledger;
		ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', shapeId: 'shape:102', page: 'B', version: 1 }).ledger;
		await writeFile(path.join(root, 'learning-moment-bindings.json'), serializeLedger(ledger), 'utf8');

		const one = await runDomainOperation(NO_BOARD, NO_BOARD, root, { operation: 'detach_projection', domainId: 'lm-danke', projectionId: 'P-102' }, {});
		assert.equal(one.ok, true);
		assert.equal(one.orphanedProjections, false);
		assert.ok(await getLearningMoment(root, 'lm-danke'), 'the domain object survives a detach');
		const persisted = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.deepEqual(projectionsFor(persisted, 'lm-danke').map((p) => p.projectionId), ['P-101']);
	} finally { await rm(root, { recursive: true, force: true }); }
});
