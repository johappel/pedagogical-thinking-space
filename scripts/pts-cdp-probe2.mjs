// pts-cdp-probe2.mjs — deeper boot diagnostics for one DSH web surface.
// Usage: node scripts/pts-cdp-probe2.mjs <cdpPort> <targetUrl> [waitMs]
import { createRequire } from "node:module";

const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;

const [, , cdpPortArg, urlArg, waitArg] = process.argv;
const cdpPort = Number(cdpPortArg ?? 9223);
const url = urlArg ?? "http://127.0.0.1:3081/";
const waitMs = Number(waitArg ?? 15000);

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
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
	} else if (msg.method === "Runtime.bindingCalled") {
		logs.push({ src: "binding", text: String(msg.params.payload).slice(0, 200) });
	}
});
await new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Page.navigate", { url });

// Title timeline
const titleTimeline = [];
for (let i = 0; i < Math.ceil(waitMs / 2000); i++) {
	await new Promise((r) => setTimeout(r, 2000));
	const r = await send("Runtime.evaluate", { expression: "document.title + '||' + (document.body ? document.body.innerHTML.length : -1)", returnByValue: true });
	titleTimeline.push(r.result.value);
}

const evalBody = `(async () => {
  const out = {};
  out.readyState = document.readyState;
  out.bodyTextSample = (document.body ? document.body.innerText : "").slice(0, 1200);
  out.hasPtsBrandName = document.body ? document.body.innerText.includes("Pedagogical Thinking Space") : false;
  out.hasDshLocalBuild = document.body ? document.body.innerText.includes("DSH Local Build") : false;
  out.hasArtefakte = document.body ? document.body.innerText.includes("Artefakte") : false;
  out.loaderErrorBanner = document.body ? /failed to load plugins/i.test(document.body.innerText) : false;
  out.moduleLoaderType = typeof window.__ModuleLoader__;
  try {
    const boot = window.__DSH_BOOT__;
    out.bootKeys = boot ? (Array.isArray(boot) ? boot.map((b) => b && b.id) : Object.keys(boot)) : null;
    if (boot && Array.isArray(boot)) {
      out.bootPtsEntries = boot.filter((b) => /pts/.test(String(b && b.id))).map((b) => b.id);
    }
  } catch (e) { out.bootErr = String(e); }
  let raw = null, err = null;
  try {
    const res = await fetch("/api/session.list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: "session.list", payload: {} }),
    });
    const j = await res.json();
    raw = JSON.stringify(j).slice(0, 2500);
  } catch (e) { err = String(e && e.message || e); }
  out.sessionListRaw = raw;
  out.sessionListError = err;
  return out;
})()`;

let evalResult;
try {
	const r = await send("Runtime.evaluate", { expression: evalBody, awaitPromise: true, returnByValue: true });
	evalResult = r.result?.value?.value ?? r.result?.value;
} catch (e) {
	evalResult = { evalError: String(e.message || e) };
}

console.log(JSON.stringify({ url, titleTimeline, eval: evalResult, logs: logs.slice(-60) }, null, 2));
ws.close();
process.exit(0);
