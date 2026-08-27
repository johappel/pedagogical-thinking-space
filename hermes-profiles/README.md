# hermes-profiles/ — ALTERNATIVE RUNTIME (not the productive DSH path)

> Kennzeichnung: **alternative runtime**. Nicht löschen; nicht als produktiver
> DSH-Ausführungspfad verwenden.

These `*.soul.md` persona files describe the visible Companion and the service
personas for a Hermes-based deployment. They are an optional persona library
for that alternative runtime.

In a DSH deployment they are **not** the productive path:

- the visible Companion persona is composed by the DSH `pts-companion` preset
  (see `config/` for the reproducible `pts-web` profile settings);
- service execution is resolved through `capabilities/registry.yml` and run by
  native DSH subagents, whose persona is supplied per capability by the DSH
  dispatch seam.

Keep these files for portability, but do not treat them as the DSH runtime.
