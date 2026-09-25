# Feature 009 security review

## Scope and conclusion

This is a bounded implementation review for T073, mapped to applicable OWASP ASVS Level 2, the applicable sensitive-health-data controls, and OWASP API Security Top 10 themes. It is not an ASVS certification, legal assessment, healthcare-framework certification, penetration test, or production security acceptance. The approved Feature 009 artifacts do not name a separate health-data L3 profile; this review records the relevant privacy, access-control, audit, and data-minimization controls without claiming certification.

No reportable high or critical Feature 009 finding has been identified in the reviewed paths. Lower-level and deployment limitations are listed below. Previously closed SEC items were not reopened absent new evidence.

## Evidence matrix

| Area | Evidence reviewed | Result and boundary |
|---|---|---|
| Authentication, authorization, and enumeration | `services/api/src/routes/clinic-scheduling.ts`; `services/api/src/modules/clinic-scheduling/service.ts`; `infra/db/tests/clinic-scheduling-rls.sql` | Synthetic identity is accepted only in synthetic mode; non-synthetic requests fail closed. Route/actor context is server-derived. Missing/inactive authorization and database permission/not-found outcomes are concealed as not-found. SQL matrix checks patient/guardian and staff context, current purpose/action/AAL, membership and relationship revocation, and that denied calls do not mutate appointment/audit/outbox/idempotency state. |
| RLS, grants, SECURITY DEFINER, and search path | `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`; `infra/db/tests/clinic-scheduling-rls.sql` | The fixture checks all six clinical tables for enabled and forced RLS, no direct table grants to PUBLIC/API/worker, API/worker roles without superuser or BYPASSRLS, fixed search paths on exposed SECURITY DEFINER functions, and no PUBLIC execute on mutation/helper functions. It exercises direct-select denial for API, service, and worker roles and verifies minimum patient projections. The serial RLS command passed; its exact outcome is recorded below. |
| Injection and input validation | `services/api/src/adapters/postgres/clinic-scheduling-service.ts`; `services/api/src/modules/clinic-scheduling/service.ts`; Feature 009 PostgreSQL fixtures | Adapter calls use parameterized postgres tagged templates. The migration's dynamic SQL is limited to a static service-role revoke and an identifier quoted with `%I`; no request-derived SQL fragments were found in the reviewed paths. Domain validation bounds and validates request fields before persistence. Appointment reasons reject empty, oversized, and control-character input before authorization/persistence. Focused API and PostgreSQL outcomes are recorded below. |
| Replay, races, and atomic effects | Feature 009 PostgreSQL fixtures and serial API/E2E evidence | Database idempotency and booking/race checks are included in the focused DB mode. Same-key mutation effects are recorded transactionally; denied authorization tests assert no appointment, audit, outbox, or idempotency side effects. Exact outcomes are recorded below. |
| Reason redaction, projections, logs, and outbox | `services/api/src/modules/clinic-scheduling/service.ts`; `services/api/src/adapters/postgres/clinic-scheduling-service.ts`; `infra/db/tests/clinic-scheduling-rls.sql`; notification worker SQL/adapter | Reason is persisted only through a bound parameter and excluded from patient-minimum projections; outbox/notification fields are bounded and do not carry reason or raw contact/token data. RLS fixture asserts sensitive keys such as reason/contact/phone/token and identifying scope IDs do not appear in the minimum patient projection. |
| Dependencies and secrets | `package.json`, `pnpm-lock.yaml`, repository `dependencies:check` and `secrets:check` scripts | The exact dependency and secret-check commands and results are recorded below. No credentials or real health data were introduced by this review. `pnpm dependencies:check` transiently rewrote `pnpm-workspace.yaml` from `auditConfig: {}` to `auditConfig: { ignoreGhsas: null }`; I restored the original line immediately after observing it. The null setting did not add an ignored advisory, and the audit output reported none. |
| Production adapter and vendor boundary | `services/api/src/routes/clinic-scheduling.ts`; worker adapter and Feature 009 roadmap/open gates | Production authentication/provider behavior is not represented by the synthetic adapter. Production SMS remains disabled and vendor delivery semantics are not asserted. Local rate limiting is process-memory scoped and does not establish a production distributed abuse control. |

## Commands and outcomes

| Command | Outcome |
|---|---|
| `corepack pnpm test:clinic-scheduling:security` | PASS, exit 0. The alias ran `node tools/run-clinic-scheduling-postgres-test.mjs rls`: `PASS mode=rls databases=1`; `node tools/verify-secrets.mjs`: secret and synthetic-fixture verification passed; `node tools/verify-architecture.mjs`: passed for 18 canonical boundaries and 17 package manifests; `node tools/verify-feature-009-evidence.mjs --security`: evidence verifier passed. |
| `corepack pnpm test:clinic-scheduling:db` | PASS, exit 0. Vitest: 1 file and 8 tests passed; PostgreSQL runner: `PASS mode=all databases=1`. This mode includes the serial booking/idempotency race checks. |
| `corepack pnpm --filter @shifaa/api exec vitest run src/modules/clinic-scheduling/service.test.ts src/modules/clinic-scheduling/service.reads.test.ts src/modules/clinic-scheduling/types.test.ts src/routes/clinic-scheduling.contract.test.ts src/adapters/postgres/clinic-scheduling-service.test.ts` | PASS, exit 0; 5 files and 53 tests passed. |
| `corepack pnpm test:clinic-scheduling:notifications` | PASS, exit 0; 51 tests passed, 0 failed, 0 skipped. Includes bounded retries/replay deduplication, closed notification projection, no raw reason dispatch, migration grants, and production adapter fail-closed checks. |
| `corepack pnpm test:clinic-scheduling:contract` | PASS, exit 0; the Feature 009 OpenAPI contract verified at 3.1.1 with 18 operations and the canonical closed projections/cache/error-contract checks. |
| `corepack pnpm dependencies:check` | PASS, exit 0; no peer dependency issues, no new vulnerabilities ignored, Expo dependency verification passed for 10 installed patient dependencies. |
| `corepack pnpm test:clinic-scheduling:e2e` | T072 result reported by the root reviewer: 13 passed, 0 skipped, using serial provisioned databases. Not rerun in this T073 review. |

## Findings and limits

- **High/Critical:** None identified in the reviewed Feature 009 scope after the recorded focused checks passed.
- **Production limit:** Feature 009 remains synthetic-only. This review does not prove production identity-provider integration, distributed rate limiting, SMS delivery, PHI handling, legal compliance, or vendor controls. The route limiter is process-memory scoped. Production traffic and messaging remain disabled by the current boundary; these controls require production-specific acceptance before enablement. No vendor evidence or production claim is made.
- **Assurance limit:** This is a scoped repository review mapped to applicable controls, not an external assessment or certification.
