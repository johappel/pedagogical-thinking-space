// Shared request handler for the Teaching Product editor. Extracted so BOTH the
// DSH host plugin (index.js) and the Playwright browser harness exercise the
// exact same route logic against the same tested store/adapter — the browser
// E2E proves the real server path, not a stand-in.
//
// `resolveRoot(sessionId)` is injected because the Denkraum root comes from the
// DSH session in production and from a fixed temp dir in the harness.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProduct, saveProduct, saveBlockEdit, StoreError } from '../../../plugins/pts-teaching-product/lib/store.mjs';
import { editorStateToDomainMutation, domainBlockToEditorState } from '../../../plugins/pts-teaching-product/lib/quill-adapter.mjs';
import { buildDemoProduct, buildDemoSnapshot } from '../../../plugins/pts-teaching-product/lib/demo.mjs';
import { createProductSnapshot } from '../../../plugins/pts-teaching-product/lib/snapshot.mjs';
import {
	createProposalFromSnapshot,
	acceptProposal,
	renameProposalLesson,
	setProposalLessonIntention,
	removeProposalLesson,
	addProposalLesson,
	reorderProposalLessons,
} from '../../../plugins/pts-teaching-product/lib/proposal.mjs';
import {
	loadProposal,
	saveProposal,
	deleteProposal,
	loadSnapshot,
	saveSnapshot,
} from '../../../plugins/pts-teaching-product/lib/proposal-store.mjs';

export const PREFIX = '/pts-teaching-product';

const DENKSTAND_FILE = '.pts/denkstand-state.json';
const LEDGER_FILE = 'learning-moment-bindings.json';

// Build the Product Snapshot for a Denkraum from its real current state — the
// confirmed Denkstand and the LearningMoment ledger. Selection is deliberately
// fail-closed by construction: only teacher_confirmed decisions and teacher_open
// questions are named, so the snapshot's own guard can never be tripped. When a
// Denkraum has no structured Denkstand yet (fresh workspace, harness), the demo
// snapshot stands in so the flow stays runnable.
async function buildSnapshotForSession(root) {
	let state;
	let ledger;
	try {
		state = JSON.parse(await fs.readFile(path.join(root, DENKSTAND_FILE), 'utf8'));
	} catch { state = null; }
	try {
		ledger = JSON.parse(await fs.readFile(path.join(root, LEDGER_FILE), 'utf8'));
	} catch { ledger = null; }

	const entries = Array.isArray(state?.entries) ? state.entries : [];
	const moments = Array.isArray(ledger?.moments) ? ledger.moments : [];
	if (entries.length === 0 && moments.length === 0) return buildDemoSnapshot();

	const confirmed = entries.filter((e) => e && e.status === 'teacher_confirmed');
	const decisionIds = confirmed.filter((e) => e.kind !== 'moment').map((e) => e.id);
	const openQuestionIds = entries.filter((e) => e && e.status === 'teacher_open').map((e) => e.id);
	const learningMomentIds = moments.map((m) => m.domainId).filter(Boolean);

	return createProductSnapshot({
		denkstandEntries: entries,
		momentLedger: { schema: 'ptspace.learning-moment-bindings/v1', moments },
		sourceRevision: state?.revision ?? null,
		selection: { learningMomentIds, decisionIds, openQuestionIds },
	});
}

function applyProposalEdit(proposal, args) {
	switch (args.op) {
		case 'rename': return renameProposalLesson(proposal, { proposedLessonId: args.proposedLessonId, title: args.title });
		case 'intention': return setProposalLessonIntention(proposal, { proposedLessonId: args.proposedLessonId, intention: args.intention });
		case 'remove': return removeProposalLesson(proposal, { proposedLessonId: args.proposedLessonId });
		case 'add': return addProposalLesson(proposal, { title: args.title ?? 'Neue Stunde', intention: args.intention ?? '' });
		case 'reorder': return reorderProposalLessons(proposal, { order: args.order });
		default: throw new StoreError('unknown-op', `Unbekannte Proposal-Operation: ${args.op}`);
	}
}

const VENDOR = {
	'/vendor/quill.js': { file: '../vendor/quill.js', type: 'text/javascript; charset=utf-8' },
	'/vendor/quill.snow.css': { file: '../vendor/quill.snow.css', type: 'text/css; charset=utf-8' },
	'/vendor/yjs-quill.bundle.js': { file: '../vendor/yjs-quill.bundle.js', type: 'text/javascript; charset=utf-8' },
	'/collab-client.js': { file: './collab-client.js', type: 'text/javascript; charset=utf-8' },
};

export function createTeachingProductHandler({ resolveRoot, collab } = {}) {
	return async function handler(req, res) {
		try {
			const url = new URL(req.url, 'http://localhost');
			const sub = url.pathname.replace(new RegExp('^' + PREFIX), '') || '/';

			if (req.method === 'GET' && VENDOR[sub]) {
				const { file, type } = VENDOR[sub];
				const data = await fs.readFile(fileURLToPath(new URL(file, import.meta.url)));
				res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
				res.end(data);
				return;
			}

			if (collab && req.method === 'GET' && sub === '/collab-page') {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(collabPage(url.searchParams));
				return;
			}

			if (collab && req.method === 'GET' && sub === '/api/collab-stats') {
				const target = targetFromParams(url.searchParams);
				return json(res, 200, collab.hub.stats(target) || {});
			}

			if (collab && req.method === 'POST' && sub === '/api/worker-edit') {
				const args = await readBody(req);
				const target = { sessionId: args.sessionId, lessonId: args.lessonId, phaseId: args.phaseId, blockId: args.blockId };
				await collab.workerReplace(target, { find: args.find, replace: args.replace });
				return json(res, 200, { ok: true });
			}

			if (req.method === 'GET' && sub === '/api/product') {
				const root = resolveRoot(url.searchParams.get('sessionId'));
				return json(res, 200, { product: await loadProduct(root) });
			}

			// Phase 3 — the three teacher-facing states of the product area.
			if (req.method === 'GET' && sub === '/api/state') {
				const root = resolveRoot(url.searchParams.get('sessionId'));
				const product = await loadProduct(root);
				const proposal = product ? null : await loadProposal(root);
				return json(res, 200, { hasProduct: !!product, hasProposal: !!proposal, product, proposal });
			}

			// Zustand A → B: deliberately develop a first draft. Builds/refreshes
			// the Product Snapshot (the boundary), then synthesises a proposal.
			// Never auto-runs — the teacher triggers this.
			if (req.method === 'POST' && sub === '/api/develop') {
				const args = await readBody(req);
				const root = resolveRoot(args.sessionId);
				const existing = await loadProduct(root);
				if (existing) return json(res, 200, { hasProduct: true, product: existing });
				let proposal = await loadProposal(root);
				if (!proposal) {
					const snapshot = await buildSnapshotForSession(root);
					await saveSnapshot(root, snapshot);
					proposal = createProposalFromSnapshot(snapshot, { title: args.title ?? '' });
					await saveProposal(root, proposal);
				}
				return json(res, 200, { proposal });
			}

			if (req.method === 'POST' && sub === '/api/proposal/edit') {
				const args = await readBody(req);
				const root = resolveRoot(args.sessionId);
				const proposal = await loadProposal(root);
				if (!proposal) return json(res, 404, { error: 'no-proposal' });
				const next = applyProposalEdit(proposal, args);
				await saveProposal(root, next);
				return json(res, 200, { proposal: next });
			}

			// Accept: the teacher turns the proposal into a Teaching Product through
			// the existing domain. Idempotent — a second accept returns the product.
			if (req.method === 'POST' && sub === '/api/proposal/accept') {
				const args = await readBody(req);
				const root = resolveRoot(args.sessionId);
				const existing = await loadProduct(root);
				if (existing) { await deleteProposal(root); return json(res, 200, { product: existing }); }
				const proposal = await loadProposal(root);
				if (!proposal) return json(res, 404, { error: 'no-proposal' });
				const snapshot = await loadSnapshot(root);
				if (!snapshot) return json(res, 409, { error: 'no-snapshot', message: 'Der Product Snapshot fehlt — bitte den Entwurf neu entwickeln.' });
				const product = acceptProposal(proposal, snapshot);
				await saveProduct(root, product);
				await deleteProposal(root); // the proposal is consumed; the product is now authoritative
				return json(res, 200, { product });
			}

			// "Noch nicht": drop the proposal, stay in the workshop. No product.
			if (req.method === 'POST' && sub === '/api/proposal/reject') {
				const args = await readBody(req);
				const root = resolveRoot(args.sessionId);
				await deleteProposal(root);
				return json(res, 200, { ok: true });
			}

			if (req.method === 'POST' && sub === '/api/editor-state') {
				const args = await readBody(req);
				const product = await loadProduct(resolveRoot(args.sessionId));
				if (!product) return json(res, 404, { error: 'not-found' });
				const state = domainBlockToEditorState(product, { lessonId: args.lessonId, phaseId: args.phaseId, blockId: args.blockId });
				return json(res, 200, { editorDelta: state.editorDelta, type: state.type });
			}

			if (req.method === 'POST' && sub === '/api/seed') {
				const args = await readBody(req);
				const root = resolveRoot(args.sessionId);
				const existing = await loadProduct(root);
				if (existing) return json(res, 200, { product: existing });
				return json(res, 200, { product: await saveProduct(root, buildDemoProduct()) });
			}

			if (req.method === 'POST' && sub === '/api/save') {
				const args = await readBody(req);
				const mutation = editorStateToDomainMutation(args, args.editorDelta);
				const committed = await saveBlockEdit(resolveRoot(args.sessionId), {
					...mutation, actor: 'teacher', expectedRevision: args.expectedRevision,
				});
				return json(res, 200, ok(committed));
			}

			if (req.method === 'POST' && sub === '/api/companion-edit') {
				const args = await readBody(req);
				// A targeted companion edit is authoritative: no expectedRevision guard.
				const content = args.editorDelta ? editorStateToDomainMutation(args, args.editorDelta).content : args.content;
				const committed = await saveBlockEdit(resolveRoot(args.sessionId), {
					lessonId: args.lessonId, phaseId: args.phaseId, blockId: args.blockId, content, actor: 'companion',
				});
				return json(res, 200, ok(committed));
			}

			json(res, 404, { error: 'unknown-route', path: sub });
		} catch (err) {
			if (err instanceof StoreError && err.code === 'conflict') {
				return json(res, 409, { error: 'conflict', message: err.message, detail: err.detail });
			}
			console.error('[pts-teaching-product-editor]', err);
			json(res, 500, { error: 'internal', message: String((err && err.message) || err) });
		}
	};
}

function ok(committed) {
	return { revision: committed.revision.revision, actor: committed.revision.actor, delta: committed.delta, product: committed.product };
}

function targetFromParams(p) {
	return { sessionId: p.get('session'), lessonId: p.get('lesson'), phaseId: p.get('phase'), blockId: p.get('block') };
}

function collabPage(p) {
	const cfg = JSON.stringify({
		sessionId: p.get('session'), lessonId: p.get('lesson'), phaseId: p.get('phase'), blockId: p.get('block'),
		role: p.get('role') === 'companion' ? 'companion' : 'teacher', wsPath: PREFIX + '/collab', base: PREFIX,
	});
	return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Collab</title>
<link rel="stylesheet" href="${PREFIX}/vendor/quill.snow.css">
<style>body{font:14px system-ui;margin:0;padding:12px}#editor{min-height:160px;border:1px solid #ccc}#bar{display:flex;gap:10px;margin:8px 0}#log{font:12px ui-monospace,monospace;opacity:.8}#notice{color:#e06c75;font-weight:600;margin:6px 0;min-height:1em}</style></head>
<body>
<div><b>Rolle:</b> <span id="role">${p.get('role') === 'companion' ? 'companion' : 'teacher'}</span></div>
<div id="notice"></div>
<div id="editor"></div>
<div id="bar"><button id="settle">Commit (settle)</button></div>
<div id="log">noch kein Commit</div>
<script>window.__COLLAB__=${cfg};</script>
<script src="${PREFIX}/vendor/quill.js"></script>
<script src="${PREFIX}/vendor/yjs-quill.bundle.js"></script>
<script src="${PREFIX}/collab-client.js"></script>
</body></html>`;
}

function json(res, status, payload) {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(payload));
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let raw = '';
		req.on('data', (chunk) => { raw += chunk; if (raw.length > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); } });
		req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (err) { reject(err); } });
		req.on('error', reject);
	});
}
