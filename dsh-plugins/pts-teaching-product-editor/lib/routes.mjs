// Shared request handler for the Teaching Product editor. Extracted so BOTH the
// DSH host plugin (index.js) and the Playwright browser harness exercise the
// exact same route logic against the same tested store/adapter — the browser
// E2E proves the real server path, not a stand-in.
//
// `resolveRoot(sessionId)` is injected because the Denkraum root comes from the
// DSH session in production and from a fixed temp dir in the harness.

import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadProduct, saveProduct, saveBlockEdit, StoreError } from '../../../plugins/pts-teaching-product/lib/store.mjs';
import { editorStateToDomainMutation, domainBlockToEditorState } from '../../../plugins/pts-teaching-product/lib/quill-adapter.mjs';
import { buildDemoProduct } from '../../../plugins/pts-teaching-product/lib/demo.mjs';

export const PREFIX = '/pts-teaching-product';

const VENDOR = {
	'/vendor/quill.js': { file: '../vendor/quill.js', type: 'text/javascript; charset=utf-8' },
	'/vendor/quill.snow.css': { file: '../vendor/quill.snow.css', type: 'text/css; charset=utf-8' },
};

export function createTeachingProductHandler({ resolveRoot }) {
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

			if (req.method === 'GET' && sub === '/api/product') {
				const root = resolveRoot(url.searchParams.get('sessionId'));
				return json(res, 200, { product: await loadProduct(root) });
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
