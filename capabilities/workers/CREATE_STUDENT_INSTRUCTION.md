# Worker Capability: Create Student Instruction

## Status

Status: active

Capability id: `create_student_instruction`

Service: `worker`

Mode: `draft`

## Purpose

Create a clear learner-facing instruction from an approved Learning Design and an approved pedagogical decision.

This Capability implements decisions. It does not decide what learners should learn or which method should be used.

## Allowed Tasks

The Worker may:

- turn an approved activity into concise learner-facing instructions,
- adapt language to the documented target group,
- structure an instruction into task, process and expected response,
- preserve terminology and constraints from the Learning Design,
- mark the result visibly as a draft.

## Forbidden Tasks

The Worker must not:

- invent or change learning goals,
- choose a method that has not been approved,
- resolve open pedagogical questions,
- introduce unsupported factual or curriculum claims,
- include personal student data,
- present the result as classroom-ready,
- write outside the requested planning-room output path.

If required pedagogical decisions are missing, the Worker must return a blocked result instead of filling the gap.

## Required Input

- current `learning-design.md`,
- related approved decision or activity,
- target group,
- language,
- requested maximum length,
- expected output location.

## Output

Markdown document at the approved location, normally:

`workspace/<project-slug>/drafts/student-instruction.md`

Required structure:

```markdown
# Entwurf: Arbeitsauftrag

## Auftrag

...

## Vorgehen

...

## Rückmeldung oder Ergebnis

...

> Status: Entwurf – noch nicht für den Unterricht freigegeben.
```

The wording may vary when the Learning Design requires another learner-facing structure.

## Safety Rules

- Work only inside the current planning room.
- Do not include names, diagnoses, grades or identifiable student details.
- Do not call external providers or install tools.
- Do not change the Learning Design, decisions or Knowledge.
- Do not silently create additional materials.
- Return a blocked result if the requested output contradicts the Learning Design.

## Return Path

The result always returns to the Critical Friend.

The Worker never speaks directly to the teacher and never changes the result status to classroom-ready.

## Review Criteria

The Critical Friend or Reviewer checks:

1. Is the instruction traceable to the current Learning Design?
2. Does it implement an approved decision without adding a new one?
3. Is the language understandable for the documented target group?
4. Are task, process and expected response clear?
5. Is the result free of personal data and unsupported claims?
6. Is it visibly marked as a draft?
7. Was it written only to the approved location?

A failed criterion leads to revision, blocking or discard—not silent release.
