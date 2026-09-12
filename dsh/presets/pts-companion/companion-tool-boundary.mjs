// pts-companion-tool-boundary — the PTS Core authority boundary.
//
// The preset must mount the file, web and skill tools because the seven PTS
// worker roles are DSH subagents that join their parent's composition; each
// role is then narrowed by its own `toolFilter.allow`. The visible root
// Companion must nevertheless not see or execute those tools itself: it
// delegates. This module applies DSH's own agent-scoped `tools.restrict` and a
// monotonic `tools.guard`, and deliberately skips subagents so a worker keeps
// exactly the authority its toolFilter grants.
//
// It imports no @deepseek-ai package and publishes no service.

export const name = 'pts-companion-tool-boundary';
export const inject = ['agents'];

/** Roster id of the preset this boundary belongs to. */
export const PRESET_ID = 'pts-companion';

/**
 * Removed from the root Companion's visible tool set. Restricting rather than
 * merely guarding matters for `skill`: a visible-but-blocked skill tool injects
 * the catalog into every turn and invites a direct call instead of delegation.
 */
export const HIDDEN_FROM_COMPANION = Object.freeze([
	'skill',
	'web_search',
	'web_fetch',
	'write',
	'edit',
]);

/** Denied even if a future row re-introduces them into the visible set. */
export const FORBIDDEN_DIRECT_EXECUTION = Object.freeze(new Set([
	...HIDDEN_FROM_COMPANION,
	'bash',
	'pwsh',
	'run_code',
	'workflow',
	'subagent',
	'subagent_fork',
]));

const DELEGATION_HINT = 'Der Pädagogische Companion führt das nicht selbst aus. Starte sofort die passende PTS-Rolle '
	+ 'im Hintergrund (run_in_background: true) und führe das Gespräch weiter: Recherche → pts_research · '
	+ 'begrenzte Denkstand-Änderung → pts_edit · Dokumentation → pts_document · Konsistenz und Denkstand → '
	+ 'pts_documentarian · Material → pts_material · Gegenprüfung → pts_review · Rendering → pts_renderer. '
	+ 'Antworte nicht mit "nicht möglich", warte nicht auf das Ergebnis und beende die Runde nicht mit einer Wartefloskel.';

/** Install restriction and guard inside one root Companion's own scope. */
export function installBoundary(agent) {
	if (agent?.ctx?.tools === undefined) throw new Error('PTS Companion boundary requires an Agent-scoped tools service');
	const liftRestriction = agent.ctx.tools.restrict({ deny: HIDDEN_FROM_COMPANION });
	const liftGuard = agent.ctx.tools.guard((execution) => {
		if (!FORBIDDEN_DIRECT_EXECUTION.has(execution.name)) return undefined;
		return DELEGATION_HINT;
	});
	return () => {
		liftGuard();
		liftRestriction();
	};
}

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx) ?? agent?.session?.header?.agentPreset;
}

/** @param {import('cordis').Context} ctx - the preset's context. */
export function apply(ctx) {
	// The preset is mounted once per process under a standing scope and every
	// session joins it, so this module attaches boundaries through the agent
	// registry. `ctx.agent` does not exist in a standing mount and reading it
	// is what made the mount fail.
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = !isSubagent(agent) && composedPreset(ctx, agent) === PRESET_ID;
		const current = installed.get(agent);
		if (shouldInstall && current === undefined) installed.set(agent, installBoundary(agent));
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
