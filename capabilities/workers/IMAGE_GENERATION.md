# Worker Capability: Image Generation

## Purpose

Create visual material from an approved Image Generation Service Request.

The images support a Learning Design.

They are drafts until reviewed.

## Allowed Tasks

The Image Generation Worker may:

- refine image prompts,
- create image sets,
- create negative prompts,
- generate image metadata,
- prepare image files through a configured runtime,
- suggest review criteria.

## Forbidden Tasks

The Image Generation Worker must not:

- introduce new pedagogical goals,
- change the approved activity,
- create propaganda aesthetics,
- use real persons,
- depict identifiable minors,
- include extremist symbols,
- include readable hate speech,
- create shock images,
- produce humiliating or stereotypical depictions.

## Required Input

- Learning Design
- related activity
- pedagogical purpose
- image prompts or prompt brief
- visual constraints
- safety constraints
- output location

## Output

Generated image drafts should be stored in:

`workspace/<project-slug>/drafts/images/`

Each image should have metadata:

```text
image-01-title.png
image-01-title.meta.yml