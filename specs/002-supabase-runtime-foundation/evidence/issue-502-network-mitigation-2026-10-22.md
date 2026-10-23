# Issue #502: interim Windows filtering procedure

Prepared procedure; **not applied or validated on this host**. This mitigates
network access; it does not change Docker HostIP or establish loopback publication.
The source investigation and retained receipts are indexed in the
[remediation record](issue-502-remediation-2026-10-22.md).

## Preconditions and exact boundary

Use an administrator PowerShell session under separately recorded operational
execution. Confirm Docker context `desktop-linux`, the existing SHIFAA container
IDs/project labels and the six TCP port mappings. Inspect current listeners,
process paths/signatures, connection profiles and effective Firewall policy.
Stop if another project uses any selected host port or another non-loopback
forwarder is observed. Preserve a private read-only policy/filter inventory before
execution. Do not export credentials or container environment variables.

The observed non-loopback listener is `com.docker.backend.exe`; `wslrelay.exe`
was observed on `::1` only. Recheck rather than assuming that remains true.
The proposed rule is limited to the verified Docker backend executable and TCP
54321,54322,54323,54324,54327,54329, all profiles, inbound only. Existing Docker
Allow rules and all other projects, profile defaults and global Docker settings
remain untouched. Port ownership must remain exclusive while this mitigation
exists; Firewall rules cannot match Docker project labels.

Microsoft documents explicit Block precedence over Allow rules and accepts both
IPv4/IPv6 address ranges:
[rule precedence](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules),
[New-NetFirewallRule](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).
Those semantics are a design basis, not proof of effective Windows/WSL forwarding.

## Candidate rule, validation and rollback

After the preceding identity checks, create a uniquely named project rule with
`New-NetFirewallRule`: Inbound, Block, TCP, verified executable, exact six local
ports, Profile Any, PersistentStore, EdgeTraversalPolicy Block. Remote-address
ranges are `0.0.0.0-126.255.255.255`, `128.0.0.0-255.255.255.255`, `::/128`, and
`::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff`. This excludes native 127/8 and ::1
loopback sources. IPv4-mapped IPv6 loopback is not exempted; connectivity must be
validated using the actual application URLs. Do not add a broad Allow to work
around a failed test. Record the returned rule identity and exact associated
application, address and port filters; read back ActiveStore enforcement.

Required acceptance after creation, with unchanged container identities:

1. Local authenticated development/API connectivity and all six native IPv4
   loopback TCP connections remain functional; independently check IPv6 ::1.
   Test application login/refresh and database readiness without mutating user data.
2. From an explicitly authorized separate device, attempt all six host LAN TCP
   ports over IPv4 and independently IPv6. Retain source/destination family,
   interface, time and result without credentials. An absent routed IPv6 path is
   NOT an IPv6 blocking PASS; record it as unverified.
3. Confirm unrelated Docker ports retain their previous connectivity. Re-read
   Firewall profiles/filter inventory, container starts/restarts, mount and network
   identities. Docker metadata will still show wildcard publication.

If a filter is rejected or a required local client fails, remove only the exact
new rule after comparing all recorded filters and unique identity. Do not reset
Firewall defaults or remove pre-existing rules. Retain the failure and investigate
before retrying. Revalidate after Docker/WSL updates, process-owner changes,
new port mappings, profile or policy changes. Until this procedure passes, the
host-access risk remains OPEN. Network isolation may be used operationally, but
is not claimed here as a verified Firewall correction.

## Future binding cutover (not executed)

Select a supported explicit-host publication mechanism first. A different runtime
or CLI/Docker version needs its own isolated compatibility evidence: all six
services, both families, Auth/storage/migrations, ownership and connectivity.
Do not publish the existing guard alone: it would reject today's working but
wildcard-bound stack without creating a replacement.

Before a separately authorized cutover, identify every existing container,
volume, network, image digest and project ID. Capture a consistent recoverable
backup and verify its content and restoration into independent disposable storage;
an old tar hash alone does not establish current recoverability. Retain current
credentials privately without printing them. Record a stop/start disruption window
and all dependent clients. Agree the exact old-runtime recovery commands and data
identity before stopping anything. Cutover must never use prune or delete original
volumes. On failure, stop only the identity-verified replacement and reattach the
original stack/data using the recorded original configuration; verify local
connectivity and data before resuming development. Preserve both failure evidence
and backups. No such stop/start, restore or cutover has occurred in this repair.
