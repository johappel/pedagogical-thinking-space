import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

test('kernel binds PTS to native DSH orchestration', async () => {
  const agents = await read('AGENTS.md');
  const architecture = await read('ARCHITECTURE.md');
  assert.match(agents, /DSH owns agents, tools, subagent execution/);
  assert.match(agents, /pts_research/);
  assert.match(agents, /pts_material/);
  assert.match(architecture, /not an alternative\s+harness/);
  assert.doesNotMatch(agents, /capabilities\/registry\.yml.*single routing/s);
});

test('direct bounded orders delegate without a second approval', async () => {
  const agents = await read('AGENTS.md');
  const orchestration = await read('ORCHESTRATION.md');
  assert.match(agents, /A direct bounded instruction is already authorization/);
  assert.match(agents, /Do not ask .*Soll ich anfangen/);
  assert.match(orchestration, /Do not ask for the\s+same permission twice/);
});

test('steward is post-turn state maintenance only', async () => {
  const agents = await read('AGENTS.md');
  const steward = await read('services/STEWARDSHIP.md');
  assert.match(agents, /After\s+a completed top-level turn/);
  assert.match(steward, /must not:[\s\S]*research or access the web/);
  assert.match(steward, /detect, route or start Worker tasks/);
  assert.match(steward, /without affecting the conversation or any Worker job/);
});

test('planning board carries no competing runtime lifecycle', async () => {
  const schema = await read('specs/PLANNING_BOARD_SCHEMA.md');
  assert.match(schema, /must not invent a competing task list/);
  assert.doesNotMatch(schema, /proposed -> authorized -> running/);
});

test('companion instruction budget remains bounded', async () => {
  const agents = await read('AGENTS.md');
  assert.ok(Buffer.byteLength(agents, 'utf8') <= 8192, 'AGENTS.md exceeds the prototype boot budget');
  assert.doesNotMatch(agents, /Repository Reading Order/);
});
