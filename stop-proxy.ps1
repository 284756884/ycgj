$ErrorActionPreference = "Continue"
$port = 4173
$processIds = New-Object "System.Collections.Generic.HashSet[int]"

Write-Host "Stopping Ozon local proxy..."
Write-Host "Target: http://127.0.0.1:$port"
Write-Host ""

try {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    if ($connection.OwningProcess -and $connection.OwningProcess -ne 0) {
      [void]$processIds.Add([int]$connection.OwningProcess)
    }
  }
} catch {
  Write-Host "Get-NetTCPConnection failed. Falling back to netstat."
}

if ($processIds.Count -eq 0) {
  try {
    $lines = netstat -ano -p tcp | Select-String ":$port\s+.*LISTENING\s+(\d+)\s*$"
    foreach ($line in $lines) {
      $match = [regex]::Match($line.Line, "LISTENING\s+(\d+)\s*$")
      if ($match.Success) {
        [void]$processIds.Add([int]$match.Groups[1].Value)
      }
    }
  } catch {
    Write-Host ("netstat failed: " + $_.Exception.Message)
  }
}

if ($processIds.Count -eq 0) {
  Write-Host "No proxy process was found on port 4173."
  exit 0
}

foreach ($processId in $processIds) {
  try {
    $proc = Get-Process -Id $processId -ErrorAction Stop
    if ($proc.ProcessName -ieq "node") {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host ("Stopped node process PID: " + $processId)
    } else {
      Write-Host ("Port 4173 is not node. Not stopped: " + $proc.ProcessName + " PID: " + $processId)
    }
  } catch {
    Write-Host ("Failed to stop PID " + $processId + ": " + $_.Exception.Message)
  }
}

Start-Sleep -Milliseconds 800

$stillListening = $false
try {
  $left = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $stillListening = [bool]$left
} catch {
  $left = netstat -ano -p tcp | Select-String ":$port\s+.*LISTENING\s+\d+\s*$"
  $stillListening = [bool]$left
}

if ($stillListening) {
  Write-Host ""
  Write-Host "Port 4173 is still listening. Another process may have restarted it."
  exit 1
}

Write-Host ""
Write-Host "Proxy stopped. http://127.0.0.1:4173/api/health should now fail."
