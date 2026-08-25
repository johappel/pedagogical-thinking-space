// pts-web-ui-test.mjs — Realtest-Treiber für den PTS Web Spike.
//
// Steuert eine bereits laufende Chrome-Instanz mit CDP (Port 9222, siehe
// /usegoogle-Setup) und fährt die Spike-Tests A, E, B, C und F gegen die
// echte Oberfläche. Test D (Session-cwd) wird separat über die Persistenz
// unter $DSH_HOME/sessions nachgewiesen.
//
// Verwendung:
//   node scripts/pts-web-ui-test.mjs
//
// Ergebnisse: Konsole + Screenshots unter docs/experiments/pts-web-ui-tests/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 9222;
const PTS_URL = "http://127.0.0.1:3081/";
const STD_URL = "http://127.0.0.1:3080/";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = path.join(REPO, "docs", "experiments", "pts-web-ui-tests");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(test, pass, detail) {
	results.push({ test, pass, detail });
	console.log(`${pass ? "PASS" : "FAIL"} ${test}: ${detail}`);
}

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
		this.events = [];
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
			} else if (msg.method) {
				this.events.push(msg.method);
				if (msg.method === "Runtime.consoleAPICalled" && ["error"].includes(msg.params.type)) {
					pageErrors.push(String((msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ")).slice(0, 300));
				}
				if (msg.method === "Runtime.exceptionThrown") {
					pageErrors.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "exception").slice(0, 300));
				}
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
				const i = this.events.findIndex((e) => e === method);
				if (i >= 0) {
					clearInterval(iv);
					resolve(this.events.splice(i, 1)[0]);
				} else if (Date.now() - t0 > timeoutMs) {
					clearInterval(iv);
					reject(new Error(`timeout waiting for ${method}`));
				}
			}, 50);
		});
	}
}

let pageErrors = [];

async function evalJs(cdp, expression) {
	const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) throw new Error("JS error: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
	return r.result?.value;
}

async function shot(cdp, name) {
	const r = await cdp.send("Page.captureScreenshot", { format: "png" });
	const file = path.join(SHOT_DIR, name);
	fs.writeFileSync(file, Buffer.from(r.data, "base64"));
	console.log(`[*] Screenshot: ${file}`);
	return file;
}

async function newTab(url) {
	const tab = await getJson(`/json/new?${encodeURIComponent(url)}`, "PUT");
	await sleep(300);
	const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	await cdp.send("Network.enable").catch(() => {});
	await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
	// Breite Viewport, damit die Sidebar im wide-Modus rendert.
	await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});
	await cdp.send("Page.navigate", { url }).catch(() => {});
	await cdp.waitEvent("Page.loadEventFired", 25000).catch(() => {});
	return { tab, cdp };
}

async function waitFor(cdp, expression, timeoutMs, label) {
	const t0 = Date.now();
	let last = null;
	while (Date.now() - t0 < timeoutMs) {
		try {
			last = await evalJs(cdp, expression);
			if (last) return last;
		} catch {
			// page may still be booting
		}
		await sleep(400);
	}
	throw new Error(`timeout waiting for ${label} (last=${JSON.stringify(last)?.slice(0, 120)})`);
}

const STATE_SNIPPET = `(() => {
	const bodyText = (document.body && document.body.innerText) || "";
	const ta = document.querySelector("[data-composer-card] textarea");
	const chip = document.querySelector('button[aria-label="Denkraum wählen"]');
	const ptsBrowser = !!document.querySelector(".ptsw-root");
	const addBtn = document.querySelector('button[aria-label="Neuen Denkraum anlegen"]');
	const dialogInput = document.querySelector("input.ptsw-input");
	const foreign = ["theme", "headless", "deepseek-harness", "systemisch-sim"]
		.filter((t) => bodyText.includes(t));
	const englishHero = ["Into the Unknown", "Describe what you want to build", "Choose workspace"]
		.filter((t) => bodyText.includes(t) || (ta && ta.placeholder === t));
	return {
		title: document.title,
		hasPtswBrowser: ptsBrowser,
		hasAddButton: !!addBtn,
		hasDialogInput: !!dialogInput,
		dialogPlaceholder: dialogInput ? dialogInput.placeholder : null,
		chipLabel: chip ? chip.textContent.trim() : null,
		composerPlaceholder: ta ? ta.placeholder : null,
		composerDisabled: ta ? ta.disabled : null,
		foreignVisible: foreign,
		englishLeftovers: englishHero,
		headlinePresent: bodyText.includes("Pedagogical Thinking Space"),
		bodyHead: bodyText.slice(0, 600),
	};
})()`;

async function main() {
	console.log("=== PTS Web UI Realtests ===");

	// ---------------- Tests A + E (fresh origin state, empty start) ----------
	const a = await newTab(PTS_URL);
	pageErrors = [];
	record("A/E-boot", true, "Tab geöffnet, Seite geladen");

	// Warten bis die PTS-Browserstruktur oder der Composer da ist.
	await waitFor(a.cdp, `!!document.querySelector(".ptsw-root") || !!document.querySelector("[data-composer-card]")`, 25000, "PTS-Oberfläche gerendert");
	// Boot-Guard + Sprach-Assertion brauchen einen Moment nach Baseline-Empfang.
	await sleep(4000);

	const stateA = await evalJs(a.cdp, STATE_SNIPPET);
	record("A-sidebar-scope",
		stateA.hasPtswBrowser === true && stateA.foreignVisible.length === 0,
		`ptsw-browser=${stateA.hasPtswBrowser}, fremd sichtbar=[${stateA.foreignVisible.join(", ")}]`);

	record("E-hero-language",
		stateA.composerPlaceholder !== null
			&& !stateA.composerPlaceholder.includes("build")
			&& !stateA.composerPlaceholder.startsWith("Message")
			&& stateA.englishLeftovers.length === 0,
		`placeholder="${stateA.composerPlaceholder}", englisch uebrig=[${stateA.englishLeftovers.join(", ")}], headlinePTS=${stateA.headlinePresent}`);

	const previewGone = await evalJs(a.cdp, `![...document.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Preview' && s.offsetParent !== null)`);
	record("E-preview-badge-hidden", previewGone === true, `Preview-Pill entfernt: ${previewGone}`);

	await shot(a.cdp, "test-A-E-start.png");
	console.log("[*] Startzustand:", JSON.stringify(stateA, null, 2));

	// ---------------- Test B (Ordner+ oeffnet PTS-Dialog) -------------------
	const addBtn = await evalJs(a.cdp, `(() => { const b = document.querySelector('button[aria-label="Neuen Denkraum anlegen"]'); if (!b) return false; b.click(); return true; })()`);
	await sleep(500);
	const stateB = await evalJs(a.cdp, STATE_SNIPPET);
	record("B-create-dialog",
		addBtn === true && stateB.hasDialogInput === true && stateB.dialogPlaceholder === "Name des Denkraums",
		`Dialog offen=${stateB.hasDialogInput}, placeholder="${stateB.dialogPlaceholder}"`);
	await shot(a.cdp, "test-B-dialog.png");

	// ---------------- Test C (Denkraum anlegen) -----------------------------
	// Konfliktfall zuerst: "Test Religion 10" existiert bereits (API-Test).
	const conflictDebug = await evalJs(a.cdp, `(async () => {
		const input = document.querySelector("input.ptsw-input");
		if (!input) return { step: "no-input" };
		const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
		setter.call(input, "Test Religion 10");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 200));
		const valueAfter = input.value;
		const btn = [...document.querySelectorAll(".ptsw-dialog .ptsw-btn-primary")].find((x) => !x.disabled);
		if (!btn) return { step: "no-enabled-button", valueAfter };
		btn.click();
		await new Promise((r) => setTimeout(r, 1200));
		return {
			step: "clicked",
			valueAfter,
			dialogStillOpen: !!document.querySelector("input.ptsw-input"),
			errorText: (document.querySelector(".ptsw-error") || {}).textContent || "",
		};
	})()`);
	console.log("[*] Konflikt-Diagnose:", JSON.stringify(conflictDebug));
	record("C-conflict-feedback",
		typeof conflictDebug === "object" && typeof conflictDebug.errorText === "string" && conflictDebug.errorText.includes("schon"),
		`Konfliktmeldung: "${String(conflictDebug && conflictDebug.errorText || "").slice(0, 140)}"`);
	await shot(a.cdp, "test-C-conflict.png");

	// Erfolgsfall mit neuem Namen.
	const newName = "Klima 8a";
	const createDebug = await evalJs(a.cdp, `(async () => {
		let input = document.querySelector("input.ptsw-input");
		if (!input) return { step: "no-dialog" };
		const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
		setter.call(input, "");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		setter.call(input, ${JSON.stringify(newName)});
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 200));
		const btn = [...document.querySelectorAll(".ptsw-dialog .ptsw-btn-primary")].find((x) => !x.disabled);
		if (!btn) return { step: "no-enabled-button", value: input.value };
		btn.click();
		return { step: "clicked", value: input.value };
	})()`);
	console.log("[*] Create-Diagnose:", JSON.stringify(createDebug));
	// Auf neue Zeile in der Arbeitsraumliste warten (Registry-Frames + Adoption).
	// WICHTIG: strikt innerhalb der PTS-Liste pruefen — body.innerText wuerde
	// auch den Hero-Chip matchen (genau diese Fehl-Positive hat den Spike
	// zunaechst gruen erscheinen lassen).
	let created = false;
	try {
		await waitFor(a.cdp, `(document.querySelector(".ptsw-list")||{innerText:""}).innerText.includes(${JSON.stringify(newName)})`, 15000, "neuer Denkraum in Liste");
		created = true;
	} catch {
		created = false;
	}
	const listText = await evalJs(a.cdp, `(document.querySelector(".ptsw-list")||{innerText:"(keine .ptsw-list)"}).innerText`);
	record("C-create-via-ui", created, `„${newName}" in der Arbeitsraumliste sichtbar: ${created}; Liste="${listText.replace(/\n/g, " | ").slice(0, 160)}"`);
	await sleep(2500); // Session-Anschluss (startSession) laufen lassen
	await shot(a.cdp, "test-C-created.png");

	// ---------------- Test G (Denkraum entfernen / selbstreinigend) ----------
	// Entfernt den eben angelegten Denkraum wieder über die UI (Papierkorb-
	// Variante) und prüft, dass die Zeile sofort aus der Liste verschwindet.
	let gDeleted = false;
	try {
		await waitFor(a.cdp, `(function(){
			const rows = [...document.querySelectorAll(".ptsw-wsrow")];
			return rows.some((r) => (r.querySelector(".ptsw-wstitle")||{textContent:""}).textContent.trim() === ${JSON.stringify(newName)} && !!r.querySelector(".ptsw-rowdel"));
		})()`, 8000, "Löschen-Button sichtbar");
		await evalJs(a.cdp, `(function(){
			const rows = [...document.querySelectorAll(".ptsw-wsrow")];
			const row = rows.find((r) => (r.querySelector(".ptsw-wstitle")||{textContent:""}).textContent.trim() === ${JSON.stringify(newName)});
			row.querySelector(".ptsw-rowdel").click();
			return true;
		})()`);
		await waitFor(a.cdp, `[...document.querySelectorAll(".ptsw-dialog h3")].some((h) => h.textContent === "Denkraum entfernen")`, 5000, "Entfernen-Dialog offen");
		await shot(a.cdp, "test-G-delete-dialog.png");
		await evalJs(a.cdp, `(() => { const b = document.querySelector(".ptsw-dialog .ptsw-btn-danger"); if (!b || b.disabled) return false; b.click(); return true; })()`);
		await waitFor(a.cdp, `![...document.querySelectorAll(".ptsw-wsrow .ptsw-wstitle")].some((e) => e.textContent.trim() === ${JSON.stringify(newName)})`, 15000, "Zeile aus Liste entfernt");
		gDeleted = true;
	} catch {
		gDeleted = false;
	}
	const listAfterDel = await evalJs(a.cdp, `(document.querySelector(".ptsw-list")||{innerText:"(keine .ptsw-list)"}).innerText`);
	record("G-delete-created", gDeleted, `„${newName}" per UI entfernt: ${gDeleted}; Liste danach="${listAfterDel.replace(/\n/g, " | ").slice(0, 160)}"`);
	await shot(a.cdp, "test-G-after-delete.png");

	const errorsPts = [...new Set(pageErrors)];
	record("console-errors-pts", errorsPts.length === 0, errorsPts.length === 0 ? "keine Konsolenfehler" : errorsPts.slice(0, 5).join(" | "));
	await a.cdp.send("Target.closeTarget", { targetId: a.tab.id }).catch(() => {});

	// ---------------- Test F (Standard-Web 3080 unveraendert) ---------------
	const f = await newTab(STD_URL);
	await waitFor(f.cdp, `!!document.querySelector("[data-composer-card]")`, 25000, "Standard-Web gerendert");
	await sleep(3000);
	const stateF = await evalJs(f.cdp, STATE_SNIPPET);
	record("F-standard-web-unchanged",
		stateF.hasPtswBrowser === false && stateF.englishLeftovers.length > 0,
		`ptsw-browser=${stateF.hasPtswBrowser}, englische Ship-Texte=[${stateF.englishLeftovers.join(", ")}], fremde Workspaces sichtbar=${stateF.foreignVisible.length > 0}`);
	await shot(f.cdp, "test-F-standard-web.png");
	await f.cdp.send("Target.closeTarget", { targetId: f.tab.id }).catch(() => {});

	console.log("\n=== Zusammenfassung ===");
	for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.test}`);
	const failed = results.filter((r) => !r.pass).length;
	console.log(`\n${results.length - failed}/${results.length} bestanden`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("Testlauf fehlgeschlagen:", err);
	process.exit(2);
});
