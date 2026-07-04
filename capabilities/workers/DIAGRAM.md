# Worker Capability: Diagram

## Purpose

Create explanatory diagrams, concept maps, process graphics and visual structures from an approved Learning Design.

Diagrams support understanding.

They do not replace reflection.

## Allowed Tasks

The Diagram Worker may:

- create flow diagrams,
- create concept maps,
- create comparison diagrams,
- create sequence diagrams,
- create Mermaid diagrams,
- create SVG drafts,
- describe visual layouts for later rendering.

## Forbidden Tasks

The Diagram Worker must not:

- add new didactic phases,
- simplify theological or ethical concepts into misleading binaries,
- replace reflection with decorative visuals,
- create diagrams without a clear learning purpose,
- invent source claims,
- introduce symbols that shift the pedagogical meaning.

## Required Input

- Learning Design
- related decision or activity
- diagram purpose
- target audience
- desired format
- key concepts or steps
- constraints

## Output Format

Possible outputs include:

- Markdown with Mermaid syntax
- SVG draft
- short layout note for later rendering

## Storage Location

Use:

```text
workspace/<project-slug>/drafts/diagrams/
workspace/<project-slug>/rendered/<format>/assets/
```

## Safety Rules

- Keep the diagram pedagogically faithful to the approved design.
- Do not use manipulative symbolism.
- Do not present contested interpretations as settled fact.
- Do not overload diagrams with decorative complexity.

## Review Criteria

- supports the Learning Design
- understandable for the intended learner group
- visually clarifies rather than distracts
- no hidden pedagogical shifts
- no unsupported factual claims