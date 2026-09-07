// sandbox-workspace-scope — Client half (Classic Script, loaded via
// window.__ModuleLoader__).
//
// Goal: the SANDBOX profile should not show the shared PTS Workspace cluster.
// The DSH workspace registry is SHARED between profiles (stored under
// $DSH_HOME), so we filter what the sidebar lists instead of mutating it.
//
// Takeover: `sidebar.workspaces` at priority -1 (shadows the shipped default
// priority 0 occupant without a tie boot error). We render the body directly
// and do NOT declare the shipped `sidebar.workspaces.directoryFlow` child slot
// (its declaration is exclusive — declaring it here would boot-reject the
// whole entry). This is a pure display scope; add/delete flows stay shipped.
window.__ModuleLoader__.load({
	id: "sandbox-workspace-scope",
	factory: (require) => {
		const React = require("react");

		// The sandbox workspace root the profile is pinned to (fs-sandbox.cwd /
		// sandbox-policy.workspaceRoot in profiles/sandbox/cordis.patch.yml).
		const SCOPE_ROOT = "F:/code/pedagogical-thinking-space/workspace/sandbox";

		const STYLE = `
.sbws-root { box-sizing:border-box; min-height:0; flex:1; display:flex; flex-direction:column; padding-right:var(--dsh-sidebar-inline-padding,12px); }
.sbws-header { display:flex; align-items:center; gap:4px; height:36px; margin-bottom:4px; padding-left:4px; flex:none; }
.sbws-label { font-size:12px; letter-spacing:.3px; opacity:.65; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
.sbws-list { min-height:0; flex:1; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:1px; padding-bottom:10px; }
.sbws-ws { display:flex; align-items:center; gap:7px; height:32px; padding:0 8px; border-radius:8px; cursor:pointer; user-select:none; color:inherit; }
.sbws-ws:hover { background:rgba(128,128,128,.14); }
.sbws-folder { width:16px; flex:none; display:inline-flex; opacity:.75; }
.sbws-wstitle { font-size:13px; line-height:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.sbws-add { visibility:hidden; border:none; background:transparent; color:inherit; opacity:.65; cursor:pointer; width:20px; height:20px; border-radius:6px; flex:none; font-size:13px; line-height:1; }
.sbws-ws:hover .sbws-add { visibility:visible; }
.sbws-add:hover { background:rgba(128,128,128,.2); opacity:1; }
.sbws-s { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 30px; border-radius:8px; cursor:pointer; color:inherit; }
.sbws-s:hover { background:rgba(128,128,128,.14); }
.sbws-dot { width:7px; height:7px; border-radius:50%; flex:none; background:rgba(128,128,128,.35); }
.sbws-dot-run { background:#4caf78; }
.sbws-dot-wait { background:#e0a34c; }
.sbws-stitle { font-size:12.5px; line-height:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; opacity:.92; }
.sbws-stime { font-size:10.5px; opacity:.45; flex:none; }
.sbws-note { font-size:12px; line-height:1.55; opacity:.6; padding:10px 8px; }
`;
		const STYLE_TAG_ID = "sandbox-workspace-scope-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = STYLE;
			document.head.appendChild(tag);
		}

		function normPath(p) {
			return String(p == null ? "" : p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
		}

		function relTime(ts) {
			if (typeof ts !== "number" || !(ts > 0)) return "";
			const MIN = 60000, HOUR = 3600000, DAY = 86400000;
			const diff = Math.max(0, Date.now() - ts);
			if (diff < MIN) return "gerade eben";
			if (diff < HOUR) return Math.floor(diff / MIN) + " Min.";
			if (diff < DAY) return Math.floor(diff / HOUR) + " Std.";
			if (diff < 30 * DAY) return Math.floor(diff / DAY) + " Tg.";
			return "";
		}

		function FolderIcon() {
			return React.createElement("span", { className: "sbws-folder", "aria-hidden": true },
				React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 16 16", fill: "currentColor" },
					React.createElement("path", { d: "M1.5 4.2c0-.66.54-1.2 1.2-1.2h3.1c.37 0 .72.17.95.46L7.9 4.8h5.4c.66 0 1.2.54 1.2 1.2v5.8c0 .66-.54 1.2-1.2 1.2H2.7c-.66 0-1.2-.54-1.2-1.2V4.2z", opacity: .8 })));
		}

		function StatusDot(s) {
			let cls = "";
			if (s.pendingInteraction === "approval" || s.pendingInteraction === "question" || s.pendingInteraction === "plan-review") cls = " sbws-dot-wait";
			else if (s.running) cls = " sbws-dot-run";
			return React.createElement("span", { className: "sbws-dot" + cls });
		}

		/** Sessions under the sandbox workspace, shown in the sidebar. */
		function visibleSessions(sessSnap, ws, archived) {
			const ids = ws && Array.isArray(ws.sessionIds) ? ws.sessionIds : [];
			const out = [];
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

		function SandboxBrowser(props) {
			const { wide, useWorkspaces, useSessions, startSession, open } = props;
			const wsSnap = useWorkspaces ? useWorkspaces((s) => s) : null;
			const sessSnap = useSessions ? useSessions((s) => s) : null;
			const root = normPath(SCOPE_ROOT);
			const prefix = root + "/";
			const all = wsSnap && Array.isArray(wsSnap.items) ? wsSnap.items : [];
			const items = all.filter((w) => {
				const p = normPath(w && w.path);
				return p === root || (p !== "" && p.startsWith(prefix));
			});
			const archived = wsSnap && Array.isArray(wsSnap.archivedSessionIds) ? wsSnap.archivedSessionIds : [];
			const at = (id) => { if (open) open(id); };

			if (!wide) {
				return React.createElement("div", { className: "sbws-root" },
					React.createElement("div", { className: "sbws-header" }, React.createElement("span", { className: "sbws-label" }, "Sandbox")));
			}

			const rows = [];
			for (const ws of items) {
				const sessions = visibleSessions(sessSnap, ws, archived);
				rows.push(React.createElement("div", {
					key: ws.workspaceId,
					className: "sbws-ws",
					title: ws.path,
					onClick: () => { if (startSession) startSession(ws.workspaceId); },
				},
				React.createElement(FolderIcon, null),
				React.createElement("span", { className: "sbws-wstitle" }, ws.title || "Sandbox"),
				React.createElement("button", {
					className: "sbws-add",
					title: "Neue Sitzung im Sandbox-Workspace",
					"aria-label": "Neue Sitzung im Sandbox-Workspace",
					onClick: (e) => { e.stopPropagation(); if (startSession) startSession(ws.workspaceId); },
				}, "+")));
				for (const s of sessions) {
					rows.push(React.createElement("div", {
						key: ws.workspaceId + ":" + s.id,
						className: "sbws-s",
						title: s.displayTitle || "",
						onClick: () => at(s.id),
					},
					StatusDot(s),
					React.createElement("span", { className: "sbws-stitle" }, s.blank ? "Neue Sitzung" : (s.displayTitle || "Sitzung")),
					s.blank ? null : React.createElement("span", { className: "sbws-stime" }, relTime(s.updatedAt))));
				}
				if (sessions.length === 0) {
					rows.push(React.createElement("div", { key: ws.workspaceId + ":empty", className: "sbws-note", style: { padding: "2px 8px 6px 30px" } }, "Noch keine Sitzungen im Sandbox-Workspace."));
				}
			}

			return React.createElement("div", { className: "sbws-root" },
				React.createElement("div", { className: "sbws-header" },
					React.createElement("span", { className: "sbws-label" }, "Sandbox")),
				React.createElement("div", { className: "sbws-list" },
					items.length === 0
						? React.createElement("div", { className: "sbws-note" }, "Noch keine Session im Sandbox-Workspace. Lege über „Neue Sitzung“ eine an.")
						: rows));
		}

		const inject = ["slots"];
		function apply(ctx) {
			const slots = ctx.slots;
			if (slots === undefined) {
				console.error("[sandbox-workspace-scope] slots service missing - plugin inactive");
				return;
			}
			slots.inject("sidebar.workspaces", () => slots.register({
				name: "sidebar.workspaces",
				priority: -1,
			}, (props) => React.createElement(SandboxBrowser, props)));
			console.log("[sandbox-workspace-scope] client half active; sidebar.workspaces shadowed @ -1");
		}

		return { inject, apply };
	},
});
