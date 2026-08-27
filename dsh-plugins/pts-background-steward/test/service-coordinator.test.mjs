// Tests for pts-background-steward/lib/service-coordinator.js — the GENERIC
// registry-driven dispatcher: capability resolution, tool preflight, canonical
// service-request lifecycle with retry, and dedup. Uses a temp Denkraum, the
// real registry, and a stub subagent runtime (no DSH dependency).

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { createServiceCoordinator } from '../lib/service-coordinator.js';
import { CURRICULUM_BRIEF_SCHEMA_VERSION, draftPathFor, proposalPathFor, scopeKey } from '../lib/research-job.js';
import { loadRegistry } from '../lib/registry.js';
import { requestPathFor, readRequestStatus } from '../lib/service-request.js';

const PTS_ROOT = path.resolve(import.meta.dirname, '../../..');

const intent = {
	task: 'verify_curriculum_alignment',
	reason: 'Passt das Thema in Jahrgang 11?',
	authorization: { type: 'implied_bounded_request', evidence: 'm2' },
	scope: { jurisdiction: 'NRW', subject: 'Religionslehre', phase: 'gymnasiale Oberstufe', grade: '11', topic: 'Utopie und Hoffnung', denomination: 'unknown' },
	return_to: 'critical_friend',
};

const researchConfig = { enabled: true, provider: 'p', model: 'm', maxTokens: 4096, runTimeoutMs: 60000, allowedTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch'], source: 'patch-row' };

function briefStructured() {
	return {
		schema: CURRICULUM_BRIEF_SCHEMA_VERSION,
		task: 'verify_curriculum_alignment',
		summary: 'ok',
		findings: [
			{ denomination: 'evangelisch', alignment: 'yes', statement: 'passt', source_ids: ['s1'] },
			{ denomination: 'katholisch', alignment: 'partial', statement: 'teilweise', source_ids: ['s1'] },
		],
		sources: [{ id: 's1', title: 'KLP NRW', publisher: 'MSB NRW', url: 'https://example.gov', official: true, accessed: '2026-08-27', version_date: '2014', validity: 'current', locus: 'Inhaltsfeld 6' }],
		uncertainties: [],
	};
}

function makeStubSubagents(counter, resultFactory = () => ({ stopReason: 'completed', structured: briefStructured() })) {
	return {
		start: async () => {
			counter.count += 1;
			return { id: `child-${counter.count}`, result: Promise.resolve(resultFactory()), dispose: async () => {} };
		},
	};
}

async function tempDenkraum() {
	return fsp.mkdtemp(path.join(os.tmpdir(), 'pts-disp-'));
}

let REG;
async function ctx(dir, overrides = {}) {
	REG = REG || await loadRegistry(PTS_ROOT);
	return { dir, slug: 'testraum', sessionId: 's1', parentAgent: {}, intents: [intent], childSessionIds: new Set(), researchConfig, ptsRoot: PTS_ROOT, registry: REG, ...overrides };
}

const reqKey = (storage) => `${scopeKey(intent)}-${storage}-v2`;

test('ein autorisierter Intent läuft generisch, schreibt kanonischen Request (completed) und einen Draft', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const results = await coordinator.handle(await ctx(dir));
	assert.equal(counter.count, 1);
	assert.equal(results[0].outcome.status, 'completed-research');
	// canonical request under service-requests/, NOT drafts/
	const reqFile = requestPathFor(dir, 'verify_curriculum_alignment', reqKey('draft'));
	const st = await readRequestStatus(reqFile);
	assert.equal(st.status, 'completed');
	assert.ok(await fsp.stat(draftPathFor(dir, intent)).then(() => true, () => false));
});

test('doppelte Turns erzeugen keinen doppelten Auftrag', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	await coordinator.handle(await ctx(dir));
	const second = await coordinator.handle(await ctx(dir));
	assert.equal(counter.count, 1);
	assert.equal(second[0].status, 'deduplicated');
});

test('deaktivierte Recherche hält den Request proposed (kein Anlauf)', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const results = await coordinator.handle(await ctx(dir, { researchConfig: { ...researchConfig, enabled: false } }));
	assert.equal(counter.count, 0);
	assert.equal(results[0].status, 'proposed');
});

test('Tool-Preflight scheitert bei fehlendem web_search und ist wiederholbar (kein done-Marker)', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const badRc = { ...researchConfig, allowedTools: ['read', 'glob', 'grep'] };
	const first = await coordinator.handle(await ctx(dir, { researchConfig: badRc }));
	assert.equal(counter.count, 0);
	assert.equal(first[0].status, 'failed');
	const st = await readRequestStatus(requestPathFor(dir, 'verify_curriculum_alignment', reqKey('draft')));
	assert.equal(st.status, 'failed');
	// Retry with a correct allowlist actually runs (failed did not block).
	const second = await coordinator.handle(await ctx(dir));
	assert.equal(counter.count, 1);
	assert.equal(second[0].outcome.status, 'completed-research');
});

test('ein ungültiger Lauf ist wiederholbar (failed blockiert nicht)', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	// First run: invalid structured result (missing sources) -> status invalid.
	let bad = true;
	const subagents = makeStubSubagents(counter, () => {
		if (bad) { bad = false; return { stopReason: 'completed', structured: { ...briefStructured(), sources: [] } }; }
		return { stopReason: 'completed', structured: briefStructured() };
	});
	const coordinator = createServiceCoordinator({ subagents, jobs: undefined });
	const first = await coordinator.handle(await ctx(dir));
	assert.equal(first[0].outcome.status, 'invalid');
	const st1 = await readRequestStatus(requestPathFor(dir, 'verify_curriculum_alignment', reqKey('draft')));
	assert.equal(st1.status, 'invalid');
	// Retry succeeds.
	const second = await coordinator.handle(await ctx(dir));
	assert.equal(counter.count, 2);
	assert.equal(second[0].outcome.status, 'completed-research');
	const st2 = await readRequestStatus(requestPathFor(dir, 'verify_curriculum_alignment', reqKey('draft')));
	assert.equal(st2.status, 'completed');
});

test('expliziter Speicherauftrag legt ein Knowledge Proposal unter knowledge-proposals/ ab (nicht als Draft)', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const proposalIntent = { ...intent, expected_output: { type: 'knowledge_proposal', location: 'knowledge-proposals/' } };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const results = await coordinator.handle(await ctx(dir, { intents: [proposalIntent] }));
	assert.equal(counter.count, 1);
	assert.equal(results[0].outcome.isProposal, true);
	assert.ok(await fsp.stat(proposalPathFor(dir, proposalIntent)).then(() => true, () => false));
	assert.equal(await fsp.stat(draftPathFor(dir, proposalIntent)).then(() => true, () => false), false);
	const st = await readRequestStatus(requestPathFor(dir, 'verify_curriculum_alignment', reqKey('knowledge_proposal')));
	assert.equal(st.status, 'completed');
});

test('ein vorhandener Draft-Lauf blockiert einen späteren Proposal-Lauf nicht', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	await coordinator.handle(await ctx(dir)); // draft
	const proposalIntent = { ...intent, expected_output: { type: 'knowledge_proposal', location: 'knowledge-proposals/' } };
	const res = await coordinator.handle(await ctx(dir, { intents: [proposalIntent] }));
	assert.equal(counter.count, 2);
	assert.equal(res[0].outcome.status, 'completed-research');
});

test('unbekannte Capability wird nicht dispatcht', async () => {
	const dir = await tempDenkraum();
	const counter = { count: 0 };
	const coordinator = createServiceCoordinator({ subagents: makeStubSubagents(counter), jobs: undefined });
	const res = await coordinator.handle(await ctx(dir, { intents: [{ ...intent, task: 'does_not_exist' }] }));
	assert.equal(counter.count, 0);
	assert.equal(res[0].status, 'no-capability');
});
