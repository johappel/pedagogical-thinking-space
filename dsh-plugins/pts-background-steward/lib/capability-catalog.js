// pts-background-steward — dynamic capability catalogue.
//
// The catalogue is DERIVED, not a closed allowlist: it merges the curated
// `capabilities/registry.yml` (activated capabilities) with the versioned
// capability proposals under `capabilities/_proposals/<service>/<id>/v<N>/`
// (proposed | trial | …). The generic dispatcher resolves capabilities from
// this catalogue, so a new prompt/schema capability becomes dispatchable purely
// by appearing here as `trial`/`active` — no JavaScript route is added.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { parseRegistryYaml, validateRegistry, isDispatchable, dispatchableTasksForService as regDispatchableForService } from './registry.js';

export const PROPOSALS_RELATIVE = 'capabilities/_proposals';

async function readDir(p) {
	try {
		return await fsp.readdir(p, { withFileTypes: true });
	} catch {
		return [];
	}
}

/**
 * Load every proposal meta.yml under capabilities/_proposals as capability
 * entries. Each meta.yml is a one-entry mini-registry, so it reuses the same
 * parser + validation. instruction_file/schema_file are proposal-relative.
 */
export async function loadProposals(ptsRoot) {
	const base = path.join(ptsRoot, ...PROPOSALS_RELATIVE.split('/'));
	const out = [];
	for (const service of await readDir(base)) {
		if (!service.isDirectory()) continue;
		const serviceDir = path.join(base, service.name);
		for (const capId of await readDir(serviceDir)) {
			if (!capId.isDirectory()) continue;
			const capDir = path.join(serviceDir, capId.name);
			for (const version of await readDir(capDir)) {
				if (!version.isDirectory()) continue;
				const metaPath = path.join(capDir, version.name, 'meta.yml');
				let text;
				try { text = await fsp.readFile(metaPath, 'utf8'); } catch { continue; }
				let parsed;
				try { parsed = parseRegistryYaml(text); } catch { continue; }
				const entry = Array.isArray(parsed.capabilities) ? parsed.capabilities[0] : undefined;
				if (entry) out.push({ ...entry, _origin: 'proposal', _dir: path.relative(ptsRoot, path.join(capDir, version.name)).split(path.sep).join('/') });
			}
		}
	}
	return out;
}

/** Load the merged catalogue (registry.yml + proposals). */
export async function loadCatalog(ptsRoot) {
	let registry = { version: 1, capabilities: [] };
	try {
		const regText = await fsp.readFile(path.join(ptsRoot, 'capabilities', 'registry.yml'), 'utf8');
		const parsed = parseRegistryYaml(regText);
		const checked = validateRegistry(parsed);
		if (checked.ok) registry = checked.registry;
	} catch {
		// no curated registry — proposals alone still form a catalogue
	}
	const proposals = await loadProposals(ptsRoot);
	return { version: registry.version, capabilities: [...registry.capabilities, ...proposals] };
}

const STATUS_RANK = { active: 3, trial: 2, 'revision-needed': 1, proposed: 1, deprecated: 0, rejected: 0 };

/**
 * Resolve the EFFECTIVE capability entry for a task: prefer a dispatchable
 * entry (active over trial), else the highest capability_version.
 */
export function getCapability(catalog, task) {
	const matches = (catalog.capabilities || []).filter((c) => c.task === task);
	if (matches.length === 0) return undefined;
	return matches.slice().sort((a, b) => {
		const sr = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0);
		if (sr !== 0) return sr;
		return (Number(b.capability_version) || 0) - (Number(a.capability_version) || 0);
	})[0];
}

/** All entries for a task, newest first (traceability: versions never overwritten). */
export function versionsOf(catalog, task) {
	return (catalog.capabilities || []).filter((c) => c.task === task)
		.slice().sort((a, b) => (Number(b.capability_version) || 0) - (Number(a.capability_version) || 0));
}

/** Dispatchable knowledge task ids from the merged catalogue (single source). */
export function dispatchableTasksForService(catalog, service) {
	const seen = new Set();
	for (const c of catalog.capabilities || []) {
		if (isDispatchable(c) && c.service === service) seen.add(c.task);
	}
	return [...seen];
}

export { isDispatchable, regDispatchableForService };
