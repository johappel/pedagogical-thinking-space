# Learning Landscape Schema

> Canonical didactic topology for a planning space. See
> [PEDAGOGICAL_MODEL.md](specs/PEDAGOGICAL_MODEL.md) for the binding terms.

## Responsibility

`learning-landscape.md` contains learning moments and transitions. It is not a
lesson plan, Planning Board or material container. Teaching windows and
temporal placements belong only to `temporal-plan.yml`.

## Canonical files

```text
learning-design.md
learning-landscape.md
learning-landscape.layout.json
temporal-plan.yml
planning-board.yml
decisions.yml
materials/
```

`learning-landscape.layout.json` stores only node positions, group bounds and
viewport state. A layout change has no didactic meaning and must not create a
semantic version.

## Markdown format

```markdown
---
schema: ptspace.learning-landscape/v1
title: KI und Gottesbild
structure: hybrid
---

# Lernlandschaft

## Lernmomente

### lm-impuls

- Titel: KI begegnet Menschenbildern
- Typ: impulse
- Funktion: Irritation und persÃ¶nlicher Zugang
- LernaktivitÃ¤t: Lernende reagieren auf Bild- und Textimpulse.
- Erwartete Lernerfahrung: Menschenbilder sind nicht neutral.
- Materialbedarfe:
  - Impulsbilder
- Materialien: []
- Offene Fragen: []
- Status: draft

### lm-positionieren

- Titel: Was macht einen Menschen aus?
- Typ: positioning
- Funktion: Eigene Deutungen sichtbar machen
- LernaktivitÃ¤t: Lernende positionieren sich und begrÃ¼nden ihre Wahl.
- Erwartete Lernerfahrung: Plausible Unterschiede und eigene Unsicherheit.
- Materialbedarfe:
  - Thesenkarten
- Materialien: []
- Offene Fragen: []
- Status: draft

## ÃœbergÃ¤nge

### tr-impuls-positionieren

- Von: lm-impuls
- Zu: lm-positionieren
- Typ: required
- BegrÃ¼ndung: Die erste Irritation wird in eine eigene Position Ã¼berfÃ¼hrt.
```

## Learning moment model

Every moment has these required fields:

| Field | Meaning |
| --- | --- |
| `id` | stable, unique identifier |
| `title` | teacher-facing title |
| `type` | pedagogical type |
| `function` | didactic function |
| `learning_activity` | what learners do within the moment |
| `expected_experience` | what learners may experience, understand or notice |
| `material_needs` | identified needs, not finished materials |
| `materials` | referenced material ids |
| `open_questions` | explicitly unresolved questions |
| `status` | `draft`, `stable` or `needs_review` |

Allowed moment types are `impulse`, `learning_place`, `positioning`,
`inquiry`, `choice`, `practice`, `project`, `product`, `reflection`,
`assessment` and `other`. Unknown types are invalid.

## Transition model

Every transition has `id`, `from`, `to`, `type` and `rationale`. `from` and
`to` must reference distinct existing learning moments. Allowed transition
types are `required`, `choice`, `parallel`, `return`, `meeting_point` and
`prerequisite`. A transition has no learning activity or material set.

## Validation rules

- Moment and transition ids are unique and stable.
- Each required moment field is present and meaningful.
- Material references are ids, never UI file paths.
- Every transition references existing moments.
- The schema contains no teaching windows, placement data, start times or
  durations. Those data belong to `temporal-plan.yml`.
- A moment may be proposed by AI, but may enter the canonical landscape only
  after visible teacher approval.

## Canvas and proposal rules

Dragging a node changes only `learning-landscape.layout.json`. Creating,
removing or changing a moment or transition changes `learning-landscape.md`
after approval. A proposal must identify affected moments and transitions,
give a reason and expected didactic consequence, and provide a reversible
preview.
