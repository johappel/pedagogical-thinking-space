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
  'dsh-plugins/pts-background-steward',
];

test('competing runtime layers are absent', async () => {
  for (const relative of forbidden) {
    assert.equal(await exists(relative), false, relative);
  }
});

test('preset exposes continuable specialists, the Documentarian and a legacy edit fallback', async () => {
  const preset = await read('dsh-presets/pts-companion/agent.cordis.yml');
  assert.match(preset, /@deepseek-ai\/dsh-tool-jobs/);
  for (const tool of ['pts_research', 'pts_document', 'pts_documentarian', 'pts_material', 'pts_review', 'pts_renderer']) {
    assert.match(preset, new RegExp('toolName: ' + tool));
    assert.match(preset, new RegExp('toolName: ' + tool + '[\\s\\S]*backgroundMode: continuable[\\s\\S]*enableRunInBackground: true'));
  }
  assert.match(preset, /toolName: pts_research[\s\S]*allow: \[read, glob, grep, web_search, write, edit, skill\]/);
  assert.match(preset, /toolName: pts_material[\s\S]*allow: \[read, glob, grep, write, edit, skill\]/);
  assert.match(preset, /toolName: pts_edit_legacy[\s\S]*backgroundMode: one-shot[\s\S]*allow: \[read, glob, grep, write, edit\]/);
  assert.match(preset, /toolName: pts_document[\s\S]*allow: \[read, glob, grep, write, edit\]/);
  assert.match(preset, /toolName: pts_documentarian[\s\S]*backgroundMode: continuable[\s\S]*enableRunInBackground: true[\s\S]*maxDepth: 0/);
  assert.match(preset, /toolName: pts_documentarian[\s\S]*allow: \[read, glob, grep, write, edit\]/);
  assert.doesNotMatch(preset, /toolName: pts_documentarian[\s\S]*web_search/);
  assert.match(preset, /toolName: pts_review[\s\S]*allow: \[read, glob, grep\]/);
  assert.match(preset, /name: '@deepseek-ai\/dsh-tool-subagent-control'/);
  assert.match(preset, /name: '@deepseek-ai\/dsh-tool-subagent-control\/list-agents'/);
  assert.match(preset, /name: '\.\/direct-pts-edit\.mjs'/);
  assert.match(await read('dsh-presets/pts-companion/direct-pts-edit.mjs'), /name: 'pts_edit'/);
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
  for (const marker of ['@deepseek-ai/dsh-tool-jobs', 'pts_research', 'pts_edit_legacy', 'pts_document', 'pts_documentarian', 'pts_material', 'pts_review', 'pts_renderer', 'dsh-tool-subagent-control', 'direct-pts-edit.mjs', 'pts-companion-tool-boundary', 'pts-worker-skill-scope', 'pts-skill-manager']) {
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

test('Documentarian is a bounded native worker, not a host scheduler', async () => {
  const preset = await read('dsh-presets/pts-companion/agent.cordis.yml');
  const service = await read('services/DOCUMENTARIAN.md');
  assert.match(preset, /toolName: pts_documentarian[\s\S]*maxDepth: 0/);
  assert.match(preset, /pts_documentarian[\s\S]*documentation gap/);
  assert.match(service, /normal `@deepseek-ai\/dsh-tool-subagent` instance/);
  assert.match(service, /If evidence is ambiguous/);
  assert.match(service, /start another worker/);
  assert.doesNotMatch(preset, /pts-background-steward/);
});

test('worker LLM routes render from settings at install/start time (no live dispatcher)', async () => {
  const installer = await read('scripts/install-pts-preset.ps1');
  const launcher = await read('scripts/start-pts-web.ps1');
  for (const script of [installer, launcher]) {
    assert.match(script, /render-worker-routes/);
    assert.match(script, /--agent-cordis/);
    assert.match(script, /--settings/);
  }
  const routesModule = await read('dsh-presets/pts-companion/worker-routes.mjs');
  assert.match(routesModule, /parseWorkerRoutesSection/);
  assert.match(routesModule, /renderWorkerRoutes/);
  assert.match(routesModule, /WORKER_ROUTES_DEFAULTS/);
});
