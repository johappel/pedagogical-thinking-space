// pts-cdp-probe3.mjs — roster enumeration + wide viewport UI facts.
// Usage: node scripts/pts-cdp-probe3.mjs <cdpPort> <targetUrl> [waitMs]
import { createRequire } from "node:module";
const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;
const [, , cdpPortArg, urlArg, waitArg] = process.argv;
const cdpPort = Number(cdpPortArg ?? 9223);
const url = urlArg ?? "http://127.0.0.1:3081/";
const waitMs = Number(waitArg ?? 9000);

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=${encodeURIComponent("about:blank")}`, { method: "PUT" }).then((r) => r.json());
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
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, waitMs));

const evalBody = `(async () => {
  const out = {};
  try {
    const boot = window.__DSH_BOOT__;
    out.rosterIds = boot && Array.isArray(boot.entries) ? boot.entries.map((e) => e && e.id) : null;
  } catch (e) { out.rosterErr = String(e); }
  const text = document.body ? document.body.innerText : "";
  out.markers = {
    hasPtsBrandName: text.includes("Pedagogical Thinking Space"),
    title: document.title,
    hasDshLocalBuild: text.includes("DSH Local Build"),
    hasArtefakte: text.includes("Artefakte"),
    loaderErrorBanner: /failed to load plugins/i.test(text),
    textStart: text.slice(0, 400),
  };
  return out;
})()`;
let evalResult;
try {
	const r = await send("Runtime.evaluate", { expression: evalBody, awaitPromise: true, returnByValue: true });
	evalResult = r.result?.value?.value ?? r.result?.value;
} catch (e) {
	evalResult = { evalError: String(e.message || e) };
}
console.log(JSON.stringify({ url, eval: evalResult, logs: logs.slice(-40) }, null, 2));
ws.close();
process.exit(0);
