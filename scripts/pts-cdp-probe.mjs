// pts-cdp-probe.mjs — drive a CDP-connected Chromium against a DSH web surface
// and report UI/RPC facts as JSON on stdout. Used by the PTS web-profile spike
// to verify both surfaces empirically. Read-only: it never sends prompts.
//
// Usage: node scripts/pts-cdp-probe.mjs <cdpPort> <targetUrl> [waitMs]
// Requires Chrome started with --remote-debugging-port=<cdpPort>.
import { createRequire } from "node:module";

const wsRequire = createRequire(
	"C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json",
);
const WebSocket = wsRequire("ws").WebSocket;

const [, , cdpPortArg, urlArg, waitArg] = process.argv;
const cdpPort = Number(cdpPortArg ?? 9223);
const url = urlArg ?? "http://127.0.0.1:3081/";
const waitMs = Number(waitArg ?? 8000);

function jsonNew() {
	// Chrome 111+ requires PUT for /json/new.
	const method = "PUT";
	return fetch(`http://127.0.0.1:${cdpPort}/json/new?url=${encodeURIComponent("about:blank")}`, { method }).then((r) => r.json());
}

const target = await jsonNew();
const wsUrl = target.webSocketDebuggerUrl;
if (!wsUrl) {
	console.error(JSON.stringify({ error: "no webSocketDebuggerUrl", target }));
	process.exit(1);
}

const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
const consoleMessages = [];
const pageErrors = [];

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
		if (msg.error) reject(new Error(msg.error.message));
		else resolve(msg.result);
		return;
	}
	if (msg.method === "Runtime.consoleAPICalled") {
		const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
		consoleMessages.push({ type: msg.params.type, text: String(text).slice(0, 500) });
	} else if (msg.method === "Runtime.exceptionThrown") {
		const d = msg.params.exceptionDetails;
		pageErrors.push(String(d.exception?.description ?? d.text ?? "exception").slice(0, 500));
	}
});

await new Promise((resolve, reject) => {
	ws.on("open", resolve);
	ws.on("error", reject);
});

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, waitMs));

const evalBody = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(500);
  const text = document.body ? document.body.innerText : "";
  let list = null, listError = null, listStatus = null;
  try {
    const res = await fetch("/api/session.list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: "session.list", payload: {} }),
    });
    listStatus = res.status;
    const j = await res.json();
    list = j && j.result && j.result.ok ? j.result.value : j;
  } catch (e) { listError = String(e && e.message || e); }
  const slimSessions = (v) => {
    const arr = Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : null;
    return arr === null ? null : arr.map((s) => ({ id: s.sessionId ?? s.id ?? s.sessionId ?? null, title: s.projections?.values?.title ?? s.title ?? null, cwd: s.cwd ?? null, updatedAt: s.updatedAt ?? null }));
  };
  const keys = Object.keys(localStorage);
  return {
    href: location.href,
    title: document.title,
    markers: {
      hasPtsBrandName: text.includes("Pedagogical Thinking Space"),
      hasPtsTitle: document.title.indexOf("PTS") !== -1,
      hasDshLocalBuild: text.includes("DSH Local Build"),
      hasArtifactsTab: text.includes("Artefakte"),
      loaderErrorBanner: /failed to load plugins/i.test(text),
    },
    sessionListStatus: listStatus,
    sessionListError: listError,
    sessions: slimSessions(list),
    localStorageKeyCount: keys.length,
    localStorageDshKeys: keys.filter((k) => k.indexOf("dsh.") === 0).slice(0, 30),
  };
})()`;

let evalResult;
try {
	const r = await send("Runtime.evaluate", {
		expression: evalBody,
		awaitPromise: true,
		returnByValue: true,
	});
	evalResult = r.result?.value?.value ?? r.result?.value;
} catch (e) {
	evalResult = { evalError: String(e.message || e) };
}

const out = {
	url,
	eval: evalResult,
	consoleTail: consoleMessages.slice(-40),
	pageErrors: pageErrors.slice(-10),
};
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
