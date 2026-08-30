// pts-workspaces — Host half.
//
// Registers one webServer prefix route with three endpoints over the PTS repo:
//
//   GET  /api/pts-workspaces/config        -> { ok, root, workspaceDir }
//   POST /api/pts-workspaces/create        -> { ok, name, slug, path }
//        body: { name: string }
//   POST /api/pts-workspaces/delete        -> { ok, trashedTo }
//        body: { path: string }            (move <workspace>/<slug> into .trash)
//
// The route is the ONLY place that touches the filesystem. For creation the
// client never sends a path — only a Denkraum name. The host derives the slug,
// enforces the hard path boundary <ptsRoot>/workspace/<slug>/, refuses to
// overwrite an existing directory (409), and scaffolds the minimal valid PTS
// structure verified against the kernel (see docs/experiments/
// DSH_NATIVE_WORKSPACE.md and workspace/dsh-native-smoke):
//
//   learning-design.md / learning-landscape.md / temporal-plan.yml /
//   planning-board.yml / decisions.yml + materials/ + drafts/
//
// Deletion NEVER hard-deletes teacher content: the endpoint only MOVES a
// direct child of <PTS>/workspace/ into <PTS>/workspace/.trash/<slug>--<stamp>
// (same-volume rename, recoverable). Unregistering from the DSH workspace
// registry is deliberately done by the client through the official wire API
// (workspaces.delete), so registry frames and session accounting stay on
// DSH's own code paths. No AGENTS.md is copied into a Denkraum — boot happens
// through the repository root AGENTS.md instruction chain.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const inject = ['webServer'];

const MAX_NAME_LENGTH = 120;
const MAX_SLUG_LENGTH = 60;
const MAX_BODY_BYTES = 16 * 1024;

/** Windows reserved device names must not become directory names. */
const RESERVED_SLUGS = new Set([
	'con', 'prn', 'aux', 'nul',
	'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
	'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

function todayIso() {
	const d = new Date();
	const pad = (v) => String(v).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "Wozu braucht es Religion?" -> "wozu-braucht-es-religion".
 * Umlaut transliteration first, then everything outside [a-z0-9] folds to '-'.
 */
export function slugifyDenkraumName(rawName) {
	const umlauts = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
	let s = String(rawName ?? '');
	s = s.replace(/[äöüßÄÖÜ]/g, (ch) => umlauts[ch.toLowerCase()] ?? umlauts[ch] ?? ch);
	s = s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
	s = s.replace(/[^a-z0-9]+/g, '-');
	s = s.replace(/^-+/, '').replace(/-+$/, '');
	if (s.length > MAX_SLUG_LENGTH) s = s.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
	return s;
}

/** Minimal valid learning-design.md skeleton (kernel sections, all open). */
function learningDesignTemplate(name, slug, date) {
return `# Learning Design: ${name}

## Metadata

- Project slug: ${slug}
- Created: ${date}
- Last updated: ${date}
- Subject: Noch nicht festgelegt
- Grade / age group: Noch nicht festgelegt
- Language: de

## Current Status

Status: in-reflection

Current focus: Der Denkraum ist neu angelegt. Anlass, Kontext und pädagogische Intention sind noch nicht beschrieben.

Next useful step: Mit der Lehrkraft klären, welcher pädagogische Anlass diesen Denkraum öffnet.

## Short Summary

Noch nicht beschrieben.

## Context

- Noch nicht beschrieben.

## Learners

Noch nicht beschrieben.

## Educational Intention

Noch nicht entschieden.

## Learning Journey

Noch nicht festgelegt.

## Key Learning Moments

Noch nicht festgelegt.

## Design Decisions

Noch keine pädagogische Entscheidung festgehalten. Vorläufige Denkstände und
Lernmomente werden als Entwurf gekennzeichnet; erkennbare Entscheidungen der
Lehrkraft werden in decisions.yml dokumentiert.

## Open Questions

- Was ist der pädagogische Anlass für diesen Denkraum?

## Activities

Noch keine Aktivität festgelegt.

## Materials and Sources

Noch keine Materialien oder Quellen ausgewählt.

## Differentiation and Inclusion

Noch nicht bearbeitet.

## Assessment and Evidence of Learning

Noch nicht festgelegt.

## Reflection

Der Denkstand ist bewusst offen. Es beginnt keine Materialproduktion, bevor Intention und Rahmen geklärt sind.

## Worker Tasks

Keine freigegebene Worker-Aufgabe.

## Rendering Targets

Keine freigegebene Darstellung.

## Change Log

### ${date}

Changed: Denkraum mit minimaler gültiger Struktur angelegt.

Reason: Neue pädagogische Planung begonnen.

By: pts-workspaces (automatische Mindeststruktur)
`;
}

/** Minimal learning-landscape.md: schema-valid frontmatter, no moments yet. */
function learningLandscapeTemplate(name) {
return `---
schema: ptspace.learning-landscape/v1
title: ${name}
structure: linear
---

# Lernlandschaft

## Lernmomente

Noch keine Lernmomente festgehalten. Lernmomente entstehen im Gespräch. Ein
vollständig beschreibbarer vorläufiger Lernmoment wird als draft, ein von der
Lehrkraft erkennbar übernommener Lernmoment als stable gekennzeichnet.

## Übergänge

Keine Übergänge festgelegt.
`;
}

/** Minimal temporal-plan.yml per specs/TEMPORAL_PLAN_SCHEMA.md. */
function temporalPlanTemplate(name) {
return `schema: ptspace.temporal-plan/v1
title: ${name}
landscape: learning-landscape.md
windows: []
placements: []
`;
}

/** Minimal planning-board.yml per specs/PLANNING_BOARD_SCHEMA.md. */
const PLANNING_BOARD_TEMPLATE = `schema: ptspace.planning-board/v1
items: []
`;

/** Minimal decisions.yml: no teacher-owned decision recorded yet. */
const DECISIONS_TEMPLATE = `# Noch keine pädagogische Entscheidung festgehalten.
decisions: []
`;

export function apply(ctx) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined) {
		console.error('[pts-workspaces] webServer service missing - plugin inactive');
		return;
	}

	let cachedRoot = null;

	async function looksLikePtsRoot(dir) {
		for (const marker of ['AGENTS.md', 'workspace']) {
			try {
				await fsp.access(path.join(dir, marker));
			} catch {
				return false;
			}
		}
		return true;
	}

	/**
	 * Resolve the PTS repository root, validated by markers (AGENTS.md +
	 * workspace/). Order: $PTS_ROOT env -> ancestors of this module file
	 * (the profile mounts the package via a junction into the repo, and Node
	 * resolves module paths realpath'd into the repo) -> process cwd.
	 * Fails loud (null) when nothing validates; the route answers 503 then.
	 */
	async function ptsRoot() {
		if (cachedRoot !== null) return cachedRoot;
		const candidates = [];
		if (typeof process.env.PTS_ROOT === 'string' && process.env.PTS_ROOT.trim() !== '') {
			candidates.push(process.env.PTS_ROOT.trim());
		}
		try {
			let dir = path.dirname(fileURLToPath(import.meta.url));
			for (let i = 0; i < 8; i += 1) {
				candidates.push(dir);
				const parent = path.dirname(dir);
				if (parent === dir) break;
				dir = parent;
			}
		} catch {
			// import.meta.url unavailable in this runtime; env/cwd remain
		}
		if (typeof process.cwd() === 'string') candidates.push(process.cwd());
		for (const candidate of candidates) {
			if (await looksLikePtsRoot(candidate)) {
				cachedRoot = path.resolve(candidate);
				return cachedRoot;
			}
		}
		return null;
	}

	function sendJson(res, status, value) {
		res.statusCode = status;
		res.setHeader('content-type', 'application/json; charset=utf-8');
		res.setHeader('cache-control', 'no-store');
		res.end(JSON.stringify(value));
	}

	function readBody(req) {
		return new Promise((resolve, reject) => {
			const chunks = [];
			let size = 0;
			req.on('data', (chunk) => {
				size += chunk.length;
				if (size > MAX_BODY_BYTES) {
					reject(new Error('body too large'));
					req.destroy();
					return;
				}
				chunks.push(chunk);
			});
			req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			req.on('error', reject);
		});
	}

	async function scaffold(root, name, slug) {
		const wsDir = path.join(root, 'workspace');
		await fsp.mkdir(wsDir, { recursive: true });
		const wsDirReal = await fsp.realpath(wsDir);
		const target = path.join(wsDirReal, slug);

		// Hard boundary double-check: slug is already [a-z0-9-]+ so traversal is
		// impossible by construction; verify containment against the canonical
		// parent anyway before writing anything.
		if (path.dirname(target) !== wsDirReal || path.basename(target) !== slug) {
			return { reason: 'outside' };
		}
		try {
			await fsp.access(target);
			return { reason: 'exists', target };
		} catch {
			// expected for a new Denkraum
		}

		const date = todayIso();
		await fsp.mkdir(target, { recursive: true });
		await fsp.writeFile(path.join(target, 'learning-design.md'), learningDesignTemplate(name, slug, date), 'utf8');
		await fsp.writeFile(path.join(target, 'learning-landscape.md'), learningLandscapeTemplate(name), 'utf8');
		await fsp.writeFile(path.join(target, 'temporal-plan.yml'), temporalPlanTemplate(name), 'utf8');
		await fsp.writeFile(path.join(target, 'planning-board.yml'), PLANNING_BOARD_TEMPLATE, 'utf8');
		await fsp.writeFile(path.join(target, 'decisions.yml'), DECISIONS_TEMPLATE, 'utf8');
		await fsp.mkdir(path.join(target, 'materials'), { recursive: true });
		await fsp.mkdir(path.join(target, 'drafts'), { recursive: true });

		// Canonical identity for the client's workspace adoption call.
		const real = await fsp.realpath(target);
		return { ok: true, target: real };
	}

	/**
	 * Move one direct child of <PTS>/workspace/ into the recoverable trash
	 * (<PTS>/workspace/.trash/<basename>--<stamp>). Never hard-deletes: a
	 * failed move (e.g. Windows EBUSY while a session holds the cwd) leaves
	 * the folder untouched and is reported to the caller.
	 */
	async function moveToTrash(root, rawPath) {
		const wsDirReal = await fsp.realpath(path.join(root, 'workspace'));
		let real;
		try {
			real = await fsp.realpath(rawPath);
		} catch {
			return { reason: 'not-found' };
		}
		if (path.dirname(real) !== wsDirReal || path.basename(real).startsWith('.')) {
			return { reason: 'outside' };
		}
		const base = path.basename(real);
		const trashDir = path.join(wsDirReal, '.trash');
		await fsp.mkdir(trashDir, { recursive: true });
		const stamp = (() => {
			const d = new Date();
			const pad = (v) => String(v).padStart(2, '0');
			return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		})();
		let dest = path.join(trashDir, `${base}--${stamp}`);
		for (let n = 2; ; n += 1) {
			try {
				await fsp.access(dest);
				dest = path.join(trashDir, `${base}--${stamp}-${n}`);
			} catch {
				break;
			}
		}
		try {
			await fsp.rename(real, dest);
		} catch (error) {
			return { reason: 'locked', detail: String((error && error.code) || error) };
		}
		return { ok: true, trashedTo: dest };
	}

	ctx.effect(() => webServer.register({
		kind: 'prefix',
		path: '/api/pts-workspaces',
		handler: async (req, res) => {
			try {
				const rawUrl = typeof req.url === 'string' ? req.url : '/';
				const qIndex = rawUrl.indexOf('?');
				const sub = (qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl).replace(/\/+$/, '') || '/';

				if (req.method === 'GET' && sub === '/api/pts-workspaces/config') {
					const root = await ptsRoot();
					if (root === null) {
						sendJson(res, 503, { ok: false, error: 'no-root', message: 'PTS-Repository-Root wurde nicht gefunden (PTS_ROOT setzen oder Plugin aus dem Repo mounten).' });
						return;
					}
					sendJson(res, 200, { ok: true, root, workspaceDir: path.join(root, 'workspace') });
					return;
				}

				if (req.method === 'POST' && sub === '/api/pts-workspaces/create') {
					const root = await ptsRoot();
					if (root === null) {
						sendJson(res, 503, { ok: false, error: 'no-root', message: 'PTS-Repository-Root wurde nicht gefunden.' });
						return;
					}
					let payload = null;
					try {
						payload = JSON.parse(await readBody(req));
					} catch {
						sendJson(res, 400, { ok: false, error: 'bad-body', message: 'Ungültige Anfrage.' });
						return;
					}
					const name = typeof payload?.name === 'string' ? payload.name.trim().replace(/[\u0000-\u001f\u007f]/g, '') : '';
					if (name === '' || name.length > MAX_NAME_LENGTH) {
						sendJson(res, 400, { ok: false, error: 'bad-name', message: 'Bitte einen Namen mit 1 bis 120 Zeichen für den Denkraum angeben.' });
						return;
					}
					const slug = slugifyDenkraumName(name);
					if (slug === '' || RESERVED_SLUGS.has(slug)) {
						sendJson(res, 400, { ok: false, error: 'bad-slug', message: `Aus „${name}“ ergibt sich kein gültiger Projektordnername. Bitte einen anderen Namen wählen.` });
						return;
					}
					const result = await scaffold(root, name, slug);
					if (result.reason === 'exists') {
						sendJson(res, 409, { ok: false, error: 'exists', slug, message: `Für „${name}“ gibt es schon einen Arbeitsraum (${slug}). Bitte einen anderen Namen wählen oder den bestehenden Denkraum öffnen.` });
						return;
					}
					if (result.reason === 'outside') {
						sendJson(res, 400, { ok: false, error: 'outside', message: 'Der Name würde die Arbeitsraum-Grenze verlassen und wurde abgelehnt.' });
						return;
					}
					sendJson(res, 200, { ok: true, name, slug, path: result.target });
					return;
				}

				if (req.method === 'POST' && sub === '/api/pts-workspaces/delete') {
					const root = await ptsRoot();
					if (root === null) {
						sendJson(res, 503, { ok: false, error: 'no-root', message: 'PTS-Repository-Root wurde nicht gefunden.' });
						return;
					}
					let payload = null;
					try {
						payload = JSON.parse(await readBody(req));
					} catch {
						sendJson(res, 400, { ok: false, error: 'bad-body', message: 'Ungültige Anfrage.' });
						return;
					}
					const candidate = typeof payload?.path === 'string' ? payload.path.trim() : '';
					if (candidate === '') {
						sendJson(res, 400, { ok: false, error: 'bad-path', message: 'Es fehlt die Angabe, welcher Denkraum entfernt werden soll.' });
						return;
					}
					const result = await moveToTrash(root, candidate);
					if (result.reason === 'not-found') {
						sendJson(res, 404, { ok: false, error: 'not-found', message: 'Der Ordner existiert nicht mehr.' });
						return;
					}
					if (result.reason === 'outside') {
						sendJson(res, 400, { ok: false, error: 'outside', message: 'Nur direkte Denkräume unter workspace/ können entfernt werden.' });
						return;
					}
					if (result.reason === 'locked') {
						sendJson(res, 409, { ok: false, error: 'locked', detail: result.detail, message: `Der Ordner ist gerade gesperrt (${result.detail}). Bitte offene Sitzungen oder Programme zu diesem Denkraum schließen und es erneut versuchen.` });
						return;
					}
					console.log(`[pts-workspaces] Denkraum-Ordner in den Papierkorb verschoben: ${result.trashedTo}`);
					sendJson(res, 200, { ok: true, trashedTo: result.trashedTo });
					return;
				}

				sendJson(res, 404, { ok: false, error: 'not-found' });
			} catch (error) {
				console.error('[pts-workspaces] request failed:', error);
				sendJson(res, 500, { ok: false, error: 'internal', message: 'Interner Fehler beim Zugriff auf den Arbeitsraum-Speicher.' });
			}
		},
	}), 'pts-workspaces-route');

	console.log('[pts-workspaces] host half active; route /api/pts-workspaces/* registered');
}
