import { randomUUID } from 'node:crypto';

export const PROVIDER_NAME = 'openrouter-batch';
export const MODEL = 'openai/gpt-5.6-luna:batch';
const ENDPOINT = '/v1/chat/completions';
const API_ROOT = 'https://openrouter.ai/api/beta/batches';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired']);
const DEFAULT_POLL_MS = 2000;

function textBlocks(blocks) {
	if (!Array.isArray(blocks)) return '';
	if (blocks.some((block) => !block || block.type !== 'text' || typeof block.text !== 'string')) {
		throw new Error('openrouter-batch accepts text-only prompt blocks');
	}
	return blocks.map((block) => block.text).join('');
}

function diagnostic(value) {
	const message = typeof value === 'string' ? value : value?.message;
	return (message || 'OpenRouter batch failed').replace(/\s+/g, ' ').slice(0, 4096);
}

function schemaRequest(schema) {
	return {
		type: 'json_schema',
		json_schema: { name: 'dsh_subagent_result', strict: true, schema },
	};
}

function validateObservations(value, schema) {
	if (!schema) return value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('structured output is not an object');
	const observations = value.observations;
	if (!Array.isArray(observations) || observations.length !== 3 || observations.some((item) => typeof item !== 'string')) {
		throw new Error('structured output does not satisfy the requested observations schema');
	}
	return value;
}

function responseText(body) {
	const content = body?.choices?.[0]?.message?.content;
	if (typeof content !== 'string') throw new Error('OpenRouter response contained no text content');
	return content;
}

function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		const onAbort = () => { clearTimeout(timer); reject(signal.reason || new Error('aborted')); };
		if (signal.aborted) return onAbort();
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

export class OpenRouterBatchProvider {
	name = PROVIDER_NAME;
	// DSH exposes no separate agentOptions capability flag: the option is part
	// of every SubagentStartRequest and this provider consumes provider/model/
	// maxTokens explicitly below.
	capabilities = { persona: true, toolFilter: false, outputSchema: true, depthLimit: true };
	inheritsParentContext = false;

	constructor({ credentials, fetchImpl = globalThis.fetch, logger = () => {}, pollMs = DEFAULT_POLL_MS, model = MODEL, credentialRef = 'OPENROUTER_API_KEY' }) {
		this.credentials = credentials;
		this.fetch = fetchImpl;
		this.logger = logger;
		this.pollMs = pollMs;
		this.model = model;
		this.credentialRef = credentialRef;
	}

	async apiKey() {
		if (!this.credentials || typeof this.credentials.resolve !== 'function') throw new Error('DSH credential seam unavailable');
		const resolved = await this.credentials.resolve(this.credentialRef);
		if (!resolved?.value) throw new Error(`missing credential: ${this.credentialRef}`);
		return resolved.value;
	}

	async request(url, options, signal) {
		const response = await this.fetch(url, { ...options, signal });
		let body;
		try { body = await response.json(); } catch { body = {}; }
		if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${diagnostic(body?.error || body)}`);
		return body;
	}

	async start(request) {
		if (request.maxDepth !== undefined && request.maxDepth !== 0) throw new Error('openrouter-batch supports maxDepth: 0 only');
		if (request.toolFilter) throw new Error('openrouter-batch does not support toolFilter or tool loops');
		const model = request.agentOptions?.model || this.model;
		if (model !== MODEL) throw new Error(`openrouter-batch spike requires model ${MODEL}`);
		if ((request.agentOptions?.provider || 'openrouter') !== 'openrouter') throw new Error('openrouter-batch requires agentOptions.provider: openrouter');

		const runId = `dsh-${randomUUID()}`;
		const customId = `dsh-subagent-${runId}`;
		const startedAt = new Date().toISOString();
		const localAbort = new AbortController();
		const signal = AbortSignal.any([request.signal, localAbort.signal]);
		const key = await this.apiKey();
		const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
		const messages = [];
		if (request.persona) messages.push({ role: 'system', content: request.persona });
		messages.push({ role: 'user', content: textBlocks(request.prompt) });
		const body = {
			messages,
			max_tokens: request.agentOptions?.maxTokens,
			...(request.outputSchema ? { response_format: schemaRequest(request.outputSchema) } : {}),
		};
		if (body.max_tokens === undefined) delete body.max_tokens;
		const submitted = await this.request(API_ROOT, { method: 'POST', headers, body: JSON.stringify({ endpoint: ENDPOINT, model: MODEL, requests: [{ custom_id: customId, body }] }) }, signal);
		const batchId = submitted.id;
		if (typeof batchId !== 'string' || batchId === '') throw new Error('OpenRouter submit returned no batch id');
		this.logger({ runId, provider: PROVIDER_NAME, batchId, customId, model: MODEL, submittedAt: startedAt });

		const result = this.poll({ runId, batchId, customId, model: MODEL, headers, signal, schema: request.outputSchema, startedAt });
		return {
			id: runId,
			localAgent: undefined,
			result,
			dispose: async () => { localAbort.abort(new Error('run disposed')); await result.catch(() => {}); },
		};
	}

	async poll({ runId, batchId, customId, model, headers, signal, schema, startedAt }) {
		let lastStatus = 'validating';
		try {
			while (true) {
				const current = await this.request(`${API_ROOT}/${encodeURIComponent(batchId)}`, { method: 'GET', headers }, signal);
				lastStatus = current.status;
				if (TERMINAL.has(lastStatus)) {
					const completedAt = new Date().toISOString();
					this.logger({ runId, provider: PROVIDER_NAME, batchId, customId, model, submittedAt: startedAt, completedAt, status: lastStatus });
					if (lastStatus === 'cancelled') return { output: [], stopReason: 'aborted', diagnostic: 'OpenRouter batch cancelled' };
					if (lastStatus !== 'completed') return { output: [], stopReason: 'error', diagnostic: `OpenRouter batch ${lastStatus}` };
					const item = Array.isArray(current.results) ? current.results.find((entry) => entry?.custom_id === customId) : undefined;
					if (!item) return { output: [], stopReason: 'error', diagnostic: 'completed batch did not contain the requested custom_id' };
					if (item.error) return { output: [], stopReason: 'error', diagnostic: diagnostic(item.error) };
					const text = responseText(item.response?.body);
					let structured;
					if (schema) {
						try { structured = validateObservations(JSON.parse(text), schema); } catch (error) { return { output: [{ type: 'text', text }], stopReason: 'error', diagnostic: diagnostic(error) }; }
					}
					return { output: [{ type: 'text', text }], ...(structured === undefined ? {} : { structured }), stopReason: 'completed' };
				}
				await sleep(this.pollMs, signal);
			}
		} catch (error) {
			if (signal.aborted) return { output: [], stopReason: 'aborted', diagnostic: 'OpenRouter batch polling aborted locally' };
			return { output: [], stopReason: 'error', diagnostic: `OpenRouter batch polling failed (${lastStatus}): ${diagnostic(error)}` };
		}
	}
}
