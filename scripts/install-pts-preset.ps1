# install-pts-preset.ps1 — expose the repository's canonical PTS preset to DSH.
#
# The preset is installed as a REAL directory copy, not a junction: the current
# DSH version does not index linked (reparse-point) preset folders, so a linked
# pts-companion never shows up under "CUSTOM". A managed marker file records the
# source path so re-running this script refreshes the copy in place; edit the
# canonical preset in the repo and re-run to update.
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
$markerName = ".pts-installed-from"
$resolvedSource = [System.IO.Path]::GetFullPath((Resolve-Path $source).Path).TrimEnd('\')

New-Item -ItemType Directory -Path $presetRoot -Force | Out-Null

if (Test-Path $target) {
	$existing = Get-Item $target -Force

	if ($existing.LinkType -eq "Junction") {
		# Legacy link-based install: DSH never listed it under CUSTOM. Remove the
		# junction (link only — rmdir never follows into the source tree) and fall
		# through to a real copy below.
		cmd /c rmdir "$target" | Out-Null
		Write-Host "Removed legacy junction; installing a real preset copy instead." -ForegroundColor Yellow
	} else {
		$markerPath = Join-Path $target $markerName
		$managed = $false
		if (Test-Path $markerPath -PathType Leaf) {
			$recorded = (Get-Content $markerPath -Raw).Trim()
			if ($recorded -eq $resolvedSource) { $managed = $true }
		}

		if ($managed) {
			# Our own copy from a previous run: refresh it in place.
			Remove-Item -LiteralPath $target -Recurse -Force
		} elseif ($Replace) {
			$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
			$backup = "$target.backup-$stamp"
			Move-Item -LiteralPath $target -Destination $backup
			Write-Host "Previous preset moved to $backup" -ForegroundColor Yellow
		} else {
			throw @"
$target already exists and is not managed by this installer.
Run again with -Replace to move it to a timestamped backup and install the canonical preset copy.
"@
		}
	}
}

Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
Set-Content -LiteralPath (Join-Path $target $markerName) -Value $resolvedSource -NoNewline -Encoding UTF8

# Substitute the machine-specific skill library root and the profile settings
# document into the installed preset (the canonical agent.cordis.yml keeps the
# @PTS_SKILLS_DIR@ / @PTS_SETTINGS_PATH@ placeholders).
$presetPath = Join-Path $target "agent.cordis.yml"
$skillsDir = (Join-Path $repoRoot "skills").Replace('\', '/')
$settingsPath = (Join-Path $dshHome "profiles\pts-web\settings.yaml").Replace('\', '/')
$substituted = (Get-Content $presetPath -Raw)
$substituted = $substituted.Replace("@PTS_SKILLS_DIR@", $skillsDir)
$substituted = $substituted.Replace("@PTS_SETTINGS_PATH@", $settingsPath)
Set-Content -LiteralPath $presetPath -Value $substituted -Encoding UTF8

$installed = Get-Content $presetPath -Raw
$required = @(
	"@deepseek-ai/dsh-tool-jobs",
	"toolName: pts_research",
	"toolName: pts_edit",
	"toolName: pts_document",
	"toolName: pts_material",
	"toolName: pts_review",
	"toolName: pts_renderer",
	"pts-companion-tool-boundary",
	"pts-worker-skill-scope",
	"pts-boot-docs",
	"pts-workspace-snapshot",
	"@deepseek-ai/dsh-skill-filesystem",
	"@deepseek-ai/dsh-tool-skill"
)
foreach ($needle in $required) {
	if (-not $installed.Contains($needle)) {
		throw "Installed preset verification failed: missing '$needle'"
	}
}
foreach ($placeholder in @("@PTS_SKILLS_DIR@", "@PTS_SETTINGS_PATH@")) {
	if ($installed.Contains($placeholder)) {
		throw "Installed preset verification failed: placeholder not substituted: $placeholder"
	}
}
if (-not $installed.Contains($settingsPath)) {
	throw "Installed preset verification failed: settings path not written"
}

# Profile plugin marker: the Skill-Manager patch row and junction must exist,
# otherwise the skill library stays invisible to the workers' skill tool.
$profileDir = Join-Path $dshHome "profiles\pts-web"
$patchPath = Join-Path $profileDir "cordis.patch.yml"
$junctionPath = Join-Path $profileDir "node_modules\pts-skill-manager"
if (-not (Test-Path $patchPath -PathType Leaf) -or -not ((Get-Content $patchPath -Raw).Contains("pts-skill-manager"))) {
	throw "Profile patch missing the pts-skill-manager row in $patchPath (see docs/experiments/DSH_PTS_WEB_PROFILE.md)"
}
if (-not (Test-Path $junctionPath)) {
	throw "Profile junction missing: $junctionPath -> F:\code\pedagogical-thinking-space\dsh-plugins\pts-skill-manager"
}

Write-Host "Installed canonical PTS preset (copy) at $target" -ForegroundColor Green
Write-Host "Restart DSH; pts-companion now appears under CUSTOM." -ForegroundColor Cyan
