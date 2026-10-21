# Repository maintenance — 2026-10-21

Engineering maintenance authorized by Product Owner Yousef Osama. Baseline:
`b53f5d3e5988f7eff4f3431cc4ad0a574e75198b`, the human squash merge of
[PR #501](https://github.com/YousefE1bana/shifaa-project/pull/501).
This record does not start F012 or close Issue #493 or professional approval gates.

## Corrections

- The F010 clinic encounter browser fixture assigned the same note UUID to every
  distinct signing operation. The production UI correctly uses immutable note IDs
  as React keys. The fixture now assigns distinct deterministic IDs while its
  existing idempotency map retains the same ID on replay. Regression assertions
  cover the three committed notes (including commits whose responses were lost),
  different IDs and React key diagnostics. Restoring the old ID produces RED;
  corrected fixture produces GREEN. No production rendering workaround was added.
- Parallel Turbo package tests let each Vitest instance use the host's 16 CPUs.
  The fresh run timed out six API tests and one contract test at the existing
  timeout. The six API files passed with two workers. The complete fresh unit run
  then passed all 21 Turbo tasks with two Vitest workers per package. Assertions,
  timeouts, runtime test opt-ins and performance concurrency remain unchanged.
- Turbo's ordinary tests emit no coverage directory. Their outputs declaration is
  now empty, removing false missing-output warnings; test execution remains cached
  under the existing rules. Explicit fresh runs use `turbo run test --force`.
- Python checker bytecode is ignored; confirmed regenerable local `.pyc` files
  were removed. Application features, database migrations, API contracts and
  authorization policies were not refactored without a demonstrated defect.
- [The existing verification guide](SHIFAA-Safe-Verification.md) now documents
  durable native PowerShell execution logs, exact exit receipts and generated
  evidence preservation. No aggregate launcher was introduced.
- The separately callable Family E2E still queried pre-F008 audit columns
  `action`/`metadata`. Its real initial execution failed with PostgreSQL 42703
  (2 PASS, 1 FAIL). It now reads canonical `action_code` and the full structured
  audit row, retaining the prohibited-content assertion and adding exact
  actor/patient/relationship/version/outcome assertions. The same real suite then
  passed 3/3. No application, migration, audit writer or security policy changed.

## Dependency review

The private before/after audit and registry snapshots are retained below. Applied
updates preserve the existing major-version combinations:

| Component                     | Baseline                                 | Maintenance     | Decision                                                                                                                    |
| ----------------------------- | ---------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node LTS                      | 24.18.0                                  | 24.22.1         | Current security release; runtime, engine, CI and current scope guards agree. Historical runtime receipts remain unchanged. |
| pnpm                          | 11.13.0                                  | 11.13.0         | Keep current package-manager pin.                                                                                           |
| Next, five staff apps         | 16.3.0                                   | 16.3.8          | Security patches within current release line.                                                                               |
| Fastify                       | 5.11.3                                   | 5.12.7          | Compatible security update.                                                                                                 |
| Vitest                        | 4.1.0                                    | 4.1.11          | Security patch; compatible Vite 7 constrained to patched 7.3.7.                                                             |
| tsx / yaml                    | 4.21.0 / 2.8.2                           | 4.23.15 / 2.8.3 | Compatible security fixes.                                                                                                  |
| Expo font                     | 57.0.1                                   | 57.0.4          | Satisfy updated Expo router-server peer within SDK 57.                                                                      |
| Expo / React Native           | 57.0.15 / 0.86.2                         | Retained        | SDK 58/RN 0.88 is a coordinated native migration, requiring native/device work separately.                                  |
| React                         | staff 19.2.8; patient 19.2.3             | Retained        | Preserve existing Expo native compatibility; do not independently maximize React versions.                                  |
| TypeScript                    | staff 7.0.2; patient 6.0.3               | Retained        | Patient compiler migration is separate from security patches.                                                               |
| Supabase CLI / JS             | 2.113.0 / 2.112.2                        | Retained        | Native bootstrap and both-runtime proof bindings require compatibility validation before CLI/runtime upgrades.              |
| PostgreSQL / PostGIS          | standalone 17.11 / 3.5; Supabase PG 17.6 | Retained        | Major database/image changes need extension, migration, forced-RLS and restore validation; no speculative in-place upgrade. |
| Playwright / Turbo / Prettier | 1.63.0 / 2.10.9 / 3.6.2                  | Retained        | Available newer versions do not alone justify browser-baseline/cache/format churn.                                          |
| Python AI service             | README placeholder                       | Retained        | No implemented Python AI service/dependency environment to upgrade. Repository Python tooling remains separate.             |

Full audit fell from **73 advisories (4 critical, 46 high, 21 moderate, 2 low)**
to **4 (0 critical, 2 high, 2 moderate)**. This is not a zero-vulnerability claim.
F011's physical proofs bind the complete contracts/API-client manifests, including
development dependencies. Those two manifests retain their original bytes;
explicit workspace overrides resolve their declared Vitest 4.1.0 to 4.1.11
and YAML 2.8.1 to 2.8.3.
The installed graph uses the patched version without rewriting sealed proofs.
The existing historical reader binds only the exact new root manifest/CI bytes
to their original Git blobs. Regression tests compare the full manifest/workflow
after normalizing the enumerated version pins and reject further source drift.
Current scope validation reads the actual runtime/engine declarations; the K01
fixture therefore copies the current package manifest rather than its historical
projection. All 28 focused tooling tests pass on Node 24.22.1. This compatibility
preserves historical acceptance and does not claim a new physical execution.
Remaining upstream debt:

- `node-forge@1.4.0` and `braces@3.0.3`: registry did not publish the advertised
  patched versions 1.4.1 and 3.0.4 at review time. Track upstream publication;
  keep untrusted signing inputs and glob patterns outside local development tooling.
- `uuid@7.0.3` under Xcode tooling: observed caller uses `v4`; advisory concerns
  buffer bounds in v3/v5/v6. Prefer upstream Xcode dependency migration over an
  unneeded forced major override. This does not assert all transitive uses safe.
- `decode-uri-component@0.2.2`: patched available 0.5.0 changes CommonJS to ESM.
  Upgrade the Expo/query-string chain with caller/bundler validation separately.

The existing `dependencies:check` passes, including peers and Expo's bundled-module
map, under its unchanged `--ignore-unfixable` policy. It is not equivalent to a
clean unrestricted audit. No advisory IDs were added to the ignore list.

Primary references: [Node security release](https://nodejs.org/en/blog/release/v24.22.1),
[Next advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36),
[Fastify advisory](https://github.com/fastify/fastify/security/advisories/GHSA-667r-xxjv-c9mm),
[Vitest advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9),
[Expo SDK 57](https://expo.dev/sdk/57),
[PostgreSQL version policy](https://www.postgresql.org/support/versioning/),
[Supabase self-hosting](https://supabase.com/docs/guides/self-hosting).

## Docker cleanup and preservation

Verified engine: `desktop-linux`, ID `1220f62f-f089-4002-a41a-0023a424719d`.
Initial inventory: 18 containers, 35 images, 13 volumes, 7 networks, 21 cache records.
After cleanup, before acceptance: 17 containers, 24 images, 7 volumes, 7 networks,
18 cache records. Docker accounting changed from 25.83 to 18.09 GB images,
1.184 GB to 535.7 MB volumes, and 1.274 GB to 711.6 MB cache: approximately
8.95 GB removed from Docker accounting. This does not claim Windows VHD compaction
or that shared layers' displayed image sizes can simply be added.

Removed the stopped `shifaa-audit-round1-20261016` container after exact ID, labels,
mount and stopped-state checks. Removed these inactive volumes only after TAR
backup, per-file SHA-256 and full extraction/re-read verification:

- `shifaa-audit-round1-20261016-data`
- `shifaa-local_shifaa-postgres-data`
- `supabase_db_shifaa-runtime-002`
- `supabase_storage_shifaa-runtime-002`
- `supabase_edge_runtime_shifaa-local-supabase` (unmounted runtime cache)
- `supabase_edge_runtime_shifaa-runtime-002`

Removed eleven unused superseded official Supabase image tags (storage, Auth,
Postgres, Studio, analytics, Edge, metadata, Vector, PostgREST, mail and image
proxy). Private receipts retain their exact IDs and upstream digests for re-pull.
Three obsolete PostGIS build-cache records were pruned by anchored exact-ID
filters; all other cache records remain. No blanket prune was used.

Backups preserve physical volume bytes/metadata, with every regular file recovered
and checked. PostgreSQL boot/logical recovery was not tested and is not claimed.
Keep original archive metadata and the matching PostgreSQL image when recovering.
All five Moodle containers/configurations/mounts and unrelated volumes/networks
remain unchanged. The unlabelled `supabase_edge_runtime_sv-4a432c5a0b24d45d25081e3321cbf71c-sb`
volume also has a verified backup but remains in place: provenance is unresolved.
The anonymous unrelated volume and digest-pinned PostGIS base image remain.

Local Supabase publishes ports on all host interfaces under the current CLI.
Standalone PostgreSQL is loopback-only. No firewall/global Docker changes were
made. Keep Supabase restricted to a trusted development host; a supported local
binding/firewall hardening change needs its own connectivity proof. The optional
Edge container was initially observed exited 137 with `OOMKilled=false`; the logs
show a normal serving banner, not a proven application fault. Following the
ordinary CLI reset/start during acceptance it is running with `OOMKilled=false`.
All 12 required SHIFAA containers are running; all configured health checks are
healthy. Edge and PostgREST have no configured health check.

Final inventory after acceptance and supplemental tests: **17 containers,
24 images, 8 volumes, 7 networks, 18 build-cache records**. The eighth volume is
the required Edge cache recreated by the CLI on 2026-10-21 at 15:40:43Z; its
older unmounted predecessor was backed up before removal. Final volumes account
for 993.6 MB after fresh database/test state. The 8.95 GB figure above describes
the cleanup checkpoint, not this later database growth or physical disk space.
Standalone PostgreSQL contains only `postgres`/`shifaa`; native Supabase contains
only `_supabase`/`postgres`. No disposable scratch database remains. Normal local
development infrastructure intentionally remains available. The authorized
synthetic SHIFAA development databases were reset; they are not claimed unchanged.

## Evidence, worktrees and historical verification

Private retained root: `D:\ECU\GP-STUFF\SHIFAA-Maintenance-20261021`.
`initial-dirty-files.json` indexes 96 preserved post-merge generated changes,
23,819,599 bytes, with original paths, sizes and SHA-256. All copies were re-read
before restoring known generated outputs. Feature-specific additive indices live
in F006, F007, F008 and F011 `evidence/maintenance-2026-10-21-retention.json`.
F011's index also links 486 composition diagnostics/attempt files and the unchanged
K06 reproduction input. Historical failures are retained, not replaced by new PASS.

The private maintenance folder inherited broad local read/modify access. Its DACL
was restricted to the current owner, SYSTEM and local Administrators; a recursive
check rejects other principals and reparse points. Raw Docker configuration stays
private. This changes only the maintenance retention directory, not global ACLs.

Four old F001 `.qa/clean-*` clones retain their source, Git repositories, private
configuration and captures. Only their ignored, regenerable `node_modules` trees
were removed after dependency/reference/process checks and source/configuration
hash verification. Removed regular files total 3,160,556,778 logical bytes;
hard links and concurrent builds prevent a physical-reclaimed-space claim.
The [F001 retention index](../../specs/001-identity-onboarding/evidence/maintenance-2026-10-21-retention.json)
records all four commits and recovery inputs. No worktree or branch was deleted.
Another 111 setup QA files (1,871,723 bytes, including 17 PNGs) were copied and
re-read in `retained-setup-qa`; originals remain. F011's additive acceptance index
records their historical/reproduction classification and incomplete attribution.
The missing setup HTML referenced by historical F011 evidence was not recovered
or reconstructed; the accepted preservation-loss disposition remains unchanged.

There is **no complete saved post-merge aggregate console log** for b53f5d3.
The Product Owner reports exit 0 and a partial 8,849-line transcript; the partial
transcript has not been supplied. Shell history, retained child logs, generated
outputs and successful main CI are corroborating evidence, not a reconstructed
complete aggregate log. No run was repeated merely to fill this historical gap.

Worktree inventory includes tracked dirt, untracked files and relevant ignored
feature/artifact/context files, using per-command long-path support. Dirty and
evidence-bearing worktrees are preserved. Their finalization is BLOCKED pending
content reconciliation and verification of required indices in merged main;
a whole-worktree archive alone would not satisfy the Finalization Gate. Clean
checkout status alone is not grounds to delete a feature worktree.

The optional documentation CURRENT checker exits 1 with 15 findings: 12 older
hash/size/history bindings for four verifier sources, plus three F011 whole-tree
count/path/tree findings. The four sources had already changed in merged PRs
#500/#501; this maintenance also changes the two current scope guards for the
Node security pin. Additive maintenance indices change the F011 tree while its
historical original files remain intact. The frozen ledger is preserved. A
reviewed correction must distinguish current tooling/evidence successors from
immutable historical originals. This candidate checker is outside the original
42 commands and current CI; its failure is explicitly outstanding. This work
does not activate proposed change-class policy or relax historical assertions.

## Validation and remaining integration gate

The real original aggregate **passed all 42 commands with process exit 0** on
`750dabf4abfa78841d3ea7ce05579243264a3a54`, using Node 24.22.1 and pnpm 11.13.0.
Execution ran from 2026-10-21 15:35:33.766Z to 16:35:47.048Z, taking
**3613.2501411 seconds (60m13s)**. Exact command: `pnpm verify`, directly from
native PowerShell 7.6.5. `TURBO_FORCE=true` forced fresh execution: lint 16/16,
types 16/16, build 12/12 and unit 21/21 tasks, all four summaries **0 cached**.
The root verify chain and literal `docker compose down -v` reset are byte-identical
to baseline b53f5d3. Family/Privacy E2E remain separate; there is no 44-check claim.

The complete log and receipt live in private `acceptance-750dabf/`:

- `pnpm-verify.log` SHA-256:
  `ffeda2d9467bf4fe20a7c88de333d120d7f5b42910ad2b4f2712e69fb78715c2`.
- `execution.json`: exact source, command, times, duration, runtime and process exit.
- `aggregate-review.json`: all 42 individual commands, skip and cache analysis.
- `diagnostic-disposition.json`: reviewed expected errors, notices and limitations.
- `generated-files.json`: 122 generated files, 23,892,194 bytes, retained/re-read.
- `child-evidence.json`: 588 files, 86,178,692 bytes. This snapshot includes older
  attempts and historical failures; it is not 588 newly executed results.
- `integrity-and-generated-cleanup.json`: 92 tracked generated files selectively
  restored, 30 new generated files removed after retention, and all 5,656 pre-run
  tracked files re-read with matching hashes. The K06 input hash is unchanged.
- `docker-final-inventory.json`: exact engine/container identity, health, database
  catalogs, unrelated-resource preservation and remaining required infrastructure.

Current feature-specific acceptance indices in F006/F007/F008/F011 link these
private manifests and hashes; F010 owns its fixture regression index. Approved
historical outputs were preserved byte-for-byte. `pnpm-workspace.yaml`'s ordinary
package-manager normalization (`auditConfig: {}` to `ignoreGhsas: null`) was saved
then restored. Intentional dependency/CI YAML changes remain explicitly in Git.

Discovery/SOS achieved **10/10 real E2E PASS** during this aggregate. Its unchanged
performance workload measured read p95 254.21/400 ms, mutation 440.13/800 ms,
reported matching 440.13/2000 ms and worker claim 39.91/800 ms. Matching remains
an alias of mutation latency, not an independent matching measurement. All
original concurrency, pool, warmup and threshold settings were preserved.

The F010 browser matrices passed patient 69/69 and clinic 33/33 selected cases;
7 patient-run and 4 clinic-run opposite-app cases remained explicit SKIP. API unit
output includes 65 conditional cases skipped; native harnesses execute their own
opt-ins. This is not a claim that every optional test ran. The two standalone
identity-continuity compatibility cases were subsequently enabled and passed
separately (2 PASS; 3 native-group cases excluded by the targeted name filter).

Two SQL `ERROR` lines are the required pre-migration F010 C08 RED in the two
runtimes: missing `clinical.book_appointment_internal_v1(jsonb,integer,jsonb)`.
The existing runner requires this precise failure plus F009 parity before running
migrated GREEN and races. Role REVOKE/absent-policy notices are defensive migration
operations. The native bootstrap wraps a historical migration containing its own
BEGIN/COMMIT, explaining three nested-transaction and three no-transaction notices.
The migration is preserved and both-runtime security/atomicity checks passed.
There were 49 color-environment warnings and **zero duplicate-key warnings**.

Separate supplemental results on 750dabf4 plus the Family test-only repair:
Family **3/3, exit 0, 1.975 s** after demonstrated RED; Privacy **4/4, exit 0,
4.289 s**; standalone identity compatibility **2/2, exit 0, 2.680 s**. F004/F005/F007
indices retain logs and exact receipts. No runtime/configuration source changed
after the aggregate. The later evidence/test-only commit has not had another
full aggregate execution; focused validation and fresh head-specific CI are
reported separately. CI must not be described as that missing exact-head run.

The Product Owner explicitly authorized publishing this maintenance branch as a
**Draft PR** to obtain fresh CI before human live acceptance. This is a one-time
publication-order exception, not an acceptance waiver. Fresh maintenance CI is
pending at publication; its exact head/run belongs in the PR and final report.

Human live Arabic/English acceptance and Yousef's squash merge remain distinct
integration requirements. Automated browser tests do not supply human acceptance.
Do not merge this branch automatically. F012 lifecycle and Issue #493 stay open.
