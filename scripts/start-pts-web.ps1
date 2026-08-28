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
	"toolName: pts_material",
	"toolName: pts_review",
	"toolName: pts_renderer",
	"pts-companion-tool-boundary"
)
foreach ($needle in $required) {
	if (-not $preset.Contains($needle)) {
		throw "Installed PTS preset is stale (missing '$needle'). Run the installer with -Replace."
	}
}

Write-Host "Starting PTS web (profile: pts-web) on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
Write-Host "Worker composition verified. Open a new conversation after startup." -ForegroundColor DarkGray

$argList = @("--profile", "pts-web", "--port", "$Port")
if (-not $Open) { $argList += "--no-open" }

& dsh @argList
exit $LASTEXITCODE
