// Tests for pts-background-steward/lib/scheduler.js and lib/config.js —
// coalescing, single-run guarantee, dirty reruns, config normalization.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createScheduler } from '../lib/scheduler.js';
import { normalizeConfig, DEFAULT_CONFIG } from '../lib/config.js';

/** Minimal fake timer world: manual clock with synchronous firing + pumps. */
function fakeTimers() {
	const pending = [];
	return {
		timerFn(fn, ms) {
			const entry = { fn, ms, cancelled: false };
			pending.push(entry);
			return () => { entry.cancelled = true; };
		},
		/** Fire every due entry once; does NOT await the returned promises. */
		flushOnce() {
			for (const p of [...pending]) {
				if (p.cancelled) continue;
				p.cancelled = true;
				p.fn();
			}
		},
		pendingCount() {
			return pending.filter((p) => !p.cancelled).length;
		},
	};
}

const tick = () => new Promise((r) => setImmediate(r));
async function pump(rounds = 30) {
	for (let i = 0; i < rounds; i += 1) await tick();
}
/** Fire timers and let microtasks settle until nothing is pending anymore. */
async function drain(t, s) {
	for (let i = 0; i < 50; i += 1) {
		t.flushOnce();
		await pump();
		if (t.pendingCount() === 0 && !s.isRunningAll?.()) {
			if ([...s.snapshot()].every((e) => !e.running && e.pending === 0)) break;
		}
	}
}

test('Schnelle aufeinanderfolgende Turns werden zu einem Lauf zusammengefasst', async () => {
	const t = fakeTimers();
	const runs = [];
	const s = createScheduler({
		debounceMs: 100,
		runner: async (key, metas) => { runs.push({ key, metas }); },
		timerFn: t.timerFn,
	});
	s.notify('ws', { turn: 1 });
	s.notify('ws', { turn: 2 });
	s.notify('ws', { turn: 3 });
	assert.equal(t.pendingCount(), 1, 'Debounce-Timer nur einmal aktiv');
	await drain(t, s);
	assert.equal(runs.length, 1);
	assert.equal(runs[0].metas.length, 3);
	assert.equal(runs[0].metas[2].turn, 3);
	s.dispose();
});

test('Während eines aktiven Laufs startet kein zweiter; danach genau ein Rerun', async () => {
	const t = fakeTimers();
	const runs = [];
	let releaseFirst;
	const firstGate = new Promise((r) => { releaseFirst = r; });
	const s = createScheduler({
		debounceMs: 10,
		rerunDelayMs: 5,
		runner: async (_key, metas) => {
			runs.push(metas.length);
			if (runs.length === 1) await firstGate;
		},
		timerFn: t.timerFn,
	});

	s.notify('ws', { turn: 1 });
	await pump();
	t.flushOnce(); // feuert den Debounce-Timer; Lauf 1 beginnt und blockiert
	await pump();
	assert.equal(s.isRunning('ws'), true);

	assert.equal(s.notify('ws', { turn: 2 }), 'busy');
	assert.equal(s.notify('ws', { turn: 3 }), 'busy');
	assert.equal(t.pendingCount(), 0, 'kein zweiter Timer während aktiven Laufs');

	releaseFirst();
	await drain(t, s);
	assert.deepEqual(runs, [1, 2], 'genau ein Rerun mit den gesammelten Turns');
	assert.equal(s.isRunning('ws'), false);
	s.dispose();
});

test('rerunAfterBusyTurns: false wartet mit Sammel-Turns auf den nächsten natürlichen Auslöser', async () => {
	const t = fakeTimers();
	const runs = [];
	let release;
	const gate = new Promise((r) => { release = r; });
	const s = createScheduler({
		debounceMs: 10,
		rerunAfterBusyTurns: false,
		runner: async (_key, metas) => {
			runs.push(metas.length);
			if (runs.length === 1) await gate;
		},
		timerFn: t.timerFn,
	});
	s.notify('ws', { turn: 1 });
	await pump();
	t.flushOnce(); // Lauf 1 blockiert im Gate
	await pump();
	s.notify('ws', { turn: 2 }); // Sammelpuffer, kein automatischer Rerun
	release();
	await drain(t, s);
	assert.deepEqual(runs, [1]);
	assert.equal(s.hasPending('ws'), true, 'Turn 2 wartet auf den nächsten Auslöser');
	s.notify('ws', { turn: 3 });
	await drain(t, s);
	assert.deepEqual(runs, [1, 2], 'nächster Lauf trägt beide gesammelten Turns');
	s.dispose();
});

test('Verschiedene Denkräume laufen unabhängig', async () => {
	const t = fakeTimers();
	const seen = new Set();
	const s = createScheduler({
		debounceMs: 10,
		runner: async (key) => { seen.add(key); },
		timerFn: t.timerFn,
	});
	s.notify('a', {});
	s.notify('b', {});
	await drain(t, s);
	assert.ok(seen.has('a') && seen.has('b'));
	s.dispose();
});

test('dispose räumt Timer und Zustand', async () => {
	const t = fakeTimers();
	let calls = 0;
	const s = createScheduler({ debounceMs: 10, runner: async () => { calls += 1; }, timerFn: t.timerFn });
	s.notify('ws', {});
	s.dispose();
	assert.equal(t.pendingCount(), 0);
	assert.equal(s.notify('ws', {}), 'disposed');
	t.flushOnce();
	await pump();
	assert.equal(calls, 0);
});

test('Runner-Fehler werden enthalten und setzen den Zustand zurück', async () => {
	const t = fakeTimers();
	const logs = [];
	const s = createScheduler({
		debounceMs: 10,
		log: (m) => logs.push(m),
		runner: async () => { throw new Error('boom'); },
		timerFn: t.timerFn,
	});
	s.notify('ws', {});
	await drain(t, s);
	assert.equal(s.isRunning('ws'), false);
	assert.ok(logs.some((l) => l.includes('boom')));
	s.dispose();
});

// ——— Konfiguration ———

test('normalizeConfig: Defaults ohne Row-Config', () => {
	const { config, warnings } = normalizeConfig(undefined);
	assert.equal(config.enabled, DEFAULT_CONFIG.enabled);
	assert.equal(config.providerName, 'spawn');
	assert.deepEqual(config.allowedTools, ['read', 'glob', 'grep']);
	assert.deepEqual(warnings, []);
});

test('normalizeConfig: Werte werden geklemmt und Typen erzwungen', () => {
	const { config } = normalizeConfig({
		debounceMs: -50,
		maxTokens: 9999999,
		maxConcurrentPerWorkspace: 12,
		minPromptChars: '25',
		enabled: 'false',
	});
	assert.equal(config.debounceMs, 0);
	assert.equal(config.maxTokens, 200000);
	assert.equal(config.maxConcurrentPerWorkspace, 4);
	assert.equal(config.minPromptChars, 25);
	assert.equal(config.enabled, false);
});

test('normalizeConfig: Schreibwerkzeuge werden nie an das Kind durchgereicht', () => {
	const { config, warnings } = normalizeConfig({
		allowedTools: ['read', 'write', 'edit'],
	});
	assert.deepEqual(config.allowedTools.filter((t) => t === 'write' || t === 'edit'), []);
	assert.equal(warnings.length, 1);

	const silent = normalizeConfig({ allowedTools: ['read', 'glob'] });
	assert.deepEqual(silent.config.allowedTools, ['read', 'glob']);
	assert.equal(silent.warnings.length, 0);
});
