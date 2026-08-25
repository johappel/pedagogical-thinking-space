// cdp-debug.mjs — Diagnose: PTS-Seite booten, Konsolenmeldungen und Boot-State auslesen.
import fs from "node:fs";

const PORT = 9222;
const URL_TO_OPEN = process.argv[2] || "http://127.0.0.1:3081/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(p, method = "GET") {
	const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

class CDP {
	constructor(ws) {
		this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
			} else if (msg.method) {
				this.events.push(msg);
			}
		});
	}
	static async connect(wsUrl) {
		const ws = new WebSocket(wsUrl);
		await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
		return new CDP(ws);
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
}

async function evalJs(cdp, expression) {
	const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) return "JS-ERROR: " + JSON.stringify(r.exceptionDetails).slice(0, 500);
	return r.result?.value;
}

const tab = await getJson(`/json/new?${encodeURIComponent(URL_TO_OPEN)}`, "PUT");
await sleep(300);
const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
cdp.ws.addEventListener("message", (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.method === "Runtime.consoleAPICalled") {
		const line = (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
		console.log(`[console.${msg.params.type}] ${line.slice(0, 400)}`);
	}
	if (msg.method === "Runtime.exceptionThrown") {
		console.log(`[exception] ${String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text).slice(0, 400)}`);
	}
});
await cdp.send("Page.navigate", { url: URL_TO_OPEN }).catch(() => {});
await sleep(15000);

const info = await evalJs(cdp, `({
	url: location.href,
	title: document.title,
	bootType: typeof window.__DSH_BOOT__,
	bootEntries: window.__DSH_BOOT__ && Array.isArray(window.__DSH_BOOT__.entries) ? window.__DSH_BOOT__.entries.map(e => e.id || e.name || "?").join(",") : String(window.__DSH_BOOT__).slice(0,200),
	rootHtmlLen: document.body ? document.body.innerHTML.length : -1,
	bodyHead: document.body ? document.body.innerText.slice(0, 300) : null,
	hasPtswRoot: !!document.querySelector(".ptsw-root"),
	hasTextarea: !!document.querySelector("textarea[data-composer-card]"),
})`);
console.log("STATE:", JSON.stringify(info, null, 2));
process.exit(0);
