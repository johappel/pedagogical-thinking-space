// Phase 2 — canonical LearningMoment domain seam.
//
// The domain OBJECT is the existing learning-landscape moment (`### lm-…` in
// learning-landscape.md): its stable id and pedagogical content already live
// there. Phase 2 adds only what the landscape does not carry: a canonical
// version, structured provenance (the teacher confirmation) and the projection
// bindings. Those live in a machine-owned ledger sidecar so the fragile
// landscape markdown parser is never touched and the round-trip is lossless.
//
// This module is pure: every function takes a parsed ledger and returns a new
// ledger plus a result. No IO, no clock, no board vocabulary. The renderer is
// NOT allowed to call these; the write-seam does.

export const LEDGER_SCHEMA = 'ptspace.learning-moment-bindings/v1';

// A stable canonical id is a landscape moment id: `lm-…`. It never depends on a
// shape, a session or a page, and a later title change does not change it.
const DOMAIN_ID = /^lm-[a-z0-9][a-z0-9-]*$/;

export function isDomainId(value) {
	return typeof value === 'string' && DOMAIN_ID.test(value);
}

export class DomainError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = 'DomainError';
		this.code = code;
		this.details = details;
	}
}

export function emptyLedger() {
	return { schema: LEDGER_SCHEMA, moments: [] };
}

/** Parse the JSON ledger; a missing/empty file is an empty ledger, not an error. */
export function parseLedger(text) {
	if (text === undefined || text === null || String(text).trim() === '') return emptyLedger();
	let value;
	try {
		value = typeof text === 'string' ? JSON.parse(text) : text;
	} catch {
		throw new DomainError('ledger-corrupt', 'Binding-Ledger ist kein gültiges JSON');
	}
	if (!value || value.schema !== LEDGER_SCHEMA || !Array.isArray(value.moments)) {
		throw new DomainError('ledger-corrupt', 'Binding-Ledger hat ein unbekanntes Schema');
	}
	// Project to a bounded, known shape so an externally tampered field cannot
	// leak into domain logic.
	return {
		schema: LEDGER_SCHEMA,
		moments: value.moments.filter((m) => isDomainId(m?.domainId)).map((m) => ({
			domainId: m.domainId,
			version: Number.isInteger(m.version) && m.version >= 1 ? m.version : 1,
			provenance: normalizeProvenance(m.provenance),
			projections: Array.isArray(m.projections) ? m.projections.filter((p) => typeof p?.projectionId === 'string').map((p) => ({
				projectionId: p.projectionId,
				projectionType: typeof p.projectionType === 'string' ? p.projectionType : 'whiteboard',
				// The generic board handle (tldraw shape id) this projection renders as.
				// Opaque to the domain; used only to drive the generic move/detach seam.
				shapeId: typeof p.shapeId === 'string' ? p.shapeId : null,
				page: typeof p.page === 'string' ? p.page : null,
				boundVersion: Number.isInteger(p.boundVersion) && p.boundVersion >= 1 ? p.boundVersion : 1,
			})) : [],
		})),
	};
}

function normalizeProvenance(provenance) {
	const source = provenance && typeof provenance === 'object' ? provenance : {};
	const createdFrom = source.createdFrom && typeof source.createdFrom === 'object' ? source.createdFrom : null;
	return {
		createdFrom: createdFrom && ['conversation', 'whiteboard', 'other'].includes(createdFrom.type)
			? { type: createdFrom.type, ...(typeof createdFrom.sourceId === 'string' ? { sourceId: createdFrom.sourceId } : {}) }
			: undefined,
		// The renderer may have drawn a card; that is not pedagogical provenance.
		// Only the teacher confirmation makes a canonical LearningMoment.
		confirmedBy: 'teacher',
		confirmedAt: typeof source.confirmedAt === 'string' ? source.confirmedAt : new Date(0).toISOString(),
	};
}

/** Deterministic serialization (stable key order) for a lossless round-trip. */
export function serializeLedger(ledger) {
	const normalized = {
		schema: LEDGER_SCHEMA,
		moments: [...(ledger?.moments ?? [])]
			.filter((m) => isDomainId(m?.domainId))
			.sort((a, b) => a.domainId.localeCompare(b.domainId))
			.map((m) => ({
				domainId: m.domainId,
				version: m.version,
				provenance: {
					...(m.provenance?.createdFrom ? { createdFrom: m.provenance.createdFrom } : {}),
					confirmedBy: 'teacher',
					confirmedAt: m.provenance?.confirmedAt,
				},
				projections: [...(m.projections ?? [])]
					.sort((a, b) => a.projectionId.localeCompare(b.projectionId))
					.map((p) => ({ projectionId: p.projectionId, projectionType: p.projectionType, shapeId: p.shapeId ?? null, page: p.page ?? null, boundVersion: p.boundVersion })),
			})),
	};
	return JSON.stringify(normalized, null, 2) + '\n';
}

export function findMoment(ledger, domainId) {
	return (ledger?.moments ?? []).find((m) => m.domainId === domainId) ?? null;
}

/**
 * Capture gate. A canonical LearningMoment comes into being ONLY here, through
 * a deliberate teacher confirmation — never because a card carries the
 * `learning_moment` role. Idempotent: a second capture of the same id returns
 * the existing object and creates no duplicate.
 *
 * @param {object} ledger parsed ledger
 * @param {object} input { domainId, createdFrom?, confirmedAt }
 */
export function captureLearningMoment(ledger, input = {}) {
	const { domainId, createdFrom, confirmedAt } = input;
	if (!isDomainId(domainId)) throw new DomainError('invalid-domain-id', 'Keine gültige kanonische LearningMoment-ID', { domainId });
	if (typeof confirmedAt !== 'string' || confirmedAt === '') throw new DomainError('confirmation-required', 'Lehrkraftbestätigung (confirmedAt) fehlt');
	const existing = findMoment(ledger, domainId);
	if (existing) return { ok: true, created: false, ledger, moment: existing };
	const moment = {
		domainId,
		version: 1,
		provenance: {
			...(createdFrom && ['conversation', 'whiteboard', 'other'].includes(createdFrom.type)
				? { createdFrom: { type: createdFrom.type, ...(typeof createdFrom.sourceId === 'string' ? { sourceId: createdFrom.sourceId } : {}) } }
				: {}),
			confirmedBy: 'teacher',
			confirmedAt,
		},
		projections: [],
	};
	return { ok: true, created: true, ledger: { ...ledger, moments: [...ledger.moments, moment] }, moment };
}

/**
 * Record a canonical content change: bump the version. Provenance is preserved.
 * `expectedVersion` is an optional stale guard — a late background operation
 * built on an older version fails closed instead of silently overwriting.
 */
export function bumpVersion(ledger, input = {}) {
	const { domainId, expectedVersion } = input;
	const moment = findMoment(ledger, domainId);
	if (!moment) throw new DomainError('unknown-domain-id', 'Unbekannte LearningMoment-ID', { domainId });
	if (expectedVersion !== undefined && expectedVersion !== moment.version) {
		return { ok: false, code: 'stale', currentVersion: moment.version, expectedVersion, ledger, moment };
	}
	const updated = { ...moment, version: moment.version + 1 };
	return { ok: true, ledger: replaceMoment(ledger, updated), moment: updated, versionBefore: moment.version, versionAfter: updated.version };
}

/**
 * Explicit, separate domain deletion. This is never a side effect of a board
 * action; removing projections leaves the LearningMoment intact.
 */
export function deleteLearningMoment(ledger, input = {}) {
	const { domainId } = input;
	const moment = findMoment(ledger, domainId);
	if (!moment) throw new DomainError('unknown-domain-id', 'Unbekannte LearningMoment-ID', { domainId });
	return { ok: true, ledger: { ...ledger, moments: ledger.moments.filter((m) => m.domainId !== domainId) }, removed: moment };
}

export function replaceMoment(ledger, updated) {
	return { ...ledger, moments: ledger.moments.map((m) => (m.domainId === updated.domainId ? updated : m)) };
}
