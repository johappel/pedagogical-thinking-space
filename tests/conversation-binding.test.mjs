import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './support/product-fixture.mjs';
import { CONVERSATION_BINDING_FILE } from '../dsh-presets/pts-companion/conversation-bindings.mjs';

test('binding registry maps one object to one DSH session and rejects collisions', async (t) => {
  const f = await fixture(t);
  const empty = await f.request('/api/pts-conversation-binding');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.binding, null);
  const created = await f.request('/api/pts-conversation-binding', { kind: 'moment', id: 'lm-perspektive', boundSessionId: 'other-session' });
  assert.equal(created.status, 200);
  assert.equal(created.body.binding.sessionId, 'other-session');
  const reopened = await f.request('/api/pts-conversation-binding', null, 'test-session');
  assert.equal(reopened.body.binding, null);
  const lookup = await f.request('/api/pts-conversation-binding', null, 'test-session');
  assert.equal(lookup.status, 200);
  const byObject = await fetch(`${f.baseURL}/api/pts-conversation-binding?sessionId=test-session&kind=moment&id=lm-perspektive`).then(async (r) => ({ status: r.status, body: await r.json() }));
  assert.equal(byObject.body.binding.sessionId, 'other-session');
  const same = await f.request('/api/pts-conversation-binding', { kind: 'moment', id: 'lm-perspektive', boundSessionId: 'other-session' });
  assert.equal(same.status, 200);
  const collision = await f.request('/api/pts-conversation-binding', { kind: 'moment', id: 'lm-perspektive', boundSessionId: 'test-session' });
  assert.equal(collision.status, 409);
  const sessionCollision = await f.request('/api/pts-conversation-binding', { kind: 'phase', id: 'phase-1', boundSessionId: 'other-session' });
  assert.equal(sessionCollision.status, 409);
  const registry = JSON.parse(await readFile(path.join(f.root, '.pts', CONVERSATION_BINDING_FILE), 'utf8'));
  assert.deepEqual(registry.bindings.map(({ kind, id, sessionId }) => ({ kind, id, sessionId })), [{ kind: 'moment', id: 'lm-perspektive', sessionId: 'other-session' }]);
});

test('binding supports each generic subject kind without creating bindings prophylactically', async (t) => {
  const f = await fixture(t);
  const subjects = [['lesson', 'lesson-1', 'thread-lesson'], ['phase', 'phase-1', 'thread-phase'], ['material', 'materials/impuls.md', 'thread-material'], ['question', 'question-1', 'thread-question']];
  for (const [, , sessionId] of subjects) f.sessions.set(sessionId, { id: sessionId, header: { cwd: f.root } });
  for (const [kind, id, boundSessionId] of subjects) {
    const response = await f.request('/api/pts-conversation-binding', { kind, id, boundSessionId });
    assert.equal(response.status, 200);
  }
  const registry = JSON.parse(await readFile(path.join(f.root, '.pts', CONVERSATION_BINDING_FILE), 'utf8'));
  assert.equal(registry.bindings.length, 4);
});
