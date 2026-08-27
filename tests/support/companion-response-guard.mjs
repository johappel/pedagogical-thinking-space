// Shared guard for the visible Companion response after an already unambiguous
// teacher work order (e.g. „Kannst du die Quellen verifizieren und im Knowledge
// speichern?“). A compliant first response confirms the background start and
// names the provisional storage target — it must NOT re-ask for permission,
// must NOT pose a blocking denomination question, and must NOT claim a file was
// already saved before the background job succeeded.
//
// This module is intentionally dependency-free so both the deterministic unit
// test and a real end-to-end harness (driving the pts-web profile) can import
// the same checker and fail on the same phrasings.

/**
 * Phrasings that must NOT appear in the visible response once the teacher order
 * is already an authorization. Each entry is matched case-insensitively against
 * whitespace-normalized text.
 */
export const FORBIDDEN_APPROVAL_PATTERNS = Object.freeze([
	/soll ich recherchieren/i,
	/möchte ich jetzt die recherche starten/i,
	/soll ich (die )?recherche starten/i,
	/wenn ja[,:]/i,
	/soll ich evangelisch oder katholisch/i,
	/nur eine konfession/i,
]);

/** Whitespace-normalize so line wrapping never hides a forbidden phrase. */
function squish(text) {
	return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Scan a visible Companion response for forbidden second-approval or blocking
 * denomination phrasings.
 * @param {string} text - the visible response shown to the teacher
 * @returns {string[]} the source substrings of every forbidden match (empty = clean)
 */
export function findForbiddenApprovalPhrases(text) {
	const normalized = squish(text);
	const hits = [];
	for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
		const m = normalized.match(pattern);
		if (m) hits.push(m[0]);
	}
	return hits;
}

/**
 * True when the visible response is an acceptable first answer to an explicit
 * order: no forbidden phrasing at all.
 */
export function isCompliantVisibleResponse(text) {
	return findForbiddenApprovalPhrases(text).length === 0;
}
