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

test('Documentarian is bounded workspace documentation only', async () => {
  const agents = await read('AGENTS.md');
  const documentarian = await read('services/DOCUMENTARIAN.md');
  assert.match(agents, /pts_documentarian/);
  assert.match(documentarian, /must not:[\s\S]*make or imply a pedagogical decision/);
  assert.match(documentarian, /research externally, start another worker or act as a dispatcher/);
  assert.match(documentarian, /If evidence is ambiguous/);
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
