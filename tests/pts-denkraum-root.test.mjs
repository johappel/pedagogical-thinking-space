// Work package B — Denkraum root resolution.
//
// resolveDenkraumRoot() unifies the two identity systems that were previously
// conflated behind the strict workspaceRoot() gate:
//
//   workspaceRoot()       the strict, scaffolded `<base>/workspace/<name>`
//                         layout with an AGENTS.md marker (repo Denkräume) —
//                         still enforced verbatim for the structural contract.
//   resolveDenkraumRoot() the LIVE Denkraum: prefers the strict layout, else
//                         accepts the session cwd itself when it carries a
//                         canonical PTS artefact, else fails closed.
//
// This is pure path resolution: no product/ledger/landscape semantics change.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveDenkraumRoot, workspaceRoot, readProduct, emptyProduct } from '../dsh-presets/pts-companion/teaching-product.mjs';

const LANDSCAPE = `---\nschema: ptspace.learning-landscape/v1\ntitle: Root Test\nstructure: hybrid\n---\n\n# Lernlandschaft\n\n## Lernmomente\n\nNoch keine.\n\n## Übergänge\n\nKeine.\n`;

// The strict scaffolded layout: <base>/AGENTS.md + <base>/workspace/<name>.
async function scaffolded() {
	const base = await mkdtemp(path.join(tmpdir(), 'pts-scaffold-'));
	await writeFile(path.join(base, 'AGENTS.md'), '# marker\n', 'utf8');
	const cwd = path.join(base, 'workspace', 'Demo');
	await mkdir(cwd, { recursive: true });
	await writeFile(path.join(cwd, 'learning-landscape.md'), LANDSCAPE, 'utf8');
	return { base, cwd };
}

// A raw live Denkraum: a bare folder that only carries a canonical PTS artefact.
async function rawDenkraum(marker = 'learning-landscape.md') {
	const cwd = await mkdtemp(path.join(tmpdir(), 'pts-raw-'));
	await writeFile(path.join(cwd, marker), marker === 'learning-landscape.md' ? LANDSCAPE : '# Learning Design\n', 'utf8');
	return cwd;
}

test('the strict scaffolded workspace layout still resolves (workspaceRoot contract intact)', async () => {
	const { base, cwd } = await scaffolded();
	try {
		const strict = await workspaceRoot(cwd);
		const denkraum = await resolveDenkraumRoot(cwd);
		assert.equal(denkraum, strict, 'resolveDenkraumRoot returns the strict root when the layout is valid');
	} finally { await rm(base, { recursive: true, force: true }); }
});

test('a raw live Denkraum cwd resolves via its canonical PTS marker', async () => {
	const cwd = await rawDenkraum('learning-landscape.md');
	try {
		const resolved = await resolveDenkraumRoot(cwd);
		assert.ok(resolved, 'a raw Denkraum with learning-landscape.md resolves');
		// The strict gate must reject the same folder (no workspace/ parent).
		await assert.rejects(workspaceRoot(cwd), /current PTS Denkraum required/);
	} finally { await rm(cwd, { recursive: true, force: true }); }
});

test('learning-design.md alone is also a valid Denkraum marker', async () => {
	const cwd = await rawDenkraum('learning-design.md');
	try {
		assert.ok(await resolveDenkraumRoot(cwd), 'learning-design.md is accepted as a Denkraum marker');
	} finally { await rm(cwd, { recursive: true, force: true }); }
});

test('an arbitrary foreign folder fails closed', async () => {
	const cwd = await mkdtemp(path.join(tmpdir(), 'pts-foreign-'));
	try {
		await writeFile(path.join(cwd, 'readme.txt'), 'not a Denkraum\n', 'utf8');
		assert.equal(await resolveDenkraumRoot(cwd), null, 'no PTS marker → null (never resolve an arbitrary folder)');
	} finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a missing or relative cwd fails closed', async () => {
	assert.equal(await resolveDenkraumRoot(undefined), null);
	assert.equal(await resolveDenkraumRoot(''), null);
	assert.equal(await resolveDenkraumRoot('relative/path'), null);
	assert.equal(await resolveDenkraumRoot(path.join(tmpdir(), 'does-not-exist-' + Math.random().toString(36).slice(2))), null);
});

test('readProduct reads a product from a raw live Denkraum (tolerant resolution)', async () => {
	const cwd = await rawDenkraum('learning-landscape.md');
	try {
		assert.equal(await readProduct(cwd), null, 'no product file → null, not a throw');
		await writeFile(path.join(cwd, 'teaching-product.json'), JSON.stringify(emptyProduct('Root Test')), 'utf8');
		const product = await readProduct(cwd);
		assert.ok(product, 'the product is read from the raw Denkraum root');
		assert.equal(product.series.title, 'Root Test');
	} finally { await rm(cwd, { recursive: true, force: true }); }
});

test('readProduct fails closed on a folder that is not a Denkraum', async () => {
	const cwd = await mkdtemp(path.join(tmpdir(), 'pts-foreign-'));
	try {
		await writeFile(path.join(cwd, 'teaching-product.json'), JSON.stringify(emptyProduct('X')), 'utf8');
		await assert.rejects(readProduct(cwd), /current PTS Denkraum required/, 'a product file alone does not make a Denkraum');
	} finally { await rm(cwd, { recursive: true, force: true }); }
});
