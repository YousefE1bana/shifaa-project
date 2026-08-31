[CmdletBinding()]
param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:WorktreeCreated = $false
$script:UpdateWorktree = $null
$script:UpdateBranch = $null
$script:RepositoryRoot = $null
$script:Mutex = $null

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = (Get-Location).Path,
    [switch]$Capture
  )
  Push-Location -LiteralPath $WorkingDirectory
  try {
    if ($Capture) {
      $output = & $FilePath @Arguments 2>&1
      $exitCode = $LASTEXITCODE
      if ($exitCode -ne 0) {
        throw "$FilePath $($Arguments -join ' ') failed with exit code $exitCode.`n$($output -join "`n")"
      }
      return @($output | ForEach-Object { $_.ToString() })
    }
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Resolve-RepositoryRoot {
  $candidate = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $commonLines = @(Invoke-Native git @('-C', $candidate, 'rev-parse', '--path-format=absolute', '--git-common-dir') -Capture)
  $common = [IO.Path]::GetFullPath($commonLines[0].Trim())
  if ([IO.Path]::GetFileName($common) -ne '.git') {
    throw "Repository detection failed: unexpected common Git directory $common"
  }
  $resolved = [IO.Path]::GetFullPath((Split-Path -Parent $common))
  if (-not (Test-Path -LiteralPath (Join-Path $resolved 'AGENTS.md'))) {
    throw "Repository detection failed: AGENTS.md is missing at $resolved"
  }
  return $resolved
}

function Assert-WorktreePath([string]$RepositoryRoot, [string]$Candidate) {
  $allowedRoot = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.worktrees'))
  $fullCandidate = [IO.Path]::GetFullPath($Candidate)
  $prefix = $allowedRoot.TrimEnd('\') + '\'
  if (-not $fullCandidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing worktree outside $allowedRoot`: $fullCandidate"
  }
}

function Get-RelativePath([string]$BasePath, [string]$Path) {
  $base = [IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\'
  $target = [IO.Path]::GetFullPath($Path)
  $baseUri = [Uri]::new($base)
  $targetUri = [Uri]::new($target)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', '\')
}

function Get-ChangedPaths([string]$Worktree) {
  $tracked = @(Invoke-Native git @('-C', $Worktree, 'diff', '--name-only', 'HEAD') -Capture)
  $untracked = @(Invoke-Native git @('-C', $Worktree, 'ls-files', '--others', '--exclude-standard') -Capture)
  return @($tracked + $untracked | Where-Object { $_ } | Sort-Object -Unique)
}

function Assert-AllowedPaths([string[]]$Paths) {
  $allowedExact = @('skills-lock.json', 'docs/agent-skills/skills-lock.json')
  foreach ($path in $Paths) {
    $normalized = $path.Replace('\', '/')
    if ($normalized.StartsWith('.agents/skills/', [StringComparison]::Ordinal) -or
        $normalized -in $allowedExact) {
      continue
    }
    throw "Unexpected repository change rejected: $normalized"
  }
}

function Test-MergeGuard {
  param(
    [string]$ExpectedHead,
    [string]$ActualHead,
    [string]$Mergeable,
    [object[]]$Checks
  )
  if ($ExpectedHead -ne $ActualHead -or $Mergeable -ne 'MERGEABLE') { return $false }
  if ($Checks.Count -eq 0) { return $false }
  return -not [bool]($Checks | Where-Object { $_.bucket -ne 'pass' })
}

function Wait-ForRequiredChecksToRegister {
  param(
    [Parameter(Mandatory)][string]$PullRequest,
    [Parameter(Mandatory)][string]$WorkingDirectory,
    [int]$Attempts = 24
  )
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    Push-Location -LiteralPath $WorkingDirectory
    try {
      $output = & gh pr checks $PullRequest --required --json name,state,bucket,link 2>&1
      $exitCode = $LASTEXITCODE
    } finally {
      Pop-Location
    }
    if ($exitCode -notin @(0, 8)) {
      throw "Unable to inspect required checks (exit $exitCode).`n$($output -join "`n")"
    }
    if ($output) {
      $checks = @((($output -join "`n") | ConvertFrom-Json))
      if ($checks.Count -gt 0) { return }
    }
    if ($attempt -lt $Attempts) {
      Write-Host "Required checks are not registered yet ($attempt/$Attempts); waiting 5 seconds."
      Start-Sleep -Seconds 5
    }
  }
  throw 'No required GitHub checks registered within the bounded wait.'
}

function Get-OverlayState([string]$Worktree) {
  $result = @{}
  Get-ChildItem -LiteralPath (Join-Path $Worktree '.agents/skills') -Filter '*.md' -Recurse -File |
    ForEach-Object {
      $content = [IO.File]::ReadAllText($_.FullName)
      $match = [regex]::Match($content, '(?ms)^> SHIFAA overlay:.*?(?=\r?\n\r?\n)')
      if ($match.Success) {
        $relative = (Get-RelativePath $Worktree $_.FullName).Replace('\', '/')
        $result[$relative] = $match.Value
      }
    }
  return $result
}

function Restore-SimpleOverlays([string]$Worktree, [hashtable]$Overlays) {
  foreach ($entry in $Overlays.GetEnumerator()) {
    $path = Join-Path $Worktree $entry.Key
    if (-not (Test-Path -LiteralPath $path)) { throw "$($entry.Key): customized file was removed" }
    $content = [IO.File]::ReadAllText($path)
    if ($content.Contains($entry.Value)) { continue }
    if ($entry.Key -eq '.agents/skills/frontend-design/SKILL.md') {
      throw 'frontend-design has distributed SHIFAA customizations and changed upstream; manual reconciliation is required'
    }
    $heading = [regex]::Match($content, '(?m)^# .+$')
    if (-not $heading.Success) { throw "$($entry.Key): cannot locate heading for overlay reconciliation" }
    $insertAt = $heading.Index + $heading.Length
    $content = $content.Insert($insertAt, "`r`n`r`n$($entry.Value)")
    [IO.File]::WriteAllText($path, $content, [Text.UTF8Encoding]::new($false))
    Write-Host "Preserved overlay: $($entry.Key)"
  }
}

function Restore-TrackedLicenses([string]$Worktree, [hashtable]$Licenses) {
  foreach ($entry in $Licenses.GetEnumerator()) {
    $path = Join-Path $Worktree $entry.Key
    if (-not (Test-Path -LiteralPath $path)) {
      [IO.File]::WriteAllBytes($path, $entry.Value)
      Write-Host "Preserved license: $($entry.Key)"
    }
  }
}

function Remove-CleanUpdateWorktree([string]$RepositoryRoot, [string]$Worktree, [string]$Branch) {
  if (Test-Path -LiteralPath $Worktree) {
    $status = @(Invoke-Native git @('-C', $Worktree, 'status', '--porcelain=v1') -Capture)
    if ($status.Count -gt 0) { throw "Refusing to remove dirty worktree $Worktree" }
    Invoke-Native git @('-C', $RepositoryRoot, '-c', 'core.longpaths=true', 'worktree', 'remove', $Worktree)
  }
  $exists = & git -C $RepositoryRoot show-ref --verify --quiet "refs/heads/$Branch"
  if ($LASTEXITCODE -eq 0) {
    & git -C $RepositoryRoot diff --quiet $Branch origin/main
    if ($LASTEXITCODE -eq 0) {
      Invoke-Native git @('-C', $RepositoryRoot, 'branch', '-D', $Branch)
    } else {
      Write-Warning "Preserved local branch $Branch because its tree does not match origin/main."
    }
  }
}

function Invoke-SelfTest([string]$RepositoryRoot) {
  Write-Step 'Running updater safety self-tests (no network mutation and no PR)'
  if ((Resolve-RepositoryRoot) -ne $RepositoryRoot) { throw 'repo detection self-test failed' }
  Assert-AllowedPaths @('.agents/skills/example/SKILL.md', 'skills-lock.json')
  $rejected = $false
  try { Assert-AllowedPaths @('apps/admin/route.ts') } catch { $rejected = $true }
  if (-not $rejected) { throw 'allowed-path rejection self-test failed' }
  if (-not (Test-MergeGuard 'abc' 'abc' 'MERGEABLE' @([pscustomobject]@{bucket='pass'}))) {
    throw 'positive exact-head/CI guard self-test failed'
  }
  if (Test-MergeGuard 'abc' 'def' 'MERGEABLE' @([pscustomobject]@{bucket='pass'})) {
    throw 'head-mismatch guard self-test failed'
  }
  if (Test-MergeGuard 'abc' 'abc' 'MERGEABLE' @([pscustomobject]@{bucket='fail'})) {
    throw 'red-CI guard self-test failed'
  }

  $suffix = Get-Date -Format 'yyyyMMddHHmmssfff'
  $branch = "chore/skills-updater-selftest-$suffix"
  $worktree = Join-Path $RepositoryRoot ".worktrees\skills-updater-selftest-$suffix"
  Assert-WorktreePath $RepositoryRoot $worktree
  Invoke-Native git @('-C', $RepositoryRoot, 'worktree', 'add', '-b', $branch, $worktree, 'origin/main')
  try {
    $initialChanges = @(Get-ChangedPaths $worktree)
    if ($initialChanges.Count -ne 0) { throw 'no-change self-test failed' }
    $probe = Join-Path $worktree '.agents/skills/.updater-selftest'
    [IO.File]::WriteAllText($probe, 'probe', [Text.UTF8Encoding]::new($false))
    $changed = @(Get-ChangedPaths $worktree)
    Assert-AllowedPaths $changed
    if ($changed -notcontains '.agents/skills/.updater-selftest') { throw 'update-detection self-test failed' }
    Remove-Item -LiteralPath $probe -Force
  } finally {
    Remove-CleanUpdateWorktree $RepositoryRoot $worktree $branch
  }
  Write-Host 'SELF-TEST PASS: repo detection, worktree placement, update/no-change detection, failure handling, allowed paths, and exact-head/CI guards.' -ForegroundColor Green
}

try {
  $script:Mutex = [Threading.Mutex]::new($false, 'Local\SHIFAA-Skills-Updater')
  if (-not $script:Mutex.WaitOne(0)) { throw 'Another SHIFAA skills update is already running.' }

  $script:RepositoryRoot = Resolve-RepositoryRoot
  Write-Host "Repository: $script:RepositoryRoot"
  if ($SelfTest) {
    Invoke-SelfTest $script:RepositoryRoot
    exit 0
  }

  Write-Step 'Checking GitHub authentication and refreshing origin'
  Invoke-Native gh @('auth', 'status') -WorkingDirectory $script:RepositoryRoot
  Invoke-Native git @('-C', $script:RepositoryRoot, 'fetch', '--prune', 'origin')

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $script:UpdateBranch = "chore/skills-auto-update-$stamp"
  $script:UpdateWorktree = Join-Path $script:RepositoryRoot ".worktrees\skills-auto-update-$stamp"
  Assert-WorktreePath $script:RepositoryRoot $script:UpdateWorktree
  if (Test-Path -LiteralPath $script:UpdateWorktree) { throw "Worktree path already exists: $script:UpdateWorktree" }

  Write-Step "Creating isolated worktree $script:UpdateWorktree"
  Invoke-Native git @('-C', $script:RepositoryRoot, 'worktree', 'add', '-b', $script:UpdateBranch, $script:UpdateWorktree, 'origin/main')
  $script:WorktreeCreated = $true

  $overlays = Get-OverlayState $script:UpdateWorktree
  $frontendPath = Join-Path $script:UpdateWorktree '.agents/skills/frontend-design/SKILL.md'
  $frontendContent = [IO.File]::ReadAllText($frontendPath)
  $licenses = @{}
  Get-ChildItem -LiteralPath (Join-Path $script:UpdateWorktree '.agents/skills') -Filter 'LICENSE*' -Recurse -File |
    ForEach-Object {
      $relative = (Get-RelativePath $script:UpdateWorktree $_.FullName).Replace('\', '/')
      $licenses[$relative] = [IO.File]::ReadAllBytes($_.FullName)
    }
  $oldCliLock = Get-Content -Raw (Join-Path $script:UpdateWorktree 'skills-lock.json') | ConvertFrom-Json

  Write-Step 'Installing the frozen repository toolchain'
  Invoke-Native corepack @('pnpm', 'install', '--frozen-lockfile') -WorkingDirectory $script:UpdateWorktree

  Write-Step 'Inspecting skills CLI and updating project scope non-interactively'
  Invoke-Native npx @('skills', 'update', '--help') -WorkingDirectory $script:UpdateWorktree
  Invoke-Native npx @('skills', '--version') -WorkingDirectory $script:UpdateWorktree
  Invoke-Native npx @('skills', 'update', '--project', '--yes') -WorkingDirectory $script:UpdateWorktree

  $newCliLock = Get-Content -Raw (Join-Path $script:UpdateWorktree 'skills-lock.json') | ConvertFrom-Json
  $oldFrontendHash = $oldCliLock.skills.'frontend-design'.computedHash
  $newFrontendHash = $newCliLock.skills.'frontend-design'.computedHash
  if ($oldFrontendHash -ne $newFrontendHash) {
    throw 'frontend-design upstream changed; its distributed SHIFAA customization requires manual reconciliation'
  }
  [IO.File]::WriteAllText($frontendPath, $frontendContent, [Text.UTF8Encoding]::new($false))
  Restore-SimpleOverlays $script:UpdateWorktree $overlays
  Restore-TrackedLicenses $script:UpdateWorktree $licenses
  Invoke-Native node @('tools/sync-agent-skills-lock.mjs') -WorkingDirectory $script:UpdateWorktree
  Invoke-Native corepack @('pnpm', 'exec', 'prettier', '--write', 'docs/agent-skills/skills-lock.json') -WorkingDirectory $script:UpdateWorktree

  $changed = @(Get-ChangedPaths $script:UpdateWorktree)
  if ($changed.Count -eq 0) {
    Write-Host 'Skills already up to date' -ForegroundColor Green
    Remove-CleanUpdateWorktree $script:RepositoryRoot $script:UpdateWorktree $script:UpdateBranch
    $script:WorktreeCreated = $false
    exit 0
  }
  Assert-AllowedPaths $changed

  Write-Step 'Reviewing the bounded skills-only diff'
  Invoke-Native git @('-C', $script:UpdateWorktree, 'diff', '--stat')
  Invoke-Native git @('-C', $script:UpdateWorktree, 'diff', '--check')

  Write-Step 'Running skills integrity and full repository verification'
  Invoke-Native corepack @('pnpm', 'agent-skills:check') -WorkingDirectory $script:UpdateWorktree
  Invoke-Native corepack @('pnpm', 'verify') -WorkingDirectory $script:UpdateWorktree

  Write-Step 'Committing, pushing, and opening the update PR'
  Invoke-Native git @('-C', $script:UpdateWorktree, 'add', '--', '.agents/skills', 'skills-lock.json', 'docs/agent-skills/skills-lock.json')
  Invoke-Native git @('-C', $script:UpdateWorktree, 'commit', '-m', 'chore: update SHIFAA project skills')
  $pushedHeadLines = @(Invoke-Native git @('-C', $script:UpdateWorktree, 'rev-parse', 'HEAD') -Capture)
  $pushedHead = $pushedHeadLines[0].Trim()
  Invoke-Native git @('-C', $script:UpdateWorktree, 'push', '-u', 'origin', $script:UpdateBranch)
  $prUrlLines = @(Invoke-Native gh @('pr', 'create', '--base', 'main', '--head', $script:UpdateBranch, '--title', 'chore: update SHIFAA project skills', '--body', 'Automated project-scope skills refresh with SHIFAA overlay reconciliation, integrity locks, and full verification.') -WorkingDirectory $script:UpdateWorktree -Capture)
  $prUrl = $prUrlLines[-1].Trim()
  Write-Host "PR: $prUrl"

  Write-Step 'Waiting for all required checks on the exact pushed HEAD'
  Wait-ForRequiredChecksToRegister $prUrl $script:UpdateWorktree
  Invoke-Native gh @('pr', 'checks', $prUrl, '--required', '--watch', '--fail-fast', '--interval', '10') -WorkingDirectory $script:UpdateWorktree
  $checks = @(Invoke-Native gh @('pr', 'checks', $prUrl, '--required', '--json', 'name,state,bucket,link') -WorkingDirectory $script:UpdateWorktree -Capture | ConvertFrom-Json)
  $pr = ((Invoke-Native gh @('pr', 'view', $prUrl, '--json', 'headRefOid,mergeable,state') -WorkingDirectory $script:UpdateWorktree -Capture) -join "`n") | ConvertFrom-Json
  if (-not (Test-MergeGuard $pushedHead $pr.headRefOid $pr.mergeable $checks)) {
    throw "Exact-head/CI/mergeability guard rejected merge: pushed=$pushedHead actual=$($pr.headRefOid) mergeable=$($pr.mergeable)"
  }

  Write-Step 'Squash-merging with exact-head protection'
  Invoke-Native gh @('pr', 'merge', $prUrl, '--squash', '--match-head-commit', $pushedHead) -WorkingDirectory $script:UpdateWorktree
  $merged = ((Invoke-Native gh @('pr', 'view', $prUrl, '--json', 'state,mergeCommit,headRefOid,url') -WorkingDirectory $script:UpdateWorktree -Capture) -join "`n") | ConvertFrom-Json
  if ($merged.state -ne 'MERGED' -or $merged.headRefOid -ne $pushedHead) { throw 'GitHub did not confirm the exact-head merge.' }
  $mergeSha = $merged.mergeCommit.oid
  Invoke-Native git @('-C', $script:RepositoryRoot, 'fetch', '--prune', 'origin')
  Invoke-Native git @('-C', $script:RepositoryRoot, 'merge-base', '--is-ancestor', $mergeSha, 'origin/main')

  Write-Step 'Cleaning the merged update worktree and branches'
  Remove-CleanUpdateWorktree $script:RepositoryRoot $script:UpdateWorktree $script:UpdateBranch
  $script:WorktreeCreated = $false
  & git -C $script:RepositoryRoot show-ref --verify --quiet "refs/heads/$script:UpdateBranch"
  if ($LASTEXITCODE -eq 0) {
    Write-Warning 'Remote update branch was preserved with the local branch for inspection.'
  } else {
    & git -C $script:RepositoryRoot push origin --delete $script:UpdateBranch
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Remote update branch was already absent or could not be removed.' }
  }

  $primaryBranch = (& git -C $script:RepositoryRoot branch --show-current).Trim()
  $primaryStatus = @(& git -C $script:RepositoryRoot status --porcelain=v1)
  if ($primaryBranch -eq 'main' -and $primaryStatus.Count -eq 0) {
    Invoke-Native git @('-C', $script:RepositoryRoot, 'merge', '--ff-only', 'origin/main')
  } else {
    Write-Host 'Primary checkout was not clean main; left untouched.'
  }

  Write-Host "SUCCESS PR: $($merged.url)" -ForegroundColor Green
  Write-Host "SUCCESS MERGE SHA: $mergeSha" -ForegroundColor Green
  exit 0
} catch {
  Write-Error $_
  if ($script:WorktreeCreated) {
    Write-Host "Preserved worktree: $script:UpdateWorktree" -ForegroundColor Yellow
    Write-Host "Preserved branch: $script:UpdateBranch" -ForegroundColor Yellow
  }
  exit 1
} finally {
  if ($script:Mutex) {
    try { $script:Mutex.ReleaseMutex() } catch { }
    $script:Mutex.Dispose()
  }
}
