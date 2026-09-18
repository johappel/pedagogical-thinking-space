// Collaboration hub (Phase 2B) — the boundary between the live CRDT state and
// the PTS domain. Yjs is ONLY the synchronisation layer here; this hub owns the
// one rule that keeps the domain authoritative:
//
//   many Yjs updates (keystrokes)  →  ONE controlled PTS commit at "settle".
//
// A room is one collaboratively edited block. The hub holds the authoritative
// merged Y.Doc (for late joiners, settle and persistence), tracks which roles
// contributed since the last commit, and on settle converts the merged text
// through the SAME Phase-2A adapter into a single domain mutation. It never
// writes to the whiteboard, the Denkstand or the LearningMoment domain — only
// the teaching product, through saveCollaborativeEdit.
//
// Transport-agnostic: a socket is any object with `.send(string)`. The harness
// (and, later, a DSH host) wire a WebSocket to `join` / `applyClientUpdate`.

import * as Y from 'yjs';
import { markupToOps, opsToMarkup } from '../../../plugins/pts-teaching-product/lib/markup.mjs';

const b64encode = (u8) => Buffer.from(u8).toString('base64');
const b64decode = (s) => new Uint8Array(Buffer.from(String(s), 'base64'));

export function createCollabHub({ resolveRoot, loadProduct, findBlock, saveCollaborativeEdit, idleMs = 400, now }) {
	const rooms = new Map();
	const keyOf = (t) => `${t.sessionId}::${t.lessonId}::${t.phaseId}::${t.blockId}`;

	async function ensureRoom(target) {
		const key = keyOf(target);
		let room = rooms.get(key);
		if (room) { await room.seedPromise; return room; }
		room = {
			key, target: { ...target }, doc: new Y.Doc(), sockets: new Set(),
			contributors: new Set(), updateCount: 0, revisionCount: 0,
			idleTimer: null, settling: false, lastCommitted: null,
		};
		rooms.set(key, room);
		room.seedPromise = seed(room);
		await room.seedPromise;
		return room;
	}

	// Seed the room's Y.Text ONCE from the domain block, on the server side only.
	// Clients never seed from domain content, so no duplication on join.
	async function seed(room) {
		const product = await loadProduct(resolveRoot(room.target.sessionId));
		if (!product) return;
		let block;
		try { block = findBlock(product, room.target.lessonId, room.target.phaseId, room.target.blockId).block; }
		catch { return; }
		const ytext = room.doc.getText('quill');
		if (ytext.length === 0) ytext.applyDelta(markupToOps(block.content));
	}

	function broadcast(room, message, exceptSocket) {
		const data = JSON.stringify(message);
		for (const socket of room.sockets) {
			if (socket === exceptSocket) continue;
			try { socket.send(data); } catch { /* dropped socket */ }
		}
	}

	async function join(target, socket) {
		const room = await ensureRoom(target);
		room.sockets.add(socket);
		socket.send(JSON.stringify({ type: 'sync', update: b64encode(Y.encodeStateAsUpdate(room.doc)) }));
		return room;
	}

	function leave(room, socket) {
		if (room) room.sockets.delete(socket);
	}

	// A live update from one client: merge, remember the contributor, fan out to
	// the others, and (re)arm the idle settle. This is the "many updates" side.
	function applyClientUpdate(room, role, updateB64, originSocket) {
		Y.applyUpdate(room.doc, b64decode(updateB64), 'remote');
		if (role === 'teacher' || role === 'companion') room.contributors.add(role);
		room.updateCount += 1;
		broadcast(room, { type: 'update', update: updateB64 }, originSocket);
		scheduleSettle(room);
	}

	// A programmatic worker/companion edit of the SAME Y.Doc (Spike §12/§13). No
	// browser, no socket: the worker mutates a bounded range in a 'server' Yjs
	// transaction; the resulting update is broadcast live to every open browser.
	// The contributor is fixed to 'companion' server-side — never client-claimed.
	function applyWorkerEdit(room, mutate) {
		let captured = null;
		const handler = (update, origin) => { if (origin === 'server') captured = update; };
		room.doc.on('update', handler);
		try { room.doc.transact(() => mutate(room.doc.getText('quill'), Y), 'server'); }
		finally { room.doc.off('update', handler); }
		room.contributors.add('companion');
		room.updateCount += 1;
		if (captured) broadcast(room, { type: 'update', update: b64encode(captured) }, null);
		scheduleSettle(room);
		return { updateCount: room.updateCount };
	}

	function scheduleSettle(room) {
		if (!(idleMs > 0)) return; // 0/negative: only forceSettle drives commits (tests)
		if (room.idleTimer) clearTimeout(room.idleTimer);
		room.idleTimer = setTimeout(() => { settle(room).catch(() => {}); }, idleMs);
	}

	// The "one commit" side: convert the merged CRDT text into a single domain
	// mutation with contributor provenance. Reuses the Phase-2A adapter + store.
	async function settle(room) {
		if (room.settling || room.contributors.size === 0) return null;
		room.settling = true;
		try {
			const content = opsToMarkup(room.doc.getText('quill').toDelta());
			const contributors = [...room.contributors];
			const result = await saveCollaborativeEdit(resolveRoot(room.target.sessionId), {
				lessonId: room.target.lessonId, phaseId: room.target.phaseId, blockId: room.target.blockId,
				content, contributors,
			}, { now });
			room.contributors.clear();
			if (result && result.noop === false) {
				room.revisionCount += 1;
				room.lastCommitted = {
					revision: result.revision.revision,
					contributors,
					classification: result.delta.entries[0] ? result.delta.entries[0].classification : null,
					pedagogicallyRelevant: result.delta.pedagogicallyRelevant,
					at: result.revision.at,
				};
				broadcast(room, { type: 'committed', ...room.lastCommitted });
			}
			return result;
		} catch (err) {
			// A structural conflict the CRDT cannot merge (block/phase deleted or
			// moved): invalidate the room, tell open editors, still fail closed.
			if (err && err.name === 'ProductError' && /^unknown-(block|phase|lesson)$/.test(err.code)) {
				room.invalid = true;
				broadcast(room, { type: 'invalidated', reason: err.code });
			} else if (err && err.name === 'StoreError' && err.code === 'not-found') {
				room.invalid = true;
				broadcast(room, { type: 'invalidated', reason: 'not-found' });
			}
			throw err;
		} finally {
			room.settling = false;
		}
	}

	return {
		ensureRoom,
		join,
		leave,
		applyClientUpdate,
		applyWorkerEdit,
		forceSettle: (room) => settle(room),
		roomFor: (target) => rooms.get(keyOf(target)),
		stats(target) {
			const room = rooms.get(keyOf(target));
			return room ? { updateCount: room.updateCount, revisionCount: room.revisionCount, contributors: [...room.contributors], lastCommitted: room.lastCommitted, invalid: !!room.invalid } : null;
		},
	};
}
