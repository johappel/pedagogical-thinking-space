# pts-companion preset

This preset is the executable DSH boundary of the PTS prototype. It exposes
four differently constrained instances of DSH's native subagent tool. Children
inherit the parent composition in the current DSH architecture, so role
separation is expressed through a fixed persona, tool filter and model route on
each tool instance rather than through a PTS dispatcher.

The Companion itself is instructed not to use web or mutation tools directly.
Those tools remain in the composition because a spawned child can only be
restricted from tools its parent composition already contains.

Background calls are one-shot DSH jobs. Use `job_output`, `job_status` and
`job_kill` from the shipped DSH job tools; do not add a PTS job layer.

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
and names the assigned skills in a system-prompt section. Assignment changes
take effect for newly started workers (composition is fixed at session start);
use the manager's "Denkraum neu laden" action for a fresh session.


