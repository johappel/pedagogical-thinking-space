// Transient selection only. Symbol shares the host/preset module copies inside
// the same DSH process; no second session, persisted history or workspace.
import path from 'node:path';
import { readThinking, readProduct, workspaceRoot, materialPath } from './teaching-product.mjs';
import { parseYaml } from './workspace-parsers.mjs';
import { promises as fs } from 'node:fs';
const key = Symbol.for('pts.focus-context/v1');
const selections = globalThis[key] ??= new Map();
const identity = (sessionId, root) => `${path.resolve(root).toLowerCase()}\n${sessionId}`;
export function getFocus(sessionId, root) {
  const entry = selections.get(identity(sessionId, root));
  if (!entry || Date.now() - entry.touched > 12 * 60 * 60 * 1000) { selections.delete(identity(sessionId, root)); return null; }
  return { ...entry.focus };
}
export function clearFocus(sessionId, root) { selections.delete(identity(sessionId, root)); }
export function resolveFocus(focus, { moments, product, questions = [], materials = [] }) {
  if (!focus) return null;
  let subject;
  if (focus.kind === 'moment') subject = moments.find((m) => m.id === focus.id);
  if (focus.kind === 'lesson') subject = product?.series.lessons.find((l) => l.id === focus.id);
  if (focus.kind === 'phase') subject = product?.series.lessons.flatMap((l) => l.phases).find((p) => p.id === focus.id);
  if (focus.kind === 'question') subject = questions.find((q) => q.id === focus.id);
  if (focus.kind === 'material' && materials.includes(focus.id)) subject = { id: focus.id, title: focus.id };
  if (!subject) throw new Error('Focus subject no longer exists; clear or choose again');
  return { ...focus, subject };
}
export async function focusContext(sessionId, candidate, next = undefined) {
  const root = await workspaceRoot(candidate);
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('session required');
  if (next === null) { clearFocus(sessionId, root); return null; }
  const focus = next === undefined ? getFocus(sessionId, root) : next;
  if (!focus) return null;
  if (!['moment', 'lesson', 'phase', 'material', 'question'].includes(focus.kind) || typeof focus.id !== 'string' || focus.id.length > 500 || !['chat', 'landscape', 'teaching-product', 'product-status', 'denkstand'].includes(focus.returnView)) throw new Error('invalid Focus Context');
  const thinking = await readThinking(root);
  const product = await readProduct(root);
  const questions = parseYaml(thinking.sources['planning-board.yml']).items || [];
  const materials = [];
  if (focus.kind === 'material') {
    materialPath(focus.id);
    const real = await fs.realpath(path.join(root, focus.id));
    const rel = path.relative(root, real);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !(await fs.stat(real)).isFile()) throw new Error('material escapes workspace');
    materials.push(focus.id);
  }
  const resolved = resolveFocus(focus, { ...thinking, product, questions, materials });
  selections.set(identity(sessionId, root), { touched: Date.now(), focus: { kind: focus.kind, id: focus.id, returnView: focus.returnView } });
  return resolved;
}
