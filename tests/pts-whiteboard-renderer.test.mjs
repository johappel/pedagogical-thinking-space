import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DESIGNER_CAPABILITIES,
	ROLE_PRESENTATION,
	RenderPlanError,
	designRenderPlan,
	validateRenderPlan,
} from '../plugins/pts-whiteboard-renderer/lib/render-plan.mjs';
import { apply as applyRenderer } from '../plugins/pts-whiteboard-renderer/lib/index.js';
import { compileRenderPlan, rendererCapabilities } from '../plugins/pts-whiteboard-renderer/lib/renderer.mjs';
import { RENDER_PLAN_GUIDANCE } from '../plugins/pts-whiteboard-renderer/lib/index.js';
import { HIDDEN_FROM_COMPANION } from '../dsh/presets/pts-companion/companion-tool-boundary.mjs';

const snapshot = {
	page: { id: 'page:overview', name: 'Übersicht', pageCount: 1 },
	notes: [
		{ id: 'shape:moment', text: 'Kinder entdecken, dass Danke nicht selbstverständlich ist', actor: 'human' },
		{ id: 'shape:song', text: 'Lied „Danke“', actor: 'human' },
		{ id: 'shape:box', text: 'Danke-Kiste', actor: 'human' },
	],
	frames: [],
};

function request(overrides = {}) {
	return {
		operation: 'create_learning_moment_workspace',
		page: { action: 'ensure', title: 'LM · Danke' },
		heading: { text: 'Lernmoment (Entwurf): Kinder entdecken, dass „Danke“ nicht selbstverständlich ist – wofür und wem?' },
		layout: { template: 'learning_moment_workspace' },
		elements: [
			{ key: 'moment', source: 'existing', role: 'learning_moment', ref: { text: 'Kinder entdecken, dass Danke nicht selbstverständlich ist' } },
			{ key: 'song', source: 'existing', role: 'method_idea', ref: { text: 'Lied „Danke“' } },
			{ key: 'box', source: 'existing', role: 'method_idea', ref: { text: 'Danke-Kiste' } },
		],
		overview: { action: 'ensure_page_reference', targetPage: 'LM · Danke' },
		...overrides,
	};
}

test('RenderPlan validates the semantic language and role mapping', () => {
	const plan = validateRenderPlan(request());
	assert.equal(plan.layout.template, 'learning_moment_workspace');
	assert.deepEqual(Object.keys(ROLE_PRESENTATION), [
		'learning_moment', 'method_idea', 'open_question', 'document_reference', 'material_reference', 'page_reference',
	]);
	assert.equal(ROLE_PRESENTATION.learning_moment.shape, 'note');
	assert.notEqual(ROLE_PRESENTATION.learning_moment.color, ROLE_PRESENTATION.method_idea.color);
	assert.ok(Object.values(ROLE_PRESENTATION).every((role) => [
		'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue',
		'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white',
	].includes(role.color)));
});

test('Designer resolves existing cards by semantic text, without exposing ids to the request', () => {
	const plan = designRenderPlan(request(), snapshot);
	assert.deepEqual(plan.elements.map((element) => element.ref.id), ['shape:moment', 'shape:song', 'shape:box']);
	assert.equal(plan.designer.kind, 'pts-whiteboard-designer');
});

test('Designer rejects ambiguous and missing references before mutation', () => {
	assert.throws(() => designRenderPlan(request({ elements: [{ source: 'existing', role: 'method_idea', ref: { text: 'fehlt' } }], overview: undefined }), snapshot), (error) => error instanceof RenderPlanError && error.code === 'missing-reference');
	const ambiguous = { ...snapshot, notes: [...snapshot.notes, { id: 'shape:song2', text: 'Lied „Danke“' }] };
	assert.throws(() => designRenderPlan(request(), ambiguous), (error) => error instanceof RenderPlanError && error.code === 'ambiguous-reference');
});

test('unsupported dsh-whiteboard capabilities fail closed without a partial plan', () => {
	const plan = designRenderPlan(request(), snapshot, DESIGNER_CAPABILITIES);
	assert.throws(() => compileRenderPlan(plan, rendererCapabilities(['whiteboard_state'])), (error) => {
		assert.equal(error.code, 'capability-missing');
		assert.deepEqual(error.details.missing, ['page_create', 'page_switch', 'shape_copy_between_pages', 'shape_links', 'asset_image_shape']);
		return true;
	});
});

test('role semantics are not origin semantics and domain writes are absent', async () => {
	const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../plugins/pts-whiteboard-renderer/lib/index.js', import.meta.url), 'utf8'));
	assert.match(source, /LearningMoment-Domainpersistenz/);
	assert.doesNotMatch(source, /decisions\.yml/);
	assert.doesNotMatch(source, /record_denkstand/);
	assert.doesNotMatch(source, /ctx\.subagents\.start/);
});

test('material and document roles are bounded references, not folder imports', () => {
	const plan = validateRenderPlan(request({
		elements: [
			{ source: 'material', role: 'material_reference', material: { path: 'materials-test/bild-1.jpg', presentation: 'image' } },
			{ source: 'document', role: 'document_reference', document: { path: 'materials-test/lied.pdf', label: 'Liedtext „Danke“' } },
		],
	}));
	assert.equal(plan.elements[0].material.presentation, 'image');
	assert.equal(plan.elements[1].document.path, 'materials-test/lied.pdf');
});

test('the current Companion boundary hides Whiteboard primitives behind the semantic tool', () => {
	for (const name of [
		'whiteboard_request_open', 'whiteboard_state', 'whiteboard_add_note', 'whiteboard_rename_cluster',
		'whiteboard_bind_frame', 'whiteboard_frame_to_back',
		'whiteboard_arrange_sequence', 'whiteboard_propose_clusters',
		'whiteboard_connect_notes', 'whiteboard_highlight_notes',
		'whiteboard_render_plan',
	]) assert.ok(HIDDEN_FROM_COMPANION.includes(name), `${name} must stay internal`);
	assert.ok(!HIDDEN_FROM_COMPANION.includes('pts_whiteboard_render'));
});

test('the semantic renderer requests the closed board and continues after it becomes live', async () => {
	let stateCalls = 0;
	let openCalls = 0;
	let renderCalls = 0;
	const definitions = new Map();
	const stateTool = {
		execute: async () => {
			stateCalls += 1;
			return stateCalls === 1
				? { live: false, available: false, snapshot: null }
				: { live: true, available: true, snapshot };
		},
	};
	const openTool = {
		execute: async () => { openCalls += 1; return { accepted: true, requested: true }; },
	};
	const lowLevelTool = {
		execute: async () => { renderCalls += 1; return { accepted: true, op: 'render-plan' }; },
	};
	definitions.set('whiteboard_state', stateTool);
	definitions.set('whiteboard_request_open', openTool);
	definitions.set('whiteboard_render_plan', lowLevelTool);
	const ctx = {
		get(name) {
			if (name === 'webServer') return { register: () => () => {} };
			if (name === 'tools') return {
				get: (toolName) => definitions.get(toolName),
				register: (definition) => { definitions.set(definition.name, definition); return () => {}; },
			};
			return undefined;
		},
		effect(effect) { effect(); },
	};
	applyRenderer(ctx);
	const result = await definitions.get('pts_whiteboard_render').execute(request(), { agent: { id: 'test-session' } });
	assert.equal(result.status, 'queued');
	assert.equal(openCalls, 1);
	assert.ok(stateCalls >= 2);
	assert.equal(renderCalls, 1);
});

test('the renderer capability gives the Companion an explicit execution contract', () => {
	assert.match(RENDER_PLAN_GUIDANCE, /pts_whiteboard_render/);
	assert.match(RENDER_PLAN_GUIDANCE, /role="open_question"/);
	assert.match(RENDER_PLAN_GUIDANCE, /role="method_idea"/);
	assert.match(RENDER_PLAN_GUIDANCE, /elements\[\]\.text/);
	assert.match(RENDER_PLAN_GUIDANCE, /operation="create"/);
	assert.match(RENDER_PLAN_GUIDANCE, /status="queued"/);
});
