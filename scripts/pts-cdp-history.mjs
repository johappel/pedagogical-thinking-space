// pts-cdp-history.mjs — from ONE surface, fetch another session's history via
// the gateway RPC and check content visibility. Read-only.
// Usage: node scripts/pts-cdp-history.mjs <cdpPort> <targetUrl> <sessionId> [reload]
import { createRequire } from "node:module";
const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;
const [, , cdpPortArg, urlArg, sessionIdArg, reloadArg] = process.argv;
const cdpPort = Number(cdpPortArg ?? 9223);

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
await send("Page.navigate", { url: urlArg });
await new Promise((r) => setTimeout(r, 11000));

const expr = `(async () => {
  const out = {};
  const sid = ${JSON.stringify(sessionIdArg)};
  const rpc = (method, payload) => fetch("/api/" + method, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload }) }).then((r) => r.json());
  // try the obvious history methods
  for (const m of ["session.history", "session.read"]) {
    try {
      const j = await rpc(m, sid.includes("-") && m === "session.history" ? { sessionId: sid } : { sessionId: sid });
      if (j && j.result) {
        out.method = m;
        out.ok = j.result.ok === true;
        out.rawSample = JSON.stringify(j.result).slice(0, 1200);
        break;
      }
    } catch (e) { out.err = String(e); }
  }
  return out;
})()`;
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify({ url: urlArg, out: r.result?.value?.value ?? r.result?.value }, null, 2));
ws.close();
process.exit(0);
