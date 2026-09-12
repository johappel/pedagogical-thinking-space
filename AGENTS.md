# PTS on DSH — workspace orientation

This repository is the pedagogical domain layer of a DeepSeek Harness (DSH)
instance. DSH owns sessions, the agent loop, tools, subagents, jobs,
persistence, the model route and the web client. PTS owns the pedagogical
stance, the agent composition, the worker roles and the Denkraum content.

**The visible role of the `pts-companion` agent preset is defined in
`dsh/presets/pts-companion/prompt/persona.md` and `prompt/framework.md`.** This
file is not the persona; it tells any agent working in this repository where
things are.

## Three planes — do not mix them

| Plane | Lives in | Rule |
| --- | --- | --- |
| DSH platform | the harness installation (`@deepseek-ai/dsh`) | do not patch `packages/` unless a real platform bug is proven |
| PTS Core | `dsh/profiles/pts/cordis.patch.yml` (host), `dsh/presets/pts-companion/` (agent) | identity, prompt sections, tool and authority boundaries, worker roles |
| Optional capabilities | `plugins/` and independently installed profile rows | may use DSH; PTS Core does not know them; they do not know PTS |

A capability adds its tools, prompt contexts or UI without an edit to the
**preset**: it is installed as one `insert` row in the profile patch (the seam
`dsh-whiteboard` already uses) and it does not know PTS.
`plugins/pts-demo-capability` is the minimal executable proof of the tool seam;
`plugins/pts-whiteboard-adapter` (M1 spike) is the proof of the prompt-context
seam — it reads the existing `whiteboard_state` definition and contributes a
compact board projection to `pts-companion` sessions through the scoped
`system-prompt/assemble` waterfall, without a service, a tool or a trigger. See
`docs/architecture/SPIKE-M1-WHITEBOARD-ADAPTER.md`.

## Instance

```text
DSH home   : %DSH_HOME% (this instance: F:\dsh-instances\pts\.dsh)
profile    : pts                         → dsh --profile pts
port       : 3030 (profile fallback; --port wins)
presets    : shipped presets + <DSH_HOME>/.agent-presets
             (pts-companion is rendered from <repo>/dsh/presets by the installer)
default    : pts-companion
Einstellung: <DSH_HOME>/settings.yaml -> pts.repoRoot + pts.dataRoot
             (the one place a human edits; the installer reads both, validates
             them and keeps the rendered composition in sync)
Definition : <repo> — preset, patch, contracts, tests, plugins
             read-only for every session: no worker writes into the definition
Bestand    : <dataRoot> — denkraeume/, knowledge/, skills/
             local content, not versioned (F:\dsh-instances\pts for this instance)
Denkräume  : <dataRoot>/denkraeume/<slug>  (the session working directory)
```

```powershell
pwsh -File scripts/install-pts-instance.ps1   # render profile + preset from this repository
pwsh -File scripts/start-pts.ps1 -Sync        # render while stopped, then boot
node tests/pts-whiteboard-adapter.test.mjs    # one file per call: `node --test` spawns
node tests/pts-context.test.mjs               # children with piped stdio and hits the
node tests/pts-companion-composition.test.mjs # sandbox's EPERM on named pipes
```

The repository is the source of truth for both rendered layers; the DSH home
holds the copy. `--dump-config` is the cheap verification: it must show
`default: pts-companion`, `pts-demo-capability` (disabled), `dsh-whiteboard` and
`pts-whiteboard-adapter`.

**Four rules learned the hard way (2026-09-11):**

1. Install while the instance is **stopped**. The `agent-presets` row is a
   startup artifact: changing its config re-instantiates the roster, and the
   standing preset mounts hang off that service, so running sessions lose their
   preset layer until they are created again.
2. Preset **code** (the `.mjs` modules) is cached per process. An edited module
   only takes effect after a restart; an edited `agent.cordis.yml` is picked up
   by the next session as a new generation.
3. A preset-local module must not read `ctx.agent`: a preset is mounted once per
   process under a standing scope, so `ctx.agent` does not exist there and
   reading it fails the whole mount. Attach per-session work through the agent
   registry (`inject: ['agents']`, `ctx.on('agent/created')`).
4. An inserted profile row must not resolve `systemPrompt` (or anything provided
   after the insert block) eagerly in `apply`: the eager `ctx.get()` finds
   nothing and the capability silently disables itself. Resolve services at USE
   time, or declare a hard dependency the way `dsh-whiteboard` declares
   `inject: [webServer]`.

## PTS worker roles (native DSH subagents)

| Tool | Responsibility | Boundary |
| --- | --- | --- |
| `pts_research` | public, source-grounded research and verification | no pedagogical decisions |
| `pts_edit` | bounded mechanical Denkstand edits (one-shot) | only the commissioned change |
| `pts_document` | factual documentation and protocols | facts only |
| `pts_documentarian` | completeness, consistency and provenance of the Denkstand | evidence only, no decisions |
| `pts_material` | reviewable teaching-material drafts | implements a given intention |
| `pts_review` | pedagogical and factual counter-check | changes nothing |
| `pts_renderer` | conversion of an approved draft | approved drafts only |

Every role is configuration (persona, route, `toolFilter`, `maxDepth: 1`,
background policy) on a `dsh-tool-subagent` row. There is no PTS dispatcher,
queue, worker lifecycle, session store or tool pipeline — DSH owns all of it.

## Denkraum and reference documents

A Denkraum is a directory under `<dataRoot>/denkraeume/` holding the Learning
Design and its artefacts (`learning-design.md`, `learning-landscape.md`,
`planning-board.yml`, `decisions.yml`, `temporal-plan.yml`, `drafts/`,
`materials/`, `rendered/`). Conversation history comes from the DSH session; the
Denkraum files are the shared current state.

Reference documents live in the repository root and are read **on demand by
absolute path**, never preloaded: `CRITICAL_FRIEND.md`, `SYSTEMIC_STANCE.md`,
`LEARNING_DESIGN.md`, `MANIFEST.md`, `ORCHESTRATION.md`, `services/`,
`specs/LEARNING_DESIGN_SCHEMA.md`.

## Current scope

The domain store (structured Denkstand capture, `record_denkstand`,
`record_decision`, product routes) and every `pts-web` client plugin are **not**
part of this instance. They return as a separately designed spike on the
current web-client/slot architecture. Do not resurrect `dsh-plugins/` or
`dsh-presets/` for runtime behaviour.
