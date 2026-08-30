# Planning Board Schema

> The Planning Board represents the work of planning, trying and reviewing instruction. It must not be used to model the learner pathway.

## Distinction

```text
Learning Landscape
= what learners may encounter, do and connect

Planning Board
= what the teacher and services still need to clarify, research, prepare, try, observe, produce or review

Materials
= reviewable outputs that result from completed planning work
```

A planned lesson or learning node is not automatically a Planning Board item.

## Teacher-facing translation: "Nächste Schritte"

"**Nächste Schritte**" is the compact, teacher-facing entry point to the Planning Board. It does **not** mean the next lesson, learner activity or node in a learning landscape.

- The sidebar shows at most one recommended, actionable Board item and optionally a count of further items.
- Selecting it opens the Planning Board focused on that card.
- A Board item may represent an approved request, but the request remains an internal implementation detail.
- The app must not invent a competing task list.
- The recommended item should respect the current support mode: stabilise, orient, explore, implement or review.

## Canonical file

```text
workspace/<project-slug>/planning-board.yml
```

The file is an internal structured source. The app renders it as a teacher-facing board and does not expose YAML in normal use.

## Board columns

- `clarify` - pedagogical decisions or mandate still need conversation;
- `prepare` - research, didactic elaboration, intervention design, timing or media selection;
- `review` - sources, drafts, materials, observations or interventions await inspection;
- `ready` - approved planning results or materials.

A local app may label these in more natural language. The canonical values remain stable.

## Work item model

```yaml
schema: ptspace.planning-board/v1
items:
  - id: pb-dramaturgy
    title: Didaktische Dramaturgie für Stunde 2 entwickeln
    kind: design
    column: prepare
    related_moments: [lm-positionieren, lm-vertiefung]
    related_windows: [tw-02]
    expected_outputs:
      - type: lesson-outline
        material_id: material-stunde-2
    status: proposed
    requires_teacher_approval: true

  - id: pb-alternatives
    title: Zwei alternative Zugänge zur frühen Positionierung vergleichen
    kind: research
    column: prepare
    related_moments: [lm-impuls, lm-positionieren]
    pedagogical_tension: Eigene Deutungen früher ermöglichen, ohne begriffliche Klärung zu verlieren.
    research_scope:
      near_fit: 1
      contrast: 1
      source_requirements:
        - identifiable professional source
        - licence or access information for concrete materials
      include_integration_costs: true
    status: proposed
    requires_teacher_approval: true

  - id: pb-wartezeit-01
    title: Unterstützungsroutine in Stunde 2 geringfügig verändern
    kind: intervention
    column: prepare
    related_moments: [lm-positionieren]
    working_hypothesis: Schnelle Hilfe könnte die Erwartung stabilisieren, vor dem Beginn Bestätigung zu benötigen.
    intervention:
      smallest_change: Qualitätskriterien sichtbar machen und zwei Minuten vor individueller Hilfe warten.
      observation_focus: Beginnen Gruppen selbstständig und welche Rückfragen bleiben bestehen?
      reversible: true
      review_item: pb-review-wartezeit-01
    execution: teacher
    status: proposed
    requires_teacher_approval: true

  - id: pb-review-wartezeit-01
    title: Rückmeldung zur veränderten Unterstützungsroutine auswerten
    kind: review
    column: review
    related_items: [pb-wartezeit-01]
    expected_inputs:
      - teacher observation
      - optional learner statements
    epistemic_separation_required: true
    status: blocked
    blocked_by: pb-wartezeit-01
    requires_teacher_approval: false
```

## Allowed kinds

- `clarify`
- `research`
- `design`
- `intervention`
- `observe`
- `produce`
- `review`
- `render`
- `export`

`intervention` prepares a small, reversible change. `observe` records a bounded observation task when it should be distinct from the intervention. Neither kind implies diagnosis or surveillance.

## Lifecycle

```text
proposed -> approved -> in_progress -> review -> ready | blocked | discarded
```

An intervention normally moves from `approved` to `in_progress` when tried, then to `review`. It does not become `ready` merely because it was executed.

## Required references and material needs

A Board item may reference:

- `related_moments`
- `related_windows`
- `related_decisions`
- `related_materials`
- `related_items`

For work arising from a learning moment, it may record `material_need`. This is an identified need, not a material and not an implicit Worker command.

A Board card remains distinct from a material. Moving it between columns changes only its planning state and creates no Service Request.

Only an explicit, visible teacher action may approve the item and create a request, unless a previously visible bounded session permission covers that exact research scope.

Worker and research results return to `review`; they never enter `ready` automatically.

## Systemic-reflective fields

Items of kind `clarify`, `intervention`, `observe` or `review` may contain:

| Field | Meaning |
| --- | --- |
| `support_mode` | `stabilise`, `orient` or `explore` |
| `epistemic_basis` | references to observations, statements, interpretations, hypotheses and verified knowledge |
| `working_hypothesis` | provisional, revisable relationship |
| `smallest_change` | bounded change intended to generate feedback |
| `observation_focus` | what should be noticed, without unnecessary personal data |
| `review_item` | later Board item for shared interpretation |
| `reversible` | whether the intervention can be undone without significant cost |
| `structural_constraints` | conditions not to be reframed as personal shortcomings |

A hypothesis may support a Board item but may not be written as a diagnosis or fact.

## Research and material perspective fields

A research item may specify:

```yaml
pedagogical_tension: <the unresolved design tension>
existing_approach: <brief description>
research_scope:
  near_fit: 1
  contrast: 1
  maximum_sources: 6
  source_requirements: []
  include_assumptions: true
  include_integration_costs: true
  include_ripple_effects: true
  include_source_quality: true
return_format: pedagogical_alternatives_brief
```

The result should distinguish possible material use as:

- `inspiration`
- `building_block`
- `guiding_structure`

A `guiding_structure` result must create a redesign proposal that lists affected moments and transitions. It must not be inserted as a local material attachment.

## Relations

A work item may refer to:

- learning moments;
- teaching windows;
- decisions;
- materials;
- Knowledge Proposals;
- Service Requests;
- and other Board items forming an intervention-feedback loop.

Relations make planning work traceable without turning the learner-facing landscape into a task list.

## AI change rules

AI may propose a Board item when work is needed. It must not create a swarm of tasks.

The Companion normally offers one meaningful proposal at a time and explains why it matters now.

In `stabilise` mode, the proposal should minimise teacher effort and avoid optional expansions.

Workers do not create new Board items unless a reviewed result reveals a concrete missing prerequisite, integration gap or required feedback step. Such an item remains `proposed`.

## Routing rule for open points

Applications and harnesses must not display every open question as an "open decision".

| Open point needs | Board kind | Teacher-facing proposal |
| --- | --- | --- |
| immediate scope or mandate | `clarify` | "Was brauchen wir für jetzt?" |
| professional judgement or choice | `clarify` | "Im Gespräch klären" |
| curriculum, sources or verified knowledge | `research` | "Quellenlage prüfen" |
| contrasting approach or material perspective | `research` | "Alternative Zugänge vergleichen" |
| didactic elaboration of an approved direction | `design` | "Lernreise weiterentwickeln" |
| small reversible change | `intervention` | "Eine kleine Veränderung erproben" |
| focused noticing after a change | `observe` | "Gezielt beobachten" |
| artefact based on approved decisions | `produce` | "Entwurf vorbereiten" |
| shared inspection of a result or experience | `review` | "Gemeinsam auswerten" |
| target representation | `render` | "Format erzeugen" |

A proposal has `status: proposed` and `requires_teacher_approval: true`, except an automatically created review item that was already part of an approved intervention loop.
