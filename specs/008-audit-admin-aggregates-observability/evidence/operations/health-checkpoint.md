# Feature 008 liveness and readiness checkpoint

Status: PASS for the synthetic graduation-engineering checkpoint. This evidence demonstrates local policy and route behavior only; it does not claim production network controls, production monitoring, or operational approval.

## Executed evidence

- `corepack pnpm --filter @shifaa/api test -- health-readiness`: passed the focused health-policy cases; the configured test command reported 179 passing tests and 40 intentional skips across its loaded API suite.
- `corepack pnpm --filter @shifaa/api test:integration -- audit-admin-health`: passed 62/62 tests across the registered integration set, including 10/10 private health route cases.
- `corepack pnpm --filter @shifaa/api typecheck`: passed.
- `node tools/verify-feature-008-contract.mjs --implemented all`: passed with exactly seven registered operations.

## Independently demonstrable health states

- `healthLive` is process-only and returns `live` without invoking database, outbox, audit-chain, or export-proof checks.
- `healthReady` returns `ready` only when database, outbox, audit integrity, and export proof are safe.
- A bounded `outbox_backlog` returns `degraded` while retaining a successful probe response.
- `database_unavailable`, `outbox_integrity_failed`, `audit_integrity_failed`, or `export_proof_failed` produces a `not_ready` operational signal and the contracted generic RFC 9457 `service-unavailable` response; thrown and timed-out checks also fail closed.
- Both operations require the exact private-network `service:platform-probe` identity. Missing/wrong credentials, public-source requests, and worker principals are denied.
- Probe abuse is rate-limited before service invocation.

## Operational-signal and privacy assertions

Health telemetry uses only request/trace correlation plus the fixed `health`, operation, outcome, reason, and duration-bucket vocabulary. Responses and telemetry contain no credential, secret, hostname/topology, SQL text, outbox payload, clinical payload, patient/facility identifier, raw hash, or arbitrary error detail.

## SHA-256 bindings

- `services/api/src/modules/audit-admin/health-service.ts`: `3c3d8fa73e53ccff96483d36d0ecbb747ab2110902169edde577ce8d47a82d41`
- `services/api/src/routes/audit-admin.ts`: `455d8618c1907fefee336242583907306a053a3dfa67f4dbb3afb0f6419ebca8`
- `services/api/test/health-readiness.test.ts`: `d2c6015eab74492bc519dcdc3272bed103a6a16304af91b6b7ceff43f6e007f4`
- `services/api/test/audit-admin-health.integration.test.ts`: `1b6aee41774d1a92338d9b92f8d3a887d088376413adac44617c31bd8c5c4f1e`
- `packages/observability/src/audit-admin.ts`: `869aa7f27b17e61f80270997bd4208f37667736fa929c3736417dad7b6cc5f09`
