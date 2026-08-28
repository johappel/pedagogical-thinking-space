// pts-background-steward — reading the `pts-background-steward` model section
// out of the profile settings document.
//
// Why not `ctx.settings.get(ns)`? The settings seam only returns values for
// REGISTERED namespaces, and `register()` requires a schemastery schema. This
// package imports no `@deepseek-ai/*` modules (it is mounted through a
// junction whose realpath lies outside the harness install), so it cannot
// construct a schemastery schema. Instead we read the settings document text
// (path from `ctx.settings.documentPath`) and extract OUR small, controlled
// section. The section has only plain scalar fields, so a targeted extractor
// is robust and unit-testable. We re-read on every run / status request, so
// external edits take effect without a restart — effectively hot-reloaded.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const STEWARD_SETTINGS_NS = 'pts-background-steward';

const KNOWN_KEYS = ['provider', 'model', 'maxTokens', 'reasoningEffort'];

/** Strip a YAML scalar: surrounding quotes and an inline ` # comment`. */
function cleanScalar(raw) {
	let s = String(raw ?? '').trim();
	const hash = s.search(/\s+#/);
	if (hash > 0) s = s.slice(0, hash).trim();
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		s = s.slice(1, -1);
	}
	return s;
}

/**
 * Extract the `pts-background-steward:` block from a settings YAML document.
 * Supports a multiline map with 2-space-indented scalar keys:
 *
 *   pts-background-steward:
 *     provider: lmstudio
 *     model: ornith-1.5-9b-mtp
 *     maxTokens: 8192
 *     reasoningEffort: low
 *
 * Unknown or malformed lines are ignored. Returns null when no section exists.
 * @param {string} text - raw settings document text.
 * @returns {{ provider?: string, model?: string, maxTokens?: number, reasoningEffort?: string } | null}
 */
export function parseStewardSettingsSection(text) {
	if (typeof text !== 'string') return null;
	const lines = text.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (/^pts-background-steward:\s*$/.test(lines[i])) { start = i; break; }
	}
	if (start === -1) return null;
	const out = {};
	let sawValue = false;
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		// A non-indented line starts the next top-level key → block ended.
		if (!/^[ \t]/.test(line)) break;
		const m = /^[ \t]{2,}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!m) break;
		const key = m[1];
		const raw = m[2];
		if (!KNOWN_KEYS.includes(key)) continue;
		const value = cleanScalar(raw);
		if (value === '') continue;
		if (key === 'maxTokens') {
			const n = Number(value);
			if (Number.isFinite(n) && n >= 0) out.maxTokens = Math.round(n);
		} else {
			out[key] = value;
		}
		sawValue = true;
	}
	return sawValue ? out : null;
}

/**
 * Read the steward model section from the live settings service, if present.
 * @param {object|undefined} settings - ctx.settings (optional)
 * @returns {Promise<object|null>} parsed section or null when unavailable/absent.
 */
export async function readStewardModelSettings(settings) {
	if (!settings || typeof settings.documentPath !== 'string') return null;
	const doc = settings.documentPath;
	if (doc === '') return null;
	let text;
	try {
		text = await fsp.readFile(doc, 'utf8');
	} catch {
		return null;
	}
	return parseStewardSettingsSection(text);
}

/**
 * Parse the provider catalog from the settings document (`llm-pi-ai.providers`).
 * Used by the model picker. Structure (see profiles/pts-web/settings.yaml):
 *
 *   llm-pi-ai:
 *     providers:
 *       lmstudio:
 *         displayName: LM Studio
 *         models:
 *           - id: qwen/qwen3.8-27b
 *             name: qwen3.8-27b
 *
 * @param {string} text - raw settings document text.
 * @returns {Record<string, { displayName: string, models: Array<{id: string, name: string}> }>}
 */
export function parseProviderCatalog(text) {
	if (typeof text !== 'string') return {};
	const lines = text.split(/\r?\n/);
	const root = lines.findIndex((l) => /^llm-pi-ai:\s*$/.test(l));
	if (root === -1) return {};
	const providers = {};
	let currentProvider = null;
	let currentModel = null;
	let inProviders = false;
	let inModels = false;
	for (let i = root + 1; i < lines.length; i += 1) {
		const line = lines[i];
		const indent = (line.match(/^[ \t]*/) || [''])[0].length;
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		if (indent === 0) break; // nächster Top-Level-Schlüssel
		if (trimmed === 'providers:' && indent === 2) { inProviders = true; continue; }
		if (!inProviders) continue;
		if (indent === 4 && !trimmed.startsWith('-')) {
			const m = /^([A-Za-z0-9_.~/-]+):\s*$/.exec(trimmed);
			if (m) {
				currentProvider = m[1];
				providers[currentProvider] = { displayName: m[1], models: [] };
				inModels = false;
				currentModel = null;
			}
			continue;
		}
		if (currentProvider && indent === 6) {
			const dm = /^displayName:\s*(.*)$/.exec(trimmed);
			if (dm) { providers[currentProvider].displayName = cleanScalar(dm[1]); continue; }
			if (/^models:\s*$/.test(trimmed)) { inModels = true; continue; }
			continue;
		}
		if (currentProvider && inModels && indent === 8) {
			const idm = /^- id:\s*(.*)$/.exec(trimmed);
			if (idm) {
				currentModel = { id: cleanScalar(idm[1]), name: cleanScalar(idm[1]) };
				providers[currentProvider].models.push(currentModel);
			}
			continue;
		}
		if (currentProvider && inModels && currentModel && indent === 10) {
			const nm = /^name:\s*(.*)$/.exec(trimmed);
			if (nm) currentModel.name = cleanScalar(nm[1]);
		}
	}
	return providers;
}

/**
 * Read the provider catalog through the settings service.
 * @param {object|undefined} settings - ctx.settings (optional)
 * @returns {Promise<object>} provider catalog (empty when unavailable).
 */
export async function readProviderCatalog(settings) {
	if (!settings || typeof settings.documentPath !== 'string' || settings.documentPath === '') return {};
	let text;
	try {
		text = await fsp.readFile(settings.documentPath, 'utf8');
	} catch {
		return {};
	}
	return parseProviderCatalog(text);
}

/** Render one scalar for a YAML block value (always quoted for round-trip safety). */
function scalar(v) {
	return JSON.stringify(String(v ?? ''));
}

/** Build the `pts-background-steward:` block text. */
export function buildStewardSection(values) {
	const v = values ?? {};
	const lines = ['pts-background-steward:'];
	lines.push(`  provider: ${scalar(v.provider ?? '')}`);
	lines.push(`  model: ${scalar(v.model ?? '')}`);
	if (Number.isFinite(v.maxTokens)) lines.push(`  maxTokens: ${Math.round(v.maxTokens)}`);
	if (v.reasoningEffort) lines.push(`  reasoningEffort: ${scalar(v.reasoningEffort)}`);
	return lines.join('\n');
}

/**
 * Replace (or create) the `pts-background-steward:` section in the settings
 * document, preserving every other section and comment. Written atomically.
 * @param {string} documentPath - absolute settings document path.
 * @param {{ provider?: string, model?: string, maxTokens?: number, reasoningEffort?: string }} values
 */
export async function writeStewardSettingsSection(documentPath, values) {
	const text = await fsp.readFile(documentPath, 'utf8');
	const block = buildStewardSection(values);
	let next;
	if (/^pts-background-steward:\s*$/m.test(text)) {
		const lines = text.split(/\r?\n/);
		let start = -1;
		for (let i = 0; i < lines.length; i += 1) {
			if (/^pts-background-steward:\s*$/.test(lines[i])) { start = i; break; }
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
	const tmp = path.join(dir, `.${path.basename(documentPath)}.steward-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, next, 'utf8');
	try {
		await fsp.rename(tmp, documentPath);
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}

