import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { apply as landscape } from '../../dsh-plugins/pts-landscape/lib/index.js';
import { apply as binding } from '../../dsh-plugins/pts-conversation-binding/lib/index.js';
import { apply as workshop } from '../../dsh-plugins/pts-moment-workshop/lib/index.js';
import { apply as edit } from '../../dsh-presets/pts-companion/direct-pts-edit.mjs';
import { emptyProduct } from '../../dsh-presets/pts-companion/teaching-product.mjs';

export const momentText = `---
schema: ptspace.learning-landscape/v1
title: Perspektiven
---
# Lernmomente
## Lernmomente
### lm-perspektive
- Titel: Perspektiven vergleichen
- Typ: inquiry
- Funktion: Unterschiedliche Sichtweisen erkennen
- Lernaktivität: Zwei Aussagen vergleichen
- Erwartete Lernerfahrung: Sichtweisen unterscheiden
- Materialien: [materials/impuls.md]
- Materialbedarfe:
  - Impulsblatt
- Offene Fragen:
  - Wie sichern wir die Ergebnisse?
- Status: draft
- Herkunft: Lehrkraftgespräch
## Übergänge
`;
export function candidateSeries() {
  return { id: 'series', title: 'Perspektiven', intention: 'Sichtweisen begruendet vergleichen', notes: '', lessons: [{ id: 'lesson-1', title: 'Perspektiven erproben', kind: 'lesson', intention: 'Sichtweisen unterscheiden', notes: '', durationMinutes: 45, phases: [{ id: 'phase-1', title: 'Vergleich', intention: 'Begruendungen unterscheiden', activity: 'Zwei Aussagen vergleichen und begruenden', notes: '', durationMinutes: 15, startMinute: 0, role: 'exploration', mode: 'group', momentIds: ['lm-perspektive'], materials: ['materials/impuls.md'], openQuestions: ['Ergebnissicherung noch entwickeln'], sourceHashes: {} }] }] };
}
export async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pts-product-test-'));
  const root = path.join(dir, 'workspace', 'demo');
  await mkdir(path.join(root, 'materials'), { recursive: true });
  await writeFile(path.join(dir, 'AGENTS.md'), '# Isolated test PTS\n');
  await writeFile(path.join(root, 'learning-landscape.md'), momentText);
  await writeFile(path.join(root, 'learning-design.md'), '# Learning Design\n## Educational Intention\nPerspektiven vergleichen\n');
  await writeFile(path.join(root, 'planning-board.yml'), 'schema: ptspace.planning-board/v1\nitems:\n  - id: question-1\n    title: Welche Sicherung?\n    kind: clarify\n    status: proposed\n');
  await writeFile(path.join(root, 'decisions.yml'), 'schema: ptspace.decisions/v1\ndecisions:\n');
  await writeFile(path.join(root, 'materials', 'impuls.md'), '# Impuls\nZwei Perspektiven.\n');
  if (!options.legacy) await writeFile(path.join(root, 'teaching-product.json'), JSON.stringify(emptyProduct('Perspektiven')));
  else await writeFile(path.join(root, 'temporal-plan.yml'), `schema: ptspace.temporal-plan/v1
title: Perspektiven
windows:
  - id: tw-1
    title: Erste Stunde
    kind: double_lesson
    duration_minutes: 90
    status: proposed
placements:
  - id: tp-1
    moment_id: lm-perspektive
    window_id: tw-1
    start_minute: 0
    duration_minutes: 15
    dramaturgical_role: exploration
    mode: group
    status: proposed
`);
  const sessions = new Map([['test-session', { id: 'test-session', header: { cwd: root } }], ['other-session', { id: 'other-session', header: { cwd: root } }]]);
  const routes = new Map();
  const disposers = [];
  const ctx = { get: (name) => ({ webServer: { register: (spec) => { routes.set(spec.path, spec.handler); return () => routes.delete(spec.path); } }, sessions: { get: (id) => sessions.get(id) } })[name], effect: (effect) => disposers.push(effect()) };
  landscape(ctx);
  binding(ctx);
  workshop(ctx);
  let tool;
  const agent = { session: sessions.get('test-session'), ctx: { tools: { register: (definition) => { tool = definition; return () => {}; } } } };
  edit({ agent });
  const execute = (args) => tool.execute(args, { agent, signal: new AbortController().signal });
  let extra = async () => false;
  const server = createServer(async (req, res) => {
    try {
      if (await extra(req, res)) return;
      const route = routes.get(new URL(req.url, 'http://test').pathname);
      if (route) await route(req, res);
      else { res.statusCode = 404; res.end('not found'); }
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, args, sessionId = 'test-session') => {
    const response = await fetch(baseURL + route + (args ? '' : `?sessionId=${sessionId}`), args ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, ...args }) } : undefined);
    return { status: response.status, body: await response.json() };
  };
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    disposers.forEach((dispose) => dispose?.());
    if (path.dirname(dir) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith('pts-product-test-')) throw new Error('unsafe test cleanup');
    await rm(dir, { recursive: true, force: true });
  });
  return { root, dir, sessions, baseURL, request, execute, extra: (handler) => { extra = handler; } };
}
