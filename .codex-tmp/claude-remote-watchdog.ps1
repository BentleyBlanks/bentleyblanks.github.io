$ErrorActionPreference = "SilentlyContinue"

$Workdir = "C:\Users\Bentl\Documents\Program\bentleyblanks.github.io"
$ClaudeCmd = "C:\Users\Bentl\AppData\Roaming\npm\claude.cmd"
$Channel = "bentleyblanks-remotecontrol"
$SessionId = "07d61063-d349-4c3f-b947-640e10c3bcf7"
$SessionsDir = Join-Path $env:USERPROFILE ".claude\sessions"
$LogPath = Join-Path $env:TEMP "claude-remote-watchdog.log"
$PidPath = Join-Path $env:TEMP "claude-remote-watchdog.pid"

function Write-Log($Message) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message"
}

function Get-RemoteProcesses {
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -match "claude|powershell|cmd") -and
    ($_.CommandLine -match "remote-control") -and
    ($_.CommandLine -match [regex]::Escape($Channel))
  }
}

function Stop-RemoteProcesses {
  $targets = @(Get-RemoteProcesses)
  if ($targets.Count -gt 0) {
    Write-Log "Stopping stale remote-control processes: $($targets.ProcessId -join ', ')"
    Stop-Process -Id ($targets | Select-Object -ExpandProperty ProcessId -Unique) -Force
    Start-Sleep -Seconds 2
  }
}

function Start-RemoteSession {
  Write-Log "Starting remote-control for session $SessionId"
  $launchCommand = "`$Host.UI.RawUI.WindowTitle = 'Claude Code Remote Control'; Set-Location -LiteralPath '$Workdir'; & '$ClaudeCmd' --resume '$SessionId' --remote-control '$Channel'"
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $launchCommand) -WindowStyle Normal | Out-Null
  Start-Sleep -Seconds 10
}

function Get-CurrentSessionState {
  $sessionFiles = @(Get-ChildItem -LiteralPath $SessionsDir -File -ErrorAction SilentlyContinue)
  foreach ($file in $sessionFiles) {
    try {
      $state = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
      if ($state.sessionId -eq $SessionId) {
        return $state
      }
    } catch {
    }
  }
  return $null
}

Set-Content -LiteralPath $PidPath -Value $PID
Write-Log "Watchdog started. pid=$PID session=$SessionId channel=$Channel"

$missingBridgeCount = 0
while ($true) {
  try {
    $remoteProcesses = @(Get-RemoteProcesses)
    $state = Get-CurrentSessionState

    if ($remoteProcesses.Count -eq 0) {
      Write-Log "No remote-control process found."
      Start-RemoteSession
      $missingBridgeCount = 0
    } elseif ($null -eq $state) {
      Write-Log "No Claude session state file found for current session."
      $missingBridgeCount = 0
    } elseif ([string]::IsNullOrWhiteSpace([string]$state.bridgeSessionId)) {
      $missingBridgeCount += 1
      Write-Log "Bridge session missing. status=$($state.status) count=$missingBridgeCount"
      if ($state.status -eq "idle" -and $missingBridgeCount -ge 2) {
        Stop-RemoteProcesses
        Start-RemoteSession
        $missingBridgeCount = 0
      }
    } else {
      if ($missingBridgeCount -ne 0) {
        Write-Log "Bridge restored: $($state.bridgeSessionId)"
      }
      $missingBridgeCount = 0
    }
  } catch {
    Write-Log "Watchdog error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 300
}
