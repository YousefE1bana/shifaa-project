# C11 encounter update evidence

Date: 2026-09-29. Checkpoint: T031–T033. All database fixtures and calls use synthetic data inside rolled-back transactions; this checkpoint does not authorize production clinical traffic.

## T031 RED

The new HTTP tests expect the approved PATCH /v1/encounters/{encounterId} operation, and the real PostgreSQL vectors include a fail-closed boundary probe. Before implementation, the SQL probe reported:

F010 C11 RED: missing locked API mutation boundary clinical.update_encounter_api_v1(uuid,integer,jsonb)

The route test parsed and ran but received `404` for the absent PATCH route; the PostgreSQL fixture reached the explicit missing-function guard. Both failures identified the missing C11 implementation, not a syntax or fixture failure. The route and SQL tests were added before the route, Core API path, adapter, and locked PostgreSQL function.

## T032 implementation

The API exposes only the approved update operation. It requires AAL2, current purpose, If-Match, a closed structured body, and an idempotency key. The adapter calls clinical.update_encounter_api_v1(uuid,integer,jsonb) through the non-owner shifaa_api transaction.

The locked function validates same-patient existing condition references, accepts empty observation/order collections, and fails closed on non-empty observation/order references because Feature 010 currently has no corresponding source tables. It never adds participants and refuses to end the responsible clinician interval. Ending a confirmed active non-responsible participant interval increments the participant and encounter versions in one transaction; the C07 current-authority check then denies that clinician's encounter read and send paths immediately.

Identical-key, identical-body requests return the stored canonical response before checking the supplied version, while a changed body conflicts. Successful mutations write one audit event, one minimal outbox event, and one idempotency response. Notes are removed from the projection until the authorized note-body API is available.

## T033 focused verification

Commands ran from the repository root unless a PowerShell environment assignment is shown.

PowerShell:
$env:SHIFAA_TEST_F010_C11_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; node tools/run-feature-010-postgres-test.mjs
exit 0 — shifaa-local-postgres: focused C11 update and C07 RLS PostgreSQL vectors passed.

PowerShell:
$env:SHIFAA_TEST_F010_C11_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; node tools/run-feature-010-postgres-test.mjs
exit 0 — shifaa-local-supabase: focused C11 update and C07 RLS PostgreSQL vectors passed.

corepack pnpm --filter @shifaa/api exec vitest run test/feature-010-update.integration.test.ts src/routes/feature-010-encounters.contract.test.ts
exit 0 — 2 test files, 14 tests passed.

corepack pnpm --filter @shifaa/api typecheck
exit 0.

corepack pnpm contracts:check
exit 0 — 97 OpenAPI/catalog matches; 36 contract tests and 35 API-client tests passed.

corepack pnpm architecture:check
exit 0 — 18 canonical boundaries and 17 package manifests passed.

corepack pnpm test:encounters:scope
exit 0 — 3 frozen-scope tests passed.

corepack pnpm exec prettier --check services/api/src/routes/feature-010-encounters.ts services/api/src/modules/feature-010/encounters.ts services/api/src/adapters/postgres/feature-010-encounters.ts services/api/src/app.ts services/api/src/routes/feature-010-encounters.contract.test.ts services/api/test/feature-010-update.integration.test.ts tools/run-feature-010-postgres-test.mjs
exit 0 — all matched files use Prettier code style.

git diff --check
exit 0.

pnpm verify and live Arabic/English acceptance were not run for this backend implementation checkpoint.
