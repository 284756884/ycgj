@echo off
setlocal
title Stop Ozon Proxy

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-proxy.ps1"

echo.
pause
