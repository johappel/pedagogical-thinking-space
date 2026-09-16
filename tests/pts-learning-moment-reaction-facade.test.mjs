// Work package A (deterministic backing) — reaction façade + multi-projection detach.
//
// These fix the exact expectations the live browser turns must reproduce:
//
//   confirm  a bounded semantic change (one red-thread field) → reaction=confirm.
//            The version bumps (the teacher DID change the moment) but NO
//            follow-up propagation happens: the bound projection stays stale
//            (boundVersion < version). That is the ledger-level proof of
//            "keine Mutation vor Zustimmung".
//   clarify  a core reframe (scope=redesign / type change / ≥2 red-thread
//            fields) → reaction=clarify, again no projection sync.
//   automatic an explicit relabel → reaction=automatic AND the projection is
//            re-synced (boundVersion == version).
//   detach   with two projections, detaching one keeps the other and the
//            moment; detaching the last orphans the moment but never deletes it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runDomainOperation } from '../plugins/pts-learning-moment-binding/lib/index.js';
import { emptyLedger, captureLearningMoment, serializeLedger, parseLedger, findMoment } from '../plugins/pts-learning-moment-binding/lib/domain.mjs';
import { bindProjection, projectionsFor, isStaleProjection } from '../plugins/pts-learning-moment-binding/lib/bindings.mjs';

const NOW = '2026-09-16T10:00:00.000Z';
const LANDSCAPE = `---\nschema: ptspace.learning-landscape/v1\ntitle: Test\nstructure: hybrid\n---\n\n# Lernlandschaft\n\n## Lernmomente\n\n### lm-danke\n\n- Titel: Danke erkennen\n- Typ: impulse\n- Funktion: Zugang\n- Lernaktivität: Reagieren\n- Erwartete Lernerfahrung: Danke ist nicht selbstverständlich\n- Materialbedarfe: []\n- Materialien: []\n- Offene Fragen: []\n- Status: draft\n\n## Übergänge\n\nKeine Übergänge festgelegt.\n`;

const NO_BOARD = { get: () => undefined };

// A Denkraum with lm-danke captured (v1) and a single bound projection.
async function denkraumWithProjection() {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-react-'));
	await writeFile(path.join(root, 'learning-landscape.md'), LANDSCAPE, 'utf8');
	let ledger = captureLearningMoment(emptyLedger(), { domainId: 'lm-danke', confirmedAt: NOW }).ledger;
	ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'wb-lm-danke-1', shapeId: 'shape:1', page: 'Übersicht' }).ledger;
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

		const ledger = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(findMoment(ledger, 'lm-danke').version, 2, 'the canonical change is recorded');
		assert.equal(projectionsFor(ledger, 'lm-danke')[0].boundVersion, 1, 'the projection was NOT re-synced');
		assert.equal(isStaleProjection(ledger, 'lm-danke', 'wb-lm-danke-1'), true, 'the projection is left stale until the teacher confirms');
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

		const ledger = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(findMoment(ledger, 'lm-danke').version, 2);
		assert.equal(projectionsFor(ledger, 'lm-danke')[0].boundVersion, 2, 'automatic re-syncs the projection without asking');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('impact is a pure preview and never mutates the ledger', async () => {
	const root = await denkraumWithProjection();
	try {
		const before = await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8');
		const result = await runDomainOperation(NO_BOARD, NO_BOARD, root, {
			operation: 'impact', domainId: 'lm-danke', fields: { learning_activity: 'X' },
		}, {});
		assert.equal(result.ok, true);
		assert.equal(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'), before, 'impact writes nothing');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('detach one of two projections keeps the other and the moment (C1)', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-detach-'));
	try {
		await writeFile(path.join(root, 'learning-landscape.md'), LANDSCAPE, 'utf8');
		let ledger = captureLearningMoment(emptyLedger(), { domainId: 'lm-danke', confirmedAt: NOW }).ledger;
		ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-101', shapeId: 'shape:101', page: 'A' }).ledger;
		ledger = bindProjection(ledger, { domainId: 'lm-danke', projectionId: 'P-102', shapeId: 'shape:102', page: 'B' }).ledger;
		await writeFile(path.join(root, 'learning-moment-bindings.json'), serializeLedger(ledger), 'utf8');

		const one = await runDomainOperation(NO_BOARD, NO_BOARD, root, { operation: 'detach_projection', domainId: 'lm-danke', projectionId: 'P-102' }, {});
		assert.equal(one.ok, true);
		assert.equal(one.orphanedDomain, false, 'one projection remains');
		let persisted = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.deepEqual(projectionsFor(persisted, 'lm-danke').map((p) => p.projectionId), ['P-101']);
		assert.ok(findMoment(persisted, 'lm-danke'));

		// Detach the last projection: the moment stays, orphaned, never deleted.
		const last = await runDomainOperation(NO_BOARD, NO_BOARD, root, { operation: 'detach_projection', domainId: 'lm-danke', projectionId: 'P-101' }, {});
		assert.equal(last.ok, true);
		assert.equal(last.orphanedDomain, true);
		persisted = parseLedger(await readFile(path.join(root, 'learning-moment-bindings.json'), 'utf8'));
		assert.equal(projectionsFor(persisted, 'lm-danke').length, 0);
		assert.ok(findMoment(persisted, 'lm-danke'), 'the moment survives the last detach (orphaned, not deleted)');
	} finally { await rm(root, { recursive: true, force: true }); }
});
