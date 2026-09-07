# Feature 008 prohibited-sentinel and redaction report

Status: PASS with zero prohibited values and zero high-cardinality identifier labels. This is synthetic graduation-engineering evidence only; it does not inspect or authorize a production dataset.

## Executed coverage

- API: focused route tests verified private no-store responses, RFC 9457 failures, redacted audit list/detail shapes, and omission of internal export bytes, credentials, proof material, and adapter failure detail.
- UI: live dashboard/audit state evidence and every committed PNG were byte-scanned. The UI displayed redacted evidence only, with no PHI, no raw metadata, and no suppressed or released exact counts.
- Logs and traces: all five Feature 008 telemetry contexts accepted only structured request/trace correlation plus fixed enum fields; arbitrary payload fields were dropped.
- Metrics: the projection retained only bounded low-cardinality labels for surface, operation, outcome, reason, policy version, and duration bucket. Correlation IDs and arbitrary identifier labels were rejected.
- Cache metadata: the API exposes only fixed private `no-store`, `no-cache`, referrer, language, and request-correlation headers. No request body, principal, cursor, event identifier, or export material is used as cache metadata.
- Exports: canonical serialization and immutable-object tests reject changed bytes, digest, proof, range, state, and manifest data. Telemetry exposes none of that integrity material.
- Evidence: the Feature 008 API, UI, core integrity, observability, worker, and evidence roots were scanned against all 10 registered prohibited sentinel values, including binary screenshots.

## Privacy conclusions

- There are no tokens, signed URLs, hashes, cursors, or free text in telemetry.
- Suppression outcomes disclose only fixed reason codes; neither a protected value nor a count-derived label is emitted.
- Audit event identifiers remain bounded response evidence and opaque client inputs, never metric labels.
- Export object bytes, keys, credentials, digests, retention proof, and manifest content stay outside logs, traces, metrics, UI, and cache headers.
- The runtime scanner deliberately reads the canonical sentinel registry, then scans only release surfaces; the sentinel registry and the tests that inject those values are excluded as test sources rather than treated as release artifacts.

## SHA-256 bindings

- `tools/verify-feature-008-evidence.mjs`: `c93c2c53e2ca3c475904664ce0b728a9fb8af9a4caa1428d3ff28eb9b068e662`
- `packages/observability/src/audit-admin.ts`: `869aa7f27b17e61f80270997bd4208f37667736fa929c3736417dad7b6cc5f09`
- `packages/observability/src/audit-admin.test.ts`: `c76b3c795960d1b683615a5bcddc179d97ca007c83ac2bf59e721353f67b14d8`
- `services/api/test/audit-admin-observability.integration.test.ts`: `299d2ced29060c7a3157a0f5767bc5b6581cd376f1385d43ed1795a411687bdf`
- `apps/admin/src/app/audit/AuditWorkspace.tsx`: `3f77b8e9d63f3f4c0e2e2928424c5632872fe6fd1d55c60f36b7c9cf34b2d29f`
- `apps/admin/test/audit-workspace.test.ts`: `d460f3013ad8642208adbd1b5b0b300ac05abacb9451b7fa5ac5cc0353eeb747`
- `services/worker/src/audit-export.test.ts`: `9887642065f98f5b464dd8ddf2c079957185c92fd7ff2979a9e3dce81ae457ef`
- `packages/core/src/audit-admin/aggregate-policy.test.ts`: `4766b3fc400db7310d8ed4a2d68ad28a1d1f6872279b5b0cf6a32fc894405db7`
