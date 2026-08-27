# Knowledge Capability: Verify Curriculum Alignment

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

A concise `curriculum_alignment_brief`:

```markdown
# Curriculum alignment brief

## Question
- Jurisdiction, subject, phase, grade, topic (and denomination if given)

## Findings
- For each checked denomination or track:
  - alignment: yes | partial | no | unclear
  - relevant competence areas / inhaltliche Schwerpunkte
  - short source-grounded statement

## Sources
- Title, official (yes/no), access path/URL, access date

## Uncertainties
- What could not be verified from official sources
```

## Review criteria

A satisfactory result:

- checks official sources first and cites every claim;
- distinguishes verified statements from interpretation and uncertainty;
- covers both denominations when the denomination was unknown;
- does not make a pedagogical decision or recommend a design;
- and can be summarised by the Companion in one short source-based contribution.

## Storage

The draft is stored in:

```text
workspace/<project-slug>/drafts/curriculum-alignment-<scope-hash>.md
```

It returns to the Companion and never becomes curated Knowledge or classroom
material automatically. Reusable findings may later pass the Knowledge Capture
Gate as a Knowledge Proposal.
