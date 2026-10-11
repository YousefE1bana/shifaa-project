# Feature 011 — HND-DESIGN-001 decision reconciliation validation

Date: 2026-10-06 (Africa/Cairo). **HND-DESIGN-001 RESOLVED_DESIGN_DECISION; static/vector integrity PASS.** Authority is the explicit Product Owner / Architecture decision recorded in [dated evidence](../decisions/trusted-handoff-design-2026-10-06.md). This is design reconciliation only: C02B/T093–T095 remain unchecked/unexecuted, C03 remains paused, and T017 is not executed. This record is finalized before strictly read-only Spec Kit Analyze; the separate analysis verdict is reported in chat.

## Current contracts and responsibility split

The [handoff text](../contracts/trusted-release-handoff-v1.md), [machine profile](../contracts/trusted-release-handoff-v1.json), [fixed vectors](../contracts/trusted-release-handoff-v1-vectors.json) and [parity registry](../contracts/trusted-release-handoff-parity-v1.json) now define a complete SHIFAA-F011-CREATE-RELEASE-HANDOFF/1 design with no unresolved protected-body design fields. Consumption remains false until authorized C02B execution and explicit checkpoint acceptance.

- Evidence Port resolves/verifies exact immutable unencrypted material and computes SHA-256 in the service boundary; only reference + trusted verifiedSha256 crosses SQL. External caller hashes are never authoritative. Raw material and encryption keys never enter PostgreSQL, durable storage, logs, audit, receipts/outbox or returned payloads.
- SQL validates normalized facts and exact trusted reference/hash equality, constructs unchanged SHIFAA-F011-ARTIFACT/1 canonical bytes, computes the artifact hash and compares optional declaredDigest. It never resolves or hashes external material, calls KMS/network, or encrypts/decrypts.
- SHIFAA-F011-PROTECTED-BODY/1 is AES-256-GCM only and exactly contractId/keyRef/nonce/ciphertext/authTag. [Data model §3.1](../data-model.md) binds five immutable NOT NULL columns: body_contract_id text (exact ID), body_key_ref text (nonempty opaque exact UTF-8), body_nonce bytea (12 octets), body_ciphertext bytea (nonempty), body_auth_tag bytea (16 octets). C04 proves immutable/versioned external key references and rejects aliases; SQL validates structure and stores opaque values. No keyRef public/clinic/log/audit/receipt/outbox exposure, stored JSON envelope, extra algorithm, key material or free-form AAD.
- SHIFAA-F011-PROTECTED-AAD/1 is exact prefix SHIFAA-F011-PROTECTED-AAD/1; plus five S<byte-length>:<UTF-8 payload>, frames: clinical.content_release, canonical lowercase release UUID, body, minimal positive unsigned decimal ASCII artifactVersion, exact keyRef. No JSON/escaping/locale/Unicode/whitespace normalization; workflowVersion is excluded. Reconstruct from authoritative columns/constants.
- Service allocates releaseId and initial version 1 / successor predecessor.version + 1 before protection; preflight/evidence/protection all finish before write locks. SQL locks and revalidates lineage/current authority/expected version or rejects atomically without partial effects. Rejected pre-commit version/race retries use fresh releaseId/random nonce/envelope outside locks. Committed authorized idempotent replay returns the stored result with no second release or encryption. No external work occurs while locks are held.

The lineage-relative version decision necessarily replaces obsolete next_artifact_version and unique(series_id, artifact_version) draft-ordinal allocation with release-scoped unique(id, series_id, artifact_version). Distinct competing/rejected-replacement drafts retain independent immutable identity/history; published-root/published-successor uniqueness, signature resource/version bindings and stale lineage rejection remain. The dated decision records this engineering consequence explicitly; Spec, Plan text, public wire shapes and product semantics are unchanged.

## Fixed vector review

The fixed vector file contains **seven complete synthetic structural handoffs**, **27 specified handoff negative cases**, **seven exact AAD positives**, **23 exact-byte AAD negatives**, two AAD equivalence cases and five allocation cases. All exact UTF-8 strings, lowercase hex bytes, field octet lengths and SHA-256 values are recorded in that file. Expected artifact bytes/hashes reference the frozen V01–V07 inputs and are never regenerated from an implementation under test. The handoffs contain no raw material. Every protected envelope is synthetic structural input, not an encryption proof or clinical content approval.

| AAD vector | Scenario                    | Octets | SHA-256                                                          |
| ---------- | --------------------------- | -----: | ---------------------------------------------------------------- |
| AAD-P01    | initial, version 1          |    152 | 6814debd1fa7905c25b10f86e2e8ca25a64863094d1b82ff3a89be2888e53ffd |
| AAD-P02    | successor, version 2        |    152 | b56b295d9d332a894084ac7f5e6c7c63481579b15c55e8ca86415514a7dee550 |
| AAD-P03    | multi-digit version 10      |    153 | 4e86482a86a596e9faccc6367f9b25498cda3564d778cf2e823fe0520d1f7731 |
| AAD-P04    | Arabic key-reference text   |    151 | 97db0b5842592c2d08a52d74d1ded510f16a061bf0fe9d411a2c4a0d581b6888 |
| AAD-P05    | literal delimiters/newline  |    152 | 8ef5b5ea3aa14a20c19d6ddcb86bcebbc2eea9b17ec34e6b347e514521b49bcb |
| AAD-P06    | composed Unicode key text   |    145 | 58c9bc256feee112bc95624365c62c56ad3d12b6ae21f9e2fc30b1f25dddd844 |
| AAD-P07    | decomposed Unicode key text |    146 | 660bc51a0b2e94c6d88948932edfe7a22a8b14f28f03340c63cba794f600210a |

AAD-P06/P07 hold other fields equal to isolate Unicode preservation; full handoff vectors are independent/reset fixtures. AAD-N01–N23 specify malformed prefix/order/frame length/version/UUID/constants/extra workflow frame/trailing bytes/BOM/character-length/UTF-8/NUL/missing comma/exponent and mutable-alias failures. Alias cases explicitly belong to the C04 trusted-key boundary, not SQL external-key validation. HND negatives specify structure/trust/hash/allocation/retry/cryptography/lock/sink failure responsibilities; actual SQL/crypto/port execution remains later tasks.

## Ledger and dependency validation

**95 tasks / 29 checkpoints remain unchanged; 10 historical completed markers / 85 unchecked.** No new checkpoint, ID, requirement mapping, acceptance mapping or dependency change is needed. C02B remains T093 (future test-first regressions against the completed design), T094 (future metadata/verifier/generator binding only), T095 (future preparation evidence and explicit checkpoint disposition), after T092 and before T008. T008/T012/T016/T017 require T095; C04 remains after T017. T020 proves real producer → already-prepared SQL composition in both runtimes.

Updated descriptions/targets/evidence only: T008, T009, T012, T016, T017, T018, T019, T020, T093, T094, T095. T009 binds the five exact columns and allocation constraints; T012 hashes only the artifact and binds trusted hashes/allocation; T016 proves synthetic physical behavior only; T017 asserts physical/generated parity only, not C04 acceptance. T018–T020 retain real evidence/AES-GCM/nonce/wrong key/version/context/tamper/intended-material/exact AAD/composition proof, with no locked external work. T019 was neither moved nor implemented early. All other task rows and dependencies are identical to the pre-pass snapshot.

## Checks run and acceptance limits

- Review-only static task/vector/hash/preservation assertions PASS: exact model/profile/task agreement, closed envelope field inventory and lengths, immutable key boundary, five-field AAD/order/framing/workflow exclusion, evidence-versus-artifact hashing ownership, before-lock allocation and retry, raw-free SQL fixtures, C03 limitation, C04 composition, current registry hashes and frozen v1 inputs. Dependency graph remains earlier/acyclic; all 23 bounded FR/NFR targets have implementation and verification tasks; AC-01–AC-16 remain mapped. Review diagnostics are ignored artifacts/feature-011/hnd-static-vector-validation.json; these are not T093 regression implementation or task acceptance.
- Independent .NET strict UTF-8/invariant decimal/SHA-256 calculation: **7/7 exact AAD bytes and hashes PASS**; diagnostic artifacts/feature-011/hnd-aad-dotnet-review.json. Expected outputs are reviewed fixed design inputs, not generated by a future port under test. Inverse inspection of fixed bytes verifies all 23 specified AAD rejection cases at their assigned framing/semantic or trusted-key review layer; it does not implement production validation.
- Both existing generator --check commands PASS; existing contracts-only verifier PASS with physicalParity=PENDING and affectedConsumersAllowed=false. Existing C02B metadata is not implemented or accepted by that legacy verifier: T094 must bind the six current handoff/model/governance/decision inputs and registry before T095 acceptance. No generator write, encoder or T017 full-stage assertion ran.
- Existing contracts/client Vitest regressions: **44/44 PASS**, two files; existing fail-closed full-verifier fixture regressions remain green. No C02B functional tests, SQL, real encryption or adapter proof are claimed.
- Approved canonicalization v1 text/profile/parity registry/vectors remain exact at all four approved hashes; therefore V01–V07 bytes/digests and field-8 predecessor exception are unchanged. C01/C02/C02A evidence and generated source remain byte-identical and valid for accepted boundaries, not current handoff/schema acceptance. New model/design hashes need future T094/T095 binding and future physical evidence.
- Snapshot preservation covers existing tracked/untracked files and ignored active-feature state; only nine existing reconciliation files and the new dated decision are changed. Spec/Plan/public OpenAPI, approved UX assets, accepted evidence, generated source, C03 RED drafts/runners and .specify/feature.json are unchanged. Branch/HEAD/main remain unchanged. No DDL, ports, app/core/UI, task completion, runtime startup or Git integration occurred.
- Docs-guard second pass verifies existing versus planned symbols, links, exact contract IDs and synthetic/execution/acceptance claims against source and the user decision. Formatting and final integrity checks run on only the ten authorized design artifacts.

HND-DESIGN-001 is resolved at design level. **C02B is ready for Product Owner / Architecture authorization, not accepted or executed. C03 remains paused** pending accepted C02B and separate explicit resumption. Exactly 19 NFRs/seven operations, catalog reconciliations, Feature 010 boundaries, Feature 012 exclusions, maintenance deferrals and all retained OPEN gates remain; OPEN-TECH-002 is OPEN. No clinical/production gate closure is inferred.

## Current reconciled artifact hashes

| Artifact                                                                                                  | SHA-256                                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [contracts/trusted-release-handoff-v1.md](../contracts/trusted-release-handoff-v1.md)                     | 63a4fa6e2cea7caf00702809bdd0ab726ebc1505a1d86c86f28fcb7accd6458e |
| [contracts/trusted-release-handoff-v1.json](../contracts/trusted-release-handoff-v1.json)                 | 4b3de4bf5319d9f318effdd9e06628a24842863f5ed781737580868230d49f60 |
| [contracts/trusted-release-handoff-v1-vectors.json](../contracts/trusted-release-handoff-v1-vectors.json) | e8c85abed8d13096f180282dab439f2f6b7a29c7a6fa628af46141d163998709 |
| [contracts/trusted-release-handoff-parity-v1.json](../contracts/trusted-release-handoff-parity-v1.json)   | 1f49cbfd6d76aadea244fa9abf43336aa33365ccbd96f031450a2279827bbedd |
| [data-model.md](../data-model.md)                                                                         | e673f39734ba370bade5464cf8852326ff3534b53cb4016ebdef5408f212244d |
| [contracts/governance-boundaries.md](../contracts/governance-boundaries.md)                               | 6ff4c6b43f0865627c4f1afea1aeff81f42d7d0dbd337b69e06b0c8709a166bb |
| [decisions/trusted-handoff-design-2026-10-06.md](../decisions/trusted-handoff-design-2026-10-06.md)       | 8d3fe1ae977bb99e3d24d1cf1f5548dafc0ecdb350f7e681b89acb04488e0bab |
| [tasks.md](../tasks.md)                                                                                   | 8c7159c44253445cf48a86cd6637339ee8a5b328153dae1f4bfe5daf1c85635d |
| [contracts/task-map.json](../contracts/task-map.json)                                                     | a71e6237b43ad150f739cc5ed7a699ed761d3cc3b46acc92a6646539e419fe8e |

The previous record below is a **historical pre-decision snapshot**: its raw-material SQL proposal and HND-DESIGN-001 blocker are superseded by the explicit decision above. Its counts and accepted evidence remain historical; it does not define current handoff responsibilities.

---

# Historical Feature 011 — C02B trusted-handoff reconciliation validation

Date: 2026-10-06 (Africa/Cairo). **Static integrity PASS; design readiness BLOCKED by HND-DESIGN-001.** This is a documentation/task reconciliation, not C02B execution or completion. Finalized before strictly read-only Spec Kit Analyze; Analyze reports its separate verdict in chat.

## Current proposal and prerequisite blocker

The [trusted handoff](../contracts/trusted-release-handoff-v1.md), [machine profile](../contracts/trusted-release-handoff-v1.json), [component/negative vectors](../contracts/trusted-release-handoff-v1-vectors.json) and [parity ownership](../contracts/trusted-release-handoff-parity-v1.json) propose SHIFAA-F011-CREATE-RELEASE-HANDOFF/1. A is exact approved canonical v1 facts; B contains immutable references and exact transient material octets transported internally as closed lowercase even-length hex; SQL recomputes every material digest and the unchanged canonical artifact digest. C is opaque protected persistence input only. Raw material must never persist/log/audit/receipt/outbox/return. No external SQL resolver or application/KMS work is introduced.

**HND-DESIGN-001:** approved data-model §1/§3 and research §4 specify AES-256-GCM, random nonces, versioned key references and resource/field/version-bound context, but do not specify the exact clinical protected-envelope storage fields/types/framing, key-reference representation or authenticated identity/version tuple and allocation timing. The identity/replay adapters are explicitly not substitutes. Architecture/Product Owner must determine these necessary fields before the full handoff is executable. The draft profile has null protected storage/binding schemas and consumptionAllowed=false. No valid full protected-envelope positive fixture is invented.

Seven A/B component vectors reference the immutable V01–V07 canonical facts/expected bytes/hashes and copy exact material octets. Nineteen negative cases specify required review/test outcomes. Material byte/reference/digest integrity was checked; full functional negatives, SQL behavior and actual cryptography are NOT executed in this reconciliation. T093 owns test-first regressions and complete structural positives after profile resolution. Expected canonical outputs are referenced from the frozen vector file, never generated by an implementation under test.

## Task ownership, order and counts

C02B/T093 (contract/vectors/test-first regressions), T094 (generator/verifier metadata only), T095 (preparation evidence and explicit acceptance disposition) are inserted after accepted C02A/T092 and before T008. Stable old IDs and all ten prior completed markers are preserved. **95 tasks / 29 checkpoints; 10 prior completed markers / 85 unchecked**. Kinds: 29 test / 36 implementation-preparation / 30 verification. Phase counts: Setup 13; Foundation 19; US1 9; US2 9; US3 21; US4 9; Hardening 15. No new task is marked complete.

| Task | Dependencies after reconciliation | Bounded responsibility                                                                                   |
| ---- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| T008 | T095                              | Resume valid RED drafts after complete accepted C02B; synthetic handoff/negative/sink tests before DDL   |
| T012 | T011, T095                        | SQL consumes trusted bytes, recomputes digests, persists approved metadata/opaque protected storage only |
| T016 | T015, T095                        | Both-runtime synthetic trusted handoff physical proof; not real evidence-port/AES-GCM acceptance         |
| T017 | T016, T006, T095                  | Physical/generated assertion only; later C04 adapter evidence is pending, not a prerequisite cycle       |
| T018 | T017 (unchanged)                  | Real producer/cryptography/composition RED tests against same handoff                                    |
| T019 | T018 (unchanged)                  | Actual evidence/protection ports and AES-GCM implementation stay C04                                     |
| T020 | T019, T016, T095                  | Real C04 producer → prepared SQL composition in both runtimes plus cryptographic evidence                |

HND-DESIGN-001 resolution and C02B acceptance are required before T008; C03 remains paused. T017 was not executed. C04 was not moved or implemented early. Physical/generated parity preparation does not assert OPEN-TECH-002 closure.

## Validation and preservation

- Review-only static task/contract validation: **1050 assertions PASS**, zero failures. Exact map/Markdown descriptions, paths, evidence, dependencies, checkpoint membership, acyclic earlier dependencies, 23/23 bounded requirement implementation/verification mappings and 16/16 AC mappings agree. Scope sets match the unchanged manifest: 19 NFRs, seven operations, four FR targets with the publication-only slice, retained gates and Feature 012 exclusions.
- Seven component fixtures: exact original material octets/reference/computed SHA-256 equality PASS. This is fixture integrity, not C02B functional, SQL or encryption acceptance.
- `node tools/generate-feature-011-contract.mjs --check`: PASS.
- `node tools/generate-feature-011-client.mjs --check`: PASS.
- `node tools/verify-feature-011-contracts.mjs --contracts-only`: PASS for accepted legacy C02/C02A only; physicalParity=PENDING and affectedConsumersAllowed=false. C02B metadata is NOT implemented; T094 owns that extension. No real default/full T017 assertion was run.
- `corepack pnpm exec vitest run packages/contracts/src/feature-011.test.ts packages/api-client/src/feature-011.test.ts --reporter=verbose`: **44/44 PASS** (two test files). These are existing regressions, not newly implemented C02B tests.
- Pre-existing file snapshot comparison: all files except tasks.md, contracts/task-map.json and this validation record remain byte-identical, including approved Spec/Plan/model, UX references, decisions, C01/C02/C02A evidence, generated source and existing C03 RED fixtures/runners/evidence. Their accepted boundaries remain valid; they do not accept C02B.
- All four approved canonicalization v1 artifact hashes remain exact; therefore all positive canonical bytes/SHA-256 values and the predecessor field-8 UUID exception remain unchanged. No SQL/core/application/UI/encryption implementation, task completion, runtime startup, commit, push, PR or main change. OPEN-TECH-002 remains OPEN.
- Targeted Prettier check/write applies only to these seven reconciliation artifacts. Final post-format task/coverage/dependency/vector/hash/preservation rerun: **927 assertions PASS**; final Prettier check PASS.
- Docs-guard second pass: source references and task paths checked; existing/planned targets distinguished; no claim that blocked protected schema, full vectors, real ports or physical parity are implemented or accepted.

## Current draft artifact hashes

| Artifact                                                                                                  | SHA-256                                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [tasks.md](../tasks.md)                                                                                   | da275e5161683e2e3daee3770ebc3d4c87175b472cfe51d31e6c4823c0b59744 |
| [contracts/task-map.json](../contracts/task-map.json)                                                     | 7a1ee8a2257f0385472789f4252f8dc7db9e2cefe3ece1cd93aac7d45bd4ae20 |
| [contracts/trusted-release-handoff-v1.md](../contracts/trusted-release-handoff-v1.md)                     | 35ade167f6ba9e2bb38ec77e996196178f92abeae1d76a1d03b16c22a6fb2c43 |
| [contracts/trusted-release-handoff-v1.json](../contracts/trusted-release-handoff-v1.json)                 | c3536bd8d06c7843de253c6a348a5d51abaa23110f13bd1e6f2400ec82b5cd63 |
| [contracts/trusted-release-handoff-v1-vectors.json](../contracts/trusted-release-handoff-v1-vectors.json) | 76089881bd91b453df2c33c50e1031e6a09ec3e0da8ebd5a4f90e3a95553f0d7 |
| [contracts/trusted-release-handoff-parity-v1.json](../contracts/trusted-release-handoff-parity-v1.json)   | cb0c476c73c5e236c558137a407b04df20599d9524fb25b4117baf0c88801a50 |

The following record is preserved as a **historical canonicalization reconciliation snapshot**. Its review-pending/count/execution labels describe that earlier pass, not the current accepted C02A or proposed C02B disposition. This current section supersedes those ledger counts.

---

# Feature 011 — canonical artifact byte-contract reconciliation validation

Date: 2026-10-06 (Africa/Cairo). Result: **PASS — proposed contract/task-artifact integrity only**. The proposal remains pending Product Owner / Architecture review. This record is finalized before the strictly read-only Analyze rerun; Analyze reports its separate verdict in chat.

## 2026-10-06 — predecessor UUID wording correction (review pending)

This bounded follow-up corrects the exclusion wording without changing the contract ID/version, prefix, fourteen-field order, framing, input schema, timestamp/digest rules, vector bytes/digests, task ledger or scope/gates. Section 1 now reads:

> The envelope excludes the current release UUID and any physical/database series UUID, artifact_version, workflow_version, publication state, authority/signature records and caller declaredDigest. For successor artifacts, predecessor.supersedesReleaseId is explicitly retained as the sole release-UUID lineage field in the envelope, encoded as a canonical release UUID in field 8. Initial artifacts encode field 8 as N,.

The profile's excludedFields descriptive labels now name any physical/database series UUID and the current release UUID, explicitly retaining the predecessor exception. All executable schema/representation/semanticConstraints values are unchanged. Restoring just these two labels reconstructs the exact previous profile file SHA-256, confirming no other profile change.

The parity registry adds a preparation assertion requiring normative text/profile exclusions, ordinal-8 schema and all vector field-8 frames to agree: initial is N,; successor is its canonical predecessor UUID; no current release or physical series UUID is bound. The assertion is specified for later parity preparation and was also exercised by a disposable review-only stdin calculation here. T090–T092 have not been executed or accepted.

Validation rerun: **141 assertions PASS** for seven positive envelopes/material digests, twenty-five intended rejections, key-order equivalence, lineage agreement and protected-file/hash checks; independent .NET UTF-8/SHA-256 **7/7 PASS**; both read-only PostgreSQL primitive sessions **7/7 exact envelopes and 3/3 normalization cases PASS** (shifaa_api, non-superuser/NOBYPASSRLS; PostgreSQL 17.11 and Supabase PostgreSQL 17.6). Existing task validator **606 assertions PASS**; both generator --check commands and legacy contracts-only verifier PASS. The whole fixed-vector file SHA-256 remains **7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133**. All seven canonicalHex/canonicalUtf8/octetLength/sha256 values are unchanged.

Only normative text, descriptive profile labels, parity registry hashes/assertion and this validation record change in this follow-up. Tasks/map remain byte-identical: **92 tasks / 28 checkpoints**, seven prior completed markers only, 85 pending. OPEN-TECH-002 remains open; extended generated parity remains pending C02A; C03 remains paused. PostgreSQL primitive results are not C03 function/RLS acceptance. No implementation, task completion, commit, push or PR occurs. Review diagnostics are ignored artifacts/feature-011/lineage-wording-validation.json and lineage-wording-postgres-primitives.json. This record is completed before the read-only Analyze rerun; its result is reported separately in chat.

| Current reviewed artifact                                                                                     | SHA-256                                                          |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [contracts/artifact-canonicalization-v1.md](../contracts/artifact-canonicalization-v1.md)                     | f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9 |
| [contracts/artifact-canonicalization-v1.json](../contracts/artifact-canonicalization-v1.json)                 | 88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2 |
| [contracts/artifact-canonicalization-parity-v1.json](../contracts/artifact-canonicalization-parity-v1.json)   | b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523 |
| [contracts/artifact-canonicalization-v1-vectors.json](../contracts/artifact-canonicalization-v1-vectors.json) | 7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133 |

## Current scope and counts

The approved Spec, Plan, data model, OpenAPI, scope manifest, Product Owner decisions, UX baseline and existing C01/C02 evidence are unchanged. Exactly **19 NFRs, seven operations, four bounded FR targets, AC-01 through AC-16**, Feature 010 context dependency, recorded API reconciliations, Feature 012 exclusions, deferred maintenance and all retained gates remain authoritative. OPEN-TECH-002 is open/fail-closed. No clinical or production approval is inferred.

Current ledger: **92 tasks / 28 checkpoints; seven existing completed markers T001–T007 preserved; 85 pending**. Types: **28 test / 35 implementation-preparation / 29 verification**. Phases Setup / Foundation / US1 / US2 / US3 / US4 / Hardening: **10 / 19 / 9 / 9 / 21 / 9 / 15**. No new or C03 task is marked complete.

## Contract and fixed vectors

[Normative contract](../contracts/artifact-canonicalization-v1.md), [machine profile](../contracts/artifact-canonicalization-v1.json), [fixed vectors](../contracts/artifact-canonicalization-v1-vectors.json) and [parity registry](../contracts/artifact-canonicalization-parity-v1.json) define **SHIFAA-F011-ARTIFACT/1**: fixed 23-byte prefix, fourteen ordinal typed UTF-8 octet-length frames, explicit null/initial distinction, six-digit UTC instants, lowercase UUID/digest facts, strict text preservation and caller-declared SHA-256 equality. No JSON serialization, locale or current clock participates. Unicode, delimiter and byte-count behavior is fixed; there is no medical-policy interpretation or implemented encoder.

| Fixed vector | Scenario                                                                              | Exact octets | Expected SHA-256                                                 |
| ------------ | ------------------------------------------------------------------------------------- | -----------: | ---------------------------------------------------------------- |
| V01          | initial release; absent optional source reference maps to null                        |          481 | d6527da9019430db441226d26efdeca86dfd6c4da55d81d4429e603dff3fe9b0 |
| V02          | successor with explicit predecessor                                                   |          546 | ddcd8088b2cecb01405822c7b580b0e1f54d7f9ab9a47d4fdd59c4e05765f383 |
| V03          | future-effective successor; exact microsecond precision                               |          522 | 84bff6dd164dd9d1e011b0f64489de10630eb8016d651c3bb39d4d6dcbf39f2a |
| V04          | Arabic Unicode uses UTF-8 octet lengths                                               |          547 | a7150b3d395f228dca8d27a1ed02f191d8f425b4344a977f1e5e296345808afb |
| V05          | embedded delimiters, quote, backslash and line/control characters require no escaping |          490 | c3bd2728a634d5ba15407eac0e6fbcafbcf78a4ea267b54a4da38d6afa09cdf3 |
| V06          | precomposed Unicode is preserved exactly                                              |          472 | dbedcabeeb37038c9ba44b0ae98aa2fb17283baae2ce76231ea4441b5cb6f0fe |
| V07          | decomposed Unicode is preserved and has a distinct digest                             |          473 | 7f73e509bd1569bb769e0b7f30aa60dbd9edc106d89e63ee9685d0cf753baf17 |

Each positive vector records complete normalized facts, all three neutral material byte strings/digests, exact canonicalUtf8/canonicalHex, byte count and expected digest. B01–B04 add offset/date-boundary, fractional/lowercase wire normalization and source-omission cases. E01 proves reversed object-key insertion order has identical output. N01–N25 cover closed facts, lineage inconsistency, timestamp/digest/UUID/text rejection, byte framing/UTF-8/trailing bytes and caller digest inequality. Internal expectedRejection labels are not API error codes.

## Exact ownership/order reconciliation

| Task/checkpoint    | Required change                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New C02A / T090    | Own/review fixed byte contract/profile/vectors/hash registry and write generator/verifier parity negatives before metadata implementation. Fixed outputs are reviewed inputs, never regenerated from the future encoder under test.                                                                                                                                                                                                                      |
| New C02A / T091    | Extend existing generators/verifier and generated modules with data-only metadata binding the three normative inputs and parity registry; preserve wire shapes/headers/seven methods; add required physical assertion category artifact-canonicalization-v1. No encoder/policy implementation.                                                                                                                                                           |
| New C02A / T092    | Establish current generated metadata/input/tool parity and review disposition before T008; physical evidence remains pending its C03 producer.                                                                                                                                                                                                                                                                                                           |
| T008               | Now depends on T092 instead of T007; test the fixed v1 SQL byte/hash and negative vectors before DDL/functions. Every C03 task depends transitively on accepted C02A.                                                                                                                                                                                                                                                                                    |
| T012 / T016 / T017 | SQL uses exactly v1, server digest/evidence bindings and declared equality; both physical runtimes execute the fixed vectors; only then can the existing affected-stage assertion consume current canonical and physical parity. T017 is not executed here.                                                                                                                                                                                              |
| T045 / T046 / T047 | Test the same v1 and define SQL/core equivalence tests before the core encoder; implement the core encoder later without redefining serialization; prove actual SQL == core == fixed bytes/hash in both runtimes. Equivalence harness tests belong under tools, keeping DB imports outside core. T045 loses its parallel marker because shared-runtime test execution is serial; T046 remains eligible for independent pure-file work after its own RED. |

Stable T001–T089 and C01–C27 IDs are preserved. C02A/T090–T092 is inserted in dependency/checkpoint order after T007 and before T008, not numeric-ID execution order. AC-04/05/07/16 gain C02A prerequisite mappings; all sixteen ACs remain covered. Requirement implementation/verification tables match the map, including new T091/T092. No C13 policy moves early. The prior D1/U1/I1/I2 fixes, default-off exposure prerequisite, synthetic-only T035 demonstration, projection-only T071 and authoritative US4 T074 remain intact.

## Checks run and limits

- Ad hoc stdin Node vector integrity/rejection check: **94 assertions PASS**, seven exact envelopes/material digests, twenty-five intended rejections, ordering/normalization/equivalence and registry agreement. This disposable review calculation is not an application/core encoder or C03 function.
- Independent .NET strict UTF-8 and SHA-256: **7/7 PASS**, exact hex/octet length/expected hashes.
- Read-only PostgreSQL SELECT/CTE framing and SHA-256 primitives: **7/7 exact envelopes and 3/3 instant normalization examples PASS in each runtime**. Sessions were shifaa_api, rolsuper=false and rolbypassrls=false; versions PostgreSQL 17.11 and Supabase PostgreSQL 17.6. No schema, function, table or persistent write was created. These literal-input primitive checks do not prove domain RLS, operation binding or physical implementation acceptance.
- Existing node tools/generate-feature-011-contract.mjs --check, node tools/generate-feature-011-client.mjs --check and node tools/verify-feature-011-contracts.mjs --contracts-only: **PASS for legacy C02 wire preparation only**. The verifier reports physicalParity=PENDING and affectedConsumersAllowed=false. Its inputs do not yet bind this extension; a legacy PASS cannot satisfy T092.
- A first command mistakenly used the nonexistent plural generate-feature-011-contracts.mjs and returned MODULE_NOT_FOUND. The verified singular command above was then run successfully; no repository change was needed.
- Ad hoc task validation: **606 assertions PASS**; 92 exact Markdown/JSON descriptions/files/evidence obligations, preserved markers, earlier-only acyclic dependencies, 28 checkpoint ownership sets, C02A-before-all-C03 ancestry, C13 test-before-encoder/equivalence order, all 23 FR/NFR producer/verification mappings, sixteen AC table mappings and normative-input hashes.
- Snapshot comparison preserves all existing files except governance-boundaries.md, task-map.json, tasks.md and this validation record. Spec/Plan, ignored .specify/feature.json, C02 source/generated outputs and C03 SQL fixture/test/harness drafts remain byte-identical. Documentation second pass distinguishes proposed/future targets from actual implementations and resolves current local contract links.

C02's historical accepted wire shape evidence remains valid, but **extended canonicalization generated-contract parity is not yet complete**. T090–T092 require later explicit implementation authorization, test-first RED→GREEN, review acceptance and current metadata hashes before C03 resumes. The contract definition sequencing gap is addressed by this proposal; C03 remains stopped now. Its existing unfinished T008 fixture/race limitations must still be resolved within its authorized test-first work. T017 remains dependency-blocked and excluded from the prior C03 authorization. No gate closure, application/SQL/core implementation, task completion, commit, push or PR occurred.

Ignored local review diagnostics: artifacts/feature-011/canonicalization-node-validation.json, canonicalization-postgres-primitives.json and canonicalization-task-validation.json. These are review diagnostics, not signed C02A/C03 acceptance evidence.

## Current artifact SHA-256

| Artifact                                                                                                      | SHA-256                                                          |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [contracts/artifact-canonicalization-v1.md](../contracts/artifact-canonicalization-v1.md)                     | f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9 |
| [contracts/artifact-canonicalization-v1.json](../contracts/artifact-canonicalization-v1.json)                 | 88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2 |
| [contracts/artifact-canonicalization-v1-vectors.json](../contracts/artifact-canonicalization-v1-vectors.json) | 7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133 |
| [contracts/artifact-canonicalization-parity-v1.json](../contracts/artifact-canonicalization-parity-v1.json)   | b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523 |
| [contracts/governance-boundaries.md](../contracts/governance-boundaries.md)                                   | fe1d560133cf9fc00fe787d6be0807bbff4521a27bcb0bce07c9d96e37d00d68 |
| [contracts/task-map.json](../contracts/task-map.json)                                                         | 11c6218beea2602e3d50a5e2ce9e773a99edaf2954062bbcff8cbd476d25b1ac |
| [tasks.md](../tasks.md)                                                                                       | 1808a424e1fdcc26f6ba3b164cf3410874055cae3b7fda27c948a1619748b14e |

## Historical 2026-10-02 generation/remediation record

The following is the retained historical snapshot. Its 89-task counts, unchecked-at-generation statement, source hashes and original command results are not current execution state. Current reconciliation counts and hashes are above.

# Feature 011 Tasks remediation validation

Date: 2026-10-02 (Africa/Cairo). Result: **PASS — task-artifact validation only**.

This record supersedes the initial 78-task/26-checkpoint generation validation. The Product Owner authorized D1/U1/I1/I2 remediation and a subsequent read-only `$speckit-analyze` rerun. The current SPEC_APPROVED spec, approved Plan, contracts, canonical scope and [recorded Product Owner decisions](../decisions/product-owner-approvals-2026-10-02.md) remain unchanged. Analyze reports its verdict separately in chat; this document is finalized before that read-only phase.

## Artifacts and counts

- [Task ledger](../tasks.md): **89 unchecked tasks, T001–T089 / 27 checkpoints, C01–C27**.
- [Task map](../contracts/task-map.json): identical task descriptions, paths, labels, dependencies, evidence obligations and AC/checkpoint mappings; remediation metadata records every original-to-current task/checkpoint ID.
- Task ledger SHA-256: `7ea3162547b4213e87ac4bd9acc59cc2d979bb3fa1d3a519adc4ef91adc774dd`.
- Task map SHA-256: `932364a18e3a06be82dee1eb82545ec74a3e5f67edd1c500cd8a9d7b4d1098cb`.
- Task types: 27 test, 34 implementation/preparation, 28 verification. No task has been executed.
- Setup / foundation / US1 / US2 / US3 / US4 / hardening: **7 / 19 / 9 / 9 / 21 / 9 / 15**.

## Exact remediation and sequencing

| Finding                               | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Disposition                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D1 — premature OPEN-TECH-002 evidence | C01/T001–T003 verifies existing baseline/tooling and defines the pending bundle. C02 prepares generated payload/client/verifier evidence. Original C04 moves ahead of the protection seam as C03/T008–T017, preparing the full physical chain and real schema/RLS/non-owner parity. T017 asserts the current complete bundle and applicable owner/stage disposition after T016 and before C04 application/domain consumers. Later SQL corrections require renewed parity/assertion before consumption. Missing, stale, failed or unaccepted evidence stops affected IMPLEMENTING work. | RESOLVED in task design; OPEN-TECH-002 remains retained, with no closure or executed stage pass claimed. |
| U1 — missing verifier producer        | New T006 explicitly creates `tools/verify-feature-011-contracts.mjs`. T004 tests it; T007 uses preparation-only `--contracts-only`; T017 and T089 use the default full quickstart verifier. The full invocation checks refs/shapes/headers/generated parity and digest-bound physical evidence in both runtimes, failing on missing/stale/owner-only evidence. T088 wires the verifier into later validation.                                                                                                                                                                          | RESOLVED; the verifier is a future task target, not created or run in this remediation.                  |
| I1 — premature US4 acceptance         | Original T060 becomes T071/C21 and accepts projection/UI only. Original C21 becomes C22/T072–T074; T074 combines UI evidence with authoritative time/eligibility/qualification/authority-loss evidence for complete synthetic US4 acceptance.                                                                                                                                                                                                                                                                                                                                          | RESOLVED; complete acceptance remains pending all required evidence.                                     |
| I2 — exposure installed too late      | New C06/T024–T026 adds exposure negatives, default-off/kill-switch guard and prerequisite proof before first route registration T031 and demonstration T035. Actual API/UI consumers rerun negatives before acceptance. Original T071 becomes T082/C25 and retains late operational telemetry/hardening and guard regression only.                                                                                                                                                                                                                                                     | RESOLVED; no actual route or exposure was implemented/enabled.                                           |

Original T024 becomes **T035/C09: isolated synthetic engineering demonstration only**. It expressly confers no shippable MVP, deployment readiness, clinical readiness or Feature 011 completion.

### Physical preparation split

Only planned ownership/order changes; no migration or SQL implementation was performed.

| Original combined SQL/API task     | New physical preparation task                                       | Retained application consumer |
| ---------------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| T020 allergy read/create           | T010, migration `20261002001102_f011_allergy_entrypoints.sql`       | T031                          |
| T029 verification/correction       | T011, migration `20261002001103_f011_allergy_verification.sql`      | T040                          |
| T038 content draft/governance read | T012, migration `20261002001104_f011_content_entrypoints.sql`       | T049                          |
| T044 signing/signature extension   | T013, migration `20261002001105_f011_content_signatures.sql`        | T055                          |
| T050 publication                   | T014, migration `20261002001106_f011_content_publication.sql`       | T061                          |
| T056 status projection             | T015, migration `20261002001107_f011_content_status_projection.sql` | T067                          |

Foundation migration preparation is original T011 → T009, retaining all quoted data constraints and proposed CLI timestamp substitution rules. T008 defines physical SQL behavior/negative/race vectors before DDL preparation; T016 requires those vectors and schema/RLS parity to pass in both runtimes. Later T030/T039/T048/T054/T060/T066 extend these through real API/domain consumers: already-prepared SQL stays green while missing application behavior supplies the intended RED. No owner/mock/sleep-only/skip-green proof qualifies.

There are **11 added tasks**: T006, T010–T015, T017, T024–T026. No original obligation is removed. Original C03 → C04 and C04 → C03; C01/C02/C05 retain IDs; original C06–C26 shift to C07–C27 around the new C06 exposure checkpoint. Original T001–T005 retain IDs; T006 → T007; T007–T009 → T018–T020; T010–T012 → T008/T009/T016; T013–T015 → T021–T023; original T016–T078 shift by 11.

C02 has four tasks and C03 has ten; other checkpoints have three. C03 is one serial prerequisite bundle spanning the existing seven migration targets, with a single explicit evidence assertion. Splitting those producers into extra approval checkpoints would add fragmentation without changing the gate. The new exposure checkpoint separates a safety prerequisite from late operations work. Counts are derived from these dependencies rather than preserving 78/26.

C13 policy work forks after T026; C23 joins T044 and T074. Shared DB/harness/route work is serial. Only T027/T028 and T045/T046 have parallel markers, using separate pure-policy files after their own tests.

## Validation performed

The installed `setup-tasks.ps1 -Json` resolved the Feature 011 worktree and repository override template. The local extensions YAML parses successfully; no before/after Tasks or Analyze hooks are configured. No third-party executable or network helper was invoked.

Read-only ad hoc Node validation against saved Markdown/JSON and canonical inputs passed **1283 assertions**:

| Check                                                                                               | Result                                                         |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Strict three-line task blocks, sequential IDs, unchecked boxes, story labels, exact paths           | PASS, 89 tasks                                                 |
| Markdown/JSON content and requirement/AC table parity                                               | PASS                                                           |
| Earlier-only acyclic dependencies, checkpoint ownership/order, US3 fork/hardening join              | PASS                                                           |
| Contract verifier producer before preparation/full verification consumers                           | PASS                                                           |
| Full seven-migration preparation before T017; T017 precedes every affected implementation consumer  | PASS                                                           |
| Exposure tests/guard/proof before route/UI consumers and T035; actual-consumer regressions retained | PASS                                                           |
| Projection/UI-only T071 before complete-US4 T074; later operations split                            | PASS                                                           |
| Exactly 19 NFRs / four bounded FR targets / seven method-path operation mappings                    | PASS                                                           |
| Every FR/NFR has implementation and verification tasks; all AC-01–AC-16 mapped                      | PASS                                                           |
| OpenAPI local references and mutation headers                                                       | PASS, 107 refs, five Idempotency-Key / three If-Match bindings |
| Parallel isolation, quoted constraints and existing artifact links                                  | PASS                                                           |
| Gates, exclusions, four allergy states, synthetic fixtures, deferred maintenance                    | PASS                                                           |

A docs-guard second pass under SHIFAA guardrails checked existing source/command references, planned-file wording, scope/authority claims, links, gate semantics and the test-first sequencing. Future tools/migrations/guards remain explicitly unimplemented proposals.

The existing candidate validator was run:
`node specs/011-allergies-clinical-content-governance/visual-baselines/validate-reference-baselines.mjs`

Result: **PASS**, four families / 99 states / 746 references / 19 NFRs / seven operations. Source/authority/font/fixture/reference hashes, dimensions, inventory, gallery parity and diff hygiene pass. Manifest SHA-256 remains `59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432`. Historical pending-approval capture metadata is preserved; the separate dated Product Owner decision remains authoritative.

## Preservation and limits

All **786 protected file checks** match the before-remediation snapshot: the 780 Feature 011 files outside the three authorized task artifacts (including the Product Owner decision) plus six protected files for feature state/constitution/catalog/reconciliation/deferred maintenance. Sorted repository-relative path/hash rows, serialized with JSON and SHA-256, retain aggregate `9d5226f7f514316ca81499c758e535c811395ec1c106ed6b02cfcd2d47f64340`.

Branch remains `codex/011-allergies-clinical-content-governance`; HEAD remains `670b1e0fe15c719b98179805f2628d1b478a55dd`. The main checkout remains clean. Only tasks.md, contracts/task-map.json and this validation record change.

No application code, physical migration, generated client, runtime verifier, UI, approved Plan/spec/baseline, API Catalog/reconciliation, feature pointer or deferred maintenance target was edited. No task was marked complete. Real PostgreSQL/Supabase race/RLS/replay/signature/publication/restore, live AR/EN/accessibility/load and canonical pnpm verify are future obligations, not results from this static remediation.

All retained OPEN gates and Feature 012 exclusions remain intact. OPEN-CLIN-001 permits synthetic mechanism engineering only; no real clinical content/professional qualification/legal/production approval is inferred. OPEN-TECH-002 remains retained; synthetic local preparation cannot replace any applicable required formal stage acceptance.

The next authorized action is the **read-only `$speckit-analyze` rerun**, with its verdict in chat only. **STOP after Analyze for Product Owner review.** No implementation, task completion, commit, push or integration is authorized here.

**TASKS_DRAFTED — AWAITING PRODUCT OWNER REVIEW**
