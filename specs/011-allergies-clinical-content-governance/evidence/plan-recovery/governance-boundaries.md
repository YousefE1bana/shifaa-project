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

The proposed [Artifact Canonicalization Contract v1](artifact-canonicalization-v1.md), [machine-readable profile](artifact-canonicalization-v1.json), [fixed vectors](artifact-canonicalization-v1-vectors.json) and [parity ownership](artifact-canonicalization-parity-v1.json) supply those byte rules under the 2026-10-06 bounded reconciliation. Product Owner / Architecture review and C02A/T090–T092 parity preparation precede C03 consumption. C13 implements the same rules later, with SQL/core equivalence; it must not redefine serialization. No additional operation, clinical policy or gate closure is introduced.

workflow_version changes on signature/publication, with quoted ETag and If-Match. Signatures bind artifact_version/digest, not workflow_version. A rejection is retained; the existing per-capacity evidence uniqueness means revising an artifact/decision uses a new draft through createClinicalContentRelease, no replace-signature operation. Sequential signatures use refreshed workflow ETag. Simultaneous same-version sign requests produce one success/one version conflict, followed by deliberate reload and signing of the same immutable artifact.

Published releases form one same-series initial/supersession chain. Initial absence of predecessor is valid once. Later publication targets the currently applicable release, increasing effective instant and reserving one successor. No competing successor, cross-series link, cycle or same-effective ambiguous overlap. Future releases stay ineligible until effective. A reserved future successor can conflict with a requested rollback; there is no cancellation or bypass operation. Rollback is fresh independently signed supersession.

## Internal trusted release handoff (2026-10-06 decision)

[Trusted handoff v1](trusted-release-handoff-v1.md) and the [dated Product Owner / Architecture decision](../decisions/trusted-handoff-design-2026-10-06.md) define internal createClinicalContentRelease preparation only. External callers never author verifiedSha256, protected-body key references or release allocation. Evidence Port resolves exact immutable bytes and computes/verifies SHA-256 in the service boundary, emitting reference + verifiedSha256; raw material never enters PostgreSQL or persistence/log/audit/receipt/outbox/return. SQL independently validates normalized facts, constructs the frozen SHIFAA-F011-ARTIFACT/1 envelope, computes artifact SHA-256 and compares optional declaredDigest. No material hashing/resolution or KMS/crypto occurs in SQL.

SHIFAA-F011-PROTECTED-BODY/1 is AES-256-GCM only with contractId/keyRef/nonce/ciphertext/authTag and the five explicit private typed columns in data-model §3.1. Nonce is 12 bytes, tag 16, ciphertext nonempty; immutable/versioned keyRef is opaque to SQL and excluded from public/clinic DTOs, logs, audit metadata, receipts and outbox. SHIFAA-F011-PROTECTED-AAD/1 binds exactly resourceType/resourceId/fieldId/artifactVersion/keyRef using five UTF-8 octet-length frames; workflowVersion is excluded and no free-form AAD is persisted.

Service allocates releaseId and initial=1 or predecessor.artifactVersion+1 before evidence/protection; SQL locks and revalidates the same lineage and candidate version. Rejected pre-commit attempts retry with fresh ID/nonce/envelope outside locks; committed idempotent replay does not re-encrypt. C03 proves synthetic physical structure/binding/artifact bytes/races; C04 later proves actual evidence/GCM/AAD and both-runtime producer/consumer composition. No network/KMS/evidence call occurs under locks. No new public DTO, header, operation, role, clinical policy or gate closure is introduced. C02B evidence/acceptance remains pending.

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
