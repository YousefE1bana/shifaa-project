# PR #394 Codex remediation evidence

Date: 2026-09-30. PR: https://github.com/YousefE1bana/shifaa-project/pull/394.

Branch: `codex/010-encounters-referrals-contextual-chat`; accepted base/local/remote HEAD before remediation: `cf3ff359ea7819a1139afed500fb5a3469d66ca8`. The existing feature worktree was clean before the original repair. All 11 open Codex findings were confirmed against that code before editing.

## Canonical verification attempts

| Attempt | Command                | UTC start / end                                                       | Duration  | Exit | Disposition                                                                                                                                                                                                                   |
| ------- | ---------------------- | --------------------------------------------------------------------- | --------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `corepack pnpm verify` | 2026-09-30T13:07:50.2132757+00:00 / 2026-09-30T13:09:05.8584356+00:00 | 75.65 s   | 1    | Preserved failure in `@shifaa/patient:test`: native Node could not resolve new extensionless TypeScript imports. No commit/push or thread resolution followed. Imports were corrected to explicit `.ts` and focused-verified. |
| 2       | `corepack pnpm verify` | 2026-09-30T13:20:58.3189675+00:00 / 2026-09-30T13:37:50.4134865+00:00 | 1012.09 s | 0    | PASS. Exactly one new canonical invocation after explicit user authorization. No product/domain edits were made before or during this attempt.                                                                                |

Attempt 1 was not erased, relabeled as success or silently retried. Before attempt 2, local HEAD, remote branch and PR HEAD were rechecked against the accepted SHA; only the 37 intended remediation files were present and `git diff --check` passed. SHA256 snapshots confirmed those 37 files were unchanged throughout attempt 2.

Preserved local logs:

- `pr394-canonical-verify.log`: SHA256 `224b7024437ce5adff5d7a65898f6a23e5da12f582ed1a9ecc9651a312a49dce`. The logs and timing JSON remain in the local temporary evidence directory.
- `pr394-canonical-attempt2.log`: SHA256 `0708a8ef358719de860868f32769841a09fed0212f5e11ea4c6213d3dee50cb3`. The logs and timing JSON remain in the local temporary evidence directory.

The canonical scripts refreshed four historical Feature006/007/008 performance/restore receipts and added empty pnpm audit bookkeeping (`ignoreGhsas: null`). All five files were proven clean before this run. Generated copies were preserved outside the repository and only those five outputs were returned to their recorded versions. They are excluded from this remediation commit. No dependency versions changed.

## Finding disposition

Every row below is confirmed, repaired and covered by focused verification plus successful canonical attempt 2. The files named in abbreviated test entries are listed with their full repository paths in the inventory.

| #   | Root cause                                                                       | Fix                                                                                                                                                                   | Changed implementation                                                                                                                | Regression / verification                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The client transport made purpose/AAL optional, and real adapters omitted them.  | Require purpose/current session assurance; bind patient assurance to the installed token; carry OTP/refresh/MFA/recovery assurance into patient and clinic clients.   | `packages/api-client/src/feature-010.ts`, its generator, patient adapters/session/auth installation, clinic workspaces/start factory. | `tests/e2e/feature-010-client-context.test.ts`, API-client tests and auth-enforcing clinic browser fixtures. Real routes accept purpose-bearing reads, deny AAL1 writes, permit the current AAL2 session and deny elevated assurance after token replacement. Focused PASS; canonical attempt 2 PASS.                                                                                                                 |
| 2   | Unchanged signing retries created new keys after ambiguous response loss.        | Retain the key by encounter and immutable payload until success or a terminal failure; a changed payload creates a new operation.                                     | `apps/clinic/src/components/feature-010/EncounterWorkspace.tsx`.                                                                      | `apps/clinic/test/feature-010-encounter.test.tsx`: committed response is lost, retry replays the same key and one note; editing the payload produces another key. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                             |
| 3   | Message/referral success header sets omitted the request ID.                     | Return `request.id` on both message and all three referral success paths.                                                                                             | `services/api/src/routes/feature-010-messages.ts`, `feature-010-referrals.ts`.                                                        | Message read/send and referral read/create/accept HTTP integration tests assert `X-Request-Id` on successful responses. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                                                                       |
| 4   | The persisted authorized GET projection omitted `completion_summary`.            | Project stored `completionSummary` only for completed encounters, retaining existing authorization and field selection.                                               | `supabase/migrations/20260929001001_f010_c10_encounter_api.sql`.                                                                      | `services/api/test/feature-010-encounter-projection.postgres.integration.test.ts`: completion followed by fresh patient GET/reopen retains summary, open reads omit it, private notes and unselected fields remain excluded. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                  |
| 5   | Doctor-only grouping/filtering/keys conflated facilities and simultaneous slots. | Preserve doctor/facility identity through grouping, filtering, keys and selection; slot identity includes start/end.                                                  | `apps/patient/app/records.tsx`, `apps/patient/src/feature-010-targets.ts`.                                                            | `feature-010-targets.test.ts` and AR/EN same-doctor/two-facilities browser cases verify isolated slots, selection and facility-specific terms. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                                                |
| 6   | Discovery queried only today before searching availability through day 30.       | Query the existing Feature009 discovery authority across each civil date in the inclusive referral window.                                                            | `apps/patient/src/feature-010-targets.ts`, `apps/patient/app/records.tsx`.                                                            | Targets regression discovers schedules beginning later, checks all 31 inclusive dates and retains distinct doctor/facility pairs. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                                                             |
| 7   | Availability consumed only its first page.                                       | Follow cursors with loop/20-page protection; require fresh pages with consistent availability version and authoritative pricing before publishing choices.            | `apps/patient/src/feature-010-targets.ts`.                                                                                            | Targets regression consumes 100+1 slots per facility and rejects loops, page limits, stale pages, changed versions and changed prices. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                                                        |
| 8   | The first 100 pending referrals were treated as the full authorized set.         | Accumulate bounded fresh cursor pages before publishing; check cancellation/supersession around every request and fail without publishing a partial set.              | `apps/patient/src/feature-010-referrals.ts`.                                                                                          | `apps/patient/test/feature-010-records.test.tsx`: later pages, cursor loops/bounds, later denial/staleness and superseded reads. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                                                              |
| 9   | Creation omitted active clinician/patient person-profile checks.                 | Require both active `identity.people.profile_status` values alongside existing membership/license/patient-record/facility checks.                                     | `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`.                                                        | `infra/db/tests/feature-010-lifecycle.sql`: inactive clinician and patient creation are rejected with unchanged mutation effects. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                                                             |
| 10  | Unlocked authority reads could be invalidated before creation finished.          | After appointment/queue locks, share-lock facility, ordered memberships, ordered licenses, UUID-ordered people and patient, then recheck live authority.              | `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`, `tools/run-feature-010-postgres-test.mjs`.             | `services/api/test/feature-010-authority-race.postgres.integration.test.ts`: five real local PostgreSQL races for facility/membership/license/clinician/patient profiles prove blocking through the creation transaction and zero-effect rejection after a winning revocation. Creation uses the online API role; fixture restoration is isolated to the disposable database. Focused PASS; canonical attempt 2 PASS. |
| 11  | Slot choices discarded authoritative booking terms before confirmation.          | Retain availability pricing and display the exact selected doctor/facility/slot fee, EGP and localized cash-on-arrival terms; submit no client-priced booking fields. | `apps/patient/app/records.tsx`, `apps/patient/src/feature-010-targets.ts`, `packages/i18n/src/feature-010.ts`.                        | AR/EN referral acceptance and same-doctor/two-facilities browser cases assert visible facility-specific prices/payment terms; targets tests retain server page pricing. Focused PASS; canonical attempt 2 PASS.                                                                                                                                                                                                       |

## Focused and live acceptance verification

- `corepack pnpm contracts:check`: 97-operation contract inventory, 36 contracts tests and 35 API-client tests passed; `node tools/generate-feature-010-client.mjs --check` passed.
- Feature010 route/adapter/integration Vitest run: 83 passed, eight database-dependent tests skipped without database environment; the dedicated real PostgreSQL harness separately executed database verification.
- `corepack pnpm test:encounters:ui:unit`: 56 passed.
- `node tools/run-feature-010-postgres-test.mjs projection` and `node tools/run-feature-010-postgres-test.mjs c28`: passed local PostgreSQL and native Supabase PostgreSQL projection/API checks, forced RLS, booking parity and transaction races. The five new authority race cases execute on real local PostgreSQL; projection/refresh checks execute on both runtimes.
- Full synthetic live browser matrix passed again inside canonical attempt 2: patient 76 passed; clinic 33 passed and four app-selector cases skipped. Arabic RTL and English LTR, keyboard/text scaling, note response-loss replay, referral acceptance and exact-pair price/payment disclosure were exercised. Approved baseline PNGs were not regenerated or changed.
- Focused shared session/MFA/recovery and Feature009 patient discovery/booking tests: 16 passed; Feature009 API/adapter tests: 14 passed with five database-dependent skips, supplemented by real SQL booking parity and canonical scheduling checks.
- Before attempt 2, the corrected imports passed patient native Node tests (61), real client-to-route auth tests (2), Feature010 unit tests (56), patient typecheck and six AR/EN chat/acceptance/pair-selection browser cases.
- Changed-package typecheck/lint, formatting, generated-client consistency, privacy, architecture, secrets, scope and `git diff --check` passed. Canonical attempt 2 also completed the full repository verify chain, including both-runtime realtime/restore/performance, retained evidence/baselines and the browser matrix.

## Scope and retained gates

The shared patient session installation changes only retain server-reported assurance for Feature010 requests. Feature009 discovery and booking authority are reused unchanged; no Feature009 contract/primitive repair was needed. Only unmerged Feature010 migrations were corrected. No merged historical migration, dependency/toolchain version, immutable visual baseline, Feature011 or Spec Kit lifecycle artifact was changed.

All eight external gates remain retained: `OPEN-UX-002`, `OPEN-TECH-002`, `OPEN-TECH-003`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`. Evidence is synthetic local/test verification and does not close those gates or claim production readiness.

## Changed-file inventory

The remediation contains 37 implementation/test/tooling files plus this evidence document (38 total):

- `apps/clinic/src/app/patients/[id]/summary/page.tsx`
- `apps/clinic/src/components/feature-010/ContextMessages.tsx`
- `apps/clinic/src/components/feature-010/EncounterWorkspace.tsx`
- `apps/clinic/src/components/feature-010/ReferralWorkspace.tsx`
- `apps/clinic/src/lib/feature-010-api.ts`
- `apps/clinic/test/feature-010-encounter.test.tsx`
- `apps/clinic/test/feature-010-referrals.browser.spec.ts`
- `apps/clinic/test/feature-010-start.test.tsx`
- `apps/patient/app/records.tsx`
- `apps/patient/src/feature-010-chat.ts`
- `apps/patient/src/feature-010-encounter.ts`
- `apps/patient/src/feature-010-referrals.ts`
- `apps/patient/src/feature-010-session.ts`
- `apps/patient/src/feature-010-targets.ts`
- `apps/patient/src/identity-continuity-api.ts`
- `apps/patient/src/identity-onboarding-api.ts`
- `apps/patient/test/feature-010-records.browser.spec.ts`
- `apps/patient/test/feature-010-records.test.tsx`
- `apps/patient/test/feature-010-targets.test.ts`
- `infra/db/tests/feature-010-lifecycle.sql`
- `package.json`
- `packages/api-client/src/feature-010.test.ts`
- `packages/api-client/src/feature-010.ts`
- `packages/i18n/src/feature-010.ts`
- `services/api/src/routes/feature-010-messages.ts`
- `services/api/src/routes/feature-010-referrals.ts`
- `services/api/test/feature-010-authority-race.postgres.integration.test.ts`
- `services/api/test/feature-010-encounter-projection.postgres.integration.test.ts`
- `services/api/test/feature-010-messages.integration.test.ts`
- `services/api/test/feature-010-referral-accept.integration.test.ts`
- `services/api/test/feature-010-referral-create.integration.test.ts`
- `services/api/test/feature-010-referral-projections.integration.test.ts`
- `specs/010-encounters-referrals-contextual-chat/evidence/PR-394-codex-remediation.md`
- `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`
- `supabase/migrations/20260929001001_f010_c10_encounter_api.sql`
- `tests/e2e/feature-010-client-context.test.ts`
- `tools/generate-feature-010-client.mjs`
- `tools/run-feature-010-postgres-test.mjs`
