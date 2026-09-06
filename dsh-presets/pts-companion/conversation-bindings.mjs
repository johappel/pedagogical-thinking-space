import { promises as fs, readFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const CONVERSATION_BINDING_SCHEMA = 'ptspace.conversation-bindings/v1';
export const CONVERSATION_BINDING_DIR = '.pts';
export const CONVERSATION_BINDING_FILE = 'conversation-bindings.json';
const ALLOWED_KINDS = new Set(['moment', 'lesson', 'phase', 'material', 'question']);
const MAX_BYTES = 256 * 1024;
const locks = new Map();

function assertSubject(kind, id) {
  if (!ALLOWED_KINDS.has(kind)) throw new Error('invalid conversation subject kind');
  if (typeof id !== 'string' || id.trim() === '' || id.length > 500 || /[\r\n\0]/.test(id)) throw new Error('invalid conversation subject id');
  return { kind, id };
}
function empty() { return { schema: CONVERSATION_BINDING_SCHEMA, bindings: [] }; }
function validate(value) {
  if (!value || value.schema !== CONVERSATION_BINDING_SCHEMA || !Array.isArray(value.bindings)) throw new Error('unsupported conversation binding registry');
  const subjectKeys = new Set(); const sessionIds = new Set();
  for (const binding of value.bindings) {
    assertSubject(binding.kind, binding.id);
    if (typeof binding.sessionId !== 'string' || !binding.sessionId) throw new Error('invalid bound session');
    const key = `${binding.kind}:${binding.id}`;
    if (subjectKeys.has(key) || sessionIds.has(binding.sessionId)) throw new Error('duplicate conversation binding');
    subjectKeys.add(key); sessionIds.add(binding.sessionId);
  }
  return value;
}
function registryPath(root) { return path.join(root, CONVERSATION_BINDING_DIR, CONVERSATION_BINDING_FILE); }
export function readConversationBindingsSync(root) {
  const file = registryPath(root);
  if (!existsSync(file)) return empty();
  const rootReal = realpathSync(root); const fileReal = realpathSync(file); const rel = path.relative(rootReal, fileReal);
  if (rel.startsWith('..') || path.isAbsolute(rel) || statSync(fileReal).size > MAX_BYTES) throw new Error('unsafe conversation binding registry');
  return validate(JSON.parse(readFileSync(fileReal, 'utf8')));
}
export async function readConversationBindings(root) {
  try { return readConversationBindingsSync(root); }
  catch (error) { if (error?.code === 'ENOENT') return empty(); throw error; }
}
export function findConversationBindingSync(root, kind, id) {
  assertSubject(kind, id);
  return readConversationBindingsSync(root).bindings.find((b) => b.kind === kind && b.id === id) || null;
}
export function findConversationBindingBySessionSync(root, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  return readConversationBindingsSync(root).bindings.find((b) => b.sessionId === sessionId) || null;
}
async function atomicWrite(root, value) {
  const dir = path.join(root, CONVERSATION_BINDING_DIR);
  await fs.mkdir(dir, { recursive: true });
  const dirReal = await fs.realpath(dir); const rootReal = await fs.realpath(root); const rel = path.relative(rootReal, dirReal);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('conversation binding directory escapes workspace');
  const raw = JSON.stringify(validate(value), null, 2) + '\n';
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('conversation binding registry too large');
  const tmp = path.join(dirReal, `.conversation-bindings.${randomUUID()}.tmp`);
  try { await fs.writeFile(tmp, raw, { encoding: 'utf8', flag: 'wx' }); await fs.rename(tmp, path.join(dirReal, CONVERSATION_BINDING_FILE)); }
  finally { await fs.unlink(tmp).catch((e) => { if (e.code !== 'ENOENT') throw e; }); }
}
async function locked(root, fn) {
  const key = path.resolve(root).toLowerCase();
  const previous = locks.get(key) || Promise.resolve();
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => gate); locks.set(key, queued);
  await previous;
  try { return await fn(); }
  finally { release(); if (locks.get(key) === queued) locks.delete(key); }
}
export async function bindConversation(root, { kind, id, sessionId }) {
  assertSubject(kind, id);
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('bound session required');
  return locked(root, async () => {
    const registry = await readConversationBindings(root);
    const sameSubject = registry.bindings.find((b) => b.kind === kind && b.id === id);
    const sameSession = registry.bindings.find((b) => b.sessionId === sessionId);
    if (sameSubject && sameSubject.sessionId !== sessionId) throw new Error('conversation subject already bound');
    if (sameSession && (sameSession.kind !== kind || sameSession.id !== id)) throw new Error('session already bound to another subject');
    if (sameSubject) return sameSubject;
    const now = new Date().toISOString();
    const binding = { kind, id, sessionId, createdAt: now, updatedAt: now };
    registry.bindings.push(binding);
    await atomicWrite(root, registry);
    return binding;
  });
}
