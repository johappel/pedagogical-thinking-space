// Hard tool boundary for the visible PTS Companion.
//
// The preset must contain web and write tools because in-process DSH children
// inherit the preset before their role-specific toolFilter is applied. The
// visible root Agent must nevertheless not see or execute those tools itself.
// This plugin applies DSH's own Agent-scoped restriction and monotonic guard;
// subagents are intentionally excluded and remain governed by the toolFilter
// on pts_research / pts_edit / pts_document / pts_material / pts_review /
// pts_renderer.

export const name = 'pts-companion-tool-boundary';
export const inject = ['tools', 'agents'];

export const HIDDEN_FROM_COMPANION = Object.freeze([
	// 'skill' must be hidden, not merely guarded: the preset mounts tool-skill
	// for the workers, and a visible-but-blocked skill tool tempts the model to
	// try it directly (and injects the skill catalog into every Companion
	// turn) instead of delegating via pts_research. Restricted away, the
	// Companion has no skill tool at all.
	'skill',
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

// The Companion must NOT write or delegate the writing of the canonical design
// during the clarifying/planning phase. The Learning Design is co-authored
// with the teacher and its reversible maintenance belongs to the Background
// Steward after the turn. The Companion records agreed points in
// planning-board.yml / decisions.yml and parks open questions there instead.
const DESIGN_EDIT_TARGETS = Object.freeze([
	'learning-design.md',
	'learning-landscape.md',
	'materials/',
]);

/** Block a pts_edit call that targets the canonical design files. */
export function designEditBlock(execution) {
	if (execution?.name !== 'pts_edit') return undefined;
	const prompt = String(execution?.arguments?.prompt ?? '');
	const low = prompt.toLowerCase();

	// Direct file-path targets always block (design + materials).
	const fileHit = DESIGN_EDIT_TARGETS.find((target) => low.includes(target));
	if (fileHit !== undefined) return designBlockMessage(fileHit);

	// Concept-level write intent on the design blocks too ("update learning
	// design with ..."), even when no file path is named.
	const designConcept = low.includes('learning-design') || low.includes('learning design')
		|| low.includes('learning-landscape') || low.includes('learning landscape');
	const writing = DESIGN_WRITE_VERBS.some((verb) => low.includes(verb));
	if (designConcept && writing) return designBlockMessage('the learning design');

	return undefined;
}

/** German/English write-intent verbs that indicate a design rewrite. */
const DESIGN_WRITE_VERBS = Object.freeze([
	'update', 'write', 'rewrite', 'edit', 'revise', 'fill', 'complete',
	'concretis', 'expand', 'vervollständig', 'aktualisier', 'umschreiben',
	'schreiben', 'ausarbeiten', 'eintragen', 'überarbeit',
]);

function designBlockMessage(target) {
	return `pts_edit targeting ${target} is not allowed from the Companion during the clarifying/planning phase. The Learning Design is co-authored with the teacher; do not write or delegate a complete design before you have jointly shaped the intention, the journey and at least the core moments IN CONVERSATION. Keep the conversation going, park unresolved open questions in planning-board.yml via pts_edit (status: proposed, requires_teacher_approval: true), and let the Background Steward record reversible learning-design changes after the turn.`;
}

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function installBoundary(agent) {
	if (!agent?.ctx?.tools) throw new Error('PTS Companion boundary requires an Agent-scoped tools service');
	const liftRestriction = agent.ctx.tools.restrict({ deny: HIDDEN_FROM_COMPANION });
	const liftGuard = agent.ctx.tools.guard((execution) => {
		const designBlock = designEditBlock(execution);
		if (designBlock !== undefined) return designBlock;
		if (!FORBIDDEN_DIRECT_EXECUTION.has(execution.name)) return undefined;
		return `PTS Companion may not execute "${execution.name}" directly. Start the matching worker immediately in the background (run_in_background: true) and continue the free conversation while it runs: suchen/recherchieren → pts_research · ändern/überarbeiten → pts_edit · dokumentieren/festhalten → pts_document · Material erstellen → pts_material · Review → pts_review · Rendering → pts_renderer. Do not answer "not possible" and do not stop talking — delegate now via the worker tool and keep engaging the teacher.`;
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
