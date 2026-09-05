# PTS Documentarian

The PTS Documentarian is a normal `@deepseek-ai/dsh-tool-subagent` instance
named `pts_documentarian`. It is configured in the `pts-companion` preset as
`backgroundMode: continuable`, with background execution enabled and
`maxDepth: 0`.

## Responsibility

The Documentarian preserves the current workspace as a complete, consistent
and traceable record. It may inspect:

- the current Learning Design and Learning Landscape;
- decisions, open questions and planning work;
- accepted worker results and their provenance;
- stale references, missing status links and unambiguous documentation gaps.

It may make minimal, evidence-backed edits inside the active workspace when
the Companion explicitly requests a documentation sync or gives an accepted
result an explicit documentation target. It reports exact paths and changes.

## Non-responsibilities

The Documentarian must not:

- make or imply a pedagogical decision;
- turn a hypothesis, suggestion or ambiguous statement into a fact;
- mark a Learning Moment `stable` or approve a Board item;
- adopt a worker result as pedagogical truth without teacher acceptance;
- research externally, start another worker or act as a dispatcher;
- curate `knowledge/` or create a Knowledge Proposal;
- write outside the active `workspace/<slug>/` scope;
- delete or broadly rewrite workspace artefacts.

If evidence is ambiguous, it returns a documentation gap and leaves the
affected files unchanged. `pts_edit` remains the Companion's path for small,
already clarified Denkstand changes.

## Invocation and continuation

There is no post-turn scheduler or independent host plugin. The Companion
starts the Documentarian for an explicit consistency request, after several
related changes, or after an accepted worker result needs its status or
provenance recorded. A follow-up for the same workspace subject reuses the
native DSH continuable child via `send_message`; a different subject starts a
new child. DSH owns status, interruption and the currently unavailable close /
delete lifecycle.

The Documentarian's tool filter is limited to `read`, `glob`, `grep`, `write`
and `edit`. It has no web, skill, free delegation or external-tool access.
