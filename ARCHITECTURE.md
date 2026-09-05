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
                +-- pts_edit (direct, structured, guarded)
                +-- pts_research  --+   continuable background
                +-- pts_document  --+   continuable background
                +-- pts_material  --+   continuable background
                +-- pts_review    --+   continuable background
                +-- pts_renderer  --+   continuable background
                +-- pts_edit_legacy -- one-shot rollback path
                    native DSH subagents via ctx.subagents --> Companion

completed top-level turn --> pts-background-steward --> reversible Denkstand patch
```

The Steward is not on the delegation path. An explicit task starts from the
Companion turn immediately. DSH emits the child identity and completion state.

Background and continuable are different properties. Background means that
the teacher and Companion do not wait for execution. Continuable means that
the same specialist can receive a later prompt for the same subject and reuse
its child Session. PTS uses DSH's native `startContinuable()` and
`send_message`; it does not add a dispatcher, queue or lifecycle manager.

The direct `pts_edit` capability is intentionally narrower than a file tool:
it can add a proposed open question to `planning-board.yml` or record a
teacher-confirmed decision in `decisions.yml` for the current Denkraum. It
uses fixed targets, input limits, PTS-root validation and atomic replacement.
Large conceptual edits, materials and unresolved pedagogy remain conversation
or worker work. The legacy child remains installed as `pts_edit_legacy` until
the direct path has passed live acceptance.

DSH `0.1.2-rc.1` currently exposes no public close/delete operation for a
continuable child. `interrupt_agent` stops only the current turn; the durable
child remains `ready` for a later follow-up. PTS therefore keeps the native
interruption/settlement behavior and does not build idle cleanup or a
scheduler; parent/session teardown remains DSH-owned.

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
   turn with `run_in_background: true` or its continuable default.
2. A direct material order invokes `pts_material`; no Steward run is required.
3. DSH returns a child id and owns status, output, continuation and
   interruption.
4. Research has web tools and may write only requested research drafts or
   Knowledge Proposals; material, edit and documentation production have
   write tools but no web tools; review is read-only.
5. The Companion's own Agent scope exposes no web, skill, write or generic edit
   path; the structured direct `pts_edit` and DSH Worker tools are the only
   PTS execution boundaries for mutation.
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
14. A follow-up for the same subject uses the existing continuable child id;
    a different subject starts a new child. PTS does not promise automatic
    deletion of settled continuable Sessions because DSH does not expose it.
