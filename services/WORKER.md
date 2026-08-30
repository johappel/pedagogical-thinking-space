# Workers

Workers are role-bound DSH subagents that perform bounded background work. They
do not form a PTS runtime of their own.

## Roles

- `pts_research`: verifies public sources and reports evidence and uncertainty.
- `pts_edit`: applies exactly the agreed change to workspace documents.
- `pts_document`: records processes and outcomes as factual documentation.
- `pts_material`: creates reviewable drafts from an established intention.
- `pts_review`: checks alignment, factual support and hidden assumptions.
- `pts_renderer`: converts approved content into a target representation.

The canonical configuration lives in
`dsh-presets/pts-companion/agent.cordis.yml`. Each role has a fixed persona and
tool filter. DSH supplies the subagent, background job, status and result.

## Boundaries

Workers must not choose learning goals, educational values or final pedagogical
direction. They must not turn hypotheses into facts, modify `decisions.yml`,
approve Board items or adopt research into curated Knowledge.

Research outputs name sources, exact loci, dates, quality and uncertainty.
Material and rendering outputs are drafts. Review output is a verdict with
reasons, not a silent rewrite.

The Companion receives and interprets every result before presenting it to the
teacher.

