# PTS under dsh 0.2.0-rc.1 — migration to instance pts-020

Date: 2026-09-29 · Target release: `dsh-v0.2.0-rc.1` (global npm install, replaces 0.1.7) · Instance: `F:\dsh-instances\pts-020` (clone of `pts-017`, which stays untouched as the 0.1.7 rollback)

## Result

`dsh --profile pts` boots under 0.2.0-rc.1 with the PTS Companion preset
declared, rostered and selectable. Verified on port 34066 (Windows excluded
port range 2951–3350 makes 3030 unusable on this machine regardless of DSH
version):

- `--dump-config` exit 0, no `patch: entry not found` diagnostics.
- HTTP 401 without token, 200 with token; index assets 200.
- Startup log: no preset/include errors; all PTS host plugins active
  (`dsh-whiteboard`, `pts-whiteboard-renderer`, `pts-whiteboard-adapter`,
  `pts-learning-moment-binding`, `pts-denkstand-writer`,
  `pts-teaching-product-editor`, `pts-activity-stream`).
- Preset seat menu lists **Standard · PTC · Minimal · Creator · PTS Companion**;
  Settings → Agent presets shows the PTS Companion card with badge
  **"New task default"** (registry `default: pts-companion` reaches the UI).
- Picking PTS Companion on the blank session succeeds without refusal toast
  (the preset mounts), and picking Standard again restores the former state.

## What changed in the repository (templates — every future render)

### `dsh/profiles/pts/cordis.patch.yml`

1. The retired roster row was replaced:

   ```yaml
   # was: - id: agent-presets / name: '@deepseek-ai/dsh-agent-presets'
   - id: agent-preset-registry
     name: '@deepseek-ai/dsh-agent-preset-registry'
     config:
       default: pts-companion
   ```

   0.2 no longer scans `$DSH_HOME/.agent-presets`; the registry only knows
   DECLARED presets, and `default` fails loud when the id is not declared.

2. A declaration row was added inside the existing `- insert:` block:

   ```yaml
   - id: preset-pts-companion
     name: '@deepseek-ai/dsh-agent-preset'
     config:
       id: pts-companion
       name: PTS Companion
       description: …
       plugins:
         - id: pts-companion-composition
           name: cordis:include
           config:
             path: 'pts-companion/agent.cordis.yml'
   ```

3. The three rows that previously existed only in the rendered pts-017 patch
   (`ui-settings-general`, `agent-default-model`, `llm-pi-ai`) were
   canonicalized at the end of the template so every render reproduces them.

### `scripts/install-pts-instance.ps1`

After rendering the composition into `$DSH_HOME/.agent-presets` (kept for
0.1.7 rollback), the installer now copies the validated rendering to
`$DSH_HOME/profiles/<profile>/<preset>/` — the target of the relative
`cordis:include` path.

### Why the include path is relative (both traps observed 2026-09-29)

- **Scheme trap.** `Include` resolves `fileURLToPath(new URL(path, baseUrl))`.
  A substituted `F:/…` parses as scheme `f:` → *"The URL must be of scheme
  file"*, and the declaration stays on the roster with a broken diagnostic.
- **Interception trap.** Bare `@deepseek-ai/*` names are only intercepted for
  files under the profiles tree (`findInterceptionLayer`). Including the repo
  copy directly fails with `ERR_MODULE_NOT_FOUND` for every harness package
  (the repo carries no harness closure). The relative path from the rendered
  patch lands inside the profile tree, where package resolution works — the
  same tree whose `cordis.patch.yml` rows already resolve every package.

## Instance state (pts-020)

- `settings.yaml` holds `agent-presets.default`, `pts.repoRoot`,
  `pts.dataRoot: F:/dsh-instances/pts-020`. DSH imports this document at boot
  (it reappears as `settings.yaml.imported`), so the installer also honours
  `-RepoRoot` / `-DataRoot` when the file is gone.
- Model defaults (`bai` / `deepseek-v4.1-flash` / `reasoningEffort: high`,
  openrouter fallback, welcome notice) come from the profile patch rows, as in
  pts-017.
- Session data areas (`denkraeume`, `knowledge`, `skills`) were cloned;
  `settings.yaml.imported` still carries `dataRoot: …pts-017` from the old
  instance and is superseded by the new `settings.yaml`.

## Deliberately not done

- **OAuth bundle** (`dsh-coding-subscription-oauth`): no compatible version
  (0.8.0/0.8.5 pin peers `0.1.1-rc.2`); 0.2.0-rc.1 logs
  `skipping profile bundle … incompatible` and boots fine. The bundle entry
  remains in the template `package.json` and is skipped loudly — harmless.
- **Legacy `.agent-presets` roster**: kept rendered for rollback; 0.2 ignores it.

## Test side effects (disclosed)

Booting and probing pts-020 wrote: a startup log, projection-cache updates for
the sessions opened by the checks, `identity.json`/snapshot refresh for the
board touched in an earlier acceptance run (2026-09-23 state, unchanged today),
and the preset seat was switched PTS Companion → Standard on the blank session
(restored). No session logs, headers or workspace-registry entries were
modified; `pts-017` was never booted.

## Reproduce / start

```powershell
powershell -File scripts/install-pts-instance.ps1 `
  -DshHome F:\dsh-instances\pts-020\.dsh `
  -RepoRoot F:\code\pedagogical-thinking-space `
  -DataRoot F:\dsh-instances\pts-020
$env:DSH_HOME = 'F:\dsh-instances\pts-020\.dsh'
Set-Location 'F:\dsh-instances\pts-020\denkraeume'
dsh --profile pts --port <free-port> --no-open   # avoid 2951–3350
```
