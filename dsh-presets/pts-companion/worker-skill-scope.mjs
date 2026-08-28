// pts-worker-skill-scope — per-worker skill enforcement (preset-local plugin).
//
// Mounted in the pts-companion preset (pattern: companion-tool-boundary.mjs)
// and copied to the installed preset by scripts/install-pts-preset.ps1. The
// loader runs it once per session; the standing implementation reconciles every
// agent composed under the preset. For PTS worker SUBAGENTS it:
//
//   - detects the worker role from the applied tool filter (research keeps
//     web_search/web_fetch, material does not, review/renderer have no `skill`),
//   - reads the assigned skill ids for that role from the `pts-worker-skills:`
//     section of the profile settings document (same document the background
//     steward parser reads; hot-reloaded per agent creation),
//   - installs a per-agent tool guard that HARD-REJECTS `skill` calls for
//     non-assigned names (fail-closed until the assignment is loaded),
//   - registers a system-prompt section naming the assigned skills so the
//     model only loads allowed skills.
//
// The catalog itself stays shared (DSH merges it per scope chain, nearest
// wins, with no exclusion), so role-level enforcement happens here: guard +
// prompt. The Companion is never touched (root agents are skipped; its skill
// block stays with companion-tool-boundary.mjs).
//
// This module imports no @deepseek-ai packages: it lives in the preset copy
// whose realpath lies outside the harness installation.

import { promises as fsp } from 'node:fs';

export const name = 'pts-worker-skill-scope';
export const inject = ['tools', 'agents'];

/** Worker roles the manager can assign skills to. */
export const WORKER_ROLES = ['research', 'material', 'review', 'renderer'];
/** Roles that may actually run the `skill` tool (review/renderer stay gated by toolFilter). */
export const SKILL_ROLES = ['research', 'material'];

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Strip quoting and an inline ` # comment` from one list/scalar item. */
function cleanId(raw) {
	let v = String(raw ?? '').trim();
	const hash = v.search(/\s+#/);
	if (hash > 0) v = v.slice(0, hash).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	return v;
}

/** Parse one `key: [...]` inline list (or a plain scalar fallback). */
function parseInlineList(raw) {
	const s = String(raw ?? '').trim();
	if (s.startsWith('[') && s.endsWith(']')) {
		return s
			.slice(1, -1)
			.split(',')
			.map((item) => cleanId(item))
			.filter((id) => id !== '' && SKILL_NAME_RE.test(id));
	}
	const single = cleanId(s);
	return single !== '' && SKILL_NAME_RE.test(single) ? [single] : [];
}

/**
 * Extract the `pts-worker-skills:` section from the settings YAML document.
 * Supports 2-space indented role keys with inline lists and block lists:
 *
 *   pts-worker-skills:
 *     research: [google-search]
 *     material:
 *       - ppt-builder
 *     review: []
 *     renderer: []
 *
 * Unknown keys, malformed ids and comments are ignored. Returns null when no
 * section exists.
 * @param {string} text - raw settings document text.
 * @returns {Record<string, string[]> | null}
 */
export function parseWorkerSkillsSection(text) {
	if (typeof text !== 'string') return null;
	const lines = text.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (/^pts-worker-skills:\s*$/.test(lines[i])) { start = i; break; }
	}
	if (start === -1) return null;
	const matrix = {};
	let sawValue = false;
	let currentKey = null;
	let inBlock = false;
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		if (!/^[ \t]/.test(line)) break; // next top-level key ended the section
		const indent = (line.match(/^[ \t]*/) || [''])[0].length;
		const trimmed = line.trim();
		if (indent >= 2 && indent < 4) {
			const m = /^([a-z]+):\s*(.*)$/.exec(trimmed);
			if (!m) break;
			const key = m[1];
			if (!WORKER_ROLES.includes(key)) continue;
			currentKey = key;
			const raw = m[2];
			if (raw.trim() === '') {
				matrix[key] = [];
				inBlock = true;
			} else {
				matrix[key] = parseInlineList(raw);
				inBlock = false;
				sawValue = true;
			}
			continue;
		}
		if (inBlock && currentKey !== null && indent >= 4) {
			const item = /^-\s*(.*)$/.exec(trimmed);
			if (item) {
				const id = cleanId(item[1]);
				if (id !== '' && SKILL_NAME_RE.test(id) && !matrix[currentKey].includes(id)) {
					matrix[currentKey].push(id);
					sawValue = true;
				}
			}
			continue;
		}
		break;
	}
	return sawValue ? matrix : null;
}

/**
 * Read the worker-skills section through the settings service, if present.
 * @param {object|undefined} settings - ctx.settings (optional).
 * @returns {Promise<Record<string, string[]> | null>}
 */
export async function readWorkerSkillsSection(settings) {
	if (!settings || typeof settings.documentPath !== 'string' || settings.documentPath === '') return null;
	return readWorkerSkillsSectionFromPath(settings.documentPath);
}

/**
 * Read the worker-skills section from the settings document path directly.
 * A subagent's scoped context cannot reach the host `settings` service (the
 * preset mount joins by scope binding, not fiber parenting), so the preset
 * plugin receives the profile settings path through its row config and reads
 * the file itself — same document, same parser.
 * @param {string} documentPath - absolute settings document path.
 * @returns {Promise<Record<string, string[]> | null>}
 */
export async function readWorkerSkillsSectionFromPath(documentPath) {
	if (typeof documentPath !== 'string' || documentPath === '') return null;
	let text;
	try {
		text = await fsp.readFile(documentPath, 'utf8');
	} catch {
		return null;
	}
	return parseWorkerSkillsSection(text);
}

export function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

/**
 * Resolve the PTS worker role of one subagent from its APPLIED tool filter.
 * Research keeps web_search/web_fetch, material does not; review/renderer have
 * no `skill` tool at all. Deterministic for the fixed pts-companion preset.
 * @param {object|null} agent - the live agent.
 * @returns {'research'|'material'|null}
 */
export function roleForAgent(agent) {
	if (!isSubagent(agent)) return null;
	const tools = agent?.ctx?.tools;
	if (!tools || typeof tools.get !== 'function') return null;
	const hasSkill = tools.get('skill', agent) !== undefined;
	if (!hasSkill) return null;
	const hasWeb = tools.get('web_search', agent) !== undefined
		|| tools.get('web_fetch', agent) !== undefined;
	return hasWeb ? 'research' : 'material';
}

/** Render the guidance section for the current assignment set (live). */
function sectionText(role, assigned) {
	const names = [...assigned];
	const list = names.length === 0 ? '(keine)' : names.join(', ');
	return [
		`Dir sind folgende Skills zugewiesen (Rolle: ${role}): ${list}.`,
		'Lade über das `skill`-Tool ausschließlich einen dieser Skills. Ein nicht zugewiesener Skill wird vom Tool abgelehnt.',
	].join(' ');
}

/**
 * Install enforcement for one worker subagent: tool guard (hard) + prompt
 * section (guidance). Fail-closed: until the assignment read settles the
 * guard denies every `skill` call, and the prompt names no skills.
 * @param {object} agent - the live worker subagent.
 * @param {string|null} [settingsPath] - absolute settings document path from
 *   the row config; when absent, falls back to ctx.get('settings').
 * @returns {() => void} disposer removing both registrations.
 */
export function installWorkerSkillScope(agent, settingsPath = null) {
	const role = roleForAgent(agent);
	if (role === null) return () => {};
	const ctx = agent.ctx;
	const assigned = new Set();

	let guardDispose = () => {};
	let sectionDispose = () => {};
	try {
		guardDispose = ctx.tools.guard((execution) => {
			if (!execution || execution.name !== 'skill') return undefined;
			const wanted = execution.arguments && typeof execution.arguments.name === 'string'
				? execution.arguments.name
				: null;
			if (wanted === null || !assigned.has(wanted)) {
				return `Skill "${wanted ?? '(unbenannt)'}" ist diesem ${role}-Worker nicht zugewiesen. Lade nur einen zugewiesenen Skill.`;
			}
			return undefined;
		});
	} catch (error) {
		console.error(`[pts-worker-skill-scope] Guard für ${role}-Worker nicht installierbar:`, error);
	}
	if (typeof ctx.systemPrompt?.section === 'function') {
		try {
			sectionDispose = ctx.systemPrompt.section({
				name: 'pts:worker-skills',
				order: 100,
				text: () => sectionText(role, assigned),
			});
		} catch (error) {
			console.error(`[pts-worker-skill-scope] Prompt-Sektion für ${role}-Worker nicht registrierbar:`, error);
		}
	}

	loadAssignedSkills(role, agent, settingsPath)
		.then((ids) => {
			assigned.clear();
			for (const id of ids) assigned.add(id);
			return assigned;
		})
		.catch((error) => {
			console.error(`[pts-worker-skill-scope] Zuweisungen für ${role} nicht lesbar (Fail-closed):`, error);
		});

	return () => {
		try { guardDispose(); } catch { /* disposal must never throw */ }
		try { sectionDispose(); } catch { /* disposal must never throw */ }
	};
}

/**
 * Resolve the assigned skill ids for one worker role: configured settings path
 * first, then the settings service via ctx.get (never a bare ctx.settings
 * access, which throws "without inject" on agent-scoped contexts).
 */
async function loadAssignedSkills(role, agent, settingsPath) {
	const configured = typeof settingsPath === 'string' && settingsPath !== '' ? settingsPath : null;
	if (configured !== null) {
		const matrix = await readWorkerSkillsSectionFromPath(configured);
		return matrix && Array.isArray(matrix[role]) ? matrix[role] : [];
	}
	const settings = typeof agent.ctx.get === 'function' ? agent.ctx.get('settings') : undefined;
	if (settings !== undefined) {
		const matrix = await readWorkerSkillsSection(settings);
		return matrix && Array.isArray(matrix[role]) ? matrix[role] : [];
	}
	return [];
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx)
		?? agent?.session?.header?.agentPreset;
}

export function apply(ctx, rawConfig) {
	const config = (rawConfig !== null && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) ? rawConfig : {};
	const settingsPath = typeof config.settingsPath === 'string' && config.settingsPath.trim() !== ''
		? config.settingsPath.trim()
		: null;

	// Per-Session preset implementations expose the Agent directly.
	if (ctx.agent !== undefined) {
		if (!isSubagent(ctx.agent)) return undefined;
		if (composedPreset(ctx, ctx.agent) !== 'pts-companion') return undefined;
		return installWorkerSkillScope(ctx.agent, settingsPath);
	}

	// Standing-preset implementations mount once and attach every matching
	// worker subagent later. Keep each guard owned by that exact Agent scope.
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = isSubagent(agent)
			&& composedPreset(ctx, agent) === 'pts-companion'
			&& roleForAgent(agent) !== null;
		const current = installed.get(agent);
		if (shouldInstall && current === undefined) installed.set(agent, installWorkerSkillScope(agent, settingsPath));
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
