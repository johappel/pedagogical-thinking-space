# DSH prototype configuration

The repository ships one canonical user preset under
`dsh-presets/pts-companion/`. From the repository root, install it once as a
junction into the DSH user preset directory:

```powershell
pwsh -File .\scripts\install-pts-preset.ps1
```

The junction deliberately keeps the installed preset identical to the Git
checkout. The installer refuses to replace an existing directory unless
`-Replace` is supplied; in that case it moves the previous directory to a
timestamped backup instead of deleting it.

The `pts-web` profile still mounts the PTS UI plugins and
`pts-background-steward`. Worker execution needs no PTS dispatcher plugin: the
Companion preset exposes four native DSH subagent tools.

Merge `pts-web-profile.settings.example.yaml` into the profile-local settings
and adjust only provider/model identifiers that exist in the installation.
Credentials remain outside the repository.

After installing or changing the preset, restart DSH and open a **new**
conversation. DSH fixes an agent composition when the session is created;
existing conversations do not acquire the four worker tools retroactively.
The PTS Workspace UI creates new Denkraum conversations with
`agentPreset: pts-companion` explicitly; it does not rely on the machine-wide
default. Old conversations retain their original preset and must not be used
for the Worker acceptance test.

The preset keeps web and write packages available for inherited child Agents,
then applies `companion-tool-boundary.mjs` to the root Agent only. That DSH
restriction removes direct web/write tools and rejects bypass attempts such as
`skill`, shell or generic subagent execution. Role Workers keep only their
declared `toolFilter`.

`scripts/start-pts-web.ps1` now fails before launch when the canonical preset is
missing or does not contain `@deepseek-ai/dsh-tool-jobs` and all four PTS worker
tools. A direct `dsh --profile pts-web` invocation bypasses that preflight.
