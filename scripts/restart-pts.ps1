#Requires -Version 5.1
<#
.SYNOPSIS
    Stops the PTS DSH instance on one explicit port and starts it again.

.DESCRIPTION
    The script verifies that the listener is a DSH Node process before it
    stops anything. It asks for confirmation by default because restarting
    interrupts active conversations. The restarted instance inherits
    start-pts.ps1's safe default: no browser tab is opened unless -Open is
    supplied deliberately.

.EXAMPLE
    powershell -File scripts/restart-pts.ps1 -Sync
.EXAMPLE
    powershell -File scripts/restart-pts.ps1 -Force
    Restarts without an interactive confirmation after the DSH identity check.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [string] $RepoRoot = '',
    [string] $DataRoot = '',
    [string] $DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { 'F:\dsh-instances\pts\.dsh' }),
    [string] $ProfileName = 'pts',
    [string] $Denkraum,
    [int] $Port = 3030,
    [switch] $Sync,
    [switch] $ReadOnly,
    [switch] $Open,
    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$listener = $null
try { $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1 } catch { $listener = $null }
if ($null -ne $listener) {
    $processId = [int]$listener.OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
    $commandLine = [string]$process.CommandLine
    if ($process.Name -notmatch '^node(?:\.exe)?$' -or $commandLine -notmatch '(@deepseek-ai[\\/]dsh|\bdsh(?:\.cmd)?\b)') {
        throw "Port $Port gehoert nicht nachweisbar zu DSH (PID ${processId}: $($process.Name)). Nicht beendet."
    }
    if ($Force -or $PSCmdlet.ShouldProcess("DSH auf Port $Port (PID $processId)", 'beenden und PTS neu starten')) {
        Stop-Process -Id $processId -Force
        $deadline = (Get-Date).AddSeconds(10)
        do {
            Start-Sleep -Milliseconds 200
            try { $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1 } catch { $listener = $null }
        } while ($null -ne $listener -and (Get-Date) -lt $deadline)
        if ($null -ne $listener) { throw "DSH auf Port $Port wurde nicht innerhalb von 10 Sekunden beendet." }
    } else {
        return
    }
}

$startScript = Join-Path $PSScriptRoot 'start-pts.ps1'
if ($Force -or $PSCmdlet.ShouldProcess("PTS auf Port $Port", 'starten')) {
    & $startScript -RepoRoot $RepoRoot -DataRoot $DataRoot -DshHome $DshHome -ProfileName $ProfileName -Denkraum $Denkraum -Port $Port -Sync:$Sync -ReadOnly:$ReadOnly -Open:$Open
    exit $LASTEXITCODE
}
exit 0
