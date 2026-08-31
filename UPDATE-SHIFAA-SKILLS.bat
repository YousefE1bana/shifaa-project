@echo off
setlocal
title SHIFAA Skills Updater
echo Starting the SHIFAA project-skills update workflow...
echo.

where pwsh.exe >nul 2>&1
if %errorlevel% equ 0 (
  pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-shifaa-skills.ps1"
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-shifaa-skills.ps1"
)

set "SHIFAA_UPDATE_EXIT=%errorlevel%"
if not "%SHIFAA_UPDATE_EXIT%"=="0" (
  echo.
  echo SHIFAA skills update FAILED. The branch and worktree were preserved for inspection.
  echo Press any key to close this window.
  pause >nul
) else (
  echo.
  echo SHIFAA skills update finished successfully.
)

exit /b %SHIFAA_UPDATE_EXIT%
