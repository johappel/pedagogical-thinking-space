// pts-denkstand — host half.
//
// Reads the three structured "Denkstand" YAML files of a Denkraum and returns
// them as JSON for the client tab. No external YAML dependency: a compact
// parser covers the subset these schema files actually use (block mappings,
// block sequences, nested indentation, flow sequences, scalars, comments).
//
// Endpoint:
//   GET /api/pts-denkstand?sessionId=<id>  -> JSON { root, board, temporal, decisions, errors }
//
// The workspace root is resolved per request from the session header cwd, like
// pts-artifact-panel. Missing files come back as null (no error); unparsable
// files come back with a short error message so the teacher sees WHY instead
// of an empty board.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const inject = ['webServer'];

const DENKSTAND_FILES = ['planning-board.yml', 'temporal-plan.yml', 'decisions.yml'];
const THOUGHTS_FILE = 'thoughts.json';

/** Minimal YAML parser for the PTS Denkstand subset. */
function parseYaml(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const nodes = [];

  for (const raw of lines) {
    const line = stripComment(raw);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    nodes.push({ indent, text: line.trim() });
  }

  let i = 0;

  /** Consume `key:` at ownerIndent, returning its (possibly nested) value. */
  function mapValue(ownerIndent, inlineValue) {
    const trimmed = inlineValue.trim();
    if (trimmed === '') {
      // nested block follows on a deeper line
      if (i < nodes.length && nodes[i].indent > ownerIndent) {
        return parseBlock(nodes[i].indent);
      }
      return null;
    }
    return parseValue(trimmed);
  }

  /** Parse a sequence whose items start at seqIndent (`- ` markers). */
  function parseSeq(seqIndent) {
    const out = [];
    while (i < nodes.length && nodes[i].indent === seqIndent && nodes[i].text.startsWith('- ')) {
      const rest = nodes[i].text.slice(2);
      i += 1;
      const keyMatch = rest.match(/^([^:]+):\s*(.*)$/);
      if (keyMatch !== null && !isFlowStart(rest)) {
        // keyed sequence item: the item is a mapping. Its body may continue on
        // deeper lines at a fixed item indent (itemIndent). We parse all deeper
        // lines that are NOT deeper still, gathering keys into one object.
        const item = {};
        item[keyMatch[1].trim()] = mapValue(seqIndent, keyMatch[2]);
        // collect sibling keys of this item (same indentation as the first key
        // that follows, deeper than seqIndent)
        let itemIndent = null;
        while (i < nodes.length && nodes[i].indent > seqIndent && !nodes[i].text.startsWith('- ')) {
          const n = nodes[i];
          const km = n.text.match(/^([^:]+):\s*(.*)$/);
          if (km === null) { i += 1; continue; }
          if (itemIndent === null) itemIndent = n.indent;
          if (n.indent !== itemIndent) break; // nested deeper = value, handled recursively
          i += 1;
          item[km[1].trim()] = mapValue(n.indent, km[2]);
        }
        out.push(item);
      } else if (rest === '') {
        // `-` followed by nested block on deeper line
        if (i < nodes.length && nodes[i].indent > seqIndent) {
          out.push(parseBlock(nodes[i].indent));
        } else {
          out.push(null);
        }
      } else {
        out.push(parseScalar(rest));
      }
    }
    return out;
  }

  /** Parse a block (mapping or sequence) at the given min indent. */
  function parseBlock(minIndent) {
    const result = [];
    while (i < nodes.length && nodes[i].indent >= minIndent) {
      const node = nodes[i];
      if (node.text.startsWith('- ')) {
        result.push(...parseSeq(node.indent));
        continue;
      }
      const keyMatch = node.text.match(/^([^:]+):\s*(.*)$/);
      if (keyMatch !== null) {
        const key = keyMatch[1].trim();
        i += 1;
        result.push([key, mapValue(node.indent, keyMatch[2])]);
      } else {
        // bare scalar at this level (rare)
        result.push([null, parseScalar(node.text)]);
        i += 1;
      }
    }
    return result;
  }

  function parseValue(text) {
    if (text.startsWith('[')) {
      const inner = text.slice(1, text.endsWith(']') ? -1 : undefined);
      return splitFlow(inner).map(parseScalar);
    }
    if (text.startsWith('{')) {
      const inner = text.slice(1, text.endsWith('}') ? -1 : undefined);
      const obj = {};
      for (const part of splitFlow(inner)) {
        const m = part.match(/^([^:]+):\s*(.*)$/);
        if (m !== null) obj[m[1].trim()] = parseScalar(m[2]);
      }
      return obj;
    }
    return parseScalar(text);
  }

  function parseScalar(text) {
    const t = text.trim();
    if (t === '') return null;
    if (t === 'null' || t === '~') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    const num = Number(t);
    if (t !== '' && !isNaN(num) && /^-?\d+(\.\d+)?$/.test(t)) return num;
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  /** Build a root object from block entries ([key, value] or object). */
  function parseRoot() {
    const list = parseBlock(0);
    const obj = {};
    for (const entry of list) {
      if (Array.isArray(entry)) {
        const [key, value] = entry;
        if (key !== null) obj[key] = value;
      } else if (typeof entry === 'object' && !Array.isArray(entry)) {
        Object.assign(obj, entry);
      }
    }
    return obj;
  }

  return parseRoot();
}

function stripComment(raw) {
  let inSingle = false;
  let inDouble = false;
  let inFlow = 0;
  for (let k = 0; k < raw.length; k++) {
    const ch = raw[k];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '[' || ch === '{') { if (!inSingle && !inDouble) inFlow += 1; }
    else if (ch === ']' || ch === '}') { if (!inSingle && !inDouble) inFlow = Math.max(0, inFlow - 1); }
    else if (ch === '#' && !inSingle && !inDouble && inFlow === 0) {
      // comment only if preceded by whitespace or line start
      if (k === 0 || /\s/.test(raw[k - 1])) return raw.slice(0, k);
    }
  }
  return raw;
}

function splitFlow(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (const ch of String(text)) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === '[' || ch === '{') { if (!inSingle && !inDouble) depth += 1; }
    else if (ch === ']' || ch === '}') { if (!inSingle && !inDouble) depth = Math.max(0, depth - 1); }
    if (ch === ',' && depth === 0 && !inSingle && !inDouble) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

function isFlowStart(s) {
  return /^[\[{]/.test(s.trim());
}

/** Render one scalar (or array/object) as a short display string. */
function display(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'object') {
    const parts = Object.entries(value).map(([k, v]) => `${k}: ${display(v)}`);
    return parts.join(', ');
  }
  return String(value);
}

function kindLabel(kind) {
  const map = {
    clarify: 'Klärung',
    research: 'Recherche',
    design: 'Gestaltung',
    intervention: 'Veränderung',
    observe: 'Beobachtung',
    produce: 'Erstellung',
    review: 'Auswertung',
    render: 'Format',
    export: 'Export',
  };
  return map[kind] || kind || '—';
}

function columnLabel(col) {
  const map = {
    clarify: 'Klären',
    prepare: 'Vorbereiten',
    review: 'Auswerten',
    ready: 'Bereit',
  };
  return map[col] || col || 'Sonstiges';
}

function statusLabel(status) {
  const map = {
    proposed: 'Vorschlag',
    approved: 'Freigegeben',
    in_progress: 'In Arbeit',
    review: 'Auswerten',
    ready: 'Bereit',
    blocked: 'Blockiert',
    discarded: 'Verworfen',
  };
  return map[status] || status || '—';
}

function roleLabel(role) {
  const map = {
    opening: 'Einstieg',
    irritation: 'Irritation',
    exploration: 'Erkundung',
    deepening: 'Vertiefung',
    practice: 'Übung',
    decision: 'Entscheidung',
    consolidation: 'Sicherung',
    reflection: 'Reflexion',
    closing: 'Abschluss',
    transition: 'Übergang',
    buffer: 'Puffer',
    other: 'Sonstiges',
  };
  return map[role] || role || '—';
}

function modeLabel(mode) {
  const map = {
    common: 'Gemeinsam',
    choice: 'Wahl',
    parallel: 'Parallel',
    individual: 'Einzeln',
    group: 'Gruppe',
    open: 'Offen',
  };
  return map[mode] || mode || '—';
}

export function _parseYaml(source) {
  return parseYaml(source);
}

export function _parseBoard(raw) {
  return parseBoard(raw);
}

export function _parseTemporal(raw) {
  return parseTemporal(raw);
}

export function _parseDecisions(raw) {
  return parseDecisions(raw);
}

export function _removeDesignQuestion(content, question) {
  return removeDesignQuestion(content, question);
}

export function _appendDecisionYaml(yml, question) {
  return appendDecisionYaml(yml, question);
}

export function _appendBoardClarify(yml, question) {
  return appendBoardClarify(yml, question);
}

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

function parseBoard(raw) {
  const board = parseYaml(raw);
  const items = Array.isArray(board.items) ? board.items : [];
  const columns = {};
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const col = typeof item.column === 'string' ? item.column : 'other';
    if (!columns[col]) columns[col] = [];
    columns[col].push({
      id: item.id ?? '?',
      title: typeof item.title === 'string' ? item.title : 'Unbenannt',
      kind: typeof item.kind === 'string' ? item.kind : '',
      kind_label: kindLabel(item.kind),
      status: typeof item.status === 'string' ? item.status : '',
      status_label: statusLabel(item.status),
      requires_teacher_approval: item.requires_teacher_approval === true,
      description: typeof item.description === 'string' ? item.description : '',
      summary: display(item.pedagogical_tension || item.working_hypothesis || item.smallest_change || ''),
      raw: item,
    });
  }
  return { schema: board.schema, columns, raw: board };
}

function parseTemporal(raw) {
  const tp = parseYaml(raw);
  const windows = Array.isArray(tp.windows) ? tp.windows : [];
  const placements = Array.isArray(tp.placements) ? tp.placements : [];
  return {
    schema: tp.schema,
    title: typeof tp.title === 'string' ? tp.title : '',
    windows: windows.map((w) => ({
      id: w.id ?? '?',
      title: typeof w.title === 'string' ? w.title : 'Unbenannt',
      kind: w.kind ?? '',
      kind_label: kindLabel(w.kind),
      duration_minutes: w.duration_minutes ?? null,
      note: typeof w.note === 'string' ? w.note : '',
      placements: placements
        .filter((p) => p !== null && p.window_id === w.id)
        .map((p) => ({
          id: p.id ?? '?',
          moment_id: p.moment_id ?? '',
          window_id: p.window_id ?? '',
          start_minute: p.start_minute ?? null,
          duration_minutes: p.duration_minutes ?? null,
          dramaturgical_role: p.dramaturgical_role ?? '',
          role_label: roleLabel(p.dramaturgical_role),
          mode: p.mode ?? '',
          mode_label: modeLabel(p.mode),
          note: typeof p.note === 'string' ? p.note : '',
        })),
    })),
    empty: windows.length === 0,
  };
}

function parseDecisions(raw) {
  const dec = parseYaml(raw);
  const decisions = Array.isArray(dec.decisions) ? dec.decisions : [];
  return {
    decisions: decisions.map((d) => ({
      id: d?.id ?? '',
      title: typeof d?.title === 'string' ? d.title : display(d),
      detail: typeof d?.evidence === 'string' ? d.evidence : (typeof d?.note === 'string' ? d.note : ''),
    })),
    empty: decisions.length === 0,
  };
}

// Remove a single `- ` list item (matched by its stripped text) from the
// "## Open Questions" section of learning-design.md. Returns whether it was
// found; multi-line items are not handled (the design doc uses one line each).
function removeDesignQuestion(content, question) {
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let inOQ = false;
  let removed = false;
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      inOQ = /^#{1,6}\s+Open Questions\s*$/i.test(line.trim());
      out.push(line);
      continue;
    }
    if (inOQ && /^-\s+/.test(line.trim())) {
      const text = line.trim().replace(/^-\s*/, '').trim();
      if (text === question) { removed = true; continue; }
    }
    out.push(line);
  }
  return { removed, content: out.join('\n') };
}

// Append a minimal decision block to decisions.yml (next E<NN> id, binding).
function appendDecisionYaml(yml, question) {
  const src = String(yml);
  const ids = [];
  const re = /^\s*-\s*id:\s*(E\d+)/gim;
  let m;
  while ((m = re.exec(src)) !== null) ids.push(parseInt(m[1].replace(/^E/i, ''), 10));
  const next = 'E' + String((ids.length ? Math.max.apply(null, ids) : 0) + 1).padStart(3, '0');
  const today = new Date().toISOString().slice(0, 10);
  const cleanQ = question.replace(/^[✅✔✓☑]\s*/, '').replace(/"/g, '\\"');
  const title = cleanQ.split(':')[0].replace(/[*_]+/g, '').trim() || 'Entscheidung';
  const base = src.replace(/\s*$/, '');
  return base + '\n' +
    '  - id: ' + next + '\n' +
    '    title: ' + title + '\n' +
    '    date: ' + today + '\n' +
    '    category: design\n' +
    '    status: binding\n' +
    '    description: "Vom Denkstand bestätigt: ' + cleanQ + '"\n';
}

// Append a `kind: clarify` board item (planning-board.yml) to the Klären column.
// Creates the file skeleton if it is missing.
function appendBoardClarify(yml, question) {
  const src = String(yml);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const ids = [];
  const re = /^\s*-\s*id:\s*(pb-clarify-\d{8}-\d+)/gim;
  let m;
  while ((m = re.exec(src)) !== null) ids.push(m[1]);
  let n = 0;
  for (const id of ids) { const mm = id.match(/-(\d+)$/); if (mm) n = Math.max(n, parseInt(mm[1], 10)); }
  const nextId = 'pb-clarify-' + today + '-' + (n + 1);
  const cleanQ = question.replace(/^[✅✔✓☑]\s*/, '').replace(/[*_]+/g, '').trim().replace(/"/g, '\\"');
  const base = src.replace(/\s*$/, '');
  const block = '  - id: ' + nextId + '\n' +
    '    title: ' + cleanQ + '\n' +
    '    kind: clarify\n' +
    '    column: clarify\n' +
    '    status: proposed\n' +
    '    requires_teacher_approval: true';
  return base + '\n' + block + '\n';
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    let data = '';
    req.on('data', function(chunk) {
      data += chunk;
      if (data.length > 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', function() { resolve(data); });
    req.on('error', reject);
  });
}

async function atomicWriteFile(dir, name, content) {
  const tmp = path.join(dir, '.' + name + '.tmp-' + Date.now());
  await fsp.writeFile(tmp, content, 'utf8');
  try {
    await fsp.rename(tmp, path.join(dir, name));
  } catch (e) {
    await fsp.unlink(tmp).catch(function() {});
    throw e;
  }
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}

export function apply(ctx) {
  const webServer = ctx.get('webServer');
  if (webServer === undefined) {
    console.error('[pts-denkstand] webServer service missing - plugin inactive');
    return;
  }
  const sessionsStore = ctx.get('sessions');
  const policy = ctx.get('sandboxPolicy');
  const fallbackRoot = policy !== undefined && typeof policy.workspaceRoot === 'string'
    ? policy.workspaceRoot
    : process.cwd();

  function sessionWorkspace(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '' || sessionsStore === undefined) return null;
    try {
      const session = sessionsStore.get(sessionId);
      const header = session !== undefined && session !== null ? session.header : undefined;
      if (header !== undefined && header !== null && typeof header.cwd === 'string' && header.cwd.trim() !== '') {
        return header.cwd;
      }
    } catch {
      // live data guard
    }
    return null;
  }

  async function readWorkspaceFile(base, relName) {
    try {
      const abs = path.resolve(base, relName);
      const stat = await fsp.stat(abs).catch(() => null);
      if (stat === null || !stat.isFile()) return { ok: false, missing: true };
      const raw = await fsp.readFile(abs, 'utf8');
      return { ok: true, raw };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  /** Pinboard votes: { votes: { <statement>: <count> } } from thoughts.json. */
  async function readThoughts(base) {
    const file = await readWorkspaceFile(base, THOUGHTS_FILE);
    if (!file.ok || file.missing) return { votes: {} };
    try {
      const v = JSON.parse(file.raw);
      return { votes: (v && typeof v.votes === 'object' && v.votes !== null) ? v.votes : {} };
    } catch (e) {
      return { votes: {} };
    }
  }

  const dispose = webServer.register({
    kind: 'exact',
    path: '/api/pts-denkstand',
    handler: async (req, res) => {
      try {
        const rawUrl = typeof req.url === 'string' ? req.url : '';
        const qIndex = rawUrl.indexOf('?');
        const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
        let sessionId = '';
        for (const part of query.split('&')) {
          const eq = part.indexOf('=');
          if (eq <= 0) continue;
          const key = part.slice(0, eq);
          const value = decodeURIComponent(part.slice(eq + 1));
          if (key === 'sessionId') sessionId = value;
        }

        const base = sessionWorkspace(sessionId) ?? fallbackRoot;

        const result = { root: toPosix(base), board: null, temporal: null, decisions: null, thoughts: { votes: {} }, errors: [] };
        for (const name of DENKSTAND_FILES) {
          const file = await readWorkspaceFile(base, name);
          if (file.missing) continue;
          if (!file.ok) {
            result.errors.push({ file: name, message: file.error });
            continue;
          }
          try {
            if (name === 'planning-board.yml') result.board = parseBoard(file.raw);
            else if (name === 'temporal-plan.yml') result.temporal = parseTemporal(file.raw);
            else if (name === 'decisions.yml') result.decisions = parseDecisions(file.raw);
          } catch (e) {
            result.errors.push({ file: name, message: 'YAML-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) });
          }
        }
        result.thoughts = await readThoughts(base);

        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify(result));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'internal' }));
      }
    },
  });

  ctx.effect(() => dispose, 'pts-denkstand: route');

  // Teacher decides a Learning-Design "Open Question": 'accept' records it as a
  // binding decision (decisions.yml) and removes it from the open list;
  // 'discard' removes it as no longer relevant. Both rewrite learning-design.md.
  const disposeQuestion = webServer.register({
    kind: 'exact',
    path: '/api/pts-denkstand/design-question',
    handler: async (req, res) => {
      try {
        const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
        if (method !== 'POST') { sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt' }); return; }
        const body = JSON.parse((await readBody(req)) || '{}');
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
        const question = typeof body.question === 'string' ? body.question : '';
        const action = body.action === 'accept' ? 'accept' : body.action === 'clarify' ? 'clarify' : 'discard';
        if (question.trim() === '') { sendJson(res, 400, { ok: false, error: 'question fehlt' }); return; }
        const base = sessionWorkspace(sessionId) ?? fallbackRoot;
        const designFile = await readWorkspaceFile(base, 'learning-design.md');
        if (!designFile.ok || designFile.missing) { sendJson(res, 404, { ok: false, error: 'learning-design.md nicht lesbar' }); return; }
        const r = removeDesignQuestion(designFile.raw, question);
        if (r.removed !== true) { sendJson(res, 404, { ok: false, error: 'Frage nicht gefunden' }); return; }
        await atomicWriteFile(base, 'learning-design.md', r.content);
        if (action === 'accept') {
          const decFile = await readWorkspaceFile(base, 'decisions.yml');
          const decContent = (decFile.ok && !decFile.missing) ? decFile.raw : 'decisions: []';
          await atomicWriteFile(base, 'decisions.yml', appendDecisionYaml(decContent, question));
        } else if (action === 'clarify') {
          const boardFile = await readWorkspaceFile(base, 'planning-board.yml');
          const boardContent = (boardFile.ok && !boardFile.missing) ? boardFile.raw : 'schema: ptspace.planning-board/v1\nitems:';
          await atomicWriteFile(base, 'planning-board.yml', appendBoardClarify(boardContent, question));
        }
        sendJson(res, 200, { ok: true, action });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
      }
    },
  });
  ctx.effect(() => disposeQuestion, 'pts-denkstand: design-question route');

  // Pinboard vote: adjust the per-statement importance count in thoughts.json.
  const disposeThoughts = webServer.register({
    kind: 'exact',
    path: '/api/pts-denkstand/thoughts',
    handler: async (req, res) => {
      try {
        const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
        if (method !== 'POST') { sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt' }); return; }
        const body = JSON.parse((await readBody(req)) || '{}');
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
        const statement = typeof body.statement === 'string' ? body.statement : '';
        const delta = Number.isFinite(body.delta) ? body.delta : 0;
        if (statement.trim() === '' || delta === 0) { sendJson(res, 400, { ok: false, error: 'statement/delta fehlt' }); return; }
        const base = sessionWorkspace(sessionId) ?? fallbackRoot;
        const thoughts = await readThoughts(base);
        const cur = typeof thoughts.votes[statement] === 'number' ? thoughts.votes[statement] : 0;
        thoughts.votes[statement] = Math.max(0, cur + delta);
        await atomicWriteFile(base, THOUGHTS_FILE, JSON.stringify(thoughts, null, 2) + '\n');
        sendJson(res, 200, { ok: true, votes: thoughts.votes });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
      }
    },
  });
  ctx.effect(() => disposeThoughts, 'pts-denkstand: thoughts route');

  console.log('[pts-denkstand] host half active; routes /api/pts-denkstand, /api/pts-denkstand/design-question, /api/pts-denkstand/thoughts registered');
}
