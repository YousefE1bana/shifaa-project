# Final 006 security evidence

**Boundary:** seeded-synthetic engineering only. No production map, capacity, messaging, emergency-dispatch, PHI, or provider integration is enabled.

## Result

The final authorization/RLS/emergency-privacy/concurrency/geospatial review found **0 unresolved reportable CRITICAL and 0 unresolved reportable HIGH findings**. The clean repository verification and exact PR HEAD are recorded in `../verification.md`.

Evidence exercised:

- forced RLS for subject, delegate, unrelated actor, current hospital membership, facility, purpose, AAL2, worker, forged/revoked context, and denied audit paths;
- atomic idempotency, optimistic versions, one active incident, one-winner acceptance/close/share races, one-use digest-only share capability, and no-store/no-referrer redaction;
- GiST-prefiltered WGS84 matching, verified/current licenses, fresh aggregate capacity, stable ordering, no-match fallback, and fail-closed feature controls;
- committed outbox contact fan-out with current-consent/precision recheck, durable digest-only synthetic receipt, crash/retry/dedup/DLQ behavior, and a worker-only forced-RLS function;
- trusted-network plus actor rate buckets for every protected mutation, stricter SOS creation and public share bounds, bounded bucket memory, and visible `123` fallback;
- Docker Scout SARIF with zero HIGH/CRITICAL results for the local PostGIS derivative and repository CycloneDX SBOM SHA-256 `95bf05cee1d3ff7a04f49dc3e5648337706adf277d656e7c545688b408386007`.

## Residual bounded limitations

- An external messaging provider could change consent after the worker's final database recheck but before a hypothetical provider accepts a send. Production messaging is absent and blocked by `OPEN-VENDOR-002`; a production adapter must define cancellation/consent semantics and DPA/SLA evidence before enablement.
- Standards-valid field INP was not observable through untrusted automation events. The declared lab proxy passes the engineering input threshold, while `OPEN-TECH-003` retains formal harness acceptance.
- Local/CI PostGIS image selection and zero-HIGH/CRITICAL scan do not establish byte-reproducible multi-platform production approval; `OPEN-TECH-001` remains open.

No residual item authorizes production use or constitutes an emergency guarantee.
