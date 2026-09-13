import { readFile } from 'node:fs/promises';

export const SEMANTIC_ROLES = Object.freeze([
	'note', 'learning_moment', 'method_idea', 'open_question', 'document_reference',
	'material_reference', 'page_reference',
]);

export const LAYOUT_TEMPLATES = Object.freeze([
	'learning_moment_workspace', 'comparison', 'pro_con', 'cause_effect',
	'sequence', 'cluster', 'matrix', 'timeline',
]);

export const ROLE_PRESENTATION = Object.freeze({
	note: { role: 'note', shape: 'note', color: 'yellow', emphasis: 'plain' },
	learning_moment: { role: 'anchor', shape: 'note', color: 'light-blue', emphasis: 'anchor' },
	method_idea: { role: 'idea', shape: 'note', color: 'yellow', emphasis: 'secondary' },
	open_question: { role: 'question', shape: 'note', color: 'light-violet', emphasis: 'question' },
	document_reference: { role: 'reference', shape: 'note', color: 'light-green', emphasis: 'reference' },
	material_reference: { role: 'reference', shape: 'note', color: 'orange', emphasis: 'reference' },
	page_reference: { role: 'navigation', shape: 'note', color: 'blue', emphasis: 'navigation' },
});

// Old Phase-1 cards stored their presentation label in the visible content.
// This belongs to PTS, not the generic board: it is only used when a teacher
// explicitly asks to re-render an existing PTS card.
const LEGACY_VISIBLE_PREFIX = Object.freeze({
	learning_moment: '⚓ Lernmoment:',
	method_idea: '💡 Methodenidee:',
	open_question: '? Offene Frage:',
	document_reference: '📄 Dokument:',
	material_reference: '🧰 Material:',
	page_reference: '↗ Denkraum:',
});

export const DESIGNER_CAPABILITIES = Object.freeze([
	'active_page_snapshot', 'shape_meta', 'page_create', 'page_rename', 'page_switch',
	'shape_copy_between_pages', 'shape_links', 'asset_image_shape', 'pts_document_route',
	'pts_material_reference_route',
]);

export class RenderPlanError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = 'RenderPlanError';
		this.code = code;
		this.details = details;
	}
}

function text(value, field, max = 600) {
	if (typeof value !== 'string' || value.trim() === '') throw new RenderPlanError('invalid-plan', `${field} muss Text enthalten`, { field });
	if (value.length > max) throw new RenderPlanError('invalid-plan', `${field} ist zu lang`, { field, max });
	return value.trim();
}

function assertPlain(value, field) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RenderPlanError('invalid-plan', `${field} muss ein Objekt sein`, { field });
}

export function validateRenderPlan(plan) {
	assertPlain(plan, 'plan');
	const allowedOperations = new Set(['create_learning_moment_workspace', 'update_learning_moment_workspace', 'materialize_selection', 'compact_document_reference']);
	if (!allowedOperations.has(plan.operation)) throw new RenderPlanError('invalid-plan', 'operation ist nicht erlaubt', { operation: plan.operation });
	assertPlain(plan.page, 'page');
	if (!['ensure', 'use_current'].includes(plan.page.action)) throw new RenderPlanError('invalid-plan', 'page.action ist nicht erlaubt', { action: plan.page.action });
	const pageTitle = text(plan.page.title, 'page.title', 120);
	assertPlain(plan.layout, 'layout');
	if (!LAYOUT_TEMPLATES.includes(plan.layout.template)) throw new RenderPlanError('invalid-plan', 'layout.template ist nicht verfügbar', { template: plan.layout.template, available: LAYOUT_TEMPLATES });
	if (plan.heading !== undefined) {
		assertPlain(plan.heading, 'heading');
		text(plan.heading.text, 'heading.text');
	}
	if (!Array.isArray(plan.elements) || plan.elements.length > 40) throw new RenderPlanError('invalid-plan', 'elements muss ein begrenztes Array sein');
	const keys = new Set();
	const elements = plan.elements.map((element, index) => {
		assertPlain(element, `elements[${index}]`);
		if (!['existing', 'new', 'material', 'document'].includes(element.source)) throw new RenderPlanError('invalid-plan', 'Quelle nicht erlaubt', { index });
		const role = element.role === undefined ? 'note' : element.role;
		if (!SEMANTIC_ROLES.includes(role)) throw new RenderPlanError('invalid-role', `Unbekannte semantische Rolle: ${role}`, { index });
		const key = element.key === undefined ? `${role}:${index}` : text(element.key, `elements[${index}].key`, 120);
		if (keys.has(key)) throw new RenderPlanError('ambiguous-plan', `Doppelter Element-Schlüssel: ${key}`, { key });
		keys.add(key);
		if (element.source === 'existing') {
			assertPlain(element.ref, `elements[${index}].ref`);
			if (element.ref.id === undefined && element.ref.text === undefined) throw new RenderPlanError('invalid-plan', 'existing benötigt ref.id oder ref.text', { index });
		} else if (element.source === 'new') {
			text(element.text, `elements[${index}].text`);
		} else if (element.source === 'document') {
			assertPlain(element.document, `elements[${index}].document`);
			if (element.document.documentId === undefined && element.document.path === undefined) throw new RenderPlanError('invalid-plan', 'document benötigt documentId oder path', { index });
		} else {
			assertPlain(element.material, `elements[${index}].material`);
			text(element.material.path, `elements[${index}].material.path`, 500);
			if (!['image', 'reference'].includes(element.material.presentation)) throw new RenderPlanError('invalid-plan', 'material.presentation ist erforderlich', { index });
		}
		return { ...element, role, key };
	});
	if (plan.links !== undefined && !Array.isArray(plan.links)) throw new RenderPlanError('invalid-plan', 'links muss ein Array sein');
	if (plan.overview !== undefined) {
		assertPlain(plan.overview, 'overview');
		if (plan.overview.action !== 'ensure_navigation_reference') throw new RenderPlanError('invalid-plan', 'overview.action ist nicht erlaubt');
	}
	if (plan.detach !== undefined) {
		if (!Array.isArray(plan.detach)) throw new RenderPlanError('invalid-plan', 'detach muss ein Array sein');
		plan.detach.forEach((entry, index) => {
			assertPlain(entry, `detach[${index}]`);
			if (!SEMANTIC_ROLES.includes(entry.role)) throw new RenderPlanError('invalid-role', `Unbekannte semantische Rolle: ${entry.role}`, { index });
			text(entry.match, `detach[${index}].match`, 600);
		});
	}
	return { ...plan, page: { ...plan.page, title: pageTitle }, elements };
}

function normalize(value) {
	return String(value ?? '').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[„“"'`]/g, '').replace(/\s+/g, ' ').trim();
}

function snapshotShapes(snapshot) {
	const result = [];
	const seen = new Set();
	for (const shape of [
		...(Array.isArray(snapshot?.elements) ? snapshot.elements : []),
		...(Array.isArray(snapshot?.notes) ? snapshot.notes.map((entry) => ({ ...entry, type: 'note' })) : []),
		...(Array.isArray(snapshot?.frames) ? snapshot.frames.map((entry) => ({ ...entry, type: 'frame' })) : []),
	]) {
		const id = shape?.id === undefined ? null : String(shape.id);
		if (id !== null && seen.has(id)) continue;
		if (id !== null) seen.add(id);
		result.push({ ...shape, type: String(shape?.type ?? 'unknown') });
	}
	return result;
}

export function resolveShapeReference(ref, snapshot, index = 0) {
	const shapes = snapshotShapes(snapshot);
	let matches = [];
	if (ref?.id !== undefined) matches = shapes.filter((shape) => String(shape.id) === String(ref.id));
	if (matches.length === 0 && ref?.text !== undefined) {
		const needle = normalize(ref.text);
		matches = shapes.filter((shape) => normalize(shape.text || shape.geo || shape.name) === needle);
	}
	if (matches.length === 0) throw new RenderPlanError('missing-reference', 'Whiteboard-Element nicht gefunden', { index, ref });
	if (matches.length > 1) throw new RenderPlanError('ambiguous-reference', 'Whiteboard-Referenz ist nicht eindeutig', { index, ref, ids: matches.map((shape) => shape.id) });
	return matches[0];
}

/**
 * The Designer seam is deliberately pure: interpretation may later be
 * supplied by a DSH child, while validation and reference resolution remain
 * deterministic and testable in the host renderer.
 */
export function designRenderPlan(request, snapshot, capabilities = DESIGNER_CAPABILITIES) {
	assertPlain(request, 'request');
	const candidate = request.renderPlan ?? request.plan ?? request;
	const plan = validateRenderPlan(candidate);
	const currentPage = snapshot?.page ?? {};
	if (plan.page.action === 'use_current' && plan.page.title !== currentPage.name) {
		throw new RenderPlanError('page-mismatch', 'Der Auftrag verlangt eine andere aktive Page', { requested: plan.page.title, current: currentPage.name });
	}
	if (plan.page.action === 'ensure' && plan.page.title !== currentPage.name && Number(currentPage.pageCount ?? 1) > 1 && !capabilities.includes('page_switch')) {
		throw new RenderPlanError('capability-missing', 'Page-Auflösung außerhalb der aktiven Page ist nicht verfügbar', { capability: 'page_switch' });
	}
	const legacyDetach = [];
	const resolved = plan.elements.map((element, index) => {
		if (element.source !== 'existing') return element;
		const shape = resolveShapeReference(element.ref, snapshot, index);
		const ref = { id: shape.id };
		if (element.ref.text !== undefined) ref.text = element.ref.text;
		const sourceText = String(shape.text ?? '');
		const prefix = LEGACY_VISIBLE_PREFIX[element.role];
		if (prefix && sourceText.startsWith(prefix)) {
			const visibleText = sourceText.slice(prefix.length).trimStart();
			legacyDetach.push({ role: element.role, match: sourceText });
			return { ...element, ref, text: visibleText, resolvedType: shape.type };
		}
		return { ...element, ref, resolvedType: shape.type };
	});
	return { ...plan, elements: resolved, detach: [...(plan.detach ?? []), ...legacyDetach], designer: { kind: 'pts-whiteboard-designer', version: 1 } };
}

export async function loadSchema(schemaPath) {
	return JSON.parse(await readFile(schemaPath, 'utf8'));
}
