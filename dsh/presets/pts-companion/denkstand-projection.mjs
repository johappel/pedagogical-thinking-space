// Denkstand → Board reconciliation driver.
//
// Priority 3 of the live integration: a teacher_confirmed + anchor entry must
// actually appear on the Übersicht, and re-running must update the same place
// rather than pile up duplicates. This module turns the current Denkstand state
// into concrete render requests for the EXISTING semantic facade
// (pts_whiteboard_render) and drives them. It introduces no new board model:
//
//   * the single source is the Denkstand state (denkstand-state.mjs);
//   * the single policy is the projection policy (projection-policy.mjs);
//   * the single write path to the board is pts_whiteboard_render.
//
// No-duplicate discipline without shape-id bookkeeping: the facade updates the
// frame with the same title in place ("gleicher Titel = aktualisieren"), so the
// whole Übersicht red-thread frame is one agent-owned workspace that is
// re-rendered from the current anchors. The teacher's own notes live outside it.
//
// Page guarantee (acceptance criterion): "Sammeln" is the board's first page and
// exists automatically; "Übersicht" is ensured here the moment there is anything
// to project. Confirmed learning moments (kind='moment') additionally get their
// own page.

import { STATUS, projectCurrentState } from './denkstand-state.mjs';
import { BOARD, PAGE_TITLE, projectEntry } from './projection-policy.mjs';

/** The agent-owned red-thread frame that carries the projected anchors. */
export const OVERVIEW_FRAME_HEADING = 'Roter Faden';

/** Map an entry to a presentation role the facade understands. */
export function roleFor(entry) {
	if (entry?.kind === 'moment') return 'learning_moment';
	if (entry?.status === STATUS.OPEN) return 'open_question';
	if (entry?.status === STATUS.FACT) return 'document_reference';
	return 'note';
}

/**
 * Plan the board reconciliation from the current state. Pure and deterministic:
 * returns the ordered render requests (each a valid pts_whiteboard_render input)
 * plus the pages the plan guarantees.
 * @param {object} state - a denkstand-state ledger.
 * @param {{ relevantIds?: string[], previousTitles?: Record<string,string> }} [opts]
 *   - relevantIds: fact ids that are relevant now.
 *   - previousTitles: map of moment entry id → the title its own page had before
 *     a rename, so the plan relabels that page in place instead of creating a
 *     new one (keeping the page, its content and its "Zur Übersicht" link).
 * @returns {{ requests: object[], pages: string[], overviewEntryIds: string[], momentPages: string[] }}
 */
export function planBoardReconcile(state, opts = {}) {
	const groups = projectCurrentState(state);
	const relevant = new Set(Array.isArray(opts.relevantIds) ? opts.relevantIds : []);
	const previousTitles = opts.previousTitles && typeof opts.previousTitles === 'object' ? opts.previousTitles : {};
	const overview = [];
	const sammeln = [];
	const momentPages = [];
	for (const status of [STATUS.CONFIRMED, STATUS.OPEN, STATUS.FACT]) {
		for (const entry of groups[status] ?? []) {
			const target = projectEntry(entry, { relevantNow: relevant.has(entry.id) });
			if (target.board === BOARD.UEBERSICHT) {
				overview.push(entry);
				if (target.ownPage) momentPages.push({ id: entry.id, title: entry.statement });
			} else if (target.board === BOARD.SAMMELN) {
				sammeln.push(entry);
			}
		}
	}

	const requests = [];
	const pages = [];

	// Übersicht: one agent-owned frame, re-rendered from the current anchors.
	// Ensuring the page is the single-time creation of the stable second page.
	if (overview.length > 0) {
		pages.push(PAGE_TITLE.UEBERSICHT);
		requests.push({
			operation: 'update_learning_moment_workspace',
			page: { action: 'ensure', title: PAGE_TITLE.UEBERSICHT },
			heading: { text: OVERVIEW_FRAME_HEADING },
			layout: { template: 'cluster' },
			elements: overview.map((entry) => ({ key: entry.id, source: 'new', role: roleFor(entry), text: entry.statement })),
			links: [],
		});
	}

	// A confirmed learning moment additionally gets its own page. On a rename,
	// previousTitles carries the page's former title so the board relabels the
	// existing page in place (stable page id) instead of orphaning it.
	for (const { id, title } of momentPages) {
		pages.push(title);
		const previousTitle = previousTitles[id];
		const page = { action: 'ensure', title };
		if (typeof previousTitle === 'string' && previousTitle !== '' && previousTitle !== title) page.previousTitle = previousTitle;
		requests.push({
			operation: 'create_learning_moment_workspace',
			page,
			heading: { text: title },
			layout: { template: 'learning_moment_workspace' },
			elements: [{ key: 'kernidee', source: 'new', role: 'learning_moment', text: title }],
			links: [],
		});
	}

	// Preliminary thoughts collect on "Sammeln" (the first page, guaranteed).
	if (sammeln.length > 0) {
		pages.push(PAGE_TITLE.SAMMELN);
		requests.push({
			operation: 'update_learning_moment_workspace',
			page: { action: 'ensure', title: PAGE_TITLE.SAMMELN },
			heading: { text: 'Sammeln' },
			layout: { template: 'cluster' },
			elements: sammeln.map((entry) => ({ key: entry.id, source: 'new', role: roleFor(entry), text: entry.statement })),
			links: [],
		});
	}

	return { requests, pages, overviewEntryIds: overview.map((e) => e.id), momentPages: momentPages.map((m) => m.title) };
}

/**
 * Drive the reconciliation against a render function (the pts_whiteboard_render
 * facade). Best-effort and non-throwing: a board that is not live yields a
 * clean `skipped` result and never breaks the Denkstand write.
 * @param {(request: object) => Promise<object>} render - executes one render request.
 * @param {object} state - the current denkstand-state ledger.
 * @param {{ relevantIds?: string[], previousTitles?: Record<string,string> }} [opts]
 * @returns {Promise<{ ok: boolean, applied: object[], pages: string[], skipped?: string }>}
 */
export async function reconcileBoard(render, state, opts = {}) {
	const plan = planBoardReconcile(state, opts);
	if (plan.requests.length === 0) return { ok: true, applied: [], pages: [] };
	if (typeof render !== 'function') return { ok: false, applied: [], pages: plan.pages, skipped: 'no-render-seam' };
	const applied = [];
	for (const request of plan.requests) {
		try {
			const result = await render(request);
			applied.push({ page: request.page?.title, status: result?.status ?? (result?.ok ? 'ok' : 'unknown'), ok: result?.ok === true });
			// A board that is not live blocks the first request; stop quietly.
			if (result?.ok === false && result?.error?.code && /whiteboard-(not-live|unavailable)/.test(String(result.error.code))) {
				return { ok: false, applied, pages: plan.pages, skipped: result.error.code };
			}
		} catch (error) {
			applied.push({ page: request.page?.title, status: 'error', ok: false, error: String(error?.message ?? error) });
		}
	}
	return { ok: applied.every((entry) => entry.ok), applied, pages: plan.pages };
}
