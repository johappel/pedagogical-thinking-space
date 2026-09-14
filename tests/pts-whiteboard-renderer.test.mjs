import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DESIGNER_CAPABILITIES,
	LAYOUT_TEMPLATES,
	ROLE_PRESENTATION,
	RenderPlanError,
	designRenderPlan,
	validateRenderPlan,
} from '../plugins/pts-whiteboard-renderer/lib/render-plan.mjs';

test('the standard layout catalog is explicit and fails closed outside its allowlist', () => {
	assert.deepEqual(LAYOUT_TEMPLATES, ['learning_moment_workspace', 'comparison', 'pro_con', 'cause_effect', 'sequence', 'cluster', 'matrix', 'timeline']);
	for (const template of LAYOUT_TEMPLATES) {
		assert.equal(validateRenderPlan(request({ layout: { template } })).layout.template, template);
	}
	assert.throws(() => validateRenderPlan(request({ layout: { template: 'invented_board_skill' } })), (error) => error instanceof RenderPlanError && error.code === 'invalid-plan');
});
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
		overview: { action: 'ensure_navigation_reference', targetPage: 'LM · Danke' },
		...overrides,
	};
}

test('RenderPlan validates the semantic language and role mapping', () => {
	const plan = validateRenderPlan(request());
	assert.equal(plan.layout.template, 'learning_moment_workspace');
	assert.deepEqual(Object.keys(ROLE_PRESENTATION), [
		'note', 'learning_moment', 'method_idea', 'open_question', 'document_reference', 'material_reference', 'page_reference', 'free_text',
	]);
	assert.equal(ROLE_PRESENTATION.learning_moment.shape, 'note');
	assert.notEqual(ROLE_PRESENTATION.learning_moment.color, ROLE_PRESENTATION.method_idea.color);
	assert.ok(Object.values(ROLE_PRESENTATION).every((role) => [
		'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue',
		'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white',
	].includes(role.color)));
});

test('free text is a bounded new-text annotation rather than a card or a converted source', () => {
	const plan = validateRenderPlan(request({
		elements: [{ key: 'axis', source: 'new', role: 'free_text', text: 'Wirkung' }],
		overview: undefined,
	}));
	assert.equal(plan.elements[0].role, 'free_text');
	const compiled = compileRenderPlan(plan, rendererCapabilities(['whiteboard_render_plan']));
	assert.deepEqual(compiled.plan.elements[0].presentation, {
		role: 'annotation', shape: 'text', color: 'black', size: 'm', emphasis: 'plain',
	});
	assert.throws(() => validateRenderPlan(request({
		elements: [{ key: 'not-a-card', source: 'existing', role: 'free_text', ref: { id: 'shape:moment' } }],
		overview: undefined,
	})), (error) => error instanceof RenderPlanError && error.code === 'invalid-plan');
});

test('a new card needs no category and its visible content receives no presentation prefix', async () => {
	const content = 'Visible Learning bündelt Meta-Analysen: 2009 über 800, 2023 über 2.100 Meta-Analysen.';
	const plan = validateRenderPlan(request({
		elements: [{ key: 'evidence', source: 'new', text: content }],
		overview: undefined,
	}));
	assert.equal(plan.elements[0].role, 'note');
	assert.equal(plan.elements[0].text, content);
	const compiled = compileRenderPlan(plan, rendererCapabilities(['whiteboard_render_plan']));
	assert.equal(compiled.plan.elements[0].presentation.role, 'note');
	assert.equal('label' in compiled.plan.elements[0].presentation, false);
	assert.equal('icon' in compiled.plan.elements[0].presentation, false);

	const client = await import('node:fs/promises').then(({ readFile }) => readFile('F:/code/dsh-tldraw/plugin/dsh-whiteboard/lib/client.js', 'utf8'));
	assert.match(client, /spec\.label === undefined \? '' : String\(spec\.label\)\.trim\(\)/);
	assert.match(client, /var visibleText = prefix \? prefix \+ ': ' \+ String\(text\) : String\(text\)/);
});

test('re-rendering an old agent card removes only its former visible category prefix', async () => {
	const legacy = '💡 Methodenidee: Visible Learning bündelt Meta-Analysen.';
	const legacySnapshot = {
		...snapshot,
		notes: [{ id: 'shape:legacy', text: legacy, actor: 'agent' }],
	};
	const designed = designRenderPlan(request({
		elements: [{ key: 'legacy', source: 'existing', role: 'method_idea', ref: { text: legacy } }],
		overview: undefined,
	}), legacySnapshot);
	assert.equal(designed.elements[0].text, 'Visible Learning bündelt Meta-Analysen.');
	assert.deepEqual(designed.detach, [{ role: 'method_idea', match: legacy }]);
	const compiled = compileRenderPlan(designed, rendererCapabilities(['whiteboard_render_plan']));
	assert.deepEqual(compiled.plan.detach, [{ role: 'method_idea', match: legacy, presentationRole: 'idea' }]);
	const client = await import('node:fs/promises').then(({ readFile }) => readFile('F:/code/dsh-tldraw/plugin/dsh-whiteboard/lib/client.js', 'utf8'));
	assert.match(client, /function shapeCopy\(mods, source, styleSpec, x, y, key, textOverride\)/);
	assert.match(client, /textOverride === undefined \? propsToText\(source\.props\) : String\(textOverride\)/);
	assert.match(client, /sm\.sourceText \|\| propsToText\(all\[si\]\.props\) \|\| ''/);
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

test('PTS semantics compile to generic presentation specs only at the seam', () => {
	const compiled = compileRenderPlan(designRenderPlan(request(), snapshot), rendererCapabilities(['whiteboard_render_plan']));
	assert.deepEqual(compiled.plan.presentation.heading.role, 'anchor');
	assert.deepEqual(compiled.plan.presentation.navigation.role, 'navigation');
	assert.deepEqual(compiled.plan.elements.map((element) => element.presentation.role), ['anchor', 'idea', 'idea']);
	assert.equal(compiled.roles, undefined);
});

test('detach is translated once from PTS semantics to a generic presentation role', () => {
	const compiled = compileRenderPlan(designRenderPlan(request({ elements: [], detach: [{ role: 'method_idea', match: 'Menschliche Ursprungskarte' }] }), snapshot), rendererCapabilities(['whiteboard_render_plan']));
	assert.deepEqual(compiled.plan.detach, [{ role: 'method_idea', match: 'Menschliche Ursprungskarte', presentationRole: 'idea' }]);
});

test('generic renderer keeps the learning-moment element text distinct from the heading', async () => {
	const source = await import('node:fs/promises').then(({ readFile }) => readFile('F:/code/dsh-tldraw/plugin/dsh-whiteboard/lib/client.js', 'utf8'));
	assert.match(source, /anchorContent[\s\S]*el\.source === 'existing'[\s\S]*el\.text/);
});

test('designer resolves non-note shapes from the complete snapshot element list', () => {
	const completeSnapshot = {
		...snapshot,
		notes: [],
		elements: [
			{ id: 'shape:heart', type: 'geo', geo: 'heart', text: 'Hoffnung' },
			{ id: 'shape:plain-text', type: 'text', text: 'Einfacher Text' },
		],
	};
	const plan = designRenderPlan(request({
		elements: [
			{ key: 'heart', source: 'existing', role: 'method_idea', ref: { text: 'Hoffnung' } },
			{ key: 'plain', source: 'existing', role: 'open_question', ref: { text: 'Einfacher Text' } },
		],
		overview: undefined,
	}), completeSnapshot);
	assert.deepEqual(plan.elements.map((element) => element.ref.id), ['shape:heart', 'shape:plain-text']);
	assert.deepEqual(plan.elements.map((element) => element.resolvedType), ['geo', 'text']);
});

test('the root-scoped opener follows the active session for automatic opening', async () => {
	const source = await import('node:fs/promises').then(({ readFile }) => readFile('F:/code/dsh-tldraw/plugin/dsh-whiteboard/lib/client.js', 'utf8'));
	assert.match(source, /var rootSessionId = props && typeof props\.useSessions === 'function'[\s\S]*state && state\.current[\s\S]*var sessionId[\s\S]*rootSessionId/);
	assert.match(source, /function openBoard\(targetSessionId\)[\s\S]*if \(!targetSessionId \|\| opening \|\| !sidebarRef\.open\) return false/);
	assert.match(source, /function retryUntilBoardBodyBinds\(targetSessionId, attempts, onBound\)[\s\S]*requestedSessionId === targetSessionId[\s\S]*retryUntilBoardBodyBinds\(targetSessionId \|\| activeSessionRef\.current/);
	assert.match(source, /retryUntilBoardBodyBinds\(targetSessionId, 0, function \(\) \{[\s\S]*apiCall\('wb-open-ack', \{ sessionId: targetSessionId \}\)/);
});

test('the global tldraw host rejects stale or duplicate asynchronous mounts', async () => {
	const source = await import('node:fs/promises').then(({ readFile }) => readFile('F:/code/dsh-tldraw/plugin/dsh-whiteboard/lib/client.js', 'utf8'));
	assert.match(source, /var boardMountEpoch = 0/);
	assert.match(source, /function resetMountedBoard\(\) \{\s*boardMountEpoch \+= 1/);
	assert.match(source, /if \(boardSessionId === sessionId && boardKey === persistenceKey\) return;\s*var mountEpoch = \+\+boardMountEpoch/);
	assert.match(source, /loadModules\(\)\.then\(function \(mods\) \{\s*if \(mountEpoch !== boardMountEpoch \|\| requestedSessionId !== sessionId/);
});

test('generic dsh-whiteboard does not contain PTS semantic role names', async () => {
	const source = await import('node:fs/promises').then(({ readFile }) => readFile('F:/code/dsh-tldraw/plugin/dsh-whiteboard/lib/client.js', 'utf8'));
	for (const role of ['learning_moment', 'method_idea', 'open_question', 'document_reference', 'material_reference', 'page_reference']) {
		assert.doesNotMatch(source, new RegExp('\\b' + role + '\\b'));
	}
	assert.doesNotMatch(source, /semanticRole/);
	assert.doesNotMatch(source, /PTS Whiteboard Renderer/);
});

test('resource links remain valid across browser sessions', async () => {
	const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../plugins/pts-whiteboard-renderer/lib/index.js', import.meta.url), 'utf8'));
	assert.match(source, /resource\?path=/);
	assert.doesNotMatch(source, /resource\?session=/);
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

test('the Companion may read the Whiteboard but cannot use its mutation primitives directly', () => {
	for (const name of [
		'whiteboard_request_open', 'whiteboard_add_note', 'whiteboard_rename_cluster',
		'whiteboard_bind_frame', 'whiteboard_frame_to_back',
		'whiteboard_arrange_sequence', 'whiteboard_propose_clusters',
		'whiteboard_connect_notes', 'whiteboard_highlight_notes',
		'whiteboard_render_plan',
	]) assert.ok(HIDDEN_FROM_COMPANION.includes(name), `${name} must stay internal`);
	assert.ok(!HIDDEN_FROM_COMPANION.includes('whiteboard_state'));
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
				: { live: true, available: true, snapshot: renderCalls > 0 ? { ...snapshot, commandResults: [{ commandId: 'cmd-test-1', op: 'render-plan', ok: true }] } : snapshot };
		},
	};
	const openTool = {
		execute: async () => { openCalls += 1; return { accepted: true, requested: true }; },
	};
	const lowLevelTool = {
		execute: async () => { renderCalls += 1; return { accepted: true, op: 'render-plan', commandId: 'cmd-test-1' }; },
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
	assert.equal(result.status, 'verified');
	assert.equal(openCalls, 1);
	assert.ok(stateCalls >= 2);
	assert.equal(renderCalls, 1);
});

test('the semantic renderer retries a missing acknowledgement idempotently', async () => {
	let stateCalls = 0;
	let renderCalls = 0;
	const commands = [];
	const definitions = new Map();
	const stateTool = {
		execute: async () => {
			stateCalls += 1;
			return { live: true, available: true, snapshot: renderCalls > 1 ? { ...snapshot, commandResults: [{ commandId: 'cmd-retry-1', op: 'render-plan', ok: true }] } : snapshot };
		},
	};
	const lowLevelTool = {
		execute: async (command) => {
			renderCalls += 1;
			commands.push(command);
			return { accepted: true, op: 'render-plan', commandId: command.commandId || 'cmd-retry-1' };
		},
	};
	definitions.set('whiteboard_state', stateTool);
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
	const result = await definitions.get('pts_whiteboard_render').execute(request(), { agent: { id: 'retry-session' } });
	assert.equal(result.status, 'verified');
	assert.equal(renderCalls, 2);
	assert.equal(commands[1].commandId, 'cmd-retry-1');
	assert.ok(stateCalls > 2);
});

test('the semantic renderer retries one transient client failure with the same command id', async () => {
	let stateCalls = 0;
	let renderCalls = 0;
	const commands = [];
	const definitions = new Map();
	const stateTool = {
		execute: async () => {
			stateCalls += 1;
			return { live: true, available: true, snapshot: renderCalls > 1
				? { ...snapshot, commandResults: [{ commandId: 'cmd-failure-retry', op: 'render-plan', ok: true }] }
				: { ...snapshot, commandResults: renderCalls === 1 ? [{ commandId: 'cmd-failure-retry', op: 'render-plan', ok: false, error: 'temporärer Clientfehler' }] : snapshot.commandResults } };
		},
	};
	const lowLevelTool = {
		execute: async (command) => {
			renderCalls += 1;
			commands.push({ ...command });
			return { accepted: true, op: 'render-plan', commandId: command.commandId || 'cmd-failure-retry' };
		},
	};
	definitions.set('whiteboard_state', stateTool);
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
	const result = await definitions.get('pts_whiteboard_render').execute(request(), { agent: { id: 'failure-retry-session' } });
	assert.equal(result.status, 'verified');
	assert.equal(renderCalls, 2);
	assert.equal(commands[1].commandId, 'cmd-failure-retry');
	assert.ok(stateCalls >= 2);
});

test('the renderer capability gives the Companion an explicit execution contract', () => {
	assert.match(RENDER_PLAN_GUIDANCE, /pts_whiteboard_render/);
	assert.match(RENDER_PLAN_GUIDANCE, /role="open_question"/);
	assert.match(RENDER_PLAN_GUIDANCE, /role="method_idea"/);
	assert.match(RENDER_PLAN_GUIDANCE, /role="free_text"/);
	assert.match(RENDER_PLAN_GUIDANCE, /elements\[\]\.text/);
	assert.match(RENDER_PLAN_GUIDANCE, /operation="create"/);
	assert.match(RENDER_PLAN_GUIDANCE, /status="verified"/);
	assert.match(RENDER_PLAN_GUIDANCE, /whiteboard_state/);
	assert.match(RENDER_PLAN_GUIDANCE, /pending.*failed/);
});
