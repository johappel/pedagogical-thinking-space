import { readFile } from 'node:fs/promises';

export const SEMANTIC_ROLES = Object.freeze([
	'learning_moment', 'method_idea', 'open_question', 'document_reference',
	'material_reference', 'page_reference',
]);

export const ROLE_PRESENTATION = Object.freeze({
	learning_moment: { shape: 'note', color: 'light-blue', icon: '⚓', label: 'Lernmoment', emphasis: 'anchor' },
	method_idea: { shape: 'note', color: 'yellow', icon: '💡', label: 'Methodenidee', emphasis: 'secondary' },
	open_question: { shape: 'note', color: 'light-violet', icon: '?', label: 'Offene Frage', emphasis: 'question' },
	document_reference: { shape: 'note', color: 'light-green', icon: '📄', label: 'Dokument', emphasis: 'reference' },
	material_reference: { shape: 'note', color: 'orange', icon: '🧰', label: 'Material', emphasis: 'reference' },
	page_reference: { shape: 'note', color: 'blue', icon: '↗', label: 'Denkraum', emphasis: 'navigation' },
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
	if (plan.layout.template !== 'learning_moment_workspace') throw new RenderPlanError('invalid-plan', 'layout.template ist für Phase 1 nicht erlaubt');
	if (plan.heading !== undefined) {
		assertPlain(plan.heading, 'heading');
		text(plan.heading.text, 'heading.text');
	}
	if (!Array.isArray(plan.elements) || plan.elements.length > 40) throw new RenderPlanError('invalid-plan', 'elements muss ein begrenztes Array sein');
	const keys = new Set();
	const elements = plan.elements.map((element, index) => {
		assertPlain(element, `elements[${index}]`);
		if (!['existing', 'new', 'material', 'document'].includes(element.source)) throw new RenderPlanError('invalid-plan', 'Quelle nicht erlaubt', { index });
		if (!SEMANTIC_ROLES.includes(element.role)) throw new RenderPlanError('invalid-role', `Unbekannte semantische Rolle: ${element.role}`, { index });
		const key = element.key === undefined ? `${element.role}:${index}` : text(element.key, `elements[${index}].key`, 120);
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
		return { ...element, key };
	});
	if (plan.links !== undefined && !Array.isArray(plan.links)) throw new RenderPlanError('invalid-plan', 'links muss ein Array sein');
	if (plan.overview !== undefined) {
		assertPlain(plan.overview, 'overview');
		if (plan.overview.action !== 'ensure_page_reference') throw new RenderPlanError('invalid-plan', 'overview.action ist nicht erlaubt');
	}
	if (plan.detach !== undefined && !Array.isArray(plan.detach)) throw new RenderPlanError('invalid-plan', 'detach muss ein Array sein');
	return { ...plan, page: { ...plan.page, title: pageTitle }, elements };
}

function normalize(value) {
	return String(value ?? '').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[„“"'`]/g, '').replace(/\s+/g, ' ').trim();
}

function snapshotShapes(snapshot) {
	return [
		...(Array.isArray(snapshot?.notes) ? snapshot.notes.map((shape) => ({ ...shape, type: 'note' })) : []),
		...(Array.isArray(snapshot?.frames) ? snapshot.frames.map((shape) => ({ ...shape, type: 'frame' })) : []),
	];
}

export function resolveShapeReference(ref, snapshot, index = 0) {
	const shapes = snapshotShapes(snapshot);
	let matches = [];
	if (ref?.id !== undefined) matches = shapes.filter((shape) => String(shape.id) === String(ref.id));
	if (matches.length === 0 && ref?.text !== undefined) {
		const needle = normalize(ref.text);
		matches = shapes.filter((shape) => normalize(shape.text ?? shape.name) === needle);
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
	const resolved = plan.elements.map((element, index) => {
		if (element.source !== 'existing') return element;
		const shape = resolveShapeReference(element.ref, snapshot, index);
		const ref = { id: shape.id };
		if (element.ref.text !== undefined) ref.text = element.ref.text;
		return { ...element, ref, resolvedType: shape.type };
	});
	return { ...plan, elements: resolved, designer: { kind: 'pts-whiteboard-designer', version: 1 } };
}

export async function loadSchema(schemaPath) {
	return JSON.parse(await readFile(schemaPath, 'utf8'));
}
