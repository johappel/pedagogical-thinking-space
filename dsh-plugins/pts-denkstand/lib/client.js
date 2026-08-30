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
.dks-col { flex:0 0 260px; border:1px solid rgba(128,128,128,.25); border-radius:8px; background:rgba(128,128,128,.04); display:flex; flex-direction:column; gap:6px; padding:8px; }
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

		// Builds a teacher-ready chat prompt for a board action.
		function buildPrompt(action, item) {
			const desc = typeof item.description === "string" && item.description.trim() !== ""
				? item.description.trim()
				: item.title;
			if (action === "approve") {
				return "Ich akzeptiere den Vorschlag auf dem Planning Board (ID " + item.id + "):\n" +
					desc + "\nBitte setze das als Lehrkraft-Freigabe um (planning-board/decisions).";
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
					children.push(React.createElement("div", { key: "a", className: "dks-approval dks-approval-yes" },
						"Freigabe erforderlich"));
				}
				// Action row directly on the card: set the chat draft (no copy/paste).
				if (typeof onSetDraft === "function") {
					children.push(React.createElement("div", { key: "ax", className: "dks-card-actions" },
						React.createElement("button", {
							className: "dks-action-btn dks-action-approve",
							title: "Prompt ins Chat-Input setzen — Freigabe vorschlagen",
							onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); onSetDraft(buildPrompt("approve", it)); },
						}, "✓ Annehmen"),
						React.createElement("button", {
							className: "dks-action-btn",
							title: "Prompt ins Chat-Input setzen — Frage klären",
							onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); onSetDraft(buildPrompt("clarify", it)); },
						}, "💬 Klären")));
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
			if (!decisions || decisions.empty) {
				return React.createElement("div", { className: "dks-empty" },
					"Noch keine pädagogischen Entscheidungen festgehalten.");
			}
			const els = decisions.decisions.map(function(d, idx) {
				const children = [React.createElement("div", { key: "t", className: "dks-dec-title" }, d.title)];
				if (d.detail) children.push(React.createElement("div", { key: "d", className: "dks-dec-detail" }, d.detail));
				return React.createElement("div", { key: d.id || idx, className: "dks-decision" }, children);
			});
			return React.createElement("div", { className: "dks-section" }, els);
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

			function load() {
				const url = "/api/pts-denkstand?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId);
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
			const errEls = errors.map(function(e, i) {
				return React.createElement("div", { key: i, className: "dks-errmsg" },
					e.file + ": " + e.message);
			});

			// The standard session kit hands every conversation.view occupant
			// `inputActions` (setDraft/submit). Use it to write the prompt into the
			// chat input directly — no copy/paste, no host round-trip.
			const inputActions = props !== null && props !== undefined ? props.inputActions : undefined;
			const setDraftFn = function(text) {
				if (inputActions !== undefined && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					setFeedback("Prompt ins Chat-Input übernommen — dort kannst du ihn senden.");
				} else {
					copyText(text);
					setFeedback("Chat-Input nicht erreichbar — Prompt kopiert; bitte im Chat einfügen.");
				}
			};

			return React.createElement("div", { className: "dks-root" },
				React.createElement("div", { className: "dks-toolbar" },
					React.createElement("span", { className: "dks-title" }, "Denkstand"),
					React.createElement("button", { className: "dks-btn", onClick: load }, "Aktualisieren")),
				React.createElement("div", { className: "dks-path" }, data.root || ""),
				errEls.length > 0 ? errEls : null,
				feedback !== null
					? React.createElement("div", { className: "dks-action-ok" }, feedback)
					: null,
				React.createElement("div", { className: "dks-section" },
					React.createElement("div", { className: "dks-section-title" }, "Nächste Schritte (Planning Board)"),
					React.createElement(BoardView, { board: board, onSetDraft: setDraftFn })),
				React.createElement("div", { className: "dks-section" },
					React.createElement("div", { className: "dks-section-title" }, "Timeline (Temporal Plan)"),
					React.createElement(TimelineView, { temporal: temporal })),
				React.createElement("div", { className: "dks-section" },
					React.createElement("div", { className: "dks-section-title" }, "Entscheidungen"),
					React.createElement(DecisionsView, { decisions: decisions })));
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
