// pts-background-steward — configuration defaults and normalization.
//
// The profile patch row passes a plain object as row `config`. The plugin
// deliberately does NOT declare a schemastery `Config` schema: the package is
// loaded through a Windows junction into the profile's node_modules, so any
// `@deepseek-ai/*` import would have to resolve from the real repo path and
// would break there. Cordis passes raw config through unchanged when no
// schema is exported (`resolveConfig` in @deepseek-ai/cordis), so this module
// normalizes and clamps the values itself — pure and unit-testable.

export const DEFAULT_CONFIG = Object.freeze({
	// Master switch. When false, the plugin stays passive (no listener, no jobs).
	enabled: true,
	// Subagent provider registry name on ctx.subagents (base bundle mounts
	// '@deepseek-ai/dsh-subagent-spawn-in-process' under providerName 'spawn').
	providerName: 'spawn',
	// Model target for the background child. Empty strings inherit the parent
	// agent's provider/model; set both to give the steward its own slower model.
	provider: '',
	model: '',
	// Reasoning effort for the background child. IMPORTANT: DSH 0.1.1-rc.2 does
	// not route reasoningEffort to a one-shot spawn child (agentOptions only
	// carries provider/model/maxTokens), so this value is parsed, surfaced in
	// the status endpoint and reserved for future use, but NOT applied today.
	// The child always runs with its provider's default effort.
	reasoningEffort: '',
	// Per-request output token cap for the background child (0 = inherit).
	maxTokens: 8192,
	// Coalescing window after a completed dialog turn before a job starts.
	debounceMs: 1500,
	// Hard cap of active reflection runs per Denkraum (kernel: at most one).
	maxConcurrentPerWorkspace: 1,
	// When turns complete while a run is active, rerun once after it settles.
	rerunAfterBusyTurns: true,
	// Whole-job timeout; an expired run is aborted and recorded, never fatal.
	runTimeoutMs: 240000,
	// How much of the recent dialogue (message count / chars) is offered.
	recentTurnsWindow: 6,
	recentTurnsMaxChars: 12000,
	// Per-file content cap offered to the steward (chars, truncated honestly).
	maxFileChars: 24000,
	// Skip triggers whose newest user message is shorter than this many chars
	// AND carries no question mark (pure greetings/acknowledgements). 0 = off.
	minPromptChars: 0,
	// Global tool allowlist for the steward child. It must NEVER write files:
	// the plugin applies validated operations itself, atomically.
	allowedTools: ['read', 'glob', 'grep'],
	// Separate model route + tool allowlist for the bounded knowledge-research
	// subagent. This is a DIFFERENT actor from the steward: the steward only
	// detects a knowledge gap and proposes a service intent; the research child
	// alone has web access and alone executes the source-grounded lookup.
	research: Object.freeze({
		// Master switch for the research seam. When false, validated service
		// intents are recorded/deduplicated but no research child is started.
		enabled: true,
		// Empty strings inherit the steward's own model route (see resolve).
		provider: '',
		model: '',
		maxTokens: 8192,
		// Whole-job timeout for one research run.
		runTimeoutMs: 240000,
		// Tool allowlist for the research child. Unlike the steward it MAY reach
		// the web, but it still never writes files: the dispatcher writes the
		// result. These are the REAL DSH model-facing web tool ids
		// (@deepseek-ai/dsh-tool-web registers `web_search` and `web_fetch`).
		// The generic dispatcher additionally intersects this with the resolved
		// capability's declared `dsh_tools` from capabilities/registry.yml.
		allowedTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch'],
	}),
});

function clampInt(value, fallback, min, max) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

function coerceBool(value, fallback) {
	if (typeof value === 'boolean') return value;
	if (value === 'true') return true;
	if (value === 'false') return false;
	return fallback;
}

/**
 * Merge raw row config over the defaults, clamp numbers into safe ranges and
 * collect non-fatal problems instead of rejecting the composition.
 * @param {unknown} raw - raw config object from the patch row (may be undefined).
 * @returns {{ config: object, warnings: string[] }}
 */
export function normalizeConfig(raw) {
	const warnings = [];
	const source = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
	if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
		warnings.push('config muss ein Objekt sein - Default-Konfiguration wird verwendet');
	}
	const c = { ...DEFAULT_CONFIG };

	c.enabled = coerceBool(source.enabled, c.enabled);
	c.rerunAfterBusyTurns = coerceBool(source.rerunAfterBusyTurns, c.rerunAfterBusyTurns);

	for (const key of ['providerName', 'provider', 'model', 'reasoningEffort']) {
		if (source[key] !== undefined) {
			if (typeof source[key] === 'string') c[key] = source[key].trim();
			else warnings.push(`config.${key} erwartet einen String - Wert ignoriert`);
		}
	}

	c.maxTokens = clampInt(source.maxTokens ?? c.maxTokens, c.maxTokens, 0, 200000);
	c.debounceMs = clampInt(source.debounceMs ?? c.debounceMs, c.debounceMs, 0, 60000);
	c.maxConcurrentPerWorkspace = clampInt(
		source.maxConcurrentPerWorkspace ?? c.maxConcurrentPerWorkspace,
		c.maxConcurrentPerWorkspace, 1, 4,
	);
	c.runTimeoutMs = clampInt(source.runTimeoutMs ?? c.runTimeoutMs, c.runTimeoutMs, 5000, 3600000);
	c.recentTurnsWindow = clampInt(source.recentTurnsWindow ?? c.recentTurnsWindow, c.recentTurnsWindow, 1, 40);
	c.recentTurnsMaxChars = clampInt(source.recentTurnsMaxChars ?? c.recentTurnsMaxChars, c.recentTurnsMaxChars, 500, 120000);
	c.maxFileChars = clampInt(source.maxFileChars ?? c.maxFileChars, c.maxFileChars, 1000, 200000);
	c.minPromptChars = clampInt(source.minPromptChars ?? c.minPromptChars, c.minPromptChars, 0, 4000);

	if (source.allowedTools !== undefined) {
		if (Array.isArray(source.allowedTools) && source.allowedTools.every((t) => typeof t === 'string')) {
			const cleaned = [...new Set(source.allowedTools.map((t) => t.trim()).filter(Boolean))];
			if (cleaned.length > 0 && !cleaned.includes('write') && !cleaned.includes('edit')) {
				c.allowedTools = cleaned;
			} else {
				warnings.push('config.allowedTools darf read/write/edit nicht freigeben - Read-only-Liste beibehalten');
			}
		} else {
			warnings.push('config.allowedTools erwartet ein String-Array - Default beibehalten');
		}
	}
	// Defense in depth: whatever the config says, the steward child never gets
	// mutating global tools. The plugin owns every workspace write itself.
	c.allowedTools = c.allowedTools.filter((t) => t !== 'write' && t !== 'edit');

	c.research = normalizeResearch(source.research, warnings);

	return { config: c, warnings };
}

/**
 * Normalize the research sub-config over the frozen defaults. The research
 * child may reach the web but never writes files, so write/edit are always
 * stripped from its allowlist just like for the steward.
 * @param {unknown} raw - source.research (may be undefined)
 * @param {string[]} warnings - collected non-fatal problems
 * @returns {object}
 */
function normalizeResearch(raw, warnings) {
	const base = { ...DEFAULT_CONFIG.research };
	const src = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
	if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
		warnings.push('config.research muss ein Objekt sein - Default-Recherchekonfiguration wird verwendet');
	}
	base.enabled = coerceBool(src.enabled, base.enabled);
	for (const key of ['provider', 'model']) {
		if (src[key] !== undefined) {
			if (typeof src[key] === 'string') base[key] = src[key].trim();
			else warnings.push(`config.research.${key} erwartet einen String - Wert ignoriert`);
		}
	}
	base.maxTokens = clampInt(src.maxTokens ?? base.maxTokens, base.maxTokens, 0, 200000);
	base.runTimeoutMs = clampInt(src.runTimeoutMs ?? base.runTimeoutMs, base.runTimeoutMs, 5000, 3600000);
	if (src.allowedTools !== undefined) {
		if (Array.isArray(src.allowedTools) && src.allowedTools.every((t) => typeof t === 'string')) {
			const cleaned = [...new Set(src.allowedTools.map((t) => t.trim()).filter(Boolean))];
			if (cleaned.length > 0) base.allowedTools = cleaned;
			else warnings.push('config.research.allowedTools ist leer - Default beibehalten');
		} else {
			warnings.push('config.research.allowedTools erwartet ein String-Array - Default beibehalten');
		}
	}
	base.allowedTools = base.allowedTools.filter((t) => t !== 'write' && t !== 'edit');
	return base;
}

/**
 * Resolve the effective steward model configuration with precedence:
 *   settings block (`pts-background-steward:` in settings.yaml) >
 *   patch row config > defaults.
 * `reasoningEffort` is carried through for surfacing in status, but is NOT
 * passed to the child (the one-shot seam cannot route it).
 * @param {object} config - normalized patch row config
 * @param {object|null} settings - parsed settings section (or null)
 * @returns {{ provider: string, model: string, maxTokens: number, reasoningEffort: string, source: string }}
 */
export function resolveModelConfig(config, settings) {
	const fromSettings = settings !== null && typeof settings === 'object';
	return {
		provider: (fromSettings && typeof settings.provider === 'string' && settings.provider !== '')
			? settings.provider
			: config.provider,
		model: (fromSettings && typeof settings.model === 'string' && settings.model !== '')
			? settings.model
			: config.model,
		maxTokens: (fromSettings && Number.isFinite(settings.maxTokens) && settings.maxTokens > 0)
			? settings.maxTokens
			: config.maxTokens,
		reasoningEffort: (fromSettings && typeof settings.reasoningEffort === 'string' && settings.reasoningEffort !== '')
			? settings.reasoningEffort
			: config.reasoningEffort,
		source: fromSettings ? 'settings' : 'patch-row',
	};
}

/**
 * Resolve the effective research model route + tool allowlist. Precedence:
 *   settings block (`pts-background-steward.research`) > patch row research >
 *   the steward's own model route (so an unset research route inherits the
 *   steward model but keeps the web-enabled research allowlist).
 * @param {object} config - normalized patch row config (with .research)
 * @param {object} stewardModel - result of resolveModelConfig
 * @param {object|null} settings - parsed settings section (or null)
 * @returns {{ enabled: boolean, provider: string, model: string, maxTokens: number, runTimeoutMs: number, allowedTools: string[], source: string }}
 */
export function resolveResearchConfig(config, stewardModel, settings) {
	const research = config.research ?? { ...DEFAULT_CONFIG.research };
	const section = (settings !== null && typeof settings === 'object' && settings.research !== null && typeof settings.research === 'object')
		? settings.research
		: null;
	const pick = (key, fallback) => (section && typeof section[key] === 'string' && section[key] !== '')
		? section[key]
		: (research[key] !== '' ? research[key] : fallback);
	const provider = pick('provider', stewardModel.provider);
	const model = pick('model', stewardModel.model);
	const maxTokens = (section && Number.isFinite(section.maxTokens) && section.maxTokens > 0)
		? section.maxTokens
		: research.maxTokens;
	const enabled = (section && typeof section.enabled === 'boolean') ? section.enabled : research.enabled;
	const allowedTools = (section && Array.isArray(section.allowedTools) && section.allowedTools.every((t) => typeof t === 'string'))
		? [...new Set(section.allowedTools.map((t) => t.trim()).filter(Boolean))].filter((t) => t !== 'write' && t !== 'edit')
		: [...research.allowedTools];
	return {
		enabled,
		provider,
		model,
		maxTokens,
		runTimeoutMs: research.runTimeoutMs,
		allowedTools,
		source: section ? 'settings' : 'patch-row',
	};
}
