// pts-cdp-attach.mjs — attach to an ALREADY OPEN CDP page (no new tab, no auth
// injection) and evaluate a JS expression read from a file. Prints the JSON
// result. Uses Node's global WebSocket (Node >= 22).
//
// Usage: node scripts/pts-cdp-attach.mjs <cdpPort> <urlSubstring> <exprFile> [awaitMs]
//   <exprFile> must contain a single JS expression (an async IIFE is fine).
const [, , portArg, urlSub, exprFile, awaitMsArg] = process.argv;
const port = Number(portArg ?? 9222);
const needle = urlSub ?? '127.0.0.1:3030';
const awaitMs = Number(awaitMsArg ?? 0);

import { readFileSync } from 'node:fs';
const expression = readFileSync(exprFile, 'utf8');

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const target = list.find((t) => t.type === 'page' && typeof t.url === 'string' && t.url.includes(needle));
if (!target) { console.log(JSON.stringify({ error: 'no matching page target', needle, targets: list.map((t) => ({ type: t.type, url: t.url })) })); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
}
ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
	if (msg.id !== undefined && pending.has(msg.id)) {
		const p = pending.get(msg.id);
		pending.delete(msg.id);
		if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
	}
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
await send('Runtime.enable');
if (awaitMs > 0) await new Promise((r) => setTimeout(r, awaitMs));
try {
	const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) console.log(JSON.stringify({ error: 'eval-exception', detail: String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) }));
	else console.log(JSON.stringify(r.result?.value ?? null));
} catch (e) {
	console.log(JSON.stringify({ error: String(e?.message ?? e) }));
}
ws.close();
process.exit(0);
