// pts-skill-manager — reading and writing the `pts-worker-routes:` section of
// the profile settings document (per-worker LLM route: provider, model,
// maxTokens, reasoningEffort).
//
// Mirrors settings-source.js (the `pts-worker-skills:` twin). The parser,
// defaults and renderer live in the shared preset module worker-routes.mjs so
// the GUI, the start-time render script and any future reader can never drift
// apart. The settings document is read/written directly (path from
// `ctx.settings.documentPath`); no `@deepseek-ai/*` imports, no namespace
// registry.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
	parseWorkerRoutesSection,
	normalizeWorkerRoutes,
	effectiveRoute,
	ROUTE_WORKERS,
	WORKER_ROUTES_DEFAULTS,
} from '../../../dsh-presets/pts-companion/worker-routes.mjs';

export { parseWorkerRoutesSection, normalizeWorkerRoutes, ROUTE_WORKERS, WORKER_ROUTES_DEFAULTS };

export const WORKER_ROUTES_NS = 'pts-worker-routes';

/**
 * Read the worker-routes section through the settings service.
 * @param {object|undefined} settings - ctx.settings (optional).
 * @returns {Promise<Record<string, Record<string, string|number>> | null>}
 */
export async function readWorkerRoutesSection(settings) {
	if (!settings || typeof settings.documentPath !== 'string' || settings.documentPath === '') return null;
	let text;
	try {
		text = await fsp.readFile(settings.documentPath, 'utf8');
	} catch {
		return null;
	}
	return parseWorkerRoutesSection(text);
}

/**
 * Effective route per worker (defaults overlaid with the settings override),
 * keyed by slug for the UI.
 * @param {Record<string, Record<string, string|number>> | null} routesBySlug
 * @returns {Record<string, Record<string, string|number>>}
 */
export function effectiveRoutesBySlug(routesBySlug) {
	const out = {};
	for (const { slug, id } of ROUTE_WORKERS) {
		out[slug] = effectiveRoute(id, routesBySlug && routesBySlug[slug]);
	}
	return out;
}

/** Build the `pts-worker-routes:` block text (full snapshot per worker). */
export function buildWorkerRoutesSection(routesBySlug) {
	const lines = ['pts-worker-routes:'];
	for (const { slug, id } of ROUTE_WORKERS) {
		const effective = effectiveRoute(id, routesBySlug && routesBySlug[slug]);
		lines.push(`  ${slug}:`);
		lines.push(`    provider: ${effective.provider}`);
		lines.push(`    model: ${effective.model}`);
		lines.push(`    maxTokens: ${effective.maxTokens}`);
		if (effective.reasoningEffort !== undefined && effective.reasoningEffort !== '') {
			lines.push(`    reasoningEffort: ${effective.reasoningEffort}`);
		}
	}
	return lines.join('\n');
}

/**
 * Replace (or create) the `pts-worker-routes:` section in the settings
 * document, preserving every other section and comment. Written atomically.
 * @param {string} documentPath - absolute settings document path.
 * @param {Record<string, Record<string, string|number>>} routesBySlug - full effective snapshot.
 */
export async function writeWorkerRoutesSection(documentPath, routesBySlug) {
	const text = await fsp.readFile(documentPath, 'utf8');
	const block = buildWorkerRoutesSection(routesBySlug);
	let next;
	if (/^pts-worker-routes:\s*$/m.test(text)) {
		const lines = text.split(/\r?\n/);
		let start = -1;
		for (let i = 0; i < lines.length; i += 1) {
			if (/^pts-worker-routes:\s*$/.test(lines[i])) { start = i; break; }
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
	const tmp = path.join(dir, `.${path.basename(documentPath)}.routes-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, next, 'utf8');
	try {
		await fsp.rename(tmp, documentPath);
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}
