import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
// Normalize whitespace so line-wrapped prose still matches a single-line phrase.
const squish = (s) => s.replace(/\s+/g, ' ');

test('kernel defines background stewardship', async () => {
	const agents = await read('AGENTS.md');
	const friend = await read('CRITICAL_FRIEND.md');
	const design = await read('LEARNING_DESIGN.md');
	const minimal = await read('AGENTS_MINIMAL.md');
	assert.match(agents, /## Background Stewardship/);
	assert.match(friend, /background stewardship/i);
	assert.match(design, /Background workspace stewardship/);
	assert.match(minimal, /without asking for technical write permission/);
	assert.doesNotMatch(agents, /workspace\/<project-slug>\/decisions\.md/);
});

test('a direct work order authorizes a bounded check without a second approval', async () => {
	const agents = squish(await read('AGENTS.md'));
	const orchestration = squish(await read('ORCHESTRATION.md'));
	const minimal = squish(await read('AGENTS_MINIMAL.md'));
	const friend = squish(await read('CRITICAL_FRIEND.md'));
	const friendDe = squish(await read('CRITICAL_FRIEND.de.md'));
	const knowledge = squish(await read('services/KNOWLEDGE.md'));

	// The implied_bounded_request exception is present in every relevant contract.
	for (const doc of [agents, orchestration, minimal, knowledge]) {
		assert.match(doc, /implied_bounded_request/);
	}
	// Direct work orders count as authorization.
	assert.match(agents, /A direct work order counts as authorization\./);
	assert.match(minimal, /A direct work order is authorization\./);
	// A granted authorization is not devalued by a second approval question.
	assert.match(agents, /Möchte ich jetzt die Recherche starten\?/);
	assert.match(orchestration, /Möchte ich jetzt die Recherche starten\?/);
	assert.match(friend, /Möchte ich jetzt die Recherche starten\?/);
	assert.match(friendDe, /Möchte ich jetzt die Recherche starten\?/);
	assert.match(knowledge, /Möchte ich jetzt die Recherche starten\?/);
	// Unknown denomination starts with both confessions instead of blocking.
	assert.match(agents, /evangelische \*\*and\*\* katholische Religionslehre/);
	assert.match(orchestration, /evangelische \*\*and\*\* katholische Religionslehre/);
});

test('an explicit knowledge storage order stays inside the review boundary', async () => {
	const agents = squish(await read('AGENTS.md'));
	const knowledge = squish(await read('services/KNOWLEDGE.md'));
	const schema = squish(await read('specs/STEWARDSHIP_RESULT_SCHEMA.md'));
	// Explicit storage order → immediate proposal, no second approval, not curated.
	assert.match(agents, /Speichere das als Knowledge/);
	assert.match(knowledge, /not-yet-curated Knowledge Proposal under `knowledge-proposals\/`/);
	// The schema documents the knowledge_proposal storage target.
	assert.match(schema, /knowledge_proposal/);
	assert.match(schema, /noch nicht kuratiert/);
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
