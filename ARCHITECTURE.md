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
                +-- pts_edit      --+
                +-- pts_document  --+--> DSH subagents/jobs --> Companion
                +-- pts_material  --+
                +-- pts_review    ---+
                +-- pts_renderer  --+

completed top-level turn --> pts-background-steward --> reversible Denkstand patch
```

The Steward is not on the delegation path. An explicit task starts from the
Companion turn immediately. DSH emits the job identity and completion state.

### Companion system-prompt injection ("headroom")

Two preset-local plugins contribute read-only system-prompt sections to the
root Companion (workers are skipped):

- `pts-boot-docs` — a **compressed** digest of the PTS boot framework
  (teacher at the centre, Learning-Design layers/dramaturgy, production gate,
  conversation steering, epistemic discipline, worker boundaries).
- `pts-workspace-snapshot` — a live, compact **Denkstand** summary (status,
  open questions, planning board, decisions, fragments) so the Companion reuses
  existing results instead of restarting research.

This keeps the Companion "conscious" of framework and workspace without a
second dispatcher: both are DSH-native `systemPrompt.section(...)` injections,
and the full source documents remain readable on demand.

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
   Knowledge Proposals; material, edit and documentation production have
   write tools but no web tools; review is read-only.
5. The Companion's own Agent scope exposes no web, skill, write or edit path;
   the DSH Worker tools are the only execution boundary for those operations.
6. Every Session created through the PTS Workspace UI explicitly names the
   `pts-companion` preset instead of inheriting a machine-wide default.
7. The Companion remains responsive while independent jobs run.
8. The Steward starts only after a completed top-level turn and changes only
   reversible Denkstand files.
9. A Steward timeout cannot prevent or delay a Worker job.
10. Repository checks reject the reintroduction of the removed runtime layers.
11. The root Companion's system prompt includes the compressed boot-framework
    digest (`pts-boot-docs`) and a live Denkstand snapshot
    (`pts-workspace-snapshot`) each turn; worker subagents receive neither.
12. The Companion checks existing workspace results before starting new
    research and reuses them instead of restarting.
13. The Companion applies the production gate: it does not rewrite the learning
    design or produce material during the clarifying phase, and it parks
    unresolved open questions in the planning board while following the
    teacher's actual direction.
