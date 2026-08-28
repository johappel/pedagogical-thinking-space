// pts-skill-manager — client half (browser).
//
// Served as a classic script through the dsh client-modules roster and
// registered into window.__ModuleLoader__ exactly like the shipped bundles.
//
// Surfaces:
//  - "Skills" tab in conversation.view (id "skills", order 20, left of the
//    "Artefakte" tab which uses order 30):
//      * library list with status badges (geprüft / eigene / Entwurf)
//      * role↔skill matrix (research/material/review/renderer checkboxes)
//      * import (SKILL.md file upload and/or repo-relative source path)
//      * "Denkraum neu laden" action for the current Denkraum
//
// Data layer: plain same-origin fetch against /api/pts-skills/* (host half).
// The "Denkraum neu laden" path mirrors pts-workspaces startPtsSession
// (sessions.create + open with agentPreset 'pts-companion') and never the raw
// shipped workspaces.startSession, which the global new-session guard already
// redirects.

window.__ModuleLoader__.load({
	id: "pts-skill-manager",
	factory: (require) => {
		const React = require("react");

		const CSS = `
.psk-root { display:flex; flex-direction:column; gap:12px; height:100%; min-height:0; overflow:auto; padding:12px; box-sizing:border-box; }
.psk-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.psk-title { font-weight:600; font-size:13px; opacity:.85; }
.psk-count { font-size:12px; opacity:.6; }
.psk-btn { border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; border-radius:6px; padding:3px 10px; font-size:12px; cursor:pointer; white-space:nowrap; }
.psk-btn:hover { background:rgba(128,128,128,.15); }
.psk-btn.psk-danger:hover { background:rgba(224,108,117,.18); border-color:rgba(224,108,117,.6); }
.psk-errmsg { color:#e06c75; white-space:pre-wrap; word-break:break-word; }
.psk-note { opacity:.65; font-size:12px; line-height:1.5; }
.psk-okmsg { color:#7ec699; font-size:12px; }
.psk-list { display:flex; flex-direction:column; gap:8px; }
.psk-card { display:flex; flex-direction:column; align-items:flex-start; gap:5px; text-align:left; border:1px solid rgba(128,128,128,.3); border-radius:8px; padding:10px; background:rgba(128,128,128,.06); color:inherit; font:inherit; }
.psk-card-name { font-weight:600; font-size:12.5px; word-break:break-all; }
.psk-card-desc { font-size:12px; opacity:.8; line-height:1.45; }
.psk-card-meta { display:flex; gap:6px; align-items:center; font-size:11px; opacity:.75; flex-wrap:wrap; }
.psk-badge { border:1px solid rgba(128,128,128,.35); border-radius:4px; padding:0 5px; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
.psk-badge-verified { color:#7ec699; }
.psk-badge-own { color:#d19a66; }
.psk-badge-draft { color:#e06c75; }
.psk-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.psk-row { display:flex; gap:6px; align-items:center; }
.psk-input { border:1px solid rgba(128,128,128,.35); background:transparent; color:inherit; border-radius:6px; padding:3px 8px; font-size:12px; min-width:0; flex:1; }
.psk-input:focus { outline:none; border-color:rgba(128,128,128,.7); }
.psk-sec { border:1px solid rgba(128,128,128,.25); border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:8px; }
.psk-sechead { font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.55; }
.psk-table { border-collapse:collapse; font-size:12px; width:100%; }
.psk-table th,.psk-table td { border:1px solid rgba(128,128,128,.3); padding:4px 8px; text-align:left; }
.psk-table th { background:rgba(128,128,128,.12); font-weight:600; }
.psk-table td.psk-center { text-align:center; }
.psk-empty { margin:auto; text-align:center; opacity:.6; font-size:12.5px; line-height:1.7; padding:24px; }
`;

		const STYLE_TAG_ID = "pts-skill-manager-css";
		if (typeof document !== "undefined" && document.getElementById(STYLE_TAG_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		const ROLE_LABELS = { research: "Research", material: "Material", review: "Review", renderer: "Renderer" };
		const STATUS_LABELS = { verified: "gepr\u00fcft", own: "eigene", draft: "Entwurf" };
		const STATUS_CLASS = { verified: "psk-badge psk-badge-verified", own: "psk-badge psk-badge-own", draft: "psk-badge psk-badge-draft" };

		async function fetchJson(url, opts) {
			const res = await fetch(url, opts);
			const body = await res.text();
			let value = null;
			try { value = JSON.parse(body); } catch (e) { value = null; }
			if (!res.ok) {
				throw new Error(value !== null && typeof value === "object" && typeof value.error === "string" ? value.error : "HTTP " + res.status);
			}
			return value;
		}
		function postJson(url, data) {
			return fetchJson(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(data),
			});
		}

		function normalizeMatrix(m) {
			const roles = ["research", "material", "review", "renderer"];
			const out = {};
			for (const role of roles) {
				out[role] = Array.isArray(m && m[role]) ? m[role].slice() : [];
			}
			return out;
		}

		// ------------------------------------------------------------------
		// Skills tab (conversation.view)
		// ------------------------------------------------------------------
		function SkillsView(props) {
			const sessionId = props !== null && props !== undefined && typeof props.sessionId === "string" ? props.sessionId : null;

			const skillsState = React.useState(null);
			const skills = skillsState[0];
			const setSkills = skillsState[1];
			const matrixState = React.useState(null);
			const matrix = matrixState[0];
			const setMatrix = matrixState[1];
			const errState = React.useState(null);
			const error = errState[0];
			const setError = errState[1];
			const noticeState = React.useState(null);
			const notice = noticeState[0];
			const setNotice = noticeState[1];
			const importPathState = React.useState("");
			const importPath = importPathState[0];
			const setImportPath = importPathState[1];
			const busyState = React.useState(false);
			const busy = busyState[0];
			const setBusy = busyState[1];
			const confirmDeleteState = React.useState({});
			const confirmDelete = confirmDeleteState[0];
			const setConfirmDelete = confirmDeleteState[1];

			function load() {
				fetchJson("/api/pts-skills/list").then(function(r) {
					setSkills(Array.isArray(r && r.skills) ? r.skills : []);
					setMatrix(normalizeMatrix(r && r.matrix));
					setError(null);
				}).catch(function(e) {
					setError(String(e && e.message ? e.message : e));
				});
			}
			React.useEffect(function() {
				load();
			}, []);

			function reload() {
				setNotice(null);
				setConfirmDelete({});
				load();
			}

			function importContent(text) {
				setBusy(true);
				setNotice(null);
				postJson("/api/pts-skills/import", { content: text }).then(function(r) {
					setNotice("Importiert: " + (r.skill && r.skill.id) + (r.adjusted ? " (name erg\u00e4nzt)" : ""));
					reload();
				}).catch(function(e) {
					setError(String(e && e.message ? e.message : e));
				}).finally(function() { setBusy(false); });
			}
			function importFromPath() {
				const p = importPath.trim();
				if (p === "") return;
				setBusy(true);
				setNotice(null);
				postJson("/api/pts-skills/import", { sourcePath: p }).then(function(r) {
					setNotice("Importiert: " + (r.skill && r.skill.id) + (r.adjusted ? " (name erg\u00e4nzt)" : ""));
					setImportPath("");
					reload();
				}).catch(function(e) {
					setError(String(e && e.message ? e.message : e));
				}).finally(function() { setBusy(false); });
			}

			function toggleMatrix(skillId, role) {
				setMatrix(function(prev) {
					const next = normalizeMatrix(prev);
					const idx = next[role].indexOf(skillId);
					if (idx >= 0) next[role].splice(idx, 1);
					else next[role].push(skillId);
					next[role].sort();
					return next;
				});
			}
			function saveMatrix() {
				if (matrix === null) return;
				setBusy(true);
				setNotice(null);
				postJson("/api/pts-skills/assignment", { matrix: matrix }).then(function(r) {
					setMatrix(normalizeMatrix(r && r.matrix));
					setNotice("Matrix gespeichert — wirkt f\u00fcr neue Worker-Ausf\u00fchrungen, nicht im laufenden Gespr\u00e4ch.");
				}).catch(function(e) {
					setError(String(e && e.message ? e.message : e));
				}).finally(function() { setBusy(false); });
			}

			function removeSkill(skillId) {
				const state = confirmDelete[skillId];
				if (state !== true) {
					setConfirmDelete(Object.assign({}, confirmDelete, { [skillId]: true }));
					return;
				}
				setBusy(true);
				setNotice(null);
				postJson("/api/pts-skills/delete", { id: skillId, confirm: true }).then(function() {
					setConfirmDelete({});
					setNotice("Gel\u00f6scht: " + skillId);
					reload();
				}).catch(function(e) {
					setError(String(e && e.message ? e.message : e));
				}).finally(function() { setBusy(false); });
			}

			// Denkraum neu laden: current workspace from the workspaces
			// snapshot (items' sessionIds contain the current session), then a
			// fresh pts-companion session — the same path the workspace
			// browser's startPtsSession uses.
			const workspaceApi = props && typeof props.startPtsSession === "function" ? props : null;

			const body = [];
			if (error !== null) {
				body.push(React.createElement("div", { key: "err", className: "psk-note psk-errmsg" }, "Skills konnten nicht geladen werden: " + error));
			}
			if (notice !== null) {
				body.push(React.createElement("div", { key: "ok", className: "psk-okmsg" }, notice));
			}

			body.push(React.createElement("div", { key: "import", className: "psk-sec" },
				React.createElement("div", { className: "psk-sechead" }, "Import"),
				React.createElement("div", { className: "psk-row" },
					React.createElement("input", {
						className: "psk-input",
						type: "file",
						accept: ".md,text/markdown",
						onChange: function(e) {
							const file = e.target && e.target.files && e.target.files[0];
							if (!file) return;
							const reader = new FileReader();
							reader.onload = function() { importContent(String(reader.result)); };
							reader.readAsText(file);
						},
					})),
				React.createElement("div", { className: "psk-row" },
					React.createElement("input", {
						className: "psk-input",
						placeholder: "Oder Repo-Pfad, z. B. workspace/<slug>/drafts/skill.md",
						value: importPath,
						onChange: function(e) { setImportPath(e.target.value); },
					}),
					React.createElement("button", { className: "psk-btn", disabled: busy || importPath.trim() === "", onClick: importFromPath }, "Importieren"))));

			if (matrix !== null) {
				const rows = [];
				const skillsList = Array.isArray(skills) ? skills : [];
				for (const skill of skillsList) {
					const cells = [];
					for (const role of ["research", "material", "review", "renderer"]) {
						const checked = Array.isArray(matrix[role]) && matrix[role].indexOf(skill.id) >= 0;
						cells.push(React.createElement("td", { key: role, className: "psk-center" },
							React.createElement("input", {
								type: "checkbox",
								checked: checked,
								onChange: function() { toggleMatrix(skill.id, role); },
							})));
					}
					rows.push(React.createElement("tr", { key: skill.id },
						React.createElement("td", null, skill.id),
						cells));
				}
				body.push(React.createElement("div", { key: "matrix", className: "psk-sec" },
					React.createElement("div", { className: "psk-sechead" }, "Zuordnung (Rolle \u2194 Skill)"),
					React.createElement("table", { className: "psk-table" },
						React.createElement("thead", null,
							React.createElement("tr", null,
								React.createElement("th", null, "Skill"),
								React.createElement("th", null, "Research"),
								React.createElement("th", null, "Material"),
								React.createElement("th", null, "Review"),
								React.createElement("th", null, "Renderer"))),
						React.createElement("tbody", null, rows)),
					React.createElement("button", { className: "psk-btn", disabled: busy, onClick: saveMatrix }, "Matrix speichern")));
			}

			const cards = [];
			const skillsList = Array.isArray(skills) ? skills : [];
			for (let i = 0; i < skillsList.length; i++) {
				(function(skill) {
					const roleChips = (Array.isArray(skill.roles) ? skill.roles : []).map(function(r) {
						return React.createElement("span", { key: r, className: "psk-badge" }, ROLE_LABELS[r] || r);
					});
					cards.push(React.createElement("div", { key: skill.id, className: "psk-card" },
						React.createElement("span", { className: "psk-card-name" }, skill.id),
						React.createElement("span", { className: "psk-card-desc" }, skill.description || ""),
						React.createElement("div", { className: "psk-card-meta" },
							React.createElement("span", { className: STATUS_CLASS[skill.status] || "psk-badge" }, STATUS_LABELS[skill.status] || skill.status),
							roleChips),
						React.createElement("div", { className: "psk-actions" },
							React.createElement("button", {
								className: "psk-btn psk-danger",
								disabled: busy,
								onClick: function() { removeSkill(skill.id); },
							}, confirmDelete[skill.id] === true ? "Wirklich l\u00f6schen?" : "L\u00f6schen"))));
				})(skillsList[i]);
			}
			body.push(React.createElement("div", { key: "list", className: "psk-sec" },
				React.createElement("div", { className: "psk-sechead" }, "Bibliothek (" + skillsList.length + ")"),
				skillsList.length === 0
					? React.createElement("div", { className: "psk-note" }, "Noch keine Skills in der Bibliothek. Importiere eine SKILL.md, z. B. über den pts_material-Flow.")
					: React.createElement("div", { className: "psk-list" }, cards)));

			// Denkraum neu laden button. Uses the injected startPtsSession when
			// available; otherwise falls back to the sessions/workspaces
			// services captured in apply.
			if (workspaceApi !== null) {
				body.push(React.createElement("div", { key: "reload", className: "psk-sec" },
					React.createElement("div", { className: "psk-sechead" }, "Wirkung"),
					React.createElement("button", { className: "psk-btn", disabled: busy, onClick: function() {
						setNotice(null);
						Promise.resolve().then(function() {
							return workspaceApi.startPtsSession();
						}).then(function() {
							setNotice("Denkraum neu geladen \u2014 \u00c4nderungen wirken in der neuen Session.");
						}).catch(function(e) {
							setError(String(e && e.message ? e.message : e));
						});
					} }, "Denkraum neu laden"),
					React.createElement("div", { className: "psk-note" }, "Skills und Zuweisungen wirken ab der n\u00e4chsten Session (Komposition wird beim Session-Start fixiert). Ein laufendes Gespr\u00e4ch bleibt unver\u00e4ndert.")));
			}

			return React.createElement("div", { className: "psk-root" },
				React.createElement("div", { className: "psk-toolbar" },
					React.createElement("span", { className: "psk-title" }, "Skills"),
					React.createElement("button", { className: "psk-btn", onClick: reload }, "Aktualisieren")),
				body);
		}

		// ------------------------------------------------------------------
		// Registration
		// ------------------------------------------------------------------
		const inject = ["slots", "workspaces", "sessions"];

		function apply(ctx) {
			const workspaces = ctx.workspaces;
			const sessions = ctx.sessions;

			function startPtsSession() {
				const wsSnap = workspaces.list.getSnapshot();
				const items = wsSnap && Array.isArray(wsSnap.items) ? wsSnap.items : [];
				const sessSnap = sessions.list.getSnapshot();
				const current = sessSnap ? sessSnap.current : undefined;
				let workspaceId = null;
				if (current !== undefined) {
					const row = items.find(function(it) {
						return it && Array.isArray(it.sessionIds) && it.sessionIds.indexOf(current) >= 0;
					});
					workspaceId = row ? row.workspaceId : null;
				}
				if (workspaceId === null || workspaceId === undefined) {
					return Promise.reject(new Error("Kein aktiver Denkraum gefunden."));
				}
				return sessions.create({ workspaceId: workspaceId, agentPreset: "pts-companion" })
					.then(function(sessionId) { sessions.open(sessionId); return sessionId; });
			}

			ctx.slots.inject("conversation.view", function() {
				ctx.slots.register(
					{ name: "conversation.view", id: "skills", order: 20, label: "Skills" },
					function(props) {
						return React.createElement(SkillsView, Object.assign({}, props, { startPtsSession: startPtsSession }));
					},
				);
			});

			console.log("[pts-skill-manager] client half active; Skills tab registered");
		}

		return { inject: inject, apply: apply };
	},
});
