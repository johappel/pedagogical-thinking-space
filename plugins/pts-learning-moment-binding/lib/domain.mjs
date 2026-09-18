// Canonical LearningMoment domain — the SINGLE structured source of truth.
//
// A LearningMoment exists exactly once here, keyed by its stable `domainId`
// (`lm-…`). Content (title, description, pedagogical fields, status), the
// canonical version, provenance and timestamps all live in ONE store file,
// `learning-moments.json`, in the Denkraum root. Nothing reconstructs a moment
// from `learning-landscape.md` (removed) or from `learning-design.md` prose:
// those are never a structured source. The projection ledger
// (`learning-moment-bindings.json`) is a pure projection sidecar and never
// carries content — see bindings.mjs.
//
// The pure functions take a parsed store and return a new store plus a result
// (no IO, no clock beyond an injected `now`). The IO façade at the bottom
// (`listLearningMoments`, `getLearningMoment`, `createLearningMoment`,
// `updateLearningMoment`, `deleteLearningMoment`) is the only path the rest of
// the system uses; Whiteboard and Produktwerkstatt read exclusively through it.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const STORE_SCHEMA = 'ptspace.learning-moments/v1';
export const STORE_FILE = 'learning-moments.json';

// A stable canonical id is `lm-…`. It never depends on a shape, a session or a
// page, and a later title change does not change it.
const DOMAIN_ID = /^lm-[a-z0-9][a-z0-9-]*$/;

// Pedagogical statuses a moment can carry (the old landscape draft/stable/…).
const STATUSES = ['draft', 'stable', 'needs_review'];
const DEFAULT_STATUS = 'draft';

// Optional pedagogical fields preserved from the earlier landscape model so the
// reaction/impact model keeps working. They are content, not identity.
export const PEDAGOGICAL_FIELDS = Object.freeze([
	'type', 'function', 'learning_activity', 'expected_experience', 'material_needs', 'materials', 'open_questions',
]);
// Numeric optional fields (e.g. the teacher's per-moment time estimate).
export const NUMERIC_FIELDS = Object.freeze(['time_estimate']);
// Every field a patch/create may set as content (title/description included).
export const CONTENT_FIELDS = Object.freeze(['title', 'content', 'status', ...PEDAGOGICAL_FIELDS, ...NUMERIC_FIELDS]);

export function isDomainId(value) {
	return typeof value === 'string' && DOMAIN_ID.test(value);
}

export class DomainError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = 'DomainError';
		this.code = code;
		this.details = details;
	}
}

const nowIso = () => new Date().toISOString();

export function emptyStore() {
	return { schema: STORE_SCHEMA, moments: [] };
}

function normStatus(value) {
	return STATUSES.includes(value) ? value : DEFAULT_STATUS;
}

function normStringField(value) {
	if (Array.isArray(value)) return value.map((v) => String(v ?? '')).filter((v) => v.trim() !== '');
	return typeof value === 'string' ? value : '';
}

function normProvenance(provenance) {
	const source = provenance && typeof provenance === 'object' ? provenance : {};
	const createdFrom = source.createdFrom && typeof source.createdFrom === 'object' ? source.createdFrom : null;
	return {
		...(createdFrom && ['conversation', 'whiteboard', 'other'].includes(createdFrom.type)
			? { createdFrom: { type: createdFrom.type, ...(typeof createdFrom.sourceId === 'string' ? { sourceId: createdFrom.sourceId } : {}) } }
			: {}),
		confirmedBy: 'teacher',
		confirmedAt: typeof source.confirmedAt === 'string' && source.confirmedAt !== '' ? source.confirmedAt : new Date(0).toISOString(),
	};
}

function normMoment(m) {
	const moment = {
		domainId: m.domainId,
		title: typeof m.title === 'string' ? m.title : '',
		content: typeof m.content === 'string' ? m.content : '',
		status: normStatus(m.status),
		version: Number.isInteger(m.version) && m.version >= 1 ? m.version : 1,
		provenance: normProvenance(m.provenance),
		createdAt: typeof m.createdAt === 'string' && m.createdAt !== '' ? m.createdAt : new Date(0).toISOString(),
		updatedAt: typeof m.updatedAt === 'string' && m.updatedAt !== '' ? m.updatedAt : new Date(0).toISOString(),
	};
	for (const field of PEDAGOGICAL_FIELDS) {
		if (Object.hasOwn(m, field)) moment[field] = normStringField(m[field]);
	}
	for (const field of NUMERIC_FIELDS) {
		if (Object.hasOwn(m, field)) moment[field] = Number.isFinite(m[field]) ? m[field] : null;
	}
	return moment;
}

/** Parse the JSON store; a missing/empty file is an empty store, not an error. */
export function parseStore(text) {
	if (text === undefined || text === null || String(text).trim() === '') return emptyStore();
	let value;
	try {
		value = typeof text === 'string' ? JSON.parse(text) : text;
	} catch {
		throw new DomainError('store-corrupt', 'LearningMoment-Store ist kein gültiges JSON');
	}
	if (!value || value.schema !== STORE_SCHEMA || !Array.isArray(value.moments)) {
		throw new DomainError('store-corrupt', 'LearningMoment-Store hat ein unbekanntes Schema');
	}
	return {
		schema: STORE_SCHEMA,
		moments: value.moments.filter((m) => isDomainId(m?.domainId)).map(normMoment),
	};
}

/** Deterministic serialization (stable key order) for a lossless round-trip. */
export function serializeStore(store) {
	const moments = [...(store?.moments ?? [])]
		.filter((m) => isDomainId(m?.domainId))
		.sort((a, b) => a.domainId.localeCompare(b.domainId))
		.map((m) => {
			const out = {
				domainId: m.domainId,
				title: m.title ?? '',
				content: m.content ?? '',
				status: normStatus(m.status),
				version: m.version,
				provenance: normProvenance(m.provenance),
				createdAt: m.createdAt,
				updatedAt: m.updatedAt,
			};
			for (const field of PEDAGOGICAL_FIELDS) {
				if (Object.hasOwn(m, field)) out[field] = m[field];
			}
			for (const field of NUMERIC_FIELDS) {
				if (Object.hasOwn(m, field)) out[field] = m[field];
			}
			return out;
		});
	return JSON.stringify({ schema: STORE_SCHEMA, moments }, null, 2) + '\n';
}

export function findMoment(store, domainId) {
	return (store?.moments ?? []).find((m) => m.domainId === domainId) ?? null;
}

export function listMoments(store) {
	return [...(store?.moments ?? [])].sort((a, b) => a.domainId.localeCompare(b.domainId));
}

function replaceMoment(store, updated) {
	return { ...store, moments: store.moments.map((m) => (m.domainId === updated.domainId ? updated : m)) };
}

function comparable(value) {
	if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
	return String(value ?? '').trim();
}
function sameValue(a, b) {
	return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

/**
 * Create a canonical LearningMoment. This is the ONLY birth path — never a side
 * effect of a raw whiteboard card. Idempotent: a second create of the same id
 * returns the existing object and creates no duplicate.
 *
 * @param {object} store parsed store
 * @param {object} input { domainId, title, content?, status?, createdFrom?, confirmedAt?, ...pedagogical }
 * @param {object} [options] { now }
 */
export function createMoment(store, input = {}, options = {}) {
	const now = typeof options.now === 'function' ? options.now : nowIso;
	const { domainId, title } = input;
	if (!isDomainId(domainId)) throw new DomainError('invalid-domain-id', 'Keine gültige kanonische LearningMoment-ID', { domainId });
	if (typeof title !== 'string' || title.trim() === '') throw new DomainError('title-required', 'LearningMoment braucht einen Titel', { domainId });
	const existing = findMoment(store, domainId);
	if (existing) return { ok: true, created: false, store, moment: existing };
	const ts = now();
	const moment = normMoment({
		domainId,
		title,
		content: input.content,
		status: input.status,
		version: 1,
		provenance: { createdFrom: input.createdFrom, confirmedAt: input.confirmedAt ?? ts },
		createdAt: ts,
		updatedAt: ts,
		...Object.fromEntries(PEDAGOGICAL_FIELDS.filter((f) => Object.hasOwn(input, f)).map((f) => [f, input[f]])),
		...Object.fromEntries(NUMERIC_FIELDS.filter((f) => Object.hasOwn(input, f)).map((f) => [f, input[f]])),
	});
	return { ok: true, created: true, store: { ...store, moments: [...store.moments, moment] }, moment };
}

/**
 * Update canonical content in place: the domainId (identity) never changes, a
 * content change bumps the version and touches updatedAt. `expectedVersion` is
 * an optional stale guard — a late background write on an older version fails
 * closed instead of silently overwriting.
 *
 * @returns { ok:true, store, moment, changedFields, versionBefore, versionAfter }
 *        | { ok:false, code:'stale', currentVersion, expectedVersion, store, moment }
 */
export function updateMoment(store, domainId, patch = {}, options = {}) {
	const now = typeof options.now === 'function' ? options.now : nowIso;
	const moment = findMoment(store, domainId);
	if (!moment) throw new DomainError('unknown-domain-id', 'Unbekannte LearningMoment-ID', { domainId });
	const expectedVersion = options.expectedVersion;
	if (expectedVersion !== undefined && expectedVersion !== moment.version) {
		return { ok: false, code: 'stale', currentVersion: moment.version, expectedVersion, store, moment };
	}
	const changedFields = CONTENT_FIELDS.filter((field) => Object.hasOwn(patch, field) && !sameValue(moment[field], patch[field]));
	if (changedFields.length === 0) {
		return { ok: true, store, moment, changedFields: [], versionBefore: moment.version, versionAfter: moment.version };
	}
	const next = { ...moment };
	for (const field of changedFields) {
		if (field === 'status') next.status = normStatus(patch.status);
		else if (NUMERIC_FIELDS.includes(field)) next[field] = Number.isFinite(patch[field]) ? patch[field] : null;
		else if (PEDAGOGICAL_FIELDS.includes(field)) next[field] = normStringField(patch[field]);
		else next[field] = typeof patch[field] === 'string' ? patch[field] : String(patch[field] ?? '');
	}
	next.version = moment.version + 1;
	next.updatedAt = now();
	return { ok: true, store: replaceMoment(store, next), moment: next, changedFields, versionBefore: moment.version, versionAfter: next.version };
}

/**
 * Explicit, separate domain deletion. Never a side effect of a board action;
 * detaching projections leaves the LearningMoment intact.
 */
export function deleteMoment(store, domainId, options = {}) {
	const moment = findMoment(store, domainId);
	if (!moment) throw new DomainError('unknown-domain-id', 'Unbekannte LearningMoment-ID', { domainId });
	const expectedVersion = options.expectedVersion;
	if (expectedVersion !== undefined && expectedVersion !== moment.version) {
		return { ok: false, code: 'stale', currentVersion: moment.version, expectedVersion, store, moment };
	}
	return { ok: true, store: { ...store, moments: store.moments.filter((m) => m.domainId !== domainId) }, removed: moment };
}

// --------------------------------------------------------------- IO façade
// The one seam the rest of the system uses. `root` is the resolved Denkraum
// root (see resolveDenkraumRoot); the store file is `learning-moments.json`.

async function readStore(root) {
	try {
		return parseStore(await fs.readFile(path.join(root, STORE_FILE), 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') return emptyStore();
		throw error;
	}
}

async function writeStore(root, store) {
	await fs.writeFile(path.join(root, STORE_FILE), serializeStore(store), 'utf8');
}

export async function listLearningMoments(root) {
	return listMoments(await readStore(root));
}

export async function getLearningMoment(root, domainId) {
	return findMoment(await readStore(root), domainId);
}

export async function createLearningMoment(root, input, options = {}) {
	const store = await readStore(root);
	const result = createMoment(store, input, options);
	if (result.created) await writeStore(root, result.store);
	return { created: result.created, moment: result.moment };
}

export async function updateLearningMoment(root, domainId, patch, expectedVersion, options = {}) {
	const store = await readStore(root);
	const result = updateMoment(store, domainId, patch, { ...options, expectedVersion });
	if (result.ok && result.versionAfter !== result.versionBefore) await writeStore(root, result.store);
	return result;
}

export async function deleteLearningMoment(root, domainId, expectedVersion) {
	const store = await readStore(root);
	const result = deleteMoment(store, domainId, { expectedVersion });
	if (result.ok) await writeStore(root, result.store);
	return result;
}
