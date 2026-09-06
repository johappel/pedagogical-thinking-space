# Install the two PTS profile plugins that are intentionally kept outside the
# canonical Companion preset. DSH still owns sessions, histories and lifecycle.
param([string]$ProfileDir)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProfileDir)) {
    $dshHome = $env:DSH_HOME
    if (-not $dshHome) { $dshHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh' }
    $ProfileDir = Join-Path $dshHome 'profiles\pts-web'
}
$ProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)
$nodeModules = Join-Path $ProfileDir 'node_modules'
$patchPath = Join-Path $ProfileDir 'cordis.patch.yml'
if (-not (Test-Path $patchPath -PathType Leaf)) { throw "Profile patch not found: $patchPath" }
New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null

$plugins = @(
    @{ Name = 'pts-conversation-binding'; Inject = '[webServer]' },
    @{ Name = 'pts-moment-workshop'; Inject = '[webServer]' }
)
$patch = Get-Content -LiteralPath $patchPath -Raw
foreach ($plugin in $plugins) {
    $source = Join-Path $repoRoot "dsh-plugins\$($plugin.Name)"
    $target = Join-Path $nodeModules $plugin.Name
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
    if ($patch -notmatch "(?m)^\s*- id: $([regex]::Escape($plugin.Name))\s*$") {
        $row = "    # $($plugin.Name)`n    - id: $($plugin.Name)`n      name: $($plugin.Name)`n      inject: $($plugin.Inject)`n"
        $anchor = "    - id: pts-workspace-git"
        if ($patch.Contains($anchor)) { $patch = $patch.Replace($anchor, $row + $anchor) }
        else { $patch += "`n- insert:`n$row" }
    }
}
Set-Content -LiteralPath $patchPath -Value $patch -Encoding UTF8
Write-Host "Installed PTS web plugins: $($plugins.Name -join ', ')" -ForegroundColor Green
Write-Host "Restart DSH; client-only changes are not hot-reloaded." -ForegroundColor Cyan
