// Shared existing PTS landscape/temporal parsers and serializers.
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

export function parseYaml(source) {
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

/** Parse the layout JSON (positions + group bands; unknown shapes tolerated). */
export function parseLayout(raw) {
	const positions = {};
	const groups = [];
	if (typeof raw !== 'string' || raw.trim() === '') return { positions, groups };
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
		if (v !== null && typeof v === 'object' && Array.isArray(v.groups)) {
			for (const g of v.groups) {
				if (g !== null && typeof g === 'object' && typeof g.id === 'string' && g.id.trim() !== '') {
					groups.push({
						id: g.id,
						title: typeof g.title === 'string' ? g.title : g.id,
						y: typeof g.y === 'number' ? g.y : 0,
						height: typeof g.height === 'number' ? g.height : 130,
					});
				}
			}
		}
	} catch {
		// unparsable layout -> empty
	}
	return { positions, groups };
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

/**
 * Read a material file's YAML frontmatter (id/title/kind/status/
 * related_moments/description). Returns null for files without frontmatter.
 */
export function parseMaterialMeta(raw) {
	if (typeof raw !== 'string') return null;
	const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
	if (m === null) return null;
	const yaml = parseYaml(m[1]);
	if (yaml === null || typeof yaml !== 'object') return null;
	return {
		id: typeof yaml.id === 'string' ? yaml.id : null,
		title: typeof yaml.title === 'string' ? yaml.title : null,
		kind: typeof yaml.kind === 'string' ? yaml.kind : null,
		status: typeof yaml.status === 'string' ? yaml.status : null,
		related_moments: Array.isArray(yaml.related_moments) ? yaml.related_moments.filter((x) => typeof x === 'string') : [],
		description: typeof yaml.description === 'string' ? yaml.description : '',
	};
}

// ————————————————————————————————————————————————
// Timeline serialization + validation (Stufe 2: drag&drop writes)
// ————————————————————————————————————————————————

const WINDOW_KINDS = new Set(['lesson', 'double_lesson', 'project_block', 'open_learning_time']);
const ROLES = new Set(['opening', 'irritation', 'exploration', 'deepening', 'practice', 'decision', 'consolidation', 'reflection', 'closing', 'transition', 'buffer', 'other']);
const MODES = new Set(['common', 'choice', 'parallel', 'individual', 'group', 'open']);
const TEMPORAL_STATUSES = new Set(['proposed', 'binding']);
const TRANSITION_TYPES = new Set(['required', 'choice', 'parallel', 'return', 'meeting_point', 'prerequisite']);

function slugify(s) {
	return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'x';
}

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
 * Append one transition (`### tr-<from>-<to>` block) under `## Übergänge`,
 * creating the section when missing and removing the scaffold placeholder
 * "Keine Übergänge festgelegt." on first use. IDs stay unique.
 */
export function addTransition(content, tr) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const from = String(tr?.from ?? '').trim();
	const to = String(tr?.to ?? '').trim();
	const type = String(tr?.type ?? 'required').trim();
	const rationale = String(tr?.rationale ?? '').trim();
	if (from === '' || to === '' || from === to) return { ok: false, reason: 'invalid-transition' };
	if (!TRANSITION_TYPES.has(type)) return { ok: false, reason: 'invalid-type' };
	const lines = content.split(/\r?\n/);
	const taken = new Set();
	for (const l of lines) {
		const m = l.trim().match(/^### (tr-[\w-]+)$/);
		if (m) taken.add(m[1]);
	}
	let id = 'tr-' + slugify(from) + '-' + slugify(to);
	let n = 2;
	while (taken.has(id)) { id = 'tr-' + slugify(from) + '-' + slugify(to) + '-' + n; n += 1; }
	const block = ['### ' + id, '', '- Von: ' + from, '- Zu: ' + to, '- Typ: ' + type, '- Begründung: ' + (rationale || '(keine)')];
	let headIdx = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (/^##\s*Übergänge\s*$/.test(lines[i])) { headIdx = i; break; }
	}
	if (headIdx === -1) {
		let out = lines.join('\n').trimEnd();
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
	return { ok: true, content: out.join('\n') };
}

/**
 * Remove one transition block (`### <id>`) from the landscape markdown.
 */
export function removeTransition(content, id) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const target = String(id ?? '').trim();
	if (target === '') return { ok: false, reason: 'invalid-id' };
	const lines = content.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i].trim() === '### ' + target) { start = i; break; }
	}
	if (start === -1) return { ok: false, reason: 'unknown-transition-id' };
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i += 1) {
		const t = lines[i].trim();
		if (t.startsWith('### ') || t.startsWith('## ')) { end = i; break; }
	}
	return { ok: true, content: lines.slice(0, start).concat(lines.slice(end)).join('\n') };
}

/**
 * Rebuild one moment block from current values merged with an update
 * (`fields` may carry any of title/type/function/learning_activity/
 * expected_experience/material_needs/open_questions; everything else,
 * including materials/status/provenance, is preserved).
 */
export function updateMoment(content, momentId, fields) {
	if (typeof content !== 'string') return { ok: false, reason: 'file-missing-or-absent' };
	const id = String(momentId ?? '').trim();
	const lines = content.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i].trim() === '### ' + id) { start = i; break; }
	}
	if (start === -1) return { ok: false, reason: 'unknown-moment-id' };
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i += 1) {
		const t = lines[i].trim();
		if (t.startsWith('### ') || t.startsWith('## ')) { end = i; break; }
	}
	const cur = readMomentBlock(lines, start, end);
	const merged = {
		title: fields.title !== undefined ? fields.title : cur.title,
		type: fields.type !== undefined ? fields.type : cur.type,
		function: fields.function !== undefined ? fields.function : cur.function,
		learning_activity: fields.learning_activity !== undefined ? fields.learning_activity : cur.learning_activity,
		expected_experience: fields.expected_experience !== undefined ? fields.expected_experience : cur.expected_experience,
		material_needs: Array.isArray(fields.material_needs) ? fields.material_needs : cur.material_needs,
		materials: Array.isArray(fields.materials) ? fields.materials : cur.materials,
		open_questions: Array.isArray(fields.open_questions) ? fields.open_questions : cur.open_questions,
		status: cur.status,
		provenance: cur.provenance,
		time_estimate: fields.time_estimate !== undefined ? (typeof fields.time_estimate === 'number' ? fields.time_estimate : null) : cur.time_estimate,
	};
	const block = buildMomentBlock(id, merged);
	return { ok: true, content: lines.slice(0, start).concat(block).concat(lines.slice(end)).join('\n') };
}

function buildMomentBlock(id, m) {
	const lines = ['### ' + id, ''];
	lines.push('- Titel: ' + yamlScalar(m.title || ''));
	lines.push('- Typ: ' + yamlScalar(m.type || 'other'));
	lines.push('- Funktion: ' + yamlScalar(m.function || ''));
	lines.push('- Lernaktivität: ' + yamlScalar(m.learning_activity || ''));
	lines.push('- Erwartete Lernerfahrung: ' + yamlScalar(m.expected_experience || ''));
	if (Array.isArray(m.material_needs) && m.material_needs.length > 0) {
		lines.push('- Materialbedarfe:');
		for (const x of m.material_needs) lines.push('  - ' + x);
	} else {
		lines.push('- Materialbedarfe: []');
	}
	lines.push('- Materialien: ' + (Array.isArray(m.materials) && m.materials.length > 0
		? '[' + m.materials.map((x) => yamlScalar(x)).join(', ') + ']'
		: '[]'));
	if (Array.isArray(m.open_questions) && m.open_questions.length > 0) {
		lines.push('- Offene Fragen:');
		for (const x of m.open_questions) lines.push('  - ' + x);
	} else {
		lines.push('- Offene Fragen: []');
	}
	if (typeof m.time_estimate === 'number' && Number.isFinite(m.time_estimate) && m.time_estimate > 0) {
		lines.push('- Zeitbedarf: ' + Math.round(m.time_estimate));
	}
	lines.push('- Status: ' + yamlScalar(m.status || 'draft'));
	if (m.provenance) lines.push('- Herkunft: ' + yamlScalar(m.provenance));
	return lines;
}

/** Read one moment block's fields (for updateMoment merge). */
function readMomentBlock(lines, start, end) {
	const m = { title: '', type: '', function: '', learning_activity: '', expected_experience: '', material_needs: [], materials: [], open_questions: [], status: 'draft', provenance: '', time_estimate: null };
	for (let i = start + 1; i < end; i += 1) {
		const t = lines[i].trim();
		if (!t.startsWith('- ')) continue;
		const fm = t.slice(2).match(/^([^:]+):\s*(.*)$/);
		if (fm === null) continue;
		const lab = fm[1].trim();
		const val = fm[2].trim();
		if (lab === 'Titel' || lab === 'Typ' || lab === 'Funktion' || lab === 'Lernaktivität'
			|| lab === 'Erwartete Lernerfahrung' || lab === 'Status' || lab === 'Herkunft' || lab === 'Zeitbedarf') {
			const parsed = parseScalar(val);
			const key = { Titel: 'title', Typ: 'type', Funktion: 'function', Lernaktivität: 'learning_activity', 'Erwartete Lernerfahrung': 'expected_experience', Status: 'status', Herkunft: 'provenance', Zeitbedarf: 'time_estimate' }[lab];
			m[key] = key === 'time_estimate' ? (typeof parsed === 'number' ? parsed : null) : (parsed === null ? '' : String(parsed));
		} else if (lab === 'Materialien') {
			m.materials = Array.isArray(parseValue(val)) ? parseValue(val).filter((x) => typeof x === 'string' && x.trim() !== '') : [];
		} else if (lab === 'Materialbedarfe' || lab === 'Offene Fragen') {
			const items = [];
			let j = i + 1;
			while (j < end && (lines[j].startsWith('  - ') || lines[j].startsWith('    - '))) {
				items.push(lines[j].trim().replace(/^- /, '').trim());
				j += 1;
			}
			if (lab === 'Materialbedarfe') m.material_needs = items;
			else m.open_questions = items;
			i = j - 1;
		}
	}
	return m;
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

