# Verification safety correction (PR #500)

`pnpm verify` remains the only aggregate command. Exit codes: 0 PASS, 1 FAIL,
2 BLOCKED. It currently returns **BLOCKED before executing any check or creating
resources**. This is incomplete implementation, not full integration acceptance.

The rejected Hyper-V backend, VM appliance/provenance, guest credentials,
PowerShell Direct, offline guest provisioning and per-run authorization JSON have
been removed. No replacement virtualization platform was added.

## Required coverage

The immutable old 42-command chain and Family/Privacy remain 44 distinct required
result identities in `docs/governance/safe-verification-v1/plan.json`. Neither
missing/duplicate results nor SKIP, BLOCKED, nonzero exit or uncertain teardown
can yield PASS. A successful mocked dispatch is only algorithm evidence.

The aggregate never invokes the old chain through a shell. Its admission table
in `tools/verification-host.mjs` identifies unported operations and checks their
actual unsafe source locations. Environment variables, project-name overrides,
ports and container names are not substitutes for run-owned capabilities.

## Implemented launcher corrections

The existing trusted launcher has an opt-in sequential profile: two CPUs, 1 GiB
RAM, no additional swap, 128 PIDs, 64 MiB shared memory and bounded container logs.
Actual Docker HostConfig is checked before startup, connection and teardown.
Every harness must close its tracked owner/API/worker/provider handles and
release its genuine capability before the next lease may be created. Unreleased
or substituted resources block and remain preserved. No cleanup by name pattern,
Compose down, prune or old-run adoption exists in the launcher.

The aggregate SQL bootstrap option binds the original 27 migration paths and
selected original schema/RLS SQL tests to Git bytes. Tests run before owner
privilege demotion; application clients cannot inherit that bootstrap privilege.
This is prepared code with mocked validation, not real migration/test evidence.

**Storage limitation:** the accepted guard admits plain local named volumes,
with empty driver options. Container CPU/RAM/log limits do not impose a hard
PostgreSQL data-volume quota. A disk-space observation is not a storage quota.
No complete aggregate resource admission is claimed.

## Concrete remaining blocker

The PostgreSQL-only launcher does not supply isolated native Supabase Auth and
Storage. The F007 native runner still stops/resets a fixed project. F008/F009
physical/restore/performance runners and F010/F011 two-runtime composition still
contain fixed shared targets and retained evidence paths. These runners have not
yet been ported to verified run-owned execution and private output. Direct legacy
commands remain unsafe and must not be run on the developer machine.

The smallest remaining repair is to port those existing resource operations to
identity-checked run-owned targets, including an isolated native Supabase test
context where coverage requires it, and solve the volume budget. Replacing native
coverage with plain PostgreSQL, silently omitting checks, or marking them PASS is
not acceptable. The aggregate blocks the **whole** graph before any side effect
until those paths are implemented. No first real aggregate run is ready yet.

## Real-run boundary

No real Docker/PostgreSQL/Supabase lifecycle, restore/performance/E2E or destructive
aggregate was executed during this correction. A later bounded real-run approval
must identify the installed immutable images, verified disposable engine/project,
private output root, resource/storage budgets and exact identity-checked cleanup.
That run must verify actual native and PostgreSQL execution; mocked results and
GitHub CI do not establish local integration acceptance.

F012 remains PRE_SPECIFY_BLOCKED. Issue #493 stays open. Clinical, legal,
professional, privacy and production authority is unchanged.
