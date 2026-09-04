# PTS plugin client matrix

Status: static inventory for the DSH 0.1.2-rc.1 contract, 2026-09-04.

| Plugin | Host | Client | Dual-face | Client build | DSH client dependencies | Status |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `pts-artifact-panel` | yes | yes | yes | checked-in classic factory | `react` seed | migrated: removed obsolete runtime import |
| `pts-workspaces` | yes | yes | yes | checked-in classic factory | `react` seed | compatible by static contract |
| `pts-denkstand` | yes | yes | yes | checked-in classic factory | `react` seed | compatible by static contract |
| `pts-landscape` | yes | yes | yes | checked-in classic factory | `react` seed | compatible; duplicate host log removed |
| `pts-activity-stream` | yes | yes | yes | checked-in classic factory | `react` seed | compatible by static contract |
| `pts-background-steward` | yes | yes | yes | checked-in classic factory | `react` seed | compatible by static contract |
| `pts-skill-manager` | yes | yes | yes | checked-in classic factory | `react` seed | compatible by static contract |
| `pts-web-brand` | yes | yes | yes | checked-in classic factory | `react` seed | compatible by static contract |
| `pts-workspace-git` | yes | no | no | none | none | host-only; no client migration needed |

All web packages expose `exports["./client"]` and declare
`dsh.client.platform: "web"`. None declares `dsh.client.external`; this is
intentional because no PTS client factory currently requires a second DSH client
package. The active PTS profile owns one `pts-landscape` loader row. The former
second start line was duplicate logging inside its one host `apply()` call, not
a second registration.

## Compatibility assessment

| DSH | Host | Client | PTS UI | Recommendation |
| --- | --- | --- | --- | --- |
| `0.1.1-rc.2` | previously verified | previously verified | historical baseline | retain only as a rollback target; no new compatibility layer |
| `0.1.2-rc.1` | verified against the active `pts-web` profile | static contract verified | browser acceptance remains a manual check | selected target version |

The globally selected CLI is `0.1.2-rc.1`, and the real `pts-web` profile is
bound to its PTS plugin junctions. The static contract check covers all eight
web plugins, including their literal factory imports and client-service
injections. Browser UI acceptance remains deliberately separate from this
structural evidence.

## Required runtime smoke

After restarting the active profile with `dsh --profile pts-web --no-open`,
verify the authenticated web root, the PTS API routes, and the browser
console/banner for `failed to load plugins`,
`missed the module table`, `not a materialized module`, and `no registered
package factory`. Then exercise workspace navigation plus the Artifact,
Denkstand, Lernlandschaft, Activity Stream, and Skill Manager surfaces.
