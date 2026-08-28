// Hard tool boundary for the visible PTS Companion.
//
// The preset must contain web and write tools because in-process DSH children
// inherit the preset before their role-specific toolFilter is applied. The
// visible root Agent must nevertheless not see or execute those tools itself.
// This plugin applies DSH's own Agent-scoped restriction and monotonic guard;
// subagents are intentionally excluded and remain governed by the toolFilter
// on pts_research / pts_material / pts_review / pts_renderer.

export const name = 'pts-companion-tool-boundary';
export const inject = ['tools', 'agents'];

export const HIDDEN_FROM_COMPANION = Object.freeze([
	'web_search',
	'web_fetch',
	'write',
	'edit',
]);

export const FORBIDDEN_DIRECT_EXECUTION = Object.freeze(new Set([
	...HIDDEN_FROM_COMPANION,
	'skill',
	'bash',
	'pwsh',
	'run_code',
	'workflow',
	'subagent',
]));

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function installBoundary(agent) {
	if (!agent?.ctx?.tools) throw new Error('PTS Companion boundary requires an Agent-scoped tools service');
	const liftRestriction = agent.ctx.tools.restrict({ deny: HIDDEN_FROM_COMPANION });
	const liftGuard = agent.ctx.tools.guard((execution) => {
		if (!FORBIDDEN_DIRECT_EXECUTION.has(execution.name)) return undefined;
		return `PTS Companion may not execute "${execution.name}" directly; use the matching pts_research, pts_material, pts_review or pts_renderer delegation tool.`;
	});
	return () => {
		liftGuard();
		liftRestriction();
	};
}

function composedPreset(ctx, agent) {
	return ctx.get('agentPresets')?.composedPreset(agent.ctx)
		?? agent?.session?.header?.agentPreset;
}

export function apply(ctx) {
	// Per-Session preset implementations expose the Agent directly.
	if (ctx.agent !== undefined) {
		if (isSubagent(ctx.agent)) return undefined;
		return installBoundary(ctx.agent);
	}

	// Standing-preset implementations mount once and attach every matching
	// root Agent later. Keep each restriction owned by that exact Agent scope.
	const installed = new WeakMap();
	const reconcile = (agent) => {
		const shouldInstall = !isSubagent(agent) && composedPreset(ctx, agent) === 'pts-companion';
		const current = installed.get(agent);
		if (shouldInstall && current === undefined) installed.set(agent, installBoundary(agent));
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
