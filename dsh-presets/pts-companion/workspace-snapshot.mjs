// pts-workspace-snapshot — inject a compact Denkstand + fragment list into the
// Companion's system prompt (the "headroom").
//
// The root PTS Companion is only aware of workspace content it actively reads.
// This preset-local plugin (pattern: companion-tool-boundary.mjs) closes that
// gap by registering a per-agent system-prompt section that renders, at every
// turn, a short summary of the current Denkraum: learning-design status/focus,
// planning-board and decisions state, temporal-plan and landscape counts, plus
// the existing fragments under drafts/, materials/, knowledge-proposals/ and
// rendered/. The model therefore starts each turn "conscious" of what already
// exists instead of relying on discovery — so it reuses results instead of
// restarting research.
//
// Worker subagents are skipped (they get their own task-specific context and
// tool filters); the Companion is the only consumer.
//
// This module imports no @deepseek-ai packages: it lives in the preset copy
// whose realpath lies outside the harness installation.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const name = 'pts-workspace-snapshot';
export const inject = ['systemPrompt', 'agents'];

const SECTION_NAME = 'pts:workspace-state';
const SECTION_ORDER = 90;
const FRAGMENT_DIRS = ['drafts', 'materials', 'knowledge-proposals', 'rendered'];
const FRAGMENT_CAP = 20;

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx)
		?? agent?.session?.header?.agentPreset;
}

function posix(p) {
	return String(p).split(path.sep).join('/');
}

/** Recursively list file paths under dir (relative to base), posix, sorted. */
function relFiles(base, dir) {
	const abs = path.join(base, dir);
	const out = [];
	const walk = (d) => {
		let entries;
		try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			const full = path.join(d, e.name);
			try {
				if (e.isDirectory()) walk(full);
				else if (e.isFile()) out.push(posix(path.relative(base, full)));
			} catch { /* ignore */ }
		}
	};
	walk(abs);
	return out.sort();
}

/** First non-empty line whose trimmed text starts with the given prefix. */
function firstLineStartsWith(content, prefix) {
	const needle = prefix.toLowerCase();
	for (const line of content.split(/\r?\n/)) {
		const t = line.trim();
		if (t.toLowerCase().startsWith(needle)) return t;
	}
	return null;
}

/** Non-empty lines under `## <heading>` up to the next `## ` heading. */
function extractSection(content, heading) {
	const needle = heading.trim().toLowerCase();
	const out = [];
	let inSection = false;
	for (const line of content.split(/\r?\n/)) {
		if (/^##\s+/.test(line)) {
			if (inSection) break;
			const t = line.trim().replace(/^##\s+/, '').trim().toLowerCase();
			if (t === needle) { inSection = true; continue; }
			continue;
		}
		if (inSection && line.trim() !== '') out.push(line.trim());
	}
	return out;
}

/** planning-board.yml -> compact items. */
function parseBoard(p) {
	let c; try { c = readFileSync(p, 'utf8'); } catch { return null; }
	const items = [];
	let cur = null;
	for (const line of c.split(/\r?\n/)) {
		const t = line.trim();
		let m;
		if (/^-\s*id:/.test(t)) { if (cur) items.push(cur); cur = { id: t.replace(/^-\s*id:\s*/, '') }; }
		else if (cur && (m = /^title:\s*(.*)$/.exec(t))) cur.title = m[1];
		else if (cur && (m = /^kind:\s*(.*)$/.exec(t))) cur.kind = m[1];
		else if (cur && (m = /^status:\s*(.*)$/.exec(t))) cur.status = m[1];
		else if (cur && (m = /^requires_teacher_approval:\s*(.*)$/.exec(t))) cur.approval = m[1] !== 'false';
	}
	if (cur) items.push(cur);
	return items.map((i) => `${i.title || i.id || '?'} [${i.kind || '?'}/${i.status || '?'}${i.approval ? '·braucht Freigabe' : ''}]`);
}

/** decisions.yml -> decision statements (or [] when none). */
function parseDecisions(p) {
	let c; try { c = readFileSync(p, 'utf8'); } catch { return null; }
	const statements = [];
	for (const line of c.split(/\r?\n/)) {
		const m = /^statement:\s*(.*)$/.exec(line.trim());
		if (m) statements.push(m[1]);
	}
	return statements;
}

/** temporal-plan.yml -> coarse window/placement counts. */
function parseTemporal(p) {
	let c; try { c = readFileSync(p, 'utf8'); } catch { return null; }
	let windows = 0;
	let placements = 0;
	let inWin = false;
	let inPlace = false;
	for (const line of c.split(/\r?\n/)) {
		const t = line.trim();
		if (/^windows:\s*$/.test(t)) { inWin = true; inPlace = false; continue; }
		if (/^placements:\s*$/.test(t)) { inPlace = true; inWin = false; continue; }
		if (t === '' || /^#/.test(t)) continue;
		if (inWin && /^-\s*id:/.test(t)) windows += 1;
		if (inPlace && /^-\s*id:/.test(t)) placements += 1;
	}
	return `${windows} Fenster · ${placements} Platzierungen`;
}

/** Build the compact Denkstand + fragment snapshot for one Denkraum. */
export function buildSnapshot(root) {
	const parts = [];
	parts.push(`Denkraum: ${path.basename(root)} (${posix(root)})`);

	const ldPath = path.join(root, 'learning-design.md');
	let ld = null;
	try { ld = readFileSync(ldPath, 'utf8'); } catch { /* absent */ }
	if (ld !== null) {
		const bits = [
			firstLineStartsWith(ld, '# '),
			firstLineStartsWith(ld, 'Status:'),
			firstLineStartsWith(ld, 'Current focus:'),
		].filter(Boolean).join(' · ');
		parts.push(`learning-design: ${bits}`);
		const questions = extractSection(ld, 'Open Questions').slice(0, 4);
		if (questions.length) parts.push(`  Offene Fragen: ${questions.join(' | ')}`);
	}

	const board = parseBoard(path.join(root, 'planning-board.yml'));
	parts.push(board === null
		? 'Planning-Board: (fehlt)'
		: (board.length ? `Planning-Board: ${board.join('; ')}` : 'Planning-Board: leer'));

	const decisions = parseDecisions(path.join(root, 'decisions.yml'));
	parts.push(decisions === null
		? 'Entscheidungen: (fehlt)'
		: (decisions.length ? `Entscheidungen: ${decisions.slice(0, 5).map((d) => `«${d}»`).join(', ')}` : 'Entscheidungen: keine'));

	const temporal = parseTemporal(path.join(root, 'temporal-plan.yml'));
	parts.push(temporal === null ? 'Temporal-Plan: (fehlt)' : `Temporal-Plan: ${temporal}`);

	const llPath = path.join(root, 'learning-landscape.md');
	let ll = null;
	try { ll = readFileSync(llPath, 'utf8'); } catch { /* absent */ }
	if (ll !== null) {
		const moments = ll.split(/\r?\n/).filter((l) => /^###\s+/.test(l)).length;
		parts.push(`Lernlandschaft: ${moments} Lernmoment(e)`);
	}

	for (const dir of FRAGMENT_DIRS) {
		const files = relFiles(root, dir);
		if (files.length) {
			const shown = files.slice(0, FRAGMENT_CAP).join(', ');
			parts.push(`  ${dir}/: ${shown}${files.length > FRAGMENT_CAP ? ` (+${files.length - FRAGMENT_CAP})` : ''}`);
		}
	}

	return parts.join('\n');
}

/** Install the snapshot section for one root Companion agent. */
function install(agent) {
	const root = agent?.session?.header?.cwd;
	if (typeof root !== 'string' || root.trim() === '') return () => {};
	const ctx = agent.ctx;
	if (typeof ctx.systemPrompt?.section !== 'function') return () => {};
	let disposed = false;
	let disposeSection = () => {};
	try {
		disposeSection = ctx.systemPrompt.section({
			name: SECTION_NAME,
			order: SECTION_ORDER,
			text: () => {
				if (disposed) return '';
				try {
					return `## Aktueller Denkstand (automatisch)\n${buildSnapshot(root.trim())}`;
				} catch (error) {
					return `## Aktueller Denkstand\n(nicht lesbar: ${String(error && error.message || error)})`;
				}
			},
		});
	} catch (error) {
		console.error(`[pts-workspace-snapshot] Prompt-Sektion für ${root} nicht registrierbar:`, error);
	}
	return () => {
		disposed = true;
		try { disposeSection(); } catch { /* disposal must never throw */ }
	};
}

export function apply(ctx) {
	// Per-Session preset implementations expose the Agent directly.
	if (ctx.agent !== undefined) {
		if (isSubagent(ctx.agent)) return undefined;
		return install(ctx.agent);
	}

	// Standing-preset implementations mount once and attach every matching
	// root Agent later. Keep each section owned by that exact Agent scope.
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = !isSubagent(agent) && composedPreset(ctx, agent) === 'pts-companion';
		const current = installed.get(agent);
		if (shouldInstall && current === undefined) installed.set(agent, install(agent));
		if (!shouldInstall && current !== undefined) {
			current();
			installed.delete(agent);
		}
	};
	for (const agent of ctx.agents.list()) reconcile(agent);
	ctx.on('agent/created', ({ agent }) => { reconcile(agent); });
	ctx.on('agent/disposed', ({ agent }) => {
		const dispose = installed.get(agent);
		if (dispose !== undefined) dispose();
		installed.delete(agent);
	});
	return undefined;
}
