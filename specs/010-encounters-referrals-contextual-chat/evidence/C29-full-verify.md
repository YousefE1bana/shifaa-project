# C29 — Full verification (T085)

## Attempt chronology

| Attempt | Starting integration HEAD                  | Exact command          | Start / end (EEST, +03:00)                     | Elapsed       | Exit  | Outcome                                                         |
| ------- | ------------------------------------------ | ---------------------- | ---------------------------------------------- | ------------- | ----- | --------------------------------------------------------------- |
| 1       | `183ac3353a6e20303f14ba6584a0db07863c5c44` | `corepack pnpm verify` | 2026-09-30 13:13:46.7401901 / 13:16:40.4204846 | 173.6619765 s | 3     | FAILED at `db:test`: legacy F006 final-schema absence assertion |
| 2       | `e110ce3ae85755b238b4a4e96e7bccdcd66b758e` | `corepack pnpm verify` | 2026-09-30 13:57:51.4663796 / 14:13:53.3253425 | 961.8379834 s | **0** | PASS after the separately authorized/committed harness repair   |

Attempt 1 is factual failed evidence, not a passing run. Its original log and metadata remain preserved. The Product Owner explicitly authorized the bounded prerequisite repair and exactly one new attempt. [Repair evidence](C29-prerequisite-harness-repair.md) records the defect, actual negative/positive schema probes and scope. Repair commit `e110ce3ae85755b238b4a4e96e7bccdcd66b758e` changed only the SQL test and that evidence.

Each attempt executed the canonical root command once. Attempt 2 began on a clean `codex/010-encounters-referrals-contextual-chat` worktree with local/remote HEAD equal to the repaired commit. The wrapper redirected complete stdout/stderr into a durable TEMP log, saved the actual process exit before further commands, and recorded timestamps with an elapsed stopwatch. No full stage was substituted, skipped, converted to warning, or rerun to obtain green. The earlier failure was not classified as flaky.

## Captures and environment

- Attempt 1: `%TEMP%/shifaa-f010-c29-20260930-131345/{verify.log,run.json}`. Log SHA256: `112167a00837c1ec41f12355cadb407249324185ec52628b4104d51a22fab5a0`.
- Attempt 2: `%TEMP%/shifaa-f010-c29-attempt2-20260930-135750/{verify.log,run.json}`. Log SHA256: `bbe26300e40509bf7f1562276aab07e1ffb7cb644a9472621509ae446c3f505a`.
- Attempt 2 copied raw performance report: `feature-010-performance.json` in the same capture directory; SHA256 `1d4bcd7af37865930d80b3d5b550fb4d546d5d455e513221df521b97f48805f1`. Original generated file: `%TEMP%/shifaa-f010-performance-28256-1790766653165.json`.
- Windows x64; Node `v24.18.0`, Corepack `0.35.0`, pnpm `11.13.0`.
- `shifaa-local-postgres`: `shifaa-local-postgres-postgres-1`, image `shifaa/postgis:17-3.5-006-local`, loopback port 5432, active volume `shifaa-local-postgres_shifaa-postgres-data`.
- `shifaa-local-supabase`: `supabase_db_shifaa-local-supabase`, image `public.ecr.aws/supabase/postgres:17.6.1.158`, host port 54322, volume `supabase_db_shifaa-local-supabase`; local Auth, storage, gateway and other services inspected in `run.json`.

The canonical chain includes active local PostgreSQL reset and native Supabase stop/start/reset behavior. These operate on the current synthetic projects. No manual volume deletion occurred; legacy `shifaa-local_shifaa-postgres-data` and `shifaa-runtime-002` volumes remain. The Supabase CLI's database reset branch label does not change the Git branch. Database work was serial; named runtimes were healthy before and after execution.

## Actual stage coverage

| Canonical stage group                                                                                | Attempt 2 result                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Formatting, owned skills/provenance/self-tests, lint, typecheck, build                               | PASS; 12/12 builds successful                                                                                              |
| General tests, accessibility and E2E                                                                 | PASS; F010 contracts 6/6, generated client 10/10, core policy and API adapter/route regressions executed                   |
| Catalog/contracts, architecture, secrets, dependencies and Docker config                             | PASS; 97 catalog operations overall, exact ten F010 operations; 18 architecture boundaries / 17 manifests                  |
| Root fresh migrations, schema/RLS and idempotency/privacy                                            | PASS; corrected F006 permanent shadow-source assertion and F010 conditions schema check both execute                       |
| F006 discovery/SOS stack, E2E, performance, security                                                 | PASS                                                                                                                       |
| F007 native Auth, MFA, recovery, worker, transition, performance, security                           | PASS; transition accounts for 20/20 legal vectors                                                                          |
| F008 scope, contracts/evidence, stack, E2E, privacy/security, performance/restore                    | PASS                                                                                                                       |
| F009 scope/contracts, stack/RLS/migration/API races, security, performance, restore/privacy/evidence | PASS; 18 operations, nine appointment states, five queue states, EGP/cash safeguards retained                              |
| F010 tooling, scope, C26 privacy, patient/clinic controllers                                         | PASS: 13 tooling, 3 scope, 9 privacy, 52 controller tests                                                                  |
| F010 serial fresh schema/RLS/storage/API/F009/races (`c28` runner)                                   | PASS on both named runtimes                                                                                                |
| C23 durable realtime PostgreSQL                                                                      | PASS: 11/11 on each runtime, zero skips in the dedicated DB suites                                                         |
| C28 populated forward upgrade and actual restore                                                     | PASS on both runtimes                                                                                                      |
| C28 real API / patient synthetic performance                                                         | Local numeric PASS on both runtimes; production acceptance unavailable                                                     |
| Frozen reference validator                                                                           | PASS: 6 families, 87 inventory states / 408 references; source, inventory, image digests and PNG dimensions unchanged      |
| Bilingual live existing-route UI matrix                                                              | Patient 67 passed / 7 opposite-app skips; clinic 32 passed / 4 opposite-app skips; zero failures, one worker, zero retries |

The F010 aggregate ran exactly as registered: tooling → scope → privacy → UI controllers → serial `c28` PostgreSQL coverage → realtime DB → restore → performance → baseline → patient/clinic live matrix. Generic no-database unit runs conditionally skip database-dependent suites; the dedicated database stages subsequently execute them with actual PostgreSQL. The old missing-booking-primitive RED sentinel inside the scratch-schema runner is an asserted pre-F010 negative control, not an unresolved failure. The 11 browser skips explicitly select the opposite app; no failed state or canonical stage was skipped.

## Both-runtime persistence and restoration

Both fresh paths applied the complete ordered 26-migration chain including C26. The populated upgrade used the first 25 migrations through C23, real synthetic F009/F010 state, then only the pending C26 migration. It preserved data/security snapshots and verified the five function restatements, authorization-before-lifecycle ordering, grants, empty search paths, FORCE RLS and unchanged unrelated functions. C26 replay on the restored populated final schema also preserved snapshots. Migration digests supplement execution, not replace it.

Both runtime RLS snapshots report `forced_rls=6/6`, six default-deny policies and zero direct online table ACL entries. Authorized API reads and private/released-note projection, foreign/hidden denials, ended participant and completed-context cutoff, cursor reauthorization and exactly-once effects passed. The previously omitted Supabase F009 direct SET ROLE assertion executes using the existing `supabase_admin` test connection and passes; no role membership or online privilege was added. No current environment omission is counted as PASS.

Booking/acceptance races retain one winning appointment/idempotency/audit/outbox and zero partial loser effects; schedule-version races deny stale callers. Message-first completion waits and retains one message/effect set; completion-first denies the waiting send with zero message effects. Realtime remains a body-free refresh hint with ordering/dedup/retry/DLQ and no authorization entitlement.

Restore uses `pg_dump -Fc` and `pg_restore --exit-on-error --no-owner` into separate disposable empty databases on each source cluster. Restored counts per runtime: seven appointments, five queue entries, four encounters, ten signed notes, three corrections, one accepted referral, two messages, 13 outbox effects and 13 stored responses, plus representative F009 schedule/appointment/queue/audit/idempotency/blocked-exception rows. Relationships, encrypted-body authorized reads and live foreign/ended/completed/direct-table denials passed, including all five C26 ordering probes. This is actual backup/restore rather than migration reseeding.

| Runtime               | Backup bytes | Measured local restore duration | Result |
| --------------------- | ------------ | ------------------------------- | ------ |
| shifaa-local-postgres | 980,878      | 5.5235599 s                     | PASS   |
| shifaa-local-supabase | 982,485      | 4.3525479 s                     | PASS   |

Local restore observations do not establish production RPO ≤15 minutes, RTO ≤60 minutes or monthly API availability 99.9%.

## Fresh local performance observations

Twenty measured requests per operation after three excluded warmups; concurrency one, sequential runtime/operation execution. Nearest-rank p95 selects sorted sample 19 of 20. Root independently recomputed all 15 API/browser metrics from the captured arrays. Each API cell has 20 successful measured responses / zero errors and three successful warmups / zero errors. Setup/bootstrap, seed operations, app construction and pre-update version reads are excluded. Failed HTTP requests cannot become accepted samples.

Real Fastify injection uses current PostgreSQL adapters and non-owner `shifaa_api`. Node `performance.now()` covers request processing and response serialization; JSON parsing follows timing. Socket/TLS/network latency is excluded, so this is local in-process API evidence, not a regional production measurement.

| Operation                | PostgreSQL p95 ms | Supabase p95 ms | Informative threshold ms |
| ------------------------ | ----------------- | --------------- | ------------------------ |
| Encounter read           | 10.267            | 8.538           | 400                      |
| Referral projection read | 14.709            | 12.797          | 400                      |
| Context message read     | 8.648             | 11.487          | 400                      |
| Encounter update         | 11.839            | 11.456          | 800                      |
| Referral create          | 12.365            | 12.275          | 800                      |
| Message send             | 11.336            | 9.991           | 800                      |

Patient observations use desktop Chromium `153.0.8010.12`, 1440×900, en-EG, reduced motion, no CPU/network throttling, a warm Expo development server and a fresh empty-cache context per route navigation. REST is synthetic fixture-backed. Actual PerformanceObserver LCP p95: Records **504 ms**, Encounter **528 ms** (informative target 3,000 ms). A real keypress-to-second-animation-frame rendered-value proxy p95 is **23 ms** (informative target 200 ms); it is not canonical reference-device input latency or INP. Each browser metric has 20 samples and three excluded warmups. No reference device/network was fabricated. All canonical production profile acceptance remains **UNAVAILABLE-AS-PRODUCTION-EVIDENCE** under `OPEN-TECH-003`.

## Evidence integrity and acceptance limits

All 447 captured F010 evidence/baseline files retained their pre-run SHA256 values. Existing C26/C27/C28 evidence, source/manifest/reference images were not rewritten. Manifest SHA256 is exactly `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`.

Canonical historical performance/restore runners rewrote four F006/F007/F008 reports and pnpm normalized `pnpm-workspace.yaml`. Their exact generated copies and `generated-file-diff.patch` are preserved under the attempt-2 capture directory; those five tracked files were then restored to the committed representation. No normalization, historical report refresh, dependency/toolchain upgrade or unrelated change is included in C29.

Live acceptance is the C27 Product Owner-clarified **existing-route accessibility boundary**. The frozen clinic-summary encounter-overview/private-note/patient-visible-note states have no current product/data flow and remain explicitly missing; 87-state inventory validation is not 87-state live implementation. Native NVDA/VoiceOver/TalkBack/physical-device/manual AT execution is unavailable. Browser semantics, keyboard/focus, 44px targets, actual 200%/400% computed text scaling, 320px reflow, bidi/localized date/state labels and reduced-motion checks do not fabricate native/formal approval.

T085 engineering verification is accepted with exact exit 0; T086 is documented separately in [integration/gate reconciliation](C29-integration-gates.md). No QA/clinical/Legal/DPO/formal UX/Product/production/release approval or retained gate was implicitly closed. Targeted formatting of new C29 evidence and the changed ledger occurs after this full verify; root `format:check` does not cover these subsequently written Feature 010 documents. No second full verify is required or performed for documentation changes.
