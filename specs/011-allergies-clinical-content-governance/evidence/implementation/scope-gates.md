# C01 readiness evidence — C01_ACCEPTED

Date: 2026-10-06 (Africa/Cairo). Authorization: Product Owner TASKS_APPROVED, implementation of C01 only, and subsequent CLI restoration/readiness resumption, from the current conversation. Acceptance is limited to C01 tooling/baseline readiness and the pending evidence-bundle definition. No application implementation or later checkpoint is authorized.

Branch: `codex/011-allergies-clinical-content-governance`.
HEAD: `670b1e0fe15c719b98179805f2628d1b478a55dd`.
Worktree: `D:/ECU/Gradution-Project/.worktrees/011-allergies-clinical-content-governance`.

## Initial stop condition and root cause

The approved [Plan, technical context](../../plan.md) specifies Supabase CLI **2.113.0**. The earlier bare `supabase --version` reported **2.107.0**, selecting the global `C:/Users/Yousef/AppData/Roaming/npm/supabase.ps1`. Its global package is 2.107.0, and its CMD wrapper invokes that global package's `dist/supabase.js`. This was a global PATH result, not evidence of a 2.107.0 project pin or a measured `pnpm exec` result.

The worktree had an ordinary node_modules directory (not a shared-directory junction), but its dependencies were incomplete: the earlier C01 inspection found no local Supabase binary, YAML package or Prettier shim. The canonical parent checkout has its own Supabase 2.113.0 package; the observed 2.107.0 came from the global npm package. The first requested `pnpm exec` diagnostic automatically restored missing local dependency links before returning a version. Consequently, a direct pre-restoration local package version was not captured and no claim is made that `pnpm exec` returned 2.107.0.

## Diagnosis and remediation

| Requested check | Result |
| --- | --- |
| package.json declaration | devDependencies.supabase = **2.113.0** |
| pnpm-lock.yaml root importer | specifier **2.113.0**, resolved version **2.113.0**; package/snapshot entries also 2.113.0 |
| `corepack pnpm why supabase` | supabase@2.113.0 → shifaa@0.1.0 devDependencies; one version |
| First `corepack pnpm exec supabase --version` | pnpm automatically restored 673 dependency links/packages using the up-to-date lockfile; supply-chain policy verification passed; returned **2.113.0** |
| Explicit reproducible restoration | `corepack pnpm install --frozen-lockfile`: exit 0, all 18 workspace projects, Already up to date; no dependency updates or lockfile rewrite |
| Installed local package | **2.113.0**, real path `node_modules/.pnpm/supabase@2.113.0/node_modules/supabase/package.json` inside this worktree |
| Final Node / pnpm / project CLI | `node --version` = **v24.18.0**; `corepack pnpm --version` = **11.13.0**; `corepack pnpm exec supabase --version` = **2.113.0** |

Ordinary shell PATH still exposes the global npm wrappers `supabase.ps1`, `supabase.cmd`, and extensionless `supabase`, all under `C:/Users/Yousef/AppData/Roaming/npm/`. They were not modified. Inside pnpm exec, `Get-Command supabase -All` orders the worktree-local PS1/CMD/extensionless shims before those global wrappers; `where.exe supabase` likewise places the local extensionless/CMD entries first.

Exact resolved project shim: `D:/ECU/Gradution-Project/.worktrees/011-allergies-clinical-content-governance/node_modules/.bin/supabase.ps1` (PowerShell), or `supabase.CMD` in the same directory for CMD executable lookup. The local shim runs `node_modules/supabase/dist/supabase.js`, resolving through the worktree's `.pnpm/supabase@2.113.0` package; the reported executable version is **2.113.0**. Root node_modules is an ordinary local directory, with package links into this worktree's own virtual store rather than the canonical checkout's dependency tree. Shared pnpm content-store reuse is distinct from shared dependency resolution.

Protected file SHA-256 values after restoration match their pre-edit values; package.json and pnpm-lock.yaml also have no tracked diff:

- package.json: `88fb16d2a3313a19b3e25ac1bf68421942de876a7e0ae0c041932c67a2d3ea60`
- pnpm-lock.yaml: `a49eea490e48af9a9452841cf88e0373719bfe3afef525a80b8d81a75792fda6`
- Plan: `bb6f5918696dab056e4cec756324078f5c28ea640d5387ad6fa515caf3992689`

## Resumed C01 readiness verification

`node --test tools/verify-feature-011-scope.test.mjs`: **25/25 PASS**, exit 0, zero skipped. Cases reject equal-count NFR substitution, duplicates, operation/path drift, expanded admin scope, gate/exclusion loss, missing ACs/approvals, extra UI routes, unapproved UX bytes, catalog reconciliation loss, declared/locked/tool-version drift, unavailable Docker and missing baseline artifacts. The positive isolated filesystem fixture contains none of C02/C03's future parity outputs and still requires parity PENDING/consumers denied. [RED evidence](C01-red.md) records test-first execution.

`node tools/verify-feature-011-scope.mjs`: exit 0, failures empty; parity **PENDING**, `affectedConsumersAllowed: false`, assertion T017, both runtime IDs and all four required evidence categories emitted. This checks actual installed tool versions through the local CLI entrypoint, not global PATH fallback. Scope/PRD/approvals, all 16 ACs, four routes, retained boundaries and both catalog reconciliations pass.

`node specs/011-allergies-clinical-content-governance/visual-baselines/validate-reference-baselines.mjs`: exit 0, PASS; four UI families, 99 states, 746 references, 19 NFRs, seven operations, approved manifest SHA-256 `59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432`. Historical candidate/draft labels remain unchanged; the recorded Product Owner decision supplies the later TEST-ONLY approval.

Spec Kit prerequisites identify the correct feature; requirements checklist has 16 checked/zero unchecked. Parsed implementation extension hooks are absent. Docker daemon connectivity and Compose configuration parsing pass. Existing ignore files remain appropriate and unchanged. Quality review uses clean-code-guard/test-guard/docs-guard with the SHIFAA third-party overlay; no external bundled script is executed.

## Runtime disposition

Both `shifaa-local-postgres-postgres-1` (exited 0) and `supabase_db_shifaa-local-supabase` (exited 137) remain stopped. C01 is a read-only baseline/tooling/bundle-definition checkpoint: no SQL, migration, online-role consumer or shared SQL harness is executed. Its acceptance does not require running database health evidence. No runtime was started, no database was created/reset, and no real SQL/race evidence is claimed. Runtime health, exact versions, isolation and non-owner enforcement must be demonstrated during the later authorized physical-evidence producer checkpoint.

## Historical initial-attempt observations

The following observations are retained from the initial blocked attempt. Current toolchain and task disposition are superseded by the resumed evidence above. These were not application or database acceptance tests.

| Command/check | Observed result | Limit |
| --- | --- | --- |
| `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Correct Feature 011 directory; design documents and tasks discovered | File discovery does not prove implementation readiness |
| Requirements checklist markers | 16 checked, 0 unchecked | Requirements review only; no implementation completion |
| `node --version` | `v24.18.0` | Matches checked-in Node pins |
| `corepack pnpm --version` | `11.13.0` | Matches root package-manager pin |
| `supabase --version` | `2.107.0` | **BLOCKER:** approved Plan specifies `2.113.0` |
| `docker --version` and `docker version --format '{{.Server.Version}}'` | Docker CLI/server `29.7.2` | Daemon reachable; databases not thereby ready |
| `docker compose config --quiet` | Exit 0 | Compose configuration parses; no database startup or SQL proof |
| `docker ps -a --format '{{.Names}}\|{{.Status}}'` | `shifaa-local-postgres-postgres-1`: exited 0; `supabase_db_shifaa-local-supabase`: exited 137 | Both required database runtimes were stopped; no live version, isolation, or non-owner execution evidence captured |
| `specify version` | Spec Kit CLI `1.0.13` | Installed workflow available |
| YAML parse of `.specify/extensions.yml` | No `before_implement` or `after_implement` hooks | No implementation hooks dispatched |
| JSON read of `contracts/task-map.json` | C01 = T001–T003; 19 NFRs; 7 operations | Count check alone is not full scope/contract verification |
| `git diff --check` | Exit 0 | Checks tracked diff whitespace; not functional verification |

The Supabase config declares project `shifaa-local-supabase` and PostgreSQL major 17. This is configuration evidence only. No isolated Feature 011 database was created and no SQL/concurrency test was run. A stopped runtime must not be reported as passing real-runtime evidence. Local dependency-folder absence alone was not treated as proof that dependency resolution fails.

## Pending OPEN-TECH-002 bundle and its producers

This section records the requirements already assigned in [tasks](../../tasks.md) and [task map](../../contracts/task-map.json); it does not execute their producers or add scope.

| Required evidence | Assigned producer/acceptance boundary | Current disposition |
| --- | --- | --- |
| Exact scope, approved UX binding, four routes, AC-01–AC-16, retained gates and both existing-operation API Catalog reconciliations; runnable verifier assertions and readiness/bundle definition | C01/T001–T003 | Complete in resumed C01; existing readiness only |
| Closed generated payload/schema and client shapes from approved OpenAPI, resolved references, seven method/path mappings, five Idempotency-Key and three If-Match bindings; deterministic generation, digests and zero-diff checks | C02/T004–T007 | Pending later authorized preparation; absence is not a C01 defect |
| Complete additive physical schema, constraints, operation/function shapes, grants and ENABLE/FORCE RLS parity across the seven-migration chain | C03/T008–T016 | Pending later authorized preparation |
| Digest-bound fixtures/migrations/runtime/commands/results in both required real PostgreSQL/Supabase runtimes; isolated databases, non-owner online-role enforcement and forbidden-access negatives; physical behavior and race vectors specified in T008, including append/correction, exact-artifact independent signing, authority loss, publication/supersession/future-effective and projection restrictions | C03/T008–T016 | No real-runtime evidence captured in this attempt |
| Full contract verifier rejects missing/stale/owner-only/incomplete physical evidence; current parity bundle and applicable owner/stage disposition asserted before affected application/domain consumers | C03/T017 after T016, before C04 consumers | Pending; local preparation cannot substitute for formal acceptance |

**OPEN-TECH-002 remains OPEN and fail-closed.** Missing, stale, failed or unaccepted evidence blocks affected IMPLEMENTING consumers. C01 does not require future producer outputs and cannot authorize consumers merely by defining the bundle. Later SQL changes require renewed parity evidence and assertion before their consumers proceed.

OPEN-CLIN-001, OPEN-TECH-003, OPEN-UX-001/002 and OPEN-LEGAL-001/002/007 remain retained. The exact Feature 011 TEST-ONLY UX approval does not close program-wide gates. No real clinical content, production approval or Feature 012 capability is asserted.

## Task and execution disposition

- T001: complete — read-only scope/gate assertions and recorded test-first RED.
- T002: complete — scope verifier, 25 passing focused tests and [pending bundle definition](gates.md).
- T003: complete — actual readiness/scope/approval/UX checks and this evidence record.
- C01: **C01_ACCEPTED**, limited to existing readiness and bundle definition. C02: dependency-unblocked by T003, but not authorized or executed; separate Product Owner authorization is required.

Only T001–T003 completion markers are updated after acceptance evidence. Approved Spec/Plan/contracts, package.json, pnpm-lock.yaml and the feature pointer remain unchanged. No application code/tests, SQL tests, full `pnpm verify`, commits, pushes or PR operations were performed. Scope remains 19 NFRs and seven operations. Full verification/live AR/EN acceptance and deferred maintenance remain later obligations. Execution stops here for Product Owner review.
