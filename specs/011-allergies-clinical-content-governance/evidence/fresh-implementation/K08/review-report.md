# Feature 011 K08 prerequisite remediation and checkpoint review

K08 is ready for Product Owner review. T030–T034 remain unchecked; Issues #427–#431 remain open. Execution stops before K09. This report records renewed evidence separately from preserved K05/K06/K07 acceptance history.

## Prerequisite defects and minimum corrections

- Signing SQL persisted a generated signature UUID without returning the existing generated response. The INSERT-returned identity and persisted signing time now populate the exact existing `SignReleaseResponse` in private SQL result metadata. No public schema changed.
- Assigned-review SQL had an ambiguous `reviewer_capacity`. A named PL/pgSQL block and explicitly qualified designation-capacity comparisons remove SQLSTATE 42702 without expanding projection fields.
- Already-committed retries validated fresh producer inputs before the authorized replay branch, causing SQLSTATE 22023 when those inputs were intentionally absent. Existing authority/lock checks remain; only fresh-input validation moves into the fresh branch. All five existing entrypoints expose one exact private missing-preparation error after authoritative idempotency settlement. The adapter recognizes only that exact SQLSTATE/message as absence; errors, in-progress claims, hash mismatch and authority denial remain fail closed.
- Test-only repairs corrected ESM schema-registry use, scoped synthetic PHA disclosure setup, preflight qualification, postgres JSONB parameter encoding, and the private `test_vectors` to approved `testVectors` mapping. No table privilege, public operation, RLS policy, signing independence, evidence binding, or metadata boundary was weakened.

Exact before/after SQL hashes are in `prerequisite-remediation/authorization.json`; all current migration hashes are in `review-summary.json`. Four consumer migrations changed; storage, receipt SQL, RLS/grants, approved Spec/Plan/OpenAPI and generated/vector contracts did not change.

## Renewed prerequisite proof

| Verification | PostgreSQL 17.11 | Supabase PostgreSQL 17.6 |
| --- | --- | --- |
| K05 storage, supporting-provenance lifecycle, predecessor preservation | PASS | PASS |
| K06 45 component checks and all-five mutation/projection sweep | PASS | PASS |
| T027 46 invariants, 157 actual-role probes, 45 behavior cases | PASS | PASS |
| T027 frozen V01–V07 bytes/hashes and 16 canonical negatives | PASS | PASS |
| T028 complete 12-category independent-session race matrix | 12/12 PASS | 12/12 PASS |

The renewed T029 P1–P5 assertion is bound to the current inputs: 122 physical inputs and 123 including the race source. Yousef Osama's already-authorized API/Data/QA disposition is limited to Feature 011 P5. OPEN-TECH-002 remains globally OPEN. The new decision is `decisions/k08-prerequisite-p5-revalidated-2026-10-07.md`.

The race proof includes allocation, authority/CAS and revoke-first/action-first, allergy, independent signing, root/successor lineage, effective time after waiting, idempotency, receipt faults, and actual facility/continuity/encounter predecessor-writer matrices. Sessions use deterministic barriers and observed pg_locks; durable counts/history and cleanup are asserted. Original K07 proof bytes and acceptance records remain preserved.

## T030–T034

- **T030 valid RED:** 32 compiled tests; 25 reached explicit intended missing producer behavior, while 7 negative scaffold assertions passed. Import/setup/SQL failures were excluded. Original RED is retained in `protection-red.json`.
- **T031:** real AES-256-GCM BODY producer with five-frame octet AAD, immutable key reference, intended-byte association, external preparation before locks, and default denial when no approved provider is configured.
- **T032:** distinct facts/reason envelopes, exact closed scalar-key UTF-8 serialization and six-frame AAD, source preservation, injected coding validation, and authorized exact-revision reconstruction. Workflow/head identity is excluded.
- **T033:** prepared local receipt capability, exact generated response serialization and twelve-frame AAD, one mutation transaction/connection and SQL finalization before COMMIT. All-five effects commit together. Authoritative commit-unknown settlement precedes new preparation; replay returns the original authorized bytes/status/headers. Capabilities and owned temporary buffers are disposed on success/failure.
- **T034:** actual API-role PostgreSQL connections compose all five mutations with the real application producers on both pinned runtimes. Temporary baselines preserve populated predecessor content and are cleaned without forced or shared resets.

Final unit/exposure tests: **67/67 PASS** (33 protection, 7 receipt, 27 exposure). API typecheck PASS. Harness/protocol tests **114/114 PASS**. Current contracts verifier PASS.

| Real SQL-composition proof, per runtime | Result |
| --- | --- |
| Entire-mutation rollback faults | 44 PASS |
| Original-response replay comparisons | 15 PASS |
| Commit-unknown settlement scenarios | 11 PASS |
| Lookup unavailable: deny before preparation/effect | 11 PASS |
| Replay tamper/key/version/context/disclosure negatives | 65 PASS |
| SQL argument sink inspections | 4,478 PASS |
| Key preparations / external lease releases | 190 / 190 |
| External network/KMS work during active transactions | 0 |
| Durable audit / outbox / encrypted receipt / obligation / completed idempotency counts | 11 each |
| Harness-owned database absence after cleanup | Verified |

The proof includes authenticated exact neutral BODY and allergy plaintext roundtrips, fresh nonces and required tags, frozen AAD vectors, retry allocation, stale-head/language original replay, wrong authority denial, no prohibited plaintext/key sinks, and local receipt AES as the sole in-transaction protection work. Fault hooks cover response composition, encryption callback, invalid finalizer and failure after finalization before COMMIT. Commit acknowledgement loss is injected after a real database commit. Setup exceptions never count as successful fault/race outcomes.

This is real local cryptography with neutral test keys and synthetic authority/evidence. It does not establish production KMS integration, real source authenticity, clinical approval, production readiness, or owner acceptance of P6. K09 producers and route registration remain outside this run.

## Commands and retries

All commands ran in the authorized Feature 011 worktree:

```text
node tools/run-feature-011-storage-test.mjs k05 k08-remediation
node tools/run-feature-011-consumer-test.mjs k06
node tools/run-feature-011-postgres-test.mjs green
node tools/run-feature-011-concurrency-test.mjs green
node artifacts/feature-011/k08/package-remediation-stage.mjs
pnpm --filter @shifaa/api exec tsx ../../tools/run-feature-011-protection-test.mjs
pnpm --filter @shifaa/api exec vitest run src/modules/feature-011/protection.test.ts src/modules/feature-011/receipts.test.ts src/feature-011-exposure.test.ts
pnpm --filter @shifaa/api typecheck
node --test tools/feature-011-harness.test.mjs tools/feature-011-protocol-parity.test.mjs
node tools/verify-feature-011-contracts.mjs
node artifacts/feature-011/k08/package-k08.mjs
```

Intermediate failures were excluded and repaired before the final clean runs: missing consumer CLI argument, stale K05 unlock/source pins, CJS/ESM format registry mismatch, incorrect SQL qualification and synthetic PHA authority fixture, replay preparation ordering, runner cwd, asynchronous verifier invocation, predecessor table-set comparison, JSONB encoding and private response-field mapping. Final producer sources were frozen and verified at both-run start/end. No source editing occurred during the final run.

The old K01 scope/ledger tests still expect the original all-unchecked ledger/hash and fail after authorized acceptance bookkeeping (27 failures/2 passes in that earlier check). Those tests were not rewritten under K08. They are not counted as valid crypto RED. Full `pnpm verify` was not run because it includes shared destructive reset/integration work beyond this checkpoint; this is checkpoint evidence, not release/integration acceptance.

## Changed files and preservation

New application files: `protection.ts`, `release-protection.ts`, `allergy-protection.ts`, `mutation-receipts.ts`, `response-composition.ts`, the two protection/receipt test files under `services/api/src/modules/feature-011/`, and `services/api/src/adapters/postgres/feature-011-receipts.ts`.

New test orchestration: `tools/feature-011-k08-preflight.mjs`, `tools/feature-011-protection-fixtures.mjs`, `tools/run-feature-011-protection-test.mjs`. Existing consumer fixture, harness tests, storage/consumer/PostgreSQL runners, physical/race packaging and contracts verifier were updated only for bounded fresh revalidation. Four consumer SQL migrations received the corrections above.

Evidence: five required T030–T034 JSON records, both runtime reports, unit-test record, renewed K05/K06/T027/T028/T029 reports and authorized-hash manifest, `review-summary.json`, and `preservation.json`. Exact new-file inventory and current hashes are recorded there.

Preservation compared 3,606 initial file hashes: zero missing files; only the authorized K07 ledger bookkeeping, four consumer migrations and eight verifier/harness files changed. All other initial files, historical acceptance/evidence and restored evidence.zip remained byte-identical. T001–T029 are checked; T030–T092 are unchecked. T035–T092 definitions/state remain untouched. Issues #427–#431 were read live and remain OPEN. No subagent/delegate was used in this turn.

OPEN-UX-001 remains satisfied only for the Feature 011 affected-UI Plan prerequisite. OPEN-UX-002, OPEN-TECH-002/003, OPEN-CLIN-001 and OPEN-LEGAL-001/002/007 remain open with existing lifecycle effects.

Git status retains the six inherited tracked modifications and Feature 011 untracked work; staged files are empty. Branch: `codex/011-allergies-clinical-content-governance`. HEAD and local main: `670b1e0fe15c719b98179805f2628d1b478a55dd`. No commit, push, PR or main modification. No architecture-level blocker remains. The stale K01 test expectations are the verification limitation described above.

F011_K08_READY_FOR_REVIEW
