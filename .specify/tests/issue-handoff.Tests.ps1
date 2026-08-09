$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (git rev-parse --show-toplevel).Trim()
$baseline = (git rev-parse HEAD).Trim()
$builder = Join-Path $repoRoot '.specify/scripts/powershell/build-issue-handoffs.ps1'
$resolver = Join-Path $repoRoot '.specify/scripts/powershell/resolve-issue-handoff.ps1'

$payload = & $builder -FeatureDirectory 'specs/001-identity-onboarding' -BaselineCommit $baseline -SkipGitChecks
if ($payload.issues.Count -ne 26) { throw "Expected 26 handoffs, found $($payload.issues.Count)." }
if (($payload.issues.composite_key | Select-Object -Unique).Count -ne 26) { throw 'Composite keys are not unique.' }

foreach ($issue in $payload.issues) {
    if (-not $issue.requirements -or -not $issue.acceptance_evidence) { throw "$($issue.task_id) lacks required handoff content." }
    if ($issue.body -notmatch [regex]::Escape("feature=$($issue.feature_path) task=$($issue.task_id) baseline=$baseline")) { throw "$($issue.task_id) marker is invalid." }
    foreach ($artifact in @('spec.md', 'plan.md', 'tasks.md#L')) {
        if (-not $issue.body.Contains($artifact)) { throw "$($issue.task_id) lacks $artifact link." }
    }
}

$fixture = New-TemporaryFile
$invalid = New-TemporaryFile
try {
    Set-Content -LiteralPath $fixture -Value $payload.issues[0].body -Encoding utf8NoBOM
    $resolved = & $resolver -Issue '#1' -BodyFile $fixture -SkipGitChecks
    if ($resolved.feature_path -ne 'specs/001-identity-onboarding' -or $resolved.task_id -ne 'T001') { throw 'Valid handoff resolved incorrectly.' }

    Set-Content -LiteralPath $invalid -Value 'missing marker' -Encoding utf8NoBOM
    $rejected = $false
    try { & $resolver -Issue '#1' -BodyFile $invalid -SkipGitChecks | Out-Null } catch { $rejected = $_.Exception.Message -match 'missing a valid' }
    if (-not $rejected) { throw 'Invalid marker was not rejected.' }
} finally {
    Remove-Item -LiteralPath $fixture, $invalid -Force -ErrorAction SilentlyContinue
}

Write-Output 'SHIFAA Issue handoff tests: PASS'
