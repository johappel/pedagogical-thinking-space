import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterBatchProvider, MODEL, PROVIDER_NAME } from '../lib/provider.js';

const schema = { type: 'object', properties: { observations: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 } }, required: ['observations'], additionalProperties: false };
const request = (extra = {}) => ({ prompt: [{ type: 'text', text: 'Review this sequence.' }], persona: 'You are the PTS batch reviewer.', signal: new AbortController().signal, maxDepth: 0, agentOptions: { provider: 'openrouter', model: MODEL }, ...extra });

function fakeFetch(sequence) {
	const calls = [];
	return { calls, fetch: async (url, options) => {
		calls.push({ url, options, body: options.body && JSON.parse(options.body) });
		const value = typeof sequence[0] === 'function' ? sequence.shift()(calls) : sequence.shift();
		return { ok: true, status: 200, json: async () => value };
	} };
}

test('provider uses native registration shape, batch payload and custom_id correlation', async () => {
	const http = fakeFetch([{ id: 'batch_1' }, (calls) => ({ status: 'completed', results: [{ custom_id: 'other', response: { body: { choices: [{ message: { content: 'wrong' } }] } } }, { custom_id: calls[0].body.requests[0].custom_id, response: { body: { choices: [{ message: { content: 'right' } }] } } }] })]);
	const provider = new OpenRouterBatchProvider({ credentials: { resolve: async () => ({ value: 'secret-not-logged', source: 'test' }) }, fetchImpl: http.fetch, pollMs: 0 });
	const run = await provider.start(request());
	const customId = http.calls[0].body.requests[0].custom_id;
	assert.match(customId, /^dsh-subagent-dsh-/);
	assert.equal(run.id.startsWith('dsh-'), true);
	assert.equal(http.calls[0].body.endpoint, '/v1/chat/completions');
	assert.equal(http.calls[0].body.model, MODEL);
	assert.equal(http.calls[0].body.requests[0].body.messages[0].role, 'system');
	assert.equal(http.calls[0].options.headers.Authorization, 'Bearer secret-not-logged');
	assert.deepEqual((await run.result).output, [{ type: 'text', text: 'right' }]);
});

test('provider returns structured output and maps failed/cancelled/expired', async () => {
	for (const status of ['failed', 'expired', 'cancelled']) {
		const http = fakeFetch([{ id: `batch-${status}` }, { status }]);
		const provider = new OpenRouterBatchProvider({ credentials: { resolve: async () => ({ value: 'x', source: 'test' }) }, fetchImpl: http.fetch, pollMs: 0 });
		const result = await (await provider.start(request({ outputSchema: schema }))).result;
		assert.equal(result.stopReason, status === 'cancelled' ? 'aborted' : 'error');
	}
	const http = fakeFetch([{ id: 'batch-ok' }, (calls) => ({ status: 'completed', results: [{ custom_id: calls[0].body.requests[0].custom_id, response: { body: { choices: [{ message: { content: '{"observations":["one","two","three"]}' } }] } } }] })]);
	const provider = new OpenRouterBatchProvider({ credentials: { resolve: async () => ({ value: 'x', source: 'test' }) }, fetchImpl: http.fetch, pollMs: 0 });
	const run = await provider.start(request({ outputSchema: schema }));
	const customId = http.calls[0].body.requests[0].custom_id;
	// The response is supplied by the endpoint; make the fake result use the submitted id.
	assert.match(customId, /^dsh-subagent-dsh-/);
	const result = await run.result;
	assert.equal(result.stopReason, 'completed');
	assert.deepEqual(result.structured, { observations: ['one', 'two', 'three'] });
});

test('unsupported tool filter, depth and model fail loudly', async () => {
	const provider = new OpenRouterBatchProvider({ credentials: { resolve: async () => ({ value: 'x' }) }, fetchImpl: async () => { throw new Error('must not call network'); } });
	await assert.rejects(() => provider.start(request({ toolFilter: { allow: [] } })), /toolFilter/);
	await assert.rejects(() => provider.start(request({ maxDepth: 1 })), /maxDepth/);
	await assert.rejects(() => provider.start(request({ agentOptions: { provider: 'openrouter', model: 'other' } })), /model/);
});

test('provider is selected through the existing subagent provider key', async () => {
	let registered;
	const ctx = { credentials: { resolve: async () => ({ value: 'x' }) }, subagents: { registerProvider(provider) { registered = provider; return () => {}; } } };
	const { apply } = await import('../lib/index.js');
	apply(ctx);
	assert.equal(registered.name, PROVIDER_NAME);
	assert.equal(registered.capabilities.toolFilter, false);
});
