# start-pts-web.ps1 — start the Pedagogical Thinking Space web surface.
param(
	[switch]$Open,
	[int]$Port = 3081
)

$ErrorActionPreference = "Stop"

$dshHome = $env:DSH_HOME
if (-not $dshHome) {
	$userProfile = [Environment]::GetFolderPath("UserProfile")
	$dshHome = Join-Path $userProfile ".dsh"
}
$profileDir = Join-Path $dshHome "profiles\pts-web"
$presetFile = Join-Path $dshHome ".agent-presets\pts-companion\agent.cordis.yml"
$repoRoot = Split-Path -Parent $PSScriptRoot
$settingsPath = Join-Path $profileDir "settings.yaml"
$renderScript = Join-Path $repoRoot "scripts\render-worker-routes.mjs"

if (-not (Test-Path (Join-Path $profileDir "package.json") -PathType Leaf)) {
	throw "pts-web profile not found at $profileDir"
}
if (-not (Test-Path $presetFile -PathType Leaf)) {
	throw "Canonical PTS preset missing. Run: pwsh -File .\scripts\install-pts-preset.ps1"
}

$preset = Get-Content $presetFile -Raw
$required = @(
	"@deepseek-ai/dsh-tool-jobs",
	"toolName: pts_research",
	"toolName: pts_edit_legacy",
	"@deepseek-ai/dsh-tool-subagent-control",
	"direct-pts-edit.mjs",
	"pts-product-v1",
	"toolName: pts_document",
	"toolName: pts_documentarian",
	"toolName: pts_material",
	"toolName: pts_review",
	"toolName: pts_renderer",
	"pts-companion-tool-boundary",
	"pts-worker-skill-scope",
	"pts-boot-docs",
	"pts-workspace-snapshot"
)
foreach ($needle in $required) {
	if (-not $preset.Contains($needle)) {
		throw "Installed PTS preset is stale (missing '$needle'). Run the installer with -Replace."
	}
}
foreach ($module in @('teaching-product.mjs', 'focus-context.mjs', 'workspace-parsers.mjs')) {
	if (-not (Test-Path (Join-Path (Split-Path -Parent $presetFile) $module) -PathType Leaf)) {
		throw "Installed PTS product module missing: $module. Run install-pts-preset.ps1."
	}
}
if ($preset.Contains("@PTS_SKILLS_DIR@") -or $preset.Contains("@PTS_SETTINGS_PATH@")) {
	throw "Installed PTS preset has unresolved placeholders. Run: pwsh -File .\scripts\install-pts-preset.ps1 -Replace"
}

# Skill-Manager plugin marker: the profile patch row + junction must exist so
# the workers' `skill` tool can see the repo skill library.
$patchFile = Join-Path $profileDir "cordis.patch.yml"
if (-not (Test-Path $patchFile -PathType Leaf) -or -not ((Get-Content $patchFile -Raw).Contains("pts-skill-manager"))) {
	throw "pts-web profile patch is missing the pts-skill-manager row (see docs/experiments/DSH_PTS_WEB_PROFILE.md)."
}
$junctionDir = Join-Path $profileDir "node_modules\pts-skill-manager"
if (-not (Test-Path $junctionDir)) {
	throw "pts-web profile junction missing for pts-skill-manager (see docs/experiments/DSH_PTS_WEB_PROFILE.md)."
}

# Apply worker LLM routes from the settings section `pts-worker-routes:` into
# the installed preset before starting (idempotent; routes take effect on this
# restart). See scripts/render-worker-routes.mjs.
if (Test-Path $renderScript -PathType Leaf) {
	Write-Host "Rendering worker routes from $settingsPath ..." -ForegroundColor DarkGray
	& node $renderScript --agent-cordis $presetFile --settings $settingsPath
	if ($LASTEXITCODE -ne 0) {
		throw "render-worker-routes failed (exit $LASTEXITCODE)"
	}
} else {
	Write-Host "render-worker-routes.mjs missing — skipping route render." -ForegroundColor Yellow
}

Write-Host "Starting PTS web (profile: pts-web) on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
Write-Host "Worker composition verified. Open a new conversation after startup." -ForegroundColor DarkGray

$argList = @("--profile", "pts-web", "--port", "$Port")
if (-not $Open) { $argList += "--no-open" }

& dsh @argList
exit $LASTEXITCODE
