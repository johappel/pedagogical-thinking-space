// Phase 2C REAL host harness — boots the actual DSH `WebServer` class (the same
// code that runs in DSH) via cordis in-process, and mounts the Teaching Product
// editor's HTTP routes + the collaboration WebSocket upgrade on it. This proves
// Variante A (collab over the real webServer, same host/port) without touching
// the running shared instance. Auth `connection.requestRejection` is absent on
// this loopback harness, so upgrades are allowed after server-side room
// validation — exactly the plugin path minus the browser-trust gate.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createTeachingProductHandler, PREFIX } from '../../dsh-plugins/pts-teaching-product-editor/lib/routes.mjs';
import { createCollabWiring, COLLAB_PATH } from '../../dsh-plugins/pts-teaching-product-editor/lib/collab-host.mjs';
import { buildDemoProduct } from '../../plugins/pts-teaching-product/lib/demo.mjs';
import { saveProduct } from '../../plugins/pts-teaching-product/lib/store.mjs';

// The installed DSH nested package root (verified at runtime). Overridable.
const DSH_NM = process.env.DSH_NM || 'C:/nvm4w/nodejs/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai';

const { Context } = await import(pathToFileURL(`${DSH_NM}/cordis/lib/index.js`).href);
const WebServerMod = await import(pathToFileURL(`${DSH_NM}/dsh-host-webserver/lib/index.js`).href);
const WebServer = WebServerMod.default ?? WebServerMod.WebServer;

export async function startDshHostCollabHarness({ content = 'Erster Teil bleibt. Zweiter Teil folgt.' } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-2c-'));
	const product = buildDemoProduct();
	const lesson = product.series.lessons[0];
	const phase = lesson.phases[1];
	const block = phase.blocks[0];
	block.content = content;
	await saveProduct(root, product);
	const target = { sessionId: 'harness', lessonId: lesson.id, phaseId: phase.id, blockId: block.id };

	const wiring = createCollabWiring({ resolveRoot: () => root, idleMs: 0 });
	const handler = createTeachingProductHandler({ resolveRoot: () => root, collab: wiring });

	const app = new Context();
	const fiber = app.plugin(WebServer, { host: '127.0.0.1', port: 0 });
	const webServer = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('webServer inject timeout')), 8000);
		app.inject(['webServer'], (ctx) => { clearTimeout(timer); resolve(ctx.webServer); });
	});

	const offHttp = webServer.register({ kind: 'prefix', path: PREFIX, handler });
	// No `connection` service on the harness → rejection undefined → allowed after
	// room validation. In the DSH plugin, connection.requestRejection gates first.
	const offUp = webServer.registerUpgrade({
		path: COLLAB_PATH,
		handler: (req, socket, head) => wiring.handleUpgrade(req, socket, head, {}),
	});

	const origin = `http://127.0.0.1:${webServer.port}`;
	return {
		origin,
		prefix: PREFIX,
		wsUrl: `ws://127.0.0.1:${webServer.port}${COLLAB_PATH}`,
		pageUrl: (role = 'teacher') => `${origin}${PREFIX}/collab-page?session=${encodeURIComponent(target.sessionId)}&lesson=${encodeURIComponent(target.lessonId)}&phase=${encodeURIComponent(target.phaseId)}&block=${encodeURIComponent(target.blockId)}&role=${role}`,
		root,
		target,
		wiring,
		port: webServer.port,
		close: async () => {
			try { offUp(); } catch { /* ignore */ }
			try { offHttp(); } catch { /* ignore */ }
			try { await wiring.wss.close(); } catch { /* ignore */ }
			try { await fiber.dispose(); } catch { /* ignore */ }
		},
	};
}
