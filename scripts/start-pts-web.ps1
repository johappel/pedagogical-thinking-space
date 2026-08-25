# start-pts-web.ps1 — start the Pedagogical Thinking Space web surface.
#
# Boots the dedicated `pts-web` profile (see docs/experiments/DSH_PTS_WEB_PROFILE.md)
# on its profile fallback port 3081 while the standard DSH web keeps running on 3080.
#
# Usage:
#   powershell -File scripts\start-pts-web.ps1            # foreground
#   powershell -File scripts\start-pts-web.ps1 -Open      # open browser tab
#   powershell -File scripts\start-pts-web.ps1 -Port 3082 # override port
#
# Stop: Ctrl+C in this console (bounded shutdown disposes the tree cleanly).
param(
	[switch]$Open,
	[int]$Port = 3081
)

$ErrorActionPreference = "Stop"

# Same resolution the dsh launcher uses ($DSH_HOME or %USERPROFILE%\.dsh).
$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE ".dsh" }
$profileDir = Join-Path $dshHome "profiles\pts-web"

if (-not (Test-Path (Join-Path $profileDir "package.json"))) {
	Write-Error @"
pts-web profile not found at $profileDir
Create it first (see docs/experiments/DSH_PTS_WEB_PROFILE.md, section 'Installationspfade').
"@
}

Write-Host "Starting PTS web (profile: pts-web) on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
Write-Host "Standard DSH web stays untouched on http://127.0.0.1:3080" -ForegroundColor DarkGray

$argList = @("--profile", "pts-web", "--port", "$Port")
if (-not $Open) { $argList += "--no-open" }

# dsh.ps1 resolves through nvm4w's shim directory on PATH.
& dsh @argList
exit $LASTEXITCODE
