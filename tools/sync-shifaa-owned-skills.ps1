[CmdletBinding()]
param(
  [string]$RepositoryRoot,
  [string]$RuntimeRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $RepositoryRoot) {
  $RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}
if (-not $RuntimeRoot) {
  $RuntimeRoot = Join-Path $RepositoryRoot '.agents\skills'
}

$manifestPath = Join-Path $RepositoryRoot '.shifaa\skills.json'
$sourceRoot = Join-Path $RepositoryRoot '.shifaa\skills'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Missing $manifestPath" }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw 'Unsupported SHIFAA skills manifest schema.' }

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
$stageRoot = Join-Path ([IO.Path]::GetTempPath()) ("shifaa-owned-skills-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
try {
  foreach ($name in @($manifest.skills)) {
    if ($name -notmatch '^[a-z0-9-]{1,64}$') { throw "Invalid owned skill name: $name" }
    $source = Join-Path $sourceRoot $name
    $skillFile = Join-Path $source 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skillFile)) { throw "$name`: missing source SKILL.md" }
    $staged = Join-Path $stageRoot $name
    Copy-Item -LiteralPath $source -Destination $staged -Recurse -Force
  }

  foreach ($name in @($manifest.skills)) {
    $destination = Join-Path $RuntimeRoot $name
    if (Test-Path -LiteralPath $destination) {
      Remove-Item -LiteralPath $destination -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $stageRoot $name) -Destination $destination -Recurse -Force
    Write-Host "Synchronized SHIFAA-owned skill: $name"
  }
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}

Write-Host "SHIFAA-owned skills are available at $RuntimeRoot" -ForegroundColor Green
