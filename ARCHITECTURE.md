# Architecture: PTS on DeepSeek Harness

## Binding decision

PTS is a pedagogical metaharness on DeepSeek Harness, not an alternative
harness. The prototype has no backward-compatibility requirement. Architectural
clarity takes precedence over preserving experimental runtime paths.

## Ownership boundary

| PTS owns | DSH owns |
| --- | --- |
| pedagogical stance and invariants | agent and preset composition |
| Learning Design and workspace schemas | subagent creation |
| worker role prompts and task constraints | tools and model routes |
| authorization and output boundaries | background jobs and status |
| validation of pedagogical artefacts | completion, cancellation and failure |
| teacher-facing projection | session history and compaction |

PTS plugins may integrate domain behavior with DSH events. They must call DSH
services rather than recreating their lifecycle.

## Runtime topology

```text
Teacher <-> pts-companion
                |
                +-- pts_research  --+
                +-- pts_material  ---+--> DSH subagents/jobs --> Companion
                +-- pts_review    ---+
                +-- pts_renderer  --+

completed top-level turn --> pts-background-steward --> reversible Denkstand patch
```

The Steward is not on the delegation path. An explicit task starts from the
Companion turn immediately. DSH emits the job identity and completion state.

## Deliberately absent

The target prototype contains no productive:

- `capabilities/registry.yml`;
- generic PTS dispatcher;
- PTS request queue or request lifecycle;
- Python Worker runtime;
- Capability Builder, Reviewer, Trial or Auto-Activation runtime;
- Steward-generated research or material service intents.

Capability Markdown files may describe domain expectations, but they are not
runtime registrations and cannot become executable through a PTS status flag.

## Acceptance criteria

1. A direct research order invokes `pts_research` during the same Companion
   turn with `run_in_background: true`.
2. A direct material order invokes `pts_material`; no Steward run is required.
3. DSH returns a job id and owns status, output and cancellation.
4. Research has web tools and may write only requested research drafts or
   Knowledge Proposals; material production has write tools but no web tools;
   review is read-only.
5. The Companion remains responsive while independent jobs run.
6. The Steward starts only after a completed top-level turn and changes only
   reversible Denkstand files.
7. A Steward timeout cannot prevent or delay a Worker job.
8. Repository checks reject the reintroduction of the removed runtime layers.
