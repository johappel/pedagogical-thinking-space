// Board Projection Policy — Denkstand → Whiteboard.
//
// Not every Denkstand entry becomes visible, and the companion must not manage
// tldraw coordinates to decide what is important. This module is the single
// place that maps a current-state entry to a board target, driven by the
// entry's epistemic `status` and its `significance` (anchor/supporting/detail)
// — never by parsing its text. It is pure and deterministic, like reactions.mjs.
//
// The mapping follows the agreed policy table:
//
//   confirmed + anchor / kind=moment/tension  → Übersicht (moment also gets own page)
//   confirmed + supporting                     → Übersicht (a load-bearing decision)
//   confirmed + detail                         → not projected
//   teacher_open + anchor                      → Übersicht (a live, important question)
//   teacher_open + supporting/detail           → Sammeln (a preliminary thought)
//   assistant_hypotheses                       → not projected automatically
//   facts + (anchor or relevantNow)            → Übersicht; otherwise not projected
//   rejected                                   → not on the active board (remove)
//
// The board decides WHERE something shows; the Denkstand decides WHAT holds.
// Removing a projection never deletes the domain entry (see planProjection).

import { STATUS, SIGNIFICANCE } from './denkstand-state.mjs';

/** Board targets a Denkstand entry can map to. */
export const BOARD = Object.freeze({
	UEBERSICHT: 'uebersicht',
	SAMMELN: 'sammeln',
	LERNMOMENT: 'lernmoment',
	NONE: 'none',
});

/** Canonical page titles of the standard whiteboard structure. */
export const PAGE_TITLE = Object.freeze({
	SAMMELN: 'Sammeln',
	UEBERSICHT: 'Übersicht',
});

/** Kinds that are red-thread elements regardless of significance. */
const ANCHOR_KINDS = Object.freeze(new Set(['moment', 'tension', 'anchor', 'decision']));

/**
 * Decide the board target for one current-state entry.
 * @param {object} entry - a Denkstand entry ({status, significance, kind}).
 * @param {{ relevantNow?: boolean }} [opts] - situational relevance for facts.
 * @returns {{ board: string, ownPage: boolean, reason: string }}
 */
export function projectEntry(entry, opts = {}) {
	const status = entry?.status;
	const significance = entry?.significance ?? SIGNIFICANCE.SUPPORTING;
	const kind = typeof entry?.kind === 'string' ? entry.kind : null;
	const anchorish = significance === SIGNIFICANCE.ANCHOR || (kind !== null && ANCHOR_KINDS.has(kind));

	if (status === STATUS.REJECTED) {
		return { board: BOARD.NONE, ownPage: false, reason: 'verworfen — nicht auf der aktiven Übersicht' };
	}
	// A companion hypothesis is never projected on its own; the teacher decides.
	if (status === STATUS.HYPOTHESIS) {
		return { board: BOARD.NONE, ownPage: false, reason: 'Companion-Hypothese — nicht automatisch projizieren' };
	}
	if (status === STATUS.FACT) {
		return anchorish || opts.relevantNow === true
			? { board: BOARD.UEBERSICHT, ownPage: false, reason: 'aktuell relevanter Fakt' }
			: { board: BOARD.NONE, ownPage: false, reason: 'Fakt ohne aktuelle Relevanz — nicht projizieren' };
	}
	if (status === STATUS.CONFIRMED) {
		if (significance === SIGNIFICANCE.DETAIL && !anchorish) {
			return { board: BOARD.NONE, ownPage: false, reason: 'kleine Detailentscheidung — normalerweise nicht projizieren' };
		}
		return {
			board: BOARD.UEBERSICHT,
			ownPage: kind === 'moment',
			reason: kind === 'moment' ? 'bestätigter Lernmoment — Übersicht und eigene Page' : 'bestätigte tragende Entscheidung — Übersicht',
		};
	}
	if (status === STATUS.OPEN) {
		return anchorish
			? { board: BOARD.UEBERSICHT, ownPage: false, reason: 'aktuell wichtige offene Frage — Übersicht' }
			: { board: BOARD.SAMMELN, ownPage: false, reason: 'noch vorläufiger Gedanke — Sammeln' };
	}
	return { board: BOARD.NONE, ownPage: false, reason: 'kein projizierbarer Status' };
}

/**
 * Turn a policy decision into a board operation against an existing projection,
 * following the LearningMoment binding discipline: keep the projectionId, never
 * create a duplicate, and never delete the domain entry when a projection goes.
 *
 * @param {object} entry - the current-state entry.
 * @param {{ projectionId?: string, board?: string, page?: string }|null} existing
 *   - the current board projection for this entry, or null if none exists.
 * @param {{ relevantNow?: boolean }} [opts]
 * @returns {{ op: 'create'|'update'|'move'|'remove'|'noop', board: string,
 *   ownPage: boolean, projectionId: string|null, reason: string,
 *   domainRetained: boolean }}
 */
export function planProjection(entry, existing = null, opts = {}) {
	const target = projectEntry(entry, opts);
	const has = existing !== null && typeof existing === 'object';
	const projectionId = has ? (existing.projectionId ?? null) : null;

	if (target.board === BOARD.NONE) {
		return has
			? { op: 'remove', board: BOARD.NONE, ownPage: false, projectionId, reason: target.reason, domainRetained: true }
			: { op: 'noop', board: BOARD.NONE, ownPage: false, projectionId: null, reason: target.reason, domainRetained: true };
	}
	if (!has) {
		return { op: 'create', board: target.board, ownPage: target.ownPage, projectionId: null, reason: target.reason, domainRetained: true };
	}
	if (existing.board !== target.board) {
		// Same projection identity, different page: a move, never a copy.
		return { op: 'move', board: target.board, ownPage: target.ownPage, projectionId, reason: target.reason, domainRetained: true };
	}
	return { op: 'update', board: target.board, ownPage: target.ownPage, projectionId, reason: target.reason, domainRetained: true };
}
