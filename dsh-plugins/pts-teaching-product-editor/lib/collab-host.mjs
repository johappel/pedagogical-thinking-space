// Phase 2C host wiring — binds the collaboration hub to a real DSH webServer
// (Variante A). Shared by the DSH plugin (index.js) and the real-WebServer
// harness so the browser E2E exercises the exact production path:
//
//   webServer.registerUpgrade({ path, handler(req, socket, head) })
//        │  auth: connection.requestRejection(req)  (browser trust)
//        │  room validation server-side (fail-closed)
//        │  actor assigned by the SERVER, never claimed by the client
//        ▼
//   WebSocketServer(noServer).handleUpgrade → hub.join
//
// A worker/companion edits the SAME Y.Doc programmatically (no browser) through
// applyWorkerEdit — the central Phase-2C proof.

import { WebSocketServer } from 'ws';
import { createCollabHub } from './collab.mjs';
import { loadProduct, saveCollaborativeEdit } from '../../../plugins/pts-teaching-product/lib/store.mjs';
import { findBlock } from '../../../plugins/pts-teaching-product/lib/product.mjs';

export const COLLAB_PATH = '/pts-teaching-product/collab';

export function createCollabWiring({ resolveRoot, idleMs = 800, now } = {}) {
	const hub = createCollabHub({ resolveRoot, loadProduct, findBlock, saveCollaborativeEdit, idleMs, now });
	const wss = new WebSocketServer({ noServer: true });

	function targetFromReq(req) {
		const url = new URL(req.url, 'http://localhost');
		return {
			sessionId: url.searchParams.get('session'),
			lessonId: url.searchParams.get('lesson'),
			phaseId: url.searchParams.get('phase'),
			blockId: url.searchParams.get('block'),
		};
	}

	// Fail-closed room authorization: the room must resolve to a real block in
	// the caller's own workspace. A free-form room id alone is never enough.
	async function validateRoom(target) {
		if (!target.sessionId || !target.lessonId || !target.phaseId || !target.blockId) return 'incomplete';
		const root = resolveRoot(target.sessionId);
		if (!root) return 'no-workspace';
		let product;
		try { product = await loadProduct(root); } catch { return 'load-failed'; }
		if (!product) return 'no-product';
		try { findBlock(product, target.lessonId, target.phaseId, target.blockId); } catch { return 'no-block'; }
		return null;
	}

	// `rejection` is the host trust verdict (connection.requestRejection); when
	// set the socket is closed before any protocol negotiation.
	async function handleUpgrade(req, socket, head, { rejection } = {}) {
		if (rejection !== undefined && rejection !== null) return rejectUpgrade(socket, rejection);
		const target = targetFromReq(req);
		const invalid = await validateRoom(target);
		if (invalid) return rejectUpgrade(socket, 404);
		wss.handleUpgrade(req, socket, head, (ws) => {
			// The SERVER assigns the actor for a browser connection; the client
			// cannot claim 'companion' — that role only exists on the worker path.
			const role = 'teacher';
			const adapter = { send: (data) => { try { ws.send(data); } catch { /* closed */ } } };
			hub.join(target, adapter).then((room) => {
				ws.on('message', (data) => {
					let m; try { m = JSON.parse(data.toString()); } catch { return; }
					if (m.type === 'update') hub.applyClientUpdate(room, role, m.update, adapter);
					else if (m.type === 'settle') hub.forceSettle(room).catch(() => {});
				});
				ws.on('close', () => hub.leave(room, adapter));
			}).catch(() => { try { ws.close(); } catch { /* ignore */ } });
		});
	}

	// Programmatic worker edit of a bounded range (Spike §13). Server-side only.
	async function workerReplace(target, { find, replace }) {
		const invalid = await validateRoom(target);
		if (invalid) throw new Error(`worker-edit room invalid: ${invalid}`);
		const room = await hub.ensureRoom(target);
		hub.applyWorkerEdit(room, (ytext) => {
			const s = ytext.toString();
			const idx = s.indexOf(find);
			if (idx < 0) return;
			ytext.delete(idx, find.length);
			ytext.insert(idx, replace);
		});
		return hub.roomFor(target);
	}

	return { hub, wss, handleUpgrade, validateRoom, workerReplace, targetFromReq };
}

export function rejectUpgrade(socket, status) {
	const reason = status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'Forbidden';
	const body = String(reason).toLowerCase();
	socket.end([
		`HTTP/1.1 ${status} ${reason}`,
		'Connection: close',
		'Content-Type: text/plain; charset=utf-8',
		`Content-Length: ${Buffer.byteLength(body)}`,
		'', body,
	].join('\r\n'));
}
