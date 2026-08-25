import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { apply, slugifyDenkraumName } from './lib/index.js';

async function startRoute(root) {
	await mkdir(path.join(root, 'workspace'), { recursive: true });
	await writeFile(path.join(root, 'AGENTS.md'), '# test root\n', 'utf8');

	let route;
	const ctx = {
		get(name) {
			assert.equal(name, 'webServer');
			return { register(spec) { route = spec.handler; } };
		},
		effect(effect) { effect(); },
	};
	const previousRoot = process.env.PTS_ROOT;
	process.env.PTS_ROOT = root;
	apply(ctx);
	assert.equal(typeof route, 'function');
	return {
		route,
		restore() {
			if (previousRoot === undefined) delete process.env.PTS_ROOT;
			else process.env.PTS_ROOT = previousRoot;
		},
	};
}

async function post(route, url, payload) {
	const req = Readable.from([Buffer.from(JSON.stringify(payload), 'utf8')]);
	req.method = 'POST';
	req.url = url;
	const response = { statusCode: 200, headers: {}, body: '' };
	response.setHeader = (name, value) => { response.headers[name] = value; };
	response.end = (body = '') => { response.body = body; };
	await route(req, response);
	return { ...response, json: JSON.parse(response.body) };
}

test('slugifies German Denkraum names safely', () => {
	assert.equal(slugifyDenkraumName('Wozu braucht es Religion?'), 'wozu-braucht-es-religion');
	assert.equal(slugifyDenkraumName('Äußere Bedingungen'), 'aeussere-bedingungen');
});

test('creates a minimal valid workspace without technical approval language', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'pts-workspaces-'));
	const { route, restore } = await startRoute(root);
	try {
		const created = await post(route, '/api/pts-workspaces/create', { name: 'Dilemma verstehen' });
		assert.equal(created.statusCode, 200);
		assert.equal(created.json.slug, 'dilemma-verstehen');

		const target = path.join(root, 'workspace', 'dilemma-verstehen');
		for (const file of [
			'learning-design.md',
			'learning-landscape.md',
			'temporal-plan.yml',
			'planning-board.yml',
			'decisions.yml',
		]) {
			assert.equal((await stat(path.join(target, file))).isFile(), true, file);
		}
		for (const dir of ['materials', 'drafts', 'service-requests']) {
			assert.equal((await stat(path.join(target, dir))).isDirectory(), true, dir);
		}

		const design = await readFile(path.join(target, 'learning-design.md'), 'utf8');
		const landscape = await readFile(path.join(target, 'learning-landscape.md'), 'utf8');
		const decisions = await readFile(path.join(target, 'decisions.yml'), 'utf8');
		assert.match(design, /Vorläufige Denkstände/);
		assert.match(landscape, /als draft/);
		assert.match(landscape, /als stable/);
		assert.doesNotMatch(design, /erst nach sichtbarer Zustimmung/iu);
		assert.doesNotMatch(landscape, /erst nach sichtbarer Zustimmung/iu);
		assert.doesNotMatch(decisions, /genehmigt/iu);
		assert.equal(await readdir(path.join(target, 'materials')).then((entries) => entries.length), 0);
	} finally {
		restore();
	}
});
