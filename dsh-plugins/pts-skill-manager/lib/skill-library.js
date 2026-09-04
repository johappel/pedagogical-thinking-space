// pts-skill-manager — skill library access under `<repo>/skills/<id>/SKILL.md`.
//
// The plugin is junction-mounted into the profile's node_modules, so its
// realpath is the repository: the library root resolves relative to this
// module. Every file access is confined to that root (realpath + path.relative
// containment, the artifact-panel pattern). No @deepseek-ai imports.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ROLES = ['research', 'material', 'review', 'renderer'];
export const STATUSES = ['draft', 'own', 'verified'];

/** Absolute path of the versioned skill library (`<repo>/skills`). */
export function skillsRoot() {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../skills');
}

/** Absolute path of the repository root. */
export function repoRoot() {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function toPosix(p) {
	return String(p).split(path.sep).join('/');
}

/** Realpath with missing-final-component anchoring (artifact-panel pattern). */
export async function realKey(p) {
	const abs = path.resolve(p);
	try {
		return toPosix(await fsp.realpath(abs));
	} catch {
		const parent = path.dirname(abs);
		try {
			return toPosix(path.join(await fsp.realpath(parent), path.basename(abs)));
		} catch {
			return null;
		}
	}
}

function containedUnder(rootKey, childKey) {
	if (typeof rootKey !== 'string' || typeof childKey !== 'string') return false;
	const rel = path.relative(rootKey.toLowerCase(), childKey.toLowerCase());
	return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Resolve a request-supplied path under a base directory (contained).
 * @param {string} base - absolute base directory.
 * @param {string} raw - raw relative path.
 * @returns {Promise<{ key: string } | { reason: string, candidate?: string }>}
 */
export async function resolveContained(base, raw) {
	const candidate = toPosix(String(raw ?? '').trim());
	if (candidate === '') return { reason: 'empty' };
	const baseKey = await realKey(base);
	if (baseKey === null) return { reason: 'bad-base' };
	const direct = path.resolve(base, candidate);
	let key = await realKey(direct);
	if (key !== null && containedUnder(baseKey, key)) return { key };
	return { reason: 'outside', candidate };
}

/** Strip quoting and an inline ` # comment` from one scalar value. */
function cleanScalar(raw) {
	let s = String(raw ?? '').trim();
	const hash = s.search(/\s+#/);
	if (hash > 0) s = s.slice(0, hash).trim();
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		s = s.slice(1, -1);
	}
	return s;
}

/** Parse `[a, b]` (or a bare scalar) into cleaned list items. */
function parseList(raw) {
	const s = String(raw ?? '').trim();
	if (s.startsWith('[') && s.endsWith(']')) {
		return s.slice(1, -1).split(',').map(cleanScalar).filter((v) => v !== '');
	}
	const single = cleanScalar(s);
	return single !== '' ? [single] : [];
}

/**
 * Parse the YAML frontmatter of a SKILL.md into the PTS schema.
 * DSH requires `name` (kebab-case) + `description`; our library enforces
 * `name === id`. Missing `roles`/`status` fall back to `[]`/`draft`.
 * @param {string} text - raw SKILL.md text.
 * @returns {{ id: string, name: string, description: string, roles: string[], status: string, body: string, rawFrontmatter: string } | { error: string }}
 */
export function parseSkillFrontmatter(text) {
	if (typeof text !== 'string') return { error: 'kein Text übergeben' };
	const lines = text.split(/\r?\n/);
	if (lines.length === 0 || lines[0].trim() !== '---') {
		return { error: 'Frontmatter fehlt: die Datei muss mit einer --- Zeile beginnen' };
	}
	let end = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i].trim() === '---') { end = i; break; }
	}
	if (end === -1) return { error: 'Frontmatter ist nicht geschlossen (fehlendes ---)' };
	const frontmatterLines = lines.slice(1, end);
	const body = lines.slice(end + 1).join('\n').trim();

	let id = null;
	let name = null;
	let description = null;
	let roles = [];
	let status = '';
	let inRolesBlock = false;
	for (const line of frontmatterLines) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		const indent = (line.match(/^[ \t]*/) || [''])[0].length;
		if (indent === 0) {
			inRolesBlock = false;
			const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
			if (!m) continue;
			const key = m[1];
			const raw = m[2].trim();
			if (key === 'id') id = cleanScalar(raw);
			else if (key === 'name') name = cleanScalar(raw);
			else if (key === 'description') description = cleanScalar(raw);
			else if (key === 'status') status = cleanScalar(raw);
			else if (key === 'roles') {
				if (raw === '') { roles = []; inRolesBlock = true; }
				else roles = parseList(raw);
			}
			continue;
		}
		if (inRolesBlock && indent >= 2) {
			const item = /^-\s*(.*)$/.exec(trimmed);
			if (item) {
				const r = cleanScalar(item[1]);
				if (r !== '' && !roles.includes(r)) roles.push(r);
			}
		}
	}

	const effectiveId = id ?? name;
	if (effectiveId === null || effectiveId === '') return { error: 'Frontmatter braucht id oder name' };
	if (!SKILL_ID_RE.test(effectiveId)) {
		return { error: `id "${effectiveId}" ist kein gültiger Skill-Name (kebab-case, nur a-z0-9 und Bindestrich)` };
	}
	if (name !== null && name !== effectiveId) {
		return { error: `name "${name}" weicht von id "${effectiveId}" ab — DSH verlangt name === id (kebab-case)` };
	}
	if (description === null || description === '') return { error: 'Frontmatter braucht eine nicht-leere description' };

	const validRoles = roles.filter((r) => ROLES.includes(r));
	const validStatus = STATUSES.includes(status) ? status : 'draft';

	return {
		id: effectiveId,
		name: effectiveId,
		description,
		roles: validRoles,
		status: validStatus,
		body,
		rawFrontmatter: frontmatterLines.join('\n'),
	};
}

/**
 * Read one skill entry from the library (metadata only, no body).
 * @param {string} id - skill id.
 * @param {string} [root] - library root override (tests).
 * @returns {Promise<object|null>} library entry or null.
 */
export async function readSkillEntry(id, root = skillsRoot()) {
	if (typeof id !== 'string' || !SKILL_ID_RE.test(id)) return null;
	const found = await resolveContained(root, `${id}/SKILL.md`);
	if (found.reason !== undefined) return null;
	let text;
	try {
		text = await fsp.readFile(found.key, 'utf8');
	} catch {
		return null;
	}
	const parsed = parseSkillFrontmatter(text);
	if (parsed.error !== undefined) return null;
	return {
		id: parsed.id,
		name: parsed.name,
		description: parsed.description,
		roles: parsed.roles,
		status: parsed.status,
		path: toPosix(path.join(root, parsed.id, 'SKILL.md')),
	};
}

/**
 * List the whole library, sorted by id.
 * @param {string} [root] - library root override (tests).
 * @returns {Promise<object[]>} library entries.
 */
export async function listLibrary(root = skillsRoot()) {
	let entries;
	try {
		entries = await fsp.readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	const skills = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !SKILL_ID_RE.test(entry.name)) continue;
		const skill = await readSkillEntry(entry.name, root);
		if (skill !== null) skills.push(skill);
	}
	skills.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return skills;
}

/**
 * Normalize an imported document so DSH can load it: ensures the frontmatter
 * carries `name: <id>` (kebab). Preserves every other line and the body.
 * @param {string} text - raw SKILL.md text.
 * @param {string} id - effective skill id.
 * @returns {{ text: string, adjusted: boolean }}
 */
export function normalizeImportedText(text, id) {
	const lines = text.split(/\r?\n/);
	const frontmatterStart = lines.findIndex((l) => l.trim() === '---');
	if (frontmatterStart === -1) return { text, adjusted: false };
	let hasName = false;
	let end = -1;
	for (let i = frontmatterStart + 1; i < lines.length; i += 1) {
		if (lines[i].trim() === '---') { end = i; break; }
		if (/^name:\s*/.test(lines[i])) hasName = true;
	}
	if (end === -1) return { text, adjusted: false };
	if (hasName) return { text, adjusted: false };
	const out = [...lines.slice(0, frontmatterStart + 1), `name: ${id}`, ...lines.slice(frontmatterStart + 1)];
	return { text: out.join('\n'), adjusted: true };
}

/**
 * Import a SKILL.md into the library. Rejects invalid ids, frontmatter
 * mismatches ("Betrug") and conflicts unless `force` overwrites a non-verified
 * existing skill.
 * @param {object} input - { id?, content?, sourcePath?, force? }.
 * @param {string} repoRootAbs - repository root for sourcePath containment.
 * @param {string} [libraryRoot] - library root override (tests).
 * @returns {Promise<{ ok: true, skill: object } | { ok: false, error: string, status?: number }>}
 */
export async function importSkill(input, repoRootAbs, libraryRoot = skillsRoot()) {
	const idRaw = typeof input.id === 'string' ? input.id.trim() : null;
	const content = typeof input.content === 'string' ? input.content : null;
	const sourcePath = typeof input.sourcePath === 'string' ? input.sourcePath.trim() : null;
	const force = input.force === true;

	if (content === null && (sourcePath === null || sourcePath === '')) {
		return { ok: false, error: 'content oder sourcePath wird erwartet', status: 400 };
	}
	let text = content;
	if (text === null) {
		const found = await resolveContained(repoRootAbs, sourcePath);
		if (found.reason !== undefined) {
			return { ok: false, error: 'sourcePath liegt außerhalb des Repos', status: 403 };
		}
		try {
			text = await fsp.readFile(found.key, 'utf8');
		} catch {
			return { ok: false, error: 'sourcePath nicht lesbar', status: 404 };
		}
	}

	const parsed = parseSkillFrontmatter(text);
	if (parsed.error !== undefined) return { ok: false, error: parsed.error, status: 400 };
	if (idRaw !== null && idRaw !== parsed.id) {
		return { ok: false, error: `angegebene id "${idRaw}" weicht von der Frontmatter-id "${parsed.id}" ab`, status: 409 };
	}

	const existing = await readSkillEntry(parsed.id, libraryRoot);
	if (existing !== null && !force) {
		return { ok: false, error: `Skill "${parsed.id}" existiert bereits`, status: 409 };
	}
	if (existing !== null && existing.status === 'verified') {
		return { ok: false, error: `Skill "${parsed.id}" ist verified — erst löschen, dann erneut importieren`, status: 409 };
	}

	const { text: normalized, adjusted } = normalizeImportedText(text, parsed.id);
	const target = path.join(libraryRoot, parsed.id, 'SKILL.md');
	await fsp.mkdir(path.dirname(target), { recursive: true });
	await fsp.writeFile(target, normalized, 'utf8');

	const skill = await readSkillEntry(parsed.id, libraryRoot);
	return { ok: true, skill, adjusted };
}

/**
 * Delete a skill from the library. `draft`/`own` delete directly; `verified`
 * requires `confirm: true` (the UI shows an explicit confirmation button).
 * @param {object} input - { id, confirm? }.
 * @param {string} [libraryRoot] - library root override (tests).
 * @returns {Promise<{ ok: true } | { ok: false, error: string, status?: number }>}
 */
export async function deleteSkill(input, libraryRoot = skillsRoot()) {
	const id = typeof input.id === 'string' ? input.id.trim() : null;
	if (id === null || !SKILL_ID_RE.test(id)) {
		return { ok: false, error: 'ungültige Skill-id', status: 400 };
	}
	const found = await resolveContained(libraryRoot, id);
	if (found.reason !== undefined) return { ok: false, error: 'Skill nicht gefunden', status: 404 };
	const target = path.join(libraryRoot, id);
	try {
		const info = await fsp.stat(target);
		if (!info.isDirectory()) return { ok: false, error: 'kein Skill-Ordner', status: 404 };
	} catch {
		return { ok: false, error: 'Skill nicht gefunden', status: 404 };
	}
	const entry = await readSkillEntry(id, libraryRoot);
	if (entry !== null && entry.status === 'verified' && input.confirm !== true) {
		return { ok: false, error: 'verified-Skill löschen? Bestätigung fehlt (confirm: true)', status: 409 };
	}
	await fsp.rm(target, { recursive: true, force: true });
	return { ok: true };
}
