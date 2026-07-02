# LEARNING_DESIGN_SCHEMA.md

> Schema for concrete Learning Design documents.
>
> This file defines how a Learning Design should be written inside a project workspace.

---

# Purpose

A Learning Design is the central working document of the Pedagogical Thinking Space.

It is not a lesson plan.

It is not a rendered output.

It is the shared pedagogical thinking model developed by the teacher and the Critical Friend.

Every Worker and Renderer operates from this document.

---

# Location

Concrete Learning Designs should be stored in:

```text
workspace/<project-slug>/learning-design.md
```

Example:

```text
workspace/ki-verantwortlich-nutzen/learning-design.md
```

---

# Status

Every Learning Design must include a status.

Allowed values:

```text
draft
in-reflection
decision-needed
ready-for-worker
ready-for-rendering
rendered
archived
```

## Meaning

### draft

The Learning Design has just started.

### in-reflection

The teacher and Critical Friend are still clarifying the design.

### decision-needed

An important pedagogical decision is still open.

### ready-for-worker

A specific part can be delegated to a Worker.

### ready-for-rendering

The Learning Design is stable enough to be expressed in a target format.

### rendered

At least one output has been produced.

### archived

The Learning Design is no longer active.

---

# Required Structure

Every `learning-design.md` should follow this structure.

```markdown
# Learning Design: <Title>

## Metadata

## Current Status

## Short Summary

## Context

## Learners

## Educational Intention

## Learning Journey

## Key Learning Moments

## Design Decisions

## Open Questions

## Activities

## Materials and Sources

## Differentiation and Inclusion

## Assessment and Evidence of Learning

## Reflection

## Worker Tasks

## Rendering Targets

## Change Log
```

---

# Template

Use this template when creating a new Learning Design.

```markdown
# Learning Design: <Title>

## Metadata

- Project slug:
- Created:
- Last updated:
- Teacher:
- Subject:
- Grade / age group:
- Context:
- Time frame:
- Language:
- Intended output formats:

---

## Current Status

Status: draft

Current focus:

-

Next useful step:

-

---

## Short Summary

Briefly describe the learning experience in 3–5 sentences.

This summary should be understandable without reading the whole document.

---

## Context

Describe the educational setting.

Possible aspects:

- school type
- subject
- grade level
- class situation
- available time
- institutional constraints
- curriculum context
- previous lessons
- upcoming lessons
- available tools or media

---

## Learners

Describe what is relevant about the learners.

Possible aspects:

- prior knowledge
- interests
- questions
- misconceptions
- emotional situation
- language level
- learning needs
- group dynamics
- accessibility needs

Avoid unnecessary personal data.

Only include what matters for the Learning Design.

---

## Educational Intention

Describe what should change through this learning experience.

Not only:

- What should learners know?

But also:

- What should they understand?
- What should they be able to do?
- What should they question?
- What should they experience?
- What should they become aware of?

Possible formulation:

> Learners should move from ...
>
> toward ...

---

## Learning Journey

Describe the intended movement of learning.

Possible questions:

- Where do learners begin?
- What is the initial irritation, question or challenge?
- What do they encounter?
- Where do they make a decision?
- Where might uncertainty arise?
- What becomes clearer?
- What remains open?
- Where does the journey end?

This section is more important than the method list.

---

## Key Learning Moments

List the most important moments in the learning journey.

Each moment should include:

```markdown
### Moment <number>: <Name>

Purpose:

What happens:

Why it matters:

Possible risk:
```

Example:

```markdown
### Moment 1: Encountering the dilemma

Purpose:
Learners experience that AI use is not only a technical question but an ethical one.

What happens:
They are confronted with a concrete situation in which an AI-generated recommendation affects another person.

Why it matters:
The dilemma creates a need for judgement before abstract concepts are introduced.

Possible risk:
The discussion may become too general if the situation is not concrete enough.
```

---

## Design Decisions

Record important decisions.

Use this format:

```markdown
### Decision <number>: <Title>

Decision:

Reason:

Alternatives considered:

Why alternatives were not chosen:

Status:
```

Example:

```markdown
### Decision 1: Start with a dilemma instead of a technical explanation

Decision:
The learning experience begins with a concrete ethical dilemma.

Reason:
The learners should first experience the need for judgement before discussing AI concepts.

Alternatives considered:
- Start with a video
- Start with a definition of AI
- Start with a quiz

Why alternatives were not chosen:
A video might frame the issue too strongly before learners develop their own position.

Status:
approved
```

Allowed decision status values:

```text
proposed
approved
rejected
revisit-later
```

---

## Open Questions

Open questions are valuable.

Do not hide uncertainty.

Use this format:

```markdown
### Question <number>: <Question>

Why it matters:

Possible directions:

Current tendency:

Decision needed by:
```

---

## Activities

Activities are concrete methods or tasks.

They must be connected to the Learning Journey.

Use this format:

```markdown
### Activity <number>: <Name>

Related learning moment:

Purpose:

Method:

Teacher role:

Learner task:

Expected learner response:

Risks:

Support:

Extension:

Status:
```

Allowed activity status values:

```text
idea
needs-reflection
ready-for-worker
drafted
reviewed
approved
```

---

## Materials and Sources

List required or possible materials.

Use this format:

```markdown
### Material <number>: <Title>

Type:
Source:
License:
Purpose:
Used in:
Notes:
```

If sources are uncertain, mark them clearly.

Do not invent licenses.

---

## Differentiation and Inclusion

Describe how the Learning Design supports different learners.

Use two required columns:

| Unterstützung | Erweiterung |
|---|---|
|  |  |

Possible aspects:

- language support
- cognitive support
- emotional safety
- alternative access routes
- additional challenge
- deeper transfer
- creative extension

---

## Assessment and Evidence of Learning

Describe how learning becomes visible.

This does not need to be formal grading.

Possible forms:

- learner statement
- reflection note
- discussion contribution
- product
- decision
- exit ticket
- concept map
- peer feedback
- teacher observation

Use this format:

```markdown
### Evidence <number>: <Name>

What becomes visible:

How it is captured:

How it relates to the Educational Intention:
```

---

## Reflection

This section is updated during or after planning and teaching.

Use it for professional learning.

Possible prompts:

- What became clearer during planning?
- What assumption was challenged?
- What should be remembered for future designs?
- What would be changed next time?
- What pattern might be emerging?

---

## Worker Tasks

Worker Tasks are implementation tasks.

They may only be created after a design decision exists.

Use this format:

```markdown
### Worker Task <number>: <Title>

Status:
Related decision:
Related activity:
Task:
Expected output:
Constraints:
Output location:
Review needed:
```

Allowed Worker Task status values:

```text
proposed
approved
in-progress
drafted
reviewed
discarded
done
```

---

## Rendering Targets

Rendering Targets describe possible output formats.

Rendering requires an approved rendering specification in `specs/`.

Use this format:

```markdown
### Rendering Target <number>: <Format>

Status:
Renderer:
Specification:
Output location:
Purpose:
Audience:
Notes:
```

Allowed Rendering Target status values:

```text
proposed
spec-needed
spec-drafted
approved
rendered
needs-revision
```

Example:

```markdown
### Rendering Target 1: LiaScript

Status: spec-needed
Renderer: LiaScript
Specification: specs/LIASCRIPT_SPEC.md
Output location: workspace/ki-verantwortlich-nutzen/rendered/liascript/
Purpose: Interactive self-paced course
Audience: Grade 9 learners
Notes:
The renderer must preserve the dialogical and reflective character of the Learning Design.
```

---

## Change Log

Record important changes.

```markdown
### <YYYY-MM-DD>

Changed:

Reason:

By:
```

---

# Validation Checklist

Before a Learning Design may be marked `ready-for-worker`, check:

- The educational intention is clear.
- The learner context is described.
- At least one design decision is approved.
- Open questions are visible.
- Worker tasks are connected to approved decisions.
- Activities are connected to learning moments.
- Differentiation includes support and extension.
- Sources and licenses are not invented.

Before a Learning Design may be marked `ready-for-rendering`, check:

- The Learning Journey is coherent.
- Key activities are approved or sufficiently drafted.
- Required materials are available or explicitly marked as missing.
- Assessment or evidence of learning is described.
- Open questions do not block rendering.
- A rendering target is defined.
- A rendering specification exists or must be drafted.
- The teacher has approved rendering.

---

# Rules for Agents

Do not create final outputs directly from conversation.

First create or update the Learning Design.

Do not mark a Learning Design as `ready-for-worker` unless at least one design decision has been approved.

Do not mark a Learning Design as `ready-for-rendering` unless the teacher has confirmed that the design is stable enough.

Do not hide uncertainty.

Do not invent missing curriculum references, licenses or sources.

When in doubt, ask one focused question.

---

# Guiding Principle

A Learning Design is not finished when everything has been written down.

It is ready when the teacher and Critical Friend understand why the learning experience should work.
