// pts-cdp-meta.mjs — compare one host's projection metadata for one session.
// Usage: node scripts/pts-cdp-meta.mjs <cdpPort> <targetUrl> <sessionId>
import { createRequire } from "node:module";
const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;
const [, , cdpPortArg, urlArg, sessionIdArg] = process.argv;
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
  const res = await fetch("/api/session.list", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: "session.list", payload: {} }) });
  const j = await res.json();
  const items = j.result && j.result.ok ? j.result.value.items : [];
  const mine = items.find((i) => i.sessionId === ${JSON.stringify(sessionIdArg)});
  const slim = (i) => i ? ({ sessionId: i.sessionId, cwd: i.cwd, blank: i.blank, updatedAt: i.updatedAt,
    lastPromptAt: i.projections?.values?.sessionListMetadata?.lastPromptAt ?? null,
    metaBlank: i.projections?.values?.sessionListMetadata?.blank ?? null,
    title: i.projections?.values?.title ?? null }) : null;
  return { total: items.length, mine: slim(mine),
    newest5: items.slice(0, 200).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,5).map((i)=>({ id: i.sessionId, upd: i.updatedAt, cwd: (i.cwd||"").slice(-25) })) };
})()`;
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify({ url: urlArg, out: r.result?.value?.value ?? r.result?.value }, null, 2));
ws.close();
process.exit(0);
