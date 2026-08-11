# Security validation

Result: PASS for seeded-synthetic engineering scope.

Codex Security diff scan `c1dcdc9c-4bbf-41c5-9a26-1ccc5afb83f4` completed and sealed at `2026-08-11T06:36:10Z` with complete coverage of 91 changed source-like files. Snapshot digest: `codex-security-snapshot/v1:sha256:705d8e66bb20895d06bcb49266608c99f9cd5b96f62943faade769146b45c00c`. It reported 12 low-severity findings after calibration to the `OPEN-SEC-001` production gate. Every finding was nevertheless treated as actionable and remediated:

- evidence remains quarantined until an explicit non-HTTP seeded scanner transition;
- membership roles are a closed profession set and must match the current subject-owned verified license;
- membership patch and acceptance revalidate role, license, facility, validity, and invite expiry;
- facility submission requires AAL2;
- grant/revocation triggers bind proposer and decider attribution to the current database actor;
- evidence and license reviewer RLS requires exact role, AAL2, and purpose;
- worker envelopes use a closed allow list with recursive redaction;
- concurrent duplicate worker deliveries share one in-flight receipt operation.

- `pnpm secrets:check`: PASS; secret patterns and synthetic-fixture policy.
- `pnpm dependencies:check`: PASS; peers, high-severity audit, Expo dependency alignment.
- `pnpm sbom:generate`: PASS; CycloneDX artifact generated locally.
- `git diff --check`: PASS.
- TypeScript/lint and contract/architecture gates: PASS at the recorded focused gates; full final gate is recorded separately.
- Forced-RLS SQL: PASS for cross-facility, wrong role, AAL1, missing/exact purpose, forged decider UUIDs, four-eyes, direct revoke, and facility/professional review-purpose separation.
- Local Supabase runtime: PASS; real private objects uploaded to both 003 buckets, owner fetch allowed, anonymous list and unrelated fetch denied.
- Idempotency: real PostgreSQL test committed exactly one facility, membership, audit, outbox, and stored replay response; changed payload returned 409.
- Redaction: recursive worker and observability tests contained zero raw number/document/object/token/address sentinel.

Post-remediation verification passed the clean Compose migration/schema/RLS stack, 14 API integration tests, 5 real-server E2E probes, 7 connected Supabase runtime tests, contract and architecture drift checks, secret scanning, dependency audit, and worker concurrency/redaction tests. No unresolved reportable HIGH or CRITICAL finding remains; `OPEN-SEC-001` remains open.
