// pts-landscape — host half.
//
// Two route families over the current Denkraum (workspace of the session):
//
//   GET  /api/pts-landscape?sessionId=<id>
//        -> JSON { root, title, structure, moments, transitions, layout,
//                  temporal, decisions, errors }
//   POST /api/pts-landscape/layout   body { sessionId, layout }
//        -> writes learning-landscape.layout.json (positions only)
//   GET  /api/pts-landscape/materials?sessionId=<id>
//        -> { materials: [relative paths under materials/ and rendered/] }
//   POST /api/pts-landscape/materials body { sessionId, momentId, materials }
//        -> writes `- Materialien: [...]` into the moment block
//   POST /api/pts-landscape/temporal  body { sessionId, title, windows, placements }
//        -> validates + serializes the complete timeline into temporal-plan.yml
//   GET  /api/pts-artifact/raw?sessionId=&file=  (editor read)
//   POST /api/pts-artifact/save      body { sessionId, file, content }
//        -> atomic write of a teacher-edited md/yml/json/txt file inside the
//           Denkraum, with the same hard path boundary as pts-workspaces
//
// No external YAML dependency: the compact parser covers the subset the PTS
// schema files actually use (see pts-denkstand for the same approach).
// The workspace root is resolved per request from the session header cwd.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const inject = ['webServer'];

const ALLOWED_SAVE_EXT = new Set(['.md', '.yml', '.yaml', '.json', '.txt']);
const MAX_SAVE_BYTES = 512 * 1024;
const LANDSCAPE_FILE = 'learning-landscape.md';
const LAYOUT_FILE = 'learning-landscape.layout.json';
const TEMPORAL_FILE = 'temporal-plan.yml';
const DECISIONS_FILE = 'decisions.yml';

// ————————————————————————————————————————————————
// Minimal YAML parser (PTS subset; identical contract to pts-denkstand)
// ————————————————————————————————————————————————

function stripComment(raw) {
	let inSingle = false;
	let inDouble = false;
	let inFlow = 0;
	for (let k = 0; k < raw.length; k++) {
		const ch = raw[k];
		if (ch === "'" && !inDouble) inSingle = !inSingle;
		else if (ch === '"' && !inSingle) inDouble = !inDouble;
		else if (ch === '[' || ch === '{') { if (!inSingle && !inDouble) inFlow += 1; }
		else if (ch === ']' || ch === '}') { if (!inSingle && !inDouble) inFlow = Math.max(0, inFlow - 1); }
		else if (ch === '#' && !inSingle && !inDouble && inFlow === 0) {
			if (k === 0 || /\s/.test(raw[k - 1])) return raw.slice(0, k);
		}
	}
	return raw;
}

function splitFlow(text) {
	const parts = [];
	let depth = 0;
	let cur = '';
	let inSingle = false;
	let inDouble = false;
	for (const ch of String(text)) {
		if (ch === "'" && !inDouble) inSingle = !inSingle;
		else if (ch === '"' && !inSingle) inDouble = !inDouble;
		if (ch === '[' || ch === '{') { if (!inSingle && !inDouble) depth += 1; }
		else if (ch === ']' || ch === '}') { if (!inSingle && !inDouble) depth = Math.max(0, depth - 1); }
		if (ch === ',' && depth === 0 && !inSingle && !inDouble) {
			parts.push(cur);
			cur = '';
		} else {
			cur += ch;
		}
	}
	if (cur.trim() !== '') parts.push(cur);
	return parts;
}

function parseScalar(text) {
	const t = text.trim();
	if (t === '') return null;
	if (t === 'null' || t === '~') return null;
	if (t === 'true') return true;
	if (t === 'false') return false;
	const num = Number(t);
	if (t !== '' && !isNaN(num) && /^-?\d+(\.\d+)?$/.test(t)) return num;
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
	return t;
}

function parseValue(text) {
	if (text.startsWith('[')) {
		const inner = text.slice(1, text.endsWith(']') ? -1 : undefined);
		return splitFlow(inner).map(parseScalar);
	}
	if (text.startsWith('{')) {
		const inner = text.slice(1, text.endsWith('}') ? -1 : undefined);
		const obj = {};
		for (const part of splitFlow(inner)) {
			const m = part.match(/^([^:]+):\s*(.*)$/);
			if (m !== null) obj[m[1].trim()] = parseScalar(m[2]);
		}
		return obj;
	}
	return parseScalar(text);
}

function parseYaml(source) {
	const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
	const nodes = [];
	for (const raw of lines) {
		const line = stripComment(raw);
		if (line.trim() === '') continue;
		const indent = line.length - line.trimStart().length;
		nodes.push({ indent, text: line.trim() });
	}
	let i = 0;

	function mapValue(ownerIndent, inlineValue) {
		const trimmed = inlineValue.trim();
		if (trimmed === '') {
			if (i < nodes.length && nodes[i].indent > ownerIndent) return parseBlock(nodes[i].indent);
			return null;
		}
		return parseValue(trimmed);
	}

	function parseSeq(seqIndent) {
		const out = [];
		while (i < nodes.length && nodes[i].indent === seqIndent && nodes[i].text.startsWith('- ')) {
			const rest = nodes[i].text.slice(2);
			i += 1;
			const keyMatch = rest.match(/^([^:]+):\s*(.*)$/);
			if (keyMatch !== null && !/^[\[{]/.test(rest.trim())) {
				const item = {};
				item[keyMatch[1].trim()] = mapValue(seqIndent, keyMatch[2]);
				let itemIndent = null;
				while (i < nodes.length && nodes[i].indent > seqIndent && !nodes[i].text.startsWith('- ')) {
					const n = nodes[i];
					const km = n.text.match(/^([^:]+):\s*(.*)$/);
					if (km === null) { i += 1; continue; }
					if (itemIndent === null) itemIndent = n.indent;
					if (n.indent !== itemIndent) break;
					i += 1;
					item[km[1].trim()] = mapValue(n.indent, km[2]);
				}
				out.push(item);
			} else if (rest === '') {
				if (i < nodes.length && nodes[i].indent > seqIndent) out.push(parseBlock(nodes[i].indent));
				else out.push(null);
			} else {
				out.push(parseScalar(rest));
			}
		}
		return out;
	}

	function parseBlock(minIndent) {
		const result = [];
		while (i < nodes.length && nodes[i].indent >= minIndent) {
			const node = nodes[i];
			if (node.text.startsWith('- ')) {
				result.push(...parseSeq(node.indent));
				continue;
			}
			const keyMatch = node.text.match(/^([^:]+):\s*(.*)$/);
			if (keyMatch !== null) {
				const key = keyMatch[1].trim();
				i += 1;
				result.push([key, mapValue(node.indent, keyMatch[2])]);
			} else {
				result.push([null, parseScalar(node.text)]);
				i += 1;
			}
		}
		return result;
	}

	function parseRoot() {
		const list = parseBlock(0);
		const obj = {};
		for (const entry of list) {
			if (Array.isArray(entry)) {
				const [key, value] = entry;
				if (key !== null) obj[key] = value;
			} else if (typeof entry === 'object' && !Array.isArray(entry)) {
				Object.assign(obj, entry);
			}
		}
		return obj;
	}

	return parseRoot();
}

// ————————————————————————————————————————————————
// Learning-landscape markdown parser
// ————————————————————————————————————————————————

const MOMENT_FIELD_MAP = {
	'Titel': 'title',
	'Typ': 'type',
	'Funktion': 'function',
	'Lernaktivität': 'learning_activity',
	'Erwartete Lernerfahrung': 'expected_experience',
	'Materialbedarfe': 'material_needs',
	'Materialien': 'materials',
	'Offene Fragen': 'open_questions',
	'Status': 'status',
	'Herkunft': 'provenance',
	'Zeitbedarf': 'time_estimate',
};

const TRANSITION_FIELD_MAP = {
	'Von': 'from',
	'Zu': 'to',
	'Typ': 'type',
	'Begründung': 'reason',
};

/**
 * Parse the landscape markdown (frontmatter + `## Lernmomente` + `## Übergänge`
 * with `### <id>` blocks of `- Feld: value` lines). Indented list values
 * (`- Materialbedarfe:` followed by `  - item`) become arrays; flow lists
 * (`- Materialien: [a, b]`) are split. Unknown blocks are skipped.
 */
export function parseLandscape(raw) {
	const lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
	const result = { front: {}, moments: [], transitions: [] };
	let section = null;
	let current = null;
	let inFront = false;
	let frontLines = [];

	for (let idx = 0; idx < lines.length; idx += 1) {
		const line = lines[idx];
		const trimmed = line.trim();

		if (inFront) {
			if (trimmed === '---') { inFront = false; continue; }
			const m = trimmed.match(/^([^:]+):\s*(.*)$/);
			if (m !== null) result.front[m[1].trim()] = parseScalar(m[2]);
			continue;
		}
		if (trimmed === '---' && idx === 0) { inFront = true; continue; }
		if (trimmed.startsWith('## ')) {
			section = trimmed.slice(3).trim();
			current = null;
			continue;
		}
		if (trimmed.startsWith('### ')) {
			const id = trimmed.slice(4).trim();
			if (section === 'Lernmomente') {
				current = { id, title: '', type: '', function: '', learning_activity: '', expected_experience: '', material_needs: [], materials: [], open_questions: [], status: 'draft', provenance: '' };
				result.moments.push(current);
			} else if (section === 'Übergänge') {
				current = { id, from: '', to: '', type: '', reason: '' };
				result.transitions.push(current);
			} else {
				current = null;
			}
			continue;
		}
		if (current === null) continue;

		if (trimmed.startsWith('- ')) {
			const fieldLine = trimmed.slice(2);
			const fm = fieldLine.match(/^([^:]+):\s*(.*)$/);
			if (fm === null) continue;
			const label = fm[1].trim();
			const value = fm[2].trim();
			if (value !== '') {
				// Materialien is a flow list (`[a, b]` / `[]`); everything else is
				// a scalar or a list-of-items (collected below).
				const parsed = label === 'Materialien' ? parseValue(value) : parseScalar(value);
				assignField(current, label, parsed);
			} else {
				// collect indented list items below the field
				const items = [];
				let j = idx + 1;
				while (j < lines.length && (lines[j].startsWith('  - ') || lines[j].startsWith('    - '))) {
					items.push(lines[j].trim().replace(/^- /, '').trim());
					j += 1;
				}
				assignField(current, label, items);
				idx = j - 1;
			}
		}
	}

	return result;
}

function assignField(target, label, parsedValue) {
	if (label === 'Materialien') {
		target.materials = Array.isArray(parsedValue)
			? parsedValue.filter((v) => typeof v === 'string' && v.trim() !== '')
			: [];
		return;
	}
	const map = 'from' in target ? TRANSITION_FIELD_MAP : MOMENT_FIELD_MAP;
	const key = map[label];
	if (key === undefined) return;
	if (key === 'material_needs' || key === 'open_questions') {
		target[key] = Array.isArray(parsedValue)
			? parsedValue
			: (parsedValue === null || parsedValue === '' ? [] : [parsedValue]);
	} else if (key === 'time_estimate') {
		target[key] = typeof parsedValue === 'number' ? parsedValue : null;
	} else {
		target[key] = Array.isArray(parsedValue)
			? (parsedValue[0] ?? '')
			: (parsedValue === null ? '' : String(parsedValue));
	}
}

/** Parse the layout JSON (positions only; unknown shapes tolerated). */
export function parseLayout(raw) {
	const positions = {};
	if (typeof raw !== 'string' || raw.trim() === '') return { positions };
	try {
		const v = JSON.parse(raw);
		const src = v !== null && typeof v === 'object' && !Array.isArray(v) && v.positions
			? v.positions
			: v;
		if (src !== null && typeof src === 'object') {
			for (const [id, pos] of Object.entries(src)) {
				if (pos !== null && typeof pos === 'object' && typeof pos.x === 'number' && typeof pos.y === 'number') {
					positions[id] = { x: pos.x, y: pos.y };
				}
			}
		}
	} catch {
		// unparsable layout -> empty
	}
	return { positions };
}

// ————————————————————————————————————————————————
// Temporal plan + decisions (YAML subset; same shape as pts-denkstand)
// ————————————————————————————————————————————————

function roleLabel(role) {
	const map = { opening: 'Einstieg', irritation: 'Irritation', exploration: 'Erkundung', deepening: 'Vertiefung', practice: 'Übung', decision: 'Entscheidung', consolidation: 'Sicherung', reflection: 'Reflexion', closing: 'Abschluss', transition: 'Übergang', buffer: 'Puffer', other: 'Sonstiges' };
	return map[role] || role || '—';
}

function modeLabel(mode) {
	const map = { common: 'Gemeinsam', choice: 'Wahl', parallel: 'Parallel', individual: 'Einzeln', group: 'Gruppe', open: 'Offen' };
	return map[mode] || mode || '—';
}

function kindLabel(kind) {
	const map = { lesson: 'Stunde', double_lesson: 'Doppelstunde', project_block: 'Projektblock', open_learning_time: 'Offene Lernzeit' };
	return map[kind] || kind || '—';
}

export function parseTemporal(raw) {
	const tp = parseYaml(raw);
	const windows = Array.isArray(tp.windows) ? tp.windows : [];
	const placements = Array.isArray(tp.placements) ? tp.placements : [];
	const mapPlacement = (p) => ({
		id: p?.id ?? '?',
		moment_id: p?.moment_id ?? '',
		window_id: p?.window_id ?? '',
		start_minute: p?.start_minute ?? null,
		duration_minutes: p?.duration_minutes ?? null,
		dramaturgical_role: p?.dramaturgical_role ?? '',
		role_label: roleLabel(p?.dramaturgical_role),
		mode: p?.mode ?? '',
		mode_label: modeLabel(p?.mode),
		status: typeof p?.status === 'string' ? p.status : 'binding',
		note: typeof p?.note === 'string' ? p.note : '',
	});
	return {
		schema: tp.schema,
		title: typeof tp.title === 'string' ? tp.title : '',
		windows: windows.map((w) => ({
			id: w?.id ?? '?',
			title: typeof w?.title === 'string' ? w.title : 'Unbenannt',
			kind: w?.kind ?? '',
			kind_label: kindLabel(w?.kind),
			duration_minutes: w?.duration_minutes ?? null,
			status: typeof w?.status === 'string' ? w.status : 'binding',
			note: typeof w?.note === 'string' ? w.note : '',
			placements: placements.filter((p) => p !== null && p.window_id === w?.id).map(mapPlacement),
		})),
		// Flat list too — the client reads temporal.placements for assignment
		// status and for every full-timeline save; without it, saves would wipe
		// all placements and the colored feedback would stay empty.
		placements: placements.filter((p) => p !== null).map(mapPlacement),
		empty: windows.length === 0,
	};
}

export function parseDecisions(raw) {
	const dec = parseYaml(raw);
	const decisions = Array.isArray(dec.decisions) ? dec.decisions : [];
	return {
		decisions: decisions.map((d) => ({
			id: d?.id ?? '',
			title: typeof d?.title === 'string' ? d.title : (typeof d?.statement === 'string' ? d.statement : 'Entscheidung'),
			detail: typeof d?.evidence === 'string' ? d.evidence : (typeof d?.note === 'string' ? d.note : ''),
		})),
		empty: decisions.length === 0,
	};
}

// ————————————————————————————————————————————————
// Timeline serialization + validation (Stufe 2: drag&drop writes)
// ————————————————————————————————————————————————

const WINDOW_KINDS = new Set(['lesson', 'double_lesson', 'project_block', 'open_learning_time']);
const ROLES = new Set(['opening', 'irritation', 'exploration', 'deepening', 'practice', 'decision', 'consolidation', 'reflection', 'closing', 'transition', 'buffer', 'other']);
const MODES = new Set(['common', 'choice', 'parallel', 'individual', 'group', 'open']);
const TEMPORAL_STATUSES = new Set(['proposed', 'binding']);

/** Safe YAML scalar (single-quoted when needed; '' for empty). */
function yamlScalar(v) {
	const s = String(v ?? '');
	if (s === '') return "''";
	if (/^[A-Za-z0-9_\-äöüÄÖÜßèéêàáâìíîòóôùúûçñ ]+$/.test(s) && !/^[\s\-?:,{}\[\]#&*!|>'"%@`]/.test(s)) return s;
	return "'" + s.replace(/'/g, "''") + "'";
}

/** Deterministic serialization of the temporal plan (canonical format). */
export function serializeTemporal({ title = '', windows = [], placements = [] } = {}) {
	const out = [];
	out.push('schema: ptspace.temporal-plan/v1');
	if (String(title).trim() !== '') out.push('title: ' + yamlScalar(title));
	out.push('landscape: learning-landscape.md');
	if (!Array.isArray(windows) || windows.length === 0) {
		out.push('windows: []');
	} else {
		out.push('windows:');
		for (const w of windows) {
			out.push('  - id: ' + yamlScalar(w.id));
			out.push('    title: ' + yamlScalar(w.title));
			out.push('    kind: ' + yamlScalar(w.kind));
			out.push('    duration_minutes: ' + Number(w.duration_minutes));
			out.push('    note: ' + yamlScalar(w.note ?? ''));
			out.push('    status: ' + (w.status === 'proposed' ? 'proposed' : 'binding'));
		}
	}
	if (!Array.isArray(placements) || placements.length === 0) {
		out.push('placements: []');
	} else {
		out.push('placements:');
		for (const p of placements) {
			out.push('  - id: ' + yamlScalar(p.id));
			out.push('    moment_id: ' + yamlScalar(p.moment_id));
			out.push('    window_id: ' + yamlScalar(p.window_id));
			out.push('    start_minute: ' + Number(p.start_minute));
			out.push('    duration_minutes: ' + Number(p.duration_minutes));
			out.push('    dramaturgical_role: ' + yamlScalar(p.dramaturgical_role));
			out.push('    mode: ' + yamlScalar(p.mode));
			out.push('    note: ' + yamlScalar(p.note ?? ''));
			out.push('    status: ' + (p.status === 'proposed' ? 'proposed' : 'binding'));
		}
	}
	return out.join('\n') + '\n';
}

/** Structural validation of a teacher-saved timeline; returns error strings. */
export function validateTemporalInput({ title = '', windows = [], placements = [] } = {}) {
	const errors = [];
	if (!Array.isArray(windows) || !Array.isArray(placements)) return ['windows/placements müssen Arrays sein'];
	const windowIds = new Set();
	for (const w of windows) {
		if (w === null || typeof w !== 'object' || typeof w.id !== 'string' || w.id.trim() === '') {
			errors.push('Fenster ohne id');
			continue;
		}
		if (windowIds.has(w.id)) errors.push('Doppelte Fenster-ID: ' + w.id);
		windowIds.add(w.id);
		if (typeof w.title !== 'string' || w.title.trim() === '') errors.push('Fenster ' + w.id + ': Titel fehlt');
		if (!WINDOW_KINDS.has(w.kind)) errors.push('Fenster ' + w.id + ': kind unzulässig (' + String(w.kind) + ')');
		const wDur = Number(w.duration_minutes);
		if (!Number.isInteger(wDur) || wDur <= 0) errors.push('Fenster ' + w.id + ': duration_minutes ungültig');
		if (w.status !== undefined && !TEMPORAL_STATUSES.has(w.status)) errors.push('Fenster ' + w.id + ': status unzulässig');
	}
	const placementIds = new Set();
	for (const p of placements) {
		if (p === null || typeof p !== 'object' || typeof p.id !== 'string' || p.id.trim() === '') {
			errors.push('Platzierung ohne id');
			continue;
		}
		if (placementIds.has(p.id)) errors.push('Doppelte Platzierungs-ID: ' + p.id);
		placementIds.add(p.id);
		if (typeof p.moment_id !== 'string' || p.moment_id.trim() === '') errors.push('Platzierung ' + p.id + ': moment_id fehlt');
		if (typeof p.window_id !== 'string' || !windowIds.has(p.window_id)) errors.push('Platzierung ' + p.id + ': window_id unbekannt');
		const pStart = Number(p.start_minute);
		if (!Number.isInteger(pStart) || pStart < 0) errors.push('Platzierung ' + p.id + ': start_minute ungültig');
		const pDur = Number(p.duration_minutes);
		if (!Number.isInteger(pDur) || pDur <= 0) errors.push('Platzierung ' + p.id + ': duration_minutes ungültig');
		if (!ROLES.has(p.dramaturgical_role)) errors.push('Platzierung ' + p.id + ': dramaturgical_role unzulässig');
		if (!MODES.has(p.mode)) errors.push('Platzierung ' + p.id + ': mode unzulässig');
		if (p.status !== undefined && !TEMPORAL_STATUSES.has(p.status)) errors.push('Platzierung ' + p.id + ': status unzulässig');
	}
	return errors;
}

/**
 * Set (or clear with minutes=null) the `- Zeitbedarf: <min>` line of one
 * moment block — a teacher time estimate for planning completeness.
 */
export function setMomentEstimate(content, momentId, minutes) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const id = String(momentId ?? '').trim();
	const lines = content.split(/\r?\n/);
	let blockStart = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i].trim() === '### ' + id) { blockStart = i; break; }
	}
	if (blockStart === -1) return { ok: false, reason: 'unknown-moment-id' };
	let blockEnd = lines.length;
	for (let i = blockStart + 1; i < lines.length; i += 1) {
		const t = lines[i].trim();
		if (t.startsWith('### ') || t.startsWith('## ')) { blockEnd = i; break; }
	}
	let idx = -1;
	for (let i = blockStart; i < blockEnd; i += 1) {
		if (/^\s*- Zeitbedarf:/.test(lines[i])) { idx = i; break; }
	}
	const value = Number(minutes);
	if (!Number.isFinite(value) || value <= 0) {
		// clear the estimate
		if (idx !== -1) lines.splice(idx, 1);
		return { ok: true, content: lines.join('\n') };
	}
	const line = '- Zeitbedarf: ' + Math.round(value);
	if (idx !== -1) {
		lines[idx] = line;
	} else {
		let insertAt = blockEnd;
		for (let i = blockStart; i < blockEnd; i += 1) {
			if (/^\s*- Status:/.test(lines[i])) { insertAt = i; break; }
		}
		lines.splice(insertAt, 0, line);
	}
	return { ok: true, content: lines.join('\n') };
}

/**
 * Set the `- Materialien: [...]` line of one moment block in the landscape
 * markdown (creates the line when missing, before `- Status:` if present).
 */
export function setMomentMaterials(content, momentId, materials) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const id = String(momentId ?? '').trim();
	const list = (Array.isArray(materials) ? materials : []).filter((m) => typeof m === 'string' && m.trim() !== '');
	const lines = content.split(/\r?\n/);
	let blockStart = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i].trim() === '### ' + id) { blockStart = i; break; }
	}
	if (blockStart === -1) return { ok: false, reason: 'unknown-moment-id' };
	let blockEnd = lines.length;
	for (let i = blockStart + 1; i < lines.length; i += 1) {
		const t = lines[i].trim();
		if (t.startsWith('### ') || t.startsWith('## ')) { blockEnd = i; break; }
	}
	const flow = list.length === 0 ? '[]' : '[' + list.map((m) => yamlScalar(m)).join(', ') + ']';
	const materialLine = '- Materialien: ' + flow;
	let replaced = false;
	for (let i = blockStart; i < blockEnd; i += 1) {
		if (/^\s*- Materialien:/.test(lines[i])) {
			lines[i] = materialLine;
			replaced = true;
			break;
		}
	}
	if (!replaced) {
		let insertAt = blockEnd;
		for (let i = blockStart; i < blockEnd; i += 1) {
			if (/^\s*- Status:/.test(lines[i])) { insertAt = i; break; }
		}
		lines.splice(insertAt, 0, materialLine);
	}
	return { ok: true, content: lines.join('\n') };
}

// ————————————————————————————————————————————————
// Workspace + file helpers
// ————————————————————————————————————————————————

function toPosix(p) {
	return String(p).split(path.sep).join('/');
}

function sendJson(res, status, obj) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(JSON.stringify(obj));
}

function isContained(rootReal, targetReal) {
	const rel = path.relative(rootReal, targetReal);
	return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Atomic write inside dir (temp file + rename), same pattern as the steward. */
export async function atomicWriteFile(dir, name, content) {
	const tmp = path.join(dir, `.${name}.pts-landscape-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
	await fsp.writeFile(tmp, content, 'utf8');
	try {
		await fsp.rename(tmp, path.join(dir, name));
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
}

/**
 * Resolve a teacher-supplied relative file against the workspace with a hard
 * boundary: the parent directory must exist and resolve inside the workspace,
 * the extension must be allowed, and the content size must be bounded.
 */
export async function resolveWorkspaceFile(workspaceDir, file, byteLength) {
	const rel = String(file ?? '').replace(/\\/g, '/').trim();
	if (rel === '' || rel.includes('..') || path.isAbsolute(rel)) return { ok: false, reason: 'outside' };
	if (byteLength > MAX_SAVE_BYTES) return { ok: false, reason: 'too-large' };
	const target = path.resolve(workspaceDir, rel);
	const ext = path.extname(target).toLowerCase();
	if (!ALLOWED_SAVE_EXT.has(ext)) return { ok: false, reason: 'extension-not-allowed' };
	const parentReal = await fsp.realpath(path.dirname(target)).catch(() => null);
	if (parentReal === null || !isContained(workspaceDir, parentReal)) return { ok: false, reason: 'outside' };
	return { ok: true, target: path.join(parentReal, path.basename(target)) };
}

// ————————————————————————————————————————————————
// Plugin entry
// ————————————————————————————————————————————————

export function apply(ctx) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined) {
		console.error('[pts-landscape] webServer service missing - plugin inactive');
		return;
	}
	const sessionsStore = ctx.get('sessions');
	const policy = ctx.get('sandboxPolicy');
	const fallbackRoot = policy !== undefined && typeof policy.workspaceRoot === 'string'
		? policy.workspaceRoot
		: process.cwd();

	function sessionWorkspace(sessionId) {
		if (typeof sessionId !== 'string' || sessionId === '' || sessionsStore === undefined) return null;
		try {
			const session = sessionsStore.get(sessionId);
			const header = session !== undefined && session !== null ? session.header : undefined;
			if (header !== undefined && header !== null && typeof header.cwd === 'string' && header.cwd.trim() !== '') {
				return header.cwd;
			}
		} catch {
			// live data guard
		}
		return null;
	}

	async function readWorkspaceFile(base, relName) {
		try {
			const abs = path.resolve(base, relName);
			const stat = await fsp.stat(abs).catch(() => null);
			if (stat === null || !stat.isFile()) return { ok: false, missing: true };
			const raw = await fsp.readFile(abs, 'utf8');
			return { ok: true, raw };
		} catch (e) {
			return { ok: false, error: String(e && e.message ? e.message : e) };
		}
	}

	function readBody(req) {
		return new Promise((resolve, reject) => {
			const chunks = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			req.on('error', reject);
		});
	}

	// — GET /api/pts-landscape
	const disposeGet = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape',
		handler: async (req, res) => {
			try {
				const rawUrl = typeof req.url === 'string' ? req.url : '';
				const qIndex = rawUrl.indexOf('?');
				const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
				let sessionId = '';
				for (const part of query.split('&')) {
					const eq = part.indexOf('=');
					if (eq <= 0) continue;
					const key = part.slice(0, eq);
					const value = decodeURIComponent(part.slice(eq + 1));
					if (key === 'sessionId') sessionId = value;
				}

				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const result = {
					root: toPosix(base),
					title: '',
					structure: '',
					moments: [],
					transitions: [],
					layout: { positions: {} },
					temporal: null,
					decisions: null,
					errors: [],
				};

				const landscape = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (landscape.ok) {
					try {
						const parsed = parseLandscape(landscape.raw);
						result.title = typeof parsed.front.title === 'string' ? parsed.front.title : '';
						result.structure = typeof parsed.front.structure === 'string' ? parsed.front.structure : '';
						result.moments = parsed.moments;
						result.transitions = parsed.transitions;
					} catch (e) {
						result.errors.push({ file: LANDSCAPE_FILE, message: 'Landscape-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) });
					}
				} else if (landscape.missing) {
					result.errors.push({ file: LANDSCAPE_FILE, message: 'learning-landscape.md fehlt im Denkraum.' });
				}

				const layout = await readWorkspaceFile(base, LAYOUT_FILE);
				if (layout.ok) {
					try { result.layout = parseLayout(layout.raw); }
					catch { result.layout = { positions: {} }; }
				}

				const temporal = await readWorkspaceFile(base, TEMPORAL_FILE);
				if (temporal.ok) {
					try { result.temporal = parseTemporal(temporal.raw); }
					catch (e) { result.errors.push({ file: TEMPORAL_FILE, message: 'YAML-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) }); }
				}

				const decisions = await readWorkspaceFile(base, DECISIONS_FILE);
				if (decisions.ok) {
					try { result.decisions = parseDecisions(decisions.raw); }
					catch (e) { result.errors.push({ file: DECISIONS_FILE, message: 'YAML-Parsing fehlgeschlagen: ' + String(e && e.message ? e.message : e) }); }
				}

				sendJson(res, 200, result);
			} catch (e) {
				sendJson(res, 500, { error: 'internal' });
			}
		},
	});

	// — POST /api/pts-landscape/layout (positions only, no semantic change)
	const disposeLayout = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/layout',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const layout = body.layout;
				if (layout === null || typeof layout !== 'object') {
					sendJson(res, 400, { ok: false, error: 'layout fehlt' });
					return;
				}
				const payload = { schema: 'ptspace.learning-landscape.layout/v1', positions: layout.positions ?? layout };
				await atomicWriteFile(base, LAYOUT_FILE, JSON.stringify(payload, null, 2) + '\n');
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	async function listFilesUnder(baseDir, maxDepth) {
		const out = [];
		async function walk(dir, depth) {
			if (depth > maxDepth) return;
			let entries;
			try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
			for (const e of entries) {
				const name = e.name;
				if (name.startsWith('.') || name.endsWith('.tmp')) continue;
				const abs = path.join(dir, name);
				if (e.isDirectory()) await walk(abs, depth + 1);
				else if (e.isFile()) out.push(toPosix(path.relative(baseDir, abs)));
			}
		}
		await walk(baseDir, 0);
		return out.sort();
	}

	// — /api/pts-landscape/materials (GET: list files for assignment;
	//   POST: assign material ids to a moment). One exact route, dispatched by
	//   method — the web server rejects duplicate exact paths.
	const disposeMaterials = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/materials',
		handler: async (req, res) => {
			try {
				const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
				if (method === 'GET') {
					const rawUrl = typeof req.url === 'string' ? req.url : '';
					const qIndex = rawUrl.indexOf('?');
					const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
					let sessionId = '';
					for (const part of query.split('&')) {
						const eq = part.indexOf('=');
						if (eq <= 0) continue;
						const key = part.slice(0, eq);
						const value = decodeURIComponent(part.slice(eq + 1));
						if (key === 'sessionId') sessionId = value;
					}
					const base = sessionWorkspace(sessionId) ?? fallbackRoot;
					const materials = [];
					for (const sub of ['materials', 'rendered']) {
						const dir = path.join(base, sub);
						const stat = await fsp.stat(dir).catch(() => null);
						if (stat === null || !stat.isDirectory()) continue;
						const files = await listFilesUnder(dir, 5);
						for (const f of files) materials.push(f);
					}
					sendJson(res, 200, { materials });
					return;
				}
				if (method === 'POST') {
					const body = JSON.parse(await readBody(req) || '{}');
					const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
					const momentId = typeof body.momentId === 'string' ? body.momentId : '';
					const materials = Array.isArray(body.materials) ? body.materials : [];
					const base = sessionWorkspace(sessionId) ?? fallbackRoot;
					const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
					if (!file.ok || file.missing) {
						sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
						return;
					}
					const r = setMomentMaterials(file.raw, momentId, materials);
					if (!r.ok) {
						sendJson(res, 400, { ok: false, error: r.reason === 'unknown-moment-id' ? 'Lernmoment nicht gefunden' : 'Datei fehlt' });
						return;
					}
					await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
					sendJson(res, 200, { ok: true });
					return;
				}
				sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt' });
			} catch (e) {
				sendJson(res, method === 'POST' ? 400 : 500, { ok: false, error: method === 'POST' ? String(e && e.message ? e.message : e) : 'internal' });
			}
		},
	});

	// — POST /api/pts-landscape/moment-estimate (teacher time estimate per moment)
	const disposeEstimate = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/moment-estimate',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const momentId = typeof body.momentId === 'string' ? body.momentId : '';
				const minutes = body.minutes;
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const file = await readWorkspaceFile(base, LANDSCAPE_FILE);
				if (!file.ok || file.missing) {
					sendJson(res, 404, { ok: false, error: 'learning-landscape.md nicht lesbar' });
					return;
				}
				const r = setMomentEstimate(file.raw, momentId, minutes);
				if (!r.ok) {
					sendJson(res, 400, { ok: false, error: r.reason === 'unknown-moment-id' ? 'Lernmoment nicht gefunden' : 'Datei fehlt' });
					return;
				}
				await atomicWriteFile(base, LANDSCAPE_FILE, r.content);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — POST /api/pts-landscape/temporal (full validated timeline write)
	const disposeTemporal = webServer.register({
		kind: 'exact',
		path: '/api/pts-landscape/temporal',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const errors = validateTemporalInput({
					title: body.title,
					windows: body.windows,
					placements: body.placements,
				});
				if (errors.length > 0) {
					sendJson(res, 400, { ok: false, error: errors.slice(0, 5).join('; ') });
					return;
				}
				const yaml = serializeTemporal({
					title: body.title,
					windows: body.windows,
					placements: body.placements,
				});
				await atomicWriteFile(base, TEMPORAL_FILE, yaml);
				sendJson(res, 200, { ok: true });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	// — GET /api/pts-artifact/raw (read a file for the editor; boundary-checked)
	const disposeRaw = webServer.register({
		kind: 'exact',
		path: '/api/pts-artifact/raw',
		handler: async (req, res) => {
			try {
				const rawUrl = typeof req.url === 'string' ? req.url : '';
				const qIndex = rawUrl.indexOf('?');
				const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
				let sessionId = '';
				let file = '';
				for (const part of query.split('&')) {
					const eq = part.indexOf('=');
					if (eq <= 0) continue;
					const key = part.slice(0, eq);
					const value = decodeURIComponent(part.slice(eq + 1));
					if (key === 'sessionId') sessionId = value;
					else if (key === 'file') file = value;
				}
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const resolved = await resolveWorkspaceFile(base, file, 0);
				if (!resolved.ok) {
					sendJson(res, 400, { ok: false, error: 'Pfad außerhalb des Denkraums oder Dateityp nicht erlaubt' });
					return;
				}
				const stat = await fsp.stat(resolved.target).catch(() => null);
				if (stat === null || !stat.isFile()) {
					sendJson(res, 404, { ok: false, error: 'Datei nicht gefunden' });
					return;
				}
				const content = await fsp.readFile(resolved.target, 'utf8');
				sendJson(res, 200, { ok: true, content });
			} catch (e) {
				sendJson(res, 500, { error: 'internal' });
			}
		},
	});

	// — POST /api/pts-artifact/save (teacher edits; hard path boundary)
	const disposeSave = webServer.register({
		kind: 'exact',
		path: '/api/pts-artifact/save',
		handler: async (req, res) => {
			try {
				const body = JSON.parse(await readBody(req) || '{}');
				const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
				const file = typeof body.file === 'string' ? body.file : '';
				const content = typeof body.content === 'string' ? body.content : null;
				if (content === null) {
					sendJson(res, 400, { ok: false, error: 'content fehlt' });
					return;
				}
				const base = sessionWorkspace(sessionId) ?? fallbackRoot;
				const resolved = await resolveWorkspaceFile(base, file, Buffer.byteLength(content, 'utf8'));
				if (!resolved.ok) {
					sendJson(res, 400, { ok: false, error: resolved.reason === 'outside' ? 'Pfad außerhalb des Denkraums' : (resolved.reason === 'extension-not-allowed' ? 'Dateityp nicht erlaubt' : 'Datei zu groß') });
					return;
				}
				await atomicWriteFile(path.dirname(resolved.target), path.basename(resolved.target), content);
				sendJson(res, 200, { ok: true, path: toPosix(path.relative(base, resolved.target)) });
			} catch (e) {
				sendJson(res, 400, { ok: false, error: String(e && e.message ? e.message : e) });
			}
		},
	});

	ctx.effect(() => disposeGet, 'pts-landscape: route /api/pts-landscape');
	ctx.effect(() => disposeLayout, 'pts-landscape: route /api/pts-landscape/layout');
	ctx.effect(() => disposeMaterials, 'pts-landscape: route /api/pts-landscape/materials');
	ctx.effect(() => disposeEstimate, 'pts-landscape: route /api/pts-landscape/moment-estimate');
	ctx.effect(() => disposeTemporal, 'pts-landscape: route /api/pts-landscape/temporal');
	ctx.effect(() => disposeRaw, 'pts-landscape: route /api/pts-artifact/raw');
	ctx.effect(() => disposeSave, 'pts-landscape: route /api/pts-artifact/save');

	console.log('[pts-landscape] host half active; routes: /api/pts-landscape (+layout, +materials, +temporal), /api/pts-artifact/raw|save');
}
