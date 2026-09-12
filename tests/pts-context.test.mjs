// Unit tests for the PTS Core prompt projection (dsh/presets/pts-companion/pts-context.mjs).
// Pure functions only: no DSH runtime, no Denkraum on disk.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
	clip,
	parseLearningDesign,
	renderDenkstandContext,
	renderWorkerContext,
	TOTAL_BUDGET,
	SECTION_ORDER,
	CONTEXT_ORDER,
} from '../dsh/presets/pts-companion/pts-context.mjs';

const FIXTURE = `# Learning Design: KI und Gottesbild

## Metadata

- Status: in-reflection

## Current Status

in-reflection — die Leitidee steht, die Stundenverteilung ist offen.

## Short Summary

Die Lerngruppe vergleicht KI-Sprachmodelle mit religiöser Rede.

## Educational Intention

Die Lernenden unterscheiden Analogie und Gleichsetzung.

## Key Learning Moments

### Moment 1: Der Widerspruch im Raum

Text zum Moment.

### Moment 2: Was fehlt?

Noch offen.

## Open Questions

### Question 1: Wie viel Theologie verträgt die Einstiegsphase?

### Question 2: Wer moderiert Raum 3?
`;

test('parseLearningDesign liest die kanonischen Abschnitte', () => {
	const design = parseLearningDesign(FIXTURE);
	assert.equal(design.title, 'Learning Design: KI und Gottesbild');
	assert.match(design.fields['Current Status'], /in-reflection/);
	assert.match(design.fields['Short Summary'], /KI-Sprachmodelle/);
	assert.equal(design.moments.length, 2);
	assert.equal(design.moments[0], 'Der Widerspruch im Raum');
	assert.deepEqual(design.questions, [
		'Wie viel Theologie verträgt die Einstiegsphase?',
		'Wer moderiert Raum 3?',
	]);
});

test('parseLearningDesign ist tolerant gegen fehlende und leere Dokumente', () => {
	assert.deepEqual(parseLearningDesign('').moments, []);
	assert.deepEqual(parseLearningDesign(undefined).questions, []);
	assert.equal(parseLearningDesign('# Nur ein Titel').title, 'Nur ein Titel');
});

test('renderDenkstandContext nennt den Denkraum und den Referenz-Root', () => {
	const text = renderDenkstandContext({
		cwd: 'F:/dsh-instances/pts/denkraeume/ki-und-religion',
		repoRoot: 'F:/code/pedagogical-thinking-space/',
		presentFiles: ['learning-design.md', 'planning-board.yml'],
		presentDirs: ['drafts'],
		design: parseLearningDesign(FIXTURE),
	});
	assert.match(text, /F:\/dsh-instances\/pts\/denkraeume\/ki-und-religion/);
	assert.match(text, /Referenzdokumente liegen unter F:\/code\/pedagogical-thinking-space\//);
	assert.match(text, /learning-design\.md, planning-board\.yml, drafts\//);
	assert.match(text, /Lernmomente \(2 erfasst\)/);
	assert.match(text, /Offene Fragen: Wie viel Theologie/);
	assert.match(text, /DSH-Session/);
});

test('renderDenkstandContext bleibt ohne Denkraum-Dateien gueltig und kurz', () => {
	const text = renderDenkstandContext({ cwd: 'F:/leer' });
	assert.match(text, /noch keine Denkstand-Dateien/);
	assert.ok(!text.includes('undefined'), 'keine undefined-Reste');
	assert.ok(text.length < TOTAL_BUDGET);
});

test('renderDenkstandContext respektiert das Budget', () => {
	const design = parseLearningDesign(FIXTURE);
	const text = renderDenkstandContext({
		cwd: 'F:/x',
		design,
		presentFiles: ['learning-design.md'],
		budget: 300,
	});
	assert.ok(text.length <= 300, `Laenge ${text.length}`);
	assert.ok(text.includes('gekürzt'), 'Kuerzungsmarker fehlt');
});

test('clip kuerzt nur oberhalb der Grenze', () => {
	assert.equal(clip('abc', 10), 'abc');
	assert.ok(clip('a'.repeat(500), 100).length <= 100);
});

test('Prompt-Orders liegen in freien Slots der Registry', () => {
	assert.ok(SECTION_ORDER > 0 && SECTION_ORDER < 500, 'Section-Order vor der ersten First-Party-Section');
	assert.ok(CONTEXT_ORDER > 120, 'Context-Order nach den First-Party-Contexts');
});

test('die ausgelieferten Prompt-Assets existieren und sind deutsch befuellt', () => {
	const persona = readFileSync(new URL('../dsh/presets/pts-companion/prompt/persona.md', import.meta.url), 'utf8');
	const framework = readFileSync(new URL('../dsh/presets/pts-companion/prompt/framework.md', import.meta.url), 'utf8');
	assert.ok(persona.trim().length > 400, 'Persona zu kurz');
	assert.ok(persona.length <= 2600, `Persona zu lang (${persona.length})`);
	assert.ok(framework.trim().length > 1200, 'Framework zu kurz');
	// Statisches Prompt-Asset-Budget; das separate Laufzeit-Overview-Budget bleibt 4200.
	assert.ok(framework.length <= 6000, `Framework zu lang (${framework.length})`);
	assert.match(framework, /pts_research/);
	assert.match(framework, /\| Rolle \| Zuständigkeit \| Grenze \|/);
});

test('renderWorkerContext nennt Denkraum, absolute Referenzwurzel und Pfadregel', () => {
	const text = renderWorkerContext({
		cwd: 'F:\\dsh-instances\\pts\\denkraeume\\Tests',
		repoRoot: 'F:/code/pedagogical-thinking-space',
	});
	assert.match(text, /Denkraum \(Arbeitsverzeichnis\): F:\\dsh-instances\\pts\\denkraeume\\Tests/);
	assert.match(text, /Referenzwurzel: F:\/code\/pedagogical-thinking-space/);
	assert.match(text, /LEARNING_DESIGN\.md/);
	assert.ok(text.includes('absolutem Pfad'), 'Pfadregel fehlt');
	assert.match(text, /Keine rekursiven Suchen/);
	assert.match(text, /keine pädagogischen Entscheidungen/);
	assert.ok(text.length <= 900, `Worker-Kontext zu lang (${text.length})`);
});

test('renderWorkerContext bleibt ohne Denkraum und Referenzwurzel gueltig', () => {
	const text = renderWorkerContext({});
	assert.match(text, /noch nicht festgelegt/);
	assert.ok(!text.includes('undefined'), 'kein undefined im Text');
	assert.ok(!text.includes('Referenzwurzel:'), 'ohne Wurzel keine Zeile');
});
