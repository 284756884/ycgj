$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceDir = Join-Path $root "proxy"
$logFile = Join-Path $root "startup-log.txt"
$runtimeLog = Join-Path $root "proxy-runtime.log"
$errorLog = Join-Path $root "proxy-error.log"
$healthUrl = "http://127.0.0.1:4173/api/health"

function Write-StartupLog {
  param([string]$Message)
  Add-Content -LiteralPath $logFile -Value $Message -Encoding UTF8
}

function Test-ProxyHealth {
  try {
    $null = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

"===== Ozon local proxy startup log =====" | Set-Content -LiteralPath $logFile -Encoding UTF8
Write-StartupLog ("Date: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
Write-StartupLog ("Root: " + $root)
Write-StartupLog ("Service: " + $serviceDir)

if (!(Test-Path -LiteralPath $serviceDir)) {
  Write-StartupLog "ERROR: proxy folder was not found."
  exit 1
}

$serverFile = Join-Path $serviceDir "server.js"
if (!(Test-Path -LiteralPath $serverFile)) {
  Write-StartupLog "ERROR: server.js was not found in proxy folder."
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) {
  Write-StartupLog "ERROR: Node.js was not found. Install node-v24.16.0-x64.msi, then run start-proxy.bat again."
  exit 1
}
Write-StartupLog ("Node: " + $node.Source)

if (Test-ProxyHealth) {
  Write-StartupLog "Proxy is already running."
  exit 0
}

if (Test-Path -LiteralPath $runtimeLog) { Remove-Item -LiteralPath $runtimeLog -Force }
if (Test-Path -LiteralPath $errorLog) { Remove-Item -LiteralPath $errorLog -Force }

$process = Start-Process `
  -FilePath $node.Source `
  -ArgumentList "server.js" `
  -WorkingDirectory $serviceDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $runtimeLog `
  -RedirectStandardError $errorLog `
  -PassThru

Write-StartupLog ("Started hidden node process PID: " + $process.Id)
Write-StartupLog ("URL: http://127.0.0.1:4173/")

for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-ProxyHealth) {
    Write-StartupLog "Proxy health check OK."
    exit 0
  }
}

Write-StartupLog "ERROR: Proxy did not respond after startup."
if (Test-Path -LiteralPath $errorLog) {
  Write-StartupLog "---- proxy-error.log ----"
  Get-Content -LiteralPath $errorLog -ErrorAction SilentlyContinue | ForEach-Object { Write-StartupLog $_ }
}
exit 2
