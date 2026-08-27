# config/ — reproducible PTS runtime configuration (repo-versioned)

This folder versions the configuration PTS needs from a DSH deployment, so a
`pts-web` profile can be reconstructed reproducibly **without** editing any
shipped DSH files.

- `pts-web-profile.settings.example.yaml` — the profile-local settings sections
  for the `pts-companion` preset selection and the background-steward model
  route. Apply them to the user-local profile file
  `~/.dsh/profiles/pts-web/settings.yaml` (Windows:
  `%USERPROFILE%\.dsh\profiles\pts-web\settings.yaml`). API keys stay in the
  shared `~/.dsh/.credentials.yaml` and are never versioned here.

The `pts-web` profile runs on port 3081. The default DSH profile (`web`, port
3080) is never touched by PTS.

## Apply

1. Create the profile folder if missing:
   `~/.dsh/profiles/pts-web/`.
2. Merge the sections from `pts-web-profile.settings.example.yaml` into
   `~/.dsh/profiles/pts-web/settings.yaml` (do not overwrite unrelated keys).
3. Provide model credentials in `~/.dsh/.credentials.yaml` (shared, not in repo).
4. Start: `dsh --profile pts-web`.

The `pts-companion` preset composes the visible Pedagogical Companion role from
the repository role contracts (`AGENTS.md` → `CRITICAL_FRIEND.md` etc.); its
instruction context is the repository itself, loaded via the DSH boot chain from
the Denkraum `cwd` up to the PTS root (see
`docs/experiments/DSH_NATIVE_WORKSPACE.md`).
