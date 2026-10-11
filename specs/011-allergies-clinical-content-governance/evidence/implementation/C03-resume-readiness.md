# Feature 011 C03 resumption readiness

Date: 2026-10-06 (Africa/Cairo). Disposition: **C03_BLOCKED; T008 remains partial; T009–T016 not started**. T017 was not executed. No task was marked complete. This record supplements, and does not overwrite, [the original RED evidence](C03-red.md).

## Accepted prerequisite and preservation

Product Owner + Architecture Lead accepted C02A and authorized only T008–T016. The original [canonical-byte prerequisite blocker](C03-blocker.md) is resolved by the approved SHIFAA-F011-ARTIFACT/1 contract and C02A. It is not the blocker reported below.

All four immutable files match the approved hashes:

| Artifact        | SHA-256                                                          |
| --------------- | ---------------------------------------------------------------- |
| Contract text   | f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9 |
| Machine profile | 88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2 |
| Parity registry | b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523 |
| Fixed vectors   | 7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133 |

No canonical bytes, vector expectations, field-8 predecessor exception, generated output, approved Spec/Plan, scope, operation or gate was changed. Exactly 19 NFRs and seven operations, both catalog reconciliations, Feature 010 dependency and Feature 012 exclusions remain intact.

## Unresolved physical evidence/protection handoff

The [canonical contract §1](../../contracts/artifact-canonicalization-v1.md) requires resolving the three evidence references to exact immutable unencrypted material bytes through the approved evidence port. SQL must compute/verify material digests; reference text, caller-supplied digest and ciphertext are not substitutes. The [data model §§1, 2, 3 and 6](../../data-model.md) also requires protected artifact payloads and clinical receipts, versioned keys/authenticated context, and preparation of port material before the locked transaction without network/KMS calls under locks.

The inspected physical drafts call create_clinical_content_release_api_v1(text,jsonb) with the wire-shaped artifact references only. They provide no resolved material bytes or protected internal payload. The closed OpenAPI Artifact object intentionally has only contentEvidenceRef, codeEvidenceRef, testVectorEvidenceRef and optional declaredDigest. That wire shape must remain unchanged.

The baseline identity.private_evidence_objects table stores object identity/location and SHA-256 metadata, not the referenced object bytes. Both fresh baseline databases confirmed that its columns are id, bucket_code, object_key, owner_person_id, facility_id, sha256, mime_type, size_bytes, scan_status, created_at, released_at, resource_patient_id and resource_dsr_id. No inspected clinical resolver supplies the required bytes to the proposed SQL entrypoint.

The task ledger assigns creation of the framework-free evidence/protection ports and exact-byte AES-256-GCM adapter to **C04/T019**, dependent on T018, which depends on T017. Neither planned ports.ts nor protection.ts exists. Those are later tasks, not prerequisites that this run can implement silently. Feature 010's note function accepts an internal bodyCiphertext envelope prepared outside SQL, but it does not define Feature 011's three-reference material resolution, protected artifact handoff or durable clinical-receipt handoff. IdentityCipher and TransientReplayCipher are expressly excluded as substitutes by the approved data model.

This is an unspecified internal physical adapter contract/producer boundary, not a claim that v1 is impossible to encode in PostgreSQL. No SQL encoder was attempted and no vector divergence was observed. Hashing the normative facts alone would not prove the required real create-release operation. A fixture-only resolver installed as a production function, an unapproved evidence store, caller-trusted digests, plaintext clinical persistence or a fail-closed stub would not establish T016 acceptance.

Before DDL consumes this boundary, Architecture needs an explicit internal handoff defining evidence reference-to-material provenance, where trusted pre-transaction resolution occurs, what protected payload/receipt representation SQL accepts and returns, and the test/contract producer preceding T008/T012. This can preserve the public wire contract and leave the actual C04 adapter implementation in C04. No new operation, canonicalization version, clinical rule or gate closure is proposed here. No task order or approved design was changed in this run.

The SHIFAA project guardrail says: “Stop and surface a conflict. Do not silently select a lower-authority interpretation.” Selecting a new evidence/protection boundary during physical acceptance would silently fill this missing prerequisite. Preparation therefore stopped before migration generation.

## Fresh verification

| Check                                                                                                                                   | Result                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| node --version                                                                                                                          | v24.18.0                                                                                |
| corepack pnpm --version                                                                                                                 | 11.13.0                                                                                 |
| corepack pnpm exec supabase --version                                                                                                   | 2.113.0                                                                                 |
| corepack pnpm exec supabase migration new --help                                                                                        | Exit 0; help only, no migration generated                                               |
| Both full baseline chains in new template0 scratch databases                                                                            | PASS: all 27 predecessor migrations and eight existing synthetic actors                 |
| PostgreSQL runtime                                                                                                                      | 17.11; shifaa-local-postgres-postgres-1                                                 |
| Supabase PostgreSQL runtime                                                                                                             | 17.6; supabase_db_shifaa-local-supabase                                                 |
| Actual online identity in both scratch databases                                                                                        | current_user=session_user=shifaa_api; rolsuper=false; rolbypassrls=false                |
| Feature executor and entrypoint existence                                                                                               | Executor absent; inspected Feature 011 entrypoints absent in both runtimes              |
| node tools/generate-feature-011-contract.mjs --check                                                                                    | Exit 0                                                                                  |
| node tools/generate-feature-011-client.mjs --check                                                                                      | Exit 0                                                                                  |
| node tools/verify-feature-011-contracts.mjs --contracts-only                                                                            | PASS; CONTRACT_PREPARATION_ONLY; physicalParity=PENDING; affectedConsumersAllowed=false |
| corepack pnpm exec vitest run packages/contracts/src/feature-011.test.ts packages/api-client/src/feature-011.test.ts --reporter=verbose | Exit 0; 44/44 tests, including legacy C02 and C02A metadata/negative regressions        |
| requirements checklist                                                                                                                  | 16 checked, zero pending                                                                |

The first regression invocation mistakenly used node --test on Vitest test files and failed during Vitest suite initialization. The package scripts/imports identified the runner mismatch. The corrected Vitest invocation above passed; no source or dependency fix was made. Fixture-based full-verifier negative regressions are not execution of the real T017 stage assertion.

The fresh runtime probe used the existing isolated runner's prepare/withDatabase functions. Administrative migration setup identities were shifaa_owner and supabase_admin; they are not RLS proof. Online probes explicitly used SET SESSION AUTHORIZATION shifaa_api. Both scratch databases were dropped without FORCE; application databases were neither reset nor migrated. Both runtime containers remained healthy and running.

Local machine-readable probe output, commands, baseline migration hashes and absence checks are retained in ignored artifacts/feature-011/c03-resume-prerequisites.json. A pre-change snapshot in c03-resume-before.json covers 3,420 existing files, including .specify/feature.json. These local artifacts are not portable physical-parity acceptance evidence.

## Task and evidence disposition

| Task | Status                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| T008 | PARTIAL / BLOCKED: original valid RED and drafts retained; complete material/protection handoff and downstream test bodies are not validated |
| T009 | NOT STARTED                                                                                                                                  |
| T010 | NOT STARTED                                                                                                                                  |
| T011 | NOT STARTED                                                                                                                                  |
| T012 | NOT STARTED                                                                                                                                  |
| T013 | NOT STARTED                                                                                                                                  |
| T014 | NOT STARTED                                                                                                                                  |
| T015 | NOT STARTED                                                                                                                                  |
| T016 | NOT STARTED                                                                                                                                  |

Original 16 missing-DDL RED results and two missing-concurrency-entrypoint probes remain preserved. No RED-to-GREEN physical transition occurred. The unfinished encounter/grant/predecessor-signature fixtures, closed response assumptions and qualification-loss/rollback/clock-boundary/atomic-receipt bodies identified in C03-red.md remain work within T008; they are not additional governance blockers.

V01, V02, V03, V04, V05, V06 and V07 were **not executed through SQL in either runtime**. Their frozen expected bytes/digests remain unchanged. SQL canonical negatives, independent-connection races, barrier/pg_locks observations, Feature 011 FORCE RLS/grants/function parity, non-owner executor execution and populated predecessor compatibility have no GREEN proof. Primitive integrity or generated-metadata tests must not be reported as those proofs.

Generated contract/client hashes remain respectively 268790dd2f3dd2dfe7c0e6c63a189b8daffe8c8f17e223e7de5bdbbe15507162 and 0dcbe39619ed2e87fd78fd89b8d2364be91d92e56ee186d778b3c4e50c564467. Their canonical-input binding is current; physical binding remains PENDING. No physical-parity.json, schema-rls.md acceptance bundle or T017 assertion was created. No Feature 011 application route/module was added; current app/server composition contains no Feature 011 allergy/content registration.

OPEN-TECH-002 remains **OPEN and fail-closed**. Remaining obligations are the completed T008 matrix, seven approved migrations, both-runtime physical/generated/schema/RLS and exact v1 operation proofs, race/grant/receipt/predecessor evidence, and subsequent authorized T017 stage/owner disposition. Other retained clinical/technical/UX/legal gates are unchanged. T017 is **not dependency-unblocked**.

Branch: codex/011-allergies-clinical-content-governance. HEAD and main: 670b1e0fe15c719b98179805f2628d1b478a55dd. Only this reviewable evidence document was added outside ignored local probe artifacts. Existing dirty files and task boxes were preserved. No DDL, SQL/core encoder, API/application/UI, C04 task, commit, push, PR or main change occurred. STOP for Product Owner / Architecture review.
