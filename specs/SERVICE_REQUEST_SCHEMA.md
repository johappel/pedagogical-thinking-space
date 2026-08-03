# Service Request Schema

The Pedagogical Companion does **not** call models, tools or APIs directly.

When a background service is needed, it writes a **Service Request**: a small, model-agnostic and traceable description of the approved support.

`CRITICAL_FRIEND.md` and the technical identifier `critical_friend` remain supported for compatibility.

The harness or application reads this contract and decides how the request is routed and executed. The Companion never hard-codes a model name. Use `model_hint` only to describe the execution profile, such as cheap/fast, careful reasoning or source-grounded.

A Service Request targets one of:

`memory` · `knowledge` · `worker` · `renderer` · `review`

## Core fields

```yaml
service: worker
mode: draft                  # retrieve | research | draft | render | validate | review
task: create_student_instruction
capability: capabilities/workers/CREATE_STUDENT_INSTRUCTION.md
reason: >
  A design decision has been approved and now needs implementation.
mandate:
  support_mode: orient       # stabilise | orient | explore
  approved_goal: Prepare a reviewable student instruction.
  permission:
    type: board_item         # board_item | bounded_session | explicit_chat
    reference: pb-student-instruction
input:
  learning_design: workspace/<project-slug>/learning-design.md
  board_item_id: pb-student-instruction
  related_decision: Decision 2
expected_output:
  type: student_instruction
  location: workspace/<project-slug>/drafts/student-instruction.md
constraints:
  language: de
  audience: grade 9
  max_length: 1 page
epistemic_requirements:
  separate_observation_interpretation_hypothesis: true
  cite_sources: false
return_to: critical_friend
requires_approval: true
model_hint: cheap_fast
```

`capability` is the reviewed Capability document defining allowed inputs, output, safety rules and review criteria. `task` is the stable capability id used for routing.

When a matching Capability exists, Worker requests must include its repository-relative path.

## Mandate and permission

Every request must be grounded in a visible mandate.

`mandate.support_mode` records whether the conversation currently prioritises:

- `stabilise`
- `orient`
- `explore`

This field shapes scope and return format. It does not diagnose the teacher.

`mandate.permission.type` may be:

- `board_item` - a specific Planning Board item was approved;
- `explicit_chat` - the teacher explicitly approved this request in the conversation;
- `bounded_session` - the teacher previously approved background work within a defined topic, source range, maximum scope and return format.

A bounded session permission must be referenced and must not be interpreted as unrestricted permission.

Moving a Board card does not count as approval.

## Epistemic requirements

A request may require the service to distinguish:

- `observation`
- `reported_statement`
- `interpretation`
- `hypothesis`
- `verified_knowledge`
- `open_question`

Research and Memory requests should normally set:

```yaml
epistemic_requirements:
  separate_observation_interpretation_hypothesis: true
  mark_uncertainty: true
  include_source_quality: true
  avoid_diagnostic_inference: true
```

A service result must not turn an interpretation or working hypothesis into a fact.

## Traceability

A request connected to the Learning Landscape or Planning Board keeps canonical references in `input`:

- `input.learning_design` points to the current Learning Design snapshot.
- `input.learning_landscape` points to the current didactic topology when relevant.
- `input.related_moments` contains stable Learning Landscape moment ids.
- `input.related_windows` contains stable Teaching Window ids when timing is relevant.
- `input.board_item_id` contains the approved Planning Board item for board-bound work.
- `input.related_items` contains intervention, observation or review Board relations when relevant.
- `input.expected_result` states what the approved work should produce.
- `expected_output.material_id` is the stable material id when the result is a material.

These references are identifiers, not UI paths.

A request must not merge the responsibilities of Learning Design, Learning Landscape, Temporal Plan, Planning Board, Decisions and Materials.

## Board material Worker request

`create_board_material` is the canonical Worker request for a material draft from an approved Planning Board item.

```yaml
service: worker
mode: draft
task: create_board_material
capability: capabilities/workers/CREATE_BOARD_MATERIAL.md
reason: >
  The approved work item needs a reviewable material draft.
mandate:
  support_mode: stabilise
  approved_goal: Produce one concise draft without expanding the lesson scope.
  permission:
    type: board_item
    reference: pb-impuls-karten
input:
  learning_design: workspace/<project-slug>/learning-design.md
  learning_landscape: workspace/<project-slug>/learning-landscape.md
  board_item_id: pb-impuls-karten
  title: Thesenkarten zur Positionierung
  expected_result: >
    A concise card set for the approved positioning moment, returned as a draft.
  related_moments: [lm-positionieren]
  related_windows: [tw-01]
  target_group: grade 9
  language: de
expected_output:
  type: material_draft
  material_id: material-pb-impuls-karten
  location: workspace/<project-slug>/materials/pb-impuls-karten.md
constraints:
  language: de
  status: draft
  do_not_expand_scope: true
return_to: critical_friend
requires_approval: true
```

The output location and material id are assigned by the application or harness from the approved Board item. Callers must not provide arbitrary paths.

## Pedagogical alternatives research request

Use this request when external approaches or materials should broaden the teacher's perspective without becoming the new centre of the planning process.

```yaml
service: worker
mode: research
task: research_pedagogical_alternatives
capability: capabilities/workers/RESEARCH_PEDAGOGICAL_ALTERNATIVES.md
reason: >
  The current design contains a tension between early learner interpretation
  and prior conceptual clarification.
mandate:
  support_mode: explore
  approved_goal: Compare two pedagogical responses before deciding.
  permission:
    type: board_item
    reference: pb-alternatives
input:
  learning_design: workspace/<project-slug>/learning-design.md
  learning_landscape: workspace/<project-slug>/learning-landscape.md
  board_item_id: pb-alternatives
  pedagogical_tension: >
    Invite learners' own interpretations earlier without losing conceptual clarity.
  existing_approach: Text-led concept development before personal positioning.
  related_moments: [lm-impuls, lm-positionieren]
  research_scope:
    near_fit: 1
    contrast: 1
    maximum_sources: 6
    include_concrete_materials: true
  source_requirements:
    - identifiable professional source
    - source date and access path
    - licence or access information for concrete materials
expected_output:
  type: pedagogical_alternatives_brief
  location: workspace/<project-slug>/drafts/pb-alternatives-alternatives.md
  required_sections:
    - current approach
    - near-fit alternative
    - contrasting alternative
    - embedded assumptions
    - source quality and uncertainty
    - integration costs
    - ripple effects
    - use classification
constraints:
  use_types: [inspiration, building_block, guiding_structure]
  no_unfiltered_catalogue: true
  do_not_modify_learning_design: true
epistemic_requirements:
  separate_observation_interpretation_hypothesis: true
  mark_uncertainty: true
  include_source_quality: true
return_to: critical_friend
requires_approval: true
model_hint: source_grounded
```

The result returns to `review`. The Companion decides whether one contrast is useful to bring into the conversation.

A `guiding_structure` recommendation must identify all affected learning moments and transitions and be presented as a redesign proposal.

## Intervention review request

A Review service may help structure feedback after a small intervention. It may organise evidence but must not determine what the experience means for the teacher.

```yaml
service: review
mode: review
task: review_intervention_feedback
reason: >
  An approved small intervention has been tried and its observations need structured review.
mandate:
  support_mode: orient
  approved_goal: Separate observations, statements, interpretations and hypotheses.
  permission:
    type: board_item
    reference: pb-review-wartezeit-01
input:
  learning_design: workspace/<project-slug>/learning-design.md
  board_item_id: pb-review-wartezeit-01
  related_items: [pb-wartezeit-01]
  working_hypothesis: <provisional hypothesis>
  observation_notes: workspace/<project-slug>/drafts/pb-wartezeit-01-observations.md
expected_output:
  type: intervention_review_brief
  location: workspace/<project-slug>/drafts/pb-review-wartezeit-01.md
epistemic_requirements:
  separate_observation_interpretation_hypothesis: true
  preserve_teacher_authorship: true
return_to: critical_friend
requires_approval: false
```

`requires_approval: false` is allowed here only when the review item was already created and approved as part of the original intervention-feedback loop.

## Knowledge output

A Knowledge Service Request may declare `knowledge_output` in `expected_output` to state whether it returns:

- a source note;
- a project-specific Knowledge Proposal;
- or a reusable proposal.

It must not write directly into curated Knowledge.

Temporary research output remains case-bound until it passes the Knowledge Capture Gate.

## Rules

1. A Service Request describes approved work, never the technical execution.
2. It references a snapshot of the current Learning Design in `input.learning_design`.
3. It records the mandate and permission boundary.
4. Board-bound requests reference an approved Board item and preserve Landscape and Teaching Window relations.
5. Results return to the Companion in `return_to` before the teacher sees or uses them.
6. A request that can create a material declares the expected material id and draft output location.
7. The harness may refuse a request when no matching Worker Capability exists.
8. Worker results remain drafts until explicit professional review changes their status.
9. Research results do not change the Learning Design or become curated Knowledge automatically.
10. An interpretation or hypothesis remains visibly provisional in every result.
11. A request in `stabilise` mode should minimise scope and avoid creating optional work for the teacher.
12. A Service Request never makes a material classroom-ready by itself.

## Lifecycle: file-based harness

```text
queue/req-001.yaml
        |
        v
harness/dispatcher.py
        |
        v
workspace/<slug>/...
        |
        v
queue/done/req-001.yaml
        |
        v
Companion review -> Planning Board review -> teacher decision
```
