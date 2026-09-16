// pts-cdp-send.mjs — send ONE message into the already-open PTS composer and
// return the assistant's new output. Attaches to an existing CDP page (no new
// tab, no auth injection). Uses Node's global WebSocket + CDP Input domain so a
// contenteditable (ProseMirror/Lexical) composer receives real keystrokes.
//
// Usage: node scripts/pts-cdp-send.mjs <cdpPort> <urlSubstring> <msgFile> [maxWaitMs] [idleMs]
const [, , portArg, urlSub, msgFile, maxWaitArg, idleArg] = process.argv;
const port = Number(portArg ?? 9222);
const needle = urlSub ?? '127.0.0.1:3030';
const maxWaitMs = Number(maxWaitArg ?? 180000);
const idleMs = Number(idleArg ?? 8000);

import { readFileSync } from 'node:fs';
const message = readFileSync(msgFile, 'utf8').replace(/\r?\n$/, '');

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const target = list.find((t) => t.type === 'page' && typeof t.url === 'string' && t.url.includes(needle));
if (!target) { console.log(JSON.stringify({ error: 'no matching page target', needle })); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
	if (msg.id !== undefined && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
});
const evalJs = async (expression) => {
	const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
	return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
await send('Runtime.enable');
await send('Page.enable');

// Baseline transcript text (everything above the composer).
const before = await evalJs(`(document.body ? document.body.innerText : "")`);

// Focus the composer and get its click point.
const point = await evalJs(`(() => {
  const el = document.querySelector('[role="textbox"][contenteditable="true"]') || document.querySelector('[contenteditable="true"]');
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  el.focus();
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
if (!point) { console.log(JSON.stringify({ error: 'composer not found' })); ws.close(); process.exit(3); }

await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
await sleep(150);
await send('Input.insertText', { text: message });
await sleep(250);

const typed = await evalJs(`(() => { const el = document.querySelector('[role="textbox"][contenteditable="true"]'); return el ? el.innerText.slice(0, 120) : ''; })()`);

// Click the send button (fallback: Enter key).
const clicked = await evalJs(`(() => {
  const b = document.querySelector('button[aria-label="Send message"]') || [...document.querySelectorAll('button')].find((x) => /send message/i.test(x.getAttribute('aria-label') || x.innerText || ''));
  if (b) { b.click(); return true; }
  return false;
})()`);
if (!clicked) {
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}

// Poll until the transcript grows and then stops changing for idleMs.
const start = Date.now();
let last = before;
let lastChange = Date.now();
let grew = false;
while (Date.now() - start < maxWaitMs) {
	await sleep(2000);
	const now = await evalJs(`(document.body ? document.body.innerText : "")`);
	if (now !== last) { last = now; lastChange = Date.now(); if (now.length > before.length) grew = true; }
	if (grew && Date.now() - lastChange > idleMs) break;
}

// The new tail = what was appended after the baseline.
let tail = last;
if (last.startsWith(before)) tail = last.slice(before.length);
else { const idx = last.indexOf(message); tail = idx >= 0 ? last.slice(idx) : last.slice(-1500); }

console.log(JSON.stringify({ typedPreview: typed, sentVia: clicked ? 'button' : 'enter', grew, waitedMs: Date.now() - start, tail: tail.slice(-2500) }));
ws.close();
process.exit(0);
