// Tests for pts-background-steward/lib/service-coordinator.js — deduplication
// and routing of a single authorized knowledge request to the research seam.
// Uses a temp Denkraum and a stub subagent runtime; no DSH dependency.

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { createServiceCoordinator } from '../lib/service-coordinator.js';
import { CURRICULUM_BRIEF_SCHEMA_VERSION, draftPathFor } from '../lib/research-job.js';

const intent = {
	task: 'verify_curriculum_alignment',
	reason: 'Passt das Thema in Jahrgang 11?',
	authorization: { type: 'implied_bounded_request', evidence: 'm2' },
	scope: { jurisdiction: 'NRW', subject: 'Religionslehre', phase: 'gymnasiale Oberstufe', grade: '11', topic: 'Utopie und Hoffnung', denomination: 'unknown' },
	return_to: 'critical_friend',
};

const researchConfig = { enabled: true, provider: 'p', model: 'm', maxTokens: 4096, runTimeoutMs: 60000, allowedTools: ['read', 'web'], source: 'patch-row' };

function briefResult() {
	return {
		stopReason: 'completed',
		structured: {
			schema: CURRICULUM_BRIEF_SCHEMA_VERSION,
			task: 'verify_curriculum_alignment',
			summary: 'ok',
			findings: [{ denomination: 'evangelisch', alignment: 'yes', statement: 'passt' }],
			sources: [{ title: 'KLP NRW', official: true }],
			uncertainties: [],
		},
	};
}

function makeStubSubagents(counter) {
	return {
		start: async () => {
			counter.count += 1;
			return { id: `child-${counter.count}`, result: Promise.resolve(briefResult()), dispose: async () => {} };
		},
	};
}

async function tempDenkraum() {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pts-coord-'));
	return dir;
}

test('ein autorisierter Intent startet genau eine Recherche und schreibt einen Draft', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const results = await coordinator.handle({
		dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, intents: [intent], childSessionIds: new Set(), researchConfig,
	});
	assert.equal(counter.count, 1);
	assert.equal(results[0].outcome.status, 'completed-research');
	assert.ok(await fsp.stat(draftPathFor(dir, intent)).then(() => true, () => false));
});

test('doppelte Turns erzeugen keinen doppelten Auftrag', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	await coordinator.handle({ dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, intents: [intent], childSessionIds: new Set(), researchConfig });
	const second = await coordinator.handle({ dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, intents: [intent], childSessionIds: new Set(), researchConfig });
	assert.equal(counter.count, 1);
	assert.equal(second[0].status, 'deduplicated');
});

test('deaktivierte Recherche hält den Request proposed (kein Anlauf)', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const results = await coordinator.handle({
		dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, intents: [intent], childSessionIds: new Set(),
		researchConfig: { ...researchConfig, enabled: false },
	});
	assert.equal(counter.count, 0);
	assert.equal(results[0].status, 'proposed');
});
