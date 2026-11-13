# Safe repository verification

This operational successor replaces the reset-bearing instructions restored by
PR #501. Its 42 original obligations and the retired PR #500 records remain
historical evidence; neither is rewritten or used as current execution authority.
Family/Privacy E2E remain individually available, not silently counted as extra
obligations in a 42-step comprehensive result.

`pnpm verify` runs ordinary checks in a disposable **offline Linux container**.
It does not reset databases, connect to retained services, run host package scripts,
install dependencies or silently fall back to an unsafe execution path.

## Developer commands

1. Use the repository-pinned Node/pnpm and a local Linux Docker engine. Do not use
   a remote Docker context or `DOCKER_HOST` override.
2. Run `pnpm verify:prepare` once, and again when dependency inputs change. This
   explicit operation builds a dedicated image from the digest-pinned official
   Node image, frozen lockfile, workspace manifests and patches. Only this step
   downloads dependencies, inside the build container. Install scripts are
   disabled during download; permitted rebuilds run offline. No host install,
   service restart, database or retained volume operation occurs.
3. Run **`pnpm verify`** for ordinary verification. It runs formatting, lint,
   typecheck, build, unit tests, automated accessibility, contracts, architecture
   and secret checks. A missing/stale image or unavailable Docker returns
   `BLOCKED` (exit 2), never an installation or host fallback. Check failures exit 1.
4. For comprehensive evidence, commit/publish the intended source and run
   **`pnpm verify:isolated`**. It requires clean HEAD/upstream/remote equality and
   dispatches `verification-comprehensive.yml` at that exact commit. Dispatch is
   **not PASS**; inspect all job results and the commit-bound results artifact.
   The workflow must already be integrated on main. Normal six-context PR CI
   remains mandatory and unchanged; the comprehensive workflow does not replace it.
5. Run `pnpm verify:safety` for dependency-free containment-policy fixture tests.
   Real kernel containment is additionally exercised by the safety workflow.

Ordinary output explicitly lists categories **NOT EXECUTED**: database/RLS/native
Auth, restore/destructive fixtures, integration/recovery/concurrency, browser E2E,
performance/evidence compositions and online dependency audit. Skipped tests in an
existing suite are not promoted to executed evidence. An ordinary PASS is scoped,
not comprehensive or clinical/security acceptance. Native device, physical-device,
human milestone and professional acceptance remain separate.

## Why nested commands cannot reach retained resources

The host launcher accepts no arbitrary command/profile override. It verifies a
local Linux engine, prepares a new temporary snapshot, selects an immutable image
ID matching all dependency inputs, then enters a fixed boundary:

- non-root UID/GID 1000, all capabilities dropped, no-new-privileges;
- network `none`; no published ports, host networking, devices or Docker socket;
- read-only root filesystem and **only one read-only mount**, the new snapshot;
- disposable `/work` and `/tmp` tmpfs; bounded memory/CPU/processes;
- no forwarded host database/Auth/JWT credentials, `NODE_OPTIONS` or Docker overrides.

All package scripts, imported code and their children run inside this boundary.
A future nested reset cannot access the host daemon or retained database. Safety
does not depend on recognizing the word `reset`, a regex over shell syntax, or a
developer remembering a disposable project name. Docker and its local kernel are
trusted: this is not a defense against kernel escapes, a malicious Docker daemon,
an operator changing the launcher/configuration, or overriding pnpm behavior.
Implicit pre/post scripts are disabled in workspace policy and regression-checked.

Tracked working bytes and safe new source are copied; the original checkout is
never mounted. Links/traversal and sensitive file types are rejected/excluded.
Ignored data, private/local evidence and unreviewed new captures/docs/fixtures are
not included. Omitted visible paths are reported; stage reviewed safe files
explicitly to include them. Never stage private evidence just to run a check.
An offline Git bundle contains **HEAD ancestry only** so immutable historical
readers can resolve their original committed Git blobs. It contains no local Git
configuration, hooks, credentials, unrelated branches or uncommitted private data.
Changes are tested from the snapshot, not substituted with committed source.
Post-run source hashes detect concurrent modification. Temporary snapshots/build
contexts remain in OS temp for diagnosis; they are not authoritative evidence or
automatic publications. No blanket cleanup of existing data is performed.

## Comprehensive isolation and coverage

The [42 legacy obligations](verification-v1/legacy-obligations.json) preserve the
original aggregate verbatim against integrated baseline
`97d20c290abeebdbf223703bd19d3103ac65bd3b`. All existing individual commands remain
available and unchanged. They are **not safe host entrypoints**. The full workflow
uses a new GitHub-hosted Ubuntu VM, no secrets/deployment environment, a read-only
token and no persistent host mounts. Before resource work it checks exact source
identity and absence of pre-existing containers/volumes. Its VM destruction is
the ultimate cleanup boundary, including partial failures. An env flag alone is
not proof that a local stack is disposable.

The full workflow prepares Postgres/native Auth and browser prerequisites, runs
every original obligation serially, records results after each step and continues
after individual failures. It cannot report PASS without all 42 succeeding.
Existing Windows PowerShell invocations use a small `pwsh` executable shim on the
hosted Linux VM. Platform or historical harness failures stay visible; availability
of the workflow is not a claim that the entire legacy aggregate has passed.

## Discovered destructive paths and root causes

| Path                                                     | Actual effect / risk                                               | New ordinary behavior                  |
| -------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `verify → db:reset`                                      | `docker compose down -v`, then migration into fixed project        | No host Compose invocation             |
| `verify → identity-continuity:stack → worker → db:reset` | Nested destruction, invisible from a top-level rename alone        | Entire nested execution contained      |
| `supabase:reset`, `supabase:test` and F011 bootstrap     | Native reset/migration/provisioning, fixed `shifaa-local-supabase` | Comprehensive fresh VM only            |
| F008/F009 PostgreSQL and restore harnesses               | Drop/recreate scratch DBs via shared admin on ports 5432/54322     | No host DB network or credentials      |
| F010 restore/performance/realtime/completion harnesses   | Direct Docker SQL and `DROP DATABASE`, hard-coded runtime names    | No daemon/socket or host network       |
| F011 composition/protection/restore suites               | Runtime writes plus evidence under historical feature paths        | Disposable copy only                   |
| Turbo/package tests and E2E                              | Imports/children, environment/default URLs and fixture mutations   | Contained regardless of indirect chain |
| Original CI database/Supabase jobs                       | Teardown/reset on fresh hosted runners                             | Six contexts and coverage unchanged    |

Root causes were shared-resource identities, broad inherited environment, arbitrary
host subprocess authority and conflation of ordinary and destructive verification.
Per-database random names and ownership checks in existing F011 harnesses reduce
some risk but do not isolate the shared server, native project or filesystem.

## Review and limitations

Changes to this boundary, image inputs or profiles require safety tests and review.
The safety workflow tests Windows/Linux fixtures and real nested denial on Linux.
Full comprehensive results, six CI results and scoped local results are separate
claims. F011 historical `package.json` projections remain immutable: the reader
admits only this exact tooling successor digest; unauthorized drift still fails.
No product API, RLS policy, clinical contract, F012 task or retained resource is
changed by this tooling.
