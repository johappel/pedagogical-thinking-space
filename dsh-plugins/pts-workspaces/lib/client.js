// pts-workspaces — Client half (Classic Script, loaded via window.__ModuleLoader__).
//
// Takeovers (both single slots, priority -1 so they shadow the shipped
// default-priority occupants without a tie boot error):
//
//   sidebar.workspaces          -> PTS "Arbeitsräume" browser. Lists ONLY
//                                  direct children of <PTS>/workspace/.
//                                  Header "+" opens the PTS create dialog
//                                  instead of the shipped directory flow.
//   conversation.hero.workspace -> PTS picker for the empty-state chip. Same
//                                  scope restriction; its footer action is
//                                  "Neuen Denkraum anlegen…" (no Explorer).
//
// Scope enforcement is visual and deliberate: the DSH workspace registry may
// still hold foreign registrations (the registry storage is SHARED between
// profiles, so mutating it here would leak into standard web 3080). This
// plugin therefore filters what teachers see and never mutates foreign rows.
//
// Creating a Denkraum: name -> POST /api/pts-workspaces/create (host half
// derives slug + scaffolds minimal kernel structure behind a hard path
// boundary) -> adopt path through ctx.workspaces.create({path}) (normal wire,
// idempotent) -> rename to the teacher's wording -> connect/open.
window.__ModuleLoader__.load({
	id: "pts-workspaces",
	factory: (require) => {
		const React = require("react");

		const STYLE = `
.ptsw-root { box-sizing:border-box; min-height:0; flex:1; display:flex; flex-direction:column; padding-right:var(--dsh-sidebar-inline-padding,12px); }
.ptsw-header { display:flex; align-items:center; gap:4px; height:36px; margin-bottom:4px; padding-left:4px; flex:none; }
.ptsw-header-label { font-size:12px; letter-spacing:.3px; opacity:.65; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
.ptsw-list { min-height:0; flex:1; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:1px; padding-bottom:10px; }
.ptsw-wsrow { display:flex; align-items:center; gap:7px; height:32px; padding:0 8px; border-radius:8px; cursor:pointer; user-select:none; color:inherit; }
.ptsw-wsrow:hover { background:rgba(128,128,128,.14); }
.ptsw-chevron { width:10px; flex:none; display:inline-flex; justify-content:center; font-size:9px; line-height:1; opacity:.55; transition:transform .15s ease; }
.ptsw-chevron-open { transform:rotate(90deg); }
.ptsw-folder { width:16px; flex:none; display:inline-flex; opacity:.75; }
.ptsw-wstitle { font-size:13px; line-height:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.ptsw-count { font-size:10.5px; opacity:.5; flex:none; }
.ptsw-rowadd { visibility:hidden; border:none; background:transparent; color:inherit; opacity:.65; cursor:pointer; width:20px; height:20px; border-radius:6px; flex:none; font-size:13px; line-height:1; }
.ptsw-wsrow:hover .ptsw-rowadd { visibility:visible; }
.ptsw-rowadd:hover { background:rgba(128,128,128,.2); opacity:1; }
.ptsw-rowdel { visibility:hidden; border:none; background:transparent; color:inherit; opacity:.65; cursor:pointer; width:20px; height:20px; border-radius:6px; flex:none; line-height:1; padding:0 0 2px; display:inline-flex; align-items:center; justify-content:center; font-size:14px; }
.ptsw-wsrow:hover .ptsw-rowdel { visibility:visible; }
.ptsw-rowdel:hover { background:rgba(224,108,117,.22); opacity:1; }
.ptsw-srow { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 30px; border-radius:8px; cursor:pointer; color:inherit; }
.ptsw-srow:hover { background:rgba(128,128,128,.14); }
.ptsw-dot { width:7px; height:7px; border-radius:50%; flex:none; background:rgba(128,128,128,.35); }
.ptsw-dot-run { background:#4caf78; }
.ptsw-dot-wait { background:#e0a34c; }
.ptsw-stitle { font-size:12.5px; line-height:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; opacity:.92; }
.ptsw-stime { font-size:10.5px; opacity:.45; flex:none; }
.ptsw-note { font-size:12px; line-height:1.55; opacity:.6; padding:10px 8px; }
.ptsw-note-error { opacity:.85; color:#e06c75; }
.ptsw-empty-btn { margin:6px 8px 0; align-self:flex-start; }
.ptsw-iconbtn { border:none; background:transparent; color:inherit; opacity:.7; cursor:pointer; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; flex:none; font-size:15px; line-height:1; }
.ptsw-iconbtn:hover { background:rgba(128,128,128,.18); opacity:1; }
.ptsw-rail { display:flex; flex-direction:column; align-items:center; gap:8px; padding-top:4px; }
.ptsw-menu { position:fixed; z-index:1200; min-width:280px; max-width:360px; max-height:min(380px,60vh); overflow-y:auto; background:Canvas; color:CanvasText; border:1px solid rgba(128,128,128,.35); border-radius:10px; box-shadow:0 10px 32px rgba(0,0,0,.22); padding:6px; box-sizing:border-box; }
.ptsw-menu-label { font-size:11px; letter-spacing:.4px; opacity:.6; padding:6px 8px 4px; }
.ptsw-mitem { display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:none; background:transparent; color:inherit; cursor:pointer; border-radius:8px; padding:8px; font-size:13px; }
.ptsw-mitem:hover { background:rgba(128,128,128,.16); }
.ptsw-mitem-selected { background:rgba(128,128,128,.12); }
.ptsw-mcheck { margin-left:auto; opacity:.7; font-size:12px; }
.ptsw-msep { height:1px; background:rgba(128,128,128,.25); margin:6px 4px; }
.ptsw-mcreate { display:flex; align-items:center; gap:8px; width:100%; border:none; background:transparent; color:inherit; cursor:pointer; border-radius:8px; padding:9px 8px; font-size:13px; font-weight:500; }
.ptsw-mcreate:hover { background:rgba(79,109,245,.16); }
.ptsw-overlay { position:fixed; inset:0; z-index:1300; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; }
.ptsw-dialog { width:min(420px, calc(100vw - 48px)); background:Canvas; color:CanvasText; border:1px solid rgba(128,128,128,.35); border-radius:12px; box-shadow:0 18px 48px rgba(0,0,0,.3); padding:18px; box-sizing:border-box; }
.ptsw-dialog h3 { margin:0 0 4px; font-size:15px; }
.ptsw-dialog-sub { font-size:12px; opacity:.65; line-height:1.5; margin:0 0 12px; }
.ptsw-input { width:100%; box-sizing:border-box; font:inherit; font-size:14px; padding:8px 10px; border-radius:8px; border:1px solid rgba(128,128,128,.45); background:transparent; color:inherit; outline:none; }
.ptsw-input:focus { border-color:#4f6df5; }
.ptsw-slugpreview { font-size:11.5px; opacity:.55; margin:6px 2px 0; word-break:break-all; }
.ptsw-error { color:#e06c75; font-size:12px; line-height:1.5; margin:8px 2px 0; white-space:pre-wrap; word-break:break-word; }
.ptsw-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
.ptsw-btn { font:inherit; font-size:13px; border-radius:8px; padding:7px 14px; cursor:pointer; border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; }
.ptsw-btn:hover { background:rgba(128,128,128,.15); }
.ptsw-btn-primary { background:#4f6df5; border-color:#4f6df5; color:#fff; }
.ptsw-btn-primary:hover { background:#3d59d8; }
.ptsw-btn-primary:disabled { opacity:.55; cursor:default; }
.ptsw-btn-danger { background:#c0504d; border-color:#c0504d; color:#fff; }
.ptsw-btn-danger:hover { background:#a83f3d; }
.ptsw-btn-danger:disabled { opacity:.55; cursor:default; }
.ptsw-actions-col { flex-direction:column; align-items:stretch; gap:8px; margin-top:16px; }
.ptsw-actions-col .ptsw-btn { text-align:center; }
.ptsw-del-path { font-size:11.5px; opacity:.55; word-break:break-all; margin:0 2px 4px; }
`;
		const STYLE_TAG_ID = "pts-workspaces-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = STYLE;
			document.head.appendChild(tag);
		}

		function normPath(p) {
			return String(p == null ? "" : p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
		}

		function umlautFold(s) {
			return String(s).replace(/[äöüßÄÖÜ]/g, (ch) => {
				const map = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
				return map[ch.toLowerCase()] ?? ch;
			});
		}

		function slugPreview(name) {
			let s = umlautFold(name).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
			s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "").slice(0, 60).replace(/-+$/, "");
			return s;
		}

		function relTimeDe(ts) {
			if (typeof ts !== "number" || !(ts > 0)) return "";
			const diff = Math.max(0, Date.now() - ts);
			const MIN = 60000, HOUR = 3600000, DAY = 86400000;
			if (diff < MIN) return "gerade eben";
			if (diff < HOUR) return Math.floor(diff / MIN) + " Min.";
			if (diff < DAY) return Math.floor(diff / HOUR) + " Std.";
			if (diff < 30 * DAY) return Math.floor(diff / DAY) + " Tg.";
			try { return new Date(ts).toLocaleDateString(undefined); } catch { return ""; }
		}

		/** Direct children of <PTS>/workspace/ only — that IS a Denkraum. */
		function derivePtsWorkspaces(wsSnap, cfg) {
			if (!cfg || typeof cfg.root !== "string" || cfg.root === "") {
				return { items: [], failed: cfg != null };
			}
			// The boundary is <PTS>/workspace/, NOT the repo root: cfg.root is the
			// repository itself, so filtering against root+"/" would reject every
			// candidate (each path's remainder "workspace/<slug>" contains a slash).
			const base = typeof cfg.workspaceDir === "string" && cfg.workspaceDir !== ""
				? cfg.workspaceDir
				: cfg.root.replace(/[\\/]+$/, "") + "/workspace";
			const prefix = normPath(base) + "/";
			const all = wsSnap && Array.isArray(wsSnap.items) ? wsSnap.items : [];
			const items = [];
			for (const w of all) {
				const p = normPath(w && w.path);
				if (p === "" || !p.startsWith(prefix)) continue;
				const rest = p.slice(prefix.length);
				// Dot-dirs (e.g. the recoverable .trash) are never Denkräume.
				if (rest === "" || rest.indexOf("/") !== -1 || rest.startsWith(".")) continue;
				items.push(w);
			}
			return { items, failed: false };
		}

		function visibleSessions(sessSnap, ws, archived) {
			const out = [];
			const ids = ws && Array.isArray(ws.sessionIds) ? ws.sessionIds : [];
			for (const id of ids) {
				const s = sessSnap && sessSnap.byId ? sessSnap.byId[id] : undefined;
				if (!s) continue;
				if (s.origin === "subagent") continue;
				if (archived.indexOf(id) >= 0) continue;
				if (s.blank && sessSnap.current !== id) continue;
				out.push(s);
			}
			return out;
		}

		function FolderIcon() {
			return React.createElement("span", { className: "ptsw-folder", "aria-hidden": true },
				React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 16 16", fill: "currentColor" },
					React.createElement("path", { d: "M1.5 4.2c0-.66.54-1.2 1.2-1.2h3.1c.37 0 .72.17.95.46L7.9 4.8h5.4c.66 0 1.2.54 1.2 1.2v5.8c0 .66-.54 1.2-1.2 1.2H2.7c-.66 0-1.2-.54-1.2-1.2V4.2z", opacity: .8 })));
		}

		function TrashIcon() {
			return React.createElement("span", { "aria-hidden": true, style: { display: "inline-flex" } },
				React.createElement("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "currentColor" },
					React.createElement("path", { d: "M6.3 1.5h3.4c.3 0 .55.25.55.55V2.6h3.05c.31 0 .55.24.55.55s-.24.55-.55.55H2.7c-.31 0-.55-.24-.55-.55s.24-.55.55-.55h3.05v-.55c0-.3.25-.55.55-.55zM3.65 4.85h8.7l-.52 8.3c-.05.75-.67 1.35-1.42 1.35H5.59c-.75 0-1.37-.6-1.42-1.35l-.52-8.3zm2.6 2.1c-.28.02-.49.27-.47.55l.35 5.05c.02.28.27.49.55.47.28-.02.49-.27.47-.55l-.35-5.05c-.02-.28-.27-.49-.55-.47zm2.9.48a.51.51 0 0 0-.47.55l-.35 5.05c-.02.28.19.53.47.55.28.02.53-.19.55-.47l.35-5.05a.51.51 0 0 0-.55-.63z" })));
		}

		function StatusDot(session) {
			let cls = "";
			if (session.pendingInteraction === "approval" || session.pendingInteraction === "question" || session.pendingInteraction === "plan-review") cls = " ptsw-dot-wait";
			else if (session.running) cls = " ptsw-dot-run";
			return React.createElement("span", { className: "ptsw-dot" + cls });
		}

		// ------------------------------------------------------------------
		// Shared create dialog (name only for this spike).
		// ------------------------------------------------------------------
		function CreateDialog(props) {
			const [name, setName] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);
			const inputRef = React.useRef(null);
			React.useEffect(() => {
				if (props.open) {
					setName("");
					setError(null);
					setBusy(false);
					const t = window.setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 30);
					return () => window.clearTimeout(t);
				}
				return undefined;
			}, [props.open]);
			if (!props.open) return null;
			const trimmed = name.trim();
			const submit = () => {
				if (busy || trimmed === "") return;
				setBusy(true);
				setError(null);
				Promise.resolve().then(() => props.onSubmit(trimmed)).then(() => {
					setBusy(false);
					props.onClose();
				}, (err) => {
					setBusy(false);
					setError(err && err.message ? err.message : String(err));
				});
			};
			return React.createElement("div", {
				className: "ptsw-overlay",
				onMouseDown: (e) => { if (e.target === e.currentTarget && !busy) props.onClose(); },
			},
			React.createElement("div", {
				className: "ptsw-dialog",
				role: "dialog",
				"aria-modal": "true",
				onKeyDown: (e) => {
					if (e.key === "Escape" && !busy) props.onClose();
					if (e.key === "Enter") submit();
				},
			},
			React.createElement("h3", null, "Neuen Denkraum anlegen"),
			React.createElement("p", { className: "ptsw-dialog-sub" },
				"Ein Denkraum ist ein pädagogischer Arbeitsraum. Er wird unter workspace/ im Pedagogical Thinking Space angelegt."),
			React.createElement("input", {
				ref: inputRef,
				className: "ptsw-input",
				placeholder: "Name des Denkraums",
				value: name,
				onChange: (e) => setName(e.target.value),
				disabled: busy,
				autoFocus: true,
			}),
			trimmed !== "" && slugPreview(trimmed) !== ""
				? React.createElement("div", { className: "ptsw-slugpreview" }, "Ordner: workspace/" + slugPreview(trimmed))
				: null,
			error ? React.createElement("div", { className: "ptsw-error", role: "alert" }, error) : null,
			React.createElement("div", { className: "ptsw-actions" },
				React.createElement("button", { className: "ptsw-btn", onClick: props.onClose, disabled: busy }, "Abbrechen"),
				React.createElement("button", { className: "ptsw-btn ptsw-btn-primary", onClick: submit, disabled: busy || trimmed === "" }, busy ? "Lege an …" : "Anlegen"))));
		}

		// ------------------------------------------------------------------
		// Deletion confirm dialog. Two distinct outcomes, both reversible in
		// different ways: unregister only (folder untouched) vs. unregister
		// + move the folder into the recoverable workspace/.trash/. The
		// registry removal itself ALWAYS goes through the official wire API.
		// ------------------------------------------------------------------
		function DeleteDialog(props) {
			if (!props.open || !props.ws) return null;
			const onKeyDown = (e) => {
				if (e.key === "Escape" && !props.busy) props.onClose();
			};
			return React.createElement("div", {
				className: "ptsw-overlay",
				onMouseDown: (e) => { if (e.target === e.currentTarget && !props.busy) props.onClose(); },
			},
			React.createElement("div", {
				className: "ptsw-dialog",
				role: "dialog",
				"aria-modal": "true",
				onKeyDown,
			},
			React.createElement("h3", null, "Denkraum entfernen"),
			React.createElement("p", { className: "ptsw-dialog-sub" },
				`„${props.ws.title}" wird aus der Arbeitsraumliste entfernt. Der Sitzungsverlauf bleibt erhalten.`),
			React.createElement("div", { className: "ptsw-del-path" }, props.ws.path),
			props.error ? React.createElement("div", { className: "ptsw-error", role: "alert" }, props.error) : null,
			React.createElement("div", { className: "ptsw-actions ptsw-actions-col" },
				React.createElement("button", { className: "ptsw-btn ptsw-btn-danger", disabled: props.busy, onClick: props.onDeleteFolder },
					props.busy ? "Verschiebe …" : "Entfernen und Ordner in den Papierkorb verschieben"),
				React.createElement("button", { className: "ptsw-btn", disabled: props.busy, onClick: props.onKeep },
					"Nur aus der Liste entfernen – Ordner behalten"),
				React.createElement("button", { className: "ptsw-btn", disabled: props.busy, onClick: props.onClose }, "Abbrechen")),
			React.createElement("p", { className: "ptsw-slugpreview" },
				"Beim Löschen wird der Ordner nach workspace/.trash/ verschoben – dort wiederherstellbar, kein endgültiges Löschen.")));
		}

		// ------------------------------------------------------------------
		// Hook pair shared by both seats: config fetch + scoped items.
		// ------------------------------------------------------------------
		function usePtsScope(useWorkspaces, loadConfig) {
			const wsSnap = useWorkspaces((s) => s);
			const [cfg, setCfg] = React.useState(null);
			React.useEffect(() => {
				let live = true;
				Promise.resolve().then(loadConfig).then((c) => { if (live) setCfg(c); }, () => { if (live) setCfg({ root: null }); });
				return () => { live = false; };
			}, [loadConfig]);
			const derived = derivePtsWorkspaces(wsSnap, cfg);
			const loading = cfg === null;
			const archived = wsSnap && Array.isArray(wsSnap.archivedSessionIds) ? wsSnap.archivedSessionIds : [];
			return { wsSnap, loading, failed: derived.failed, items: derived.items, archived };
		}

		// ------------------------------------------------------------------
		// Sidebar seat: the "Arbeitsräume" region.
		// ------------------------------------------------------------------
		function PtsWorkspaceBrowser(props) {
			const { wide, expandSidebar, useWorkspaces, useSessions, createDenkraum, removeDenkraum, startSession, openSession, clearSelection, loadConfig } = props;
			const sessSnap = useSessions((s) => s);
			const scope = usePtsScope(useWorkspaces, loadConfig);
			const [expanded, setExpanded] = React.useState({});
			const [dialogOpen, setDialogOpen] = React.useState(false);
			const [deleteTarget, setDeleteTarget] = React.useState(null);
			const [delBusy, setDelBusy] = React.useState(false);
			const [delError, setDelError] = React.useState(null);

			const onCreate = () => setDialogOpen(true);
			const onSubmit = (name) => Promise.resolve().then(() => createDenkraum(name)).then((ws) => {
				if (ws && ws.workspaceId) startSession(ws.workspaceId);
				return ws;
			});

			const askDelete = (ws) => { setDelError(null); setDeleteTarget(ws); };
			const closeDelete = () => { if (!delBusy) { setDeleteTarget(null); setDelError(null); } };
			/**
			 * Unregister (official wire API) and optionally trash the folder.
			 * Afterwards keep selection consistent: if the CURRENT session lived
			 * inside the removed Denkraum, return to the start view instead of a
			 * dangling workspace view.
			 */
			const doRemove = async (ws, trash) => {
				setDelBusy(true);
				setDelError(null);
				try {
					await removeDenkraum(ws, { trash });
					const cur = sessSnap.current;
					const curRow = cur !== undefined && sessSnap.byId ? sessSnap.byId[cur] : undefined;
					if (curRow && typeof curRow.cwd === "string" && normPath(curRow.cwd).startsWith(normPath(ws.path) + "/")) {
						clearSelection();
					}
					setExpanded((prev) => { const next = { ...prev }; delete next[ws.workspaceId]; return next; });
					setDeleteTarget(null);
					setDelError(null);
				} catch (err) {
					setDelError(err && err.message ? err.message : String(err));
				} finally {
					setDelBusy(false);
				}
			};

			if (!wide) {
				return React.createElement("div", { className: "ptsw-rail" },
					React.createElement("button", { className: "ptsw-iconbtn", title: "Neuen Denkraum anlegen", "aria-label": "Neuen Denkraum anlegen", onClick: onCreate }, "+"),
					React.createElement(CreateDialog, { open: dialogOpen, onClose: () => setDialogOpen(false), onSubmit }));
			}

			const rows = [];
			for (const ws of scope.items) {
				const isOpen = expanded[ws.workspaceId] === true;
				const sessions = visibleSessions(sessSnap, ws, scope.archived);
				rows.push(React.createElement("div", {
					key: ws.workspaceId,
					className: "ptsw-wsrow",
					role: "treeitem",
					"aria-expanded": isOpen,
					title: ws.path,
					onClick: () => setExpanded((prev) => ({ ...prev, [ws.workspaceId]: !isOpen })),
				},
				React.createElement("span", { className: "ptsw-chevron" + (isOpen ? " ptsw-chevron-open" : ""), "aria-hidden": true }, "▶"),
				React.createElement(FolderIcon, null),
				React.createElement("span", { className: "ptsw-wstitle" }, ws.title),
				sessions.length > 0 ? React.createElement("span", { className: "ptsw-count" }, String(sessions.length)) : null,
				React.createElement("button", {
					className: "ptsw-rowadd",
					title: "Neue Sitzung in diesem Denkraum",
					"aria-label": "Neue Sitzung in „" + ws.title + "“",
					onClick: (e) => { e.stopPropagation(); startSession(ws.workspaceId); },
				}, "+"),
				React.createElement("button", {
					className: "ptsw-rowdel",
					title: "„" + ws.title + "“ entfernen",
					"aria-label": "Denkraum „" + ws.title + "“ entfernen",
					onClick: (e) => { e.stopPropagation(); askDelete(ws); },
				}, TrashIcon())));
				if (isOpen) {
					if (sessions.length === 0) {
						rows.push(React.createElement("div", { key: ws.workspaceId + ":empty", className: "ptsw-note", style: { padding: "2px 8px 6px 30px" } }, "Noch keine Sitzungen in diesem Denkraum."));
					}
					for (const s of sessions) {
						rows.push(React.createElement("div", {
							key: ws.workspaceId + ":" + s.id,
							className: "ptsw-srow",
							onClick: () => openSession(s.id),
							title: s.displayTitle || "",
						},
						StatusDot(s),
						React.createElement("span", { className: "ptsw-stitle" }, s.blank ? "Neue Sitzung" : (s.displayTitle || "Sitzung")),
						s.blank ? null : React.createElement("span", { className: "ptsw-stime" }, relTimeDe(s.updatedAt))));
					}
				}
			}

			let body;
			if (scope.loading) {
				body = React.createElement("div", { className: "ptsw-note" }, "Lade Arbeitsräume …");
			} else if (scope.failed) {
				body = React.createElement("div", { className: "ptsw-note ptsw-note-error" },
					"PTS-Arbeitsräume nicht erreichbar. Der Host-Dienst (/api/pts-workspaces) ist nicht aktiv.");
			} else if (scope.items.length === 0) {
				body = [
					React.createElement("div", { key: "hint", className: "ptsw-note" }, "Noch kein Denkraum vorhanden."),
					React.createElement("button", { key: "btn", className: "ptsw-btn ptsw-btn-primary ptsw-empty-btn", onClick: onCreate }, "+ Ersten Denkraum anlegen"),
				];
			} else {
				body = rows;
			}

			return React.createElement("div", { className: "ptsw-root" },
				React.createElement("div", { className: "ptsw-header" },
					React.createElement("span", { className: "ptsw-header-label" }, "Arbeitsräume"),
					React.createElement("button", {
						className: "ptsw-iconbtn",
						title: "Neuen Denkraum anlegen",
						"aria-label": "Neuen Denkraum anlegen",
						onClick: onCreate,
					}, "+")),
				React.createElement("div", { className: "ptsw-list", role: "tree", "aria-label": "Arbeitsräume" }, body),
				React.createElement(CreateDialog, { open: dialogOpen, onClose: () => setDialogOpen(false), onSubmit }),
				React.createElement(DeleteDialog, {
					open: deleteTarget !== null,
					ws: deleteTarget,
					busy: delBusy,
					error: delError,
					onClose: closeDelete,
					onKeep: () => doRemove(deleteTarget, false),
					onDeleteFolder: () => doRemove(deleteTarget, true),
				}));
		}

		// ------------------------------------------------------------------
		// Empty-state seat: the hero workspace picker.
		// ------------------------------------------------------------------
		function PtsWorkspacePicker(props) {
			const { open, anchorRef, selectedId, onPick, onClose, useWorkspaces, createDenkraum, loadConfig } = props;
			const scope = usePtsScope(useWorkspaces, loadConfig);
			const [rect, setRect] = React.useState(null);
			const [dialogOpen, setDialogOpen] = React.useState(false);
			const menuRef = React.useRef(null);

			React.useEffect(() => {
				if (!open) {
					setRect(null);
					return undefined;
				}
				const el = anchorRef && anchorRef.current;
				setRect(el && typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null);
				const onDown = (e) => {
					if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
					if (el && e.target instanceof Node && el.contains(e.target)) return;
					onClose();
				};
				const onKey = (e) => { if (e.key === "Escape") onClose(); };
				document.addEventListener("mousedown", onDown);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onDown);
					document.removeEventListener("keydown", onKey);
				};
			}, [open, anchorRef, onClose]);

			const startCreate = () => {
				onClose();
				setDialogOpen(true);
			};
			const onSubmit = (name) => Promise.resolve().then(() => createDenkraum(name)).then((ws) => {
				if (ws && ws.workspaceId && typeof onPick === "function") onPick(ws.workspaceId);
				return ws;
			});

			const menu = (() => {
				if (!open || !rect) return null;
				const top = Math.min(rect.bottom + 6, (window.innerHeight || 900) - 80);
				const left = Math.min(Math.max(8, rect.left), Math.max(8, (window.innerWidth || 1200) - 320));
				const children = [];
				children.push(React.createElement("div", { key: "label", className: "ptsw-menu-label" }, "Arbeitsräume"));
				if (scope.loading) {
					children.push(React.createElement("div", { key: "loading", className: "ptsw-note" }, "Lade Arbeitsräume …"));
				} else if (scope.failed) {
					children.push(React.createElement("div", { key: "failed", className: "ptsw-note ptsw-note-error" }, "PTS-Arbeitsräume nicht erreichbar."));
				} else if (scope.items.length === 0) {
					children.push(React.createElement("div", { key: "empty", className: "ptsw-note" }, "Noch kein Denkraum vorhanden."));
				} else {
					for (const ws of scope.items) {
						const selected = selectedId !== undefined && selectedId === ws.workspaceId;
						children.push(React.createElement("button", {
							key: ws.workspaceId,
							className: "ptsw-mitem" + (selected ? " ptsw-mitem-selected" : ""),
							title: ws.path,
							onClick: () => onPick(ws.workspaceId),
						},
						React.createElement(FolderIcon, null),
						React.createElement("span", null, ws.title),
						selected ? React.createElement("span", { className: "ptsw-mcheck" }, "✓") : null));
					}
				}
				children.push(React.createElement("div", { key: "sep", className: "ptsw-msep" }));
				children.push(React.createElement("button", { key: "create", className: "ptsw-mcreate", onClick: startCreate },
					React.createElement("span", { "aria-hidden": true, style: { fontWeight: 600 } }, "+"),
					"Neuen Denkraum anlegen …"));
				return React.createElement("div", {
					ref: menuRef,
					className: "ptsw-menu",
					style: { top: top + "px", left: left + "px" },
					role: "menu",
				}, children);
			})();

			return React.createElement(React.Fragment, null,
				menu,
				React.createElement(CreateDialog, { open: dialogOpen, onClose: () => setDialogOpen(false), onSubmit }));
		}

		/**
		 * Boot scope guard (runs once per page load): when both baselines are
		 * ready and the CURRENT session lives outside <PTS>/workspace/, deselect
		 * it so pts-web boots into the PTS start state instead of a restored
		 * foreign directory session. The session itself is kept (no data loss);
		 * only the auto-restored selection is cleared. Bounded: gives up after
		 * ~20 s so a slow backend cannot keep timers alive forever.
		 */
		function installBootScopeGuard(ctx, workspaces, sessions, loadConfig) {
			let stopped = false;
			const timer = setInterval(() => { void check(); }, 500);
			const timeout = setTimeout(stop, 20000);
			async function check() {
				try {
					const wsSnap = workspaces.list.getSnapshot();
					if (!wsSnap || wsSnap.baselinesReady !== true) return;
					const cfg = await loadConfig();
					if (!cfg || typeof cfg.root !== "string" || cfg.root === "") { stop(); return; }
					const base = typeof cfg.workspaceDir === "string" && cfg.workspaceDir !== ""
						? cfg.workspaceDir
						: cfg.root.replace(/[\\/]+$/, "") + "/workspace";
					const prefix = normPath(base) + "/";
					const sess = sessions.list.getSnapshot();
					if (sess && sess.current !== undefined) {
						const summary = sess.byId ? sess.byId[sess.current] : undefined;
						const cwd = summary ? normPath(summary.cwd) : "";
						if (cwd !== "" && !cwd.startsWith(prefix)) {
							console.info("[pts-workspaces] boot guard: restored session outside the PTS workspace scope - returning to the start view");
							sessions.clear();
						}
					}
				} catch (error) {
					console.warn("[pts-workspaces] boot guard skipped:", error);
				}
				stop();
			}
			function stop() {
				if (stopped) return;
				stopped = true;
				clearInterval(timer);
				clearTimeout(timeout);
			}
			ctx.effect(() => () => stop(), "pts-workspaces: boot scope guard");
		}

		/** Required services (cordis fiber inject). */
		const inject = ["slots", "workspaces", "sessions"];

		function apply(ctx) {
			const workspaces = ctx.workspaces;
			const sessions = ctx.sessions;
			if (workspaces === undefined || sessions === undefined) {
				console.error("[pts-workspaces] workspaces/sessions service missing - plugin inactive");
				return;
			}

			installBootScopeGuard(ctx, workspaces, sessions, loadConfig);

			let cfgPromise = null;
			function loadConfig() {
				if (cfgPromise === null) {
					cfgPromise = fetch("/api/pts-workspaces/config", { headers: { accept: "application/json" } })
						.then((res) => res.json())
						.then((data) => (data && data.ok && typeof data.root === "string"
							? { root: data.root, workspaceDir: data.workspaceDir }
							: { root: null, error: data && data.error }))
						.catch((err) => ({ root: null, error: String(err) }));
				}
				return cfgPromise;
			}

			/**
			 * Name -> scaffolded directory (host, hard boundary) -> normal DSH
			 * adoption (registry frames fire on their own) -> teacher-facing title.
			 */
			async function createDenkraum(rawName) {
				const res = await fetch("/api/pts-workspaces/create", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: rawName }),
				});
				let data = null;
				try { data = await res.json(); } catch { /* non-JSON failure */ }
				if (!res.ok || !data || data.ok !== true) {
					const message = data && data.message ? data.message : "Der Denkraum konnte nicht angelegt werden (HTTP " + res.status + ").";
					const err = new Error(message);
					err.code = data && data.error;
					throw err;
				}
				const display = String(rawName).trim();
				const ws = await workspaces.create({ path: data.path });
				try {
					await workspaces.rename(ws.workspaceId, display);
				} catch (err) {
					console.warn("[pts-workspaces] rename to display title failed:", err);
				}
				return ws;
			}

			/**
			 * Remove one Denkraum. Registry removal ALWAYS runs through the
			 * official wire API (workspaces.delete — sessions and logs stay
			 * Host-owned). With `trash` the folder is additionally moved into
			 * the recoverable workspace/.trash/ by the host route (never a
			 * hard delete of teacher content).
			 */
			async function removeDenkraum(ws, opts) {
				if (!ws || typeof ws.workspaceId !== "string") throw new Error("Ungültiger Denkraum.");
				await workspaces.delete(ws.workspaceId);
				if (opts && opts.trash) {
					const res = await fetch("/api/pts-workspaces/delete", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ path: ws.path }),
					});
					let data = null;
					try { data = await res.json(); } catch { /* non-JSON failure */ }
					if (!res.ok || !data || data.ok !== true) {
						throw new Error(data && data.message
							? data.message
							: "Der Ordner konnte nicht in den Papierkorb verschoben werden (HTTP " + res.status + "). Er bleibt unverändert bestehen.");
					}
				}
			}

			ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
				name: "sidebar.workspaces",
				priority: -1,
				// Entry-owned inject face: the renderer calls this factory and
				// spreads the result into the component's props.
				inject: () => ({
					createDenkraum,
					removeDenkraum,
					startSession: (id) => workspaces.startSession(id),
					openSession: (id) => sessions.open(id),
					clearSelection: () => sessions.clear(),
					loadConfig,
				}),
			}, (props) => React.createElement(PtsWorkspaceBrowser, props)));

			ctx.slots.inject("conversation.hero.workspace", () => ctx.slots.register({
				name: "conversation.hero.workspace",
				priority: -1,
				inject: () => ({
					createDenkraum,
					loadConfig,
				}),
			}, (props) => React.createElement(PtsWorkspacePicker, props)));

			console.log("[pts-workspaces] client half active; sidebar + hero picker shadowed @ -1");
		}

		return { inject, apply };
	},
});
