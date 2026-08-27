// pts-background-steward — capability registry loader.
//
// The registry (capabilities/registry.yml at the PTS root) is the SINGLE
// routing source for executable PTS capabilities. No second task allowlist may
// live in a validator, coordinator or prompt. This module loads and validates
// that file and exposes lookup helpers used by the dispatch seam.
//
// The plugin is deliberately dependency-free (it is mounted through a junction
// outside the harness install, so third-party specifiers are not guaranteed to
// resolve). The registry therefore uses a small, controlled YAML subset and a
// focused parser for exactly that structure — not a general YAML engine.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const REGISTRY_RELATIVE_PATH = 'capabilities/registry.yml';
// Capability lifecycle status vocabulary. Only `active` and `trial` are
// dispatchable; the others are catalogue states, not routing gates.
export const CAPABILITY_STATUSES = Object.freeze(['proposed', 'trial', 'active', 'revision-needed', 'deprecated', 'rejected']);
export const DISPATCHABLE_STATUSES = Object.freeze(['active', 'trial']);
export const CAPABILITY_SERVICES = Object.freeze(['knowledge', 'worker', 'renderer', 'review', 'memory']);
export const AUTHORIZATION_TYPES = Object.freeze(['board_item', 'bounded_session', 'explicit_chat', 'implied_bounded_request']);

/** A capability that may actually be dispatched to a DSH subagent. */
export function isDispatchable(entry) {
	return Boolean(entry) && DISPATCHABLE_STATUSES.includes(entry.status);
}

/**
 * Parse the constrained registry YAML subset:
 *   version: <int>
 *   capabilities:
 *     - task: <scalar>
 *       key: <scalar>
 *       list_key:
 *         - <scalar>
 * Full-line `#` comments and blank lines are ignored. Inline comments are NOT
 * supported (values must not contain unquoted `#`).
 */
export function parseRegistryYaml(text) {
	const lines = String(text).split(/\r?\n/);
	const root = { version: undefined, capabilities: [] };
	let current = null; // current capability object
	let listKey = null; // key currently collecting a `- item` list
	let listIndent = -1;

	for (const raw of lines) {
		const line = raw.replace(/\t/g, '  ');
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		const indent = line.length - line.trimStart().length;
		const body = line.trim();

		// Top-level scalar (version:) or the capabilities: header.
		if (indent === 0) {
			listKey = null;
			const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
			if (!m) throw new Error(`registry: unerwartete Zeile auf Ebene 0: "${body}"`);
			const [, key, value] = m;
			if (key === 'version') root.version = Number(value);
			else if (key === 'capabilities') { /* list follows */ }
			else throw new Error(`registry: unbekannter Top-Level-Schlüssel "${key}"`);
			continue;
		}

		// A new capability entry: "- task: <id>".
		if (body.startsWith('- ')) {
			const itemBody = body.slice(2).trim();
			// A bare list item (belongs to the current listKey of current cap).
			if (listKey && indent > listIndent && !/^[A-Za-z0-9_]+:\s/.test(itemBody)) {
				current[listKey].push(unquote(itemBody));
				continue;
			}
			const m = itemBody.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
			if (!m) throw new Error(`registry: Listeneintrag ohne Schlüssel: "${itemBody}"`);
			current = {};
			listKey = null;
			root.capabilities.push(current);
			const [, key, value] = m;
			assignScalarOrOpenList(current, key, value, () => { listKey = key; listIndent = indent; });
			continue;
		}

		// A bare list item under an open list key.
		if (listKey && !body.includes(':')) {
			current[listKey].push(unquote(body));
			continue;
		}

		// A key under the current capability.
		const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
		if (!m) throw new Error(`registry: unerwartete Zeile: "${body}"`);
		if (!current) throw new Error(`registry: Schlüssel "${body}" ohne Capability`);
		const [, key, value] = m;
		listKey = null;
		assignScalarOrOpenList(current, key, value, () => { listKey = key; listIndent = indent; });
	}

	return root;
}

function assignScalarOrOpenList(obj, key, value, openList) {
	if (value === '' ) {
		obj[key] = [];
		openList();
	} else {
		obj[key] = coerceScalar(value);
	}
}

function unquote(s) {
	const t = s.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
	return t;
}

function coerceScalar(value) {
	const v = unquote(value);
	if (/^-?\d+$/.test(v)) return Number(v);
	if (v === 'true') return true;
	if (v === 'false') return false;
	return v;
}

/**
 * Validate the parsed registry against the capability contract.
 * @returns {{ ok: true, registry: object } | { ok: false, errors: string[] }}
 */
export function validateRegistry(reg) {
	const errors = [];
	if (!reg || typeof reg !== 'object') return { ok: false, errors: ['registry ist kein Objekt'] };
	if (!Number.isInteger(reg.version)) errors.push('registry.version fehlt oder ist keine Ganzzahl');
	if (!Array.isArray(reg.capabilities) || reg.capabilities.length === 0) {
		return { ok: false, errors: [...errors, 'registry.capabilities fehlt oder ist leer'] };
	}
	const seen = new Set();
	reg.capabilities.forEach((c, i) => {
		const at = `capabilities[${i + 1}]`;
		if (typeof c.task !== 'string' || c.task.trim() === '') errors.push(`${at}.task fehlt`);
		else if (seen.has(c.task)) errors.push(`${at}.task "${c.task}" ist doppelt`);
		else seen.add(c.task);
		if (!CAPABILITY_SERVICES.includes(c.service)) errors.push(`${at}.service unzulässig: ${String(c.service)}`);
		if (!CAPABILITY_STATUSES.includes(c.status)) errors.push(`${at}.status unzulässig: ${String(c.status)}`);
		if (typeof c.capability_file !== 'string' || !c.capability_file.startsWith('capabilities/')) {
			errors.push(`${at}.capability_file fehlt oder liegt nicht unter capabilities/`);
		}
		if (!Array.isArray(c.authorizations) || c.authorizations.length === 0) errors.push(`${at}.authorizations fehlt`);
		else for (const a of c.authorizations) if (!AUTHORIZATION_TYPES.includes(a)) errors.push(`${at}.authorizations enthält unzulässige Art "${a}"`);
		if (isDispatchable(c)) {
			if (!Array.isArray(c.dsh_tools) || c.dsh_tools.length === 0) errors.push(`${at}.dsh_tools fehlt (dispatchbare Capability braucht DSH-Werkzeuge)`);
			if (typeof c.result_schema !== 'string' || c.result_schema.trim() === '') errors.push(`${at}.result_schema fehlt`);
			if (typeof c.output_handler !== 'string' || c.output_handler.trim() === '') errors.push(`${at}.output_handler fehlt`);
			if (typeof c.instruction_file !== 'string' || !c.instruction_file.startsWith('capabilities/')) {
				errors.push(`${at}.instruction_file fehlt (dispatchbare Capability lädt Instruktion aus einer Datei, keine JS-Duplikation)`);
			}
			if (typeof c.schema_file !== 'string' || !c.schema_file.startsWith('capabilities/')) {
				errors.push(`${at}.schema_file fehlt (dispatchbare Capability lädt das Schema aus einer Datei, keine JS-Duplikation)`);
			}
			if (!Number.isInteger(c.capability_version)) errors.push(`${at}.capability_version fehlt oder ist keine Ganzzahl`);
		}
	});
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, registry: reg };
}

/** Load + parse + validate the registry from the PTS root. */
export async function loadRegistry(ptsRoot) {
	const file = path.join(ptsRoot, ...REGISTRY_RELATIVE_PATH.split('/'));
	const text = await fsp.readFile(file, 'utf8');
	const parsed = parseRegistryYaml(text);
	const checked = validateRegistry(parsed);
	if (!checked.ok) throw new Error(`Capability-Registry ungültig:\n- ${checked.errors.join('\n- ')}`);
	return checked.registry;
}

/** Resolve one capability by stable task id, or undefined. */
export function getCapability(registry, task) {
	return (registry.capabilities || []).find((c) => c.task === task);
}

/** All stable task ids that may be dispatched (executable/experimental). */
export function dispatchableTasks(registry) {
	return (registry.capabilities || []).filter(isDispatchable).map((c) => c.task);
}

/** Dispatchable task ids for one service (e.g. knowledge). */
export function dispatchableTasksForService(registry, service) {
	return (registry.capabilities || []).filter((c) => isDispatchable(c) && c.service === service).map((c) => c.task);
}
