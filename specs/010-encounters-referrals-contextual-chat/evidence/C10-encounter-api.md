# C10 encounter create/read API evidence

Date: 2026-09-29. Checkpoint: T028–T030 / issues #335–#337. All fixtures are synthetic; this checkpoint does not authorize production clinical traffic.

## T028 RED

- `corepack pnpm --filter @shifaa/api exec vitest run src/routes/feature-010-encounters.contract.test.ts` failed on `Cannot find module './feature-010-encounters.js'` after the HTTP test parsed. The missing C10 route module, rather than test syntax or a fixture, caused RED.
- The transaction-scoped non-owner SQL fixture ran against an isolated Supabase scratch database and failed with `F010 C10 RED: missing locked API mutation boundary clinical.create_encounter_api_v1(jsonb)` (psql exit 3). Fixture setup completed before the explicit absent-boundary assertion; the scratch database was dropped.

## T029 boundary and behavior

The Core API registers only `createEncounter` and `getEncounter` on the two approved routes. The create adapter invokes a new narrow SQL entrypoint in forward migration `20260929001001_f010_c10_encounter_api.sql`; it reuses the C05 locked producer and C07 live authorization, and the same transaction stores the one encounter/appointment/queue transition, audit event, minimal outbox marker, and canonical idempotent response. Identical key/body replay returns that stored body without a second effect; changed-body reuse conflicts. The online role is non-owner `shifaa_api`; no table DML or client workforce IDs are accepted through the API.

`getEncounter` probes only server-controlled roles under C07 current-authority checks and returns approved base/participant fields. Private note bodies and metadata are not returned by this C10 route. An explicit `fields=notes` request fails closed with `dependency-unavailable` (503) until C12 delivers the authorized encrypted-note body projection. This staged response is not a claim that the full Feature 010 note read is implemented. The approved GET operation's per-operation stable-code list does not enumerate generic `validation-failed` (422) or this staged dependency response; its global RFC 9457 Problem response does define validation failure. This contract metadata gap remains for later canonical reconciliation, without editing approved authority in C10.

The C07 regression fixture now sets historical synthetic relationship start dates and a relative invitation expiry because its prior hard-coded expiry fell behind the real PostgreSQL clock. The C10 fixture uses the same test-only pattern. No production authority rule or historical migration changed.

## T030 focused verification and root review

```text
corepack pnpm --filter @shifaa/api exec vitest run src/routes/feature-010-encounters.contract.test.ts   exit 0; 8/8
corepack pnpm --filter @shifaa/api typecheck                                           exit 0
corepack pnpm contracts:check                                                          exit 0; 97 catalog/OpenAPI matches, 36 contract and 35 client tests
corepack pnpm architecture:check                                                       exit 0; 18 boundaries, 17 manifests
corepack pnpm test:encounters:scope                                                     exit 0; 3/3 frozen-scope tests
corepack pnpm test:clinic-scheduling:contract                                           exit 0; F009 18-operation contract
PowerShell: $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; corepack pnpm test:encounters:schema  exit 0; C07 RLS, C08 races/F009 parity, C10 vectors, fresh/replay migration
PowerShell: $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; $env:SHIFAA_TEST_F010_C10_ONLY='true'; corepack pnpm test:encounters:schema  exit 0; C10 non-owner vectors
corepack pnpm format:check                                                              exit 0
git diff --check                                                                        exit 0
```

The SQL matrix checks same-key/same-body canonical replay, same-key/changed-body conflict, a separate-key stale attempt, missing/mismatched queue, arbitrary workforce ID, low AAL, missing purpose, unrelated clinician, PAT/GUA/DEL/CLN read projections, and exactly one completed idempotency record, domain triple, audit event, and outbox event after all negative paths. The HTTP suite checks route inventory, closed input, synthetic-session/AAL/purpose gate, no-store, different-body hashing, requested participants, private-note exclusion, and stale-state error mapping. Root reviewed the complete C10 diff: no C11+ route, participant-add path, Feature 011 work, approved spec/plan/OpenAPI edit, historical migration edit, or later-gate closure. Full `pnpm verify` was intentionally not run at this checkpoint.
