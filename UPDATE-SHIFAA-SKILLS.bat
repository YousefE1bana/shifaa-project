@echo off
setlocal
title SHIFAA Local Project Skills

set "SHIFAA_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%SHIFAA_PS%" (
  echo ERROR: Windows PowerShell was not found.
  pause
  exit /b 1
)

echo Updating LOCAL project skills only. GitHub and global skills are not touched.
"%SHIFAA_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-shifaa-skills.ps1"
set "SHIFAA_EXIT=%errorlevel%"
if not "%SHIFAA_EXIT%"=="0" (
  echo.
  echo SHIFAA local skills update FAILED. No Git integration was attempted.
  echo Press any key to close this window.
  pause >nul
) else (
  echo.
  echo SHIFAA local skills are ready.
)
exit /b %SHIFAA_EXIT%
