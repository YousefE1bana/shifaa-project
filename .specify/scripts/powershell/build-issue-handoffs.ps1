[CmdletBinding()]
param(
    [string]$FeatureDirectory,
    [string]$BaselineCommit,
    [switch]$SkipGitChecks,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    throw "SHIFAA Issue handoff: $Message"
}

$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { Fail 'run this command inside the SHIFAA Git repository.' }
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot)

if (-not $FeatureDirectory) {
    $statePath = Join-Path $repoRoot '.specify/feature.json'
    if (-not (Test-Path -LiteralPath $statePath)) { Fail 'no feature was selected; provide -FeatureDirectory or run speckit-specify.' }
    $FeatureDirectory = (Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json).feature_directory
}

$normalizedFeature = $FeatureDirectory.Replace('\', '/').Trim('/')
if ($normalizedFeature -notmatch '^specs/[0-9]{3}-[a-z0-9][a-z0-9-]*$') {
    Fail "feature path '$FeatureDirectory' is not a canonical specs/NNN-short-name path."
}

$featurePath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $normalizedFeature))
if (-not $featurePath.StartsWith((Join-Path $repoRoot 'specs') + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail 'feature path escapes specs/.'
}

$specPath = Join-Path $featurePath 'spec.md'
$planPath = Join-Path $featurePath 'plan.md'
$tasksPath = Join-Path $featurePath 'tasks.md'
foreach ($required in @($specPath, $planPath, $tasksPath)) {
    if (-not (Test-Path -LiteralPath $required)) { Fail "required artifact is missing: $required" }
}

if (-not $BaselineCommit) { $BaselineCommit = (git rev-parse HEAD).Trim() }
if ($BaselineCommit -notmatch '^[0-9a-f]{40}$') { Fail 'baseline commit must be a full 40-character Git SHA.' }

$remote = (git remote get-url origin).Trim()
$match = [regex]::Match($remote, 'github\.com[/:](?<owner>[^/]+?)/(?<repo>[^/]+?)(?:\.git)?$')
if (-not $match.Success) { Fail "origin is not a GitHub repository: $remote" }
$repository = "$($match.Groups['owner'].Value)/$($match.Groups['repo'].Value)"

if (-not $SkipGitChecks) {
    if (@(git status --porcelain).Count -gt 0) { Fail 'worktree is dirty; commit the immutable task baseline before publishing Issues.' }
    $head = (git rev-parse HEAD).Trim()
    if ($head -ne $BaselineCommit) { Fail 'baseline commit does not equal HEAD.' }
    $upstream = (git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null).Trim()
    if (-not $upstream) { Fail 'current branch has no upstream; push it before publishing Issues.' }
    $upstreamSha = (git rev-parse $upstream).Trim()
    if ($upstreamSha -ne $head) { Fail "HEAD $head is not the pushed upstream $upstreamSha." }
}

$lines = Get-Content -LiteralPath $tasksPath
$items = [System.Collections.Generic.List[object]]::new()
$seen = @{}

for ($index = 0; $index -lt $lines.Count; $index++) {
    $taskMatch = [regex]::Match($lines[$index], '^- \[(?<state>[ xX])\] (?<id>T\d{3}) (?<rest>.+)$')
    if (-not $taskMatch.Success) { continue }

    $taskId = $taskMatch.Groups['id'].Value
    if ($seen.ContainsKey($taskId)) { Fail "duplicate task ID $taskId." }
    $seen[$taskId] = $items.Count

    if ($index + 2 -ge $lines.Count) { Fail "$taskId is missing handoff metadata lines." }
    $dependsMatch = [regex]::Match($lines[$index + 1], '^  - Depends on: (?<value>.+?)\s*$')
    $evidenceMatch = [regex]::Match($lines[$index + 2], '^  - Acceptance evidence: (?<value>.+?)\s*$')
    if (-not $dependsMatch.Success -or -not $evidenceMatch.Success) {
        Fail "$taskId must be immediately followed by canonical Depends on and Acceptance evidence lines."
    }

    $rest = $taskMatch.Groups['rest'].Value
    if ($rest -match '(FR|NFR)-[A-Z0-9-]+/') { Fail "$taskId uses a compressed requirement ID." }
    if ($rest -match '\[(?:FR/NFR IDs|feature|app|path|evidence)\]|T0XX|NEEDS CLARIFICATION|TODO|TKTK') { Fail "$taskId contains a placeholder." }
    $requirements = @([regex]::Matches($rest, '\b(?:FR|NFR)-[A-Z0-9]+(?:-[A-Z0-9]+)+\b') | ForEach-Object Value | Select-Object -Unique)
    if ($requirements.Count -eq 0) { Fail "$taskId has no canonical FR/NFR requirement ID." }

    $dependsRaw = $dependsMatch.Groups['value'].Value.Replace('`', '').Trim()
    $dependencies = @()
    if ($dependsRaw -ne 'none') {
        $dependencies = @($dependsRaw -split '\s*,\s*')
        foreach ($dependency in $dependencies) {
            if ($dependency -notmatch '^T\d{3}$') { Fail "$taskId has invalid dependency '$dependency'." }
            if (-not $seen.ContainsKey($dependency)) { Fail "$taskId depends on unknown or forward task $dependency." }
        }
    }

    $evidence = $evidenceMatch.Groups['value'].Value.Trim()
    if (-not $evidence -or $evidence -match '\[|\]|TODO|TKTK|NEEDS CLARIFICATION') { Fail "$taskId has placeholder acceptance evidence." }

    $description = $rest
    $description = [regex]::Replace($description, '^\[P\]\s*', '')
    $description = [regex]::Replace($description, '^\[US\d+\]\s*', '')
    $description = [regex]::Replace($description, '^\[(?:FR|NFR)-[^\]]+\]\s*', '')
    $description = $description.Trim()

    $items.Add([pscustomobject]@{
        task_id = $taskId
        completed = $taskMatch.Groups['state'].Value -match '[xX]'
        description = $description
        requirements = @($requirements)
        dependencies = @($dependencies)
        acceptance_evidence = $evidence
        task_line = $index + 1
    })
    $index += 2
}

if ($items.Count -eq 0) { Fail 'tasks.md contains no canonical task blocks.' }

$featureName = Split-Path $normalizedFeature -Leaf
$baseUrl = "https://github.com/$repository/blob/$BaselineCommit"
$commitUrl = "https://github.com/$repository/commit/$BaselineCommit"
$payloads = foreach ($item in $items) {
    $requirementsText = ($item.requirements | ForEach-Object { "``$_``" }) -join ', '
    $dependencyText = if ($item.dependencies.Count -eq 0) { '- None' } else { ($item.dependencies | ForEach-Object { "- ``$_``" }) -join "`n" }
    $marker = "<!-- shifaa-speckit-handoff:v1 feature=$normalizedFeature task=$($item.task_id) baseline=$BaselineCommit -->"
    $body = @"
$marker

## SHIFAA SpecKit handoff

| Field | Value |
|---|---|
| Feature | ``$normalizedFeature`` |
| Task | ``$($item.task_id)`` |
| Requirements | $requirementsText |
| Baseline | [``$($BaselineCommit.Substring(0, 12))``]($commitUrl) |
| Exported state | $(if ($item.completed) { 'Completed' } else { 'Open' }) |

## Pinned source of truth

- [Specification]($baseUrl/$normalizedFeature/spec.md)
- [Plan]($baseUrl/$normalizedFeature/plan.md)
- [Task definition]($baseUrl/$normalizedFeature/tasks.md#L$($item.task_line))

## Task

$($item.description)

## Dependencies

$dependencyText

## Acceptance evidence

$($item.acceptance_evidence)

## Execution

Pull the baseline or a descendant, then run exactly one of:

- Kimi: ``/skill:speckit-implement <this issue URL>``
- Codex: <code>`$speckit-implement &lt;this issue URL&gt;</code>

Issue-scoped mode executes this task plus incomplete dependency closure only. The Issue is not a substitute for the pinned specification, plan, and task definition.
"@

    [pscustomobject]@{
        composite_key = "$normalizedFeature::$($item.task_id)"
        repository = $repository
        feature_path = $normalizedFeature
        task_id = $item.task_id
        title = "[$featureName] $($item.task_id): $($item.description)"
        body = $body
        state = if ($item.completed) { 'closed' } else { 'open' }
        baseline_commit = $BaselineCommit
        requirements = $item.requirements
        dependencies = $item.dependencies
        acceptance_evidence = $item.acceptance_evidence
    }
}

$result = [pscustomobject]@{
    schema_version = 1
    repository = $repository
    feature_path = $normalizedFeature
    baseline_commit = $BaselineCommit
    issues = @($payloads)
}

if ($Json) { $result | ConvertTo-Json -Depth 8 -Compress } else { $result }
