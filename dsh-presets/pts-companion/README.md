# pts-companion preset

This preset is the executable DSH boundary of the PTS prototype. It exposes
six differently constrained instances of DSH's native subagent tool. Children
inherit the parent composition in the current DSH architecture, so role
separation is expressed through a fixed persona, tool filter and model route on
each tool instance rather than through a PTS dispatcher.

The Companion itself is instructed not to use web or mutation tools directly.
Those tools remain in the composition because a spawned child can only be
restricted from tools its parent composition already contains.

`companion-tool-boundary.mjs` guards every direct execution of those tools
(skill, web_search, web_fetch, write, edit, bash, pwsh, workflow, subagent)
with an actionable delegation directive naming the matching worker per task
type, so the model starts `pts_research` / `pts_edit` / `pts_document` /
`pts_material` immediately instead of answering "not possible". Observed
finding: in this DSH build the per-agent tool `restrict` may leave the tools
visible in the schema while the guard still blocks execution — the persona and
the guard message therefore both mandate delegation.

The same guard **structurally blocks `pts_edit` calls that target the
canonical design** (`learning-design.md`, `learning-landscape.md`, `materials/`
— by path or by a write-intent on "learning design") during the
clarifying/planning phase. The Learning Design is co-authored with the teacher;
the Companion may record agreed points in `planning-board.yml` / `decisions.yml`
via `pts_edit`, while the Background Steward maintains the reversible
`learning-design.md` state after the turn. This enforces the production gate at
the tool boundary, not only in the persona.

Background calls are one-shot DSH jobs. Use `job_output`, `job_status` and
`job_kill` from the shipped DSH job tools; do not add a PTS job layer.

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


