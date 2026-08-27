// pts-background-steward — client half (Classic Script).
//
// Registers a `conversation.view` tab "Steward" with a model picker for the
// background steward. It reads the current config + provider catalog from
// GET /api/pts-background-steward/config and persists a change via
// POST /api/pts-background-steward/config (writes profiles/pts-web/settings.yaml).
// No JSX, no import/require in the bundle; React via the factory require.
//
// Styling uses DSH theme CSS variables (--dsw-alias-*) so the panel adapts to
// light AND dark mode instead of forcing light colors.

window.__ModuleLoader__.load({
	id: "pts-background-steward",
	factory: (require) => {
		const React = require("react");
		const { useState, useEffect, useCallback } = React;

		const API = "/api/pts-background-steward/config";

		function StewardPanel() {
			const [state, setState] = useState({
				loading: true,
				error: null,
				effective: null,
				providers: {},
				provider: "",
				model: "",
				maxTokens: 8192,
				saving: false,
				message: null,
				messageKind: null,
			});

			const load = useCallback(async () => {
				setState((s) => ({ ...s, loading: true, error: null }));
				try {
					const res = await fetch(API, { headers: { accept: "application/json" } });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await res.json();
					setState((s) => ({
						...s,
						loading: false,
						effective: data.effective,
						providers: data.providers || {},
						provider: data.effective?.provider || "",
						model: data.effective?.model || "",
						maxTokens: data.effective?.maxTokens ?? 8192,
					}));
				} catch (error) {
					setState((s) => ({ ...s, loading: false, error: String(error && error.message || error) }));
				}
			}, []);

			useEffect(() => { load(); }, [load]);

			const providerKeys = Object.keys(state.providers);
			const providerList = [{ value: "", label: "leer — Elternmodell (Companion)" }].concat(
				providerKeys.map((key) => ({ value: key, label: state.providers[key].displayName || key })),
			);
			const models = state.providers[state.provider]?.models || [];
			const modelList = [{ value: "", label: "leer — Elternmodell (Companion)" }].concat(
				models.map((m) => ({ value: m.id, label: m.name || m.id })),
			);

			const changeProvider = (value) => {
				const nextProvider = value || "";
				const first = (state.providers[nextProvider]?.models || [])[0];
				setState((s) => ({ ...s, provider: nextProvider, model: first ? first.id : "" }));
			};

			const save = async () => {
				setState((s) => ({ ...s, saving: true, message: null, messageKind: null }));
				try {
					const res = await fetch(API, {
						method: "POST",
						headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ provider: state.provider, model: state.model, maxTokens: state.maxTokens }),
					});
					const data = await res.json();
					if (!res.ok) throw new Error(data && data.error || `HTTP ${res.status}`);
					setState((s) => ({
						...s,
						saving: false,
						effective: data.effective,
						provider: data.effective?.provider || "",
						model: data.effective?.model || "",
						maxTokens: data.effective?.maxTokens ?? s.maxTokens,
						message: "Übernommen — wirkt beim nächsten Steward-Lauf.",
						messageKind: "ok",
					}));
				} catch (error) {
					setState((s) => ({ ...s, saving: false, message: String(error && error.message || error), messageKind: "error" }));
				}
			};

			const label = (text) => React.createElement("label", { className: "pts-steward-label", style: { display: "block", margin: "6px 0 2px" } }, text);

			return React.createElement(
				"div",
				{ className: "pts-steward-panel" },
				state.loading
					? React.createElement("div", null, "Lade Steward-Konfiguration …")
					: [
						React.createElement("p", { className: "pts-steward-intro" },
							"Modell für den Hintergrund-Steward (Denkstandspflege). Wird in den Profil-Settings gespeichert."),
						label("Provider"),
						React.createElement("select", {
							value: state.provider,
							onChange: (e) => changeProvider(e.target.value),
						}, providerList.map((opt) => React.createElement("option", { key: opt.value, value: opt.value }, opt.label))),
						label("Modell"),
						React.createElement("select", {
							value: state.model,
							onChange: (e) => setState((s) => ({ ...s, model: e.target.value })),
						}, modelList.map((opt) => React.createElement("option", { key: opt.value, value: opt.value }, opt.label))),
						label("maxTokens"),
						React.createElement("input", {
							type: "number",
							min: 0,
							max: 200000,
							value: state.maxTokens,
							onChange: (e) => setState((s) => ({ ...s, maxTokens: Number(e.target.value) || 0 })),
						}),
						React.createElement("p", { className: "pts-steward-hint" },
							state.effective && state.effective.reasoningEffort
								? `reasoningEffort: ${state.effective.reasoningEffort} (nicht an das One-Shot-Child durchgereicht)`
								: "reasoningEffort: Provider-Default (nicht einstellbar)"),
						React.createElement("button", {
							className: "pts-steward-save",
							onClick: save,
							disabled: state.saving,
						}, state.saving ? "Speichere …" : "Steward-Modell speichern"),
						state.error
							? React.createElement("p", { className: "pts-steward-err" }, `Fehler: ${state.error}`)
							: null,
						state.message
							? React.createElement("p", { className: state.messageKind === "ok" ? "pts-steward-ok" : "pts-steward-err" }, state.message)
							: null,
					],
			);
		}

		return {
			inject: ["slots"],
			apply(ctx) {
				if (!document.getElementById("pts-steward-css")) {
					const style = document.createElement("style");
					style.id = "pts-steward-css";
					// Farben ausschließlich aus DSH-Theme-Variablen → Dark/Light-konform.
					style.textContent = [
						".pts-steward-panel {",
						"  padding: 8px;",
						"  color: var(--dsw-alias-label-primary);",
						"  font-family: inherit;",
						"}",
						".pts-steward-intro { margin: 0 0 8px; font-size: 13px; line-height: 1.4; }",
						".pts-steward-label { font-size: 12px; font-weight: 600; }",
						".pts-steward-row select, .pts-steward-row input {",
						"  display: block;",
						"  width: 100%;",
						"  box-sizing: border-box;",
						"  padding: 4px;",
						"  margin-top: 2px;",
						"  background: var(--dsw-alias-bg-layer-1);",
						"  color: var(--dsw-alias-label-primary);",
						"  border: 1px solid var(--dsw-alias-border-l1);",
						"  border-radius: 4px;",
						"  color-scheme: light dark;",
						"}",
						".pts-steward-save {",
						"  margin-top: 8px;",
						"  padding: 6px 14px;",
						"  background: var(--dsw-alias-bg-layer-1);",
						"  color: var(--dsw-alias-label-primary);",
						"  border: 1px solid var(--dsw-alias-border-l2);",
						"  border-radius: 4px;",
						"  cursor: pointer;",
						"}",
						".pts-steward-save:disabled { opacity: .6; cursor: wait; }",
						".pts-steward-hint { margin: 8px 0 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); }",
						".pts-steward-ok { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-state-success-primary); }",
						".pts-steward-err { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-state-error-primary); }",
					].join("\n");
					document.head.appendChild(style);
				}
				ctx.slots.inject("conversation.view", () => ctx.slots.register(
					{ name: "conversation.view", id: "pts-background-steward", order: 90, label: "Steward" },
					() => React.createElement(StewardPanel),
				));
			},
		};
	},
});
