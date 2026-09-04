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

test('preset exposes six native role-bound DSH subagents', async () => {
  const preset = await read('dsh-presets/pts-companion/agent.cordis.yml');
  assert.match(preset, /@deepseek-ai\/dsh-tool-jobs/);
  for (const tool of ['pts_research', 'pts_edit', 'pts_document', 'pts_material', 'pts_review', 'pts_renderer']) {
    assert.match(preset, new RegExp('toolName: ' + tool));
  }
  assert.match(preset, /toolName: pts_research[\s\S]*allow: \[read, glob, grep, web_search, write, edit, skill\]/);
  assert.match(preset, /toolName: pts_material[\s\S]*allow: \[read, glob, grep, write, edit, skill\]/);
  assert.match(preset, /toolName: pts_edit[\s\S]*allow: \[read, glob, grep, write, edit\]/);
  assert.match(preset, /toolName: pts_document[\s\S]*allow: \[read, glob, grep, write, edit\]/);
  assert.match(preset, /toolName: pts_review[\s\S]*allow: \[read, glob, grep\]/);
  assert.match(preset, /backgroundMode: one-shot/);
  assert.match(preset, /pts-companion-tool-boundary/);
  // DSH skill stack is mounted by the preset (web profile disables the host rows).
  assert.match(preset, /name: '@deepseek-ai\/dsh-skill-filesystem'/);
  assert.match(preset, /name: '@deepseek-ai\/dsh-tool-skill'/);
  assert.match(preset, /pts-worker-skill-scope/);
  assert.match(preset, /@PTS_SKILLS_DIR@/);
  assert.match(preset, /@PTS_SETTINGS_PATH@/);
  assert.match(preset, /includeDefaultRoots: false/);
});

test('prototype launch requires the canonical installed worker preset', async () => {
  const installer = await read('scripts/install-pts-preset.ps1');
  const launcher = await read('scripts/start-pts-web.ps1');
  for (const marker of ['@deepseek-ai/dsh-tool-jobs', 'pts_research', 'pts_edit', 'pts_document', 'pts_material', 'pts_review', 'pts_renderer', 'pts-companion-tool-boundary', 'pts-worker-skill-scope', 'pts-skill-manager']) {
    assert.match(installer, new RegExp(marker.replace('/', '\\/')));
    assert.match(launcher, new RegExp(marker.replace('/', '\\/')));
  }
  // DSH does not index linked preset folders, so the preset must be a real copy.
  assert.match(installer, /Copy-Item[\s\S]*-Recurse/);
  assert.doesNotMatch(installer, /New-Item -ItemType Junction/);
  assert.match(installer, /Move-Item[\s\S]*backup/);
});

test('PTS workspace sessions pin the companion preset instead of inheriting a default', async () => {
  const client = await read('dsh-plugins/pts-workspaces/lib/client.js');
  assert.match(client, /sessions\.create\(\{\s*workspaceId,\s*agentPreset:\s*["']pts-companion["']\s*\}\)/);
  assert.doesNotMatch(client, /startSession:\s*\(id\)\s*=>\s*workspaces\.startSession\(id\)/);
});

test('PTS workspace sidebar preserves native session actions after its scoped-tree takeover', async () => {
  const client = await read('dsh-plugins/pts-workspaces/lib/client.js');
  for (const label of ['Umbenennen', 'Sitzung verzweigen', 'Sitzung archivieren']) {
    assert.match(client, new RegExp(label));
  }
  assert.match(client, /session\.rename\(title\)/);
  assert.match(client, /sessions\.fork\(\{ sessionId, increaseTitle: true \}\)/);
  assert.match(client, /workspaces\.archiveSession\(sessionId\)/);
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
