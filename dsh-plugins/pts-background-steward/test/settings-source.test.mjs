// Tests for pts-background-steward/lib/settings-source.js and the
// resolveModelConfig precedence helper in lib/config.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseStewardSettingsSection, readStewardModelSettings, parseProviderCatalog, buildStewardSection, writeStewardSettingsSection } from '../lib/settings-source.js';
import { resolveModelConfig, resolveResearchConfig, normalizeConfig } from '../lib/config.js';

const FULL = [
	'# Eigene Einstellungen des Profils',
	'agent-default-model:',
	'  provider: ollama',
	'  model: qwen3.8:27b',
	'  reasoningEffort: low',
	'',
	'pts-background-steward:',
	'  provider: lmstudio',
	'  model: ornith-1.5-9b-mtp',
	'  maxTokens: 8192',
	'  reasoningEffort: medium',
	'',
	'llm-pi-ai:',
	'  providers: {}',
].join('\n');

test('parseStewardSettingsSection: extrahiert nur die Steward-Sektion', () => {
	const out = parseStewardSettingsSection(FULL);
	assert.deepEqual(out, {
		provider: 'lmstudio',
		model: 'ornith-1.5-9b-mtp',
		maxTokens: 8192,
		reasoningEffort: 'medium',
	});
});

test('parseStewardSettingsSection: null ohne Sektion, auch bei nur agent-default-model', () => {
	assert.equal(parseStewardSettingsSection('agent-default-model:\n  model: x\n'), null);
	assert.equal(parseStewardSettingsSection(''), null);
	assert.equal(parseStewardSettingsSection(null), null);
});

test('parseStewardSettingsSection: Inline-Kommentare und Anführungszeichen werden bereinigt', () => {
	const out = parseStewardSettingsSection('pts-background-steward:\n  model: "ornith-1.5-9b-mtp" # kommentar\n');
	assert.equal(out.model, 'ornith-1.5-9b-mtp');
});

test('parseStewardSettingsSection: ungültige maxTokens und leere Werte werden übersprungen', () => {
	const out = parseStewardSettingsSection('pts-background-steward:\n  provider: openrouter\n  maxTokens: nope\n  reasoningEffort: low\n');
	assert.equal(out.maxTokens, undefined);
	assert.equal(out.provider, 'openrouter');
	assert.equal(out.reasoningEffort, 'low');
});

test('readStewardModelSettings liest aus documentPath; fehlt die Datei -> null', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-settings-test-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, FULL, 'utf8');
		const settings = { documentPath: doc };
		const out = await readStewardModelSettings(settings);
		assert.equal(out.model, 'ornith-1.5-9b-mtp');
		assert.equal(out.maxTokens, 8192);

		const missing = await readStewardModelSettings({ documentPath: path.join(dir, 'gibt-es-nicht.yaml') });
		assert.equal(missing, null);
		assert.equal(await readStewardModelSettings(undefined), null);
		assert.equal(await readStewardModelSettings({ documentPath: '' }), null);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('resolveModelConfig: Settings gewinnen vor Patch-Row; reasoningEffort wird geführt', () => {
	const patch = { provider: 'ollama', model: 'qwen3.8:27b', maxTokens: 4096, reasoningEffort: 'low' };
	const settings = { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 8192, reasoningEffort: 'high' };
	const out = resolveModelConfig(patch, settings);
	assert.equal(out.provider, 'openrouter');
	assert.equal(out.model, 'deepseek/deepseek-v4-flash');
	assert.equal(out.maxTokens, 8192);
	assert.equal(out.reasoningEffort, 'high');
	assert.equal(out.source, 'settings');

	// Fehlende Settings-Felder fallen auf die Patch-Row zurück.
	const partial = resolveModelConfig(patch, { provider: 'lmstudio' });
	assert.equal(partial.provider, 'lmstudio');
	assert.equal(partial.model, 'qwen3.8:27b');
	assert.equal(partial.maxTokens, 4096);
	assert.equal(partial.source, 'settings');

	// Null Settings = reine Patch-Row.
	const patchOnly = resolveModelConfig(patch, null);
	assert.equal(patchOnly.provider, 'ollama');
	assert.equal(patchOnly.source, 'patch-row');
});

const CATALOG = [
	'llm-pi-ai:',
	'  providers:',
	'    lmstudio:',
	'      displayName: LM Studio',
	'      models:',
	'        - id: qwen/qwen3.8-27b',
	'          name: qwen3.8-27b',
	'        - id: ornith-1.5-9b-mtp',
	'    openrouter:',
	'      apiKeyEnv: OPENROUTER_API_KEY',
	'      models:',
	'        - id: deepseek/deepseek-v4-flash',
	'          name: "DeepSeek: DeepSeek V4 Flash"',
	'          maxTokens: 4096',
	'    ollama:',
	'      displayName: Ollama',
	'      models:',
	'        - id: qwen3.8:27b',
	'          name: qwen3.8:27b',
].join('\n');

test('parseProviderCatalog: Provider + Modelle (id/name) mit Namen-Fallback', () => {
	const out = parseProviderCatalog(CATALOG);
	assert.equal(out.lmstudio.displayName, 'LM Studio');
	assert.deepEqual(out.lmstudio.models.map((m) => m.id), ['qwen/qwen3.8-27b', 'ornith-1.5-9b-mtp']);
	assert.equal(out.lmstudio.models[0].name, 'qwen3.8-27b');
	assert.equal(out.lmstudio.models[1].name, 'ornith-1.5-9b-mtp', 'fehlender name fällt auf id zurück');
	assert.equal(out.openrouter.models[0].name, 'DeepSeek: DeepSeek V4 Flash', 'name mit Anführungszeichen bereinigt');
	assert.equal(out.ollama.models[0].id, 'qwen3.8:27b', 'Doppelpunkt im Modell-id');
	assert.deepEqual(parseProviderCatalog(''), {});
	assert.deepEqual(parseProviderCatalog(null), {});
});

test('buildStewardSection: saubere, zitierte Scalar-Blöcke', () => {
	const text = buildStewardSection({ provider: 'lmstudio', model: 'ornith-1.5-9b-mtp', maxTokens: 8192, reasoningEffort: 'low' });
	assert.ok(text.startsWith('pts-background-steward:'));
	assert.ok(text.includes('  provider: "lmstudio"'));
	assert.ok(text.includes('  maxTokens: 8192'));
	const empty = buildStewardSection({ provider: '', model: '', maxTokens: 4096, reasoningEffort: '' });
	assert.ok(empty.includes('  provider: ""'));
	assert.ok(!empty.includes('reasoningEffort'));
});

test('writeStewardSettingsSection: ersetzt bestehende Sektion und erhält Rest', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-settings-write-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, FULL, 'utf8');
		await writeStewardSettingsSection(doc, { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', maxTokens: 8192, reasoningEffort: 'medium' });
		const after = await import('node:fs/promises').then((fs) => fs.readFile(doc, 'utf8'));
		// Andere Sektionen bleiben erhalten.
		assert.ok(after.includes('agent-default-model:'));
		assert.ok(after.includes('llm-pi-ai:'));
		// Neue Werte gelten.
		const parsed = parseStewardSettingsSection(after);
		assert.equal(parsed.provider, 'openrouter');
		assert.equal(parsed.model, 'deepseek/deepseek-v4-flash');
		assert.equal(parsed.reasoningEffort, 'medium');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('writeStewardSettingsSection: legt Sektion an, wenn keine existiert', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-settings-write-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, 'agent-default-model:\n  model: x\n', 'utf8');
		await writeStewardSettingsSection(doc, { provider: 'ollama', model: 'qwen3.8:27b', maxTokens: 4096, reasoningEffort: '' });
		const after = await import('node:fs/promises').then((fs) => fs.readFile(doc, 'utf8'));
		const parsed = parseStewardSettingsSection(after);
		assert.equal(parsed.provider, 'ollama');
		assert.equal(parsed.model, 'qwen3.8:27b');
		assert.equal(parsed.maxTokens, 4096);
		// Bestehende Sektion bleibt unberührt.
		assert.ok(after.includes('agent-default-model:'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

// ——— Recherche-Route (verschachtelter research:-Block) ———

const WITH_RESEARCH = [
	'pts-background-steward:',
	'  provider: lmstudio',
	'  model: ornith-1.5-9b-mtp',
	'  maxTokens: 8192',
	'  research:',
	'    provider: openrouter',
	'    model: perplexity/sonar',
	'    maxTokens: 4096',
	'',
	'llm-pi-ai:',
	'  providers: {}',
].join('\n');

test('parseStewardSettingsSection: liest verschachtelten research-Block', () => {
	const out = parseStewardSettingsSection(WITH_RESEARCH);
	assert.equal(out.provider, 'lmstudio');
	assert.equal(out.model, 'ornith-1.5-9b-mtp');
	assert.deepEqual(out.research, { provider: 'openrouter', model: 'perplexity/sonar', maxTokens: 4096 });
});

test('parseStewardSettingsSection: research-Kinder landen nicht in der Top-Ebene', () => {
	const out = parseStewardSettingsSection(WITH_RESEARCH);
	// Der Steward-Provider bleibt lmstudio, nicht openrouter aus research.
	assert.equal(out.provider, 'lmstudio');
	assert.equal(out.maxTokens, 8192);
});

test('buildStewardSection: emittiert research-Unterblock nur bei Werten', () => {
	const withR = buildStewardSection({ provider: 'lmstudio', model: 'm', research: { provider: 'openrouter', model: 'perplexity/sonar', maxTokens: 4096 } });
	assert.ok(withR.includes('  research:'));
	assert.ok(withR.includes('    provider: "openrouter"'));
	assert.ok(withR.includes('    maxTokens: 4096'));
	const withoutR = buildStewardSection({ provider: 'lmstudio', model: 'm' });
	assert.ok(!withoutR.includes('research:'));
});

test('buildStewardSection: leere research-Strings werden nicht emittiert', () => {
	// Wenn Nutzer "leer" für beide Picker auswählt, sendetet die UI: { provider: "", model: "", maxTokens: 8192 }
	// Die Funktion sollte keine research:-Sektion mit leeren Strings emittieren.
	const allEmpty = buildStewardSection({ provider: 'lmstudio', model: 'm', research: { provider: '', model: '', maxTokens: 0 } });
	assert.ok(!allEmpty.includes('research:'), 'keine research-Sektion, wenn alle Felder leer sind');

	const providerEmpty = buildStewardSection({ provider: 'lmstudio', model: 'm', research: { provider: '', model: 'perplexity/sonar', maxTokens: 4096 } });
	assert.ok(providerEmpty.includes('  research:'), 'research-Sektion vorhanden, wenn modell nicht leer ist');
	assert.ok(!providerEmpty.includes('    provider:'), 'leerer research-provider wird nicht emittiert');
	assert.ok(providerEmpty.includes('    model: "perplexity/sonar"'), 'research-model wird emittiert');

	const maxTokensOnly = buildStewardSection({ provider: 'lmstudio', model: 'm', research: { provider: '', model: '', maxTokens: 4096 } });
	assert.ok(maxTokensOnly.includes('  research:'), 'research-Sektion vorhanden, wenn maxTokens vorhanden ist');
	assert.ok(maxTokensOnly.includes('    maxTokens: 4096'), 'maxTokens wird emittiert');
	assert.ok(!maxTokensOnly.includes('    provider:'), 'leerer research-provider wird nicht emittiert');
	assert.ok(!maxTokensOnly.includes('    model:'), 'leeres research-model wird nicht emittiert');
});

test('writeStewardSettingsSection: persistiert und liest research-Route round-trip', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-settings-research-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, FULL, 'utf8');
		await writeStewardSettingsSection(doc, {
			provider: 'lmstudio', model: 'ornith-1.5-9b-mtp', maxTokens: 8192, reasoningEffort: '',
			research: { provider: 'openrouter', model: 'perplexity/sonar', maxTokens: 4096 },
		});
		const after = await import('node:fs/promises').then((fs) => fs.readFile(doc, 'utf8'));
		assert.ok(after.includes('llm-pi-ai:'), 'andere Sektionen bleiben erhalten');
		const parsed = parseStewardSettingsSection(after);
		assert.equal(parsed.provider, 'lmstudio');
		assert.deepEqual(parsed.research, { provider: 'openrouter', model: 'perplexity/sonar', maxTokens: 4096 });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('resolveResearchConfig: Settings-research gewinnt; leere Werte erben Steward-Modell', () => {
	const { config } = normalizeConfig(undefined);
	const stewardModel = { provider: 'lmstudio', model: 'ornith', maxTokens: 8192, reasoningEffort: '', source: 'settings' };

	// Settings-research setzt eigene Route.
	const withSettings = resolveResearchConfig(config, stewardModel, { research: { provider: 'openrouter', model: 'perplexity/sonar', maxTokens: 4096 } });
	assert.equal(withSettings.provider, 'openrouter');
	assert.equal(withSettings.model, 'perplexity/sonar');
	assert.equal(withSettings.maxTokens, 4096);
	assert.equal(withSettings.source, 'settings');
	assert.ok(withSettings.allowedTools.includes('web'));

	// Ohne research-Settings und ohne Patch-Row-research erbt es das Steward-Modell.
	const inherited = resolveResearchConfig(config, stewardModel, null);
	assert.equal(inherited.provider, 'lmstudio');
	assert.equal(inherited.model, 'ornith');
	assert.ok(inherited.allowedTools.includes('web'), 'Web-Allowlist bleibt trotz geerbtem Modell');
});

test('resolveResearchConfig: web/edit werden aus einer Settings-Allowlist nie freigegeben', () => {
	const { config } = normalizeConfig(undefined);
	const stewardModel = { provider: '', model: '', maxTokens: 8192, reasoningEffort: '', source: 'patch-row' };
	const out = resolveResearchConfig(config, stewardModel, { research: { allowedTools: ['read', 'web', 'write', 'edit'] } });
	assert.ok(out.allowedTools.includes('web'));
	assert.ok(!out.allowedTools.includes('write'));
	assert.ok(!out.allowedTools.includes('edit'));
});
