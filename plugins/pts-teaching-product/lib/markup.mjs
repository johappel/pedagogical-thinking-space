// Editor-neutral markup ⇄ Quill Delta (the heart of the Variante-B adapter).
//
// The Teaching Product domain stores block content as a SMALL, documented
// Markdown subset — never a Quill Delta. This keeps the domain editor-neutral:
// the semantic delta reasons about visible text, the stored content survives an
// editor swap, and the existing product tests (plain strings) keep passing.
//
// Supported subset (Phase 2A):
//   paragraph          a plain line
//   heading 1 / 2      `# ` / `## ` line prefix        → Quill { header: 1|2 }
//   bullet list        `- ` line prefix                → Quill { list: 'bullet' }
//   bold               `**text**`                      → Quill { bold: true }
//   italic             `_text_`                        → Quill { italic: true }
//   inline code        `` `text` ``                    → Quill { code: true }
//   link               `[text](url)`                   → Quill { link: url }
//
// Anything richer that Quill can produce is NOT round-tripped and is documented
// as a Phase-2A limitation, not silently guessed.

const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

// ── markup → Quill Delta ops ──────────────────────────────────────────────────

/** Parse the neutral markup of one block into a Quill Delta (array of ops). */
export function markupToOps(markup) {
	const lines = String(markup ?? '').replace(/\r\n?/g, '\n').split('\n');
	const ops = [];
	lines.forEach((line, index) => {
		const { attributes, text } = lineBlock(line);
		for (const run of inlineRuns(text)) {
			ops.push(run.attributes ? { insert: run.text, attributes: run.attributes } : { insert: run.text });
		}
		// Quill carries block formatting on the trailing newline of the line.
		const isLast = index === lines.length - 1;
		if (!isLast || lines.length === 1 || line !== '') {
			ops.push(Object.keys(attributes).length ? { insert: '\n', attributes } : { insert: '\n' });
		}
	});
	// Quill documents always end in a newline; drop a spurious trailing empty op.
	return normalizeTrailingNewline(ops);
}

function lineBlock(line) {
	let m = line.match(/^(#{1,2})\s+(.*)$/);
	if (m) return { attributes: { header: m[1].length }, text: m[2] };
	m = line.match(/^-\s+(.*)$/);
	if (m) return { attributes: { list: 'bullet' }, text: m[1] };
	return { attributes: {}, text: line };
}

function inlineRuns(text) {
	// Tokenize the four inline forms in a single left-to-right pass so nested or
	// adjacent spans do not corrupt each other.
	const runs = [];
	const pattern = /(\[([^\]]*)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(_([^_]+)_)|(`([^`]+)`)/g;
	let last = 0;
	let match;
	while ((match = pattern.exec(text)) !== null) {
		if (match.index > last) runs.push({ text: text.slice(last, match.index) });
		if (match[1] !== undefined) {
			const url = match[3].trim();
			runs.push(SAFE_URL.test(url) ? { text: match[2], attributes: { link: url } } : { text: match[2] });
		} else if (match[4] !== undefined) {
			runs.push({ text: match[5], attributes: { bold: true } });
		} else if (match[6] !== undefined) {
			runs.push({ text: match[7], attributes: { italic: true } });
		} else if (match[8] !== undefined) {
			runs.push({ text: match[9], attributes: { code: true } });
		}
		last = pattern.lastIndex;
	}
	if (last < text.length) runs.push({ text: text.slice(last) });
	return runs.length ? runs : [{ text: '' }];
}

function normalizeTrailingNewline(ops) {
	const merged = [];
	for (const op of ops) {
		const prev = merged[merged.length - 1];
		if (prev && typeof prev.insert === 'string' && !prev.attributes && !op.attributes && typeof op.insert === 'string') {
			prev.insert += op.insert;
		} else {
			merged.push({ ...op });
		}
	}
	return merged;
}

// ── Quill Delta ops → markup ──────────────────────────────────────────────────

/** Convert a Quill Delta (array of ops) back into the neutral block markup. */
export function opsToMarkup(ops) {
	const list = Array.isArray(ops) ? ops : (ops && Array.isArray(ops.ops) ? ops.ops : []);
	const lines = [];
	let inline = '';
	for (const op of list) {
		if (typeof op.insert !== 'string') continue; // embeds unsupported in 2A
		const parts = op.insert.split('\n');
		for (let i = 0; i < parts.length; i += 1) {
			if (i > 0) {
				lines.push(applyBlock(inline, op.attributes));
				inline = '';
			}
			inline += wrapInline(parts[i], op.attributes);
		}
	}
	if (inline !== '') lines.push(applyBlock(inline, null));
	// A trailing block newline produced one extra empty line; drop it.
	if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
	return lines.join('\n');
}

function wrapInline(text, attributes) {
	if (text === '' || !attributes) return text;
	let out = text;
	if (attributes.code) out = `\`${out}\``;
	if (attributes.bold) out = `**${out}**`;
	if (attributes.italic) out = `_${out}_`;
	if (attributes.link && SAFE_URL.test(String(attributes.link))) out = `[${out}](${attributes.link})`;
	return out;
}

function applyBlock(inline, attributes) {
	if (attributes && attributes.header === 1) return `# ${inline}`;
	if (attributes && (attributes.header === 2 || attributes.header > 2)) return `## ${inline}`;
	if (attributes && attributes.list === 'bullet') return `- ${inline}`;
	return inline;
}

// ── visible text (single source of truth for semantic classification) ─────────

/**
 * The visible words of a block, with ALL markup removed. Two contents with the
 * same visible text but different markup are a pure formatting change; the
 * semantic delta uses exactly this to keep formatting off the Companion.
 */
export function visibleText(markup) {
	return String(markup ?? '')
		.replace(/^\s*#{1,6}\s+/gm, '')
		.replace(/^\s*-\s+/gm, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}
