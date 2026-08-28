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

