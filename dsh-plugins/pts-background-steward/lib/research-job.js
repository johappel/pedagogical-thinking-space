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

export const CURRICULUM_BRIEF_SCHEMA_VERSION = 'ptspace.curriculum-alignment-brief/v1';

/** Object-rooted JSON Schema in the dsh-tools enforced subset. */
export const CURRICULUM_BRIEF_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['schema', 'task', 'findings', 'sources', 'uncertainties'],
	properties: {
		schema: { const: CURRICULUM_BRIEF_SCHEMA_VERSION },
		task: { const: 'verify_curriculum_alignment' },
		summary: { type: 'string', description: 'Ein bis zwei Sätze Gesamtbefund, quellenbasiert.' },
		findings: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['denomination', 'alignment', 'statement'],
				properties: {
					denomination: { type: 'string', description: 'z. B. evangelisch, katholisch oder konfessionsübergreifend.' },
					alignment: { enum: ['yes', 'partial', 'no', 'unclear'] },
					competence_areas: { type: 'string', description: 'Relevante Kompetenzbereiche / inhaltliche Schwerpunkte.' },
					statement: { type: 'string', description: 'Kurze quellengebundene Aussage.' },
				},
			},
		},
		sources: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['title', 'official'],
				properties: {
					title: { type: 'string' },
					url: { type: 'string' },
					official: { type: 'boolean' },
					accessed: { type: 'string' },
				},
			},
		},
		uncertainties: { type: 'array', items: { type: 'string' } },
	},
});

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

export function buildResearcherPersona() {
	return [
		'Du bist ein quellengebundener Recherche-Subagent im Pedagogical Thinking Space.',
		'Dein einziger Auftrag ist eine begrenzte Lehrplan-Zuordnung: prüfe anhand offizieller Quellen, ob ein Thema plausibel zu Jurisdiktion, Fach, Schulphase und Jahrgang passt.',
		'Regeln:',
		'- Nutze zuerst offizielle Quellen (Kernlehrpläne, Bildungspläne, Ministerien, Landesinstitute). Belege jede Aussage mit einer identifizierbaren Quelle.',
		'- Triff KEINE pädagogische Entscheidung und gib keine Richtungs-, Methoden- oder Werteempfehlung.',
		'- Produziere KEIN Unterrichtsmaterial und vergleiche keine pädagogischen Ansätze.',
		'- Übertrage KEINE personenbezogenen Daten; nutze nur öffentliche, nicht personenbezogene Quellen.',
		'- Erfinde nichts. Wenn eine Quelle fehlt, benenne die Unsicherheit ausdrücklich.',
		'- Ist die Konfession unbekannt, prüfe evangelische UND katholische Religionslehre und berichte beide getrennt.',
		'Antworte auf Deutsch. Beende deinen Lauf, indem du GENAU EINMAL das Tool structured_output mit dem curriculum_alignment_brief aufrufst.',
	].join('\n');
}

export function buildResearchPrompt(intent) {
	const s = (intent && intent.scope) || {};
	const denom = String(s.denomination ?? '').trim().toLowerCase();
	const denomKnown = denom !== '' && denom !== 'unknown' && denom !== 'unbekannt';
	const denomLine = denomKnown
		? `- Konfession: ${s.denomination}`
		: '- Konfession: unbekannt — prüfe evangelische UND katholische Religionslehre und berichte beide getrennt. Das Fehlen der Konfession darf die Prüfung nicht blockieren.';
	return `# Rechercheauftrag: Lehrplan-Zuordnung (quellengebunden)

Prüfe anhand offizieller Quellen, ob das folgende Thema plausibel in den angegebenen Rahmen passt.

## Rahmen
- Jurisdiktion: ${s.jurisdiction ?? '(fehlt)'}
- Fach: ${s.subject ?? '(fehlt)'}
- Schulphase: ${s.phase ?? '(fehlt)'}
- Jahrgang: ${s.grade ?? '(fehlt)'}
- Thema: ${s.topic ?? '(fehlt)'}
${denomLine}

## Begründung des Bedarfs
${intent?.reason ?? '(keine angegeben)'}

## Regeln für dein Ergebnis
1. Rufe am Ende GENAU EINMAL \`structured_output\` mit dem curriculum_alignment_brief auf. Kein freier Schlusssatz.
2. \`findings\`: je geprüfter Konfession/Schiene ein Eintrag mit \`alignment\` (yes | partial | no | unclear), relevanten Kompetenzbereichen/inhaltlichen Schwerpunkten und einer kurzen quellengebundenen Aussage.
3. \`sources\`: jede Quelle mit Titel, ob offiziell (\`official\`), möglichst URL und Zugriffsdatum. Offizielle Quellen zuerst.
4. \`uncertainties\`: was du aus offiziellen Quellen NICHT belegen konntest.
5. Keine pädagogische Entscheidung, kein Material, kein Ansatzvergleich.`;
}

function isPlainObject(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validate one captured curriculum_alignment_brief. Independent of any provider
 * enforcement: at least one source-grounded finding and one cited source.
 * @returns {{ ok: true, result: object } | { ok: false, errors: string[] }}
 */
export function validateResearchResult(structured) {
	const errors = [];
	if (!isPlainObject(structured)) return { ok: false, errors: ['result ist kein Objekt'] };
	const r = structured;
	if (r.schema !== CURRICULUM_BRIEF_SCHEMA_VERSION) errors.push(`schema muss "${CURRICULUM_BRIEF_SCHEMA_VERSION}" sein`);
	if (r.task !== 'verify_curriculum_alignment') errors.push('task muss verify_curriculum_alignment sein');
	if (!Array.isArray(r.findings) || r.findings.length === 0) errors.push('findings fehlt oder ist leer');
	else {
		r.findings.forEach((f, i) => {
			if (!isPlainObject(f)) { errors.push(`findings[${i + 1}] ist kein Objekt`); return; }
			if (typeof f.denomination !== 'string' || f.denomination.trim() === '') errors.push(`findings[${i + 1}].denomination fehlt`);
			if (!['yes', 'partial', 'no', 'unclear'].includes(f.alignment)) errors.push(`findings[${i + 1}].alignment unzulässig`);
			if (typeof f.statement !== 'string' || f.statement.trim() === '') errors.push(`findings[${i + 1}].statement fehlt`);
		});
	}
	if (!Array.isArray(r.sources) || r.sources.length === 0) errors.push('sources fehlt oder ist leer (Recherche muss belegt sein)');
	else {
		r.sources.forEach((s, i) => {
			if (!isPlainObject(s)) { errors.push(`sources[${i + 1}] ist kein Objekt`); return; }
			if (typeof s.title !== 'string' || s.title.trim() === '') errors.push(`sources[${i + 1}].title fehlt`);
		});
	}
	if (!Array.isArray(r.uncertainties)) errors.push('uncertainties muss ein Array sein');
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, result: r };
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
	lines.push('## Befunde');
	for (const f of result.findings) {
		lines.push(`### ${f.denomination} — ${f.alignment}`);
		if (f.competence_areas) lines.push(`- Kompetenzbereiche / Schwerpunkte: ${f.competence_areas}`);
		lines.push(`- ${f.statement}`);
		lines.push('');
	}
	lines.push('## Quellen');
	for (const src of result.sources) {
		const mark = src.official ? 'offiziell' : 'weitere';
		const url = src.url ? ` — ${src.url}` : '';
		const accessed = src.accessed ? ` (Zugriff: ${src.accessed})` : '';
		lines.push(`- [${mark}] ${src.title}${url}${accessed}`);
	}
	lines.push('');
	lines.push('## Unsicherheiten');
	if (result.uncertainties.length === 0) lines.push('- keine benannt');
	else for (const u of result.uncertainties) lines.push(`- ${u}`);
	lines.push('');
	return lines.join('\n');
}

/**
 * Build the concise internal follow-up briefing for the Companion. This is NOT
 * the raw worker answer: it instructs the Companion to phrase one short,
 * source-based contribution and points to the full draft.
 */
export function buildFollowupBriefing(result, intent, draftRel) {
	const s = (intent && intent.scope) || {};
	const findings = result.findings
		.map((f) => `${f.denomination}: ${f.alignment}${f.competence_areas ? ` (${f.competence_areas})` : ''}`)
		.join('; ');
	const officialSources = result.sources.filter((x) => x.official).map((x) => x.title);
	const sourceList = (officialSources.length > 0 ? officialSources : result.sources.map((x) => x.title)).slice(0, 3).join('; ');
	return [
		'INTERNE NOTIZ (nicht wörtlich zeigen, keine Roh-Ausgabe einfügen):',
		`Die im Hintergrund angestoßene Lehrplan-Prüfung (${s.subject ?? ''} · ${s.jurisdiction ?? ''} · Jahrgang ${s.grade ?? ''} · Thema „${s.topic ?? ''}“) ist abgeschlossen.`,
		`Kurzbefund: ${findings || '—'}.`,
		`Offizielle Quellen: ${sourceList || '—'}.`,
		result.uncertainties.length > 0 ? `Offene Unsicherheiten: ${result.uncertainties.slice(0, 2).join('; ')}.` : '',
		`Vollständiger Befund als Draft: ${draftRel}.`,
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

async function writeDraft(dir, intent, markdown) {
	const target = draftPathFor(dir, intent);
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
		parentAgent, childSessionIds, signal,
		log = () => {}, logError = () => {},
	} = ports;
	const dateIso = new Date().toISOString().slice(0, 10);

	const doResearch = async (jobSignal) => {
		const request = {
			label: 'pts-steward-research',
			prompt: [{ type: 'text', text: buildResearchPrompt(intent) }],
			parent: parentAgent,
			signal: jobSignal ?? signal,
			agentOptions: agentOptionsFrom(researchConfig),
			outputSchema: CURRICULUM_BRIEF_SCHEMA,
			toolFilter: { allow: [...researchConfig.allowedTools] },
			persona: buildResearcherPersona(),
		};
		const modelRoute = `${researchConfig.provider || 'Eltern-Provider'}/${researchConfig.model || 'Eltern-Modell'}`;
		log(`${slug}: Recherche-Subagent gestartet (${modelRoute}, Werkzeuge: ${researchConfig.allowedTools.join(', ')})`);
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
		const checked = validateResearchResult(result.structured);
		if (!checked.ok) {
			logError(`${slug}: Rechercheergebnis verworfen:\n- ${checked.errors.join('\n- ')}`);
			return { status: 'invalid', detail: `${checked.errors.length} Verstoß gegen das Recherche-Schema`, errors: checked.errors };
		}
		const markdown = formatBriefMarkdown(checked.result, intent, dateIso);
		const draftPath = await writeDraft(dir, intent, markdown);
		const draftRel = path.relative(dir, draftPath).split(path.sep).join('/');
		const briefing = buildFollowupBriefing(checked.result, intent, draftRel);
		log(`${slug}: Lehrplan-Recherche abgeschlossen → Draft ${draftRel}`);
		return { status: 'completed-research', detail: briefing, draftPath, briefing };
	};

	// Owned job path: completion produces a Companion follow-up. Falls back to a
	// direct run (draft only, no follow-up) when the jobs registry is unusable.
	const jobsUsable = Boolean(jobs && typeof jobs.start === 'function' && parentAgent);
	if (!jobsUsable) {
		const outcome = await doResearch(signal);
		if (outcome.status === 'completed-research') {
			logError(`${slug}: kein Job-Owner verfügbar — Draft gespeichert, aber kein Companion-Follow-up ausgelöst`);
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
