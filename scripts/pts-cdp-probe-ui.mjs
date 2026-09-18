// pts-cdp-probe-ui.mjs — read-only: open a session by title and report the
// whiteboard action-button labels (verifies the Context Picker rename).
// Usage: node scripts/pts-cdp-probe-ui.mjs <cdpPort> <tokenUrl> "<sessionTitle>"
import { createRequire } from 'node:module';
const wsRequire = createRequire('C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json');
const WebSocket = wsRequire('ws').WebSocket;
const [, , portArg, urlArg, titleArg] = process.argv;
const port = Number(portArg ?? 9222);

const target = await fetch(`http://127.0.0.1:${port}/json/new?url=${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let nextId = 1; const pending = new Map();
const sendCmd = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
const evalJs = async (expression) => { const r = await sendCmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
await sendCmd('Page.enable'); await sendCmd('Runtime.enable');
await sendCmd('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
await sendCmd('Page.navigate', { url: urlArg });
await sleep(11000);
await evalJs(`(() => { const n = ${JSON.stringify(titleArg)}; for (const el of document.querySelectorAll('*')) { if (el.children.length === 0 && el.innerText && el.innerText.trim().includes(n)) { (el.closest('button,[role="button"],a,li,[role="option"]') || el).click(); return true; } } return false; })()`);
await sleep(6000);
const out = await evalJs(`(() => {
  const body = document.body ? document.body.innerText : '';
  const actions = [...document.querySelectorAll('.wb-actions button')].map((b) => b.innerText.trim());
  return {
    wbActions: actions,
    hasPicker: body.includes('Im Gespräch aufgreifen'),
    hasOldButton: body.includes('Dazu fragen'),
    boardVisible: !!document.querySelector('.wb-actions'),
  };
})()`);
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
