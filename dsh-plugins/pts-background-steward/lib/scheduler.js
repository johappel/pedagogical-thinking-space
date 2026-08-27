// pts-background-steward — per-Denkraum run scheduler.
//
// Guarantees (Revisionsschutz + Ruhe):
// - At most `maxConcurrentPerWorkspace` active runs per workspace key.
// - Rapid consecutive turns coalesce: each notify resets the debounce timer.
// - Turns completing while a run is active never start a second parallel run;
//   they mark the workspace dirty and (optionally) trigger exactly one rerun
//   with fresh state after the active run settles.
// - All timers are injectable so tests run without real time.

const MAX_PENDING_METAS = 20;

export function createScheduler({
	debounceMs = 1500,
	maxConcurrentPerWorkspace = 1,
	rerunAfterBusyTurns = true,
	rerunDelayMs = 250,
	runner,
	timerFn = (fn, ms) => {
		const t = setTimeout(fn, ms);
		return () => clearTimeout(t);
	},
	log = () => {},
} = {}) {
	if (typeof runner !== 'function') throw new Error('scheduler: runner fehlt');
	const workspaces = new Map();
	let disposed = false;

	function entryFor(key) {
		let e = workspaces.get(key);
		if (!e) {
			e = { cancelTimer: null, pendingMetas: [], running: 0, dirty: false, lastRunAt: null, lastOutcome: null };
			workspaces.set(key, e);
		}
		return e;
	}

	function armTimer(e, key, ms) {
		if (e.cancelTimer) e.cancelTimer();
		e.cancelTimer = timerFn(() => {
			e.cancelTimer = null;
			return fire(key, e);
		}, ms);
	}

	function drainPending(e) {
		const metas = e.pendingMetas;
		e.pendingMetas = [];
		return metas;
	}

	async function fire(key, e) {
		if (disposed) return;
		if (e.running >= maxConcurrentPerWorkspace) {
			e.dirty = true;
			return;
		}
		const metas = drainPending(e);
		if (metas.length === 0 && !e.dirty) return;
		e.running += 1;
		try {
			await runner(key, metas);
		} catch (error) {
			// The runner is responsible for containing its own errors; this is a
			// last-resort guard so scheduling never breaks the host event loop.
			log(`runner-Fehler für ${key}: ${String(error && error.stack || error)}`);
		} finally {
			e.running -= 1;
			e.lastRunAt = Date.now();
			if (!disposed && rerunAfterBusyTurns && e.dirty && e.pendingMetas.length > 0) {
				e.dirty = false;
				armTimer(e, key, rerunDelayMs);
			} else if (e.pendingMetas.length === 0) {
				e.dirty = false;
			}
		}
	}

	return {
		/** Register one completed-turn trigger for a workspace. */
		notify(key, meta) {
			if (disposed) return 'disposed';
			const e = entryFor(key);
			e.pendingMetas.push(meta);
			if (e.pendingMetas.length > MAX_PENDING_METAS) e.pendingMetas.shift();
			if (e.running >= maxConcurrentPerWorkspace) {
				e.dirty = true;
				return 'busy';
			}
			armTimer(e, key, debounceMs);
			return 'scheduled';
		},
		isRunning(key) {
			const e = workspaces.get(key);
			return Boolean(e && e.running > 0);
		},
		hasPending(key) {
			const e = workspaces.get(key);
			return Boolean(e && (e.pendingMetas.length > 0 || e.dirty));
		},
		activeKeys() {
			return [...workspaces.entries()]
				.filter(([, e]) => e.running > 0 || e.cancelTimer !== null || e.pendingMetas.length > 0)
				.map(([k]) => k);
		},
		snapshot() {
			return [...workspaces.entries()].map(([key, e]) => ({
				key,
				running: e.running > 0,
				pending: e.pendingMetas.length,
				dirty: e.dirty,
				lastRunAt: e.lastRunAt,
			}));
		},
		dispose() {
			disposed = true;
			for (const e of workspaces.values()) {
				if (e.cancelTimer) { e.cancelTimer(); e.cancelTimer = null; }
			}
			workspaces.clear();
		},
	};
}
