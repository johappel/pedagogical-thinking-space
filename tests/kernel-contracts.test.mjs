import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

test('kernel defines active workspace stewardship', async () => {
	const agents = await read('AGENTS.md');
	const friend = await read('CRITICAL_FRIEND.md');
	const design = await read('LEARNING_DESIGN.md');
	assert.match(agents, /Active Workspace Stewardship/);
	assert.match(friend, /Active Workspace Stewardship/);
	assert.match(design, /Active workspace stewardship/);
	assert.match(agents, /without asking for technical write permission/);
	assert.doesNotMatch(agents, /workspace\/<project-slug>\/decisions\.md/);
});

test('draft, review and stable have distinct landscape semantics', async () => {
	const schema = await read('specs/LEARNING_LANDSCAPE_SCHEMA.md');
	assert.match(schema, /`draft`\s+is a provisional working state/);
	assert.match(schema, /`needs_review`/);
	assert.match(schema, /means the\s+teacher/);
	assert.match(schema, /complete moment may enter the canonical landscape as a reversible `draft`/);
	assert.doesNotMatch(schema, /only after visible teacher approval/);
});

test('structured questions are reserved for pedagogical forks', async () => {
	const agents = await read('AGENTS.md');
	const minimal = await read('AGENTS_MINIMAL.md');
	assert.match(agents, /Use `ask_user_question` for a genuine pedagogical fork/);
	assert.match(agents, /Do not use it for permission to update the workspace/);
	assert.match(minimal, /Use `ask_user_question` only for a genuine pedagogical fork/);
});

test('durable protection boundaries remain explicit', async () => {
	const agents = await read('AGENTS.md');
	assert.match(agents, /starting a Worker or bounded research request/);
	assert.match(agents, /long-term `memory\.local\/` storage/);
	assert.match(agents, /adoption into curated Knowledge/);
	assert.match(agents, /export, publication or irreversible deletion/);
});
