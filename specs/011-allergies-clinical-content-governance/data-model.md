# Feature 011 data model and transaction design

Recovery contract set: SHIFAA-F011-ARTIFACT/1; SHIFAA-F011-CREATE-RELEASE-HANDOFF/1; SHIFAA-F011-PROTECTED-BODY/1; SHIFAA-F011-PROTECTED-AAD/1. SHIFAA-F011-ALLERGY-FACTS/1 + REASON/1 + ALLERGY-PROTECTED/1 + ALLERGY-AAD/1; SHIFAA-F011-RECEIPT-PROTECTED/1 + RECEIPT-AAD/1. R2 superseding authority: [dated decision](decisions/plan-recovery-r2-2026-10-06.md).

Recovered evidence-foundation design, governed by spec 0.12 / SPEC_APPROVED; prior Plan approval suspended and implementation paused. [Recovery decision](decisions/plan-recovery-2026-10-06.md) is the current lifecycle authority; the 95-task ledger is historical input, not implementation permission. No migration or SQL implementation is created by Plan. The three canonical owned areas are clinical.allergies, clinical.content_releases and audit.signature_evidence. Private supporting tables below enforce their approved behavior; they do not create a user role, operation, patient or encounter resource.

## 1. Identity, storage and value rules

IDs are internal UUIDs. patient_id references identity.patients.id; Feature 010 uses patient_person_id, so the adapter resolves identity.patients.person_id explicitly and verifies the existing encounter's same-patient binding. Never compare patient UUIDs and person UUIDs as interchangeable identities. Workforce/admin actor person IDs reference identity.people.id; authentication remains native auth.users/session state.

UTC timestamptz values cross the API as RFC 3339. An effective date input must identify an unambiguous instant; UI localizes it and never infers a medical timezone policy. Application dates do not control server eligibility.

Designated clinical text, opaque artifact payloads and canonical clinical receipts use a planned clinical-payload protection port with versioned key references, following the existing AES-256-GCM protection patterns. The existing IdentityCipher is identity-specific and normalizes identifiers; never pass clinical text through that normalization or reuse its identity blind-index semantics. The existing TransientReplayCipher is authentication-specific, not a ready-made durable clinical receipt adapter. The new adapter preserves exact bytes, uses random nonces and resource/field/version-bound authenticated context, and never stores plaintext keys or signing secrets. This is an internal protection seam, not a new product operation/provider. Clinical payloads are not logs, URLs, cursor contents or outbox payloads. Production KMS/PHI remains gated. In synthetic local/test mode, use documented non-production keys and neutral values only.

Optional clinical facts use a closed KnownUnknown object: knowledge=known plus value, or knowledge=unknown with no value. coding uses approved-source-validated system/code/display only when an approved configured source actually exists (shared contract §8); syntax alone is not validation; reaction/severity/onset use opaque reported values without inventing clinical enumerations. A missing optional input is normalized to explicit unknown; a missing required substance display/source is rejected. An existing known fact cannot silently disappear during status verification; an explicit clinician correction is attributable in a new revision.

## 2. Allergies: stable identity and immutable revisions

| Planned table              | Fields/nullability                                                                                                                                                                                                                                                                                                                                                                                                                                         | Constraints and indexes                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clinical.allergy_heads     | id UUID = stable allergy identity; patient_id; current_revision_id UUID; current_version positive integer; created_at/updated_at; corrects_allergy_id nullable                                                                                                                                                                                                                                                                                             | Unique stable id/patient; deferred current-revision FK to the same allergy/patient/version. Private pointer only; update allowed solely inside approved append functions. No clinical fact is overwritten here. Index patient_id/id.                                                                                                                                                  |
| clinical.allergies         | id UUID = revision identity; allergy_id; patient_id; version; supersedes_id nullable only at version 1; verification_status; facts_contract_id/facts_key_ref/facts_nonce/facts_ciphertext/facts_auth_tag NOT NULL; original_recorder_person_id; original_recorded_at; action_actor_person_id; facility_id/encounter_id nullable for patient report; reason_contract_id/reason_key_ref/reason_nonce/reason_ciphertext/reason_auth_tag and verification_evidence_ref nullable only for unverified creation; corrects_allergy_id nullable; recorded_at | PK id; unique allergy_id/version and id/allergy_id/patient_id/version; same-assertion/patient predecessor FK; first revision has self_reported and no verification evidence; verified/error revisions require named actor/reason/evidence. Append-only UPDATE/DELETE rejection. Index patient_id/recorded_at/id, allergy_id/version DESC, current state through authorized head join. |
| clinical.mutation_receipts | Exact typed immutable response/identity tuple plus receipt_contract_id/receipt_key_ref/receipt_nonce/receipt_ciphertext/receipt_auth_tag, all NOT NULL; idempotency_record_id unique; exact fields in §10 and receipt contract                                                                                                                                                                                                                                                                             | Append-only; sensitive receipt referenced by platform idempotency response metadata. Actor/current-action replay authorization required before decrypting; no raw clinical snapshot in generic platform response_body.                                                                                                                                                                |

The original recorder/time/source persist across every revision. Each later verifier/corrector is separately attributable. supersedes_id is a revision link within one stable assertion. corrects_allergy_id links a new assertion to a different terminal erroneous assertion for the same patient, never to another patient or itself. Different corrections are distinct assertions and never inherit verification; no arbitrary clinical deduplication rule is added.

| Source                                        | Target                         | Producer / guard                                                                                |
| --------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| No assertion                                  | self_reported                  | createAllergy by patient for self or authorized clinician; identity/display and source required |
| self_reported                                 | clinician_confirmed or refuted | verifyAllergy by authorized clinician, new reason/evidence and current If-Match                 |
| clinician_confirmed                           | refuted                        | Same verification guard, append revision                                                        |
| refuted                                       | clinician_confirmed            | Same verification guard, append revision                                                        |
| self_reported / clinician_confirmed / refuted | entered_in_error               | Same guard; terminal for the stable assertion                                                   |
| Verified state                                | self_reported                  | Forbidden                                                                                       |
| entered_in_error                              | Any next state/revision        | Forbidden; correction uses linked createAllergy                                                 |

Repeated same-key verification is canonical replay, not a new edge. A new key requesting an unchanged verification status is state-transition-invalid; the approved matrix does not authorize new clinical correction-only transitions. KnownUnknown corrections may accompany an allowed verification edge. No extra mutation is added.

## 3. Releases, series and clinical-owner evidence

| Planned table                           | Fields/nullability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Constraints and indexes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| clinical.content_series                 | id UUID; content_type; governed_content_key; effective_scope_key; workflow guard timestamps; no global draft-version allocator                                                                                                                                                                                                                                                                                                                                                                                                                  | Unique content_type/governed_content_key/effective_scope_key. Scope identity comes from approved owner policy or explicit neutral synthetic registry, not a client-created medical taxonomy. Locks serialize roots/successors; no eager current-release pointer that would promote future content.                                                                                                                                                                                                                                                                                                     |
| clinical.content_releases               | id UUID; series_id; artifact_version positive; workflow_version positive; source metadata; effective_at; canonical artifact digest bytea(32); body_contract_id text; body_key_ref text; body_nonce bytea; body_ciphertext bytea; body_auth_tag bytea (all NOT NULL); content_evidence_ref/code_evidence_ref/test_vector_evidence_ref UUID and content_sha256/code_sha256/test_vector_sha256 bytea with length=32, all NOT NULL; is_initial boolean; supersedes_release_id nullable; status=draft or published; created_by_person_id; created_at; published_by_person_id/published_at nullable while draft; synthetic boolean; exact admission relation in §13 (obsolete mutable admission_evidence_ref pointer retired) | PK id and release-scoped UNIQUE(id, series_id, artifact_version), UNIQUE(id,artifact_version), UNIQUE(id,artifact_version,artifact_digest) for exact immutable FKs; no unique(series_id, artifact_version); self-predecessor forbidden; predecessor FK same series; initial iff predecessor absent. Published requires distinct creator/publisher plus exact valid physician/pharmacist approvals and admissibility/gates in narrow function. Unique published root per series, unique published successor per predecessor; distinct initial/same-predecessor drafts may share a lineage-relative version, but only one root/successor can publish. Index series/status/effective_at/id and predecessor. |
| clinical.content_governance_authorities | id UUID; person_id; action=signClinicalContentRelease or listClinicalContent; capacity=physician/pharmacist nullable only for metadata-read action; facility_id nullable for governed global signer scope; content/scope restrictions; active/revoked status; valid_from/valid_until; independent issuer/evidence reference; version                                                                                                                                                                                                            | Explicit current per-person authority; signing does not grant status-read/create/publish. Clinic metadata grant must carry current facility/workforce context; global signer authority conveys no facility workforce access. No sixth platform-admin role. Unique live grant per person/action/scope/capacity, validity indexes.                                                                                                                                                                                                                                                                       |
| clinical.content_reviewer_designations  | id UUID; person_id; professional_license_id; reviewer_capacity=physician/pharmacist; required-capacity evidence reference; designated_by; status/validity/version                                                                                                                                                                                                                                                                                                                                                                               | Evidence-backed clinical-owner designation for senior physician/medical director or clinical pharmacist, matched to verified doctor/pharmacist credentials. No fabricated seniority/qualification rules or medical registry. Missing evidence denies signing.                                                                                                                                                                                                                                                                                                                                          |
| clinical.content_admissibility_evidence | Exact artifact approval: release_id/artifact_version/artifact_digest + governed scope/policy/support/source/current status/validity/version; exact columns §13 | Exact release tuple FK; target/scope immutable; governed changes advance version; separate explicit clinical-owner approval AFTER draft. Broad scope alone never admits a draft; no public provisioning. |

Authority/designation/admissibility rows are scoped evidence inputs, provisioned only by controlled audited offline administration or approved synthetic fixture setup. Their changes append attributable evidence and version validity changes; no Feature 011 permission-management operation, online service-role grant or policy-authoring UI is created. Signature/publication functions lock and revalidate those rows; unprovisioned combinations deny.

Artifact fields are immutable after creation, including source, scope, effective_at, predecessor and code/test-vector identity. A changed artifact requires a new createClinicalContentRelease; there is no edit endpoint. workflow_version increments when a signature decision is recorded or publication succeeds; response ETag reflects it. artifact_version and digest never change. Signatures bind artifact_version even while workflow_version advances. Rejected decisions are retained; the existing unique evidence role/version constraint permits one final decision per capacity for that artifact. A new independently reviewed draft is required after rejection, using the existing creation operation.

## 3.1. Protected body, AAD and trusted release allocation (2026-10-06 decision)

The [Product Owner / Architecture decision](decisions/trusted-handoff-design-2026-10-06.md) resolves HND-DESIGN-001. [Trusted handoff v1](contracts/trusted-release-handoff-v1.md) and its machine profile/vectors are design inputs for C02B, not implementation acceptance. SHIFAA-F011-PROTECTED-BODY/1 uses AES-256-GCM only and has exactly five logical fields, mapped to explicit columns on clinical.content_releases:

| Logical field | Exact physical column/type     | Required constraint                                                                                                                                                                  |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| contractId    | body_contract_id text NOT NULL | Exact SHIFAA-F011-PROTECTED-BODY/1                                                                                                                                                   |
| keyRef        | body_key_ref text NOT NULL     | Nonempty exact valid UTF-8; immutable/versioned external KMS/HSM reference validated by trusted C04 producer; opaque to SQL; no key material or mutable alias such as current/latest |
| nonce         | body_nonce bytea NOT NULL      | octet_length = 12                                                                                                                                                                    |
| ciphertext    | body_ciphertext bytea NOT NULL | octet_length > 0; opaque encrypted body, no plaintext input/storage                                                                                                                  |
| authTag       | body_auth_tag bytea NOT NULL   | octet_length = 16                                                                                                                                                                    |

No JSON/text serialized envelope, algorithm discriminator/agility, key material, extra keyVersion or free-form AAD column is added. All five body columns are immutable with the release artifact. The private key reference is excluded from public/clinic DTOs, logs, audit metadata, receipts and outbox. SQL performs structural validation/storage only; it never receives raw evidence material or an encryption key, encrypts/decrypts or calls external evidence/KMS/HSM.

SHIFAA-F011-PROTECTED-AAD/1 is prefix SHIFAA-F011-PROTECTED-AAD/1; plus exactly five S<byte-length>:<UTF-8 payload>, frames: clinical.content_release; canonical lowercase current release UUID; body; positive artifact_version in minimal unsigned decimal ASCII; exact body_key_ref. Use UTF-8 octet counts, no JSON/escaping/locale/Unicode/whitespace normalization. workflow_version is excluded. Reconstruct from persisted id/artifact_version/body_key_ref and exact constants; do not persist AAD as a second payload.

The trusted service allocates releaseId before protection. Preflight obtains authoritative series/predecessor facts without later write locks; candidate artifactVersion is 1 for initial or predecessor.artifactVersion + 1 for successor. Evidence Port resolves/verifies exact immutable material and emits only reference + verifiedSha256; Protection Port protects the intended exact content material using the candidate AAD before the lock-holding mutation. No raw material enters PostgreSQL.

Under the existing idempotency/series/predecessor/authority lock order, SQL revalidates lineage/context, recomputes expected artifactVersion and requires exact equality to the candidate bound by AAD. It persists the same releaseId/version/body atomically or rejects stale/conflicting allocation with no partial release/evidence/success audit/outbox/receipt. It separately constructs the unchanged artifact-v1 envelope from normalized facts/trusted verified evidence digests and hashes it, comparing optional caller declaredDigest. SQL does not hash external material.

Candidate versions are lineage-relative, so rejected initial replacements and competing drafts can legitimately share version 1 or predecessor.version + 1 under different release IDs. Replace the old unique(series_id, artifact_version) draft-ordinal constraint with release-scoped unique(id, series_id, artifact_version), retaining the existing published-root and published-successor uniqueness guards and signature resource_id/resource_version binding. The obsolete next_artifact_version draft allocator is not a column/authority in the reconciled design. This is required by the explicit allocation decision and preserves approved competing/replacement-draft semantics, not a new operation.

Every pre-commit version/race retry happens outside locks with current preflight, fresh releaseId, fresh random nonce and fresh envelope; no protected tuple reuse. The same public idempotency scope/request bindings remain; derived allocation/encryption randomness is not a public request binding. A committed replay returns its existing authorized stored result without a second release or re-encryption. The synthetic physical stage (historical C03/T008–T016 responsibility) may prove structure/storage/binding/races in both runtimes only. The later real-producer stage (historical C04/T018–T020 responsibility) proves real exact-material hashing, AES-GCM/AAD/random nonce/tamper/key/context handling and real-producer/SQL composition. All retained OPEN gates remain open; clinical receipts/allergy protection use the separate R2 contracts in §10; they are not redefined by this content-body-specific contract.

## 4. Signature evidence extension

Reuse audit.signature_evidence without duplicating its audit-owned history. Existing resource_id/resource_version, signer_person_id, signer_role, approved/rejected decision, artifact_digest, signed_at and audit-event FK remain.

Planned additive migration widens signer_role only to physician/pharmacist when resource_type=clinical.content_release; those capacities are invalid for existing admin-governance resource types. Existing five admin labels and their tests remain unchanged. A same-release/version role uniqueness constraint retains one decision per capacity; a resource-bound guard also prevents one person satisfying both capacities. Use the complete typed clinical.content_signature_bindings in §13 and shared contract §4: verified public evidenceRef, full immutable credential/designation/authority basis and trusted source provenance; no private keys/arbitrary claims. Preserve populated admin evidence and append-only triggers.

A narrow clinical signing function validates the named caller, capacity, exact artifact, current authority/designation/credential status and independence, then atomically appends signature + audit + receipt + minimum outbox event and increments workflow_version. Publication revalidates exact historically bound credential/designation/authority ID+version+captured fields and current eligibility against immutable artifact; unrelated/advanced basis never counts (shared §5). Issuer revalidation is bound identity/evidence/independence, not invented later issuer-role equivalence. Existing signatures are never deleted on revocation; no invalid historical evidence is treated as current approval.

RLS grants only exact-resource clinical evidence inspection to separately appropriate reviewers/governance functions. The existing super-admin audit-review policy is retained; it is not reused as blanket clinical signing authority. Clinic output contains only completeness booleans for an accepted published release, without signer IDs, evidence URLs, signatures or clinical body.

## 5. Explicit initial/supersession chain and eligibility

1. Resolve the server-approved series identity and acquire its transaction-scoped advisory guard before creating/locking the series. A hash collision only over-serializes; it never grants authority. The absent-root race cannot rely on locking a row that does not exist.
2. Draft creation may explicitly mark initial=true with no predecessor. Publication permits it only if no published root exists for that series. Every other draft names a same-series predecessor.
3. At publication, lock the series, candidate and predecessor; capture current server UTC after acquiring locks and reselect the currently applicable published release at that instant. Revalidate the instant and eligibility before final mutation so waiting across an effective boundary cannot use a stale transaction-start time. The candidate must explicitly supersede it. Reject cross-series links, cycles, stale predecessor, ambiguous overlap, competing published successors and a second initial publication.
4. A replacement effective_at must be after its predecessor's effective_at; identical boundaries are ambiguous and rejected. A future published successor reserves its predecessor. A second successor is rejected even before the first becomes effective. A future successor cannot itself be used as the currently applicable predecessor before its effective time.
5. For a first future-dated release, no release is eligible until that effective instant. For a future replacement, the predecessor remains applicable until the successor's effective instant. At the boundary, time selection yields the successor; no third publication state, activation command or scheduled medical decision is introduced.
6. Effective selection is only from the unbranched published chain whose artifact, dual signatures, admissibility and retained gate predicates hold. Missing/revoked/unresolved required approval yields unavailable/unknown; do not silently reactivate a superseded ancestor as a clinical fallback.
7. Rollback creates a fresh artifact/release explicitly superseding the currently effective release, then signs and publishes normally. A reserved competing future successor produces a conflict; Feature 011 adds no cancellation/break-glass bypass to resolve it. Preserve all prior source/version/signature history.

The selected release may have engineering published/effective metadata in a synthetic environment. This never certifies real clinical content or enables Feature 012 safety evaluation.

## 6. Transaction order, idempotency and revocation linearization

Reuse current platform.idempotency_records principal_type/principal_hash/method/route_template/key_hash/request_hash and clinical.claim_idempotency_v1 patterns; raw actor handles/keys are not persisted. Extend through a feature-scoped wrapper rather than altering predecessor receipt behavior. The normalized request hash binds path IDs, body, If-Match, selected facility/encounter and requested projection where relevant; changing any binding with the same key is rejected.

For createClinicalContentRelease, complete the §3.1 evidence/protection/allocation preflight before a new lock-holding mutation; never pass raw material or keys into SQL. An already committed idempotent replay first follows the current-authority stored-result path, before starting new evidence/protection work. Resolve commit-unknown status before a fresh attempt; a racing completed claim returns its authorized recorded result, never inserts a second release. Preflight facts authorize neither publication nor bypass of locked revalidation.

For each mutation:

1. Validate native session/current actor and action context before exposing a stored result; set verified transaction-local context via the existing repository. Claim/lock the exact idempotency scope first.
2. Acquire the series advisory guard (content only), domain heads/series and candidate/predecessor rows in ascending stable UUID order. Never reverse this order in the same feature.
3. Use the explicit predecessor-compatible rank/mode order in §11; take any required Feature 010 encounter SHARE lock before authority rows, never after them. Acquire no Feature 010 appointment/queue mutation locks. No lock-order choice is deferred to implementation.
4. Re-read time/status/validity/role/care/resource/version predicates under those locks. A revocation committed before the authority check wins and denies the action. An already authorized locked mutation may commit before the waiting revocation; the evidence records that serial order. Time-based expiry is checked again before final mutation. Native Auth failures deny; no locks or writes to auth.sessions are invented.
5. For a same-key completed result, reauthorize the current receipt/action scope, then return the encrypted recorded snapshot/status/allowed headers. Do not reconstruct from a newer resource. Lost authority returns denial without returning historical data or making another domain effect. An original If-Match remains part of the replay hash; newer current resource version does not invalidate an authorized canonical replay.
6. For a new effect, enforce CAS/version/transition/digest constraints, append domain/evidence rows, update only structural head/workflow counters, append audit/minimal outbox and the authoritative commit obligation; return structural result metadata on the same connection. The service constructs exact generated response bytes and encrypts them locally using the before-transaction prepared receipt capability. Narrow finalization saves the encrypted receipt and completes idempotency in this same transaction; deferred COMMIT enforcement forbids a missing/mismatched receipt. Any failure rolls back all effects; see §10.
7. Commit, then send the recorded result. Crash-after-commit replay performs no second effect. Crash-before-commit has no partial approval/history/receipt. Deadlock/serialization retry uses the same public key; for createClinicalContentRelease every pre-commit version/race retry refreshes releaseId/nonce/envelope outside locks as §3.1 requires; bounded infrastructure failure never fabricates success.

No network/vendor/KMS calls execute while locks are held. Verification/signing material is prepared by a port before entering the transaction and its digest/authority facts are checked inside. Process locks, in-memory repositories or stale JWT roles do not establish database guarantees.

## 7. Forced RLS and exact action matrix

All new domain/support tables ENABLE and FORCE RLS. Tables and functions are private from anon/authenticated/service_role; online shifaa_api receives only narrow entrypoint EXECUTE, not direct domain DML. Narrow entrypoints use a dedicated NOLOGIN, NOSUPERUSER, NOBYPASSRLS, non-table-owner execution role (planned shifaa_f011_executor), fixed empty search_path and minimum privileges. This is a technical executor, not a new product/admin role. Its domain access remains RLS constrained. Existing boolean-only identity helpers may be reused without exposing identity rows or widening grants. PUBLIC EXECUTE is revoked.

| Operation                      | API predicate, repeated at DB boundary                                                                                                                              | Allowed projection/effect                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| listAllergies                  | PAT self; existing authorized GUA/DEL record read; CLN current patient/care/facility action context                                                                 | Current assertions or bounded history for the authorized same patient; no unrelated rows                                                                                                                          |
| createAllergy                  | PAT self or authorized CLN; GUA/DEL never mutation-authorized                                                                                                       | New self_reported assertion; optional same-patient correction link only to terminal erroneous assertion                                                                                                           |
| verifyAllergy                  | Current CLN care/facility/action/purpose/AAL2; current assertion version                                                                                            | Approved status edge, new reason/evidence/revision; complete immutable history                                                                                                                                    |
| listClinicalContent governance | Current ADM-MEDICAL listing grant/purpose/AAL2, or explicit current exact release/artifact-scoped reviewer read authority                                           | Separately authorized draft/artifact/evidence details; no patient record authority or broad admin grant                                                                                                           |
| listClinicalContent clinic     | Explicit current status-read grant + current workforce/facility + purpose/AAL2                                                                                      | Published releases with complete signatures only; source/version/effective instant/publication-eligibility/supersession metadata and signature-status booleans; no draft/unsigned/body/signature identity details |
| createClinicalContentRelease   | Current ADM-MEDICAL create grant/purpose/AAL2                                                                                                                       | Immutable synthetic draft; no clinical approval inferred                                                                                                                                                          |
| signClinicalContentRelease     | Current verified doctor/pharmacist + evidence-backed required-capacity designation + explicit current signing authority + purpose/AAL2 + independent exact artifact | One attributable immutable decision; no create/publish/admin privilege                                                                                                                                            |
| publishClinicalContentRelease  | Current ADM-MEDICAL publish grant/purpose/AAL2; creator differs; exact distinct current eligible approvals; initial/supersession/admissibility gates                | One published workflow outcome; only time-qualified eligibility; no clinical shipping claim                                                                                                                       |

The separately authorized reviewer detail read is limited to the exact assigned release/artifact needed for an explicitly authorized signing decision; it is not general draft listing, status-read, create or publish authority. The server selects a closed projection, never a user-claimed role branch. RLS row filtering plus explicit SQL/DTO column allowlists protect clinic metadata; a row policy alone is insufficient for body suppression. Direct API-role table SQL, raw helper calls, forged context, public PostgREST and worker access all have denial evidence.

## 8. Migration, retention and recovery

Later generate new migration names using installed Supabase CLI migration new; do not edit historical migration files or create migrations during Plan. Apply the same forward chain to Compose and Supabase, including baseline initialization ownership. Validate current signatures, grants, patients/encounters and populated audit/idempotency rows before widening constraints. If preexisting allergy/content tables unexpectedly exist, stop the migration for explicit mapping; never drop/recreate or synthesize historical verification/signatures.

Backfill only structural links from verified existing facts; ambiguous records fail closed. There is no guessed medical category/retention/expiry policy. Inherit CLINICAL_RECORD and SECURITY_AUDIT classification mapping subject to the canonical signed schedule; OPEN-LEGAL-002 prevents production retention/deletion automation. Never cascade-delete histories or evidence.

After any successful clinical/evidence write, recovery uses roll-forward or complete restore, not destructive down-migration. Restore both named runtimes with populated synthetic assertions, correction chains, releases, future successors, signatures and completed receipts. Compare row/digest/lineage counts, forced RLS/grants, sequence/version continuity and canonical replay; verify no mixed artifact evidence or premature future eligibility. Production RPO/RTO and infrastructure proof are not new Feature 011 targets.

## 9. Plan-owned responsibility and evidence inventory

| Value | Authority | Persistent or transient | Proof boundary |
| --- | --- | --- | --- |
| Immutable content/code/test-vector material | Trusted Evidence Port resolves association and SHA-256 | Transient service memory; authorized artifactReview only; ciphertext-only dedicated receipt allowed; never raw SQL evidence input/generic receipt/log/audit/outbox/unauthorized return | Later real producer |
| Evidence reference + verifiedSha256 | Trusted service result; SQL validates canonical syntax and facts equality | Approved immutable reference/hash bindings | Physical structural binding, then real producer provenance |
| Canonical artifact bytes / artifact digest | Frozen ARTIFACT/1; SQL constructs bytes and computes SHA-256 independently | Immutable facts/digest; expected vectors are fixed inputs | Both-runtime physical vectors, later SQL/core equivalence |
| Optional declaredDigest | Caller assertion checked by SQL, never hash authority | Existing permitted metadata only | Physical mismatch negatives |
| Current release id / artifact_version | Service candidate before protection; SQL authoritative locked equality | Immutable release fields; lineage-relative, no draft counter | Physical race/CAS rejection, then actual producer composition |
| Five protected-body columns | BODY/1 producer; SQL opaque structural storage | Exactly body_contract_id/body_key_ref/body_nonce/body_ciphertext/body_auth_tag | Synthetic physical shape/storage, later AES-GCM proof |
| AAD bytes | AAD/1 reconstructed from id/artifact_version/body_key_ref and constants | Transient only; no free-form AAD column; workflow_version excluded | Fixed AAD vectors and later actual authentication |
| Encryption key | Application protection/KMS boundary | Never in handoff/SQL/evidence/logs/audit/receipts/outbox | Later key/context/tamper proof; production gates retained |

The [handoff contract](contracts/trusted-release-handoff-v1.md) owns the closed producer/consumer shape before physical preparation. BODY/AAD v1 apply to clinical-content body only; the allergy facts/reason and encrypted canonical receipt obligations use the separate executable R2 contracts in §10. Historical C03 fixture drafts cannot choose a new envelope or infer real adapter acceptance. [Plan §6.1](plan.md) and [quickstart](quickstart.md) define the non-circular evidence stages; no task ID in this document authorizes execution.

## 10. R2 allergy protection and atomic receipt model

[R2 decision](decisions/plan-recovery-r2-2026-10-06.md) supersedes the generic scalar-encryption and encrypted-response placeholders. [Allergy protection v1](contracts/allergy-protection-v1.md) owns the closed exact clinical-facts/reason plaintext, canonical bytes, envelope, six-field AAD, preallocated revision identity and complete trusted preparation shape. [Receipt v1](contracts/mutation-receipt-v1.md) owns the exact canonical public response, twelve-field AAD, five protected fields, response tuple and same-transaction domain/finalization protocol. These are separate from frozen content BODY/AAD.

### Exact protected allergy columns

clinical.allergies facts_contract_id text / facts_key_ref text / facts_nonce bytea / facts_ciphertext bytea / facts_auth_tag bytea are all NOT NULL. reason_contract_id text / reason_key_ref text / reason_nonce bytea / reason_ciphertext bytea / reason_auth_tag bytea are all NULL only for first self_reported creation and all NOT NULL for verification revisions. Both contract IDs equal SHIFAA-F011-ALLERGY-PROTECTED/1. Each keyRef is nonempty strict UTF-8 opaque immutable/versioned metadata; nonce has 12 octets, ciphertext >0, auth tag 16. SQL rejects partial envelopes and plaintext clinical fields; revision UPDATE/DELETE is prohibited. The old unspecified scalar encryption and verification_reason_ciphertext name are retired design placeholders, not deployed columns to drop.

The facts plaintext has exactly contractId/substance/source/coding/reaction/severity/onset; source remains original and corrections are limited to existing AllergyCorrections. Reason plaintext is contractId/reason. KnownUnknown and exact text survive protection/reconstruction. AAD binds clinical.allergy_revision, stable allergy_id, new id, version, facts OR verification_reason and the exact respective keyRef; no current head/status/workflow/authorization. Service prepares fresh candidate identity/version and encryption before locks; SQL locks the head and requires exact predecessor/If-Match/version/allowed edge equality. Rejected retries refresh revision ID/nonces; error remains terminal and correction is a new linked self_reported assertion. Authorized application reads/decrypts old immutable facts; SQL cannot decrypt or invent a corrected payload.

### Exact receipt and commit-obligation columns

clinical.mutation_receipts has receipt_contract_id text / receipt_key_ref text / receipt_nonce bytea / receipt_ciphertext bytea / receipt_auth_tag bytea, all NOT NULL. contract ID is SHIFAA-F011-RECEIPT-PROTECTED/1; keyRef nonempty private immutable/versioned opaque text, nonce=12, ciphertext>0, tag=16. Its NOT NULL immutable response tuple is id UUID PK; idempotency_record_id UUID UNIQUE/FK; actor_person_id UUID/FK; operation_id text; resource_type text; resource_id UUID; resource_version positive integer; response_status smallint; response_etag text; response_language text; response_request_id UUID; occurred_at timestamptz. All exact constraints/operation-resource/status mappings are in receipt v1. No plaintext response_body or free-form response_headers; permitted four headers reconstruct from typed tuple/constants. resource_version records the returned version snapshot, not current head/workflow on replay.

clinical.mutation_commit_obligations has idempotency_record_id UUID PK/FK; receipt_id UUID UNIQUE; actor_person_id UUID/FK; operation_id text; resource_type text; resource_id UUID; resource_version positive integer; response_status smallint; response_etag text; response_language text; response_request_id UUID; audit_event_occurred_at timestamptz; audit_event_id UUID; outbox_event_id UUID/FK; occurred_at timestamptz, all NOT NULL. The audit FK uses (audit_event_occurred_at,audit_event_id) -> audit.events(occurred_at,id), preserving actual partitioned baseline ownership. This is a private structural commit guard, not a clinical payload, new public resource or operation. All support tables ENABLE + FORCE RLS, executor-only writes, immutable guards, non-owner/NOBYPASSRLS and default deny.

SQL domain phase obtains authoritative response metadata and appends domain/audit/outbox/commit obligation in one open transaction. The application composes/validates generated response bytes, performs bounded LOCAL receipt AES-GCM using the capability prepared BEFORE the transaction, then finalizes through the narrow SQL phase on the SAME connection. An INITIALLY DEFERRED commit guard requires matching immutable receipt/obligation/actor-operation-resource-version/status/header tuple, audit/outbox evidence and completed platform receipt pointer. A domain-only commit is impossible under planned physical enforcement. No plaintext response or encryption key crosses SQL; any serializer/crypto/finalizer failure aborts all components. The committed exact bytes/status/headers are returned and replayed only after current authorization. No receipt is completed after commit.

Private linked receipt/idempotency history uses RESTRICT rather than cascade deletion; the Feature-011 wrapper does not purge it using generic expiry cleanup. Retained OPEN-LEGAL-002 prevents selecting a production retention/deletion policy. No response is reconstructed from current domain state, and unknown commit is never inferred absent from a failed lookup/expiry. Capability/key/evidence external preparation is outside locks; ONLY bounded local receipt crypto is the exception, never SQL crypto or a new key/evidence lookup.

### Precise material disclosure

[Disclosure contract](contracts/artifact-review-disclosure-v1.md) permits exact lossless UTF-8 strings only in existing authorized artifactReview. The Evidence Port re-resolves the release-bound immutable references, hashes exact material and checks reference+digest before disclosure; no unauthorized/reference-only/clinic projection. Required create/publish review snapshots persist ONLY as dedicated receipt ciphertext; no raw evidence SQL input or generic receipt/log/audit/outbox/telemetry material. Replay validates original review integrity without rebuilding its original response. Unrepresentable required binary material would be a public-contract conflict, not an invented base64 field.

## 11. Explicit lock ranks and request-context threat boundary

This supersedes the deferred “confirm writer order” sentence. Feature-011 transactions acquire only needed rows, in the following single rank order; within each relation sort canonical UUIDs ascending, including all candidate/predecessor/signer authority sets. FOR SHARE is used for non-key mutable authority facts; FOR UPDATE for Feature-011 domain/CAS rows. No lock upgrade or lower-rank acquisition after a higher rank; all authority sets are discovered before acquisition and rechecked after locking.

| Rank | Lock / mode | Boundary |
| --- | --- | --- |
| 1 | Exact platform.idempotency_records scope FOR UPDATE | Mutation/replay scope first; new receipt/obligation FKs refer to this already-held row |
| 2 | Transaction advisory guard for normalized content series | Content mutations only; precedes absent/existing series row locks |
| 3 | Feature-011 domain rows: allergy_heads then immutable predecessor revisions; content_series then candidate/predecessor content_releases; each relation UUID ascending | Mutable heads/series/release workflow FOR UPDATE; relevant immutable rows FOR SHARE; acquire correction-target head in sorted head set, never later |
| 4 | Required clinical.encounters FOR SHARE | Consume Feature-010 context; never appointment/queue/schedule mutation locks; encounter precedes workforce authority just as F010 lifecycle locks do |
| 5 | identity.facilities -> identity.professional_licenses -> identity.facility_licenses -> identity.facility_memberships -> identity.admin_role_grants -> identity.admin_role_revocation_requests -> needed immutable identity.private_evidence_objects FK parents, each needed set FOR SHARE | Explicit order of exclusive facility administration writer; no facility lock for a legitimately global signer is inferred |
| 6 | identity.care_relationships -> identity.care_relationship_permissions -> identity.patients -> identity.people, needed sets FOR SHARE | Relationship/patient precede person to match exclusive continuity/relationship transitions; include all referenced reviewers/issuers/designators in the discovered people set; patient mapping immutable constraints still checked |
| 7 | consent.records -> clinical.encounter_participants, needed sets FOR SHARE | Current purpose/consent/participant intervals; no fresh clinical lifecycle locks here |
| 8 | clinical.content_governance_authorities -> content_reviewer_designations -> content_admissibility_evidence -> needed immutable clinical.allergy_verification_support rows, needed sets FOR SHARE | All creator/publisher/signer authority facts; controlled offline writers must use the same rank order and no reverse acquisition |
| 9 | Existing audit append chain -> new audit/signature-binding/outbox/obligation/receipt rows and final idempotency completion | No return to domain/authority ranks; signature lookup is immutable under the locked release workflow, no later conflicting signature lock upgrade |

Repository anchors: services/api/src/adapters/postgres/facility-service.ts:183,210,229,246,269,285 locks facilities -> professional/facility licenses -> memberships -> grants -> revocations. supabase/migrations/20261001001002_f010_f04_completion_authority.sql:36–99 locks lifecycle before facility/membership/license/person/patient/participant. Those F010 authority locks are FOR SHARE and compatible with the F011 SHARE locks; F011 never takes its appointment/queue mutation locks. supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql:363–367 and 430–441 locks relationship -> patient -> person, including the exclusive path; F011 must not retain the R1 person-before-patient inversion. Family relation writers (services/api/src/adapters/postgres/family-service.ts:162,166) likewise start with relationship. These sources do NOT share one preexisting total order; this Plan fixes F011's total order against their actual conflicting rows, rather than claiming identical predecessor order. Existing broad facility writer predicates are not changed by this Plan.

Later independent-session evidence must compose with the ACTUAL predecessor facility/continuity/F010 writers, not a fictitious reordered surrogate: revocation-first/action-first, relationship/patient/person transition and encounter completion overlap, observed pg_locks, bounded failure/retry and no inversion-induced cycle. F010 shared authority acquisition order alone cannot imply a conflicting deadlock; the new order prioritizes the exclusive writer sequences. New offline Feature-011 authority provisioning must conform before online consumers, with no public permission-management route.

GUCs are request-local attribution/policy inputs, NOT cryptographic authentication. Only the trusted native-session/current-authority verified API/repository boundary sets them on its connection (existing identity-repository.ts:303–304 pattern). SQL repeats current DB predicates; shifaa_api is trusted service process identity, unavailable to end clients and incapable of direct new-table DML. A process with that credential and arbitrary SQL could fabricate GUCs; RLS cannot prove native-session verification against a malicious trusted process. Planned tests distinguish client-header/body/JWT spoofing, unauthorized direct SQL/roles, narrow executor grants, and valid repository-set context. No test claiming denial of every possible GUC set by a trusted credential is used as authentication proof. Compromised privileged runtime is outside this baseline online-client boundary, not a fabricated guarantee.

## 12. Historical R2 blocker disposition

The unchanged R2 review recorded incomplete signing evidence. Current shared recovery supersedes that design placeholder; history is preserved, not retroactively made complete. Current exact design follows.

## 13. Exact evidence foundation storage and invariants

[Shared contract](contracts/verified-evidence-binding-v1.md) and [closed profile](contracts/verified-evidence-binding-v1.json) own exact field/nullability/FK/constraint responsibility. These are FUTURE additive design columns, not DDL/execution. bytea(32) in prose means bytea plus CHECK octet_length=32, never a PostgreSQL typmod. No generic evidence table or arbitrary JSON claims.

Historical sidecars snapshot facts at decision. Current mutable identity/version/eligibility is separately checked: stable ID RESTRICT FKs plus locked insert equality, NOT FKs to mutable ID/version pairs. Advanced or unrelated credential/designation/grant cannot count for old signature. New independently reviewed draft provides required fresh signing under the existing final-decision rule. No historical snapshot update/delete or issuer-role inheritance.

### clinical.content_material_bindings

| Column | Type | Nullability |
| --- | --- | --- |
| binding_id | uuid | NOT NULL |
| release_id | uuid | NOT NULL |
| artifact_version | integer | NOT NULL |
| material_kind | text | NOT NULL |
| evidence_ref | uuid | NOT NULL |
| verified_sha256 | bytea | NOT NULL |
| producer_id | text | NOT NULL |
| verified_at | timestamptz | NOT NULL |
| binding_contract_id | text | NOT NULL |

### clinical.content_signature_bindings

| Column | Type | Nullability |
| --- | --- | --- |
| signature_evidence_id | uuid | NOT NULL |
| binding_id | uuid | NOT NULL |
| binding_contract_id | text | NOT NULL |
| evidence_ref | uuid | NOT NULL |
| producer_id | text | NOT NULL |
| verified_at | timestamptz | NOT NULL |
| source_identity | text | NOT NULL |
| source_evidence_identity | text | NOT NULL |
| source_evidence_version | text | NULL permitted |
| source_evidence_sha256 | bytea | NULL permitted |
| credential_id | uuid | NOT NULL |
| credential_version | integer | NOT NULL |
| credential_profession | text | NOT NULL |
| credential_status | text | NOT NULL |
| credential_expires_on | date | NOT NULL |
| credential_issuer | text | NOT NULL |
| credential_evidence_object_id | uuid | NULL permitted |
| credential_reviewed_by | uuid | NULL permitted |
| credential_reviewed_at | timestamptz | NULL permitted |
| designation_id | uuid | NOT NULL |
| designation_version | integer | NOT NULL |
| designation_evidence_ref | uuid | NOT NULL |
| designation_by | uuid | NOT NULL |
| designation_status | text | NOT NULL |
| designation_valid_from | timestamptz | NOT NULL |
| designation_valid_until | timestamptz | NULL permitted |
| designation_source_identity | text | NOT NULL |
| designation_source_evidence_identity | text | NOT NULL |
| designation_source_evidence_version | text | NULL permitted |
| designation_source_evidence_sha256 | bytea | NULL permitted |
| designation_evidence_producer_id | text | NOT NULL |
| designation_evidence_verified_at | timestamptz | NOT NULL |
| signing_authority_id | uuid | NOT NULL |
| signing_authority_version | integer | NOT NULL |
| authority_action | text | NOT NULL |
| authority_content_type | text | NOT NULL |
| authority_governed_content_key | text | NOT NULL |
| authority_effective_scope_key | text | NOT NULL |
| authority_facility_id | uuid | NULL permitted |
| authority_issued_by | uuid | NOT NULL |
| authority_evidence_ref | uuid | NOT NULL |
| authority_status | text | NOT NULL |
| authority_valid_from | timestamptz | NOT NULL |
| authority_valid_until | timestamptz | NULL permitted |
| authority_source_identity | text | NOT NULL |
| authority_source_evidence_identity | text | NOT NULL |
| authority_source_evidence_version | text | NULL permitted |
| authority_source_evidence_sha256 | bytea | NULL permitted |
| authority_evidence_producer_id | text | NOT NULL |
| authority_evidence_verified_at | timestamptz | NOT NULL |

### clinical.content_admissibility_evidence

| Column | Type | Nullability |
| --- | --- | --- |
| id | uuid | NOT NULL |
| release_id | uuid | NOT NULL |
| artifact_version | integer | NOT NULL |
| artifact_digest | bytea | NOT NULL |
| content_type | text | NOT NULL |
| governed_content_key | text | NOT NULL |
| effective_scope_key | text | NOT NULL |
| policy_ref | uuid | NOT NULL |
| policy_version | text | NOT NULL |
| policy_sha256 | bytea | NOT NULL |
| source_admission_ref | uuid | NOT NULL |
| category_admission_ref | uuid | NOT NULL |
| code_admission_ref | uuid | NOT NULL |
| test_vector_admission_ref | uuid | NOT NULL |
| source_identity | text | NOT NULL |
| source_evidence_identity | text | NOT NULL |
| source_evidence_version | text | NULL permitted |
| source_evidence_sha256 | bytea | NULL permitted |
| synthetic | boolean | NOT NULL |
| status | text | NOT NULL |
| valid_from | timestamptz | NOT NULL |
| valid_until | timestamptz | NULL permitted |
| version | integer | NOT NULL |

### clinical.content_artifact_admissibility_bindings

| Column | Type | Nullability |
| --- | --- | --- |
| binding_id | uuid | NOT NULL |
| binding_contract_id | text | NOT NULL |
| release_id | uuid | NOT NULL |
| artifact_version | integer | NOT NULL |
| artifact_digest | bytea | NOT NULL |
| approval_id | uuid | NOT NULL |
| approval_version | integer | NOT NULL |
| content_type | text | NOT NULL |
| governed_content_key | text | NOT NULL |
| effective_scope_key | text | NOT NULL |
| policy_ref | uuid | NOT NULL |
| policy_version | text | NOT NULL |
| policy_sha256 | bytea | NOT NULL |
| source_admission_ref | uuid | NOT NULL |
| category_admission_ref | uuid | NOT NULL |
| code_admission_ref | uuid | NOT NULL |
| test_vector_admission_ref | uuid | NOT NULL |
| source_identity | text | NOT NULL |
| source_evidence_identity | text | NOT NULL |
| source_evidence_version | text | NULL permitted |
| source_evidence_sha256 | bytea | NULL permitted |
| producer_id | text | NOT NULL |
| verified_at | timestamptz | NOT NULL |
| synthetic | boolean | NOT NULL |
| approval_status | text | NOT NULL |
| approval_valid_from | timestamptz | NOT NULL |
| approval_valid_until | timestamptz | NULL permitted |

### clinical.allergy_verification_support

| Column | Type | Nullability |
| --- | --- | --- |
| id | uuid | NOT NULL |
| patient_id | uuid | NOT NULL |
| allergy_id | uuid | NOT NULL |
| previous_revision_id | uuid | NOT NULL |
| previous_version | integer | NOT NULL |
| target_status | text | NOT NULL |
| attestor_person_id | uuid | NOT NULL |
| source_identity | text | NOT NULL |
| source_evidence_identity | uuid | NOT NULL |
| producer_id | text | NOT NULL |
| recorded_at | timestamptz | NOT NULL |
| synthetic | boolean | NOT NULL |

### clinical.allergy_verification_bindings

| Column | Type | Nullability |
| --- | --- | --- |
| revision_id | uuid | NOT NULL |
| binding_id | uuid | NOT NULL |
| binding_contract_id | text | NOT NULL |
| evidence_ref | uuid | NOT NULL |
| producer_id | text | NOT NULL |
| verified_at | timestamptz | NOT NULL |

Exact structural constraints/FKs:

- allergy_heads UNIQUE(id,patient_id); allergies UNIQUE(id,allergy_id,patient_id,version) supports immutable same-context support FKs. Support.id is public reference and source_evidence_identity=id. Immutable patient/assertion/attestor/head/target; one consumed support per verification binding; no initial-revision binding.
- content_material_bindings PK binding_id, UNIQUE(release_id,material_kind), composite FK release_id/artifact_version -> release id/artifact_version. Exactly three profile-correct rows match immutable release evidence fields; narrow/deferred completeness, never raw SQL material.
- content_signature_bindings PK signature_evidence_id -> audit.signature_evidence(id), UNIQUE binding_id/evidence_ref, UNIQUE(source_identity,source_evidence_identity); stable credential/designation/authority IDs; people/facility/private-evidence FKs as shared §4. Reciprocal clinical-signature completeness and exact resource/release/version/digest guards are deferred. No duplicated audit signer/capacity/decision/time/resource/digest.
- content_admissibility_evidence exact release/version/digest composite FK; UNIQUE(id,release_id,artifact_version,artifact_digest). Target/scope immutable; governed other eligibility/evidence changes advance version. Exact approval provisioned after draft; scope policy alone insufficient.
- content_artifact_admissibility_bindings release/version/digest composite FK AND approval-id/target composite FK; UNIQUE exact artifact + approval ID/version. Immutable policy/support/source/validity snapshot. Exactly one currently eligible binding or deny ambiguity; exact current approval version/fields/status/validity/synthetic mode must match.
- allergy_verification_bindings PK revision_id -> allergies(id), UNIQUE(binding_id), UNIQUE(evidence_ref) FK support(id). Reciprocal deferred guard checks patient/assertion/predecessor/version/target/actor/reference. Invalid initial/orphan/cross-context bindings cannot commit.
- SHA fields bytea CHECK length=32; versions positive, fixed contract/profile/source/producer values, nonempty strict UTF-8/no NUL. Optional source version/digest only if actual source contract defines them. Cross-table consistency is narrow admission plus constraint triggers, never illegal cross-table CHECKs.
- Current content_governance_authorities exact scope columns: content_type/governed_content_key/effective_scope_key text; issued_by person FK; evidence_ref UUID; evidence_producer_id text/evidence_verified_at timestamptz/source_identity text/source_evidence_identity text NOT NULL; source_evidence_version text/source_evidence_sha256 bytea NULL. Current content_reviewer_designations has analogous evidence metadata/designated_by person FK. Existing action/capacity/facility/status/validity/version predicates retained; no wildcard/new role/public provisioning.
- Credential person, designation capacity/person/license and grant person/capacity reconstruct from audit signer/capacity + captured credential_id. At insert/publication compare current row identities and all captured fields, not versions alone. No extra audit facts stored in sidecar.
- New relations ENABLE/FORCE RLS/default deny; same non-owner/NOBYPASSRLS executor, fixed search_path/revoked PUBLIC EXECUTE, no API direct DML/worker/service-role bypass/clinic private fields. Immutable/deferred enforcement is P4; actual source authenticity P6.
- Discover credential private-evidence FK parents at workforce rank 5 and all referenced issuer/designator/reviewer people at rank 6 before audit. Needed support SHARE rows follow new authority/designation/admission at rank 8. Offline provisioning follows the same ranks, no network under locks.

Shared §§7–9 own coding source/provenance and unchanged retry/receipt semantics. No approved real terminology source is identified. New known input without one denies validation-failed; optional unknown/omitted remains valid. Preserve unchanged historical known facts without new verification claim. Synthetic physical storage proves no actual qualification/coding/signature truth.
