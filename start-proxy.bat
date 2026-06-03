@echo off
setlocal
title Start Ozon Proxy

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-proxy-hidden.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Ozon local proxy startup failed.
  echo Please check startup-log.txt in this folder.
  echo.
  pause
  exit /b %EXIT_CODE%
)

exit /b 0
