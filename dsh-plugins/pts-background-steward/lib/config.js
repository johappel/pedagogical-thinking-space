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

	return { config: c, warnings };
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
