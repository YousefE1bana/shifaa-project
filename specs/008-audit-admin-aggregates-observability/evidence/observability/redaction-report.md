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

- `tools/verify-feature-008-evidence.mjs`: `8b3e0f87d3db3ed97cdde3878e84b4c4bee753c3e0b01f1f900bf873b5b24869`
- `packages/observability/src/audit-admin.ts`: `869aa7f27b17e61f80270997bd4208f37667736fa929c3736417dad7b6cc5f09`
- `packages/observability/src/audit-admin.test.ts`: `c76b3c795960d1b683615a5bcddc179d97ca007c83ac2bf59e721353f67b14d8`
- `services/api/test/audit-admin-observability.integration.test.ts`: `3ce8c21a8a8ddb40e9e18d12366a7c7d948c8b03d13741dc881c7a2ab4f4ce5c`
- `apps/admin/src/app/AdminAuditSession.tsx`: `1cd28d0c5eb06bd49921e52c3c94cd8ea123741a271eec499990101abdffc294`
- `apps/admin/src/app/audit/AuditWorkspace.tsx`: `73899d9459292912440faadfcb0acc843e06328d68e1e04e5b017ecda8d4838a`
- `apps/admin/test/audit-workspace.test.ts`: `25d56e02e13856d9dcadf9701286991b708a56b6e061548e9704b23fc1d0f941`
- `services/worker/src/audit-export.test.ts`: `af41152f69c532b2e8aa66fae0692946f53a62e0d613a9e4941662b67fa88ce4`
- `packages/core/src/audit-admin/aggregate-policy.test.ts`: `66f5ce90f89914888f4f9a4d5bdf598b32f4e8a221fd194163260b12c4767949`
