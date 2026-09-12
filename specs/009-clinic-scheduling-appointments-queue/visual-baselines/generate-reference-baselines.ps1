[CmdletBinding()]
param(
  [string]$BrowserPath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  [int]$Parallelism = 6,
  [switch]$Smoke
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'source\capture-reference-baselines.mjs'
$arguments = @($scriptPath, '--browser', $BrowserPath, '--parallelism', "$Parallelism")
if ($Smoke) { $arguments += '--smoke' }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Reference capture failed with exit code $LASTEXITCODE" }
