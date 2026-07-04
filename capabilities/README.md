# Capabilities

> Extensible abilities for services inside the Pedagogical Thinking Space.

---

# Purpose

Capabilities describe what a service can do in a concrete task area.

Services are stable.

Capabilities are extensible.

The core services are defined in:

```text
services/
```

Examples:

- Memory
- Knowledge
- Worker
- Renderer

Capabilities add specific abilities to those services without changing the core architecture.

Example:

```text
Worker
  |- Image Generation
  |- Diagram Creation
  |- Metrics Analysis
  |- Worksheet Drafting
  `- Quiz Drafting
```

---

# Core Principle

A Capability is not a new service.

A Capability is a concrete way in which an existing service may act.

The Worker remains the Worker.

`IMAGE_GENERATION.md` only describes how the Worker handles image generation tasks.

The Renderer remains the Renderer.

A future `LIASCRIPT_RENDERING.md` would only describe how the Renderer handles LiaScript output.

---

# Why Capabilities Exist

Without Capabilities, every new task would require a new service.

That would make the architecture unstable.

Capabilities allow the system to grow without changing the core model.

Instead of creating:

```text
Image Worker
Diagram Worker
Metrics Worker
Quiz Worker
Worksheet Worker
```

the system keeps one Worker service and adds Worker Capabilities.

---

# Directory Structure

```text
capabilities/
  README.md
  workers/
    README.md
    IMAGE_GENERATION.md
    DIAGRAM.md
    METRICS.md
    _proposals/
```

Future service capability areas may be added when needed:

```text
capabilities/
  knowledge/
  renderers/
  reviewers/
```

Do not create new capability areas unless there is a clear need.

---

# Worker Capabilities

Worker Capabilities are stored in:

```text
capabilities/workers/
```

They describe specific implementation abilities of the Worker service.

Examples:

- creating image prompts or generated images,
- creating diagrams,
- analyzing anonymized learning evidence,
- drafting worksheets,
- drafting quizzes,
- preparing presentation material,
- formatting student instructions.

Worker Capabilities must not make pedagogical decisions.

They only implement approved decisions from the Learning Design.

---

# Capability Documents

Each Capability document should define:

- purpose,
- allowed tasks,
- forbidden tasks,
- required input,
- output format,
- storage location,
- safety rules,
- review criteria,
- optional runtime or tool requirements.

A Capability should be specific enough to guide a weaker model.

It should be short enough to be used during execution.

---

# Relationship to Service Requests

Service Requests may reference a Capability.

Example:

```yaml
service: worker
mode: generate
capability: capabilities/workers/IMAGE_GENERATION.md
```

The Service Request defines the task.

The Capability defines how that kind of task should be handled.

Worker Service Requests should include a capability path when a matching capability exists.

The service result returns to the Critical Friend before it becomes teacher-facing.

---

# Creating a New Capability

If a needed Capability does not exist, the agent must not silently improvise one.

Instead, it should either ask the teacher or create a proposal in:

```text
capabilities/workers/_proposals/
```

A proposal should be reviewed before it becomes an active Capability.

---

# Capability Proposal Template

```markdown
# Worker Capability Proposal: <Name>

## Purpose

What kind of task should this Capability support?

## Why It Is Needed

Why is this not already covered by an existing Capability?

## Allowed Tasks

The Worker may:

-

## Forbidden Tasks

The Worker must not:

-

## Required Input

- Learning Design
- related decision
- related activity
- constraints

## Output

Expected output format and location.

## Safety Rules

What must be prevented?

## Review Criteria

How should the Critical Friend or Reviewer check the result?

## Status

Status: proposed
```

---

# Rules for Agents

Before delegating to a Worker, check:

```text
capabilities/workers/
```

Use an existing Capability if available.

If no suitable Capability exists, propose a new one instead of improvising.

Do not create new services for every task type.

Do not execute a Capability without a Service Request.

Do not show raw Worker output directly to the teacher.

---

# Guiding Principle

Services define responsibility.

Capabilities define ability.

The Pedagogical Thinking Space stays stable because services remain few

and capabilities can grow carefully.
