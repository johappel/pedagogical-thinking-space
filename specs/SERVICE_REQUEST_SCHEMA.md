# Service Request Schema

The Critical Friend does **not** call models, tools or APIs directly.
When a service is needed, it writes a **Service Request** — a small,
model-agnostic description of *what support is needed*.

The harness / application reads this file and decides *how* it is executed.
The Critical Friend never hard-codes a model name. Use `model_hint` only to
describe the *kind* of execution (cheap/fast, careful reasoning, source-grounded).

A Service Request targets one of:
`memory` · `knowledge` · `worker` · `renderer` · `review`

---

## Fields

```yaml
service: worker              # REQUIRED. which service handles this
mode: draft                  # what kind of work (e.g. draft | research | convert)
task: create_student_instruction   # concrete capability / worker id
reason: >
  A design decision has been approved and now needs implementation.
input:
  learning_design: workspace/<project-slug>/learning-design.md
  related_decision: Decision 2
expected_output:
  type: student_instruction
  location: workspace/<project-slug>/drafts/student-instruction.md
constraints:
  language: de
  audience: grade 9
  max_length: 1 page
return_to: critical_friend   # results come back here first, never straight to teacher
model_hint: cheap_fast       # kind of execution, NOT a model name
```

## Rules

1. A Service Request describes work, never the technical execution.
2. It must reference a snapshot of the current Learning Design (`input.learning_design`).
3. Results return to the Critical Friend (`return_to`) before the teacher sees them.
4. The harness may refuse a request if no matching worker/capability exists.

## Lifecycle (Level 2: file-based harness)

```
queue/req-001.yaml      <- Critical Friend writes here
        |
        v   (dispatcher polls every few seconds)
harness/dispatcher.py   <- routes by `service`/`task` to a worker script
        |
        v
workspace/<slug>/...    <- worker writes the artefact
        |
        v
queue/done/req-001.yaml <- dispatcher archives the request
```
