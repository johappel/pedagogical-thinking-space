// M1 spike — pts-whiteboard-adapter.
//
// Two kinds of assertion live here:
//   * the projection itself, on fixtures that match the snapshot contract the
//     whiteboard client actually posts (lib/client.js, wb-snapshot payload);
//   * the structural promises of the spike: no service, no tool, no second
//     whiteboard API, no polling, no automatic turn.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
	CONTEXT_NAME,
	MAX_CHARS,
	PRESET_ID,
	TOOL_NAME,
	describeDelta,
	renderOpenBoardContext,
	renderWhiteboardContext,
} from '../plugins/pts-whiteboard-adapter/lib/index.js';

const adapterPath = fileURLToPath(new URL('../plugins/pts-whiteboard-adapter/lib/index.js', import.meta.url));
const adapterSource = readFileSync(adapterPath, 'utf8');
// Structural assertions look at code, not at the prose that explains it.
const adapterCode = adapterSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const packagePath = fileURLToPath(new URL('../plugins/pts-whiteboard-adapter/package.json', import.meta.url));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

function note(id, text, actor = 'human', extra = {}) {
	return {
		id,
		text,
		x: extra.x ?? 0,
		y: extra.y ?? 0,
		parentId: extra.parentId ?? 'page:page1',
		actor,
		proposal: extra.proposal === true,
		movedBy: extra.movedBy ?? null,
	};
}

function frame(id, name, memberIds, extra = {}) {
	return {
		id,
		name,
		x: extra.x ?? 0,
		y: extra.y ?? 0,
		w: extra.w ?? 400,
		h: extra.h ?? 300,
		actor: extra.actor ?? 'human',
		proposal: extra.proposal === true,
		clusterTitle: extra.clusterTitle ?? null,
		memberIds,
	};
}

const BOARD = {
	counts: { notes: 6, human: 6, agent: 0, proposals: 0 },
	notes: [
		note('shape:1', 'klare Aufgaben', 'human', { x: 100, y: 100 }),
		note('shape:2', 'gute Fragen', 'human', { x: 300, y: 100 }),
		note('shape:3', 'Vorwissen aktivieren', 'human', { x: 500, y: 100 }),
		note('shape:4', 'Zeit zum Nachdenken', 'human', { x: 700, y: 100 }),
		note('shape:5', 'Feedback', 'human', { x: 900, y: 100 }),
		note('shape:6', 'Methodenwechsel', 'human', { x: 1100, y: 100 }),
	],
	frames: [],
	arrows: [],
	proposals: [],
	selection: [],
	page: { id: 'page:page1', name: 'Guter Unterricht', pageCount: 1 },
	commandResults: [],
};

test('kein Board (nicht live) erzeugt keinen Kontextbeitrag', () => {
	assert.equal(renderWhiteboardContext(undefined), '');
	assert.equal(renderWhiteboardContext(null), '');
	assert.equal(renderWhiteboardContext({}), '');
	assert.equal(renderWhiteboardContext({ notes: [], frames: [], selection: [] }), '');
});

test('ein geoeffnetes, leeres Board wird als solches gemeldet', () => {
	const text = renderOpenBoardContext();
	assert.match(text, /Das Board ist geöffnet/);
	assert.match(text, /nichts darauf/);
	assert.ok(text.length <= 220, `Meldung ist ${text.length} Zeichen lang`);
	assert.doesNotMatch(text, /- Zettel:/, 'keine Zaehlzeile fuer ein leeres Board');
});

test('leeres Board und geschlossener Tab bleiben unterscheidbar', () => {
	// Nur ein pollender Tab loest die Meldung aus; ohne Poll bleibt der Kontext leer.
	assert.match(adapterCode, /const live = result\?\.live === true/);
	assert.match(adapterCode, /if \(text === '' && live\) text = renderOpenBoardContext\(\)/);
	assert.match(adapterCode, /if \(available\) shown\.set\(agent, result\.snapshot\)/);
});

test('leere Zettel mit Auswahl erzeugen einen Kontextbeitrag', () => {
	const text = renderWhiteboardContext({ notes: [], frames: [], selection: [{ id: 'shape:9', kind: 'note', text: 'nur Auswahl' }] });
	assert.match(text, /Auswahl der Lehrkraft \(1\): „nur Auswahl“/);
});

test('Zählung, Seite und Herkunft stehen im Kontext', () => {
	const snapshot = {
		...BOARD,
		counts: { notes: 3, human: 2, agent: 1, proposals: 0 },
		notes: [note('shape:1', 'klare Aufgaben'), note('shape:2', 'gute Fragen'), note('shape:3', 'Anschlussfähigkeit', 'agent')],
	};
	const text = renderWhiteboardContext(snapshot);
	assert.match(text, /- Zettel: 3 \(🧑 2 · 🤖 1\)/);
	assert.match(text, /Seite: „Guter Unterricht“/);
	assert.match(text, /🤖 Anschlussfähigkeit/);
	assert.match(text, /klare Aufgaben/);
});

test('die Auswahl der Lehrkraft wird zitiert und steht vor den Zetteln', () => {
	const snapshot = { ...BOARD, selection: [{ id: 'shape:2', kind: 'note', text: 'gute Fragen' }, { id: 'shape:4', kind: 'note', text: 'Zeit zum Nachdenken' }] };
	const text = renderWhiteboardContext(snapshot);
	assert.match(text, /- Auswahl der Lehrkraft \(2\): „gute Fragen“, „Zeit zum Nachdenken“/);
	assert.ok(text.indexOf('Auswahl der Lehrkraft') < text.lastIndexOf('\n- Zettel: '), 'die Auswahl steht vor der Zettelliste');
});

test('Frames erscheinen mit Mitgliederzahl, Agent-Vorschläge als unbestätigt', () => {
	const snapshot = {
		...BOARD,
		frames: [
			frame('shape:f1', 'Orientierung', ['shape:1', 'shape:3']),
			frame('shape:f2', 'Vorschlag: Denken', ['shape:2', 'shape:4'], { proposal: true, clusterTitle: 'Denken', actor: 'agent' }),
		],
		proposals: [{ frameId: 'shape:f2', title: 'Denken', memberCount: 2, memberIds: ['shape:2', 'shape:4'] }],
	};
	const text = renderWhiteboardContext(snapshot);
	assert.match(text, /„Orientierung“ \(2 Zettel\)/);
	assert.match(text, /🤖 Vorschlag „Denken“ \(2 Zettel, unbestätigt\)/);
	assert.match(text, /offene Vorschläge: 1/);
});

test('die Regelzeile nennt die Unverbindlichkeit der Agentenvorschläge', () => {
	const text = renderWhiteboardContext(BOARD);
	assert.match(text, /Interaktionsschicht, keine Datenquelle/);
	assert.match(text, /gelten erst, wenn die Lehrkraft sie übernimmt/);
});

test('Delta: neue Zettel mit Herkunft, Verschiebungen und entfernte Zettel', () => {
	const previous = BOARD;
	const next = {
		...BOARD,
		counts: { notes: 7, human: 6, agent: 1, proposals: 0 },
		notes: [...BOARD.notes.filter((entry) => entry.id !== 'shape:6'), note('shape:7', 'Anschlussfähigkeit', 'agent'), note('shape:1', 'klare Aufgaben', 'human', { x: 260, y: 100 })],
	};
	const delta = describeDelta(previous, next);
	assert.match(delta, /\+1 Zettel \(🤖 Anschlussfähigkeit\)/);
	assert.match(delta, /−1 Zettel entfernt/);
	assert.match(delta, /1 Zettel verschoben/);
});

test('Delta erkennt die Übernahme eines Vorschlags (proposal true -> false)', () => {
	const previous = { ...BOARD, frames: [frame('shape:f2', 'Vorschlag: Denken', ['shape:2'], { proposal: true, clusterTitle: 'Denken', actor: 'agent' })] };
	const next = { ...BOARD, frames: [frame('shape:f2', 'Denken', ['shape:2'], { x: 40, y: 40 })] };
	assert.match(describeDelta(previous, next), /übernommen: „Denken“/);
});

test('Delta erkennt verworfene Vorschläge, Umbenennungen und Auswahlwechsel', () => {
	const previous = {
		...BOARD,
		frames: [frame('shape:f2', 'Vorschlag: Denken', ['shape:2'], { proposal: true, clusterTitle: 'Denken', actor: 'agent' }), frame('shape:f3', 'Rückmeldung', ['shape:5'])],
		selection: [],
	};
	const next = {
		...BOARD,
		frames: [frame('shape:f3', 'Feedback geben', ['shape:5'])],
		selection: [{ id: 'shape:5', kind: 'note', text: 'Feedback' }],
	};
	const delta = describeDelta(previous, next);
	assert.match(delta, /verworfen oder umgebaut: „Denken“/);
	assert.match(delta, /umbenannt: „Rückmeldung“ → „Feedback geben“/);
	assert.match(delta, /Auswahl der Lehrkraft geändert/);
});

test('Delta nennt ausgeführte Agentenaktionen nur bei bekannten Operationen', () => {
	const previous = BOARD;
	const next = { ...BOARD, commandResults: [{ op: 'add-note' }, { op: 'propose-clusters' }, { op: 'unbekannt' }] };
	const delta = describeDelta(previous, next);
	assert.match(delta, /zuletzt ausgeführt: Zettel ergänzt, Cluster vorgeschlagen/);
});

test('der Kontextbeitrag bleibt im Budget und enthält keinen Rohzustand', () => {
	const many = Array.from({ length: 60 }, (_, index) => note(`shape:${index}`, `Idee Nummer ${index} mit etwas längerem Text zum Auffüllen`, index % 3 === 0 ? 'agent' : 'human', { x: index * 10, y: index * 5 }));
	const snapshot = {
		counts: { notes: many.length, human: 40, agent: 20, proposals: 0 },
		notes: many,
		frames: Array.from({ length: 9 }, (_, index) => frame(`shape:f${index}`, `Cluster ${index}`, many.slice(0, 3).map((entry) => entry.id))),
		selection: many.slice(0, 9).map((entry) => ({ id: entry.id, kind: 'note', text: entry.text })),
		page: { id: 'page:page1', name: 'Großes Board', pageCount: 3 },
		commandResults: [],
	};
	const text = renderWhiteboardContext(snapshot);
	assert.ok(text.length <= MAX_CHARS, `Kontext ist ${text.length} Zeichen lang (Budget ${MAX_CHARS})`);
	assert.match(text, /\(\+\d+ weitere\)/);
	assert.doesNotMatch(text, /"parentId"|"movedBy"|"memberIds":\[/);
});

test('der Adapter ist eine eigenständige Capability ohne Service und ohne neues Tool', () => {
	assert.equal(packageJson.name, 'pts-whiteboard-adapter');
	assert.equal(packageJson.dsh, undefined, 'keine Client-Hälfte');
	assert.equal(TOOL_NAME, 'whiteboard_state');
	assert.equal(PRESET_ID, 'pts-companion');
	assert.equal(CONTEXT_NAME, 'pts:whiteboard');
	assert.match(adapterSource, /export const inject = \['agents'\]/);
	assert.doesNotMatch(adapterCode, /ctx\.provide\(/);
	assert.doesNotMatch(adapterCode, /registerTool|tools\.register/);
	assert.doesNotMatch(adapterCode, /tools\.execute\(/);
	assert.doesNotMatch(adapterCode, /setInterval|setTimeout/);
	assert.doesNotMatch(adapterCode, /webServer\.register/);
	assert.doesNotMatch(adapterCode, /whiteboard_add_note|whiteboard_propose_clusters|whiteboard_highlight_notes/);
	assert.doesNotMatch(adapterCode, /record_denkstand|record_decision|learning-design\.md/);
});

test('Kontext wird im Agenten-Scope registriert und am eigenen Fiber gehalten', () => {
	assert.match(adapterSource, /agent\.ctx\.on\('system-prompt\/assemble'/);
	assert.match(adapterSource, /ctx\.effect\(\(\) => \(typeof stop === 'function'/);
	assert.match(adapterSource, /presets|agentPresets/);
	assert.match(adapterSource, /composedPreset/);
	assert.match(adapterSource, /definition\.execute\(\{\}\)/);
	assert.match(adapterSource, /ctx\.get\('tools'\)\?\.get\?\.\(TOOL_NAME\)/);
});

test('Dienste werden zur Nutzungszeit aufgeloest, nicht beim Mounten', () => {
	// Der erste Boot der Row scheiterte genau daran: `systemPrompt` wird erst nach
	// den eingefuegten Zeilen bereitgestellt, ein eifriges ctx.get() in apply()
	// findet nichts. Der Adapter liest die Dienste deshalb im Handler.
	assert.doesNotMatch(adapterCode, /const systemPrompt = ctx\.get/);
	assert.doesNotMatch(adapterCode, /const tools = ctx\.get/);
	assert.match(adapterCode, /const definition = ctx\.get\('tools'\)\?\.get\?\.\(TOOL_NAME\)/);
	assert.match(adapterCode, /Host-Hälfte bereit/);
});
