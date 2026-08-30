# Worker Task Notes

These files describe pedagogical expectations for recurring Worker tasks. They
are prompt references, not executable registrations.

The executable roles are the native DSH tools `pts_research`, `pts_edit`,
`pts_document`, `pts_material`, `pts_review` and `pts_renderer` from
`dsh-presets/pts-companion/agent.cordis.yml`. The Companion may extract useful
constraints from a note and include them in the DSH subagent prompt.

There is no registry status, proposal lifecycle or automatic activation. A new
note changes documentation only. If a new tool boundary or model route is
needed, change and test the DSH preset explicitly.

Current notes cover pedagogical alternatives, Board materials, student
instructions, diagrams, image generation and metrics. All produced artefacts
remain reviewable drafts and may not decide the Learning Design.

## Skills (pts-skill-manager)

Recurring task capabilities arrive as DSH-native **skills** (`skill`-Tool):
the versioned library lives at `skills/<id>/SKILL.md`, the role↔skill matrix in
the settings section `pts-worker-skills:`. Assignment and status are the only
controls; they take effect for newly started workers (composition is fixed at
session start). The manager UI is the „Skills" tab
(`dsh-plugins/pts-skill-manager`); enforcement happens in the preset plugin
`worker-skill-scope.mjs` (role detection, hard `skill` guard, prompt section).
Worker notes here remain prompt references — they are not skill registrations.

