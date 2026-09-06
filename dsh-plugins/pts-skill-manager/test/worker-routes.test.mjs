// Tests for the shared worker-routes module: settings-section parser, route
// normalization, effective-route merge and the agent.cordis.yml renderer
// (including the defaults drift guard via round-trip against the canonical
// preset file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	ROUTE_WORKERS,
	ROUTE_FIELDS,
	WORKER_ROUTES_DEFAULTS,
	parseWorkerRoutesSection,
	normalizeWorkerRoutes,
	effectiveRoute,
	renderWorkerRoutes,
	idForSlug,
	slugForId,
} from '../../../dsh-presets/pts-companion/worker-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL = path.join(__dirname, '..', '..', '..', 'dsh-presets', 'pts-companion', 'agent.cordis.yml');

function extractAgentOptions(text, workerId) {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((l) => new RegExp(`^\\s*- id: ${workerId}\\s*$`).test(l));
	assert.notEqual(start, -1, `worker ${workerId} present`);
	let ao = -1;
	for (let i = start + 1; i < lines.length; i += 1) {
		if (/^\s*- id:/.test(lines[i])) break;
		if (/^\S/.test(lines[i])) break;
		if (/^\s*agentOptions:\s*$/.test(lines[i])) { ao = i; break; }
	}
	assert.notEqual(ao, -1, `agentOptions for ${workerId} present`);
	const aoIndent = (lines[ao].match(/^[ \t]*/) || [''])[0].length;
	const out = {};
	for (let i = ao + 1; i < lines.length; i += 1) {
		const l = lines[i];
		if (l.trim() === '') continue;
		const indent = (l.match(/^[ \t]*/) || [''])[0].length;
		if (indent <= aoIndent) break;
		const m = /^\s*([a-zA-Z]+):\s*(.*)$/.exec(l);
		if (m) out[m[1]] = m[2].trim();
	}
	return out;
}

test('worker/slug mapping is bidirectional and complete', () => {
	assert.equal(ROUTE_WORKERS.length, 7);
	for (const { slug, id } of ROUTE_WORKERS) {
		assert.equal(idForSlug(slug), id);
		assert.equal(slugForId(id), slug);
	}
	assert.equal(ROUTE_FIELDS.join(','), 'provider,model,maxTokens,reasoningEffort');
});

test('parseWorkerRoutesSection handles block style', () => {
	const text = [
		'pts-worker-routes:',
		'  research:',
		'    provider: openrouter',
		'    model: deepseek/deepseek-v4-flash',
		'    maxTokens: 16000',
		'  review:',
		'    model: some/other-model',
		'    maxTokens: 12000',
		'    reasoningEffort: high',
	].join('\n');
	const parsed = parseWorkerRoutesSection(text);
	assert.deepEqual(parsed.research, { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 16000 });
	assert.deepEqual(parsed.review, { model: 'some/other-model', maxTokens: 12000, reasoningEffort: 'high' });
});

test('parseWorkerRoutesSection ignores unknown slugs/fields and comments', () => {
	const text = [
		'pts-worker-routes:',
		'  research:',
		'    model: deepseek/deepseek-v4-flash # inline comment',
		'    bogus: nope',
		'  unknown:',
		'    model: x',
	].join('\n');
	const parsed = parseWorkerRoutesSection(text);
	assert.deepEqual(parsed, { research: { model: 'deepseek/deepseek-v4-flash' } });
});

test('parseWorkerRoutesSection returns null when absent', () => {
	assert.equal(parseWorkerRoutesSection('pts-worker-skills:\n  research: [x]\n'), null);
	assert.equal(parseWorkerRoutesSection(null), null);
});

test('normalizeWorkerRoutes types and drops invalid entries', () => {
	const normalized = normalizeWorkerRoutes({
		research: { provider: 'openrouter', model: 'm', maxTokens: '16000', reasoningEffort: ' high ' },
		review: { maxTokens: -5, model: '' },
		unknown: { model: 'x' },
	});
	assert.deepEqual(normalized.research, { provider: 'openrouter', model: 'm', maxTokens: 16000, reasoningEffort: 'high' });
	assert.deepEqual(normalized.review, {});
	assert.equal(normalized.unknown, undefined);
	for (const { slug } of ROUTE_WORKERS) assert.ok(slug in normalized, `slug ${slug} present`);
});

test('effectiveRoute merges defaults and clears removed reasoningEffort', () => {
	assert.deepEqual(effectiveRoute('pts-review', {}), { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 12000 });
	assert.deepEqual(effectiveRoute('pts-review', { model: 'x', reasoningEffort: 'high' }), {
		provider: 'openrouter', model: 'x', maxTokens: 12000, reasoningEffort: 'high',
	});
	assert.equal(effectiveRoute('pts-documentarian', {}).maxTokens, 12000);
	assert.equal(effectiveRoute('pts-research', {}).maxTokens, 16000);
});

test('renderWorkerRoutes round-trips the canonical file with no overrides (drift guard)', async () => {
	const canonical = await fsp.readFile(CANONICAL, 'utf8');
	assert.equal(renderWorkerRoutes(canonical, {}), canonical);
});

test('renderWorkerRoutes applies and reverts overrides without stickiness', async () => {
	const canonical = await fsp.readFile(CANONICAL, 'utf8');

	const applied = renderWorkerRoutes(canonical, { 'pts-review': { model: 'some/other-model', maxTokens: 999, reasoningEffort: 'high' } });
	const review = extractAgentOptions(applied, 'pts-review');
	assert.equal(review.model, 'some/other-model');
	assert.equal(review.maxTokens, '999');
	assert.equal(review.reasoningEffort, 'high');
	assert.equal(review.provider, 'openrouter');
	// untouched worker keeps its canonical values
	const research = extractAgentOptions(applied, 'pts-research');
	assert.equal(research.model, 'deepseek/deepseek-v4-flash');
	assert.equal(research.maxTokens, '16000');
	assert.equal(research.reasoningEffort, undefined);

	// removing every override restores the exact canonical document
	assert.equal(renderWorkerRoutes(applied, {}), canonical);
});

test('WORKER_ROUTES_DEFAULTS covers every tunable worker', () => {
	for (const { id } of ROUTE_WORKERS) {
		assert.ok(WORKER_ROUTES_DEFAULTS[id], `defaults for ${id}`);
		assert.equal(typeof WORKER_ROUTES_DEFAULTS[id].provider, 'string');
		assert.equal(typeof WORKER_ROUTES_DEFAULTS[id].model, 'string');
		assert.equal(typeof WORKER_ROUTES_DEFAULTS[id].maxTokens, 'number');
	}
});
