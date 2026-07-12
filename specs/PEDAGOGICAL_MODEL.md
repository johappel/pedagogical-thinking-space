# Pedagogical Model

> Binding terminology for file-based Pedagogical Thinking Space workspaces.

## Canonical artefact boundaries

`learning-design.md` expresses the overarching pedagogical understanding.
`learning-landscape.md` expresses the didactic topology. `temporal-plan.yml`
expresses its temporal realisation. `planning-board.yml` expresses planning
work. `decisions.yml` records reasoned decisions. `materials/` contains
reviewable results; it is not a task list.

## Learning moment

A **learning moment** is a pedagogically significant section of the learning
journey. It records its didactic function, what learners do, what they may
experience or understand, open questions and material needs. It is not
automatically a lesson or a material container.

## Learning activity

A **learning activity** describes what learners concretely do within one
learning moment. In version 1 it belongs to that learning moment; it is not a
separate global activity pool.

## Transition

A **transition** connects two learning moments. Its type describes the
relationship, for example a common way, choice, parallel route, return,
meeting point or prerequisite. A transition is not a learning moment and has
no independent activity or material set.

## Material need

A **material need** is an identified support needed for a learning moment,
such as prompt cards, a source overview or a reflection sheet. It is neither a
finished material nor an instruction to start a Worker. It may lead to a
proposed Planning Board item.

## Material

A **material** is a reviewable result of an approved work item. It has explicit
pedagogical references. It becomes classroom-ready only after visible
professional review and approval.

## Planning Board item

A **Planning Board item** is a teacher-facing representation of planning work
that still needs clarification, preparation, production or review. It can
reference learning moments, teaching windows, decisions, materials and service
requests. Moving it does not start a Worker; only explicit teacher approval
may create a Service Request.

## Teaching window

A **teaching window** is a real temporal unit: a lesson, double lesson,
project block or open learning time. It belongs solely to `temporal-plan.yml`.

## Temporal placement

A **temporal placement** assigns an existing learning moment to a teaching
window, including start, duration, dramaturgical role and mode. A moment may
have zero, one or several placements. Creating or changing a placement never
