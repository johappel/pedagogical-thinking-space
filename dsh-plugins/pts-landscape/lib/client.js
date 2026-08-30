// pts-landscape — client half (browser).
//
// "Lernlandschaft" tab (conversation.view, order 30), two-column layout:
//   left  = vertical list of compact moment cards (title + badges, expandable
//           details with time estimate, material assignment);
//   right = fixed Stunden-Zuordnung sidebar (windows as drop targets,
//           "+ Stundenfenster", placements editable/adoptable,
//           "Stundenverlauf vorschlagen" -> chat composer).
// Assignment status: moments with placements get a green border when fully
// covered (assigned minutes >= Zeitbedarf), orange when still open (missing
// estimate or under-allocated), none when unassigned.

window.__ModuleLoader__.load({
	id: "pts-landscape",
	factory: (require) => {
		const React = require("react");

		const CSS = `
.pls-root { display:flex; flex-direction:column; gap:10px; height:100%; min-height:0; box-sizing:border-box; padding:12px 14px; }
.pls-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.pls-title { font-weight:700; font-size:14px; opacity:.92; }
.pls-sub { font-size:12px; opacity:.6; margin-top:2px; }
.pls-errmsg { color:#e06c75; white-space:pre-wrap; word-break:break-word; font-size:12.5px; }
.pls-note { opacity:.6; font-size:12.5px; line-height:1.6; }
.pls-btn { border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; border-radius:6px; padding:3px 10px; font-size:12px; cursor:pointer; }
.pls-btn:hover { background:rgba(128,128,128,.15); }
.pls-btn:disabled { opacity:.5; cursor:default; }
.pls-btn-edit { border-color:#61afef; color:#61afef; }
.pls-btn-edit:hover { background:rgba(97,175,239,.15); }
.pls-counts { display:flex; gap:8px; flex-wrap:wrap; font-size:11.5px; opacity:.7; }
.pls-path { font-size:11px; opacity:.5; font-family:ui-monospace,Consolas,monospace; }
.pls-feedback { color:#7ec699; font-size:12px; }
.pls-layout { display:flex; gap:14px; flex:1; min-height:0; }
.pls-main { flex:1; min-width:0; overflow:auto; display:flex; flex-direction:column; gap:12px; padding-right:4px; }
.pls-side { flex:0 0 330px; min-width:300px; overflow:auto; border-left:1px solid rgba(128,128,128,.2); padding-left:12px; display:flex; flex-direction:column; gap:10px; }
.pls-section-title { font-weight:600; font-size:12.5px; text-transform:uppercase; letter-spacing:.5px; opacity:.6; margin-bottom:6px; }
.pls-cards { display:flex; flex-direction:column; gap:8px; }
.pls-canvas { position:relative; border:1px dashed rgba(128,128,128,.35); border-radius:10px; min-height:520px; background:rgba(128,128,128,.02); overflow:auto; }
.pls-canvas .pls-card { position:absolute; width:220px; z-index:2; }
.pls-band { position:absolute; left:0; right:0; border-top:1px solid rgba(128,128,128,.22); border-bottom:1px solid rgba(128,128,128,.22); background:rgba(128,128,128,.04); pointer-events:none; z-index:0; }
.pls-band-title { position:absolute; left:8px; top:4px; font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; opacity:.55; pointer-events:none; }
.pls-arrow-svg { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; z-index:1; }
.pls-card { border:1px solid rgba(128,128,128,.3); border-radius:8px; background:rgba(128,128,128,.06); padding:8px 12px; display:flex; flex-direction:column; gap:6px; }
.pls-card.draggable { cursor:grab; }
.pls-card.draggable:active { cursor:grabbing; }
.pls-card-ok { border-color:#7ec699; box-shadow:0 0 0 1px rgba(126,198,153,.5) inset; }
.pls-card-warn { border-color:#d19a66; box-shadow:0 0 0 1px rgba(209,154,102,.55) inset; }
.pls-card-head { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.pls-card-title { font-size:12.5px; line-height:1.4; font-weight:600; flex:1; min-width:120px; }
.pls-badge { border:1px solid rgba(128,128,128,.35); border-radius:4px; padding:0 5px; font-size:10px; text-transform:uppercase; letter-spacing:.3px; white-space:nowrap; }
.pls-badge-draft { border-color:#d19a66; color:#d19a66; }
.pls-badge-stable { border-color:#7ec699; color:#7ec699; }
.pls-badge-review { border-color:#c678dd; color:#c678dd; }
.pls-proposed { border-color:#d19a66; color:#d19a66; }
.pls-chip { font-size:10.5px; opacity:.8; white-space:nowrap; }
.pls-details { display:flex; flex-direction:column; gap:6px; border-top:1px dashed rgba(128,128,128,.25); padding-top:6px; }
.pls-card-field { font-size:11.5px; opacity:.78; line-height:1.5; }
.pls-card-field b { opacity:1; font-weight:600; }
.pls-list { margin:0; padding-left:16px; font-size:11.5px; opacity:.78; line-height:1.5; }
.pls-list li { margin-bottom:2px; }
.pls-estimate-row { display:flex; align-items:center; gap:8px; font-size:12px; flex-wrap:wrap; }
.pls-transition { display:flex; align-items:baseline; gap:6px; font-size:12px; border-left:3px solid rgba(128,128,128,.3); padding:3px 0 3px 8px; }
.pls-wins { display:flex; flex-direction:column; gap:10px; }
.pls-win { border:1px solid rgba(128,128,128,.25); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
.pls-win-drop { outline:1px dashed rgba(128,128,128,.35); outline-offset:3px; }
.pls-win-drop-active { outline-color:#61afef; background:rgba(97,175,239,.06); }
.pls-win-over { border-color:#e06c75; box-shadow:0 0 0 1px rgba(224,108,117,.55) inset; }
.pls-win-over-note { color:#e06c75; font-size:11.5px; }
.pls-win-head { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.pls-win-title { font-weight:600; font-size:12.5px; flex:1; min-width:100px; }
.pls-placement { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12px; border-left:3px solid rgba(128,128,128,.3); padding:4px 0 4px 8px; }
.pls-placement-time { font-variant-numeric:tabular-nums; opacity:.75; min-width:64px; }
.pls-select, .pls-input { background:transparent; color:inherit; border:1px solid rgba(128,128,128,.3); border-radius:5px; font-size:11.5px; padding:2px 4px; }
.pls-minutes { width:64px; }
.pls-empty { border:1px dashed rgba(128,128,128,.3); border-radius:8px; padding:14px; text-align:center; opacity:.65; font-size:12.5px; line-height:1.7; }
.pls-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1200; }
.pls-editor, .pls-dialog { background:var(--editor-bg,#1e1e1e); border:1px solid rgba(128,128,128,.4); border-radius:10px; width:min(92vw, 860px); max-height:88vh; display:flex; flex-direction:column; overflow:hidden; color:inherit; }
.pls-dialog { width:min(92vw, 560px); }
.pls-editor-head, .pls-dialog-head { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid rgba(128,128,128,.25); flex-wrap:wrap; }
.pls-editor-file { flex:1; min-width:200px; }
.pls-editor-body { display:flex; flex-direction:column; min-height:0; padding:10px 12px; gap:8px; }
.pls-editor-text { width:100%; height:52vh; resize:vertical; font-family:ui-monospace,Consolas,monospace; font-size:12.5px; line-height:1.55; background:transparent; color:inherit; border:1px solid rgba(128,128,128,.3); border-radius:6px; padding:8px; box-sizing:border-box; white-space:pre; }
.pls-editor-actions, .pls-dialog-actions { display:flex; gap:8px; justify-content:flex-end; }
.pls-dialog-body { display:flex; flex-direction:column; gap:10px; padding:12px; }
.pls-picker-list { max-height:40vh; overflow:auto; display:flex; flex-direction:column; gap:4px; }
.pls-picker-item { display:flex; align-items:center; gap:8px; font-size:12.5px; }
.pls-picker-item label { cursor:pointer; }
.pls-form-row { display:flex; align-items:center; gap:8px; font-size:12.5px; }
.pls-form-row label { min-width:110px; opacity:.75; }
`;

		const STYLE_TAG_ID = "pts-landscape-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		const EDITABLE_FILES = ["learning-landscape.md", "temporal-plan.yml", "planning-board.yml", "decisions.yml", "learning-design.md"];
		const ROLES = ["opening", "irritation", "exploration", "deepening", "practice", "decision", "consolidation", "reflection", "closing", "transition", "buffer", "other"];
		const MODES = ["common", "choice", "parallel", "individual", "group", "open"];
		const MOMENT_TYPES = ["impulse", "learning_place", "positioning", "inquiry", "choice", "practice", "project", "product", "reflection", "assessment", "other"];

		function esc(s) {
			return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}

		function typeLabel(t) {
			const map = { impulse: "Impuls", learning_place: "Lernort", positioning: "Positionierung", inquiry: "Erkundung", choice: "Wahl", practice: "Übung", project: "Projekt", product: "Produkt", reflection: "Reflexion", assessment: "Beurteilung", other: "Sonstiges" };
			return map[t] || t || "—";
		}

		function statusLabel(s) {
			const map = { draft: "Entwurf", stable: "Verbindlich", needs_review: "Zur Prüfung" };
			return map[s] || s || "—";
		}

		function statusClass(s) {
			if (s === "stable") return "pls-badge pls-badge-stable";
			if (s === "needs_review") return "pls-badge pls-badge-review";
			return "pls-badge pls-badge-draft";
		}

		function roleLabel(r) {
			const map = { opening: "Einstieg", irritation: "Irritation", exploration: "Erkundung", deepening: "Vertiefung", practice: "Übung", decision: "Entscheidung", consolidation: "Sicherung", reflection: "Reflexion", closing: "Abschluss", transition: "Übergang", buffer: "Puffer", other: "Sonstiges" };
			return map[r] || r || "—";
		}

		function modeLabel(m) {
			const map = { common: "Gemeinsam", choice: "Wahl", parallel: "Parallel", individual: "Einzeln", group: "Gruppe", open: "Offen" };
			return map[m] || m || "—";
		}

		function kindLabel(k) {
			const map = { lesson: "Stunde", double_lesson: "Doppelstunde", project_block: "Projektblock", open_learning_time: "Offene Lernzeit" };
			return map[k] || k || "—";
		}

		function transitionTypeLabel(t) {
			const map = { required: "Reihenfolge", choice: "Wahl", parallel: "Parallel", return: "Zurück", meeting_point: "Treffpunkt", prerequisite: "Voraussetzung" };
			return map[t] || t || "—";
		}

		const TRANSITION_TYPE_OPTIONS = [["required", "Reihenfolge (nacheinander)"], ["prerequisite", "Voraussetzung (baut auf)"], ["choice", "Wahl (alternative Wege)"], ["parallel", "Parallel (gleichzeitig, Gruppen)"], ["meeting_point", "Treffpunkt (läuft zusammen)"], ["return", "Zurück (Schleife)"]];

		function copyText(text) {
			const onFail = function() {
				try { window.prompt("Hier kopieren (Strg+C) und im Chat einfügen:", text); } catch (e) {}
			};
			if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
				navigator.clipboard.writeText(text).then(function() { return true; }, onFail);
				return true;
			}
			onFail();
			return false;
		}

		/** Next `prefix-NN` id for the timeline (numeric suffix scan). */
		function nextSeqId(existingIds, prefix) {
			let max = 0;
			const re = new RegExp("^" + prefix + "-(\\d+)$");
			for (const id of existingIds) {
				const m = String(id).match(re);
				if (m !== null) max = Math.max(max, parseInt(m[1], 10));
			}
			return prefix + "-" + String(max + 1).padStart(2, "0");
		}

		function clamp(v, min, max) {
			return Math.max(min, Math.min(max, v));
		}

		// Card geometry used for transition arrows (approximate collapsed height).
		const CARD_W = 220;
		const CARD_H = 100;

		/** Point where the ray from a rect center exits the rect (arrows). */
		function rectExitPoint(cx, cy, w, h, dx, dy) {
			const hw = w / 2;
			const hh = h / 2;
			const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
			const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
			const s = Math.min(sx, sy);
			return { x: cx + dx * s, y: cy + dy * s };
		}

		function ListField(props) {
			const items = Array.isArray(props.items) ? props.items : [];
			if (items.length === 0) return null;
			return React.createElement("div", { className: "pls-card-field" },
				React.createElement("b", null, props.label + ":"),
				React.createElement("ul", { className: "pls-list" },
					items.map(function(it, i) {
						return React.createElement("li", { key: i }, esc(it));
					})));
		}

		function MomentCard(props) {
			const m = props.moment;
			const assign = props.assign || { status: "none", assigned: 0, estimated: null };
			const onDragStart = props.onDragStart;
			const onPickMaterials = props.onPickMaterials;
			const onSaveEstimate = props.onSaveEstimate;
			const onChat = props.onChat;
			const onEdit = props.onEdit;
			const expandedState = React.useState(false);
			const expanded = expandedState[0];
			const setExpanded = expandedState[1];
			const estState = React.useState("");
			const estDraft = estState[0];
			const setEstDraft = estState[1];

			function toggleDetails() {
				const next = !expanded;
				setExpanded(next);
				if (next) setEstDraft(m.time_estimate != null ? String(m.time_estimate) : "");
			}

			const head = [
				React.createElement("span", { key: "t", className: "pls-card-title" }, esc(m.title || m.id)),
				React.createElement("span", { key: "ty", className: "pls-badge" }, esc(typeLabel(m.type))),
			];
			if (m.time_estimate != null) {
				head.push(React.createElement("span", { key: "te", className: "pls-chip" }, "≈ " + m.time_estimate + " min"));
			}
			if (assign.status !== "none") {
				head.push(React.createElement("span", { key: "as", className: "pls-chip" },
					"zugeordnet " + assign.assigned + " min" + (assign.estimated != null ? " / " + assign.estimated + " min" : "")));
			}
			head.push(React.createElement("button", {
				key: "chat",
				className: "pls-btn",
				title: "Diesen Lernmoment mit dem Companion besprechen",
				onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); props.onChat(m); },
			}, "💬 Chat"));
			head.push(React.createElement("button", {
				key: "edit",
				className: "pls-btn pls-btn-edit",
				title: "Diesen Lernmoment bearbeiten (nur dieser Moment, nicht das ganze Dokument)",
				onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); props.onEdit(m); },
			}, "✎ Edit"));
			head.push(React.createElement("button", {
				key: "ex",
				className: "pls-btn",
				title: expanded ? "Details einklappen" : "Details aufklappen",
				onClick: toggleDetails,
			}, expanded ? "▾ Details" : "▸ Details"));

			const children = [React.createElement("div", { key: "h", className: "pls-card-head" }, head)];

			if (expanded) {
				const details = [];
				if (typeof m.function === "string" && m.function !== "") {
					details.push(React.createElement("div", { key: "f", className: "pls-card-field" },
						React.createElement("b", null, "Funktion: "), esc(m.function)));
				}
				if (typeof m.learning_activity === "string" && m.learning_activity !== "") {
					details.push(React.createElement("div", { key: "a", className: "pls-card-field" },
						React.createElement("b", null, "Lernaktivität: "), esc(m.learning_activity)));
				}
				const needs = Array.isArray(m.material_needs) ? m.material_needs : [];
				if (needs.length > 0) {
					details.push(React.createElement(ListField, { key: "n", label: "Materialbedarfe", items: needs }));
				}
				const mats = Array.isArray(m.materials) ? m.materials : [];
				details.push(React.createElement("div", { key: "mat", className: "pls-card-field" },
					React.createElement("b", null, "Materialien: "),
					mats.length > 0 ? esc(mats.join(", ")) : React.createElement("span", { className: "pls-note" }, "keine zugeordnet"),
					typeof onPickMaterials === "function"
						? React.createElement("button", {
							className: "pls-btn pls-btn-edit",
							style: { marginLeft: "6px" },
							title: "Materialien aus materials/ oder rendered/ zuordnen",
							onClick: function(e) { if (e && e.stopPropagation) e.stopPropagation(); onPickMaterials(m); },
						}, "Material wählen")
						: null));
				const qs = Array.isArray(m.open_questions) ? m.open_questions : [];
				if (qs.length > 0) {
					details.push(React.createElement(ListField, { key: "q", label: "Offene Fragen", items: qs }));
				}
				if (typeof m.provenance === "string" && m.provenance !== "") {
					details.push(React.createElement("div", { key: "p", className: "pls-note" }, esc(m.provenance)));
				}
				details.push(React.createElement("div", { key: "est", className: "pls-estimate-row" },
					React.createElement("b", null, "Zeitbedarf:"),
					React.createElement("input", {
						className: "pls-input pls-minutes",
						type: "number",
						min: 5,
						max: 600,
						value: estDraft,
						placeholder: "min",
						title: "Geschätzte Zeit für diesen Lernmoment (für die Vollständigkeits-Prüfung)",
						onChange: function(e) { setEstDraft(e.target.value); },
					}),
					React.createElement("button", {
						className: "pls-btn pls-btn-edit",
						disabled: !(estDraft.trim() !== "" && parseInt(estDraft, 10) > 0),
						onClick: function() { onSaveEstimate(m.id, parseInt(estDraft, 10)); },
					}, "Speichern"),
					m.time_estimate != null
						? React.createElement("button", {
							className: "pls-btn",
							title: "Schätzung entfernen",
							onClick: function() { onSaveEstimate(m.id, null); },
						}, "✕")
						: null));
				children.push(React.createElement("div", { key: "d", className: "pls-details" }, details));
			}

			const cardProps = {
				className: "pls-card draggable" + (assign.status === "ok" ? " pls-card-ok" : assign.status === "warn" ? " pls-card-warn" : ""),
				style: props.position ? { left: props.position.x + "px", top: props.position.y + "px" } : undefined,
				key: m.id,
				draggable: true,
				title: m.id + " — ziehen: auf ein Stundenfenster = zuordnen · auf die freie Fläche = verschieben · auf eine andere Karte = Übergang anlegen",
				onDragStart: onDragStart,
				onDragOver: function(e) { e.preventDefault(); },
				onDrop: function(e) {
					e.preventDefault();
					e.stopPropagation();
					const dragged = e.dataTransfer.getData("text/plain");
					if (dragged !== "" && dragged !== m.id && typeof props.onDropCard === "function") {
						props.onDropCard(dragged, m.id);
					}
				},
			};
			return React.createElement("div", cardProps, children);
		}

		function PlacementRow(props) {
			const p = props.placement;
			const w = props.window;
			const onUpdate = props.onUpdate;
			const onRemove = props.onRemove;
			const onAdopt = props.onAdopt;
			const disabled = props.disabled;
			const children = [
				React.createElement("span", { key: "t", className: "pls-placement-time" },
					"ab " + (p.start_minute != null ? p.start_minute : "?") + "′"),
				React.createElement("select", {
					key: "r",
					className: "pls-select",
					title: "Dramaturgische Rolle",
					value: p.dramaturgical_role || "exploration",
					disabled: disabled,
					onChange: function(e) { onUpdate({ dramaturgical_role: e.target.value }); },
				}, ROLES.map(function(r) {
					return React.createElement("option", { key: r, value: r }, roleLabel(r));
				})),
				React.createElement("select", {
					key: "m",
					className: "pls-select",
					title: "Sozialform/Modus",
					value: p.mode || "common",
					disabled: disabled,
					onChange: function(e) { onUpdate({ mode: e.target.value }); },
				}, MODES.map(function(md) {
					return React.createElement("option", { key: md, value: md }, modeLabel(md));
				})),
				React.createElement("input", {
					key: "d",
					className: "pls-input pls-minutes",
					type: "number",
					min: 5,
					max: w.duration_minutes || 90,
					title: "Dauer in Minuten",
					value: p.duration_minutes,
					disabled: disabled,
					onChange: function(e) {
						const v = parseInt(e.target.value, 10);
						if (!isNaN(v) && v > 0) onUpdate({ duration_minutes: v });
					},
				}),
				React.createElement("span", { key: "l", className: "pls-note" }, esc(p.moment_id)),
				React.createElement("button", {
					key: "x",
					className: "pls-btn",
					title: "Platzierung entfernen",
					disabled: disabled,
					onClick: onRemove,
				}, "✕"),
			];
			if (typeof p.note === "string" && p.note !== "") {
				children.push(React.createElement("span", { key: "n", className: "pls-note" }, esc(p.note)));
			}
			return React.createElement("div", { className: "pls-placement" }, children);
		}

		function buildStundenverlaufPrompt(window, momentsById) {
			const lines = [];
			lines.push("Erstelle einen Verlaufsplan für " + window.title + " (" + kindLabel(window.kind) + ", " + window.duration_minutes + " Minuten):");
			lines.push("");
			lines.push("Lernmomente dieser Stunde (laut temporal-plan.yml und learning-landscape.md):");
			const placements = Array.isArray(window.placements) ? window.placements : [];
			for (const p of placements) {
				const m = momentsById[p.moment_id];
				const title = m ? m.title : p.moment_id;
				lines.push("- " + p.moment_id + " „" + title + "“ · " + roleLabel(p.dramaturgical_role) + " · " + modeLabel(p.mode) + " · ab " + p.start_minute + "′ (" + p.duration_minutes + " min)");
			}
			lines.push("");
			lines.push("Nutze die Entscheidungen aus decisions.yml und das Learning Design. Ziel: ein konkreter Unterrichtsverlauf für " + window.duration_minutes + " Minuten mit Zeitangaben, Sozialform, Material und Sicherung.");
			return lines.join("\n");
		}

		function LandscapeView(props) {
			const sessionId = props !== null && props !== undefined && typeof props.sessionId === "string" ? props.sessionId : null;
			const dataState = React.useState(null);
			const data = dataState[0];
			const setData = dataState[1];
			const errState = React.useState(null);
			const error = errState[0];
			const setError = errState[1];
			const editorState = React.useState(null);
			const editor = editorState[0];
			const setEditor = editorState[1];
			const feedbackState = React.useState(null);
			const feedback = feedbackState[0];
			const setFeedback = feedbackState[1];
			const savingState = React.useState(false);
			const saving = savingState[0];
			const setSaving = savingState[1];
			const pickerState = React.useState(null);
			const picker = pickerState[0];
			const setPicker = pickerState[1];
			const winFormState = React.useState(false);
			const winForm = winFormState[0];
			const setWinForm = winFormState[1];
			const transitionState = React.useState(null);
			const transitionForm = transitionState[0];
			const setTransitionForm = transitionState[1];
			const momentEditState = React.useState(null);
			const momentEdit = momentEditState[0];
			const setMomentEdit = momentEditState[1];

			function load() {
				const url = "/api/pts-landscape?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId);
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
				const timer = setInterval(load, 5000);
				return function() { clearInterval(timer); };
			}, [sessionId]);

			function openEditor(file) {
				if (data === null) return;
				fetch("/api/pts-artifact/raw?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId) + "&file=" + encodeURIComponent(file))
					.then(function(res) { return res.text().then(function(body) { return { res: res, body: body }; }); })
					.then(function(r) {
						let v = null;
						try { v = JSON.parse(r.body); } catch (e) { v = null; }
						if (!r.res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + r.res.status);
						setEditor({ file: file, content: v.content });
						setError(null);
					})
					.catch(function(e) { setError("Editor: " + String(e && e.message ? e.message : e)); });
			}

			function saveEditor() {
				if (editor === null) return;
				fetch("/api/pts-artifact/save", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, file: editor.file, content: editor.content }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setEditor(null);
					setFeedback("Gespeichert: " + editor.file + " — der Companion sieht die Änderung im nächsten Turn.");
					load();
				}).catch(function(e) {
					setError("Speichern fehlgeschlagen: " + String(e && e.message ? e.message : e));
				});
			}

			// ——— Timeline helpers ———
			function temporalState() {
				const t = data && data.temporal ? data.temporal : { windows: [], placements: [], title: "" };
				return {
					title: t.title || "",
					windows: (Array.isArray(t.windows) ? t.windows : []).map(function(w) {
						return { id: w.id, title: w.title, kind: w.kind, duration_minutes: w.duration_minutes, note: w.note || "", status: w.status || "binding" };
					}),
					placements: (Array.isArray(t.placements) ? t.placements : []).map(function(p) {
						return { id: p.id, moment_id: p.moment_id, window_id: p.window_id, start_minute: p.start_minute, duration_minutes: p.duration_minutes, dramaturgical_role: p.dramaturgical_role, mode: p.mode, note: p.note || "", status: p.status || "binding" };
					}),
				};
			}

			function saveTemporal(state, okMsg) {
				// The teacher's action (drag/edit/remove) IS the decision: any
				// timeline save adopts the visible flow as binding. No separate
				// approval gate.
				const owned = {
					title: state.title,
					windows: (Array.isArray(state.windows) ? state.windows : []).map(function(w) { return Object.assign({}, w, { status: "binding" }); }),
					placements: (Array.isArray(state.placements) ? state.placements : []).map(function(p) { return Object.assign({}, p, { status: "binding" }); }),
				};
				setSaving(true);
				fetch("/api/pts-landscape/temporal", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, title: owned.title, windows: owned.windows, placements: owned.placements }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setFeedback(okMsg);
					load();
				}).catch(function(e) {
					setError("Timeline: " + String(e && e.message ? e.message : e));
				}).finally(function() { setSaving(false); });
			}

			function mutateTimeline(fn, okMsg) {
				if (data === null || data.temporal === null) return;
				const st = temporalState();
				const next = fn(st);
				if (next === null || next === undefined) return;
				saveTemporal(next, okMsg);
			}

			function onDropMoment(windowId) {
				return function(e) {
					e.preventDefault();
					const momentId = e.dataTransfer.getData("text/plain");
					if (!momentId) return;
					const st = temporalState();
					const win = st.windows.find(function(w) { return w.id === windowId; });
					if (!win) return;
					const winPlacements = st.placements.filter(function(p) { return p.window_id === windowId; });
					const start = winPlacements.reduce(function(acc, p) { return Math.max(acc, (p.start_minute || 0) + (p.duration_minutes || 0)); }, 0);
					const dur = clamp((win.duration_minutes || 45) - start, 5, win.duration_minutes || 45);
					const ids = st.placements.map(function(p) { return p.id; });
					st.placements.push({
						id: nextSeqId(ids, "tp"),
						moment_id: momentId,
						window_id: windowId,
						start_minute: start,
						duration_minutes: dur,
						dramaturgical_role: "exploration",
						mode: "common",
						note: "",
						status: "binding",
					});
					saveTemporal(st, "Lernmoment " + momentId + " der Stunde " + windowId + " zugeordnet (verbindlich — du hast entschieden).");
				};
			}

			function updatePlacement(placementId, patch) {
				mutateTimeline(function(st) {
					const p = st.placements.find(function(x) { return x.id === placementId; });
					if (!p) return null;
					Object.assign(p, patch);
					return st;
				}, "Platzierung aktualisiert.");
			}

			function removePlacement(placementId) {
				mutateTimeline(function(st) {
					st.placements = st.placements.filter(function(p) { return p.id !== placementId; });
					return st;
				}, "Platzierung entfernt.");
			}

			function adoptPlacement(placementId) {
				mutateTimeline(function(st) {
					const p = st.placements.find(function(x) { return x.id === placementId; });
					if (p) p.status = "binding";
					return st;
				}, "Vorschlag als verbindlich übernommen.");
			}

			function adoptWindow(windowId) {
				mutateTimeline(function(st) {
					const w = st.windows.find(function(x) { return x.id === windowId; });
					if (w) w.status = "binding";
					return st;
				}, "Fenster als verbindlich übernommen.");
			}

			function removeWindow(windowId) {
				mutateTimeline(function(st) {
					st.windows = st.windows.filter(function(w) { return w.id !== windowId; });
					st.placements = st.placements.filter(function(p) { return p.window_id !== windowId; });
					return st;
				}, "Fenster (inkl. Platzierungen) entfernt.");
			}

			function addWindow(form) {
				mutateTimeline(function(st) {
					const ids = st.windows.map(function(w) { return w.id; });
					st.windows.push({
						id: nextSeqId(ids, "tw"),
						title: form.title,
						kind: form.kind,
						duration_minutes: form.duration,
						note: "",
						status: "binding",
					});
					return st;
				}, "Stundenfenster angelegt.");
				setWinForm(false);
			}

			// ——— Time estimate ———
			function saveEstimate(momentId, minutes) {
				fetch("/api/pts-landscape/moment-estimate", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, momentId: momentId, minutes: minutes }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setFeedback(minutes === null ? "Zeitbedarf für " + momentId + " entfernt." : "Zeitbedarf für " + momentId + ": " + minutes + " min.");
					load();
				}).catch(function(e) {
					setError("Zeitbedarf: " + String(e && e.message ? e.message : e));
				});
			}

			// ——— Materials ———
			function openMaterialPicker(moment) {
				if (picker !== null) return;
				fetch("/api/pts-landscape/materials?sessionId=" + encodeURIComponent(sessionId === null ? "" : sessionId))
					.then(function(res) { return res.text().then(function(body) { return { res: res, body: body }; }); })
					.then(function(r) {
						let v = null;
						try { v = JSON.parse(r.body); } catch (e) { v = null; }
						if (!r.res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + r.res.status);
						const list = Array.isArray(v.materials) ? v.materials : [];
						const current = Array.isArray(moment.materials) ? moment.materials : [];
						setPicker({ momentId: moment.id, list: list, selected: current.slice() });
					})
					.catch(function(e) { setError("Materialliste: " + String(e && e.message ? e.message : e)); });
			}

			function saveMaterials() {
				if (picker === null) return;
				fetch("/api/pts-landscape/materials", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, momentId: picker.momentId, materials: picker.selected }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setPicker(null);
					setFeedback("Materialien für " + picker.momentId + " zugeordnet.");
					load();
				}).catch(function(e) {
					setError("Materialien: " + String(e && e.message ? e.message : e));
				});
			}

			function toggleMaterial(path) {
				if (picker === null) return;
				const sel = picker.selected.slice();
				const i = sel.indexOf(path);
				if (i >= 0) sel.splice(i, 1);
				else sel.push(path);
				setPicker({ momentId: picker.momentId, list: picker.list, selected: sel });
			}

			// ——— Layout canvas (free vertical + horizontal positioning) ———
			function saveLayout(positions, groups) {
				fetch("/api/pts-landscape/layout", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, layout: { positions: positions, groups: groups || [] } }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setFeedback("Landschafts-Layout gespeichert (nur Positionen — keine didaktische Änderung).");
					load();
				}).catch(function(e) {
					setError("Layout: " + String(e && e.message ? e.message : e));
				});
			}

			function onCanvasDrop(e) {
				e.preventDefault();
				const id = e.dataTransfer.getData("text/plain");
				if (id === "") return;
				const el = e.currentTarget;
				const rect = el.getBoundingClientRect();
				const x = clamp(Math.round(e.clientX - rect.left + el.scrollLeft - CARD_W / 2), 8, Math.max(8, rect.width + el.scrollLeft - CARD_W));
				const y = clamp(Math.round(e.clientY - rect.top + el.scrollTop - 24), 8, Math.max(8, rect.height + el.scrollTop - CARD_H));
				const positions = {};
				for (const k of Object.keys(displayPos)) positions[k] = displayPos[k];
				positions[id] = { x: x, y: y };
				saveLayout(positions, []);
			}

			// ——— Transitions ———
			function submitTransition() {
				if (transitionForm === null) return;
				fetch("/api/pts-landscape/transitions", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, from: transitionForm.from, to: transitionForm.to, type: transitionForm.type, rationale: transitionForm.rationale }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setTransitionForm(null);
					setFeedback("Übergang " + transitionForm.from + " → " + transitionForm.to + " angelegt.");
					load();
				}).catch(function(e) {
					setError("Übergang: " + String(e && e.message ? e.message : e));
				});
			}

			function removeTransition(id) {
				fetch("/api/pts-landscape/transitions/remove", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, id: id }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setFeedback("Übergang " + id + " entfernt.");
					load();
				}).catch(function(e) {
					setError("Übergang: " + String(e && e.message ? e.message : e));
				});
			}

			function chatMoment(m) {
				const qs = Array.isArray(m.open_questions) ? m.open_questions : [];
				const text = "Lass uns den Lernmoment " + m.id + " „" + m.title + "“ besprechen.\n" +
					(m.function ? "Funktion: " + m.function + "\n" : "") +
					(m.learning_activity ? "Lernaktivität: " + m.learning_activity + "\n" : "") +
					(qs.length > 0 ? "Offene Fragen: " + qs.join("; ") + "\n" : "");
				const inputActions = props !== null && props !== undefined ? props.inputActions : undefined;
				if (inputActions !== undefined && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					setFeedback("Prompt für den Moment „" + m.title + "“ ins Chat-Input übernommen.");
				} else {
					copyText(text);
					setFeedback("Chat-Input nicht erreichbar — Prompt kopiert.");
				}
			}

			function saveMoment(fields) {
				if (momentEdit === null) return;
				fetch("/api/pts-landscape/moment", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, momentId: momentEdit.id, fields: fields }),
				}).then(function(res) {
					return res.text().then(function(body) {
						let v = null;
						try { v = JSON.parse(body); } catch (e) { v = null; }
						if (!res.ok) throw new Error(v !== null && v && typeof v.error === "string" ? v.error : "HTTP " + res.status);
						return v;
					});
				}).then(function() {
					setMomentEdit(null);
					setFeedback("Lernmoment „" + momentEdit.title + "“ aktualisiert.");
					load();
				}).catch(function(e) {
					setError("Moment: " + String(e && e.message ? e.message : e));
				});
			}

			// ——— Verlaufsplan vorschlagen ———
			function proposeVerlauf(window) {
				const momentsById = {};
				for (const m of (Array.isArray(data.moments) ? data.moments : [])) momentsById[m.id] = m;
				const text = buildStundenverlaufPrompt(window, momentsById);
				const inputActions = props !== null && props !== undefined ? props.inputActions : undefined;
				if (inputActions !== undefined && typeof inputActions.setDraft === "function") {
					inputActions.setDraft(text);
					setFeedback("Prompt für „" + window.title + "“ ins Chat-Input übernommen — dort abschicken, der Companion beauftragt den Material-Worker.");
				} else {
					copyText(text);
					setFeedback("Chat-Input nicht erreichbar — Prompt kopiert; bitte im Chat einfügen.");
				}
			}

			if (error !== null && data === null) {
				return React.createElement("div", { className: "pls-root" },
					React.createElement("div", { className: "pls-errmsg" }, "Lernlandschaft konnte nicht geladen werden: " + esc(error)));
			}
			if (data === null) {
				return React.createElement("div", { className: "pls-root" },
					React.createElement("div", { className: "pls-note" }, "Lade Lernlandschaft…"));
			}

			const moments = Array.isArray(data.moments) ? data.moments : [];
			const transitions = Array.isArray(data.transitions) ? data.transitions : [];
			const temporal = data.temporal;
			const decisions = data.decisions;
			const errors = Array.isArray(data.errors) ? data.errors : [];
			const placements = temporal && Array.isArray(temporal.placements) ? temporal.placements : [];

			const errEls = errors.map(function(e, i) {
				return React.createElement("div", { key: i, className: "pls-errmsg" }, esc(e.file) + ": " + esc(e.message));
			});

			function assignStatus(m) {
				const mine = placements.filter(function(p) { return p.moment_id === m.id; });
				if (mine.length === 0) return { status: "none", assigned: 0, estimated: null };
				const assigned = mine.reduce(function(acc, p) { return acc + (p.duration_minutes || 0); }, 0);
				const est = typeof m.time_estimate === "number" ? m.time_estimate : null;
				if (est !== null) return { status: assigned >= est ? "ok" : "warn", assigned: assigned, estimated: est };
				return { status: "warn", assigned: assigned, estimated: null };
			}

			const basePos = data.layout && data.layout.positions ? data.layout.positions : {};
			const displayPos = {};
			moments.forEach(function(m, idx) {
				if (basePos[m.id]) displayPos[m.id] = basePos[m.id];
				// Default: staggered vertical flow (the left column is taller than wide).
				else displayPos[m.id] = { x: 24 + (idx % 2) * 245, y: 20 + idx * 215 };
			});
			const maxCardY = moments.reduce(function(acc, m) { return Math.max(acc, (displayPos[m.id] ? displayPos[m.id].y : 0) + CARD_H + 40); }, 0);
			const canvasHeight = Math.max(520, maxCardY + 40);

			const canvasCardEls = moments.map(function(m) {
				return React.createElement(MomentCard, {
					key: m.id,
					moment: m,
					position: displayPos[m.id],
					assign: assignStatus(m),
					onDragStart: function(e) { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "all"; },
					onPickMaterials: openMaterialPicker,
					onSaveEstimate: saveEstimate,
					onChat: chatMoment,
					onEdit: setMomentEdit,
					onDropCard: function(dragged, target) {
						setTransitionForm({ from: dragged, to: target, type: "required", rationale: "" });
					},
				});
			});

			const arrowEls = transitions.map(function(t) {
				if (typeof t.from !== "string" || typeof t.to !== "string") return null;
				const sp = displayPos[t.from];
				const tp = displayPos[t.to];
				if (sp === undefined || tp === undefined) return null;
				const scx = sp.x + CARD_W / 2;
				const scy = sp.y + CARD_H / 2;
				const tcx = tp.x + CARD_W / 2;
				const tcy = tp.y + CARD_H / 2;
				let dx = tcx - scx;
				let dy = tcy - scy;
				const len = Math.hypot(dx, dy) || 1;
				dx /= len;
				dy /= len;
				const start = rectExitPoint(scx, scy, CARD_W, CARD_H, dx, dy);
				const end = rectExitPoint(tcx, tcy, CARD_W, CARD_H, -dx, -dy);
				return React.createElement("line", {
					key: t.id || (t.from + "-" + t.to),
					x1: start.x, y1: start.y, x2: end.x, y2: end.y,
					stroke: "rgba(128,128,128,.75)", strokeWidth: 1.5,
					markerEnd: "url(#pls-arrow)",
				});
			});

			const momentsSection = moments.length === 0
				? React.createElement("div", { className: "pls-empty" }, "Noch keine Lernmomente — sie entstehen im Gespräch und werden hier sichtbar.")
				: React.createElement("div", {
					className: "pls-canvas",
					style: { height: canvasHeight },
					onDragOver: function(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; },
					onDrop: onCanvasDrop,
				}, [
					React.createElement("svg", { key: "arrows", className: "pls-arrow-svg" },
						React.createElement("defs", null,
							React.createElement("marker", {
								id: "pls-arrow", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4,
								orient: "auto", markerUnits: "strokeWidth",
							},
								React.createElement("path", { d: "M0,0 L8,4 L0,8 z", fill: "rgba(128,128,128,.8)" }))),
						arrowEls),
				].concat(canvasCardEls));

			const transitionEls = transitions.map(function(t, i) {
				return React.createElement("div", { key: t.id || i, className: "pls-transition" },
					React.createElement("span", { className: "pls-note" }, esc(t.from || "?") + " → " + esc(t.to || "?")),
					React.createElement("span", { className: "pls-badge" }, esc(transitionTypeLabel(t.type))),
					t.reason && t.reason !== "(keine)" ? React.createElement("span", { className: "pls-note" }, esc(t.reason)) : null,
					React.createElement("button", {
						className: "pls-btn",
						title: "Übergang entfernen",
						onClick: function() { removeTransition(t.id); },
					}, "✕"));
			});

			const windows = temporal && Array.isArray(temporal.windows) ? temporal.windows : [];
			const winEls = windows.map(function(w) {
				const winPlacements = Array.isArray(w.placements) ? w.placements : [];
				const sumMinutes = winPlacements.reduce(function(acc, p) { return acc + (p.duration_minutes || 0); }, 0);
				const over = w.duration_minutes != null && sumMinutes > w.duration_minutes;
				const pEls = winPlacements.map(function(p) {
					return React.createElement(PlacementRow, {
						key: p.id,
						placement: p,
						window: w,
						disabled: saving,
						onUpdate: function(patch) { updatePlacement(p.id, patch); },
						onRemove: function() { removePlacement(p.id); },
						onAdopt: function() { adoptPlacement(p.id); },
					});
				});
				const head = [
					React.createElement("span", { key: "t", className: "pls-win-title" }, esc(w.title)),
					React.createElement("span", { key: "k", className: "pls-badge" }, esc(kindLabel(w.kind))),
					w.duration_minutes != null
						? React.createElement("span", { key: "d", className: "pls-note" },
							"Budget " + sumMinutes + " / " + w.duration_minutes + " min")
						: null,
				];
				head.push(React.createElement("button", { key: "v", className: "pls-btn pls-btn-edit", disabled: saving || winPlacements.length === 0, title: "Prompt für einen Verlaufsplan dieser Stunde ins Chat-Input setzen", onClick: function() { proposeVerlauf(w); } }, "Stundenverlauf vorschlagen"));
				head.push(React.createElement("button", { key: "x", className: "pls-btn", disabled: saving, title: "Fenster inkl. Platzierungen entfernen", onClick: function() { removeWindow(w.id); } }, "✕"));
				if (over) {
					head.push(React.createElement("span", { key: "ov", className: "pls-win-over-note" },
						"⚠ Zeitbudget um " + (sumMinutes - w.duration_minutes) + " min überzogen"));
				}
				return React.createElement("div", {
					key: w.id,
					className: "pls-win pls-win-drop" + (over ? " pls-win-over" : ""),
					onDragOver: function(e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
					onDrop: onDropMoment(w.id),
				},
					React.createElement("div", { className: "pls-win-head" }, head),
					winPlacements.length === 0
						? React.createElement("div", { className: "pls-note" }, "Lernmoment hierher ziehen, um ihn dieser Stunde zuzuordnen.")
						: pEls);
			});

			const decisionCount = decisions && Array.isArray(decisions.decisions) ? decisions.decisions.length : 0;

			return React.createElement("div", { className: "pls-root" },
				React.createElement("div", { className: "pls-toolbar" },
					React.createElement("span", { className: "pls-title" }, "Lernlandschaft" + (data.title ? " · " + data.title : "")),
					data.structure ? React.createElement("span", { className: "pls-badge" }, esc(data.structure)) : null,
					React.createElement("span", { className: "pls-counts" },
						React.createElement("span", null, moments.length + " Lernmomente"),
						React.createElement("span", null, windows.length + " Stundenfenster"),
						React.createElement("span", null, decisionCount + " Entscheidungen")),
					React.createElement("button", { className: "pls-btn", onClick: load }, "Aktualisieren")),
				React.createElement("div", { className: "pls-path" }, data.root || ""),
				errEls.length > 0 ? errEls : null,
				feedback !== null ? React.createElement("div", { className: "pls-feedback" }, esc(feedback)) : null,

				React.createElement("div", { className: "pls-layout" },
					React.createElement("div", { className: "pls-main" },
						React.createElement("div", null,
							React.createElement("div", { className: "pls-toolbar" },
								React.createElement("span", { className: "pls-section-title", style: { marginBottom: 0 } }, "Lernlandschaft (Karten frei verschieben)")),
							React.createElement("div", { className: "pls-note" }, "Karte ziehen: auf freie Fläche = verschieben · auf ein Stundenfenster rechts = zuordnen · auf eine andere Karte = Übergang"),
							momentsSection),
						React.createElement("div", null,
							React.createElement("div", { className: "pls-section-title" }, "Übergänge"),
							transitionEls.length === 0
								? React.createElement("div", { className: "pls-note" }, "Keine Übergänge festgelegt — ziehe eine Karte auf eine andere Karte, um z. B. Reihenfolge, Wahl oder Treffpunkt anzulegen.")
								: React.createElement("div", null, transitionEls))),

					React.createElement("div", { className: "pls-side" },
						React.createElement("div", { className: "pls-toolbar" },
							React.createElement("span", { className: "pls-section-title", style: { marginBottom: 0 } }, "Stunden-Zuordnung"),
							React.createElement("button", { className: "pls-btn", disabled: saving, onClick: function() { setWinForm(true); } }, "+ Stundenfenster")),
						winEls.length === 0
							? React.createElement("div", { className: "pls-empty" }, "Noch keine Stundenfenster. Lege ein Fenster an (+ Stundenfenster) und ziehe Lernmomente hierher.")
							: React.createElement("div", { className: "pls-wins" }, winEls))),

				// ——— Editor overlay ———
				editor !== null
					? React.createElement("div", { className: "pls-overlay" },
						React.createElement("div", { className: "pls-editor" },
							React.createElement("div", { className: "pls-editor-head" },
								React.createElement("select", {
									className: "pls-editor-file",
									value: editor.file,
									onChange: function(e) { openEditor(e.target.value); },
								}, EDITABLE_FILES.map(function(f) {
									return React.createElement("option", { key: f, value: f }, f);
								})),
								React.createElement("span", { className: "pls-note" }, "Deine Änderung wird direkt gespeichert (Lehrkraft-Handlung).")),
							React.createElement("div", { className: "pls-editor-body" },
								React.createElement("textarea", {
									className: "pls-editor-text",
									spellCheck: false,
									value: editor.content,
									onChange: function(e) { setEditor({ file: editor.file, content: e.target.value }); },
								}),
								React.createElement("div", { className: "pls-editor-actions" },
									React.createElement("button", { className: "pls-btn", onClick: function() { setEditor(null); } }, "Abbrechen"),
									React.createElement("button", { className: "pls-btn pls-btn-edit", onClick: saveEditor }, "Speichern")))),
					)
					: null,

				// ——— Material picker overlay ———
				picker !== null
					? React.createElement("div", { className: "pls-overlay" },
						React.createElement("div", { className: "pls-dialog" },
							React.createElement("div", { className: "pls-dialog-head" },
								React.createElement("span", { className: "pls-title" }, "Materialien für " + picker.momentId)),
							React.createElement("div", { className: "pls-dialog-body" },
								picker.list.length === 0
									? React.createElement("div", { className: "pls-note" }, "Keine Dateien unter materials/ oder rendered/ gefunden.")
									: React.createElement("div", { className: "pls-picker-list" },
										picker.list.map(function(f) {
											const checked = picker.selected.indexOf(f) >= 0;
											return React.createElement("div", { key: f, className: "pls-picker-item" },
												React.createElement("input", {
													type: "checkbox",
													id: "pls-mat-" + f,
													checked: checked,
													onChange: function() { toggleMaterial(f); },
												}),
												React.createElement("label", { htmlFor: "pls-mat-" + f }, esc(f)));
										})),
								React.createElement("div", { className: "pls-dialog-actions" },
									React.createElement("button", { className: "pls-btn", onClick: function() { setPicker(null); } }, "Abbrechen"),
									React.createElement("button", { className: "pls-btn pls-btn-edit", onClick: saveMaterials }, "Übernehmen"))))
					)
					: null,

				// ——— Transition dialog ———
				transitionForm !== null
					? React.createElement("div", { className: "pls-overlay" },
						React.createElement("div", { className: "pls-dialog" },
							React.createElement("div", { className: "pls-dialog-head" },
								React.createElement("span", { className: "pls-title" }, "Übergang anlegen")),
							React.createElement("div", { className: "pls-dialog-body" },
								React.createElement("div", { className: "pls-note" },
									esc(transitionForm.from) + " → " + esc(transitionForm.to)),
								React.createElement("div", { className: "pls-form-row" },
									React.createElement("label", null, "Typ"),
									React.createElement("select", {
										className: "pls-select",
										style: { flex: 1 },
										value: transitionForm.type,
										onChange: function(e) { setTransitionForm(Object.assign({}, transitionForm, { type: e.target.value })); },
									}, TRANSITION_TYPE_OPTIONS.map(function(o) {
										return React.createElement("option", { key: o[0], value: o[0] }, o[1]);
									}))),
								React.createElement("div", { className: "pls-form-row" },
									React.createElement("label", null, "Begründung"),
									React.createElement("input", {
										className: "pls-input",
										style: { flex: 1 },
										value: transitionForm.rationale,
										placeholder: "optional, z. B. 'unterschiedliche Einstiege je Gruppe'",
										onChange: function(e) { setTransitionForm(Object.assign({}, transitionForm, { rationale: e.target.value })); },
									})),
								React.createElement("div", { className: "pls-dialog-actions" },
									React.createElement("button", { className: "pls-btn", onClick: function() { setTransitionForm(null); } }, "Abbrechen"),
									React.createElement("button", { className: "pls-btn pls-btn-edit", onClick: submitTransition }, "Anlegen"))))
					)
					: null,

				// ——— Moment editor (single moment, structured) ———
				momentEdit !== null
					? React.createElement(MomentEditor, { moment: momentEdit, onCancel: function() { setMomentEdit(null); }, onSave: saveMoment })
					: null,

				// ——— New window form ———
				winForm
					? React.createElement(NewWindowForm, { onCancel: function() { setWinForm(false); }, onAdd: addWindow })
					: null);
		}

		function MomentEditor(props) {
			const m = props.moment;
			const titleState = React.useState(m.title || "");
			const title = titleState[0];
			const setTitle = titleState[1];
			const typeState = React.useState(m.type || "other");
			const type = typeState[0];
			const setType = typeState[1];
			const fnState = React.useState(m.function || "");
			const fn = fnState[0];
			const setFn = fnState[1];
			const laState = React.useState(m.learning_activity || "");
			const la = laState[0];
			const setLa = laState[1];
			const eeState = React.useState(m.expected_experience || "");
			const ee = eeState[0];
			const setEe = eeState[1];
			const needsState = React.useState((Array.isArray(m.material_needs) ? m.material_needs : []).join("\n"));
			const needs = needsState[0];
			const setNeeds = needsState[1];
			const qsState = React.useState((Array.isArray(m.open_questions) ? m.open_questions : []).join("\n"));
			const qs = qsState[0];
			const setQs = qsState[1];

			function submit() {
				props.onSave({
					title: title.trim(),
					type: type,
					function: fn.trim(),
					learning_activity: la.trim(),
					expected_experience: ee.trim(),
					material_needs: needs.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean),
					open_questions: qs.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean),
				});
			}

			const field = function(label, control) {
				return React.createElement("div", { className: "pls-form-row" },
					React.createElement("label", null, label), control);
			};

			return React.createElement("div", { className: "pls-overlay" },
				React.createElement("div", { className: "pls-dialog" },
					React.createElement("div", { className: "pls-dialog-head" },
						React.createElement("span", { className: "pls-title" }, "Lernmoment „" + (m.title || m.id) + "“")),
					React.createElement("div", { className: "pls-dialog-body" },
						field("Titel", React.createElement("input", { className: "pls-input", style: { flex: 1 }, value: title, onChange: function(e) { setTitle(e.target.value); } })),
						field("Typ", React.createElement("select", { className: "pls-select", style: { flex: 1 }, value: type, onChange: function(e) { setType(e.target.value); } }, MOMENT_TYPES.map(function(t) { return React.createElement("option", { key: t, value: t }, typeLabel(t)); }))),
						field("Funktion", React.createElement("input", { className: "pls-input", style: { flex: 1 }, value: fn, onChange: function(e) { setFn(e.target.value); } })),
						field("Lernaktivität", React.createElement("textarea", { className: "pls-editor-text", style: { height: "48px" }, value: la, onChange: function(e) { setLa(e.target.value); } })),
						field("Erwartete Lernerfahrung", React.createElement("textarea", { className: "pls-editor-text", style: { height: "48px" }, value: ee, onChange: function(e) { setEe(e.target.value); } })),
						field("Materialbedarfe (eine pro Zeile)", React.createElement("textarea", { className: "pls-editor-text", style: { height: "48px" }, value: needs, onChange: function(e) { setNeeds(e.target.value); } })),
						field("Offene Fragen (eine pro Zeile)", React.createElement("textarea", { className: "pls-editor-text", style: { height: "48px" }, value: qs, onChange: function(e) { setQs(e.target.value); } })),
						React.createElement("div", { className: "pls-dialog-actions" },
							React.createElement("button", { className: "pls-btn", onClick: props.onCancel }, "Abbrechen"),
							React.createElement("button", { className: "pls-btn pls-btn-edit", onClick: submit }, "Speichern")))));
		}

		function NewWindowForm(props) {
			const titleState = React.useState("");
			const title = titleState[0];
			const setTitle = titleState[1];
			const kindState = React.useState("lesson");
			const kind = kindState[0];
			const setKind = kindState[1];
			const durState = React.useState(45);
			const dur = durState[0];
			const setDur = durState[1];

			function submit() {
				const t = title.trim();
				if (t === "") return;
				props.onAdd({ title: t, kind: kind, duration: parseInt(dur, 10) || 45 });
			}

			return React.createElement("div", { className: "pls-overlay" },
				React.createElement("div", { className: "pls-dialog" },
					React.createElement("div", { className: "pls-dialog-head" },
						React.createElement("span", { className: "pls-title" }, "Neues Stundenfenster")),
					React.createElement("div", { className: "pls-dialog-body" },
						React.createElement("div", { className: "pls-form-row" },
							React.createElement("label", { htmlFor: "pls-nw-title" }, "Titel"),
							React.createElement("input", {
								id: "pls-nw-title",
								className: "pls-input",
								style: { flex: 1 },
								value: title,
								placeholder: "z. B. Stunde 2 – Vertiefung",
								onChange: function(e) { setTitle(e.target.value); },
							})),
						React.createElement("div", { className: "pls-form-row" },
							React.createElement("label", { htmlFor: "pls-nw-kind" }, "Art"),
							React.createElement("select", {
								id: "pls-nw-kind",
								className: "pls-select",
								value: kind,
								onChange: function(e) { setKind(e.target.value); },
							}, ["lesson", "double_lesson", "project_block", "open_learning_time"].map(function(k) {
								return React.createElement("option", { key: k, value: k }, kindLabel(k));
							}))),
						React.createElement("div", { className: "pls-form-row" },
							React.createElement("label", { htmlFor: "pls-nw-dur" }, "Dauer (Min.)"),
							React.createElement("input", {
								id: "pls-nw-dur",
								className: "pls-input pls-minutes",
								type: "number",
								min: 5,
								max: 240,
								value: dur,
								onChange: function(e) { setDur(e.target.value); },
							})),
						React.createElement("div", { className: "pls-dialog-actions" },
							React.createElement("button", { className: "pls-btn", onClick: props.onCancel }, "Abbrechen"),
							React.createElement("button", { className: "pls-btn pls-btn-edit", onClick: submit }, "Anlegen")))));
		}

		return {
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("conversation.view", function() {
					ctx.slots.register(
						{ name: "conversation.view", id: "landscape", order: 30, label: "Lernlandschaft" },
						function(props) { return React.createElement(LandscapeView, props); },
					);
				});
			},
		};
	},
});
