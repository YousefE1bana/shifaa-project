[CmdletBinding()]
param(
    [string]$FeatureDirectory,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) { throw "SHIFAA Issue publisher: $Message" }

gh auth status --hostname github.com 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { Fail 'GitHub CLI is not authenticated; run gh auth login first.' }

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$builder = Join-Path $scriptRoot 'build-issue-handoffs.ps1'
$payload = & $builder -FeatureDirectory $FeatureDirectory
$repository = $payload.repository

$existingRaw = gh issue list --repo $repository --state all --limit 1000 --json number,title,body,state,url
if ($LASTEXITCODE -ne 0) { Fail "could not list Issues in $repository." }
$existing = @(if ($existingRaw) { $existingRaw | ConvertFrom-Json } else { @() })
$results = [System.Collections.Generic.List[object]]::new()

foreach ($item in $payload.issues) {
    $marker = "shifaa-speckit-handoff:v1 feature=$($item.feature_path) task=$($item.task_id) "
    $matches = @($existing | Where-Object { $_.body -and $_.body.Contains($marker) })
    if ($matches.Count -gt 1) { Fail "multiple Issues match $($item.composite_key): $($matches.number -join ', ')." }

    $bodyFile = New-TemporaryFile
    try {
        [System.IO.File]::WriteAllText(
            $bodyFile.FullName,
            $item.body,
            [System.Text.UTF8Encoding]::new($false)
        )
        if ($matches.Count -eq 0) {
            $url = (gh issue create --repo $repository --title $item.title --body-file $bodyFile).Trim()
            if ($LASTEXITCODE -ne 0 -or $url -notmatch '/issues/(?<number>\d+)$') { Fail "failed to create $($item.composite_key)." }
            $number = [int]$Matches['number']
            $action = 'created'
        } else {
            $number = [int]$matches[0].number
            $url = $matches[0].url
            if ($matches[0].title -ne $item.title -or $matches[0].body -ne $item.body) {
                gh issue edit $number --repo $repository --title $item.title --body-file $bodyFile 1>$null
                if ($LASTEXITCODE -ne 0) { Fail "failed to update $($item.composite_key)." }
                $action = 'updated'
            } else { $action = 'unchanged' }
        }

        $snapshot = gh issue view $number --repo $repository --json title,body,state,url | ConvertFrom-Json
        if ($snapshot.title -ne $item.title -or $snapshot.body -ne $item.body) { Fail "post-write verification failed for Issue #$number." }
        if ($item.state -eq 'closed' -and $snapshot.state -ne 'CLOSED') {
            gh issue close $number --repo $repository --reason completed 1>$null
            if ($LASTEXITCODE -ne 0) { Fail "failed to close completed Issue #$number." }
            $action = "$action+closed"
        } elseif ($item.state -eq 'open' -and $snapshot.state -eq 'CLOSED') {
            $action = "$action+closed-state-review-required"
        }

        $results.Add([pscustomobject]@{
            composite_key = $item.composite_key
            issue_number = $number
            url = $url
            action = $action
        })
    } finally {
        Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

$result = [pscustomobject]@{
    schema_version = 1
    repository = $repository
    baseline_commit = $payload.baseline_commit
    results = @($results)
}

if ($Json) { $result | ConvertTo-Json -Depth 6 -Compress } else { $result }
