// pts-worker-routes — per-worker LLM-route configuration (shared module).
//
// This is NOT a Cordis plugin. `dsh-tool-subagent` reads `agentOptions`
// (provider/model/maxTokens/reasoningEffort) at composition time, i.e. when
// the installed `agent.cordis.yml` is mounted at DSH start. There is no
// post-spawn hook for the LLM route (unlike skills, which are enforced by a
// per-agent tool guard in worker-skill-scope.mjs), so routes can only be
// applied by re-rendering the installed `agent.cordis.yml` and restarting DSH.
//
// Responsibilities:
//   - parse the `pts-worker-routes:` section of the profile settings document
//     (the same document worker-skill-scope.mjs reads for `pts-worker-skills:`),
//   - render that section back into the worker `agentOptions` blocks of the
//     installed `agent.cordis.yml`,
//   - hold the canonical defaults so a removed override reverts to the repo
//     default (a drift test in the skill-manager asserts these match the
//     canonical `agent.cordis.yml`).
//
// Shared by:
//   - scripts/render-worker-routes.mjs  (start/install-time render)
//   - pts-skill-manager (GUI: read/write the settings section)
//
// This module imports no @deepseek-ai packages.

/**
 * Tunable workers. `slug` is the settings key; `id` is the `- id:` in the
 * `pts-workers` group of `agent.cordis.yml`; `label` is a UI display name.
 */
export const ROUTE_WORKERS = [
	{ slug: 'research', id: 'pts-research', label: 'Research' },
	{ slug: 'material', id: 'pts-material', label: 'Material' },
	{ slug: 'edit-legacy', id: 'pts-edit-legacy', label: 'Edit (Legacy)' },
	{ slug: 'document', id: 'pts-document', label: 'Dokumentation' },
	{ slug: 'documentarian', id: 'pts-documentarian', label: 'Documentarian' },
	{ slug: 'review', id: 'pts-review', label: 'Review' },
	{ slug: 'renderer', id: 'pts-renderer', label: 'Renderer' },
];

export const ROUTE_SLUGS = ROUTE_WORKERS.map((w) => w.slug);
export const ROUTE_WORKER_IDS = ROUTE_WORKERS.map((w) => w.id);

/** Overridable `agentOptions` fields (reasoningEffort is adapter-owned). */
export const ROUTE_FIELDS = ['provider', 'model', 'maxTokens', 'reasoningEffort'];

const SLUG_BY_ID = new Map(ROUTE_WORKERS.map((w) => [w.id, w.slug]));
const ID_BY_SLUG = new Map(ROUTE_WORKERS.map((w) => [w.slug, w.id]));

export function idForSlug(slug) {
	return ID_BY_SLUG.get(slug);
}

export function slugForId(id) {
	return SLUG_BY_ID.get(id);
}

/**
 * Canonical defaults, mirrored from `agent.cordis.yml`. A route override in
 * settings replaces individual fields; a removed field falls back to these.
 * `reasoningEffort` is intentionally absent (adapter-owned, empty by default).
 */
export const WORKER_ROUTES_DEFAULTS = {
	'pts-research': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 16000 },
	'pts-material': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 16000 },
	'pts-edit-legacy': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 16000 },
	'pts-document': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 16000 },
	'pts-documentarian': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 12000 },
	'pts-review': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 12000 },
	'pts-renderer': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 16000 },
};

/** Effective route for one worker: defaults overlaid with any override. */
export function effectiveRoute(id, override) {
	const base = WORKER_ROUTES_DEFAULTS[id] ?? {};
	const o = (override !== null && typeof override === 'object' && !Array.isArray(override)) ? override : {};
	const out = {
		provider: typeof o.provider === 'string' && o.provider.trim() !== '' ? o.provider.trim() : base.provider,
		model: typeof o.model === 'string' && o.model.trim() !== '' ? o.model.trim() : base.model,
		maxTokens: typeof o.maxTokens === 'number' && Number.isFinite(o.maxTokens) && o.maxTokens > 0
			? o.maxTokens
			: base.maxTokens,
	};
	const effort = typeof o.reasoningEffort === 'string' ? o.reasoningEffort.trim() : '';
	if (effort !== '') out.reasoningEffort = effort;
	return out;
}

/** Strip quoting and an inline ` # comment` from one scalar. */
function cleanScalar(raw) {
	let v = String(raw ?? '').trim();
	const hash = v.search(/\s+#/);
	if (hash > 0) v = v.slice(0, hash).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	return v;
}

/** Parse one route field scalar into its typed value (undefined = absent). */
function routeFieldValue(field, raw) {
	const s = cleanScalar(raw);
	if (s === '' || s === 'null' || s === '~') return undefined;
	if (field === 'maxTokens') {
		const n = Number(s);
		if (!Number.isFinite(n) || n <= 0) return undefined;
		return n;
	}
	return s;
}

/** Parse an inline `{ provider: x, model: y }` worker value. */
function parseInlineRouteMap(raw) {
	let s = String(raw ?? '').trim();
	if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1).trim();
	const out = {};
	if (s === '') return out;
	for (const part of s.split(',')) {
		const m = /^\s*([a-zA-Z]+)\s*:\s*(.*?)\s*$/.exec(part);
		if (!m) continue;
		if (!ROUTE_FIELDS.includes(m[1])) continue;
		const value = routeFieldValue(m[1], m[2]);
		if (value !== undefined) out[m[1]] = value;
	}
	return out;
}

/**
 * Extract the `pts-worker-routes:` section from the settings document text.
 * Supports block style (2-space slug, 4-space fields) and inline maps:
 *
 *   pts-worker-routes:
 *     research:
 *       provider: openrouter
 *       model: deepseek/deepseek-v4-flash
 *       maxTokens: 16000
 *     review:
 *       model: some/other-model
 *       maxTokens: 12000
 *
 * Unknown slugs/fields, malformed values and comments are ignored. Returns
 * `null` when the section is absent or empty, otherwise a
 * `Record<slug, Partial<Route>>`.
 * @param {string} text - raw settings document text.
 * @returns {Record<string, Record<string, string|number>> | null}
 */
export function parseWorkerRoutesSection(text) {
	if (typeof text !== 'string') return null;
	const lines = text.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (/^pts-worker-routes:\s*$/.test(lines[i])) { start = i; break; }
	}
	if (start === -1) return null;
	const routes = {};
	let sawValue = false;
	let currentSlug = null;
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		if (!/^[ \t]/.test(line)) break; // next top-level key ends the section
		const indent = (line.match(/^[ \t]*/) || [''])[0].length;
		const trimmed = line.trim();
		if (indent >= 2 && indent < 4) {
			const m = /^([a-z0-9-]+):\s*(.*)$/.exec(trimmed);
			if (!m) break;
			const slug = m[1];
			if (!ROUTE_SLUGS.includes(slug)) {
				// Unknown worker block: its indented fields must not leak into
				// the previous worker.
				currentSlug = null;
				continue;
			}
			currentSlug = slug;
			routes[slug] = parseInlineRouteMap(m[2]);
			if (Object.keys(routes[slug]).length > 0) sawValue = true;
			continue;
		}
		if (indent >= 4 && currentSlug !== null) {
			const fm = /^([a-zA-Z]+):\s*(.*)$/.exec(trimmed);
			if (!fm) continue;
			const field = fm[1];
			if (!ROUTE_FIELDS.includes(field)) continue;
			const value = routeFieldValue(field, fm[2]);
			if (value === undefined) continue;
			routes[currentSlug][field] = value;
			sawValue = true;
			continue;
		}
		break;
	}
	return sawValue ? routes : null;
}

/**
 * Normalize a raw routes object (parsed or from JSON) into a canonical
 * slug-keyed record of typed partial routes. Invalid entries are dropped.
 * @param {unknown} raw
 * @returns {Record<string, Record<string, string|number>>}
 */
export function normalizeWorkerRoutes(raw) {
	const out = {};
	for (const slug of ROUTE_SLUGS) out[slug] = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const slug of ROUTE_SLUGS) {
		const entry = raw[slug];
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		for (const field of ROUTE_FIELDS) {
			const v = entry[field];
			if (field === 'maxTokens') {
				if (typeof v === 'number' && Number.isFinite(v) && v > 0) { out[slug].maxTokens = v; continue; }
				if (typeof v === 'string' && v.trim() !== '') {
					const n = Number(v.trim());
					if (Number.isFinite(n) && n > 0) out[slug].maxTokens = n;
				}
			} else if (typeof v === 'string' && v.trim() !== '') {
				out[slug][field] = v.trim();
			}
		}
	}
	return out;
}

/**
 * Rewrite the `agentOptions` block of one worker in-place. The block runs from
 * the `agentOptions:` line (direct child of `config:`) until the next sibling
 * key (`persona:`, `toolFilter:`, …). `final` is the complete desired value.
 *
 * `lines` is a `text.split('\n')` array: each element keeps its own trailing
 * `\r` (CRLF) or not (LF), so untouched lines survive byte-for-byte and only
 * this block is re-rendered with the block's own line-ending style.
 * @param {string[]} lines - mutable line array (split on '\n').
 * @param {string} workerId - `- id:` value of the worker row.
 * @param {{provider:string,model:string,maxTokens:number,reasoningEffort?:string}} final
 */
function rewriteAgentOptionsBlock(lines, workerId, final) {
	const idRe = new RegExp(`^\\s*- id: ${escapeRegExp(workerId)}\\s*$`);
	const startIdx = lines.findIndex((l) => idRe.test(l));
	if (startIdx === -1) return;

	let aoIdx = -1;
	for (let i = startIdx + 1; i < lines.length; i += 1) {
		const l = lines[i];
		if (/^\s*- id:/.test(l)) break; // next list item
		if (/^\S/.test(l)) break; // top-level key
		if (/^\s*agentOptions:\s*$/.test(l)) { aoIdx = i; break; }
	}
	if (aoIdx === -1) return;

	const aoIndent = (lines[aoIdx].match(/^[ \t]*/) || [''])[0].length;
	const lineEnd = /\r$/.test(lines[aoIdx]) ? '\r' : '';

	let endIdx = aoIdx + 1;
	while (endIdx < lines.length) {
		const l = lines[endIdx];
		if (l.trim() === '' || l.trim().startsWith('#')) { endIdx += 1; continue; }
		const indent = (l.match(/^[ \t]*/) || [''])[0].length;
		if (indent <= aoIndent) break;
		endIdx += 1;
	}

	const indentStr = ' '.repeat(aoIndent);
	const fieldIndent = ' '.repeat(aoIndent + 2);
	const block = [`${indentStr}agentOptions:${lineEnd}`];
	block.push(`${fieldIndent}provider: ${final.provider}${lineEnd}`);
	block.push(`${fieldIndent}model: ${final.model}${lineEnd}`);
	block.push(`${fieldIndent}maxTokens: ${final.maxTokens}${lineEnd}`);
	if (final.reasoningEffort !== undefined && final.reasoningEffort !== '') {
		block.push(`${fieldIndent}reasoningEffort: ${final.reasoningEffort}${lineEnd}`);
	}
	lines.splice(aoIdx, endIdx - aoIdx, ...block);
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render the worker `agentOptions` blocks of an `agent.cordis.yml` document.
 * Each worker is rewritten to `default ⊕ override`; a worker without an
 * override is normalized to its default, and a previously rendered field whose
 * override was removed reverts to the default (no sticky overrides).
 * @param {string} agentCordisText - installed `agent.cordis.yml` text.
 * @param {Record<string, Record<string, string|number>>} [routesById] - worker-id-keyed overrides.
 * @returns {string}
 */
export function renderWorkerRoutes(agentCordisText, routesById) {
	// Split on '\n' only, preserving each line's own '\r' suffix, so untouched
	// lines (including the mixed line endings in the persona block) survive
	// byte-for-byte.
	const lines = String(agentCordisText ?? '').split('\n');
	const overrides = (routesById !== null && typeof routesById === 'object' && !Array.isArray(routesById))
		? routesById
		: {};
	for (const id of ROUTE_WORKER_IDS) {
		const final = effectiveRoute(id, overrides[id]);
		rewriteAgentOptionsBlock(lines, id, final);
	}
	return lines.join('\n');
}
