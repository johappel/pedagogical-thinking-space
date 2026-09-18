// §14 — the Produktwerkstatt reads LearningMoments EXCLUSIVELY through the
// canonical domain façade (learning-moments.json). It proves the removed
// sources are irrelevant: a learning-landscape.md, a learning-design.md heading,
// and an orphaned binding ledger must NOT contribute a single snapshot moment;
// an empty domain yields zero moments, never a demo fallback.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { buildSnapshotForSession, createTeachingProductHandler, PREFIX } from '../dsh-plugins/pts-teaching-product-editor/lib/routes.mjs';
import { createLearningMoment } from '../plugins/pts-learning-moment-binding/lib/domain.mjs';

async function denkraum() {
	return mkdtemp(path.join(tmpdir(), 'pts-workshop-src-'));
}

// Drive the real route handler for one request and capture the JSON response.
async function callRoute(root, method, sub, body) {
	const handler = createTeachingProductHandler({ resolveRoot: () => root });
	const req = Object.assign(Readable.from([body ? JSON.stringify(body) : '']), { method, url: PREFIX + sub });
	let status = 0; let payload = null;
	const res = {
		writeHead(code) { status = code; return res; },
		end(raw) { payload = raw ? JSON.parse(raw) : null; },
	};
	await handler(req, res);
	return { status, payload };
}

test('the snapshot reads exactly the domain moments (5 in → 5 in the snapshot)', async () => {
	const root = await denkraum();
	try {
		for (let i = 1; i <= 5; i += 1) await createLearningMoment(root, { domainId: `lm-0${i}`, title: `Moment ${i}` });
		const snapshot = await buildSnapshotForSession(root);
		assert.equal(snapshot.learningMoments.length, 5);
		assert.deepEqual(snapshot.learningMoments.map((m) => m.domainId).sort(), ['lm-01', 'lm-02', 'lm-03', 'lm-04', 'lm-05']);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('learning-landscape.md is irrelevant — it never adds a moment', async () => {
	const root = await denkraum();
	try {
		await writeFile(path.join(root, 'learning-landscape.md'), '# Lernlandschaft\n\n## Lernmomente\n\n### lm-99\n\n- Titel: Alt\n\n## Übergänge\n\nKeine.\n', 'utf8');
		await createLearningMoment(root, { domainId: 'lm-01', title: 'Nur die Domäne zählt' });
		const snapshot = await buildSnapshotForSession(root);
		assert.deepEqual(snapshot.learningMoments.map((m) => m.domainId), ['lm-01']);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('a learning-design.md heading is not a structured source', async () => {
	const root = await denkraum();
	try {
		await writeFile(path.join(root, 'learning-design.md'), '# Learning Design\n\n## Lernmoment 99 – Aus Prosa\n\nText.\n', 'utf8');
		const snapshot = await buildSnapshotForSession(root);
		assert.equal(snapshot.learningMoments.length, 0, 'a markdown heading creates no domain object or snapshot entry');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('an orphaned binding ledger is not a moment source', async () => {
	const root = await denkraum();
	try {
		await writeFile(path.join(root, 'learning-moment-bindings.json'), JSON.stringify({ schema: 'ptspace.learning-moment-bindings/v1', moments: [{ domainId: 'lm-77', projections: [{ projectionId: 'p1', boundVersion: 1 }] }] }), 'utf8');
		const snapshot = await buildSnapshotForSession(root);
		assert.equal(snapshot.learningMoments.length, 0, 'a projection without a domain object never becomes a LearningMoment');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('an empty domain yields zero moments — /api/develop is honestly empty, never demo', async () => {
	const root = await denkraum();
	try {
		await mkdir(path.join(root, '.pts'), { recursive: true });
		const { status, payload } = await callRoute(root, 'POST', '/api/develop', { sessionId: 'x' });
		assert.equal(status, 200);
		assert.equal(payload.empty, true, 'no proposal is synthesised from an empty domain');
		assert.equal(payload.proposal, undefined);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('/api/develop builds a real multi-lesson proposal from the domain moments', async () => {
	const root = await denkraum();
	try {
		for (let i = 1; i <= 5; i += 1) await createLearningMoment(root, { domainId: `lm-0${i}`, title: `Moment ${i}` });
		const { status, payload } = await callRoute(root, 'POST', '/api/develop', { sessionId: 'x' });
		assert.equal(status, 200);
		assert.ok(payload.proposal, 'a proposal is synthesised');
		assert.ok(payload.proposal.lessons.length >= 2, 'a multi-lesson dramaturgy from 5 moments');
		// every proposed lesson references real domain moments, never a heading/shape id
		const refIds = payload.proposal.lessons
			.flatMap((l) => (l.sourceRefs || []).filter((r) => r.startsWith('learning-moment:')).map((r) => r.slice('learning-moment:'.length)));
		assert.ok(refIds.length > 0 && refIds.every((id) => /^lm-0[1-5]$/.test(id)), 'sourceRefs carry canonical domainIds');
	} finally { await rm(root, { recursive: true, force: true }); }
});
