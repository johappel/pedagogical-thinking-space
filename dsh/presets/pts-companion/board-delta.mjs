// Board Revision & Delta — structured "where did it change".
//
// The companion must not re-analyse the whole whiteboard every turn. Instead a
// board change is made available as a structured event: which shapes appeared,
// changed, moved or vanished, on which page, since which revision. The existing
// adapter only produced a German prose line (describeDelta); this module adds
// the structured delta and the revision bookkeeping the context builder needs.
//
// A board revision is a monotonic counter, bumped only when the board's content
// signature actually changes. The companion tracks `companionLastSeenRevision`;
// before a turn it is shown only the delta since that revision.
//
// Change classification (deliberately NOT semantic guessing):
//   new         a shape appeared          → a new teacher note, relevant
//   reformulate a shape's text changed    → a teacher edit, relevant
//   move        only position changed      → spatial only, NOT a decision
//   remove      a shape vanished           → no longer visible, NOT rejected
//
// "Reject / set aside" changes the Denkstand status and lives in denkstand-
// state.mjs; it is a distinct act from removing a projection.

/** Position change below this (tldraw units) counts as noise, not a move. */
export const POSITION_EPSILON = 40;

export const CHANGE = Object.freeze({ NEW: 'new', REFORMULATE: 'reformulate', MOVE: 'move', REMOVE: 'remove' });

function shapeText(shape) {
	return String(shape?.text ?? shape?.clusterTitle ?? shape?.name ?? '').replace(/\s+/g, ' ').trim();
}

/** Collect every shape of a snapshot into one id→shape map (notes, elements, frames). */
export function indexShapes(snapshot) {
	const map = new Map();
	const push = (list, fallbackType) => {
		if (!Array.isArray(list)) return;
		for (const shape of list) {
			const id = shape?.id === undefined || shape?.id === null ? null : String(shape.id);
			if (id === null || map.has(id)) continue;
			map.set(id, { ...shape, id, type: String(shape?.type ?? fallbackType) });
		}
	};
	push(snapshot?.notes, 'note');
	push(snapshot?.elements, 'unknown');
	push(snapshot?.frames, 'frame');
	return map;
}

/** A content signature that ignores nothing but small position jitter. */
export function boardSignature(snapshot) {
	const shapes = [...indexShapes(snapshot).values()].map((shape) => ({
		id: shape.id,
		t: shapeText(shape),
		x: Math.round((shape.x ?? 0) / POSITION_EPSILON),
		y: Math.round((shape.y ?? 0) / POSITION_EPSILON),
	}));
	shapes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const page = snapshot?.page?.id ?? snapshot?.page?.name ?? '';
	return JSON.stringify({ page, shapes });
}

/**
 * The next revision number: unchanged when the content signature is identical,
 * otherwise `previousRevision + 1`.
 */
export function nextRevision(previous, next, previousRevision = 0) {
	const base = Number.isSafeInteger(previousRevision) && previousRevision >= 0 ? previousRevision : 0;
	return boardSignature(previous ?? {}) === boardSignature(next ?? {}) ? base : base + 1;
}

function classifyShapeChange(before, after) {
	const textChanged = shapeText(before) !== shapeText(after);
	if (textChanged) return CHANGE.REFORMULATE;
	const moved = Math.abs((before.x ?? 0) - (after.x ?? 0)) > POSITION_EPSILON
		|| Math.abs((before.y ?? 0) - (after.y ?? 0)) > POSITION_EPSILON;
	return moved ? CHANGE.MOVE : null;
}

/**
 * Structured delta between two board snapshots.
 * @param {object|undefined} previous - the snapshot the companion last saw.
 * @param {object} next - the current snapshot.
 * @param {{ boardRevision?: number, pageId?: string, actor?: string, reason?: string, at?: string }} [meta]
 * @returns {{ boardRevision: number|null, pageId: string|null, actor: string|null,
 *   reason: string|null, timestamp: string|null, createdShapeIds: string[],
 *   updatedShapeIds: string[], movedShapeIds: string[], deletedShapeIds: string[],
 *   affectedShapeIds: string[], changes: object[] }}
 */
export function diffBoard(previous, next, meta = {}) {
	const before = indexShapes(previous);
	const after = indexShapes(next);
	const createdShapeIds = [];
	const updatedShapeIds = [];
	const movedShapeIds = [];
	const deletedShapeIds = [];
	const changes = [];

	for (const [id, shape] of after) {
		if (!before.has(id)) {
			createdShapeIds.push(id);
			changes.push({ shapeId: id, type: CHANGE.NEW, actor: shape.actor ?? null, after: shapeText(shape) });
			continue;
		}
		const kind = classifyShapeChange(before.get(id), shape);
		if (kind === CHANGE.REFORMULATE) {
			updatedShapeIds.push(id);
			changes.push({ shapeId: id, type: CHANGE.REFORMULATE, actor: shape.actor ?? null, before: shapeText(before.get(id)), after: shapeText(shape) });
		} else if (kind === CHANGE.MOVE) {
			movedShapeIds.push(id);
			changes.push({ shapeId: id, type: CHANGE.MOVE, actor: shape.actor ?? null });
		}
	}
	for (const [id, shape] of before) {
		if (!after.has(id)) {
			deletedShapeIds.push(id);
			changes.push({ shapeId: id, type: CHANGE.REMOVE, actor: null, before: shapeText(shape) });
		}
	}
	const affectedShapeIds = [...createdShapeIds, ...updatedShapeIds, ...movedShapeIds, ...deletedShapeIds];
	return {
		boardRevision: Number.isSafeInteger(meta.boardRevision) ? meta.boardRevision : null,
		pageId: meta.pageId ?? next?.page?.id ?? next?.page?.name ?? null,
		actor: meta.actor ?? null,
		reason: meta.reason ?? null,
		timestamp: typeof meta.at === 'string' ? meta.at : null,
		createdShapeIds,
		updatedShapeIds,
		movedShapeIds,
		deletedShapeIds,
		affectedShapeIds,
		changes,
	};
}

/** True when the delta carries a change the companion should be told about. */
export function isMeaningful(delta) {
	return (delta?.createdShapeIds?.length ?? 0) > 0
		|| (delta?.updatedShapeIds?.length ?? 0) > 0
		|| (delta?.deletedShapeIds?.length ?? 0) > 0;
}

function clip(value, max) {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Short, semantic delta lines for the companion context. Pure formatting of the
 * structured delta — moves are named as spatial only, not as decisions.
 * @returns {string[]} zero or more bullet lines (without the leading "- ").
 */
export function summarizeDelta(delta) {
	const lines = [];
	for (const change of delta?.changes ?? []) {
		if (change.type === CHANGE.NEW) lines.push(`neuer Zettel: „${clip(change.after, 60)}“`);
		else if (change.type === CHANGE.REFORMULATE) lines.push(`umformuliert: „${clip(change.before, 40)}“ → „${clip(change.after, 40)}“`);
		else if (change.type === CHANGE.REMOVE) lines.push(`entfernt (nicht mehr sichtbar): „${clip(change.before, 60)}“`);
	}
	const moves = delta?.movedShapeIds?.length ?? 0;
	if (moves > 0) lines.push(`${moves} Element${moves === 1 ? '' : 'e'} verschoben (nur räumlich)`);
	return lines;
}
