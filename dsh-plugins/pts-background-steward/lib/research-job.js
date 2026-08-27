// pts-background-steward — one bounded, source-grounded knowledge-research run.
//
// This is a DIFFERENT actor from the steward. The steward only detects a
// knowledge gap and proposes a validated `service_intents` entry; this module
// executes the source-grounded lookup through a separate DSH subagent that
// ALONE has web access. Flow:
//
//   validated service intent
//        |
//        v
//   owned DSH job (owner = companion agent)  ── so completion triggers a
//        |                                       Companion follow-up turn
//        v
//   research subagent (research model route, web-enabled tool allowlist,
//        researcher persona, structured curriculum_alignment_brief)
//        |
//        v
//   validated brief → draft on disk (sources + uncertainties preserved)
//        |
//        v
//   concise internal follow-up briefing → Companion phrases one short,
//        source-based contribution (never the raw worker answer)
//
// Unlike the steward reflection job (unowned → silent), the research job is
// OWNED on purpose: the shipped jobs reporter turns an owned job's completion
// into a Companion follow-up. The raw structured answer never reaches the chat;
// the follow-up is an instruction plus a compact source-cited summary, and the
// full brief lives in the Denkraum's drafts folder.

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const CURRICULUM_BRIEF_SCHEMA_VERSION = 'ptspace.curriculum-alignment-brief/v2';

// The result JSON Schema is NOT duplicated here: it is loaded at runtime from
// capabilities/knowledge/verify_curriculum_alignment.schema.json via the
// capability loader. This module keeps only the version id and the PTS-side
// validation/quality gate below.

// Source-status vocabulary. The status is COMPUTED by the gate below, never
// trusted from the model's `official` flag alone.
export const SOURCE_STATUSES = Object.freeze(['verified', 'partly-verified', 'source-candidates-unverified', 'unverified']);

/**
 * A source counts as CURRENT OFFICIAL EVIDENCE only when it is officially
 * published, currently valid (not archived/superseded), and fully evidenced:
 * a direct URL, an access date, a version/publication date and an exact locus.
 * An archived or superseded source can never verify a CURRENT alignment.
 */
export function isVerifyingSource(src) {
	if (!isPlainObject(src)) return false;
	const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
	return src.official === true
		&& src.validity === 'current'
		&& nonEmpty(src.url)
		&& nonEmpty(src.accessed)
		&& nonEmpty(src.version_date)
		&& nonEmpty(src.locus);
}

/**
 * Compute the effective source_status from the actual sources and their
 * mapping to findings. A result may only be stored as `verified` or
 * `partly-verified` when at least one current official source is fully
 * evidenced. Findings that only cite archived/superseded or non-official
 * sources are not backed.
 * @returns {{ status: string, reasons: string[] }}
 */
export function evaluateSourceStatus(result) {
	const sources = Array.isArray(result?.sources) ? result.sources : [];
	const findings = Array.isArray(result?.findings) ? result.findings : [];
	const verifyingById = new Map();
	for (const s of sources) if (isVerifyingSource(s)) verifyingById.set(String(s.id), s);
	const anyVerifying = verifyingById.size > 0;
	const positive = findings.filter((f) => isPlainObject(f) && (f.alignment === 'yes' || f.alignment === 'partial'));
	const backed = (f) => Array.isArray(f.source_ids) && f.source_ids.some((id) => verifyingById.has(String(id)));
	const reasons = [];
	if (!anyVerifying) {
		reasons.push('keine aktuelle offizielle Quelle mit vollständigem Nachweis (URL, Abrufdatum, Fassungsdatum, Fundstelle)');
		// Distinguish "sources exist but none verify" from "no sources at all".
		return { status: sources.length > 0 ? 'source-candidates-unverified' : 'unverified', reasons };
	}
	if (positive.length > 0 && positive.every(backed)) return { status: 'verified', reasons };
	if (positive.length > 0) reasons.push('nicht jeder positive Befund ist an eine aktuelle offizielle Quelle gebunden');
	return { status: 'partly-verified', reasons };
}

/** Stable dedup/draft key from the intent's public scope. */
export function scopeKey(intent) {
	const s = (intent && intent.scope) || {};
	const parts = ['jurisdiction', 'subject', 'phase', 'grade', 'topic', 'denomination']
		.map((k) => String(s[k] ?? '').trim().toLowerCase())
		.join('|');
	const hash = createHash('sha256').update(`${intent?.task ?? ''}::${parts}`, 'utf8').digest('hex');
	return hash.slice(0, 12);
}

/** Deterministic draft path for one intent inside a Denkraum. */
export function draftPathFor(dir, intent) {
	return path.join(dir, 'drafts', `curriculum-alignment-${scopeKey(intent)}.md`);
}

/** Deterministic knowledge-proposal path for one intent inside a Denkraum. */
export function proposalPathFor(dir, intent) {
	return path.join(dir, 'knowledge-proposals', `curriculum-alignment-${scopeKey(intent)}.md`);
}

/**
 * True when the teacher explicitly asked to store the verified result in
 * Knowledge: the intent then carries expected_output.type = knowledge_proposal.
 */
export function wantsKnowledgeProposal(intent) {
	return isPlainObject(intent?.expected_output) && intent.expected_output.type === 'knowledge_proposal';
}

/** Where this intent's completed research result is written on disk. */
export function outputTargetFor(dir, intent) {
	return wantsKnowledgeProposal(intent) ? proposalPathFor(dir, intent) : draftPathFor(dir, intent);
}

export function buildResearchPrompt() {
	throw new Error('buildResearchPrompt wurde entfernt: die Instruktion wird aus der Capability geladen (capability-loader.js)');
}

function isPlainObject(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validate one captured curriculum_alignment_brief. Independent of any provider
 * enforcement: at least one source-grounded finding and one cited source, plus
 * the source-quality/validity gate.
 * @param {unknown} structured - captured structured_output value
 * @param {object} [options]
 * @param {string} [options.denomination] - scope denomination; when unknown/empty,
 *   both evangelisch and katholisch findings are required.
 * @returns {{ ok: true, result: object } | { ok: false, errors: string[] }}
 */
export function validateResearchResult(structured, options = {}) {
	const errors = [];
	if (!isPlainObject(structured)) return { ok: false, errors: ['result ist kein Objekt'] };
	const r = structured;
	if (r.schema !== CURRICULUM_BRIEF_SCHEMA_VERSION) errors.push(`schema muss "${CURRICULUM_BRIEF_SCHEMA_VERSION}" sein`);
	if (r.task !== 'verify_curriculum_alignment') errors.push('task muss verify_curriculum_alignment sein');
	const sourceIds = new Set();
	if (!Array.isArray(r.sources) || r.sources.length === 0) errors.push('sources fehlt oder ist leer (Recherche muss belegt sein)');
	else {
		r.sources.forEach((s, i) => {
			if (!isPlainObject(s)) { errors.push(`sources[${i + 1}] ist kein Objekt`); return; }
			if (typeof s.id !== 'string' || s.id.trim() === '') errors.push(`sources[${i + 1}].id fehlt`);
			else if (sourceIds.has(s.id)) errors.push(`sources[${i + 1}].id "${s.id}" ist doppelt`);
			else sourceIds.add(s.id);
			if (typeof s.title !== 'string' || s.title.trim() === '') errors.push(`sources[${i + 1}].title fehlt`);
			if (typeof s.publisher !== 'string' || s.publisher.trim() === '') errors.push(`sources[${i + 1}].publisher (Institution) fehlt`);
			if (typeof s.official !== 'boolean') errors.push(`sources[${i + 1}].official fehlt`);
			if (!['current', 'archived', 'superseded'].includes(s.validity)) errors.push(`sources[${i + 1}].validity muss current|archived|superseded sein`);
			if (s.validity === 'superseded' && (typeof s.successor !== 'string' || s.successor.trim() === '')) {
				errors.push(`sources[${i + 1}]: abgelöste Quelle braucht ein Nachfolgedokument (successor)`);
			}
		});
	}
	if (!Array.isArray(r.findings) || r.findings.length === 0) errors.push('findings fehlt oder ist leer');
	else {
		r.findings.forEach((f, i) => {
			if (!isPlainObject(f)) { errors.push(`findings[${i + 1}] ist kein Objekt`); return; }
			if (typeof f.denomination !== 'string' || f.denomination.trim() === '') errors.push(`findings[${i + 1}].denomination fehlt`);
			if (!['yes', 'partial', 'no', 'unclear'].includes(f.alignment)) errors.push(`findings[${i + 1}].alignment unzulässig`);
			if (typeof f.statement !== 'string' || f.statement.trim() === '') errors.push(`findings[${i + 1}].statement fehlt`);
			if (!Array.isArray(f.source_ids)) errors.push(`findings[${i + 1}].source_ids fehlt`);
			else for (const id of f.source_ids) {
				if (!sourceIds.has(String(id))) errors.push(`findings[${i + 1}].source_ids verweist auf unbekannte Quelle "${id}"`);
			}
		});
	}
	// Unknown denomination must produce SEPARATE evangelisch + katholisch findings —
	// a prompt alone is not enough (acceptance requirement).
	const denom = String(options.denomination ?? '').trim().toLowerCase();
	const denomUnknown = denom === '' || denom === 'unknown' || denom === 'unbekannt';
	if (denomUnknown && Array.isArray(r.findings)) {
		const denoms = r.findings.map((f) => String(f?.denomination ?? '').toLowerCase());
		if (!denoms.some((d) => d.includes('evangel'))) errors.push('unbekannte Konfession: evangelischer Befund fehlt');
		if (!denoms.some((d) => d.includes('kathol'))) errors.push('unbekannte Konfession: katholischer Befund fehlt');
	}
	if (!Array.isArray(r.uncertainties)) errors.push('uncertainties muss ein Array sein');
	if (errors.length > 0) return { ok: false, errors };
	const gate = evaluateSourceStatus(r);
	return { ok: true, result: r, source_status: gate.status, source_status_reasons: gate.reasons };
}

/** Render the validated brief as a reviewable draft markdown document. */
export function formatBriefMarkdown(result, intent, dateIso) {
	const s = (intent && intent.scope) || {};
	const lines = [];
	lines.push('# Curriculum alignment brief');
	lines.push('');
	lines.push(`- Status: draft`);
	lines.push(`- Herkunft: pts-background-steward · quellengebundener Recherche-Subagent`);
	lines.push(`- Erstellt: ${dateIso}`);
	lines.push('');
	lines.push('## Frage');
	lines.push(`- Jurisdiktion: ${s.jurisdiction ?? '—'}`);
	lines.push(`- Fach: ${s.subject ?? '—'}`);
	lines.push(`- Schulphase: ${s.phase ?? '—'}`);
	lines.push(`- Jahrgang: ${s.grade ?? '—'}`);
	lines.push(`- Thema: ${s.topic ?? '—'}`);
	if (s.denomination) lines.push(`- Konfession: ${s.denomination}`);
	lines.push('');
	if (typeof result.summary === 'string' && result.summary.trim() !== '') {
		lines.push('## Gesamtbefund');
		lines.push(result.summary.trim());
		lines.push('');
	}
	lines.push(`- Quellenstatus (geprüft): ${evaluateSourceStatus(result).status}`);
	lines.push('');
	lines.push('## Befunde');
	for (const f of result.findings) {
		lines.push(`### ${f.denomination} — ${f.alignment}`);
		if (f.competence_areas) lines.push(`- Kompetenzbereiche / Schwerpunkte: ${f.competence_areas}`);
		lines.push(`- ${f.statement}`);
		if (Array.isArray(f.source_ids) && f.source_ids.length > 0) lines.push(`- Belege: ${f.source_ids.join(', ')}`);
		lines.push('');
	}
	lines.push('## Quellen');
	for (const src of result.sources) {
		const mark = isVerifyingSource(src) ? 'aktuell offiziell' : (src.official ? 'offiziell' : 'weitere');
		const url = src.url ? ` — ${src.url}` : '';
		const accessed = src.accessed ? ` (Zugriff: ${src.accessed})` : '';
		const version = src.version_date ? ` · Fassung: ${src.version_date}` : '';
		const validity = src.validity ? ` · ${src.validity}` : '';
		const locus = src.locus ? ` · Fundstelle: ${src.locus}` : '';
		const successor = src.successor ? ` · Nachfolger: ${src.successor}` : '';
		lines.push(`- [${src.id ?? '?'}][${mark}] ${src.title}${url}${version}${validity}${locus}${successor}${accessed}`);
	}
	lines.push('');
	lines.push('## Unsicherheiten');
	if (result.uncertainties.length === 0) lines.push('- keine benannt');
	else for (const u of result.uncertainties) lines.push(`- ${u}`);
	lines.push('');
	return lines.join('\n');
}

/**
 * Render the validated brief as an OKF-compatible Knowledge Proposal. Used only
 * when the teacher explicitly asked to store the verified information in
 * Knowledge. The proposal stays provisional and not-yet-curated: it separates
 * verified sources, source candidates, interpretation and uncertainty, and
 * carries `status: proposal`. It never lands in curated `knowledge/`.
 */
export function formatProposalMarkdown(result, intent, dateIso, slug) {
	const s = (intent && intent.scope) || {};
	const verifyingSources = result.sources.filter((x) => isVerifyingSource(x));
	const candidateSources = result.sources.filter((x) => !isVerifyingSource(x));
	const sourceStatus = evaluateSourceStatus(result).status;
	const topic = String(s.topic ?? '').trim() || 'Thema';
	const subject = String(s.subject ?? '').trim();
	const jurisdiction = String(s.jurisdiction ?? '').trim();
	const grade = String(s.grade ?? '').trim();
	const yamlStr = (value) => JSON.stringify(String(value ?? ''));
	const filename = `curriculum-alignment-${scopeKey(intent)}.md`;

	const lines = [];
	lines.push('---');
	lines.push('type: Knowledge Proposal');
	lines.push(`title: ${yamlStr(`Lehrplan-Zuordnung: ${topic}${subject ? ` (${subject})` : ''}`)}`);
	lines.push(`description: ${yamlStr(`Quellengebundene Lehrplan-Zuordnung für ${topic}${jurisdiction ? ` in ${jurisdiction}` : ''}${grade ? `, Jahrgang ${grade}` : ''}.`)}`);
	lines.push('tags:');
	lines.push('  - lehrplan');
	lines.push('  - curriculum-alignment');
	if (subject) lines.push(`  - ${yamlStr(subject.toLowerCase())}`);
	lines.push('status: proposal');
	lines.push(`timestamp: ${dateIso}`);
	if (jurisdiction) lines.push(`jurisdiction: ${yamlStr(jurisdiction)}`);
	if (subject) lines.push(`subject: ${yamlStr(subject)}`);
	if (grade) lines.push(`grade: ${yamlStr(grade)}`);
	if (s.denomination && String(s.denomination).trim() !== '' && String(s.denomination).trim().toLowerCase() !== 'unknown') {
		lines.push(`denomination: ${yamlStr(s.denomination)}`);
	}
	lines.push(`source_status: ${sourceStatus}`);
	lines.push(`suggested_location: ${yamlStr(`knowledge/curricula/${filename}`)}`);
	lines.push('---');
	lines.push('');
	lines.push('# Summary');
	lines.push('');
	lines.push(typeof result.summary === 'string' && result.summary.trim() !== ''
		? result.summary.trim()
		: `Quellengebundene Zuordnung von „${topic}" zu ${jurisdiction || 'der angegebenen Jurisdiktion'}, Fach ${subject || '—'}, Jahrgang ${grade || '—'}.`);
	lines.push('');
	lines.push('# Proposal');
	lines.push('');
	lines.push('Geprüfte Lehrplan-Zuordnung je Konfession/Schiene:');
	lines.push('');
	for (const f of result.findings) {
		lines.push(`- **${f.denomination} — ${f.alignment}**${f.competence_areas ? ` · ${f.competence_areas}` : ''}: ${f.statement}`);
	}
	lines.push('');
	lines.push('# Why It Matters');
	lines.push('');
	lines.push('Die Zuordnung zeigt, ob und wie das Thema an den offiziellen Rahmen anschlussfähig ist, ohne eine pädagogische Entscheidung vorwegzunehmen.');
	lines.push('');
	lines.push('# Verified Sources');
	lines.push('');
	if (verifyingSources.length === 0) lines.push('Noch keine aktuelle offizielle Quelle vollständig nachgewiesen.');
	else for (const src of verifyingSources) {
		const url = src.url ? ` — ${src.url}` : '';
		const accessed = src.accessed ? ` (Zugriff: ${src.accessed})` : '';
		const version = src.version_date ? ` · Fassung: ${src.version_date}` : '';
		const locus = src.locus ? ` · Fundstelle: ${src.locus}` : '';
		lines.push(`- [${src.id ?? '?'}] ${src.publisher ? `${src.publisher}: ` : ''}${src.title}${url}${version}${locus}${accessed}`);
	}
	lines.push('');
	lines.push('# Source Candidates');
	lines.push('');
	if (candidateSources.length === 0) lines.push('Keine weiteren, noch ungeprüften oder nicht aktuellen Quellen benannt.');
	else for (const src of candidateSources) {
		const url = src.url ? ` — ${src.url}` : '';
		const validity = src.validity ? ` · ${src.validity}` : '';
		const successor = src.successor ? ` · Nachfolger: ${src.successor}` : '';
		lines.push(`- [${src.id ?? '?'}] ${src.title}${url}${validity}${successor}`);
	}
	lines.push('');
	lines.push('# Interpretation');
	lines.push('');
	lines.push('Die Einordnung stammt aus einer begrenzten, quellengebundenen Prüfung durch einen getrennten Recherche-Subagenten. Sie ersetzt keine pädagogische Entscheidung.');
	lines.push('');
	lines.push('# Uncertainty');
	lines.push('');
	if (!Array.isArray(result.uncertainties) || result.uncertainties.length === 0) lines.push('- keine benannt');
	else for (const u of result.uncertainties) lines.push(`- ${u}`);
	lines.push('');
	lines.push('# Review Checklist');
	lines.push('');
	lines.push('- [ ] Offizielle Quellen geprüft');
	lines.push('- [ ] Quelleninhalt und Interpretation getrennt');
	lines.push('- [ ] Keine unbelegten Lehrplan- oder Rechtsaussagen');
	lines.push('- [ ] Über den Einzelfall hinaus wiederverwendbar');
	lines.push('- [ ] Keine personenbezogenen Daten');
	lines.push('- [ ] Vorgeschlagener Ablageort plausibel');
	lines.push('');
	lines.push(`> Herkunft: pts-background-steward · quellengebundener Recherche-Subagent · ${slug ?? 'Denkraum'} · erzeugt ${dateIso}. Noch nicht kuratiert.`);
	lines.push('');
	return lines.join('\n');
}

/**
 * Build the concise internal follow-up briefing for the Companion. This is NOT
 * the raw worker answer: it instructs the Companion to phrase one short,
 * source-based contribution and points to the full result on disk.
 */
export function buildFollowupBriefing(result, intent, outputRel, isProposal = false) {
	const s = (intent && intent.scope) || {};
	const findings = result.findings
		.map((f) => `${f.denomination}: ${f.alignment}${f.competence_areas ? ` (${f.competence_areas})` : ''}`)
		.join('; ');
	const officialSources = result.sources.filter((x) => x.official).map((x) => x.title);
	const sourceList = (officialSources.length > 0 ? officialSources : result.sources.map((x) => x.title)).slice(0, 3).join('; ');
	const artifactLabel = isProposal ? 'Knowledge Proposal (überprüfbar, noch nicht kuratiert)' : 'Draft';
	return [
		'INTERNE NOTIZ (nicht wörtlich zeigen, keine Roh-Ausgabe einfügen):',
		`Die im Hintergrund angestoßene Lehrplan-Prüfung (${s.subject ?? ''} · ${s.jurisdiction ?? ''} · Jahrgang ${s.grade ?? ''} · Thema „${s.topic ?? ''}“) ist abgeschlossen.`,
		`Kurzbefund: ${findings || '—'}.`,
		`Offizielle Quellen: ${sourceList || '—'}.`,
		result.uncertainties.length > 0 ? `Offene Unsicherheiten: ${result.uncertainties.slice(0, 2).join('; ')}.` : '',
		`Vollständiger Befund als ${artifactLabel}: ${outputRel}.`,
		isProposal
			? 'Weise kurz darauf hin, dass das Ergebnis zunächst als überprüfbares Knowledge Proposal im Denkraum liegt; die Übernahme ins kuratierte Knowledge bleibt ein späterer, getrennter Schritt.'
			: '',
		'Formuliere daraus einen kurzen, quellenbasierten Anschlussbeitrag an die Lehrkraft; nenne die Quellenlage und bleibe bei quellengebundenem Wissen. Triff keine pädagogische Entscheidung und stelle keine erneute allgemeine Recherche-Erlaubnisfrage.',
	].filter(Boolean).join('\n');
}

function agentOptionsFrom(researchConfig) {
	const options = {};
	if (researchConfig.provider) options.provider = researchConfig.provider;
	if (researchConfig.model) options.model = researchConfig.model;
	if (researchConfig.maxTokens > 0) options.maxTokens = researchConfig.maxTokens;
	return Object.keys(options).length > 0 ? options : undefined;
}

export async function writeArtifact(target, markdown) {
	await fsp.mkdir(path.dirname(target), { recursive: true });
	const tmp = `${target}.research-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
	await fsp.writeFile(tmp, markdown, 'utf8');
	try {
		await fsp.rename(tmp, target);
	} catch (error) {
		await fsp.unlink(tmp).catch(() => {});
		throw error;
	}
	return target;
}

// Default result handler: the curriculum source-quality gate. Handlers are
// GENERIC building blocks selected by a capability's `output_handler`; they are
// never a per-capability JS route.
export const defaultCurriculumHandler = Object.freeze({
	name: 'curriculum_alignment',
	async process(structured, { intent, dir, slug, dateIso }) {
		const checked = validateResearchResult(structured, { denomination: (intent && intent.scope && intent.scope.denomination) || '' });
		if (!checked.ok) {
			return { status: 'invalid', detail: `${checked.errors.length} Verstoß gegen das Recherche-Schema`, errors: checked.errors };
		}
		const asProposal = wantsKnowledgeProposal(intent);
		const markdown = asProposal
			? formatProposalMarkdown(checked.result, intent, dateIso, slug)
			: formatBriefMarkdown(checked.result, intent, dateIso);
		const outputPath = await writeArtifact(outputTargetFor(dir, intent), markdown);
		const outputRel = path.relative(dir, outputPath).split(path.sep).join('/');
		const briefing = buildFollowupBriefing(checked.result, intent, outputRel, asProposal);
		return { status: 'completed-research', detail: briefing, outputPath, outputRel, isProposal: asProposal, briefing };
	},
});

/**
 * Run one research request. Spawns the web-enabled research subagent, validates
 * the brief, writes a draft and (when possible) registers an OWNED job so the
 * Companion receives a follow-up.
 *
 * @param {object} ports
 * @param {object} ports.subagents - ctx.subagents
 * @param {object|undefined} ports.jobs - ctx.jobs (optional)
 * @param {object} ports.researchConfig - resolveResearchConfig() output
 * @param {object} ports.intent - one validated service intent
 * @param {string} ports.dir - Denkraum directory
 * @param {string} ports.slug - Denkraum slug (for labels)
 * @param {object} ports.parentAgent - live Companion agent of the triggering turn
 * @param {Set<string>} ports.childSessionIds - shared spawned-child id set
 * @param {AbortSignal} [ports.signal]
 * @param {(msg: string) => void} [ports.log]
 * @param {(msg: string) => void} [ports.logError]
 * @returns {Promise<object>} outcome record
 */
export async function runResearch(ports) {
	const {
		subagents, jobs, researchConfig, intent, dir, slug,
		parentAgent, childSessionIds, signal, artifacts, toolAllow,
		log = () => {}, logError = () => {},
	} = ports;
	const dateIso = new Date().toISOString().slice(0, 10);
	if (!artifacts || typeof artifacts.persona !== 'string' || typeof artifacts.promptText !== 'string' || !artifacts.outputSchema) {
		return { status: 'failed', detail: 'Capability-Artefakte (Persona/Prompt/Schema) fehlen — nicht aus JS dupliziert, aus der Capability zu laden' };
	}
	const allow = Array.isArray(toolAllow) && toolAllow.length > 0 ? toolAllow : [...researchConfig.allowedTools];

	const doResearch = async (jobSignal) => {
		const request = {
			label: 'pts-steward-research',
			prompt: [{ type: 'text', text: artifacts.promptText }],
			parent: parentAgent,
			signal: jobSignal ?? signal,
			agentOptions: agentOptionsFrom(researchConfig),
			outputSchema: artifacts.outputSchema,
			toolFilter: { allow: [...allow] },
			persona: artifacts.persona,
		};
		const modelRoute = `${researchConfig.provider || 'Eltern-Provider'}/${researchConfig.model || 'Eltern-Modell'}`;
		log(`${slug}: Recherche-Subagent gestartet (${modelRoute}, Werkzeuge: ${allow.join(', ')})`);
		const childRun = await subagents.start('spawn', request);
		if (childSessionIds) childSessionIds.add(childRun.id);
		let result;
		try {
			result = await childRun.result;
		} finally {
			await childRun.dispose().catch(() => {});
			if (childSessionIds) childSessionIds.delete(childRun.id);
		}
		if (result && result.stopReason !== 'completed') {
			const detail = [result.stopReason, result.diagnostic].filter(Boolean).join(': ');
			return { status: result.stopReason === 'aborted' ? 'aborted' : 'failed', detail };
		}
		if (!result || result.structured === undefined || result.structured === null) {
			return { status: 'failed', detail: 'kein strukturiertes Rechercheergebnis erfasst' };
		}
		// The result handler (validate + format + store + follow-up) is selected
		// by the capability's `output_handler`; it is a GENERIC building block,
		// not a per-capability JS route. Default: the curriculum source gate.
		const activeHandler = (ports.handler && typeof ports.handler.process === 'function') ? ports.handler : defaultCurriculumHandler;
		return activeHandler.process(result.structured, { intent, dir, slug, dateIso, schema: artifacts.outputSchema, capability: ports.capability, ptsRoot: ports.ptsRoot });
	};

	// Owned job path: completion produces a Companion follow-up. Falls back to a
	// direct run (draft only, no follow-up) when the jobs registry is unusable.
	const jobsUsable = Boolean(jobs && typeof jobs.start === 'function' && parentAgent);
	if (!jobsUsable) {
		const outcome = await doResearch(signal);
		if (outcome.status === 'completed-research') {
			logError(`${slug}: kein Job-Owner verfügbar — ${outcome.isProposal ? 'Knowledge Proposal' : 'Draft'} gespeichert, aber kein Companion-Follow-up ausgelöst`);
		}
		return outcome;
	}

	let captured = null;
	try {
		const controller = new AbortController();
		if (signal) {
			if (signal.aborted) controller.abort(signal.reason);
			else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
		}
		jobs.start({
			kind: 'pts-steward-research',
			label: `Lehrplan-Prüfung · ${slug}`,
			// OWNED: the shipped reporter injects a follow-up into this session.
			owner: parentAgent,
			outputLimitBytes: 8192,
			run: () => {
				captured = { promise: null, outcome: null };
				captured.promise = doResearch(controller.signal).then((outcome) => {
					captured.outcome = outcome;
					if (outcome.status === 'completed-research') {
						// The follow-up text the Companion receives on completion.
						return { status: 'completed', detail: outcome.briefing };
					}
					if (outcome.status === 'aborted') return { status: 'killed', detail: outcome.detail ?? '' };
					return { status: 'failed', detail: outcome.detail ?? '' };
				});
				return {
					cancel: (reason) => controller.abort(new Error(reason || 'Recherche abgebrochen')),
					done: captured.promise,
				};
			},
		});
		if (!captured) throw new Error('Producer wurde von der Registry nicht gestartet');
		await captured.promise;
		return captured.outcome ?? { status: 'failed', detail: 'Recherche endete ohne Ergebnis' };
	} catch (error) {
		if (captured && captured.outcome) return captured.outcome;
		logError(`${slug}: owned Recherche-Job nicht nutzbar (${String((error && error.message) || error)}) — direkter Lauf ohne Follow-up`);
		return await doResearch(signal);
	}
}
