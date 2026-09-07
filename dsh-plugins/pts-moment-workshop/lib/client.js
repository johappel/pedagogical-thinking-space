// PTS learning-moment workshop. This client owns the single visible
// `landscape` conversation.view. Product/status and the host/domain routes
// stay with pts-landscape, which deliberately registers no second landscape
// tab.
window.__ModuleLoader__.load({
  id: 'pts-moment-workshop',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const inject = ['slots'];

    async function request(url, init) {
      const res = await fetch(url, init); const raw = await res.text(); let value = null;
      try { value = JSON.parse(raw); } catch {}
      if (!res.ok) throw new Error(value?.error || `HTTP ${res.status}`);
      return value;
    }
    async function post(url, body) { return request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
    function asLines(value) { return Array.isArray(value) ? value.join('\n') : ''; }
    function lines(value) { return String(value || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); }
    function useReload(sessionId) {
      const [state, setState] = React.useState({ data: null, config: null, error: '' });
      const load = React.useCallback(async () => {
        try {
          const [data, cfg] = await Promise.all([
            request(`/api/pts-landscape?sessionId=${encodeURIComponent(sessionId || '')}`),
            request(`/api/pts-moment-workshop/config?sessionId=${encodeURIComponent(sessionId || '')}`),
          ]);
          setState({ data, config: cfg, error: '' });
        } catch (error) { setState((old) => ({ ...old, error: String(error?.message || error) })); }
      }, [sessionId]);
      React.useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
      return [state, load];
    }
    function useProductUses(data) {
      const placements = data?.productRevision !== undefined && Array.isArray(data?.temporal?.placements) ? data.temporal.placements : [];
      const counts = new Map(); for (const p of placements) counts.set(p.moment_id, (counts.get(p.moment_id) || 0) + 1); return counts;
    }
    function focus(sessionId, kind, id, discuss) {
      return post('/api/pts-focus', { sessionId, focus: { kind, id, returnView: 'landscape' } }).then((value) => {
        window.dispatchEvent(new CustomEvent('pts:focus-changed'));
        if (discuss) window.dispatchEvent(new CustomEvent('pts:open-companion'));
        return value;
      });
    }
    function MomentEditor({ moment, functions, sessionId, onClose, onSaved }) {
      const [form, setForm] = React.useState(() => ({
        title: moment.title || '', type: moment.type || '', function: moment.function || '', learning_activity: moment.learning_activity || '', expected_experience: moment.expected_experience || '',
        material_needs: asLines(moment.material_needs), open_questions: asLines(moment.open_questions),
      }));
      const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
      const field = (name, label, multiline) => h('label', { className: 'pmw-field' }, h('span', null, label), multiline ? h('textarea', { value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) }) : h('input', { value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) }));
      const save = async () => { setBusy(true); setError(''); try {
        await post('/api/pts-landscape/moment', { sessionId, momentId: moment.id, fields: { ...form, material_needs: lines(form.material_needs), open_questions: lines(form.open_questions) } });
        onSaved(); onClose();
      } catch (e) { setError(String(e?.message || e)); } finally { setBusy(false); } };
      return h('div', { className: 'pmw-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Lernmoment ${moment.title || moment.id} bearbeiten` },
        h('div', { className: 'pmw-dialog' }, h('header', null, h('h2', null, 'Lernmoment-Werkstatt'), h('button', { onClick: onClose, 'aria-label': 'Schließen' }, '×')),
          h('p', { className: 'pmw-muted' }, moment.id), field('title', 'Titel'), field('type', 'Typ'),
          h('label', { className: 'pmw-field' }, h('span', null, 'Didaktische Funktion'), h('select', { value: form.function, onChange: (e) => setForm({ ...form, function: e.target.value }) },
            h('option', { value: form.function }, form.function || 'Noch nicht eingeordnet'), functions.filter((x) => x !== form.function).map((x) => h('option', { key: x, value: x }, x)))),
          field('learning_activity', 'Lernaktivität', true), field('expected_experience', 'Erwartete Lernerfahrung', true), field('material_needs', 'Materialbedarfe (eine Zeile je Eintrag)', true), field('open_questions', 'Offene Fragen (eine Zeile je Frage)', true),
          h('p', { className: 'pmw-muted' }, `Reifegrad: ${moment.status || 'draft'}${moment.provenance ? ` · Herkunft: ${moment.provenance}` : ''}`), error ? h('p', { role: 'alert', className: 'pmw-error' }, error) : null,
          h('footer', null, h('button', { onClick: onClose }, 'Abbrechen'), h('button', { onClick: save, disabled: busy }, busy ? 'Speichert…' : 'Speichern'))));
    }
    function MomentCard({ moment, uses, sessionId, onEdit }) {
      const [error, setError] = React.useState('');
      const discuss = async () => { try { await focus(sessionId, 'moment', moment.id, true); } catch (e) { setError(String(e?.message || e)); } };
      return h('article', { className: 'pmw-card', draggable: true, onDragStart: (e) => { e.dataTransfer.setData('text/pts-moment', moment.id); e.dataTransfer.effectAllowed = 'move'; } },
        h('div', { className: 'pmw-card-head' }, h('h3', null, moment.title || moment.id), h('span', { className: `pmw-status pmw-status-${moment.status || 'draft'}` }, moment.status || 'draft')),
        moment.learning_activity ? h('p', null, moment.learning_activity) : null,
        moment.expected_experience ? h('p', { className: 'pmw-muted' }, `Erwartete Erfahrung: ${moment.expected_experience}`) : null,
        Array.isArray(moment.open_questions) && moment.open_questions.length ? h('div', { className: 'pmw-questions' }, h('b', null, 'Offen:'), h('ul', null, moment.open_questions.map((q, i) => h('li', { key: i }, q)))) : null,
        Array.isArray(moment.materials) && moment.materials.length ? h('div', { className: 'pmw-materials' }, h('b', null, 'Material:'), moment.materials.map((ref) => h('button', { key: ref, className: 'pmw-link', onClick: async () => { try { await focus(sessionId, 'material', ref, true); } catch (e) { setError(String(e?.message || e)); } } }, ref))) : null,
        uses ? h('p', { className: 'pmw-use' }, uses === 1 ? 'In 1 Unterrichtsphase verwendet' : `In ${uses} Unterrichtsphasen verwendet`) : null,
        error ? h('p', { role: 'alert', className: 'pmw-error' }, error) : null,
        h('div', { className: 'pmw-actions' }, h('button', { onClick: () => onEdit(moment) }, 'Werkstatt'), h('button', { onClick: discuss }, 'Darüber sprechen')));
    }
    function WorkshopView(props) {
      const sessionId = props.sessionId; const [state, reload] = useReload(sessionId); const [editing, setEditing] = React.useState(null); const [feedback, setFeedback] = React.useState(''); const [saving, setSaving] = React.useState(false);
      const data = state.data; const functions = state.config?.config?.functions || []; const unassigned = state.config?.config?.unassignedLabel || 'Noch nicht eingeordnet'; const uses = useProductUses(data);
      if (!data) return h('main', { className: 'pmw-root' }, h('p', null, state.error || 'Lernmomente werden geladen…'));
      const moments = Array.isArray(data.moments) ? data.moments : [];
      const known = new Set(functions); const extra = [...new Set(moments.map((m) => m.function).filter((x) => x && !known.has(x)))]; const columns = [...functions, ...extra, ''];
      const move = async (momentId, fn) => { if (saving) return; setSaving(true); setFeedback(''); try { await post('/api/pts-landscape/moment', { sessionId, momentId, fields: { function: fn } }); setFeedback(fn ? `Didaktische Funktion geändert: ${fn}` : 'Didaktische Einordnung entfernt.'); await reload(); } catch (e) { setFeedback(`Nicht gespeichert: ${String(e?.message || e)}`); } finally { setSaving(false); } };
      return h('main', { className: 'pmw-root' },
        h('header', { className: 'pmw-toolbar' }, h('div', null, h('h2', null, `Lernmoment-Werkstatt${data.title ? ` · ${data.title}` : ''}`), h('p', null, 'Lernmomente nach didaktischer Funktion – noch keine Stunden- oder Zeitplanung.')), h('button', { onClick: reload }, 'Aktualisieren')),
        state.error ? h('p', { role: 'alert', className: 'pmw-error' }, state.error) : null, feedback ? h('p', { className: 'pmw-feedback' }, feedback) : null,
        moments.length ? h('div', { className: 'pmw-board' }, columns.map((fn) => {
          const label = fn || unassigned; const list = moments.filter((m) => (m.function || '') === fn);
          return h('section', { key: fn || '__unassigned', className: 'pmw-column', onDragOver: (e) => { if (Array.from(e.dataTransfer.types || []).includes('text/pts-moment')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }, onDrop: (e) => { const id = e.dataTransfer.getData('text/pts-moment'); if (id) { e.preventDefault(); move(id, fn); } } },
            h('h3', null, label, h('span', null, list.length)), list.length ? list.map((m) => h(MomentCard, { key: m.id, moment: m, uses: uses.get(m.id) || 0, sessionId, onEdit: setEditing })) : h('p', { className: 'pmw-empty' }, 'Noch kein Lernmoment'));
        })) : h('p', { className: 'pmw-empty pmw-empty-main' }, 'Noch keine Lernmomente. Sie entstehen im Gespräch und werden hier sichtbar.'),
        Array.isArray(data.transitions) && data.transitions.length ? h('details', { className: 'pmw-legacy' }, h('summary', null, `Legacy-Übergänge (${data.transitions.length})`), h('p', null, 'Diese Übergänge bleiben lesbar, sind aber nicht mehr die primäre Arbeitsform.'), h('ul', null, data.transitions.map((t) => h('li', { key: t.id || `${t.from}-${t.to}` }, `${t.from} → ${t.to}${t.reason ? ` · ${t.reason}` : ''}`)))) : null,
        h('p', { className: 'pmw-config' }, `Funktionsschema: ${state.config?.source || 'Standardkonfiguration'}`),
        editing ? h(MomentEditor, { moment: editing, functions, sessionId, onClose: () => setEditing(null), onSaved: reload }) : null);
    }
    function apply(ctx) {
      if (!document.getElementById('pts-moment-workshop-style')) { const style = document.createElement('style'); style.id = 'pts-moment-workshop-style'; style.textContent = `
        .pmw-root{padding:20px 24px 36px;min-height:100%;box-sizing:border-box}.pmw-toolbar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.pmw-toolbar h2{margin:0 0 4px}.pmw-toolbar p,.pmw-muted{opacity:.72}.pmw-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;align-items:start}.pmw-column{min-height:180px;padding:12px;border:1px solid rgba(128,128,128,.28);border-radius:14px;background:rgba(128,128,128,.045)}.pmw-column>h3{display:flex;justify-content:space-between;gap:8px;margin:0 0 10px;font-size:14px}.pmw-column>h3 span{opacity:.55;font-weight:400}.pmw-card{padding:12px;margin:0 0 10px;border:1px solid rgba(128,128,128,.32);border-radius:12px;background:var(--background,#444);box-shadow:0 1px 3px rgba(0,0,0,.05)}.pmw-card-head{display:flex;gap:8px;align-items:flex-start}.pmw-card h3{margin:0;flex:1;font-size:14px}.pmw-card p{margin:7px 0;font-size:13px;line-height:1.45}.pmw-status{font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(128,128,128,.35)}.pmw-questions ul{margin:5px 0 7px;padding-left:18px}.pmw-materials{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.pmw-link{border:0;background:transparent;text-decoration:underline;cursor:pointer;padding:2px;font:inherit;color:inherit;opacity:.78}.pmw-use{font-size:11px!important;opacity:.68}.pmw-actions{display:flex;gap:7px;margin-top:10px}.pmw-actions button,.pmw-toolbar button,.pmw-dialog button{border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:6px 9px;background:transparent;color:inherit;cursor:pointer}.pmw-empty{opacity:.55;font-size:12px}.pmw-empty-main{padding:28px}.pmw-feedback{padding:8px 10px;border-radius:8px;background:rgba(80,160,100,.12)}.pmw-error{color:#c44}.pmw-legacy,.pmw-config{margin-top:18px;opacity:.72}.pmw-overlay{position:fixed;inset:0;z-index:1400;background:rgba(0,0,0,.42);display:grid;place-items:center;padding:24px}.pmw-dialog{width:min(760px,95vw);max-height:90vh;overflow:auto;background:var(--background,#fff);color:var(--foreground,#222);border-radius:14px;padding:18px}.pmw-dialog header,.pmw-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.pmw-dialog h2{margin:0}.pmw-field{display:grid;gap:5px;margin:10px 0;font-size:13px}.pmw-field input,.pmw-field textarea,.pmw-field select{font:inherit;color:inherit;background:transparent;border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:8px}.pmw-field textarea{min-height:72px;resize:vertical}.pmw-dialog footer{justify-content:flex-end;margin-top:14px}@media(max-width:700px){.pmw-root{padding:14px}.pmw-board{display:block}.pmw-column{margin-bottom:12px}}
      `; document.head.appendChild(style); }
      ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'landscape', order: 30, label: 'Lernmomente' }, WorkshopView));
    }
    return { inject, apply };
  },
});
