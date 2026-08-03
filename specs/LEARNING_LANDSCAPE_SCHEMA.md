# Learning Landscape Schema

> Canonical didactic topology for a planning space. See `specs/PEDAGOGICAL_MODEL.md` for the binding terms.

## Responsibility

`learning-landscape.md` contains learning moments and transitions. It is not a lesson plan, Planning Board or material container. Teaching windows and temporal placements belong only to `temporal-plan.yml`.

The landscape may also make an approved intervention and its feedback path visible, but it does not store raw observation data or replace professional reflection.

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

`learning-landscape.layout.json` stores only node positions, group bounds and viewport state. A layout change has no didactic meaning and must not create a semantic version.

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
- Funktion: Irritation und persönlicher Zugang
- Lernaktivität: Lernende reagieren auf Bild- und Textimpulse.
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
- Lernaktivität: Lernende positionieren sich und begründen ihre Wahl.
- Erwartete Lernerfahrung: Plausible Unterschiede und eigene Unsicherheit.
- Materialbedarfe:
  - Thesenkarten
- Materialien: []
- Offene Fragen: []
- Status: draft

## Übergänge

### tr-impuls-positionieren

- Von: lm-impuls
- Zu: lm-positionieren
- Typ: required
- Begründung: Die erste Irritation wird in eine eigene Position überführt.
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

Allowed moment types are `impulse`, `learning_place`, `positioning`, `inquiry`, `choice`, `practice`, `project`, `product`, `reflection`, `assessment` and `other`. Unknown types are invalid.

## Optional systemic-reflective fields

A learning moment may additionally contain:

| Field | Meaning |
| --- | --- |
| `perspective_prompt` | one explicitly hypothetical perspective worth considering |
| `working_hypothesis` | provisional relationship relevant to the moment; never a diagnosis |
| `intervention_id` | reference to an approved intervention Board item |
| `observation_focus` | what the teacher intends to notice without collecting unnecessary personal data |
| `feedback_to` | moment, Board item or decision that receives the later review |

These fields are optional because not every lesson plan requires a systemic intervention. When present, they must be explicitly labelled as provisional and teacher-approved.

Example:

```markdown
- Arbeitshypothese: Schnelle Hilfen könnten die Erwartung stabilisieren, dass Gruppen vor dem Beginn eine Bestätigung benötigen.
- Intervention: pb-wartezeit-01
- Beobachtungsfokus: Beginnen Gruppen mit der Bearbeitung, wenn zunächst nur die Qualitätskriterien sichtbar sind?
- Rückmeldung an: pb-review-wartezeit-01
```

## Transition model

Every transition has `id`, `from`, `to`, `type` and `rationale`. `from` and `to` must reference distinct existing learning moments.

Allowed transition types are:

- `required`
- `choice`
- `parallel`
- `return`
- `meeting_point`
- `prerequisite`

A transition has no independent learning activity or material set.

## Feedback loops

A feedback loop is represented through traceable relations rather than a new hidden learner path.

The usual pattern is:

```text
working hypothesis
    -> approved intervention Board item
    -> affected learning moment or transition
    -> observation focus
    -> review Board item
    -> decision or revision of the Learning Design
```

A `return` transition may express a learner-facing return in the didactic topology. It must not be misused as a planning review loop. Planning feedback belongs in `planning-board.yml` and `decisions.yml`.

An intervention does not become a permanent property of the landscape until the teacher approves the semantic change.

## Material perspective links

A moment may reference a material as:

- `inspiration` - reflective contrast only;
- `building_block` - adapted component within the existing design;
- `guiding_structure` - material or approach that reorganises a substantial part of the learning journey.

When a material is a `guiding_structure`, the proposal must identify all affected moments and transitions. It is treated as a redesign, not as a local attachment.

The material metadata remains in `materials/`; the landscape stores only the material id and pedagogical relation.

## Validation rules

- Moment and transition ids are unique and stable.
- Each required moment field is present and meaningful.
- Material references are ids, never UI file paths.
- Every transition references existing moments.
- The schema contains no teaching windows, placement data, start times or durations. Those data belong to `temporal-plan.yml`.
- A working hypothesis is visibly marked as provisional.
- An intervention reference points to an approved or reviewable Planning Board item.
- Observation focuses avoid unnecessary personal data and diagnostic inference.
- Feedback references resolve to an existing Board item, decision or learning moment.
- A moment may be proposed by AI, but may enter the canonical landscape only after visible teacher approval.

## Canvas and proposal rules

Dragging a node changes only `learning-landscape.layout.json`.

Creating, removing or changing a moment, transition, intervention relation or material relation changes `learning-landscape.md` only after approval.

A proposal must:

- identify affected moments and transitions;
- state whether it is a local adjustment or redesign;
- distinguish observation, interpretation and hypothesis;
- give a reason and expected didactic consequence;
- describe ripple effects and possible new gaps;
- provide a reversible preview;
- and identify the later feedback point when it is an intervention.
