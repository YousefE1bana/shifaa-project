# C02 contract preparation evidence — complete, awaiting Product Owner review

Date: 2026-10-06 (Africa/Cairo). Authorization: C01 accepted by Product Owner; C02/T004–T007 only. Branch: `codex/011-allergies-clinical-content-governance`. HEAD: `670b1e0fe15c719b98179805f2628d1b478a55dd`.

## Task results

- T004: runnable contract/client/verifier tests; [initial RED](C02-red.md) records 20 contract and three client failures for missing behavior. Four additional evidence-record negatives were added during the guard pass. Final Feature 011 tests: 24 contract + three client = 27 PASS, zero skips.
- T005: both generators read the unchanged approved OpenAPI; schema/type symbols are Feature011-prefixed to preserve existing exports. Generated TypeBox schemas, typed seven-operation client, package subpath exports and generation/check scripts are present. Generated output was never hand-edited.
- T006: default full verifier and explicit contracts-only preparation mode implemented. Both refuse consumer authorization; a full evidence pass cannot replace the separate C03/T017 owner/stage assertion.
- T007: generation/check commands, targeted and package regression tests, typechecks, unchanged second-generation hashes, preserved catalog reconciliations and evidence recorded here.

Scope remains exactly 19 NFRs and seven operations. No Feature 012 capability, application route, medical rule, real content, clinical approval or production gate closure was introduced. C03–later tasks remain unexecuted.

## Commands and actual results

All commands ran from the Feature 011 worktree. No shared SQL harness was involved.

| Command/check | Result |
| --- | --- |
| `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Correct approved feature directory/tasks found; requirements checklist 16 checked/0 unchecked; no implementation extension hooks |
| `node tools/generate-feature-011-contract.mjs` | Exit 0; generates closed wire schemas and root export |
| `node tools/generate-feature-011-client.mjs` | Exit 0; generates exactly seven typed method/path bindings |
| Repeat both generation commands, compare SHA-256 of schemas, client and contracts index | Zero byte changes |
| `node tools/generate-feature-011-contract.mjs --check` | Exit 0; current |
| `node tools/generate-feature-011-client.mjs --check` | Exit 0; current |
| `corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-011.test.ts` | Final 24/24 PASS |
| `corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-011.test.ts` | 3/3 PASS |
| `corepack pnpm --filter @shifaa/contracts --filter @shifaa/api-client test` | Exit 0; 20 files, 60 contract + 38 client = 98 tests PASS, zero skips |
| `corepack pnpm --filter @shifaa/contracts --filter @shifaa/api-client typecheck` | Exit 0 for both packages |
| `node tools/verify-feature-011-contracts.mjs --contracts-only` | Exit 0; CONTRACT_PREPARATION_ONLY, PASS, no failures; physicalParity=PENDING, affectedConsumersAllowed=false |
| `node tools/verify-feature-011-contracts.mjs` | Expected exit 1; FAIL because physical-parity.json is absent; PENDING, consumers denied |
| `node tools/verify-feature-011-scope.mjs` | Exit 0; no failures; OPEN-TECH-002 PENDING, T017 assertion still required |
| `corepack pnpm exec supabase --version` | Project-local **2.113.0** |
| `node --version`; `corepack pnpm --version` | **v24.18.0** / **11.13.0** |
| `docker inspect --format '{{.Name}}|{{.State.Status}}' shifaa-local-postgres-postgres-1 supabase_db_shifaa-local-supabase` | Both exited; no runtime startup |
| `git diff --check` | Exit 0 |
| `corepack pnpm exec prettier --check` on the three new tools, four generated/test files and both package configurations | Exit 0; all matched files formatted |

The test fixtures were corrected to the actual approved source: listClinicalContent requires the requested projection (which cannot expand authority), and governance rows exclude the clinic signature-status field. Required query inputs have no fabricated client defaults. No OpenAPI, Spec, Plan or product decision changed.

## Contract assertions and limits

Wire tests validate known/explicitly unknown facts, mandatory substance/source, closed create/verification bodies, the three verification targets, initial versus explicit predecessor shape, exact artifact identity separate from workflow CAS, three disjoint content projections and RFC 9457-shaped errors. Clinic rows reject bodies, drafts, workflow versions and signer identities. Client tests prove five idempotency and three quoted If-Match bindings, optional requested purpose, current token use, opaque identifiers/cursors encoded without alteration, no client AAL/actor assertion headers, no-store requests, problem propagation and rejection of unsafe response cache policy.

The verifier resolves all local refs and rejects external/unresolved references, open object shapes, extra or changed operations/header bindings, stale generated outputs, missing/stale generators or package wiring. It regenerates in memory rather than accepting copied digests as generation proof. Existing verifyAllergy terminal-error/correction and listClinicalContent status/assigned-review reconciliations remain on their existing operations.

Cursor tests prove closed filter/query shapes and lossless opaque wire transport only. Signed subject/series/projection/filter binding, reauthorization and server behavior remain later real-runtime obligations. Mocked fetch establishes client transport behavior only; TypeBox acceptance does not establish patient/clinician/admin/signing authority or state-transition enforcement.

## Full physical evidence input contract — not produced in C02

The verifier reads `evidence/implementation/physical-parity.json` relative to this feature. Format version 1 requires syntheticOnly=true, current HEAD, an exact sourceDigests map, a digest-bound expectedCatalog descriptor and exactly both named runtime records. Each artifact descriptor is {path, sha256}, restricted to this feature's implementation evidence directory.

sourceDigests binds all files in the table below except the test files, plus infra/db/policies/feature-011.sql, the Feature 011 SQL fixture, schema/RLS and six behavior SQL test files, both approved PostgreSQL/concurrency runners, and **every current baseline + all seven Feature 011 migration files**. The complete seven named migration suffixes are required. Missing files, stale digests and incomplete chains fail closed. The producer must use the exact verifier input paths, not claim an owner-only summary is parity.

expectedCatalog contains tables, functions, roles and signatureSidecar. Table identities are the eight named data-model tables, inherited audit.signature_evidence and the explicitly named restricted clinical signature-binding sidecar. Each table records full columns/type/nullability, named constraint definitions, policy command/roles/using/withCheck expressions, ENABLE/FORCE RLS flags and grants. Domain grants to PUBLIC/anon/authenticated/service_role/shifaa_api/shifaa_worker are forbidden. Functions record seven unique clinical identities with operationId, method, path, arguments, result, definitionSha256, owner, securityDefiner, searchPath and grants; they require the non-owner executor, empty search path and narrow EXECUTE grants. Role records prove shifaa_api and shifaa_f011_executor NOSUPERUSER/NOBYPASSRLS/non-table-owner; executor also NOLOGIN.

Each runtime record contains id, kind=real, postgresMajor=17, isolated=true, database, executionRoles, catalog and execution descriptors; the Supabase record also requires supabaseCliVersion=2.113.0. Observed catalogs must exactly match the complete expected snapshot. Execution records bind runtimeId/database/sourceDigests and measured current users across both online and executor identities. Each assertion requires its command array, zero exit/failed/skipped counts, positive passed count, permitted currentUser and nonempty digest-bound log.

Required assertion categories: schema-constraints; forced-rls; non-owner-execution; direct-public-service-denial; seven-function-bindings; predecessor-compatibility; append-error-correction; exact-artifact-independent-signing; current-qualification-authority-loss; initial-supersession-rollback-future-races; closed-status-projection. These summarize the approved C03 evidence obligations; they add no clinical policy or operation.

This verifier validates recorded provenance, freshness, completeness and catalog agreement. It neither executes SQL nor independently authenticates the truth of a log or a supplied expected catalog. C03 acceptance must review the actual reproducible database runs and expected catalog against applied DDL; a JSON PASS, fabricated record or counts alone cannot satisfy OPEN-TECH-002. Deliberately invalid populated filesystem fixtures test rejection of stale bindings, owner-only execution, missing race coverage and RLS mismatch; they are **not real database evidence** and are removed after each test.

## Digests

These are preparation-input/output/test digests, not applied-runtime evidence.

| File | SHA-256 |
| --- | --- |
| `specs/011-allergies-clinical-content-governance/contracts/openapi.yaml` | `2c20eef7029079e5f174d09f84b7c042b7c8347e125c05755a3bdf26dc45880e` |
| `specs/011-allergies-clinical-content-governance/contracts/scope-manifest.json` | `53e46fbbbf79526749e0786c1630a2c2b6ad515ec3ac33d8755d2730df0842ac` |
| `specs/011-allergies-clinical-content-governance/data-model.md` | `be348c5d1d890b979b0ef322e313296fda9efe78c45ae25238fe9897acae14c7` |
| `docs/architecture/SHIFAA-API-Catalog.md` | `8e7f5cbea6d36d1d6a89f2920f0871db361b8b10f650301f22cbbbc9556d5d0f` |
| `docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md` | `51fdac8ecd2710bc13a53c89f9d09d4d486ad36631056e7171521d5e16b6abd6` |
| `tools/generate-feature-011-contract.mjs` | `0a65bbc1025cc8dc69908e2a7162bd190052b0621c6c4bc4d1068be72dc5dd3d` |
| `tools/generate-feature-011-client.mjs` | `b7adafe387ff82feaed1448f8eb3a3439e811b7231fe7456dab3f0d7383b12ad` |
| `packages/contracts/src/feature-011.ts` | `72903bef49d8f29923cf5b3d8804cc6b48a29085513c9f6239316b7f03e398f2` |
| `packages/contracts/src/index.ts` | `4de8805dac48f897710071db36eb175c2aa65b758af8a81596a7e537bfb3c3f6` |
| `packages/contracts/package.json` | `de33203c197aa6e5ce0479b2243b8cc0c94ae2e47007fbaeaf842a1ab4cefc10` |
| `packages/api-client/src/feature-011.ts` | `c11359965c03f141f394252beb9b02775ead1723f4241283cb1e33f44d708306` |
| `packages/api-client/package.json` | `e0e748747ea7709c0ea47bfd0169ac8471eb44d5b06f8873fa21ee06336b7cc5` |
| `tools/verify-feature-011-contracts.mjs` | `4577051dc3b6a1af17945b877aed1fae70ba75e8ad3b2dc93d827e0d6f578c3d` |
| `packages/contracts/src/feature-011.test.ts` | `b0f848042f45203d60cda162c2443a2e1434e8f5304edc7c70b91e07ec9bbb82` |
| `packages/api-client/src/feature-011.test.ts` | `211fd21ecdab77ba1a0ea7f37a70b9c3c03cf18d1ec56a51fc05586f48db5c0c` |

Existing migration inventory: 27 files; zero Feature 011 migrations; canonical JSON inventory SHA-256 `b67a07180499123a4f469eac1cefce47ab8e898e35f235c112f3697dfaff4e6f` (sorted path-to-file-SHA256 map serialized with JSON.stringify). No migration was generated/applied. No Feature 011 SQL fixture or runtime evidence exists, so their applied-runtime digests are unavailable rather than invented.

Ignored local records: artifacts/feature-011/c02-before.json (3,392 preexisting file hashes including .specify/feature.json), c02-generation.json, c02-contract-preparation.json, c02-full-parity.json, c02-scope.json and c02-baseline-migrations.json. The source/output digest table above is retained here so checkpoint review does not depend on ignored machine files.

## Guard review, preservation and next boundary

shifaa-project-guardrails and shifaa-speckit-overlay govern this checkpoint. clean-code-guard/test-guard/docs-guard were applied with shifaa-third-party-skill-overlay as second-pass reviews; no external bundled executable ran. Review checked actual imports/exports, generation freshness, required inputs, authority-header separation, fail-closed errors, isolated test cleanup and honest evidence/runtime claims. No scope or architecture redesign was made.

The 3,392-file snapshot comparison permits only the two package configurations, contracts index and T004–T007 checkbox updates in tasks.md. Approved Spec/Plan/OpenAPI/data model/task map/UX references/decisions/catalog reconciliations, root package.json, pnpm-lock.yaml and ignored active-feature state remain byte-identical. Existing uncommitted specification and catalog work is preserved.

Final preservation check: 3,388 preexisting files byte-identical; exactly four authorized existing files changed. Reversing only T004–T007 checkbox edits reproduces the original tasks.md hash. Nine new C02 files: the two generators, contract verifier, two generated outputs, two test files, C02-red.md and this contracts.md. The ignored c02-final-preservation.json records the exact file lists. No files were staged.

**OPEN-TECH-002 remains OPEN and fail-closed.** Generated contract/client preparation is complete; C03/T008–T016 must still produce complete additive physical schema/RLS/grants/function parity and both-runtime non-owner behavior/race evidence. C03/T017 must separately assert the fresh bundle and applicable owner/stage disposition before C04 affected consumers. Retained OPEN-CLIN-001, OPEN-TECH-003, OPEN-UX-001/002 and OPEN-LEGAL-001/002/007 are unchanged; exact TEST-ONLY UX approval does not close program gates.

C02 is complete for Product Owner review. T007 satisfies C03/T008's dependency, so C03 is dependency-unblocked **for preparation only**, pending separate authorization. No C03 work, full pnpm verify, live UI acceptance, commit, push, PR or main modification occurred. Execution stops here.
