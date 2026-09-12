import { DESIGNER_CAPABILITIES, RenderPlanError, ROLE_PRESENTATION, designRenderPlan, validateRenderPlan } from './render-plan.mjs';

export const RENDERER_VERSION = 'phase1-spike-1';

export function rendererCapabilities(toolNames = []) {
	const names = new Set(toolNames);
	return {
		activePageOnly: !names.has('whiteboard_render_plan'),
		genericRenderPlan: names.has('whiteboard_render_plan'),
		pages: names.has('whiteboard_render_plan'),
		assets: names.has('whiteboard_render_plan'),
		documentReferences: names.has('whiteboard_render_plan'),
		roles: ROLE_PRESENTATION,
	};
}

export function compileRenderPlan(plan, capabilities) {
	const valid = validateRenderPlan(plan);
	if (!capabilities?.genericRenderPlan) {
		throw new RenderPlanError('capability-missing', 'dsh-whiteboard stellt noch keinen generischen Render-Plan-Seam bereit', {
			missing: ['page_create', 'page_switch', 'shape_copy_between_pages', 'shape_links', 'asset_image_shape'],
			fallback: 'Der bestehende Adapter und die neun Low-Level-Tools bleiben unverändert; es erfolgt keine Teilmutation.',
		});
	}
	return {
		op: 'render-plan',
		version: RENDERER_VERSION,
		plan: valid,
		roles: ROLE_PRESENTATION,
		capabilities: DESIGNER_CAPABILITIES,
	};
}

export async function designAndCompile(request, snapshot, capabilities) {
	const plan = designRenderPlan(request, snapshot, DESIGNER_CAPABILITIES);
	return { plan, command: compileRenderPlan(plan, capabilities) };
}
