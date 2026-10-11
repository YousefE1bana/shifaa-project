# Tasks: Feature 011 — Allergies and Clinical-Content Governance

> **Fresh ledger:** `SHIFAA-F011-FRESH-TASKS@1.0.0` · **Plan:** `PLAN_APPROVED` · **Ledger:** `DRAFT_REVIEW_REQUIRED`
> **Generation:** 2026-10-06 · **Tasks:** 92 · **Checkpoints:** 24 · **Every task:** unchecked

Approved architecture: `SHIFAA-F011-RECOVERED-PLAN-APPROVAL@1.0.0`; SHA-256 `79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548`. Current formal [Plan approval](decisions/recovered-plan-approved-2026-10-06.md) supersedes preserved recovery draft/suspension labels for this exact family. The Product Owner authorized fresh generation; that authorization does not pre-approve this generated ledger or execute any checkpoint. Implementation remains paused. No Analyze was run.

## Rules and execution identity

Historical 95-task/29-checkpoint records are [byte-preserved](evidence/historical-ledger/pre-fresh-2026-10-06/tasks.md), superseded for execution and never copied as completion. Identical-looking numeric IDs belong to separate ledger namespaces. New tasks are derived from the 42 approved normative inputs. Historical evidence mapping happens only after this fresh graph; see [crosswalk](evidence/historical-task-evidence-crosswalk-v1.json).

Tasks change or prove approved architecture; no foundational design is first decided by a task. Missing design/current-input mismatch halts work. Each block carries exact requirements, file/directory targets, dependency IDs and completion evidence. [Task map](contracts/task-map.json) adds AC, contracts, ownership, proof boundaries, generated output commands, fixed constraints and gates. New migration timestamps belong to the pinned CLI at future execution: the concrete output directory is `supabase/migrations`, each task has a distinct exact slug; actual returned file path must be recorded. No migration is created by generation.

Exactly four FR targets (`FR-ADMIN-004` publication slice only), 19 NFRs and seven operations. Feature 010 context is consumed; Feature 012 prescriptions/safety/warnings/overrides/break-glass/dispensing excluded. No product role, public provisioning operation, source/provider or clinical rule is invented. Native current verification precedes trusted GUC setting; GUC is not authentication. Fixed data-model §11 locks, all-five atomic receipts, historical/current evidence separation, and approved protocol bytes are mandatory.

Every implementing checkpoint requires explicit authorization and accepted predecessors. RED must be missing behavior, never setup failure. Synthetic physical proof is not real evidence/AES/KMS acceptance. Real local cryptography uses neutral test material; no clinical/production approval. External evidence/KMS/network finishes before locks; bounded local canonical receipt AES is the only permitted in-transaction crypto exception. All five mutations share original encrypted response/current-authorized replay and commit-unknown settlement.

### Retained gates

| Gate | Current scope/stage | Required task boundary |
| --- | --- | --- |
| OPEN-UX-001 | SATISFIED_FOR_F011_AFFECTED_UI_PLAN_ONLY; Feature-scoped Plan prerequisite | 0.1.1-test-only candidate; no global closure/final design/pixel lock |
| OPEN-UX-002 | OPEN; VERIFYING | Separate owner design/reference/accessibility disposition; engineering evidence alone insufficient |
| OPEN-TECH-002 | OPEN; affected IMPLEMENTING | Evidence before owner assertion before consumers; no P6 backward dependency/global closure |
| OPEN-TECH-003 | OPEN; affected VERIFYING | Approved reference environment required; no local-only acceptance |
| OPEN-CLIN-001 | OPEN; real clinical/production admission | Neutral synthetic clinical fixtures only; actual local crypto/evidence logic is not real medical/source approval |
| OPEN-LEGAL-001 | OPEN; production | Current legal owner/effects unchanged |
| OPEN-LEGAL-002 | OPEN; production retention/deletion | No guessed retention duration/deletion automation |
| OPEN-LEGAL-007 | OPEN; production | Current legal owner/effects unchanged |
| otherApplicableGates | UNCHANGED; Feature-scoped Plan prerequisite | No task waives release/verification gates |

P1–P3 → both-runtime P4 → separately owned P5 stage assertion (`T029`) → real P6 consumers. P5 requires no later P6 proof and cannot close OPEN-TECH-002 globally. Every SQL/input correction renews affected physical parity. OPEN-UX-002 and OPEN-TECH-003 formal acceptance require owner evidence; no task test automatically closes a gate.

## Dependency and checkpoint design

| Checkpoint | Tasks | Depends on accepted checkpoints | Outcome / proof boundary |
| --- | --- | --- | --- |
| K01 | T001–T003 | none | Approved inputs and baseline readiness; Synthetic clinical fixtures; real application proof where stated |
| K02 | T004–T007 | K01 | Public generation and immutable protocol preparation; P1–P3 metadata/fixed-vector preparation only |
| K03 | T008–T011 | K02 | Default-off exposure and isolated harness; Synthetic clinical fixtures; real application proof where stated |
| K04 | T012–T016 | K03 | Physical RED suites before DDL; P4 synthetic physical RED; no real AES/source claim |
| K05 | T017–T020 | K04 | Typed additive physical storage; P4 synthetic structure/storage |
| K06 | T021–T026 | K05 | Narrow physical functions and RLS boundary; P4 synthetic functions/non-owner enforcement |
| K07 | T027–T029 | K06 | Both-runtime synthetic physical proof and staged assertion; P4 proof; separately owned P5 stage assertion |
| K08 | T030–T034 | K07 | Real protection and atomic receipt producer; P6 real local cryptography with neutral keys/material, no production KMS proof |
| K09 | T035–T040 | K07 | Typed evidence/provenance producers; P6 verification logic with neutral configured source fixtures |
| K10 | T041–T043 | K08, K09 | Pure domain and immutable SQL/core equivalence; P7 SQL/core/fixed-vector equality |
| K11 | T044–T047 | K10 | Read/report allergy API; Synthetic clinical fixtures; real application proof where stated |
| K12 | T048–T050 | K11 | Patient/clinic report engineering compositions; Functional TEST-ONLY AR RTL/EN LTR UI |
| K13 | T051–T053 | K12 | Verify/correct allergy API; Synthetic clinical fixtures; real application proof where stated |
| K14 | T054–T056 | K13 | Verification/history engineering UI; Functional TEST-ONLY AR RTL/EN LTR UI |
| K15 | T057–T059 | K10 | Create clinical-content release; Synthetic clinical fixtures; real application proof where stated |
| K16 | T060–T062 | K15 | Independent signing use case; Synthetic clinical fixtures; real application proof where stated |
| K17 | T063–T066 | K16 | Publication and authoritative current eligibility; Synthetic clinical fixtures; real application proof where stated |
| K18 | T067–T069 | K17 | Governance read and exact artifact disclosure; Synthetic clinical fixtures; real application proof where stated |
| K19 | T070–T073 | K18, K12 | Admin engineering governance UI and J-03 checkpoint; Functional TEST-ONLY AR RTL/EN LTR UI |
| K20 | T074–T076 | K17, K18 | Clinic metadata-only status projection; Synthetic clinical fixtures; real application proof where stated |
| K21 | T077–T079 | K20 | Clinic status engineering UI and J-04 checkpoint; Functional TEST-ONLY AR RTL/EN LTR UI |
| K22 | T080–T083 | K14, K19, K21 | All-operation security, races and atomicity; Both real PostgreSQL runtimes and real application producer composition |
| K23 | T084–T087 | K22 | Operational hardening, performance and restore; Synthetic clinical fixtures; real application proof where stated |
| K24 | T088–T092 | K23 | Final engineering verification and documentation; Synthetic clinical fixtures; real application proof where stated |

P1–P7 are Plan parity stages, not historical checkpoint IDs. No [P] marker is asserted. K08/K09 and later separate story branches may be independent after accepted prerequisites; shared DB runtimes are never run concurrently, and shared i18n ownership is ordered K12 before K19.

## Phase 1 — Approved inputs

### K01 — Approved inputs and baseline readiness

- [x] T001 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Revalidate approval manifest, native Feature 010 prerequisites and exact pinned toolchain; stop on drift — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K01/readiness.json`
  - Depends on: `none`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K01/readiness.json` — All 42 normative hashes/authority match. Node 24.18.0, pnpm 11.13.0, project-local pnpm exec supabase 2.113.0. Distinguish valid baseline from pending P1–P7; no runtime startup unless authorized acceptance needs it.

- [x] T002 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Add RED frozen-scope and catalog/client assertions — `tools/verify-feature-011-scope.test.mjs`, `tools/feature-011-ledger-contract.test.mjs`
  - Depends on: `T001`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K01/scope-red.json` — Reject any added/missing operation, NFR, method/path/header/DTO or Feature 012 behavior; both bounded catalog reconciliations asserted. Derive from approved inputs, not old tasks.

- [x] T003 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002] Bind fail-closed scope verification to current approved inputs — `tools/verify-feature-011-scope.mjs`
  - Depends on: `T002`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K01/scope-guard.json` — RED→GREEN; entered_in_error through verifyAllergy and clinic metadata listClinicalContent reconciliations pass without added operation.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Phase 2 — Shared contract, physical and producer foundation

### K02 — Public generation and immutable protocol preparation

- [x] T004 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004] Add RED stale/missing/input-inconsistent protocol metadata and vector tests — `tools/feature-011-protocol-parity.test.mjs`
  - Depends on: `T003`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K02/protocol-red.json` — All ARTIFACT/HANDOFF/BODY/AAD/allergy/receipt/evidence/disclosure normative profiles/registries covered. Frozen V01–V07 bytes/digests independent of tested implementation; field-8 exception; nine typed evidence profiles; no generated encoder.

- [x] T005 [NFR-API-001, NFR-API-002, NFR-QUALITY-001] Extend metadata-only generators from unchanged public contract — `tools/generate-feature-011-contract.mjs`, `tools/generate-feature-011-client.mjs`, `packages/contracts/src/feature-011.ts`, `packages/contracts/src/index.ts`, `packages/api-client/src/feature-011.ts`
  - Depends on: `T004`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K02/public-gen.json` — Seven public operation wire shapes unchanged. Bind current internal contract/profile/vector/parity hashes only. Run both generators/--check/repeated generation zero-byte diff; generated files never edited manually.

- [x] T006 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002] Extend contracts-only/default verifier for current P1–P4 and separate P5 stage disposition — `tools/verify-feature-011-contracts.mjs`
  - Depends on: `T005`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K02/parity-verifier.json` — Legacy C02/C02A regressions pass. Contracts-only requires P1–P3; default fails missing/stale/failed/unaccepted current physical evidence or owned stage disposition. Never requires later P6 to unlock P6; OPEN-TECH-002 stays open.

- [x] T007 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Capture current metadata/vector/schema/client parity before physical consumers — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K02/protocol-proof.json`
  - Depends on: `T006`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K02/protocol-proof.json` — Generator --check and repeated zero-byte diff; legacy and profile/vector negatives GREEN, contracts-only GREEN, default/full intentionally fail-closed without P4/P5; current input/output hashes bound.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K03 — Default-off exposure and isolated harness

- [x] T008 [NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add RED default-off/kill-switch tests before any Feature 011 route registration — `services/api/src/feature-011-exposure.test.ts`
  - Depends on: `T007`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K03/exposure-red.json` — Unset/invalid/disabled configuration exposes none of seven routes; kill switch denies and does not queue mutation; no excluded routes.

- [x] T009 [NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Install disabled-by-default Feature 011 exposure guard through existing configuration — `services/api/src/config.ts`, `services/api/src/feature-011-exposure.ts`
  - Depends on: `T008`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K03/exposure.json` — RED→GREEN; only explicitly isolated synthetic test exposure. Every later registration depends on this prerequisite; late observability does not own exposure safety.

- [x] T010 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002] Prepare both-runtime isolated SQL runners, barriers and neutral fixtures — `tools/run-feature-011-postgres-test.mjs`, `tools/run-feature-011-concurrency-test.mjs`, `packages/test-kit/src/feature-011/fixtures.ts`
  - Depends on: `T009`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K03/harness.json` — Pinned pnpm exec supabase only, full baseline/owners, exact harness-owned temporary names/cleanup, independent connections and pg_locks, runtime/role/hash manifests; no shared reset, PHI or raw evidence SQL input.

- [x] T011 [NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Prove healthy harness/exposure distinct from missing Feature 011 behavior — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K03/harness-proof.json`
  - Depends on: `T010`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K03/harness-proof.json` — Both runtimes setup/smoke healthy; baseline-only intended absent-behavior assertion fails; missing/syntax-broken setup is a blocker, never accepted RED. Routes remain absent.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K04 — Physical RED suites before DDL

- [x] T012 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001] Add RED append/version/protected revision/one-use verification fixtures — `infra/db/tests/feature-011-allergy-create-read.sql`, `infra/db/tests/feature-011-allergy-verification.sql`
  - Depends on: `T011`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K04/sql-allergy-red.json` — Both runtimes intended missing physical RED. Exact facts/reason nullability, current-head CAS, confirmed/refuted reversals/no self reset, terminal linked-new assertion, original source/unknowns and patient/assertion/support negatives.

- [x] T013 [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Add RED release/signature/exact-admission/lineage and frozen-vector physical tests — `infra/db/tests/feature-011-content-draft.sql`, `infra/db/tests/feature-011-signatures.sql`, `infra/db/tests/feature-011-publication.sql`
  - Depends on: `T011`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K04/sql-content-red.json` — Exact V01–V07 bytes/hash and canonical negatives; SQL trusted hashes only; same-version competing drafts; root/successor uniqueness; full 50-column historical signature basis, valid rejection, exact-bound qualification/version changes and exact-artifact admission.

- [x] T014 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001] Add RED synthetic encrypted-receipt/deferred commit-obligation tests — `infra/db/tests/feature-011-receipts.sql`
  - Depends on: `T011`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K04/sql-receipt-red.json` — Missing/mismatched receipt/audit/outbox/idempotency completion rejects COMMIT. Exact tuple/twelve-frame metadata, pointer-only generic receipt, immutable original replay/RESTRICT history; structural synthetic ciphertext proves no real crypto.

- [x] T015 [NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001, FR-SAFE-008, NFR-DATA-001, NFR-PRIV-001, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-006] Add RED actual-role RLS/grants/closed projections and predecessor writer races — `infra/db/tests/feature-011-schema.sql`, `infra/db/tests/feature-011-rls.sql`, `infra/db/tests/feature-011-content-projections.sql`, `infra/db/tests/feature-011-concurrency.sql`
  - Depends on: `T012`, `T013`, `T014`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K04/sql-security-red.json` — Non-owner shifaa_api/NOLOGIN executor expectations; FORCE RLS/DML/helper/PUBLIC/service_role/worker denial; client spoof/direct SQL/trusted verified GUC distinguished. Test data-model §11 ranks with actual facility/continuity/F010 writers, barriers/pg_locks.

- [x] T016 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-006] Capture both-runtime valid missing-behavior RED before any additive DDL — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K04/sql-red-capture.json`
  - Depends on: `T015`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K04/sql-red-capture.json` — Run existing SQL/concurrency runners red positional mode; each intended assertion plus setup health/toolchain/roles and fixture/current generated hashes recorded. Historical RED only candidate, no restart/discard requirement.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K05 — Typed additive physical storage

- [x] T017 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Create allergy/head/revision and typed supporting provenance tables per model §§1/10/13 — `supabase/migrations`
  - Depends on: `T016`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K05/ddl-allergy.json` — New CLI-generated f011_allergy_revisions migration; exact facts/reason five-field envelopes/nullability, structural plaintext allowlist, immutable append/correction lineage and reciprocal one-use support binding; preserve populated baseline.

- [x] T018 [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Create content series/releases/material bindings and release-scoped version/lineage constraints — `supabase/migrations`
  - Depends on: `T017`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K05/ddl-release.json` — New CLI-generated f011_content_artifacts migration; five BODY typed columns, exact three material bindings, no next_artifact_version or unique(series_id,artifact_version); same-version drafts allowed, unique published root/successor and same-series predecessor.

- [x] T019 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Create exact current governance/designation/admission and immutable restricted signature/admission sidecars — `supabase/migrations`
  - Depends on: `T018`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K05/ddl-signing.json` — New CLI-generated f011_governance_evidence migration; exact model §13 fields/FKs, stable-ID RESTRICT with locked version equality, verified evidenceRef/source uniqueness, reciprocal signature completion, exact-artifact admission/ambiguity denial. Audit role widening clinical-only; preserve existing admin signature rows/tests.

- [x] T020 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001] Create immutable encrypted receipt and deferred all-five commit obligations — `supabase/migrations`
  - Depends on: `T019`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K05/ddl-receipt.json` — New CLI-generated f011_atomic_receipts migration; exact model §10 tuple/envelope, audit.events(occurred_at,id) composite FK/outbox/idempotency links, immutable pointer-only platform response, no plaintext/cascade expiry purge.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K06 — Narrow physical functions and RLS boundary

- [x] T021 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-005, NFR-API-002, NFR-OBS-001] Implement allergy read/append/verify SQL consumer with current context/CAS/typed evidence — `supabase/migrations`
  - Depends on: `T020`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K06/sql-allergy.json` — New f011_allergy_functions; model §11 lock ranks, candidate/head/version/support/attestor equality, terminal and correction checks; no plaintext/decrypt/coding truth; authoritative structural result plus commit obligation.

- [x] T022 [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001] Implement create-release consumer and ARTIFACT/1 SQL byte/hash construction — `supabase/migrations`
  - Depends on: `T021`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K06/sql-draft.json` — New f011_release_functions; exact UTF-8 octet frames/Unicode/six UTC micros/field8/SHA and declaredDigest equality; locked lineage/allocation/current authority; no JSON textual canonicalization, SQL material hashing or encryption/KMS.

- [x] T023 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Implement signing consumer with exact current basis/independence/immutable sidecar — `supabase/migrations`
  - Depends on: `T022`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K06/sql-sign.json` — New f011_signing_functions; native/request/trusted/locked tuples compared, full historical basis and verified evidenceRef, valid rejection same binding, invalid attempts no signature, one person cannot dual approve; artifact immutable/workflow CAS.

- [x] T024 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-005, NFR-API-002, NFR-OBS-001] Implement publication/current eligibility and governance/clinic narrow column projections — `supabase/migrations`
  - Depends on: `T023`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K06/sql-publish.json` — New f011_publication_functions; exact current signature/admission and ADM creator-independent publisher, UTC after wait/final expiry, predecessor/future chain/rollback constraints/no ancestor fallback; clinic metadata only/minimum booleans/no resolver/private refs.

- [x] T025 [NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-008, NFR-DATA-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004] Apply FORCE RLS/immutability/minimum grants/non-owner executor to all new relations/functions — `supabase/migrations`
  - Depends on: `T024`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K06/sql-privileges.json` — New f011_rls_grants; shifaa_f011_executor NOLOGIN NOSUPERUSER NOBYPASSRLS non-owner, fixed search_path/revoke PUBLIC EXECUTE, shifaa_api only approved entrypoints; DML/service_role/worker/helper spoof denial, GUC not authentication.

- [x] T026 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001] Implement narrow opaque receipt finalization/replay metadata and deferred completeness guards — `supabase/migrations`
  - Depends on: `T025`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K06/sql-finalizer.json` — New f011_receipt_functions; exact effect/audit/outbox/receipt/completion tuple, partial COMMIT fails, immutable original result; no SQL encryption/decryption/network or durable plaintext.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K07 — Both-runtime synthetic physical proof and staged assertion

- [x] T027 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Apply full baseline plus additive chain in both runtimes and capture exact physical GREEN — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K07/physical-green.json`
  - Depends on: `T026`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K07/physical-green.json` — SQL runner green: exact schema/envelope/sidecar/FKs/functions, V01–V07 bytes AND hashes/negatives in both runtimes, actual shifaa_api/executor rolsuper=false/rolbypassrls=false, FORCE RLS/grants, populated predecessor compatibility; routes absent; no real AES/evidence approval.

- [x] T028 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-006, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-SEC-007, NFR-PRIV-002] Prove physical allocation/authority/CAS/lineage/idempotency races against actual predecessor writers — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K07/physical-races.json`
  - Depends on: `T027`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K07/physical-races.json` — Concurrency runner green BOTH runtimes; independent sessions/barriers/pg_locks, revoke-first/action-first, actual facility/continuity/encounter order, allergy/signature/root/successor/allocation/time/receipt-fault matrices, durable counts and immutable history.

- [x] T029 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002] Prepare bounded owner-reviewed current P1–P4/P5 parity assertion before affected consumers — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K07/stage-assertion.json`
  - Depends on: `T028`, `T007`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K07/stage-assertion.json` — Default/full validates current accepted generated/physical/input hashes AND separate applicable owner disposition. Missing disposition halts consumer. No demand for future P6, no global OPEN-TECH-002 closure; input/SQL changes require renewed proof.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K08 — Real protection and atomic receipt producer

- [x] T030 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, FR-SAFE-008, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002] Add RED release/allergy/receipt protection and exact serialization/AAD/fault tests — `services/api/src/modules/feature-011/protection.test.ts`, `services/api/src/modules/feature-011/receipts.test.ts`
  - Depends on: `T029`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/protection-red.json` — Approved vectors; random nonce12/tag16, immutable keyRef/no current alias, wrong key/version/context/tamper deny, exact closed facts/reason/generated response bytes, failure rollback/capability disposal.

- [x] T031 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002] Implement release BODY/AAD producer with intended-content association — `services/api/src/modules/feature-011/release-protection.ts`
  - Depends on: `T030`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/release-protection.json` — AES-256-GCM only, exact five-frame AAD/workflow excluded, external key prep before locks. Opaque SQL five fields/no keys; unconfigured approved adapter denies; injected neutral test capability establishes real local crypto only.

- [x] T032 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001] Implement separate closed allergy facts/reason protection/reconstruction — `services/api/src/modules/feature-011/allergy-protection.ts`
  - Depends on: `T030`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/allergy-protection.json` — Scalar-key UTF-8 canonical serialization, exact reported strings/unknown/source, six-frame stable assertion/new revision/version/field/key context; fresh distinct envelopes, authorized decrypt only, no workflow/head identity.

- [x] T033 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Implement prepared receipt capability and same-transaction local canonical response encryption/replay — `services/api/src/modules/feature-011/mutation-receipts.ts`, `services/api/src/adapters/postgres/feature-011-receipts.ts`
  - Depends on: `T031`, `T032`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/receipt-producer.json` — One connection/transaction all-five: generated serializer → local AES-GCM → SQL finalizer → one COMMIT. External capability prep before locks; exact twelve-frame AAD/original status/allowed headers, failure whole rollback, commit-unknown settle first, current authority original replay, finally disposal.

- [x] T034 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001] Capture real cryptographic negatives/fault producer→prepared SQL composition — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/protection-proof.json`
  - Depends on: `T033`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/protection-proof.json` — Both runtimes roundtrip/exact AAD/random nonces/retry/intended plaintext/tamper/key/context; no keys/plaintext prohibited sinks, external network/KMS under locks zero, bounded local receipt AES sole exception.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K09 — Typed evidence/provenance producers

- [x] T035 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-008, NFR-DATA-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Add RED nine-profile/source failure/type confusion/historical-current basis tests — `services/api/src/modules/feature-011/evidence.test.ts`
  - Depends on: `T029`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/evidence-red.json` — Immutable refs/exact SHA/source authenticity/correlation and full exact ID/version bases; unrelated replacement never rehabilitates signature/admission; unavailable/malformed/unapproved source denies before SQL.

- [x] T036 [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Implement content/code/test-vector immutable Evidence Port and trusted material binding — `services/api/src/modules/feature-011/material-evidence.ts`
  - Depends on: `T035`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/material-producer.json` — Exact resolved bytes SHA application-only; reference/material association and typed provenance; no raw SQL/generic sinks; missing source denies and no provider/clinical truth invented.

- [x] T037 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Implement trusted signing result from native actor/current exact rows/approved verifier — `services/api/src/modules/feature-011/signing-evidence.ts`
  - Depends on: `T035`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/signing-producer.json` — Public signingEvidenceRef selector only; exact release/artifact/decision/person/capacity/verifier/credential/designation/grant full basis before locks; verified mapping including valid rejection; unavailable source denies. Signing grants no admin/read authority.

- [x] T038 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Implement restricted audited offline authority/designation/exact-artifact admission producer — `tools/provision-feature-011-evidence.mjs`
  - Depends on: `T036`, `T037`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/governed-provisioner.json` — Approved source verification/typed basis/current rows/history at same lock ranks. Admission AFTER draft exact release/version/digest, unique eligible binding; broad scope insufficient. No public provisioning/role; synthetic explicit, unapproved real admission denies.

- [x] T039 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-004, NFR-PORT-001] Implement private supporting-provenance and approved-source coding ownership boundary — `services/api/src/modules/feature-011/allergy-evidence.ts`
  - Depends on: `T035`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/allergy-provenance.json` — Exact patient/assertion/head/target/attestor/new revision one-use support; not external medical truth/upload. New known coding only approved matching source; absent source rejects new known, omitted/unknown valid, unchanged historical known preserved without new validation claim.

- [x] T040 [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-008, NFR-DATA-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Capture real typed evidence producer→SQL association and current-basis negatives — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/evidence-proof.json`
  - Depends on: `T038`, `T039`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K09/evidence-proof.json` — Both runtimes neutral source/reference/hash/cross-resource/substitution/unavailable/basis expiry/version/replacement/exact admission/allergy support tests. Raw material SQL absent. No real qualification/admissibility approval.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K10 — Pure domain and immutable SQL/core equivalence

- [x] T041 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-006, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add RED pure policy/encoder tests against unchanged approved vectors — `packages/core/src/feature-011/artifact.test.ts`, `packages/core/src/feature-011/allergy-policy.test.ts`, `packages/core/src/feature-011/content-policy.test.ts`
  - Depends on: `T034`, `T040`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K10/core-red.json` — Fixed V01–V07 and negative vectors independently sourced; exact unknown/terminal/correction/future/independence/history-current semantics. No expected regeneration or DB/vendor/framework imports.

- [x] T042 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-006, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Implement approved pure encoder/allergy/content policies without new design — `packages/core/src/feature-011/artifact.ts`, `packages/core/src/feature-011/allergy-policy.ts`, `packages/core/src/feature-011/content-policy.ts`
  - Depends on: `T041`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K10/core.json` — RED→GREEN fixed bytes/policies; typed authoritative facts, no clinical rules/enums/provider/network/framework/SQL in core and no Feature 012 evaluation.

- [x] T043 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Prove SQL == core == frozen V01–V07 exact bytes/digests in both runtimes — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K10/equivalence.json`
  - Depends on: `T042`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K10/equivalence.json` — Compare bytes AND SHA; normalization negatives/Unicode/six UTC microseconds/predecessor exception; bind source/SQL/generated/producer hashes and regressions, no implementation-derived expected output.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Phase 3 — US1 / J-01: Read and report allergy

**Independent outcome:** Authorized read/report, self_reported/unknown provenance; isolated synthetic engineering demonstration only. No shippable MVP, deployment readiness or clinical readiness claim.

### K11 — Read/report allergy API

- [x] T044 [US1] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-005, NFR-OBS-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002] Add RED scoped allergy read/report and original receipt API tests — `services/api/src/modules/feature-011/allergies.test.ts`, `services/api/src/routes/feature-011-allergies.contract.test.ts`
  - Depends on: `T043`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K11/allergy-api-red.json` — Self/authorized clinician both create self_reported. Guardian/delegate read only as previously authorized, no create. Cross-patient/facility/cursor/purpose/AAL/F010 failures deny; unknown not fabricated/new unvalidated known denies; exact headers/problems/receipt.

- [x] T045 [US1] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Compose native-authorized protected read/create with online SQL and atomic receipts — `services/api/src/modules/feature-011/allergies.ts`, `services/api/src/adapters/postgres/feature-011-allergies.ts`
  - Depends on: `T044`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K11/allergy-read-create.json` — Scoped authorized decrypt/DTO reconstruction, preallocated protected candidate outside locks, locked current role/context/correction lineage checks, one transaction/original encrypted receipt; creation never confirms.

- [x] T046 [US1] [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, FR-SAFE-008, NFR-DATA-001, NFR-PRIV-001] Register generated listAllergies/createAllergy only behind native auth/default-off guard — `services/api/src/routes/feature-011-allergies.ts`, `services/api/src/app.ts`
  - Depends on: `T045`, `T009`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K11/allergy-routes.json` — Generated request/response validators, cursor/idempotency/problem contract; no undocumented endpoint/PostgREST write/body logging; production configuration remains disabled by default.

- [x] T047 [US1] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-005, NFR-OBS-001] Capture both-runtime real allergy read/report/current authority/replay integration — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K11/allergy-api-proof.json`
  - Depends on: `T046`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K11/allergy-api-proof.json` — Online non-owner roles, same-key original after newer resource, changed binding conflict, lost authority deny, crash-before/after/unknown settlement and no second event/crypto/effect.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K12 — Patient/clinic report engineering compositions

- [x] T048 [US1] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add RED patient records/clinic summary state and accessibility tests — `apps/patient/test/feature-011-records.test.tsx`, `apps/clinic/test/feature-011-summary.test.tsx`
  - Depends on: `T047`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/allergy-ui-red.json` — Assigned approved candidate states, exact report-review CTA, self_reported/unknown/source/history, guardian/delegate read-only, loading/empty/error/permission/offline/stale/success, focus/labels/bidi/reflow. No mutation queue/prescription UI. Existing inherited Arabic privacy notice/specific consent/withdrawal and current-care boundary remain explicit; no new consent system.

- [x] T049 [US1] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Extend existing /records and /patients/:id/summary using generated client — `apps/patient/app/records.tsx`, `apps/clinic/src/app/patients/[id]/summary/page.tsx`, `packages/i18n/src/feature-011.ts`
  - Depends on: `T048`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/allergy-ui.json` — Feature 010 context unchanged; functional/test-only candidate semantics, readable localized dates and isolated technical values without overflow; no final styling/pixel lock/Feature 012. Reuse existing Arabic-first privacy notice/consent/withdrawal entrypoints and current authorized context; no processing beyond gated synthetic capability.

- [x] T050 [US1] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Capture independent J-01 as isolated synthetic engineering demonstration only — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/us1-demo.json`
  - Depends on: `T049`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/us1-demo.json` — Live AR/EN native/browser read/report, assigned P0/degraded/isolation/receipt states and default-off/kill-switch negatives. Explicit not deployment ready, not clinical ready, not shippable MVP; only US1 coverage claimed, UX002 not closed.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Phase 4 — US2 / J-02: Versioned verification and correction

**Independent outcome:** Attributable clinician revision and terminal linked correction preserve history; depends on accepted US1 foundation.

### K13 — Verify/correct allergy API

- [x] T051 [US2] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-SEC-004, NFR-SEC-007, NFR-API-001, NFR-QUALITY-001] Add RED verification/correction/provenance/protected revision API tests — `services/api/src/modules/feature-011/verify-allergy.test.ts`
  - Depends on: `T050`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K13/verify-api-red.json` — Clinician confirm/refute/reversal/error only with new reason/evidence/version; no verified→self_reported. Terminal corrected assertion new linked self_reported. Support patient/assertion/target/attestor/reuse/head-CAS negatives and all-five faults.

- [x] T052 [US2] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Compose governed verification/protected new facts and reason/narrow existing verification route — `services/api/src/modules/feature-011/verify-allergy.ts`, `services/api/src/adapters/postgres/feature-011-allergies.ts`, `services/api/src/routes/feature-011-allergies.ts`
  - Depends on: `T051`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K13/verify-api.json` — Authorized previous facts load, approved correction fields/source immutable, new revision/envelopes before locks, locked actor/head/support/candidate CAS, stale abort/fresh retry, original replay. No new operation.

- [x] T053 [US2] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-004, NFR-SEC-007] Prove both-runtime revision/support races and preserved complete correction history — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K13/verify-api-proof.json`
  - Depends on: `T052`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K13/verify-api-proof.json` — Same-head/support/key and revoke-first/action-first barriers yield one revision/binding/effect; prior envelopes/source/recorder unchanged; error terminal, corrected assertion separate; exact unknown interpretation.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K14 — Verification/history engineering UI

- [x] T054 [US2] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002] Add RED verify/history/correction dialogs and destructive distinctions — `apps/clinic/test/feature-011-verification.test.tsx`, `apps/patient/test/feature-011-history.test.tsx`
  - Depends on: `T053`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K14/verify-ui-red.json` — Confirm/refute/error/new assertion each exact bilingual CTA, required reason/evidence, focus return/live announcements/four states/history/terminal; clinician-only actions, patient read/report only.

- [x] T055 [US2] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Implement clinician verification and authorized history on existing allergy surfaces — `apps/clinic/src/app/patients/[id]/summary/AllergyHistory.tsx`, `apps/patient/src/feature-011-allergy-history.ts`
  - Depends on: `T054`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K14/verify-ui.json` — Generated operations/current version, stale/offline/no queue and protection projection boundaries; no fifth state/new route/overwrite.

- [x] T056 [US2] [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Capture independent J-02 AR/EN protected history/terminal correction checkpoint — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K14/us2-demo.json`
  - Depends on: `T055`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K14/us2-demo.json` — Live verify/reversal/error/linked new assertion keeps history; authority/stale/provenance substitution denied, assigned P0 states covered; synthetic only/no gate closure.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Phase 5 — US3 / J-03: Independently review and publish

**Independent outcome:** Exact synthetic artifact reviewed by independent eligible capacities and published by authorized separate creator-independent publisher. No real content approval.

### K15 — Create clinical-content release

- [x] T057 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Add RED create preflight/allocation/evidence/body/exact review response tests — `services/api/src/modules/feature-011/create-release.test.ts`
  - Depends on: `T043`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K15/draft-api-red.json` — Initial/successor exact tuple/material, declaredDigest mismatch/stale lineage, same-version competing drafts allowed, exact authorized lossless UTF-8 artifactReview; create never grants real admission.

- [x] T058 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Compose preflight Evidence/Protection/handoff and atomic existing create-release route — `services/api/src/modules/feature-011/create-release.ts`, `services/api/src/adapters/postgres/feature-011-content.ts`, `services/api/src/routes/feature-011-content.ts`
  - Depends on: `T057`, `T009`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K15/draft-api.json` — ADM create current checks/review authorization, evidence and protection before locks; SQL ARTIFACT/declaredDigest/allocation equality; losing preflight may encrypt but commits nothing, retry fresh ID/nonce/envelope, committed replay none. Only existing route.

- [x] T059 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004] Capture both-runtime actual create/fault/replay/exact neutral admission composition — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K15/draft-api-proof.json`
  - Depends on: `T058`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K15/draft-api-proof.json` — Evidence substitution/protected intended material mismatch/caller digest rejection, same-key/stale races/fresh crypto/no prohibited sinks; explicit governed exact-artifact neutral approval AFTER draft via private provisioner.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K16 — Independent signing use case

- [x] T060 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Add RED source/current-basis/independence/rejected evidenceRef mapping tests — `services/api/src/modules/feature-011/sign-release.test.ts`
  - Depends on: `T059`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K16/sign-api-red.json` — Eligible non-ADM physician/pharmacist; creator/self/dual-person forbidden; UUID alone not verified, unavailable/wrong tuple/source deny; rejected decisions same binding, exact credential/designation/grant version/full basis.

- [x] T061 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Compose signing result→locked SQL/signature sidecar/canonical signature receipt — `services/api/src/modules/feature-011/sign-release.ts`, `services/api/src/adapters/postgres/feature-011-content.ts`, `services/api/src/routes/feature-011-content.ts`
  - Depends on: `T060`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K16/sign-api.json` — Workflow If-Match CAS/artifact unchanged; verified public evidenceRef from sidecar not echoed request; current independent capacity grants no admin/read; no raw reason/private source basis leakage.

- [x] T062 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001] Capture both-runtime signing basis/version/revocation race proof — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K16/sign-api-proof.json`
  - Depends on: `T061`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K16/sign-api-proof.json` — Two capacities same ETag one conflict then reload same artifact; actual authority SHARE locks; expiry/revoke/version/replace deny; one final decision per capacity, rejected requires new reviewed draft; public/private snapshots exact.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K17 — Publication and authoritative current eligibility

- [x] T063 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Add RED current signature/admission/publisher/lineage/time publication tests — `services/api/src/modules/feature-011/publish-release.test.ts`
  - Depends on: `T062`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-api-red.json` — Exact historically bound ID/version/full basis must remain currently eligible; unrelated replacement cannot count; one exact-artifact admission, current ADM publisher/independence, roots/successors/future UTC boundary/fault cases.

- [x] T064 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-API-001, NFR-QUALITY-001] Compose existing publish request to locked eligibility/publication and exact original receipt — `services/api/src/modules/feature-011/publish-release.ts`, `services/api/src/modules/feature-011/content-eligibility.ts`, `services/api/src/routes/feature-011-content.ts`
  - Depends on: `T063`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-api.json` — Two independent currently eligible exact approvals/admission; ADM publisher separate creator; preverified review material outside locks/final publish-disclosure authorization under locks; root/successor/effective current chain, no future early or ancestor fallback.

- [x] T065 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-005, NFR-API-002, NFR-OBS-001] Capture publish/sign/revoke/admission/time/competing roots/successors in both runtimes — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-races.json`
  - Depends on: `T064`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-races.json` — Independent connections/barriers/pg_locks; future published successor reservation blocks competitor; exact basis advance/expiry/replace denial, no broad admission/fallback; rollback new separately reviewed signed successor, history unchanged.

- [x] T066 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002] Prove authoritative effective eligibility and current basis loss before clinic UI claims — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/eligibility-proof.json`
  - Depends on: `T065`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/eligibility-proof.json` — BOTH runtimes before/at effective instant, signer qualification/designation/grant loss/version/replacement and ambiguous admission; historical signatures retained but no current count; unavailable explicit/no safety interpretation.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K18 — Governance read and exact artifact disclosure

- [x] T067 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add RED authorized exact review/ref/hash/replay/prohibited sink tests — `services/api/src/modules/feature-011/artifact-review.test.ts`
  - Depends on: `T066`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/review-red.json` — Existing content/code/testVectors strings exact lossless UTF-8; current scope/action/person/AAL/purpose and immutable ref/hash; wrong/binary/missing/substituted material rejects entire response. Raw material never generic sinks.

- [x] T068 [US3] [FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Implement current governance/assigned-review projection with exact Evidence Port disclosure — `services/api/src/modules/feature-011/artifact-review.ts`, `services/api/src/modules/feature-011/list-clinical-content.ts`, `services/api/src/routes/feature-011-content.ts`
  - Depends on: `T067`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/governance-read.json` — Signing alone grants no read; resolve original refs/hash unlocked, final short scope/tuple/current authorization; same rule for required create/publish and original receipt replay, unchanged public shape/routes.

- [x] T069 [US3] [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007] Capture governance/reviewer source integrity and forbidden projection/sink negatives — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/review-proof.json`
  - Depends on: `T068`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K18/review-proof.json` — Both-runtime real resolver/authorized strings, source failure/UTF-8/ref/hash/cross-resource denial; no keyRef/private evidence/credential docs in DTO/log/audit/outbox/clinic; authorized review snapshot only dedicated encrypted receipt.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K19 — Admin engineering governance UI and J-03 checkpoint

- [x] T070 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add RED admin candidate review/sign/publication/state/a11y tests — `apps/admin/test/feature-011-clinical-content.test.tsx`, `packages/i18n/src/feature-011.test.ts`
  - Depends on: `T069`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K19/admin-ui-red.json` — Create/sign exact version/reject/publish/supersede/rollback/initial/future/gated states; operation-specific AR/EN confirmations, focus/read order/degraded states, signing independent ADM/read, no fabricated clinical data. Shared AR/EN key parity unit test is RED before copy implementation.

- [x] T071 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Implement existing /clinical-content engineering workspace — `apps/admin/src/app/clinical-content/page.tsx`, `apps/admin/src/app/clinical-content/ClinicalContentWorkspace.tsx`
  - Depends on: `T070`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K19/admin-ui.json` — Generated client/current separate privileges/exact authorized review, no private evidence/key data, readable dates/compact bidi technical values; synthetic gates explicit, no provisioning/role/new route/prescription/final styling.

- [x] T072 [US3] [NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-PRIV-001, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, FR-SAFE-002, NFR-DATA-001] Complete tested shared/admin bilingual copy and accessibility semantics — `packages/i18n/src/feature-011.ts`
  - Depends on: `T071`, `T049`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K19/admin-i18n.json` — AR/EN parity test fails missing key; all operation-specific confirm/error/correct/create/sign/publish/supersede/rollback copy, unknown/status announcements/read order and compact technical values match test-only candidate intent.

- [x] T073 [US3] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-001, NFR-SEC-002, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Capture independent J-03 functional synthetic governance checkpoint — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K19/us3-demo.json`
  - Depends on: `T072`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K19/us3-demo.json` — Live AR/EN create→two independent reviewers→publish incl valid rejection/new draft/initial/successor/future/rollback/degraded states. Depends on authoritative K17 proof, never projection-only or real clinical/production approval.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Phase 6 — US4 / J-04: Unavailable/current metadata-only status

**Independent outcome:** Current authorized clinic metadata and unavailable semantics; requires authoritative K17 eligibility/authority-loss proof before projection/UI acceptance.

### K20 — Clinic metadata-only status projection

- [x] T074 [US4] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add RED clinic SQL/API/client projection and current explicit status grant tests — `services/api/src/modules/feature-011/clinical-status.test.ts`
  - Depends on: `T066`, `T069`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K20/status-red.json` — Current grant/workforce/facility/purpose/AAL2; only published metadata/eligibility/lineage/minimum booleans; no draft/unsigned detail/body/digest/signature identity/evidenceRef/keyRef/private source; resolver never invoked.

- [x] T075 [US4] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Compose metadata-only status via existing listClinicalContent projection — `services/api/src/modules/feature-011/clinical-status.ts`, `services/api/src/routes/feature-011-content.ts`
  - Depends on: `T074`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K20/status.json` — Closed SQL→serializer→generated client allowlist, scope-bound cursor; K17 current eligibility, future/gated/unknown unavailable; no new public operation/admin power.

- [x] T076 [US4] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Capture both-runtime status allowlist/current authority and qualification-loss proof — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K20/status-proof.json`
  - Depends on: `T075`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K20/status-proof.json` — Published/future/revoked/admission/grant-loss states and private sentinels every layer; no resolver/decryptor/draft/mutation controls; US4 completion additionally requires functional K21.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K21 — Clinic status engineering UI and J-04 checkpoint

- [x] T077 [US4] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-001] Add RED clinic status family state/a11y/allowlist tests — `apps/clinic/test/feature-011-status.test.tsx`
  - Depends on: `T076`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K21/status-ui-red.json` — AR/EN loading/empty/error/permission/offline/stale/success/future/synthetic/gated, availability versus unknown, date/bidi/lineage, focus/keyboard/labels; no draft/body/signature/private evidence detail.

- [x] T078 [US4] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Implement existing /clinical-content/status engineering route — `apps/clinic/src/app/clinical-content/status/page.tsx`
  - Depends on: `T077`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K21/status-ui.json` — Generated metadata projection/current explicit grant and workforce context, unavailable never silently safe; no role elevation/admin mutations/new endpoint/final style.

- [x] T079 [US4] [FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-001] Capture complete J-04 AR/EN after authoritative eligibility and status security acceptance — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K21/us4-demo.json`
  - Depends on: `T078`, `T066`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K21/us4-demo.json` — Live granted/denied/future/admission/signer loss, no clinic leak; four-family 99-state registry assigned across UI checkpoints; projection/UI proof does not replace current-authority proof.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Phase 7 — Cross-operation engineering verification and documentation

### K22 — All-operation security, races and atomicity

- [x] T080 [NFR-API-001, NFR-API-002, NFR-QUALITY-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-005, NFR-DATA-001, NFR-OBS-001] Integrate all new suites into package test/full verify discovery — `tools/run-feature-011-composition-test.mjs`, `packages/core/package.json`, `packages/i18n/package.json`, `services/api/package.json`, `apps/patient/package.json`, `apps/clinic/package.json`, `apps/admin/package.json`
  - Depends on: `T056`, `T073`, `T079`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/composition-harness.json` — Every new core/API/UI/protection/evidence suite discovered; preserve predecessor checks, fail missing runtime not skip-green; exact Node ESM/browser/native behavior, no independent expected vector regeneration.

- [x] T081 [FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, NFR-PRIV-001, FR-SAFE-002, NFR-DATA-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-006, NFR-SEC-005, NFR-API-002, NFR-OBS-001, NFR-SEC-007, NFR-PRIV-002] Run all-operation barrier/pg_locks concurrency/retry/commit-unknown proof — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/all-races.json`
  - Depends on: `T080`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/all-races.json` — Both runtimes actual predecessor writers/native context, version/key/time/root/successor/signature/admission/allergy races; original receipt after newer resource/lost authority; crash-before/after/unknown settle; external calls under locks zero; loser no committed effect, fresh rejected crypto, committed replay none.

- [x] T082 [NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-PRIV-002, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-008, NFR-DATA-001, NFR-PRIV-001, FR-SAFE-012, FR-ADMIN-004] Run native/GUC/online-role/RLS/API abuse/redaction matrix — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/security-proof.json`
  - Depends on: `T081`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/security-proof.json` — Applicable OWASP L2/L3/API negatives, direct DML/PUBLIC/helper/service_role/worker denied, native Auth fails closed, caller spoof vs trusted verified GUC distinguished; both roles false/false, FORCE RLS; private/source/key/plaintext sentinels absent.

- [x] T083 [NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-API-001, NFR-QUALITY-001] Fault every all-five transaction/local receipt serialization/encryption boundary across five mutations — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/atomic-proof.json`
  - Depends on: `T082`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K22/atomic-proof.json` — One connection/COMMIT, deferred missing/mismatched receipt/audit/outbox/completion denial, zero partial before commit/exact original after committed crash, unknown not absence/current replay auth; no plaintext durable receipt.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K23 — Operational hardening, performance and restore

- [x] T084 [NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-PERF-002, NFR-QUALITY-001] Add minimum telemetry and performance/restore runners after early exposure safety — `services/api/src/modules/feature-011/observability.ts`, `tools/run-feature-011-performance.mjs`, `tools/run-feature-011-restore.mjs`
  - Depends on: `T083`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/ops-hardening.json` — Opaque correlation only/no PHI/key/source; K03 already owns default-off kill-switch. Load records workload/topology/vendor exclusion; restore isolated exact names/no destructive production down migration.

- [x] T085 [NFR-PERF-002, NFR-QUALITY-001, NFR-PORT-001] Measure all seven operations and distinguish local evidence from formal reference environment — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/performance-proof.json`
  - Depends on: `T084`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/performance-proof.json` — Read p95≤400ms/mutation p95≤800ms excluding vendor time, dataset/topology/device/network recorded; OPEN-TECH-003 reference ownership/disposition required for formal VERIFYING, missing environment remains blocked.

- [x] T086 [NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, FR-SAFE-002, NFR-DATA-001, NFR-DATA-002, FR-SAFE-008, NFR-SEC-001, NFR-PRIV-001, NFR-SEC-005, NFR-API-002, NFR-OBS-001] Restore populated neutral history/envelopes/signatures/admission/receipts in both runtimes — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/restore-proof.json`
  - Depends on: `T084`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/restore-proof.json` — Row/digest/lineage/counts/FORCE RLS/grants/replay intact, future eligibility not early, rollback fresh independently reviewed signed successor; inherited backup/WORM/retention production controls gated, no guessed delete period.

- [x] T087 [NFR-SEC-005, NFR-DATA-001, NFR-API-002, NFR-OBS-001, NFR-SEC-002, NFR-SEC-006, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007] Verify operational redaction/event deduplication/kill-switch/dependency failures — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/observability-proof.json`
  - Depends on: `T085`, `T086`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23/observability-proof.json` — No new notification/template/vendor/Feature 012 consumers, replay no duplicate mutation event/signature, worker retry cannot publish, dependency failures deny, deterministic redacted correlation-only evidence.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

### K24 — Final engineering verification and documentation

- [ ] T088 [NFR-I18N-001, NFR-A11Y-001, NFR-DATA-002, NFR-PRIV-001, FR-SAFE-008, NFR-DATA-001, NFR-SEC-001, FR-SAFE-002, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002] Capture live four-route AR/EN state/accessibility engineering acceptance — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/bilingual-acceptance.json`
  - Depends on: `T087`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/bilingual-acceptance.json` — Four families/99 states/746 approved reference mapping, native/browser live focus/keyboard/screen reader/200% scale/44 targets/contrast/reflow/reduced motion/degraded states. Capture mismatches, OPEN-UX-002 separate owner disposition; no final style/pixel/post-026 polish.

- [ ] T089 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Refresh deferred installation checklist and evidence-backed roadmap progress/traceability — `docs/TEAM-INSTALLATION-CHECKLIST.md`, `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`
  - Depends on: `T088`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/doc-maintenance.json` — Tooling reality verified, completed/remaining checkboxes accurate, no Feature 011 DONE before authorized integration, no ownership/scope change. Exact approved traceability/privacy/retention restrictions; baseline edits explicit review, no silent frozen-manifest hash refresh. If maintenance changes a hashed baseline input, request explicit applicable Product Owner/Architecture disposition and versioned successor binding before final parity; preserve original approval manifest, do not silently refresh it.

- [ ] T090 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Verify final operation/NFR/AC traceability and deterministic current evidence manifests — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/final-parity.json`
  - Depends on: `T089`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/final-parity.json` — Seven operations/19 NFRs/all AC01–16 covered; generated --check/repeat zero diff and legacy regressions; SQL/core/fixed/protocol/body/allergy/receipt/evidence equality, source/current SQL hashes, both-runtime security/race/restore/load/live UI; no exclusion/gate drift.

- [ ] T091 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Run fresh pnpm verify and required dependency/security/quality checks — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/full-verify.json`
  - Depends on: `T090`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/full-verify.json` — pnpm verify exit0 with current logs/hashes and all package suites; runtime failures never skip-green, predecessor regressions preserved; engineering evidence not production, checkpoint authority or gate waiver.

- [ ] T092 [FR-SAFE-002, FR-SAFE-008, FR-SAFE-012, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001, NFR-PRIV-001] Record owner-stage disposition requests and retained gate limits then stop for review — `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/final-gates.json`
  - Depends on: `T091`
  - Acceptance evidence: `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/final-gates.json` — UX001 only F011 test-only Plan prerequisite, UX002/TECH003 formal VERIFYING require owner evidence, TECH002 applicable current IMPLEMENTING assertion not global closure, CLIN001 synthetic and LEGAL001/002/007 production remain unchanged; no rollout/commit/PR/integration authority.

**Checkpoint stop:** Review the above current evidence and obtain separate Product Owner acceptance; no automatic next-checkpoint execution.

## Coverage and acceptance ownership

All AC-01–AC-16 and every target FR/NFR have explicit map coverage. Contract implementation/consumer/evidence and physical storage/test inventories are machine-readable in `contracts/task-map.json`. All user stories end in a separately reviewable synthetic checkpoint. No “MVP through an early task” is claimed. Future implementation must register every test in package/full verify discovery; full verification includes current generated/public/schema/RLS/protection/evidence/race/restore/security/load/live AR/EN proof.

UI implements the existing four routes and current 99-state TEST-ONLY composition, operation-specific confirmations, accessibility, readable localized dates and technical bidi isolation. The approved 746 references are review context rather than a permanent pixel/final styling lock. OPEN-UX-002 remains a separate verification disposition. Documentation maintenance is repository work, not additional Feature 011 scope. PR-only integration remains outside this task authorization.

## Next lifecycle step

Product Owner reviews this fresh candidate; `/speckit.analyze` requires separate authorization. Fresh Analyze/Tasks approval and explicit checkpoint authorization precede any implementation. Historical acceptance is candidate evidence only; no checkbox transfers.
