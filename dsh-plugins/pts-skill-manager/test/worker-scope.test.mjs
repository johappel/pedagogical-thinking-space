// Tests for the preset enforcement plugin (worker-skill-scope.mjs): role
// detection from the applied tool filter, the hard `skill` guard and the
// guidance prompt section. Uses a minimal agent/tools/systemPrompt harness —
// the module imports no @deepseek-ai packages, so it stays testable in the
// repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	roleForAgent,
	installWorkerSkillScope,
	parseWorkerSkillsSection,
	isSubagent,
} from '../../../dsh-presets/pts-companion/worker-skill-scope.mjs';

function fakeAgent({ subagent, visibleTools, settingsPath }) {
	const guardFns = [];
	const sections = [];
	const ctx = {
		settings: settingsPath !== undefined ? { documentPath: settingsPath } : undefined,
		tools: {
			get(name) { return visibleTools[name] !== undefined ? { name } : undefined; },
			guard(fn) { guardFns.push(fn); let removed = false; return () => { removed = true; }; },
		},
		systemPrompt: {
			section(def) { sections.push(def); return () => {}; },
		},
	};
	const agent = { ctx, session: { header: subagent ? { origin: 'subagent' } : { origin: 'main' } } };
	return { agent, guardFns, sections };
}

async function withSettings(matrixLines) {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-scope-'));
	const doc = path.join(dir, 'settings.yaml');
	await writeFile(doc, ['agent-default-model:\n  model: x', '', 'pts-worker-skills:', ...matrixLines].join('\n'), 'utf8');
	return { doc, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('parseWorkerSkillsSection: teilt sich die Host-Parser-Logik (kein Drift)', () => {
	const text = [
		'pts-worker-skills:',
		'  research: [google-search]',
		'  material: [ppt-builder]',
		'  review: []',
		'  renderer: []',
	].join('\n');
	assert.deepEqual(parseWorkerSkillsSection(text), {
		research: ['google-search'],
		material: ['ppt-builder'],
		review: [],
		renderer: [],
	});
});

test('isSubagent und roleForAgent erkennen die Rollen über den Tool-Filter', () => {
	assert.equal(isSubagent({ session: { header: { origin: 'subagent' } } }), true);
	assert.equal(isSubagent({ session: { header: { origin: 'main' } } }), false);

	// Research: skill + web_search sichtbar.
	const research = fakeAgent({ subagent: true, visibleTools: { skill: {}, web_search: {} } });
	assert.equal(roleForAgent(research.agent), 'research');

	// Material: skill, keine Web-Tools.
	const material = fakeAgent({ subagent: true, visibleTools: { skill: {} } });
	assert.equal(roleForAgent(material.agent), 'material');

	// Review/Renderer: kein skill sichtbar.
	const review = fakeAgent({ subagent: true, visibleTools: { read: {} } });
	assert.equal(roleForAgent(review.agent), null);

	// Root-Companion: kein Subagent.
	const root = fakeAgent({ subagent: false, visibleTools: { skill: {} } });
	assert.equal(roleForAgent(root.agent), null);

	assert.equal(roleForAgent(null), null);
});

test('installWorkerSkillScope: Guard lehnt nicht zugewiesene Skills hart ab', async () => {
	const s = await withSettings(['  research: [google-search]', '  material: []', '  review: []', '  renderer: []']);
	try {
		const { agent, guardFns } = fakeAgent({ subagent: true, visibleTools: { skill: {}, web_search: {} }, settingsPath: s.doc });
		const dispose = installWorkerSkillScope(agent);
		assert.equal(guardFns.length, 1);
		// Zuweisung ist asynchron geladen — kurz warten.
		await new Promise((r) => setTimeout(r, 30));
		const guard = guardFns[0];
		assert.equal(guard({ name: 'skill', arguments: { name: 'google-search' } }), undefined, 'zugewiesen -> erlaubt');
		assert.ok(String(guard({ name: 'skill', arguments: { name: 'ppt-builder' } })).includes('nicht zugewiesen'));
		assert.equal(guard({ name: 'read', arguments: {} }), undefined, 'fremde Tools unberührt');
		dispose();
	} finally {
		await s.cleanup();
	}
});

test('installWorkerSkillScope: ohne Zuweisungen fail-closed (alles abgelehnt)', async () => {
	const s = await withSettings(['  research: []', '  material: []', '  review: []', '  renderer: []']);
	try {
		const { agent, guardFns } = fakeAgent({ subagent: true, visibleTools: { skill: {} }, settingsPath: s.doc });
		const dispose = installWorkerSkillScope(agent);
		await new Promise((r) => setTimeout(r, 30));
		const guard = guardFns[0];
		assert.ok(String(guard({ name: 'skill', arguments: { name: 'google-search' } })).includes('nicht zugewiesen'));
		dispose();
	} finally {
		await s.cleanup();
	}
});

test('installWorkerSkillScope: Prompt-Sektion nennt die zugewiesenen Skills', async () => {
	const s = await withSettings(['  material: [ppt-builder]', '  research: []', '  review: []', '  renderer: []']);
	try {
		const { agent, sections } = fakeAgent({ subagent: true, visibleTools: { skill: {} }, settingsPath: s.doc });
		installWorkerSkillScope(agent);
		assert.equal(sections.length, 1);
		assert.equal(sections[0].name, 'pts:worker-skills');
		await new Promise((r) => setTimeout(r, 30));
		const text = sections[0].text({});
		assert.ok(text.includes('ppt-builder'));
		assert.ok(text.includes('Rolle: material'));
	} finally {
		await s.cleanup();
	}
});

test('installWorkerSkillScope: kein Eingriff bei Nicht-Skill-Rollen', () => {
	const { agent, guardFns, sections } = fakeAgent({ subagent: true, visibleTools: { read: {} } });
	const dispose = installWorkerSkillScope(agent);
	assert.equal(guardFns.length, 0);
	assert.equal(sections.length, 0);
	dispose();
});
