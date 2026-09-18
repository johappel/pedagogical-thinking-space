// Semantic Product Delta (Spike §11–§13). A saved revision carries the raw
// change records; from them we derive a compact, human-readable delta and a
// classification so the Companion receives meaning, not HTML diffs.
//
// The four classifications (Spike §12):
//   structural   lessons/phases added, removed, reordered or renamed
//   pedagogical  time allocation changed (duration is a didactic decision)
//   content      a content block was really changed, added or removed
//   formatting   only markup changed (bold/italic) — NOT pedagogically relevant
//
// A formatting-only change must never reach the Companion as a pedagogical
// signal (Spike §13, §23): `toCompanionContext` drops it.

import { visibleText } from './markup.mjs';

export const FORMATTING = 'formatting';

const BLOCK_LABEL = {
	heading: 'Überschrift',
	paragraph: 'Absatz',
	task: 'Arbeitsauftrag',
	list: 'Liste',
	note: 'Hinweis',
	link: 'Link',
	image: 'Bild',
};

// The visible words of a block, markup removed — a pure bold/italic/heading/list
// /link edit reads as unchanged text and therefore classifies as formatting.
const plain = (value) => visibleText(value);

export function classifyChange(change) {
	switch (change.operation) {
		case 'lesson.add':
		case 'phase.add':
		case 'phase.remove':
		case 'phase.reorder':
		case 'phase.rename':
			return 'structural';
		case 'phase.duration.change':
			return 'pedagogical';
		case 'block.format':
			return FORMATTING;
		case 'block.replace':
			return plain(change.before) === plain(change.after) ? FORMATTING : 'content';
		case 'block.add':
		case 'block.remove':
			return 'content';
		default:
			return 'content';
	}
}

function summarize(change) {
	const label = BLOCK_LABEL[change.blockType] ?? 'Inhalt';
	switch (change.operation) {
		case 'lesson.add':
			return `Stunde „${change.title}" hinzugefügt`;
		case 'phase.add':
			return `Phase „${change.title}" hinzugefügt`;
		case 'phase.remove':
			return `Phase entfernt`;
		case 'phase.reorder':
			return `Phasen neu geordnet`;
		case 'phase.rename':
			return `Phase umbenannt: „${change.before}" → „${change.after}"`;
		case 'phase.duration.change':
			return `Dauer: ${change.before ?? '—'} → ${change.after ?? '—'} Minuten`;
		case 'block.format':
			return `${label} nur formatiert`;
		case 'block.replace':
			return plain(change.before) === plain(change.after) ? `${label} nur formatiert` : `${label} konkretisiert`;
		case 'block.add':
			return `${label} ergänzt`;
		case 'block.remove':
			return `${label} entfernt`;
		default:
			return 'Inhalt geändert';
	}
}

/** Build the semantic delta for one revision record. */
export function semanticDelta(revision) {
	const entries = (revision.changes ?? []).map((change) => ({
		scope: { lessonId: change.lessonId ?? null, phaseId: change.phaseId ?? null },
		classification: classifyChange(change),
		summary: summarize(change),
	}));
	return {
		revision: revision.revision,
		actor: revision.actor,
		entries,
		pedagogicallyRelevant: entries.some((entry) => entry.classification !== FORMATTING),
	};
}

/**
 * Compact German context the Companion receives — only the changes since the
 * revision it last saw, and never a formatting-only line (Spike §13).
 */
export function deltaSince(product, lastSeenRevision = 0) {
	const revisions = (product.revisions ?? []).filter((r) => r.revision > lastSeenRevision);
	const lines = [];
	let pedagogicallyRelevant = false;
	for (const revision of revisions) {
		const delta = revision.delta ?? semanticDelta(revision);
		for (const entry of delta.entries) {
			if (entry.classification === FORMATTING) continue;
			pedagogicallyRelevant = true;
			const where = phaseLabel(product, entry.scope);
			lines.push(where ? `${where}\n- ${entry.summary}` : `- ${entry.summary}`);
		}
	}
	return {
		fromRevision: lastSeenRevision,
		toRevision: product.revision,
		pedagogicallyRelevant,
		lines,
		text: lines.length ? `PRODUCT CHANGES SINCE LAST TURN\n\n${lines.join('\n')}` : '',
	};
}

function phaseLabel(product, scope) {
	if (!scope?.lessonId) return '';
	const lesson = (product.series?.lessons ?? []).find((l) => l.id === scope.lessonId);
	if (!lesson) return '';
	if (!scope.phaseId) return lesson.title;
	const phase = (lesson.phases ?? []).find((p) => p.id === scope.phaseId);
	return phase ? `${lesson.title} · ${phase.title}` : lesson.title;
}
