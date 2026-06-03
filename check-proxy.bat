@echo off
setlocal
title Check Ozon Proxy

echo Checking http://127.0.0.1:4173/api/health
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -Method Get -TimeoutSec 5; Write-Host 'OK: proxy is running'; $r | ConvertTo-Json -Depth 4 } catch { Write-Host 'FAILED: proxy is not reachable'; Write-Host 'Run start-proxy.bat first. It will start in the background and close automatically.'; Write-Host ('Error: ' + $_.Exception.Message) }"

echo.
pause
