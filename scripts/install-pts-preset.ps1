# install-pts-preset.ps1 — expose the repository's canonical PTS preset to DSH.
param(
	[switch]$Replace
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot "dsh-presets\pts-companion"
if (-not (Test-Path (Join-Path $source "agent.cordis.yml") -PathType Leaf)) {
	throw "Canonical preset not found at $source"
}

$dshHome = $env:DSH_HOME
if (-not $dshHome) {
	$userProfile = [Environment]::GetFolderPath("UserProfile")
	$dshHome = Join-Path $userProfile ".dsh"
}
$presetRoot = Join-Path $dshHome ".agent-presets"
$target = Join-Path $presetRoot "pts-companion"

New-Item -ItemType Directory -Path $presetRoot -Force | Out-Null

if (Test-Path $target) {
	$existing = Get-Item $target -Force
	$resolvedSource = [System.IO.Path]::GetFullPath((Resolve-Path $source).Path).TrimEnd('\')
	$resolvedTarget = $null
	if ($existing.LinkType -eq "Junction" -and $existing.Target) {
		$resolvedTarget = [System.IO.Path]::GetFullPath([string]$existing.Target).TrimEnd('\')
	}

	if ($resolvedTarget -eq $resolvedSource) {
		Write-Host "PTS preset is already linked to $source" -ForegroundColor Green
		exit 0
	}

	if (-not $Replace) {
		throw @"
$target already exists and is not linked to this checkout.
Run again with -Replace to move it to a timestamped backup and install the canonical preset.
"@
	}

	$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
	$backup = "$target.backup-$stamp"
	Move-Item -LiteralPath $target -Destination $backup
	Write-Host "Previous preset moved to $backup" -ForegroundColor Yellow
}

New-Item -ItemType Junction -Path $target -Target $source | Out-Null

$installed = Get-Content (Join-Path $target "agent.cordis.yml") -Raw
$required = @(
	"@deepseek-ai/dsh-tool-jobs",
	"toolName: pts_research",
	"toolName: pts_material",
	"toolName: pts_review",
	"toolName: pts_renderer"
)
foreach ($needle in $required) {
	if (-not $installed.Contains($needle)) {
		throw "Installed preset verification failed: missing '$needle'"
	}
}

Write-Host "Installed canonical PTS preset at $target" -ForegroundColor Green
Write-Host "Restart DSH and open a new conversation." -ForegroundColor Cyan
