// pts-cdp-e2e.mjs — one-shot live E2E: open a session by sidebar title, send a
// directive into the contenteditable composer, wait for the turn to settle, and
// report the transcript tail plus whether pts_denkstand / Übersicht appear.
// Usage: node scripts/pts-cdp-e2e.mjs <cdpPort> <tokenUrl> "<sessionTitle>" "<prompt>" [maxWaitMs]
import { createRequire } from 'node:module';
const wsRequire = createRequire('C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json');
const WebSocket = wsRequire('ws').WebSocket;

const [, , portArg, urlArg, titleArg, promptArg, maxWaitArg] = process.argv;
const port = Number(portArg ?? 9222);
const url = urlArg;
const title = titleArg ?? '';
const prompt = promptArg ?? '';
const maxWaitMs = Number(maxWaitArg ?? 180000);

const target = await fetch(`http://127.0.0.1:${port}/json/new?url=${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (data) => {
	const msg = JSON.parse(data.toString());
	if (msg.id !== undefined && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
});
const evalJs = async (expression) => {
	const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
	return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(11000);

// Open the session: click the deepest element whose text matches the title.
const opened = await evalJs(`(() => {
  const needle = ${JSON.stringify(title)};
  let el = null;
  for (const node of document.querySelectorAll('*')) {
    if (node.children.length === 0 && node.innerText && node.innerText.trim().includes(needle)) { el = node; break; }
  }
  if (!el) return { ok: false, reason: 'title not found' };
  const clickable = el.closest('button,[role="button"],a,li,[role="option"]') || el;
  clickable.click();
  return { ok: true, tag: clickable.tagName };
})()`);
await sleep(6000);

// Find + focus the composer (contenteditable or textarea), return click point.
const point = await evalJs(`(() => {
  const el = document.querySelector('[role="textbox"][contenteditable="true"]') || document.querySelector('[contenteditable="true"]') || document.querySelector('[data-composer-card] textarea') || document.querySelector('textarea');
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  el.focus();
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName, ce: el.getAttribute('contenteditable') };
})()`);
if (!point) { console.log(JSON.stringify({ opened, error: 'composer not found' })); ws.close(); process.exit(3); }

const before = await evalJs('(document.body ? document.body.innerText : "")');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
await sleep(150);
await send('Input.insertText', { text: prompt });
await sleep(300);
const typed = await evalJs(`(() => { const el = document.querySelector('[role="textbox"][contenteditable="true"]') || document.querySelector('textarea'); return el ? (el.innerText || el.value || '').slice(0, 140) : ''; })()`);

const clicked = await evalJs(`(() => {
  const b = document.querySelector('button[aria-label="Send message"]') || [...document.querySelectorAll('button')].find((x) => /send message|senden/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.innerText || '')));
  if (b) { b.click(); return true; }
  return false;
})()`);
if (!clicked) {
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}

const start = Date.now();
let last = before; let lastChange = Date.now(); let grew = false;
while (Date.now() - start < maxWaitMs) {
	await sleep(2500);
	const now = await evalJs('(document.body ? document.body.innerText : "")');
	if (now !== last) { last = now; lastChange = Date.now(); if (now.length > before.length) grew = true; }
	if (grew && Date.now() - lastChange > 9000) break;
}
let tail = last.startsWith(before) ? last.slice(before.length) : last.slice(-3000);
const lower = last.toLowerCase();
console.log(JSON.stringify({
	opened, composer: { tag: point.tag, ce: point.ce }, typedPreview: typed, sentVia: clicked ? 'button' : 'enter', grew, waitedMs: Date.now() - start,
	mentionsDenkstand: lower.includes('pts_denkstand') || lower.includes('denkstand'),
	mentionsUebersicht: lower.includes('übersicht') || lower.includes('uebersicht'),
	tail: tail.slice(-3000),
}, null, 2));
ws.close();
process.exit(0);
