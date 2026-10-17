# Run-owned Hyper-V boundary. Invoked only by verify.mjs after admission.
param([Parameter(Mandatory=$true)][ValidateSet('Preflight','Create','Prepare','Checkpoint','Execute','Teardown')][string]$Action)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$c = $request.config
function Require($condition, [string]$reason) { if (-not $condition) { throw $reason } }
function Canonical([string]$p) {
  Require ([IO.Path]::IsPathRooted($p)) 'Absolute path required'
  $cursor = Get-Item -LiteralPath $p -Force
  while ($null -ne $cursor) {
    Require (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'Reparse path rejected'
    $cursor = $cursor.Parent
  }
}
function Private([string]$p) {
  Canonical $p
  $acl = Get-Acl -LiteralPath $p
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  Require ($acl.AreAccessRulesProtected -or -not (Test-Path -LiteralPath $p -PathType Container)) 'Private directory ACL required'
  Require ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid) 'Owner mismatch'
  foreach($entry in $acl.Access) {
    Require ($entry.AccessControlType -eq 'Allow') 'Unexpected ACL'
    Require ($entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -in @($sid,'S-1-5-18')) 'Public ACL rejected'
  }
}
Require ($request.nonce -match '^[a-f0-9]{32}$') 'Invalid nonce'
Require ($request.name -eq ('shifaa-verify-' + $request.nonce)) 'Invalid run name'
Require ($request.output -eq (Join-Path $c.outputParent $request.nonce)) 'Output scope substitution'
Require ($c.authorize -eq 'CREATE_ONE_DISPOSABLE_VM_AND_REMOVE_ONLY_ITS_VERIFIED_RESOURCES') 'Missing run authorization'
Require ($c.runNonce -eq $request.nonce -and $c.revision -eq $request.revision) 'Authorization substitution'
Require (([DateTimeOffset]$c.expiresUtc).UtcDateTime -gt [DateTime]::UtcNow) 'Expired authorization'
Require ($c.budget.cpus -ge 2 -and $c.budget.cpus -le 4 -and $c.budget.memoryGiB -ge 8 -and $c.budget.memoryGiB -le 16 -and $c.budget.diskGiB -ge 40 -and $c.budget.diskGiB -le 120 -and $c.budget.minutes -ge 10 -and $c.budget.minutes -le 180) 'Budget rejected'
Import-Module Hyper-V -ErrorAction Stop
Require ((Get-Service vmms).Status -eq 'Running') 'Hyper-V service unavailable'
Private $c.outputParent
Private $c.credentialPath
Private $c.image.path
Require ((Get-FileHash -LiteralPath $c.image.path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $c.image.sha256) 'Image hash mismatch'
$image = Get-VHD -Path $c.image.path
Require ($image.VhdFormat -eq 'VHDX' -and $image.VhdType -ne 'Differencing' -and -not $image.Attached) 'Independent unattached image required'
Require ($image.Size -le ([long]$c.budget.diskGiB * 1GB)) 'Template virtual disk exceeds budget'
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($c.outputParent).Substring(0,1))
if ($Action -in @('Preflight','Create')) {
  Require ($drive.Free -ge (([long]$c.budget.diskGiB + [long]$c.budget.memoryGiB + 16) * 1GB)) 'Insufficient disk headroom'
} elseif ($Action -ne 'Teardown') {
  Require ($drive.Free -ge 8GB) 'Reserved disk headroom exhausted'
}
$switch = Get-VMSwitch -Id $c.auditSwitchId
Require ($null -ne $switch) 'Explicit audit-only switch required'
$disk = Join-Path $request.output 'run.vhdx'
$receipt = Join-Path $request.output 'machine.json'
$vm = $null
$session = $null
function OwnedVM {
  Private $request.output
  Require (Test-Path -LiteralPath $receipt -PathType Leaf) 'Creation receipt missing'
  $binding = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
  Require ($binding.nonce -eq $request.nonce -and $binding.revision -eq $request.revision -and $binding.image -eq $c.image.sha256) 'Creation receipt mismatch'
  Require ($binding.vmId -eq $request.vmId) 'VM identity substitution'
  $v = Get-VM -Id $request.vmId
  Require ($v.Name -eq $request.name -and $v.Notes -eq ('SHIFAA-VERIFY/1:' + $request.nonce)) 'VM ownership lost'
  Require ($v.ProcessorCount -eq $c.budget.cpus -and $v.MemoryStartup -eq ([long]$c.budget.memoryGiB * 1GB) -and -not $v.DynamicMemoryEnabled) 'VM budget drift'
  Require ($v.Path -eq $binding.vmPath -and ($v.Path -eq $request.output -or $v.Path.StartsWith($request.output + '\',[StringComparison]::OrdinalIgnoreCase))) 'VM storage substitution'
  $disks = @(Get-VMHardDiskDrive -VM $v)
  Require ($disks.Count -eq 1 -and $disks[0].Path -eq $disk) 'VM disk substitution'
  Canonical $disk
  $d = Get-VHD -Path $disk
  Require ($d.DiskIdentifier.ToString() -eq $binding.diskId -and $d.ParentPath -eq $c.image.path) 'Disk identity lost'
  Require (@(Get-VMDvdDrive -VM $v).Count -eq 0) 'Unexpected media'
  Require (@(Get-VMNetworkAdapter -VM $v).Count -eq 0) 'Guest must be disconnected before repository code runs'
  return $v
}
function Session($v) {
  $credential = Import-Clixml -LiteralPath $c.credentialPath
  Require ($credential -is [Management.Automation.PSCredential]) 'Protected VM credential required'
  $until = [DateTime]::UtcNow.AddMinutes(2)
  do {
    try {return New-PSSession -VMId $v.Id -Credential $credential -ErrorAction Stop} catch {
      Require ([DateTime]::UtcNow -lt $until -and $request.deadline -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) 'PowerShell Direct unavailable before deadline'
      Start-Sleep -Seconds 1
    }
  } while ($true)
}
function Guest($block, $arguments) {
  $remaining = [Math]::Min(7200, [Math]::Floor(($request.deadline - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000))
  Require ($remaining -gt 0) 'Run time budget exhausted'
  $job = Invoke-Command -Session $session -ScriptBlock $block -ArgumentList $arguments -AsJob
  try {
    if ($null -eq (Wait-Job -Job $job -Timeout $remaining)) {
      $safe = OwnedVM
      Stop-VM -VM $safe -TurnOff -Confirm:$false | Out-Null
      throw 'Guest deadline expired; exact VM stopped and disk retained'
    }
    Require ($job.State -eq 'Completed') 'Guest operation failed'
    return Receive-Job -Job $job -ErrorAction Stop
  } finally { Remove-Job -Job $job -Force -ErrorAction SilentlyContinue }
}
try {
  $result = @{nonce=$request.nonce;status='PASS'}
  if ($Action -eq 'Preflight') {
    Require (@(Get-VM | Where-Object { $_.Name -like 'shifaa-verify-*' }).Count -eq 0) 'Unresolved verification VM blocks accumulation'
    Require (-not (Test-Path -LiteralPath $request.output)) 'Preexisting output rejected'
    Require (-not (Test-Path -LiteralPath (Join-Path $c.outputParent 'active-verification.lock'))) 'Unresolved run lock'
  } elseif ($Action -eq 'Create') {
    Private $request.output
    Require (-not (Test-Path -LiteralPath $disk) -and -not (Test-Path -LiteralPath $receipt)) 'Creation collision'
    Require (@(Get-VM | Where-Object { $_.Name -like 'shifaa-verify-*' }).Count -eq 0) 'Run collision'
    $newDisk = New-VHD -Path $disk -ParentPath $c.image.path -Differencing
    $vm = New-VM -Name $request.name -Generation 2 -MemoryStartupBytes ([long]$c.budget.memoryGiB * 1GB) -VHDPath $disk -Path $request.output
    Set-VM -VM $vm -Notes ('SHIFAA-VERIFY/1:' + $request.nonce) -AutomaticStartAction Nothing -AutomaticStopAction ShutDown -CheckpointType Disabled
    Set-VMProcessor -VM $vm -Count $c.budget.cpus -ExposeVirtualizationExtensions $true
    Set-VMMemory -VM $vm -DynamicMemoryEnabled $false
    Get-VMNetworkAdapter -VM $vm | Remove-VMNetworkAdapter
    Get-VMDvdDrive -VM $vm | Remove-VMDvdDrive
    Require ($vm.Path -eq $request.output -or $vm.Path.StartsWith($request.output + '\',[StringComparison]::OrdinalIgnoreCase)) 'VM storage escaped private output'
    $binding = @{nonce=$request.nonce;revision=$request.revision;image=$c.image.sha256;vmId=$vm.Id.ToString();vmPath=$vm.Path;diskId=$newDisk.DiskIdentifier.ToString()}
    $file = [IO.File]::Open($receipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes(($binding | ConvertTo-Json -Compress));$file.Write($bytes,0,$bytes.Length) } finally {$file.Dispose()}
    $result.vmId = $vm.Id.ToString()
    Start-VM -VM $vm | Out-Null
  } else {
    $vm = OwnedVM
    if ($Action -eq 'Prepare') {
      $session = Session $vm
      $preflight = Guest {
        $ErrorActionPreference='Stop'
        Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|DATABASE|DOCKER|COMPOSE|SUPABASE)' } | ForEach-Object {Remove-Item -LiteralPath ('Env:' + $_.Name)}
        if ((& node --version) -ne 'v24.18.0' -or (& pnpm --version) -ne '11.13.0') {throw 'Tool version'}
        if (-not (Get-Command powershell.exe,pwsh.exe,git.exe,docker.exe)) {throw 'Missing tools'}
        $dockerContext = (& docker context show)
        if ($LASTEXITCODE -ne 0) {throw 'Docker context missing'}
        $dockerMetadata = (& docker context inspect $dockerContext) | ConvertFrom-Json
        if ($dockerMetadata[0].Endpoints.docker.Host -notmatch '^npipe://.+/pipe/dockerDesktopLinuxEngine$') {throw 'Nonlocal guest engine rejected'}
        if ((& docker ps -aq) -or (& docker volume ls -q)) {throw 'Nonempty guest Docker engine'}
        if ($LASTEXITCODE -ne 0) {throw 'Docker unavailable'}
        if (Get-Process postgres -ErrorAction SilentlyContinue) {throw 'Preexisting PostgreSQL'}
        if (@(Get-ChildItem -LiteralPath 'C:\SHIFAA' -Force).Count -ne 0) {throw 'Nonempty appliance work area'}
        'CLEAN'
      } @()
      Require ($preflight -eq 'CLEAN') 'Guest baseline rejected'
      Copy-Item -LiteralPath (Join-Path $request.output 'source.bundle') -Destination 'C:\SHIFAA\source.bundle' -ToSession $session
      Guest {
        param($sha,$revision,$vmId,$nonce,$deadline,$postgres)
        $ErrorActionPreference='Stop'
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = Get-Acl -LiteralPath 'C:\SHIFAA'
        if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {throw 'Private appliance root required'}
        foreach($rule in $acl.Access) {if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid.Value,'S-1-5-18')) {throw 'Public appliance ACL'}}
        if ((Get-Item -LiteralPath 'C:\SHIFAA').Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Linked appliance root'}
        New-Item -ItemType Directory -Path 'C:\SHIFAA\evidence' -ErrorAction Stop | Out-Null
        $private = New-Object Security.AccessControl.DirectorySecurity
        $private.SetAccessRuleProtection($true,$false);$private.SetOwner($sid)
        foreach($s in @($sid,(New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
          $private.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
        }
        Set-Acl -LiteralPath 'C:\SHIFAA\evidence' -AclObject $private
        $binding = @{authority='POWER_SHELL_DIRECT_FRESH_VM';vmId=$vmId;nonce=$nonce;revision=$revision;deadline=$deadline;postgres=$postgres}
        $file = [IO.File]::Open('C:\SHIFAA\run.json',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try {$bytes=[Text.Encoding]::UTF8.GetBytes(($binding|ConvertTo-Json -Depth 5 -Compress));$file.Write($bytes,0,$bytes.Length)} finally {$file.Dispose()}
        if ((Get-FileHash -LiteralPath 'C:\SHIFAA\source.bundle' -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) {throw 'Bundle drift'}
        & git -c core.autocrlf=false clone --no-hardlinks 'C:\SHIFAA\source.bundle' 'C:\SHIFAA\source' *> $null
        if ($LASTEXITCODE -ne 0) {throw 'Clone failed'}
        Set-Location -LiteralPath 'C:\SHIFAA\source'
        if ((& git rev-parse HEAD) -ne $revision) {throw 'Revision drift'}
        & pnpm install --offline --frozen-lockfile --ignore-scripts *> 'C:\SHIFAA\install.log'
        if ($LASTEXITCODE -ne 0) {throw 'Offline dependencies missing'}
      } @($request.bundleSha256,$request.revision,$request.vmId,$request.nonce,$request.deadline,$c.postgres) | Out-Null
      # Literal audit only: no repository scripts or tests run with a NIC present.
      Add-VMNetworkAdapter -VM $vm -Name 'audit-only' -SwitchName $switch.Name
      try {
        Guest {
          $ErrorActionPreference='Stop'
          # No .npmrc, pnpmfile, hook, lifecycle or test from the source bundle
          # is present during this sole network-enabled operation.
          New-Item -ItemType Directory -Path 'C:\SHIFAA\advisory' -ErrorAction Stop | Out-Null
          Copy-Item -LiteralPath 'C:\SHIFAA\source\pnpm-lock.yaml' -Destination 'C:\SHIFAA\advisory\pnpm-lock.yaml'
          Copy-Item -LiteralPath 'C:\SHIFAA\source\pnpm-workspace.yaml' -Destination 'C:\SHIFAA\advisory\pnpm-workspace.yaml'
          '{"name":"shifaa-advisory-only","private":true}' | Set-Content -LiteralPath 'C:\SHIFAA\advisory\package.json' -Encoding Ascii
          "ignore-pnpmfile=true`nignore-scripts=true" | Set-Content -LiteralPath 'C:\SHIFAA\advisory\.npmrc' -Encoding Ascii
          Set-Location -LiteralPath 'C:\SHIFAA\advisory'
          & pnpm --ignore-scripts --registry=https://registry.npmjs.org --userconfig=NUL audit --audit-level high --ignore-unfixable *> 'C:\SHIFAA\audit.log'
          $code=$LASTEXITCODE
          @{exitCode=$code;checkedUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress | Set-Content -LiteralPath 'C:\SHIFAA\audit.json' -Encoding UTF8
        } @() | Out-Null
      } finally {Get-VMNetworkAdapter -VM $vm | Remove-VMNetworkAdapter}
      $vm = OwnedVM
    } elseif ($Action -eq 'Checkpoint') {
      Require ($request.deadline -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) 'Run deadline exceeded'
    } elseif ($Action -eq 'Execute') {
      $session = Session $vm
      $raw = Guest {
        param($reference,$image,$nonce,$revision)
        $ErrorActionPreference='Stop'
        Set-Location -LiteralPath 'C:\SHIFAA\source'
        Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|DATABASE|DOCKER|COMPOSE|SUPABASE)' } | ForEach-Object {Remove-Item -LiteralPath ('Env:' + $_.Name)}
        $env:CI='true';$env:TURBO_CONCURRENCY='1';$env:NODE_OPTIONS='--max-old-space-size=4096'
        & node tools/verification-guest.mjs $reference $image $nonce $revision *> 'C:\SHIFAA\execution.log'
        if (-not (Test-Path -LiteralPath 'C:\SHIFAA\summary.json')) {throw 'Required summary missing'}
        Get-Content -LiteralPath 'C:\SHIFAA\summary.json' -Raw
      } @($c.postgres.reference,$c.postgres.image,$request.nonce,$request.revision)
      $summary = $raw | ConvertFrom-Json
      Require ($summary.revision -eq $request.revision -and $summary.nonce -eq $request.nonce) 'Summary substitution'
      $result.results = $summary.results
    } elseif ($Action -eq 'Teardown') {
      Stop-VM -VM $vm -TurnOff -Confirm:$false | Out-Null
      $vm = OwnedVM
      Remove-VM -VM $vm -Force
      Require (-not (Get-VM -Id $request.vmId -ErrorAction SilentlyContinue)) 'VM removal incomplete'
      $d = Get-VHD -Path $disk
      Require ($d.DiskIdentifier.ToString() -eq ((Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).diskId) -and -not $d.Attached) 'Disk ownership lost before deletion'
      Remove-Item -LiteralPath $disk -Force
      Require (-not (Test-Path -LiteralPath $disk)) 'Disk removal incomplete'
    }
  }
  $result | ConvertTo-Json -Depth 8 -Compress
} finally {if ($null -ne $session) {Remove-PSSession -Session $session -ErrorAction SilentlyContinue}}
