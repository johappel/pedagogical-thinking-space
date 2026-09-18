// Phase 2B browser harness — two real browser clients over a real WebSocket to
// the real collaboration hub + store. Mounts: the vendored Quill + yjs-quill
// bundle, the real collab-client.js, and a WS relay wired to createCollabHub.
// A temp Denkraum holds a seeded demo product; one block is the collab target.
//
// idleMs is 0: only the explicit "settle" button commits, so the browser test
// can assert deterministically that many live updates yield exactly one PTS
// revision. (The idle-debounce trigger is available in production; see collab.mjs.)

import http from 'node:http';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { createCollabHub } from '../../dsh-plugins/pts-teaching-product-editor/lib/collab.mjs';
import { buildDemoProduct } from '../../plugins/pts-teaching-product/lib/demo.mjs';
import { saveProduct, loadProduct, saveCollaborativeEdit } from '../../plugins/pts-teaching-product/lib/store.mjs';
import { findBlock } from '../../plugins/pts-teaching-product/lib/product.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const pluginDir = path.join(repoRoot, 'dsh-plugins', 'pts-teaching-product-editor');

const STATIC = {
	'/vendor/quill.js': { file: path.join(pluginDir, 'vendor', 'quill.js'), type: 'text/javascript; charset=utf-8' },
	'/vendor/quill.snow.css': { file: path.join(pluginDir, 'vendor', 'quill.snow.css'), type: 'text/css; charset=utf-8' },
	'/vendor/yjs-quill.bundle.js': { file: path.join(pluginDir, 'vendor', 'yjs-quill.bundle.js'), type: 'text/javascript; charset=utf-8' },
	'/collab-client.js': { file: path.join(pluginDir, 'lib', 'collab-client.js'), type: 'text/javascript; charset=utf-8' },
};

function page(target, role) {
	const cfg = JSON.stringify({ sessionId: target.sessionId, lessonId: target.lessonId, phaseId: target.phaseId, blockId: target.blockId, role, wsPath: '/collab' });
	return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Collab ${role}</title>
<link rel="stylesheet" href="/vendor/quill.snow.css">
<style>body{font:14px system-ui;margin:0;padding:12px}#bar{display:flex;gap:10px;align-items:center;margin:8px 0}#editor{min-height:160px;border:1px solid #ccc}#log{font:12px ui-monospace,monospace;opacity:.8;margin-top:8px}</style></head>
<body>
<div><b>Rolle:</b> <span id="role">${role}</span></div>
<div id="editor"></div>
<div id="bar"><button id="settle">Commit (settle)</button></div>
<div id="log">noch kein Commit</div>
<script>window.__COLLAB__=${cfg};</script>
<script src="/vendor/quill.js"></script>
<script src="/vendor/yjs-quill.bundle.js"></script>
<script src="/collab-client.js"></script>
</body></html>`;
}

export async function startCollabHarness({ content = 'Gott antwortet auf Fragen.' } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-collab-e2e-'));
	const product = buildDemoProduct();
	const lesson = product.series.lessons[0];
	const phase = lesson.phases[1];
	const block = phase.blocks[0];
	block.content = content;
	await saveProduct(root, product);

	const target = { sessionId: 'harness', lessonId: lesson.id, phaseId: phase.id, blockId: block.id };
	const hub = createCollabHub({ resolveRoot: () => root, loadProduct, findBlock, saveCollaborativeEdit, idleMs: 0 });

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, 'http://localhost');
			if (req.method === 'GET' && url.pathname === '/') {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(page(target, url.searchParams.get('role') === 'companion' ? 'companion' : 'teacher'));
				return;
			}
			const asset = STATIC[url.pathname];
			if (req.method === 'GET' && asset) {
				res.writeHead(200, { 'Content-Type': asset.type });
				res.end(await fs.readFile(asset.file));
				return;
			}
			if (req.method === 'GET' && url.pathname === '/stats') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(hub.stats(target) || {}));
				return;
			}
			if (req.method === 'GET' && url.pathname === '/product') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(await loadProduct(root)));
				return;
			}
			res.writeHead(404); res.end('not found');
		} catch (err) { res.writeHead(500); res.end(String((err && err.message) || err)); }
	});

	const wss = new WebSocketServer({ noServer: true });
	server.on('upgrade', (req, socket, head) => {
		const url = new URL(req.url, 'http://localhost');
		if (url.pathname !== '/collab') { socket.destroy(); return; }
		wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
	});
	wss.on('connection', async (ws, req) => {
		const url = new URL(req.url, 'http://localhost');
		const wsTarget = {
			sessionId: url.searchParams.get('session'),
			lessonId: url.searchParams.get('lesson'),
			phaseId: url.searchParams.get('phase'),
			blockId: url.searchParams.get('block'),
		};
		const adapter = { send: (data) => { try { ws.send(data); } catch { /* closed */ } } };
		const room = await hub.join(wsTarget, adapter);
		ws.on('message', (data) => {
			let m; try { m = JSON.parse(data.toString()); } catch { return; }
			if (m.type === 'update') hub.applyClientUpdate(room, m.role, m.update, adapter);
			else if (m.type === 'settle') hub.forceSettle(room).catch(() => {});
		});
		ws.on('close', () => hub.leave(room, adapter));
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return {
		url: `http://127.0.0.1:${port}/`,
		root,
		target,
		close: () => new Promise((resolve) => { wss.close(); server.close(resolve); }),
	};
}
