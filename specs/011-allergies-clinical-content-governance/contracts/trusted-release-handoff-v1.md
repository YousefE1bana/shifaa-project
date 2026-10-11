# Feature 011 — trusted create-release handoff v1

Contract ID: **SHIFAA-F011-CREATE-RELEASE-HANDOFF/1**. Related contracts: **SHIFAA-F011-PROTECTED-BODY/1**, **SHIFAA-F011-PROTECTED-AAD/1**. Date: 2026-10-06. HND-DESIGN-001 is **RESOLVED BY PRODUCT OWNER / ARCHITECTURE DESIGN DECISION** recorded in [dated evidence](../decisions/trusted-handoff-design-2026-10-06.md). Prior Plan approval is suspended and implementation fully paused by the [recovery decision](../decisions/plan-recovery-2026-10-06.md). The 95-task ledger is historical recovery input, not execution authority; C02B/T093–T095, C03 and T017 remain unexecuted/unaccepted and unauthorized.

The [profile](trusted-release-handoff-v1.json), [fixed handoff/AAD vectors](trusted-release-handoff-v1-vectors.json) and [parity ownership](trusted-release-handoff-parity-v1.json) describe the same design. Public OpenAPI, seven operations, 19 NFRs, medical/product semantics and retained OPEN gates remain unchanged. The four approved artifact-v1 files remain byte-identical.

## 1. Separate producer, contract and physical layers

1. C04/T018–T020 owns the real Evidence Port and Protection Port. Only the trusted application/service composition may produce verified evidence results and a protected body. External API callers cannot author verifiedSha256, release allocation, key references or trust flags. Public DTO validation and internal assembly remain distinct.
2. C02B/T093–T095 owns the internal contract, fixed vectors, test-first metadata regressions and generator/verifier binding. No resolver, AES-GCM, canonical encoder, DDL, SQL function or route is implemented by this reconciliation.
3. C03 consumes the handoff at the existing planned clinical.create_clinical_content_release_api_v1(text,jsonb) binding. SQL validates authoritative context/lineage/allocation and structural fields, constructs SHIFAA-F011-ARTIFACT/1 bytes and hashes the artifact. SQL never receives raw evidence material or keys, verifies external material, encrypts/decrypts, or calls network/KMS/HSM.

Enforce the trusted producer through the existing application assembly boundary plus narrow shifaa_api EXECUTE grants, forced RLS, and planned shifaa_f011_executor NOLOGIN/NOSUPERUSER/NOBYPASSRLS/non-table-owner execution. A client property, requested projection, JWT role or synthetic flag is not producer/actor authority. Native session/purpose/AAL2 and action-specific ADM-MEDICAL creation requirements still apply independently.

## 2. Closed internal handoff

The logical input has exactly contractId, artifactFacts, trustedEvidence, allocation, protectedBody, and optional declaredDigest. These are internal names, not new public wire fields. Required members cannot be omitted; unknown members reject at every closed-object level. The trusted service rejects duplicate members before conversion to JSONB, which cannot preserve duplicate-member evidence. Internal JSONB transport is a carrier only; neither artifact nor AAD is a JSON serialization.

### A. Approved canonical artifact facts

artifactFacts is the unchanged closed normalized SHIFAA-F011-ARTIFACT/1 object: contractId; series.contentType/governedContentKey/effectiveScopeKey; source.display/reference; effectiveAt; predecessor.initial/supersedesReleaseId; evidence.content/code/testVectors.ref/sha256. Every approved text/UTC-microsecond/UUID/digest/null/initial normalization rule remains applicable.

The trusted service builds evidence digest facts from B. SQL independently rejects any facts ref/digest unequal to B, constructs the approved fourteen-field envelope using those trusted verified digests and computes its SHA-256. SQL compares optional caller declaredDigest to that computed artifact hash exactly; it never trusts declaredDigest or a public material digest as the result.

The current release UUID, physical series UUID, artifactVersion, workflowVersion and protected-body metadata remain excluded from artifact canonicalization. Field 8 retains only the canonical predecessor release UUID for successors and N, for initials. AAD binding to the current release ID/version does not change artifact canonicalization.

### B. Trusted evidence results — no material crosses SQL

trustedEvidence has exactly content, code, testVectors; each has exactly reference and verifiedSha256. reference is the canonical immutable evidence UUID and must equal the corresponding artifactFacts.evidence.ref. verifiedSha256 is exactly 64 lowercase ASCII hex digits representing 32 SHA-256 bytes, and must equal the corresponding normalized facts digest.

The Evidence Port resolves exact immutable unencrypted material bytes, computes/verifies SHA-256 in the application/service boundary, verifies the immutable reference-to-material association, then emits {reference, verifiedSha256}. Public caller digests, reference text or ciphertext are never evidence verification. C04 proves every trusted digest was produced from the exact resolved bytes, including Unicode/binary distinctions and wrong-reference/material failures.

SQL receives only the references and trusted verified hashes. It validates canonical syntax and A/B equality and persists/binds the references and verified digests; it does NOT recompute material hashes, obtain material, or authenticate an external repository. The approved artifact-v1 evidence-port requirement is fulfilled by this server-side application boundary, not by SQL material resolution.

Raw material must never enter PostgreSQL as an evidence-resolution input in any encoding or parameter, even transiently. It must not enter generic receipts, logs, audit, signatures, outbox, telemetry or unauthorized returns. The existing authorized artifactReview strings and ciphertext-only private canonical receipt obey [R2 disclosure](artifact-review-disclosure-v1.md); this supersedes the historical blanket no-caller-return wording. Closed service handoff construction must reject raw-material fields before SQL invocation. SQL also has a closed input allowlist, but real raw material is never deliberately injected into DB negative tests. Synthetic sentinel/shape tests and parameter-capture checks prove the boundary without creating a forbidden raw-material SQL handoff. Application failure/diagnostics remain redacted.

### C. Frozen protected body

SHIFAA-F011-PROTECTED-BODY/1 permits **AES-256-GCM only**. No algorithm field, agility, alternate scheme or additional logical envelope field is allowed. The envelope is exactly:

| Logical field | Exact rule                                                                                                  | Producer validation                                                                                                                                  | SQL validation/storage                              |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| contractId    | SHIFAA-F011-PROTECTED-BODY/1                                                                                | Exact supported ID, AES-256-GCM                                                                                                                      | Exact text constant                                 |
| keyRef        | Nonempty exact valid UTF-8 text identifying an immutable/versioned external KMS/HSM key; never key material | Prove immutable versioned reference; reject mutable aliases such as current/latest, including provider aliases; no guessed universal provider syntax | Opaque nonempty text; never resolve an external key |
| nonce         | Exactly 12 octets                                                                                           | Fresh random nonce for every encryption attempt                                                                                                      | bytea length = 12                                   |
| ciphertext    | Opaque nonempty octets for the clinical-content body                                                        | Encrypt the intended exact content material                                                                                                          | Nonempty bytea only                                 |
| authTag       | Exactly 16 octets                                                                                           | AES-GCM authentication tag over the exact AAD/body                                                                                                   | bytea length = 16                                   |

keyRef preserves exact scalar/UTF-8 text; no trimming, normalization or case transformation. Reject malformed UTF-8, surrogates and U+0000 rather than substitution; U+0000 cannot be represented by PostgreSQL text. String nonemptiness does not establish external key immutability: the real C04 producer must validate that property. SQL does not infer a key version from a guessed provider URI or accept key material. keyRef never appears in public/clinic DTOs, logs, audit metadata, receipts/outbox or observability evidence; neutral fixed-vector text is a test-only contract reference, not a live key reference.

Logical byte fields map to typed bytea storage. For the existing internal JSONB carrier only, nonce/ciphertext/authTag are even-length lowercase hex strings decoded exactly once to bytea; this is the sole octet carrier, not another encryption representation or persisted JSON/text envelope. Unknown envelope fields (including algorithm, keyVersion, aad or workflowVersion) reject. The schema accepts no plaintext body/storage field. SQL structural acceptance never claims a cryptographic proof or that arbitrary bytes are valid ciphertext. C03 may use synthetic structurally valid opaque envelopes; actual encryption/context/tamper/key proof remains C04.

Exact logical column mappings and constraints are in [data model §3](../data-model.md): body_contract_id, body_key_ref, body_nonce, body_ciphertext, body_auth_tag. They are immutable release fields. No encryption key or second AAD payload is stored.

### D. Deterministic authenticated context

SHIFAA-F011-PROTECTED-AAD/1 begins with the exact UTF-8/ASCII prefix:

```text
SHIFAA-F011-PROTECTED-AAD/1;
```

Append exactly five frames, without BOM, whitespace or trailing bytes beyond the final frame comma:

| Ordinal | Fact            | Exact payload                                                                                                   |
| ------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| 1       | resourceType    | clinical.content_release                                                                                        |
| 2       | resourceId      | Canonical lowercase current release UUID                                                                        |
| 3       | fieldId         | body                                                                                                            |
| 4       | artifactVersion | Positive integer as minimal unsigned decimal ASCII (no leading zero, sign, fraction, exponent or locale digits) |
| 5       | keyRef          | Exact immutable versioned key reference from protectedBody                                                      |

Each frame is S<byte-length>:<UTF-8 payload>, with byte-length in minimal unsigned decimal ASCII. Count UTF-8 octets, not characters/UTF-16 units. No null frame; every payload is nonempty. There is no JSON, escaping, locale, Unicode normalization, whitespace normalization or extra frame. Delimiters/control characters inside a legal text payload are literal, consumed by octet length. Strict UTF-8 validity and U+0000 rejection apply. The fixed vectors include Unicode/Arabic and differing NFC/NFD byte sequences without normalization.

workflowVersion MUST NOT participate: signature/publication workflow increments do not invalidate immutable body binding. AAD is deterministically reconstructible from authoritative persisted id, artifact_version and body_key_ref plus the two exact constants. It is not stored as a second free-form payload and is not supplied as client-selectable SQL authority.

## 3. Preflight, allocation, locked admission and retry

Before any lock-holding mutation, the trusted service allocates a fresh canonical releaseId, obtains authoritative predecessor/series facts by preflight, and sets candidate artifactVersion = 1 for initial or authoritative predecessor.artifactVersion + 1 for successor. allocation is exactly {releaseId, artifactVersion}; it is internal and not asserted by external callers. Resolve/verify evidence, reconstruct the exact AAD using the candidate and keyRef, and protect the intended content body before entering the locked mutation.

SQL follows the approved idempotency-first, series advisory guard and ascending UUID series/predecessor/authority lock order. Under those locks it revalidates the same-series lineage and all current authorization/admission predicates, recomputes expected artifactVersion from the locked facts and requires equality with the candidate. Insert the allocated releaseId/version and immutable body together. A changed/stale/conflicting predecessor, wrong version, duplicate resource ID, missing evidence, invalid body structure or other existing constraint failure rejects the entire mutation: no partial release/evidence/success audit/outbox/receipt. No fallback to another predecessor, global ordinal, plaintext, inferred authority or silently changed AAD tuple.

Candidate version is lineage-relative, not a globally allocated draft ordinal. Initial candidates can share version 1 and same-predecessor successor candidates can share predecessor.version + 1 while retaining distinct release IDs. Therefore the old draft-ordinal next_artifact_version allocator and unique(series_id, artifact_version) constraint cannot govern this new decision: they would prevent competing drafts and fresh initial/rejected-draft replacements. The data model uses release-scoped identity/version uniqueness while retaining unique published root and published successor guards. This preserves the approved competing/replacement-draft behavior and signature resource_id/resource_version binding; it adds no operation or workflow state.

After a pre-commit version/race rejection, retry outside the transaction using the same public idempotency scope/request bindings, current preflight facts, a fresh releaseId, fresh random nonce and fresh protected envelope. Never retry a protected tuple in a held-lock transaction or reuse a GCM nonce/envelope. Derived internal allocation/encryption randomness is not part of the public request hash. A successfully committed same-key replay reauthorizes and returns the existing stored result, creating/re-encrypting no second release. Infrastructure retry must preserve this fresh-attempt rule and the existing fail-closed idempotency semantics.

No network, external evidence or KMS/HSM call is permitted while PostgreSQL locks are held, including retries. Release-body/allergy protection finishes before locks. Only bounded local canonical-receipt AES-GCM with a capability prepared before the transaction is permitted under locks, as defined in [receipt v1](mutation-receipt-v1.md); SQL still performs no crypto. Commit-unknown handling first follows the existing stored-result contract; it must not blindly re-encrypt a possibly committed request.

## 4. Transient versus persisted responsibility matrix

| Input/fact                                 | Trusted service/C04                                               | PostgreSQL/C03                                                          | Durable boundary                                                |
| ------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| Raw material/content plaintext             | Resolve exact immutable bytes; hash/verify; protect intended body | MUST NOT RECEIVE                                                        | Never raw SQL evidence input/generic receipt/log/audit/outbox/unauthorized return; authorized review and private ciphertext receipt per R2           |
| trustedEvidence reference + verifiedSha256 | Produce only through verified evidence boundary                   | Validate syntax and exact A/B match; no material hash computation       | Persist/bind approved ref + trusted verified hash               |
| Normalized artifact facts                  | Build using trusted evidence results                              | Validate; construct approved v1 bytes; SHA-256                          | Immutable approved facts/artifact digest                        |
| optional declaredDigest                    | Preserve existing public input                                    | Compare exactly to SQL artifact hash                                    | Existing permitted result/metadata only                         |
| allocation.releaseId/artifactVersion       | Allocate/preflight before protection                              | Lock/revalidate; recompute version; reject stale/conflicting allocation | Authoritative id/artifact_version, never workflowVersion in AAD |
| protectedBody five fields                  | Real AES-GCM, random nonce, correct versioned key and exact AAD   | Structural validation and opaque typed storage only                     | Five exact protected columns; keyRef strictly private           |
| AAD byte sequence                          | Deterministic reconstruction; actual authentication proof in C04  | Enforce persisted tuple; no caller-selected free-form AAD authority     | Reconstructible, no separate AAD payload                        |
| encryption key                             | Only protection/KMS boundary; no persisted plaintext key          | MUST NOT RECEIVE                                                        | Never handoff/SQL/log/audit/receipt/outbox/return               |
| actor/purpose/AAL/authority/admission      | Existing trusted context separate from handoff                    | Narrow entrypoint/FORCE-RLS/current predicates                          | Existing redacted attributable evidence only                    |

## 5. Plan-owned evidence boundaries and failures

[Plan §6.1](../plan.md) owns the P1–P7 acceptance order. Public generation and approved canonical metadata precede trusted-handoff/body/AAD/allocation metadata binding; physical consumption requires accepted current inputs. The old C02B T093–T095 mapping is historical preparation ownership only, pending recovered-Plan review and future Tasks regeneration. No metadata binding implementation runs during recovery. Missing/stale/inconsistent/unaccepted inputs fail closed; existing C02A metadata does not validate this extension.

The synthetic physical stage (historical C03/T008–T016) proves SQL storage/binding/RLS/grants/functions, artifact V01–V07 exact bytes/hash and allocation/race rejection in BOTH isolated runtimes. It never claims real evidence-port/AES-GCM acceptance or receives raw material. The physical/generated owner-stage assertion (historical T017) requires those current accepted inputs/proofs, not later real-producer evidence. The later real producer stage (historical C04/T018–T020) proves actual immutable material hashes, AES-GCM roundtrip/random nonce/key-version/context/tamper, fixed exact AAD bytes, intended-plaintext correspondence, raw-byte exclusion and real-producer-to-prepared-SQL composition in both runtimes without external calls under locks. Later pure-core encoding (historical C13) consumes frozen ARTIFACT/1; SQL/core equivalence cannot redefine it.

All failures are atomic and redacted, retaining only baseline permitted denial evidence. No new public error vocabulary or secret/body/key reference in diagnostics. C01/C02/C02A and partial C03 RED captures remain unchanged historical evidence pending recovered-Plan revalidation, not acceptance of changed handoff/model inputs. OPEN-TECH-002 remains OPEN, as do all retained clinical, legal, technical and UX gates. OPEN-UX-001 remains PENDING required Feature 011 Design Lead approval/designation; PO approval alone does not close it.

## R2 superseding recovery decision\n\n[R2 authority](../decisions/plan-recovery-r2-2026-10-06.md) corrects SD-01 and the blanket protection-call prohibition. [Disclosure](artifact-review-disclosure-v1.md), [allergy protection](allergy-protection-v1.md) and [atomic receipt](mutation-receipt-v1.md) are separate current Plan-owned protocols. Existing HND-N26 is interpreted as domain-body/allergy protection or EXTERNAL work under locks, never the bounded local receipt exception; its historical vector bytes/file remain unchanged. All positive HND/BODY/AAD facts, bytes and hashes are unchanged. No C02B/C03/T017 execution is authorized.

## Evidence-foundation reference (superseding recovery, 2026-10-06)

[Shared v1](verified-evidence-binding-v1.md) owns material provenance and exact admission/current signature basis. HND/1 six members/reference+verifiedSha256 tuples and BODY/AAD bytes unchanged. Private CreateReleasePhysicalPreparation={handoff: HND/1,materialBindings: closed content/code/test-vector results} is SQL preparation input, not a seventh HND/public field. SQL binds three metadata rows to same release/version/ref/hash. Draft creation claims no exact approval; controlled explicit exact-artifact admission follows creation before publication. No circular admission/source/serialization change.
