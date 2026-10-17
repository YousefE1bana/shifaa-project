# Safe aggregate verification, version 1

Run **`pnpm verify`**. It is the only developer-facing verification entrypoint.
The exit status is 0 PASS, 1 FAIL or 2 BLOCKED. A required check is never counted
as successful because it was skipped, unavailable or passed in an earlier run.

## Why full-machine isolation

The old chain has 42 required steps. Protected runners transitively use fixed
PostgreSQL names and ports, `docker compose down -v`, native Supabase resets,
restore databases, fixture mutations and tracked evidence output. Separate
worktrees, ports and Compose project variables cannot contain those hardcoded
callers. This backend uses a **new Windows Hyper-V VM and differencing VHDX for
each run**, not the developer Docker engine. Other equally strong backends are
not implemented; unsupported hosts BLOCK before mutation.

The VM is not a new clinical or lifecycle authority. It is a containment boundary
for unchanged legacy tests. P0 guards and the merged trusted launcher remain
mandatory for Discovery/SOS, Family and Privacy inside that boundary.

## One command and one bounded authorization

Set `SHIFAA_VERIFY_CONFIG` to a private JSON file. This is execution intent, not
resource ownership evidence. Supply schema `SHIFAA-VERIFY/1`, backend
`hyperv-windows`, `runNonce: GENERATE_FRESH_IN_PROCESS`, exact committed worktree
and revision, attributable `approvedBy`, expiry within 24 hours, and authorization
`CREATE_ONE_DISPOSABLE_VM_AND_REMOVE_ONLY_ITS_VERIFIED_RESOURCES`.

Provide `image.path` / `image.sha256`, `image.provenancePath` /
`image.provenanceSha256`, `credentialPath` (Windows DPAPI-protected
PSCredential CLIXML for the appliance), `outputParent`, an existing explicit
`auditSwitchId`, and `postgres.reference` (approved installed repo@sha256) plus
`postgres.image` (immutable image configuration digest). Never commit this file,
credentials or appliance. Parent directories must already be canonical and
private to the current Windows SID and SYSTEM. No installer or cloud provisioning
runs automatically.

`outputParent` must be exactly `<current Windows home>\SHIFAA-verification-private`.
This single private coordination root prevents two configurations for the same
Windows identity from bypassing the exclusive run lock using different parents.
It must be provisioned privately before the first run; existing permissions are
never rewritten by admission.

The independently reviewed private provenance manifest must use
`SHIFAA-VERIFY-IMAGE/1`, bind the complete VHDX SHA-256, name the reviewer and
review date, record HTTPS upstream sources with their SHA-256 and purpose, and
declare `APPROVED_CLEAN_SYNTHETIC_APPLIANCE`. It pins Node 24.18.0, pnpm 11.13.0,
Supabase 2.113.0 and PowerShell 5.1/7. A matching name or an unsigned downloaded
image is insufficient. This task has not supplied or approved an appliance.

`budget` requires integer `cpus` 2–4, `memoryGiB` 8–16, `diskGiB` 40–120 and
`minutes` 10–180. Only one allocation is permitted: an exclusive lock, consumed
authorization hash and unresolved-VM inventory prevent retries from accumulating
resources. A new authorization is needed for another invocation, not each test.
The grant covers only fresh resources of that run and exact identity teardown.
It never permits deleting an existing project, shared volume or unknown resource.
Legacy per-feature scripts remain implementation details and can still be unsafe
when invoked directly. This change does not authorize their direct execution.

## Appliance prerequisites for the first real run

An appropriately licensed, separately approved clean Windows VHDX must already
exist, with a private empty `C:\SHIFAA` directory, PowerShell Direct, Windows
PowerShell 5.1 and PowerShell 7, Node 24.18.0, pnpm 11.13.0, Git, the pinned native
Supabase CLI and Docker Desktop Linux engine with nested virtualization support.
Provision an offline dependency cache and all required approved image layers,
including the legacy local PostGIS build and Supabase images. The full image hash
binds those provisioned contents; their upstream provenance must be reviewed
before approving that image. No arbitrary image download is accepted by the P0
launcher. The guest must contain no containers, volumes, PostgreSQL processes,
credentials for other systems or prior project data. The host needs sufficient
CPU/RAM/storage, Hyper-V privileges and a private output destination.

Only a literal pnpm advisory audit runs with a temporary network adapter. Its
working directory contains lock/workspace metadata and a minimal package; it
contains no repository scripts, pnpmfile or user npm configuration. That adapter
is removed before any test or repository command. All database/restore/Supabase
execution then occurs with **zero VM NICs**, no shared host directory or Docker
socket, and no host environment forwarded. PowerShell Direct transports a Git
bundle of committed source only. Ignored/private worktree evidence is excluded.

The dependency step still requires peers, fresh registry advisory results and
Expo dependency checks. No network/cache availability is assumed to be a PASS.
If offline installation, build assets, images or any required runner cannot work
inside the appliance, the run fails/blocks and remains unaccepted. This code-only
review does not establish appliance availability or real integration acceptance.

## Execution and coverage

1. Read-only configuration, canonical path, ACL, image SHA-256, revision, clean
   source, free-space, Hyper-V and unresolved-run admission.
2. Reserve one authorization and lock. Exclusively create private output and a
   committed-source Git bundle. Create one VM/disk with CPU/RAM/disk/time bounds.
3. Verify the fresh guest and local engine before bootstrap, install offline,
   perform the advisory-only phase and remove every guest NIC.
4. Revalidate actual machine UUID, source revision, clean tree and engine endpoint.
   Run the three suites serially. Each uses the existing WeakMap handoff, fresh
   DB/container/network/volume and run-owned SQL restrictions. Identity-checked
   suite teardown occurs before the next suite. A suite is capped at 32 leases;
   aggregate disk/RAM/CPU remain bounded by the VM.
5. Execute every other original step serially. The former Discovery E2E step is
   the identical suite through the trusted launcher; Family/Privacy are additional
   required checks. Preserve negatives, independent-session races and F011 P4/P5.
6. Require all 44 result IDs exactly once and exit code zero. Verify VM/disk identity
   again before teardown. Only then emit PASS and release this run's lock.

The exact old/new graph, package scripts, Turbo tasks and conservative executable
closure are in `../governance/safe-verification-v1/execution-graph.json`.
Dynamic imports/globs are over-approximated, never treated as proven harmless.

## Failures and retention

An allocation failure, timeout, ownership change or failed test preserves the
run journal and prevents another allocation. Unknown resources are not adopted
or removed by name. An independently verified exact VM can be powered off on a
guest timeout; its disk remains. An interrupted host may leave a running VM and
lock: operator review is required, never blanket prune or automatic stale-lock
removal. CPU/RAM/disk caps remain, but host termination is not a proven wall-clock
watchdog. Do not treat this as verified unattended recovery.

Raw logs, generated evidence and synthetic data remain private. The public final
report contains only allowed check IDs/statuses/exit codes. Historical source and
approved evidence on the host are never rewritten. Guest-generated evidence is a
new run, not a replacement for historical acceptance or clinical approval.

This change does not authorize a real resource run, human bilingual acceptance,
clinical use, F012 lifecycle initiation or Issue #493 closure. Follow the task's
attributable static/mock-only publication disposition; it is not a standing waiver
of the repository integration policy. Existing CI jobs are not the full aggregate.
