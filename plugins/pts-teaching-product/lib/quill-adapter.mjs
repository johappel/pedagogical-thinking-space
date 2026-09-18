// Quill adapter (Spike §7). The ONLY place that knows both the Teaching Product
// domain block and the Quill editor state. Naming is deliberate and strict:
//
//   editorDelta   a Quill Delta — the editor's own op format (UI concern)
//   semanticDelta a PTS product change classification (domain concern)
//
// The two must never be conflated. This adapter converts between a domain block
// and an editor state; it does NOT mutate the product. The caller feeds the
// returned mutation descriptor into product.mjs `replaceBlock`, so all domain
// identity, revision and provenance rules stay in the domain.

import { markupToOps, opsToMarkup } from './markup.mjs';
import { findBlock, replaceBlock } from './product.mjs';

/**
 * Project one domain block into an editor state Quill can load. Read-only:
 * opening a block never changes the product (Spike §9).
 *
 * @returns {{ lessonId, phaseId, blockId, type, editorDelta: { ops: Array } }}
 */
export function domainBlockToEditorState(product, { lessonId, phaseId, blockId }) {
	const { block } = findBlock(product, lessonId, phaseId, blockId);
	return {
		lessonId,
		phaseId,
		blockId,
		type: block.type,
		editorDelta: { ops: markupToOps(block.content) },
	};
}

/**
 * Turn the current editor state into a targeted domain mutation descriptor —
 * the neutral block content the domain will store. It does NOT touch the
 * product; it only normalizes the Quill Delta into editor-neutral markup and
 * names the exact block to change.
 *
 * @returns {{ lessonId, phaseId, blockId, content }}
 */
export function editorStateToDomainMutation({ lessonId, phaseId, blockId }, editorDelta) {
	return { lessonId, phaseId, blockId, content: opsToMarkup(editorDelta) };
}

/**
 * Apply an editor state as one targeted in-place block edit and return the
 * change record (uncommitted). A convenience over the two steps above; still no
 * full-document regeneration — exactly one block by its stable id.
 */
export function applyEditorState(product, { lessonId, phaseId, blockId }, editorDelta) {
	const mutation = editorStateToDomainMutation({ lessonId, phaseId, blockId }, editorDelta);
	return replaceBlock(product, mutation);
}
