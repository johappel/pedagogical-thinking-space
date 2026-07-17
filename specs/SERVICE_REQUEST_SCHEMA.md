# Service Request Schema

The Critical Friend does **not** call models, tools or APIs directly.
When a service is needed, it writes a **Service Request** - a small,
model-agnostic description of what support is needed.

The harness or application reads this contract and decides how the request is routed and executed. The Critical Friend never hard-codes a model name. Use `model_hint` only to describe the kind of execution (cheap/fast, careful reasoning, source-grounded).

A Service Request targets one of:
`memory` · `knowledge` · `worker` · `renderer` · `review`.

## Fields

```yaml
service: worker              # REQUIRED. which service handles this
mode: draft                  # e.g. retrieve | research | draft | render | validate
task: create_student_instruction # concrete capability / worker id
capability: capabilities/workers/CREATE_STUDENT_INSTRUCTION.md
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
requires_approval: true
model_hint: cheap_fast       # kind of execution, NOT a model name
```

`capability` is the reviewed Capability document that defines the allowed
inputs, output, safety rules and review criteria. `task` remains the stable
capability id used for routing. When a matching Capability exists, Worker
requests must include its repository-relative path.

## Traceability

A request that is connected to the Learning Landscape or Planning Board must
keep its canonical references in the input:

- `input.learning_design` points to the current Learning Design snapshot.
- `input.related_nodes` contains stable Learning Landscape node ids.
- `input.related_windows` contains stable Teaching Window ids when timing is relevant.
- `input.board_item_id` contains the approved Planning Board item for board-bound work.
- `input.expected_result` states what the approved work item should produce.
- `expected_output.material_id` is the stable material id when the result is a material.

These references are identifiers, not UI paths. A request must not merge the
responsibilities of the Learning Design, Learning Landscape, Temporal Plan,
Planning Board and Materials artefacts.

## Board material worker request

`create_board_material` is the canonical Worker request for a material draft
from an approved Planning Board item. It is valid only when the Board item,
its Learning Landscape references and the expected output are already known.
The Worker does not create or approve the Board item.

```yaml
service: worker
mode: draft
task: create_board_material
capability: capabilities/workers/CREATE_BOARD_MATERIAL.md
reason: >
  The approved work item needs a reviewable material draft.
input:
  learning_design: workspace/<project-slug>/learning-design.md
  board_item_id: pb-impuls-karten
  title: Thesenkarten zur Positionierung
  expected_result: >
    A concise card set for the approved positioning moment, returned as a draft.
  related_nodes: [lm-positionieren]
  related_windows: [tw-01]
  related_moments:
    - id: lm-positionieren
      title: What makes a person?
      didactic_purpose: Make interpretations visible.
      learning_activity: Learners position themselves and justify their choice.
      expected_experience: Learners notice plausible differences and uncertainty.
      material_needs: [Thesis cards]
      open_questions: []
  target_group: grade 9
  language: de
expected_output:
  type: material_draft
  material_id: material-pb-impuls-karten
  location: workspace/<project-slug>/materials/pb-impuls-karten.md
constraints:
  language: de
  status: draft
return_to: critical_friend
requires_approval: true
```

The `related_moments` entries are a read-only snapshot for the Worker. The
stable ids in `related_nodes` remain the canonical traceability relation.
`related_windows` may be empty when no teaching-window relation is known.
The output location and material id are assigned by the application or
harness from the approved Board item; callers must not provide arbitrary
paths.

## Knowledge output

A Knowledge Service Request may declare `knowledge_output` in
`expected_output` to state whether it returns a source note, a project-specific
Knowledge Proposal or a reusable proposal. It must not write directly into
curated Knowledge.

## Rules

1. A Service Request describes work, never the technical execution.
2. It must reference a snapshot of the current Learning Design in `input.learning_design`.
3. Board-bound Worker requests must reference an approved Board item and preserve their Learning Landscape and Teaching Window relations.
4. Results return to the Critical Friend in `return_to` before the teacher sees them.
5. A request that can create a material must declare its expected material id and draft output location.
6. The harness may refuse a request if no matching Worker Capability exists.
7. Worker results are drafts until an explicit professional review changes their status; a Service Request never makes a material classroom-ready by itself.

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
