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
	landscapeAppendTransition,
	decisionsAppendEntry,
	boardAppendItem,
	boardSettleItem,
	designUpsertAccent,
	ensureUniqueId,
	temporalPlanAppendWindow,
	temporalPlanAppendPlacement,
	applyOperations,
	makeIdFactory,
} from '../lib/workspace-state.js';

const LEARNING_DESIGN = `# Learning Design: Test

## Context

- Alter Stand.

## Open Questions

- Alte Frage?

## Educational Intention

Noch nicht entschieden.

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

test('landscapeAppendTransition: fügt Übergang unter ## Übergänge ein, Referenzprüfung', () => {
	const landscape = '## Lernmomente\n\n### lm-a\n\n- Titel: A\n- Status: draft\n\n### lm-b\n\n- Titel: B\n- Status: draft\n';
	const r = landscapeAppendTransition(landscape, { from_id: 'lm-a', to_id: 'lm-b', transition_type: 'required', value: 'Erst A, dann B.' });
	assert.ok(r.ok);
	assert.ok(r.content.includes('## Übergänge'));
	assert.ok(r.content.includes('### tr-lm-a-lm-b'));
	assert.ok(r.content.includes('- Von: lm-a'));
	assert.ok(r.content.includes('- Zu: lm-b'));
	assert.ok(r.content.includes('- Typ: required'));

	const unknown = landscapeAppendTransition(landscape, { from_id: 'lm-a', to_id: 'lm-z', transition_type: 'required', value: 'x' });
	assert.equal(unknown.ok, false);
	assert.equal(unknown.reason, 'unknown-to-moment');

	const self = landscapeAppendTransition(landscape, { from_id: 'lm-a', to_id: 'lm-a', transition_type: 'required', value: 'x' });
	assert.equal(self.ok, false);
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

test('temporalPlanAppendWindow/Placement: Vorschläge mit Status proposed, Referenzprüfung', () => {
	const empty = 'schema: ptspace.temporal-plan/v1\nwindows: []\nplacements: []\n';
	const w = temporalPlanAppendWindow(empty, {
		id: 'tw-01', title: 'Stunde 1 – Irritation', kind: 'lesson',
		duration_minutes: 45, note: 'Erste Begegnung.', provenance: 'Hintergrund-Steward-Vorschlag (Turn 7)',
	});
	assert.ok(w.ok);
	assert.ok(w.content.includes('- id: tw-01'));
	assert.ok(w.content.includes('status: proposed'));
	assert.ok(w.content.includes('Hintergrund-Steward-Vorschlag'));

	const landscape = '## Lernmomente\n\n### lm-impuls\n\n- Titel: Impuls\n';
	const p = temporalPlanAppendPlacement(w.content, {
		id: 'tp-01', moment_id: 'lm-impuls', window_id: 'tw-01',
		start_minute: 0, duration_minutes: 8,
		dramaturgical_role: 'opening', mode: 'common', note: '',
		provenance: 'Hintergrund-Steward-Vorschlag (Turn 7)',
	}, { landscapeContent: landscape });
	assert.ok(p.ok);
	assert.ok(p.content.includes('- id: tp-01'));
	assert.ok(p.content.includes('moment_id: lm-impuls'));
	assert.ok(p.content.includes('status: proposed'));

	// Unbekanntes Fenster oder Lernmoment wird abgelehnt statt geraten.
	const badWindow = temporalPlanAppendPlacement(w.content, {
		id: 'tp-02', moment_id: 'lm-impuls', window_id: 'tw-99',
		start_minute: 0, duration_minutes: 8,
		dramaturgical_role: 'opening', mode: 'common',
	});
	assert.equal(badWindow.ok, false);
	assert.equal(badWindow.reason, 'unknown-window-id');
	const badMoment = temporalPlanAppendPlacement(w.content, {
		id: 'tp-03', moment_id: 'lm-fantasy', window_id: 'tw-01',
		start_minute: 0, duration_minutes: 8,
		dramaturgical_role: 'opening', mode: 'common',
	}, { landscapeContent: landscape });
	assert.equal(badMoment.ok, false);
	assert.equal(badMoment.reason, 'unknown-moment-id');

	// Ungültige Art ablehnen.
	assert.equal(temporalPlanAppendWindow(empty, { id: 'tw-x', title: 't', kind: 'block', duration_minutes: 45 }).ok, false);
});

test('applyOperations: Batch mit Ablehnungen (temporal-plan-Section, leere Werte) und Vorschlags-Anwendung', () => {
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
		{ target: 'temporal-plan.yml', kind: 'propose-window', title: 'Stunde 1 – Irritation', window_kind: 'lesson', duration_minutes: 45, value: 'Erste Begegnung.' },
	];
	const { updates, applied, rejected } = applyOperations(base, ops, {
		dateIso: '2026-09-08',
		makeId,
		turnRef: 'Turn 42',
	});

	assert.deepEqual([...updates.keys()].sort(), ['decisions.yml', 'learning-design.md', 'learning-landscape.md', 'temporal-plan.yml']);
	assert.equal(applied.length, 4);
	assert.equal(rejected.length, 2);
	assert.ok(rejected[0].reason.includes('kind-not-allowed-for-target'));

	assert.ok(updates.get('learning-design.md').includes('Neuer Kontext'));
	const decisionBlock = updates.get('decisions.yml');
	assert.ok(decisionBlock.includes('- id: dec-steward-20260908-1'));
	assert.ok(decisionBlock.includes('evidence: m3'));
	assert.ok(updates.get('learning-landscape.md').includes('Status: draft'));
	assert.ok(updates.get('temporal-plan.yml').includes('status: proposed'));
	assert.ok(updates.get('temporal-plan.yml').includes('kind: lesson'));

	// temporal-plan ist jetzt als Vorschlag schreibbar.
	assert.ok(WRITABLE_FILES.includes('temporal-plan.yml'));
});

test('boardSettleItem: offene Klärung wird resolved, NUR Verweis auf den Dokumentationsort', () => {
	const board = [
		'schema: ptspace.planning-board/v1',
		'items:',
		'',
		'  # Kommentar des nächsten Items',
		'  - id: pb-a',
		'    title: Offene Klärung',
		'    kind: clarify',
		'    column: clarify',
		'    status: proposed',
		'    requires_teacher_approval: true',
		'',
		'  - id: pb-b',
		'    title: Andere Klärung',
		'    kind: clarify',
		'    column: clarify',
		'    status: proposed',
		'    requires_teacher_approval: true',
		'',
	].join('\n');
	const r = boardSettleItem(board, { item_id: 'pb-a', resolved_ref: 'decisions.yml#hoffnungsgrund-kreuz-auferstehung', dateIso: '2026-08-31' });
	assert.ok(r.ok);
	assert.equal(r.changed, true);
	const settledBlock = r.content.split('- id: pb-a')[1].split('- id: pb-b')[0];
	assert.ok(settledBlock.includes('status: resolved'));
	assert.ok(settledBlock.includes('resolved: true'));
	assert.ok(settledBlock.includes('resolved_at: "2026-08-31"'));
	assert.ok(settledBlock.includes('resolved_ref: decisions.yml#hoffnungsgrund-kreuz-auferstehung'));
	// Der Antworttext selbst landet NIE im Board (Anti-Blur-Vertrag).
	assert.ok(!settledBlock.includes('resolution:'));
	assert.ok(!settledBlock.includes('Die Lehrkraft hat'));
	// Spalte und Freigabe-Flag bleiben unangetastet (der Steward genehmigt nie).
	assert.ok(settledBlock.includes('column: clarify'));
	assert.ok(settledBlock.includes('requires_teacher_approval: true'));
	// Das andere Item und der Kommentar davor bleiben unverändert.
	const otherBlock = r.content.split('- id: pb-b')[1];
	assert.ok(otherBlock.includes('status: proposed'));
	assert.ok(!otherBlock.includes('resolved_ref'));
	assert.ok(r.content.includes('# Kommentar des nächsten Items'));

	// Bereits beantwortet → idempotenter No-op.
	const again = boardSettleItem(r.content, { item_id: 'pb-a', resolved_ref: 'woanders', dateIso: '2026-08-31' });
	assert.ok(again.ok);
	assert.equal(again.changed, false);

	// Fehlender Verweis, nicht offen (approved), fremde oder doppelte IDs werden abgelehnt.
	const noRef = boardSettleItem(board, { item_id: 'pb-a', resolved_ref: '' });
	assert.equal(noRef.ok, false);
	assert.equal(noRef.reason, 'missing-field:resolved_ref');
	const approved = board.replace('status: proposed', 'status: approved');
	const notOpen = boardSettleItem(approved, { item_id: 'pb-a', resolved_ref: 'x' });
	assert.equal(notOpen.ok, false);
	assert.equal(notOpen.reason, 'item-not-open');
	const missing = boardSettleItem(board, { item_id: 'pb-zz', resolved_ref: 'x' });
	assert.equal(missing.ok, false);
	assert.equal(missing.reason, 'item-not-found');
	const duplicated = board.replace(/- id: pb-b/, '- id: pb-a');
	const dup = boardSettleItem(duplicated, { item_id: 'pb-a', resolved_ref: 'x' });
	assert.equal(dup.ok, false);
	assert.equal(dup.reason, 'duplicate-item-id');
});

test('designUpsertAccent: Leitidee unter Educational Intention, Placeholder ersetzt, Nummerierung läuft', () => {
	const design = '# Learning Design\n\n## Educational Intention\n\nNoch nicht entschieden.\n\n## Learning Journey\n\nNoch nicht festgelegt.\n';
	const r1 = designUpsertAccent(design, { title: 'Hoffnung als Grund statt Projektion', text: 'Christliche Hoffnung gründet im Kreuz, nicht in der Nachrichtenlage.' });
	assert.ok(r1.ok);
	assert.equal(r1.changed, true);
	const section1 = r1.content.split('## Educational Intention')[1].split('## Learning Journey')[0];
	assert.ok(!section1.includes('Noch nicht entschieden'));
	assert.ok(section1.includes('1. **Hoffnung als Grund statt Projektion** — Christliche Hoffnung gründet im Kreuz, nicht in der Nachrichtenlage.'));
	assert.ok(r1.content.includes('## Learning Journey'));

	const r2 = designUpsertAccent(r1.content, { title: 'Leitfrage als roter Faden', text: 'Wovon hoffst du, wenn die Fakten dagegen sprechen?' });
	const section2 = r2.content.split('## Educational Intention')[1].split('## Learning Journey')[0];
	assert.ok(section2.includes('2. **Leitfrage als roter Faden**'));

	// Duplikat-Titel → idempotenter No-op (Vertrag: {ok, changed} ohne Inhalt).
	const r3 = designUpsertAccent(r2.content, { title: 'Hoffnung als Grund statt Projektion', text: 'anders formuliert' });
	assert.ok(r3.ok);
	assert.equal(r3.changed, false);
	assert.equal(r3.content, undefined);

	// Fehlender Abschnitt oder leere Felder werden abgelehnt.
	const noSection = designUpsertAccent('# Design\n\n## Context\n\nText.\n', { title: 't', text: 'x' });
	assert.equal(noSection.ok, false);
	assert.equal(noSection.reason, 'section-missing');
	assert.equal(designUpsertAccent(design, { title: '', text: 'x' }).ok, false);
	assert.equal(designUpsertAccent(design, { title: 't', text: '' }).ok, false);
});

test('ensureUniqueId: Kollisionsfreie IDs trotz Neustart des Lauf-Zählers', () => {
	const board = 'items:\n  - id: pb-steward-20260828-1\n    title: alt\n  - id: pb-steward-20260828-2\n    title: auch da\n';
	assert.equal(ensureUniqueId(board, 'pb-steward-20260828-3'), 'pb-steward-20260828-3');
	assert.equal(ensureUniqueId(board, 'pb-steward-20260828-1'), 'pb-steward-20260828-3');
	assert.equal(ensureUniqueId(board, 'pb-steward-20260828-2'), 'pb-steward-20260828-3');
	assert.equal(ensureUniqueId(board, 'dec-steward-20260828-1'), 'dec-steward-20260828-1');
	assert.equal(ensureUniqueId('', 'pb-1'), 'pb-1');
});

test('applyOperations: settle-board-item (nur Verweis) + add-design-accent, ID-Kollisionen werden vermieden', () => {
	// Gleicher Tag wie der Lauf (2026-09-08): der generierte Vorschlag läuft
	// bewusst gegen die bestehende ID und muss hochgezählt werden.
	const boardWithItem = 'schema: ptspace.planning-board/v1\nitems:\n  - id: pb-steward-20260908-1\n    title: Offene Klärung\n    kind: clarify\n    column: clarify\n    status: proposed\n    requires_teacher_approval: true\n';
	const base = new Map([
		['learning-design.md', LEARNING_DESIGN],
		['learning-landscape.md', LANDSCAPE],
		['decisions.yml', '# leer\ndecisions: []\n'],
		['planning-board.yml', boardWithItem],
		['temporal-plan.yml', 'schema: ptspace.temporal-plan/v1\nwindows: []\nplacements: []\n'],
	]);
	const makeId = makeIdFactory('2026-09-08');
	const ops = [
		// Der Inhalt geht ins Learning Design (Akzent), das Board bekommt nur den Verweis.
		{ target: 'learning-design.md', kind: 'add-design-accent', title: 'Hoffnung als Grund statt Projektion', value: 'Christliche Hoffnung gründet im Kreuz, nicht in der Datenlage.', evidence: 'm3' },
		{ target: 'planning-board.yml', kind: 'settle-board-item', item_id: 'pb-steward-20260908-1', value: 'learning-design.md#educational-intention', evidence: 'm3' },
		// Der Vorschlag generiert pb-steward-20260908-1 → Kollision → -2.
		{ target: 'planning-board.yml', kind: 'propose-board-item', title: 'Neue Klärung', board_kind: 'clarify', value: 'Noch offen.' },
	];
	const { updates, applied, rejected } = applyOperations(base, ops, { dateIso: '2026-09-08', makeId, turnRef: 'Turn 9' });
	assert.deepEqual(rejected, []);
	assert.equal(applied.length, 3);
	const board = updates.get('planning-board.yml');
	assert.ok(board.includes('status: resolved'));
	assert.ok(board.includes('resolved_ref: learning-design.md#educational-intention'));
	assert.ok(!board.includes('resolution:'));
	assert.ok(board.includes('- id: pb-steward-20260908-2')); // Kollision mit dem bestehenden -1 → hochgezählt
	assert.ok(!board.includes('- id: pb-steward-20260908-1\n    title: Neue Klärung')); // keine zweite -1
	assert.ok(board.includes('status: proposed')); // der neue Vorschlag bleibt offen
	const design = updates.get('learning-design.md');
	assert.ok(design.includes('1. **Hoffnung als Grund statt Projektion**'));
});

