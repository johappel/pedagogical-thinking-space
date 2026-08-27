// Tests for pts-background-steward/lib/workspace-state.js — pure transforms
// and the fs helpers (hashing, atomic write) against a temporary directory.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	CANONICAL_FILES,
	WRITABLE_FILES,
	hashContent,
	snapshotHashes,
	readCanonicalFiles,
	atomicWrite,
	mdReplaceSection,
	mdAppendUnderSection,
	landscapeAppendMoment,
	decisionsAppendEntry,
	boardAppendItem,
	applyOperations,
	makeIdFactory,
} from '../lib/workspace-state.js';

const LEARNING_DESIGN = `# Learning Design: Test

## Context

- Alter Stand.

## Open Questions

- Alte Frage?

## Change Log

### 2026-01-01

Changed: Anlage.
`;

const LANDSCAPE = `---
schema: ptspace.learning-landscape/v1
title: Test
structure: linear
---

# Lernlandschaft

## Lernmomente

Noch keine Lernmomente festgehalten.

## Übergänge

Keine Übergänge festgelegt.
`;

async function tempWorkspace() {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-steward-test-'));
	await writeFile(path.join(dir, 'learning-design.md'), LEARNING_DESIGN, 'utf8');
	await writeFile(path.join(dir, 'learning-landscape.md'), LANDSCAPE, 'utf8');
	await writeFile(path.join(dir, 'decisions.yml'), '# leer\ndecisions: []\n', 'utf8');
	await writeFile(path.join(dir, 'planning-board.yml'), 'schema: ptspace.planning-board/v1\nitems: []\n', 'utf8');
	await writeFile(path.join(dir, 'temporal-plan.yml'), 'schema: ptspace.temporal-plan/v1\nwindows: []\nplacements: []\n', 'utf8');
	return dir;
}

test('hashContent liefert stabile sha256:-Form und null für fehlende Dateien', () => {
	assert.match(hashContent('abc'), /^sha256:[0-9a-f]{64}$/);
	assert.equal(hashContent('abc'), hashContent('abc'));
	assert.notEqual(hashContent('abc'), hashContent('abd'));
	assert.equal(hashContent(null), null);
});

test('snapshotHashes erfasst alle kanonischen Dateien', async () => {
	const dir = await tempWorkspace();
	try {
		const hashes = await snapshotHashes(dir);
		assert.deepEqual(Object.keys(hashes).sort(), [...CANONICAL_FILES].sort());
		for (const name of CANONICAL_FILES) assert.match(hashes[name], /^sha256:/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('mdReplaceSection ersetzt einen Abschnitt, erhält andere und legt fehlende neu an', () => {
	const replaced = mdReplaceSection(LEARNING_DESIGN, 'Context', '- Neuer Kontext.\n- Zweite Zeile.');
	assert.ok(replaced.ok);
	assert.ok(replaced.content.includes('- Neuer Kontext.'));
	assert.ok(!replaced.content.includes('Alter Stand'));
	assert.ok(replaced.content.includes('## Open Questions'));
	assert.ok(replaced.content.includes('Alte Frage?'));
	assert.ok(replaced.content.includes('## Change Log'));

	const appended = mdReplaceSection(LEARNING_DESIGN, 'Learners', 'Neue Lernendengruppe.');
	assert.ok(appended.ok);
	assert.ok(appended.content.trimEnd().endsWith('Neue Lernendengruppe.'));

	assert.equal(mdReplaceSection(LEARNING_DESIGN, '', 'x').ok, false);
	assert.equal(mdReplaceSection(LEARNING_DESIGN, 'Context', '').ok, false);
	assert.equal(mdReplaceSection(null, 'Context', 'x').ok, false);
});

test('mdAppendUnderSection hängt unter vorhandener Überschrift an', () => {
	const r = mdAppendUnderSection(LEARNING_DESIGN, 'Open Questions', '- Neue offene Frage.');
	assert.ok(r.ok);
	const section = r.content.split('## Open Questions')[1].split('## Change Log')[0];
	assert.ok(section.includes('Alte Frage?'));
	assert.ok(section.includes('Neue offene Frage.'));
});

test('landscapeAppendMoment fügt vollständigen draft-Lernmoment vor Übergänge ein', () => {
	const r = landscapeAppendMoment(LANDSCAPE, {
		id: 'lm-steward-x',
		title: 'Fall eines Jugendlichen',
		moment_type: 'impulse',
		moment_function: 'Zugang über Fallperspektive',
		learning_activity: 'Lernende lesen den Fall.',
		expected_experience: 'Neutrale Fälle sind nicht neutral.',
		open_questions: 'Was erzählt der Jugendliche?',
		material_needs: '',
		provenance: 'Hintergrund-Steward, Entwurf nach Turn 42',
	});
	assert.ok(r.ok);
	assert.ok(r.content.includes('### lm-steward-x'));
	assert.ok(r.content.includes('- Status: draft'));
	const momentPart = r.content.split('### lm-steward-x')[1];
	assert.ok(momentPart.split('## Übergänge')[0].includes('Offene Fragen'));
	assert.ok(!r.content.includes('stable'));

	const incomplete = landscapeAppendMoment(LANDSCAPE, { id: 'y', title: 'nur Titel' });
	assert.equal(incomplete.ok, false);
	const badType = landscapeAppendMoment(LANDSCAPE, {
		id: 'z', title: 't', moment_type: 'chaos', moment_function: 'f',
		learning_activity: 'a', expected_experience: 'e',
	});
	assert.equal(badType.ok, false);
});

test('decisionsAppendEntry: Leerliste wird expandiert, bestehende Liste am Dateiende bekommt Einträge', () => {
	const empty = '# Kommentar\ndecisions: []\n';
	const first = decisionsAppendEntry(empty, {
		id: 'dec-1', date: '2026-09-08', statement: 'Der Fall zeigt einen 14-Jährigen.', evidence: 'm3',
	});
	assert.ok(first.ok);
	assert.ok(first.content.includes('decisions:\n  - id: dec-1'));
	assert.ok(first.content.includes('statement: Der Fall zeigt einen 14-Jährigen.'));

	const second = decisionsAppendEntry(first.content, {
		id: 'dec-2', date: '2026-09-08', statement: 'Zweite Entscheidung.', evidence: 'm5',
	});
	assert.ok(second.ok);
	assert.ok(second.content.includes('- id: dec-1'));
	assert.ok(second.content.includes('- id: dec-2'));

	// Fremdes Layout (Liste nicht am Dateiende) wird abgelehnt statt geraten.
	const foreign = 'decisions:\n  - id: a\nother:\n  key: value\n';
	const rejected = decisionsAppendEntry(foreign, {
		id: 'dec-3', date: '2026-09-08', statement: 's', evidence: 'm1',
	});
	assert.equal(rejected.ok, false);
	assert.equal(rejected.reason, 'unsupported-decisions-layout');
});

test('boardAppendItem: Vorschlag mit proposed + requires_teacher_approval, Layout-Schutz', () => {
	const empty = 'schema: ptspace.planning-board/v1\nitems: []\n';
	const r = boardAppendItem(empty, {
		id: 'pb-1', title: 'Klären: Umfang des Falls', kind: 'clarify',
		rationale: 'Umfang noch offen.', turn_ref: 'Turn 7',
	});
	assert.ok(r.ok);
	assert.ok(r.content.includes('status: proposed'));
	assert.ok(r.content.includes('requires_teacher_approval: true'));
	assert.ok(r.content.includes('column: clarify'));
	assert.ok(r.content.includes('# Hintergrund-Steward-Vorschlag (Turn 7)'));

	assert.equal(boardAppendItem(empty, { id: 'pb-2', title: 'x', kind: 'not-a-kind' }).ok, false);
});

test('atomicWrite schreibt atomar und ohne Temp-Reste', async () => {
	const dir = await tempWorkspace();
	try {
		await atomicWrite(dir, 'decisions.yml', 'decisions: [] # neu\n');
		const content = await readFile(path.join(dir, 'decisions.yml'), 'utf8');
		assert.ok(content.includes('# neu'));
		const rest = (await readdir(dir)).filter((f) => f.endsWith('.tmp'));
		assert.deepEqual(rest, []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('readCanonicalFiles kappt lange Inhalte ehrlich', async () => {
	const dir = await tempWorkspace();
	try {
		const files = await readCanonicalFiles(dir, 50);
		const ld = files.find((f) => f.name === 'learning-design.md');
		assert.equal(ld.truncated, true);
		assert.ok(ld.content.includes('gekürzt'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('applyOperations: Batch mit Ablehnungen (temporal-plan, fehlende Datei, falsches Ziel)', () => {
	const base = new Map([
		['learning-design.md', LEARNING_DESIGN],
		['learning-landscape.md', LANDSCAPE],
		['decisions.yml', '# leer\ndecisions: []\n'],
		['planning-board.yml', 'items: []\n'],
		['temporal-plan.yml', 'schema: ptspace.temporal-plan/v1\nwindows: []\nplacements: []\n'],
	]);
	const makeId = makeIdFactory('2026-09-08');
	const ops = [
		{ target: 'learning-design.md', kind: 'set-section', section: 'Context', value: '- Neuer Kontext aus dem Gespräch.' },
		{ target: 'temporal-plan.yml', kind: 'set-section', section: 'X', value: 'verboten' },
		{ target: 'learning-design.md', kind: 'set-section', section: 'Context', value: '' }, // leer → abgelehnt
		{ target: 'learning-landscape.md', kind: 'add-draft-moment', title: 'Moment', moment_type: 'reflection', moment_function: 'f', learning_activity: 'a', expected_experience: 'e' },
		{ target: 'decisions.yml', kind: 'add-decision', value: 'Fall auf 14 Jahre festgelegt.', evidence: 'm3' },
	];
	const { updates, applied, rejected } = applyOperations(base, ops, {
		dateIso: '2026-09-08',
		makeId,
		turnRef: 'Turn 42',
	});

	assert.deepEqual([...updates.keys()].sort(), ['decisions.yml', 'learning-design.md', 'learning-landscape.md']);
	assert.equal(applied.length, 3);
	assert.equal(rejected.length, 2);
	assert.equal(rejected[0].reason, 'temporal-plan-is-not-a-steward-target');

	assert.ok(updates.get('learning-design.md').includes('Neuer Kontext'));
	const decisionBlock = updates.get('decisions.yml');
	assert.ok(decisionBlock.includes('- id: dec-steward-20260908-1'));
	assert.ok(decisionBlock.includes('evidence: m3'));
	assert.ok(updates.get('learning-landscape.md').includes('Status: draft'));

	// WRITABLE_FILES darf temporal-plan nie enthalten.
	assert.ok(!WRITABLE_FILES.includes('temporal-plan.yml'));
});
