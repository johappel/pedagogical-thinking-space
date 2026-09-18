# Wire the Phase-2A Teaching Product editor (Quill) into a DSH WEB profile.
#
# This is the ONE step the browser E2E harness deliberately avoids because it
# touches the profile layer outside the agent workspace (junction + patch row)
# and therefore needs an elevated shell. After running it, restart DSH; the
# editor appears as the right-sidebar tab "Unterrichtsprodukt".
#
#   pwsh -File scripts/install-pts-teaching-product-editor.ps1
#   pwsh -File scripts/install-pts-teaching-product-editor.ps1 -ProfileDir F:\dsh-instances\pts\.dsh\profiles\pts-web
#
# The editor is a WEB UI plugin; install it into a web profile (default pts-web),
# not into the rendered pts companion profile (that one is overwritten by the
# instance installer). Client-only changes are not hot-reloaded — restart DSH.
param([string]$ProfileDir)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginName = 'pts-teaching-product-editor'

if ([string]::IsNullOrWhiteSpace($ProfileDir)) {
    $dshHome = $env:DSH_HOME
    if (-not $dshHome) { $dshHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh' }
    $ProfileDir = Join-Path $dshHome 'profiles\pts-web'
}
$ProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)
$nodeModules = Join-Path $ProfileDir 'node_modules'
$patchPath = Join-Path $ProfileDir 'cordis.patch.yml'
if (-not (Test-Path $patchPath -PathType Leaf)) { throw "Profile patch not found: $patchPath (create the web profile first)" }
New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null

# The editor package imports the pure domain package by relative path; Node
# resolves through the junction's real path, so only the editor needs a junction.
$source = Join-Path $repoRoot "dsh-plugins\$pluginName"
$target = Join-Path $nodeModules $pluginName
if (-not (Test-Path (Join-Path $source 'package.json') -PathType Leaf)) { throw "Plugin package missing: $source" }
if (Test-Path $target) {
    $item = Get-Item -LiteralPath $target -Force
    if ($item.LinkType -ne 'Junction') { throw "Refusing to replace non-junction: $target" }
    $resolved = [System.IO.Path]::GetFullPath($item.Target)
    $expected = [System.IO.Path]::GetFullPath($source)
    if ($resolved.TrimEnd('\').ToLowerInvariant() -ne $expected.TrimEnd('\').ToLowerInvariant()) { throw "Junction points elsewhere: $target" }
} else {
    New-Item -ItemType Junction -Path $target -Target $source | Out-Null
}

$patch = Get-Content -LiteralPath $patchPath -Raw
if ($patch -notmatch "(?m)^\s*- id: $([regex]::Escape($pluginName))\s*$") {
    $row = "    # $pluginName (Phase 2A) — Quill editor for the teaching product`n    - id: $pluginName`n      name: $pluginName`n      inject: [webServer]`n"
    $patch += "`n- insert:`n$row"
    Set-Content -LiteralPath $patchPath -Value $patch -Encoding UTF8
    Write-Host "Added patch row for $pluginName" -ForegroundColor Green
} else {
    Write-Host "Patch row for $pluginName already present" -ForegroundColor Yellow
}

Write-Host "Junctioned $pluginName into $nodeModules" -ForegroundColor Green
Write-Host "Phase 2C: the plugin registers a collab WebSocket via webServer.registerUpgrade at /pts-teaching-product/collab." -ForegroundColor Cyan
Write-Host "yjs/y-quill/ws resolve from the repo node_modules through the junction real path (no separate profile install)." -ForegroundColor Cyan
Write-Host "Restart DSH, then open the right-sidebar tab 'Unterrichtsprodukt'." -ForegroundColor Cyan
