[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$featureRoot = Split-Path -Parent $root
$inventoryPath = Join-Path $root 'baseline-inventory.json'
$manifestPath = Join-Path $root 'reference-manifest.json'
$sourcePath = Join-Path $root 'source\composition.html'
$specPath = Join-Path $featureRoot 'spec.md'
$inventory = Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$spec = Get-Content -LiteralPath $specPath -Raw

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) { throw "$Message (actual=$Actual expected=$Expected)" }
}

$expectedBaselineIds = @(
  'F009-P0-PAT-DISCOVER-001', 'F009-P0-PAT-DOCTOR-001',
  'F009-P0-PAT-BOOK-001', 'F009-P0-PAT-APPOINTMENT-001',
  'F009-P0-CLN-TODAY-001', 'F009-P0-CLN-QUEUE-001',
  'F009-P0-CLN-SCHEDULE-001', 'F009-P0-CLN-APPOINTMENT-001'
)
$actualBaselineIds = @($inventory.routes.baselineId | Sort-Object)
Assert-Equal ($actualBaselineIds -join '|') (($expectedBaselineIds | Sort-Object) -join '|') 'Baseline ID registry drift'
Assert-Equal (($inventory.locales | Sort-Object) -join '|') 'ar-EG|en-EG' 'Locale registry drift'

$expected = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($route in $inventory.routes) {
  foreach ($locale in $inventory.locales) {
    foreach ($viewport in $route.viewports) {
      foreach ($state in $route.states) {
        [void]$expected.Add("$($route.baselineId)|$locale|$viewport|$state")
      }
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
  $artifact = Join-Path $root ($entry.referenceArtifact -replace '/', '\')
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) { throw "Missing reference artifact: $artifact" }
  Assert-Equal $entry.sha256 ((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()) "Reference digest mismatch: $key"
  $png = [IO.File]::ReadAllBytes($artifact)
  if ($png.Length -lt 24 -or $png[0] -ne 137 -or $png[1] -ne 80 -or $png[2] -ne 78 -or $png[3] -ne 71) { throw "Invalid PNG signature: $key" }
  $width = (([int]$png[16]) -shl 24) -bor (([int]$png[17]) -shl 16) -bor (([int]$png[18]) -shl 8) -bor ([int]$png[19])
  $height = (([int]$png[20]) -shl 24) -bor (([int]$png[21]) -shl 16) -bor (([int]$png[22]) -shl 8) -bor ([int]$png[23])
  $size = "$width" + 'x' + "$height"
  Assert-Equal $size $entry.viewport "PNG dimensions mismatch: $key"
  Assert-Equal $entry.sourceNode "$($inventory.sourceVersion)#$($entry.baselineId)--$($entry.state)" "Source node mismatch: $key"
}
Assert-Equal $seen.Count $expected.Count 'Manifest combination coverage drift'
$pngFiles = @(Get-ChildItem -LiteralPath (Join-Path $root 'references') -Recurse -File -Filter '*.png')
Assert-Equal $pngFiles.Count $expected.Count 'Reference directory contains missing or extra PNG files'

$expectedOperations = @(
  'searchDoctors', 'listDoctorAvailability', 'createSchedule', 'updateSchedule',
  'createScheduleException', 'createAppointment', 'getAppointment', 'listAppointments',
  'cancelAppointment', 'rescheduleAppointment', 'checkInAppointment', 'getQueue',
  'getMyQueuePosition', 'callQueueEntry', 'reorderQueueEntry', 'completeQueueEntry',
  'sendDoctorDelay', 'declareDoctorAbsence'
)
$operationMatches = [regex]::Matches($spec, '(?m)^\| `(?<operation>[A-Za-z][A-Za-z0-9]+)` \| `(GET|POST|PATCH) ')
$actualOperations = @($operationMatches | ForEach-Object { $_.Groups['operation'].Value })
Assert-Equal $actualOperations.Count 18 'Feature 009 operation count drift'
Assert-Equal (($actualOperations | Sort-Object) -join '|') (($expectedOperations | Sort-Object) -join '|') 'Feature 009 operation identity drift'

foreach ($state in @('requested-readonly','in-queue-readonly','in-consultation-readonly','completed-readonly','no-show-readonly')) {
  foreach ($baseline in @('F009-P0-PAT-APPOINTMENT-001','F009-P0-CLN-APPOINTMENT-001')) {
    $route = $inventory.routes | Where-Object baselineId -eq $baseline
    if ($state -notin $route.states) { throw "Missing appointment no-producer state $state from $baseline" }
  }
}
foreach ($baseline in @('F009-P0-PAT-APPOINTMENT-001','F009-P0-CLN-APPOINTMENT-001')) {
  $route = $inventory.routes | Where-Object baselineId -eq $baseline
  if ('queue-in-service-readonly' -notin $route.states -or 'queue-removed' -notin $route.states) { throw "Queue taxonomy drift in $baseline" }
}
$queueRoute = $inventory.routes | Where-Object baselineId -eq 'F009-P0-CLN-QUEUE-001'
if ('in-service-readonly' -notin $queueRoute.states -or 'removed' -notin $queueRoute.states) { throw 'Clinic queue taxonomy drift' }

Push-Location (git -C $root rev-parse --show-toplevel)
try {
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
}
finally { Pop-Location }

Write-Output "PASS: 8 baseline IDs, $($manifest.entryCount) route/locale/viewport/state references, 18 operations, canonical no-producer state taxonomy, hashes, dimensions, and git diff check."
