# C13 completion evidence

## T037 RED

- The route integration test was added before the handler. Running `corepack pnpm --filter @shifaa/api exec vitest run test/feature-010-completion.integration.test.ts` produced 7 failures with `POST /v1/encounters/:encounterId/complete` returning 404; this was the missing C13 route behavior.
- The isolated real-PostgreSQL RED probe applied the approved F010, C10, C11, and C12 migrations. It first confirmed `clinical.complete_encounter_v1(uuid,integer,jsonb)` existed, then failed specifically with `F010_C13_MISSING_API: clinical.complete_encounter_api_v1(uuid,integer,jsonb)`.

## T038 implementation

- Added one forward migration, `20260929001004_f010_c13_encounter_completion.sql`, and appended it once to `db:migrate`.
- The API wrapper calls the existing C05 locked producer exactly once for a new request; it stores the canonical encounter, appointment, and queue IDs/versions with one idempotency response, audit record, and outbox event. Exact replay checks the request hash first and then reauthorizes current responsible-clinician membership without requiring the encounter to remain open.
- Added the `POST /v1/encounters/:encounterId/complete` route and PostgreSQL adapter. `If-Match` supplies the expected encounter version; the idempotency hash covers the request body.

## T039 verification

- Focused C13 PostgreSQL runner, separately on `shifaa-local-postgres` and `shifaa-local-supabase`: passed. Each run used an isolated scratch database and verified zero optional references, stale/invalid/unauthorized rejection without partial effects, triple completion and returned versions, exact canonical replay after completion, changed-body conflict before live-authority recheck, replay denial after membership suspension, immediate chat read/send denial, and exactly-once idempotency/audit/outbox effects.
- Real PostgreSQL concurrency on each runtime: both contenders waited on the appointment lock; one completed, one received SQLSTATE `40001`, and the final encounter/appointment/queue plus idempotency/audit/outbox state had exactly one completion.
- Full focused Feature 010/PostgreSQL regression runner, `corepack pnpm exec node tools/run-feature-010-postgres-test.mjs`: passed serially on both runtimes, including C05 schema/lifecycle/storage/RLS checks, C10 create/read, C11 updates, C12 note signing/projections, C13 vectors and migration replay, F009 regressions, and the existing C08 concurrency regressions. F010 schema assertions reported forced RLS `6/6`, six policies, and zero direct online ACL entries.
- API and route tests: 6 files, 29 tests passed. This included the C10 route contract, C11 update, C12 note/adapter, and C13 route/adapter tests.
- `corepack pnpm --filter @shifaa/api typecheck`: passed.
- `corepack pnpm contracts:check`: passed (97 OpenAPI operations; contracts 36/36, API client 35/35).
- `corepack pnpm architecture:check`: passed (18 boundaries, 17 package manifests).
- Prettier check of changed JSON, TypeScript, and JavaScript files: passed.

The standalone `shifaa-local-postgres-postgres-1` container was `Exited (0)` before verification; it was started without resetting or deleting persistent runtime data. `pg_isready` confirmed it was accepting connections. No full `pnpm verify` was run.
