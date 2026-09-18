// Editor session state (Spike §12/§13) — a pure, UI-agnostic state machine for
// ONE open block. It answers two questions the browser must not answer ad hoc:
//   * is it safe to load an external change into the editor right now?
//   * is it safe to leave this block (switch phase/lesson) right now?
//
// Four states (Spike §13):
//   clean               editor matches the stored revision
//   dirty               the teacher has unsaved local changes
//   saving              a save is in flight
//   externally_changed  the stored block advanced while dirty/saving → conflict
//
// Fail-closed: an external change is only auto-adopted when the editor is clean.
// While dirty or saving it becomes a conflict the teacher must resolve — the
// local version is never silently overwritten.

export const EDITOR_STATE = Object.freeze({
	CLEAN: 'clean',
	DIRTY: 'dirty',
	SAVING: 'saving',
	EXTERNALLY_CHANGED: 'externally_changed',
});

/** Open a block at a known base revision. Opening never mutates the product. */
export function openBlock({ blockId, baseRevision }) {
	return { status: EDITOR_STATE.CLEAN, blockId, baseRevision, conflictRevision: null };
}

/** A real content edit in the editor. Focus/selection changes are NOT edits. */
export function markEdited(session) {
	if (session.status === EDITOR_STATE.SAVING) return session; // wait for save
	return { ...session, status: EDITOR_STATE.DIRTY };
}

export function beginSave(session) {
	if (session.status !== EDITOR_STATE.DIRTY) {
		throw new Error(`beginSave nur aus dirty erlaubt, war „${session.status}"`);
	}
	return { ...session, status: EDITOR_STATE.SAVING };
}

export function saveSucceeded(session, revision) {
	return { ...session, status: EDITOR_STATE.CLEAN, baseRevision: revision, conflictRevision: null };
}

export function saveFailed(session) {
	return { ...session, status: EDITOR_STATE.DIRTY };
}

/**
 * The store's revision advanced (e.g. a Companion edit of the same block).
 * Clean editor → adopt silently; dirty/saving editor → conflict, keep local.
 */
export function externalChange(session, incomingRevision) {
	if (session.status === EDITOR_STATE.CLEAN) {
		return { ...session, baseRevision: incomingRevision, conflictRevision: null, adopt: true };
	}
	return { ...session, status: EDITOR_STATE.EXTERNALLY_CHANGED, conflictRevision: incomingRevision, adopt: false };
}

/** Teacher resolves a conflict by keeping their unsaved version. */
export function resolveKeepMine(session) {
	return { ...session, status: EDITOR_STATE.DIRTY, conflictRevision: null };
}

/** Teacher resolves a conflict by loading the incoming version. */
export function resolveTakeTheirs(session) {
	const revision = session.conflictRevision ?? session.baseRevision;
	return { ...session, status: EDITOR_STATE.CLEAN, baseRevision: revision, conflictRevision: null };
}

/** Guard: may the teacher leave this block without losing work? */
export function canLeave(session) {
	return session.status === EDITOR_STATE.CLEAN;
}

/** Guard: may an incoming external change be applied without asking? */
export function canAutoApplyExternal(session) {
	return session.status === EDITOR_STATE.CLEAN;
}
