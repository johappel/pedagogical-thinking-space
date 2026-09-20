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
// Layout parser
// ————————————————————————————————————————————————

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

// ————————————————————————————————————————————————
// Workspace + file helpers
// ————————————————————————————————————————————————

