// Companion edit API (Spike §14/§15). The Companion may change the product, but
// ONLY through targeted mutations against stable ids — never a full document
// regeneration. Each call mutates exactly one target and commits one revision
// tagged `actor: 'companion'`, so teacher and companion changes stay
// distinguishable in the history.

import { replaceBlock, setPhaseDuration, commit } from './product.mjs';

/** Companion replaces the content of exactly one block, then commits. */
export function companionReplaceBlock(product, { lessonId, phaseId, blockId, content }, options = {}) {
	const edited = replaceBlock(product, { lessonId, phaseId, blockId, content });
	return commit(edited.product, [edited.change], { actor: 'companion', now: options.now });
}

/** Companion adjusts a phase duration, then commits. */
export function companionUpdatePhaseDuration(product, { lessonId, phaseId, durationMinutes }, options = {}) {
	const edited = setPhaseDuration(product, { lessonId, phaseId, durationMinutes });
	return commit(edited.product, [edited.change], { actor: 'companion', now: options.now });
}
