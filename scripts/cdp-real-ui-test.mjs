// cdp-real-ui-test.mjs — Reproduktion mit echten Eingabeereignissen.
//
// Kein element.click(), kein native-Setter-Trick: alle Klicks laufen über
// Input.dispatchMouseEvent (Koordinaten), Texteingabe über fokussierten
// Klick + Input.insertText/keyEvent. Netzwerk (fetch + WebSocket-Frames)
// wird mitgeloggt, um die Kette Ordner+ → Dialog → Host-Route → Adoption
// → Liste → Session sichtbar zu machen.
//
// Verwendung: node scripts/cdp-real-ui-test.mjs ["Test Denkraum"]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 9222;
const PTS_URL = "http://127.0.0.1:3081/";
const NAME = process.argv[2] || "Test Denkraum";
const SLUG = "test-denkraum";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = path.join(REPO, "docs", "experiments", "pts-web-ui-tests");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(p, method = "GET") {
	const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${p}`);
	return res.json();
}

class CDP {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
			} else if (msg.method) {
				this.onEvent?.(msg);
			}
		});
	}
	static async connect(wsUrl) {
		const ws = new WebSocket(wsUrl);
		await new Promise((res, rej) => {
			ws.addEventListener("open", res, { once: true });
			ws.addEventListener("error", rej, { once: true });
		});
		return new CDP(ws);
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
	waitEvent(method, timeoutMs = 20000) {
		return new Promise((resolve, reject) => {
			const t0 = Date.now();
			const iv = setInterval(() => {
				const i = this.buffered.findIndex((e) => e.method === method);
				if (i >= 0) {
					clearInterval(iv);
					resolve(this.buffered.splice(i, 1)[0]);
				} else if (Date.now() - t0 > timeoutMs) {
					clearInterval(iv);
					reject(new Error(`timeout waiting for ${method}`));
				}
			}, 50);
		});
	}
	get buffered() {
		return this._buffered || (this._buffered = []);
	}
}

const cdpLines = [];
function log(line) {
	cdpLines.push(line);
	console.log(line);
}

async function evalJs(expression) {
	const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) throw new Error("JS error: " + JSON.stringify(r.exceptionDetails).slice(0, 500));
	return r.result?.value;
}

/** Zentrum eines Elements als echte Mauskoordinaten holen. */
async function centerOf(selector) {
	return evalJs(`(() => {
		const el = document.querySelector(${JSON.stringify(selector)});
		if (!el) return null;
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) return null;
		return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60) };
	})()`);
}

/** Echter Mausklick über das Input-Domain der DevTools. */
async function realClick(selector, labelForLog) {
	const pos = await centerOf(selector);
	if (!pos) throw new Error(`nicht klickbar (kein Rect): ${selector}`);
	log(`[klick] ${labelForLog || selector} @ (${pos.x}, ${pos.y})`);
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pos.x, y: pos.y, button: "none", pointerType: "mouse" });
	await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" });
	await sleep(60);
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" });
	return pos;
}

/** Echte Texteingabe in das aktuell fokussierte Element. */
async function realType(text) {
	for (const ch of Array.from(text)) {
		await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch, key: ch });
		await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
	}
}

async function shot(name) {
	const r = await cdp.send("Page.captureScreenshot", { format: "png" });
	fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(r.data, "base64"));
	log(`[screenshot] ${name}`);
}

let tab;
let cdp;
async function main() {
	tab = await getJson(`/json/new?${encodeURIComponent(PTS_URL)}`, "PUT");
	await sleep(300);
	cdp = await CDP.connect(tab.webSocketDebuggerUrl);
	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	await cdp.send("Network.enable");
	await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});

	cdp.onEvent = (msg) => {
		if (msg.method === "Network.requestWillBeSent" && msg.params.request.url.includes("/api/pts-workspaces")) {
			log(`[netz] REQUEST ${msg.params.request.method} ${msg.params.request.url} body=${msg.params.request.postData || "-"}`);
		}
		if (msg.method === "Network.responseReceived" && msg.params.response.url.includes("/api/pts-workspaces")) {
			log(`[netz] RESPONSE ${msg.params.response.status} ${msg.params.response.url}`);
		}
		if (msg.method === "Network.webSocketFrameSent") {
			const p = msg.params.response.payloadData || "";
			if (p.includes("workspace.create") || p.includes('"workspace"')) log(`[ws->] ${p.slice(0, 220)}`);
		}
		if (msg.method === "Network.webSocketFrameReceived") {
			const p = msg.params.response.payloadData || "";
			if (p.includes('"workspace"') && (p.includes("oekologie") || p.includes(SLUG))) log(`[ws<-] ${p.slice(0, 260)}`);
		}
		if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
			log(`[console.error] ${(msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
		}
	};

	log("[1] Seite öffnen und booten …");
	await cdp.send("Page.navigate", { url: PTS_URL }).catch(() => {});
	await cdp.waitEvent("Page.loadEventFired", 30000).catch(() => {});
	// Immer die AKTUELLEN Plugin-Dateien testen (Cache-Buster ist Boot-gebunden).
	await cdp.send("Page.reload", { ignoreCache: true }).catch(() => {});
	await cdp.waitEvent("Page.loadEventFired", 30000).catch(() => {});
	const t0 = Date.now();
	while (Date.now() - t0 < 30000) {
		const ready = await evalJs(`!!document.querySelector(".ptsw-root")`).catch(() => false);
		if (ready) break;
		await sleep(400);
	}
	await sleep(2500); // Boot-Guard etc.
	await shot("repro-1-start.png");
	const startState = await evalJs(`({ arbeitsraeume: document.body.innerText.includes("Arbeitsräume"), addBtn: !!document.querySelector('.ptsw-header button[aria-label="Neuen Denkraum anlegen"]'), rowsVorab: [...document.querySelectorAll('.ptsw-wsrow .ptsw-wstitle')].map((e) => e.textContent.trim()), emptyHint: (document.querySelector('.ptsw-note')||{textContent:null}).textContent })`);
	log("[1] Zustand: " + JSON.stringify(startState));
	if (!startState.addBtn) throw new Error("Ordner-+-Button nicht gefunden");

	log("[2] Ordner+ klicken (echter Klick) …");
	await realClick('.ptsw-header button[aria-label="Neuen Denkraum anlegen"]', "Ordner+");
	await sleep(600);
	const dlg = await evalJs(`(() => ({ open: !!document.querySelector("input.ptsw-input"), placeholder: (document.querySelector("input.ptsw-input")||{}).placeholder || null }))()`);
	log(`[2] Dialog: ${JSON.stringify(dlg)}`);
	if (!dlg.open) throw new Error("Dialog nicht erschienen");
	await shot("repro-2-dialog.png");

	log("[3] Namen eintippen (echte Tastatur) …");
	await realClick("input.ptsw-input", "Namensfeld");
	await sleep(200);
	await realType(NAME);
	await sleep(400);
	const typed = await evalJs(`document.querySelector("input.ptsw-input").value`);
	log(`[3] Eingabefeld enthält: "${typed}"`);
	if (typed !== NAME) throw new Error(`Eingabe kam nicht an: "${typed}"`);
	await shot("repro-3-typed.png");

	log("[4] Anlegen klicken (echter Klick) …");
	await realClick(".ptsw-dialog .ptsw-btn-primary:not([disabled])", "Anlegen");

	log("[5] Auf Kettenschritte warten …");
	let stage = { dialogClosed: false, listedInSidebar: false };
	const t1 = Date.now();
	while (Date.now() - t1 < 20000) {
		stage.dialogClosed = !(await evalJs(`!!document.querySelector("input.ptsw-input")`));
		// Streng: Zeile in der PTS-Arbeitsraumliste (body.innerText würde auch
		// den Hero-Chip matchen — genau die Fehl-Positive aus dem ersten Lauf).
		stage.listedInSidebar = await evalJs(
			`[...document.querySelectorAll('.ptsw-wsrow .ptsw-wstitle')].some((e) => e.textContent.trim() === ${JSON.stringify(NAME)})`);
		if (stage.dialogClosed && stage.listedInSidebar) break;
		await sleep(500);
	}
	log(`[5] Stufen: ${JSON.stringify(stage)} nach ${Date.now() - t1} ms`);
	await sleep(3000); // Session-Anschluss
	const finalState = await evalJs(`({
		listedRows: [...document.querySelectorAll('.ptsw-wsrow .ptsw-wstitle')].map((e) => e.textContent.trim()),
		chipLabel: (document.querySelector('button[aria-label="Denkraum wählen"]')||{textContent:null}).textContent,
		error: (document.querySelector(".ptsw-error")||{textContent:null}).textContent,
		composerPresent: !!document.querySelector("[data-composer-card]"),
		bodyHead: document.body.innerText.slice(0, 700),
	})`);
	log("[6] Endzustand: " + JSON.stringify(finalState, null, 2));
	await shot("repro-4-after-create.png");

	const ok = stage.listedInSidebar && !finalState.error;
	log(ok ? "== UI-Kette bis Listenaktualisierung ERFOLGREICH ==" : "== UI-Kette FEHLGESCHLAGEN ==");

	if (!ok) process.exit(1);

	// ---------------------------------------------------------------
	// Phase [7]: denselben Denkraum über die UI wieder entfernen.
	// Echte Mausbewegung auf die Zeile (Hover macht den Papierkorb-
	// Button sichtbar), echter Klick darauf, Bestätigungsdialog mit
	// der Papierkorb-Variante bestätigen.
	// ---------------------------------------------------------------
	log("[7] Denkraum über UI entfernen …");
	const delPos = await evalJs(`(() => {
		const row = [...document.querySelectorAll(".ptsw-wsrow")].find((r) => (r.querySelector(".ptsw-wstitle")||{textContent:""}).textContent.trim() === ${JSON.stringify(NAME)});
		if (!row) return null;
		row.scrollIntoView({ block: "nearest" });
		const b = row.querySelector(".ptsw-rowdel");
		const r = b.getBoundingClientRect();
		return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), rowY: Math.round(row.getBoundingClientRect().y + row.getBoundingClientRect().height / 2) };
	})()`);
	if (!delPos) throw new Error("Löschen-Button nicht gefunden");
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: delPos.x, y: delPos.rowY, button: "none", pointerType: "mouse" });
	await sleep(250); // :hover -> Button wird sichtbar
	log(`[klick] Entfernen-Button @ (${delPos.x}, ${delPos.y})`);
	await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: delPos.x, y: delPos.y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" });
	await sleep(60);
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: delPos.x, y: delPos.y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" });
	await sleep(600);
	const delDlg = await evalJs(`({ open: [...document.querySelectorAll(".ptsw-dialog h3")].some((h) => h.textContent === "Denkraum entfernen"), pathShown: (document.querySelector(".ptsw-del-path")||{textContent:null}).textContent })`);
	log(`[7] Entfernen-Dialog: ${JSON.stringify(delDlg)}`);
	if (!delDlg.open) throw new Error("Entfernen-Dialog nicht erschienen");
	await shot("repro-5-delete-dialog.png");

	await realClick(".ptsw-dialog .ptsw-btn-danger:not([disabled])", "Entfernen + Papierkorb");
	let gone = false;
	const t2 = Date.now();
	while (Date.now() - t2 < 15000) {
		gone = await evalJs(`![...document.querySelectorAll(".ptsw-wsrow .ptsw-wstitle")].some((e) => e.textContent.trim() === ${JSON.stringify(NAME)})`);
		if (gone) break;
		await sleep(400);
	}
	await sleep(2500);
	const afterDel = await evalJs(`({
		rowsLeft: [...document.querySelectorAll('.ptsw-wsrow .ptsw-wstitle')].map((e) => e.textContent.trim()),
		dialogClosed: ![...document.querySelectorAll('.ptsw-dialog h3')].some((h) => h.textContent === 'Denkraum entfernen'),
		error: (document.querySelector('.ptsw-error')||{textContent:null}).textContent,
		backToStart: document.body.innerText.includes('Denkraum wählen') || document.body.innerText.includes('Wähle einen Denkraum'),
		bodyHead: document.body.innerText.slice(0, 500),
	})`);
	log("[8] Nach Entfernen: " + JSON.stringify(afterDel, null, 2));
	await shot("repro-6-after-delete.png");

	const okAll = gone && afterDel.dialogClosed && !afterDel.error;
	log(okAll ? "== ENTFERNEN-KETTE ERFOLGREICH ==" : "== ENTFERNEN-KETTE FEHLGESCHLAGEN ==");
	process.exit(okAll ? 0 : 1);
}

main().catch((err) => {
	console.error("REPRO fehlgeschlagen:", err.message);
	process.exit(2);
});
