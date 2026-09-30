# C28 — Performance, restore and verification wiring

## Acceptance and scope

C28 is accepted as focused local/synthetic verification, including the Product Owner-authorized **C28-discovered prerequisite contract-conformance defect**. Only T082–T084 / #389–#391 are in scope. C29/full `pnpm verify` was not run. Production, release, legal and UX gates, including `OPEN-TECH-003`, remain open.

Preflight confirmed a clean worktree on `codex/010-encounters-referrals-contextual-chat` at exact HEAD `7ad708cefd539aeeaca8ff47e7e4628ec49b2aa7`. T079–T081 were complete and T082 was next. Only #389–#391 `shifaa-speckit-handoff:v1` metadata was repaired; all three handoff resolver checks passed. Root owned methodology, migration/restore architecture, ambiguity resolution, review, acceptance, ledger and Git. Bounded delegates implemented performance tooling and the populated-upgrade harness; neither performed lifecycle actions.

SC-005 / NFR-PERF targets: approved patient reference-profile cold-start LCP p95 ≤3,000 ms and input p95 ≤200 ms; regional API read p95 ≤400 ms and mutation p95 ≤800 ms. `OPEN-TECH-003` means the deterministic patient device/network acceptance profile is not approved. Monthly production API availability 99.9%, restore RPO ≤15 minutes and RTO ≤60 minutes remain production/quarterly evidence gates. Numeric local comparisons below are informative; acceptance classification is **UNAVAILABLE-AS-PRODUCTION-EVIDENCE**.

## RED evidence and chronology

1. Before performance implementation, `tsx --test tools/feature-010-performance.test.ts` failed at the missing measurement module `./feature-010-performance.ts`. `%TEMP%/f010-performance-red.txt` was written at 2026-09-30 09:30:12 +03:00.
2. Before restore implementation, focused tests failed at `C28_MISSING_RESTORE_VERIFIER`. Root observed this at approximately 06:30:50 UTC. No saved console artifact is claimed for that invocation.
3. Real API measurement subsequently exposed an authorized OPEN encounter returning HTTP 500 `internal-error`. Failed requests were rejected, never accepted as latency samples. This was a production adapter/contract failure, not benchmark setup noise.
4. Before the production repair, the new real generated-contract/PostgreSQL adapter regression failed on both runtimes: `%TEMP%/f010-c28-projection-red.txt` at 11:52:05 +03:00 and `f010-c28-projection-red-supabase.txt` at 11:52:39 +03:00. Each reached valid authorized raw projection and successful create/sign setup, then failed at actual HTTP 500 versus required 200. SQL emitted `endedAt: null`; the approved generated schema rejected it and accepted omission.
5. The bounded adapter repair made both two-test projection suites GREEN. The full serial C28 PostgreSQL run repeated them successfully, followed by successful real representative API measurements on both runtimes.

Harness defects (initial browser base URL, migration includes on stdin, Supabase workspace mount assumption, obsolete ACL role names, associative CHECK deparse normalization, pre-C26 fixture error-code expectations, UUID request IDs and patient correction-link expectations) were corrected and rerun. They are excluded from RED. No missing setup or fabricated device counts as RED.

Final focused tooling: **13/13 PASS**, covering percentile computation, actual evidence completeness/counts, error rejection, missing/invalid samples, profile classification, restored rows/history/security/authorization, forward receipt drift/holes and exactly five C26 restatements. Unit fixture numbers are examples for the verifier, never measured observations.

## Prerequisite projection repair and root architectural decision

`PostgresFeature010EncounterRepository.parseProjection` now shallowly omits only a top-level `endedAt` whose raw SQL value is null, before unchanged generated-schema validation. This covers GET and UPDATE. CREATE already emits absence and COMPLETE already emits a timestamp. No nullable contract, generic recursive null stripping, migration or lifecycle change was introduced.

The adapter is the public projection boundary: it already replaces internal authorized SQL note metadata with the approved role-specific projection and applies requested field filtering. Narrow normalization here converts SQL's internal open-interval null into the approved public omission. Changing persistence or restating protected SQL functions would be broader than this response-shape defect.

Actual participant projections were inspected: their SQL projection already omits null `endedAt`; an active interval passes `ParticipantProjectionSchema` without the field and an ended interval includes a valid timestamp. No participant production repair was necessary. Other optionals in this exact public path passed unchanged generated validation. Completion does not rewrite participant interval history; that existing behavior was preserved.

Both real-runtime regressions prove OPEN GET/UPDATE success with absent `endedAt`, COMPLETED timestamp and generated-schema success, PAT/current CLN projection, encrypted released/private-note filtering, fields selection without widening, unsupported fields rejection, and identical C26 hidden-resource denial for foreign/absent/completed resources. Private clinical bodies are never emitted in regression diagnostics. Earlier checkpoint evidence did not claim this coupled raw-SQL/adapter OPEN response check; no materially false earlier acceptance claim was found requiring issue reopening.

## Exact performance methodology

Final command: `pnpm test:encounters:performance` (requires both runtimes). Raw report `%TEMP%/f010-c28-performance-final.json`, written 2026-09-30 12:01:05 +03:00; SHA-256 `CCE1224D90EC53EEF107FA3C540C0EABBD429C753A17CF507985B2D236CE4E64`.

Each operation has 20 measured samples after three excluded warmups, concurrency one, serial execution. p95 uses nearest rank: ascending sort, index `ceil(0.95*n)-1`; n=20 selects the nineteenth sample. Root independently recomputed every accepted percentile from the saved arrays and verified success/error counts. Missing samples, non-finite/negative values, errors, incomplete runtimes or numeric misses fail loudly.

Host: Windows x64, Intel Core i7-11800H @2.30 GHz, 16 logical CPUs, approximately 15.69 GiB RAM; Node 24.18.0. Local Docker PostgreSQL 17.11 (`shifaa-local-postgres`) and 17.6 (`shifaa-local-supabase`). No regional deployment or native reference-device identity is claimed.

### Current post-C27 patient browser observations

Desktop Chromium 153.0.8010.12, 1440×900, en-EG, reduced-motion preference, no CPU/network throttling. Expo development server and browser process are warm; route navigation uses a fresh empty-cache BrowserContext and existing synthetic authoritative REST fixtures. No native cold-start or real network/API response is claimed.

LCP uses actual buffered `PerformanceObserver` largest-contentful-paint entries after route content and two animation frames. Input uses a real sequential keypress, verifies its rendered value, and times the input event timestamp to the second animation frame retaining that value. This is an **input-to-render proxy**, not canonical physical-device input latency or full INP.

| Current observation           | Measured samples | Excluded warmups | Local p95 | Informative target | Canonical acceptance profile |
| ----------------------------- | ---------------- | ---------------- | --------- | ------------------ | ---------------------------- |
| `/records` LCP                | 20               | 3                | 384 ms    | ≤3,000 ms          | Unavailable                  |
| `/encounters/:id` LCP         | 20               | 3                | 380 ms    | ≤3,000 ms          | Unavailable                  |
| Message input-to-render proxy | 20               | 3                | 28.5 ms   | ≤200 ms            | Unavailable; proxy only      |

These final post-repair observations supersede the earlier 360/360/23.4 ms local run. All are numerically below the informative thresholds and **UNAVAILABLE-AS-PRODUCTION-EVIDENCE**. `OPEN-TECH-003` remains open.

### Real API observations

Real Fastify `app.inject` through current PostgreSQL adapters and non-owner `shifaa_api`; no mocked API. Node `performance.now()` spans request processing through serialized response completion, including live authorization, transaction and encryption. JSON parsing is afterward. Socket/TLS/network time is excluded. Schema/fixture bootstrap, app construction, seed referral/message validation and current-version pre-reads before updates are excluded.

Reads are actual encounter, nonempty referral and contextual-history projections. Mutations update encounters, create referrals and send messages with distinct keys and actual committed effects. The repaired endpoint is one member of the representative mix.

| Class / operation          | PostgreSQL p95 ms | Supabase p95 ms | Informative regional target ms |
| -------------------------- | ----------------- | --------------- | ------------------------------ |
| Read: encounter            | 10.814            | 8.621           | 400                            |
| Read: referral projection  | 15.851            | 13.376          | 400                            |
| Read: contextual messages  | 8.877             | 8.249           | 400                            |
| Mutation: encounter update | 13.115            | 10.224          | 800                            |
| Mutation: referral create  | 16.163            | 12.265          | 800                            |
| Mutation: message send     | 13.339            | 9.415           | 800                            |

**Every cell: 20 successful measured responses / zero errors, plus three successful excluded warmups / zero warmup errors.** Per runtime: 120 measured successes and 18 warmups. Unexpected HTTP status aborts the benchmark and cannot produce accepted partial evidence. Local numeric comparison PASS; production/regional acceptance unavailable. No gross local regression was observed.

## Fresh chain, forward upgrade, C26 and concurrency

`node tools/run-feature-010-postgres-test.mjs c28` passed serially on both named runtimes; `%TEMP%/f010-c28-schema-final.txt`. It creates empty disposable `template0` databases, applies the complete ordered 26-migration chain from zero including C26, and executes Feature 010 storage/RLS/authorization/privacy/API and Feature 009 compatibility vectors. Six protected tables retain ENABLE/FORCE RLS, six default-deny policies and zero direct online table ACL entries.

The separate restore runner proves a legitimate **populated forward upgrade**: apply the first 25 migrations through C23 (`20260930001000_f010_c23_realtime_hint.sql`), populate representative F009 and F010 rows and actual API-encrypted notes/messages, then apply **only the sole pending C26 migration**. Ordered digest receipts verify the prior prefix and immutable historical inputs; they supplement actual execution, never replace it.

Before/after C26: identical complete domain data hashes, row counts, relationships, F009 state, tables/RLS/ACLs, policies, constraints and triggers. Exactly these five function definitions change: `update_encounter_api_v1`, `sign_encounter_note_api_v1`, `complete_encounter_api_v1`, `create_referral_api_v1`, `accept_referral_api_v1`. Every unrelated function is unchanged. C26 functions retain SECURITY DEFINER, empty search_path, API EXECUTE, and denial to PUBLIC/worker and present anon/authenticated/service-role principals. Live absent/foreign/stale probes enforce authorization before lifecycle/version decisions and identical hidden-resource responses for all five functions. Durable snapshots remain unchanged after rolled-back probes.

The pre-C26 note fixture accepts the old signer's `42501` denial only in its isolated setup subvector; post-C26 ordering requires `P0002` consistently. Historical fixture/migration files are untouched. Blind replay of an oldest narrowing outbox migration against final populated rows is not used as migration correctness. C26 itself is reexecuted on the restored populated final schema and preserves exact snapshots.

| Critical race, both runtimes              | Proven result                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F009 same-slot booking                    | One winner; `23P01` loser; appointment/idempotency/audit/outbox = one each                                                                 |
| Schedule version barrier                  | Waiting mutation `40001` after schedule advances to version 3                                                                              |
| Encounter completion                      | One winner, `40001` loser; one canonical success/effects                                                                                   |
| Referral acceptance / F009 slot ownership | One accepted transition, one linked appointment, one canonical response, one referral audit/outbox; `40001` loser has zero partial effects |
| Send wins completion lock                 | One message/canonical effects commit while context is valid, before completion                                                             |
| Completion wins send lock                 | Waiting send denied; zero message effects                                                                                                  |

Transactional barriers are unchanged. Both real C22 API regressions pass: body-only/attachment rejection and SQL NULL, encrypted persistence/decryption, pagination/live revocation, canonical replay/conflict and no plaintext in audit/outbox/idempotency metadata. Both two-test encounter projection regressions pass inside the final schema run.

## Real backup/restore and restored-data proof

Final command: `node tools/run-feature-010-restore-test.mjs --require-both-runtimes`. `%TEMP%/f010-c28-restore-final.json` SHA-256 `E1415EE7711C3A1F49DD724331470BE9871282F2150F3CE6782542494C5C0E2B`.

Repository convention: actual `pg_dump -Fc` custom archive held in memory, restored with `pg_restore --exit-on-error --no-owner` into a newly created empty `template0` target in the same cluster. Source remains intact. Only exact disposable databases created/tracked by this invocation are removed afterward. No legacy rollback volumes or durable named data are deleted.

| Runtime               | Backup source                           | Empty target                            | Archive bytes | Local elapsed restore proof |
| --------------------- | --------------------------------------- | --------------------------------------- | ------------- | --------------------------- |
| shifaa-local-postgres | `f010_c28_restore_03f3bbf4f14e806a_src` | `f010_c28_restore_03f3bbf4f14e806a_dst` | 980,885       | 6,221.7906 ms               |
| shifaa-local-supabase | `f010_c28_restore_043db44b9f12e0aa_src` | `f010_c28_restore_043db44b9f12e0aa_dst` | 983,406       | 4,745.6790 ms               |

Timing starts after backup bytes exist, before target creation, and ends after actual restore, integrity, real API compatibility/decryption, live authorization and C26 replay. It excludes source bootstrap and backup acquisition. Each is a single local observation, not a percentile, production RPO/RTO acceptance or quarterly evidence.

Each restored database has **7 appointments, 5 queue entries, 4 encounters, 10 signed notes, 3 corrections, 1 accepted referral/appointment link, 2 attachment-NULL messages, 13 outbox records and 13 completed stored responses**. The original F009 appointment, queue, schedule, blocked exception, audit and idempotency fixtures each remain present. Whole-row hashes across identity/clinical/trust/platform/audit match source exactly, including signed/versioned history and encrypted envelopes.

In addition to SQL sealed-envelope fixtures, the prior-state source creates an encounter, private/released signed notes with an append-only correction, and contextual message through the actual approved encryption/API boundary. After backup/restore, actual generated-schema PAT/CLN API reads decrypt their original bodies, prove the clinician correction link, preserve patient subject projection (no private note or supersession identifier), and deny foreign reads. The report records four executed checks: authorizedDecryption, signedCorrectionLink, privateNoteFiltering and foreignDenied = PASS. No bodies/ciphertext/token/config are logged or included in report metadata.

Accepted referral reverse appointment linkage, authoritative fee 12,500, EGP and `cash_on_arrival` remain intact. All constraints are validated. Function definitions/grants, policies, table ACL/FORCE RLS, constraints and enabled triggers match after restore. PostgreSQL reparses CHECKs into empty temporary LIKE tables to normalize pg_dump's associative AND flattening without stripping parentheses or altering logical precedence.

Post-restore non-owner probes prove authorized reads, foreign read/send denial, interval-end immediate cutoff, completion read/send cutoff and direct table denial. C26 absence/foreign/stale ordering runs both before backup and after restore. Read-only API checks and rolled-back authority probes leave exact durable snapshots unchanged. All 26 migration receipts/head restore compatibly; C26 populated replay is unchanged. Cleanup inspection found zero remaining C28 restore/performance databases on either runtime.

## Feature 009 parity and environment omission

Booking/availability regression proves authoritative fee 12,345 minor units (accepted restore slot 12,500), EGP, `cash_on_arrival`, timezone/civil-date/time guards, schedule versions, effective availability, booking exclusion/one-winner behavior, same-key replay and changed-body conflict. Seeded F009 state survives both fresh and populated-forward application and actual restore.

The previous local Supabase direct `SET ROLE shifaa_api` omission **no longer reproduces**. Current `supabase_admin` can assume the role and the full legacy subvector actually executes and passes. No new membership grant, environment-name bypass or Feature 009 behavior change was introduced. The schema runner's intentional historical C08 pre-migration missing-booking-primitive RED remains distinct from C28; the final command exits zero.

## Focused verification and wiring

`verify` registers `test:encounters:verification` exactly once after existing F009 checks. It sequences tooling → scope → privacy → UI controller tests → C28 DB/races → C23 realtime DB → restore → performance → frozen baseline validator → existing patient then clinic live matrices. Shared DB work is serial. Existing global API/contracts/core/worker/i18n tests are not duplicated. Previously omitted F010 TSX/root privacy/live-route checks are explicit. Both Docker runtimes and installed Chromium are explicit local prerequisites; missing required evidence fails loudly, with no silent C29 skip. The UI wrapper preserves exact generated Next type-file bytes for its known rewrite and fails on unexpected changes.

The aggregate and full `pnpm verify` were not executed; registering them is T083, running full verification remains T085/C29.

| Focused check                                                      | Result                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Performance/restore verifier tests                                 | 13 PASS                                                                                                   |
| F010 scope / C26 privacy / UI controllers                          | 3 / 9 / 52 PASS                                                                                           |
| Serial schema/RLS/F009/races/C22/projection                        | Both runtimes PASS                                                                                        |
| C23 realtime DB ordering/dedupe/retry/DLQ/redaction                | 11 PASS per runtime                                                                                       |
| Real performance / populated forward upgrade / restore             | Both runtimes PASS                                                                                        |
| API F010 non-Postgres regression                                   | 73 PASS; separate real DB tests above                                                                     |
| Contract catalog / contracts / generated client                    | 97 operations / 36 / 35 PASS                                                                              |
| API, worker, patient, clinic typechecks                            | PASS                                                                                                      |
| Focused tooling TS (ES2024, bundler, strict/index/optional checks) | PASS                                                                                                      |
| Architecture / secrets and synthetic fixtures                      | 18 boundaries / 17 manifests; PASS                                                                        |
| Post-C27 bilingual live UI matrix                                  | Patient 67 + clinic 32 = 99 PASS; 11 intentional opposite-app skips                                       |
| Frozen references                                                  | Six families, immutable 87-state inventory / 408 references, source/image digests and PNG dimensions PASS |
| Targeted formatting / git diff --check                             | PASS                                                                                                      |

Targeted formatting covers the changed code/tooling and evidence. The existing canonical task ledger has pre-existing Prettier differences; its layout is preserved, with exactly four authorized acceptance lines changed rather than a whole-ledger rewrite.

Live UI evidence is existing-route accessibility coverage under the earlier Product Owner decision. Missing clinic-summary product states remain separately recorded in C27; inventory coverage does not claim those absent flows were implemented. Native/manual AT and deterministic device/network profiles remain unavailable. No retained UX/TECH gate closes.

## Root review and lifecycle

Root independently reviewed/recomputed measurements and counts, API failure rejection, warmups/topology/profile classification, the narrow approved-schema repair, real restored decryption, relationships/history/RLS, both actual migration paths, all five C26 functions and authorization ordering, F009 parity, one-winner effects, redacted diagnostics and serial bounded registration. No unresolved acceptance defect remains.

No new business behavior/API/domain operation, UI redesign, C29 execution, approved spec/plan/OpenAPI/generated schema/baseline edit, historical migration edit, dependency upgrade, provider/channel, retention policy, destructive history rollback or later gate closure. Only T082–T084 may be completed and only #389–#391 closed after this acceptance.

Files changed:

- `package.json`.
- `services/api/src/adapters/postgres/feature-010-encounters.ts`.
- `services/api/test/feature-010-encounter-projection.postgres.integration.test.ts`.
- `tools/feature-010-performance.ts`, `feature-010-performance.test.ts`, `feature-010-performance.browser.spec.ts`, `feature-010-performance-playwright.config.ts`.
- `tools/run-feature-010-restore-test.mjs`, `feature-010-restore.test.ts`, `feature-010-restore-api-fixture.ts`.
- `tools/run-feature-010-postgres-test.mjs`, `run-feature-010-ui-tests.mjs`.
- `specs/010-encounters-referrals-contextual-chat/tasks.md` (only C28 acceptance header and T082–T084).
- This evidence file.

The final checkpoint commit/remote HEAD, issue states and clean-worktree verification are reported after integration; the evidence cannot embed its own future Git hash. No C29 work is started.
