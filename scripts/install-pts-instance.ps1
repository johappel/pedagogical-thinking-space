#Requires -Version 5.1
<#
.SYNOPSIS
    Renders the canonical PTS instance composition from this repository into
    $DSH_HOME (profile layer + agent preset) and verifies the composed profile.

.DESCRIPTION
    The repository is the source of truth; the DSH home holds the rendered copy.
    This script renders both layers:

      dsh/profiles/pts/*          -> $DSH_HOME/profiles/pts
      dsh/presets/<id>/*          -> $DSH_HOME/.agent-presets/<id>

    The profile patch gets the repository-root placeholder replaced with this
    repository's absolute path. The user settings' default agent preset is
    aligned. Finally `dsh --profile pts --dump-config` proves the rows are
    composed.

    Nothing under the harness installation is touched. Existing files are backed
    up beside themselves.

    READ THIS BEFORE INSTALLING INTO A RUNNING INSTANCE
    ---------------------------------------------------
    * The `agent-presets` row is a STARTUP artifact. Its config change
      re-instantiates the roster, and the standing preset mounts hang off that
      service, so running sessions lose their preset layer until they are
      created again. Run this script while the instance is stopped (or accept
      that running sessions need a reload).
    * Preset CODE (the .mjs modules) is cached per process: an edited module
      only takes effect after a restart. A changed composition file
      (agent.cordis.yml) does take effect for the next session.
    * The rendered preset directory is replaced wholesale; the repository copy
      is the one to edit.

    Windows PowerShell 5.1 compatible on purpose: it is the shell most Windows
    users already have.

.EXAMPLE
    powershell -File scripts/install-pts-instance.ps1
.EXAMPLE
    powershell -File scripts/install-pts-instance.ps1 -DshHome F:\dsh-instances\pts\.dsh
#>
[CmdletBinding()]
param(
    [string] $RepoRoot = '',
    [string] $DataRoot = '',
    [string] $DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }),
    [string] $ProfileName = 'pts',
    [string] $DefaultPreset = 'pts-companion',
    [int] $Port = 3030,
    [switch] $SkipDump
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

function Write-Step([string] $Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Note([string] $Text) { Write-Host "    $Text" -ForegroundColor DarkGray }
function Write-Warn([string] $Text) { Write-Host "    $Text" -ForegroundColor Yellow }

# PowerShell 5.1 has no -Encoding utf8NoBOM; write UTF-8 without a BOM by hand.
function Write-Utf8NoBom([string] $Path, [string] $Text) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Test-PortListening([int] $Port) {
    try {
        $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
        return ($null -ne $connection)
    }
    catch {
        return $false
    }
}

# ── where is the PTS repository? ─────────────────────────────────────────────
# The composition is static: `customSkillDirs`, the reference root and the
# placeholder paths are baked at install time, so the answer cannot come from a
# runtime service (a settings namespace would need a schema library that a
# repo-local plugin cannot import). It lives in the native settings document
# instead — `$DSH_HOME/settings.yaml` -> `pts: { repoRoot: … }` — which this
# installer reads and keeps in sync. An explicitly passed -RepoRoot wins,
# otherwise the document is authoritative, and a stale document is repaired.
$settingsPath = Join-Path $DshHome 'settings.yaml'

function Test-PtsRepo([string] $Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Path 'dsh/presets/pts-companion/agent.cordis.yml'))
}

function Get-PtsSettingValue([string] $Path, [string] $Key) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^pts:\s*$') {
            for ($j = $i + 1; $j -lt $lines.Count; $j++) {
                if ($lines[$j] -match '^\S') { break }
                if ($lines[$j] -match "^\s+${Key}:\s*(.+?)\s*$") {
                    return ($Matches[1].Trim().Trim("'").Trim('"'))
                }
            }
        }
    }
    return ''
}

# Read-modify-write one scalar under the top-level `pts:` section.
function Set-PtsSettingLine([string[]] $Lines, [string] $Key, [string] $Value) {
    $index = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) { if ($Lines[$i] -match '^pts:\s*$') { $index = $i; break } }
    $line = "  ${Key}: '$Value'"
    if ($index -lt 0) { return @($Lines) + @('pts:', $line) }
    $end = $index + 1
    while ($end -lt $Lines.Count -and $Lines[$end] -notmatch '^\S') { $end++ }
    for ($i = $index + 1; $i -lt $end; $i++) {
        if ($Lines[$i] -match "^\s+${Key}:") {
            $copy = @($Lines)
            $copy[$i] = $line
            return $copy
        }
    }
    $head = @($Lines[0..$index])
    $tail = @()
    if ($end -le $Lines.Count - 1) { $tail = @($Lines[$end..($Lines.Count - 1)]) }
    return @($head) + @($line) + @($tail)
}

$settingRepo = Get-PtsSettingValue $settingsPath 'repoRoot'
if ($PSBoundParameters.ContainsKey('RepoRoot')) {
    $repo = (Resolve-Path -LiteralPath $RepoRoot).Path
    if ($settingRepo -ne '') { Write-Note "Parameter -RepoRoot gewinnt; settings.yaml pts.repoRoot wird auf $repo gesetzt" }
}
elseif (Test-PtsRepo $settingRepo) {
    $repo = (Resolve-Path -LiteralPath $settingRepo).Path
    Write-Note "Repopfad aus settings.yaml (pts.repoRoot): $repo"
}
else {
    $repo = (Resolve-Path -LiteralPath $RepoRoot).Path
    if ($settingRepo -ne '') {
        Write-Warn "settings.yaml pts.repoRoot zeigt nicht auf ein PTS-Repo ($settingRepo) - nutze $repo"
    }
}

# The instance data area holds what PTS sessions may write: Denkräume plus the
# knowledge and skills the instance grows. It defaults to the DSH home's parent
# (`F:\dsh-instances\pts` for `F:\dsh-instances\pts\.dsh`), so the repository
# stays free of teacher content and read-only for every session.
$settingData = Get-PtsSettingValue $settingsPath 'dataRoot'
if ($PSBoundParameters.ContainsKey('DataRoot')) {
    $dataRoot = (Resolve-Path -LiteralPath $DataRoot).Path
    if ($settingData -ne '') { Write-Note "Parameter -DataRoot gewinnt; settings.yaml pts.dataRoot wird auf $dataRoot gesetzt" }
}
elseif ($settingData -ne '') {
    $dataRoot = $settingData
    Write-Note "Datenwurzel aus settings.yaml (pts.dataRoot): $dataRoot"
}
else {
    $dataRoot = Split-Path -Parent $DshHome
    if ($dataRoot -eq '') { throw 'Datenwurzel nicht bestimmbar; -DataRoot explizit angeben.' }
}
foreach ($dir in @('denkraeume', 'knowledge', 'skills')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot $dir) | Out-Null
}
Write-Note "Datenwurzel: $dataRoot (denkraeume, knowledge, skills)"

$templateDir = Join-Path $repo 'dsh/profiles/pts'
$presetSourceRoot = Join-Path $repo 'dsh/presets'
$profileDir = Join-Path $DshHome "profiles/$ProfileName"
$presetTargetRoot = Join-Path $DshHome '.agent-presets'

foreach ($required in @('cordis.patch.yml', 'package.json', 'cordis.yml')) {
    $path = Join-Path $templateDir $required
    if (-not (Test-Path -LiteralPath $path)) { throw "Vorlage fehlt: $path" }
}
if (-not (Test-Path -LiteralPath (Join-Path $presetSourceRoot "$DefaultPreset/agent.cordis.yml"))) {
    throw "Preset fehlt: $presetSourceRoot\$DefaultPreset\agent.cordis.yml"
}

if (Test-PortListening -Port $Port) {
    Write-Step "Hinweis: auf Port $Port lauscht bereits eine Instanz"
    Write-Warn 'Die Roster-Zeile ist ein Startartefakt: laufende Sessions koennen ihre Preset-Ebene verlieren.'
    Write-Warn 'Preset-Code greift erst nach einem Neustart; das gerenderte Preset selbst findet der Roster sofort.'
}

# Both roots travel into YAML; forward slashes keep them portable.
$rootForYaml = $repo -replace '\\', '/'
$dataRootForYaml = $dataRoot -replace '\\', '/'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

Write-Step "Profil $ProfileName <- $templateDir"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$patchPath = Join-Path $profileDir 'cordis.patch.yml'
if (Test-Path -LiteralPath $patchPath) {
    $backup = "$patchPath.bak-$stamp"
    Copy-Item -LiteralPath $patchPath -Destination $backup -Force
    Write-Note "Sicherung: $backup"
}

$patch = (Get-Content -LiteralPath (Join-Path $templateDir 'cordis.patch.yml') -Raw -Encoding UTF8) `
    -replace '@PTS_ROOT@', $rootForYaml `
    -replace '@PTS_DATA_ROOT@', $dataRootForYaml
if ($patch -match '@PTS_(ROOT|DATA_ROOT)@') {
    throw "Platzhalter im Profil-Patch nicht ersetzt: $patchPath"
}
if ($patch -notmatch [regex]::Escape("workspaceRoot: '$dataRootForYaml/denkraeume'")) {
    throw "Sandbox-Wurzel zeigt nicht auf die Datenwurzel: $patchPath"
}
Write-Utf8NoBom $patchPath $patch
Copy-Item -LiteralPath (Join-Path $templateDir 'package.json') -Destination (Join-Path $profileDir 'package.json') -Force
Copy-Item -LiteralPath (Join-Path $templateDir 'cordis.yml') -Destination (Join-Path $profileDir 'cordis.yml') -Force

Write-Step "Presets <- $presetSourceRoot"
New-Item -ItemType Directory -Force -Path $presetTargetRoot | Out-Null
$presetTextExtensions = @('.yml', '.yaml', '.md', '.json', '.txt', '.mjs', '.js')
foreach ($preset in Get-ChildItem -LiteralPath $presetSourceRoot -Directory) {
    $target = Join-Path $presetTargetRoot $preset.Name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Copy-Item -LiteralPath $preset.FullName -Destination $target -Recurse -Force
    # The composition is rendered into the DSH home, so it cannot reach the
    # repository by climbing out of its own directory: the repository root travels
    # as `@PTS_ROOT@` and is substituted here, exactly as in the profile patch.
    foreach ($file in Get-ChildItem -LiteralPath $target -Recurse -File) {
        if ($presetTextExtensions -notcontains $file.Extension.ToLowerInvariant()) { continue }
        $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        if ($text -notmatch '@PTS_(ROOT|DATA_ROOT)@') { continue }
        Write-Utf8NoBom $file.FullName ($text -replace '@PTS_ROOT@', $rootForYaml -replace '@PTS_DATA_ROOT@', $dataRootForYaml)
    }
    Write-Note "$($preset.Name) -> $target"
}
# A placeholder left in a VALUE position would silently point the preset at the
# home directory — the exact failure this rule exists to prevent.
$renderedComposition = Join-Path $presetTargetRoot "$DefaultPreset/agent.cordis.yml"
$renderedText = Get-Content -LiteralPath $renderedComposition -Raw -Encoding UTF8
if ($renderedText -match '(?m)^\s*(repoRoot|customSkillDirs|dataRoot):.*@PTS_(ROOT|DATA_ROOT)@') {
    throw "Platzhalter im Preset nicht ersetzt: $renderedComposition"
}
if ($renderedText -notmatch [regex]::Escape("repoRoot: '$rootForYaml'")) {
    throw "Preset-Referenzwurzel zeigt nicht auf das Repo: $renderedComposition"
}
if ($renderedText -notmatch [regex]::Escape("'$rootForYaml/skills'")) {
    throw "Preset-Skillverzeichnis zeigt nicht auf das Repo: $renderedComposition"
}
if ($renderedText -notmatch [regex]::Escape("'$dataRootForYaml/skills'")) {
    throw "Preset-Skillverzeichnis zeigt nicht auf die Datenwurzel: $renderedComposition"
}
Write-Note "Referenzwurzel $rootForYaml und Skillwurzeln (Repo + $dataRootForYaml) im Preset gesetzt"

# Align the user settings document. It is hot-reloaded, so the change takes
# effect without a restart; unknown surrounding content is preserved verbatim.
$settingsPath = Join-Path $DshHome 'settings.yaml'
$defaultLine = "  default: $DefaultPreset"
if (Test-Path -LiteralPath $settingsPath) {
    $lines = @(Get-Content -LiteralPath $settingsPath -Encoding UTF8)
    $blockStart = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^agent-presets:\s*$') { $blockStart = $i; break }
    }
    if ($blockStart -lt 0) {
        $lines = $lines + @('agent-presets:', $defaultLine)
        Write-Note 'settings.yaml: agent-presets-Block ergaenzt'
    }
    else {
        $replaced = $false
        for ($i = $blockStart + 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^\S') { break }
            if ($lines[$i] -match '^\s+default:') { $lines[$i] = $defaultLine; $replaced = $true; break }
        }
        if (-not $replaced) {
            $head = @()
            if ($blockStart -gt 0) { $head = $lines[0..($blockStart - 1)] }
            $tail = @()
            if ($blockStart + 1 -le $lines.Count - 1) { $tail = $lines[($blockStart + 1)..($lines.Count - 1)] }
            $lines = @($head) + @($lines[$blockStart]) + @($defaultLine) + @($tail)
        }
        Write-Note "settings.yaml: agent-presets.default = $DefaultPreset"
    }
    $backupSettings = "$settingsPath.bak-$stamp"
    Copy-Item -LiteralPath $settingsPath -Destination $backupSettings -Force
    Write-Utf8NoBom $settingsPath ($lines -join "`n")
    Write-Note "Sicherung: $backupSettings"
}
else {
    Write-Utf8NoBom $settingsPath (@('agent-presets:', $defaultLine) -join "`n")
    Write-Note 'settings.yaml neu angelegt'
}

# Keep both roots in the settings document. It is the one place a human edits
# and this installer is the one place that materializes it, so the two stay in
# sync instead of drifting apart.
$settingsLines = @(Get-Content -LiteralPath $settingsPath -Encoding UTF8)
$settingsLines = Set-PtsSettingLine $settingsLines 'repoRoot' $rootForYaml
$settingsLines = Set-PtsSettingLine $settingsLines 'dataRoot' $dataRootForYaml
Write-Utf8NoBom $settingsPath ($settingsLines -join "`n")
Write-Note "settings.yaml: pts.repoRoot = $rootForYaml, pts.dataRoot = $dataRootForYaml"

if ($SkipDump) { Write-Step 'Fertig (ohne --dump-config).'; exit 0 }

Write-Step "Verifikation: dsh --profile $ProfileName --dump-config"
$env:DSH_HOME = $DshHome
$dump = (& dsh --profile $ProfileName --dump-config 2>&1 | Out-String)
$markers = [ordered]@{
    'Roster-Default'  = "default: $DefaultPreset"
    'PTS-Preset-Id'   = 'pts-companion'
    'Demo-Capability' = 'pts-demo-capability'
    'Whiteboard'      = 'dsh-whiteboard'
    'Webserver'       = 'webserver'
    'Sandbox-Mode'    = 'workspace-write'
    'Sandbox-Root'    = 'denkraeume'
}
$failed = @()
foreach ($entry in $markers.GetEnumerator()) {
    if ($dump -match [regex]::Escape($entry.Value)) { Write-Host ("    [ok]    {0}" -f $entry.Key) -ForegroundColor Green }
    else { Write-Host ("    [FEHLT] {0} ({1})" -f $entry.Key, $entry.Value) -ForegroundColor Red; $failed += $entry.Key }
}
if ($failed.Count -gt 0) {
    Write-Host $dump
    throw "Profil unvollstaendig: $($failed -join ', ')"
}
Write-Step 'PASS: Profil und Preset sind gerendert.'
Write-Note 'Start: powershell -File scripts/start-pts.ps1'
