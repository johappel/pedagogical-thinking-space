# Knowledge Capability: Verify Curriculum Alignment

- **Capability id:** `verify_curriculum_alignment`
- **Service:** `knowledge`
- **Mode:** `research`
- **Status:** `executable`
- **Result schema:** `ptspace.curriculum-alignment-brief/v2`

> Resolved through `capabilities/registry.yml` from the PTS root — never by
> searching a Denkraum. The registry is the single routing source.

## Capability id

`verify_curriculum_alignment`

## Service

`knowledge` (mode `research`)

## Purpose

Check, against official curriculum sources, whether a topic plausibly fits a
given jurisdiction, subject, school phase and grade.

This capability is **source-grounded knowledge**, not a comparison of
pedagogical approaches. It never decides pedagogical direction and never
produces teaching material. Use `capabilities/workers/RESEARCH_PEDAGOGICAL_ALTERNATIVES.md`
for pedagogical contrast; do not use it here.

## Allowed tasks

The research subagent may:

- consult official curriculum sources (Kernlehrpläne, Bildungspläne, ministry
  or state institute publications) first;
- state whether the topic plausibly aligns with the given phase and grade;
- name the relevant competence areas, subject fields or inhaltliche Schwerpunkte;
- when the denomination is unknown, check evangelische **and** katholische
  Religionslehre and report both;
- report source quality, provenance, access path and uncertainty;
- cite every claim with an identifiable source.

## Forbidden tasks

The research subagent must not:

- decide the pedagogical direction or recommend goals, methods or values;
- produce worksheets, activities, assessments or any teaching material;
- compare pedagogical approaches (that is a Worker capability);
- transmit personal or case-specific data about learners;
- invent curriculum claims or cite sources it did not consult;
- write into curated Knowledge;
- change the Learning Design or Learning Landscape.

## Authorization

This capability runs under one of:

- `board_item`
- `bounded_session`
- `implied_bounded_request`

`implied_bounded_request` is valid only when the teacher's own question requires
checked, public, non-personal external knowledge within a tightly bounded scope
and no pedagogical decision or material is produced. A missing denomination is a
follow-up detail and must **not** block the first check.

## Required input

```yaml
service: knowledge
mode: research
task: verify_curriculum_alignment
input:
  jurisdiction: NRW
  subject: Religionslehre
  phase: gymnasiale Oberstufe
  grade: 11
  denomination: unknown
  topic: Utopie und Hoffnung
source_requirements:
  official_sources_first: true
  citations_required: true
expected_output:
  type: curriculum_alignment_brief
return_to: critical_friend
```

## Output format

A concise `curriculum_alignment_brief` (schema `ptspace.curriculum-alignment-brief/v2`):

```markdown
# Curriculum alignment brief

## Question
- Jurisdiction, subject, phase, grade, topic (and denomination if given)

## Findings
- For each checked denomination or track (evangelisch and katholisch as
  SEPARATE findings when the denomination is unknown):
  - alignment: yes | partial | no | unclear
  - relevant competence areas / inhaltliche Schwerpunkte
  - short source-grounded statement
  - source_ids: which sources back exactly this finding

## Sources
- id, title, issuing institution (publisher), official (yes/no), direct URL,
  access date, version/publication date, validity (current | archived |
  superseded; successor when superseded), exact locus (page, chapter, content
  field or competence formulation)

## Uncertainties
- What could not be verified from CURRENT official sources
```

## Source-quality and validity gate

A result may only be stored as `verified` or `partly-verified` when at least one
**current official** source is fully evidenced: issuing institution, official
status, direct URL, access date, version/publication date and an exact locus,
referenced by the finding it backs.

- An archived or superseded source may appear as a historical reference but
  never verifies a CURRENT curriculum alignment.
- `source_status` is COMPUTED from the sources and their finding mapping — it is
  never derived from the model setting `official: true` alone.
- When the denomination is unknown, evangelische **and** katholische
  Religionslehre must be present as separate findings; a prompt alone is not
  enough.

## Review criteria

A satisfactory result:

- checks current official sources first and cites every claim with an exact locus;
- distinguishes verified statements from interpretation and uncertainty;
- covers both denominations as separate findings when the denomination was unknown;
- does not treat an archived/superseded source as current verification;
- does not make a pedagogical decision or recommend a design;
- and can be summarised by the Companion in one short source-based contribution.

## Storage

Without an explicit storage order the draft is stored in:

```text
workspace/<project-slug>/drafts/curriculum-alignment-<scope-hash>.md
```

When the teacher explicitly asked to store the verified information in Knowledge
(`expected_output.type: knowledge_proposal`), the result is stored instead as a
reviewable, not-yet-curated OKF Knowledge Proposal in:

```text
workspace/<project-slug>/knowledge-proposals/curriculum-alignment-<scope-hash>.md
```

In both cases the result returns to the Companion and never becomes curated
Knowledge or classroom material automatically. Adoption into curated `knowledge/`
remains a later, separate decision after the result has returned.
