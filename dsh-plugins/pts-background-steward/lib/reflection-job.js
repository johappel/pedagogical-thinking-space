// pts-background-steward — one background reflection run.
//
// Flow (never on the visible conversation path):
//   1. snapshot base hashes of the canonical files;
//   2. build the steward task prompt (metadata, file states, dialogue window);
//   3. optionally register a native DSH job (kind `pts-steward`, unowned —
//      unowned jobs create NO completion notices in any conversation);
//   4. start a native in-process spawn subagent with its own model target,
//      steward persona, read-only tool allowlist and structured output;
//   5. validate the captured result against run expectations + policy;
//   6. re-check the base hashes; discard stale results;
//   7. apply surviving operations atomically.
//
// Every failure mode resolves into an outcome record; nothing here may throw
// into the caller or touch the companion conversation.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
	snapshotHashes,
	readCanonicalFiles,
	applyOperations,
	makeIdFactory,
	atomicWrite,
} from './workspace-state.js';
import { STEWARDSHIP_RESULT_SCHEMA, validateResult } from './patch-validator.js';

export function buildStewardPersona() {
	return [
		'Du bist der Hintergrund-Steward eines pädagogischen Denkraums im Pedagogical Thinking Space.',
		'Du bist unsichtbar: Du hast keinen Nutzerkontakt und trittst nie im Gespräch der Lehrkraft auf.',
		'Dein Auftrag ist reversible Denkstandspflege: du dokumentierst den aktuellen Stand des gemeinsamen Nachdenkens, entscheidest aber nichts.',
		'Grenzen:',
		'- Du triffst KEINE pädagogischen Entscheidungen und formulierst keine Empfehlungen über die pädagogische Richtung.',
		'- decisions.yml wird nur verändert, wenn die Lehrkraft eine Entscheidung eindeutig und erkennbar getroffen hat; sonst unterbleibt der Eintrag.',
		'- Lernmomente werden ausschließlich als vollständige Entwürfe mit Status draft erfasst; stable vergibst du nie.',
		'- temporal-plan.yml ist für dich tabu; bindende zeitliche Platzierungen brauchen die Lehrkraft.',
		'- Du produzierst keine Unterrichtsmaterialien und schreibst nichts in Memory oder kuratiertes Wissen.',
		'- Du recherchierst NIEMALS selbst und führst keine Worker oder Dienste aus.',
		'- Fehlt nach dem Gesprächsschritt geprüftes externes Wissen (z. B. eine Lehrplan-Zuordnung), darfst du GENAU EINEN begrenzten, quellengebundenen Knowledge-Request als service_intents-Eintrag vorschlagen. Ein getrennter Recherche-Subagent führt ihn aus, nicht du. Nur quellengebundenes Wissen, keine pädagogische Entscheidung, kein Material.',
		'- Du schreibst NICHT selbst Dateien; du lieferst ausschließlich dein strukturiertes Ergebnis zurück. Die Anwendung prüft es und wendet es an.',
		'- Halte Beobachtung, wiedergegebene Aussage, Deutung, Hypothese und offene Frage begrifflich auseinander.',
		'Antworte auf Deutsch. Beende deinen Lauf, indem du genau einmal das Tool structured_output mit deinem Ergebnis aufrufst.',
	].join('\n');
}

function fence(name) {
	return name.endsWith('.md') ? 'markdown' : 'yaml';
}

function formatDialogue(dialogue) {
	return dialogue
		.map((m) => `${m.id} | ${m.role === 'user' ? 'Lehrkraft' : 'Begleiter'} | ${String(m.text).replaceAll('\n', ' ⏎ ')}`)
		.join('\n');
}

export function buildTaskPrompt(task) {
	const { dir, sessionId, turn, hashes, files, dialogue } = task;
	const hashLines = Object.entries(hashes)
		.map(([name, h]) => `- ${name}: ${h ?? '(nicht vorhanden)'}`)
		.join('\n');
	const fileBlocks = files
		.map((f) => (f.content === null
			? `### ${f.name}\n\n(nicht vorhanden)`
			: `### ${f.name}${f.truncated ? ' (gekürzt)' : ''}\n\n\`\`\`${fence(f.name)}\n${f.content}\n\`\`\``))
		.join('\n\n');
	const dialogueText = dialogue.length > 0 ? formatDialogue(dialogue) : '(kein Gesprächsausschnitt verfügbar)';

	return `# Hintergrund-Auftrag: Denkstandspflege

Arbeitsverzeichnis (Denkraum): ${dir}
Session-ID des auslösenden Gesprächs: ${sessionId}
Turn-Nummer des auslösenden Gesprächs: ${turn}

## Basis-Hashes (unverändert in dein Ergebnis übernehmen)

${hashLines}

## Aktueller Stand der kanonischen Dateien

${fileBlocks}

## Gesprächsausschnitt (aufgelistet vom ältesten zum neuesten Beitrag)

${dialogueText}

## Regeln für dein Ergebnis

1. Rufe am Ende GENAU EINMAL \`structured_output\` auf; nur dieser Aufruf ist dein Ergebnis. Kein freier Schlusssatz.
2. Übernimm \`schema\`, \`session_id\`, \`turn\` und \`base\` unverändert aus diesem Auftrag.
3. \`observations\`: halte fest, was im Ausschnitt erkennbar ist (Aussagen der Lehrkraft, offene Fragen, Hypothesen, Widersprüche, Fokuswechsel). Jede Beobachtung braucht \`evidence\` (eine Nachrichten-ID wie m3, oder "context") und kurzen \`content\`. Erfinde nichts.
4. \`operations\`: schlage nur Änderungen vor, die den bereits erkennbaren Stand dokumentieren — keine neuen pädagogischen Entscheidungen, keine Materialproduktion.
   - learning-design.md: \`set-section\` oder \`append-under-section\` (z. B. Context, Current Status, Open Questions, Learning Journey). Absätze sachlich, knapp, ohne Entscheidungssprache.
   - learning-landscape.md: nur \`add-draft-moment\`, und nur wenn ALLE Pflichtfelder eines vollständigen Entwurfs belastbar aus dem Gespräch belegbar sind (Titel, Typ, Funktion, Lernaktivität, Erwartete Lernerfahrung). Sonst unterlassen.
   - decisions.yml: nur \`add-decision\`, wenn die Lehrkraft sich eindeutig entschieden hat UND du das Feld \`teacher_decisions\` mit \`explicit: true\` und passender Evidence füllst. Im Zweifel: unterlassen.
   - planning-board.yml: höchstens ein \`propose-board-item\` pro Lauf; der Eintrag wird mit Status "proposed" und Spalte "clarify" angelegt. Nur wenn echte Klärungsarbeit sichtbar wurde.
   - temporal-plan.yml: niemals als Ziel.
5. Leere \`operations\` sind ausdrücklich erlaubt und oft richtig (z. B. nach reinen Begrüßungen).
6. \`next_turn_hint\`: höchstens eine offene Frage, die sich aus dem Gespräch ergibt — oder null. Die Frage ist ein Angebot an den Begleiter, keine Vorgabe.
7. \`forbidden_effects\`: liste hier auf, was du bewusst NICHT getan hast (z. B. "keine Entscheidung erkannt").
8. \`service_intents\`: normalerweise leer. Nur wenn nach diesem Gesprächsschritt geprüftes externes Wissen fehlt (z. B. ob ein Thema in einen Lehrplan/Jahrgang passt) und die Lehrkraft selbst danach fragt, schlage GENAU EINEN begrenzten, quellengebundenen Request vor:
   - \`task\`: \`verify_curriculum_alignment\` (derzeit einzige erlaubte Aufgabe).
   - \`authorization\`: \`{ type: implied_bounded_request, evidence: <Nachrichten-ID der Lehrkraft> }\`. Die Evidence MUSS eine Nachricht der Lehrkraft sein (nicht "context").
   - \`scope\`: nur öffentliche, nicht personenbezogene Felder — \`jurisdiction\`, \`subject\`, \`phase\`, \`grade\`, \`topic\` (Pflicht) und optional \`denomination\` (bei Unklarheit "unknown"; das blockiert die Prüfung nicht).
   - \`return_to\`: \`critical_friend\`.
   - Kein Vergleich pädagogischer Ansätze, keine Entscheidung, kein Material. Im Zweifel: leer lassen.
9. Bleibe beim Wortlaut der Lehrkraft, wo sie selbst Formulierungen genutzt hat; kennzeichne Deutungen deutlich als solche.`;
}

function agentOptionsFrom(config) {
	const options = {};
	if (config.provider) options.provider = config.provider;
	if (config.model) options.model = config.model;
	if (config.maxTokens > 0) options.maxTokens = config.maxTokens;
	return Object.keys(options).length > 0 ? options : undefined;
}

/**
 * Combine the fiber-owned abort signal with the per-run timeout controller:
 * aborting either aborts the run; listeners are removed afterwards.
 */
function linkSignals(externalSignal, controller) {
	if (!externalSignal) return () => {};
	if (externalSignal.aborted) {
		controller.abort(externalSignal.reason);
		return () => {};
	}
	const onAbort = () => controller.abort(externalSignal.reason);
	externalSignal.addEventListener('abort', onAbort, { once: true });
	return () => externalSignal.removeEventListener('abort', onAbort);
}

/** Map a steward outcome onto the native JobOutcome vocabulary. */
function toJobOutcome(outcome) {
	switch (outcome?.status) {
		case 'applied':
		case 'no-change':
		case 'skipped':
		case 'invalid':
		case 'stale':
			return { status: 'completed', detail: `${outcome.status}: ${outcome.detail ?? ''}`.trim() };
		case 'aborted':
			return { status: 'killed', detail: outcome.detail ?? '' };
		default:
			return { status: 'failed', detail: outcome?.detail ?? '' };
	}
}

/**
 * Create the reflection runner used by the scheduler.
 * @param {object} ports
 * @param {object} ports.subagents - ctx.subagents (SubagentRuntime)
 * @param {object|undefined} ports.jobs - ctx.jobs (optional)
 * @param {object} ports.config - normalized plugin config
 * @param {(msg: string) => void} [ports.log]
 * @param {(msg: string) => void} [ports.logError]
 * @param {AbortSignal} [ports.externalSignal] - fiber-owned cancellation
 */
export function createReflectionRunner({
	subagents,
	jobs,
	config,
	log = () => {},
	logError = () => {},
	externalSignal,
}) {
	async function reflectOnce(job) {
		const { key, dir, sessionId, turn, dialogue, messageIds, userMessageIds } = job;
		// Effective model target resolved per job (settings block > patch row).
		// reasoningEffort is deliberately NOT passed: the one-shot seam cannot
		// route it to the child, so the child always runs with provider default.
		const modelConfig = job.modelConfig ?? config;
		const modelRoute = `${modelConfig.provider || 'Eltern-Provider'}/${modelConfig.model || 'Eltern-Modell'}`;

		// 1. Base snapshot — the revision anchor of this whole run.
		const hashes = await snapshotHashes(dir);
		if (hashes['learning-design.md'] === null && hashes['learning-landscape.md'] === null) {
			return { status: 'skipped', detail: 'kein Denkraum (learning-design.md und learning-landscape.md fehlen)' };
		}

		// 2. Prompt material (truncated copies for context only).
		const files = await readCanonicalFiles(dir, config.maxFileChars);
		const prompt = buildTaskPrompt({ dir, sessionId, turn, hashes, files, dialogue });

		// 3+4. Native one-shot child through the spawn provider.
		const request = {
			label: 'pts-background-steward',
			prompt: [{ type: 'text', text: prompt }],
			parent: job.parentAgent,
			signal: job.controller.signal,
			agentOptions: agentOptionsFrom(modelConfig),
			outputSchema: STEWARDSHIP_RESULT_SCHEMA,
			toolFilter: { allow: [...config.allowedTools] },
			persona: buildStewardPersona(),
		};
		log(`${key}: Hintergrund-Steward gestartet (${modelRoute})`);
		const childRun = await subagents.start(config.providerName || 'spawn', request);
		job.childSessionIds.add(childRun.id);
		let result;
		try {
			result = await childRun.result;
		} finally {
			await childRun.dispose().catch(() => {});
			job.childSessionIds.delete(childRun.id);
		}
		if (result && result.stopReason !== 'completed') {
			const detail = [result.stopReason, result.diagnostic].filter(Boolean).join(': ');
			return { status: result.stopReason === 'aborted' ? 'aborted' : 'failed', detail };
		}
		if (!result || result.structured === undefined || result.structured === null) {
			return { status: 'failed', detail: 'kein strukturiertes Ergebnis erfasst' };
		}

		// 5. Validate against expectations + policy.
		const checked = validateResult(result.structured, { sessionId, turn, hashes, messageIds, userMessageIds });
		if (!checked.ok) {
			logError(`${key}: Ergebnis verworfen — Validierung fehlgeschlagen:\n- ${checked.errors.join('\n- ')}`);
			return { status: 'invalid', detail: `${checked.errors.length} Verstoß/Vorstöße gegen Schema oder Politik`, errors: checked.errors };
		}
		const value = checked.result;
		// Validated bounded knowledge-request intents (usually none). These are
		// surfaced to the coordinator only after the revision re-check passes.
		const serviceIntents = Array.isArray(value.service_intents) ? value.service_intents : [];

		// 6. Revision check immediately before applying.
		const freshHashes = await snapshotHashes(dir);
		for (const name of Object.keys(hashes)) {
			if (freshHashes[name] !== hashes[name]) {
				return { status: 'stale', detail: `${name} hat sich während des Laufs geändert — Ergebnis verworfen` };
			}
		}

		if (!Array.isArray(value.operations) || value.operations.length === 0) {
			return { status: 'no-change', detail: 'keine Operationen vorgeschlagen', hint: value.next_turn_hint ?? null, serviceIntents };
		}

		// 7. Apply atomically against CURRENT uncapped contents.
		const dateIso = new Date().toISOString().slice(0, 10);
		const makeId = makeIdFactory(dateIso);
		const baseFiles = new Map();
		for (const name of Object.keys(freshHashes)) {
			try {
				baseFiles.set(name, await fsp.readFile(path.join(dir, name), 'utf8'));
			} catch {
				baseFiles.set(name, null);
			}
		}
		const { updates, applied, rejected } = applyOperations(baseFiles, value.operations, {
			dateIso,
			makeId,
			turnRef: `Turn ${turn}`,
		});
		for (const r of rejected) {
			logError(`${key}: Operation abgelehnt (${r.reason}): ${JSON.stringify(r.op).slice(0, 240)}`);
		}
		if (updates.size === 0) {
			return { status: 'no-change', detail: `alle ${rejected.length} Vorschläge von der Politik abgelehnt`, hint: value.next_turn_hint ?? null, serviceIntents };
		}
		for (const [name, content] of updates) {
			await atomicWrite(dir, name, content);
		}
		const summary = applied.map((a) => `${a.target}:${a.kind}${a.section ? `(${a.section})` : ''}`).join(', ');
		log(`${key}: ${applied.length} Operation(en) übernommen → ${summary}`);
		if (Array.isArray(value.forbidden_effects) && value.forbidden_effects.length > 0) {
			log(`${key}: laut Steward unterlassen: ${value.forbidden_effects.join('; ')}`);
		}
		return { status: 'applied', detail: summary, applied, rejectedCount: rejected.length, hint: value.next_turn_hint ?? null, serviceIntents };
	}

	return async function runReflection(job) {
		const { key } = job;
		job.controller = new AbortController();
		job.childSessionIds = job.childSessionIds ?? new Set();
		const unlinkExternal = linkSignals(externalSignal, job.controller);
		const timeout = setTimeout(
			() => job.controller.abort(new Error(`Timeout nach ${config.runTimeoutMs} ms`)),
			config.runTimeoutMs,
		);

		const executeOnce = async () => {
			try {
				return await reflectOnce(job);
			} catch (error) {
				if (job.controller.signal.aborted) {
					return { status: 'aborted', detail: String((error && error.message) || error) };
				}
				logError(`${key}: Hintergrundlauf fehlgeschlagen (betrifft nur den Steward-Job): ${String((error && error.stack) || error)}`);
				return { status: 'failed', detail: String((error && error.message) || error) };
			}
		};

		try {
			const jobsUsable = Boolean(jobs && typeof jobs.start === 'function');
			if (!jobsUsable) return await executeOnce();

			// Native job registration. The producer captures the single
			// execution; runReflection awaits exactly that one execution.
			let captured = null;
			try {
				const jobId = jobs.start({
					kind: 'pts-steward',
					label: `Denkstand-Pflege · ${path.basename(job.dir)}`,
					outputLimitBytes: 4096,
					run: () => {
						captured = { promise: null, outcome: null };
						captured.promise = executeOnce().then((outcome) => {
							captured.outcome = outcome;
							return toJobOutcome(outcome);
						});
						return {
							cancel: (reason) => job.controller.abort(new Error(reason || 'Job abgebrochen')),
							done: captured.promise,
						};
					},
				});
				job.jobId = jobId;
				if (!captured) throw new Error('Producer wurde von der Registry nicht gestartet');
				await captured.promise;
				return captured.outcome ?? { status: 'failed', detail: 'Steward-Job endete ohne Ergebnis' };
			} catch (error) {
				if (!captured) {
					// No controller serves this owner or registry unavailable:
					// the steward never depends on job tooling — run directly.
					log(`${key}: Job-Registry nicht nutzbar (${String((error && error.message) || error)}) — direkter Lauf`);
					return await executeOnce();
				}
				if (captured.outcome) return captured.outcome;
				logError(`${key}: registrierter Steward-Job brach vorzeitig ab: ${String((error && error.message) || error)}`);
				return { status: 'failed', detail: String((error && error.message) || error) };
			}
		} finally {
			clearTimeout(timeout);
			unlinkExternal();
		}
	};
}
