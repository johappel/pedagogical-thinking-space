// Direct, deliberately narrow PTS edit capability for the visible Companion.
//
// This is not a generic file writer. It exposes only two structured updates to
// the current Denkraum: parking an open question and recording a teacher-
// confirmed decision. The fixed filenames, PTS-root check, size limits and
// atomic replacement are the direct path's scope/validation boundary.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { mutateProduct, productView } from './teaching-product.mjs';

export const name = 'pts-direct-edit';
export const inject = ['tools', 'agents'];

const MAX_QUESTION = 500;
const MAX_TITLE = 160;
const MAX_DECISION = 800;
const MAX_RATIONALE = 800;
const PRODUCT_OPERATIONS = ['read_product', 'propose_product', 'accept_product', 'reject_product', 'assess_product', 'mark_ready'];
const OPERATIONS = Object.freeze(['add_open_question', 'record_decision', ...PRODUCT_OPERATIONS]);

function isSubagent(agent) {
	return agent?.session?.header?.origin === 'subagent';
}

function asText(value, field, max) {
	if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} must be a non-empty string`);
	const text = value.trim();
	if (text.length > max) throw new Error(`${field} exceeds the direct-edit limit of ${max} characters`);
	if (/[\r\n]/.test(text)) throw new Error(`${field} must stay on one line`);
	return text;
}

function yamlString(value) {
	return JSON.stringify(String(value));
}

function dateIso() {
	return new Date().toISOString().slice(0, 10);
}

function slug(value) {
	return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
}

function uniqueId(content, prefix, basis) {
	const base = `${prefix}-${slug(basis)}`;
	let id = base;
	let n = 2;
	while (new RegExp(`(^|\\n)\\s*-?\\s*id:\\s*["']?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?(?:\\s|$)`, 'm').test(content)) {
		id = `${base}-${n}`;
		n += 1;
	}
	return id;
}

async function atomicWrite(dir, file, content) {
	const target = path.join(dir, file);
	const temp = path.join(dir, `.${file}.pts-direct-${process.pid}-${Date.now()}.tmp`);
	await fsp.writeFile(temp, content, 'utf8');
	try {
		await fsp.rename(temp, target);
	} catch (error) {
		await fsp.unlink(temp).catch(() => {});
		throw error;
	}
}

async function isPtsDenkraum(candidate) {
	const resolved = path.resolve(candidate);
	if (!path.isAbsolute(candidate) || path.basename(path.dirname(resolved)).toLowerCase() !== 'workspace') return false;
	const workspaceDir = path.dirname(resolved);
	const repoRoot = path.dirname(workspaceDir);
	try {
		const [rootStat, workspaceStat, rootMarker, realDenkraum, realWorkspace] = await Promise.all([
			fsp.stat(repoRoot), fsp.stat(workspaceDir), fsp.stat(path.join(repoRoot, 'AGENTS.md')),
			fsp.realpath(resolved), fsp.realpath(workspaceDir),
		]);
		return rootStat.isDirectory() && workspaceStat.isDirectory() && rootMarker.isFile()
			&& path.dirname(realDenkraum).toLowerCase() === realWorkspace.toLowerCase();
	} catch {
		return false;
	}
}

/** Exported for scope tests and for a future host-facing diagnostic. */
export async function resolveDenkraum(agent) {
	const cwd = agent?.session?.header?.cwd;
	if (typeof cwd !== 'string' || !(await isPtsDenkraum(cwd))) {
		throw new Error('pts_edit is limited to the current PTS Denkraum');
	}
	return path.resolve(cwd);
}

function boardQuestion(content, question) {
	const source = typeof content === 'string' && content.trim() !== ''
		? content.replace(/\s*$/, '')
		: 'schema: ptspace.planning-board/v1\nitems:';
	if (!/^schema:\s*ptspace\.planning-board\/v1\b/m.test(source) || !/^items:\s*$/m.test(source)) {
		throw new Error('planning-board.yml is not a supported PTS planning board');
	}
	const id = uniqueId(source, 'pb-companion', question);
	const block = [
		`  - id: ${yamlString(id)}`,
		`    title: ${yamlString(question)}`,
		'    kind: clarify',
		'    column: clarify',
		'    status: proposed',
		'    requires_teacher_approval: true',
	].join('\n');
	return { id, content: `${source}\n${block}\n` };
}

function confirmedDecision(content, args) {
	if (args.teacher_confirmed !== true) throw new Error('record_decision requires teacher_confirmed: true');
	const title = asText(args.title, 'title', MAX_TITLE);
	const decision = asText(args.decision, 'decision', MAX_DECISION);
	const rationale = args.rationale === undefined ? '' : asText(args.rationale, 'rationale', MAX_RATIONALE);
	const source = typeof content === 'string' && content.trim() !== ''
		? content.replace(/\s*$/, '')
		: '# PTS decisions\nschema: ptspace.decisions/v1\ndecisions:';
	if (!/^decisions:\s*$/m.test(source)) throw new Error('decisions.yml is not a supported PTS decisions file');
	const id = uniqueId(source, 'decision-companion', title);
	const block = [
		`  - id: ${yamlString(id)}`,
		`    date: ${yamlString(dateIso())}`,
		`    title: ${yamlString(title)}`,
		`    decision: ${yamlString(decision)}`,
		...(rationale === '' ? [] : [`    rationale: ${yamlString(rationale)}`]),
		'    status: confirmed',
	].join('\n');
	return { id, content: `${source}\n${block}\n` };
}

/** Apply one supported structured operation. No arbitrary path or raw content. */
async function applyDirectEditUnchecked(agent, args) {
	if (!args || !OPERATIONS.includes(args.operation)) throw new Error(`unsupported direct pts_edit operation; use one of: ${OPERATIONS.join(', ')}`);
	const root = await resolveDenkraum(agent);
	if (PRODUCT_OPERATIONS.includes(args.operation)) {
		const result = args.operation === 'read_product' ? await productView(root) : await mutateProduct(root, args);
		return { ok: true, operation: args.operation, file: 'teaching-product.json', id: result.product?.proposals.at(-1)?.id || 'series', direct: true, childAgentStarted: false, result };
	}
	if (args.operation === 'add_open_question') {
		const question = asText(args.question, 'question', MAX_QUESTION);
		const file = path.join(root, 'planning-board.yml');
		const current = await fsp.readFile(file, 'utf8').catch(() => 'schema: ptspace.planning-board/v1\nitems:');
		const result = boardQuestion(current, question);
		await atomicWrite(root, 'planning-board.yml', result.content);
		return { ok: true, operation: args.operation, file: 'planning-board.yml', id: result.id, direct: true, childAgentStarted: false };
	}

	const file = path.join(root, 'decisions.yml');
	const current = await fsp.readFile(file, 'utf8').catch(() => '');
	const result = confirmedDecision(current, args);
	await atomicWrite(root, 'decisions.yml', result.content);
	return { ok: true, operation: args.operation, file: 'decisions.yml', id: result.id, direct: true, childAgentStarted: false };
}

export async function applyDirectEdit(agent, args) {
	if (PRODUCT_OPERATIONS.includes(args?.operation)) return applyDirectEditUnchecked(agent, args);
	if (!OPERATIONS.includes(args?.operation)) throw new Error(`unsupported direct pts_edit operation; use one of: ${OPERATIONS.join(', ')}`);
	const root = await resolveDenkraum(agent);
	const lockPath = path.join(root, '.pts-direct-edit.lock');
	let lock;
	try { lock = await fsp.open(lockPath, 'wx'); }
	catch (e) { if (e.code === 'EEXIST') throw new Error('Denkstand busy; retry after current write'); throw e; }
	try {
		const file = path.join(root, args.operation === 'record_decision' ? 'decisions.yml' : 'planning-board.yml');
		const real = await fsp.realpath(file).catch((e) => { if (e.code === 'ENOENT') return file; throw e; });
		const relative = path.relative(await fsp.realpath(root), real);
		if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Denkstand file escapes workspace');
		return await applyDirectEditUnchecked(agent, args);
	} finally { await lock.close(); await fsp.unlink(lockPath); }
}

function directTool() {
	return {
		name: 'pts_edit',
		description: 'Structured PTS editing. read_product returns the current product, revision, pending proposals and migration status. propose_product stores a reviewable series, never adopts it. Preserve all unchanged lessons/phases and use stable IDs. accept_product requires a matching decisions.yml confirmed decision containing the exact proposal approval token [PTS product PROPOSAL_ID HASH], recorded only after explicit teacher agreement. assess_product is a Companion opinion, never teacher readiness. mark_ready requires an explicit matching teacher readiness decision. learning-design rewrites and arbitrary paths remain worker work.',
		parameters: {
			type: 'object',
			properties: {
				operation: { type: 'string', enum: [...OPERATIONS] },
				question: { type: 'string', description: 'One concise open question for add_open_question.' },
				title: { type: 'string', description: 'Short title for record_decision.' },
				decision: { type: 'string', description: 'The already confirmed teacher decision.' },
				rationale: { type: 'string', description: 'Optional factual rationale for record_decision.' },
				teacher_confirmed: { type: 'boolean', description: 'Must be true only when the teacher explicitly confirmed the decision.' },
				expectedRevision: { type: 'integer', description: 'Current product revision from read_product; required for writes.' },
				series: { type: 'object', description: 'Complete structured series: id,title,intention,notes,lessons[]. Lesson: id,title,intention,notes,durationMinutes(number|null),phases[]. Phase: id,title,intention,activity,notes,durationMinutes,startMinute(number|null),role,mode,momentIds[],materials[](relative materials/ or rendered/ paths),openQuestions[],sourceHashes:{} (server fills hashes). Never invent adoption of moments.' },
				reason: { type: 'string' }, proposalId: { type: 'string' }, decisionId: { type: 'string' }, lessonId: { type: 'string' },
				assessment: { type: 'string', enum: ['idea', 'developing', 'ready_candidate'] }, note: { type: 'string' }, ready: { type: 'boolean' },
			},
			required: ['operation'],
		},
		output: {
			schema: {
				type: 'object', additionalProperties: false,
				properties: {
					ok: { type: 'boolean' }, operation: { type: 'string' },
					file: { type: 'string' }, id: { type: 'string' },
					direct: { type: 'boolean' }, childAgentStarted: { type: 'boolean' },
					result: { type: 'object' },
				},
				required: ['ok', 'operation', 'file', 'id', 'direct', 'childAgentStarted'],
			},
			render: (_args, value) => [{ type: 'text', text: value.result ? JSON.stringify(value.result) : `${value.file} aktualisiert (${value.operation}; direkt, kein Child-Agent)` }],
		},
		isConcurrencySafe: () => false,
		execute: (args, exec) => {
			if (isSubagent(exec.agent)) throw new Error('pts_edit direct is available only to the visible Companion');
			exec.signal.throwIfAborted();
			return applyDirectEdit(exec.agent, args);
		},
	};
}

function install(agent) {
	if (!agent || isSubagent(agent)) return () => {};
	return agent.ctx.tools.register(directTool());
}

export function apply(ctx) {
	if (ctx.agent !== undefined) return install(ctx.agent);
	const installed = new WeakMap();
	const isCompanion = (agent) => !isSubagent(agent)
		&& ((ctx.get('agentPresets')?.composedPreset(agent.ctx)) ?? agent?.session?.header?.agentPreset) === 'pts-companion';
	const reconcile = (agent) => {
		const wanted = isCompanion(agent);
		const current = installed.get(agent);
		if (wanted && current === undefined) installed.set(agent, install(agent));
		if (!wanted && current !== undefined) { current(); installed.delete(agent); }
	};
	for (const agent of ctx.agents.list()) reconcile(agent);
	ctx.on('agent/created', ({ agent }) => reconcile(agent));
	ctx.on('agent/disposed', ({ agent }) => { installed.get(agent)?.(); installed.delete(agent); });
	return undefined;
}
