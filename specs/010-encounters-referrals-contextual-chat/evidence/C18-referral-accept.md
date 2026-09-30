# C18 — Atomic referral acceptance evidence

**Scope:** T052–T054 / issues #359–#361 only, from `0fc1f46d3b959388409fa48fa0e2c3cf9968a24f` on `codex/010-encounters-referrals-contextual-chat`. The starting worktree was clean; T049–T051 were complete and T052 was next. Only the three C18 issue handoff markers were repaired and resolved before implementation. All database fixtures use synthetic people and clinical text in disposable local test databases.

## T052 RED

Before the route and SQL entrypoint existed, the focused API acceptance test returned **404** for the `POST /v1/referrals/:referralId/accept` probes, and the C18 PostgreSQL fixture failed with psql exit 3 at `F010_C18_MISSING_API: clinical.accept_referral_api_v1(uuid,integer,jsonb)`. The RED runner intentionally treats that exact missing-entrypoint failure as a successful RED probe; it applies C10–C17 prerequisites and reaches the C18 fixture before the assertion.

```powershell
pnpm --filter @shifaa/api exec vitest run test/feature-010-referral-accept.integration.test.ts
$env:SHIFAA_TEST_F010_C18_RED='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; node tools/run-feature-010-postgres-test.mjs
```

The initial API run failed its 12 route probes because the route was absent. The missing `If-Match` expectation was corrected to the approved `422 validation-failed` contract before GREEN. A later isolated RED runner check reproduced the exact SQL sentinel while deliberately omitting the C18 migration.

## T053 transaction and root review

The Core API route accepts the closed `AcceptReferralRequest`: `authorizedFieldCodes` and `targetSlot` only. The database function claims the idempotency key, locks the pending referral, then locks and checks the source subject, current PAT/GUA/DEL relationship authority and permissions, target clinician/license/membership, and schedule. It validates the referral version, exact approved fields, specialty and optional target constraints, schedule version, and effective slot before calling the existing C08 `clinical.book_appointment_internal_v1(jsonb,integer,jsonb)` primitive. It then links and accepts the referral and writes the audit event, PHI-free outbox event, and canonical stored response in the same API transaction. Identical replay returns that stored response before booking; changed-body reuse conflicts.

Root review confirmed the acceptance request has no fee, currency, or payment field; the internal primitive supplies the existing server fee, fixed EGP, and `cash_on_arrival`. The public Feature 009 `create_appointment_v1` wrapper and historical migrations are unchanged. The selected facility/doctor IDs are persisted on acceptance even when the pending referral had no optional target constraint, allowing the existing C07 target projection to become visible only after the linked acceptance commits. Hidden and absent referral IDs now produce the same acceptance denial, preventing a pending-target existence cue through the mutation route. No C19, UI, approved-authority, OpenAPI, spec, plan, or baseline edit appeared. Clean-code, test, and docs guard passes found no remaining scope or evidence-accuracy issue.

## T054 focused GREEN

The following C18 runner command passed **serially** on each named runtime; it applies the C18 migration fresh and on replay, executes C07 RLS and C08 F009 booking-seam regressions, and runs the non-owner C18 SQL matrix and isolated two-session race:

```powershell
$env:SHIFAA_TEST_F010_C18_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; node tools/run-feature-010-postgres-test.mjs
$env:SHIFAA_TEST_F010_C18_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; node tools/run-feature-010-postgres-test.mjs
```

Both runs exited 0. Each race blocked two acceptance callers on the referral row, then produced **one committed acceptance and one `40001` loser**. The committed state contained exactly one accepted referral, one linked appointment, one completed canonical idempotency response, one audit event, and one outbox event; the loser left no partial effect. The SQL matrix also proved live PAT/GUA/DEL success and revoked/expired authority denial, unauthorized clinician and inactive target denial, hidden/absent referral denial equivalence, selected-field disclosure, no target projection while pending, the accepted target projection, optional-target resolution, stale referral/schedule versions, wrong specialty/facility/doctor, invalid and already-booked slots, closed pricing input, replay/conflict, and pending/unlinked state after failed paths.

The C17 create/list/privacy vectors passed again on both runtimes:

```powershell
$env:SHIFAA_TEST_F010_C17_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; node tools/run-feature-010-postgres-test.mjs
$env:SHIFAA_TEST_F010_C17_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; node tools/run-feature-010-postgres-test.mjs
```

The C08 seam verified public F009 booking replay, changed-key-body conflict, one booking/effect set, server-owned fee/EGP/cash terms, and slot conflict without changing the public wrapper. The standalone Feature 009 appointment database journey passed: `pnpm test:clinic-scheduling:db appointments` (**3/3** tests), including atomic booking effects and one-winner slot race.

```text
pnpm --filter @shifaa/api exec vitest run src/routes/feature-010-encounters.contract.test.ts test/feature-010-referral-create.integration.test.ts test/feature-010-referral-accept.integration.test.ts
  3 files, 34/34 tests passed
pnpm --filter @shifaa/api typecheck
  passed
pnpm test:encounters:scope
  3/3 passed
pnpm --filter @shifaa/contracts test -- feature-010
  6/6 passed
node tools/verify-contracts.mjs
  passed, 97 catalogued OpenAPI operations
pnpm test:clinic-scheduling:contract
  passed, 18 Feature 009 operations
pnpm architecture:check
  passed, 18 canonical boundaries and 17 package manifests
git diff --check
  passed
```

Targeted Prettier passed after formatting the changed supported files:

```text
pnpm exec prettier --check package.json services/api/src/adapters/postgres/feature-010-referrals.ts services/api/src/app.ts services/api/src/modules/feature-010/referrals.ts services/api/src/routes/feature-010-referrals.ts services/api/test/feature-010-referral-create.integration.test.ts services/api/test/feature-010-referral-accept.integration.test.ts tools/run-feature-010-postgres-test.mjs
```

The C07/C08/C17 and C18 PostgreSQL checks used non-owner `shifaa_api` with no direct clinical table DML. This is synthetic local/test evidence. Full `pnpm verify` and live Arabic/English acceptance were not run for this bounded checkpoint. `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`, `OPEN-UX-001`, `OPEN-UX-002`, `OPEN-PRODUCT-001`, `OPEN-TECH-002`, and `OPEN-TECH-003` remain open.
