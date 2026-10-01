# Pre-011 bounded clinical integration hardening

## Authority and scope

This is bounded maintenance for the Product Owner-accepted two-account review
findings F01-F04. It is not Feature 011 or a new product Spec Kit feature. F05-F09
remain deferred. Base and both canonical attempts' starting HEAD:
`deb03d8a460f6c46e988cbcb7f98a5abc996d864`.

All implementation and verification ran in
`D:\ECU\Gradution-Project\.worktrees\pre-011-integration-hardening`, branch
`codex/pre-011-integration-hardening`, created from the verified exact
`origin/main`. The root's unrelated `.codex/config.toml` was not copied, staged,
stashed, reset, or edited. Its SHA-256 remained
`1106A3AFA1149277047E081A3E295B3372628B5CA273BF5FE7C04C242766F440`.

## Reproduction, fixes, and regressions

### F01: Native actor, session, and AAL integration

Before production changes, a legitimate native Supabase session received 503
`open-sec-001` at the seeded-synthetic scheduling boundary. Existing seeded
synthetic contract cases still passed (14 tests across scheduling and encounter
contracts). The initial recovery probe also received 503; that masked probe was
not accepted as recovery-restriction evidence.

Root cause: clinical routes used only their synthetic-person actor parser and
had no connection to the existing verified identity/session authority.

Fix: ordinary local/test PostgreSQL composition supplies the existing identity
service's `actorFromAccessToken` to scheduling, encounter, referral, and message
routes. The existing Supabase/native verification and current continuity/session
authority resolve the canonical person, principal, and AAL server-side. Native
routes ignore caller `X-AAL`. Purpose, action, and PAT/GUA/DEL/CLN authorization
remain in the existing route/domain/SQL boundaries. No new credential parser,
shadow session table, MFA policy, or generic authorization framework was added.

Synthetic-person behavior remains limited to local-auth, synthetic, non-production
configuration. A Supabase configuration cannot enable it merely by setting the
synthetic flag. Missing continuity runtime or unsuitable repository configuration
fails closed; production clinical enablement is not claimed.

The joined regression performs real confirmed signup and password login, native
TOTP enrollment/verification, and SDK refresh/logout. It proves native scheduling
success, AAL1 denial despite forged `X-AAL: 2` with zero encounter/idempotency
effects, native AAL2 encounter creation/note signing, stable canonical patient
identity after rotation, and immediate clinical denial after local session logout.
A native session linked to an existing `restricted_enrollment` /
`mfa_enrollment_only` continuity case is denied. This last case seeds the approved
restriction state; it does not claim to execute a complete recovery OTP lifecycle.
The canonical existing recovery suite separately exercises recovery acceptance.

### F02: Ordinary PostgreSQL scheduling composition

Before production changes, generated public doctor discovery through ordinary
PostgreSQL `buildApp` returned 503 `feature-disabled` without manual service
injection. Authenticated scheduling was additionally masked by F01.

Root cause: ordinary composition always selected the fail-closed scheduling
service unless a test supplied an override.

Fix: non-production PostgreSQL composition constructs the existing
`PostgresClinicSchedulingService` and existing scheduling domain service. Fixed
SQL functions retain final action/scope authority; the authorization port's
return type now also permits their void preflight. No successful authorization
facts are fabricated. No-op caching avoids stale private fallback after SQL
denial. Existing server pricing, booking/queue lifecycle, idempotency, and races
are not rewritten. Production composition explicitly retains the fail-closed
service, even if an override is supplied.

The joined regression passes public discovery and authenticated appointment
reads through ordinary `buildApp` with no scheduling-service injection. The
canonical Feature 009 stack, contract, RLS, migration, performance, restore, and
privacy/security checks also passed.

### F03: Explicit patient notes projection

The initial conditional unit regression failed because the actual patient
wrapper requested no fields. The PostgreSQL RED regression proved the distinction:
the actual generated explicit `fields=notes` request returned two authorized
patient-visible signed versions, while the actual wrapper returned no notes.
This was not an unconditional encounter fixture.

Fix: `PatientFeature010EncounterApi.getEncounter` explicitly requests
`fields: ['notes']`. The API default projection remains unchanged. The browser
reconciliation matcher now compares URL pathname so the legitimate query does
not prevent the response wait from resolving. The conditional unit fixture
returns notes only when selected.

The actual wrapper -> generated client -> real route -> non-owner PostgreSQL
regression signs a private note, a released patient-visible original, and its
released correction. Default reads omit notes; explicit and wrapper reads
contain exactly the two authorized history versions, with correct IDs/bodies.
Patient projections contain no supersession identifier, private note ID/body,
or private canary metadata. Assertions do not invent insertion order for tied
fixture timestamps. The joined native case repeats AR/EN patient reads and
compares the entire projection before/after an additional private note; the
projection is unchanged, proving no private-note existence metadata leak.
Revocation denies the native wrapper read and clears its previous encounter.

The accepted clinic-summary missing-product-state boundary is preserved.

### F04: Completion/profile-suspension authority cutoff

The real baseline race was reproduced on both PostgreSQL 17.11 and Supabase
PostgreSQL 17.6, before implementing the fix. Completion used a pre-lock
authority check without protecting/rechecking active clinician profile status.

Order A held the linked appointment lock, started completion, and observed its
transaction-ID wait in `pg_stat_activity`. Profile suspension committed before
releasing the lifecycle lock. Baseline completion nevertheless succeeded with
one idempotency/audit/outbox result and completed encounter/appointment/queue.

Order B paused completion at a test-only post-authority encounter-update barrier.
Baseline suspension committed while completion was paused, followed by successful
completion. Thus no existing profile lock/trigger disproved the interleaving.
The test-only advisory barrier is created only in disposable regression databases.

The sole new forward migration is
`supabase/migrations/20261001001002_f010_f04_completion_authority.sql`.
It restates only `clinical.complete_encounter_v1`; no merged migration is edited.
Stable order is appointment -> queue -> encounter -> facility -> ordered membership
IDs -> ordered licence IDs -> ordered people IDs -> patient record -> responsible
participant. Authority rows use transaction-duration share locks. After waits,
the producer checks current facility, membership interval, professional licence,
active clinician and patient profiles, active patient record, responsible
participant interval, linked lifecycle/version, and AAL/purpose/action context.
Existing wrapper transaction, idempotency, audit, outbox, ownership, execute-deny
grants, and atomic lifecycle writes are retained.

Final canonical observations on BOTH runtimes:

| Ordering                    | Observed wait and outcome                                                                                      | Durable result                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suspension wins A           | Completion waited on the lifecycle holder (`Lock`, `transactionid`), then denied after committed suspension    | Clinician suspended; encounter open/version 5; appointment in_consultation; queue in_service; zero successful completion/idempotency/audit/outbox effects, including no pending idempotency row                |
| Completion protects first B | Completion paused on the test advisory barrier; suspension then waited on completion (`Lock`, `transactionid`) | Completion committed consistently, then suspension proceeded; encounter/appointment/queue completed; encounter version 6; exactly one completed idempotency response (200/body), audit event, and outbox event |

Observed state tuples were respectively:
`suspended|open|5|in_consultation|in_service|0|none|none|none|0|0` and
`suspended|completed|6|completed|completed|1|completed|200|present|1|1`.
These are overlapping transactions, not serial/synthetic-only race assertions.
Online completion uses `shifaa_api` with neither superuser nor BYPASSRLS authority.

## Joined ownership and focused acceptance

The two joined tests were moved, not duplicated:

- `services/api/test/native-clinical-composition.integration.test.ts` ->
  `tests/e2e/pre-011-native-clinical-composition.integration.test.ts`.
- `services/api/test/pre-011-patient-notes.postgres.integration.test.ts` ->
  `tests/e2e/pre-011-patient-notes.postgres.integration.test.ts`.

Only relative source/helper/dynamic import paths and the two runner references
changed. The native test reuses the existing repository-E2E MFA harness and its
identical `authClient` options rather than adding a root SDK dependency. Existing
root MFA E2E tests already import this reusable helper. Root declared workspace
packages own joined acceptance; API has no dependency on api-client. API manifest,
lockfile, and dependency graph are unchanged. Old service-local files are absent.

Native acceptance passed 4/4. Patient-notes acceptance passed 1/1 on EACH runtime,
including after extending fresh construction to F04. Transport is the real
generated client with a Fastify `inject` fetch adapter, ordinary `buildApp`, real
routes, and non-owner PostgreSQL; this is not evidence of a deployed TCP server.

Focused commands/results before Attempt 2:

- `node tools/run-native-clinical-composition-test.mjs`: exit 0, 4/4.
- `node tools/run-feature-010-postgres-test.mjs patient-notes`: exit 0, both runtimes.
- `node tools/verify-architecture.mjs`: exit 0, 18 boundaries/17 manifests, no cycle.
- Root `pnpm exec tsc --noEmit` with module preserve/bundler resolution, ES2024/DOM,
  node/vitest types, strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes,
  noImplicitOverride/noFallthroughCasesInSwitch/noPropertyAccessFromIndexSignature,
  isolatedModules/resolveJsonModule/skipLibCheck, naming the two moved tests:
  exit 0. Their transitive typed API imports were checked too.
- Targeted `pnpm exec prettier --check` for both tests and their runners: exit 0.
- `git diff --check`: exit 0.
- Feature 009 scope and Feature 010 scope tests: exit 0, Feature 010 3/3.

Additional pre-canonical focused evidence retained: patient UI unit 57/57,
Feature 010 tooling 14/14, C28 on both runtimes, F04 overlapping regressions on
both runtimes, and populated restore on both runtimes.

## Migration construction and restore compatibility

The root `db:migrate` chain ends with F04 exactly once, after C26. Plain `db:reset`
uses that chain. Supabase reset discovers the forward file normally; the canonical
run explicitly logged its application. The Feature 010 fresh/replay runner now
applies F04 after C26 before current-state assertions. The projection branch and
performance runner consume the current manifest chain. The F04 GREEN concurrency
runner explicitly includes the new forward migration. Native joined acceptance
uses the current, freshly reset Supabase database.

The populated restore runner retains C23 -> C26 proof, then proves C26 -> F04
changes exactly one completion producer digest and no populated data, counts,
tables, constraints, triggers, policies, or function set. Backup/restore and
replay finish at F04 on both runtimes. Narrow restore tooling negatives reject
missing F04 evidence, data/policy drift, and unrelated function changes.
Historical C10-C23 focused checkpoint and F04 RED paths intentionally omit later
migrations; they are historical behavior proofs, not current-head construction.

## Canonical verification: both attempts

Exactly two canonical `corepack pnpm verify` invocations were performed.
There was no third run and no full verification after this evidence-only edit.
Both started at the base HEAD above with intended dirty maintenance files.

| Metadata        | Attempt 1                                        | Canonical Attempt 2                                 |
| --------------- | ------------------------------------------------ | --------------------------------------------------- |
| Start UTC       | 2026-09-30T22:23:00.9568336Z                     | 2026-10-01T02:49:46.3328082Z                        |
| End UTC         | 2026-09-30T22:24:55.8056560Z                     | 2026-10-01T03:07:53.5828062Z                        |
| Elapsed seconds | 114.8485278                                      | 1087.2478621                                        |
| True exit code  | 1                                                | 0                                                   |
| Result          | FAILED at architecture:check                     | PASSED complete canonical chain                     |
| Full log        | artifacts/pre-011/canonical-verify.log           | artifacts/pre-011/canonical-attempt-2.log           |
| Metadata        | artifacts/pre-011/canonical-verify-metadata.json | artifacts/pre-011/canonical-attempt-2-metadata.json |

Attempt 1 failed because the two new cross-boundary tests were under
`services/api/test` while importing `@shifaa/api-client`. This was test ownership,
not a missing production dependency. Correction moved them to root E2E ownership.
No API -> api-client dependency was added. The Product Owner explicitly authorized
the correction and exactly one second canonical attempt.

Attempt 1 log SHA-256:
`78748C8A9B0A293F64C8D24D5FEC48741330A8FD0F5D6D9AF33881B8D2993F20`.
Attempt 1 metadata SHA-256:
`3632A45F612EE1F26C5AD89E4EAA8C9848E42BF19962CFE6CB96F6D1D75EE2EC`.
Both original artifacts were preserved byte-for-byte, including after Attempt 2.

Attempt 2 full log SHA-256:
`C3E186C270C56EC9678F67991E15A3FCBAE0B1E84F91909F0A053696F61313F0`.
Attempt 2 metadata SHA-256:
`48186C002D99561DAA30B3557F94E6452A430F611FF65060BF4B83593B5084DD`.
Full absolute paths are recorded in the metadata; artifacts are local ignored
runtime files under this worktree's `artifacts/pre-011`, not committed evidence.
Attempt 2's 18 exact starting dirty paths are the implementation/test/runner paths
listed below, excluding this document. Attempt 1 metadata retains its original
service-local test paths unchanged.

Runtime versions for both attempts: Node v24.18.0, Corepack 0.35.0, pnpm 11.13.0,
Supabase CLI 2.113.0, Docker server 29.7.2, plain PostgreSQL 17.11, Supabase
PostgreSQL 17.6, Playwright 1.63.0.

Attempt 2 includes real AR/EN live browser results: patient matrix 69 passed /
7 skipped; clinic matrix 33 passed / 4 skipped. Skips are app-specific accessibility
cases excluded by the existing per-app matrix, not a claim of executing every
case in each app. Frozen baseline validation passed. Native joined test 4/4 and
F04's four overlapping cases passed at the end of the same canonical invocation.

### Generated-artifact handling

Four historical generated outputs were snapshotted before Attempt 2. Their new
run outputs were retained in ignored `canonical-attempt-2-snapshots/*.bin.generated`,
then only those outputs were restored to their original bytes and checked against
pre-run hashes: Feature 006 performance, Feature 007 performance, Feature 008 load
profile, and Feature 008 restore report. Attempt 2 metadata records original,
generated, and restored hashes. No historical evidence is included in the diff.
Feature 010 performance/restore reports were redirected to ignored
`canonical-attempt-2-f010-performance.json` and
`canonical-attempt-2-f010-restore.json`. `FEATURE_009_CAPTURE_EVIDENCE` was unset.
The existing live UI runner restores its generated Next type import paths itself.

The canonical dependency stage's pnpm `audit --ignore-unfixable` also serialized
an empty audit setting as `auditConfig: { ignoreGhsas: null }`. Installed pnpm
11.13.0's audit `ignore` handler unconditionally calls `writeSettings`, including
when the ignore set is empty. This generated no-op was preserved at
`artifacts/pre-011/canonical-attempt-2-generated-pnpm-workspace.yaml` (SHA-256
`77D646E85C07F090FD712666A0AC46C7FFA7E1D15DC61005C8F4DD606A2E46BC`),
then only that generated setting was restored to `{}`. Final workspace manifest
has no diff from main. This is generated-artifact handling, not dependency or
verification-script remediation; no canonical rerun followed it.

## Exact intended changed files

- `apps/patient/src/feature-010-encounter.ts`
- `apps/patient/test/feature-010-encounter.browser.spec.ts`
- `apps/patient/test/feature-010-encounter.test.tsx`
- `package.json`
- `services/api/src/app.ts`
- `services/api/src/modules/clinic-scheduling/types.ts`
- `services/api/src/routes/clinic-scheduling.ts`
- `services/api/src/routes/feature-010-encounters.ts`
- `services/api/src/routes/feature-010-messages.ts`
- `services/api/src/routes/feature-010-referrals.ts`
- `supabase/migrations/20261001001002_f010_f04_completion_authority.sql`
- `tests/e2e/pre-011-native-clinical-composition.integration.test.ts`
- `tests/e2e/pre-011-patient-notes.postgres.integration.test.ts`
- `tools/feature-010-restore.test.ts`
- `tools/run-feature-010-postgres-test.mjs`
- `tools/run-feature-010-restore-test.mjs`
- `tools/run-feature-010-completion-authority-concurrency-test.mjs`
- `tools/run-native-clinical-composition-test.mjs`
- `specs/010-encounters-referrals-contextual-chat/evidence/pre-011-integration-hardening.md`

## Retained gates and non-claims

Feature 009 retains `OPEN-UX-002`, `OPEN-TECH-002`, `OPEN-TECH-003`,
`OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, and
`OPEN-LEGAL-007`. Feature 010 retains its recorded `OPEN-UX-001` boundary and
`OPEN-UX-002`, `OPEN-TECH-002/003`, `OPEN-PRODUCT-001`, and
`OPEN-LEGAL-001/002/007`. No OPEN gate, policy, spec, task ledger, operation,
accepted historical checkpoint, or clinic-summary product-state boundary changed.
Feature 010 remains exactly 10 operations and its immutable 6-family / 87-state /
408-reference baseline is unchanged. Feature 009 scope remains 18 operations,
9 appointment states, 5 queue states, cash-on-arrival, and production SMS disabled.

No production enablement, real-PHI deployment, legal/security release approval,
production RPO/RTO, or formal field-device/network acceptance is claimed. No
Feature 011 files or F05-F09 remediation are present. Local canonical success
does not establish GitHub required-check success or authorize merging this PR.
Integration is feature-branch push and PR to main only, without auto-merge.
