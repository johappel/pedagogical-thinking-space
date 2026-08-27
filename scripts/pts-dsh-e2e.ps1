# pts-dsh-e2e.ps1 — runnable live DSH end-to-end smoke + evidence collector for
# the curriculum-alignment capability through the real DSH runtime.
#
# WHY A SCRIPT (documented blocker for a fully-automated in-agent run):
#   * The pts-web profile is a web server (port 3081). DSH's web profile has NO
#     HMR, so the NEW plugin code is only loaded on a fresh start; a running
#     interactive session keeps the old code.
#   * A full Companion -> Steward -> dispatch -> child run needs the interactive
#     web profile (the steward triggers on session turn/end) PLUS model
#     credentials (OpenRouter for the research child) and a reachable web-search
#     provider (credits/keys). Those cannot be consumed/printed automatically.
#   * An in-process boot of the real agent factory is a heavy cordis harness the
#     task explicitly said to avoid.
# This script drives the real path against pts-web (port 3081) and collects the
# evidence. The default DSH profile and port 3080 are never touched.
#
# Usage:
#   1. pwsh scripts/pts-dsh-e2e.ps1 -Start        # (re)start pts-web with new code
#   2. In a FRESH Companion chat in that Denkraum, send the prompt printed below.
#   3. pwsh scripts/pts-dsh-e2e.ps1 -Collect -Slug <denkraum-slug>

param(
	[switch]$Start,
	[switch]$Collect,
	[string]$Slug = "",
	[int]$Port = 3081
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$statusUrl = "http://127.0.0.1:$Port/api/pts-background-steward/status"

function Assert-StandardUntouched {
	# Port 3080 / standard `web` profile must remain unaffected by this test.
	$p3080 = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
	if ($p3080) { Write-Host "Hinweis: Port 3080 laeuft (Standardprofil) — dieser Test fasst ihn NICHT an." -ForegroundColor Yellow }
}

$prompt = @'
Beziehe das bitte auf den Kernlehrplan Religionslehre NRW, gymnasiale Oberstufe,
Jahrgang 11. Kannst du die offiziellen Quellen verifizieren und im Knowledge
speichern? Thema: Utopie und Hoffnung.
'@

if ($Start) {
	Assert-StandardUntouched
	Write-Host "Starte pts-web (Port $Port) mit dem aktuellen Plugin-Code ..." -ForegroundColor Cyan
	Write-Host "Fenster offen lassen; danach in einem FRISCHEN Companion-Chat senden:`n" -ForegroundColor Cyan
	Write-Host $prompt -ForegroundColor Green
	Write-Host "`n(Beenden mit Strg+C. Danach: pwsh scripts/pts-dsh-e2e.ps1 -Collect -Slug <slug>)`n"
	dsh --profile pts-web
	return
}

if ($Collect) {
	if ([string]::IsNullOrWhiteSpace($Slug)) { throw "Bitte -Slug <denkraum-slug> angeben." }
	$denk = Join-Path $root "workspace/$Slug"
	if (-not (Test-Path $denk)) { throw "Denkraum nicht gefunden: $denk" }

	Write-Host "==== 1) Steward-Status (aktive Child-Sessions, Research-Route/Tools) ====" -ForegroundColor Cyan
	try {
		$st = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 5
		Write-Host ("research.allowedTools = " + ($st.config.research.allowedTools -join ", "))
		Write-Host ("steward.allowedTools  = " + ($st.config.allowedTools -join ", "))
		Write-Host ("activeChildSessions   = " + ($st.activeChildSessions -join ", "))
	} catch { Write-Host "Status-Endpoint nicht erreichbar: $($_.Exception.Message)" -ForegroundColor Yellow }

	Write-Host "`n==== 2) Kanonischer Service Request (Capability-ID + Version + Lifecycle) ====" -ForegroundColor Cyan
	Get-ChildItem (Join-Path $denk "service-requests") -Filter *.yml -ErrorAction SilentlyContinue | ForEach-Object {
		Write-Host "--- $($_.Name) ---"
		Get-Content $_.FullName | Select-String -Pattern "task:|capability_version:|status:|attempts:|expected_output:|storage:|result_location:"
	}

	Write-Host "`n==== 3) Execution-Log (Capability -> Lauf -> Tools -> Status) ====" -ForegroundColor Cyan
	$log = Join-Path $denk "execution-log.jsonl"
	if (Test-Path $log) { Get-Content $log } else { Write-Host "(noch kein execution-log.jsonl)" }

	Write-Host "`n==== 4) Ergebnis (Draft bzw. Knowledge Proposal) ====" -ForegroundColor Cyan
	Get-ChildItem (Join-Path $denk "knowledge-proposals") -Filter *.md -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "PROPOSAL: $($_.FullName)" }
	Get-ChildItem (Join-Path $denk "drafts") -Filter "curriculum-alignment-*.md" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "DRAFT:    $($_.FullName)" }

	Write-Host "`n==== 5) Nachweis: nur der Child nutzt web_search/web_fetch ====" -ForegroundColor Cyan
	Write-Host "In den DSH-Session-Events (~/.dsh/profiles/pts-web/… session log) pruefen:"
	Write-Host " - subagent/start: genau EIN pts-steward-research Child;"
	Write-Host " - tools/execute mit name web_search|web_fetch NUR unter der Child-Session-ID;"
	Write-Host " - die Parent/Companion-Session fuehrt KEIN web_search/web_fetch aus;"
	Write-Host " - kein zusaetzlicher pts-steward-Reflexionslauf nach dem Follow-up."
	return
}

Write-Host "Optionen: -Start | -Collect -Slug <slug>. Siehe Kopf dieser Datei." -ForegroundColor Cyan
Write-Host "`nExakter Realprompt:`n" -ForegroundColor Cyan
Write-Host $prompt -ForegroundColor Green
