# harness/ — LEGACY / ALTERNATIVE RUNTIME (not the productive DSH path)

> Kennzeichnung: **legacy / alternative runtime**. Nicht löschen; nicht als
> produktiven DSH-Ausführungspfad verwenden.

This folder is a Level‑2, file‑based reference runtime for running PTS Service
Requests **without** DSH. It is kept for portability, demos and offline
inspection.

In a DSH deployment it is **not** the productive worker path. The productive
execution path is:

```
Service Request  →  capabilities/registry.yml (from PTS root)  →  native DSH subagent
```

See `dsh-plugins/pts-background-steward/` and
`docs/experiments/DSH_NATIVE_WORKSPACE.md`.

Contents:

- `dispatcher.py` — file‑based dispatcher (legacy/demo).
- `workers/` — reference worker scripts (legacy/demo).
- `config/` — optional model routing for the file‑based runtime.

Do not run this dispatcher beside the DSH path against the same Denkraum: two
runtimes writing the same workspace would race. Prefer the DSH path.
