// Direct, deliberately narrow PTS edit capability for the visible Companion.
//
// This is not a generic file writer. It exposes only two structured updates to
// the current Denkraum: parking an open question and recording a teacher-
// confirmed decision. The fixed filenames, PTS-root check, size limits and
// atomic replacement are the direct path's scope/validation boundary.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const name = 'pts-direct-edit';
export const inject = ['tools', 'agents'];

const MAX_QUESTION = 500;
const MAX_TITLE = 160;
const MAX_DECISION = 800;
const MAX_RATIONALE = 800;
const OPERATIONS = Object.freeze(['add_open_question', 'record_decision']);

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
export async function applyDirectEdit(agent, args) {
	if (!args || !OPERATIONS.includes(args.operation)) throw new Error(`unsupported direct pts_edit operation; use one of: ${OPERATIONS.join(', ')}`);
	const root = await resolveDenkraum(agent);
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

function directTool() {
	return {
		name: 'pts_edit',
		description: 'Apply one small, already clarified PTS Denkstand update directly. This is not a general file editor: use add_open_question for an unresolved question or record_decision only after an explicit teacher-confirmed decision. Larger conceptual rewrites, materials, learning-design changes, and arbitrary paths must stay conversational or use the legacy worker path.',
		parameters: {
			type: 'object',
			properties: {
				operation: { type: 'string', enum: [...OPERATIONS] },
				question: { type: 'string', description: 'One concise open question for add_open_question.' },
				title: { type: 'string', description: 'Short title for record_decision.' },
				decision: { type: 'string', description: 'The already confirmed teacher decision.' },
				rationale: { type: 'string', description: 'Optional factual rationale for record_decision.' },
				teacher_confirmed: { type: 'boolean', description: 'Must be true only when the teacher explicitly confirmed the decision.' },
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
				},
				required: ['ok', 'operation', 'file', 'id', 'direct', 'childAgentStarted'],
			},
			render: (_args, value) => [{ type: 'text', text: `${value.file} aktualisiert (${value.operation}; direkt, kein Child-Agent)` }],
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
