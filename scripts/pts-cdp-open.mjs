// pts-cdp-open.mjs — open a session by sidebar-text match on one surface and
// report whether its history renders. Read-only: never sends prompts.
// Usage: node scripts/pts-cdp-open.mjs <cdpPort> <targetUrl> <matchText> [waitMs]
import { createRequire } from "node:module";
const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;
const [, , cdpPortArg, urlArg, matchArg, waitArg] = process.argv;
const cdpPort = Number(cdpPortArg ?? 9223);
const waitMs = Number(waitArg ?? 8000);
const match = matchArg ?? "Antworte mit genau";

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=${encodeURIComponent(urlArg)}`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
const logs = [];
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
		return;
	}
	if (msg.method === "Runtime.consoleAPICalled") {
		const t = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
		logs.push({ src: "console." + msg.params.type, text: String(t).slice(0, 300) });
	} else if (msg.method === "Log.entryAdded") {
		logs.push({ src: "log." + msg.params.entry.level, text: String(msg.params.entry.text).slice(0, 300) });
	} else if (msg.method === "Runtime.exceptionThrown") {
		const d = msg.params.exceptionDetails;
		logs.push({ src: "exception", text: String(d.exception?.description ?? d.text).slice(0, 400) });
	}
});
await new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: urlArg });
await new Promise((r) => setTimeout(r, Math.max(waitMs + 4000, 11000)));

const evalBody = `(async () => {
  const out = {};
  out.href = location.href;
  out.bodyLen = document.body ? document.body.innerHTML.length : -1;
  out.textStart = (document.body ? document.body.innerText : "").slice(0, 200);
  const needle = ${JSON.stringify(match)};
  let target = null;
  for (const el of document.querySelectorAll("*")) {
    if (el.innerText && el.innerText.includes(needle)) {
      if (!target || target.contains(el)) target = el;
    }
  }
  const items = target ? [target] : [];
  out.candidates = items.length;
  if (items.length > 0) { items[0].click(); }
  await new Promise((r) => setTimeout(r, 4000));
  const t = document.body ? document.body.innerText : "";
  out.openedHistoryContainsPrompt = t.includes(${JSON.stringify(match)});
  out.openedHistoryContainsAnswer = /\\bOK\\b/.test(t.slice(-3000));
  out.loaderErrorBanner = /failed to load plugins/i.test(t);
  return out;
})()`;
let res;
try {
	const r = await send("Runtime.evaluate", { expression: evalBody, awaitPromise: true, returnByValue: true });
	res = r.result?.value?.value ?? r.result?.value;
} catch (e) {
	res = { evalError: String(e.message || e) };
}
console.log(JSON.stringify({ url: urlArg, match, result: res, logs: logs.slice(-20) }, null, 2));
ws.close();
process.exit(0);
