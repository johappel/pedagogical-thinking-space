// pts-cdp-drive.mjs — drive ONE scripted interaction against a DSH web surface:
//   1. click the sidebar "New Session" button
//   2. type a prompt into the composer and send it (Enter)
//   3. wait until the model answer appears
//   4. report session ids seen before/after plus final markers
// Usage: node scripts/pts-cdp-drive.mjs <cdpPort> <targetUrl> "<prompt>" [maxWaitMs]
import { createRequire } from "node:module";
const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;
const [, , cdpPortArg, urlArg, promptArg, maxWaitArg] = process.argv;
const cdpPort = Number(cdpPortArg ?? 9223);
const url = urlArg;
const prompt = promptArg ?? "Antworte mit genau einem Wort: OK";
const maxWaitMs = Number(maxWaitArg ?? 120000);

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=${encodeURIComponent("about:blank")}`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
}
ws.on("message", (data) => {
	const msg = JSON.parse(data.toString());
	if (msg.id !== undefined && pending.has(msg.id)) {
		const p = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
	}
});
await new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 9000));

async function evalJs(expression) {
	const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
	return r.result?.value?.value ?? r.result?.value;
}

const listExpr = `(async () => {
  const res = await fetch("/api/session.list", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: "session.list", payload: {} }) });
  const j = await res.json();
  return j && j.result && j.result.ok ? j.result.value.items.map((i) => i.sessionId) : { error: JSON.stringify(j).slice(0, 300) };
})()`;

const before = await evalJs(listExpr);

// 1) New Session
const clickNew = await evalJs(`(() => {
  const btns = [...document.querySelectorAll("button")];
  const b = btns.find((x) => x.innerText.trim() === "New Session");
  if (!b) return { ok: false, reason: "no New Session button" };
  b.click();
  return { ok: true };
})()`);

await new Promise((r) => setTimeout(r, 1500));

// 2) type into composer + Enter
const typed = await evalJs(`(() => {
  const ta = document.querySelector("textarea");
  if (!ta) return { ok: false, reason: "no textarea" };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  setter.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  return { ok: true };
})()`);

// 3) wait for answer marker
const answerWord = (prompt.split(":").pop() ?? "").trim() || "OK";
let answered = false;
let waited = 0;
const step = 3000;
while (waited < maxWaitMs) {
	await new Promise((r) => setTimeout(r, step));
	waited += step;
	const check = await evalJs(`(() => {
	  const t = document.body ? document.body.innerText : "";
	  return { hasAnswer: t.includes(${JSON.stringify(answerWord)}), tail: t.slice(-600) };
	})()`);
	if (check && check.hasAnswer) { answered = true; break; }
}

const after = await evalJs(listExpr);
console.log(JSON.stringify({
	url,
	clickNew, typed,
	promptSent: Boolean(typed && typed.ok),
	answerSeen: answered,
	waitedMs: waited,
	beforeCount: Array.isArray(before) ? before.length : before,
	afterCount: Array.isArray(after) ? after.length : after,
	newSessions: Array.isArray(before) && Array.isArray(after) ? after.filter((id) => !before.includes(id)) : null,
}, null, 2));
ws.close();
process.exit(0);
