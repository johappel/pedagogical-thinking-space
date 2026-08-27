// pts-background-steward — GENERIC result handlers, selected by a capability's
// `output_handler`. Handlers are shared building blocks, NOT per-capability
// routes: a new prompt/schema capability picks an existing handler and needs no
// new JavaScript. Two handlers ship today:
//   - curriculum_alignment: the source-quality/validity gate (research-job)
//   - generic: schema-validate the structured result and store a plain draft
//
// A capability that uses `output_handler: generic` runs entirely through the
// generic dispatcher with only its instruction + schema files — no code change.

import path from 'node:path';

import { defaultCurriculumHandler, writeArtifact, scopeKey } from './research-job.js';
import { materializeProposal } from './capability-builder.js';

function isPlainObject(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Minimal generic validation of a structured value against an object-rooted
 * JSON schema (the enforced dsh-tools subset). DSH already enforces the schema
 * at the child; this is PTS-side defense: required keys present, enum/const
 * respected, array/object/scalar types checked one level deep.
 */
export function validateAgainstSchema(schema, value, at = 'value') {
	const errors = [];
	if (!isPlainObject(schema)) return ['Schema fehlt'];
	const type = schema.type;
	if (schema.const !== undefined && value !== schema.const) errors.push(`${at} muss "${schema.const}" sein`);
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${at} nicht im erlaubten enum`);
	if (type === 'object') {
		if (!isPlainObject(value)) return [`${at} ist kein Objekt`];
		for (const req of schema.required || []) {
			if (!(req in value)) errors.push(`${at}.${req} fehlt`);
		}
		for (const [k, sub] of Object.entries(schema.properties || {})) {
			if (k in value) errors.push(...validateAgainstSchema(sub, value[k], `${at}.${k}`));
		}
	} else if (type === 'array') {
		if (!Array.isArray(value)) return [`${at} ist kein Array`];
		if (schema.items) value.forEach((v, i) => errors.push(...validateAgainstSchema(schema.items, v, `${at}[${i + 1}]`)));
	} else if (type === 'string') {
		if (typeof value !== 'string') errors.push(`${at} ist kein String`);
	} else if (type === 'integer' || type === 'number') {
		if (typeof value !== 'number') errors.push(`${at} ist keine Zahl`);
	} else if (type === 'boolean') {
		if (typeof value !== 'boolean') errors.push(`${at} ist kein Boolean`);
	}
	return errors;
}

function formatGenericResult(structured, intent, capability) {
	const s = (intent && intent.scope) || {};
	const lines = [];
	lines.push(`# ${capability ? capability.task : intent.task} — Ergebnis`);
	lines.push('');
	lines.push(`- Status: draft`);
	lines.push(`- Capability: ${capability ? capability.task : intent.task} v${capability ? capability.capability_version : '?'}`);
	lines.push(`- Herkunft: pts-background-steward · generischer Dispatcher`);
	lines.push('');
	if (Object.keys(s).length > 0) {
		lines.push('## Auftrag');
		for (const [k, v] of Object.entries(s)) lines.push(`- ${k}: ${v}`);
		lines.push('');
	}
	lines.push('## Strukturiertes Ergebnis');
	lines.push('');
	lines.push('```json');
	lines.push(JSON.stringify(structured, null, 2));
	lines.push('```');
	lines.push('');
	return lines.join('\n');
}

function buildGenericFollowup(structured, intent, capability, outputRel) {
	return [
		'INTERNE NOTIZ (nicht wörtlich zeigen, keine Roh-Ausgabe einfügen):',
		`Die Capability ${capability ? capability.task : intent.task} v${capability ? capability.capability_version : '?'} ist abgeschlossen.`,
		`Vollständiges Ergebnis als Draft: ${outputRel}.`,
		'Formuliere daraus einen kurzen, quellengebundenen Anschlussbeitrag. Triff keine pädagogische Entscheidung und stelle keine erneute Recherche-Erlaubnisfrage.',
	].join('\n');
}

/** Generic handler: schema-validate + store a plain draft under drafts/. */
export const genericHandler = Object.freeze({
	name: 'generic',
	async process(structured, { intent, dir, slug, schema, capability }) {
		const errors = validateAgainstSchema(schema, structured);
		if (errors.length > 0) {
			return { status: 'invalid', detail: `${errors.length} Schemaverstoß`, errors };
		}
		const task = (capability && capability.task) || intent.task;
		const key = scopeKey(intent);
		const rel = `drafts/${task}-${key}.md`;
		const target = path.join(dir, 'drafts', `${task}-${key}.md`);
		await writeArtifact(target, formatGenericResult(structured, intent, capability));
		const briefing = buildGenericFollowup(structured, intent, capability, rel);
		return { status: 'completed-research', detail: briefing, outputPath: target, outputRel: rel, isProposal: false, briefing };
	},
});

/**
 * Capability-builder handler: materialize the builder subagent's structured
 * Capability Proposal into a versioned proposal folder (status trial) under
 * capabilities/_proposals/. Runs through the SAME generic dispatcher.
 */
export const capabilityProposalHandler = Object.freeze({
	name: 'capability_proposal',
	async process(structured, { ptsRoot, intent, dir }) {
		if (!ptsRoot) return { status: 'invalid', detail: 'ptsRoot fehlt — Proposal kann nicht materialisiert werden' };
		const res = await materializeProposal(ptsRoot, structured);
		if (res.errors) return { status: 'invalid', detail: `Proposal ungültig: ${res.errors.join('; ')}`, errors: res.errors };
		const rel = path.relative(ptsRoot, res.dir).split(path.sep).join('/');
		const briefing = [
			'INTERNE NOTIZ (nicht wörtlich zeigen):',
			`Capability-Proposal erstellt: ${res.entry.task} v${res.entry.capability_version} (status trial) unter ${rel}.`,
			'Die neue Fähigkeit kann nun als trial über den generischen Dispatcher erprobt und danach geprüft werden.',
		].join('\n');
		return { status: 'completed-research', detail: briefing, outputPath: res.dir, outputRel: rel, isProposal: false, briefing, proposalEntry: res.entry };
	},
});

const HANDLERS = new Map([
	['curriculum_alignment', defaultCurriculumHandler],
	['generic', genericHandler],
	// A capability may also declare `output_handler: draft` — treat as generic.
	['draft', genericHandler],
	['capability_proposal', capabilityProposalHandler],
]);

/** Resolve a generic result handler by name, or undefined. */
export function getHandler(name) {
	return HANDLERS.get(name);
}
