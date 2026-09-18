// Browser E2E harness for the Teaching Product editor (Phase 2A §18/§24).
//
// Mounts the REAL pieces so the browser test proves the real path, not a mock:
//   * the real shared route handler (routes.mjs) against a real store + temp Denkraum
//   * the real vendored Quill build (served by the handler)
//   * the real client.js, driven through a minimal __ModuleLoader__ shim that
//     captures the Body component the plugin registers into the sidebar slot
//   * React/ReactDOM from the workspace node_modules (no CDN)
//
// It deliberately does NOT boot DSH: the DSH profile wiring (junction + patch)
// needs elevation and is a separate, documented install step. Everything the
// spike must prove about Quill + the adapter + conflict handling is exercised here.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTeachingProductHandler, PREFIX } from '../../dsh-plugins/pts-teaching-product-editor/lib/routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const STATIC = {
	'/vendor/react.development.js': { file: path.join(repoRoot, 'node_modules/react/umd/react.development.js'), type: 'text/javascript; charset=utf-8' },
	'/vendor/react-dom.development.js': { file: path.join(repoRoot, 'node_modules/react-dom/umd/react-dom.development.js'), type: 'text/javascript; charset=utf-8' },
	'/client.js': { file: path.join(repoRoot, 'dsh-plugins/pts-teaching-product-editor/lib/client.js'), type: 'text/javascript; charset=utf-8' },
};

const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>PTS Teaching Product Harness</title>
<style>html,body{margin:0;height:100%}#root{height:100vh}</style></head>
<body><div id="root"></div>
<script>window.__ModuleLoader__={load:function(entry){window.__factory=entry.factory;}};</script>
<script src="/vendor/react.development.js"></script>
<script src="/vendor/react-dom.development.js"></script>
<script src="/client.js"></script>
<script>
(function(){
  var React=window.React;
  var require=function(n){return n==='react'?window.React:(n==='react-dom'?window.ReactDOM:undefined);};
  var mod=window.__factory(require);
  var capturedBody=null;
  var slots={inject:function(name,fn){return fn();},register:function(spec,component){if(spec&&spec.name==='sidebar.right.pane.tab'){capturedBody=component;}return function(){};}};
  var ctx={slots:slots,get:function(name){if(name==='sidebarRightTabs')return{register:function(){return function(){};}};if(name==='sidebarRight')return{openTab:function(){}};if(name==='slots')return slots;return undefined;},effect:function(fn){return fn();}};
  mod.apply(ctx);
  if(capturedBody){window.ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(capturedBody,{sessionId:'harness'}));}
  window.__harnessReady=true;
})();
</script>
</body></html>`;

export async function startHarness() {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-tp-e2e-'));
	const handler = createTeachingProductHandler({ resolveRoot: () => root });

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, 'http://localhost');
			if (req.method === 'GET' && url.pathname === '/') {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(PAGE);
				return;
			}
			const asset = STATIC[url.pathname];
			if (req.method === 'GET' && asset) {
				res.writeHead(200, { 'Content-Type': asset.type });
				res.end(await fs.readFile(asset.file));
				return;
			}
			if (url.pathname.startsWith(PREFIX)) {
				await handler(req, res);
				return;
			}
			res.writeHead(404); res.end('not found');
		} catch (err) {
			res.writeHead(500); res.end(String((err && err.message) || err));
		}
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return {
		url: `http://127.0.0.1:${port}/`,
		root,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}
