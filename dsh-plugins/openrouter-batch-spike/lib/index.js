import { OpenRouterBatchProvider, PROVIDER_NAME, MODEL } from './provider.js';

export const name = 'dsh-plugin-openrouter-batch-spike';
export const inject = ['subagents', 'credentials'];
export const Config = {};

export function apply(ctx, config = {}) {
	const provider = new OpenRouterBatchProvider({
		credentials: ctx.credentials,
		pollMs: config.pollMs,
		credentialRef: config.credentialRef || 'OPENROUTER_API_KEY',
		model: MODEL,
		logger: (event) => console.log(`[${PROVIDER_NAME}] ${JSON.stringify(event)}`),
	});
	return ctx.subagents.registerProvider(provider);
}

export { OpenRouterBatchProvider, PROVIDER_NAME, MODEL };
