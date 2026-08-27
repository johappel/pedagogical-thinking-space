# .opencode/ — ALTERNATIVE RUNTIME (not the productive DSH path)

> Kennzeichnung: **alternative runtime**. Nicht löschen; nicht als produktiver
> DSH-Ausführungspfad verwenden.

`opencode.json` is an optional [OpenCode](https://opencode.ai) preset that maps
`model_hint` values to models for an OpenCode-based deployment. It is a
kernel-agnostic convenience for that alternative runtime.

In a DSH deployment it is **not** used: executable capabilities are resolved
through `capabilities/registry.yml` and dispatched to native DSH subagents, and
model routing is configured in the DSH profile (see `config/` for the
reproducible `pts-web` profile settings).
