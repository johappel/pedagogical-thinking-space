// Tests for the skill library: frontmatter parsing (id/roles/status,
// defaults, invalid), import path hardening (no escape from skills/), conflict
// rules and verified-delete confirmation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	SKILL_ID_RE,
	parseSkillFrontmatter,
	normalizeImportedText,
	resolveContained,
	listLibrary,
	readSkillEntry,
	importSkill,
	deleteSkill,
	skillsRoot,
} from '../lib/skill-library.js';

const VALID_SKILL = [
	'---',
	'id: google-search',
	'name: google-search',
	'description: Google-Suche über CDP statt nativer web_search',
	'roles: [research]',
	'status: own',
	'---',
	'',
	'# Google-Suche',
	'Inhalt.',
].join('\n');

test('parseSkillFrontmatter: vollständiges Frontmatter', () => {
	const out = parseSkillFrontmatter(VALID_SKILL);
	assert.equal(out.error, undefined);
	assert.equal(out.id, 'google-search');
	assert.equal(out.name, 'google-search');
	assert.equal(out.description, 'Google-Suche über CDP statt nativer web_search');
	assert.deepEqual(out.roles, ['research']);
	assert.equal(out.status, 'own');
	assert.ok(out.body.includes('Google-Suche'));
});

test('parseSkillFrontmatter: Defaults ohne roles/status, id fällt auf name zurück', () => {
	const out = parseSkillFrontmatter([
		'---',
		'name: ppt-builder',
		'description: Baut PPTX',
		'---',
		'Body',
	].join('\n'));
	assert.equal(out.id, 'ppt-builder');
	assert.deepEqual(out.roles, []);
	assert.equal(out.status, 'draft');
});

test('parseSkillFrontmatter: ungültige Eingaben', () => {
	assert.match(parseSkillFrontmatter('kein frontmatter').error, /^Frontmatter fehlt/);
	assert.match(parseSkillFrontmatter('---\nid: x\n').error, /nicht geschlossen/);
	assert.match(parseSkillFrontmatter('---\ndescription: ohne id\n---\n').error, /id oder name/);
	assert.match(parseSkillFrontmatter('---\nid: BAD ID\nname: BAD ID\ndescription: x\n---\n').error, /kebab-case/);
	assert.match(parseSkillFrontmatter('---\nid: google-search\nname: Google Suche\ndescription: x\n---\n').error, /name .*weicht von id/);
	assert.match(parseSkillFrontmatter('---\nid: google-search\nname: google-search\n---\n').error, /description/);
	assert.equal(SKILL_ID_RE.test('google-search'), true);
	assert.equal(SKILL_ID_RE.test('BAD ID'), false);
	assert.equal(SKILL_ID_RE.test('../evil'), false);
});

test('parseSkillFrontmatter: unbekannte Rollen/Status werden bereinigt', () => {
	const out = parseSkillFrontmatter([
		'---',
		'id: x-search',
		'name: x-search',
		'description: test',
		'roles: [research, magier]',
		'status: certified',
		'---',
		'',
	].join('\n'));
	assert.deepEqual(out.roles, ['research']);
	assert.equal(out.status, 'draft');
});

test('normalizeImportedText: ergänzt name nur, wenn es fehlt', () => {
	const withoutName = [
		'---',
		'id: google-search',
		'description: x',
		'---',
		'Body',
	].join('\n');
	const out = normalizeImportedText(withoutName, 'google-search');
	assert.equal(out.adjusted, true);
	assert.ok(out.text.includes('name: google-search'));
	assert.ok(out.text.includes('Body'));

	const withName = normalizeImportedText(VALID_SKILL, 'google-search');
	assert.equal(withName.adjusted, false);
});

test('resolveContained: kein Escape aus der Bibliothek', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-skills-hardening-'));
	try {
		const root = path.join(dir, 'skills');
		await import('node:fs/promises').then((fs) => fs.mkdir(path.join(root, 'google-search'), { recursive: true }));
		await writeFile(path.join(root, 'google-search', 'SKILL.md'), VALID_SKILL, 'utf8');
		await writeFile(path.join(dir, 'evil.md'), 'x', 'utf8');
		const ok = await resolveContained(root, 'google-search/SKILL.md');
		assert.equal(ok.reason, undefined);
		const escape = await resolveContained(root, '../evil.md');
		assert.equal(escape.reason, 'outside');
		const absEscape = await resolveContained(root, path.join(dir, 'evil.md'));
		assert.equal(absEscape.reason, 'outside');
		assert.equal((await resolveContained(root, '')).reason, 'empty');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

async function tmpLibrary(t) {
	const dir = await mkdtemp(path.join(tmpdir(), 'pts-skills-lib-'));
	const root = path.join(dir, 'skills');
	t.after(() => rm(dir, { recursive: true, force: true }));
	return { dir, root };
}

test('importSkill: Inhalt importiert und aus der Bibliothek lesbar', async (t) => {
	const { root } = await tmpLibrary(t);
	const result = await importSkill({ content: VALID_SKILL }, path.dirname(root), root);
	assert.equal(result.ok, true);
	assert.equal(result.skill.id, 'google-search');
	assert.equal(result.skill.status, 'own');
	const listed = await listLibrary(root);
	assert.equal(listed.length, 1);
	assert.equal(listed[0].id, 'google-search');
});

test('importSkill: Konflikt wird abgelehnt, force überschreibt nicht-verified', async (t) => {
	const { root } = await tmpLibrary(t);
	await importSkill({ content: VALID_SKILL }, path.dirname(root), root);
	const conflict = await importSkill({ content: VALID_SKILL.replace('status: own', 'status: draft') }, path.dirname(root), root);
	assert.equal(conflict.ok, false);
	assert.equal(conflict.status, 409);
	const forced = await importSkill({ content: VALID_SKILL.replace('status: own', 'status: draft'), force: true }, path.dirname(root), root);
	assert.equal(forced.ok, true);
	assert.equal(forced.skill.status, 'draft');
});

test('importSkill: verified darf nicht überschrieben werden', async (t) => {
	const { root } = await tmpLibrary(t);
	await importSkill({ content: VALID_SKILL.replace('status: own', 'status: verified') }, path.dirname(root), root);
	const forced = await importSkill({ content: VALID_SKILL.replace('status: own', 'status: verified'), force: true }, path.dirname(root), root);
	assert.equal(forced.ok, false);
	assert.equal(forced.status, 409);
});

test('importSkill: id-Abweichung (Betrug) und ungültige ids werden abgelehnt', async (t) => {
	const { root } = await tmpLibrary(t);
	const mismatch = await importSkill({ id: 'other-id', content: VALID_SKILL }, path.dirname(root), root);
	assert.equal(mismatch.ok, false);
	assert.equal(mismatch.status, 409);
	const invalid = await importSkill({ content: '---\nid: BAD ID\nname: BAD ID\ndescription: x\n---\n' }, path.dirname(root), root);
	assert.equal(invalid.ok, false);
	assert.equal(invalid.status, 400);
});

test('importSkill: sourcePath außerhalb des Repos wird abgelehnt', async (t) => {
	const { dir, root } = await tmpLibrary(t);
	await writeFile(path.join(dir, 'draussen.md'), VALID_SKILL, 'utf8');
	const escape = await importSkill({ sourcePath: '../draussen.md' }, dir, root);
	assert.equal(escape.ok, false);
	assert.equal(escape.status, 403);
	const inside = await importSkill({ sourcePath: 'draussen.md' }, dir, root);
	assert.equal(inside.ok, true);
});

test('deleteSkill: verified löscht nur mit confirm', async (t) => {
	const { root } = await tmpLibrary(t);
	await importSkill({ content: VALID_SKILL.replace('status: own', 'status: verified') }, path.dirname(root), root);
	const without = await deleteSkill({ id: 'google-search' }, root);
	assert.equal(without.ok, false);
	assert.equal(without.status, 409, 'verified-Skill braucht confirm');
	const withConfirm = await deleteSkill({ id: 'google-search', confirm: true }, root);
	assert.equal(withConfirm.ok, true);
	const after = await listLibrary(root);
	assert.equal(after.length, 0);
});

test('deleteSkill: draft ohne confirm löscht direkt', async (t) => {
	const { root } = await tmpLibrary(t);
	await importSkill({ content: VALID_SKILL.replace('status: own', 'status: draft') }, path.dirname(root), root);
	const out = await deleteSkill({ id: 'google-search' }, root);
	assert.equal(out.ok, true);
});

test('importSkill: name wird ergänzt und DSH-ladbar bleibt (name === id)', async (t) => {
	const { root } = await tmpLibrary(t);
	const withoutName = VALID_SKILL.replace('name: google-search\n', '');
	const result = await importSkill({ content: withoutName }, path.dirname(root), root);
	assert.equal(result.ok, true);
	assert.equal(result.adjusted, true);
	const stored = await readFile(path.join(root, 'google-search', 'SKILL.md'), 'utf8');
	assert.ok(stored.includes('name: google-search'));
});

test('skillsRoot zeigt auf den Repo-Ordner skills/', () => {
	assert.ok(skillsRoot().replace(/\\/g, '/').endsWith('/skills'));
});
