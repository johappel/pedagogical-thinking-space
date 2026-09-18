// Learning-moment transitions — a content-free sidecar
// (`learning-moment-transitions.json`). Transitions were the `## Übergänge`
// section of the removed `learning-landscape.md`; they are edges between
// canonical moments (`from`/`to` are domainIds) and carry no moment content, so
// they live beside the domain store as a pure projection/relationship sidecar.

export const TRANSITIONS_SCHEMA = 'ptspace.learning-moment-transitions/v1';
export const TRANSITIONS_FILE = 'learning-moment-transitions.json';

const TYPES = new Set(['sequence', 'contrast', 'deepening', 'branch', 'loop', 'alternative']);

export function emptyTransitions() {
	return { schema: TRANSITIONS_SCHEMA, transitions: [] };
}

export function parseTransitions(raw) {
	if (raw === undefined || raw === null || String(raw).trim() === '') return emptyTransitions();
	let value;
	try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return emptyTransitions(); }
	if (!value || value.schema !== TRANSITIONS_SCHEMA || !Array.isArray(value.transitions)) return emptyTransitions();
	return {
		schema: TRANSITIONS_SCHEMA,
		transitions: value.transitions
			.filter((t) => t && typeof t.id === 'string' && typeof t.from === 'string' && typeof t.to === 'string')
			.map((t) => ({ id: t.id, from: t.from, to: t.to, type: typeof t.type === 'string' ? t.type : 'sequence', reason: typeof t.reason === 'string' ? t.reason : '' })),
	};
}

export function serializeTransitions(store) {
	const transitions = [...(store?.transitions ?? [])]
		.filter((t) => t && typeof t.id === 'string')
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((t) => ({ id: t.id, from: t.from, to: t.to, type: t.type, reason: t.reason ?? '' }));
	return JSON.stringify({ schema: TRANSITIONS_SCHEMA, transitions }, null, 2) + '\n';
}

/** Add a transition. from/to must be two different moments; type must be known. */
export function addTransition(store, { from, to, type, rationale } = {}) {
	const f = typeof from === 'string' ? from.trim() : '';
	const t = typeof to === 'string' ? to.trim() : '';
	if (f === '' || t === '' || f === t) return { ok: false, reason: 'invalid-transition' };
	const kind = typeof type === 'string' && TYPES.has(type) ? type : (type === undefined || type === '' ? 'sequence' : null);
	if (kind === null) return { ok: false, reason: 'invalid-type' };
	const id = `tr-${f}-${t}`;
	if ((store.transitions ?? []).some((x) => x.id === id)) return { ok: true, store };
	const transition = { id, from: f, to: t, type: kind, reason: typeof rationale === 'string' ? rationale : '' };
	return { ok: true, store: { ...store, transitions: [...store.transitions, transition] } };
}

export function removeTransition(store, id) {
	if (!(store.transitions ?? []).some((t) => t.id === id)) return { ok: false, reason: 'unknown-transition-id' };
	return { ok: true, store: { ...store, transitions: store.transitions.filter((t) => t.id !== id) } };
}
