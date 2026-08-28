# DSH prototype configuration

The repository ships one canonical user preset under
`dsh-presets/pts-companion/`. Install it as the DSH user preset
`<DSH_HOME>/.agent-presets/pts-companion/` or add the repository's
`dsh-presets/` directory as a trusted Agent Preset root.

The `pts-web` profile still mounts the PTS UI plugins and
`pts-background-steward`. Worker execution needs no PTS dispatcher plugin: the
Companion preset exposes four native DSH subagent tools.

Merge `pts-web-profile.settings.example.yaml` into the profile-local settings
and adjust only provider/model identifiers that exist in the installation.
Credentials remain outside the repository.

