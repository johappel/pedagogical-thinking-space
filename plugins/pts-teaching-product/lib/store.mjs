// Persistence for the Teaching Product spike (Spike §14/§17). The product lives
// in a JSON sidecar `.pts/teaching-product.json` in the Denkraum, next to the
// denkstand and learning-moment ledgers. This is the ONLY IO in the domain; the
// pure functions stay pure and testable.
//
// The store enforces the conflict backbone with OPTIMISTIC CONCURRENCY: a save
// carries the revision the editor was based on. If the stored product has moved
// on (e.g. a Companion edit landed), the save is rejected as a conflict and the
// teacher's work is never silently overwritten (Spike §12).
//
// The store writes nothing back into the Denkstand, the whiteboard or the
// LearningMoment ledger — the product boundary is one-way (Spike §17).

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { replaceBlock, setPhaseDuration, commit, findBlock, TEACHING_PRODUCT_SCHEMA } from './product.mjs';
import { createProductFromSnapshot } from './product.mjs';

export const PRODUCT_DIR = '.pts';
export const PRODUCT_FILE = 'teaching-product.json';
const LIMIT = 1024 * 1024;

export class StoreError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'StoreError';
		this.code = code;
		this.detail = detail;
	}
}

export function productPath(root) {
	if (typeof root !== 'string' || !path.isAbsolute(root)) throw new StoreError('invalid-root', 'Absoluter Denkraum-Pfad erforderlich');
	return path.join(root, PRODUCT_DIR, PRODUCT_FILE);
}

/** Load the product, or null when the sidecar does not exist yet. */
export async function loadProduct(root) {
	let text;
	try {
		text = await fs.readFile(productPath(root), 'utf8');
	} catch (err) {
		if (err && err.code === 'ENOENT') return null;
		throw err;
	}
	if (text.length > LIMIT) throw new StoreError('too-large', 'teaching-product.json überschreitet das Limit');
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new StoreError('corrupt', 'teaching-product.json ist kein gültiges JSON');
	}
	if (!value || value.schema !== TEACHING_PRODUCT_SCHEMA) throw new StoreError('unsupported', 'Unbekanntes Teaching-Product-Schema');
	return value;
}

async function writeProduct(root, product) {
	const target = productPath(root);
	await fs.mkdir(path.dirname(target), { recursive: true });
	const tmp = `${target}.${process.pid}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(product, null, 2) + '\n', 'utf8');
	await fs.rename(tmp, target); // atomic swap so teacher/companion never see a half file
	return product;
}

/** Seed a fresh product from a snapshot; refuses to clobber an existing one. */
export async function initProduct(root, snapshot, input = {}, options = {}) {
	if (await loadProduct(root)) throw new StoreError('exists', 'Teaching Product existiert bereits');
	const product = createProductFromSnapshot(snapshot, input, options);
	return writeProduct(root, product);
}

/** Save the whole product after in-memory structural edits (add lesson/phase …). */
export async function saveProduct(root, product) {
	if (!product || product.schema !== TEACHING_PRODUCT_SCHEMA) throw new StoreError('unsupported', 'Kein gültiges Teaching Product');
	return writeProduct(root, product);
}

function guardRevision(product, expectedRevision, target) {
	if (expectedRevision === undefined || expectedRevision === null) return;
	if (product.revision !== expectedRevision) {
		throw new StoreError('conflict', 'Dieser Abschnitt wurde inzwischen verändert.', {
			expectedRevision,
			currentRevision: product.revision,
			...target,
		});
	}
}

/**
 * The one write path a targeted block edit takes (teacher OR companion). Loads,
 * checks the optimistic revision, applies exactly one in-place block mutation,
 * commits one revision and writes atomically.
 */
export async function saveBlockEdit(root, { lessonId, phaseId, blockId, content, actor, expectedRevision }, options = {}) {
	const product = await loadProduct(root);
	if (!product) throw new StoreError('not-found', 'Kein Teaching Product vorhanden');
	guardRevision(product, expectedRevision, { lessonId, phaseId, blockId });
	findBlock(product, lessonId, phaseId, blockId); // fail closed on unknown target before mutating
	const edited = replaceBlock(product, { lessonId, phaseId, blockId, content });
	const committed = commit(edited.product, [edited.change], { actor, now: options.now });
	await writeProduct(root, committed.product);
	return committed;
}

/** Targeted phase-duration edit through the same conflict-guarded path. */
export async function savePhaseDuration(root, { lessonId, phaseId, durationMinutes, actor, expectedRevision }, options = {}) {
	const product = await loadProduct(root);
	if (!product) throw new StoreError('not-found', 'Kein Teaching Product vorhanden');
	guardRevision(product, expectedRevision, { lessonId, phaseId });
	const edited = setPhaseDuration(product, { lessonId, phaseId, durationMinutes });
	const committed = commit(edited.product, [edited.change], { actor, now: options.now });
	await writeProduct(root, committed.product);
	return committed;
}

/**
 * Phase 2B — settle a collaboratively edited block into ONE domain revision.
 * The CRDT already merged the text, so there is no optimistic-revision guard on
 * the text; but a structural conflict the CRDT cannot resolve (the block was
 * deleted meanwhile) still fails closed via findBlock. A settle whose merged
 * content equals the stored content is a no-op — no empty revision is created,
 * so idle settles and pure re-focus never pollute the domain history.
 */
export async function saveCollaborativeEdit(root, { lessonId, phaseId, blockId, content, contributors }, options = {}) {
	const product = await loadProduct(root);
	if (!product) throw new StoreError('not-found', 'Kein Teaching Product vorhanden');
	const { block } = findBlock(product, lessonId, phaseId, blockId); // structural conflict fails closed here
	if (block.content === content) return { product, revision: null, delta: null, noop: true };
	const edited = replaceBlock(product, { lessonId, phaseId, blockId, content });
	const committed = commit(edited.product, [edited.change], { actor: 'collaborative', contributors, now: options.now });
	await writeProduct(root, committed.product);
	return { ...committed, noop: false };
}
