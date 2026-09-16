// Phase 1b — the native DSH background whiteboard worker (pts_whiteboard).
//
// Text-based contract tests, in the same style as pts-companion-composition:
// no YAML dependency is added. They guard the two invariants Phase 1b needs and
// that no other test file owns: the worker is a background one-shot subagent
// (A) and its authority is bounded to the semantic façade only (B). The render
// ack/retry/ambiguity/stale contracts (D–G) are NOT duplicated here — the
// worker's single write path is pts_whiteboard_render, whose behaviour is
// covered by tests/pts-whiteboard-renderer.test.mjs and stays unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

const COMPOSITION = 'dsh/presets/pts-companion/agent.cordis.yml';
const PERSONA = 'dsh/presets/pts-companion/prompt/persona.md';

/** The pts_whiteboard row, from its `- id:` marker to the compaction group. */
function whiteboardRow(text) {
	const start = text.indexOf('- id: pts-whiteboard\n');
	assert.notEqual(start, -1, 'die pts-whiteboard-Rolle fehlt im Preset');
	const end = text.indexOf('# ── compaction', start);
	assert.notEqual(end, -1, 'die Compaction-Grenze nach der Rolle fehlt');
	return text.slice(start, end);
}

/** The tool names the row grants its child through toolFilter.allow. */
function allowList(row) {
	const match = /allow:\s*\[([^\]]*)\]/.exec(row);
	assert.notEqual(match, null, 'toolFilter.allow fehlt');
	return match[1].split(',').map((name) => name.trim()).filter(Boolean);
}

// A. Preset-/Konfigurationstest.
test('pts_whiteboard ist ein nativer Background-Subagent (one-shot, Tiefe 1)', () => {
	const row = whiteboardRow(read(COMPOSITION));
	assert.match(row, /name: '@deepseek-ai\/dsh-tool-subagent'/, 'muss ein dsh-tool-subagent sein');
	assert.match(row, /provider: spawn/);
	assert.match(row, /toolName: pts_whiteboard\n/, 'der Toolname ist die Rolle');
	assert.match(row, /backgroundMode: one-shot/, 'one-shot wie pts_edit: owned Job, Reporter-Follow-up');
	assert.match(row, /enableRunInBackground: true/, 'der Companion muss run_in_background auslösen können');
	assert.match(row, /maxDepth: 1/, 'nur maxDepth 1 ist startbar; keine zweite Tiefe');
	assert.ok(!/maxDepth:\s*0/.test(row));
	assert.match(row, /model: deepseek\/deepseek-v4\.1-flash/);
	assert.match(row, /maxTokens: 8000/);
});

// B. Autoritätstest — nur die semantische Fassade, keine Low-Level-Mutation.
test('pts_whiteboard darf ausschließlich lesen und über die Fassade rendern', () => {
	const allowed = allowList(whiteboardRow(read(COMPOSITION)));
	assert.deepEqual(allowed, ['whiteboard_state', 'pts_whiteboard_render'], 'genau die zwei Fassaden-Tools');
});

test('pts_whiteboard erhält keine Denk-, Schreib- oder Recherchewerkzeuge und keine Whiteboard-Primitiven', () => {
	const row = whiteboardRow(read(COMPOSITION));
	const allowed = new Set(allowList(row));
	for (const forbidden of ['read', 'glob', 'grep', 'write', 'edit', 'skill', 'web_search', 'web_fetch']) {
		assert.ok(!allowed.has(forbidden), `${forbidden} darf nicht in der Allowlist stehen`);
	}
	// No low-level whiteboard mutation primitive may be named anywhere in the row:
	// the worker writes only through pts_whiteboard_render.
	for (const primitive of [
		'whiteboard_render_plan', 'whiteboard_request_open', 'whiteboard_add_note',
		'whiteboard_rename_cluster', 'whiteboard_bind_frame', 'whiteboard_frame_to_back',
		'whiteboard_arrange_sequence', 'whiteboard_propose_clusters', 'whiteboard_connect_notes',
		'whiteboard_highlight_notes', 'createShape', 'createPage', 'updateShape', 'deleteShape',
	]) {
		assert.ok(!row.includes(primitive), `${primitive} darf der Worker nicht kennen`);
	}
	// It must not be able to fan out to other workers or a second delegation tier.
	for (const role of ['pts_research', 'pts_edit', 'pts_material', 'pts_review', 'pts_renderer', 'pts_document']) {
		assert.ok(!allowed.has(role), `${role} darf der Worker nicht starten`);
	}
});

// The persona is the authority contract: mechanical execution, no new pedagogy,
// fail-closed on ambiguity/stale state, and "verified" as the done criterion.
test('die Worker-Persona bindet die Autoritätsgrenze und den verified-Vertrag', () => {
	const row = whiteboardRow(read(COMPOSITION));
	assert.match(row, /keine neuen pädagogischen Entscheidungen/);
	assert.match(row, /whiteboard_state/, 'liest den aktuellen Zustand');
	assert.match(row, /pts_whiteboard_render/, 'schreibt nur über die Fassade');
	assert.match(row, /mehrdeutig/, 'mehrdeutige Referenzen dürfen nicht geraten werden');
	assert.match(row, /verändert hat/, 'zwischenzeitliche Boardänderung darf nicht blind überschrieben werden');
	assert.match(row, /an den Parent zurück/, 'Unklarheit geht an den Companion zurück');
	assert.match(row, /verified/, 'nur verified gilt als erledigt, nicht ein angenommener Auftrag');
});

// Companion-Verhalten: kleine Änderung direkt, umfangreiche Arbeit delegiert.
test('Persona und Framework trennen direkte Renderarbeit von delegierter Board-Arbeit', () => {
	const persona = read(PERSONA);
	assert.match(persona, /pts_whiteboard\b/, 'die Whiteboard-Delegation muss in der Persona benannt sein');
	assert.match(persona, /im Hintergrund/, 'umfangreiche Board-Arbeit läuft im Hintergrund');
	const framework = read('dsh/presets/pts-companion/prompt/framework.md');
	assert.match(framework, /pts_whiteboard_render/, 'kleine Änderungen bleiben direkt');
	assert.match(framework, /pts_whiteboard\b.*Hintergrund|Hintergrund.*pts_whiteboard/s, 'umfangreiche Board-Arbeit delegiert der Companion an den Hintergrund-Worker');
});
