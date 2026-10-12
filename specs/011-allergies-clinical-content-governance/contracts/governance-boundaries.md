> **Plan recovery R2 — prior Plan approval suspended; implementation paused.** [Recovery authority](../decisions/plan-recovery-2026-10-06.md) supersedes historical lifecycle labels; Spec/public wires and frozen canonical bytes remain unchanged. The 95-task ledger is historical recovery input.

Recovery contract set: SHIFAA-F011-ARTIFACT/1; SHIFAA-F011-CREATE-RELEASE-HANDOFF/1; SHIFAA-F011-PROTECTED-BODY/1; SHIFAA-F011-PROTECTED-AAD/1. SHIFAA-F011-ALLERGY-FACTS/1 + REASON/1 + ALLERGY-PROTECTED/1 + ALLERGY-AAD/1; SHIFAA-F011-RECEIPT-PROTECTED/1 + RECEIPT-AAD/1. R2 superseding authority: [dated decision](../decisions/plan-recovery-r2-2026-10-06.md).

# Feature 011 governance boundary contract

Design contract 0.1.0-plan, 2026-10-01. [OpenAPI](openapi.yaml), [scope manifest](scope-manifest.json), [data model](../data-model.md) and clarified [spec](../spec.md) govern later implementation. Exactly seven operations, no alternate mutation endpoint.

## Authority and projections

| Action                                 | Required current authority                                                                                                                         | Denial / bounded result                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Allergy read                           | Self or existing authorized GUA/DEL record read, or clinician patient/care/facility context                                                        | No record/existence disclosure outside scope; never universal staff visibility                                   |
| Allergy create                         | Self patient or authorized clinician                                                                                                               | GUA/DEL denied; all starts self_reported                                                                         |
| Allergy verify                         | Authorized clinician, care/facility context, purpose/AAL2, current revision                                                                        | New reason/evidence/version; only approved edges; terminal entered_in_error                                      |
| Content governance list/create/publish | Action-specific ADM-MEDICAL, purpose/AAL2                                                                                                          | No admin-derived patient read; publisher differs from creator                                                    |
| Assigned review detail                 | Explicit current release/artifact-scoped read authority in addition to eligible reviewer context                                                   | Exact assigned artifact only; no general drafts/admin/create/publish access from signing                         |
| Content sign                           | Verified eligible physician/pharmacist, evidence-backed clinical-owner required-capacity designation, explicit current signing grant, purpose/AAL2 | No ADM-MEDICAL prerequisite; creator and other signer differ; no derived admin/mutation authority                |
| Clinic status list                     | Explicit current status-read grant, valid current workforce/facility context, purpose/AAL2                                                         | Fully signed published/effective release metadata only; no drafts, unsigned details, bodies or signer identities |

The same listClinicalContent GET implements governance/status/assigned_review branches; a requested projection never selects authority. Assigned-review reads use separately appropriate restricted governance authority, not a new product role. Query releaseId is mandatory for that branch. Clinic status returns source/version/effective date/publication-eligibility/lineage and two approval-status booleans only. The release ID supports opaque lineage. Status may describe a future published release as future, never effective. All pages reauthorize current context.

Opaque bodies/code/test vectors are delivered only inside explicit artifactReview in authorized governance/review DTOs. Clinic DTOs exclude the property structurally, and SQL projections do not fetch it. No new upload/download operation or artifact-edit operation is introduced; existing evidence ports resolve exact immutable references.

## Version, digest and transitions

Allergy If-Match binds current assertion revision. Each accepted verify appends a revision; original recorder/time/source and earlier values stay intact. Four states only. Confirmed/refuted can switch; a verified record cannot return to self_reported. Error is terminal; correction is a separately authorized linked new assertion.

Content artifact_version/digest never change after creation. Compute SHA-256 from a versioned canonical artifact envelope including series identity, source, effective instant, predecessor/initial marker, content and code/test-vector evidence digests. Field-order/encoding rules are part of generated contract parity, not medical content. Caller-declared digest must match server computation.

The approved and frozen [Artifact Canonicalization Contract v1](artifact-canonicalization-v1.md), [machine-readable profile](artifact-canonicalization-v1.json), [fixed vectors](artifact-canonicalization-v1-vectors.json) and [parity ownership](artifact-canonicalization-parity-v1.json) supply those byte rules under the 2026-10-06 bounded reconciliation. The exact four hashes and C02A acceptance are preserved historical evidence, pending recovered-Plan revalidation. Current Plan-owned canonical and trusted-handoff metadata prerequisites precede physical consumption; later pure-core work implements the same rules with SQL/core equivalence and must not redefine serialization. No additional operation, clinical policy or gate closure is introduced.

workflow_version changes on signature/publication, with quoted ETag and If-Match. Signatures bind artifact_version/digest, not workflow_version. A rejection is retained; the existing per-capacity evidence uniqueness means revising an artifact/decision uses a new draft through createClinicalContentRelease, no replace-signature operation. Sequential signatures use refreshed workflow ETag. Simultaneous same-version sign requests produce one success/one version conflict, followed by deliberate reload and signing of the same immutable artifact.

Published releases form one same-series initial/supersession chain. Initial absence of predecessor is valid once. Later publication targets the currently applicable release, increasing effective instant and reserving one successor. No competing successor, cross-series link, cycle or same-effective ambiguous overlap. Future releases stay ineligible until effective. A reserved future successor can conflict with a requested rollback; there is no cancellation or bypass operation. Rollback is fresh independently signed supersession.

## Internal trusted release handoff (2026-10-06 decision)

[Trusted handoff v1](trusted-release-handoff-v1.md) and the [dated Product Owner / Architecture decision](../decisions/trusted-handoff-design-2026-10-06.md) define internal createClinicalContentRelease preparation only. External callers never author verifiedSha256, protected-body key references or release allocation. Evidence Port resolves exact immutable bytes and computes/verifies SHA-256 in the service boundary, emitting reference + verifiedSha256; raw material never enters PostgreSQL as evidence-resolution input or generic receipts/log/audit/outbox/telemetry/unauthorized returns. The authorized artifactReview and private encrypted canonical receipt follow the precise R2 rules below. SQL independently validates normalized facts, constructs the frozen SHIFAA-F011-ARTIFACT/1 envelope, computes artifact SHA-256 and compares optional declaredDigest. No material hashing/resolution or KMS/crypto occurs in SQL.

SHIFAA-F011-PROTECTED-BODY/1 is AES-256-GCM only with contractId/keyRef/nonce/ciphertext/authTag and the five explicit private typed columns in data-model §3.1. Nonce is 12 bytes, tag 16, ciphertext nonempty; immutable/versioned keyRef is opaque to SQL and excluded from public/clinic DTOs, logs, audit metadata, receipts and outbox. SHIFAA-F011-PROTECTED-AAD/1 binds exactly resourceType/resourceId/fieldId/artifactVersion/keyRef using five UTF-8 octet-length frames; workflowVersion is excluded and no free-form AAD is persisted.

Service allocates releaseId and initial=1 or predecessor.artifactVersion+1 before evidence/protection; SQL locks and revalidates the same lineage and candidate version. Rejected pre-commit attempts retry with fresh ID/nonce/envelope outside locks; committed idempotent replay does not re-encrypt. C03 proves synthetic physical structure/binding/artifact bytes/races; C04 later proves actual evidence/GCM/AAD and both-runtime producer/consumer composition. No network/KMS/evidence call occurs under locks. No new public DTO, header, operation, role, clinical policy or gate closure is introduced. C02B evidence/acceptance remains unexecuted/unaccepted and is not authorized during recovery. The Plan now owns this protocol; future Tasks must derive from a recovered approved family.

## Idempotency, atomicity and receipts

All five mutations require Idempotency-Key. Verify/sign/publish require If-Match; create operations do not gain a new catalog precondition. Principal/method/template/key hashes isolate scope; request hash includes path IDs, body, If-Match and applicable facility/encounter selectors. Raw keys/principal handles are not persisted.

Same key/same bindings: reauthorize current action and receipt scope, then return original encrypted response snapshot/status/permitted headers. A newer current version does not change an authorized recorded replay. Lost care/grant/session/consent means denial without the historical body. Same key/different bindings yields idempotency-key-reused. In-progress follows the existing canonical policy, never false success. New key/stale version yields version-conflict.

Domain append, structural pointer/CAS, signature binding, audit, minimum outbox, encrypted response and completed idempotency record commit atomically. Before-commit failure rolls back all; after-commit transport failure replays one recorded effect. No partial signature/publication or response rebuilt from current mutable state.

Idempotency metadata remains non-PHI; clinical snapshots are encrypted in private forced-RLS receipts. Replay does not append duplicate audit/event/domain evidence. Rejected actions retain only baseline redacted denial evidence.

## Lists, errors, rate and context

Lists preserve the existing data/meta envelope with nextCursor/lastUpdatedAt/stale. Cursor is opaque and authenticated, binds subject/series/projection/filters and snapshot ordering, and cannot be reused across projections. History pagination retains all authorized prior versions without an unbounded response. Limit 25 default/100 maximum is an engineering transport bound, not clinical policy.

Canonical application/problem+json uses request_id and existing catalog codes; localized/redacted detail, safe field-pointer errors and retry metadata follow the baseline. No novel role/AAL or clinical values in errors. Existing health/admin rate controls apply to reads, writes and repeated denials; no arbitrary new clinical thresholds.

Native Auth owns session/AAL/AMR and revocation; X-Purpose selects a requested purpose but grants nothing. Never trust X-AAL, X-Role, client signer/person/admin flags or encounter ID alone. Feature 010 and identity mapping validate same-patient encounter/facility/care context without copying or mutating encounter lifecycle.

## Evidence and retained gates

Audit retains permitted actor/purpose/resource/version/outcome/time and immutable signature bindings. Outbox/telemetry contains minimum opaque correlation only; no raw patient identifiers/clinical text/full bodies/tokens/signing secrets.

Neutral synthetic fixtures only while OPEN-CLIN-001 remains open. Professional evidence and real admissibility are clinical-owner decisions; unresolved combinations deny. This design cannot approve real content, close legal gates or enable downstream Feature 012 decisions.

OPEN-TECH-002/003, OPEN-UX-001/002 and OPEN-LEGAL-001/002/007 keep their stage restrictions. Both real runtime tests and native/browser/live bilingual evidence are future requirements described in quickstart; no claim they have passed.

## Recovery approval and acceptance boundaries

[Plan §6.1](../plan.md) separates public generated parity, frozen canonical parity, trusted-handoff metadata parity, synthetic both-runtime physical proof, physical/generated owner-stage assertion, real service Evidence/Protection Port composition and later SQL/core equivalence. SQL uses trusted evidence reference/hash results but hashes the artifact itself; caller digest and structurally valid ciphertext never establish real material or cryptographic authenticity. Physical proof may use synthetic envelopes and cannot claim later real-producer acceptance. A stage assertion cannot require its later producer's evidence. Every changed input/SQL correction requires renewed applicable parity before consumption.

OPEN-UX-001 is PENDING: PO approved the fixed TEST-ONLY capture, but required Feature 011 Design Lead approval/designation is absent. OPEN-TECH-002 remains OPEN; no physical evidence or owner/stage assertion exists for current inputs. All retained clinical/legal/technical/UX owners and restrictions are unchanged. C01/C02/C02A and C03 RED evidence are preserved pending recovered-Plan revalidation; no C02B/C03/T017 execution exists or is authorized.

## R2 exact disclosure, protection and receipt authority

[R2 decision](../decisions/plan-recovery-r2-2026-10-06.md) supersedes blanket no-return/no-protection-call wording only to the explicit boundaries below. Historical approvals/decisions remain unchanged; these draft corrections do not confer lifecycle authority.

[Artifact review disclosure](artifact-review-disclosure-v1.md) is the precise rule: immutable reference resolution + exact material SHA-256 + equality to release-bound reference/digest, current exact-release/artifact governance/reviewer disclosure authority, purpose/AAL and lossless existing UTF-8 string representation. No new public encoding, field or route; missing/substituted/nonrepresentable material denies rather than returning partial/fabricated strings. Required create/publish response artifactReview is prepared before locks and independently authorized at locked admission. Only the closed existing artifactReview may disclose material; clinic/unauthorized projections and generic receipt/audit/outbox/log/telemetry never receive it. Dedicated clinical canonical receipts hold ciphertext only, not raw evidence input. Original-receipt review replay verifies integrity/current scope without reconstructing from newer resource state.

[Allergy revision protection](allergy-protection-v1.md) separately defines facts/optional reason, typed opaque envelopes, six-field immutable revision AAD, source preservation and service preflight -> SQL head/version/transition equality -> authorized reconstruction. SQL never receives clinical plaintext or keys. Source/correction/terminal rules are unchanged. [Atomic receipt](mutation-receipt-v1.md) defines the exact canonical generated response, before-transaction capability, bounded local crypto, immutable tuple/twelve-field AAD, private commit obligation/deferred finalization guard and current-authority replay for every mutation. Only local receipt encryption is allowed under locks; external KMS/HSM/network/evidence and domain protection remain outside.

[Data-model §11](../data-model.md) owns exact predecessor-compatible lock ranks. Native/session/current authority checks precede GUC setting by trusted repository; GUCs are not authentication. Tests distinguish client spoofing, unauthorized SQL/grants and trusted verified context; no claim that arbitrary trusted-credential SQL cannot fabricate context. A concurrent preflight loser may have protected material already; it commits no second effect. Rejected attempts refresh envelopes/nonces/identity; committed replay never encrypts or duplicates original mutation audit/outbox. Required sensitive-read/access attribution remains separate.

Historical R2-SD-04 was unresolved in the preserved [R2 review](../evidence/plan-recovery-r2-self-debate.md). Current shared foundation below replaces the missing signing contract/sidecar; this is recovery design, not gate approval.

## Current shared evidence foundation authority

[VERIFIED-EVIDENCE-BINDING/1](verified-evidence-binding-v1.md) separates immutable snapshot, current governed eligibility and exact domain decision. Closed profiles/tables prevent material/signing/qualification/admission/allergy confusion. No generic table/rules engine/trust boolean/public operation/role/vendor/medical truth.

SQL checks exact bound credential/designation/grant ID+version+captured fields/current eligibility. No proven successor lineage, no exception. Revoked/expired/replaced/advanced basis leaves history but cannot count; fresh decision/new reviewed draft under existing uniqueness. New receipt-disclosure authority never retrovalidates publication.

Public evidenceRef is verified signature sidecar.evidence_ref; source/qualification internals private. Valid rejected decisions have identical binding discipline; invalid attempts are not signatures. Offline owner/designation/grant/admission provisioning controlled/audited, not online permission API. Approval AND binding target release/version/ARTIFACT digest; broad scope alone grants nothing; multiple eligible bindings deny.

Allergy reference is metadata-only governed clinician provenance, not medical truth. No license-bucket reuse/document upload: minimal support patient/assertion/head/target/attestor, consumed once by exact revision. Missing provenance denies. Known coding needs approved source; none real identified; explicit unknown remains honest and syntax is not terminology validation.

External verifier/material/key/network work before locks. SQL checks current facts at explicit ranks with stable FKs/typed immutable snapshots/deferred guards. Clinic receives no resolver/private references. P4 synthetic, P6 real and P7 equivalence remain distinct; retained gates open.
