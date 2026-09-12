// Contract tests for the PTS instance composition. Text-based on purpose: no
// YAML dependency is added to this repository. They guard the invariants that
// the previous preset violated (dsh-persona `text` instead of `prefix`,
// `maxDepth: 0` for a worker role) and the plane rules of the composition.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
/** Composition text without comment lines, so prose never satisfies an assertion. */
const active = (text) => text
	.split(/\r?\n/)
	.filter((line) => !line.trimStart().startsWith('#') && !line.trimStart().startsWith('//'))
	.join('\n');

const COMPOSITION = 'dsh/presets/pts-companion/agent.cordis.yml';
const PATCH = 'dsh/profiles/pts/cordis.patch.yml';

const ROLES = [
	'pts_research',
	'pts_edit',
	'pts_document',
	'pts_documentarian',
	'pts_material',
	'pts_review',
	'pts_renderer',
];

const ALLOW_LISTS = {
	pts_research: 'allow: [read, glob, grep, web_search, web_fetch, write, edit, skill]',
	pts_edit: 'allow: [read, glob, grep, write, edit]',
	pts_document: 'allow: [read, glob, grep, write, edit]',
	pts_documentarian: 'allow: [read, glob, grep, write, edit]',
	pts_material: 'allow: [read, glob, grep, write, edit, skill]',
	pts_review: 'allow: [read, glob, grep]',
	pts_renderer: 'allow: [read, glob, grep, write, edit]',
};

test('Persona nutzt das aktuelle dsh-persona-Feld prefix', () => {
	const text = read(COMPOSITION);
	const personaRow = text.slice(text.indexOf("- id: persona"));
	assert.match(personaRow, /prefix: !!js/, 'prefix fehlt');
	assert.ok(!/^\s*text:/m.test(personaRow), 'veraltetes text-Feld vorhanden');
	assert.match(personaRow, /prompt\/persona\.md/);
});

test('alle sieben PTS-Rollen sind als eigene Subagent-Tools konfiguriert', () => {
	const text = read(COMPOSITION);
	for (const role of ROLES) assert.match(text, new RegExp(`toolName: ${role}\\b`), `${role} fehlt`);
	for (const allow of Object.values(ALLOW_LISTS)) assert.ok(text.includes(allow), `toolFilter fehlt: ${allow}`);
});

test('jede Rolle hat maxDepth 1 und nie 0', () => {
	const text = active(read(COMPOSITION));
	const depths = [...text.matchAll(/maxDepth:\s*(\d+)/g)].map((match) => match[1]);
	assert.equal(depths.length, ROLES.length, 'maxDepth je Rolle erwartet');
	assert.deepEqual([...new Set(depths)], ['1'], 'nur maxDepth 1 ist startbar');
	assert.ok(!/maxDepth:\s*0/.test(text));
});

test('sechs Rollen sind continuable, pts_edit ist ein one-shot', () => {
	const text = active(read(COMPOSITION));
	const modes = [...text.matchAll(/backgroundMode:\s*(\S+)/g)].map((match) => match[1]);
	assert.equal(modes.length, ROLES.length);
	assert.equal(modes.filter((mode) => mode === 'continuable').length, 6);
	assert.equal(modes.filter((mode) => mode === 'one-shot').length, 1);
	const editBlock = text.slice(text.indexOf('toolName: pts_edit'), text.indexOf('toolName: pts_edit') + 400);
	assert.match(editBlock, /backgroundMode: one-shot/, 'pts_edit muss one-shot bleiben');
});

test('die Komposition publiziert keinen Service ausserhalb des Compaction-Realms', () => {
	const text = read(COMPOSITION);
	assert.equal([...text.matchAll(/^\s*isolate:/gm)].length, 1, 'genau ein isolate-Realm (Compaction)');
	assert.ok(!/^\s*provide:/m.test(text), 'kein provide in einer Preset-Zeile');
	assert.ok(!/isolate:\s*true/.test(text));
});

test('Werkzeug-Zeilen fuer Web, Schreiben und Skills sind vorhanden (Worker erben sie)', () => {
	const text = read(COMPOSITION);
	for (const row of ['dsh-tool-fs', 'dsh-tool-web', 'dsh-tool-skill', 'dsh-skill-filesystem', 'dsh-tool-subagent-control']) {
		assert.ok(text.includes(row), `${row} fehlt`);
	}
});

test('die Autoritaetsgrenze entfernt web/write/skill aus der sichtbaren Toolmenge', () => {
	const text = read(COMPOSITION);
	assert.match(text, /companion-tool-boundary/);
	const module = read('dsh/presets/pts-companion/companion-tool-boundary.mjs');
	for (const hidden of ['skill', 'web_search', 'web_fetch', 'write', 'edit']) {
		assert.ok(new RegExp(`'${hidden}'`).test(module), `${hidden} nicht verborgen`);
	}
	assert.match(module, /tools\.restrict/);
	assert.match(module, /tools\.guard/);
	assert.match(module, /origin === 'subagent'/, 'Subagents muessen ausgenommen sein');
});

test('Preset-Id und Verzeichnisname stimmen ueberein', () => {
	const preset = read('dsh/presets/pts-companion/preset.yml');
	assert.match(preset, /^name: PTS Companion$/m);
	assert.match(preset, /^description: >-$/m);
	const context = read('dsh/presets/pts-companion/pts-context.mjs');
	assert.match(context, /export const PRESET_ID = 'pts-companion'/);
});

test('das Profil benennt Roster-Default, Sandbox und Capabilities', () => {
	const patch = read(PATCH);
	assert.match(patch, /default: pts-companion/);
	assert.ok(
		!/^\s*roots:/m.test(active(patch)),
		'keine Preset-Roots: der Roster-Root ist der gerenderte Home-Ordner',
	);
	assert.match(patch, /name: '@PTS_ROOT@\/plugins\/pts-demo-capability\/lib\/index\.js'/);
	assert.match(patch, /dsh-whiteboard/);
	// The sandbox root is the instance data area, never the repository: a
	// worker's write must reach its Denkraum and no part of the definition.
	assert.match(patch, /workspaceRoot: '@PTS_DATA_ROOT@\/denkraeume'/);
	assert.ok(!/@PTS_ROOT@\/workspace/.test(patch), 'das Repo ist kein Session-Wurzelverzeichnis');
});

test('Repo und Instanzdaten sind getrennt, beide Wurzeln sind Platzhalter', () => {
	const preset = read('dsh/presets/pts-companion/agent.cordis.yml');
	assert.match(
		preset,
		/customSkillDirs: \['@PTS_ROOT@\/skills', '@PTS_DATA_ROOT@\/skills'\]/,
		'Startskills aus dem Repo, gewachsene Skills aus der Instanz',
	);
	const script = active(read('scripts/install-pts-instance.ps1'));
	for (const key of ["'repoRoot'", "'dataRoot'"]) {
		assert.ok(
			script.includes(`Get-PtsSettingValue $settingsPath ${key}`),
			`Installer muss die Einstellung pts.${key} lesen`,
		);
	}
	assert.match(script, /@PTS_DATA_ROOT@/, 'Installer muss die Datenwurzel ersetzen');
	assert.match(script, /denkraeume/, 'Installer muss die Datenverzeichnisse anlegen');
	const start = active(read('scripts/start-pts.ps1'));
	assert.match(start, /Join-Path \$DataRoot 'denkraeume'/, 'start-pts muss im Denkraum-Root starten');
	assert.ok(!/Join-Path \$repo 'workspace'/.test(start), 'der Repo-Workspace ist kein Startort mehr');
});

test('das Installationsskript rendert das Preset in den Home', () => {
	const script = read('scripts/install-pts-instance.ps1');
	assert.match(script, /dsh\/presets/);
	assert.match(script, /\.agent-presets/);
	assert.match(script, /Get-NetTCPConnection/, 'laufende Instanz muss erkannt werden');
});

test('Skripte loesen das Skriptverzeichnis im Body auf, nicht im param-Default', () => {
	// `powershell -File` wertet einen param-Default aus, bevor $PSScriptRoot
	// gesetzt ist; `Split-Path -Parent $PSScriptRoot` bricht dort ab.
	for (const script of ['install-pts-instance.ps1', 'start-pts.ps1']) {
		const text = active(read(`scripts/${script}`));
		assert.ok(!/Split-Path -Parent \$PSScriptRoot/.test(text), `${script}: PSScriptRoot im param-Default ist leer`);
		assert.match(text, /IsNullOrWhiteSpace\(\$RepoRoot\)/, `${script}: Body muss -RepoRoot aufloesen`);
		assert.match(text, /\$PSCommandPath/, `${script}: Rueckfall auf $PSCommandPath fehlt`);
	}
});

test('der Repopfad ist eine Einstellung, die der Installer respektiert', () => {
	const script = active(read('scripts/install-pts-instance.ps1'));
	assert.match(script, /Get-PtsSettingValue/, 'Installer muss settings.yaml lesen');
	assert.match(script, /Test-PtsRepo/, 'die Einstellung muss validiert werden');
	assert.match(script, /PSBoundParameters\.ContainsKey\('RepoRoot'\)/, 'expliziter Parameter gewinnt');
	assert.match(script, /pts\.repoRoot = /, 'Installer muss den Eintrag schreiben');
	const start = active(read('scripts/start-pts.ps1'));
	assert.ok(!/-RepoRoot \$repo/.test(start), 'start-pts darf den Repopfad nicht erzwingen');
});

test('preset-lokale Module halten den Standing-Mount-Vertrag ein', () => {
	for (const module of ['pts-context.mjs', 'companion-tool-boundary.mjs']) {
		const text = active(read(`dsh/presets/pts-companion/${module}`));
		assert.ok(
			!/ctx\.agent(?!s)/.test(text),
			`${module} liest ctx.agent; im Standing-Mount verboten (Mount schlaegt fehl)`,
		);
		assert.match(text, /export const inject = \['agents'\]/, `${module} braucht nur den Agent-Registry-Seam`);
		assert.match(text, /ctx\.on\('agent\/created'/, `${module} muss Agenten ueber den Registry-Seam anbinden`);
	}
});

test('Repo-Pfade im Preset laufen ueber @PTS_ROOT@, nicht ueber baseUrl', () => {
	// Das Preset wird in den DSH-Home gerendert; `new URL('../../', baseUrl)`
	// zeigt dort auf den Home, nicht aufs Repo (Fund vom 2026-09-11: die
	// Referenzwurzel im Companion-Kontext war F:\dsh-instances\pts\.dsh).
	const text = active(read('dsh/presets/pts-companion/agent.cordis.yml'));
	assert.ok(!/new URL\('\.\.\//.test(text), 'kein Aufstieg aus dem Preset-Verzeichnis');
	assert.match(text, /repoRoot: '@PTS_ROOT@'/, 'Referenzwurzel als Platzhalter');
	assert.match(
		text,
		/customSkillDirs: \['@PTS_ROOT@\/skills', '@PTS_DATA_ROOT@\/skills'\]/,
		'Skills ueber beide Platzhalter',
	);
	const script = active(read('scripts/install-pts-instance.ps1'));
	assert.match(script, /-replace '@PTS_ROOT@', \$rootForYaml/, 'Installer muss auch Presets ersetzen');
	assert.match(script, /repoRoot\|customSkillDirs/, 'Installer muss Wertzeilen pruefen');
});

test('das Kontextmodul versorgt auch die sieben Rollen, aber ohne Methodik', () => {
	const text = active(read('dsh/presets/pts-companion/pts-context.mjs'));
	assert.match(text, /export function renderWorkerContext/, 'Arbeitsumgebungs-Kontext fehlt');
	assert.match(text, /WORKER_CONTEXT_NAME/, 'eigener Kontextname fuer Rollen fehlt');
	assert.match(text, /install\(agent, framework, repoRoot, isSubagent\(agent\)\)/, 'Rollen muessen den Kontext erhalten');
	assert.ok(
		!/shouldInstall = !isSubagent/.test(text),
		'Rollen duerfen nicht mehr vom Kontext ausgeschlossen werden (Pfadraten und Glob-Timeouts)',
	);
});

test('die Demo-Capability ist ausgeliefert-aber-inaktiv und registriert genau ein Tool', () => {
	const patch = read(PATCH);
	const demoBlock = patch.slice(patch.indexOf('pts-demo-capability'));
	assert.match(demoBlock, /disabled: true/, 'Demo-Row muss per Default aus sein');
	const plugin = read('plugins/pts-demo-capability/lib/index.js');
	assert.match(plugin, /export const TOOL_NAME = 'demo_capability'/);
	assert.match(plugin, /ctx\.effect\(\(\) => ctx\.tools\.register/);
	assert.ok(!/import .*@deepseek-ai/.test(plugin), 'Capability darf keine Harness-Interna importieren');
});

test('Profil-Bundles bleiben dsh-base plus dsh-web-app', () => {
	const manifest = JSON.parse(read('dsh/profiles/pts/package.json'));
	assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
	assert.equal(manifest.dsh.profile.patchReload, 'live');
});

test('preset-lokale Module importieren keine Harness-Pakete', () => {
	for (const module of ['pts-context.mjs', 'companion-tool-boundary.mjs']) {
		const text = read(`dsh/presets/pts-companion/${module}`);
		assert.ok(!/from '@deepseek-ai/.test(text), `${module} importiert Harness-Pakete`);
	}
});
