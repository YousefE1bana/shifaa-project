[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Issue,
    [string]$BodyFile,
    [switch]$SkipGitChecks,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Fail([string]$Message) { throw "SHIFAA Issue handoff: $Message" }

$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { Fail 'run this command inside the SHIFAA Git repository.' }
$remote = (git remote get-url origin).Trim()
$remoteMatch = [regex]::Match($remote, 'github\.com[/:](?<owner>[^/]+?)/(?<repo>[^/]+?)(?:\.git)?$')
if (-not $remoteMatch.Success) { Fail 'origin is not a GitHub repository.' }
$repository = "$($remoteMatch.Groups['owner'].Value)/$($remoteMatch.Groups['repo'].Value)"

if ($BodyFile) {
    $body = Get-Content -Raw -LiteralPath $BodyFile
    $issueUrl = 'fixture://issue'
    $issueNumber = 0
} else {
    $issueNumberMatch = [regex]::Match($Issue, '(?:/issues/|#)?(?<number>\d+)$')
    if (-not $issueNumberMatch.Success) { Fail "cannot parse Issue number from '$Issue'." }
    $issueNumber = [int]$issueNumberMatch.Groups['number'].Value
    $issueData = gh issue view $issueNumber --repo $repository --json number,url,body,title 2>$null | ConvertFrom-Json
    if (-not $issueData) { Fail "Issue #$issueNumber could not be fetched from $repository; authenticate gh first." }
    $body = $issueData.body
    $issueUrl = $issueData.url
}

$marker = [regex]::Match($body, '<!-- shifaa-speckit-handoff:v1 feature=(?<feature>specs/[0-9]{3}-[a-z0-9][a-z0-9-]*) task=(?<task>T\d{3}) baseline=(?<sha>[0-9a-f]{40}) -->')
if (-not $marker.Success) { Fail 'Issue is missing a valid shifaa-speckit-handoff:v1 marker.' }
$feature = $marker.Groups['feature'].Value
$taskId = $marker.Groups['task'].Value
$baseline = $marker.Groups['sha'].Value

$featureFull = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $feature))
$specsRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'specs')) + [System.IO.Path]::DirectorySeparatorChar
if (-not $featureFull.StartsWith($specsRoot, [System.StringComparison]::OrdinalIgnoreCase)) { Fail 'Issue feature path escapes specs/.' }
$tasksPath = Join-Path $featureFull 'tasks.md'
if (-not (Test-Path -LiteralPath $tasksPath)) { Fail "local task artifact is missing: $tasksPath" }

if (-not $SkipGitChecks) {
    git cat-file -e "$baseline^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "baseline commit $baseline is not present locally; pull first." }
    git merge-base --is-ancestor $baseline HEAD
    if ($LASTEXITCODE -ne 0) { Fail "baseline commit $baseline is not an ancestor of local HEAD." }
}

$lines = Get-Content -LiteralPath $tasksPath
$taskIndex = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^- \[[ xX]\] $taskId ") { $taskIndex = $i; break }
}
if ($taskIndex -lt 0) { Fail "$taskId does not exist in $feature/tasks.md." }
if ($taskIndex + 2 -ge $lines.Count) { Fail "$taskId has no handoff metadata." }
$depends = [regex]::Match($lines[$taskIndex + 1], '^  - Depends on: (?<value>.+?)\s*$').Groups['value'].Value.Replace('`', '').Trim()
$evidence = [regex]::Match($lines[$taskIndex + 2], '^  - Acceptance evidence: (?<value>.+?)\s*$').Groups['value'].Value
if (-not $depends -or -not $evidence) { Fail "$taskId handoff metadata differs from the Issue contract." }
$dependencies = if ($depends -eq 'none') { @() } else { @($depends -split '\s*,\s*') }

$statePath = Join-Path $repoRoot '.specify/feature.json'
@{ feature_directory = $feature } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

$result = [pscustomobject]@{
    schema_version = 1
    repository = $repository
    issue_number = $issueNumber
    issue_url = $issueUrl
    feature_path = $feature
    task_id = $taskId
    baseline_commit = $baseline
    dependencies = $dependencies
    acceptance_evidence = $evidence
    task_line = $taskIndex + 1
}
if ($Json) { $result | ConvertTo-Json -Depth 5 -Compress } else { $result }
