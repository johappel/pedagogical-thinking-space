// PTS domain and canonical persistence, shared by the existing host and pts_edit.
// No worker routing, background jobs or independent conversation state.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseLandscape, parseTemporal, parseYaml } from './workspace-parsers.mjs';

export const PRODUCT_FILE = 'teaching-product.json';
export const PRODUCT_SCHEMA = 'ptspace.teaching-product/v1';
const LIMIT = 512 * 1024;
const SOURCES = ['learning-design.md', 'learning-landscape.md', 'planning-board.yml', 'temporal-plan.yml'];
export const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clone = (value) => structuredClone(value);
function check(ok, message) { if (!ok) throw new Error(message); }
function text(value, label, max = 8000) { check(typeof value === 'string' && value.length <= max, `${label}: invalid text`); }
function id(value) { check(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/.test(value), 'invalid id'); }
function keys(value, allowed) { check(value && typeof value === 'object' && !Array.isArray(value), 'expected object'); check(Object.keys(value).every((key) => allowed.includes(key)), 'unknown field'); }
export function materialPath(value) {
  check(typeof value === 'string' && /^(materials|rendered)\//.test(value) && !value.includes('\\') && !value.includes(':') && !value.split('/').some((s) => !s || s === '..' || s === '.'), 'invalid material path');
}
export function emptyProduct(title = '') {
  return { schema: PRODUCT_SCHEMA, revision: 0, series: { id: 'series', title, intention: '', notes: '', lessons: [] }, proposals: [], approvals: [], assessments: {}, readiness: {}, migration: null };
}
export function validateSeries(series) {
  keys(series, ['id', 'title', 'intention', 'notes', 'lessons']);
  id(series.id); for (const k of ['title', 'intention', 'notes']) text(series[k], k);
  check(Array.isArray(series.lessons) && series.lessons.length <= 100, 'invalid lessons');
  const ids = new Set([series.id]);
  function unique(value) { id(value); check(!ids.has(value), 'duplicate id'); ids.add(value); }
  for (const lesson of series.lessons) {
    keys(lesson, ['id', 'title', 'intention', 'notes', 'kind', 'durationMinutes', 'phases']);
    check(lesson.kind === undefined || ['lesson', 'double_lesson', 'project_block', 'open_learning_time'].includes(lesson.kind), 'invalid lesson kind');
    unique(lesson.id); for (const k of ['title', 'intention', 'notes']) text(lesson[k], k);
    check(lesson.durationMinutes === null || (Number.isFinite(lesson.durationMinutes) && lesson.durationMinutes > 0), 'invalid lesson duration');
    check(Array.isArray(lesson.phases) && lesson.phases.length <= 100, 'invalid phases');
    for (const phase of lesson.phases) {
      keys(phase, ['id', 'title', 'intention', 'activity', 'notes', 'durationMinutes', 'startMinute', 'role', 'mode', 'momentIds', 'materials', 'openQuestions', 'sourceHashes']);
      unique(phase.id);
      for (const k of ['title', 'intention', 'activity', 'notes', 'role', 'mode']) text(phase[k], k);
      for (const k of ['durationMinutes', 'startMinute']) check(phase[k] === null || (Number.isFinite(phase[k]) && phase[k] >= 0), `invalid ${k}`);
      for (const k of ['momentIds', 'materials', 'openQuestions']) check(Array.isArray(phase[k]) && phase[k].length <= 100, `invalid ${k}`);
      phase.momentIds.forEach(id); check(new Set(phase.momentIds).size === phase.momentIds.length, 'duplicate moment reference');
      phase.materials.forEach(materialPath); phase.openQuestions.forEach((q) => text(q, 'question', 1000));
      keys(phase.sourceHashes, phase.momentIds);
      Object.values(phase.sourceHashes).forEach((h) => check(typeof h === 'string' && /^[a-f0-9]{64}$/.test(h), 'invalid source hash'));
    }
  }
  return series;
}
export function validateProduct(product) {
  check(product?.schema === PRODUCT_SCHEMA && Number.isSafeInteger(product.revision) && product.revision >= 0, 'unsupported product schema/revision');
  validateSeries(product.series);
  check(Array.isArray(product.proposals) && Array.isArray(product.approvals), 'invalid product records');
  const ids = new Set();
  for (const p of product.proposals) {
    id(p.id); check(!ids.has(p.id), 'duplicate proposal'); ids.add(p.id);
    validateSeries(p.series); text(p.reason, 'reason');
    check(['pending', 'accepted', 'rejected'].includes(p.status), 'invalid proposal status');
    check(Number.isSafeInteger(p.baseRevision) && typeof p.sourceRevision === 'string' && typeof p.hash === 'string', 'invalid proposal revision');
    check(digest(p.series) === p.hash, 'proposal content hash mismatch');
  }
  for (const k of ['assessments', 'readiness']) check(product[k] && typeof product[k] === 'object' && !Array.isArray(product[k]), `invalid ${k}`);
  return product;
}

export async function workspaceRoot(candidate) {
  check(typeof candidate === 'string' && path.isAbsolute(candidate), 'current PTS Denkraum required');
  const resolved = path.resolve(candidate);
  check(path.basename(path.dirname(resolved)).toLowerCase() === 'workspace', 'current PTS Denkraum required');
  const real = await fs.realpath(resolved);
  const parent = await fs.realpath(path.dirname(resolved));
  check(path.dirname(real).toLowerCase() === parent.toLowerCase(), 'workspace link escapes PTS');
  check((await fs.stat(path.join(path.dirname(parent), 'AGENTS.md'))).isFile(), 'PTS marker missing');
  return real;
}
async function safeRead(root, file, missing = '') {
  const target = path.join(root, file);
  try {
    const real = await fs.realpath(target);
    const rel = path.relative(root, real);
    check(!rel.startsWith('..') && !path.isAbsolute(rel), 'file escapes workspace');
    const stat = await fs.stat(real); check(stat.isFile() && stat.size <= LIMIT, 'file too large or not regular');
    return await fs.readFile(real, 'utf8');
  } catch (e) { if (e.code === 'ENOENT') return missing; throw e; }
}
async function atomic(root, file, value) {
  await safeRead(root, file); // reject existing links outside the workspace
  const temp = path.join(root, `.${file}.${randomUUID()}.tmp`);
  const raw = JSON.stringify(value, null, 2) + '\n'; check(Buffer.byteLength(raw) <= LIMIT, 'product too large');
  try { await fs.writeFile(temp, raw, { encoding: 'utf8', flag: 'wx' }); await fs.rename(temp, path.join(root, file)); }
  finally { await fs.unlink(temp).catch((e) => { if (e.code !== 'ENOENT') throw e; }); }
}
export async function readThinking(root) {
  const sources = Object.fromEntries(await Promise.all(SOURCES.map(async (f) => [f, await safeRead(root, f)])));
  const landscape = parseLandscape(sources['learning-landscape.md']);
  return { sources, moments: landscape.moments, title: landscape.front.title || path.basename(root), sourceRevision: digest(sources) };
}
export async function readProduct(root) {
  root = await workspaceRoot(root);
  const raw = await safeRead(root, PRODUCT_FILE);
  return raw === '' ? null : validateProduct(JSON.parse(raw));
}
export async function migrationPreview(root) {
  const thinking = await readThinking(root);
  const raw = thinking.sources['temporal-plan.yml'];
  if (raw.trim()) check(/^schema:\s*ptspace\.temporal-plan\/v1\s*$/m.test(raw), 'unsupported legacy temporal schema');
  const temporal = parseTemporal(raw);
  const byId = new Map(thinking.moments.map((m) => [m.id, m]));
  const series = emptyProduct(thinking.title).series;
  const warnings = [];
  for (const w of temporal.windows) {
    series.lessons.push({ id: w.id, title: w.title, kind: w.kind || 'lesson', intention: '', notes: w.note || '', durationMinutes: w.duration_minutes, phases: w.placements.map((p) => {
      const m = byId.get(p.moment_id);
      const materials = (m?.materials || []).filter((ref) => { try { materialPath(ref); return true; } catch { warnings.push(`Unresolved material reference ${ref} in ${p.id}`); return false; } });
      if (!m) warnings.push(`Missing moment ${p.moment_id} in ${p.id}`);
      return { id: p.id, title: m?.title || p.id, intention: m?.function || '', activity: m?.learning_activity || '', notes: p.note || '', durationMinutes: p.duration_minutes, startMinute: p.start_minute, role: p.dramaturgical_role || '', mode: p.mode || '', momentIds: m ? [m.id] : [], materials, openQuestions: [`Legacy placement (${p.status}); teaching use needs review.`, ...(!m ? [`Unresolved moment: ${p.moment_id}`] : []), ...(m?.open_questions || [])], sourceHashes: m ? { [m.id]: digest(m) } : {} };
    }) });
  }
  for (const p of temporal.placements) if (!temporal.windows.some((w) => w.id === p.window_id)) warnings.push(`Orphan placement ${p.id}: ${p.window_id}`);
  // Preserve unconverted source bytes by reference/hash; never silently discard them.
  if (warnings.some((w) => w.startsWith('Orphan'))) throw new Error(warnings.join('; '));
  validateSeries(series);
  return { series, warnings, sourceRevision: thinking.sourceRevision, legacyHash: digest(raw) };
}
function addProposal(product, series, reason, thinking) {
  validateSeries(series);
  const next = clone(series);
  const byId = new Map(thinking.moments.map((m) => [m.id, m]));
  for (const lesson of next.lessons) for (const phase of lesson.phases) {
    for (const ref of phase.momentIds) check(byId.has(ref), `unknown moment ${ref}`);
    const previous = product.series.lessons.flatMap((l) => l.phases).find((p) => p.id === phase.id);
    const semantic = (p) => ({ ...p, sourceHashes: {} });
    phase.sourceHashes = previous && digest(semantic(previous)) === digest(semantic(phase))
      ? clone(previous.sourceHashes) : Object.fromEntries(phase.momentIds.map((ref) => [ref, digest(byId.get(ref))]));
  }
  const proposal = { id: `proposal-${randomUUID()}`, series: next, reason, baseRevision: product.revision + 1, sourceRevision: thinking.sourceRevision, hash: digest(next), status: 'pending' };
  product.proposals.push(proposal);
  return proposal;
}
export const approvalToken = (proposal) => `[PTS product ${proposal.id} ${proposal.hash}]`;
export const gapDecisionToken = (gapId, resolution = 'resolved') => `[PTS gap ${gapId} ${resolution}]`;
async function decisionEvidence(root, decisionId, token) {
  id(decisionId);
  const raw = await safeRead(root, 'decisions.yml');
  const decisions = parseYaml(raw).decisions;
  const decision = Array.isArray(decisions) ? decisions.find((d) => d.id === decisionId) : null;
  check(decision?.status === 'confirmed' && [decision.decision, decision.statement].some((s) => typeof s === 'string' && s.includes(token)), 'matching confirmed teacher decision required');
}
export async function mutateProduct(candidate, args) {
  const root = await workspaceRoot(candidate);
  const lockPath = path.join(root, '.teaching-product.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); } catch (e) { if (e.code === 'EEXIST') throw new Error('product busy; retry after current write (inspect lock after crash)'); throw e; }
  try {
    let product = await readProduct(root);
    if (args.operation === 'migrate_product' && product) return { product, unchanged: true };
    if (args.operation === 'migrate_product') {
      const preview = await migrationPreview(root);
      check(args.sourceRevision === preview.sourceRevision, 'migration source changed; reload preview');
      product = emptyProduct(preview.series.title);
      product.migration = { legacyFile: 'temporal-plan.yml', legacyHash: preview.legacyHash, warnings: preview.warnings };
      if (preview.series.lessons.length) addProposal(product, preview.series, 'Migration: vorhandene Zeitplanung pruefen; keine automatische Freigabe.', await readThinking(root));
    } else {
      check(product, 'migrate workspace before product writes');
      check(args.expectedRevision === product.revision, 'product revision conflict; reload');
      if (args.operation === 'propose_product') {
        text(args.reason, 'reason', 2000); check(args.reason.trim(), 'proposal reason required');
        addProposal(product, args.series, args.reason, await readThinking(root));
      } else if (args.operation === 'propose_lesson_intention') {
        text(args.intention, 'intention', 8000); check(args.intention.trim(), 'lesson intention required');
        text(args.reason, 'reason', 2000); check(args.reason.trim(), 'proposal reason required');
        const series = clone(product.series);
        const lesson = series.lessons.find((entry) => entry.id === args.lessonId);
        check(lesson, 'unknown lesson');
        lesson.intention = args.intention;
        addProposal(product, series, args.reason, await readThinking(root));
      } else if (args.operation === 'accept_product' || args.operation === 'reject_product') {
        const p = product.proposals.find((p) => p.id === args.proposalId);
        check(p?.status === 'pending', 'pending proposal required');
        if (args.operation === 'accept_product') {
          check(p.baseRevision === product.revision, 'proposal stale; propose again against current product');
          check(p.sourceRevision === (await readThinking(root)).sourceRevision, 'thinking changed; review and propose again');
          await decisionEvidence(root, args.decisionId, approvalToken(p));
          product.series = clone(p.series);
          product.approvals.push({ proposalId: p.id, decisionId: args.decisionId, hash: p.hash });
          product.readiness = {}; product.assessments = {};
          p.status = 'accepted';
        } else p.status = 'rejected';
      } else if (args.operation === 'assess_product' || args.operation === 'mark_ready') {
        const lesson = product.series.lessons.find((l) => l.id === args.lessonId);
        check(lesson, 'unknown lesson');
        text(args.note, 'note', 2000); check(args.note.trim(), 'reason required');
        if (args.operation === 'assess_product') {
          check(['idea', 'developing', 'ready_candidate'].includes(args.assessment), 'invalid assessment');
          product.assessments[lesson.id] = { value: args.assessment, note: args.note, lessonHash: digest(lesson) };
        } else {
          check(typeof args.ready === 'boolean', 'ready boolean required');
          await decisionEvidence(root, args.decisionId, `[PTS readiness ${lesson.id} ${digest(lesson)} ${args.ready}]`);
          product.readiness[lesson.id] = { ready: args.ready, note: args.note, decisionId: args.decisionId, lessonHash: digest(lesson) };
        }
      } else throw new Error('unsupported product operation');
    }
    product.revision += 1;
    validateProduct(product);
    await atomic(root, PRODUCT_FILE, product);
    return { product };
  } finally { await lock.close(); await fs.unlink(lockPath); }
}

export function projectStatus(product, thinking, availableMaterials = [], decisionTexts = []) {
  if (!product) return { migrationRequired: true, lessons: [], nextStep: 'Vorhandene Zeitplanung sichten und Migration vorbereiten.' };
  const byId = new Map(thinking.moments.map((m) => [m.id, m]));
  const files = new Set(availableMaterials);
  const resolvedGaps = new Set();
  for (const decision of decisionTexts) {
    const match = String(decision).match(/\[PTS gap ([^\s]+) resolved\]/);
    if (match) resolvedGaps.add(match[1]);
  }
  const lessons = product.series.lessons.map((lesson) => {
    const gaps = [];
    const gapItems = [];
    const addGap = (text, scope, focus) => {
      const id = `${scope}:${digest(text).slice(0, 16)}`;
      const state = resolvedGaps.has(id) ? 'resolved' : 'open';
      gapItems.push({ id, text, state, focus });
      if (state === 'open') gaps.push(text);
    };
    if (!lesson.title.trim()) addGap('Stundentitel fehlt', `${lesson.id}:title`, { kind: 'lesson', id: lesson.id });
    if (!lesson.intention.trim()) addGap('Intention der Stunde fehlt', `${lesson.id}:intention`, { kind: 'lesson', id: lesson.id });
    if (!lesson.phases.length) addGap('Verlaufsphasen fehlen', `${lesson.id}:phases`, { kind: 'lesson', id: lesson.id });
    for (const p of lesson.phases) {
      if (!p.activity.trim()) addGap(`${p.title || p.id}: Lernaktivitaet fehlt`, `${lesson.id}:${p.id}:activity`, { kind: 'phase', id: p.id });
      if (!p.intention.trim()) addGap(`${p.title || p.id}: Intention fehlt`, `${lesson.id}:${p.id}:intention`, { kind: 'phase', id: p.id });
      for (const [index, q] of p.openQuestions.entries()) addGap(`${p.title || p.id}: ${q}`, `${lesson.id}:${p.id}:question:${index}`, { kind: 'phase', id: p.id });
      for (const ref of p.materials) if (!files.has(ref)) addGap(`${p.title || p.id}: Material fehlt (${ref})`, `${lesson.id}:${p.id}:material:${ref}`, { kind: 'phase', id: p.id });
      for (const ref of p.momentIds) {
        const moment = byId.get(ref);
        if (!moment) addGap(`${p.title || p.id}: Lernmoment fehlt (${ref})`, `${lesson.id}:${p.id}:moment:${ref}`, { kind: 'phase', id: p.id });
        else if (p.sourceHashes[ref] !== digest(moment)) addGap(`${p.title || p.id}: Lernmoment weiterentwickelt; Verwendung pruefen (${ref})`, `${lesson.id}:${p.id}:moment:${ref}`, { kind: 'moment', id: ref });
      }
    }
    const ready = product.readiness[lesson.id];
    const assessment = product.assessments[lesson.id];
    return { id: lesson.id, title: lesson.title, stage: lesson.phases.length ? 'developing' : 'idea', gaps, gapItems,
      teacherReadiness: ready && ready.lessonHash === digest(lesson) ? ready : null,
      companionAssessment: assessment && assessment.lessonHash === digest(lesson) ? assessment : null };
  });
  const pending = product.proposals.filter((p) => p.status === 'pending').map((p) => ({ id: p.id, reason: p.reason, stale: p.baseRevision !== product.revision || p.sourceRevision !== thinking.sourceRevision }));
  return { migrationRequired: false, lessons, pending, nextStep: pending.length ? 'Produktvorschlag gemeinsam pruefen.' : lessons.find((l) => l.gaps.length)?.gaps[0] || (lessons.length ? 'Verwendbarkeit als Lehrkraft pruefen.' : 'Eine erste Stunde aus dem Denkstand vorschlagen.') };
}
export async function productView(candidate) {
  const root = await workspaceRoot(candidate);
  const product = await readProduct(root);
  const thinking = await readThinking(root);
  let decisionTexts = [];
  try {
    const parsed = parseYaml(await safeRead(root, 'decisions.yml'));
    decisionTexts = (Array.isArray(parsed?.decisions) ? parsed.decisions : [])
      .filter((decision) => decision?.status === 'confirmed')
      .map((decision) => decision.decision ?? decision.statement ?? decision.title ?? '');
  } catch { decisionTexts = []; }
  const materialRefs = new Set(product?.series.lessons.flatMap((l) => l.phases.flatMap((p) => p.materials)) || []);
  const availableMaterials = [];
  for (const ref of materialRefs) {
    try {
      const real = await fs.realpath(path.join(root, ref));
      const rel = path.relative(root, real);
      if (!rel.startsWith('..') && !path.isAbsolute(rel) && (await fs.stat(real)).isFile()) availableMaterials.push(ref);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return { product, status: projectStatus(product, thinking, availableMaterials, decisionTexts), migration: product ? null : await migrationPreview(root), sourceRevision: thinking.sourceRevision };
}
export function productTemporal(product) {
  const placements = product.series.lessons.flatMap((l) => l.phases.flatMap((p) => p.momentIds.map((ref) => ({ id: `${p.id}.${ref}`, window_id: l.id, moment_id: ref, start_minute: p.startMinute, duration_minutes: p.durationMinutes, dramaturgical_role: p.role, mode: p.mode, note: p.notes, status: 'binding' }))));
  return { title: product.series.title, empty: product.series.lessons.length === 0, placements, windows: product.series.lessons.map((l) => ({ id: l.id, title: l.title, kind: 'lesson', duration_minutes: l.durationMinutes, status: 'binding', note: l.notes, placements: placements.filter((p) => p.window_id === l.id) })) };
}
