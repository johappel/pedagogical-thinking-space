# pts-companion preset

This preset is the executable DSH boundary of the PTS prototype. It exposes
five continuable specialist workers plus the continuable Documentarian as
differently constrained instances of DSH's native subagent tool, and one
retained one-shot edit fallback. Children
inherit the parent composition in the current DSH architecture, so role
separation is expressed through a fixed persona, tool filter and model route on
each tool instance rather than through a PTS dispatcher.

The Companion itself is instructed not to use web or generic mutation tools
directly. Its only direct mutation surface is the structured `pts_edit` tool:
fixed PTS targets for a proposed open question or a teacher-confirmed
decision. The raw write/edit tools remain in the composition because a spawned
child can only be restricted from tools its parent composition already
contains.

`companion-tool-boundary.mjs` guards every direct execution of those tools
(skill, web_search, web_fetch, write, edit, pts_edit_legacy, bash, pwsh,
workflow, subagent)
with an actionable delegation directive naming the matching worker per task
type, so the model starts `pts_research` / `pts_edit_legacy` / `pts_document` /
`pts_documentarian` / `pts_material` immediately instead of answering "not
possible". Observed
finding: in this DSH build the per-agent tool `restrict` may leave the tools
visible in the schema while the guard still blocks execution — the persona and
the guard message therefore both mandate delegation.

The same guard **structurally blocks `pts_edit` calls that target the
canonical design** (`learning-design.md`, `learning-landscape.md`, `materials/`
— by path or by a write-intent on "learning design") during the
clarifying/planning phase. The Learning Design is co-authored with the teacher;
the Companion may record agreed points in `planning-board.yml` / `decisions.yml`
via `pts_edit`. The Documentarian is a separate, explicitly invoked worker for
workspace consistency and provenance checks; it does not replace the direct
edit path. This enforces the production gate at the tool boundary, not only in
the persona.

The five specialist calls and the Documentarian are continuable background DSH
children. DSH returns
their durable child id; native `send_message` continues the same child and
`interrupt_agent` stops its current turn. DSH has no public close/delete API
for these durable children, so do not add a PTS job layer, scheduler or
garbage collector. The old edit child is retained as `pts_edit_legacy` and
stays one-shot as a rollback path until live direct-edit acceptance.

## Companion system-prompt injection ("headroom")

The root Companion is only aware of workspace or framework content it actively
reads, which made it under-engage the teacher. Two preset-local plugins inject
context into the Companion's system prompt so it operates from the framework
instead of rediscovering it every turn. Both target the root Companion only
(worker subagents are skipped) and use the same `ctx.systemPrompt.section(...)`
pattern as `worker-skill-scope.mjs`.

- `pts-boot-docs` (`boot-docs.mjs`) — injects a **compressed** PTS framework
  digest (~4–5 KB) covering the five core documents (`CRITICAL_FRIEND.md`,
  `SYSTEMIC_STANCE.md`, `LEARNING_DESIGN.md`, `MANIFEST.md`, `ORCHESTRATION.md`):
  the teacher at the centre, the Learning-Design layers/dramaturgy, the
  production gate (no premature material or design edits until a shared depth of
  thought), conversation steering, epistemic discipline and worker boundaries.
  `AGENTS.md` is deliberately omitted (it is already auto-injected as workspace
  instructions) and the `services/*.md` are not injected (covered by the other
  docs). The digest is a snapshot constant — update it here when the source
  documents change; the full texts remain readable on demand via their absolute
  paths.
- `pts-workspace-snapshot` (`workspace-snapshot.mjs`) — injects a live, compact
  **Denkstand** summary each turn: learning-design status/focus/open questions,
  planning-board and decisions state, temporal-plan/landscape counts, and the
  existing fragments under `drafts/`, `materials/`, `knowledge-proposals/` and
  `rendered/`. This is what lets the Companion reuse existing research instead
  of restarting it.

The Companion persona (`persona` row in `agent.cordis.yml`) additionally encodes
behavioural rules: keep the free conversation while a background worker runs
(`run_in_background: true`), check existing results before starting new
research, and apply the production gate / teacher-led conversation steering
(no insistence, park unresolved open questions in the planning board, follow
the teacher's actual direction).

Because an agent composition is fixed at session start, all prompt changes here
require a fresh session ("Denkraum neu laden") to take effect.

## Skills (pts-skill-manager)

The preset mounts DSH's own skill stack scoped to PTS: `skill-filesystem`
(`includeDefaultRoots: false`, `customSkillDirs` -> the repo `skills/`
directory; the installer substitutes the `@PTS_SKILLS_DIR@` placeholder) plus
`tool-skill`. The `skill` tool is allowed only in the research and material
tool filters; review/renderer stay without it and the Companion remains blocked
by `companion-tool-boundary.mjs`.

`worker-skill-scope.mjs` enforces the role↔skill matrix from the settings
section `pts-worker-skills:`: it detects the worker role from the applied tool
filter, hard-rejects `skill` calls for non-assigned ids via a per-agent guard
and names the assigned skills in a system-prompt section. It reads the settings
document directly from the row-config path (`settingsPath`, substituted by the
installer) because a subagent context cannot reach the host `settings` service.
Assignment changes take effect for newly started workers (composition is fixed
at session start); use the manager's "Denkraum neu laden" action for a fresh
session.
