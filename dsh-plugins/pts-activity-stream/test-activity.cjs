// pts-activity-stream — logic smoke test (no browser needed).
//
// Loads lib/client.js with a stubbed window/__ModuleLoader__/require, then
// drives describeKey against synthetic conversation snapshots that mirror the
// real runtime shapes from @deepseek-ai/dsh-client-runtime 0.1.1-rc.2:
//   chat.order : readonly string[]           (visible nodes, anchor order)
//   chat.nodes : ChatNodeStore (.get/.values)
//   tool-call node: { key, kind:'tool-call', data:{ root } }
//     root running : { callId,name,argsRaw,turn,step,time,callView,subCalls }
//     root settled : { kind:'tool-result', seq,time,callId,call:{name,argsRaw},
//                      callTime,content,isError,error?,subCalls }
//
// Run: node test-activity.cjs

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const clientSrc = fs.readFileSync(path.join(__dirname, "lib", "client.js"), "utf8");
const sandbox = {
	window: {
		__ModuleLoader__: {
			load(mod) { sandbox.__mod = mod; },
		},
	},
	require(name) {
		if (name === "react") return {};
		throw new Error("unexpected require: " + name);
	},
	console,
	JSON,
	Map,
	Array,
	Object,
	String,
	Number,
	Math,
};
	sandbox.document = undefined;
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox, { filename: "lib/client.js" });
sandbox.__mod.factory(sandbox.require);

const dbg = sandbox.window.__ptsActivityStream;
if (!dbg || typeof dbg.describeKey !== "function") {
	console.error("FAIL: test hook missing");
	process.exit(1);
}
const { describeKey } = dbg;

let failures = 0;
function check(label, cond) {
	if (cond) console.log("ok   -", label);
	else {
		failures += 1;
		console.error("FAIL -", label);
	}
}

let keySeq = 0;
function runningCall(name, argsRaw, extra) {
	keySeq += 1;
	return Object.assign({ callId: "call-" + keySeq, name, argsRaw, turn: 1, step: 1, time: Date.now(), callView: null, subCalls: [] }, extra || {});
}
function resultNode(call, opts) {
	const o = opts || {};
	return Object.assign({
		kind: "tool-result",
		seq: ++keySeq * 10,
		time: Date.now(),
		callId: call.callId,
		call: { name: call.name, argsRaw: call.argsRaw },
		callTime: call.time,
		content: [],
		isError: o.isError === true,
		subCalls: o.subCalls || [],
	}, o.isError ? { error: { name: "ToolError", code: "X" } } : {});
}
function toolNode(root) {
	keySeq += 1;
	return { key: "tool-call:" + root.callId, kind: "tool-call", data: { root } };
}
function stepNode(text) {
	return { key: "assistant-step:" + (++keySeq), kind: "assistant-step", data: { blocks: text ? [{ kind: "text", text }] : [] } };
}
function snap(nodes) {
	const store = new Map();
	const order = [];
	for (const n of nodes) {
		store.set(n.key, n);
		order.push(n.key);
	}
	return { chat: { order, nodes: store } };
}
const CWD = "F:/code/pedagogical-thinking-space";

// --- Scenario A: Glob + 3 Reads of PTS files => ONE review unit ------------
{
	const g = runningCall("glob", JSON.stringify({ pattern: "workspace/**" }));
	const r1 = runningCall("read", JSON.stringify({ file_path: "workspace/dsh-native-smoke/learning-design.md" }));
	const r2 = runningCall("read", JSON.stringify({ file_path: "workspace/dsh-native-smoke/learning-landscape.md" }));
	const r3 = runningCall("read", JSON.stringify({ file_path: "workspace/dsh-native-smoke/decisions.yml" }));
	const s = snap([toolNode(g), toolNode(r1), toolNode(r2), toolNode(r3)]);
	const dLast = describeKey("tool-call:" + r3.callId, s, CWD);
	check("A: last member renders", dLast.show === true);
	check("A: type review", dLast.type === "review");
	check("A: running while open", dLast.running === true);
	check("A: count 4", dLast.count === 4);
	const dFirst = describeKey("tool-call:" + g.callId, s, CWD);
	check("A: earlier members hidden", dFirst.show === false);

	const s2 = snap([toolNode(resultNode(g)), toolNode(resultNode(r1)), toolNode(resultNode(r2)), toolNode(resultNode(r3))]);
	const dDone = describeKey("tool-call:" + r3.callId, s2, CWD);
	check("A: settled when all settle", dDone.running === false && dDone.hasError === false);
}

// --- Scenario B: Read + Write SAME file => ONE merged update unit ----------
{
	const r = runningCall("read", JSON.stringify({ file_path: "workspace/x/learning-design.md" }));
	const w = runningCall("write", JSON.stringify({ file_path: "workspace/x/learning-design.md" }));
	const s = snap([toolNode(r), toolNode(w)]);
	const dr = describeKey("tool-call:" + r.callId, s, CWD);
	const dw = describeKey("tool-call:" + w.callId, s, CWD);
	check("B: read hidden behind merged unit", dr.show === false);
	check("B: merged into ONE update unit at the write", dw.type === "update" && dw.show === true && dw.running === true && dw.count === 2);

	// A write to a DIFFERENT file stays a separate movement.
	const r2 = runningCall("read", JSON.stringify({ file_path: "workspace/y/learning-design.md" }));
	const w2 = runningCall("write", JSON.stringify({ file_path: "workspace/z/decisions.md" }));
	const s2 = snap([toolNode(r2), toolNode(w2)]);
	const d1 = describeKey("tool-call:" + r2.callId, s2, CWD);
	const d2 = describeKey("tool-call:" + w2.callId, s2, CWD);
	check("B2: different paths stay two units", d1.show === true && d1.type === "review" && d2.type === "update");
}

// --- Scenario C: delegated research with description + nested web_search ---
{
	const ws1 = runningCall("web_search", JSON.stringify({ query: "Museumspädagogik Lernorte" }));
	const ws2 = runningCall("web_search", JSON.stringify({ query: "community based education Kritik" }));
	const sa = runningCall("subagent", JSON.stringify({ description: "Zwei Perspektiven recherchieren", prompt: "...", run_in_background: true }), { subCalls: [ws1, ws2] });
	const sRun = snap([toolNode(sa)]);
	const dRun = describeKey("tool-call:" + sa.callId, sRun, CWD);
	check("C: research type", dRun.type === "research");
	check("C: description surfaced once", dRun.desc === "Zwei Perspektiven recherchieren");
	check("C: spawn counted", dRun.spawns === 1);
	check("C: tech lines include nested web_search", dRun.items.some((i) => i.t.indexOf("web_search") >= 0));

	const done = resultNode(sa, { subCalls: [resultNode(ws1), resultNode(ws2)] });
	const sDone = snap([toolNode(done)]);
	const dDone = describeKey("tool-call:" + sa.callId, sDone, CWD);
	check("C: settled copy path (single spawn)", dDone.spawns === 1 && dDone.running === false);
}

// --- Scenario C2: native PTS worker tools retain their domain activity ------
{
	const research = runningCall("pts_research", JSON.stringify({ description: "Lehrplan prüfen", prompt: "...", run_in_background: true }));
	const material = runningCall("pts_material", JSON.stringify({ description: "Arbeitsblatt entwerfen", prompt: "...", run_in_background: true }));
	const review = runningCall("pts_review", JSON.stringify({ description: "Entwurf prüfen", prompt: "...", run_in_background: true }));
	const s = snap([toolNode(research), toolNode(material), toolNode(review)]);
	check("C2: pts_research classified as research", describeKey("tool-call:" + research.callId, s, CWD).type === "research");
	check("C2: pts_material classified as draft", describeKey("tool-call:" + material.callId, s, CWD).type === "draft");
	check("C2: pts_review classified as review", describeKey("tool-call:" + review.callId, s, CWD).type === "review");
}

// --- Scenario D: unknown tool => honest technical fallback -----------------
{
	const x = runningCall("workflow", JSON.stringify({ script: "..." }));
	const s = snap([toolNode(x)]);
	const d = describeKey("tool-call:" + x.callId, s, CWD);
	check("D: fallback type technical", d.type === "technical" && d.show === true);
}

// --- Scenario E: visible prose between reads splits groups -----------------
{
	const r1 = runningCall("read", JSON.stringify({ file_path: "AGENTS.md" }));
	const st = stepNode("Hier beschreibe ich kurz meinen Zwischenstand.");
	const r2 = runningCall("read", JSON.stringify({ file_path: "MANIFEST.md" }));
	const s = snap([toolNode(r1), st, toolNode(r2)]);
	const d1 = describeKey("tool-call:" + r1.callId, s, CWD);
	const d2 = describeKey("tool-call:" + r2.callId, s, CWD);
	check("E: prose splits -> both units visible", d1.show === true && d2.show === true);
	check("E: counts are 1 and 1", d1.count === 1 && d2.count === 1);
	const stSilent = stepNode("");
	const r3 = runningCall("read", JSON.stringify({ file_path: "README.md" }));
	const sMerge = snap([toolNode(r1), stSilent, toolNode(r3)]);
	const dm = describeKey("tool-call:" + r3.callId, sMerge, CWD);
	check("E: silent step does not split", dm.count === 2);
}

// --- Scenario F: failed write never renders as success ---------------------
{
	const w = runningCall("write", JSON.stringify({ file_path: "F:/outside/foo.txt" }));
	const s = snap([toolNode(resultNode(w, { isError: true }))]);
	const d = describeKey("tool-call:" + w.callId, s, CWD);
	check("F: hasError true, not running", d.hasError === true && d.running === false);
}

// --- Scenario G: pwsh command => generic -----------------------------------
{
	const c = runningCall("pwsh", JSON.stringify({ command: "Get-ChildItem" }));
	const s = snap([toolNode(c)]);
	const d = describeKey("tool-call:" + c.callId, s, CWD);
	check("G: generic type", d.type === "generic");
}

// --- Scenario H: context injection translation (real metadata only) --------
{
	const { contextHeadline, contextMetaLine } = sandbox.window.__ptsActivityStream;
	const mk = (provenance, form, content) => ({ provenance, form, content });
	check("H: relay -> Hintergrundarbeit", contextHeadline(mk({ role: "inject", label: "subagent" }, "relay", [])) === "Rückmeldung aus der Hintergrundarbeit eingegangen");
	check("H: instructions -> Arbeitsgrundlage", contextHeadline(mk({ role: "inject", label: null }, "instructions", [])) === "Arbeitsgrundlage geladen");
	check("H: recall role wins over form", contextHeadline(mk({ role: "recall", label: "alt" }, "recall", [])) === "Frühere Session herangezogen");
	check("H: notice uses first text of content", contextHeadline(mk({ role: "inject", label: "goal" }, "notice", [{ type: "text", text: "Zielrunde 3/12\nWeiteres" }])).indexOf("Hinweis: Zielrunde 3/12") === 0);
	check("H: unknown form -> Systemmeldung", contextHeadline(mk({ role: "inject", label: "x" }, null, [])) === "Systemmeldung aufgenommen");
	check("H: meta line carries producer", contextMetaLine(mk({ role: "inject", label: "goal" }, "notice", [])) === "context · inject · notice · goal");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures === 0 ? 0 : 1);
