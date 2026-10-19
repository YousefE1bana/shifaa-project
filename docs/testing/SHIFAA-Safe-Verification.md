# Safe repository verification (PR #500)

Run `pnpm verify`. It keeps the original 42 verification checks and adds Family
and Privacy E2E coverage, for 44 required result identities. Exit codes are
0 PASS, 1 FAIL and 2 BLOCKED. A failed check stops execution; remaining checks
are reported BLOCKED, never PASS. PASS also requires verified resource teardown.

## One-time setup and safety admission

Install the repository-pinned Node/pnpm dependencies and Docker with a Linux
engine. Build the repository PostGIS image from `infra/db/Dockerfile.postgis`
as `shifaa/postgis:17-3.5-006-local`. The run records its immutable image ID;
there is no fallback to a different image or an existing database. The local
Supabase CLI must be the package-pinned 2.113.0. Its pinned service images must
be available, or downloadable by that CLI, before native startup succeeds.

The read-only preflight checks engine/context identity, the image, CLI version,
free memory and disk, and existing resource inventory. Defaults require at least
5 GiB assigned to Docker, 3 GiB currently free host memory and 8 GiB free output
disk. Stop other workloads if necessary. An unfinished earlier verification run
blocks admission; inspect its private receipt rather than deleting by name.
No VM, appliance, guest credentials or per-run authorization JSON is required.

The command itself authorizes only creation and identity-checked disposal of
that invocation's new resources. It supplies no authority over existing resources.
The first real run of this implementation still requires the Product Owner's
bounded real-resource execution authorization.

## Execution and isolation

The existing check order is retained. Heavy suites run sequentially. One new
PostgreSQL container and one private native Supabase Auth/Storage project can
be reused and reset during the same run. Fixed SQL aliases in older scripts are
translated only after independently validating the actual owned container;
they are not external targets. API/worker/owner connections receive explicit
run-owned credentials. Missing context fails before connection or reset.

Engine, container/image IDs, creation times, network, ports, volumes, mounts and
pre-creation inventory are checked. Published database ports are loopback-only
and exclude 5432, 54322 and 55432. Existing projects/volumes, host networking,
unexpected mounts and substituted identities are rejected. Native reset may
replace its own database container/data volume; the replacement is checked and
the private ownership receipt is updated before further use.

Discovery/SOS, Family and Privacy use the merged trusted launcher and genuine
in-process capabilities. Direct E2E commands still reject missing capabilities.
No environment variable or JSON token substitutes for those capabilities.

PostgreSQL has a 2 CPU/1 GiB limit; native database 1 CPU/1 GiB and native
satellites 1 CPU/256 MiB each. Native CLI-created containers receive limits after
creation, so startup has a transient uncapped interval. Logs are bounded. Named
data volumes have no hard disk quota; free-space admission is not a quota.

## Outputs, failures and teardown

Ordinary fixtures, generated files, source and test reports retain their original
legitimate write behavior. Only genuinely protected historical evidence is
immutable. Fresh F011 execution reports use a private run directory rather than
overwriting accepted historical reports. Private receipts contain sensitive
connection material and must never be published.

Teardown checks exact newly created identities and attachment ownership before
removing containers, volumes and networks. There is no blanket Compose down,
prune, pattern-based deletion or adoption of older resources. Partial startup,
ownership loss or uncertain cleanup preserves resources and returns BLOCKED.
Inspect the private receipt; do not guess which resources can be deleted.

## Historical verification and acceptance limits

The versioned [historical input binding](../governance/safe-verification-v1/historical-inputs.json)
checks exact current operational sources independently and projects only their
approved historical bytes for old F011 evidence comparisons. P4/P5 evidence,
other normative/generated/physical inputs, and existing successor negatives stay
mandatory. No historical acceptance is regenerated.

Implementation validation uses static and mocked boundaries. No real local
Docker/PostgreSQL/Supabase lifecycle, aggregate run, restore, performance or E2E
acceptance is claimed. GitHub CI results cover only the jobs actually executed;
they are not the entire aggregate. First real acceptance must execute all 44
checks, inspect native and PostgreSQL identity/cleanup evidence, and record failures.
F012 remains PRE_SPECIFY_BLOCKED, Issue #493 OPEN, and clinical/legal/production
gates are unchanged.
