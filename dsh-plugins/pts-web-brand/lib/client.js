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

		const inject = ["slots"];

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
