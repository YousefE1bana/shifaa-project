#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PrimaryRepository,
    [Parameter(Mandatory)][string]$VerifiedMainCommit,
    [string[]]$PreservePath = @()
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$report = [ordered]@{
    schemaVersion = 1
    outcome = 'LOCAL_ROOT_SYNC_NOT_VERIFIED'
    reason = ''
    requestedPrimary = $PrimaryRepository
    verifiedMainCommit = $VerifiedMainCommit
    actualRoot = $null
    before = $null
    after = $null
    preservation = $null
    fastForwardAttempted = $false
}
$exitCode = 3
$script:RepositoryPath = $null
$script:GitExecutable = $null

function Invoke-RepositoryGit([string[]]$Arguments) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $script:GitExecutable
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('-c', 'core.longpaths=true', '-c', 'core.quotePath=false', '-C', $script:RepositoryPath) + $Arguments) {
        $start.ArgumentList.Add($argument)
    }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        [pscustomobject]@{ Code = $process.ExitCode; Text = $stdout.GetAwaiter().GetResult(); ErrorText = $stderr.GetAwaiter().GetResult() }
    } finally { $process.Dispose() }
}

function Read-Git([string[]]$Arguments) {
    $response = Invoke-RepositoryGit $Arguments
    if ($response.Code -ne 0) { throw "Git inspection failed (exit $($response.Code)); no destructive recovery attempted." }
    $response.Text.TrimEnd("`r", "`n")
}

function Read-CheckoutState {
    $upstream = Invoke-RepositoryGit @('rev-parse', '--symbolic-full-name', '@{upstream}')
    $remote = Invoke-RepositoryGit @('rev-parse', '--verify', 'refs/remotes/origin/main')
    [ordered]@{
        branch = Read-Git @('branch', '--show-current')
        head = Read-Git @('rev-parse', 'HEAD')
        upstream = if ($upstream.Code -eq 0) { $upstream.Text.Trim() } else { $null }
        originMain = if ($remote.Code -eq 0) { $remote.Text.Trim() } else { $null }
        status = @( (Read-Git @('status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none')).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) )
    }
}

function Get-BytesHash([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($algorithm.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Read-PreservedEntry([string]$RelativePath) {
    $fullPath = [IO.Path]::GetFullPath((Join-Path $script:RepositoryPath $RelativePath))
    $prefix = $script:RepositoryPath.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $comparison = if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not $fullPath.StartsWith($prefix, $comparison)) { throw 'Preservation path must be inside the explicit primary repository.' }
    $entry = Get-Item -LiteralPath $fullPath -Force
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        return [ordered]@{ path = $RelativePath; kind = 'link'; target = $entry.LinkTarget }
    }
    if ($entry.PSIsContainer) { return [ordered]@{ path = $RelativePath; kind = 'directory' } }
    [ordered]@{ path = $RelativePath; kind = 'file'; sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Read-LocalOnlySnapshot {
    $ignored = @( (Read-Git @('ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z')).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) )
    $entries = [Collections.Generic.List[object]]::new()
    foreach ($path in $ignored) { $entries.Add((Read-PreservedEntry $path)) }
    $protected = @($PreservePath)
    if (Test-Path -LiteralPath (Join-Path $script:RepositoryPath '.specify/feature.json')) { $protected += '.specify/feature.json' }
    foreach ($path in @($protected | Sort-Object -Unique)) { $entries.Add((Read-PreservedEntry $path)) }
    $encoded = ConvertTo-Json -InputObject $entries.ToArray() -Depth 5 -Compress
    [ordered]@{
        ignoredEntries = $ignored
        hashedFileEntries = @($entries | Where-Object { $_.kind -eq 'file' }).Count
        sha256 = Get-BytesHash ([Text.Encoding]::UTF8.GetBytes($encoded))
        method = 'Ignored directory entries inventoried without traversal; file leaves and explicit PreservePath files hashed; links recorded without following. Fast-forward also requires no local-only path collision and --no-overwrite-ignore.'
    }
}

function Invoke-Reconciliation {
    if ($VerifiedMainCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'VerifiedMainCommit must be an independently verified full lowercase commit SHA.' }
    $script:RepositoryPath = (Get-Item -LiteralPath $PrimaryRepository -Force).FullName
    $script:GitExecutable = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $actual = Read-Git @('rev-parse', '--show-toplevel')
    $report.actualRoot = $actual
    $comparison = if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not [IO.Path]::GetFullPath($actual).Equals($script:RepositoryPath, $comparison)) { throw 'Explicit path is not the actual Git worktree root.' }
    $gitDirectory = Read-Git @('rev-parse', '--absolute-git-dir')
    $commonDirectory = Read-Git @('rev-parse', '--path-format=absolute', '--git-common-dir')
    $report.outcome = 'LOCAL_ROOT_SYNC_BLOCKED'
    if (-not $gitDirectory.Equals($commonDirectory, $comparison)) { $report.reason = 'Selected path is a linked worktree, not the primary checkout.'; return }
    $report.before = Read-CheckoutState
    foreach ($marker in @('index.lock', 'HEAD.lock', 'config.lock', 'packed-refs.lock', 'refs/heads/main.lock', 'refs/remotes/origin/main.lock', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply')) {
        if (Test-Path -LiteralPath (Join-Path $gitDirectory $marker)) { $report.reason = "Existing Git lock or operation: $marker"; return }
    }
    $preserved = Read-LocalOnlySnapshot
    $report.preservation = $preserved
    # Fetch changes refs only; no prune, forced ref update, submodule update or checkout.
    $fetch = Invoke-RepositoryGit @('fetch', '--no-tags', '--no-recurse-submodules', 'origin', 'refs/heads/main:refs/remotes/origin/main')
    if ($fetch.Code -ne 0) { $report.reason = "Fetch failed (exit $($fetch.Code)); inspect origin connectivity/ref history. No local checkout change attempted."; return }
    $current = Read-CheckoutState
    $report.after = $current
    if ($current.originMain -ne $VerifiedMainCommit) { $report.reason = 'Fetched origin/main differs from the independently verified commit; refresh remote/PR verification.'; return }
    if ($current.head -ne $report.before.head -or $current.branch -ne $report.before.branch -or ($current.status -join [char]0) -cne ($report.before.status -join [char]0)) {
        $report.reason = 'Checkout changed during inspection; preserve it and retry only after reconciliation.'; return
    }
    if ($current.branch -ne 'main') { $report.reason = if ($current.branch) { "Primary checkout is on '$($current.branch)', not main; no branch switch attempted." } else { 'Primary checkout has detached HEAD; no branch switch attempted.' }; return }
    if ($current.status.Count -gt 0) { $report.reason = 'Tracked changes or untracked files present; no stash, discard or checkout attempted.'; return }
    if ($current.upstream -ne 'refs/remotes/origin/main') { $report.reason = 'main does not track origin/main; upstream was not changed.'; return }
    if ($current.head -ne $VerifiedMainCommit) {
        $ancestor = Invoke-RepositoryGit @('merge-base', '--is-ancestor', $current.head, $VerifiedMainCommit)
        if ($ancestor.Code -ne 0) { $report.reason = 'Local main is ahead, divergent or ancestry is unavailable; fast-forward is unsafe.'; return }
        $tracked = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($path in (Read-Git @('ls-tree', '-r', '--name-only', '-z', 'HEAD')).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries)) { [void]$tracked.Add($path) }
        $incoming = (Read-Git @('diff', '--name-only', '-z', '--diff-filter=ACMRT', 'HEAD', $VerifiedMainCommit)).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries)
        foreach ($path in $incoming) {
            if (-not $tracked.Contains($path) -and (Test-Path -LiteralPath (Join-Path $script:RepositoryPath $path))) {
                $report.reason = "Incoming path collides with existing local-only data: $path"; return
            }
            $parent = Split-Path -Parent $path
            while ($parent) {
                $fullParent = Join-Path $script:RepositoryPath $parent
                if ((Test-Path -LiteralPath $fullParent) -and -not $tracked.Contains($parent.Replace('\', '/'))) {
                    $entry = Get-Item -LiteralPath $fullParent -Force
                    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $report.reason = "Incoming path crosses a local-only file/link: $parent"; return }
                }
                $parent = Split-Path -Parent $parent
            }
        }
        $report.fastForwardAttempted = $true
        $merge = Invoke-RepositoryGit @('merge', '--ff-only', '--no-overwrite-ignore', $VerifiedMainCommit)
        if ($merge.Code -ne 0) { $report.after = Read-CheckoutState; $report.reason = "Fast-forward returned exit $($merge.Code); inspect after.head/status. A hook may fail after Git advances HEAD; no rollback or destructive fallback attempted."; return }
    }
    $report.after = Read-CheckoutState
    $afterPreservation = Read-LocalOnlySnapshot
    if ($afterPreservation.sha256 -ne $preserved.sha256) { $report.reason = 'Local-only inventory/hash changed; synchronization is not fully verified. No automatic restoration attempted.'; return }
    if ($report.after.head -ne $VerifiedMainCommit -or $report.after.originMain -ne $VerifiedMainCommit -or $report.after.branch -ne 'main' -or $report.after.upstream -ne 'refs/remotes/origin/main' -or $report.after.status.Count -gt 0) {
        $report.reason = 'Post-synchronization branch, commit, upstream or status mismatch; preserve and investigate.'; return
    }
    $report.outcome = if ($report.fastForwardAttempted) { 'SYNCED' } else { 'ALREADY_SYNCED' }
    $report.reason = 'Exact main/origin/main/verified-commit equality; clean checkout and local-only preservation checks passed.'
}

try {
    Invoke-Reconciliation
    $exitCode = if ($report.outcome -in @('SYNCED', 'ALREADY_SYNCED')) { 0 } elseif ($report.outcome -eq 'LOCAL_ROOT_SYNC_BLOCKED') { 2 } else { 3 }
} catch {
    # Do not print arbitrary Git stderr, remote URLs, configuration or file contents.
    $report.reason = 'Inspection/preservation could not complete: ' + $_.Exception.Message
    if ($report.outcome -eq 'LOCAL_ROOT_SYNC_BLOCKED') { $exitCode = 2 } else { $exitCode = 3 }
}
$report | ConvertTo-Json -Depth 8
exit $exitCode
