import { promises as fs } from 'node:fs';
import path from 'node:path';
import { workspaceRoot } from '../../../dsh-presets/pts-companion/teaching-product.mjs';
import { readProduct } from '../../../dsh-presets/pts-companion/teaching-product.mjs';
import { parseLandscape } from '../../../dsh-presets/pts-companion/workspace-parsers.mjs';
import { buildMomentImpact } from '../../../dsh-presets/pts-companion/moment-impact.mjs';
import { captureLearningMoment, bumpVersion, deleteLearningMoment, findMoment, parseLedger, serializeLedger, emptyLedger } from './domain.mjs';
import { bindProjection, moveProjection, detachProjection, projectionsFor, isStaleProjection, syncProjections } from './bindings.mjs';
import { classifyReaction, usagesFromImpact } from './reactions.mjs';

export const name = 'pts-learning-moment-binding';
export const inject = ['webServer', 'sessions'];

const LEDGER_FILE = 'learning-moment-bindings.json';

function send(res, status, value) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(JSON.stringify(value));
}

async function readRequestJson(req) {
	let raw = '';
	for await (const chunk of req) raw += chunk;
	return JSON.parse(raw || '{}');
}

async function readLedger(root) {
	try {
		return parseLedger(await fs.readFile(path.join(root, LEDGER_FILE), 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') return emptyLedger();
		throw error;
	}
}

async function writeLedger(root, ledger) {
	await fs.writeFile(path.join(root, LEDGER_FILE), serializeLedger(ledger), 'utf8');
}

async function landscapeMoment(root, domainId) {
	try {
		const landscape = parseLandscape(await fs.readFile(path.join(root, 'learning-landscape.md'), 'utf8'));
		return landscape.moments.find((entry) => entry.id === domainId) ?? null;
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		throw error;
	}
}

async function rootFor(ctx, sessionId) {
	const session = ctx.get('sessions')?.get?.(sessionId);
	if (!session?.header?.cwd) return null;
	return await workspaceRoot(session.header.cwd);
}

// Domain-Write-Seam: every mutation goes through one of these handlers. The
// renderer never touches the ledger; this is the only path that creates a
// canonical LearningMoment, binds a projection or bumps a version.
const HANDLERS = {
	// Capture gate. The teacher deliberately holds a moment as canonical. The
	// moment must already exist in the landscape; a bare card role never
	// reaches here.
	async capture(root, body) {
		const moment = await landscapeMoment(root, body.domainId);
		if (!moment) return { status: 404, value: { ok: false, error: 'landscape-moment-required', domainId: body.domainId } };
		const ledger = await readLedger(root);
		const result = captureLearningMoment(ledger, {
			domainId: body.domainId,
			createdFrom: body.createdFrom,
			confirmedAt: new Date().toISOString(),
		});
		if (result.created) await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, created: result.created, moment: result.moment } };
	},

	async bind(root, body) {
		const ledger = await readLedger(root);
		const result = bindProjection(ledger, { domainId: body.domainId, projectionId: body.projectionId, projectionType: body.projectionType, page: body.page });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, projection: result.projection } };
	},

	async move(root, body) {
		const ledger = await readLedger(root);
		const result = moveProjection(ledger, { domainId: body.domainId, projectionId: body.projectionId, toPage: body.toPage });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, projection: result.projection } };
	},

	async detach(root, body) {
		const ledger = await readLedger(root);
		const result = detachProjection(ledger, { domainId: body.domainId, projectionId: body.projectionId });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, domainRetained: result.domainRetained, orphanedDomain: result.orphanedDomain } };
	},

	// Record a canonical content change and classify the reaction. This never
	// rewrites a dependent artefact; a confirm/clarify follow-up stays with the
	// teacher and Companion.
	async update(root, body) {
		const moment = await landscapeMoment(root, body.domainId);
		if (!moment) return { status: 404, value: { ok: false, error: 'landscape-moment-required', domainId: body.domainId } };
		const ledger = await readLedger(root);
		const bump = bumpVersion(ledger, { domainId: body.domainId, expectedVersion: body.expectedVersion });
		if (!bump.ok) return { status: 409, value: { ok: false, error: 'stale-version', currentVersion: bump.currentVersion } };
		const impact = buildMomentImpact({ moment, fields: body.fields || {}, product: await readProduct(root).catch(() => null) });
		const reaction = classifyReaction({
			domainId: body.domainId,
			versionBefore: bump.versionBefore,
			versionAfter: bump.versionAfter,
			changedFields: (impact.changedFields || []).map((entry) => entry.id),
			intent: body.intent === 'relabel' ? 'relabel' : 'semantic',
			scope: body.scope === 'redesign' ? 'redesign' : 'local',
			usages: usagesFromImpact(impact),
		});
		let ledgerAfter = bump.ledger;
		// Only an automatic reaction re-syncs projections to the new version.
		if (reaction.reaction === 'automatic') ledgerAfter = syncProjections(ledgerAfter, body.domainId).ledger;
		await writeLedger(root, ledgerAfter);
		return { status: 200, value: { ok: true, version: bump.versionAfter, impact: reaction } };
	},

	// Explicit, deliberate domain deletion — never a side effect of a board action.
	async delete(root, body) {
		const ledger = await readLedger(root);
		const result = deleteLearningMoment(ledger, { domainId: body.domainId });
		await writeLedger(root, result.ledger);
		return { status: 200, value: { ok: true, removed: result.removed.domainId } };
	},
};

export function apply(ctx) {
	const webServer = ctx.get('webServer');
	const sessions = ctx.get('sessions');
	if (!webServer || !sessions) return;

	const disposeMutations = webServer.register({
		kind: 'prefix', path: '/api/pts-learning-moment/',
		handler: async (req, res) => {
			try {
				if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
				const action = new URL(req.url, 'http://pts.local').pathname.split('/').filter(Boolean).pop();
				const handler = HANDLERS[action];
				if (!handler) return send(res, 404, { error: 'unknown action' });
				const body = await readRequestJson(req);
				const root = await rootFor(ctx, body.sessionId);
				if (!root) return send(res, 404, { error: 'session not found' });
				const { status, value } = await handler(root, body);
				return send(res, status, value);
			} catch (error) {
				return send(res, 400, { error: error.message, code: error.code });
			}
		},
	});

	// Read-only debug view: domainId/projectionId/version are developer data,
	// not part of the normal teacher interface.
	const disposeView = webServer.register({
		kind: 'exact', path: '/api/pts-learning-moment',
		handler: async (req, res) => {
			try {
				if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
				const args = Object.fromEntries(new URL(req.url, 'http://pts.local').searchParams);
				const root = await rootFor(ctx, args.sessionId);
				if (!root) return send(res, 404, { error: 'session not found' });
				const ledger = await readLedger(root);
				const moments = ledger.moments.map((moment) => ({
					...moment,
					staleProjections: moment.projections.filter((p) => isStaleProjection(ledger, moment.domainId, p.projectionId)).map((p) => p.projectionId),
				}));
				return send(res, 200, { ok: true, moments });
			} catch (error) {
				return send(res, 400, { error: error.message });
			}
		},
	});

	ctx.effect(() => () => { disposeMutations(); disposeView(); }, 'pts-learning-moment-binding: domain write-seam and debug view');
}

export { findMoment, projectionsFor };
