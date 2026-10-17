# Mock-only provider regression. No Hyper-V module, Docker, DB or VM is accessed.
param([Parameter(Mandatory=$true)][string]$Provider)
$ErrorActionPreference='Stop'
$global:shifaaMockscenario='valid'
$global:shifaaMockeffects=New-Object Collections.Generic.List[string]
$global:shifaaMockremoved=$false
$global:shifaaMockdiskRemoved=$false
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$global:shifaaMockprivateAcl=New-Object Security.AccessControl.DirectorySecurity
$global:shifaaMockprivateAcl.SetOwner($sid)
$global:shifaaMockprivateAcl.SetAccessRuleProtection($true,$false)
$global:shifaaMockprivateAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
function Import-Module {param($Name) if($Name -ne 'Hyper-V'){throw 'Unexpected import'}}
function Get-Service {param($Name) @{Status=$(if($global:shifaaMockscenario -eq 'service'){'Stopped'}else{'Running'})}}
function Get-Item {param($LiteralPath,[switch]$Force) @{Attributes=$(if($global:shifaaMockscenario -eq 'reparse'){[IO.FileAttributes]::ReparsePoint}else{0});Parent=$null}}
function Get-Acl {param($LiteralPath) if($global:shifaaMockscenario -eq 'acl'){throw 'ACL rejected'}; return $global:shifaaMockprivateAcl}
function Get-FileHash {param($LiteralPath,$Algorithm) @{Hash=$(if($global:shifaaMockscenario -eq 'image'){'f'*64}else{'c'*64})}}
function Get-VHD {param($Path) @{VhdFormat='VHDX';VhdType='Dynamic';Attached=$false;Size=40GB;DiskIdentifier='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';ParentPath='C:\mock\image.vhdx'}}
function Get-PSDrive {param($Name) if($global:shifaaMockscenario -eq 'disk'){throw 'Disk preflight failed'};@{Free=1TB}}
function Get-VMSwitch {param($Id) @{Id=$Id;Name='mock-audit-switch'}}
function Get-VM {
  param($Id)
  if(-not $Id) {if($global:shifaaMockscenario -eq 'unresolved') {return @{Name='shifaa-verify-older'}};return}
  if($global:shifaaMockremoved){return}
  return @{Id=$Id;Name=$(if($global:shifaaMockscenario -eq 'name'){'other'}else{$global:shifaaMockrequestName});Notes=('SHIFAA-VERIFY/1:' + ('a'*32));ProcessorCount=2;MemoryStartup=8GB;DynamicMemoryEnabled=$false;Path=$global:shifaaMockoutput}
}
function Get-VMHardDiskDrive {param($VM) @{Path=$(if($global:shifaaMockscenario -eq 'disk-substitution'){'C:\shared\database.vhdx'}else{(Join-Path $global:shifaaMockoutput 'run.vhdx')})}}
function Get-VMDvdDrive {param($VM) if($global:shifaaMockscenario -eq 'media'){@{Path='unexpected'}}}
function Get-VMNetworkAdapter {param($VM) if($global:shifaaMockscenario -eq 'network'){@{Name='unexpected'}}}
function Test-Path {
  param($LiteralPath,$PathType)
  if($LiteralPath -like '*machine.json'){return ($global:shifaaMockscenario -notin @('partial-creation','fresh-creation'))}
  if($LiteralPath -like '*run.vhdx'){return (-not $global:shifaaMockdiskRemoved)}
  if($LiteralPath -like '*active-verification.lock'){return ($global:shifaaMockscenario -eq 'lock')}
  return $false
}
function Get-Content {
  param($LiteralPath,[switch]$Raw)
  @{nonce=('a'*32);revision=('b'*40);image=('c'*64);vmId=$(if($global:shifaaMockscenario -eq 'vm-substitution'){'ffffffff-ffff-ffff-ffff-ffffffffffff'}else{'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'});vmPath=$global:shifaaMockoutput;diskId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}|ConvertTo-Json -Compress
}
function Stop-VM {param($VM,[switch]$TurnOff,$Confirm) $global:shifaaMockeffects.Add('stop:'+$VM.Id)}
function Remove-VM {param($VM,[switch]$Force) $global:shifaaMockeffects.Add('remove:'+$VM.Id);$global:shifaaMockremoved=$true}
function Remove-Item {param($LiteralPath,[switch]$Force) if($LiteralPath -ne (Join-Path $global:shifaaMockoutput 'run.vhdx')) {throw 'Unowned delete'};$global:shifaaMockeffects.Add('disk');$global:shifaaMockdiskRemoved=$true}
function New-VHD {param($Path,$ParentPath,[switch]$Differencing) $global:shifaaMockeffects.Add('disk-created');@{DiskIdentifier='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}}
function New-VM {
  param($Name,$Generation,$MemoryStartupBytes,$VHDPath,$Path)
  if($global:shifaaMockscenario -eq 'partial-creation'){throw 'Mocked creation failure'}
  $global:shifaaMockeffects.Add('vm-created');@{Id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';Path=$Path}
}
function Set-VM {param($VM,$Notes,$AutomaticStartAction,$AutomaticStopAction,$CheckpointType)}
function Set-VMProcessor {param($VM,$Count,$ExposeVirtualizationExtensions) if($Count -gt 4){throw 'CPU budget'}}
function Set-VMMemory {param($VM,$DynamicMemoryEnabled) if($DynamicMemoryEnabled){throw 'Memory budget'}}
function Start-VM {param($VM) $global:shifaaMockeffects.Add('vm-started')}
function Remove-VMDvdDrive {param($VM)}
function New-PSSession {throw 'No real guest session authorized'}
function Invoke-Command {throw 'No real guest command authorized'}
function Add-VMNetworkAdapter {throw 'No real network operation authorized'}
function Remove-VMNetworkAdapter {param($VM) if($null -ne $VM){throw 'No real network operation authorized'}}

$global:shifaaMockoutput='C:\mock\output\' + ('a'*32)
$global:shifaaMockrequestName='shifaa-verify-' + ('a'*32)
$base=@{nonce=('a'*32);revision=('b'*40);name=$global:shifaaMockrequestName;output=$global:shifaaMockoutput;deadline=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+3600000);vmId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';config=@{authorize='CREATE_ONE_DISPOSABLE_VM_AND_REMOVE_ONLY_ITS_VERIFIED_RESOURCES';runNonce=('a'*32);revision=('b'*40);expiresUtc=[DateTime]::UtcNow.AddHours(2).ToString('o');outputParent='C:\mock\output';credentialPath='C:\mock\credential.xml';image=@{path='C:\mock\image.vhdx';sha256=('c'*64)};auditSwitchId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';budget=@{cpus=2;memoryGiB=8;diskGiB=60;minutes=60}}}
$count=0
foreach($case in @('service','reparse','acl','image','disk','lock','unresolved','name','disk-substitution','media','network','vm-substitution')) {
  $global:shifaaMockscenario=$case;$global:shifaaMockeffects.Clear()
  $action=if($case -in @('lock','unresolved')){'Preflight'}else{'Teardown'}
  [Console]::SetIn((New-Object IO.StringReader ($base|ConvertTo-Json -Depth 8 -Compress)))
  $rejected=$false
  try {& $Provider -Action $action|Out-Null} catch {$rejected=$true}
  if(-not $rejected -or $global:shifaaMockeffects.Count -ne 0) {throw ('Unsafe negative case: '+$case)}
  $count++
}
$global:shifaaMockscenario='valid';$global:shifaaMockeffects.Clear()
[Console]::SetIn((New-Object IO.StringReader ($base|ConvertTo-Json -Depth 8 -Compress)))
& $Provider -Action Teardown|Out-Null
if(($global:shifaaMockeffects -join ',') -ne 'stop:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,remove:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,disk'){throw 'Exact identity teardown mismatch'}
$count++
# Actual filesystem use here is restricted to a NEW metadata-only fixture. All
# VM/VHD/network commands above are mocks; no resource or database is created.
foreach($creationCase in @('partial-creation','fresh-creation')) {
  $global:shifaaMockscenario=$creationCase;$global:shifaaMockeffects.Clear()
  $global:shifaaMockdiskRemoved=$true
  $base.config.outputParent=Join-Path ([IO.Path]::GetTempPath()) ('shifaa-verification-mock-' + [Guid]::NewGuid().ToString('N'))
  $global:shifaaMockoutput=Join-Path $base.config.outputParent ('a'*32)
  [IO.Directory]::CreateDirectory($global:shifaaMockoutput)|Out-Null
  $base.output=$global:shifaaMockoutput
  [Console]::SetIn((New-Object IO.StringReader ($base|ConvertTo-Json -Depth 8 -Compress)))
  $failed=$false
  try {& $Provider -Action Create|Out-Null} catch {$failed=$true}
  if($creationCase -eq 'partial-creation') {
    if(-not $failed -or ($global:shifaaMockeffects -join ',') -ne 'disk-created'){throw 'Partial creation must preserve exact resources'}
  } else {
    if($failed -or ($global:shifaaMockeffects -join ',') -ne 'disk-created,vm-created,vm-started'){throw 'Mock creation sequence failed'}
    $record=[IO.File]::ReadAllText((Join-Path $global:shifaaMockoutput 'machine.json'))|ConvertFrom-Json
    if($record.vmId -ne $base.vmId -or $record.nonce -ne $base.nonce){throw 'Creation identity not recorded'}
  }
  $count++
}
@{status='PASS';tests=$count;realResourceOperations=0}|ConvertTo-Json -Compress
