// Tests for pts-background-steward/lib/research-job.js — schema subset,
// result validation, dedup keying, prompt shaping and brief formatting.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	CURRICULUM_BRIEF_SCHEMA_VERSION,
	validateResearchResult,
	scopeKey,
	formatBriefMarkdown,
	formatProposalMarkdown,
	buildFollowupBriefing,
	draftPathFor,
	proposalPathFor,
	outputTargetFor,
	wantsKnowledgeProposal,
	isVerifyingSource,
	evaluateSourceStatus,
} from '../lib/research-job.js';

const intent = {
	task: 'verify_curriculum_alignment',
	reason: 'Passt das Thema in Jahrgang 11?',
	authorization: { type: 'implied_bounded_request', evidence: 'm2' },
	scope: { jurisdiction: 'NRW', subject: 'Religionslehre', phase: 'gymnasiale Oberstufe', grade: '11', topic: 'Utopie und Hoffnung', denomination: 'unknown' },
	return_to: 'critical_friend',
};

function validBrief(overrides = {}) {
	return {
		schema: CURRICULUM_BRIEF_SCHEMA_VERSION,
		task: 'verify_curriculum_alignment',
		summary: 'Das Thema ist in beiden Konfessionen anschlussfähig.',
		findings: [
			{ denomination: 'evangelisch', alignment: 'yes', competence_areas: 'Hoffnung/Eschatologie', statement: 'Passt zum inhaltlichen Schwerpunkt.', source_ids: ['s1'] },
			{ denomination: 'katholisch', alignment: 'partial', statement: 'Teilweise abgedeckt.', source_ids: ['s1'] },
		],
		sources: [
			{ id: 's1', title: 'Kernlehrplan Religionslehre NRW (SII)', publisher: 'MSB NRW', url: 'https://example.gov', official: true, accessed: '2026-08-27', version_date: '2014', validity: 'current', locus: 'Inhaltsfeld 6, S. 27' },
		],
		uncertainties: ['Konkrete Jahrgangszuordnung schulintern.'],
		...overrides,
	};
}

test('CURRICULUM_BRIEF_SCHEMA_VERSION ist v2', () => {
	assert.equal(CURRICULUM_BRIEF_SCHEMA_VERSION, 'ptspace.curriculum-alignment-brief/v2');
});

test('vollständiger Brief besteht', () => {
	const r = validateResearchResult(validBrief());
	assert.equal(r.ok, true);
});

test('Brief ohne Quelle wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({ sources: [] }));
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('sources')));
});

test('Brief ohne Befund wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({ findings: [] }));
	assert.equal(r.ok, false);
});

test('falsche Schema-Version wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({ schema: 'x/v9' }));
	assert.equal(r.ok, false);
});

test('scopeKey ist stabil und scope-abhängig (Dedup-Basis)', () => {
	const a = scopeKey(intent);
	const b = scopeKey({ ...intent, scope: { ...intent.scope } });
	assert.equal(a, b);
	const c = scopeKey({ ...intent, scope: { ...intent.scope, grade: '12' } });
	assert.notEqual(a, c);
});

test('Brief-Markdown ist ein Draft mit Quellen', () => {
	const md = formatBriefMarkdown(validBrief(), intent, '2026-08-27');
	assert.match(md, /Status: draft/);
	assert.match(md, /## Quellen/);
	assert.match(md, /Kernlehrplan Religionslehre NRW/);
});

test('Follow-up-Briefing ist eine interne Notiz, keine Roh-Ausgabe', () => {
	const briefing = buildFollowupBriefing(validBrief(), intent, 'drafts/curriculum-alignment-abc.md');
	assert.match(briefing, /INTERNE NOTIZ/);
	assert.match(briefing, /kurzen, quellenbasierten Anschlussbeitrag/);
	assert.match(briefing, /keine erneute allgemeine Recherche-Erlaubnisfrage/);
});

// ——— Speicherziel: Draft vs. Knowledge Proposal ———

const proposalIntent = {
	...intent,
	expected_output: { type: 'knowledge_proposal', location: 'knowledge-proposals/' },
};

test('wantsKnowledgeProposal unterscheidet Draft und Proposal', () => {
	assert.equal(wantsKnowledgeProposal(intent), false);
	assert.equal(wantsKnowledgeProposal(proposalIntent), true);
});

test('outputTargetFor wählt drafts/ bzw. knowledge-proposals/', () => {
	assert.equal(outputTargetFor('/d', intent), draftPathFor('/d', intent));
	const target = outputTargetFor('/d', proposalIntent);
	assert.equal(target, proposalPathFor('/d', proposalIntent));
	assert.match(target.split(/[\\/]/).join('/'), /knowledge-proposals\//);
});

test('formatProposalMarkdown erzeugt OKF-Frontmatter und trennt Quellen/Interpretation/Unsicherheit', () => {
	const md = formatProposalMarkdown(validBrief(), proposalIntent, '2026-08-27', 'testraum');
	assert.match(md, /^---\n/);
	assert.match(md, /\ntype: Knowledge Proposal\n/);
	assert.match(md, /\nstatus: proposal\n/);
	assert.match(md, /\nsource_status: /);
	assert.match(md, /\nsuggested_location: /);
	assert.match(md, /# Verified Sources/);
	assert.match(md, /# Source Candidates/);
	assert.match(md, /# Interpretation/);
	assert.match(md, /# Uncertainty/);
	assert.match(md, /Noch nicht kuratiert/);
	// Kein direktes Schreiben in kuratiertes knowledge/: nur als Vorschlag.
	assert.match(md, /Kernlehrplan Religionslehre NRW/);
});

test('Follow-up-Briefing kennzeichnet ein Proposal als noch nicht kuratiert', () => {
	const briefing = buildFollowupBriefing(validBrief(), proposalIntent, 'knowledge-proposals/curriculum-alignment-abc.md', true);
	assert.match(briefing, /Knowledge Proposal/);
	assert.match(briefing, /noch nicht kuratiert/);
	assert.match(briefing, /späterer, getrennter Schritt/);
});

// ——— Quellenqualitäts-/Gültigkeits-Gate (verhindert den "Lehrplan-von-1999"-Fehler) ———

test('vollständig belegter aktueller offizieller Befund ist verified', () => {
	const gate = evaluateSourceStatus(validBrief());
	assert.equal(gate.status, 'verified');
});

test('eine ausschließlich archivierte Quelle führt nicht zu verified', () => {
	const brief = validBrief({
		sources: [{ id: 's1', title: 'Alter Lehrplan 1999', publisher: 'MSW NRW', url: 'https://example.gov/1999', official: true, accessed: '2026-08-27', version_date: '1999', validity: 'archived', locus: 'S. 5' }],
	});
	assert.equal(isVerifyingSource(brief.sources[0]), false);
	assert.notEqual(evaluateSourceStatus(brief).status, 'verified');
});

test('eine abgelöste Quelle ohne Nachfolger wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({
		sources: [{ id: 's1', title: 'X', publisher: 'Y', url: 'https://x', official: true, accessed: '2026-08-27', version_date: '2005', validity: 'superseded', locus: 'S. 1' }],
	}));
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('Nachfolgedokument')));
});

test('fehlende Fundstelle verhindert verified (keine aktuelle offizielle Quelle vollständig nachgewiesen)', () => {
	const brief = validBrief({
		sources: [{ id: 's1', title: 'KLP', publisher: 'MSB', url: 'https://x', official: true, accessed: '2026-08-27', version_date: '2014', validity: 'current' }],
	});
	assert.equal(isVerifyingSource(brief.sources[0]), false);
	assert.notEqual(evaluateSourceStatus(brief).status, 'verified');
});

test('validateResearchResult: unbekannte Konfession verlangt evangelisch UND katholisch als getrennte Befunde', () => {
	const onlyEv = validBrief({
		findings: [{ denomination: 'evangelisch', alignment: 'yes', statement: 'ok', source_ids: ['s1'] }],
	});
	const r = validateResearchResult(onlyEv, { denomination: 'unknown' });
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('katholischer Befund fehlt')));
});

test('validateResearchResult: v2 liefert geprüften source_status', () => {
	const r = validateResearchResult(validBrief(), { denomination: 'unknown' });
	assert.equal(r.ok, true);
	assert.equal(r.source_status, 'verified');
});

test('validateResearchResult: source_ids auf unbekannte Quelle wird abgelehnt', () => {
	const r = validateResearchResult(validBrief({
		findings: [{ denomination: 'evangelisch', alignment: 'yes', statement: 'ok', source_ids: ['sX'] }, { denomination: 'katholisch', alignment: 'partial', statement: 'ok', source_ids: ['s1'] }],
	}), { denomination: 'unknown' });
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes('unbekannte Quelle')));
});

