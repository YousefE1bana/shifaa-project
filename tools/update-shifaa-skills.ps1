[CmdletBinding()]
param(
  [switch]$SetupOnly,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$mutex = $null

function Refresh-ProcessPath {
  $parts = @(
    [Environment]::GetEnvironmentVariable('Path', 'Machine'),
    [Environment]::GetEnvironmentVariable('Path', 'User'),
    $env:Path
  ) | Where-Object { $_ }
  $env:Path = (($parts -join ';').Split(';', [StringSplitOptions]::RemoveEmptyEntries) |
      Select-Object -Unique) -join ';'
}

function Resolve-Tool([string]$Name) {
  $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $command) { throw "Required tool is unavailable: $Name" }
  if ($command) { return $command.Source }
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Get-RepositoryStatus([string]$Git, [string]$Root) {
  Push-Location -LiteralPath $Root
  try {
    return @(& $Git status --porcelain=v1 --untracked-files=all 2>&1 | ForEach-Object { $_.ToString() })
  } finally {
    Pop-Location
  }
}

function Invoke-Sync([string]$Root, [string]$RuntimeRoot) {
  $arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    (Join-Path $Root 'tools\sync-shifaa-owned-skills.ps1'), '-RepositoryRoot', $Root)
  if ($RuntimeRoot) { $arguments += @('-RuntimeRoot', $RuntimeRoot) }
  Invoke-Native "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" $arguments $Root
}

function Assert-UpdateWorkspace([string]$Workspace) {
  $allowedRootEntries = @('.agents', 'skills-lock.json')
  $unexpected = @(Get-ChildItem -Force -LiteralPath $Workspace |
      Where-Object { $_.Name -notin $allowedRootEntries } |
      ForEach-Object { $_.Name })
  $agentsRoot = Join-Path $Workspace '.agents'
  if (Test-Path -LiteralPath $agentsRoot) {
    $unexpected += @(Get-ChildItem -Force -LiteralPath $agentsRoot |
        Where-Object { $_.Name -ne 'skills' } |
        ForEach-Object { ".agents/$($_.Name)" })
  }
  if ($unexpected.Count) {
    throw "Skills CLI wrote outside the isolated local runtime boundary: $($unexpected -join ', ')"
  }
}

function Invoke-LocalThirdPartyUpdate([string]$Root, [string]$Npx) {
  $workspace = Join-Path ([IO.Path]::GetTempPath()) ("shifaa-third-party-skills-" + [Guid]::NewGuid())
  $stagedRuntime = Join-Path $workspace '.agents\skills'
  $localRuntime = Join-Path $Root '.agents\skills'
  New-Item -ItemType Directory -Force -Path $stagedRuntime | Out-Null
  try {
    if (Test-Path -LiteralPath $localRuntime) {
      Get-ChildItem -Force -LiteralPath $localRuntime | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $stagedRuntime -Recurse -Force
      }
    }
    $localLock = Join-Path $Root 'skills-lock.json'
    if (Test-Path -LiteralPath $localLock) {
      Copy-Item -LiteralPath $localLock -Destination (Join-Path $workspace 'skills-lock.json') -Force
    }

    Write-Host 'Inspecting the local Skills CLI and updating isolated project runtime state...'
    Invoke-Native $Npx @('skills', '--version') $workspace
    Invoke-Native $Npx @('skills', 'update', '--help') $workspace
    Invoke-Native $Npx @('skills', 'update', '--project', '--yes') $workspace
    Assert-UpdateWorkspace $workspace

    Get-ChildItem -Directory -Force -LiteralPath $stagedRuntime | ForEach-Object {
      $destination = Join-Path $localRuntime $_.Name
      $incoming = Join-Path $localRuntime ('.shifaa-incoming-' + [Guid]::NewGuid())
      Copy-Item -LiteralPath $_.FullName -Destination $incoming -Recurse -Force
      if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Recurse -Force
      }
      Move-Item -LiteralPath $incoming -Destination $destination
    }
    $stagedLock = Join-Path $workspace 'skills-lock.json'
    if (Test-Path -LiteralPath $stagedLock) {
      Copy-Item -LiteralPath $stagedLock -Destination $localLock -Force
    }
  } finally {
    if (Test-Path -LiteralPath $workspace) {
      Remove-Item -LiteralPath $workspace -Recurse -Force
    }
  }
}

function Invoke-SelfTest([string]$Root, [string]$Git) {
  $temporary = Join-Path ([IO.Path]::GetTempPath()) ("shifaa-skills-selftest-" + [Guid]::NewGuid())
  $runtime = Join-Path $temporary '.agents\skills'
  New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'third-party-sentinel') | Out-Null
  [IO.File]::WriteAllText((Join-Path $runtime 'third-party-sentinel\KEEP.txt'), 'preserve')
  try {
    $before = Get-RepositoryStatus $Git $Root
    Invoke-Sync $Root $runtime
    Invoke-Sync $Root $runtime
    if (-not (Test-Path -LiteralPath (Join-Path $runtime 'third-party-sentinel\KEEP.txt'))) {
      throw 'Sync removed a locally installed third-party skill.'
    }
    $manifest = Get-Content -Raw (Join-Path $Root '.shifaa\skills.json') | ConvertFrom-Json
    foreach ($name in @($manifest.skills)) {
      if (-not (Test-Path -LiteralPath (Join-Path $runtime "$name\SKILL.md"))) {
        throw "Owned skill was not synchronized: $name"
      }
    }
    $boundary = Join-Path $temporary 'boundary'
    New-Item -ItemType Directory -Force -Path (Join-Path $boundary '.agents\skills') | Out-Null
    [IO.File]::WriteAllText((Join-Path $boundary 'skills-lock.json'), '{}')
    Assert-UpdateWorkspace $boundary
    [IO.File]::WriteAllText((Join-Path $boundary 'package.json'), '{}')
    $rejected = $false
    try { Assert-UpdateWorkspace $boundary } catch { $rejected = $true }
    if (-not $rejected) { throw 'Isolated updater accepted an unexpected project file.' }
    $after = Get-RepositoryStatus $Git $Root
    if (($before -join "`n") -ne ($after -join "`n")) {
      throw 'Local sync changed tracked repository state.'
    }
    Push-Location -LiteralPath $Root
    try {
      foreach ($probe in @('.agents/skills/probe', 'skills-lock.json', '.kimi-code/skills/probe')) {
        & $Git check-ignore --quiet $probe
        if ($LASTEXITCODE -ne 0) { throw "$probe is not ignored." }
      }
    } finally { Pop-Location }
    Write-Host 'SELF-TEST PASS: repeatable sync, third-party preservation, isolated-boundary rejection, owned assets, ignored runtime paths, and zero Git diff.' -ForegroundColor Green
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
  }
}

try {
  Refresh-ProcessPath
  $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $git = Resolve-Tool 'git'
  if ($SelfTest) {
    Invoke-SelfTest $root $git
    exit 0
  }

  $mutex = [Threading.Mutex]::new($false, 'Local\SHIFAA-Local-Project-Skills')
  if (-not $mutex.WaitOne(0)) { throw 'Another SHIFAA local skills update is already running.' }
  $before = Get-RepositoryStatus $git $root

  Invoke-Sync $root $null
  if (-not $SetupOnly) {
    $npx = Resolve-Tool 'npx'
    Invoke-LocalThirdPartyUpdate $root $npx
    Invoke-Sync $root $null
  }

  $after = Get-RepositoryStatus $git $root
  if (($before -join "`n") -ne ($after -join "`n")) {
    throw 'Local skills workflow changed tracked or untracked Git-visible files. Review the working tree; no Git integration was attempted.'
  }
  Write-Host 'Local project skills updated. Global skills and GitHub were untouched.' -ForegroundColor Green
  exit 0
} catch {
  Write-Error $_
  exit 1
} finally {
  if ($mutex) {
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
  }
}
