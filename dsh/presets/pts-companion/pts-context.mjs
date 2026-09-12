// pts-companion-context — the PTS Core prompt seam.
//
// Two contributions, both registered per ROOT Companion inside that agent's
// own scope (the pattern proven by the previous preset modules):
//
//   1. a STABLE section (`pts:framework`): the PTS methodology digest, read
//      once from ./prompt/framework.md. It is not persona text: the persona
//      owns identity and stance (see ./prompt/persona.md and the dsh-persona
//      row), this section owns the working method.
//   2. a DYNAMIC context (`pts:denkstand`): a bounded, read-only projection of
//      the current Denkraum, materialised fresh at every prompt assembly by
//      ctx.systemPrompt.context(...). DSH owns conversation history; this is
//      only the current shared workspace state.
//
// No domain store, no schema, no write path, no service publication: this
// module reads files and renders text. It imports no @deepseek-ai package —
// it lives beside the preset composition, outside the harness installation.
//
// The Focus slot of the old workspace-snapshot plugin is deliberately absent:
// a selection has no source until a capability (e.g. the whiteboard adapter)
// contributes its own ctx.systemPrompt.context(...), which needs no change
// here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'pts-companion-context';
export const inject = ['agents'];

/** Roster id of the preset these contributions belong to. */
export const PRESET_ID = 'pts-companion';
/** Stable prompt section: PTS working method. */
export const SECTION_NAME = 'pts:framework';
/** After the deployment persona prefix (0), before first-party tool guidance (>=1000). */
export const SECTION_ORDER = 400;
/** Dynamic runtime context: current Denkraum projection. */
export const CONTEXT_NAME = 'pts:denkstand';
/** Dynamic runtime context for the seven PTS workers (paths, root, boundary). */
export const WORKER_CONTEXT_NAME = 'pts:arbeitsumgebung';
/** After the first-party policy/delegation contexts (110..120). */
export const CONTEXT_ORDER = 200;
/** Hard cap for the whole rendered projection. */
export const TOTAL_BUDGET = 4000;
/** Hard cap for one source file read. */
export const MAX_READ_BYTES = 65536;

/** Canonical Denkstand files of a Denkraum (specs/LEARNING_DESIGN_SCHEMA.md). */
export const DENKSTAND_FILES = Object.freeze([
	'learning-design.md',
	'learning-landscape.md',
	'planning-board.yml',
	'decisions.yml',
	'temporal-plan.yml',
]);
/** Denkstand directories whose presence is reported by name only. */
export const DENKSTAND_DIRS = Object.freeze(['drafts', 'materials', 'rendered']);

const FIELD_SECTIONS = Object.freeze(['Current Status', 'Short Summary', 'Educational Intention']);
const LIST_SECTIONS = Object.freeze(['Open Questions']);
const MOMENT_HEADING = /^###\s+Moment\s+\d+\s*:\s*(.+?)\s*$/i;
const QUESTION_HEADING = /^###\s+Question\s+\d+\s*:\s*(.+?)\s*$/i;
const MAX_MOMENTS = 12;
const MAX_QUESTIONS = 8;
const MAX_FIELD_CHARS = 400;

/** Clip a text to a character budget with a visible marker. */
export function clip(text, limit) {
	const raw = String(text ?? '');
	if (raw.length <= limit) return raw;
	return `${raw.slice(0, Math.max(0, limit - 64))}\n[…… gekürzt; Details bei Bedarf gezielt lesen ……]`;
}

/**
 * Parse the canonical sections of a learning-design.md without a Markdown
 * or YAML dependency: heading scan only.
 * @param {string} text - the file content.
 * @returns {{title?: string, fields: Record<string, string>, moments: string[], questions: string[]}}
 */
export function parseLearningDesign(text) {
	const result = { fields: {}, moments: [], questions: [] };
	const lines = String(text ?? '').split(/\r?\n/);
	let current = undefined;
	let buffer = [];
	const flush = () => {
		if (current === undefined) return;
		const body = buffer.join('\n').trim();
		if (body !== '' && FIELD_SECTIONS.includes(current)) result.fields[current] = clip(body, MAX_FIELD_CHARS);
		if (body !== '' && LIST_SECTIONS.includes(current)) {
			for (const line of body.split(/\r?\n/)) {
				const question = line.trim().replace(/^[-*]\s*/, '');
				if (!question.startsWith('#') && question !== '') result.questions.push(question);
			}
		}
		buffer = [];
	};
	for (const line of lines) {
		const h1 = /^#\s+(.+?)\s*$/.exec(line);
		if (h1 !== null) {
			if (result.title === undefined) result.title = h1[1];
			continue;
		}
		const h2 = /^##\s+(.+?)\s*$/.exec(line);
		if (h2 !== null) {
			flush();
			current = h2[1];
			continue;
		}
		const moment = MOMENT_HEADING.exec(line);
		if (moment !== null) {
			result.moments.push(moment[1]);
			continue;
		}
		const question = QUESTION_HEADING.exec(line);
		if (question !== null) {
			result.questions.push(question[1]);
			continue;
		}
		if (current !== undefined) buffer.push(line);
	}
	flush();
	result.moments = result.moments.slice(0, MAX_MOMENTS);
	result.questions = result.questions.slice(0, MAX_QUESTIONS);
	return result;
}

/**
 * Render the dynamic Denkraum projection. Pure: every filesystem fact is
 * passed in, so the rendering is unit-testable without a Denkraum.
 * @param {{cwd?: string, repoRoot?: string, presentFiles?: string[], presentDirs?: string[],
 *   design?: ReturnType<typeof parseLearningDesign> | null, error?: string, budget?: number}} input
 * @returns {string} the projection text.
 */
export function renderDenkstandContext(input = {}) {
	const lines = ['## Aktueller Denkraum (automatische Kontextprojektion)'];
	lines.push(`- Denkraum: ${input.cwd ?? '(noch nicht festgelegt)'}`);
	if (typeof input.repoRoot === 'string' && input.repoRoot !== '') {
		lines.push(
			`- PTS-Framework und Referenzdokumente liegen unter ${input.repoRoot} `
			+ '(CRITICAL_FRIEND.md, SYSTEMIC_STANCE.md, LEARNING_DESIGN.md, ORCHESTRATION.md, MANIFEST.md, services/): '
			+ 'nur bei Bedarf über den absoluten Pfad lesen, nicht vorab laden.',
		);
	}
	const files = input.presentFiles ?? [];
	const dirs = input.presentDirs ?? [];
	if (files.length > 0 || dirs.length > 0) {
		const listed = [...files, ...dirs.map((dir) => `${dir}/`)];
		lines.push(`- Vorhandene Denkstand-Dateien: ${listed.join(', ')}`);
	} else {
		lines.push(
			'- In diesem Denkraum liegen noch keine Denkstand-Dateien '
			+ `(${DENKSTAND_FILES.join(', ')}).`,
		);
	}
	const design = input.design;
	if (design !== undefined && design !== null) {
		if (design.title !== undefined) lines.push(`- Learning Design: ${design.title}`);
		for (const [label, value] of Object.entries(design.fields ?? {})) {
			lines.push(`- ${label}: ${value.replace(/\s*\n\s*/g, ' ')}`);
		}
		if ((design.moments ?? []).length > 0) {
			lines.push(`- Lernmomente (${design.moments.length} erfasst): ${design.moments.join(' · ')}`);
		}
		if ((design.questions ?? []).length > 0) {
			lines.push(`- Offene Fragen: ${design.questions.join(' · ')}`);
		}
	}
	if (typeof input.error === 'string' && input.error !== '') {
		lines.push(`- Hinweis: learning-design.md konnte nicht gelesen werden (${input.error}).`);
	}
	lines.push(
		'Arbeitsregel: Dieser Auszug ist eine Projektion des aktuellen Stands, keine zweite Wahrheit. '
		+ 'Der Gesprächsverlauf kommt ausschließlich aus der DSH-Session; dieser Denkstand ist das verdichtete Gedächtnis des Denkraums.',
	);
	return clip(lines.join('\n'), input.budget ?? TOTAL_BUDGET);
}

/** mtime+size cache so a per-step assembly does not re-read unchanged files. */
const readCache = new Map();

function readCached(absolute) {
	try {
		const stat = statSync(absolute);
		const hit = readCache.get(absolute);
		if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.value;
		const value = readFileSync(absolute, 'utf8').slice(0, MAX_READ_BYTES);
		readCache.set(absolute, { mtimeMs: stat.mtimeMs, size: stat.size, value });
		return value;
	} catch {
		readCache.delete(absolute);
		return undefined;
	}
}

function directoryNames(root) {
	try {
		return readdirSync(root, { withFileTypes: true });
	} catch {
		return [];
	}
}

/** Build the projection input from the real Denkraum at `cwd`. */
export function collectDenkstand(cwd, repoRoot) {
	const presentFiles = [];
	const presentDirs = [];
	const entries = new Map(directoryNames(cwd).map((entry) => [entry.name, entry]));
	for (const file of DENKSTAND_FILES) if (entries.get(file)?.isFile() === true) presentFiles.push(file);
	for (const dir of DENKSTAND_DIRS) if (entries.get(dir)?.isDirectory() === true) presentDirs.push(dir);
	const designPath = join(cwd, 'learning-design.md');
	const raw = presentFiles.includes('learning-design.md') ? readCached(designPath) : undefined;
	const input = { cwd, repoRoot, presentFiles, presentDirs };
	if (raw !== undefined) input.design = parseLearningDesign(raw);
	else if (presentFiles.includes('learning-design.md')) input.error = 'nicht lesbar';
	return input;
}

/**
 * Render the minimal working-environment context every PTS worker receives.
 *
 * A worker is a fresh agent in the same preset: it inherits the Denkraum as its
 * workspace, but it has no methodology section and no Denkstand projection of
 * its own. Without the absolute reference root it guesses paths and starts broad
 * searches — observed 2026-09-11: a `pts_edit` child resolved the bare name
 * `LEARNING_DESIGN.md` against its workspace, failed, and then ran a recursive
 * `**` glob that timed out after 30 s. Three lines fix that class of failure.
 * @param {{cwd?: string, repoRoot?: string}} input
 * @returns {string} the worker-oriented projection text.
 */
export function renderWorkerContext(input = {}) {
	const lines = ['## Arbeitsumgebung (automatische Kontextprojektion)'];
	lines.push(`- Denkraum (Arbeitsverzeichnis): ${input.cwd ?? '(noch nicht festgelegt)'}`);
	if (typeof input.repoRoot === 'string' && input.repoRoot !== '') {
		lines.push(
			`- Referenzwurzel: ${input.repoRoot} `
			+ '(CRITICAL_FRIEND.md, SYSTEMIC_STANCE.md, LEARNING_DESIGN.md, ORCHESTRATION.md, MANIFEST.md, services/)',
		);
	}
	lines.push(
		'- Pfade: Dateien immer mit absolutem Pfad nennen und lesen. Keine rekursiven Suchen ab '
		+ 'Laufwerks- oder Home-Wurzel; Suche auf Denkraum und Referenzwurzel begrenzen.',
	);
	lines.push('- Grenze deiner Rolle: nur der beauftragte Schritt; keine pädagogischen Entscheidungen.');
	return lines.join('\n');
}

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx) ?? agent?.session?.header?.agentPreset;
}

function loadFramework() {
	try {
		return readFileSync(new URL('./prompt/framework.md', import.meta.url), 'utf8').trim();
	} catch (error) {
		console.error('[pts-companion-context] prompt/framework.md nicht lesbar:', error?.message ?? error);
		return 'Arbeite als Pädagogischer Companion: Denken mit der Lehrkraft, Entscheidungen bleiben bei ihr.';
	}
}

/**
 * Register the contributions inside one PTS agent's own scope.
 *
 * A root Companion gets the methodology section plus the full Denkstand
 * projection. A worker (`origin: 'subagent'`) gets neither: it gets the short
 * working-environment context, so it knows the Denkraum, the absolute reference
 * root and its own boundary without carrying the Companion's stance.
 */
export function install(agent, framework, repoRoot, worker = false) {
	const cwd = agent?.session?.header?.cwd;
	if (typeof cwd !== 'string' || cwd.trim() === '') return () => {};
	const ctx = agent.ctx;
	if (ctx?.systemPrompt === undefined) return () => {};
	const disposers = [];
	if (!worker) {
		try {
			disposers.push(ctx.systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: framework }));
		} catch (error) {
			console.error('[pts-companion-context] Abschnitt nicht registrierbar:', error?.message ?? error);
		}
	}
	const denkstandText = () => {
		try {
			return renderDenkstandContext(collectDenkstand(cwd.trim(), repoRoot));
		} catch (error) {
			return renderDenkstandContext({ cwd: cwd.trim(), repoRoot, error: String(error?.message ?? error) });
		}
	};
	try {
		disposers.push(ctx.systemPrompt.context({
			name: worker ? WORKER_CONTEXT_NAME : CONTEXT_NAME,
			order: CONTEXT_ORDER,
			text: worker ? () => renderWorkerContext({ cwd: cwd.trim(), repoRoot }) : denkstandText,
		}));
	} catch (error) {
		console.error('[pts-companion-context] Kontext nicht registrierbar:', error?.message ?? error);
	}
	return () => {
		for (const dispose of disposers.reverse()) {
			try {
				dispose();
			} catch {
				// a failed disposer must not keep the others alive
			}
		}
	};
}

/**
 * @param {import('cordis').Context} ctx - the preset's context.
 * @param {{repoRoot?: string}} config - repoRoot points at the PTS repository root.
 */
export function apply(ctx, config = {}) {
	const framework = loadFramework();
	const repoRoot = typeof config.repoRoot === 'string' && config.repoRoot !== '' ? config.repoRoot : undefined;

	// A preset is mounted ONCE per process under a standing scope and every
	// session joins it (@deepseek-ai/dsh-agent-presets). There is no
	// per-session plugin instance to branch on: `ctx.agent` does not exist in
	// this context and reading it is what made the mount fail. The mount
	// attaches each root Companion itself, through the agent registry.
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = composedPreset(ctx, agent) === PRESET_ID;
		const current = installed.get(agent);
		if (shouldInstall && current === undefined) {
			installed.set(agent, install(agent, framework, repoRoot, isSubagent(agent)));
		}
		if (!shouldInstall && current !== undefined) {
			current();
			installed.delete(agent);
		}
	};
	for (const agent of ctx.agents.list()) reconcile(agent);
	ctx.on('agent/created', ({ agent }) => reconcile(agent));
	ctx.on('agent/disposed', ({ agent }) => {
		const dispose = installed.get(agent);
		if (dispose !== undefined) dispose();
		installed.delete(agent);
	});
	return undefined;
}
