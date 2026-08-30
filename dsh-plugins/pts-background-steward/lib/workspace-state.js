// pts-background-steward — workspace state: hashing, atomic writes, and the
// pure text transforms that apply validated steward operations to the
// canonical Denkstand files.
//
// Design rules (kernel AGENTS.md + services/STEWARDSHIP.md):
// - Only the five canonical files are ever touched.
// - Every write is atomic within the Denkraum directory (temp file + rename).
// - Revisions protection lives in reflection-job.js: it snapshots hashes
//   before spawning the background agent and re-checks them immediately
//   before applying; a stale result is never applied.
// - decisions.yml entries require an explicit, evidence-backed teacher
//   decision (enforced in patch-validator.js); temporal-plan.yml is writable
//   only as a proposal (windows/placements are forced to `status: proposed`).
//   Both rules are mirrored here as defense in depth.

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const CANONICAL_FILES = Object.freeze([
	'learning-design.md',
	'learning-landscape.md',
	'decisions.yml',
	'planning-board.yml',
	'temporal-plan.yml',
]);

/** Files the steward may actually modify (temporal-plan only as proposal). */
export const WRITABLE_FILES = Object.freeze([
	'learning-design.md',
	'learning-landscape.md',
	'decisions.yml',
	'planning-board.yml',
	'temporal-plan.yml',
]);

/** Allowed learning-moment types per specs/LEARNING_LANDSCAPE_SCHEMA.md. */
export const MOMENT_TYPES = Object.freeze([
	'impulse', 'learning_place', 'positioning', 'inquiry', 'choice',
	'practice', 'project', 'product', 'reflection', 'assessment', 'other',
]);

/** Allowed Planning Board kinds per specs/PLANNING_BOARD_SCHEMA.md. */
export const BOARD_KINDS = Object.freeze([
	'clarify', 'research', 'design', 'intervention', 'observe',
	'produce', 'review', 'render', 'export',
]);

/** Allowed transition types per specs/LEARNING_LANDSCAPE_SCHEMA.md. */
export const TRANSITION_TYPES = Object.freeze([
	'required', 'choice', 'parallel', 'return', 'meeting_point', 'prerequisite',
]);

function slugify(s) {
	return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'x';
}

/** Allowed teaching-window kinds per specs/TEMPORAL_PLAN_SCHEMA.md. */
export const WINDOW_KINDS = Object.freeze([
	'lesson', 'double_lesson', 'project_block', 'open_learning_time',
]);

/** Allowed dramaturgical roles per specs/TEMPORAL_PLAN_SCHEMA.md. */
export const DRAMATURGICAL_ROLES = Object.freeze([
	'opening', 'irritation', 'exploration', 'deepening', 'practice',
	'decision', 'consolidation', 'reflection', 'closing', 'transition',
	'buffer', 'other',
]);

/** Allowed placement modes per specs/TEMPORAL_PLAN_SCHEMA.md. */
export const PLACEMENT_MODES = Object.freeze([
	'common', 'choice', 'parallel', 'individual', 'group', 'open',
]);

export function hashContent(content) {
	if (content === null || content === undefined) return null;
	return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/** Hash every canonical file of one Denkraum; missing files hash to null. */
export async function snapshotHashes(dir) {
	const hashes = {};
	for (const name of CANONICAL_FILES) {
		try {
			const content = await fsp.readFile(path.join(dir, name), 'utf8');
			hashes[name] = hashContent(content);
		} catch {
			hashes[name] = null;
		}
	}
	return hashes;
}

/**
 * Read canonical file contents for the steward prompt.
 * @returns {Promise<Array<{name, content: string|null, truncated: boolean}>>}
 */
export async function readCanonicalFiles(dir, maxFileChars) {
	const files = [];
	for (const name of CANONICAL_FILES) {
		try {
			let content = await fsp.readFile(path.join(dir, name), 'utf8');
			let truncated = false;
			if (content.length > maxFileChars) {
				content = `${content.slice(0, maxFileChars)}\n\n[… Datei aus Platzgründen gekürzt …]\n`;
				truncated = true;
			}
			files.push({ name, content, truncated });
		} catch {
			files.push({ name, content: null, truncated: false });
		}
	}
	return files;
}

/** Atomic write inside dir: temp file in the same directory, then rename. */
export async function atomicWrite(dir, name, content) {
	const tmp = path.join(dir, `.${name}.steward-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, content, 'utf8');
	try {
		await fsp.rename(tmp, path.join(dir, name));
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}

// ————————————————————————————————————————————————————————————————
// Pure text helpers
// ————————————————————————————————————————————————————————————————

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toLines(content) {
	return content.split(/\r?\n/);
}

function joinLines(lines) {
	return lines.join('\n');
}

function findHeadingIndex(lines, title) {
	const needle = new RegExp(`^##\\s*${escapeRegExp(title.trim())}\\s*$`);
	for (let i = 0; i < lines.length; i += 1) {
		if (needle.test(lines[i])) return i;
	}
	return -1;
}

/** End index (exclusive) of a section body starting after heading at h. */
function sectionBodyEnd(lines, headingIdx) {
	for (let j = headingIdx + 1; j < lines.length; j += 1) {
		if (/^##\s+/.test(lines[j]) || /^---\s*$/.test(lines[j])) return j;
	}
	return lines.length;
}

function normalizeBlock(value) {
	return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

/**
 * Replace the body of an `## <section>` block, or append the section at the
 * end when it does not exist yet. Returns { ok, content, reason? }.
 */
export function mdReplaceSection(content, section, value) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const title = String(section ?? '').trim();
	const body = normalizeBlock(value);
	if (title === '' || body === '') return { ok: false, reason: 'empty-section-or-value' };
	const lines = toLines(content);
	const h = findHeadingIndex(lines, title);
	const block = [`## ${title}`, '', body, ''];
	if (h === -1) {
		while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
		return { ok: true, content: joinLines([...lines, '', ...block]) };
	}
	const end = sectionBodyEnd(lines, h);
	return { ok: true, content: joinLines([...lines.slice(0, h + 1), '', body, '', ...lines.slice(end)]) };
}

/**
 * Append a text block under an existing `## <section>` heading (creating the
 * section at the end when missing).
 */
export function mdAppendUnderSection(content, section, value) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const title = String(section ?? '').trim();
	const body = normalizeBlock(value);
	if (title === '' || body === '') return { ok: false, reason: 'empty-section-or-value' };
	const lines = toLines(content);
	const h = findHeadingIndex(lines, title);
	if (h === -1) {
		while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
		return { ok: true, content: joinLines([...lines, '', `## ${title}`, '', body, '']) };
	}
	const end = sectionBodyEnd(lines, h);
	const bodyLines = [...lines.slice(h + 1, end)];
	while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();
	return { ok: true, content: joinLines([...lines.slice(0, h + 1), ...bodyLines, '', body, '', ...lines.slice(end)]) };
}

function singleLine(text) {
	return String(text ?? '').replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Append one schema-conformant learning moment as a reversible draft under
 * `## Lernmomente` (before `## Übergänge` when that section exists).
 * Required fields follow specs/LEARNING_LANDSCAPE_SCHEMA.md; status is forced
 * to `draft` — the steward never records stable moments.
 */
export function landscapeAppendMoment(content, moment) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const m = moment ?? {};
	const required = ['id', 'title', 'moment_type', 'moment_function', 'learning_activity', 'expected_experience'];
	for (const field of required) {
		if (singleLine(m[field]) === '') return { ok: false, reason: `missing-field:${field}` };
	}
	if (!MOMENT_TYPES.includes(m.moment_type)) return { ok: false, reason: 'invalid-moment-type' };
	const openQuestions = singleLine(m.open_questions) || '(noch keine)';
	const materialNeeds = singleLine(m.material_needs) || 'keine identifiziert';
	const herkunft = singleLine(m.provenance) || 'Hintergrund-Steward, Entwurf';
	const block = [
		`### ${singleLine(m.id)}`,
		'',
		`- Titel: ${singleLine(m.title)}`,
		`- Typ: ${m.moment_type}`,
		`- Funktion: ${singleLine(m.moment_function)}`,
		`- Lernaktivität: ${singleLine(m.learning_activity)}`,
		`- Erwartete Lernerfahrung: ${singleLine(m.expected_experience)}`,
		'- Materialbedarfe:',
		`  - ${materialNeeds}`,
		'- Materialien: []',
		'- Offene Fragen:',
		`  - ${openQuestions}`,
		'- Status: draft',
		`- Herkunft: ${herkunft}`,
	];
	const lines = toLines(content);
	const anchor = lines.findIndex((line) => /^##\s*Übergänge\s*$/.test(line));
	if (anchor === -1) {
		while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
		return { ok: true, content: joinLines([...lines, '', ...block, '']) };
	}
	return { ok: true, content: joinLines([...lines.slice(0, anchor), ...block, '', ...lines.slice(anchor)]) };
}

/**
 * Append one transition (`### tr-<from>-<to>` block) under `## Übergänge`
 * (creating the section and removing the scaffold placeholder when needed).
 * Requires referencing two distinct existing learning moments.
 */
export function landscapeAppendTransition(content, transition) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const from = String(transition?.from_id ?? '').trim();
	const to = String(transition?.to_id ?? '').trim();
	const type = String(transition?.transition_type ?? '').trim();
	const rationale = singleLine(transition?.value) || '(keine)';
	if (from === '' || to === '' || from === to) return { ok: false, reason: 'invalid-transition' };
	if (!TRANSITION_TYPES.includes(type)) return { ok: false, reason: 'invalid-transition-type' };
	if (!new RegExp(`^###\\s*${escapeRegExp(from)}\\s*$`, 'm').test(content)) return { ok: false, reason: 'unknown-from-moment' };
	if (!new RegExp(`^###\\s*${escapeRegExp(to)}\\s*$`, 'm').test(content)) return { ok: false, reason: 'unknown-to-moment' };
	const lines = toLines(content);
	const taken = new Set();
	for (const l of lines) {
		const m = l.trim().match(/^### (tr-[\w-]+)$/);
		if (m) taken.add(m[1]);
	}
	let id = 'tr-' + slugify(from) + '-' + slugify(to);
	let n = 2;
	while (taken.has(id)) { id = 'tr-' + slugify(from) + '-' + slugify(to) + '-' + n; n += 1; }
	const block = ['### ' + id, '', `- Von: ${from}`, `- Zu: ${to}`, `- Typ: ${type}`, `- Begründung: ${rationale}`];
	let headIdx = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (/^##\s*Übergänge\s*$/.test(lines[i])) { headIdx = i; break; }
	}
	if (headIdx === -1) {
		let out = joinLines(lines).trimEnd();
		if (out !== '') out += '\n\n';
		out += '## Übergänge\n\n' + block.join('\n') + '\n';
		return { ok: true, content: out };
	}
	let endIdx = lines.length;
	for (let i = headIdx + 1; i < lines.length; i += 1) {
		if (/^##\s+/.test(lines[i])) { endIdx = i; break; }
	}
	const body = [];
	for (let i = headIdx + 1; i < endIdx; i += 1) {
		const l = lines[i];
		if (l.trim() === 'Keine Übergänge festgelegt.') continue;
		if (l.trim() === '') continue;
		body.push(l);
	}
	const before = lines.slice(0, headIdx + 1);
	const after = lines.slice(endIdx);
	const out = [...before, '', ...block, ...(body.length > 0 ? ['', ...body] : []), '', ...after];
	return { ok: true, content: joinLines(out) };
}

/**
 * Append one decision entry to decisions.yml. Supported layouts:
 * (a) `decisions: []` — replaced by the expanded list;
 * (b) an existing two-space-indented list under `decisions:` extending to the
 *     end of the file — entries appended there.
 * Anything else is rejected rather than guessed at.
 */
export function decisionsAppendEntry(content, entry) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const e = entry ?? {};
	for (const field of ['id', 'date', 'statement', 'evidence']) {
		if (singleLine(e[field]) === '') return { ok: false, reason: `missing-field:${field}` };
	}
	const item = [
		`  - id: ${singleLine(e.id)}`,
		`    date: ${singleLine(e.date)}`,
		`    statement: ${singleLine(e.statement)}`,
		`    evidence: ${singleLine(e.evidence)}`,
		`    recorded_by: ${singleLine(e.recorded_by) || 'pts-background-steward'}`,
	];
	if (/^decisions:\s*\[\]\s*$/m.test(content)) {
		const replaced = content.replace(/^decisions:\s*\[\]\s*$/m, ['decisions:', ...item].join('\n'));
		return { ok: true, content: replaced.endsWith('\n') ? replaced : `${replaced}\n` };
	}
	const lines = toLines(content);
	let last = -1;
	for (let i = 0; i < lines.length; i += 1) if (/^decisions:\s*$/.test(lines[i])) last = i;
	if (last !== -1) {
		const rest = lines.slice(last + 1);
		const extendsToEndOfFile = rest.every((l) => l.trim() === '' || l.startsWith('  '));
		if (extendsToEndOfFile) {
			while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
			return { ok: true, content: joinLines([...lines, ...item, '']) };
		}
	}
	return { ok: false, reason: 'unsupported-decisions-layout' };
}

/**
 * Append one proposed Planning Board item (forced status `proposed`, forced
 * teacher-approval flag). Same conservative layout contract as decisions.
 */
export function boardAppendItem(content, item) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const b = item ?? {};
	for (const field of ['id', 'title', 'kind']) {
		if (singleLine(b[field]) === '') return { ok: false, reason: `missing-field:${field}` };
	}
	if (!BOARD_KINDS.includes(b.kind)) return { ok: false, reason: 'invalid-board-kind' };
	const comment = singleLine(b.rationale)
		? ['', `  # Hintergrund-Steward-Vorschlag (${singleLine(b.turn_ref) || 'Hintergrundlauf'}): ${singleLine(b.rationale)}`]
		: [];
	const entry = [
		`  - id: ${singleLine(b.id)}`,
		`    title: ${singleLine(b.title)}`,
		`    kind: ${b.kind}`,
		'    column: clarify',
		'    status: proposed',
		'    requires_teacher_approval: true',
	];
	if (/^items:\s*\[\]\s*$/m.test(content)) {
		const replaced = content.replace(/^items:\s*\[\]\s*$/m, ['items:', ...comment, ...entry].join('\n'));
		return { ok: true, content: replaced.endsWith('\n') ? replaced : `${replaced}\n` };
	}
	const lines = toLines(content);
	let last = -1;
	for (let i = 0; i < lines.length; i += 1) if (/^items:\s*$/.test(lines[i])) last = i;
	if (last !== -1) {
		const rest = lines.slice(last + 1);
		const extendsToEndOfFile = rest.every((l) => l.trim() === '' || l.startsWith('  '));
		if (extendsToEndOfFile) {
			while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
			return { ok: true, content: joinLines([...lines, ...comment, ...entry, '']) };
		}
	}
	return { ok: false, reason: 'unsupported-board-layout' };
}

/**
 * Append one proposed teaching window to temporal-plan.yml. The entry is
 * forced to `status: proposed` — the steward never creates binding windows.
 * Same conservative YAML layout contract as decisions/board.
 */
export function temporalPlanAppendWindow(content, window) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const w = window ?? {};
	for (const field of ['id', 'title', 'kind', 'duration_minutes']) {
		if (singleLine(w[field]) === '') return { ok: false, reason: `missing-field:${field}` };
	}
	if (!WINDOW_KINDS.includes(w.kind)) return { ok: false, reason: 'invalid-window-kind' };
	const comment = singleLine(w.provenance) ? ['', `  # ${singleLine(w.provenance)}`] : [];
	const entry = [
		`  - id: ${singleLine(w.id)}`,
		`    title: ${singleLine(w.title)}`,
		`    kind: ${w.kind}`,
		`    duration_minutes: ${w.duration_minutes}`,
		`    note: ${singleLine(w.note) || ''}`,
		'    status: proposed',
	];
	return yamlListAppend(content, 'windows', comment, entry);
}

/**
 * Append one proposed placement to temporal-plan.yml (forced status
 * `proposed`). Defense in depth: the referenced window must already exist in
 * the temporal plan and the learning moment in the landscape content.
 */
export function temporalPlanAppendPlacement(content, placement, { landscapeContent } = {}) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const p = placement ?? {};
	for (const field of ['id', 'moment_id', 'window_id', 'start_minute', 'duration_minutes', 'dramaturgical_role', 'mode']) {
		if (singleLine(p[field]) === '') return { ok: false, reason: `missing-field:${field}` };
	}
	if (!DRAMATURGICAL_ROLES.includes(p.dramaturgical_role)) return { ok: false, reason: 'invalid-role' };
	if (!PLACEMENT_MODES.includes(p.mode)) return { ok: false, reason: 'invalid-mode' };
	const windowExists = new RegExp(`^\\s*-\\s*id:\\s*${escapeRegExp(p.window_id)}\\s*$`, 'm').test(content);
	if (!windowExists) return { ok: false, reason: 'unknown-window-id' };
	const momentExists = typeof landscapeContent === 'string'
		&& new RegExp(`^###\\s*${escapeRegExp(p.moment_id)}\\s*$`, 'm').test(landscapeContent);
	if (!momentExists) return { ok: false, reason: 'unknown-moment-id' };
	const comment = singleLine(p.provenance) ? ['', `  # ${singleLine(p.provenance)}`] : [];
	const entry = [
		`  - id: ${singleLine(p.id)}`,
		`    moment_id: ${singleLine(p.moment_id)}`,
		`    window_id: ${singleLine(p.window_id)}`,
		`    start_minute: ${p.start_minute}`,
		`    duration_minutes: ${p.duration_minutes}`,
		`    dramaturgical_role: ${p.dramaturgical_role}`,
		`    mode: ${p.mode}`,
		`    note: ${singleLine(p.note) || ''}`,
		'    status: proposed',
	];
	return yamlListAppend(content, 'placements', comment, entry);
}

/**
 * Shared YAML list append: `key: []` is expanded, an existing
 * two-space-indented list extending to the end of the file receives new
 * entries; anything else is rejected rather than guessed at.
 */
function yamlListAppend(content, key, commentLines, entryLines) {
	const emptyPattern = new RegExp(`^${key}:\\s*\\[\\]\\s*$`, 'm');
	if (emptyPattern.test(content)) {
		const replaced = content.replace(emptyPattern, [key, ...commentLines, ...entryLines].join('\n'));
		return { ok: true, content: replaced.endsWith('\n') ? replaced : `${replaced}\n` };
	}
	const lines = toLines(content);
	const headingPattern = new RegExp(`^${key}:\\s*$`);
	let last = -1;
	for (let i = 0; i < lines.length; i += 1) if (headingPattern.test(lines[i])) last = i;
	if (last !== -1) {
		const rest = lines.slice(last + 1);
		const extendsToEndOfFile = rest.every((l) => l.trim() === '' || l.startsWith('  '));
		if (extendsToEndOfFile) {
			while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
			return { ok: true, content: joinLines([...lines, ...commentLines, ...entryLines, '']) };
		}
	}
	return { ok: false, reason: 'unsupported-yaml-layout' };
}

/**
 * Apply a validated operation batch against the current canonical contents.
 * @param {Map<string, string|null>} baseFiles - file name → current content (null = absent)
 * @param {Array<object>} ops - normalized, policy-checked operations
 * @param {{ dateIso: string, makeId: (prefix: string) => string, turnRef: string }} ctx
 * @returns {{ updates: Map<string, string>, applied: Array<object>, rejected: Array<{op: object, reason: string}> }}
 */
export function applyOperations(baseFiles, ops, ctx) {
	const updates = new Map();
	const applied = [];
	const rejected = [];
	const working = new Map(baseFiles);

	function current(name) {
		return updates.has(name) ? updates.get(name) : working.get(name);
	}
	function stage(name, nextContent, record) {
		updates.set(name, nextContent);
		applied.push(record);
	}

	for (const op of ops ?? []) {
		try {
			const name = op.target;
			if (!CANONICAL_FILES.includes(name)) {
				rejected.push({ op, reason: 'non-canonical-target' });
				continue;
			}
			const content = current(name);
			switch (`${name}:${op.kind}`) {
				// Defense in depth: free-form md sections are allowed only in
				// learning-design.md; the landscape has its own structured op.
				case 'learning-design.md:set-section': {
					const r = mdReplaceSection(content, op.section, op.value);
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, section: op.section });
					break;
				}
				case 'learning-design.md:append-under-section': {
					const r = mdAppendUnderSection(content, op.section, op.value);
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, section: op.section });
					break;
				}
				case 'learning-landscape.md:add-draft-moment': {
					const r = landscapeAppendMoment(content, {
						id: ctx.makeId('lm-steward'),
						title: op.title,
						moment_type: op.moment_type,
						moment_function: op.moment_function,
						learning_activity: op.learning_activity,
						expected_experience: op.expected_experience,
						open_questions: op.open_questions,
						material_needs: op.material_needs,
						provenance: `Hintergrund-Steward, Entwurf nach Turn ${ctx.turnRef}`,
					});
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, id: ctx.makeId.lastValue });
					break;
				}
				case 'learning-landscape.md:add-draft-transition': {
					const r = landscapeAppendTransition(content, {
						from_id: op.from_id,
						to_id: op.to_id,
						transition_type: op.transition_type,
						value: op.value,
					});
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind });
					break;
				}
				case 'decisions.yml:add-decision': {
					const id = ctx.makeId('dec-steward');
					const r = decisionsAppendEntry(content, {
						id,
						date: ctx.dateIso,
						statement: op.value,
						evidence: op.evidence,
						recorded_by: 'pts-background-steward',
					});
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, id });
					break;
				}
				case 'planning-board.yml:propose-board-item': {
					const id = ctx.makeId('pb-steward');
					const r = boardAppendItem(content, {
						id,
						title: op.title,
						kind: op.board_kind,
						rationale: op.value,
						turn_ref: ctx.turnRef,
					});
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, id });
					break;
				}
				case 'temporal-plan.yml:propose-window': {
					const id = ctx.makeId('tw-steward');
					const r = temporalPlanAppendWindow(content, {
						id,
						title: op.title,
						kind: op.window_kind,
						duration_minutes: op.duration_minutes,
						note: op.value,
						provenance: `Hintergrund-Steward-Vorschlag (${ctx.turnRef}), Beleg: ${op.evidence}`,
					});
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, id });
					break;
				}
				case 'temporal-plan.yml:propose-placement': {
					const id = ctx.makeId('tp-steward');
					const r = temporalPlanAppendPlacement(content, {
						id,
						moment_id: op.moment_id,
						window_id: op.window_id,
						start_minute: op.start_minute,
						duration_minutes: op.duration_minutes,
						dramaturgical_role: op.dramaturgical_role,
						mode: op.mode,
						note: op.value,
						provenance: `Hintergrund-Steward-Vorschlag (${ctx.turnRef}), Beleg: ${op.evidence}`,
					}, { landscapeContent: current('learning-landscape.md') });
					if (!r.ok) { rejected.push({ op, reason: r.reason }); break; }
					stage(name, r.content, { target: name, kind: op.kind, id });
					break;
				}
				default:
					rejected.push({ op, reason: `kind-not-allowed-for-target:${op.kind}@${name}` });
			}
		} catch (error) {
			rejected.push({ op, reason: `transform-error:${String(error && error.message || error)}` });
		}
	}
	return { updates, applied, rejected };
}

// makeId with a readable last-value side channel keeps applyOperations pure
// enough for tests while letting records carry the generated id.
export function makeIdFactory(dateIso) {
	const counters = new Map();
	const factory = (prefix) => {
		const n = (counters.get(prefix) ?? 0) + 1;
		counters.set(prefix, n);
		const compact = dateIso.replaceAll('-', '');
		factory.lastValue = `${prefix}-${compact}-${n}`;
		return factory.lastValue;
	};
	factory.lastValue = undefined;
	return factory;
}

