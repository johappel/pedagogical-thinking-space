// pts-artifact-panel — client half (browser).
//
// Served as a classic script through the dsh client-modules roster and
// registered into window.__ModuleLoader__ exactly like the shipped bundles.
//
// Surfaces:
//  - "Artefakte" list entry in conversation.view (gallery tab)
//  - takeover of the whole right "details" column: chrome + artifact mode
//    (fed by an in-bundle bridge) + direct DetailsTool call body
//  - takeover of the turn-tail produced-files chips: clicking a previewable
//    produced file opens it in the details column instead of externally
//
// Data layer: plain same-origin fetch against /artifacts/v2/* (host half).

window.__ModuleLoader__.load({
	id: "pts-artifact-panel",
	factory: (require) => {
		const React = require("react");
		const runtimeClient = require("@deepseek-ai/dsh-client-runtime/client");

		const CSS = `
.apx-root { display:flex; flex-direction:column; gap:12px; height:100%; min-height:0; overflow:auto; padding:12px; box-sizing:border-box; }
.apx-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.apx-title { font-weight:600; font-size:13px; opacity:.85; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.apx-count { font-size:12px; opacity:.6; }
.apx-btn { border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; border-radius:6px; padding:3px 10px; font-size:12px; cursor:pointer; white-space:nowrap; }
.apx-btn:hover { background:rgba(128,128,128,.15); }
.apx-errmsg { color:#e06c75; white-space:pre-wrap; word-break:break-word; }
.apx-note { opacity:.65; font-size:12px; line-height:1.5; }
.apx-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:8px; }
.apx-card { display:flex; flex-direction:column; align-items:flex-start; gap:5px; text-align:left; border:1px solid rgba(128,128,128,.3); border-radius:8px; padding:10px; background:rgba(128,128,128,.06); cursor:pointer; color:inherit; font:inherit; }
.apx-card:hover { border-color:rgba(128,128,128,.6); background:rgba(128,128,128,.12); }
.apx-card-name { font-weight:600; font-size:12.5px; word-break:break-all; }
.apx-card-meta { display:flex; gap:6px; align-items:center; font-size:11px; opacity:.75; flex-wrap:wrap; }
.apx-badge { border:1px solid rgba(128,128,128,.35); border-radius:4px; padding:0 5px; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
.apx-previewwrap { display:flex; flex-direction:column; gap:8px; min-height:420px; flex:1; }
.apx-preview-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.apx-path { font-size:11px; opacity:.55; word-break:break-all; }
.apx-frame { width:100%; flex:1; min-height:400px; border:1px solid rgba(128,128,128,.3); border-radius:8px; background:#fff; }
.apx-imgwrap { display:flex; justify-content:center; align-items:flex-start; overflow:auto; border:1px solid rgba(128,128,128,.3); border-radius:8px; padding:10px; box-sizing:border-box; background:rgba(128,128,128,.06); }
.apx-img { max-width:100%; height:auto; border-radius:4px; }
.apx-md { margin:0; white-space:pre-wrap; word-break:break-word; font-size:12.5px; line-height:1.55; border:1px solid rgba(128,128,128,.3); border-radius:8px; padding:12px; background:rgba(128,128,128,.06); max-height:70vh; overflow:auto; }
.apx-details { display:flex; flex-direction:column; gap:10px; min-width:0; }
.apx-dhead { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.apx-dtool { font-weight:600; font-size:13px; }
.apx-status { font-size:11px; border-radius:4px; padding:1px 6px; border:1px solid rgba(128,128,128,.35); }
.apx-st-ok { color:#7ec699; }
.apx-st-run { color:#d19a66; }
.apx-st-err { color:#e06c75; }
.apx-sec { display:flex; flex-direction:column; gap:4px; min-width:0; }
.apx-sechead { font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.55; }
.apx-out { margin:0; white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.5; background:rgba(128,128,128,.08); border:1px solid rgba(128,128,128,.25); border-radius:6px; padding:8px 10px; max-height:340px; overflow:auto; }
.apx-dpanel { display:flex; flex-direction:column; height:100%; min-height:0; }
.apx-dphead { display:flex; align-items:center; gap:8px; padding:10px 12px 8px; border-bottom:1px solid rgba(128,128,128,.25); flex:none; }
.apx-dpbody { flex:1; min-height:0; overflow:auto; padding:12px; display:flex; flex-direction:column; }
.apx-dpclose { margin-left:auto; border:1px solid rgba(128,128,128,.35); background:transparent; color:inherit; border-radius:6px; width:24px; height:24px; line-height:1; cursor:pointer; font-size:13px; }
.apx-dpclose:hover { background:rgba(128,128,128,.15); }
.apx-chiprow { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:2px 0 6px; }
.apx-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(128,128,128,.35); background:rgba(128,128,128,.06); color:inherit; border-radius:999px; padding:3px 10px 3px 7px; font-size:11.5px; cursor:pointer; max-width:260px; }
.apx-chip:hover { border-color:rgba(128,128,128,.65); background:rgba(128,128,128,.14); }
.apx-chip-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.apx-empty { margin:auto; text-align:center; opacity:.6; font-size:12.5px; line-height:1.7; padding:24px; }
.apx-mdc { font-size:12.5px; line-height:1.6; overflow-wrap:break-word; max-height:70vh; overflow:auto; border:1px solid rgba(128,128,128,.25); border-radius:8px; padding:12px 14px; background:rgba(128,128,128,.05); }
.apx-mdc h1,.apx-mdc h2,.apx-mdc h3,.apx-mdc h4,.apx-mdc h5,.apx-mdc h6 { margin:.9em 0 .4em; line-height:1.3; }
.apx-mdc h1 { font-size:1.35em; border-bottom:1px solid rgba(128,128,128,.25); padding-bottom:.25em; }
.apx-mdc h2 { font-size:1.22em; }
.apx-mdc h3 { font-size:1.1em; }
.apx-mdc h4,.apx-mdc h5,.apx-mdc h6 { font-size:1em; }
.apx-mdc p { margin:.45em 0; }
.apx-mdc ul,.apx-mdc ol { margin:.45em 0; padding-left:1.4em; }
.apx-mdc li { margin:.15em 0; }
.apx-mdc blockquote { margin:.5em 0; padding:.2em .8em; border-left:3px solid rgba(128,128,128,.4); opacity:.85; }
.apx-mdc code { font-family:ui-monospace,Consolas,monospace; font-size:.92em; background:rgba(128,128,128,.18); border-radius:4px; padding:.08em .3em; }
.apx-mdc pre { margin:.5em 0; background:rgba(128,128,128,.14); border:1px solid rgba(128,128,128,.22); border-radius:6px; padding:8px 10px; overflow:auto; }
.apx-mdc pre code { background:none; padding:0; }
.apx-mdc table { border-collapse:collapse; margin:.5em 0; font-size:.95em; width:100%; }
.apx-mdc th,.apx-mdc td { border:1px solid rgba(128,128,128,.3); padding:3px 7px; text-align:left; }
.apx-mdc th { background:rgba(128,128,128,.12); }
.apx-mdc hr { border:none; border-top:1px solid rgba(128,128,128,.3); margin:.8em 0; }
.apx-mdc a { color:inherit; }
.apx-mdc img { max-width:100%; border-radius:4px; }
`;

		const STYLE_TAG_ID = "pts-artifact-panel-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		const PREVIEW_EXTS = [".md", ".markdown", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".html", ".htm"];
		const KIND_LABEL = { pdf: "PDF", image: "Bild", html: "HTML", markdown: "Markdown", file: "Datei" };

		function normPath(p) {
			return String(p).replace(/\\/g, "/");
		}
		function extOf(p) {
			const i = p.lastIndexOf(".");
			return i >= 0 ? p.slice(i).toLowerCase() : "";
		}
		function kindOf(ext) {
			if (ext === ".pdf") return "pdf";
			if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].indexOf(ext) >= 0) return "image";
			if (ext === ".html" || ext === ".htm") return "html";
			return "markdown";
		}
		function basename(p) {
			return p.slice(p.lastIndexOf("/") + 1);
		}

		// ------------------------------------------------------------------
		// Subagent-produced artifacts (pts_material / pts_edit / pts_document /
		// pts_renderer). DSH's own deliverables accumulator only registers files
		// from direct write/edit tool cards (diff/edit locations), so files a
		// worker SUBAGENT creates never become produced chips or clickable inline
		// mentions. We register a parallel conversation accumulator that scans
		// tool-result text for PTS artifact paths and merges them into the chips.
		// ------------------------------------------------------------------
		const PTS_PRODUCED_KEY = "pts-produced";
		const PTS_ARTIFACT_LOCATION_RE = /(?:materials|drafts|knowledge-proposals|rendered)[\\/][^\s`()\[\],;]+\.(?:md|markdown|pdf|png|jpg|jpeg|gif|webp|svg|html|htm)\b/gi;
		function extractArtifactPaths(text) {
			const out = [];
			const seen = new Set();
			const re = new RegExp(PTS_ARTIFACT_LOCATION_RE.source, "gi");
			let m;
			while ((m = re.exec(String(text))) !== null) {
				const p = normPath(m[0].replace(/[.,;:!?)\]]+$/, ""));
				if (seen.has(p)) continue;
				seen.add(p);
				out.push(p);
			}
			return out;
		}
		const ptsProducedDefinition = {
			kind: "pts-produced",
			match: (event) => {
				if (event.type === "turn/start") return { id: String(event.data.turn), role: "start" };
				if (event.type === "tool/result" && runtimeClient.isAppendSurfaceEvent(event)) {
					return { id: String(event.data.turn), role: "update" };
				}
				return null;
			},
			start: (_context, match) => ({ turn: match.event.data.turn, produced: [] }),
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				const content = Array.isArray(match.event.data.message.content) ? match.event.data.message.content : [];
				if (content[0] !== null && content[0] !== undefined && content[0].isError === true) return context.state;
				const text = content
					.filter((b) => b !== null && typeof b === "object" && (b.kind === "text" || b.type === "text") && typeof b.text === "string")
					.map((b) => b.text)
					.join("\n");
				const additions = extractArtifactPaths(text).map((path) => ({
					seq: match.event.seq,
					path,
				}));
				return additions.length === 0 ? context.state : {
					...context.state,
					produced: [...context.state.produced, ...additions],
				};
			},
			buildLocationData: (context, scope) => (scope !== "turn" || context.state === undefined)
				? null
				: { kind: "turn", turn: context.state.turn, key: PTS_PRODUCED_KEY, value: { produced: context.state.produced } },
		};

		// Deterministic fallback: the closing assistant message of this turn
		// names the produced artifact (e.g. "materials/arbeitsblatt-….md").
		// Background subagent results can settle outside the turn/seq window the
		// event accumulators track, so we also read the closing text directly.
		function turnClosingText(owner) {
			try {
				const tt = owner.turn.data.get("turn-tail");
				const closing = tt !== null && tt !== undefined ? tt.closing : null;
				const blocks = Array.isArray(closing !== null && closing !== undefined ? closing.blocks : null)
					? closing.blocks
					: [];
				return blocks
					.filter((b) => b !== null && typeof b === "object" && (b.kind === "text" || b.type === "text") && typeof b.text === "string")
					.map((b) => b.text)
					.join("\n");
			} catch (e) {
				return "";
			}
		}
		function fileUrl(p, cwd) {
			let u = "/artifacts/v2/file?p=" + encodeURIComponent(normPath(p));
			if (typeof cwd === "string" && cwd !== "") u += "&cwd=" + encodeURIComponent(normPath(cwd));
			return u;
		}
		function fmtSize(size) {
			if (typeof size !== "number" || size !== size) return "";
			if (size < 1024) return size + " B";
			if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
			return (size / (1024 * 1024)).toFixed(1) + " MB";
		}

		// ------------------------------------------------------------------
		// Minimal safe markdown -> HTML renderer (no dependencies).
		// Order matters: escape EVERYTHING first, then build tags from the
		// escaped text; link/image URLs pass a scheme whitelist.
		// ------------------------------------------------------------------
		function escapeHtml(s) {
			return String(s)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;");
		}
		function safeUrl(u) {
			const t = String(u).trim();
			if (/^(https?:|mailto:|#|\/)/i.test(t)) return t;
			if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t; // scheme-less = relative
			return "#";
		}
		function inlineMd(s) {
			let out = escapeHtml(s);
			const codes = [];
			out = out.replace(/`([^`]+)`/g, function(_, c) {
				codes.push("<code>" + c + "</code>");
				return "\u0000" + (codes.length - 1) + "\u0000";
			});
			out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function(_, alt, src) {
				return '<img alt="' + alt + '" src="' + escapeHtml(safeUrl(src)) + '" class="apx-mdc-img">';
			});
			out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(_, txt, href) {
				return '<a href="' + escapeHtml(safeUrl(href)) + '" target="_blank" rel="noopener noreferrer">' + txt + "</a>";
			});
			out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
			out = out.replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s.,;:!?)<]|$)/g, "$1<em>$2</em>");
			out = out.replace(/(^|[\s(>])_([^_\n]+)_(?=[\s.,;:!?)<]|$)/g, "$1<em>$2</em>");
			out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
			out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+)/g, function(_, pre, rawUrl) {
				let url = rawUrl;
				let trail = "";
				const tail = url.match(/[.,;:!?)\]]+$/);
				if (tail !== null) {
					trail = tail[0];
					url = url.slice(0, url.length - trail.length);
				}
				return pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>" + escapeHtml(trail);
			});
			out = out.replace(/\u0000(\d+)\u0000/g, function(_, i) {
				return codes[Number(i)];
			});
			return out;
		}
		function mdToHtml(md) {
			if (typeof md !== "string" || md === "") return "";
			const lines = md.replace(/\r\n?/g, "\n").split("\n");
			const html = [];
			let para = [];
			let codeFence = null;
			const listStack = [];
			function flushPara() {
				if (para.length > 0) {
					html.push("<p>" + para.map(inlineMd).join("<br>") + "</p>");
					para = [];
				}
			}
			function closeListFrame() {
				const f = listStack.pop();
				html.push(f.type === "ul" ? "</li></ul>" : "</li></ol>");
			}
			function closeAllLists() {
				while (listStack.length > 0) closeListFrame();
			}
			function pushListItem(indent, type, content) {
				while (listStack.length > 0 && (listStack[listStack.length - 1].indent > indent ||
					(listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))) {
					closeListFrame();
				}
				if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
					html.push(type === "ul" ? "<ul>" : "<ol>");
					listStack.push({ type: type, indent: indent });
				} else {
					html.push("</li>");
				}
				html.push("<li>" + inlineMd(content));
			}
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (codeFence !== null) {
					if (/^```/.test(line)) {
						html.push("</code></pre>");
						codeFence = null;
					} else {
						html.push(escapeHtml(line) + "\n");
					}
					continue;
				}
				const fence = line.match(/^```(\w*)/);
				if (fence !== null) {
					flushPara();
					closeAllLists();
					codeFence = fence[1];
					html.push("<pre><code" + (fence[1] !== "" ? ' data-lang="' + fence[1] + '"' : "") + ">");
					continue;
				}
				const heading = line.match(/^(#{1,6})\s+(.*)$/);
				if (heading !== null) {
					flushPara();
					closeAllLists();
					const level = heading[1].length;
					html.push("<h" + level + ">" + inlineMd(heading[2]) + "</h" + level + ">");
					continue;
				}
				if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
					flushPara();
					closeAllLists();
					html.push("<hr>");
					continue;
				}
				const quote = line.match(/^\s*>\s?(.*)$/);
				if (quote !== null) {
					flushPara();
					closeAllLists();
					html.push("<blockquote><p>" + inlineMd(quote[1]) + "</p></blockquote>");
					continue;
				}
				// table: current row with pipes AND next row is a separator
				if (line.indexOf("|") >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
					flushPara();
					closeAllLists();
					const splitRow = function(row) {
						return row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function(c) { return c.trim(); });
					};
					const headCells = splitRow(line);
					i += 1; // skip separator
					html.push("<table><thead><tr>");
					for (const hc of headCells) html.push("<th>" + inlineMd(hc) + "</th>");
					html.push("</tr></thead><tbody>");
					while (i + 1 < lines.length && lines[i + 1].indexOf("|") >= 0) {
						i += 1;
						const cells = splitRow(lines[i]);
						html.push("<tr>");
						for (const cc of cells) html.push("<td>" + inlineMd(cc) + "</td>");
						html.push("</tr>");
					}
					html.push("</tbody></table>");
					continue;
				}
				const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
				if (item !== null) {
					flushPara();
					const indent = Math.floor(item[1].replace(/\t/g, "  ").length / 2) * 2;
					pushListItem(indent, /\d/.test(item[2]) ? "ol" : "ul", item[3]);
					continue;
				}
				if (line.trim() === "") {
					flushPara();
					continue;
				}
				para.push(line);
			}
			flushPara();
			if (codeFence !== null) html.push("</code></pre>");
			closeAllLists();
			return html.join("");
		}

		async function fetchJson(url) {
			const res = await fetch(url);
			const body = await res.text();
			let value = null;
			try {
				value = JSON.parse(body);
			} catch (e) {
				value = null;
			}
			if (!res.ok) throw new Error(value !== null && value !== undefined && typeof value === "object" && typeof value.error === "string" ? value.error : "HTTP " + res.status);
			return value;
		}

		// ------------------------------------------------------------------
		// In-bundle bridge: produced-file chips -> details column artifact mode.
		// ------------------------------------------------------------------
		let bridgeArtifact = null;
		const bridgeSubs = new Set();
		function setBridgeArtifact(next) {
			bridgeArtifact = next;
			const subs = Array.from(bridgeSubs);
			for (let i = 0; i < subs.length; i++) {
				try { subs[i](next); } catch (e) { /* listener errors must not break others */ }
			}
		}
		function subscribeBridge(fn) {
			bridgeSubs.add(fn);
			return function() { bridgeSubs.delete(fn); };
		}

		// Downloads the artifact through the host route and saves it under its
		// basename via a temporary object-URL anchor (works for all MIME kinds).
		function triggerDownload(path, cwd, onError) {
			const url = fileUrl(path, cwd);
			fetch(url).then(function(res) {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.blob();
			}).then(function(blob) {
				const objUrl = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = objUrl;
				anchor.download = basename(normPath(path));
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
				setTimeout(function() { URL.revokeObjectURL(objUrl); }, 10000);
			}).catch(function(e) {
				console.error("[pts-artifact-panel] download failed:", e);
				if (typeof onError === "function") onError(e);
			});
		}

		// ------------------------------------------------------------------
		// Shared preview component
		// ------------------------------------------------------------------
		function ArtifactPreview(props) {
			const artifact = props.artifact;
			const cwd = typeof props.cwd === "string" ? props.cwd : null;
			const isText = artifact.kind === "markdown";
			const textState = React.useState(null);
			const text = textState[0];
			const setText = textState[1];
			const errState = React.useState(null);
			const err = errState[0];
			const setErr = errState[1];
			React.useEffect(function() {
				if (!isText) return undefined;
				let alive = true;
				setText(null);
				setErr(null);
				const url = "/artifacts/v2/text?p=" + encodeURIComponent(normPath(artifact.path)) +
					(cwd !== null ? "&cwd=" + encodeURIComponent(normPath(cwd)) : "");
				fetchJson(url).then(function(r) {
					if (alive) setText(r !== null && typeof r === "object" && typeof r.text === "string" ? r.text : "");
				}).catch(function(e) {
					if (alive) setErr(String(e && e.message ? e.message : e));
				});
				return function() { alive = false; };
			}, [artifact.path, isText, cwd]);

			if (artifact.kind === "image") {
				return React.createElement("div", { className: "apx-imgwrap" },
					React.createElement("img", { className: "apx-img", src: fileUrl(artifact.path, cwd), alt: artifact.name }));
			}
			if (artifact.kind === "pdf" || artifact.kind === "html") {
				return React.createElement("iframe", { className: "apx-frame", src: fileUrl(artifact.path, cwd), title: artifact.name });
			}
			if (err !== null) return React.createElement("div", { className: "apx-note apx-errmsg" }, "Lesefehler: " + err);
			if (text === null) return React.createElement("div", { className: "apx-note" }, "Lade\u2026");
			return React.createElement("div", {
				className: "apx-mdc",
				dangerouslySetInnerHTML: { __html: mdToHtml(text) },
			});
		}

		// ------------------------------------------------------------------
		// Tool-call body (occupies conversation.details.tool under our column)
		// ------------------------------------------------------------------
		function ContentBlocksView(props) {
			const blocks = Array.isArray(props.blocks) ? props.blocks : [];
			const parts = [];
			for (let i = 0; i < blocks.length; i++) {
				const b = blocks[i];
				if (b !== null && typeof b === "object" && b.type === "text" && typeof b.text === "string") {
					parts.push(React.createElement("pre", { key: i, className: "apx-out" }, b.text));
				} else if (b !== null && typeof b === "object" && b.type === "image") {
					parts.push(React.createElement("div", { key: i, className: "apx-note" }, "[Bild-Anhang im Ergebnis]"));
				} else {
					const t = b !== null && typeof b === "object" && typeof b.type === "string" ? b.type : "block";
					parts.push(React.createElement("div", { key: i, className: "apx-note" }, "[" + t + "]"));
				}
			}
			if (parts.length === 0) parts.push(React.createElement("div", { key: "none", className: "apx-note" }, "(kein Text-Output)"));
			return React.createElement("div", null, parts);
		}

		function pathFromArgs(args) {
			if (args === null || typeof args !== "object") return null;
			if (typeof args.file_path === "string") return args.file_path;
			if (typeof args.path === "string") return args.path;
			return null;
		}

		function DetailsTool(props) {
			const block = props.block;
			const cwd = typeof props.cwd === "string" ? props.cwd : null;
			const settled = block !== null && block !== undefined && typeof block === "object" && block.kind === "tool-result";
			const running = !settled;
			const call = settled && block.call !== null && block.call !== undefined ? block.call : null;
			const name = settled ? (call !== null ? call.name : "(unbekannt)") : (block !== null && block !== undefined ? block.name : "?");
			const isError = settled && block.isError === true;
			const argsRaw = settled ? (call !== null ? call.argsRaw : "") : (block !== null && block !== undefined && typeof block.argsRaw === "string" ? block.argsRaw : "");
			let args = null;
			if (typeof argsRaw === "string" && argsRaw !== "") {
				try { args = JSON.parse(argsRaw); } catch (e) { args = null; }
			}
			const p = pathFromArgs(args);
			const raw = p !== null ? normPath(p) : null;
			const ext = raw !== null ? extOf(raw) : "";
			const previewable = raw !== null && PREVIEW_EXTS.indexOf(ext) >= 0 && !running && !isError;

			const statusClass = running ? "apx-status apx-st-run" : (isError ? "apx-status apx-st-err" : "apx-status apx-st-ok");
			const statusText = running ? "l\u00e4uft\u2026" : (isError ? "Fehler" : "fertig");

			const children = [
				React.createElement("div", { key: "head", className: "apx-dhead" },
					React.createElement("span", { className: "apx-dtool" }, name),
					React.createElement("span", { className: statusClass }, statusText)),
			];

			if (previewable) {
				children.push(React.createElement("div", { key: "pth", className: "apx-dhead" },
					React.createElement("span", { className: "apx-path" }, raw),
					React.createElement("button", {
						className: "apx-btn",
						title: "Datei herunterladen",
						onClick: function() { triggerDownload(raw, cwd); },
					}, "\u2B07 Herunterladen")));
				children.push(React.createElement(ArtifactPreview, {
					key: "pvw",
					cwd: cwd,
					artifact: { path: raw, name: basename(raw), ext: ext, kind: kindOf(ext), size: null },
				}));
			} else {
				if (args !== null && typeof args === "object") {
					children.push(React.createElement("div", { key: "in", className: "apx-sec" },
						React.createElement("div", { className: "apx-sechead" }, "Eingabe"),
						React.createElement("pre", { className: "apx-out" }, JSON.stringify(args, null, 2))));
				} else if (typeof argsRaw === "string" && argsRaw !== "") {
					children.push(React.createElement("div", { key: "in", className: "apx-sec" },
						React.createElement("div", { className: "apx-sechead" }, "Eingabe"),
						React.createElement("pre", { className: "apx-out" }, argsRaw)));
				}
				if (settled) {
					children.push(React.createElement("div", { key: "out", className: "apx-sec" },
						React.createElement("div", { className: "apx-sechead" }, "Ergebnis"),
						React.createElement(ContentBlocksView, { blocks: block.content })));
				}
			}
			return React.createElement("div", { className: "apx-details" }, children);
		}

		// ------------------------------------------------------------------
		// Snapshot material resolution (faithful port of ui-conversation's
		// internal findToolCall/materialFor so the taken-over details column
		// can feed the child slot exactly like the shipped panel did).
		// ------------------------------------------------------------------
		function shallowEq(a, b) {
			return runtimeClient.shallowEqual(a, b);
		}
		function toolNode(node) {
			return node !== null && node !== undefined && node.kind === "tool-call" ? node : undefined;
		}
		function findToolCall(snapshot, callId) {
			const visit = function(block) {
				if (block.callId === callId) return block;
				const subs = block.subCalls;
				if (Array.isArray(subs)) {
					for (let i = 0; i < subs.length; i++) {
						const found = visit(subs[i]);
						if (found !== undefined) return found;
					}
				}
				return undefined;
			};
			const values = snapshot.chat.nodes.values();
			for (const node of values) {
				const tn = toolNode(node);
				const root = tn === undefined ? undefined : tn.data.root;
				if (root === undefined) continue;
				const found = visit(root);
				if (found !== undefined) return found;
			}
			return undefined;
		}
		function materialFor(snapshot, callId) {
			const found = findToolCall(snapshot, callId);
			if (found === undefined) return null;
			if ("kind" in found) {
				return { name: found.call !== null && found.call !== undefined ? found.call.name : callId, block: found };
			}
			return { name: found.name, block: found };
		}
		function rawResultText(block) {
			if (typeof block !== "object" || block === null || !("kind" in block)) return "";
			const content = Array.isArray(block.content) ? block.content : [];
			const parts = [];
			for (let i = 0; i < content.length; i++) {
				const item = content[i];
				parts.push(item !== null && item !== undefined && item.type === "text" && typeof item.text === "string" ? item.text : JSON.stringify(item, null, 2));
			}
			if (parts.length === 0 && block.error !== undefined) parts.push(String(block.error.name) + ": " + String(block.error.code));
			return parts.join("\n");
		}

		// ------------------------------------------------------------------
		// Native selection channel (READ-ONLY): ui-conversation's chat store
		// persists every change to localStorage under
		//   dsh.conversation.chat.<sessionId>
		// (createSnapshotStore.attachPersistence: rehydrate + write-through per
		// update). We poll that key to observe tool-card selections without
		// touching their private store instance.
		// ------------------------------------------------------------------
		function readPersistedSelection(sessionId) {
			if (typeof localStorage === "undefined" || sessionId === null || sessionId === undefined || sessionId === "") return null;
			try {
				const raw = localStorage.getItem("dsh.conversation.chat." + String(sessionId));
				if (raw === null || typeof raw !== "string" || raw === "") return null;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object" || parsed.selection === null || parsed.selection === undefined) return null;
				const sel = parsed.selection;
				return sel !== null && typeof sel === "object" && sel.callId !== undefined && sel.callId !== null ? String(sel.callId) : null;
			} catch (e) {
				return null;
			}
		}

		// Captured panel-action service (set in apply) so chips can open the
		// details column; the column itself is our taken-over seat.
		let layoutService = null;

		// ------------------------------------------------------------------
		// Details COLUMN takeover: chrome + artifact mode + tool body.
		// Registered at priority -1 ("lowest renders"); the shipped DetailsPanel
		// stays registered underneath at 0. We do NOT declare the child slot
		// (declarations are exclusive — the shipped entry already owns
		// conversation.details.tool) and we do NOT dispatch through renderSlot
		// (its binding requires the own children table). The call body renders
		// our DetailsTool directly, which is the same component that occupied
		// that child seat anyway.
		// ------------------------------------------------------------------
		function ArtifactDetailsPanel(props) {
			const useSession = props.useSession;
			const useSessions = props.useSessions;
			const sessionId = props.sessionId;
			const closeDetails = props.closeDetails;

			// Selection: poll the persisted chat-store key (read-only observation).
			const selState = React.useState(function() { return readPersistedSelection(sessionId); });
			const callId = selState[0];
			const setCallId = selState[1];
			React.useEffect(function() {
				let last = readPersistedSelection(sessionId);
				setCallId(last);
				const timer = setInterval(function() {
					const next = readPersistedSelection(sessionId);
					if (next !== last) {
						last = next;
						setCallId(next);
					}
				}, 300);
				return function() { clearInterval(timer); };
			}, [sessionId]);

			const sessionCwd = useSessions(function(list) {
				const entry = list.byId[sessionId];
				return entry !== null && entry !== undefined && typeof entry.cwd === "string" ? entry.cwd : null;
			});
			const material = useSession(function(s) {
				return callId === null ? null : materialFor(s, callId);
			}, shallowEq);

			const artState = React.useState(null);
			const artifact = artState[0];
			const setArtifact = artState[1];
			React.useEffect(function() { return subscribeBridge(setArtifact); }, []);
			React.useEffect(function() {
				if (artifact !== null && callId !== null) setArtifact(null);
			}, [callId]);

			let title = "Details";
			if (artifact !== null) title = basename(artifact.path);
			else if (material !== null) title = material.name !== undefined && material.name !== null ? material.name : "Details";

			const headChildren = [
				React.createElement("span", { key: "t", className: "apx-title", title: title }, title),
				React.createElement("button", {
					key: "x",
					className: "apx-dpclose",
					"aria-label": "Panel schlie\u00dfen",
					title: "Panel schlie\u00dfen",
					onClick: function() { if (typeof closeDetails === "function") closeDetails(); },
				}, "\u00d7"),
			];

			// Back button: with a selected call it returns to that call's view;
			// without one it closes the whole column (unambiguous labels).
			const backButton = callId !== null
				? React.createElement("button", {
					key: "back",
					className: "apx-btn",
					onClick: function() { setArtifact(null); },
				}, "\u2190 Zur\u00fcck zum Aufruf")
				: React.createElement("button", {
					key: "back",
					className: "apx-btn",
					onClick: function() { if (typeof closeDetails === "function") closeDetails(); },
				}, "\u2715 Schlie\u00dfen");

			let body;
			if (artifact !== null) {
				body = React.createElement("div", { key: "art", className: "apx-previewwrap" },
					React.createElement("div", { className: "apx-preview-head" },
						backButton,
						React.createElement("button", {
							className: "apx-btn",
							title: "Datei herunterladen",
							onClick: function() {
								triggerDownload(artifact.path, sessionCwd);
							},
						}, "\u2B07 Herunterladen")),
					React.createElement("div", { className: "apx-path" }, artifact.path),
					React.createElement(ArtifactPreview, {
						cwd: sessionCwd,
						artifact: {
							path: artifact.path,
							name: basename(artifact.path),
							ext: extOf(artifact.path),
							kind: kindOf(extOf(artifact.path)),
							size: null,
						},
					}));
			} else if (material !== null) {
				body = React.createElement(DetailsTool, { block: material.block, cwd: sessionCwd });
			} else {
				body = React.createElement("div", { className: "apx-empty" },
					"Kein Aufruf ausgew\u00e4hlt.", React.createElement("br"),
					"Klicke einen Tool-Call im Chat oder eine produzierte Datei, um sie hier zu sehen.");
			}

			return React.createElement("div", { className: "apx-dpanel" },
				React.createElement("div", { className: "apx-dphead" }, headChildren),
				React.createElement("div", { className: "apx-dpbody" }, body));
		}

		// ------------------------------------------------------------------
		// Turn-tail produced-file chips (chain entry shadowing ProducedFiles).
		// Select declines unless at least one produced path is previewable,
		// so purely non-artifact turns fall back to the shipped row.
		// ------------------------------------------------------------------
		function selectProducedArtifacts(owner) {
			let data = null;
			try {
				data = owner.turn.data.get("deliverables");
			} catch (e) {
				data = null;
			}
			let pts = null;
			try {
				pts = owner.turn.data.get(PTS_PRODUCED_KEY);
			} catch (e) {
				pts = null;
			}
			const produced = [];
			if (data !== null && data !== undefined && Array.isArray(data.produced)) produced.push(...data.produced);
			if (pts !== null && pts !== undefined && Array.isArray(pts.produced)) produced.push(...pts.produced);
			// Deterministic fallback: any artifact path the Companion named in the
			// closing message becomes a chip too (seq 0 so it is never dropped by
			// the late-settlement filter for background subagent results).
			for (const p of extractArtifactPaths(turnClosingText(owner))) {
				produced.push({ seq: 0, path: p });
			}
			const seq = owner.seq;
			const paths = [];
			const seen = new Set();
			for (let i = 0; i < produced.length; i++) {
				const entry = produced[i];
				if (entry.seq > seq || seen.has(entry.path)) continue;
				seen.add(entry.path);
				paths.push(entry.path);
			}
			if (paths.length === 0) return null;
			let previewable = 0;
			for (let j = 0; j < paths.length; j++) {
				if (PREVIEW_EXTS.indexOf(extOf(normPath(paths[j]))) >= 0) previewable++;
			}
			if (previewable === 0) return null;
			return paths;
		}
		function ProducedArtifacts(props) {
			const paths = Array.isArray(props.matched) ? props.matched : [];
			const openFile = props.openFile;
			const chips = [];
			for (let i = 0; i < paths.length; i++) {
				(function(raw) {
					const p = normPath(raw);
					const ext = extOf(p);
					const previewable = PREVIEW_EXTS.indexOf(ext) >= 0;
					chips.push(React.createElement("button", {
						key: raw,
						className: "apx-chip",
						title: previewable ? raw + " \u2014 im Details-Panel \u00f6ffnen" : raw,
						onClick: function() {
							if (previewable) {
								setBridgeArtifact({ path: p });
								if (layoutService !== null && typeof layoutService.openDetails === "function") layoutService.openDetails();
							} else if (typeof openFile === "function") openFile(raw);
						},
					},
						React.createElement("span", { className: "apx-badge" }, KIND_LABEL[previewable ? kindOf(ext) : "file"]),
						React.createElement("span", { className: "apx-chip-name" }, basename(p))));
				})(paths[i]);
			}
			if (chips.length === 0) return null;
			return React.createElement("div", { className: "apx-chiprow" }, chips);
		}

		// ------------------------------------------------------------------
		// Gallery tab (conversation.view list entry)
		// ------------------------------------------------------------------
		function ArtifactsView(props) {
			const sessionId = props !== null && props !== undefined && typeof props.sessionId === "string" ? props.sessionId : null;
			const itemsState = React.useState(null);
			const items = itemsState[0];
			const setItems = itemsState[1];
			const rootState = React.useState(null);
			const activeRoot = rootState[0];
			const setActiveRoot = rootState[1];
			const selState = React.useState(null);
			const selectedPath = selState[0];
			const setSelectedPath = selState[1];
			const errState = React.useState(null);
			const error = errState[0];
			const setError = errState[1];

			React.useEffect(function() {
				let alive = true;
				function load() {
					const url = "/artifacts/v2/list?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId);
					fetchJson(url).then(function(r) {
						if (!alive) return;
						const list = r !== null && typeof r === "object" && Array.isArray(r.items) ? r.items : [];
						const root = r !== null && typeof r === "object" && typeof r.root === "string" ? r.root : null;
						setItems(list);
						setActiveRoot(root);
						setError(null);
					}).catch(function(e) {
						if (alive) setError(String(e && e.message ? e.message : e));
					});
				}
				load();
				const timer = setInterval(load, 5000);
				return function() { alive = false; clearInterval(timer); };
			}, [sessionId]);

			if (error !== null) {
				return React.createElement("div", { className: "apx-root" },
					React.createElement("div", { className: "apx-note apx-errmsg" }, "Artefakte konnten nicht geladen werden: " + error));
			}

			const list = items;
			let selected = null;
			if (list !== null && selectedPath !== null) {
				for (let i = 0; i < list.length; i++) {
					if (list[i].path === selectedPath) { selected = list[i]; break; }
				}
			}

			let body;
			if (selected !== null) {
				body = React.createElement("div", { className: "apx-previewwrap" },
					React.createElement("div", { className: "apx-preview-head" },
						React.createElement("button", { className: "apx-btn", onClick: function() { setSelectedPath(null); } }, "\u2190 Zur\u00fcck"),
						React.createElement("span", { className: "apx-title" }, selected.name),
						React.createElement("span", { className: "apx-badge" }, KIND_LABEL[selected.kind] || selected.ext),
						React.createElement("span", { className: "apx-count" }, fmtSize(selected.size))),
					React.createElement("div", { className: "apx-path" }, selected.path),
					React.createElement(ArtifactPreview, { artifact: selected, cwd: activeRoot }));
			} else if (list === null) {
				body = React.createElement("div", { className: "apx-note" }, "Lade Artefakte\u2026");
			} else if (list.length === 0) {
				body = React.createElement("div", { className: "apx-note" },
					"Noch keine Artefakte gefunden. Dateien mit den Endungen md, pdf, png/jpg/gif/webp/svg oder html erscheinen hier automatisch, sobald sie im Workspace entstehen (auch per Bash/Skript erzeugte).");
			} else {
				const cards = [];
				for (let j = 0; j < list.length; j++) {
					(function(a) {
						cards.push(React.createElement("button", { key: a.path, className: "apx-card", onClick: function() { setSelectedPath(a.path); } },
							React.createElement("span", { className: "apx-card-name" }, a.name),
							React.createElement("span", { className: "apx-card-meta" },
								React.createElement("span", { className: "apx-badge" }, KIND_LABEL[a.kind] || a.ext),
								React.createElement("span", null, fmtSize(a.size)),
								a.revision > 0 ? React.createElement("span", null, "ge\u00e4ndert") : null)));
					})(list[j]);
				}
				body = React.createElement("div", { className: "apx-grid" }, cards);
			}

			return React.createElement("div", { className: "apx-root" },
				React.createElement("div", { className: "apx-toolbar" },
					React.createElement("span", { className: "apx-title" }, "Artefakte"),
					React.createElement("span", { className: "apx-count" }, list === null ? "" : String(list.length) + " Datei(en)"),
					selected === null && list !== null ? React.createElement("button", {
						className: "apx-btn",
						onClick: function() {
							setItems(null);
							const url = "/artifacts/v2/list?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId);
							fetchJson(url).then(function(r) {
								setItems(r !== null && typeof r === "object" && Array.isArray(r.items) ? r.items : []);
							}).catch(function() {});
						},
					}, "Aktualisieren") : null),
				body);
		}

		// ------------------------------------------------------------------
		// Registration
		// ------------------------------------------------------------------
		const inject = ["slots", "conversationEvents"];

		function apply(ctx) {
			layoutService = ctx.get("layout");
			const layout = layoutService;

			// Subagent-produced artifacts: register the parallel accumulator so
			// files created by pts_material / pts_edit / pts_document /
			// pts_renderer also become produced chips + clickable mentions.
			try {
				ctx.conversationEvents.register(ptsProducedDefinition);
			} catch (e) {
				console.error("[pts-artifact-panel] pts-produced accumulator nicht registrierbar:", e);
			}

			// Whole right details column (priority -1 shadows the shipped panel).
			// No children table here: declarations are exclusive and the shipped
			// entry already owns conversation.details.tool; our body renders
			// DetailsTool directly instead of dispatching through renderSlot.
			ctx.slots.inject("details", function() {
				ctx.slots.register(
					{
						name: "details",
						priority: -1,
						inject: function() {
							return {
								closeDetails: function() {
									if (layout !== undefined && layout !== null && typeof layout.closeDetails === "function") layout.closeDetails();
								},
							};
						},
					},
					function(props) { return React.createElement(ArtifactDetailsPanel, props); },
				);
			});

			// Tool-call body inside our column (same layering rule as before).
			ctx.slots.inject("conversation.details.tool", function() {
				ctx.slots.register(
					{ name: "conversation.details.tool", priority: -1 },
					function(props) { return React.createElement(DetailsTool, props); },
				);
			});

			// Produced-file chips ahead of the shipped ProducedFiles chain entry;
			// chain position is `priority` (ascending, lower tries first).
			// Select declines for turns without previewable files, which falls
			// through to the shipped row.
			ctx.slots.inject("conversation.chat.turnTail", function() {
				ctx.slots.register(
					{
						name: "conversation.chat.turnTail",
						priority: -1,
						select: selectProducedArtifacts,
					},
					function(props) { return React.createElement(ProducedArtifacts, props); },
				);
			});

			// Gallery tab.
			ctx.slots.inject("conversation.view", function() {
				ctx.slots.register(
					{ name: "conversation.view", id: "artifacts", order: 30, label: "Artefakte" },
					function(props) { return React.createElement(ArtifactsView, props); },
				);
			});
		}

		return { inject: inject, apply: apply };
	},
});
