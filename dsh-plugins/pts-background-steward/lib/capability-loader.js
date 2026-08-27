// pts-background-steward — capability artifact loader.
//
// Loads a dispatchable capability's INSTRUCTION (persona + prompt template) and
// its RESULT SCHEMA from the files referenced by capabilities/registry.yml, so
// neither is duplicated in JavaScript. The generic dispatcher uses these to
// compose a native DSH subagent request.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

/** Split the instruction markdown into its `## Persona` and `## Prompt` sections. */
export function parseInstruction(text) {
	const src = String(text).replace(/\r\n/g, '\n');
	const heading = (name) => {
		const re = new RegExp(`(^|\\n)##[ \\t]+${name}[ \\t]*\\n`);
		const m = re.exec(src);
		if (!m) return { start: -1, bodyStart: -1 };
		const bodyStart = m.index + m[0].length;
		return { start: m.index, bodyStart };
	};
	const persona = heading('Persona');
	const prompt = heading('Prompt');
	let personaText = '';
	if (persona.bodyStart >= 0) {
		const end = prompt.start > persona.start ? prompt.start : src.length;
		personaText = src.slice(persona.bodyStart, end).trim();
	}
	const promptTemplate = prompt.bodyStart >= 0 ? src.slice(prompt.bodyStart).trim() : '';
	return { persona: personaText, promptTemplate };
}

/** Build the denomination line for the prompt (unknown -> both confessions). */
export function denominationLine(denomination) {
	const denom = String(denomination ?? '').trim().toLowerCase();
	const known = denom !== '' && denom !== 'unknown' && denom !== 'unbekannt';
	return known
		? `- Konfession: ${denomination}`
		: '- Konfession: unbekannt — prüfe evangelische UND katholische Religionslehre und berichte beide getrennt. Das Fehlen der Konfession darf die Prüfung nicht blockieren.';
}

/** Interpolate {{placeholders}} in a prompt template from the request scope. */
export function interpolatePrompt(template, scope, reason) {
	const s = scope || {};
	const values = {
		jurisdiction: s.jurisdiction ?? '(fehlt)',
		subject: s.subject ?? '(fehlt)',
		phase: s.phase ?? '(fehlt)',
		grade: s.grade ?? '(fehlt)',
		topic: s.topic ?? '(fehlt)',
		denomination_line: denominationLine(s.denomination),
		reason: reason ?? '(keine angegeben)',
	};
	return String(template).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key) => (key in values ? values[key] : m));
}

/**
 * Load a capability's instruction + schema from disk.
 * @param {string} ptsRoot
 * @param {object} capEntry - one registry capability entry (needs instruction_file, schema_file)
 * @returns {Promise<{ persona: string, promptTemplate: string, schema: object, schemaVersion: string }>}
 */
export async function loadCapabilityArtifacts(ptsRoot, capEntry) {
	if (!capEntry || typeof capEntry.instruction_file !== 'string' || typeof capEntry.schema_file !== 'string') {
		throw new Error(`Capability "${capEntry?.task}" hat keine instruction_file/schema_file`);
	}
	const instrPath = path.join(ptsRoot, ...capEntry.instruction_file.split('/'));
	const schemaPath = path.join(ptsRoot, ...capEntry.schema_file.split('/'));
	const [instrText, schemaText] = await Promise.all([
		fsp.readFile(instrPath, 'utf8'),
		fsp.readFile(schemaPath, 'utf8'),
	]);
	const { persona, promptTemplate } = parseInstruction(instrText);
	if (persona === '' || promptTemplate === '') {
		throw new Error(`Instruktion für "${capEntry.task}" ist unvollständig (Persona/Prompt fehlt)`);
	}
	let parsed;
	try {
		parsed = JSON.parse(schemaText);
	} catch (error) {
		throw new Error(`Schema für "${capEntry.task}" ist kein gültiges JSON: ${String(error.message)}`);
	}
	const schema = parsed && typeof parsed === 'object' && parsed.schema ? parsed.schema : parsed;
	const schemaVersion = (parsed && parsed.schema_version) || capEntry.result_schema;
	if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
		throw new Error(`Schema für "${capEntry.task}" ist kein objektgewurzeltes JSON-Schema`);
	}
	return { persona, promptTemplate, schema, schemaVersion };
}
