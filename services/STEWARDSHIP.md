# Background Stewardship

The Background Steward keeps the reversible Denkstand current after a completed
top-level dialogue turn. It never delays the visible Companion response.

## Responsibility

The Steward may update draft sections of `learning-design.md` and
`learning-landscape.md`, record a recognizable teacher decision in
`decisions.yml`, and propose at most one Planning Board item. Every operation is
schema-checked, policy-checked and protected by base hashes before atomic apply.

The Steward must not:

- research or access the web;
- detect, route or start Worker tasks;
- create materials or render outputs;
- build or activate capabilities;
- maintain a service-request lifecycle;
- write curated Knowledge or long-term Memory;
- make a pedagogical decision.

It uses a native DSH subagent for reflection. The plugin owns only the
turn-trigger, domain validation and atomic Denkstand application. DSH owns the
child execution and job record.

One Steward run per Denkraum may be active. Failures and stale results are
discarded without affecting the conversation or any Worker job.

