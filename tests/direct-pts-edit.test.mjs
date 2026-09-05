import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { applyDirectEdit, resolveDenkraum } from '../dsh-presets/pts-companion/direct-pts-edit.mjs';

async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'pts-direct-edit-'));
	const denkraum = path.join(root, 'workspace', 'demo');
	await mkdir(denkraum, { recursive: true });
	await writeFile(path.join(root, 'AGENTS.md'), '# test PTS root\n', 'utf8');
	await writeFile(path.join(denkraum, 'planning-board.yml'), 'schema: ptspace.planning-board/v1\nitems:\n', 'utf8');
	await writeFile(path.join(denkraum, 'decisions.yml'), 'schema: ptspace.decisions/v1\ndecisions:\n', 'utf8');
	return { root, denkraum, agent: { session: { header: { cwd: denkraum } } } };
}

test('direct pts_edit records a small open question without starting a child', async () => {
	const f = await fixture();
	const result = await applyDirectEdit(f.agent, {
		operation: 'add_open_question',
		question: 'Wie verändert sich die Perspektive der Lernenden?',
	});
	const board = await readFile(path.join(f.denkraum, 'planning-board.yml'), 'utf8');
	assert.equal(result.direct, true);
	assert.equal(result.childAgentStarted, false);
	assert.match(board, /status: proposed/);
	assert.match(board, /requires_teacher_approval: true/);
	assert.match(board, /Perspektive der Lernenden/);
});

test('direct pts_edit requires an explicit teacher confirmation for decisions', async () => {
	const f = await fixture();
	await assert.rejects(() => applyDirectEdit(f.agent, {
		operation: 'record_decision', title: 'Fokus', decision: 'Die Einheit fokussiert eine Leitfrage.',
		teacher_confirmed: false,
	}), /teacher_confirmed/);
	const result = await applyDirectEdit(f.agent, {
		operation: 'record_decision', title: 'Fokus', decision: 'Die Einheit fokussiert eine Leitfrage.',
		teacher_confirmed: true,
	});
	assert.equal(result.direct, true);
	assert.match(await readFile(path.join(f.denkraum, 'decisions.yml'), 'utf8'), /status: confirmed/);
});

test('direct pts_edit rejects outside scope and large conceptual operations', async () => {
	const f = await fixture();
	const outside = { session: { header: { cwd: f.root } } };
	await assert.rejects(() => resolveDenkraum(outside), /current PTS Denkraum/);
	await assert.rejects(() => applyDirectEdit(f.agent, {
		operation: 'rewrite_learning_design', content: 'rewrite everything',
	}), /unsupported direct pts_edit operation/);
});
