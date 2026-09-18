// Public API of the Teaching Product spike domain. Pure logic only — no host
// wiring, no HTTP route, no UI. The web plugin and the browser E2E arrive in the
// next increment and consume exactly these functions.

export {
	PRODUCT_SNAPSHOT_SCHEMA,
	SnapshotError,
	createProductSnapshot,
	sourceRef,
} from './snapshot.mjs';

export {
	TEACHING_PRODUCT_SCHEMA,
	BLOCK_TYPES,
	ACTORS,
	ProductError,
	createProductFromSnapshot,
	addLesson,
	addPhase,
	renamePhase,
	reorderPhases,
	setPhaseDuration,
	addBlock,
	replaceBlock,
	removeBlock,
	commit,
	findLesson,
	findPhase,
	findBlock,
} from './product.mjs';

export {
	FORMATTING,
	classifyChange,
	semanticDelta,
	deltaSince,
} from './delta.mjs';

export {
	companionReplaceBlock,
	companionUpdatePhaseDuration,
} from './companion-edit.mjs';
