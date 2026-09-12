#Requires -Version 5.1
<#
.SYNOPSIS
    Starts the PTS instance: profile `pts`, this instance's DSH home, and the
    Denkraum root as the session working directory.

.DESCRIPTION
    Use this instead of calling `dsh` by hand: it fixes DSH_HOME (so sessions,
    settings, credentials and the agent-preset roster are this instance's own),
    sets the working directory to the Denkraum root, and forwards the port.

    -Sync renders the profile from the repository first
    (scripts/install-pts-instance.ps1).

    Windows PowerShell 5.1 compatible on purpose.

.EXAMPLE
    powershell -File scripts/start-pts.ps1
.EXAMPLE
    powershell -File scripts/start-pts.ps1 -Sync -Denkraum F:\dsh-instances\pts\denkraeume\ki-und-religion
#>
[CmdletBinding()]
param(
    [string] $RepoRoot = '',
    [string] $DataRoot = '',
    [string] $DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { 'F:\dsh-instances\pts\.dsh' }),
    [string] $ProfileName = 'pts',
    [string] $Denkraum,
    [int] $Port = 3030,
    [switch] $Sync,
    [switch] $ReadOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# $PSScriptRoot is NOT reliable inside a param() default when the script is
# started with `powershell -File`: it evaluates to an empty string there, so
# `Split-Path -Parent $PSScriptRoot` throws before anything runs (observed
# 2026-09-11). Resolve the script directory in the body instead.
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $scriptDir = $PSScriptRoot
    if ([string]::IsNullOrWhiteSpace($scriptDir)) { $scriptDir = Split-Path -Parent $PSCommandPath }
    if ([string]::IsNullOrWhiteSpace($scriptDir)) { throw 'Skriptverzeichnis nicht bestimmbar; -RepoRoot explizit angeben.' }
    $RepoRoot = Split-Path -Parent $scriptDir
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
# The content lives in the instance data area, not in the repository: a session
# starts inside a Denkraum under <dataRoot>/denkraeume, and the repository stays
# read-only for it.
if ([string]::IsNullOrWhiteSpace($DataRoot)) { $DataRoot = Split-Path -Parent $DshHome }
if (-not $Denkraum) { $Denkraum = Join-Path $DataRoot 'denkraeume' }

if ($Sync) {
    # No -RepoRoot here: the installer takes the path from settings.yaml
    # (pts.repoRoot) unless this call really wants to override it.
    & (Join-Path $repo 'scripts/install-pts-instance.ps1') -DshHome $DshHome -ProfileName $ProfileName
}

if (-not (Test-Path -LiteralPath $Denkraum)) { throw "Denkraum existiert nicht: $Denkraum" }
if (-not (Test-Path -LiteralPath (Join-Path $DshHome "profiles/$ProfileName"))) {
    throw "Profil '$ProfileName' fehlt unter $DshHome/profiles. Einmal 'scripts/install-pts-instance.ps1' ausfuehren."
}
if ($null -eq (Get-Command dsh -ErrorAction SilentlyContinue)) {
    throw "Der Befehl 'dsh' ist nicht im PATH. Node-/npm-Globalpfad pruefen oder dsh absolut aufrufen."
}

# Fail with a readable message instead of the launcher's EADDRINUSE: a second
# instance cannot bind the same port, and the port is the only signal.
$busy = $null
try { $busy = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop } catch { $busy = $null }
if ($null -ne $busy) {
    Write-Host "Port $Port ist belegt (PID $($busy[0].OwningProcess)) - die Instanz laeuft vermutlich schon." -ForegroundColor Yellow
    Write-Host "Dort weiterarbeiten oder einen anderen Port waehlen: -Port 3031" -ForegroundColor Yellow
    exit 1
}

$env:DSH_HOME = $DshHome
if ($ReadOnly) { $env:DSH_PERMISSION_MODE = 'read-only' }
else { Remove-Item Env:DSH_PERMISSION_MODE -ErrorAction SilentlyContinue }

Set-Location -LiteralPath $Denkraum
Write-Host "DSH_HOME : $DshHome" -ForegroundColor DarkGray
Write-Host "Denkraum : $Denkraum" -ForegroundColor DarkGray
Write-Host "Web      : http://127.0.0.1:$Port" -ForegroundColor DarkGray

& dsh --profile $ProfileName --port $Port
