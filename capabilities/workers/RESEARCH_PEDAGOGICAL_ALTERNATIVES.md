# Worker Capability: Research Pedagogical Alternatives

## Capability id

`research_pedagogical_alternatives`

## Purpose

Find and compare a small number of source-grounded pedagogical approaches or materials that illuminate a defined tension in an existing Learning Design.

The capability is designed for perspective expansion, not catalogue search and not automatic material adoption.

## Allowed tasks

The Worker may:

- identify one near-fit and one contrasting approach;
- locate concrete materials when they are relevant to the comparison;
- analyse the likely didactic function of each approach or material;
- identify assumptions about learners, knowledge, sequence, participation, time and assessment;
- identify prerequisites and connections before and after the material;
- estimate adaptation effort and ripple effects in the current Learning Design;
- classify use as `inspiration`, `building_block` or `guiding_structure`;
- report source quality, provenance, licence/access information and uncertainty;
- recommend whether to use, adapt only the didactic core idea, or retain solely as a reflective contrast.

## Forbidden tasks

The Worker must not:

- decide the pedagogical direction;
- produce a broad unranked material list;
- change the Learning Design or Learning Landscape;
- speak for learners or other absent people;
- infer diagnoses or motives;
- treat popularity or visual polish as evidence of quality;
- conceal a major redesign as a small material substitution;
- or write search results directly into curated Knowledge.

## Required input

```yaml
learning_design: workspace/<project-slug>/learning-design.md
learning_landscape: workspace/<project-slug>/learning-landscape.md
board_item_id: <approved research item>
pedagogical_tension: <specific design tension>
existing_approach: <brief current approach>
related_moments: []
source_requirements: []
research_scope:
  near_fit: 1
  contrast: 1
  maximum_sources: 6
  include_concrete_materials: true
permission:
  type: board_item | bounded_session
  reference: <approval reference>
```

## Output format

The output is a concise `pedagogical_alternatives_brief`:

```markdown
# Pedagogical alternatives brief

## Current approach as understood

## Near-fit alternative
- Core idea
- Didactic function
- Embedded assumptions
- Prerequisites
- Source quality and uncertainty
- Possible material
- Suggested use type
- Integration costs
- Ripple effects

## Contrasting alternative
- Core idea
- Didactic function
- Embedded assumptions
- Prerequisites
- Source quality and uncertainty
- Possible material
- Suggested use type
- Integration costs
- Ripple effects

## Comparison with the current Learning Design

## Recommendation to the Companion
- use
- adapt core idea only
- reflective contrast only

## Sources and access/licensing notes
```

## Review criteria

A satisfactory result:

- responds to the pedagogical tension rather than merely the topic;
- contains exactly the requested bounded number of alternatives;
- includes at least one meaningful contrast;
- separates source-grounded information from interpretation;
- makes integration work and possible gaps visible;
- does not imply that a found material is context-free;
- and can be summarised by the Companion without giving the teacher another large selection task.

## Storage

The draft is stored in:

```text
workspace/<project-slug>/drafts/<board-item-id>-alternatives.md
```

It returns to the Companion and the related Board item moves to `review`. It never becomes classroom-ready material automatically.
