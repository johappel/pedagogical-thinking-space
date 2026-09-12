// pts-demo-capability — proof of the PTS extension seam.
//
// This plugin is NOT part of PTS Core. It is installed as one insert row in the
// host composition (see dsh/profiles/pts/cordis.patch.yml) and contributes
// exactly one additive, globally visible tool. When the row is present, the
// Pedagogical Companion sees `demo_capability`; when it is removed, PTS Core
// loads and works unchanged. That is the property the later whiteboard adapter
// relies on: a capability adds tools without an edit to the preset.
//
// It imports no @deepseek-ai package, touches no service but ctx.tools, and
// registers itself as a disposer-bound effect so unmounting leaves nothing
// behind.

export const name = 'pts-demo-capability';

export const TOOL_NAME = 'demo_capability';

/** @param {import('cordis').Context} ctx - the host-plane context. */
export function apply(ctx) {
	ctx.effect(() => ctx.tools.register({
		name: TOOL_NAME,
		description: 'Demo capability of the PTS extension seam: confirms that an independently installed plugin can add a tool to the Pedagogical Companion without any change to PTS Core.',
		parameters: {
			type: 'object',
			properties: {
				echo: {
					type: 'string',
					description: 'Optional text echoed back in the confirmation.',
				},
			},
			additionalProperties: false,
		},
		output: {
			schema: { type: 'string' },
			render(_args, value) {
				return [{ type: 'text', text: String(value) }];
			},
		},
		async execute(args) {
			const echo = typeof args?.echo === 'string' ? args.echo.trim() : '';
			return echo === ''
				? 'demo capability active: an independently installed plugin added this tool to the PTS Companion.'
				: `demo capability active: ${echo}`;
		},
	}), 'pts-demo-capability: register demo_capability');
}
