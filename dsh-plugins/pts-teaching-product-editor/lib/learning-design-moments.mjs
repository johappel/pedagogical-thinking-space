// Extract the teacher's *named* learning moments from a free-form
// learning-design.md (Denkstand prose). Some Denkräume never capture moments as
// structured `### lm-…` landscape entries or a binding ledger; the moments live
// only as prose headings like "## Vorgeschlagener Lernmoment (Einstieg)" or
// "## Lernmoment 3 – …". For the Product Proposal (a non-binding draft), these
// named-but-tentative moments are a legitimate source — the fail-closed guard
// stays on decisions and on the final Accept, not on the proposal draft.
//
// Deliberately conservative: only headings that name a moment WITH an ordinal
// (or the Einstieg, treated as 1) count; material/order/mapping headings that
// merely mention a moment are excluded. Pure, no IO.

const MAX_TITLE = 90;

const EXCLUDE = /\b(material|materialentwurf|reihenfolge|zuordnung|übergang|uebergang|vermerke)\b/i;

export function extractNamedMoments(raw) {
	const text = String(raw ?? '').replace(/\r\n?/g, '\n');
	const lines = text.split('\n');
	const byOrd = new Map();
	for (const line of lines) {
		const m = line.match(/^(#{2,4})\s+(.*\S)\s*$/);
		if (!m) continue;
		const heading = m[2].trim();
		if (!/lernmoment/i.test(heading)) continue;
		if (EXCLUDE.test(heading)) continue;

		const ordMatch = heading.match(/lernmoment\s*(\d+)/i);
		let ord = ordMatch ? Number.parseInt(ordMatch[1], 10) : null;
		if (ord === null && /einstieg/i.test(heading)) ord = 1;
		if (ord === null || !Number.isInteger(ord) || ord < 1) continue;
		if (byOrd.has(ord)) continue;
		byOrd.set(ord, cleanTitle(heading));
	}

	// A moment can be referenced by number without its own section (e.g. the
	// teacher mentions "Lernmoment 4" but never wrote a heading for it). Fill the
	// gaps up to the highest referenced ordinal so the count matches the teacher's
	// mental model, and mark such moments transparently as merely mentioned.
	let maxRef = 0;
	for (const m of text.matchAll(/lernmoment\s*(\d+)/gi)) {
		const n = Number.parseInt(m[1], 10);
		if (Number.isInteger(n) && n > maxRef && n <= 20) maxRef = n;
	}
	for (let ord = 1; ord <= maxRef; ord += 1) {
		if (!byOrd.has(ord)) byOrd.set(ord, `Lernmoment ${ord} (nur erwähnt, kein eigener Abschnitt)`);
	}

	return [...byOrd.keys()]
		.sort((a, b) => a - b)
		.map((ord) => ({ domainId: `lm-${ord}`, version: 1, title: byOrd.get(ord) }));
}

function cleanTitle(heading) {
	let title = heading.replace(/^vorgeschlagener\s+/i, '').trim();
	if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE - 1).trimEnd() + '…';
	return title;
}
