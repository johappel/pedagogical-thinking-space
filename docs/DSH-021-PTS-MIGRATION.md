# PTS under dsh 0.2.1-alpha.1 — migration to instance pts-021

Date: 2026-10-03 · Target release: `dsh-v0.2.1-alpha.1` (published 2026-10-03T06:42Z) · Instance: `F:\dsh-instances\pts-021` (clone of the production instance `pts`, which stays untouched as the rollback)

## Result

`dsh --profile pts` boots under **0.2.1-alpha.1** with the PTS Companion preset
declared, rostered, default and mountable. Verified on port 34066. The four
breaking changes of 0.2.1-alpha.1 were each checked against PTS before the
boot; none of them hits the composition (detail below).

| Ladder step | Signal |
|---|---|
| 1 `--dump-config` | exit 0, **zero** `not found` / `incompatible` / `skipping` / `ERR_MODULE_NOT_FOUND` diagnostics; `agent-preset-registry` and `preset-pts-companion` both present |
| 2 boot | **no startup log at all** (DSH only writes one on errors); `dsh-whiteboard` (12 tools), `pts-whiteboard-renderer`, `pts-learning-moment-binding`, `pts-denkstand-writer`, `pts-whiteboard-adapter`, `pts-activity-stream` all mounted |
| 3 HTTP | 401 without token, 303 + `set-cookie` with token, 200 with cookie (36 202 bytes), all 4 `./assets/*` 200 |
| 4 preset roster | seat menu lists **Standard · PTC · Minimal · Creator · PTS Companion**, 0 console errors |
| 5 default | Settings → Agent presets: card **PTS Companion** / `pts-companion` carries the badge **"New task default"** |
| 6 mount | picking PTS Companion on the blank session produces **no refusal toast** (registry accepted, preset mounts); the previous seat value (Creator mode) was restored |

Raw evidence: `F:\dsh-instances\pts-021\verification-021.json`,
`seat-menu-021.json`, `preset-default-021.json`, `seat-select-021.json`
(+ PNGs), `dump-config-021.txt`.

## Version landscape — and why "latest" is ambiguous

| Tag | Version | Published |
|---|---|---|
| `latest` / `next` | 0.2.0-rc.2 | 2026-09-29 |
| `alpha` | **0.2.1-alpha.1** | 2026-10-03 |

0.2.1-alpha.1 is the newest published build, so it became the target. It was
**already installed globally on this machine** (today 13:07), i.e. no
`npm install` was needed for this migration.

> **The global CLI is the whole version story.** `dsh` on `PATH` resolves to
> `C:\nvm4w\nodejs\dsh.ps1`, and the profile interception layer of the
> production instance points at
> `C:\Users\Joachim\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh`.
> Both were on 0.2.1-alpha.1 before this work started. Therefore
> **pts-020 is no longer a 0.2.0-rc.1 rollback** — it has no runtime of its
> own and would boot on 0.2.1-alpha.1 as well. Clone/verify protects
> configuration and data, never the dsh version. Pinning a version per
> instance would need a per-instance CLI install.

## Breaking changes of 0.2.1-alpha.1 vs. PTS

| Change | Verdict |
|---|---|
| runtime `invariant` plugins and every `./invariant` export removed | **not affected.** No PTS file imports `.../invariant`; the only hits in the repo are English words in prose and code comments. |
| subpath plugins no longer read their own `package.json`; display text/icon must come from `<specifier>/icon` | **not affected.** Verified in `dsh-app-boot@0.2.1-alpha.1` (`readPluginMeta`): a subpath specifier skips the manifest. Both PTS client plugins (`pts-activity-stream`, `pts-teaching-product-editor`) are registered as **package-root** rows (`name: pts-activity-stream`, …), so their `name`/`description` still fill the card text. |
| composer statistics split into `activity` and `usage` extension entries | **not affected.** `pts-activity-stream` only takes over `conversation.chat.node`; it registers no `stats` entry. |
| Automation tasks became a Web built-in; reminder tools scoped to Standard/Creator/PTC (not Minimal, not subagents) | **no conflict.** `pts-companion` declares no mode of its own and pulls `dsh-tool-jobs` (background jobs), which is a different tool from the reminder tools. |

Package names were checked mechanically: all 22 distinct `@deepseek-ai/*`
references in `dsh/profiles/pts/cordis.patch.yml` and
`dsh/presets/pts-companion/agent.cordis.yml` resolve in 0.2.1-alpha.1. The
only one that does not is `@deepseek-ai/dsh-agent-presets` — the retired roster,
which no longer exists in the template.

## Findings during the upgrade

### 1. `robocopy /SJ` does NOT preserve this instance's junctions

The skill's clone recipe (`robocopy … /E /SJ`) **silently breaks a PTS
instance**. `robocopy` exits 1 ("files copied", summary shows 0 errors) but:

- the 3 plugin junctions (`dsh-whiteboard`, `pts-activity-stream`,
  `pts-teaching-product-editor`) become **empty directories**, so the profile
  can no longer resolve them by bare name;
- all 481 junctions of `$DSH_HOME/profiles/node_modules` (the interception
  layer, each pointing into the global dsh installation) become **empty
  directories** too — `@deepseek-ai/dsh/package.json` was simply gone in the
  clone.

The 481 interception-layer junctions are optional (pts-020 booted without
them); the 3 plugin junctions are not. They were re-created 1:1 with the source
targets by `F:\dsh-instances\pts-021\_tools\mirror-junctions.ps1`.

### 2. Installer bug: `Set-PtsSettingLine` drops sibling keys (fixed)

`scripts/install-pts-instance.ps1` logged
`settings.yaml: pts.repoRoot = …, pts.dataRoot = …` but the file contained
only `dataRoot`. Cause: when the key is **not** present yet, the function
rebuilds the file from `head = Lines[0..index]` (which stops *at* the `pts:`
line) plus `tail = Lines[end..]` (which starts *past* the section end), so
every existing sibling key is discarded. Writing `repoRoot` then `dataRoot`
therefore erased `repoRoot`. Reproduced in isolation; fixed in place and
verified — both keys now survive, and the installer reports PASS on all seven
verification markers.

## What was verified about the source instance

The production instance `pts` was **never booted during the migration run**
(15:20–15:51). It was found in a half-migrated state worth recording: its rendered patch was still the 0.1.7
shape (row `agent-presets`, no model rows, no preset declaration) while its
profile `node_modules` had already been moved to 0.2.1-alpha.1 by the global
update. Its data area is the reason it was chosen as the clone source — it
holds three Denkräume (`DSH-Witeboard`, `Freundschaft`, `Test1`) that pts-020
does not have.

## Template drift

`cordis.patch.yml` (live, rendered 2026-09-24) was diffed against
`cordis.patch.yml` (pts-020, rendered 2026-09-29) and against the repo
template. **No hand-edit exists that only the rendered patch has.** Every
difference is template evolution: roster → registry, the added
`preset-pts-companion` declaration, the canonicalised model rows
(`ui-settings-general`, `agent-default-model`, `llm-pi-ai`), whitespace and the
data root. The §2 canonicalisation of 2026-09-29 therefore holds; nothing had
to be replayed into the template.

## Deliberately not done

- **The old instance keeps its 0.1.7-shaped configuration.** `F:\dsh-instances\pts`
  still carries the retired roster row, so booting it still means the old
  composition, not pts-021's. It was not booted by this migration (it *was*
  booted separately later that day — see the cutover section).
- **pts-017 and pts-020 were not booted or modified.**
- **No global `npm install`** — 0.2.1-alpha.1 was already active.
- `pts-learning-moment-binding` logs nothing on success, so it is proven only by
  its row in the dump plus the absence of any error; unlike the other six, it
  has no positive activation signal.

## Cutover (same day, 19:18)

`pts-021` is the production instance. The **folder was not renamed** and the old
instance folder was not moved — the version-naming convention of the 017/020
migrations stands, and reverting is a one-line change in three launchers.

Changed (all four now resolve to `F:\dsh-instances\pts-021\.dsh`):

| File | Change |
|---|---|
| `scripts/start-pts.ps1` | `$DshHome` default `…\pts\.dsh` → `…\pts-021\.dsh`; the `-Denkraum` example now names a Denkraum that actually exists |
| `scripts/restart-pts.ps1` | same default, so a restart stops and starts the same instance it started |
| `F:\dsh-instances\pts-021\start-pts.ps1` | is now the production launcher; it was the copied 5-line legacy launcher and now sets `DSH_HOME` to pts-021 and the working directory to `<dataRoot>/denkraeume` |
| `F:\dsh-instances\pts\start-pts.ps1` | prints a deprecation notice and delegates to the production launcher, instead of quietly starting the old half-migrated instance |

**Working directory.** The legacy launcher started in
`F:\dsh-workspaces\pts` (old workspaces: Hoffnung, KI und Gott, Tests). Those
sit outside the sandbox root the patch declares
(`workspaceRoot: <dataRoot>/denkraeume`) and outside the new data area, so the
production launcher uses `F:\dsh-instances\pts-021\denkraeume` — the same
default `scripts/start-pts.ps1` computes, and where the live sessions
(DSH-Witeboard, Freundschaft, KI und Gott, Test1) are.

Smoke test after the cutover: `start-pts.ps1 -Port 34066` reported
`DSH_HOME : F:\dsh-instances\pts-021\.dsh`,
`Denkraum : F:\dsh-instances\pts-021\denkraeume`, booted with every PTS host
plugin active and no startup log. The instance was stopped again afterwards.

`settings.yaml` was imported away by that boot (normal) and rewritten with both
`repoRoot` and `dataRoot`.

### The old instance was booted separately at 19:03 — outside this migration

While the cutover was being prepared, `F:\dsh-instances\pts\.dsh` was booted
once **by someone else** (no command in this migration run touched it; the
first change is timestamped 19:03:20, this run's first write was later).
What that boot left behind:

| File | State |
|---|---|
| `profiles/pts/cordis.yml` | rewritten at boot |
| `profiles/pts/cordis.patch.yml` | re-serialized 6830 → 6971 bytes: `inject: [x]` → `inject: [ x ]`, the `llm-grok-build-oauth` row dropped, a `ui-settings-general` row added |
| `settings.yaml` | imported and removed (only the old `settings.yaml.imported` remains) |
| `storages/session_projcache/…/session-434333d1-….json` | projection cache refreshed |

`denkraeume/` was **not** touched (0 changed files). The patch still carries
`@deepseek-ai/dsh-agent-presets` and still has no `agent-preset-registry`, so
the rollback keeps its pre-migration shape — it is simply no longer byte-identical
to its 2026-09-24 state, and its `settings.yaml` has to be restored from
`settings.yaml.imported` if that instance is ever booted again on its own.

### Still pointing at the old instance (documentation only, not touched)

These describe the instance as it was and were deliberately left alone —
rewriting architecture docs is separate work:

- `docs/architecture/DSH_PTS_INSTANCE.md` (header line 4, plus examples)
- `docs/architecture/COMPANION_DENKSTAND_WHITEBOARD.md`, `SPIKE-M1-WHITEBOARD-ADAPTER.md`,
  `SPIKE-PHASE1-WHITEBOARD-SEMANTIC-RENDERER.md` (historical spike records —
  correct as history)
- `scripts/install-pts-instance.ps1` (comment examples only)

## Test side effects (disclosed)

Everything below happened inside `F:\dsh-instances\pts-021`; the production
instance and pts-017/pts-020 were not written to.

- preset render into `.agent-presets/` and `profiles/pts/pts-companion/`
- `settings.yaml` was **imported at boot and removed** (as `settings.yaml.imported`)
  — the expected behaviour; it was rewritten, and the installer now needs
  `-RepoRoot`/`-DataRoot` whenever the file is gone
- `profiles/pts/cordis.yml` and `cordis.patch.yml` were touched by the live
  patch reload (`patchReload: "live"`)
- projection cache refreshed for the blank session the UI opened — the
  inherited session id `--F-dsh-instances-pts-Denkraum--`
- `whiteboard-snapshots/` unchanged (9 files, 2026-09-13)
- **no session log, no session header and no workspace registry entry was
  modified; no message was ever sent.** The seat was switched PTS Companion →
  back to Creator mode.

## Reproduce / start

Production start (this is what the launcher does):

```powershell
F:\dsh-instances\pts-021\start-pts.ps1
# oder mit mehr Optionen aus dem Repo:
powershell -File scripts/start-pts.ps1            # Port 3030, --no-open
```

Explicit form, as used for the verification:

```powershell
powershell -File scripts/install-pts-instance.ps1 `
  -DshHome  F:\dsh-instances\pts-021\.dsh `
  -RepoRoot F:\code\pedagogical-thinking-space `
  -DataRoot F:\dsh-instances\pts-021
$env:DSH_HOME = 'F:\dsh-instances\pts-021\.dsh'
Set-Location 'F:\dsh-instances\pts-021\denkraeume'
dsh --profile pts --port 34066 --no-open
```

Rolling back to the old instance means reverting the `$DshHome` default in
`scripts/start-pts.ps1` and `scripts/restart-pts.ps1`; nothing else moved.

Reserved port ranges on this machine are currently 19525–19624, 31516–32115,
48736–48835 and 50000–50059 — 3030 is free again, but 34066 stays the
verification port.

## If a clone is repeated

`robocopy /E /SJ` alone is not enough; add the junction mirror afterwards, or
copy the junctions by hand:

```powershell
foreach ($pair in @(
  @('dsh-whiteboard',              'F:\code\dsh-tldraw\plugin\dsh-whiteboard'),
  @('pts-activity-stream',         'F:\code\pedagogical-thinking-space\dsh-plugins\pts-activity-stream'),
  @('pts-teaching-product-editor', 'F:\code\pedagogical-thinking-space\dsh-plugins\pts-teaching-product-editor'))) {
  $dest = "<DSH_HOME>\profiles\pts\node_modules\$($pair[0])"
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Junction -Path $dest -Target $pair[1] | Out-Null
}
```

Note for Windows PowerShell 5.1: `Get-ChildItem` returns `.Target` as
`System.String[]`. Use `[string](@($j.Target)[0])`; a bare `$j.Target` lands as
the literal `System.String[]`, and `($j.Target | Where-Object { $_ })[0]` takes
the **first character** of the path.