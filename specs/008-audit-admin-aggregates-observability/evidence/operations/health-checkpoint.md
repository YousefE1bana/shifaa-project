# Feature 008 liveness and readiness checkpoint

Status: PASS for the synthetic graduation-engineering checkpoint. This evidence demonstrates local policy and route behavior only; it does not claim production network controls, production monitoring, or operational approval.

## Executed evidence

- `corepack pnpm --filter @shifaa/api test -- health-readiness`: passed the focused health-policy cases; the configured test command reported 179 passing tests and 40 intentional skips across its loaded API suite.
- `corepack pnpm --filter @shifaa/api test:integration -- audit-admin-health`: passed 62/62 tests across the registered integration set, including 10/10 private health route cases.
- `corepack pnpm --filter @shifaa/api typecheck`: passed.
- `node tools/verify-feature-008-contract.mjs --implemented all`: passed with exactly seven registered operations.

## Independently demonstrable health states

- `healthLive` is exposed only when `health.exposure` is enabled. After that control lookup, it returns `live` without invoking readiness, outbox, audit-chain, or export-proof checks.
- `healthReady` returns `ready` only when database, outbox, audit integrity, and export proof are safe.
- A bounded `outbox_backlog` returns `degraded` while retaining a successful probe response.
- `database_unavailable`, `outbox_integrity_failed`, `audit_integrity_failed`, or `export_proof_failed` produces a `not_ready` operational signal and the contracted generic RFC 9457 `service-unavailable` response; thrown and timed-out checks also fail closed.
- Both operations require the exact private-network `service:platform-probe` identity. Missing/wrong credentials, public-source requests, and worker principals are denied.
- Probe abuse is rate-limited before service invocation.

## Operational-signal and privacy assertions

Health telemetry uses only request/trace correlation plus the fixed `health`, operation, outcome, reason, and duration-bucket vocabulary. Responses and telemetry contain no credential, secret, hostname/topology, SQL text, outbox payload, clinical payload, patient/facility identifier, raw hash, or arbitrary error detail.

## SHA-256 bindings

- `services/api/src/modules/audit-admin/health-service.ts`: `7b2cc772e6c7bcbb60153095be0090707cda5193050c14a5f1237d16365632c3`
- `services/api/src/routes/audit-admin.ts`: `8cce87859706e5183dcc1423158ad701d6865077be43681be573a5b1bafcdbe2`
- `services/api/test/health-readiness.test.ts`: `89b7c401222f45023d939eee54d8f06eec1e6ad13064ff26d04c76c91e090138`
- `services/api/test/audit-admin-health.integration.test.ts`: `095f8958fe4b04eb487b223ab586a207d52c6547409c4e792968cddfae7f3a93`
- `packages/observability/src/audit-admin.ts`: `869aa7f27b17e61f80270997bd4208f37667736fa929c3736417dad7b6cc5f09`
