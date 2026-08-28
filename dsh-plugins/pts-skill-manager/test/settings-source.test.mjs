// Tests for the pts-worker-skills settings section: shared parser (imported
// from the preset enforcement plugin so both sides can never drift), matrix
// normalization/validation and the atomic section writer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseWorkerSkillsSection, WORKER_ROLES } from '../../../dsh-presets/pts-companion/worker-skill-scope.mjs';
import {
	normalizeMatrix,
	validateMatrixAgainstLibrary,
	buildWorkerSkillsSection,
	readWorkerSkillsMatrix,
	writeWorkerSkillsSection,
} from '../lib/settings-source.js';

const FULL = [
	'# Eigene Einstellungen des Profils',
	'agent-default-model:',
	'  provider: deepseek-official',
	'  model: deepseek-v4-flash',
	'',
	'pts-worker-skills:',
	'  research: [google-search]',
	'  material: [ppt-builder, google-search]',
	'  review: []',
	'  renderer: []',
	'',
	'pts-background-steward:',
	'  provider: ollama',
	'  model: qwen3.8:27b',
	'  maxTokens: 8192',
	'  reasoningEffort: low',
	'',
	'llm-pi-ai:',
	'  providers: {}',
].join('\n');

test('parseWorkerSkillsSection: Inline-Listen pro Rolle', () => {
	const out = parseWorkerSkillsSection(FULL);
	assert.deepEqual(out, {
		research: ['google-search'],
		material: ['ppt-builder', 'google-search'],
		review: [],
		renderer: [],
	});
});

test('parseWorkerSkillsSection: Block-Listen, Kommentare und Anführungszeichen', () => {
	const text = [
		'pts-worker-skills:',
		'  research:',
		'    - google-search',
		'    - "ppt-builder" # Kommentar',
		'  material: [google-search]',
		'  review: []',
		'  renderer: []',
	].join('\n');
	const out = parseWorkerSkillsSection(text);
	assert.deepEqual(out.research, ['google-search', 'ppt-builder']);
	assert.deepEqual(out.material, ['google-search']);
});

test('parseWorkerSkillsSection: ungültige ids werden verworfen, unbekannte Rollen ignoriert', () => {
	const text = [
		'pts-worker-skills:',
		'  research: [google-search, BAD ID, ../../evil]',
		'  unbekannt: [x]',
		'  material: []',
		'  review: []',
		'  renderer: []',
	].join('\n');
	const out = parseWorkerSkillsSection(text);
	assert.deepEqual(out.research, ['google-search']);
	assert.equal(out.unbekannt, undefined);
});

test('parseWorkerSkillsSection: null ohne Sektion, auch bei fremden Sektionen', () => {
	assert.equal(parseWorkerSkillsSection(''), null);
	assert.equal(parseWorkerSkillsSection(null), null);
	assert.equal(parseWorkerSkillsSection('pts-background-steward:\n  model: x\n'), null);
});

test('readWorkerSkillsMatrix liest aus documentPath; fehlende Datei -> null', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-skills-matrix-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, FULL, 'utf8');
		const out = await readWorkerSkillsMatrix({ documentPath: doc });
		assert.deepEqual(out.research, ['google-search']);
		assert.equal(await readWorkerSkillsMatrix({ documentPath: path.join(dir, 'gibt-es-nicht.yaml') }), null);
		assert.equal(await readWorkerSkillsMatrix(undefined), null);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('normalizeMatrix: nur bekannte Rollen, dedupliziert, ungültige ids entfernt', () => {
	const out = normalizeMatrix({
		research: ['google-search', 'google-search', 'BAD ID', 5],
		material: ['ppt-builder'],
		review: [],
		renderer: [],
		extra: ['x'],
	});
	assert.deepEqual(out, {
		research: ['google-search'],
		material: ['ppt-builder'],
		review: [],
		renderer: [],
	});
	assert.deepEqual(WORKER_ROLES, ['research', 'material', 'review', 'renderer']);
	assert.deepEqual(normalizeMatrix(null), { research: [], material: [], review: [], renderer: [] });
});

test('validateMatrixAgainstLibrary: unbekannte Zuweisungen werden gemeldet', () => {
	const known = new Set(['google-search', 'ppt-builder']);
	assert.deepEqual(validateMatrixAgainstLibrary(
		{ research: ['google-search'], material: ['ppt-builder'], review: [], renderer: [] },
		known,
	), []);
	assert.deepEqual(validateMatrixAgainstLibrary(
		{ research: ['google-search', 'ghost'], material: ['ghost2'], review: [], renderer: [] },
		known,
	), ['research -> ghost', 'material -> ghost2']);
});

test('buildWorkerSkillsSection: deterministische, inline Listen', () => {
	const text = buildWorkerSkillsSection({ research: ['google-search'], material: [], review: [], renderer: [] });
	assert.ok(text.startsWith('pts-worker-skills:'));
	assert.ok(text.includes('  research: [google-search]'));
	assert.ok(text.includes('  material: []'));
	assert.ok(text.includes('  review: []'));
	assert.ok(text.includes('  renderer: []'));
});

test('writeWorkerSkillsSection: ersetzt die Sektion atomar und erhält Fremd-Sektionen', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-skills-write-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, FULL, 'utf8');
		await writeWorkerSkillsSection(doc, {
			research: ['ppt-builder'],
			material: [],
			review: [],
			renderer: [],
		});
		const after = await readFile(doc, 'utf8');
		assert.ok(after.includes('agent-default-model:'));
		assert.ok(after.includes('pts-background-steward:'));
		assert.ok(after.includes('llm-pi-ai:'));
		const parsed = parseWorkerSkillsSection(after);
		assert.deepEqual(parsed.research, ['ppt-builder']);
		assert.deepEqual(parsed.material, []);
		// Steward-Sektion bleibt unberührt (Konvoi-Test).
		assert.ok(after.includes('  provider: ollama'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('writeWorkerSkillsSection: legt die Sektion an, wenn keine existiert', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-skills-write-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, 'agent-default-model:\n  model: x\n', 'utf8');
		await writeWorkerSkillsSection(doc, { research: ['google-search'], material: [], review: [], renderer: [] });
		const after = await readFile(doc, 'utf8');
		const parsed = parseWorkerSkillsSection(after);
		assert.deepEqual(parsed.research, ['google-search']);
		assert.ok(after.includes('agent-default-model:'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('Konvoi: beide Section-Writer überleben sich gegenseitig', async () => {
	// Der Steward-Writer (Schreibmuster) und der Skills-Writer dürfen sich
	// nicht gegenseitig löschen: dieselbe Datei, zwei Sektionen.
	const { writeStewardSettingsSection } = await import('../../../dsh-plugins/pts-background-steward/lib/settings-source.js');
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-skills-konvoi-'));
	try {
		const doc = path.join(dir, 'settings.yaml');
		await writeFile(doc, 'agent-default-model:\n  model: x\n', 'utf8');
		await writeStewardSettingsSection(doc, { provider: 'ollama', model: 'qwen3.8:27b', maxTokens: 4096, reasoningEffort: '' });
		await writeWorkerSkillsSection(doc, { research: ['google-search'], material: [], review: [], renderer: [] });
		const after1 = await readFile(doc, 'utf8');
		assert.ok(after1.includes('pts-background-steward:'));
		assert.ok(after1.includes('pts-worker-skills:'));
		await writeStewardSettingsSection(doc, { provider: 'lmstudio', model: 'ornith-1.5-9b-mtp', maxTokens: 8192, reasoningEffort: 'low' });
		const after2 = await readFile(doc, 'utf8');
		assert.ok(after2.includes('pts-worker-skills:'));
		const parsed = parseWorkerSkillsSection(after2);
		assert.deepEqual(parsed.research, ['google-search']);
		const steward = (await import('../../../dsh-plugins/pts-background-steward/lib/settings-source.js')).parseStewardSettingsSection(after2);
		assert.equal(steward.model, 'ornith-1.5-9b-mtp');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
