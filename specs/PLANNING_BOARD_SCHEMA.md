# Planning Board Schema

> The Planning Board represents the work of planning instruction. It must not be used to model the learner pathway.

## Distinction

```text
Learning Landscape
= what learners may encounter, do and connect

Planning Board
= what the teacher and services still need to clarify, prepare, produce or review

Materials
= outputs that result from completed planning work
```

A planned lesson or learning node is not automatically a Planning Board item.

## Canonical File

```text
workspace/<project-slug>/planning-board.yml
```

The file is an internal structured source. The app renders it as a teacher-facing board and never exposes YAML in normal use.

## Board Columns

- `clarify` — pedagogical decisions still needed
- `prepare` — didactic dramaturgy, timing, media selection
- `review` — results or sources awaiting inspection
- `ready` — approved planning results or materials

A local app may label these in more natural language. The canonical values remain stable.

## Work Item Model

```yaml
schema: ptspace.planning-board/v1
items:
  - id: pb-dramaturgy
    title: Didaktische Dramaturgie für Stunde 2 entwickeln
    kind: design
    column: prepare
    related_nodes: [lm-positionieren, lm-vertiefung]
    related_windows: [tw-02]
    expected_outputs:
      - type: lesson-outline
        material_id: material-stunde-2
    status: proposed
    requires_teacher_approval: true

  - id: pb-curriculum
    title: Lehrplanbezug quellengeprüft klären
    kind: research
    column: clarify
    related_nodes: [lm-verdichtung]
    source_requirements:
      - official curriculum
      - citation and retrieval date
    status: proposed
    requires_teacher_approval: true
```

Allowed `kind` values:

- `clarify`
- `research`
- `design`
- `produce`
- `review`
- `render`
- `export`

## Lifecycle

```text
proposed → approved → in_progress → review → ready | blocked | discarded
```

A board item may create a Service Request only after approval. Worker results return to `review`; they never enter `ready` automatically.

## Relations

A work item may refer to:

- learning nodes,
- teaching windows,
- decisions,
- materials,
- Knowledge Proposals,
- and Service Requests.

The relation makes planning work traceable without turning the learner-facing landscape into a task list.

## AI Change Rules

AI may propose a board item when work is needed. It must not create a swarm of tasks.

The Critical Friend should normally offer one meaningful proposal at a time and explain why it matters now.

Workers do not create new board items unless a reviewed result reveals a concrete missing prerequisite.
