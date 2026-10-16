# Read-only proposal validation. No clinical, runtime, approval or lifecycle authority.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$schemaPath = Join-Path $PSScriptRoot 'engineering-fixtures.schema.json'
$candidate = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'engineering-fixtures.candidate.json')
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'engineering-fixtures.manifest.json') | ConvertFrom-Json -AsHashtable
$results = [Collections.Generic.List[object]]::new()
function Test-Structure($value) {
    $json = $value | ConvertTo-Json -Depth 100 -Compress
    return [bool](Test-Json -Json $json -SchemaFile $schemaPath -ErrorAction SilentlyContinue)
}
function Get-SemanticErrors($value) {
    $errors = [Collections.Generic.List[string]]::new()
    $cases = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $items = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $classifications = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
    foreach ($case in $value.cases) {
        if (!$cases.Add($case.caseId)) { $errors.Add('DUPLICATE_CASE_ID') }
        if (!$items.Add($case.item.itemId)) { $errors.Add('DUPLICATE_ITEM_ID') }
        $coding = $case.item.productCoding
        $evidence = $case.item.classificationEvidence
        $key = ConvertTo-Json -InputObject @($coding.system, $coding.code, $coding.version, $evidence.contentVersion) -Compress
        $flags = ConvertTo-Json -InputObject @($evidence.controlled, $evidence.nti) -Compress
        if ($classifications.ContainsKey($key) -and $classifications[$key] -cne $flags) {
            $errors.Add('CONFLICTING_PRODUCT_CONTENT_CLASSIFICATION')
        } else { $classifications[$key] = $flags }
    }
    return $errors.ToArray()
}
function Get-ManifestErrors($value) {
    $errors = [Collections.Generic.List[string]]::new()
    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($file in $value.files) {
        if (!$paths.Add($file.path)) { $errors.Add('DUPLICATE_MANIFEST_PATH') }
        if ($file.path -notmatch '^[a-z0-9.-]+$' -or $file.sha256 -notmatch '^[a-f0-9]{64}$') {
            $errors.Add('INVALID_MANIFEST_ENTRY'); continue
        }
        $path = Join-Path $PSScriptRoot $file.path
        if (!(Test-Path -LiteralPath $path -PathType Leaf)) { $errors.Add('MISSING_MANIFEST_FILE'); continue }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256) { $errors.Add('MANIFEST_HASH_MISMATCH') }
    }
    foreach ($required in @('engineering-fixtures.schema.json', 'engineering-fixtures.candidate.json', 'coded-input-proposal.md', 'validate-readiness.ps1')) {
        if (!$paths.Contains($required)) { $errors.Add('MISSING_MANIFEST_ENTRY') }
    }
    if ($value.schemaVersion -cne '0.2.0-proposal' -or $value.proposedDatasetVersion -cne '1.0.0' -or $value.approvalStatus -cne 'PROPOSED_NOT_APPROVED') { $errors.Add('MANIFEST_VERSION_OR_STATUS_MISMATCH') }
    return $errors.ToArray()
}
function Add-Result($name, $layer, $passed, $observed) {
    $results.Add([ordered]@{name=$name; layer=$layer; result=$(if ($passed) {'PASS'} else {'FAIL'}); observed=$observed})
}
function Invoke-Probe($name, $layer, [scriptblock]$mutate, $expectedError='') {
    $value = $candidate | ConvertFrom-Json -AsHashtable
    & $mutate $value
    $structural = Test-Structure $value
    if ($layer -eq 'schema') { Add-Result $name $layer (!$structural) 'Expected schema rejection'; return }
    $errors = @(Get-SemanticErrors $value)
    Add-Result $name $layer ($structural -and $errors.Contains($expectedError)) @{schemaAccepted=$structural; errors=$errors; expected=$expectedError}
}
$original = $candidate | ConvertFrom-Json -AsHashtable
Add-Result 'candidate-schema' 'schema' (Test-Structure $original) 'Proposed carrier only'
$semanticErrors = @(Get-SemanticErrors $original)
Add-Result 'candidate-cross-record' 'semantic-structural' ($semanticErrors.Count -eq 0) $semanticErrors
Add-Result 'candidate-three-mechanisms' 'semantic-structural' ($original.cases.Count -eq 3 -and (@($original.cases.purpose | Sort-Object -Unique).Count -eq 3)) 'Exactly three candidate purposes; no combined-true case'
Invoke-Probe 'non-engineering-envelope' 'schema' { param($v) $v.engineeringOnly=$false }
Invoke-Probe 'non-synthetic-code' 'schema' { param($v) $v.cases[0].item.productCoding.code='REAL_CODE' }
Invoke-Probe 'real-looking-code' 'schema' { param($v) $v.cases[0].item.productCoding.code='1234567890123' }
Invoke-Probe 'non-synthetic-namespace' 'schema' { param($v) $v.cases[0].item.productCoding.system='urn:unapproved:terminology' }
Invoke-Probe 'missing-code' 'schema' { param($v) $v.cases[0].item.productCoding.Remove('code') }
Invoke-Probe 'missing-coding-version' 'schema' { param($v) $v.cases[0].item.productCoding.Remove('version') }
Invoke-Probe 'missing-content-version' 'schema' { param($v) $v.cases[0].item.classificationEvidence.Remove('contentVersion') }
Invoke-Probe 'unexpected-item-field' 'schema' { param($v) $v.cases[0].item.extra='unexpected' }
Invoke-Probe 'unexpected-envelope-field' 'schema' { param($v) $v.extra='unexpected' }
Invoke-Probe 'false-purpose-controlled-true' 'schema' { param($v) $v.cases[0].item.classificationEvidence.controlled=$true }
Invoke-Probe 'controlled-purpose-flags-false' 'schema' { param($v) $v.cases[1].item.classificationEvidence.controlled=$false }
Invoke-Probe 'nti-purpose-flags-false' 'schema' { param($v) $v.cases[2].item.classificationEvidence.nti=$false }
Invoke-Probe 'combined-true-flags' 'schema' { param($v) $v.cases[1].item.classificationEvidence.nti=$true }
Invoke-Probe 'duplicate-case-id' 'semantic-structural' { param($v) $v.cases[1].caseId=$v.cases[0].caseId } 'DUPLICATE_CASE_ID'
Invoke-Probe 'duplicate-item-id' 'semantic-structural' { param($v) $v.cases[1].item.itemId=$v.cases[0].item.itemId } 'DUPLICATE_ITEM_ID'
Invoke-Probe 'same-product-content-conflicting-flags' 'semantic-structural' {
    param($v)
    $v.cases[1].item.productCoding=$v.cases[0].item.productCoding
    $v.cases[1].item.classificationEvidence.contentVersion=$v.cases[0].item.classificationEvidence.contentVersion
} 'CONFLICTING_PRODUCT_CONTENT_CLASSIFICATION'
foreach ($field in @('strength','dose','frequency','duration','quantity')) {
    $mutate = { param($v) $v.cases[0].item[$field].unitCode='SYNTHETIC_UNIT' }.GetNewClosure()
    Invoke-Probe "invalid-$field-unit" 'schema' $mutate
}
$hashErrors = @(Get-ManifestErrors $manifest)
Add-Result 'manifest-final-byte-hashes' 'hash' ($hashErrors.Count -eq 0) $hashErrors
$badManifest = $manifest | ConvertTo-Json -Depth 100 | ConvertFrom-Json -AsHashtable
$badManifest.files[0].sha256='0' * 64
$badHashErrors = @(Get-ManifestErrors $badManifest)
Add-Result 'mismatched-manifest-hash' 'hash' ($badHashErrors.Contains('MANIFEST_HASH_MISMATCH')) $badHashErrors
$badManifest = $manifest | ConvertTo-Json -Depth 100 | ConvertFrom-Json -AsHashtable
$badManifest.files=@($badManifest.files | Where-Object path -ne 'engineering-fixtures.schema.json')
$missingHashErrors = @(Get-ManifestErrors $badManifest)
Add-Result 'missing-manifest-entry' 'hash' ($missingHashErrors.Contains('MISSING_MANIFEST_ENTRY')) $missingHashErrors
$jsonErrors = [Collections.Generic.List[string]]::new()
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Filter '*.json') {
    try { Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json -AsHashtable | Out-Null }
    catch { $jsonErrors.Add($file.Name) }
}
Add-Result 'package-json-parse' 'syntax' ($jsonErrors.Count -eq 0) $jsonErrors.ToArray()
$scope = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'scope-manifest.json') | ConvertFrom-Json -AsHashtable
$expectedClosure = @(1,3,4,5,6,7,11 | ForEach-Object { 'FR-SAFE-{0:d3}' -f $_ })
$expectedPrerequisites = @('FR-SAFE-009','FR-SAFE-010')
$expectedNfr = @((1..7 | ForEach-Object { 'NFR-SEC-{0:d3}' -f $_ }), @('NFR-PRIV-001','NFR-PRIV-002','NFR-PRIV-004','NFR-I18N-001','NFR-A11Y-001','NFR-PERF-001','NFR-PERF-002','NFR-AVAIL-002','NFR-DATA-001','NFR-DATA-002','NFR-API-001','NFR-API-002','NFR-OBS-001','NFR-QUALITY-001','NFR-PORT-001')) | ForEach-Object { $_ }
$expectedOps = @('createPrescription','updatePrescription','runPrescriptionSafety','acknowledgeWarning','requestContraindicatedOverride','decideOverride','signPrescription','cancelPrescription','getPrescription','listPatientMedications')
$scopeErrors = [Collections.Generic.List[string]]::new()
foreach ($pair in @(@('closureRequirements',$expectedClosure), @('prerequisiteOnlyRequirements',$expectedPrerequisites), @('nfrRequirements',$expectedNfr), @('operations',$expectedOps))) {
    $actual = @($scope[$pair[0]])
    if ($actual.Count -ne $pair[1].Count -or (Compare-Object $actual $pair[1])) { $scopeErrors.Add($pair[0]) }
}
foreach ($key in @('closure','prerequisiteOnly','PATIENT','F012','F014','activeCatalog','reservations','catalogTotal','F007_024','F012_024','F026ParityTarget')) {
    $expected = @{closure=7;prerequisiteOnly=2;PATIENT=22;F012=10;F014=16;activeCatalog=242;reservations=6;catalogTotal=248;F007_024=170;F012_024=120;F026ParityTarget=242}[$key]
    if ($scope.counts[$key] -ne $expected) { $scopeErrors.Add($key) }
}
if ($scope.status -cne 'NOT READY' -or $scope.lifecycle -cne 'PRE_SPECIFY_BLOCKED') { $scopeErrors.Add('STATUS') }
Add-Result 'exact-scope-and-counts' 'scope' ($scopeErrors.Count -eq 0) $scopeErrors.ToArray()
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$register = @(Get-Content -LiteralPath (Join-Path $root 'shifaa-prd.md') | Select-Object -Skip 345 -First 19)
$masterRegister = @(Get-Content -LiteralPath (Join-Path $root 'SHIFAA-Implementation-Plan-MASTER.md') | Where-Object { $_ -match '^\| OPEN-' })
$matrix = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'plan-readiness-matrix.md') | Where-Object { $_ -match '^\| OPEN-' })
$gateErrors = [Collections.Generic.List[string]]::new()
function Normalize-Columns($row, $limit=6) { return (@($row.Trim('|').Split('|') | Select-Object -First $limit | ForEach-Object { $_.Trim() }) -join '|') }
if ($register.Count -ne 19 -or $matrix.Count -ne 19) { $gateErrors.Add('REGISTER_COUNT') }
foreach ($row in $register) {
    $canonical = Normalize-Columns $row
    if (@($matrix | Where-Object { (Normalize-Columns $_) -ceq $canonical }).Count -ne 1) { $gateErrors.Add('MATRIX_ROW_MISMATCH') }
    if (@($masterRegister | Where-Object { (Normalize-Columns $_) -ceq $canonical }).Count -ne 1) { $gateErrors.Add('MASTER_ROW_MISMATCH') }
}
Add-Result 'canonical-19-open-gates' 'source-parity' ($gateErrors.Count -eq 0) $gateErrors.ToArray()
$linkErrors = [Collections.Generic.List[string]]::new()
$linkCount = 0
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.md') {
    $text = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($match in [regex]::Matches($text, '\[[^\]]+\]\(([^)]+)\)')) {
        $link = $match.Groups[1].Value
        if ($link -match '^https?://') { continue }
        $parts = $link.Split('#',2)
        $target = [IO.Path]::GetFullPath((Join-Path $file.DirectoryName $parts[0]))
        $linkCount++
        if (!(Test-Path -LiteralPath $target -PathType Leaf)) { $linkErrors.Add("$($file.Name): $link"); continue }
        if ($parts.Count -eq 2 -and $parts[1] -match '^L(\d+)(?:-L(\d+))?$') {
            $first = [int]$Matches[1]; $last = $(if ($Matches[2]) {[int]$Matches[2]} else {$first})
            if ($first -lt 1 -or $last -lt $first -or $last -gt @(Get-Content -LiteralPath $target).Count) { $linkErrors.Add("$($file.Name): $link") }
        } elseif ($parts.Count -eq 2) {
            $headings = @(Get-Content -LiteralPath $target | Where-Object { $_ -match '^#+ ' } | ForEach-Object { ($_.TrimStart('#').Trim().ToLowerInvariant() -replace '[^\p{L}\p{N}_\- ]','') -replace ' ','-' })
            if ($parts[1] -cnotin $headings) { $linkErrors.Add("$($file.Name): $link") }
        }
    }
}
Add-Result 'source-links-and-line-bounds' 'references' ($linkErrors.Count -eq 0) @{checked=$linkCount; errors=$linkErrors.ToArray(); limitation='Bounds and heading existence checked; source meaning reviewed separately by root.'}
$whitespaceErrors = [Collections.Generic.List[string]]::new()
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]history[\\/]' }) {
    $text = Get-Content -Raw -LiteralPath $file.FullName
    if ($text -match '(?m)[ \t]+$' -or $text -match '(?m)^(<<<<<<<|=======|>>>>>>>)') { $whitespaceErrors.Add($file.Name) }
}
Add-Result 'package-whitespace-and-conflict-markers' 'diff' ($whitespaceErrors.Count -eq 0) $whitespaceErrors.ToArray()
$output = [ordered]@{
    recordKind='READ_ONLY_ENGINEERING_PROPOSAL_VALIDATION'
    command='pwsh -NoProfile -File specs/012-prescription-safety-governed-overrides/readiness/validate-readiness.ps1'
    runtime=@{powerShell=$PSVersionTable.PSVersion.ToString(); dotNet=[Environment]::Version.ToString(); schemaValidator=(Get-Command Test-Json).Module.Version.ToString(); schemaDraft='2020-12'}
    checks=$results.ToArray()
    limitations=@('Semantic here means cross-record structural consistency, not clinical correctness.', 'No runtime production-exclusion, authority, RLS, race, rollback, native accessibility or lifecycle test executed.', 'Dataset 1.0.0 remains proposed and unapproved.')
}
$output | ConvertTo-Json -Depth 100
if (@($results | Where-Object result -eq 'FAIL').Count -gt 0) { exit 1 }
