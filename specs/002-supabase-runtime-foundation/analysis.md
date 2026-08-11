# SpecKit Analysis: Supabase Runtime Foundation

## Pre-implementation analysis — 2026-08-11

| Check                      | Result                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope eligibility          | PASS — all 25 referenced FR/NFR IDs exist in active PRD v2.1.0; no deferred/reserved ID                                                                 |
| Specification completeness | PASS — mandatory metadata, scope, regulatory, journeys, requirements, data/RLS, API, UI, security, acceptance, operations and approval sections present |
| Clarification              | PASS — no unresolved technical/product choice; production blockers remain explicit                                                                      |
| Constitution               | PASS for local seeded-synthetic execution; production/formal gates remain blocked                                                                       |
| Spec/plan/tasks trace      | PASS — every runtime behavior maps to an active requirement and implementation/verification task                                                        |
| Public contract drift      | PASS — no new endpoint/payload/screen/FR is proposed                                                                                                    |
| Client boundary            | PASS — Core API only; direct domain PostgREST/Storage access prohibited and tested                                                                      |
| Task graph                 | PASS — 12 monotonically numbered tasks, explicit dependencies, paths and deterministic evidence                                                         |

**Decision:** implementation may begin for local seeded-synthetic use. This is not production approval.

## Post-implementation analysis

### Findings resolved during implementation

| Severity | Finding                                                                                                                                                                                                                                         | Resolution and evidence                                                                                                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | The first PostgreSQL idempotency design held a database transaction open while calling external Supabase Auth or Storage. A slow provider could exhaust the pool and could not make the external side effect atomic with the database mutation. | External preparation now runs outside the domain transaction. A short reservation transaction coordinates concurrent same-key requests; the SHIFAA mutation, audit event, outbox event, and stored response then commit atomically. The real-stack race test proves one domain/audit/outbox effect and identical replay responses. |
| MEDIUM   | Registration wording required the internal mapping only “after verified authentication,” while the accepted product journey creates the patient shell before OTP and withholds the session until verification.                                  | The specification now states the exact boundary: Supabase must accept registration before the atomic internal mapping is created; no protected session is issued until OTP succeeds.                                                                                                                                               |
| MEDIUM   | Live review initially returned no joined identity projection because the reviewer RLS policy covered cases but not the constrained identity row.                                                                                                | Added a security-definer assigned-review predicate with a fixed `pg_catalog`-only search path and minimum masked projection; browser and negative RLS tests pass.                                                                                                                                                                  |

### Final consistency and verification matrix

| Check                          | Result                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope and traceability         | PASS — every task references active PRD IDs; no endpoint, screen, user story, or FR/NFR was added.                                                                                               |
| Spec/plan/tasks/implementation | PASS — all runtime behavior is covered by T001–T011; T012 is the publication/CI closeout task.                                                                                                   |
| Constitution                   | PASS for seeded-synthetic local execution; formal/production gates remain explicitly blocked by `OPEN-TEAM-001`, `OPEN-SEC-001`, and `OPEN-LEGAL-001/002/007`.                                   |
| Runtime boundaries             | PASS — UI packages cannot import database/Supabase domain clients; API uses strict ES256 JWKS verification, a bounded non-owner pool, forced RLS, and private Storage.                           |
| Atomicity/idempotency          | PASS — external calls occur outside short database transactions; mutation/audit/outbox/response commit together; concurrent same-key replay is tested against the real stack.                    |
| Live browser                   | PASS — Arabic RTL and English LTR registration, real Mailpit OTP, identity submission, privacy/consent, profile, admin masked review queue, and API restart persistence were driven in browsers. |
| Supabase integration           | PASS — `pnpm supabase:test` reset the local project and passed 5/5 real-stack tests.                                                                                                             |
| Repository verification        | PASS — `pnpm verify` passed formatting, lint, typecheck, build, tests, E2E, contracts, architecture, secrets, dependency audit, migrations, schema, and RLS.                                     |

**Decision:** the implementation is technically complete for the explicitly authorized local seeded-synthetic scope. It is not production-approved and does not close any legal, security-policy, staffing, or production-residency open item.
