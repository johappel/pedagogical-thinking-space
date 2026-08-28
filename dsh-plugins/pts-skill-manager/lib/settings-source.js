// pts-skill-manager — reading and writing the `pts-worker-skills:` section of
// the profile settings document.
//
// Why not `ctx.settings.get(ns)`? Same reason as the background steward: the
// settings seam only returns values for REGISTERED namespaces, and
// `register()` requires a schemastery schema. This package imports no
// `@deepseek-ai/*` modules (it is mounted through a junction whose realpath
// lies outside the harness install), so we read the settings document text
// (path from `ctx.settings.documentPath`) and extract OUR small, controlled
// section. We re-read on every request, so external edits take effect without
// a restart — effectively hot-reloaded.
//
// The READ parser is shared with the preset enforcement plugin
// (`dsh-presets/pts-companion/worker-skill-scope.mjs`) so the runtime workers
// and this manager can never drift apart.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { parseWorkerSkillsSection, WORKER_ROLES } from '../../../dsh-presets/pts-companion/worker-skill-scope.mjs';

export { WORKER_ROLES, parseWorkerSkillsSection };

export const WORKER_SKILLS_NS = 'pts-worker-skills';

/**
 * Read the worker-skills matrix through the settings service.
 * @param {object|undefined} settings - ctx.settings (optional).
 * @returns {Promise<Record<string, string[]> | null>}
 */
export async function readWorkerSkillsMatrix(settings) {
	if (!settings || typeof settings.documentPath !== 'string' || settings.documentPath === '') return null;
	let text;
	try {
		text = await fsp.readFile(settings.documentPath, 'utf8');
	} catch {
		return null;
	}
	return parseWorkerSkillsSection(text);
}

/**
 * Normalize one matrix value: known role keys, valid kebab ids, deduplicated.
 * @param {Record<string, unknown>} matrix - raw matrix object.
 * @returns {Record<string, string[]>}
 */
export function normalizeMatrix(matrix) {
	const out = {};
	for (const role of WORKER_ROLES) out[role] = [];
	if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return out;
	for (const role of WORKER_ROLES) {
		const raw = matrix[role];
		if (!Array.isArray(raw)) continue;
		const seen = new Set();
		for (const item of raw) {
			if (typeof item !== 'string') continue;
			const id = item.trim();
			if (id === '' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) continue;
			if (seen.has(id)) continue;
			seen.add(id);
			out[role].push(id);
		}
	}
	return out;
}

/**
 * Validate a matrix against the library: every assigned id must exist.
 * @param {Record<string, string[]>} matrix - normalized matrix.
 * @param {Set<string>} knownIds - valid library ids.
 * @returns {string[]} offending "role -> id" pairs (empty when valid).
 */
export function validateMatrixAgainstLibrary(matrix, knownIds) {
	const problems = [];
	for (const role of WORKER_ROLES) {
		for (const id of matrix[role]) {
			if (!knownIds.has(id)) problems.push(`${role} -> ${id}`);
		}
	}
	return problems;
}

/** Render one role line with an inline list (round-trip safe). */
function roleLine(role, ids) {
	if (!Array.isArray(ids) || ids.length === 0) return `  ${role}: []`;
	return `  ${role}: [${ids.join(', ')}]`;
}

/** Build the `pts-worker-skills:` block text. */
export function buildWorkerSkillsSection(matrix) {
	const m = normalizeMatrix(matrix);
	const lines = ['pts-worker-skills:'];
	for (const role of WORKER_ROLES) lines.push(roleLine(role, m[role]));
	return lines.join('\n');
}

/**
 * Replace (or create) the `pts-worker-skills:` section in the settings
 * document, preserving every other section and comment. Written atomically.
 * @param {string} documentPath - absolute settings document path.
 * @param {Record<string, string[]>} matrix - normalized matrix.
 */
export async function writeWorkerSkillsSection(documentPath, matrix) {
	const text = await fsp.readFile(documentPath, 'utf8');
	const block = buildWorkerSkillsSection(matrix);
	let next;
	if (/^pts-worker-skills:\s*$/m.test(text)) {
		const lines = text.split(/\r?\n/);
		let start = -1;
		for (let i = 0; i < lines.length; i += 1) {
			if (/^pts-worker-skills:\s*$/.test(lines[i])) { start = i; break; }
		}
		let end = start + 1;
		while (end < lines.length && (lines[end].trim() === '' || /^[ \t]/.test(lines[end]))) end += 1;
		const leading = lines.slice(0, start);
		const trailing = lines.slice(end);
		next = [...leading, block, '', ...trailing].join('\n').replace(/\n{3,}/g, '\n\n');
	} else {
		next = `${text.replace(/\s*$/, '')}\n\n${block}\n`;
	}
	const dir = path.dirname(documentPath);
	const tmp = path.join(dir, `.${path.basename(documentPath)}.skills-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, next, 'utf8');
	try {
		await fsp.rename(tmp, documentPath);
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}
