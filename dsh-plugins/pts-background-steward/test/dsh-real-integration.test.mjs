// REAL DSH integration test (no credits, no model): exercises the ACTUAL
// installed @deepseek-ai/dsh-tools schema enforcement against our externalized
// capability schema — the exact code path DSH uses to (a) accept a subagent
// `outputSchema` at start (`assertObjectJsonSchema`) and (b) validate the
// child's `structured_output` value (`validateJsonSchemaValue`).
//
// This proves the file-loaded curriculum schema is DSH-acceptable and that a
// valid brief passes / an invalid brief fails DSH's own validator. It is
// skipped (not failed) when the installed DSH runtime is not resolvable, so a
// DSH-less CI stays green.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { promises as fsp } from 'node:fs';

import { loadRegistry, getCapability } from '../lib/registry.js';
import { loadCapabilityArtifacts } from '../lib/capability-loader.js';
import { STEWARDSHIP_RESULT_SCHEMA } from '../lib/patch-validator.js';

const PTS_ROOT = path.resolve(import.meta.dirname, '../../..');

// Candidate locations of the installed DSH package's bin (createRequire base).
const DSH_BIN_CANDIDATES = [
	'C:/nvm4w/nodejs/node_modules/@deepseek-ai/dsh/lib/bin.js',
	process.env.DSH_BIN,
	process.env.DSH_HOME ? `${process.env.DSH_HOME}/lib/bin.js` : undefined,
].filter(Boolean);

async function resolveDshTools() {
	for (const base of DSH_BIN_CANDIDATES) {
		try {
			await fsp.access(base);
			const req = createRequire(base);
			const p = req.resolve('@deepseek-ai/dsh-tools');
			const mod = await import('file://' + p.replace(/\\/g, '/'));
			if (mod && typeof mod.assertObjectJsonSchema === 'function') return mod;
		} catch {
			// try next candidate
		}
	}
	return null;
}

function validBrief() {
	return {
		schema: 'ptspace.curriculum-alignment-brief/v2',
		task: 'verify_curriculum_alignment',
		summary: 'ok',
		findings: [
			{ denomination: 'evangelisch', alignment: 'yes', statement: 'passt', source_ids: ['s1'] },
			{ denomination: 'katholisch', alignment: 'partial', statement: 'teilweise', source_ids: ['s1'] },
		],
		sources: [{ id: 's1', title: 'KLP NRW', publisher: 'MSB NRW', url: 'https://x', official: true, accessed: '2026-08-27', version_date: '2014', validity: 'current', locus: 'IF6' }],
		uncertainties: [],
	};
}

test('REAL DSH: das geladene Capability-Schema wird von assertObjectJsonSchema akzeptiert', async (t) => {
	const dsh = await resolveDshTools();
	if (!dsh) { t.skip('installierte DSH-Runtime nicht auffindbar — realer DSH-Check übersprungen'); return; }
	const reg = await loadRegistry(PTS_ROOT);
	const cap = getCapability(reg, 'verify_curriculum_alignment');
	const art = await loadCapabilityArtifacts(PTS_ROOT, cap);
	// The real DSH enforcement DSH runs on a subagent outputSchema at start.
	assert.doesNotThrow(() => dsh.assertObjectJsonSchema(art.schema));
});

test('REAL DSH: gültiger Brief besteht, ungültiger Brief scheitert an DSHs eigener Wertvalidierung', async (t) => {
	const dsh = await resolveDshTools();
	if (!dsh) { t.skip('installierte DSH-Runtime nicht auffindbar — realer DSH-Check übersprungen'); return; }
	if (typeof dsh.validateJsonSchemaValue !== 'function') { t.skip('validateJsonSchemaValue nicht exportiert'); return; }
	const reg = await loadRegistry(PTS_ROOT);
	const cap = getCapability(reg, 'verify_curriculum_alignment');
	const art = await loadCapabilityArtifacts(PTS_ROOT, cap);

	const okViolations = dsh.validateJsonSchemaValue(art.schema, validBrief());
	assert.equal(Array.isArray(okViolations) ? okViolations.length : 0, 0, `gültiger Brief sollte 0 Verstöße haben: ${JSON.stringify(okViolations)}`);

	// Missing required `sources` -> DSH must report at least one violation.
	const bad = validBrief();
	delete bad.sources;
	const badViolations = dsh.validateJsonSchemaValue(art.schema, bad);
	assert.ok(Array.isArray(badViolations) && badViolations.length > 0, 'ungültiger Brief muss von DSH beanstandet werden');
});

test('REAL DSH: auch die Steward-Ergebnis-Schema wird von assertObjectJsonSchema akzeptiert', async (t) => {
	const dsh = await resolveDshTools();
	if (!dsh) { t.skip('installierte DSH-Runtime nicht auffindbar — realer DSH-Check übersprungen'); return; }
	assert.doesNotThrow(() => dsh.assertObjectJsonSchema(STEWARDSHIP_RESULT_SCHEMA));
});
