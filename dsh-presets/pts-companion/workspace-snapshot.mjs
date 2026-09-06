// pts-workspace-snapshot — focus-aware context projection for the root Companion.
// DSH owns conversation history. PTS contributes only a bounded, current
// projection of the shared workspace plus an optional object-bound primary
// subject. Worker subagents receive their own task context and are skipped.

import { readFileSync, readdirSync, statSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { validateProduct, projectStatus, digest, PRODUCT_FILE } from './teaching-product.mjs';
import { parseLandscape, parseYaml } from './workspace-parsers.mjs';
import { getFocus, clearFocus } from './focus-context.mjs';
import { findConversationBindingBySessionSync } from './conversation-bindings.mjs';

export const name = 'pts-workspace-snapshot';
export const inject = ['systemPrompt', 'agents'];

const SECTION_NAME = 'pts:workspace-state';
const SECTION_ORDER = 90;
const FRAGMENT_DIRS = ['drafts', 'materials', 'knowledge-proposals', 'rendered'];
const FRAGMENT_CAP = 12;
export const CONTEXT_BUDGETS = Object.freeze({ overview: 4200, primaryFocus: 9000, secondaryFocus: 2600, fragments: 2200, total: 17500 });
export const CONTEXT_PRIORITIES = Object.freeze(['primary-focus', 'product-status', 'relevant-decisions', 'workspace-overview', 'fragments', 'secondary-focus']);

function isSubagent(agent) { return agent?.session?.header?.origin === 'subagent'; }
function composedPreset(ctx, agent) { return ctx.get('agentPresets')?.composedPreset(agent.ctx) ?? agent?.session?.header?.agentPreset; }
function posix(p) { return String(p).split(path.sep).join('/'); }
function json(value) { return JSON.stringify(value, null, 2); }
function clipped(label, value, limit) {
  const raw = typeof value === 'string' ? value : json(value);
  if (raw.length <= limit) return raw;
  return `${raw.slice(0, Math.max(0, limit - 96))}\n[… ${label} sichtbar gekürzt; Details bei Bedarf gezielt lesen …]`;
}
function relFiles(base, dir) {
  const abs = path.join(base, dir); const out = [];
  const walk = (d) => { let entries; try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) { const full = path.join(d, e.name); try { if (e.isDirectory()) walk(full); else if (e.isFile()) out.push(posix(path.relative(base, full))); } catch {} }
  };
  walk(abs); return out.sort();
}
function firstLineStartsWith(content, prefix) {
  const needle = prefix.toLowerCase();
  for (const line of content.split(/\r?\n/)) { const t = line.trim(); if (t.toLowerCase().startsWith(needle)) return t; }
  return null;
}
function extractSection(content, heading) {
  const needle = heading.trim().toLowerCase(); const out = []; let active = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) { if (active) break; active = line.trim().replace(/^##\s+/, '').trim().toLowerCase() === needle; continue; }
    if (active && line.trim()) out.push(line.trim());
  }
  return out;
}
function safeFile(root, file) {
  const target = path.join(root, file); if (!existsSync(target)) return '';
  const rootReal = realpathSync(root); const targetReal = realpathSync(target); const rel = path.relative(rootReal, targetReal); const stat = statSync(targetReal);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !stat.isFile() || stat.size > 512 * 1024) throw new Error('unsafe or oversized workspace artifact');
  return readFileSync(targetReal, 'utf8');
}
function parseBoard(raw) { try { const value = parseYaml(raw); return Array.isArray(value?.items) ? value.items : []; } catch { return []; } }
function parseDecisionObjects(raw) { try { const value = parseYaml(raw); return Array.isArray(value?.decisions) ? value.decisions : []; } catch { return []; } }
function decisionText(decision) { return String(decision?.decision ?? decision?.statement ?? decision?.title ?? '').trim(); }
function relevantByNeedle(items, needles, cap = 6) {
  const keys = needles.filter(Boolean).map((v) => String(v).toLowerCase());
  if (!keys.length) return [];
  return items.filter((item) => { const raw = json(item).toLowerCase(); return keys.some((needle) => raw.includes(needle)); }).slice(0, cap);
}
function productRelations(product) {
  const phases = [];
  for (const lesson of product?.series?.lessons || []) for (const phase of lesson.phases || []) phases.push({ lesson, phase });
  return phases;
}
function pendingFor(product, needle) {
  if (!product || !needle) return [];
  const low = String(needle).toLowerCase();
  return (product.proposals || []).filter((proposal) => proposal.status === 'pending' && json(proposal.series).toLowerCase().includes(low)).map((p) => ({ id: p.id, reason: p.reason, baseRevision: p.baseRevision, sourceRevision: p.sourceRevision })).slice(0, 4);
}
function materialMeta(root, ref) {
  try {
    const target = path.join(root, ref); const rootReal = realpathSync(root); const real = realpathSync(target); const rel = path.relative(rootReal, real); const stat = statSync(real);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !stat.isFile()) return { path: ref, unavailable: true };
    const meta = { path: ref, bytes: stat.size, extension: path.extname(real).toLowerCase() };
    if (['.md', '.txt', '.yml', '.yaml', '.json', '.html', '.htm'].includes(meta.extension) && stat.size <= 128 * 1024) meta.preview = clipped('Materialvorschau', readFileSync(real, 'utf8'), 1800);
    return meta;
  } catch { return { path: ref, unavailable: true }; }
}
function describeFocus(root, focus, state) {
  if (!focus) return null;
  const { moments, product, board, decisions, status } = state;
  const byMoment = new Map(moments.map((m) => [m.id, m]));
  const relations = productRelations(product);
  const common = { kind: focus.kind, id: focus.id, sourceRevision: state.sourceRevision, productRevision: product?.revision ?? null };
  if (focus.kind === 'moment') {
    const moment = byMoment.get(focus.id); if (!moment) throw new Error('Lernmoment existiert nicht mehr');
    const uses = relations.filter(({ phase }) => phase.momentIds.includes(focus.id)).map(({ lesson, phase }) => ({ lesson: { id: lesson.id, title: lesson.title }, phase }));
    const materialRefs = [...new Set([...(moment.materials || []), ...uses.flatMap((u) => u.phase.materials || [])])];
    const questionNeedles = [focus.id, moment.title];
    return { ...common, primary: { ...moment, contentHash: digest(moment) }, usedInTeachingProduct: uses, relevantMaterials: materialRefs.map((ref) => materialMeta(root, ref)), relatedQuestions: [...(moment.open_questions || []), ...relevantByNeedle(board, questionNeedles)], relevantDecisions: relevantByNeedle(decisions, questionNeedles).map(decisionText).filter(Boolean) };
  }
  if (focus.kind === 'phase') {
    const hit = relations.find(({ phase }) => phase.id === focus.id); if (!hit) throw new Error('Verlaufsphase existiert nicht mehr');
    const momentsUsed = hit.phase.momentIds.map((id) => byMoment.get(id)).filter(Boolean);
    const lessonStatus = status?.lessons?.find((l) => l.id === hit.lesson.id) || null;
    return { ...common, primary: hit.phase, lesson: { id: hit.lesson.id, title: hit.lesson.title, intention: hit.lesson.intention, durationMinutes: hit.lesson.durationMinutes }, referencedMoments: momentsUsed.map((m) => ({ ...m, contentHash: digest(m) })), relevantMaterials: (hit.phase.materials || []).map((ref) => materialMeta(root, ref)), openQuestions: hit.phase.openQuestions || [], lessonStatus, pendingProposals: pendingFor(product, hit.phase.id), relevantDecisions: relevantByNeedle(decisions, [hit.phase.id, hit.phase.title, hit.lesson.id, hit.lesson.title]).map(decisionText).filter(Boolean) };
  }
  if (focus.kind === 'lesson') {
    const lesson = product?.series?.lessons?.find((l) => l.id === focus.id); if (!lesson) throw new Error('Unterrichtsstunde existiert nicht mehr');
    return { ...common, primary: lesson, lessonStatus: status?.lessons?.find((l) => l.id === lesson.id) || null, pendingProposals: pendingFor(product, lesson.id), relevantDecisions: relevantByNeedle(decisions, [lesson.id, lesson.title]).map(decisionText).filter(Boolean) };
  }
  if (focus.kind === 'material') {
    const momentHits = moments.filter((m) => (m.materials || []).includes(focus.id));
    const phaseHits = relations.filter(({ phase }) => (phase.materials || []).includes(focus.id)).map(({ lesson, phase }) => ({ lesson: { id: lesson.id, title: lesson.title }, phase: { id: phase.id, title: phase.title, momentIds: phase.momentIds } }));
    return { ...common, primary: materialMeta(root, focus.id), referencedByMoments: momentHits.map((m) => ({ id: m.id, title: m.title, function: m.function })), referencedByPhases: phaseHits, relatedQuestions: relevantByNeedle(board, [focus.id, path.basename(focus.id)]), relevantDecisions: relevantByNeedle(decisions, [focus.id, path.basename(focus.id)]).map(decisionText).filter(Boolean) };
  }
  if (focus.kind === 'question') {
    const question = board.find((q) => q.id === focus.id); if (!question) throw new Error('Offene Frage existiert nicht mehr');
    const needles = [focus.id, question.title, question.question];
    return { ...common, primary: question, relatedMoments: relevantByNeedle(moments, needles).map((m) => ({ id: m.id, title: m.title, function: m.function })), relatedTeachingProduct: relations.filter(({ phase }) => relevantByNeedle([phase], needles, 1).length).map(({ lesson, phase }) => ({ lesson: { id: lesson.id, title: lesson.title }, phase: { id: phase.id, title: phase.title } })).slice(0, 6), relevantDecisions: relevantByNeedle(decisions, needles).map(decisionText).filter(Boolean) };
  }
  return common;
}
function overview(root, state, ld) {
  const boardCounts = state.board.reduce((acc, item) => { const key = item.status || item.kind || 'offen'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const lessonStatus = (state.status?.lessons || []).map((l) => ({ id: l.id, title: l.title, stage: l.stage, gapCount: l.gaps.length, teacherReady: l.teacherReadiness?.ready ?? null }));
  const sources = Object.fromEntries(Object.entries(state.sources).map(([name, raw]) => [name, raw ? digest(raw) : null]));
  return {
    denkraum: path.basename(root),
    learningDesign: ld ? { heading: firstLineStartsWith(ld, '# '), status: firstLineStartsWith(ld, 'Status:'), currentFocus: firstLineStartsWith(ld, 'Current focus:'), openQuestions: extractSection(ld, 'Open Questions').slice(0, 4) } : null,
    sourceRevision: state.sourceRevision,
    sourceHashes: sources,
    landscape: { moments: state.moments.length },
    planningBoard: { items: state.board.length, byStatus: boardCounts },
    decisions: state.decisions.slice(-5).map(decisionText).filter(Boolean),
    teachingProduct: state.product ? { revision: state.product.revision, title: state.product.series.title, lessons: lessonStatus, pendingProposals: state.status.pending || [], nextStep: state.status.nextStep } : { migrationRequired: true, nextStep: state.status?.nextStep },
    temporalPlan: state.product ? 'legacy migration source only; Teaching Product is canonical for teaching sequence' : 'legacy migration input until Teaching Product exists',
  };
}

export function buildSnapshot(root, sessionId = '') {
  const sources = Object.fromEntries(['learning-design.md', 'learning-landscape.md', 'planning-board.yml', 'temporal-plan.yml', 'decisions.yml'].map((f) => [f, safeFile(root, f)]));
  const ld = sources['learning-design.md'];
  const moments = parseLandscape(sources['learning-landscape.md']).moments;
  const board = parseBoard(sources['planning-board.yml']);
  const decisions = parseDecisionObjects(sources['decisions.yml']);
  const materials = [...relFiles(root, 'materials'), ...relFiles(root, 'rendered')];
  let product = null; const rawProduct = safeFile(root, PRODUCT_FILE); if (rawProduct) product = validateProduct(JSON.parse(rawProduct));
  const sourceRevision = digest(Object.fromEntries(Object.entries(sources).filter(([name]) => name !== 'decisions.yml')));
  const status = projectStatus(product, { moments, sourceRevision }, materials);
  const state = { sources, moments, board, decisions, materials, product, sourceRevision, status };
  const parts = [];

  let binding = null; try { binding = findConversationBindingBySessionSync(root, sessionId); } catch (e) { parts.push(`Conversation Binding nicht lesbar: ${e.message}`); }
  const transient = getFocus(sessionId, root);
  const primary = binding ? { kind: binding.kind, id: binding.id, returnView: 'chat' } : transient;
  if (primary) {
    try { parts.push(`PRIMARY FOCUS (${binding ? 'persistente Conversation Binding' : 'temporärer Focus Context'}):\n${clipped('Primary Focus', describeFocus(root, primary, state), CONTEXT_BUDGETS.primaryFocus)}`); }
    catch (e) { parts.push(`PRIMARY FOCUS nicht mehr gültig: ${e.message}`); }
  }
  if (binding && transient && (binding.kind !== transient.kind || binding.id !== transient.id)) {
    try { parts.push(`SECONDARY FOCUS (nur aktueller UI-/Turn-Kontext):\n${clipped('Secondary Focus', describeFocus(root, transient, state), CONTEXT_BUDGETS.secondaryFocus)}`); }
    catch (e) { parts.push(`SECONDARY FOCUS nicht mehr gültig: ${e.message}`); }
  }

  parts.push(`WORKSPACE OVERVIEW (immer aktuell, keine zweite Wahrheit):\n${clipped('Workspace Overview', overview(root, state, ld), CONTEXT_BUDGETS.overview)}`);
  const fragments = [];
  for (const dir of FRAGMENT_DIRS) { const files = relFiles(root, dir); if (files.length) fragments.push(`${dir}/: ${files.slice(0, FRAGMENT_CAP).join(', ')}${files.length > FRAGMENT_CAP ? ` (+${files.length - FRAGMENT_CAP})` : ''}`); }
  if (fragments.length) parts.push(`FRAGMENTS (Dateinamen, Inhalte nur gezielt lesen):\n${clipped('Fragments', fragments.join('\n'), CONTEXT_BUDGETS.fragments)}`);
  parts.push('Arbeitsregel: Teaching Product ist kanonisch für Stunden/Phasen; Lernmomente bleiben Thinking Model. Änderungen nur über pts_edit/Domain-Routen. Produktfreigaben brauchen eine erkennbare Lehrkraftentscheidung. Conversation-History kommt ausschließlich aus DSH; dieser Snapshot liefert den aktuellen gemeinsamen Workspace-Stand.');
  return clipped('Gesamter Workspace-Kontext', parts.join('\n\n'), CONTEXT_BUDGETS.total);
}

function install(agent) {
  const root = agent?.session?.header?.cwd;
  if (typeof root !== 'string' || !root.trim()) return () => {};
  const ctx = agent.ctx; if (typeof ctx.systemPrompt?.section !== 'function') return () => {};
  let disposed = false; let disposeSection = () => {};
  try {
    disposeSection = ctx.systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: () => {
      if (disposed) return '';
      try { return `## Aktueller Denkstand (automatische Context Projection)\nPrioritäten: ${CONTEXT_PRIORITIES.join(' > ')}\n${buildSnapshot(root.trim(), agent.session.id || agent.session.header.id || '')}`; }
      catch (error) { return `## Aktueller Denkstand\n(nicht lesbar: ${String(error?.message || error)})`; }
    } });
  } catch (error) { console.error(`[pts-workspace-snapshot] Prompt-Sektion für ${root} nicht registrierbar:`, error); }
  return () => { disposed = true; clearFocus(agent.session.id || agent.session.header.id || '', root); try { disposeSection(); } catch {} };
}

export function apply(ctx) {
  if (ctx.agent !== undefined) { if (isSubagent(ctx.agent)) return undefined; return install(ctx.agent); }
  const installed = new WeakMap();
  const reconcile = (agent) => {
    const shouldInstall = !isSubagent(agent) && composedPreset(ctx, agent) === 'pts-companion'; const current = installed.get(agent);
    if (shouldInstall && current === undefined) installed.set(agent, install(agent));
    if (!shouldInstall && current !== undefined) { current(); installed.delete(agent); }
  };
  for (const agent of ctx.agents.list()) reconcile(agent);
  ctx.on('agent/created', ({ agent }) => reconcile(agent));
  ctx.on('agent/disposed', ({ agent }) => { const dispose = installed.get(agent); if (dispose !== undefined) dispose(); installed.delete(agent); });
  return undefined;
}
