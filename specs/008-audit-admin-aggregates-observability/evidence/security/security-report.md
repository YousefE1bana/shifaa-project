# Feature 008 security hardening report

Status: PASS with zero unresolved reportable high or critical findings. This is synthetic graduation-engineering evidence only and does not claim production authorization, legal approval, WORM certification, or a repository-wide security audit.

## Executed Feature 008 matrix

- `corepack pnpm test:audit-admin:rls`: passed with `authorized=1 denied=13 worker_exact=1 direct_tables=denied force_rls=3 bypass_roles=0`.
- Focused API unit/integration matrix: passed 54/54 across summary, audit list/detail, export request/orchestration, service authentication, health, and readiness.
- Core disclosure and integrity matrix: passed 47/47, including all approved privacy boundaries and content/order/hash/digest/manifest tampering.
- Audit export worker matrix: passed 8/8 for exclusive claiming, replay, lease recovery, bounded retry, dead letter, proof mismatch, and redacted telemetry.
- Observability matrix: passed 9/9 with prohibited sentinels absent and identifier/high-cardinality labels rejected.
- Audit/export E2E matrix: passed 6/6 for AAL2, purpose, role, cursor, redaction, idempotency, replay, and offline denial.
- `corepack pnpm secrets:check`, `corepack pnpm architecture:check`, and the Feature 008 contract verifier passed after the two findings below were corrected.

## Authorization, storage, and API conclusions

- Audit reads and export requests require a current `super_admin`, AAL2 no older than 300 seconds, and `security.audit.review`; general DPO and every other role remain denied.
- The exact worker identity is required for claim/completion. Platform health probes cannot act as export workers, and workers cannot use admin read/export-request functions.
- `audit.events`, `audit.signature_evidence`, and `audit.export_batches` retain `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`. `PUBLIC`, API, and worker roles have no direct table grants; online roles remain non-owner, non-superuser, and without `BYPASSRLS`.
- Same-key/same-body replay is stable, changed-body reuse conflicts, concurrent requests collapse, and tampered content/order/hash/digest/manifest/proof/state fails closed.
- The registered Feature 008 surface remains exactly seven operations. No route, role, table grant, function grant, or service-role shortcut was added.

## Findings corrected

1. The secret scanner rejected a bearer-shaped synthetic literal in the Feature 008 API integration fixture. The fixture now constructs the synthetic authorization header without embedding a credential-shaped literal; the scanner remains unchanged.
2. The architecture gate rejected a relative cross-workspace import in the observability test. The test now consumes the declared `@shifaa/test-kit/audit-admin-fixtures` export with an explicit workspace development dependency.

## SHA-256 bindings

- `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`: `efbf610943261114e1adc2ea84fbb9c247fdf7f10055e2c67fb8d8d96d830d99`
- `tools/run-audit-admin-postgres-test.mjs`: `4822e2c9f34f8f67f77efb0539f63f42696044e9410a6b376ff9b35a6dbaacea`
- `packages/core/src/audit-admin/audit-integrity.test.ts`: `23c81cf9d89978c9c3cf15f88e0f317ead1f42999b94680c9030f05e5e048d7c`
- `services/api/test/audit-admin-observability.integration.test.ts`: `299d2ced29060c7a3157a0f5767bc5b6581cd376f1385d43ed1795a411687bdf`
- `services/api/test/audit-export-service-auth.integration.test.ts`: `1d6f50c1875a90f4f6bbc86fb4beb50037e9803d58ecaf761a6a9ce8b29a0024`
- `services/worker/src/audit-export.test.ts`: `9887642065f98f5b464dd8ddf2c079957185c92fd7ff2979a9e3dce81ae457ef`
- `packages/observability/src/audit-admin.test.ts`: `c76b3c795960d1b683615a5bcddc179d97ca007c83ac2bf59e721353f67b14d8`
