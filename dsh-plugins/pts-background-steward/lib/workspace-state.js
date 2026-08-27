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
//   decision (enforced in patch-validator.js); temporal-plan.yml is never a
//   target. Both rules are mirrored here as defense in depth.

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

/** Files the steward may actually modify (temporal-plan is read-only context). */
export const WRITABLE_FILES = Object.freeze([
	'learning-design.md',
	'learning-landscape.md',
	'decisions.yml',
	'planning-board.yml',
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
			if (name === 'temporal-plan.yml') {
				rejected.push({ op, reason: 'temporal-plan-is-not-a-steward-target' });
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
