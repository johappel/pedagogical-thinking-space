// Browser E2E harness for the Phase 3 flow (Werkstatt → Product Proposal →
// Teaching Product). Like the Phase 2A harness it mounts the REAL pieces — the
// shared route handler against a real store + temp Denkraum, the real vendored
// Quill build, and the real client.js — but it also renders the floating
// "Unterrichtsreihe" opener and wires openTab so the test can drive the whole
// teacher-facing path: opener → Zustand A → develop → proposal → accept →
// editor, plus "Zur Werkstatt" and reload persistence.
//
// It deliberately does NOT boot DSH (the profile wiring needs elevation); the
// openTab/whiteboard seam is stubbed so "Zur Werkstatt" is observable without
// the real whiteboard plugin.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTeachingProductHandler, PREFIX } from '../../dsh-plugins/pts-teaching-product-editor/lib/routes.mjs';
import { createLearningMoment } from '../../plugins/pts-learning-moment-binding/lib/domain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const STATIC = {
	'/vendor/react.development.js': { file: path.join(repoRoot, 'node_modules/react/umd/react.development.js'), type: 'text/javascript; charset=utf-8' },
	'/vendor/react-dom.development.js': { file: path.join(repoRoot, 'node_modules/react-dom/umd/react-dom.development.js'), type: 'text/javascript; charset=utf-8' },
	'/client.js': { file: path.join(repoRoot, 'dsh-plugins/pts-teaching-product-editor/lib/client.js'), type: 'text/javascript; charset=utf-8' },
};

const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>PTS Proposal Harness</title>
<style>html,body{margin:0;height:100%;background:#14161c;color:#eef1f6}#root{height:100vh}#workshop{display:none;position:fixed;inset:0;align-items:center;justify-content:center;font-size:22px;background:#101319}</style></head>
<body>
<div id="root"></div>
<div id="workshop">🧩 Werkstatt (Whiteboard)</div>
<div id="opener"></div>
<script>window.__ModuleLoader__={load:function(entry){window.__factory=entry.factory;}};</script>
<script src="/vendor/react.development.js"></script>
<script src="/vendor/react-dom.development.js"></script>
<script src="/client.js"></script>
<script>
(function(){
  var React=window.React;
  var require=function(n){return n==='react'?window.React:(n==='react-dom'?window.ReactDOM:undefined);};
  var mod=window.__factory(require);
  var captured={body:null,opener:null};
  var slots={inject:function(name,fn){return fn();},register:function(spec,component){
    if(spec&&spec.name==='sidebar.right.pane.tab'){captured.body=component;}
    if(spec&&spec.name==='shell.overlay'){captured.opener=component;}
    return function(){};
  }};
  var bodyRoot=null;
  function mountBody(){
    document.getElementById('workshop').style.display='none';
    document.getElementById('root').style.display='block';
    if(!bodyRoot){bodyRoot=window.ReactDOM.createRoot(document.getElementById('root'));}
    bodyRoot.render(React.createElement(captured.body,{sessionId:'harness'}));
    window.__tabOpen=true;
  }
  function openWorkshop(){
    window.__workshopOpened=true;
    if(bodyRoot){bodyRoot.unmount();bodyRoot=null;}
    document.getElementById('root').style.display='none';
    document.getElementById('workshop').style.display='flex';
  }
  var right={openTab:function(kind){
    if(kind==='whiteboard'){openWorkshop();}
    else{mountBody();}
    return true;
  }};
  var ctx={slots:slots,get:function(name){
    if(name==='sidebarRightTabs')return{register:function(){return function(){};}};
    if(name==='sidebarRight')return right;
    if(name==='slots')return slots;
    return undefined;
  },effect:function(fn){return fn();}};
  mod.apply(ctx);
  window.ReactDOM.createRoot(document.getElementById('opener')).render(React.createElement(captured.opener,{sessionId:'harness'}));
  window.__harnessReady=true;
})();
</script>
</body></html>`;

export async function startProposalHarness() {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-tp-proposal-'));
	// Seed the canonical LearningMoment domain store — the ONE moment source the
	// Produktwerkstatt reads. No learning-landscape.md, no demo fallback.
	const SEED = [
		['lm-01', 'Gottesbild als Denkhebel'],
		['lm-02', 'Zwei Darstellungen vergleichen'],
		['lm-03', 'Eigene Deutung formulieren'],
		['lm-04', 'Grenzen der Bilder erkennen'],
		['lm-05', 'Weiterdenken: eigenes Bild'],
	];
	for (const [domainId, title] of SEED) await createLearningMoment(root, { domainId, title });
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
