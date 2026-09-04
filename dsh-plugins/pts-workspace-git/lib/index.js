// pts-workspace-git — local git safety net for PTS workspaces (host plane).
//
// The PTS root repository deliberately ignores workspace/ (concrete workspace
// content must not enter the maintained repo). This plugin gives the workspace
// its OWN local git repository instead: after every completed top-level dialog
// turn it commits all workspace changes (Denkstand + worker-produced artifacts)
// so a wrong edit — e.g. the Companion overwriting the wrong file — is always
// revertible with a plain `git -C workspace log` / `git revert` / `git checkout`.
//
// Design:
//  - Observes the same turn/end trigger as the Background Steward (completed,
//    top-level only) — it never blocks the conversation and never chats.
//  - Debounces per workspace and runs at most one commit at a time.
//  - Commits at the workspace repo ROOT (workspace/), covering every Denkraum.
//  - Skips commits when there is nothing to commit; all failures are logged
//    only (a broken safety net must never break a dialog).
//
// This module imports no @deepseek-ai packages; it is mounted through a
// Windows junction into the pts-web profile like the other PTS host plugins.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Async on purpose: this shares the Node event loop with the pts-web server.
// A synchronous git call here froze every HTTP request (page loads/refreshes
// included) for the duration of git status/add/commit.
const execFileP = promisify(execFile);

export const name = 'pts-workspace-git';
export const inject = ['sessions', 'agents'];

const DEBOUNCE_MS = 2500;
const GIT = 'git';
const pending = new Map();
const running = new Set();

async function runGit(repoRoot, args) {
	try {
		await execFileP(GIT, ['-C', repoRoot, ...args], { timeout: 15000, windowsHide: true });
		return true;
	} catch (error) {
		console.error(`[pts-workspace-git] git ${String(args[0])} fehlgeschlagen in ${repoRoot}:`, String((error && error.message) || error));
		return false;
	}
}

async function commitWorkspace(repoRoot) {
	if (running.has(repoRoot)) return; // one commit at a time; next debounce retries
	running.add(repoRoot);
	try {
		let status = '';
		try {
			const res = await execFileP(GIT, ['-C', repoRoot, 'status', '--porcelain'], { encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
			status = res.stdout;
		} catch (error) {
			console.error(`[pts-workspace-git] status fehlgeschlagen in ${repoRoot}:`, String((error && error.message) || error));
			return;
		}
		if (String(status).trim() === '') return; // nothing to commit
		if (!(await runGit(repoRoot, ['add', '-A']))) return;
		await runGit(repoRoot, ['commit', '-m', `pts: Workspace-Update ${new Date().toISOString()}`]);
	} finally {
		running.delete(repoRoot);
	}
}

/** Resolve the workspace repo root from a Denkraum cwd, or null. */
function repoRootFor(cwd) {
	if (typeof cwd !== 'string' || cwd === '') return null;
	const posix = cwd.replace(/\\/g, '/');
	const m = /^(.*\/workspace)\/[^/]+$/.exec(posix);
	return m === null ? null : m[1];
}

export function apply(ctx) {
	ctx.on('session/event', (session, event) => {
		try {
			if (!event || event.type !== 'turn/end') return;
			const reason = event.data && event.data.reason;
			if (!reason || reason.kind !== 'completed') return;
			const header = session && session.header;
			if (!header) return;
			if (header.parentSession) return; // top-level turns only
			const repoRoot = repoRootFor(header.cwd);
			if (repoRoot === null) return; // not a Denkraum dialog

			const existing = pending.get(repoRoot);
			if (existing !== undefined) clearTimeout(existing.timer);
			const timer = setTimeout(() => {
				pending.delete(repoRoot);
				void commitWorkspace(repoRoot);
			}, DEBOUNCE_MS);
			pending.set(repoRoot, { timer });
		} catch (error) {
			console.error('[pts-workspace-git] Observer-Fehler:', String((error && error.stack) || error));
		}
	}, { global: true });
	return undefined;
}
