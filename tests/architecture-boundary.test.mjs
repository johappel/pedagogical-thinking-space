import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const exists = (relative) => access(path.join(root, relative)).then(() => true, () => false);
const read = (relative) => readFile(path.join(root, relative), 'utf8');

const forbidden = [
  'AGENTS_MINIMAL.md',
  'capabilities/registry.yml',
  'harness/dispatcher.py',
  'dsh-plugins/pts-background-steward/lib/service-coordinator.js',
  'dsh-plugins/pts-background-steward/lib/research-job.js',
  'dsh-plugins/pts-background-steward/lib/capability-lifecycle.js',
  'dsh-plugins/pts-background-steward/lib/capability-builder.js',
];

test('competing runtime layers are absent', async () => {
  for (const relative of forbidden) {
    assert.equal(await exists(relative), false, relative);
  }
});

test('preset exposes four native role-bound DSH subagents', async () => {
  const preset = await read('dsh-presets/pts-companion/agent.cordis.yml');
  assert.match(preset, /@deepseek-ai\/dsh-tool-jobs/);
  for (const tool of ['pts_research', 'pts_material', 'pts_review', 'pts_renderer']) {
    assert.match(preset, new RegExp('toolName: ' + tool));
  }
  assert.match(preset, /toolName: pts_research[\s\S]*allow: \[read, glob, grep, web_search, web_fetch, write, edit\]/);
  assert.match(preset, /toolName: pts_material[\s\S]*allow: \[read, glob, grep, write, edit\]/);
  assert.match(preset, /toolName: pts_review[\s\S]*allow: \[read, glob, grep\]/);
  assert.match(preset, /backgroundMode: one-shot/);
  assert.match(preset, /pts-companion-tool-boundary/);
});

test('prototype launch requires the canonical installed worker preset', async () => {
  const installer = await read('scripts/install-pts-preset.ps1');
  const launcher = await read('scripts/start-pts-web.ps1');
  for (const marker of ['@deepseek-ai/dsh-tool-jobs', 'pts_research', 'pts_material', 'pts_review', 'pts_renderer', 'pts-companion-tool-boundary']) {
    assert.match(installer, new RegExp(marker.replace('/', '\\/')));
    assert.match(launcher, new RegExp(marker.replace('/', '\\/')));
  }
  assert.match(installer, /ItemType Junction/);
  assert.match(installer, /Move-Item[\s\S]*backup/);
});

test('PTS workspace sessions pin the companion preset instead of inheriting a default', async () => {
  const client = await read('dsh-plugins/pts-workspaces/lib/client.js');
  assert.match(client, /sessions\.create\(\{\s*workspaceId,\s*agentPreset:\s*["']pts-companion["']\s*\}\)/);
  assert.doesNotMatch(client, /startSession:\s*\(id\)\s*=>\s*workspaces\.startSession\(id\)/);
});

test('steward code has no service dispatch seam', async () => {
  const index = await read('dsh-plugins/pts-background-steward/lib/index.js');
  const reflection = await read('dsh-plugins/pts-background-steward/lib/reflection-job.js');
  const validator = await read('dsh-plugins/pts-background-steward/lib/patch-validator.js');
  const all = [index, reflection, validator].join('\n');
  assert.doesNotMatch(all, /service-coordinator|research-job|capability-lifecycle|service_intents/);
  assert.match(index, /session\/event/);
  assert.match(reflection, /subagents\.start/);
});
