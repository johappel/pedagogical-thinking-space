// pts-denkstand — client half (browser).
//
// Adds a "Denkstand" tab (conversation.view, order 40) that renders the three
// structured YAML files of the Denkraum teacher-facing:
//   - planning-board.yml as a kanban board (columns clarify/prepare/review/ready)
//   - temporal-plan.yml as a timeline of teaching windows + placements
//   - decisions.yml as a decision list
// instead of raw YAML. Data comes from the host route /api/pts-denkstand.

window.__ModuleLoader__.load({
	id: "pts-denkstand",
	factory: (require) => {
		const React = require("react");

		const CSS = `
.dks-root { display:flex; flex-direction:column; gap:14px; height:100%; min-height:0; overflow:auto; padding:14px; box-sizing:border-box; }
.dks-title { font-weight:700; font-size:14px; opacity:.92; }
.dks-sub { font-size:12px; opacity:.6; margin-top:2px; }
.dks-errmsg { color:#e06c75; white-space:pre-wrap; word-break:break-word; font-size:12.5px; }
.dks-note { opacity:.6; font-size:12.5px; line-height:1.6; }
.dks-section { display:flex; flex-direction:column; gap:8px; }
.dks-section-title { font-weight:600; font-size:12.5px; text-transform:uppercase; letter-spacing:.5px; opacity:.6; }
.dks-columns { display:flex; gap:10px; align-items:flex-start; overflow-x:auto; padding-bottom:6px; }
.dks-col { flex:1 1 0; min-width:260px; border:1px solid rgba(128,128,128,.25); border-radius:8px; background:rgba(128,128,128,.04); display:flex; flex-direction:column; gap:6px; padding:8px; }
.dks-col-head { font-weight:600; font-size:12px; opacity:.75; padding:2px 2px 4px; display:flex; align-items:center; gap:6px; }
.dks-col-count { font-size:11px; opacity:.5; }
.dks-card { border:1px solid rgba(128,128,128,.3); border-radius:7px; background:rgba(128,128,128,.06); padding:8px 10px; display:flex; flex-direction:column; gap:5px; cursor:pointer; text-align:left; color:inherit; font:inherit; position:relative; }
.dks-card:hover { border-color:rgba(128,128,128,.65); background:rgba(128,128,128,.12); }
.dks-card-selected { border-color:#7ec699; border-width:2px; background:rgba(126,198,153,.15); box-shadow:0 0 0 1px #7ec699 inset; }
.dks-card-selected .dks-card-title { color:#7ec699; }
.dks-card-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:2px; }
.dks-action-btn { border:1px solid rgba(128,128,128,.35); background:rgba(128,128,128,.05); color:inherit; border-radius:6px; padding:3px 8px; font-size:11px; cursor:pointer; white-space:nowrap; }
.dks-action-btn:hover { background:rgba(128,128,128,.18); }
.dks-action-approve { border-color:#7ec699; color:#7ec699; }
.dks-action-approve:hover { background:rgba(126,198,153,.18); }
.dks-action-ok { color:#7ec699; }
.dks-card-title { font-size:12.5px; line-height:1.4; font-weight:600; }
.dks-card-meta { display:flex; gap:5px; align-items:center; flex-wrap:wrap; font-size:10.5px; }
.dks-badge { border:1px solid rgba(128,128,128,.35); border-radius:4px; padding:0 5px; font-size:10px; text-transform:uppercase; letter-spacing:.3px; }
.dks-card-note { font-size:11.5px; opacity:.7; line-height:1.5; }
.dks-approval { font-size:10.5px; opacity:.75; }
.dks-approval-yes { color:#d19a66; }
.dks-timeline { display:flex; flex-direction:column; gap:8px; }
.dks-win { border:1px solid rgba(128,128,128,.25); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
.dks-win-head { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12.5px; }
.dks-win-title { font-weight:600; }
.dks-placement { display:flex; align-items:baseline; gap:6px; font-size:12px; border-left:3px solid rgba(128,128,128,.3); padding:3px 0 3px 8px; }
.dks-placement-time { font-variant-numeric:tabular-nums; opacity:.75; min-width:76px; }
.dks-empty { border:1px dashed rgba(128,128,128,.3); border-radius:8px; padding:16px; text-align:center; opacity:.65; font-size:12.5px; line-height:1.7; }
.dks-path { font-size:11px; opacity:.5; font-family:ui-monospace,Consolas,monospace; }
.dks-pill-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.dks-decision { border:1px solid rgba(128,128,128,.25); border-radius:8px; padding:8px 10px; font-size:12.5px; display:flex; flex-direction:column; gap:4px; }
.dks-dec-title { font-weight:600; }
.dks-dec-detail { opacity:.7; font-size:11.5px; }
.dks-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dks-btn { border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; border-radius:6px; padding:3px 10px; font-size:12px; cursor:pointer; }
.dks-btn:hover { background:rgba(128,128,128,.15); }
.dks-nextstep { border:1px solid rgba(126,198,153,.55); border-radius:8px; background:rgba(126,198,153,.07); padding:10px 12px; display:flex; flex-direction:column; gap:6px; }
.dks-nextstep-label { font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; color:#7ec699; opacity:.9; }
.dks-nextstep-desc { font-size:12px; opacity:.85; line-height:1.5; }
.dks-openq { border:1px solid rgba(128,128,128,.22); border-radius:7px; padding:8px 10px; display:flex; flex-direction:column; gap:4px; background:rgba(128,128,128,.03); }
.dks-openq-source-row { display:flex; align-items:center; gap:6px; }
.dks-openq-text { font-size:12px; opacity:.8; line-height:1.5; }
.dks-nohint { font-size:12.5px; opacity:.7; line-height:1.6; }
.dks-group-head { display:flex; align-items:center; gap:6px; padding:3px 2px; cursor:pointer; user-select:none; font-size:12px; }
.dks-group-head:hover { opacity:.85; }
.dks-subgroup { display:flex; flex-direction:column; gap:6px; margin-top:6px; }
.dks-split { display:flex; gap:14px; align-items:flex-start; }
.dks-thought { flex:1 1 0; min-width:320px; display:flex; flex-direction:column; gap:8px; border-right:1px solid rgba(128,128,128,.18); padding-right:10px; }
.dks-thought-focus { border:1px dashed rgba(126,198,153,.5); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:4px; background:rgba(126,198,153,.05); }
.dks-thought-focus-label { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:#7ec699; opacity:.9; }
.dks-thought-focus-text { font-size:12px; opacity:.85; line-height:1.5; }
.dks-thought-card { border:1px solid rgba(128,128,128,.25); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; background:rgba(128,128,128,.03); }
.dks-thought-badge { align-self:flex-start; }
.dks-thought-text { font-size:12px; opacity:.85; line-height:1.5; }
.dks-thought-vote { display:flex; align-items:center; gap:6px; }
.dks-vote-btn { border:1px solid rgba(128,128,128,.35); background:transparent; color:inherit; border-radius:5px; width:22px; height:22px; line-height:1; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; justify-content:center; }
.dks-vote-btn:hover { background:rgba(128,128,128,.15); }
.dks-vote-count { font-variant-numeric:tabular-nums; font-size:12px; opacity:.8; min-width:20px; text-align:center; }
.dks-thought-link { font-size:12px; color:#7ec699; border:1px solid rgba(126,198,153,.4); border-radius:6px; padding:5px 8px; cursor:pointer; background:transparent; text-align:left; }
.dks-thought-link:hover { background:rgba(126,198,153,.12); }
.dks-board-col { flex:1; min-width:0; }
.dks-threerow { display:flex; gap:14px; align-items:flex-start; overflow-x:auto; }
.dks-clarify { flex:1 1 0; min-width:300px; display:flex; flex-direction:column; gap:8px; border-right:1px solid rgba(128,128,128,.18); padding-right:10px; }
.dks-clarified-list { display:flex; flex-direction:column; gap:6px; }
.dks-clarified { display:flex; align-items:baseline; gap:6px; border:1px solid rgba(126,198,153,.3); border-radius:7px; padding:6px 8px; background:rgba(126,198,153,.04); }
.dks-openq-col { flex:1 1 0; min-width:320px; display:flex; flex-direction:column; gap:8px; }
.dks-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:2050; }
.dks-dialog { width:min(92vw, 880px); max-height:88vh; display:flex; flex-direction:column; overflow:hidden; background:var(--editor-bg,#1e1e1e); border:1px solid rgba(128,128,128,.4); border-radius:10px; color:inherit; }
.dks-dialog-head { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid rgba(128,128,128,.25); }
.dks-dialog-head .dks-title { flex:1; }
.dks-dialog-body { flex:1; min-height:0; overflow:auto; padding:12px; }
.dks-md { font-size:12.5px; line-height:1.6; overflow-wrap:break-word; }
.dks-md h1,.dks-md h2,.dks-md h3,.dks-md h4,.dks-md h5,.dks-md h6 { margin:.9em 0 .4em; line-height:1.3; }
.dks-md h1 { font-size:1.35em; border-bottom:1px solid rgba(128,128,128,.25); padding-bottom:.25em; }
.dks-md h2 { font-size:1.22em; }
.dks-md h3 { font-size:1.1em; }
.dks-md h4,.dks-md h5,.dks-md h6 { font-size:1em; }
.dks-md p { margin:.45em 0; }
.dks-md ul,.dks-md ol { margin:.45em 0; padding-left:1.4em; }
.dks-md li { margin:.15em 0; }
.dks-md blockquote { margin:.5em 0; padding:.2em .8em; border-left:3px solid rgba(128,128,128,.4); opacity:.85; }
.dks-md code { font-family:ui-monospace,Consolas,monospace; font-size:.92em; background:rgba(128,128,128,.18); border-radius:4px; padding:.08em .3em; }
.dks-md pre { margin:.5em 0; background:rgba(128,128,128,.14); border:1px solid rgba(128,128,128,.22); border-radius:6px; padding:8px 10px; overflow:auto; }
.dks-md pre code { background:none; padding:0; }
.dks-md table { border-collapse:collapse; margin:.5em 0; font-size:.95em; width:100%; }
.dks-md th,.dks-md td { border:1px solid rgba(128,128,128,.3); padding:3px 7px; text-align:left; }
.dks-md th { background:rgba(128,128,128,.12); }
.dks-md hr { border:none; border-top:1px solid rgba(128,128,128,.3); margin:.8em 0; }
.dks-md a { color:inherit; }
.dks-md img { max-width:100%; border-radius:4px; }
.dks-md strong { font-weight:600; }
.dks-md em { font-style:italic; }
.dks-decision-card { border-color:rgba(126,198,153,.45); border-left:3px solid #7ec699; }
.dks-decision-badge { color:#7ec699; border-color:#7ec699; }
.dks-dec-rationale { font-size:11.5px; opacity:.7; line-height:1.5; margin-top:2px; }
.dks-dec-references { font-size:10.5px; opacity:.55; line-height:1.4; margin-top:2px; font-family:ui-monospace,Consolas,monospace; }
.dks-action-accent { border-color:rgba(126,198,153,.55); color:#7ec699; }
.dks-action-accent:hover { background:rgba(126,198,153,.15); }
.dks-action-accented { background:rgba(126,198,153,.14); color:#7ec699; cursor:default; opacity:.9; }
`;

		const STYLE_TAG_ID = "pts-denkstand-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		const COLUMN_ORDER = ["clarify", "prepare", "review", "ready", "other"];

		function esc(s) {
			return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}

		function fmtMin(m) {
			if (typeof m !== "number" || m !== m || m === null) return "";
			return m + "′";
		}

		function formatTime(totalMinutes) {
			if (typeof totalMinutes !== "number" || totalMinutes !== totalMinutes) return "";
			const h = Math.floor(totalMinutes / 60);
			const m = totalMinutes % 60;
			if (h > 0) return h + ":" + (m < 10 ? "0" : "") + m + " h";
			return m + " min";
		}

		// Copies text to the clipboard (best effort; falls back to a prompt).
		function copyText(text) {
			const onFail = function() {
				// last resort: a modal prompt so the teacher still gets the text
				try { window.prompt("Hier kopieren (Strg+C) und im Chat einfügen:", text); } catch (e) {}
			};
			if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
				navigator.clipboard.writeText(text).then(function() { return true; }, onFail);
				return true;
			}
			onFail();
			return false;
		}

		// Extract a markdown section's non-empty lines (paragraph or list text).
		function extractMdSection(content, heading) {
			const needle = String(heading).trim().toLowerCase();
			const out = [];
			let inSection = false;
			for (const line of String(content).replace(/\r\n?/g, "\n").split("\n")) {
				if (/^#{1,6}\s+/.test(line)) {
					if (inSection) break;
					if (line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === needle) { inSection = true; continue; }
					continue;
				}
				if (inSection && line.trim() !== "") out.push(line.trim());
			}
			return out;
		}

		// Keep only `- ` list items, dropping the marker.
		function mdListItems(lines) {
			return (Array.isArray(lines) ? lines : []).filter(function(l) { return /^-\s+/.test(l); }).map(function(l) { return l.replace(/^-\s+/, "").trim(); });
		}

		// A design "Open Question" that already carries a resolved marker (✔/✅/✓)
		// has been clarified by the planning -> it is a decision, not an open item.
		function isResolvedQuestion(q) {
			return /^[✅✔✓☑]\s*/.test(q) || /^\[x\]\s*/i.test(q);
		}

		function splitDesignQuestions(qs) {
			const open = [];
			const resolved = [];
			for (const q of (Array.isArray(qs) ? qs : [])) {
				if (isResolvedQuestion(q)) resolved.push(q);
				else open.push(q);
			}
			return { open: open, resolved: resolved };
		}

		// Value after a "key: value" marker (e.g. "Current focus: ..."). The
		// marker may sit mid-line (the design doc writes
		// "Status: in-reflection. Current focus: ..."), so search anywhere.
		function valueLine(content, prefix) {
			const needle = String(prefix).toLowerCase();
			for (const line of String(content).replace(/\r\n?/g, "\n").split("\n")) {
				const t = line.trim();
				const idx = t.toLowerCase().indexOf(needle);
				if (idx >= 0) return t.slice(idx + prefix.length).trim();
			}
			return "";
		}

		// First contiguous prose paragraph under a `## heading` (stops at blank
		// line, list item or another heading). Used for the pinboard "tragende
		// Aussagen".
		function sectionFirstPara(content, heading) {
			const needle = String(heading).trim().toLowerCase();
			const lines = String(content).replace(/\r\n?/g, "\n").split("\n");
			const out = [];
			let inSection = false;
			let started = false;
			for (const line of lines) {
				if (/^#{1,6}\s+/.test(line)) {
					if (inSection) break;
					if (line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === needle) { inSection = true; continue; }
					continue;
				}
				if (!inSection) continue;
				const t = line.trim();
				if (t === "") { if (started) break; continue; }
				if (/^[-*]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) { if (started) break; continue; }
				out.push(t);
				started = true;
				if (out.join(" ").length > 420) break;
			}
			return out.join(" ");
		}

		function isPlaceholder(text) {
			const t = String(text || "").trim().toLowerCase();
			return t === "" || t.startsWith("noch nicht") || t.startsWith("noch keine");
		}

		function shorten(s, n) {
			const str = String(s == null ? "" : s);
			if (str.length <= n) return str;
			return str.slice(0, n - 1).replace(/\s+$/, "") + "…";
		}

		// Markdown -> HTML (robust viewer, same as pts-artifact-panel).
		function mdEscapeHtml(s) {
			return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		}
		function mdSafeUrl(u) {
			const t = String(u).trim();
			if (/^(https?:|mailto:|#|\/)/i.test(t)) return t;
			if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t; // scheme-less = relative
			return "#";
		}
		function mdInline(s) {
			let out = mdEscapeHtml(s);
			const codes = [];
			out = out.replace(/`([^`]+)`/g, function(_, c) { codes.push("<code>" + c + "</code>"); return "\u0000" + (codes.length - 1) + "\u0000"; });
			out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function(_, alt, src) { return '<img alt="' + alt + '" src="' + mdEscapeHtml(mdSafeUrl(src)) + '" class="dks-md-img">'; });
			out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(_, txt, href) { return '<a href="' + mdEscapeHtml(mdSafeUrl(href)) + '" target="_blank" rel="noopener noreferrer">' + txt + "</a>"; });
			out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
			out = out.replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s.,;:!?)<]|$)/g, "$1<em>$2</em>");
			out = out.replace(/(^|[\s(>])_([^_\n]+)_(?=[\s.,;:!?)<]|$)/g, "$1<em>$2</em>");
			out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
			out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+)/g, function(_, pre, rawUrl) {
				let url = rawUrl; let trail = ""; const tail = url.match(/[.,;:!?)\]]+$/);
				if (tail !== null) { trail = tail[0]; url = url.slice(0, url.length - trail.length); }
				return pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>" + mdEscapeHtml(trail);
			});
			out = out.replace(/\u0000(\d+)\u0000/g, function(_, i) { return codes[Number(i)]; });
			return out;
		}
		function mdToHtml(md) {
			if (typeof md !== "string" || md === "") return "";
			const src = md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, ""); // strip YAML frontmatter
			const lines = src.replace(/\r\n?/g, "\n").split("\n");
			const html = [];
			let para = [];
			let codeFence = null;
			const listStack = [];
			function flushPara() { if (para.length > 0) { html.push("<p>" + para.map(mdInline).join("<br>") + "</p>"); para = []; } }
			function closeListFrame() { const f = listStack.pop(); html.push(f.type === "ul" ? "</li></ul>" : "</li></ol>"); }
			function closeAllLists() { while (listStack.length > 0) closeListFrame(); }
			function pushListItem(indent, type, content) {
				while (listStack.length > 0 && (listStack[listStack.length - 1].indent > indent ||
					(listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))) { closeListFrame(); }
				if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) { html.push(type === "ul" ? "<ul>" : "<ol>"); listStack.push({ type: type, indent: indent }); }
				else { html.push("</li>"); }
				html.push("<li>" + mdInline(content));
			}
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (codeFence !== null) {
					if (/^```/.test(line)) { html.push("</code></pre>"); codeFence = null; }
					else { html.push(mdEscapeHtml(line) + "\n"); }
					continue;
				}
				const fence = line.match(/^```(\w*)/);
				if (fence !== null) { flushPara(); closeAllLists(); codeFence = fence[1]; html.push("<pre><code" + (fence[1] !== "" ? ' data-lang="' + fence[1] + '"' : "") + ">"); continue; }
				const heading = line.match(/^(#{1,6})\s+(.*)$/);
				if (heading !== null) { flushPara(); closeAllLists(); const level = heading[1].length; html.push("<h" + level + ">" + mdInline(heading[2]) + "</h" + level + ">"); continue; }
				if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); closeAllLists(); html.push("<hr>"); continue; }
				const quote = line.match(/^\s*>\s?(.*)$/);
				if (quote !== null) { flushPara(); closeAllLists(); html.push("<blockquote><p>" + mdInline(quote[1]) + "</p></blockquote>"); continue; }
				if (line.indexOf("|") >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
					flushPara(); closeAllLists();
					const splitRow = function(row) { return row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function(c) { return c.trim(); }); };
					const headCells = splitRow(line);
					i += 1;
					html.push("<table><thead><tr>");
					for (const hc of headCells) html.push("<th>" + mdInline(hc) + "</th>");
					html.push("</tr></thead><tbody>");
					while (i + 1 < lines.length && lines[i + 1].indexOf("|") >= 0) {
						i += 1;
						const cells = splitRow(lines[i]);
						html.push("<tr>");
						for (const cc of cells) html.push("<td>" + mdInline(cc) + "</td>");
						html.push("</tr>");
					}
					html.push("</tbody></table>");
					continue;
				}
				const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
				if (item !== null) { flushPara(); const indent = Math.floor(item[1].replace(/\t/g, "  ").length / 2) * 2; pushListItem(indent, /\d/.test(item[2]) ? "ol" : "ul", item[3]); continue; }
				if (line.trim() === "") { flushPara(); continue; }
				para.push(line);
			}
			flushPara();
			if (codeFence !== null) html.push("</code></pre>");
			closeAllLists();
			return html.join("");
		}

		// Numbered list items of a section, e.g. Educational Intention:
		//   1. **Leitidee** — Ausführende Aussage.
		// Returns [{ label, text }] (label = the bolded "tragende Aussage").
		function numberedAccents(content, heading) {
			const needle = String(heading).trim().toLowerCase();
			const lines = String(content).replace(/\r\n?/g, "\n").split("\n");
			const out = [];
			let inS = false;
			for (const line of lines) {
				if (/^#{1,6}\s+/.test(line)) {
					if (inS) break;
					if (line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === needle) { inS = true; continue; }
					continue;
				}
				if (!inS) continue;
				const t = line.trim();
				const m = t.match(/^\d+[.)]\s+(\*\*[^*]+\*\*)?\s*(?:—|[-:])?\s*(.*)$/);
				if (m !== null && (m[1] !== undefined || m[2] !== "")) {
					out.push({ label: m[1] ? m[1].replace(/\*\*/g, "").trim() : "", text: m[2].trim() });
				}
			}
			return out;
		}

		// Builds a teacher-ready chat prompt for a board action.
		function buildPrompt(action, item) {
			const desc = typeof item.description === "string" && item.description.trim() !== ""
				? item.description.trim()
				: item.title;
			if (action === "approve") {
				return "Ich akzeptiere den Vorschlag auf dem Planning Board (ID " + item.id + "):\n" +
					desc + "\nBitte setze das als Lehrkraft-Freigabe um (planning-board/decisions).";
			}
			if (action === "discard") {
				return "Verwirf die Klärung auf dem Planning Board (ID " + item.id + "):\n" +
					desc + "\nSie ist für die weitere Planung nicht mehr relevant — bitte entferne sie aus dem Planning Board und halte kurz fest, warum sie verworfen wurde.";
			}
			// clarify
			return "Lass uns die offene Klärung entscheiden (Planning Board, ID " + item.id + "):\n" +
				desc + "\nWas ist dein Vorschlag?";
		}

		function BoardColumn(props) {
			const col = props.col;
			const label = props.label;
			const items = Array.isArray(props.items) ? props.items : [];
			const onSelect = props.onSelect;
			const selectedKey = props.selectedKey;
			const onSetDraft = props.onSetDraft;
			const cards = items.map(function(it, idx) {
				// Unique selection identity: Board IDs are not guaranteed unique in
				// planning-board.yml, so key selection by (column, index).
				const cardKey = col + "::" + idx;
				const children = [
					React.createElement("div", { key: "t", className: "dks-card-title" }, it.title),
					React.createElement("div", { key: "m", className: "dks-card-meta" },
						React.createElement("span", { className: "dks-badge" }, it.kind_label),
						React.createElement("span", { className: "dks-badge" }, it.status_label)),
				];
				const desc = typeof it.description === "string" ? it.description.trim() : "";
				if (desc !== "") {
					children.push(React.createElement("div", { key: "d", className: "dks-card-note" }, desc));
				}
				if (typeof it.summary === "string" && it.summary.trim() !== "" && it.summary !== "—") {
					children.push(React.createElement("div", { key: "s", className: "dks-card-note" }, it.summary));
				}
				if (it.requires_teacher_approval === true) {
					const itIsQuestion = it.kind === "clarify";
					children.push(React.createElement("div", { key: "a", className: "dks-approval dks-approval-yes" },
						itIsQuestion ? "Entscheidung offen" : "Freigabe erforderlich"));
				}
				// Action row directly on the card: set the chat draft (no copy/paste).
				// Kind-aware: a Klärung (open question) gets Klären/Verwerfen —
				// "Annehmen" fits a proposal only, never a question.
				if (typeof onSetDraft === "function") {
					const itIsQuestion = it.kind === "clarify";
					const mkBtn = function(label, prompt, title, cls) {
						return React.createElement("button", {
							className: cls || "dks-action-btn",
							title: title,
							onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); onSetDraft(prompt); },
						}, label);
					};
					const itActions = itIsQuestion
						? [mkBtn("💬 Klären", buildPrompt("clarify", it), "Prompt ins Chat-Input setzen — Frage im Gespräch klären"),
							mkBtn("✕ Verwerfen", buildPrompt("discard", it), "Prompt ins Chat-Input setzen — Klärung verwerfen")]
						: [mkBtn("✓ Annehmen", buildPrompt("approve", it), "Prompt ins Chat-Input setzen — Freigabe vorschlagen", "dks-action-btn dks-action-approve"),
							mkBtn("💬 Klären", buildPrompt("clarify", it), "Prompt ins Chat-Input setzen — Frage klären")];
					children.push(React.createElement("div", { key: "ax", className: "dks-card-actions" },
						itActions));
				}
				const cls = "dks-card" + (selectedKey === cardKey ? " dks-card-selected" : "");
				return React.createElement("div", {
					key: cardKey,
					className: cls,
					role: "button",
					tabIndex: 0,
					title: it.title,
					onClick: function() { if (typeof onSelect === "function") onSelect(cardKey); },
					onKeyDown: function(e) {
						if ((e.key === "Enter" || e.key === " ") && typeof onSelect === "function") {
							e.preventDefault();
							onSelect(cardKey);
						}
					},
				}, children);
			});
			return React.createElement("div", { className: "dks-col" },
				React.createElement("div", { className: "dks-col-head" },
					React.createElement("span", null, label),
					React.createElement("span", { className: "dks-col-count" }, "(" + items.length + ")")),
				cards.length === 0
					? React.createElement("div", { className: "dks-note" }, "—")
					: cards);
		}

		function BoardView(props) {
			const board = props.board;
			const columns = board && typeof board === "object" && board.columns ? board.columns : {};
			const selState = React.useState(null);
			const selectedKey = selState[0];
			const setSelectedKey = selState[1];
			const colEls = [];
			for (let c = 0; c < COLUMN_ORDER.length; c++) {
				const key = COLUMN_ORDER[c];
				const label = key === "other"
					? "Sonstiges"
					: ({ clarify: "Klären", prepare: "Vorbereiten", review: "Auswerten", ready: "Bereit" }[key] || key);
				if (!(key in columns)) continue;
				colEls.push(React.createElement(BoardColumn, {
					key: key,
					col: key,
					label: label,
					items: columns[key],
					selectedKey: selectedKey,
					onSelect: setSelectedKey,
					onSetDraft: props.onSetDraft,
				}));
			}
			return React.createElement("div", { className: "dks-section" },
				React.createElement("div", { className: "dks-columns" },
					colEls.length === 0
						? React.createElement("div", { className: "dks-note" }, "Noch keine Planungs-Punkte.")
						: colEls));
		}

		function TimelineView(props) {
			const temporal = props.temporal;
			if (!temporal || temporal.empty) {
				return React.createElement("div", { className: "dks-empty" },
					"Noch keine Timeline (temporal-plan.yml). Platzierungen entstehen im Gespräch und erscheinen hier, sobald sie festgehalten sind.");
			}
			const wins = Array.isArray(temporal.windows) ? temporal.windows : [];
			const els = wins.map(function(w, idx) {
				const placements = Array.isArray(w.placements) ? w.placements : [];
				const pEls = placements.map(function(p, pIdx) {
					const time = (typeof p.start_minute === "number" ? formatTime(p.start_minute) : "") +
						(p.duration_minutes != null ? " → +" + fmtMin(p.duration_minutes) : "");
					return React.createElement("div", { key: p.id + "-" + pIdx, className: "dks-placement" },
						React.createElement("span", { className: "dks-placement-time" }, time || "?"),
						React.createElement("span", { className: "dks-badge" }, p.role_label),
						React.createElement("span", { className: "dks-badge" }, p.mode_label),
						React.createElement("span", null, p.moment_id || "?"),
						p.note ? React.createElement("span", { className: "dks-note" }, "· " + p.note) : null);
				});
				return React.createElement("div", { key: w.id || idx, className: "dks-win" },
					React.createElement("div", { className: "dks-win-head" },
						React.createElement("span", { className: "dks-win-title" }, w.title),
						React.createElement("span", { className: "dks-badge" }, w.kind_label),
						w.duration_minutes != null
							? React.createElement("span", { className: "dks-note" }, formatTime(w.duration_minutes))
							: null),
					pEls.length === 0
						? React.createElement("div", { className: "dks-note" }, "Keine Platzierungen in diesem Fenster.")
						: pEls);
			});
			return React.createElement("div", { className: "dks-timeline" }, els);
		}

		function DecisionsView(props) {
			const decisions = props.decisions;
			const design = props.design;
			const designDecisions = Array.isArray(design && design.decisions) ? design.decisions : [];
			const hasYml = decisions !== null && decisions !== undefined && decisions.empty !== true;
			const hasDesign = designDecisions.length > 0;
			const children = [];
			if (hasYml) {
				children.push(React.createElement("div", { key: "yml", className: "dks-section" },
					React.createElement("div", { className: "dks-section-title" }, "Entscheidungen (decisions.yml)"),
					decisions.decisions.map(function(d, idx) {
						const inner = [React.createElement("div", { key: "t", className: "dks-dec-title" }, d.title)];
						if (d.detail) inner.push(React.createElement("div", { key: "d", className: "dks-dec-detail" }, d.detail));
						return React.createElement("div", { key: d.id || idx, className: "dks-decision" }, inner);
					})));
			} else {
				children.push(React.createElement("div", { key: "empty", className: "dks-empty" },
					"Noch keine Entscheidung festgehalten (decisions.yml)."));
			}
			// The design-doc "Design Decisions" summary is a mirror of decisions.yml;
			// only show it as a fallback when decisions.yml is empty, to avoid
			// showing the same decisions twice (the "two states" confusion).
			if (hasDesign && !hasYml) {
				children.push(React.createElement("div", { key: "design", className: "dks-decision" },
					React.createElement("div", { className: "dks-dec-title" }, "Im Learning Design festgehalten"),
					designDecisions.map(function(d, i) { return React.createElement("div", { key: i, className: "dks-dec-detail" }, "• " + d); })));
			}
			children.push(React.createElement("div", { key: "note", className: "dks-note" },
				"Entscheidungen werden in decisions.yml festgehalten (kanonisch; kein paralleles decisions.md)." +
				" Offene, noch nicht beantwortete Fragen stehen im Learning Design („Open Questions“) und werden dort beantwortet (Einverstanden/Verwerfen)."));
			return React.createElement("div", { className: "dks-section" }, children);
		}

		function buildMomentQuestionPrompt(m, q) {
			return "Lass uns die offene Frage zum Lernmoment " + (m.id || "") + " „" + (m.title || "unbenannt") + "“ klären:\n" +
				q + "\nWas ist dein Vorschlag?";
		}

		function buildDesignQuestionPrompt(q) {
			return "Lass uns die offene Frage aus dem Learning Design klären:\n" +
				q + "\nWas ist dein Vorschlag?";
		}

		function isBoardItemSettled(it) {
			// "resolved/beantwortet" (steward's answered-clarification status) and
			// every prefix of it count as settled — such items leave the open queue.
			const s = String(it && it.status ? it.status : "").toLowerCase();
			return s === "approved" || s === "ready" || s === "discarded" || s.startsWith("resolved");
		}

		// The single most actionable board item: a Klärung (decide) beats an
		// approval-required proposal (accept). Settled items are ignored.
		function nextBoardStep(board) {
			const cols = board !== null && board !== undefined && typeof board === "object" && board.columns ? board.columns : {};
			const all = [];
			for (let c = 0; c < COLUMN_ORDER.length; c++) {
				const items = cols[COLUMN_ORDER[c]] || [];
				for (let i = 0; i < items.length; i++) all.push(items[i]);
			}
			const actionable = all.filter(function(it) { return !isBoardItemSettled(it); });
			const clarify = actionable.find(function(it) { return it.kind === "clarify"; });
			if (clarify !== undefined) {
				return { kind: "clarify", action: "💬 Entscheiden", title: clarify.title, desc: (typeof clarify.description === "string" && clarify.description.trim() !== "" ? clarify.description.trim() : ""), prompt: buildPrompt("clarify", clarify) };
			}
			const approval = actionable.find(function(it) { return it.requires_teacher_approval === true; });
			if (approval !== undefined) {
				return { kind: "approve", action: "✓ Annehmen", title: approval.title, desc: (typeof approval.description === "string" && approval.description.trim() !== "" ? approval.description.trim() : ""), prompt: buildPrompt("approve", approval) };
			}
			return null;
		}

		// Determines exactly ONE "next step". Priority: a board Klärung/Antrag,
		// then a Learning-Design open question, then the first open moment
		// question. Falls back to null (nothing urgent).
		function computeNextStep(board, moments, design) {
			const fromBoard = nextBoardStep(board);
			if (fromBoard !== null) return fromBoard;
			const dq = splitDesignQuestions(Array.isArray(design && design.open_questions) ? design.open_questions : []).open;
			if (dq.length > 0) {
				return { kind: "question", action: "💬 Besprechen", title: "Offene Frage im Learning Design", desc: dq[0], prompt: buildDesignQuestionPrompt(dq[0]) };
			}
			for (const m of (Array.isArray(moments) ? moments : [])) {
				const qs = Array.isArray(m.open_questions) ? m.open_questions : [];
				if (qs.length > 0) {
					return { kind: "question", action: "💬 Zum Moment", title: m.title || m.id, desc: qs[0], prompt: buildMomentQuestionPrompt(m, qs[0]) };
				}
			}
			return null;
		}

		function NextStepCard(props) {
			const step = props.step;
			if (step === null) {
				return React.createElement("div", { className: "dks-nohint" },
					"Kein dringender nächster Schritt — alles ist entscheidungsreif. Schau gern ins Planning Board.");
			}
			const children = [
				React.createElement("div", { key: "l", className: "dks-nextstep-label" }, "Nächster Schritt"),
				React.createElement("div", { key: "t", className: "dks-card-title" }, esc(step.title)),
			];
			if (step.desc !== "") {
				children.push(React.createElement("div", { key: "d", className: "dks-nextstep-desc" }, esc(step.desc)));
			}
			children.push(React.createElement("div", { key: "a", className: "dks-card-actions" },
				React.createElement("button", {
					className: step.kind === "approve" ? "dks-action-btn dks-action-approve" : "dks-action-btn",
					title: "Prompt ins Chat-Input setzen",
					onClick: function() { if (typeof props.onSetDraft === "function") props.onSetDraft(step.prompt); },
				}, step.action)));
			return React.createElement("div", { className: "dks-nextstep" }, children);
		}

		function OpenQuestionItem(props) {
			const it = props.item;
			const children = [
				React.createElement("div", { key: "t", className: "dks-card-title" }, esc(it.title)),
				React.createElement("div", { key: "x", className: "dks-openq-text" }, esc(it.text)),
			];
			children.push(React.createElement("div", { key: "a", className: "dks-card-actions" },
				React.createElement("button", {
					className: "dks-action-btn",
					title: "Prompt ins Chat-Input setzen",
					onClick: function() { if (typeof props.onAction === "function") props.onAction(it.prompt); },
				}, it.action)));
			return React.createElement("div", { className: "dks-openq" }, children);
		}

		// A design "Open Question" with an explicit path: clarify (move to the
		// planning board's Klären column), agree (accept -> decision) or discard.
		function DesignQuestionItem(props) {
			const q = props.q;
			const children = [
				React.createElement("div", { key: "t", className: "dks-card-title" }, "Offene Frage im Learning Design"),
				React.createElement("div", { key: "x", className: "dks-openq-text" }, esc(q)),
			];
			children.push(React.createElement("div", { key: "a", className: "dks-card-actions" },
				React.createElement("button", {
					className: "dks-action-btn",
					title: "Die Frage in den Klären-Bereich (Planning Board) verschieben",
					onClick: function() { props.onClarify(q); },
				}, "💬 Klären"),
				React.createElement("button", {
					className: "dks-action-btn dks-action-approve",
					title: "Frage mit „ja“ beantworten → als Entscheidung im Denkstand festhalten",
					onClick: function() { props.onAccept(q); },
				}, "✓ Einverstanden"),
				React.createElement("button", {
					className: "dks-action-btn",
					title: "Frage verwerfen (nicht mehr relevant)",
					onClick: function() { props.onDiscard(q); },
				}, "✕ Verwerfen")));
			return React.createElement("div", { className: "dks-openq" }, children);
		}

		function OpenQuestionsPanel(props) {
			const moments = props.moments;
			const designOpen = Array.isArray(props.designOpen) ? props.designOpen : [];
			const onAction = props.onAction;
			const onResolve = props.onResolve;
			const momCollapsedState = React.useState(true);
			const momCollapsed = momCollapsedState[0];
			const setMomCollapsed = momCollapsedState[1];

			const momentBounds = [];
			for (const m of (Array.isArray(moments) ? moments : [])) {
				const qs = Array.isArray(m.open_questions) ? m.open_questions : [];
				for (const q of qs) momentBounds.push({ title: m.title || m.id, text: q, prompt: buildMomentQuestionPrompt(m, q) });
			}
			if (designOpen.length === 0 && momentBounds.length === 0) {
				return React.createElement("div", { className: "dks-empty" },
					"Aktuell keine offenen Fragen. Offene Klärungen/Entscheidungen siehst du im Planning Board.");
			}
			const childEls = [
				React.createElement("div", { key: "note", className: "dks-note" },
					"Zwei verschiedene Arten offener Punkte — nicht dasselbe: (1) „Offene Fragen“ stehen im Learning Design und verarbeitest du hier (Klären → Planning Board, Einverstanden → Entscheidung, Verwerfen); (2) „Fragen am Lernmoment“ hängen am jeweiligen Moment (Tab Lernlandschaft). Bereits geklärte Fragen (✔) sind als Entscheidung in decisions.yml festgehalten."),
			];
			if (designOpen.length > 0) {
				childEls.push(React.createElement("div", { key: "sub-dq", className: "dks-subgroup" },
					React.createElement("div", { className: "dks-section-title" }, "Offene Fragen (Learning Design)"),
					designOpen.map(function(q, i) {
						return React.createElement(DesignQuestionItem, {
							key: "dq-" + i,
							q: q,
							onClarify: function(x) { onResolve(x, "clarify"); },
							onAccept: function(x) { onResolve(x, "accept"); },
							onDiscard: function(x) { onResolve(x, "discard"); },
						});
					})));
			}
			if (momentBounds.length > 0) {
				childEls.push(React.createElement("div", { key: "sub-mom", className: "dks-subgroup" },
					React.createElement("div", { className: "dks-group-head", onClick: function() { setMomCollapsed(!momCollapsed); } },
						React.createElement("span", null, momCollapsed ? "▸" : "▾"),
						React.createElement("span", { className: "dks-section-title", style: { marginBottom: 0 } }, "Fragen am Lernmoment (" + momentBounds.length + ")"),
						React.createElement("span", { className: "dks-note" }, "im Tab Lernlandschaft am Moment")),
					momCollapsed
						? null
						: momentBounds.map(function(it, i) {
							return React.createElement(OpenQuestionItem, { key: "me-" + i, item: { title: it.title, text: it.text, action: "💬 Zum Moment", prompt: it.prompt }, onAction: onAction });
						})));
			}
			return React.createElement("div", { className: "dks-section" }, childEls);
		}

		// "Wo wir gerade gedanklich dran sind" — pinboard of the most
		// forward-carrying statements. These are the concrete "tragende Aussagen":
		// the Leitideen of the Educational Intention (numbered accents) and the
		// board working hypotheses. Not the long prose trims.
		function buildThoughtCards(design, board) {
			const cards = [];
			for (const a of (Array.isArray(design && design.accents) ? design.accents : [])) {
				cards.push({ badge: "Leitidee", title: a.label, text: (a.text || "").trim() });
			}
			const cols = board !== null && board !== undefined && typeof board === "object" && board.columns ? board.columns : {};
			for (const key of Object.keys(cols)) {
				for (const it of cols[key]) {
					if (typeof it.summary === "string" && it.summary.trim() !== "" && it.summary !== "—") {
						cards.push({ badge: "Hypothese", title: "", text: it.summary });
					}
				}
			}
			return cards;
		}

		function DecisionCard(props) {
			const d = props.d;
			const onAccent = props.onAccent;
			const onSetDraft = props.onSetDraft;
			const accented = props.accented === true;
			const children = [
				React.createElement("div", { key: "m", className: "dks-card-meta" },
					React.createElement("span", { className: "dks-badge dks-decision-badge" }, "Entscheidung"),
					d.id ? React.createElement("span", { className: "dks-badge" }, esc(d.id)) : null,
					d.status ? React.createElement("span", { className: "dks-badge" }, esc(d.status)) : null),
				React.createElement("div", { key: "t", className: "dks-card-title" }, esc(d.title)),
			];
			if (d.detail) children.push(React.createElement("div", { key: "d", className: "dks-card-note" }, esc(d.detail)));
			if (d.rationale) children.push(React.createElement("div", { key: "r", className: "dks-dec-rationale" }, "Begründung: " + esc(d.rationale)));
			if (d.references && d.references.length > 0) children.push(React.createElement("div", { key: "refs", className: "dks-dec-references" }, esc("Bezug: " + d.references.join(" · "))));
			children.push(React.createElement("div", { key: "ax", className: "dks-card-actions" },
				React.createElement("button", {
					className: "dks-action-btn dks-action-accent" + (accented ? " dks-action-accented" : ""),
					title: accented
						? "Steht bereits als Leitidee unter „Educational Intention“ im Learning Design"
						: "Diese Entscheidung als Leitidee (Akzent) ins Learning Design übernehmen",
					onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); if (!accented && typeof onAccent === "function") onAccent(d); },
				}, accented ? "♥ Leitidee" : "♡ Leitidee"),
				React.createElement("button", {
					className: "dks-action-btn",
					title: "Prompt ins Chat-Input setzen — Umsetzung im Gespräch anstoßen",
					onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); if (typeof onSetDraft === "function") onSetDraft(buildDecisionPrompt(d)); },
				}, "⚡ Jetzt umsetzen")));
			return React.createElement("div", { className: "dks-thought-card dks-decision-card" }, children);
		}

		// Teacher-ready chat prompt to carry a decision into implementation.
		function buildDecisionPrompt(d) {
			return "Setze die Entscheidung \"" + (d.title || "") + "\" um:\n" +
				(d.detail || "") +
				(d.rationale ? "\nBegründung: " + d.rationale : "") +
				(d.references && d.references.length > 0 ? "\nBezug: " + d.references.join("; ") : "") +
				"\nWas ist der nächste konkrete Schritt, und welche Worker-Aufgabe leitest du daraus ab?";
		}

		function ThoughtBoard(props) {
			const design = props.design;
			const board = props.board;
			const thoughts = props.thoughts;
			const votes = thoughts && thoughts.votes ? thoughts.votes : {};
			const onVote = props.onVote;
			const openDesign = props.openDesign;
			const onAccent = props.onAccent;
			const onSetDraft = props.onSetDraft;
			const decisions = props.decisions;
			const decisionList = (decisions !== null && decisions !== undefined && decisions.empty !== true) ? decisions.decisions : [];
			// Titles already carried as Leitidee accents in the Learning Design —
			// the heart button shows its taken state from this (no extra state).
			const accentTitles = (Array.isArray(design && design.accents) ? design.accents : [])
				.map(function(a) { return String(a && a.label ? a.label : "").trim().toLowerCase(); })
				.filter(function(t) { return t !== ""; });
			const cards = buildThoughtCards(design, board);
			const scored = cards.map(function(c, i) {
				return { badge: c.badge, title: c.title || "", text: c.text, votes: typeof votes[c.text] === "number" ? votes[c.text] : 0, idx: i };
			});
			scored.sort(function(a, b) { return (b.votes - a.votes) || (a.idx - b.idx); });
			const els = scored.map(function(c, i) {
				return React.createElement("div", { key: i, className: "dks-thought-card" },
					React.createElement("span", { className: "dks-badge dks-thought-badge" }, esc(c.badge)),
					c.title
						? React.createElement("div", { className: "dks-card-title" }, esc(c.title))
						: null,
					React.createElement("div", { className: "dks-thought-text", title: c.text }, esc(c.text)),
					React.createElement("div", { className: "dks-thought-vote" },
						React.createElement("button", { className: "dks-vote-btn", title: "Wichtiger machen", onClick: function() { onVote(c.text, 1); } }, "▲"),
						React.createElement("span", { className: "dks-vote-count" }, String(c.votes)),
						React.createElement("button", { className: "dks-vote-btn", title: "Weniger wichtig", onClick: function() { onVote(c.text, -1); } }, "▼")));
			});
			const decisionEls = decisionList.map(function(d) {
				return React.createElement(DecisionCard, {
					key: (d.id || ("d-" + d.title)) + "-" + (d.detail || "").slice(0, 8),
					d: d,
					onAccent: onAccent,
					onSetDraft: onSetDraft,
					accented: accentTitles.indexOf(String(d.title || "").trim().toLowerCase()) >= 0,
				});
			});
			return React.createElement("div", { className: "dks-thought" },
				React.createElement("div", { className: "dks-section-title" }, "Wo wir gerade gedanklich dran sind"),
				design && design.focus && !isPlaceholder(design.focus)
					? React.createElement("div", { className: "dks-thought-focus" },
						React.createElement("div", { className: "dks-thought-focus-label" }, "Aktueller Fokus"),
						React.createElement("div", { className: "dks-thought-focus-text" }, esc(design.focus)))
					: null,
				React.createElement("div", { className: "dks-subgroup" },
					React.createElement("div", { className: "dks-section-title" }, "Tragende Aussagen"),
					els.length === 0
						? React.createElement("div", { className: "dks-note" }, "Noch keine tragenden Aussagen (Leitideen, Hypothesen) — sie erscheinen, sobald im Learning Design Inhalte stehen.")
						: els),
				decisionList.length > 0
					? React.createElement("div", { className: "dks-subgroup" },
						React.createElement("div", { className: "dks-section-title" }, "Entscheidungen (decisions.yml)"),
						decisionEls)
					: null,
				React.createElement("button", { className: "dks-thought-link", onClick: openDesign }, "Zum vollständigen Learning Design →"));
		}

		// "Klären" — the planning board's Klären column (the clarification queue),
		// plus a collapsible view of the other board columns. The settled
		// decisions (decisions.yml) now live as cards in the first column.
		function ClarifyPanel(props) {
			const board = props.board;
			const onSetDraft = props.onSetDraft;
			const cols = board !== null && board !== undefined && typeof board === "object" && board.columns ? board.columns : {};
			const allClarify = cols["clarify"] || [];
			// Settled clarifications (resolved/answered etc.) leave the open queue:
			// they render collapsed below, without action buttons.
			const clarify = allClarify.filter(function(it) { return !isBoardItemSettled(it); });
			const settledClarify = allClarify.filter(isBoardItemSettled);
			const settledState = React.useState(true);
			const settledCollapsed = settledState[0];
			const setSettledCollapsed = settledState[1];
			const otherKeys = COLUMN_ORDER.filter(function(k) { return k !== "clarify" && k !== "other" && Array.isArray(cols[k]) && cols[k].length > 0; });
			const otherState = React.useState(true);
			const otherCollapsed = otherState[0];
			const setOtherCollapsed = otherState[1];

			const els = clarify.map(function(it, idx) {
				// A Klärung is an open QUESTION, not a proposal: it can be decided
				// (💬 Klären) or dropped (✕ Verwerfen) — never "accepted". ✓ Annehmen
				// is reserved for real proposals (e.g. a material draft to approve).
				const isQuestion = it.kind === "clarify";
				const children = [
					React.createElement("div", { key: "t", className: "dks-card-title" }, esc(it.title)),
					React.createElement("div", { key: "m", className: "dks-card-meta" },
						React.createElement("span", { className: "dks-badge" }, esc(it.kind_label)),
						React.createElement("span", { className: "dks-badge" }, esc(it.status_label))),
				];
				const desc = typeof it.description === "string" ? it.description.trim() : "";
				if (desc !== "") children.push(React.createElement("div", { key: "d", className: "dks-card-note" }, desc));
				if (it.requires_teacher_approval === true) children.push(React.createElement("div", { key: "a", className: "dks-approval dks-approval-yes" }, isQuestion ? "Entscheidung offen" : "Freigabe erforderlich"));
				const btn = function(label, prompt, title, cls) {
					return React.createElement("button", {
						className: cls || "dks-action-btn",
						title: title,
						onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); onSetDraft(prompt); },
					}, label);
				};
				const actions = isQuestion
					? [btn("💬 Klären", buildPrompt("clarify", it), "Prompt ins Chat-Input setzen — Frage im Gespräch klären"),
						btn("✕ Verwerfen", buildPrompt("discard", it), "Prompt ins Chat-Input setzen — Klärung verwerfen")]
					: [btn("✓ Annehmen", buildPrompt("approve", it), "Prompt ins Chat-Input setzen — Freigabe vorschlagen", "dks-action-btn dks-action-approve"),
						btn("💬 Klären", buildPrompt("clarify", it), "Prompt ins Chat-Input setzen — Frage klären")];
				children.push(React.createElement("div", { key: "ax", className: "dks-card-actions" },
					actions));
				return React.createElement("div", { key: it.id || idx, className: "dks-card" }, children);
			});

			const otherEls = otherKeys.length > 0
				? React.createElement("div", { className: "dks-subgroup" },
					React.createElement("div", { className: "dks-group-head", onClick: function() { setOtherCollapsed(!otherCollapsed); } },
						React.createElement("span", null, otherCollapsed ? "▸" : "▾"),
						React.createElement("span", { className: "dks-section-title", style: { marginBottom: 0 } }, "Weitere Spalten (" + otherKeys.length + ")")),
					otherCollapsed ? null : otherKeys.map(function(k) {
						const label = ({ prepare: "Vorbereiten", review: "Auswerten", ready: "Bereit" }[k] || k);
						return React.createElement("div", { key: k, className: "dks-openq" },
							React.createElement("div", { className: "dks-card-title" }, label),
							cols[k].map(function(it, idx) {
								return React.createElement("div", { key: it.id || idx, className: "dks-card-note" }, "• " + esc(it.title));
							}));
					}))
				: null;

			// Settled clarifications, collapsed below the open queue — visible as
			// archive, without action buttons (nothing left to decide).
			const settledEls = settledClarify.length === 0 ? null : React.createElement("div", { className: "dks-subgroup" },
				React.createElement("div", { className: "dks-group-head", onClick: function() { setSettledCollapsed(!settledCollapsed); } },
					React.createElement("span", null, settledCollapsed ? "▸" : "▾"),
					React.createElement("span", { className: "dks-section-title", style: { marginBottom: 0 } }, "Erledigt (" + settledClarify.length + ")")),
				settledCollapsed ? null : settledClarify.map(function(it, idx) {
					return React.createElement("div", { key: (it.id || "s") + "-" + idx, className: "dks-openq" },
						React.createElement("div", { className: "dks-card-title" }, "✔ " + esc(it.title)),
						React.createElement("div", { className: "dks-card-meta" },
							React.createElement("span", { className: "dks-badge" }, esc(it.status_label))));
				}));

			return React.createElement("div", { className: "dks-clarify" },
				React.createElement("div", { className: "dks-section-title" }, "Klären"),
				els.length === 0
					? React.createElement("div", { className: "dks-note" }, "Keine offenen Klärungen. Verschiebe eine Frage mit „Klären“ hierher.")
					: React.createElement("div", { className: "dks-columns" },
						React.createElement("div", { className: "dks-col" },
							React.createElement("div", { className: "dks-col-head" },
								React.createElement("span", null, "Klären"),
								React.createElement("span", { className: "dks-col-count" }, "(" + clarify.length + ")")),
							els)),
				otherEls,
				settledEls);
		}

		function DesignDocModal(props) {
			const content = props.content;
			const onClose = props.onClose;
			return React.createElement("div", { className: "dks-overlay", onClick: onClose },
				React.createElement("div", { className: "dks-dialog", onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); } },
					React.createElement("div", { className: "dks-dialog-head" },
						React.createElement("span", { className: "dks-title" }, "Learning Design (vollständig)"),
						React.createElement("button", { className: "dks-btn", onClick: onClose }, "Schließen")),
					React.createElement("div", { className: "dks-dialog-body" },
						React.createElement("div", { className: "dks-md", dangerouslySetInnerHTML: { __html: mdToHtml(content) } }))));
		}

		function DenkstandView(props) {
			const sessionId = props !== null && props !== undefined && typeof props.sessionId === "string" ? props.sessionId : null;
			const dataState = React.useState(null);
			const data = dataState[0];
			const setData = dataState[1];
			const errState = React.useState(null);
			const error = errState[0];
			const setError = errState[1];
			const feedbackState = React.useState(null);
			const feedback = feedbackState[0];
			const setFeedback = feedbackState[1];
			const momentsState = React.useState([]);
			const moments = momentsState[0];
			const setMoments = momentsState[1];
			const designState = React.useState({ open_questions: [], decisions: [] });
			const design = designState[0];
			const setDesign = designState[1];
			const designDocState = React.useState(null);
			const designDoc = designDocState[0];
			const setDesignDoc = designDocState[1];

			function load() {
				const sid = sessionId === null ? "" : sessionId;
				const url = "/api/pts-denkstand?sessionId=" + encodeURIComponent(sid);
				fetch(url).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function(v) {
					setData(v);
					setError(null);
				}).catch(function(e) {
					setError(String(e && e.message ? e.message : e));
				});
				// Landscape moments carry the per-moment "Offene Fragen" (the
				// denkstand route only reads the three YAML control files). This
				// is best-effort: if the landscape plugin or file is missing, the
				// panel degrades to board clarifications only.
				fetch("/api/pts-landscape?sessionId=" + encodeURIComponent(sid)).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						return { res: res, v: v };
					});
				}).then(function(r) {
					if (r.res.ok && r.v !== null && Array.isArray(r.v.moments)) setMoments(r.v.moments);
					else setMoments([]);
				}).catch(function() { setMoments([]); });
				// Learning-design.md holds the design-level "Open Questions" and
				// "Design Decisions" (distinct from decisions.yml). Fetch the raw
				// file via the landscape editor route and parse both sections.
				fetch("/api/pts-artifact/raw?sessionId=" + encodeURIComponent(sid) + "&file=" + encodeURIComponent("learning-design.md")).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						return { res: res, v: v };
					});
				}).then(function(r) {
					if (r.res.ok && r.v !== null && typeof r.v.content === "string") {
						const content = r.v.content;
						setDesign({
							focus: valueLine(content, "Current focus:"),
							accents: numberedAccents(content, "Educational Intention"),
							open_questions: mdListItems(extractMdSection(content, "Open Questions")),
							decisions: mdListItems(extractMdSection(content, "Design Decisions")),
						});
					}
				}).catch(function() { /* best effort */ });
			}

			React.useEffect(function() {
				load();
				// Auto-refresh so board/timeline/decisions reflect approvals done in
				// the chat without a manual "Aktualisieren" click. Cleared on unmount.
				const timer = setInterval(load, 5000);
				return function() { clearInterval(timer); };
			}, [sessionId]);

			if (error !== null) {
				return React.createElement("div", { className: "dks-root" },
					React.createElement("div", { className: "dks-errmsg" },
						"Denkstand konnte nicht geladen werden: " + error));
			}
			if (data === null) {
				return React.createElement("div", { className: "dks-root" },
					React.createElement("div", { className: "dks-note" }, "Lade Denkstand…"));
			}

			const board = data.board;
			const temporal = data.temporal;
			const decisions = data.decisions;
			const errors = Array.isArray(data.errors) ? data.errors : [];
			const dqSplit = splitDesignQuestions(design.open_questions);
			const errEls = errors.map(function(e, i) {
				return React.createElement("div", { key: i, className: "dks-errmsg" },
					e.file + ": " + e.message);
			});

			// The standard session kit hands every conversation.view occupant
			// `inputActions` (setDraft/submit). Use it to write the prompt into the
			// chat input directly — no copy/paste, no host round-trip. Because the
			// buttons live on other view tabs, switching back to the chat tab is
			// part of the flow: the tab buttons run the shipped `setView` action,
			// so a synthetic click on the first tab (chat, order 0) rides the same
			// code path as a user click — no foreign store is written.
			const inputActions = props !== null && props !== undefined ? props.inputActions : undefined;
			const switchToChat = function() {
				try {
					if (typeof document === "undefined") return false;
					const lists = document.querySelectorAll("div[role=tablist]");
					for (const list of lists) {
						const tabs = list.querySelectorAll("button[role=tab]");
						if (tabs.length < 2) continue;
						const first = tabs[0];
						const active = list.querySelector('button[role=tab][aria-selected="true"]');
						if (first !== undefined && first !== null && active !== null && active !== first) {
							first.click();
							return true;
						}
						return false;
					}
				} catch (e) { /* degrade: teacher switches the tab manually */ }
				return false;
			};
			const setDraftFn = function(text) {
				if (inputActions !== undefined && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					window.dispatchEvent(new CustomEvent("pts:open-companion"));
					setFeedback("Prompt ins Chat-Input übernommen — dort kannst du ihn senden.");
				} else {
					copyText(text);
					setFeedback("Chat-Input nicht erreichbar — Prompt kopiert; bitte im Chat einfügen.");
				}
			};

			// Teacher decides a Learning-Design "Open Question": accept answers it
			// and removes it from the open list (no auto-decision — an open
			// question is not itself a decision); discard removes it as no longer
			// relevant; clarify moves it to the planning board.
			const resolveQuestion = function(question, action) {
				fetch("/api/pts-denkstand/design-question", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, question: question, action: action }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setFeedback(action === "accept"
						? "Frage beantwortet und aus den offenen Fragen entfernt. Die Antwort gehört ins Learning Design (Leitideen/Zusammenhang); wird sie zu einer verbindlichen Entscheidung, hält decisions.yml sie fest."
						: action === "clarify"
							? "Zur Klärung ins Planning Board („Klären“) verschoben — aus den offenen Fragen entfernt."
							: "Frage verworfen — aus den offenen Fragen entfernt.");
					load();
				}).catch(function(e) {
					setError("Frage: " + String(e && e.message ? e.message : e));
				});
			};

			// Pinboard vote: adjust the importance count for one statement.
			const voteThought = function(statement, delta) {
				fetch("/api/pts-denkstand/thoughts", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, statement: statement, delta: delta }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					load();
				}).catch(function(e) {
					setError("Vote: " + String(e && e.message ? e.message : e));
				});
			};

			// Decision → Leitidee: add the decision as a numbered accent under
			// "## Educational Intention" (idempotent server-side), then refresh so
			// the heart turns and the pinboard shows the new Leitidee.
			const promoteAccent = function(d) {
				fetch("/api/pts-denkstand/decision-accent", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, title: d.title || "", text: d.detail || "" }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function(v) {
					setFeedback(v && v.added === true
						? "Als Leitidee unter „Educational Intention“ ins Learning Design übernommen."
						: "Nicht übernommen: " + (v && typeof v.reason === "string" && v.reason !== "" ? v.reason : "unbekannter Grund") + ".");
					load();
				}).catch(function(e) {
					setError("Leitidee: " + String(e && e.message ? e.message : e));
				});
			};

			// View the full learning-design.md in a read-only modal ("link").
			const openDesign = function() {
				fetch("/api/pts-artifact/raw?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId) + "&file=" + encodeURIComponent("learning-design.md"))
					.then(function(res) {
						return res.text().then(function(body) {
							let v = null;
							try { v = JSON.parse(body); } catch (e) { v = null; }
							return { res: res, v: v };
						});
					}).then(function(r) {
						if (r.res.ok && r.v !== null && typeof r.v.content === "string") setDesignDoc(r.v.content);
						else setError("Learning Design: " + (r.v && r.v.error ? r.v.error : "HTTP " + r.res.status));
					}).catch(function(e) {
						setError("Learning Design: " + String(e && e.message ? e.message : e));
					});
			};

			return React.createElement("div", { className: "dks-root" },
				React.createElement("div", { className: "dks-toolbar" },
					React.createElement("span", { className: "dks-title" }, "Denkstand"),
					React.createElement("span", { className: "dks-note" }, "Planung, Klärungen und Entscheidungen - die Lernlandschaft (Momente, Stunden) liegt im Tab „Lernlandschaft“."),
					React.createElement("button", { className: "dks-btn", onClick: load }, "Aktualisieren")),
				React.createElement("div", { className: "dks-path" }, data.root || ""),
				errEls.length > 0 ? errEls : null,
				feedback !== null
					? React.createElement("div", { className: "dks-action-ok" }, feedback)
					: null,
				React.createElement("div", { className: "dks-threerow" },
					React.createElement(ThoughtBoard, { design: design, board: board, thoughts: data.thoughts, decisions: decisions, onVote: voteThought, onAccent: promoteAccent, onSetDraft: setDraftFn, openDesign: openDesign }),
					React.createElement(ClarifyPanel, { board: board, onSetDraft: setDraftFn }),
					React.createElement("div", { className: "dks-openq-col" },
						React.createElement(OpenQuestionsPanel, { moments: moments, designOpen: dqSplit.open, onAction: setDraftFn, onResolve: resolveQuestion }))),
				designDoc !== null
					? React.createElement(DesignDocModal, { content: designDoc, onClose: function() { setDesignDoc(null); } })
					: null);
		}

		return {
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("conversation.view", function() {
					ctx.slots.register(
						{ name: "conversation.view", id: "denkstand", order: 40, label: "Denkstand" },
						function(props) { return React.createElement(DenkstandView, props); },
					);
				});
			},
		};
	},
});
