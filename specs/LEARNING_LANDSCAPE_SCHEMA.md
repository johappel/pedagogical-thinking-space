# Learning Landscape Schema

> A Learning Landscape describes the didactic topology of a Learning Design. It is not a project-management board and it is not necessarily a linear sequence of lessons.

## Purpose

A Learning Landscape makes visible:

- learning moments,
- learner pathways,
- choice and return points,
- project or product phases,
- material relations,
- and the temporal placement of learning moments.

The teacher and Critical Friend may discuss it in ordinary language. Harnesses and applications use the structure below.

## Canonical Files

Each planning room may contain:

```text
learning-design.md
learning-landscape.md
learning-landscape.layout.json
planning-board.yml
materials/
drafts/
```

`learning-landscape.md` is the canonical pedagogical source.

`learning-landscape.layout.json` stores only visual positions, group bounds and viewport state. A changed position alone must not change didactic meaning.

## Supported Structures

`structure` is one of:

- `linear`
- `stations`
- `buffet`
- `project`
- `spatial`
- `hybrid`

The value describes the dominant organisation. It never removes the possibility of choices, parallel paths or return transitions.

## Markdown Format

```md
---
schema: ptspace.learning-landscape/v1
title: KI und Gottesbild
structure: hybrid
---

# Lernlandschaft

## lm-impuls – KI begegnet Menschenbildern

- Typ: Impuls
- Funktion: Irritation und persönlicher Zugang
- Erwartete Lernerfahrung: Menschenbilder sind nicht neutral.
- Lernaktivität: Lernende reagieren auf Bild- und Textimpulse.
- Materialien: material-impulsbilder
- Übergänge:
  - lm-positionieren | Pflichtweg

## lm-positionieren – Was macht einen Menschen aus?

- Typ: Positionierung
- Funktion: eigene Deutungen sichtbar machen
- Lernaktivität: Position Line mit Begründung.
- Materialien: material-position-line
- Übergänge:
  - lm-vertiefung | Wahl

## lm-vertiefung – Vertiefungswege

- Typ: Wahlphase
- Funktion: Perspektiven prüfen
- Lernaktivität: Lernende wählen einen Zugang.
- Wege:
  - lm-theologisch
  - lm-ethisch
  - lm-gesellschaftlich
- Übergänge:
  - lm-verdichtung | Treffpunkt
```

Each node id must be unique and stable. Renaming a title must not silently change its id.

## Node Model

Every learning-moment node has:

| Field | Required | Meaning |
| --- | --- | --- |
| id | yes | stable identifier, e.g. `lm-positionieren` |
| title | yes | teacher-facing title |
| type | yes | impulse, learning_place, positioning, inquiry, choice, practice, project, product, reflection, assessment, other |
| function | yes | didactic function |
| learning_activity | yes | what learners actually do |
| expected_experience | recommended | what learners may experience or understand |
| materials | optional | material ids, never raw file paths in the UI |
| transitions | optional | relations to other nodes |
| time_placements | optional | references to teaching windows |
| status | optional | draft, stable, needs_review |

A node is not automatically one lesson.

## Transitions

Every transition is one of:

- `required` — common path
- `choice` — learners or groups choose
- `parallel` — may happen alongside another path
- `return` — returns to an earlier node
- `meeting_point` — distinct paths converge
- `prerequisite` — requires another learning moment

A transition may include a short pedagogical rationale.

## Teaching Windows

Time belongs to a separate temporal layer. A teaching window can be a lesson, double lesson, project block or open learning period.

```yaml
teaching_windows:
  - id: tw-01
    title: Stunde 1 – Irritation und Position
    duration_minutes: 45
  - id: tw-02
    title: Stunde 2 – Perspektiven prüfen
    duration_minutes: 45

placements:
  - node: lm-impuls
    window: tw-01
    role: primary
    minutes: 10
  - node: lm-vertiefung
    window: tw-02
    role: choice
    minutes: 30
```

A node may have zero, one or many placements. A placement must never force every learner through a choice node.

## Canvas Rules

The canvas is a view of the semantic model.

- Dragging a node changes only `learning-landscape.layout.json`.
- Creating, removing or changing a transition changes `learning-landscape.md`.
- Group containers may represent phases, rooms, stations or project areas.
- Freehand drawing is not a canonical source.
- An automatic layout may be generated or reset without changing didactic meaning.

## AI Change Rules

The Critical Friend or a Worker may propose a landscape change. It must contain:

- reason,
- affected nodes and transitions,
- expected didactic consequence,
- whether a teaching-window placement changes,
- and a reversible preview.

It must not silently delete nodes, alter learning goals, move material to “ready”, or change the temporal plan.

A proposal becomes canonical only after teacher approval.
