# SERVICE_REQUEST_SCHEMA.md

> Schema for structured service requests inside the Pedagogical Thinking Space.
>
> A Service Request is the bridge between the Critical Friend and the invisible services:
>
> - Memory
> - Knowledge
> - Worker
> - Renderer
> - Review
>
> The Critical Friend decides *that* a service is needed.
>
> The harness, application or workflow decides *how* the request is executed.

---

# Purpose

Service Requests make delegation explicit.

They prevent the Critical Friend from silently switching into production, research or rendering.

A Service Request describes:

- which service is needed,
- why it is needed,
- what input it receives,
- what output is expected,
- where the result should be stored,
- and how the result returns to the Critical Friend.

Service Requests protect the pedagogical thinking space.

---

# Core Principle

The Critical Friend requests services.

The harness routes service requests.

The service executes the task.

The Critical Friend reviews the result.

The teacher sees only what is pedagogically useful.

---

# Location

Service Requests may be stored in the current workspace:

```text
workspace/<project-slug>/service-requests/
```

Example:

```text
workspace/ki-verantwortlich-nutzen/service-requests/worker-student-instruction.yml
```

Completed results should be stored according to the request, usually in:

```text
workspace/<project-slug>/drafts/
workspace/<project-slug>/rendered/
workspace/<project-slug>/knowledge-proposals/
```

---

# Request Status

Every Service Request must include a status.

Allowed values:

```text
proposed
approved
queued
in-progress
completed
returned
reviewed
discarded
failed
```

## Meaning

### proposed

The Critical Friend suggests a service request.

### approved

The teacher or workflow has approved the request.

### queued

The request is ready for execution.

### in-progress

A service is currently working on the request.

### completed

The service has produced a result.

### returned

The result has returned to the Critical Friend.

### reviewed

The Critical Friend has reviewed the result.

### discarded

The result is not used.

### failed

The service could not complete the request.

---

# Supported Services

Allowed values for `service`:

```text
memory
knowledge
worker
renderer
review
```

## memory

Used when previous experience may enrich the current Learning Design.

## knowledge

Used when reliable professional knowledge is required.

## worker

Used when implementation work should be done after a design decision.

## renderer

Used when a Learning Design should be expressed in a specific output format.

## review

Used when an artefact, draft or rendered output needs quality checking.

---

# Required Fields

Every Service Request must contain:

```yaml
id:
status:
service:
mode:
created:
created_by:
reason:
input:
expected_output:
constraints:
return_to:
```

---

# Field Definitions

## id

A stable identifier.

Example:

```yaml
id: worker-student-instruction-001
```

## status

Current state of the request.

Example:

```yaml
status: proposed
```

## service

The requested service.

Example:

```yaml
service: worker
```

## mode

The kind of service action.

Examples:

```yaml
mode: draft
mode: research
mode: retrieve
mode: render
mode: validate
mode: summarize
mode: propose
```

## created

Date of request creation.

Use ISO format:

```yaml
created: 2026-07-03
```

## created_by

Usually:

```yaml
created_by: critical_friend
```

## reason

Why this service is needed now.

The reason must refer to the Learning Design.

Example:

```yaml
reason: >
  Decision 2 has been approved. The teacher wants a first draft of the
  student-facing instruction for the dilemma activity.
```

## input

All required input for the service.

Typical input fields:

```yaml
input:
  learning_design: workspace/<project-slug>/learning-design.md
  related_decision: Decision 2
  related_activity: Activity 1
  sources:
    - workspace/<project-slug>/sources.md
```

## expected_output

What the service should produce.

Example:

```yaml
expected_output:
  type: student_instruction
  format: markdown
  location: workspace/<project-slug>/drafts/student-instruction.md
```

## constraints

Limits and requirements.

Example:

```yaml
constraints:
  language: de
  audience: grade 9
  length: max 1 page
  tone: clear, age-appropriate, calm
  must_not:
    - introduce new learning goals
    - change the approved method
    - invent sources
```

## return_to

Where the result goes next.

Usually:

```yaml
return_to: critical_friend
```

The service should not present results directly to the teacher.

---

# Optional Fields

Service Requests may also contain:

```yaml
priority:
model_hint:
requires_approval:
review:
routing:
assumptions:
risks:
```

## priority

Allowed values:

```text
low
normal
high
urgent
```

## model_hint

A non-binding hint for the technical router.

Examples:

```yaml
model_hint: cheap_fast
model_hint: careful_reasoning
model_hint: source_grounded
model_hint: format_conversion
```

The Critical Friend may provide a hint.

It must not hard-code a provider or model name.

Bad:

```yaml
model_hint: deepseek-v4-flash
```

Better:

```yaml
model_hint: cheap_fast
```

Model names belong in routing configuration, for example:

```text
config/models.example.yml
```

## requires_approval

Whether the teacher must approve the request before execution.

Example:

```yaml
requires_approval: true
```

## review

Defines whether the result must be checked before use.

Example:

```yaml
review:
  required: true
  reviewer: critical_friend
  criteria:
    - aligned with Learning Design
    - no new pedagogical decisions
    - age-appropriate language
```

## routing

May be filled by the harness or application.

The Critical Friend usually leaves this empty.

Example:

```yaml
routing:
  role: worker_fast
  executed_by: <filled by harness>
```

## assumptions

Assumptions made by the Critical Friend or service.

## risks

Known risks or uncertainties.

---

# Generic Template

```yaml
id: <service-request-id>
status: proposed
service: <memory|knowledge|worker|renderer|review>
mode: <retrieve|research|draft|render|validate|summarize|propose>
created: <YYYY-MM-DD>
created_by: critical_friend

reason: >
  Explain why this service is needed now.
  Refer to the current Learning Design.

input:
  learning_design: workspace/<project-slug>/learning-design.md
  related_decision:
  related_activity:
  sources: []

expected_output:
  type:
  format:
  location:

constraints:
  language:
  audience:
  length:
  must:
    - 
  must_not:
    - 

return_to: critical_friend

priority: normal
model_hint:
requires_approval: true

review:
  required: true
  reviewer: critical_friend
  criteria:
    - aligned with Learning Design
    - no unsupported claims
    - no hidden pedagogical decisions

assumptions: []

risks: []
```

---

# Example 1: Worker Request

```yaml
id: worker-student-instruction-001
status: proposed
service: worker
mode: draft
created: 2026-07-03
created_by: critical_friend

reason: >
  The teacher has approved the decision to begin with a concrete AI dilemma.
  A first student-facing instruction is needed for the opening activity.

input:
  learning_design: workspace/ki-verantwortlich-nutzen/learning-design.md
  related_decision: Decision 1
  related_activity: Activity 1
  sources: []

expected_output:
  type: student_instruction
  format: markdown
  location: workspace/ki-verantwortlich-nutzen/drafts/student-instruction.md

constraints:
  language: de
  audience: grade 9
  length: max 200 words
  tone: clear, concrete, age-appropriate
  must:
    - address learners directly
    - make the dilemma concrete
    - avoid technical AI jargon
  must_not:
    - introduce a new learning goal
    - add a second method
    - decide the discussion outcome

return_to: critical_friend

priority: normal
model_hint: cheap_fast
requires_approval: true

source_policy:
  required: true
  allowed_sources:
    - provided_sources
    - knowledge_service
  model_internal_knowledge: not_allowed
  missing_sources_behavior: ask_for_source

review:
  required: true
  reviewer: critical_friend
  criteria:
    - aligned with approved dilemma decision
    - understandable for grade 9
    - supports ethical judgement
    - does not overexplain

assumptions: []

risks:
  - The dilemma may become too abstract if not grounded in a concrete situation.
```

---

# Example 2: Knowledge Request

```yaml
id: knowledge-nrw-ru-grade9-001
status: proposed
service: knowledge
mode: retrieve
created: 2026-07-03
created_by: critical_friend

reason: >
  The teacher wants to relate the Learning Design to Religious Education
  in NRW grade 9. Reliable curriculum knowledge is required before making
  curriculum-related claims.

input:
  query: Lehrplan Religionsunterricht NRW Klasse 9 Kompetenzbereich Verantwortung KI Ethik
  existing_knowledge_paths:
    - knowledge/curricula/
  learning_design: workspace/ki-verantwortlich-nutzen/learning-design.md

expected_output:
  type: knowledge_summary
  format: markdown
  location: workspace/ki-verantwortlich-nutzen/knowledge-proposals/nrw-ru-grade9.md

constraints:
  language: de
  must:
    - cite sources
    - distinguish verified curriculum text from interpretation
    - mark uncertainty
  must_not:
    - invent curriculum requirements
    - present unverified claims as fact
    - change the Learning Design

source_policy:
  required: true
  model_internal_knowledge: not_allowed
  missing_sources_behavior: >
    Mark missing sources explicitly.
    Do not invent curriculum, license or research claims.
    
return_to: critical_friend

priority: high
model_hint: source_grounded
requires_approval: false

review:
  required: true
  reviewer: critical_friend
  criteria:
    - sources are explicit
    - curriculum claims are verifiable
    - no unsupported statements

assumptions: []

risks:
  - Curriculum documents may differ by confession, school type or year.
```

---

# Example 3: Memory Request

```yaml
id: memory-similar-lessons-001
status: proposed
service: memory
mode: retrieve
created: 2026-07-03
created_by: critical_friend

reason: >
  The current Learning Design uses a dilemma-based entry into AI ethics.
  Previous teaching experiences with dilemma discussions may enrich the reflection.

input:
  learning_design: workspace/ki-verantwortlich-nutzen/learning-design.md
  memory_paths:
    - memory.local/
  focus:
    - dilemma discussion
    - AI ethics
    - grade 8 or 9
    - student engagement

expected_output:
  type: memory_patterns
  format: markdown
  location: workspace/ki-verantwortlich-nutzen/drafts/relevant-memory-patterns.md

constraints:
  language: de
  max_items: 3
  must:
    - summarize patterns, not dump anecdotes
    - mark personal experience as personal experience
  must_not:
    - expose sensitive student information
    - override the teacher's decision

return_to: critical_friend

priority: normal
model_hint: careful_reasoning
requires_approval: true

review:
  required: true
  reviewer: critical_friend
  criteria:
    - relevance to current Learning Design
    - no unnecessary personal data
    - concise enough for conversation

assumptions: []

risks:
  - Memory may bias the teacher toward repeating familiar methods.
```

---

# Example 4: Renderer Request

```yaml
id: renderer-liascript-001
status: proposed
service: renderer
mode: render
created: 2026-07-03
created_by: critical_friend

reason: >
  The Learning Design has been marked ready-for-rendering and the teacher
  approved LiaScript as the target format.

input:
  learning_design: workspace/ki-verantwortlich-nutzen/learning-design.md
  rendering_spec: specs/LIASCRIPT_SPEC.md
  artefacts:
    - workspace/ki-verantwortlich-nutzen/drafts/student-instruction.md
    - workspace/ki-verantwortlich-nutzen/drafts/reflection-task.md

expected_output:
  type: liascript_course
  format: markdown
  location: workspace/ki-verantwortlich-nutzen/rendered/liascript/course.md

constraints:
  language: de
  must:
    - follow specs/LIASCRIPT_SPEC.md
    - preserve the Learning Design
    - include learner-facing tasks in German
    - use LiaScript syntax correctly
  must_not:
    - add new pedagogical phases
    - change approved learning goals
    - invent sources or media

return_to: critical_friend

priority: normal
model_hint: format_conversion
requires_approval: true

review:
  required: true
  reviewer: critical_friend
  criteria:
    - follows rendering specification
    - no hidden didactic changes
    - syntactically valid LiaScript
    - language consistency

assumptions:
  - The LiaScript rendering specification has already been approved.

risks:
  - Interactive LiaScript features may tempt the renderer to add activities not present in the Learning Design.

```

---

# Example 5: Review Request

```yaml
id: review-draft-student-instruction-001
status: proposed
service: review
mode: validate
created: 2026-07-03
created_by: critical_friend

reason: >
  A Worker produced a first student instruction. It must be checked before
  it is shown to the teacher.

input:
  learning_design: workspace/ki-verantwortlich-nutzen/learning-design.md
  artefact: workspace/ki-verantwortlich-nutzen/drafts/student-instruction.md
  related_decision: Decision 1

expected_output:
  type: review_note
  format: markdown
  location: workspace/ki-verantwortlich-nutzen/drafts/review-student-instruction.md

constraints:
  language: de
  must:
    - check alignment with the Learning Design
    - identify hidden pedagogical decisions
    - check age-appropriate language
    - suggest concise improvements if needed
  must_not:
    - rewrite the whole artefact unless requested
    - introduce new goals

return_to: critical_friend

priority: normal
model_hint: careful_reasoning
requires_approval: false

review:
  required: false
  reviewer: critical_friend
  criteria: []

assumptions: []

risks: []
```

---

# Validation Checklist

Before executing a Service Request, check:

- The `service` value is valid.
- The reason refers to the Learning Design.
- Required input paths are present or clearly marked as missing.
- Expected output location is specified.
- Constraints are clear.
- The request does not ask a Worker or Renderer to make pedagogical decisions.
- If rendering is requested, an approved rendering specification exists.
- If knowledge is requested, source and citation expectations are explicit.
- If memory is requested, privacy and relevance are considered.
- The result returns to the Critical Friend.

---

# Rules for Agents

Do not silently switch modes.

When service work is needed, create a Service Request.

Do not hard-code model names in Service Requests.

Use `model_hint` only to describe the kind of execution needed.

Do not show raw service results directly to the teacher unless explicitly asked.

Review service results before using them in the conversation.

If the request is not well specified, ask one focused clarification question.

---

# Guiding Principle

A Service Request is not a technical detail.

It is a boundary marker.

It marks the moment when reflective conversation pauses one kind of work

and delegates another,

without losing pedagogical responsibility.
