// pts-teaching-product-editor — host half (Phase 2A + 2C).
//
// Serves the Quill editor HTTP routes AND the Phase-2C collaboration WebSocket
// on the SAME DSH webServer (Variante A: verified `registerUpgrade` seam). All
// route/collab logic lives in routes.mjs + collab-host.mjs; all domain logic in
// the pure pts-teaching-product package. This file is only DSH wiring.

import { createTeachingProductHandler, PREFIX } from './routes.mjs';
import { createCollabWiring, COLLAB_PATH } from './collab-host.mjs';

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

	// idleMs>0: a short idle debounce also settles, on top of explicit settle.
	const collab = createCollabWiring({ resolveRoot, idleMs: 800 });
	const handler = createTeachingProductHandler({ resolveRoot, collab });
	ctx.effect(() => webServer.register({ kind: 'prefix', path: PREFIX, handler }), 'pts-teaching-product-editor:route');

	// The collaboration upgrade shares the host/port. Browser trust is enforced
	// by the DSH `connection` service exactly as the api-gateway does; the actor
	// is assigned server-side (never claimed by the client).
	const connection = ctx.get('connection');
	ctx.effect(() => {
		const off = webServer.registerUpgrade({
			path: COLLAB_PATH,
			handler: (req, socket, head) => {
				const rejection = connection && typeof connection.requestRejection === 'function' ? connection.requestRejection(req) : undefined;
				return collab.handleUpgrade(req, socket, head, { rejection });
			},
		});
		return async () => { off(); await collab.wss.close(); };
	}, 'pts-teaching-product-editor:collab-ws');
}

