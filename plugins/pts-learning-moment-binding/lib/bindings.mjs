// Projection ledger — a PURE projection sidecar (`learning-moment-bindings.json`).
//
// It answers exactly one question: which board projection belongs to which
// canonical `domainId`. It carries NO title, content, pedagogical status or
// canonical version — those live only in the LearningMoment domain store
// (domain.mjs). A projection records the domain `boundVersion` it was last
// aligned to, so a stale background board op is detectable, but the version
// itself is owned by the domain and passed in here.
//
//     domainId     = lm-danke           (the pedagogical object, in the store)
//     projectionId = wb-proj-101        (one board representation, here)
//     projectionId = wb-proj-102        (another board representation, here)
//
// The move/copy distinction is explicit and NOT decided by comparing text:
//   moveProjection  keeps the projectionId, changes only its page/position;
//   addProjection   gives the SAME LearningMoment an ADDITIONAL representation
//                   with a NEW projectionId.

export const LEDGER_SCHEMA = 'ptspace.learning-moment-bindings/v1';

export class BindingError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = 'BindingError';
		this.code = code;
		this.details = details;
	}
}

const DOMAIN_ID = /^lm-[a-z0-9][a-z0-9-]*$/;
const isDomainId = (v) => typeof v === 'string' && DOMAIN_ID.test(v);

export function emptyLedger() {
	return { schema: LEDGER_SCHEMA, moments: [] };
}

function normProjection(p) {
	return {
		projectionId: p.projectionId,
		projectionType: typeof p.projectionType === 'string' ? p.projectionType : 'whiteboard',
		shapeId: typeof p.shapeId === 'string' ? p.shapeId : null,
		page: typeof p.page === 'string' ? p.page : null,
		boundVersion: Number.isInteger(p.boundVersion) && p.boundVersion >= 1 ? p.boundVersion : 1,
	};
}

/** Parse the JSON ledger; a missing/empty file is an empty ledger, not an error. */
export function parseLedger(text) {
	if (text === undefined || text === null || String(text).trim() === '') return emptyLedger();
	let value;
	try {
		value = typeof text === 'string' ? JSON.parse(text) : text;
	} catch {
		throw new BindingError('ledger-corrupt', 'Binding-Ledger ist kein gültiges JSON');
	}
	if (!value || value.schema !== LEDGER_SCHEMA || !Array.isArray(value.moments)) {
		throw new BindingError('ledger-corrupt', 'Binding-Ledger hat ein unbekanntes Schema');
	}
	return {
		schema: LEDGER_SCHEMA,
		moments: value.moments.filter((m) => isDomainId(m?.domainId)).map((m) => ({
			domainId: m.domainId,
			projections: Array.isArray(m.projections)
				? m.projections.filter((p) => typeof p?.projectionId === 'string').map(normProjection)
				: [],
		})),
	};
}

/** Deterministic serialization (stable key order) for a lossless round-trip. */
export function serializeLedger(ledger) {
	const moments = [...(ledger?.moments ?? [])]
		.filter((m) => isDomainId(m?.domainId))
		.sort((a, b) => a.domainId.localeCompare(b.domainId))
		.map((m) => ({
			domainId: m.domainId,
			projections: [...(m.projections ?? [])]
				.sort((a, b) => a.projectionId.localeCompare(b.projectionId))
				.map((p) => ({ projectionId: p.projectionId, projectionType: p.projectionType, shapeId: p.shapeId ?? null, page: p.page ?? null, boundVersion: p.boundVersion })),
		}));
	return JSON.stringify({ schema: LEDGER_SCHEMA, moments }, null, 2) + '\n';
}

export function ledgerMoment(ledger, domainId) {
	return (ledger?.moments ?? []).find((m) => m.domainId === domainId) ?? null;
}

export function projectionsFor(ledger, domainId) {
	return ledgerMoment(ledger, domainId)?.projections ?? [];
}

/** Locate a projectionId across all moments. */
export function findProjection(ledger, projectionId) {
	const hits = [];
	for (const moment of ledger?.moments ?? []) {
		for (const projection of moment.projections) {
			if (projection.projectionId === projectionId) hits.push({ domainId: moment.domainId, projection });
		}
	}
	return hits;
}

function upsertMoment(ledger, domainId) {
	const existing = ledgerMoment(ledger, domainId);
	if (existing) return { ledger, moment: existing };
	const moment = { domainId, projections: [] };
	return { ledger: { ...ledger, moments: [...ledger.moments, moment] }, moment };
}

function replaceLedgerMoment(ledger, updated) {
	return { ...ledger, moments: ledger.moments.map((m) => (m.domainId === updated.domainId ? updated : m)) };
}

/**
 * Bind a NEW projection (add a representation). The ledger entry for the domain
 * is created on first bind (domain existence is enforced by the domain store,
 * not here). Fails closed on a duplicate projectionId anywhere in the ledger —
 * one projectionId can never point at two objects. `version` is the current
 * domain version this projection is aligned to.
 */
export function bindProjection(ledger, input = {}) {
	const { domainId, projectionId, projectionType = 'whiteboard', shapeId = null, page = null, version = 1 } = input;
	if (!isDomainId(domainId)) throw new BindingError('invalid-domain-id', 'Keine gültige LearningMoment-ID', { domainId });
	if (typeof projectionId !== 'string' || projectionId.trim() === '') throw new BindingError('invalid-projection-id', 'projectionId fehlt');
	if (findProjection(ledger, projectionId).length > 0) throw new BindingError('duplicate-projection', 'projectionId ist bereits gebunden', { projectionId });
	const { ledger: withMoment, moment } = upsertMoment(ledger, domainId);
	const projection = { projectionId, projectionType, shapeId: typeof shapeId === 'string' ? shapeId : null, page, boundVersion: Number.isInteger(version) && version >= 1 ? version : 1 };
	return { ok: true, ledger: replaceLedgerMoment(withMoment, { ...moment, projections: [...moment.projections, projection] }), projection };
}

/** Semantic alias: an additional representation is a NEW projectionId. */
export function addProjection(ledger, input) {
	return bindProjection(ledger, input);
}

/**
 * Move an existing projection: the SAME projectionId gets a different page.
 * Never creates a second projection (the Phase-1 copy pitfall).
 */
export function moveProjection(ledger, input = {}) {
	const { domainId, projectionId, toPage } = input;
	const moment = ledgerMoment(ledger, domainId);
	const current = moment?.projections.find((p) => p.projectionId === projectionId);
	if (!current) throw new BindingError('unknown-projection', 'Projection nicht gefunden', { domainId, projectionId });
	const moved = { ...current, page: typeof toPage === 'string' ? toPage : current.page };
	return { ok: true, ledger: replaceLedgerMoment(ledger, { ...moment, projections: moment.projections.map((p) => (p.projectionId === projectionId ? moved : p)) }), projection: moved };
}

/**
 * Detach a projection. The LearningMoment stays in the domain store — even when
 * the last projection is removed. A domain deletion is a separate, explicit act.
 */
export function detachProjection(ledger, input = {}) {
	const { domainId, projectionId } = input;
	const moment = ledgerMoment(ledger, domainId);
	if (!moment || !moment.projections.some((p) => p.projectionId === projectionId)) {
		throw new BindingError('unknown-projection', 'Projection nicht gefunden', { domainId, projectionId });
	}
	const remaining = moment.projections.filter((p) => p.projectionId !== projectionId);
	return {
		ok: true,
		ledger: replaceLedgerMoment(ledger, { ...moment, projections: remaining }),
		domainRetained: true,
		orphanedProjections: remaining.length === 0,
	};
}

/**
 * A projection is stale when it was bound to an older canonical version. The
 * current version is owned by the domain store and passed in.
 */
export function isStaleProjection(ledger, domainId, projectionId, currentVersion) {
	const moment = ledgerMoment(ledger, domainId);
	const projection = moment?.projections.find((p) => p.projectionId === projectionId);
	if (!projection || !Number.isInteger(currentVersion)) return false;
	return projection.boundVersion < currentVersion;
}

/** After an automatic sync, re-align every projection to the current version. */
export function syncProjections(ledger, domainId, currentVersion) {
	const moment = ledgerMoment(ledger, domainId);
	if (!moment) return { ok: true, ledger, projections: [] };
	const version = Number.isInteger(currentVersion) && currentVersion >= 1 ? currentVersion : 1;
	const projections = moment.projections.map((p) => ({ ...p, boundVersion: version }));
	return { ok: true, ledger: replaceLedgerMoment(ledger, { ...moment, projections }), projections };
}
