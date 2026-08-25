// pts-activity-stream — host half (node half).
//
// Pure UI plugin: the entire surface lives in lib/client.js (browser bundle,
// served through the DSH client-modules roster via this package's
// `dsh.client` marker and the `./client` export).
//
// The host half exists only so the loader row exists — exactly like the
// shipped pure-UI packages. It registers no routes, owns no services and
// holds no state: the activity stream is a pure PROJECTION of the
// conversation snapshot that the browser already receives, never a second
// source of truth about what the agent is doing.

/** No services required. */
export const inject = [];

/** Plugin body — intentionally empty (pure UI package convention). */
export function apply(ctx) {
	console.log('[pts-activity-stream] host half active (pure UI; surface registers client-side)');
}
