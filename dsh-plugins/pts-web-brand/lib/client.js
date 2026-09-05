// pts-web-brand — Client half (Classic Script, loaded via window.__ModuleLoader__).
//
// Surface identifier + start-state language for the pts-web profile:
//   - shadows `sidebar.brand.mark` / `sidebar.brand.name` at priority -1
//     (single slots; lowest priority renders, shipped occupants sit at 0),
//   - sets document.title,
//   - rewrites the shipped empty-state coding language ("Into the Unknown",
//     "Describe what you want to build", ...) into PTS teacher language.
//
// The start-state texts are rendered by the shipped ConversationRoot /
// InputBar directly (no slot seam), so the language layer works as a bounded
// DOM assertion: an exact-match string map applied to text nodes and to
// placeholder/aria-label attributes through one MutationObserver plus slow
// backstops. React keeps its own virtual values untouched; if a DSH update
// changes the English copy, the worst case is that the shipped text shows
// again (fail-safe degradation). Functionality (send, modes, pickers) is
// never hidden or blocked by this layer.
window.__ModuleLoader__.load({
	id: "pts-web-brand",
	factory: (require) => {
		const React = require("react");

		function PtsBrandMark(props) {
			const size = props && props.size ? props.size : 24;
			return React.createElement(
				"span",
				{
					title: "Pedagogical Thinking Space",
					style: {
						width: size,
						height: size,
						borderRadius: "50%",
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						flex: "none",
						background: "linear-gradient(135deg, #4f6df5, #8a5cf6)",
						color: "#fff",
						fontSize: Math.max(10, Math.round(size * 0.5)),
						fontWeight: 700,
						fontFamily: "inherit",
						lineHeight: 1,
						userSelect: "none",
					},
				},
				"P",
			);
		}

		function PtsBrandName() {
			return React.createElement(
				"span",
				{
					style: {
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					},
				},
				"Pedagogical Thinking Space",
			);
		}

		const inject = ["slots", "sessions", "uiConversation"];

		function chatText(node) {
			if (!node || !node.data) return null;
			if (node.kind === "user") { const a = Array.isArray(node.data.content) ? node.data.content : []; const t = a.filter((b) => b && b.type === "text").map((b) => b.text || "").join("\n").trim(); return t ? { who: "Du", text: t } : null; }
			if (node.kind === "assistant-step") { const a = Array.isArray(node.data.blocks) ? node.data.blocks : []; const t = a.filter((b) => b && b.kind === "text").map((b) => b.text || "").join("\n").trim(); return t ? { who: "PTS Companion", text: t } : null; }
			return null;
		}
		function markdownHtml(text) {
			return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/^### (.+)$/gm, "<h4>$1</h4>").replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^# (.+)$/gm, "<h2>$1</h2>").replace(/^[-*] (.+)$/gm, "• $1").replace(/\n/g, "<br>");
		}

		// ------------------------------------------------------------------
		// PTS language assertion (start state / composer copy).
		// Exact-match only: no fuzzy rewriting, no structural DOM surgery.
		// ------------------------------------------------------------------
		const LANGUAGE_PAIRS = [
			["Into the Unknown", "Pedagogical Thinking Space"],
			["Describe what you want to build", "Woran möchtest du heute weiterdenken?"],
			["Choose a workspace to start", "Wähle einen Denkraum – oder lege einen neuen an"],
			["Choose workspace", "Denkraum wählen"],
			["New Session", "Neue Sitzung"],
			["Message the agent", "Nachricht schreiben"],
		];
		const LANGUAGE_MAP = new Map(LANGUAGE_PAIRS);

		function applyToAttributes(root) {
			if (typeof root.querySelectorAll !== "function") return;
			const els = root.querySelectorAll("[placeholder],[aria-label]");
			for (const el of els) {
				for (const attr of ["placeholder", "aria-label"]) {
					const raw = el.getAttribute(attr);
					if (typeof raw !== "string" || raw === "") continue;
					const hit = LANGUAGE_MAP.get(raw.trim());
					if (hit !== undefined && hit !== raw) el.setAttribute(attr, hit);
				}
			}
		}

		function sweep(root) {
			try {
				const headlineParents = [];
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
				const matches = [];
				let node = walker.nextNode();
				while (node !== null) {
					const value = node.nodeValue;
					if (value && value.length <= 64) {
						const trimmed = value.trim();
						if (trimmed !== "" && LANGUAGE_MAP.has(trimmed)) matches.push([node, value, trimmed]);
					}
					node = walker.nextNode();
				}
				for (const [node, value, trimmed] of matches) {
					const hit = LANGUAGE_MAP.get(trimmed);
					node.nodeValue = value.replace(trimmed, hit);
					if (trimmed === "Into the Unknown" && node.parentElement && node.parentElement.parentElement) {
						// Headline row: [mark][headlineText][previewBadge] — the badge
						// is a sibling of the headline span, so climb one level.
						headlineParents.push(node.parentElement.parentElement);
					}
				}
				// Suppress the shipped "Preview" pill next to the rewritten headline.
				for (const parent of headlineParents) {
					for (const child of parent.children) {
						if (child.textContent && child.textContent.trim() === "Preview") child.style.display = "none";
					}
				}
				applyToAttributes(root);
			} catch (error) {
				console.warn("[pts-web-brand] language sweep skipped:", error);
			}
		}

		function installLanguageAssertion(ctx) {
			if (typeof document === "undefined" || typeof MutationObserver !== "function") return;
			const timers = [];
			// Boot timing: the hero renders shortly after plugin activation.
			for (const delay of [0, 300, 800, 1500, 2500, 4000]) {
				timers.push(setTimeout(() => sweep(document.body), delay));
			}
			// Backstop for paths the observer can miss (e.g. attribute writes
			// racing the batch). Cheap: exact-match walk, throttled.
			const interval = setInterval(() => sweep(document.body), 5000);
			timers.push(interval);
			let scheduled = false;
			const observer = new MutationObserver(() => {
				if (scheduled) return;
				scheduled = true;
				setTimeout(() => {
					scheduled = false;
					sweep(document.body);
				}, 120);
			});
			observer.observe(document.body, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
				attributeFilter: ["placeholder", "aria-label"],
			});
			ctx.effect(() => () => {
				observer.disconnect();
				for (const t of timers) {
					clearTimeout(t);
					clearInterval(t);
				}
			}, "pts-web-brand: language assertion");
		}

		function apply(ctx) {
			const empty = { getSnapshot: () => ({ order: [], nodes: { get: () => undefined } }), subscribe: () => () => {} };
			function CompanionPopover() {
				const session = React.useSyncExternalStore(ctx.sessions.list.subscribe, ctx.sessions.list.getSnapshot, ctx.sessions.list.getSnapshot);
				const sessionId = session.current;
				let source = empty;
				try { const binding = ctx.sessions.binding(sessionId); if (binding) { const target = ctx.uiConversation.binding(binding).target("chat"); source = { getSnapshot: () => target.getSnapshot() || empty.getSnapshot(), subscribe: (fn) => target.subscribe(fn) }; } } catch (e) {}
				const chat = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
				const [open, setOpen] = React.useState(false);
				const [bottom, setBottom] = React.useState(132);
				const [position, setPosition] = React.useState({ right: 22, bottom: null });
				const [size, setSize] = React.useState({ width: 330, height: null });
				const [inChat, setInChat] = React.useState(false);
				const streamRef = React.useRef(null);
				const last = React.useRef((chat.order || []).join("|"));
				React.useEffect(() => { const next = (chat.order || []).join("|"); if (next !== last.current) { last.current = next; setOpen(true); } }, [chat]);
				React.useEffect(() => { const openIt = () => setOpen(true); window.addEventListener("pts:open-companion", openIt); return () => window.removeEventListener("pts:open-companion", openIt); }, []);
				React.useLayoutEffect(() => { const place = () => { const composer = document.querySelector("[data-composer-input]"); if (composer) setBottom(Math.max(12, Math.round(window.innerHeight - composer.getBoundingClientRect().top + 10))); }; place(); window.addEventListener("resize", place); const timer = setInterval(place, 500); return () => { window.removeEventListener("resize", place); clearInterval(timer); }; }, []);
				React.useEffect(() => { const check = () => { const tab = document.querySelector('button[role="tab"][aria-selected="true"]'); setInChat(Boolean(tab && tab.textContent && tab.textContent.trim() === "Chat")); }; check(); const timer = setInterval(check, 250); return () => clearInterval(timer); }, []);
				React.useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [chat]);
				function drag(event) {
					if (event.button !== 0 || event.target.tagName === "BUTTON") return;
					event.preventDefault(); const startX = event.clientX; const startY = event.clientY; const right = position.right; const baseBottom = position.bottom === null ? bottom : position.bottom;
					const move = (next) => setPosition({ right: Math.max(8, right - (next.clientX - startX)), bottom: Math.max(8, baseBottom - (next.clientY - startY)) });
					const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
					window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true });
				}
				function resize(event) {
					if (event.button !== 0) return;
					event.preventDefault(); event.stopPropagation(); const startX = event.clientX; const startY = event.clientY; const width = size.width; const height = size.height === null ? window.innerHeight * .52 : size.height;
					const move = (next) => setSize({ width: Math.max(330, Math.min(window.innerWidth - 16, width + startX - next.clientX)), height: Math.max(260, Math.min(window.innerHeight - 16, height + startY - next.clientY)) });
					const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
					window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true });
				}
				if (!open || inChat) return null;
				const rows = (chat.order || []).map((key) => chatText(chat.nodes.get(key))).filter(Boolean).slice(-24);
				return React.createElement("section", { style: { position: "fixed", right: position.right, bottom: position.bottom === null ? bottom : position.bottom, zIndex: 1250, width: size.width, minWidth: 330, height: size.height === null ? "52vh" : size.height, minHeight: 260, overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--editor-bg,#1e1e1e)", border: "1px solid rgba(128,128,128,.5)", borderRadius: 12, boxShadow: "0 14px 38px rgba(0,0,0,.42)", boxSizing: "border-box" } }, React.createElement("span", { onPointerDown: resize, title: "Fenstergröße ändern", style: { position: "absolute", left: 0, top: 0, width: 20, height: 20, cursor: "nwse-resize", zIndex: 2, borderLeft: "2px solid rgba(128,128,128,.7)", borderTop: "2px solid rgba(128,128,128,.7)" } }), React.createElement("div", { onPointerDown: drag, title: "Fenster verschieben", style: { display: "flex", gap: 8, padding: 10, borderBottom: "1px solid rgba(128,128,128,.25)", flex: "0 0 auto", fontWeight: 700, cursor: "move" } }, "PTS Companion", React.createElement("button", { style: { marginLeft: "auto" }, onClick: () => setOpen(false) }, "×")), React.createElement("div", { ref: streamRef, style: { flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: 10 } }, rows.map((row, i) => React.createElement("div", { key: i, style: { padding: "7px 9px", marginBottom: 7, border: "1px solid rgba(128,128,128,.25)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.5 } }, React.createElement("small", null, row.who), React.createElement("div", { dangerouslySetInnerHTML: { __html: markdownHtml(row.text) } }))), React.createElement("div", { style: { opacity: .65, fontSize: 11.5 } }, "Zum Schreiben den Composer unten verwenden.")));
			}
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "pts-companion-popover", order: 46 }, CompanionPopover));
			// Declare both slot names (nested, mirroring the shipped brand row),
			// then register both occupants at priority -1 so they shadow the
			// default-priority shipped ones without a tie boot error.
			ctx.slots.inject("sidebar.brand.mark", () =>
				ctx.slots.inject("sidebar.brand.name", function* () {
					yield ctx.slots.register({ name: "sidebar.brand.mark", priority: -1 }, PtsBrandMark);
					yield ctx.slots.register({ name: "sidebar.brand.name", priority: -1 }, PtsBrandName);
				}),
			);
			// Take over the conversation hero mark too, so the empty state reads
			// as PTS rather than the shipped whale logo.
			ctx.slots.inject("conversation.hero.brand.mark", () =>
				ctx.slots.register({ name: "conversation.hero.brand.mark", priority: -1 }, PtsBrandMark),
			);
			installLanguageAssertion(ctx);
			// The shell sets document.title after plugins boot, so re-assert the
			// PTS title briefly until it sticks (bounded: stops after ~15 s).
			if (typeof document !== "undefined" && typeof setInterval === "function") {
				let tries = 0;
				const timer = setInterval(() => {
					document.title = "PTS · Denkraum";
					tries += 1;
					if (tries >= 15 || document.title === "PTS · Denkraum") {
						if (tries >= 15) document.title = "PTS · Denkraum";
						clearInterval(timer);
					}
				}, 1000);
				if (typeof ctx !== "undefined" && ctx.effect && typeof clearInterval === "function") {
					ctx.effect(() => () => clearInterval(timer), "pts-web-brand: title timer");
				}
			}
		}

		return { inject, apply };
	},
});
