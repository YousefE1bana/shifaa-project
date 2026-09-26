[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$featureRoot = Split-Path -Parent $root
$inventoryPath = Join-Path $root 'baseline-inventory.json'
$manifestPath = Join-Path $root 'reference-manifest.json'
$sourcePath = Join-Path $root 'source\composition.html'
$inventory = Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$spec = Get-Content -LiteralPath (Join-Path $featureRoot 'spec.md') -Raw

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) { throw "$Message (actual=$Actual expected=$Expected)" }
}

$expectedRoutes = @(
  @{ id='F010-P0-PAT-RECORDS-001'; app='patient'; route='/records'; viewports='360x800|412x915|768x1024'; states='loading|empty|pending|referral-preview|acceptance-review|representative-acceptance-review|submitting|accepted|permission-denied|authority-lost|stale|offline|conflict|error-recoverable|error-terminal' },
  @{ id='F010-P0-PAT-ENCOUNTER-001'; app='patient'; route='/encounters/:id'; viewports='360x800|412x915|768x1024'; states='loading|empty|open|patient-visible-note|private-note-excluded|chat-stale|reconnecting|access-ended|completed|permission-denied|offline|conflict|message-success|error-recoverable|error-terminal' },
  @{ id='F010-P0-CLN-SUMMARY-001'; app='clinic'; route='/patients/:id/summary'; viewports='768x1024|1440x900'; states='loading|empty|active|start-eligible|start-review|start-stale|private-note|patient-visible-note|permission-denied|stale|offline|error-recoverable|error-terminal' },
  @{ id='F010-P0-CLN-ENCOUNTER-001'; app='clinic'; route='/encounters/:id'; viewports='768x1024|1440x900'; states='loading|empty|created|open|note-draft-edit|note-sign-review|note-signed|participant-edit|participant-end-review|participant-removed|completion-review|completed|permission-denied|stale|offline|conflict|error-recoverable|error-terminal' },
  @{ id='F010-P0-CLN-REFERRALS-001'; app='clinic'; route='/referrals'; viewports='768x1024|1440x900'; states='loading|empty|pending|accepted|create-review|create-success|permission-denied|stale|offline|conflict|error-recoverable|error-terminal' },
  @{ id='F010-P0-CLN-MESSAGES-001'; app='clinic'; route='/messages'; viewports='768x1024|1440x900'; states='loading|empty|active|send-success|participant-removed|access-ended|chat-unavailable|reconnecting|stale|offline|permission-denied|conflict|error-recoverable|error-terminal' }
)
Assert-Equal $inventory.routes.Count 6 'Feature 010 baseline family count drift'
Assert-Equal (($inventory.locales | Sort-Object) -join '|') 'ar-EG|en-EG' 'Locale registry drift'
Assert-Equal $manifest.status 'CANDIDATE_PENDING_REQUIRED_APPROVALS' 'Candidate status drift'
Assert-Equal $manifest.sourceVersion $inventory.sourceVersion 'Source version drift'

$expected = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($row in $expectedRoutes) {
  $route = $inventory.routes | Where-Object baselineId -eq $row.id
  Assert-Equal @($route).Count 1 "Missing or duplicate baseline $($row.id)"
  Assert-Equal $route.app $row.app "App drift $($row.id)"
  Assert-Equal $route.route $row.route "Route drift $($row.id)"
  Assert-Equal ($route.viewports -join '|') $row.viewports "Viewport drift $($row.id)"
  Assert-Equal ($route.states -join '|') $row.states "State drift $($row.id)"
  foreach ($locale in $inventory.locales) {
    foreach ($viewport in $route.viewports) {
      foreach ($state in $route.states) { [void]$expected.Add("$($row.id)|$locale|$viewport|$state") }
    }
  }
}
Assert-Equal $manifest.entryCount $expected.Count 'Manifest entry count drift'
Assert-Equal $manifest.sourceArtifactSha256 ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()) 'Source digest mismatch'
Assert-Equal $manifest.inventoryArtifactSha256 ((Get-FileHash -LiteralPath $inventoryPath -Algorithm SHA256).Hash.ToLowerInvariant()) 'Inventory digest mismatch'

$seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($entry in $manifest.entries) {
  $key = "$($entry.baselineId)|$($entry.locale)|$($entry.viewport)|$($entry.state)"
  if (-not $expected.Contains($key)) { throw "Unexpected manifest entry: $key" }
  if (-not $seen.Add($key)) { throw "Duplicate manifest entry: $key" }
  Assert-Equal $entry.sourceNode "$($inventory.sourceVersion)#$($entry.baselineId)--$($entry.state)" "Source node drift: $key"
  Assert-Equal $entry.sourceVersion $inventory.sourceVersion "Source version drift: $key"
  Assert-Equal $entry.fixtureId 'F010-SYNTHETIC-VISUAL-001' "Fixture drift: $key"
  $artifact = Join-Path $root ($entry.referenceArtifact -replace '/', '\')
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) { throw "Missing reference artifact: $artifact" }
  Assert-Equal $entry.sha256 ((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()) "Reference digest mismatch: $key"
  $png = [IO.File]::ReadAllBytes($artifact)
  if ($png.Length -lt 24 -or $png[0] -ne 137 -or $png[1] -ne 80 -or $png[2] -ne 78 -or $png[3] -ne 71) { throw "Invalid PNG signature: $key" }
  $width = (([int]$png[16]) -shl 24) -bor (([int]$png[17]) -shl 16) -bor (([int]$png[18]) -shl 8) -bor ([int]$png[19])
  $height = (([int]$png[20]) -shl 24) -bor (([int]$png[21]) -shl 16) -bor (([int]$png[22]) -shl 8) -bor ([int]$png[23])
  Assert-Equal ("$width" + 'x' + "$height") $entry.viewport "PNG dimension drift: $key"
}
Assert-Equal $seen.Count $expected.Count 'Manifest combination coverage drift'
$pngFiles = @(Get-ChildItem -LiteralPath (Join-Path $root 'references') -Recurse -File -Filter '*.png')
Assert-Equal $pngFiles.Count $expected.Count 'Reference directory contains missing or extra PNG files'

$expectedOperations = @('createEncounter','getEncounter','updateEncounter','signEncounterNote','completeEncounter','createReferral','listReferrals','acceptReferral','listContextMessages','sendContextMessage')
$operationMatches = [regex]::Matches($spec, '(?m)^\| `(?<operation>[A-Za-z][A-Za-z0-9]+)` \| `(GET|POST|PATCH) ')
$actualOperations = @($operationMatches | ForEach-Object { $_.Groups['operation'].Value })
Assert-Equal $actualOperations.Count 10 'Feature 010 operation count drift'
Assert-Equal (($actualOperations | Sort-Object) -join '|') (($expectedOperations | Sort-Object) -join '|') 'Feature 010 operation identity drift'
Assert-Equal (([regex]::Matches($spec, '\bFR-(?:FAC-006|CLINIC-006|CLINIC-007)\b') | ForEach-Object Value | Sort-Object -Unique).Count) 3 'Feature 010 FR drift'

Push-Location (git -C $root rev-parse --show-toplevel)
try {
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
}
finally { Pop-Location }

Write-Output "PASS: 6 candidate baseline IDs, $($manifest.entryCount) route/locale/viewport/state references, 10 operations, source/inventory/image digests, PNG dimensions, and git diff check."
