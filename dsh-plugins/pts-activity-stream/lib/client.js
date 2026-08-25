// pts-activity-stream — client half (browser).
//
// Translates the technical tool-call rows of a DSH session into quiet,
// teacher-facing "activity units" of the Pedagogical Companion.
//
// Architecture (verified against @deepseek-ai/dsh 0.1.1-rc.2):
//   - The shipped technical rows are rendered by ToolCallTree from
//     `@deepseek-ai/dsh-client-ui-tool`, registered on the KEYED seat
//     `conversation.chat.node` under key "tool-call" at default priority 0.
//   - We take that one seat over with priority -1 (lowest renders; no boot
//     conflict). No shipped file is edited, no foreign child slot is
//     declared, renderSlot is never called by us, and no store is written.
//   - Data source: the conversation snapshot itself. Each tool-call chat node
//     carries `data.root`: a RunningToolCall (`!("kind" in root)`) or a
//     settled ToolResultNode (`kind === "tool-result"`, with isError,
//     call.{name,argsRaw} and nested subCalls[]). Consecutive tool-call nodes
//     of the same classified type are grouped into ONE visible unit; only the
//     unit's LAST node renders, earlier members return null (the flow hides
//     empty rows via `.flowItem:empty`).
//   - This is strictly a projection: no timers invent progress, no state
//     machine persists anything. If the snapshot shows nothing running,
//     nothing pulses. Failed calls never render as success.

window.__ModuleLoader__.load({
	id: "pts-activity-stream",
	factory: (require) => {
		const React = require("react");

		// ------------------------------------------------------------------
		// CSS (plugin-local, calm; reuses DSW alias variables so dark/light
		// themes keep working; reduced-motion is respected).
		// ------------------------------------------------------------------
		const CSS = `
.ptsx-unit { margin:2px 0 2px 4px; font-size:13px; line-height:20px; color:var(--dsw-alias-label-secondary); min-width:0; }
.ptsx-row { display:flex; align-items:center; gap:8px; min-width:0; }
.ptsx-dot { width:6px; height:6px; border-radius:50%; flex:none; background:var(--dsw-static-deepseek-500,#5b7ff2); animation:ptsx-pulse 2.4s ease-in-out infinite; }
@keyframes ptsx-pulse { 0%,100% { opacity:.3; } 50% { opacity:.9; } }
@media (prefers-reduced-motion:reduce) { .ptsx-dot { animation:none; opacity:.55; } }
.ptsx-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.ptsx-unit[data-state="running"] .ptsx-label { color:var(--dsw-alias-label-primary); }
.ptsx-unit[data-state="settled"] .ptsx-label { opacity:.8; }
.ptsx-unit[data-state="error"] .ptsx-label { color:var(--dsw-alias-state-error-primary); opacity:1; }
.ptsx-sub { flex:none; max-width:44ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--dsw-alias-label-caption); }
.ptsx-toggle { margin-left:auto; flex:none; background:none; border:none; border-radius:6px; padding:2px 7px; font:inherit; font-size:11.5px; color:var(--dsw-alias-label-caption); cursor:pointer; }
.ptsx-toggle:hover { color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-interactive-bg-hover); }
.ptsx-tech { margin:4px 0 2px 12px; padding:6px 10px; border-left:2px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1)); display:flex; flex-direction:column; gap:1px; }
.ptsx-line { font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace; font-size:11px; line-height:17px; color:var(--dsw-alias-label-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ptsx-line[data-error="true"] { color:var(--dsw-alias-state-error-primary); }
.ptsx-open { align-self:flex-start; margin-top:3px; background:none; border:none; padding:2px 0; font:inherit; font-size:11px; color:var(--dsw-alias-label-caption); cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
.ptsx-open:hover { color:var(--dsw-alias-label-secondary); }
.ptsx-bodytext { font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace; font-size:11px; line-height:17px; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; word-break:break-word; max-height:220px; overflow:auto; margin-top:4px; padding:6px 8px; background:rgba(128,128,128,.07); border-radius:6px; }
.ptsx-label-tech { font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace; font-size:11.5px; color:var(--dsw-alias-label-tertiary); }
`;
		const STYLE_TAG_ID = "pts-activity-stream-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ------------------------------------------------------------------
		// Small helpers
		// ------------------------------------------------------------------
		function trunc(s, n) {
			const t = String(s);
			return t.length > n ? t.slice(0, Math.max(0, n - 1)) + "…" : t;
		}
		function normPath(p) {
			return String(p).replace(/\\/g, "/");
		}
		function shortenPath(p, cwd) {
			let q = normPath(p);
			if (typeof cwd === "string" && cwd !== "") {
				const c = normPath(cwd).replace(/\/+$/, "");
				const lq = q.toLowerCase();
				const lc = c.toLowerCase();
				if (lq.startsWith(lc + "/")) q = q.slice(c.length + 1);
				else if (lq === lc) q = ".";
			}
			return trunc(q, 110);
		}
		function oneLine(s) {
			return String(s).replace(/\s+/g, " ").trim();
		}
		function parseArgsSafe(argsRaw) {
			try {
				const t = String(argsRaw === null || argsRaw === undefined ? "" : argsRaw).trim();
				if (t === "") return {};
				return JSON.parse(t);
			} catch (e) {
				return null;
			}
		}

		// ------------------------------------------------------------------
		// PTS signals (paths/patterns that mark the pedagogical thinking space)
		// ------------------------------------------------------------------
		const PTS_DIR_RE = /(^|[\/])(workspace|services|specs|capabilities|knowledge|memory\.local)([\/]|$)/i;
		const PTS_ROOTFILE_RE = /(^|[\/])(AGENTS\.md|README\.md|MANIFEST\.md|CRITICAL_FRIEND\.md|SYSTEMIC_STANCE\.md|LEARNING_DESIGN\.md|ORCHESTRATION\.md)$/i;
		const DRAFT_DIR_RE = /[\/](drafts|rendered)([\/]|$)/i;

		function isPtsTarget(p) {
			if (typeof p !== "string" || p === "") return false;
			const q = normPath(p);
			return PTS_DIR_RE.test(q) || PTS_ROOTFILE_RE.test(q);
		}
		function isDraftPath(p) {
			return typeof p === "string" && DRAFT_DIR_RE.test(normPath(p));
		}

		// ------------------------------------------------------------------
		// Classification: one root tool call -> activity type (or null for an
		// honest technical fallback row). Only real runtime signals:
		// wire tool name, parsed arguments (file_path/path/pattern/command/
		// query/description/…), settlement and error flags. Never model prose.
		// ------------------------------------------------------------------
		const RESEARCH_TOOLS = {
			subagent: true, web_search: true, web_fetch: true,
			send_message: true, interrupt_agent: true, list_agents: true,
			job_output: true, job_list: true, job_kill: true,
		};

		function classifyRoot(root) {
			if (root === null || typeof root !== "object") return null;
			const settled = "kind" in root;
			const head = settled ? root.call : null;
			const name = String((settled
				? (head !== null && head !== undefined ? head.name : undefined)
				: root.name) ?? "").toLowerCase();
			const argsRaw = settled
				? (head !== null && head !== undefined && typeof head.argsRaw === "string" ? head.argsRaw : "")
				: (typeof root.argsRaw === "string" ? root.argsRaw : "");
			const args = parseArgsSafe(argsRaw);
			const pick = function () {
				if (args === null || typeof args !== "object") return undefined;
				for (let i = 0; i < arguments.length; i++) {
					const v = args[arguments[i]];
					if (typeof v === "string" && v.trim() !== "") return v;
				}
				return undefined;
			};

			if (RESEARCH_TOOLS[name] === true) {
				return { type: "research", isSpawn: name === "subagent", desc: name === "subagent" ? pick("description") : undefined };
			}
			if (name === "write" || name === "edit") {
				const p = pick("file_path", "path");
				if (isDraftPath(p)) return { type: "draft", path: typeof p === "string" ? p : undefined };
				if (isPtsTarget(p)) return { type: "update", path: typeof p === "string" ? p : undefined };
				return { type: "generic", path: typeof p === "string" ? p : undefined };
			}
			if (name === "read" || name === "read_image") {
				const p = pick("file_path", "path");
				if (!isDraftPath(p) && isPtsTarget(p)) return { type: "review", path: typeof p === "string" ? p : undefined };
				return { type: "generic", path: typeof p === "string" ? p : undefined };
			}
			if (name === "glob" || name === "grep") {
				const pat = pick("pattern", "regex");
				const dir = pick("path");
				const hay = (pat !== undefined ? pat : "") + " " + (dir !== undefined ? dir : "");
				if (hay.trim() !== "" && isPtsTarget(hay)) return { type: "review" };
				return { type: "generic" };
			}
			if (name === "pwsh" || name === "bash") {
				return { type: "generic" };
			}
			if (name === "todo_write") {
				return { type: "plan" };
			}
			if (name === "ask_user_question") {
				return { type: "question" };
			}
			return null;
		}

		// ------------------------------------------------------------------
		// Technical detail lines (original English tool names are kept on
		// purpose — this layer must stay debuggable).
		// ------------------------------------------------------------------
		function argOf(args, keys) {
			if (args === null || typeof args !== "object") return undefined;
			for (let i = 0; i < keys.length; i++) {
				const v = args[keys[i]];
				if (typeof v === "string" && v.trim() !== "") return v;
			}
			return undefined;
		}
		function techLine(root, cwd) {
			if (root === null || typeof root !== "object") return "?";
			const settled = "kind" in root;
			const head = settled ? root.call : null;
			const name = String((settled
				? (head !== null && head !== undefined ? head.name : root.callId)
				: root.name) ?? "?");
			const argsRaw = settled
				? (head !== null && head !== undefined && typeof head.argsRaw === "string" ? head.argsRaw : "")
				: (typeof root.argsRaw === "string" ? root.argsRaw : "");
			const args = parseArgsSafe(argsRaw);
			let detail = "";
			const filePath = argOf(args, ["file_path"]);
			const pathArg = argOf(args, ["path"]);
			if (filePath !== undefined) detail = shortenPath(filePath, cwd);
			else if (pathArg !== undefined) detail = shortenPath(pathArg, cwd);
			else {
				const pattern = argOf(args, ["pattern", "regex"]);
				const command = argOf(args, ["command"]);
				const query = argOf(args, ["query"]);
				const desc = argOf(args, ["description"]);
				const promptish = argOf(args, ["prompt", "message", "text"]);
				if (pattern !== undefined) {
					const dir = argOf(args, ["dir", "cwd", "root"]);
					detail = pattern + (dir !== undefined ? "  in " + shortenPath(dir, cwd) : "");
				}
				else if (command !== undefined) detail = trunc(oneLine(command), 90);
				else if (query !== undefined) detail = trunc(oneLine(query), 80);
				else if (desc !== undefined) detail = trunc(oneLine(desc), 60);
				else if (promptish !== undefined) detail = trunc(oneLine(promptish), 60);
				else if (args !== null && typeof args === "object" && Object.keys(args).length > 0) detail = trunc(oneLine(JSON.stringify(args)), 80);
				else if (typeof argsRaw === "string" && argsRaw.trim() !== "") detail = trunc(oneLine(argsRaw), 80);
			}
			return detail !== "" ? name + "  " + detail : name;
		}
		function collectItems(root, depth, out, cwd) {
			if (out.length >= 24 || depth > 2 || root === null || typeof root !== "object") return;
			out.push({ d: depth, t: techLine(root, cwd), err: ("kind" in root) && root.isError === true });
			const subs = root.subCalls;
			if (Array.isArray(subs)) {
				for (let i = 0; i < subs.length; i++) collectItems(subs[i], depth + 1, out, cwd);
			}
		}

		// ------------------------------------------------------------------
		// Grouping: walk snapshot.chat.order once; consecutive tool-call nodes
		// of the same activity type form one unit. A group breaks on any other
		// VISIBLE flow content (user/steering message, command, assistant step
		// carrying visible prose, turn tail …) so units follow the rhythm of
		// the conversation instead of merging everything into one blob.
		// ------------------------------------------------------------------
		function breaksGroup(node) {
			if (node.kind === "assistant-step") {
				const d = node.data;
				const blocks = d !== null && d !== undefined && Array.isArray(d.blocks) ? d.blocks : [];
				for (let i = 0; i < blocks.length; i++) {
					const b = blocks[i];
					if (b !== null && b !== undefined && b.kind === "text" && typeof b.text === "string" && b.text.trim() !== "") return true;
				}
				return false;
			}
			return true;
		}

		function describeKey(key, snap, cwd) {
			const order = snap.chat.order;
			const store = snap.chat.nodes;
			let cur = null;
			const ownerOf = new Map();
			const metaOf = new Map(); // key -> classification extras (desc/isSpawn)
			for (let i = 0; i < order.length; i++) {
				const k = order[i];
				const n = store.get(k);
				if (n === undefined || n === null) continue;
				if (n.kind !== "tool-call") {
					if (breaksGroup(n)) cur = null;
					continue;
				}
				const cls = classifyRoot(n.data.root);
				if (cls === null) {
					// Honest fallback: its own tiny technical unit, never merged.
					cur = null;
					const u = { type: "technical", keys: [], subCount: 0, desc: null, lastPath: undefined };
					units_push(ownerOf, metaOf, u, k, cls);
					continue;
				}
				let u = cur;
				// Reading a file and immediately rewriting the SAME file is ONE
				// movement of change (task example 2): fold the preceding
				// review/read unit into this write instead of emitting two rows.
				if (
					u !== null && u.keys.length > 0 &&
					(cls.type === "update" || cls.type === "draft") &&
					u.type === "review" &&
					samePath(u.lastPath, cls.path)
				) {
					u.type = cls.type;
					units_push(ownerOf, metaOf, u, k, cls);
					continue;
				}
				if (u === null || u.type !== cls.type || cls.type === "question") {
					u = { type: cls.type, keys: [], subCount: 0, desc: null, lastPath: cls.path };
					units_push(ownerOf, metaOf, u, k, cls);
					cur = u;
					continue;
				}
				units_push(ownerOf, metaOf, u, k, cls);
			}
			const u = ownerOf.get(key);
			if (u === undefined) return { show: false };
			if (u.keys[u.keys.length - 1] !== key) return { show: false };

			// Descriptor of the whole unit (this is what renders).
			const items = [];
			let running = false;
			let hasError = false;
			let firstCallId = null;
			let lastCallId = null;
			for (let j = 0; j < u.keys.length; j++) {
				const n = store.get(u.keys[j]);
				if (n === undefined || n === null) continue;
				const root = n.data.root;
				collectItems(root, 0, items, cwd);
				const settled = "kind" in root;
				if (!settled) running = true;
				else if (root.isError === true) hasError = true;
				if (firstCallId === null) firstCallId = root.callId;
				lastCallId = root.callId;
			}
			const desc = u.desc !== null && typeof u.desc === "string" ? u.desc : null;
			return {
				show: true,
				type: u.type,
				running,
				hasError,
				count: u.keys.length,
				spawns: u.subCount,
				desc,
				items,
				firstCallId,
				lastCallId,
			};
		}
		function units_push(ownerOf, metaOf, u, k, cls) {
			u.keys.push(k);
			ownerOf.set(k, u);
			metaOf.set(k, cls);
			if (cls !== null && cls.isSpawn === true) u.subCount += 1;
			if (cls !== null && typeof cls.desc === "string" && u.desc === null) u.desc = cls.desc;
			if (cls !== null && typeof cls.path === "string") u.lastPath = cls.path;
		}

		function samePath(a, b) {
			if (typeof a !== "string" || typeof b !== "string") return false;
			const na = normPath(a).replace(/^\.\//, "").toLowerCase();
			const nb = normPath(b).replace(/^\.\//, "").toLowerCase();
			return na !== "" && na === nb;
		}

		// ------------------------------------------------------------------
		// Teacher-facing copy (German). Settled lines are deliberately quieter
		// than running ones. Research copy scales honestly with the number of
		// subagent spawn calls actually observed in the unit.
		// ------------------------------------------------------------------
		const COPY = {
			review: { run: "Ich prüfe den bisherigen Denkstand …", done: "Denkstand geprüft" },
			update: { run: "Ich halte den neuen Stand im Denkraum fest …", done: "Denkstand aktualisiert" },
			draft: { run: "Ein Entwurf wird vorbereitet …", done: "Entwurf angelegt" },
			plan: { run: "Ich sortiere die nächsten Schritte …", done: "Nächste Schritte sortiert" },
			question: { run: "Ich habe eine Frage an dich …", done: "Frage geklärt" },
			generic: { run: "Ich arbeite gerade daran …", done: "Schritt abgeschlossen" },
		};
		function researchRunLabel(info) {
			return info.spawns >= 2 ? "Ich lasse unterschiedliche Perspektiven parallel untersuchen …" : "Recherche läuft …";
		}
		function researchDoneLabel(info) {
			if (info.spawns >= 2) return info.spawns + " zusätzliche Perspektiven sind zurückgekommen.";
			if (info.spawns === 1) return "Eine zusätzliche Perspektive ist zurückgekommen.";
			return "Recherche abgeschlossen";
		}
		function headlineFor(info) {
			const tone = info.running ? "run" : (info.hasError ? "error" : "done");
			if (tone === "error") return "Das hat leider nicht geklappt.";
			if (info.type === "research") return info.running ? researchRunLabel(info) : researchDoneLabel(info);
			const c = COPY[info.type];
			return tone === "run" ? c.run : c.done;
		}

		function jsonEq(a, b) {
			return JSON.stringify(a) === JSON.stringify(b);
		}

		// ------------------------------------------------------------------
		// Components
		// ------------------------------------------------------------------
		function ActivityUnit(props) {
			const info = props.info;
			const inspectCall = props.inspectCall;
			const openState = React.useState(false);
			const open = openState[0];
			const setOpen = openState[1];
			const tone = info.running ? "running" : (info.hasError ? "error" : "settled");
			const label = info.type === "technical"
				? (info.items.length > 0 ? info.items[0].t : "Arbeitsschritt")
				: headlineFor(info);
			const rowChildren = [
				info.running ? React.createElement("span", { key: "dot", className: "ptsx-dot", "aria-hidden": "true" }) : null,
				React.createElement("span", {
					key: "label",
					className: "ptsx-label" + (info.type === "technical" ? " ptsx-label-tech" : ""),
					...(info.running ? { role: "status" } : {}),
				}, label),
			];
			if (info.desc !== null && info.type === "research" && info.running) {
				rowChildren.push(React.createElement("span", { key: "desc", className: "ptsx-sub", title: info.desc }, info.desc));
			}
			rowChildren.push(React.createElement("button", {
				key: "toggle",
				type: "button",
				className: "ptsx-toggle",
				"aria-expanded": open ? "true" : "false",
				onClick: function () { setOpen(!open); },
			}, (open ? "▾" : "▸") + " Technische Details"));

			let tech = null;
			if (open) {
				const lines = [];
				for (let i = 0; i < info.items.length; i++) {
					const it = info.items[i];
					lines.push(React.createElement("div", {
						key: i,
						className: "ptsx-line",
						"data-error": it.err ? "true" : "false",
						title: it.t,
						style: it.d > 0 ? { paddingLeft: it.d * 14 + "px" } : undefined,
					}, it.t));
				}
				tech = React.createElement("div", { className: "ptsx-tech" },
					React.createElement("div", null, lines),
					(typeof inspectCall === "function" && info.lastCallId !== null
						? React.createElement("button", {
							type: "button",
							className: "ptsx-open",
							onClick: function () { inspectCall(info.lastCallId); },
						}, "In der Trajektorie öffnen")
						: null));
			}

			return React.createElement("div", { className: "ptsx-unit", "data-state": tone },
				React.createElement("div", { className: "ptsx-row" }, rowChildren),
				tech);
		}

		function PtsToolNode(props) {
			const node = props.node;
			const useSession = props.useSession;
			if (node === undefined || node === null || useSession === undefined || useSession === null) return null;
			const cwd = typeof props.cwd === "string" ? props.cwd : null;
			const info = useSession(function (s) {
				return describeKey(node.key, s, cwd);
			}, jsonEq);
			if (!info || !info.show) return null;
			return React.createElement(ActivityUnit, { info: info, inspectCall: props.inspectCall });
		}

		// ------------------------------------------------------------------
		// Context injections ("Context injection · goal" & friends): the same
		// keyed seat has a second shipped occupant under key "context". We take
		// that over as well and translate it with the producer-declared
		// metadata the node already carries — role (inject|recall), form
		// (instructions|catalog|snapshot|notice|relay|recall|null) and the
		// durable producer label — never by parsing the content's meaning.
		// The original content stays reachable behind the same disclosure.
		// ------------------------------------------------------------------
		function contextTextBlocks(content) {
			const parts = [];
			if (Array.isArray(content)) {
				for (let i = 0; i < content.length; i++) {
					const b = content[i];
					if (b !== null && b !== undefined && typeof b === "object") {
						if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
						else parts.push("[" + String(b.type !== undefined ? b.type : "block") + "]");
					}
				}
			}
			return parts.join("\n").trim();
		}
		function contextHeadline(data) {
			const d = data !== null && typeof data === "object" ? data : {};
			const prov = d.provenance !== null && typeof d.provenance === "object" ? d.provenance : {};
			if (prov.role === "recall") return "Frühere Session herangezogen";
			switch (d.form) {
				case "relay": return "Rückmeldung aus der Hintergrundarbeit eingegangen";
				case "notice": {
					const t = oneLine(contextTextBlocks(d.content));
					return t !== "" ? "Hinweis: " + trunc(t, 90) : "Hinweis des Systems";
				}
				case "instructions": return "Arbeitsgrundlage geladen";
				case "catalog": return "Werkzeugkatalog geladen";
				case "snapshot": return "Lagebericht geladen";
				default: return "Systemmeldung aufgenommen";
			}
		}
		function contextMetaLine(data) {
			const d = data !== null && typeof data === "object" ? data : {};
			const prov = d.provenance !== null && typeof d.provenance === "object" ? d.provenance : {};
			const parts = [];
			parts.push("context");
			parts.push(typeof prov.role === "string" && prov.role !== "" ? prov.role : "?");
			parts.push(typeof d.form === "string" && d.form !== "" ? d.form : "opaque");
			if (typeof prov.label === "string" && prov.label !== "") parts.push(prov.label);
			return parts.join(" · ");
		}

		function PtsContextNode(props) {
			const node = props.node;
			if (node === undefined || node === null || node.data === undefined || node.data === null) return null;
			const data = node.data;
			const openState = React.useState(false);
			const open = openState[0];
			const setOpen = openState[1];
			let tech = null;
			if (open) {
				const bodyText = trunc(contextTextBlocks(data.content), 4000);
				tech = React.createElement("div", { className: "ptsx-tech" },
					React.createElement("div", { className: "ptsx-line" }, contextMetaLine(data)),
					bodyText !== ""
						? React.createElement("div", { className: "ptsx-bodytext" }, bodyText)
						: React.createElement("div", { className: "ptsx-line" }, "(kein Textinhalt)"));
			}
			return React.createElement("div", { className: "ptsx-unit", "data-state": "settled" },
				React.createElement("div", { className: "ptsx-row" },
					React.createElement("span", { className: "ptsx-label" }, contextHeadline(data)),
					React.createElement("button", {
						type: "button",
						className: "ptsx-toggle",
						"aria-expanded": open ? "true" : "false",
						onClick: function () { setOpen(!open); },
					}, (open ? "▾" : "▸") + " Technische Details")),
				tech);
		}

		// ------------------------------------------------------------------
		// Registration: takeover of the keyed chat-node seat for tool calls.
		// priority -1 shadows the shipped ToolCallTree (priority 0); ties would
		// be a boot error, so the value matters. No children declared, no
		// renderSlot dispatch, no locale seat (copy is intentionally German).
		// ------------------------------------------------------------------
		function apply(ctx) {
			ctx.slots.inject("conversation.chat.node", function () {
				ctx.slots.register(
					{ name: "conversation.chat.node", key: "tool-call", priority: -1 },
					function (props) { return React.createElement(PtsToolNode, props); },
				);
			});
			ctx.slots.inject("conversation.chat.node", function () {
				ctx.slots.register(
					{ name: "conversation.chat.node", key: "context", priority: -1 },
					function (props) { return React.createElement(PtsContextNode, props); },
				);
			});
		}

		// Test hook (read-only; used by the plugin-local logic smoke test).
		if (typeof window !== "undefined" && window !== null) {
			window.__ptsActivityStream = { describeKey, classifyRoot, contextHeadline, contextMetaLine };
		}

		return { inject: ["slots"], apply: apply };
	},
});
