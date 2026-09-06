// render-worker-routes.mjs — apply `pts-worker-routes:` from the profile
// settings document into the installed preset's `agent.cordis.yml`.
//
// The GUI (pts-skill-manager) only writes the settings section. This script
// re-renders the worker `agentOptions` blocks at start/install time, so a route
// change takes effect on the next DSH restart — no GUI writes into the
// generated preset copy, and the settings document stays the single source of
// truth (re-running this script is idempotent and revert-safe).
//
// Usage:
//   node scripts/render-worker-routes.mjs \
//     --agent-cordis <installed agent.cordis.yml> \
//     --settings <profile settings.yaml> \
//     [--dry-run]
//
// Without flags, paths are derived from $env:DSH_HOME.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
	parseWorkerRoutesSection,
	normalizeWorkerRoutes,
	renderWorkerRoutes,
	idForSlug,
	effectiveRoute,
	ROUTE_WORKERS,
} from '../dsh-presets/pts-companion/worker-routes.mjs';

function argValue(args, name) {
	const idx = args.indexOf(name);
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

function hasArg(args, name) {
	return args.includes(name);
}

function defaultPaths() {
	const dshHome = process.env.DSH_HOME;
	if (!dshHome) throw new Error('DSH_HOME nicht gesetzt — Pfade über --agent-cordis und --settings angeben.');
	const agentCordis = path.join(dshHome, '.agent-presets', 'pts-companion', 'agent.cordis.yml');
	const settings = path.join(dshHome, 'profiles', 'pts-web', 'settings.yaml');
	return { agentCordis, settings };
}

async function readText(file) {
	try {
		return await fsp.readFile(file, 'utf8');
	} catch {
		return null;
	}
}

async function writeAtomic(file, content) {
	const dir = path.dirname(file);
	const tmp = path.join(dir, `.${path.basename(file)}.routes-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, content, 'utf8');
	try {
		await fsp.rename(tmp, file);
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}

async function main() {
	const args = process.argv.slice(2);
	const agentCordis = argValue(args, '--agent-cordis') ?? defaultPaths().agentCordis;
	const settings = argValue(args, '--settings') ?? defaultPaths().settings;
	const dryRun = hasArg(args, '--dry-run');

	const [settingsText, cordisText] = await Promise.all([readText(settings), readText(agentCordis)]);
	if (settingsText === null) {
		console.log('[render-worker-routes] keine Settings-Datei — keine Routen-Overrides, überspringe.');
		return;
	}
	if (cordisText === null) {
		throw new Error(`agent.cordis.yml nicht lesbar: ${agentCordis}`);
	}

	const parsed = parseWorkerRoutesSection(settingsText);
	const routesBySlug = normalizeWorkerRoutes(parsed ?? {});
	const routesById = {};
	for (const { slug, id } of ROUTE_WORKERS) {
		const route = routesBySlug[slug];
		if (route && Object.keys(route).length > 0) routesById[id] = route;
	}

	const rendered = renderWorkerRoutes(cordisText, routesById);
	const changed = rendered !== cordisText;

	const lines = [];
	for (const { slug, id, label } of ROUTE_WORKERS) {
		const effective = effectiveRoute(id, routesById[id]);
		const overridden = routesById[id] !== undefined;
		const effort = effective.reasoningEffort ? `, effort=${effective.reasoningEffort}` : '';
		lines.push(`  ${label.padEnd(15)} ${effective.provider}/${effective.model} (${effective.maxTokens}${effort})${overridden ? '  [override]' : ''}`);
	}
	console.log(`[render-worker-routes] ${changed ? 'Routen angewendet' : 'keine Änderung'} (${dryRun ? 'dry-run' : 'geschrieben'}):`);
	console.log(lines.join('\n'));
	if (changed && dryRun) {
		console.log(`[render-worker-routes] dry-run: ${agentCordis} wurde nicht verändert.`);
	} else if (changed) {
		await writeAtomic(agentCordis, rendered);
		console.log(`[render-worker-routes] ${agentCordis} aktualisiert.`);
	}
}

main().catch((error) => {
	console.error(`[render-worker-routes] FEHLER: ${String((error && error.message) || error)}`);
	process.exitCode = 1;
});
