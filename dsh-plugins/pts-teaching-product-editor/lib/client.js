// pts-teaching-product-editor — client half (Phase 2A, Classic Script).
//
// A right-sidebar tab that projects the Teaching Product domain into a Quill
// editor. The editor edits ONE content block at a time; all identity, revision,
// provenance and classification stay in the domain (server side). The client
// only: renders lesson tabs + phase list, mounts Quill on the selected block,
// tracks a dirty state, saves through the conflict-guarded route, and shows a
// conflict banner when the stored block advanced under an unsaved edit.
//
// Naming discipline: `editorDelta` = Quill's op format; the PTS `semanticDelta`
// only ever arrives from the server and is shown read-only in the debug panel.

window.__ModuleLoader__.load({
	id: "pts-teaching-product-editor",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;
		const { useState, useEffect, useRef, useCallback } = React;

		const TYPE_ID = "pts-teaching-product-editor";
		const TYPE_KIND = "ptsTeachingProduct";
		const BASE = "/pts-teaching-product";

		const CSS = `
.ptp-root { display:flex; flex-direction:column; gap:0; height:100%; min-height:0; box-sizing:border-box; font-size:13px; }
.ptp-head { padding:12px 14px 8px; border-bottom:1px solid rgba(128,128,128,.2); }
.ptp-series { font-weight:700; font-size:15px; }
.ptp-tabs { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
.ptp-tab { border:1px solid rgba(128,128,128,.35); background:transparent; color:inherit; border-radius:7px 7px 0 0; padding:5px 12px; font-size:12.5px; cursor:pointer; }
.ptp-tab-active { border-bottom-color:transparent; background:rgba(126,198,153,.12); font-weight:600; }
.ptp-body { display:flex; flex:1 1 auto; min-height:0; }
.ptp-phases { width:180px; border-right:1px solid rgba(128,128,128,.2); padding:10px 8px; display:flex; flex-direction:column; gap:4px; overflow:auto; }
.ptp-phases-label { font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; opacity:.55; padding:2px 4px 6px; }
.ptp-phase { text-align:left; border:1px solid transparent; background:transparent; color:inherit; border-radius:6px; padding:7px 9px; cursor:pointer; font:inherit; font-size:12.5px; display:flex; flex-direction:column; gap:2px; }
.ptp-phase:hover { background:rgba(128,128,128,.1); }
.ptp-phase-active { background:rgba(126,198,153,.15); border-color:rgba(126,198,153,.5); }
.ptp-phase-dur { font-size:10.5px; opacity:.55; }
.ptp-main { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; padding:12px 14px; gap:10px; overflow:auto; }
.ptp-phase-title { font-weight:600; font-size:14px; }
.ptp-editor-wrap { border:1px solid rgba(128,128,128,.3); border-radius:8px; overflow:hidden; background:rgba(255,255,255,.02); }
.ptp-editor { min-height:160px; }
.ptp-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.ptp-btn { border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; border-radius:6px; padding:5px 12px; font-size:12.5px; cursor:pointer; }
.ptp-btn:hover { background:rgba(128,128,128,.14); }
.ptp-btn-primary { border-color:#7ec699; color:#7ec699; }
.ptp-btn-primary:disabled { opacity:.4; cursor:default; }
.ptp-status { font-size:11.5px; opacity:.7; }
.ptp-status-dirty { color:#d19a66; opacity:1; }
.ptp-status-saving { color:#61afef; opacity:1; }
.ptp-conflict { border:1px solid #e06c75; background:rgba(224,108,117,.1); border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
.ptp-conflict-msg { color:#e06c75; font-weight:600; font-size:12.5px; }
.ptp-conflict-actions { display:flex; gap:8px; }
.ptp-empty { padding:24px; text-align:center; opacity:.7; display:flex; flex-direction:column; gap:12px; align-items:center; }
.ptp-debug { margin-top:6px; border-top:1px dashed rgba(128,128,128,.25); padding-top:8px; }
.ptp-debug summary { cursor:pointer; font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.5; }
.ptp-debug pre { font-family:ui-monospace,Consolas,monospace; font-size:11px; opacity:.75; white-space:pre-wrap; word-break:break-word; margin:6px 0 0; }
.ptp-tools { display:flex; gap:8px; flex-wrap:wrap; margin-top:4px; }
`;

		function ensureStyle() {
			if (document.getElementById('ptp-style')) return;
			const el = document.createElement('style');
			el.id = 'ptp-style';
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		let quillPromise = null;
		function ensureQuill() {
			if (window.Quill) return Promise.resolve(window.Quill);
			if (quillPromise) return quillPromise;
			quillPromise = new Promise((resolve, reject) => {
				if (!document.getElementById('ptp-quill-css')) {
					const link = document.createElement('link');
					link.id = 'ptp-quill-css';
					link.rel = 'stylesheet';
					link.href = BASE + '/vendor/quill.snow.css';
					document.head.appendChild(link);
				}
				const script = document.createElement('script');
				script.src = BASE + '/vendor/quill.js';
				script.onload = () => resolve(window.Quill);
				script.onerror = () => reject(new Error('Quill konnte nicht geladen werden'));
				document.head.appendChild(script);
			});
			return quillPromise;
		}

		async function api(method, path, payload) {
			const res = await fetch(BASE + path, {
				method,
				headers: payload ? { 'Content-Type': 'application/json' } : undefined,
				body: payload ? JSON.stringify(payload) : undefined,
			});
			const data = await res.json().catch(() => ({}));
			return { status: res.status, data };
		}

		function firstSelection(product) {
			const lesson = product && product.series && product.series.lessons[0];
			const phase = lesson && lesson.phases[0];
			const block = phase && phase.blocks[0];
			return lesson && phase && block ? { lessonId: lesson.id, phaseId: phase.id, blockId: block.id } : null;
		}

		function findPhase(product, sel) {
			const lesson = product.series.lessons.find((l) => l.id === sel.lessonId);
			const phase = lesson && lesson.phases.find((p) => p.id === sel.phaseId);
			return { lesson, phase };
		}
		function findBlock(product, sel) {
			const { phase } = findPhase(product, sel);
			return phase && phase.blocks.find((b) => b.id === sel.blockId);
		}

		function Body(props) {
			const sessionId = props.sessionId;
			const [product, setProduct] = useState(null);
			const [sel, setSel] = useState(null);
			const [status, setStatus] = useState('clean'); // clean|dirty|saving|externally_changed
			const [baseRevision, setBaseRevision] = useState(0);
			const [conflict, setConflict] = useState(null);
			const [log, setLog] = useState(null);
			const [error, setError] = useState(null);
			const hostRef = useRef(null);
			const quillRef = useRef(null);
			const selRef = useRef(null);
			selRef.current = sel;
			const statusRef = useRef(status);
			statusRef.current = status;
			const baseRef = useRef(baseRevision);
			baseRef.current = baseRevision;

			const load = useCallback(async (keepSel) => {
				const { data } = await api('GET', '/api/product?sessionId=' + encodeURIComponent(sessionId || ''));
				setProduct(data.product);
				if (data.product) {
					setBaseRevision(data.product.revision);
					setSel((prev) => (keepSel && prev ? prev : firstSelection(data.product)));
				}
			}, [sessionId]);

			useEffect(() => { ensureStyle(); load(); }, [load]);

			// Mount Quill once the tab body has real size and a block is selected.
			useEffect(() => {
				if (!product || !sel || !hostRef.current) return;
				let cancelled = false;
				ensureQuill().then((Quill) => {
					if (cancelled) return;
					if (!quillRef.current) {
						quillRef.current = new Quill(hostRef.current, {
							theme: 'snow',
							modules: { toolbar: [['bold', 'italic', 'code'], [{ header: 1 }, { header: 2 }], ['link'], [{ list: 'bullet' }]] },
						});
						quillRef.current.on('text-change', (_d, _o, source) => {
							if (source === 'user' && statusRef.current === 'clean') setStatus('dirty');
						});
					}
				}).catch((err) => setError(String(err.message || err)));
				return () => { cancelled = true; };
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [product, sel && sel.blockId]);

			useEffect(() => {
				if (!quillRef.current || !product || !sel) return;
				let cancelled = false;
				fetchEditorState().then((ops) => {
					if (cancelled || !quillRef.current) return;
					quillRef.current.setContents(ops, 'silent'); // silent → not a user edit
					setStatus('clean');
				});
				return () => { cancelled = true; };
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [product && product.revision, sel && sel.blockId]);

			async function fetchEditorState() {
				const { data } = await api('POST', '/api/editor-state', { sessionId, ...sel });
				return data.editorDelta ? data.editorDelta.ops : [];
			}

			const guardLeave = useCallback(() => {
				if (statusRef.current === 'clean') return true;
				return window.confirm('Dieser Abschnitt hat ungespeicherte Änderungen. Wechseln und Änderungen verwerfen?');
			}, []);

			function selectLesson(lessonId) {
				if (!guardLeave()) return;
				const lesson = product.series.lessons.find((l) => l.id === lessonId);
				const phase = lesson.phases[0];
				const block = phase && phase.blocks[0];
				setStatus('clean');
				setSel({ lessonId, phaseId: phase ? phase.id : null, blockId: block ? block.id : null });
			}
			function selectPhase(phaseId) {
				if (!guardLeave()) return;
				const { lesson } = findPhase(product, { lessonId: sel.lessonId, phaseId });
				const phase = lesson.phases.find((p) => p.id === phaseId);
				const block = phase.blocks[0];
				setStatus('clean');
				setSel({ lessonId: sel.lessonId, phaseId, blockId: block ? block.id : null });
			}

			async function save() {
				if (!quillRef.current || !sel) return;
				setStatus('saving');
				const editorDelta = quillRef.current.getContents();
				const { status: code, data } = await api('POST', '/api/save', {
					sessionId, ...sel, editorDelta, expectedRevision: baseRef.current,
				});
				if (code === 200) {
					setBaseRevision(data.revision);
					setStatus('clean');
					setLog({ actor: data.actor, revision: data.revision, delta: data.delta });
					setProduct(data.product);
				} else if (code === 409) {
					setStatus('externally_changed');
					setConflict({ message: data.message || 'Dieser Abschnitt wurde inzwischen verändert.' });
				} else {
					setStatus('dirty');
					setError(data.message || 'Speichern fehlgeschlagen');
				}
			}

			async function takeTheirs() {
				setConflict(null);
				await load(true);
			}
			function keepMine() {
				setConflict(null);
				setStatus('dirty');
			}

			// Debug-only: drive a targeted companion edit on the current block, then
			// reflect it (adopt if clean, conflict if dirty) — proves §11/§12 in-browser.
			async function simulateCompanion() {
				if (!sel) return;
				const block = findBlock(product, sel);
				const content = (block ? visibleFirstWords(block.content) : 'Auftrag') + ' — vom Companion geschärft.';
				const { status: code, data } = await api('POST', '/api/companion-edit', { sessionId, ...sel, content });
				if (code !== 200) { setError('Companion-Edit fehlgeschlagen'); return; }
				setLog({ actor: data.actor, revision: data.revision, delta: data.delta });
				if (statusRef.current === 'clean') {
					setProduct(data.product);
					setBaseRevision(data.revision);
				} else {
					setStatus('externally_changed');
					setConflict({ message: 'Dieser Abschnitt wurde inzwischen vom Companion verändert.' });
				}
			}

			if (error) return h('div', { className: 'ptp-root' }, h('div', { className: 'ptp-empty' }, 'Fehler: ' + error));
			if (product === null) {
				return h('div', { className: 'ptp-root' }, h('div', { className: 'ptp-empty' },
					h('div', null, 'Noch kein Teaching Product in diesem Denkraum.'),
					h('button', { className: 'ptp-btn ptp-btn-primary', onClick: async () => { await api('POST', '/api/seed', { sessionId }); load(); } }, 'Demo-Unterrichtsreihe erstellen'),
				));
			}
			if (!sel) return h('div', { className: 'ptp-root' }, h('div', { className: 'ptp-empty' }, 'Diese Reihe hat noch keine bearbeitbaren Blöcke.'));

			const { lesson, phase } = findPhase(product, sel);
			return h('div', { className: 'ptp-root' },
				h('div', { className: 'ptp-head' },
					h('div', { className: 'ptp-series' }, product.series.title || 'Unterrichtsreihe'),
					h('div', { className: 'ptp-tabs' }, product.series.lessons.map((l) =>
						h('button', { key: l.id, className: 'ptp-tab' + (l.id === sel.lessonId ? ' ptp-tab-active' : ''), onClick: () => selectLesson(l.id) }, l.title || 'Stunde'),
					)),
				),
				h('div', { className: 'ptp-body' },
					h('div', { className: 'ptp-phases' },
						h('div', { className: 'ptp-phases-label' }, 'Phasen'),
						lesson.phases.map((p) => h('button', {
							key: p.id, className: 'ptp-phase' + (p.id === sel.phaseId ? ' ptp-phase-active' : ''), onClick: () => selectPhase(p.id),
						}, h('span', null, p.title || 'Phase'), p.durationMinutes ? h('span', { className: 'ptp-phase-dur' }, p.durationMinutes + ' min') : null)),
					),
					h('div', { className: 'ptp-main' },
						h('div', { className: 'ptp-phase-title' }, phase ? phase.title : ''),
						conflict ? h('div', { className: 'ptp-conflict' },
							h('div', { className: 'ptp-conflict-msg' }, conflict.message),
							h('div', { className: 'ptp-conflict-actions' },
								h('button', { className: 'ptp-btn', onClick: keepMine }, 'Meine Fassung behalten'),
								h('button', { className: 'ptp-btn ptp-btn-primary', onClick: takeTheirs }, 'Neue Fassung laden'),
							),
						) : null,
						h('div', { className: 'ptp-editor-wrap' }, h('div', { className: 'ptp-editor', ref: hostRef })),
						h('div', { className: 'ptp-bar' },
							h('button', { className: 'ptp-btn ptp-btn-primary', disabled: status !== 'dirty', onClick: save }, 'Speichern'),
							h('span', { className: 'ptp-status' + (status === 'dirty' ? ' ptp-status-dirty' : status === 'saving' ? ' ptp-status-saving' : '') },
								status === 'clean' ? 'gespeichert' : status === 'dirty' ? 'ungespeicherte Änderungen' : status === 'saving' ? 'speichert…' : 'extern verändert'),
						),
						h('details', { className: 'ptp-debug' },
							h('summary', null, 'Debug / Provenienz'),
							h('div', { className: 'ptp-tools' },
								h('button', { className: 'ptp-btn', onClick: simulateCompanion }, 'Companion-Edit (Demo)'),
								h('button', { className: 'ptp-btn', onClick: () => load(true) }, 'Neu laden'),
							),
							h('pre', null, JSON.stringify({
								lessonId: sel.lessonId, phaseId: sel.phaseId, blockId: sel.blockId,
								baseRevision, status,
								sourceRefs: lesson.sourceRefs, phaseSourceRefs: phase && phase.sourceRefs,
								provenance: product.provenance,
								lastChange: log,
							}, null, 2)),
						),
					),
				),
			);
		}

		function visibleFirstWords(markup) {
			return String(markup || '').replace(/[*_`#>-]/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ') || 'Auftrag';
		}

		function apply(ctx) {
			const tabs = ctx.get('sidebarRightTabs');
			const right = ctx.get('sidebarRight');
			if (!tabs || !right) { console.error('[pts-teaching-product-editor] Sidebar-Services fehlen'); return; }
			window.__ptsTeachingProductOpen = () => right.openTab(TYPE_KIND);
			ctx.effect(() => tabs.register({
				id: TYPE_ID, kind: TYPE_KIND, priority: 'extension',
				title: () => 'Unterrichtsprodukt',
				guide: [{ order: 35, title: () => 'Unterrichtsprodukt', description: () => 'Aus dem bestätigten Denkstand eine Unterrichtsreihe konkretisieren.' }],
			}), 'pts-teaching-product-editor:type');
			ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
				{ name: 'sidebar.right.pane.tab', key: TYPE_ID },
				(p) => h(Body, p),
			)), 'pts-teaching-product-editor:body');
			ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
				{ name: 'shell.overlay', id: 'pts-teaching-product-opener', order: 42, label: 'Unterrichtsprodukt öffnen' },
				() => h('button', { className: 'ptp-btn', style: { position: 'fixed', bottom: '14px', right: '14px', zIndex: 30 }, onClick: () => right.openTab(TYPE_KIND) }, 'Unterrichtsprodukt'),
			)), 'pts-teaching-product-editor:opener');
		}

		return { inject: ['slots', 'sidebarRightTabs', 'sidebarRight'], apply };
	},
});
