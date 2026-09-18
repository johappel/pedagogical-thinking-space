// pts-teaching-product-editor — host half (Phase 2A).
//
// Serves the Quill-based Teaching Product editor. All route logic lives in the
// shared `routes.mjs` (so the browser E2E exercises the same path); all domain
// logic lives in the pure `plugins/pts-teaching-product` package. This file is
// only the DSH wiring: resolve the Denkraum root per session and register the
// prefix route on the web server.

import { createTeachingProductHandler, PREFIX } from './routes.mjs';

export const inject = ['webServer'];

export function apply(ctx) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined) { console.error('[pts-teaching-product-editor] webServer fehlt'); return; }

	function resolveRoot(sessionId) {
		const cwd = ctx.get('sessions')?.get?.(sessionId)?.header?.cwd;
		if (typeof cwd === 'string' && cwd) return cwd;
		const fallback = ctx.get('sandboxPolicy')?.workspaceRoot;
		return typeof fallback === 'string' && fallback ? fallback : process.cwd();
	}

	const handler = createTeachingProductHandler({ resolveRoot });
	const dispose = webServer.register({ kind: 'prefix', path: PREFIX, handler });
	ctx.effect(() => dispose, 'pts-teaching-product-editor:route');
}
