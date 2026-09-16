// Phase 2 — projection bindings.
//
// A LearningMoment (domainId) may have several whiteboard projections. Each
// projection has its OWN stable projectionId. domainId and projectionId are
// deliberately different identity systems:
//
//     domainId     = lm-danke           (the pedagogical object)
//     projectionId = wb-proj-101        (one board representation)
//     projectionId = wb-proj-102        (another board representation)
//
// The move/copy distinction is explicit and NOT decided by comparing text:
//   moveProjection  keeps the projectionId, changes only its page/position;
//   addProjection   gives the SAME LearningMoment an ADDITIONAL representation
//                   with a NEW projectionId.

import { DomainError, findMoment, replaceMoment } from './domain.mjs';

function requireMoment(ledger, domainId) {
	const moment = findMoment(ledger, domainId);
	if (!moment) throw new DomainError('unknown-domain-id', 'Unbekannte LearningMoment-ID', { domainId });
	return moment;
}

export function projectionsFor(ledger, domainId) {
	return findMoment(ledger, domainId)?.projections ?? [];
}

/** Locate a projectionId across all moments (fail-closed on ambiguity). */
export function findProjection(ledger, projectionId) {
	const hits = [];
	for (const moment of ledger?.moments ?? []) {
		for (const projection of moment.projections) {
			if (projection.projectionId === projectionId) hits.push({ domainId: moment.domainId, projection });
		}
	}
	return hits;
}

/**
 * Bind a NEW projection (add a representation). Fails closed on an unknown
 * domain and on a duplicate projectionId anywhere in the ledger — one
 * projectionId can never point at two objects.
 */
export function bindProjection(ledger, input = {}) {
	const { domainId, projectionId, projectionType = 'whiteboard', shapeId = null, page = null } = input;
	const moment = requireMoment(ledger, domainId);
	if (typeof projectionId !== 'string' || projectionId.trim() === '') throw new DomainError('invalid-projection-id', 'projectionId fehlt');
	if (findProjection(ledger, projectionId).length > 0) throw new DomainError('duplicate-projection', 'projectionId ist bereits gebunden', { projectionId });
	const projection = { projectionId, projectionType, shapeId: typeof shapeId === 'string' ? shapeId : null, page, boundVersion: moment.version };
	return { ok: true, ledger: replaceMoment(ledger, { ...moment, projections: [...moment.projections, projection] }), projection };
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
	const moment = requireMoment(ledger, domainId);
	const current = moment.projections.find((p) => p.projectionId === projectionId);
	if (!current) throw new DomainError('unknown-projection', 'Projection nicht gefunden', { domainId, projectionId });
	const moved = { ...current, page: typeof toPage === 'string' ? toPage : current.page };
	return { ok: true, ledger: replaceMoment(ledger, { ...moment, projections: moment.projections.map((p) => (p.projectionId === projectionId ? moved : p)) }), projection: moved };
}

/**
 * Detach a projection. The LearningMoment stays — even when the last
 * projection is removed. A domain deletion is a separate, explicit act.
 */
export function detachProjection(ledger, input = {}) {
	const { domainId, projectionId } = input;
	const moment = requireMoment(ledger, domainId);
	if (!moment.projections.some((p) => p.projectionId === projectionId)) {
		throw new DomainError('unknown-projection', 'Projection nicht gefunden', { domainId, projectionId });
	}
	const remaining = moment.projections.filter((p) => p.projectionId !== projectionId);
	return {
		ok: true,
		ledger: replaceMoment(ledger, { ...moment, projections: remaining }),
		domainRetained: true,
		orphanedDomain: remaining.length === 0,
	};
}

/**
 * A projection is stale when it was bound to an older canonical version. A
 * background board operation carrying a stale boundVersion must not silently
 * apply on top of a newer domain state.
 */
export function isStaleProjection(ledger, domainId, projectionId) {
	const moment = findMoment(ledger, domainId);
	if (!moment) return false;
	const projection = moment.projections.find((p) => p.projectionId === projectionId);
	if (!projection) return false;
	return projection.boundVersion < moment.version;
}

/** After an automatic sync, re-align every projection to the current version. */
export function syncProjections(ledger, domainId) {
	const moment = requireMoment(ledger, domainId);
	const projections = moment.projections.map((p) => ({ ...p, boundVersion: moment.version }));
	return { ok: true, ledger: replaceMoment(ledger, { ...moment, projections }), projections };
}
