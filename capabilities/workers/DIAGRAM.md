
## Beispiel: `capabilities/workers/DIAGRAM.md`

```markdown
# Worker Capability: Diagram

## Purpose

Create explanatory diagrams, concept maps, process graphics or visual structures from an approved Learning Design.

## Allowed Tasks

The Diagram Worker may:

- create flow diagrams,
- create concept maps,
- create comparison diagrams,
- create sequence diagrams,
- create Mermaid diagrams,
- create SVG drafts,
- describe visual layouts.

## Forbidden Tasks

The Diagram Worker must not:

- add new didactic phases,
- simplify theological or ethical concepts into misleading binaries,
- replace reflection with decorative visuals,
- create diagrams without a clear learning purpose.

## Required Input

- Learning Design
- learning moment or activity
- diagram purpose
- target audience
- desired format
- key concepts
- constraints

## Output Locations

```text
workspace/<project-slug>/drafts/diagrams/
workspace/<project-slug>/rendered/<format>/assets/