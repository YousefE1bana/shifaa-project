# Safe verification entrypoint: implementation review

Baseline: `7e9405452e6945b56ccc496ea64170be9dbc0b15`, including human-merged
PR #498 and PR #499. Preparation and publication are authorized by the Product
Owner's “Make pnpm verify the Single Safe Verification Command” instruction.
No real-resource execution is authorized by this change or its mocked results.

## Old and new execution graphs

Previously, `package.json:scripts.verify` was a 42-command shell chain. It mixed
read-only checks with fixed-project Compose reset, PostgreSQL fixture mutation,
Supabase lifecycle, physical runners, restore/performance tests and retained
evidence writes directly on the developer machine. Its complete literal text and
ordered check IDs are preserved in [plan.json](plan.json). Package scripts, Turbo
tasks, dependencies, executable imports and line-numbered resource-risk matches
are recorded in [execution-graph.json](execution-graph.json).

The graph inventories 18 package manifests and 975 executable/configuration/SQL
nodes. It deliberately over-approximates dynamic reachability. Regex risk matches
are investigation locators, not proof that an operation is harmless or reachable.
The lockfile binds third-party dependencies; this is not a source audit of every
installed dependency. Full-machine containment covers unresolved dynamic edges.

New flow:

```text
pnpm verify
  read-only admission: exact clean committed source, historical/current authority,
    private configuration/output, immutable image/provenance, host capability,
    explicit one-run authorization, budgets and unresolved-resource inventory
  exclusive authorization consumption and one fixed per-user coordination lock
  committed-source bundle -> fresh bounded Windows VM/differencing disk
  fresh guest/engine admission -> offline dependency setup
  literal advisory audit in metadata-only directory -> remove all guest NICs
  guarded Discovery/SOS + Family + Privacy with in-process launcher capabilities
  every remaining original verification step serially inside the offline guest
  exact required-result accounting -> identity-verified VM/disk teardown
  one PASS / FAIL / BLOCKED report
```

All original 42 command predicates remain represented. Discovery E2E uses the
same scenarios through the trusted launcher; Family and Privacy add two required
result IDs, for 44 total. Dependency verification retains peer, registry advisory
and Expo checks; no cached/stale advisory is accepted. No omitted or duplicate ID,
SKIP status, nonzero exit, incomplete run or failed teardown can yield aggregate
PASS. Nested legacy assertions remain unchanged; real execution is still needed
to establish their runtime results.

## Why this boundary

Environment-only retargeting cannot contain protected hardcoded legacy callers.
Examples include `db:reset` using Compose teardown with volumes; native Supabase
project/container names and port 54322; F008/F009 restore runners dropping fixed
databases; and F010/F011 physical runners writing tracked evidence. Rewriting all
those accepted scripts would require a much larger compatibility change.

The selected backend therefore confines legacy names, ports, resets, volumes and
evidence to a fresh machine. It never forwards the host Docker socket, source
directory, credentials or environment into legacy tests. The host's existing
PostgreSQL, Supabase, development/audit volumes and private evidence are not
fallbacks. Missing prerequisites produce BLOCKED before allocation.

Hyper-V is this implementation's supported backend, not a retroactive governance
requirement. Other hosts deliberately BLOCK. This is more infrastructure than a
container-only wrapper, but contains the actual unmodified transitive callers.
No appliance has been created or validated during this task.

## Authorization, limits and failure safety

One explicit private run configuration authorizes one nonce, committed revision,
immutable appliance and bounded create/remove lifecycle. It expires within 24
hours and must cover execution plus teardown. Consumption is durable. The fixed
private coordination root prevents same-user alternate-output lock bypass.
Preflight rejects unresolved verification machines, existing output and locks.

Budgets: 2–4 vCPU, 8–16 GiB RAM, 40–120 GiB virtual disk, 10–180 minutes; legacy
steps execute serially with Turbo concurrency one. Guarded suites are serialized
and capped at 32 resource leases each, checked before creation. Successful suite
teardown precedes the next suite. Overall machine budgets bound nested resources.

Creation and teardown validate actual VM ID, notes, storage, disk identifier and
parent, network/media absence and CPU/RAM configuration. Unknown or partial state
is retained with the run lock; no blanket prune, stale-lock adoption or cleanup
by a matching name is allowed. The successful path removes only the verified VM
and differencing disk, preserving private reports and the consumed authorization.

The host deadline can stop only the identity-verified new VM. Host termination is
not a proven independent watchdog: an interrupted host can leave its bounded VM
running and locked for operator review. This limitation is explicit; no automatic
recovery or real teardown acceptance is claimed. Raw guest logs remain private;
the final public report exposes only permitted result IDs, statuses and exit codes.

## Historical compatibility

Changing the root verify script changes a whole-file P4/P5 input. The existing
shared `tooling-history.mjs` mechanism projects the exact original package only
for historical evidence comparison. It independently checks the complete new
package bytes, complete old bytes, lengths and JSON equality allowing only the
verify-script replacement. Arbitrary package edits still fail. No old ledger,
approval, physical evidence, Catalog/Data-RLS appendix or clinical input changes.
The read-only F011 verifier and all 32 two-input negative cases passed.

## Verification and first real run

See [validation.json](validation.json) for actual commands, exit codes, log
identities, preservation results and deliberately unexecuted checks. Read
[the operator guide](../../testing/SHIFAA-Safe-Verification.md) for the one-command
configuration and first-run prerequisites. Ordinary CI remains a separate set of
checks; it does not execute this Windows aggregate or enforce the new mock suite.

The first real run still needs a separately approved, clean, hash/provenance-bound
Windows appliance, private output/credential provisioning, Hyper-V/nested Docker
support, offline dependencies/images, explicit audit switch and bounded run grant.
Missing assets or failed guest checks remain failures/blockers, never skips.

The Product Owner explicitly authorized static/mock-only verification and scoped
PR publication for this task, while prohibiting actual local resource lifecycle
and the old destructive aggregate. Record that task-specific disposition in the
commit/PR. No standing verification waiver is adopted. No UI behavior changed;
human bilingual/device acceptance was not performed or claimed.

F012 remains PRE_SPECIFY_BLOCKED; Issue #493 stays OPEN. No SpecKit stage,
professional/clinical approval, actual prescription-safety result, production
permission, prior-state recovery or historical acceptance is established.
