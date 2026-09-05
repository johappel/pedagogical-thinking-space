# PTS Documentarian migration

Status: current architecture after replacing the former Background Steward.

## Responsibility inventory

The former `pts-background-steward` was a host plugin, not merely a prompt.
The complete responsibility mapping is:

| Former Steward function | Code path | Trigger | Reads | Writes | Future owner | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Observe completed top-level turns | `lib/index.js` session observer | every completed `turn/end` | session headers and messages | none | F | hidden scheduler made documentation implicit and duplicated DSH lifecycle |
| Extract and cap dialogue windows | `lib/index.js:extractDialogue` | Steward trigger | session history | none | A/B | the Companion supplies an intentional evidence envelope; the Documentarian reads the active workspace |
| Debounce, coalesce and rerun work | `lib/scheduler.js` | every turn | pending metadata | scheduler memory | F | no PTS scheduler or second job lifecycle is allowed |
| Resolve PTS root and Denkraum | `lib/index.js:ptsRoot/resolveDenkraum` | every trigger | filesystem markers and cwd | none | E | DSH worker cwd and existing workspace guards own scope resolution |
| Build reflection persona and task prompt | `lib/reflection-job.js` | scheduled run | canonical files and dialogue | none | B | retained as a narrow `pts_documentarian` persona in the native preset |
| Snapshot hashes and canonical file copies | `lib/workspace-state.js` and `reflection-job.js` | scheduled run | workspace files | none | B/E | the worker reads the current workspace; old host-side snapshot/apply protocol is retired |
| Validate structured observations and operations | `lib/patch-validator.js` | child completion | structured child result and evidence | none | E/A | deterministic validation remains appropriate for direct `pts_edit`; the Documentarian has no host patch protocol |
| Apply broad structured workspace operations | `lib/workspace-state.js:applyOperations` | validated child completion | canonical files | design, landscape, decisions, board and temporal plan | F | this was an implicit second edit runtime; the Documentarian makes only minimal explicit worker edits |
| Atomic write and revision rejection | `lib/workspace-state.js:atomicWrite` and hash recheck | validated child completion | file hashes | canonical files | E | general workspace safety remains; Steward-specific host application is removed |
| Propose bounded Knowledge service intents | `patch-validator.js` and `services/STEWARDSHIP.md` | scheduled reflection | conversation and workspace | service request metadata | C/F | Knowledge work belongs to a separate Knowledge Worker; no automatic service bridge remains |
| Register unowned jobs and expose status | `lib/index.js` jobs controller and status route | plugin startup / polling | scheduler state and settings | job registry and HTTP response | F | native DSH worker jobs and activity state are sufficient |
| Persist model settings and expose Steward tab | `lib/settings-source.js`, `lib/config.js`, `lib/client.js` | UI/settings request | profile settings and provider catalog | profile settings | F | model routing belongs to the preset/DSH, not a PTS Steward UI |
| Retry and timeout the reflection run | `lib/reflection-job.js` | scheduled run | child status | job state | F | DSH owns child execution, cancellation and failure |

### Responsibility boundaries

- The Companion understands, clarifies and decides with the teacher; it uses
  direct `pts_edit` for small clarified changes.
- The Documentarian checks and records workspace state, provenance and gaps; it
  does not decide.
- The Knowledge Worker verifies and curates factual knowledge under
  `knowledge/` and `knowledge-proposals/`; it does not maintain the current
  Learning Design.
- Specialist workers perform bounded research, review, material, document and
  rendering work.
- Deterministic workspace Git commits remain technical housekeeping.

## Current worker contract

`pts_documentarian` is a native DSH worker with:

- `provider: spawn` and the existing PTS OpenRouter model route;
- `backgroundMode: continuable` and `enableRunInBackground: true`;
- `maxDepth: 0`;
- `read`, `glob`, `grep`, `write`, `edit` only;
- no web, skill, Knowledge, subagent or external-tool access.

It is triggered by an explicit Companion request or a bounded accepted-result
handoff. It is not triggered after every message and does not own a scheduler.

## Target topology

```text
Teacher <-> Companion
             |
             +-- pts_edit (direct, structured, guarded)
             +-- pts_research / pts_review / pts_material
             +-- pts_document / pts_renderer
             +-- pts_documentarian (workspace consistency + documentation gaps)
                    |
                    +-- native DSH continuable child via ctx.subagents

Knowledge Worker -> knowledge/ and knowledge-proposals/
technical housekeeping -> workspace Git only
```

No Director, dispatcher, PTS scheduler, post-turn Steward or parallel worker
runtime is part of this topology.
