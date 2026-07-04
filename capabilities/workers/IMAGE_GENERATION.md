# Worker Capability: Image Generation

## Purpose

Create visual material from an approved Worker Service Request.

Images support the Learning Design.

They remain drafts until reviewed.

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
- related activity or decision
- pedagogical purpose
- image prompt or prompt brief
- visual constraints
- safety constraints
- output location

## Output Format

Typical outputs include:

- prompt set
- negative prompt set
- generated image files
- metadata file per image

## Storage Location

Generated image drafts should be stored in:

```text
workspace/<project-slug>/drafts/images/
```

Each image should include metadata such as:

```text
image-01-title.png
image-01-title.meta.yml
```

## Safety Rules

- No real or identifiable learners.
- No political propaganda aesthetics.
- No extremist, hateful or dehumanizing imagery.
- No hidden symbolic messaging that changes the pedagogical intention.
- No unnecessary emotional pressure through fear, humiliation or shock.

## Review Criteria

- supports the Learning Design
- suitable for the intended learner group
- no propaganda aesthetics
- no hidden political symbols
- no stereotypes or humiliating depictions
- no unnecessary emotional pressure
- no identifiable real persons