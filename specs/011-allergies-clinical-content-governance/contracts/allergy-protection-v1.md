# Feature 011 allergy revision protection v1

Recovery R2 proposed internal design; review required; no implementation/approval. IDs: `SHIFAA-F011-ALLERGY-FACTS/1`, `SHIFAA-F011-ALLERGY-REASON/1`, `SHIFAA-F011-ALLERGY-PROTECTED/1`, `SHIFAA-F011-ALLERGY-AAD/1`. These define one revision facts payload and one optional reason payload using one protection protocol; release BODY/AAD are not reused. No public shape or clinical vocabulary changes.

## Closed plaintext and exact bytes

Facts logical object has exactly contractId (ALLERGY-FACTS/1), substance, source, coding, reaction, severity, onset. substance has exactly nonempty identity/display strings. source has nonempty display and optional nonempty reference, matching existing Source; retain original source unchanged in later revisions. coding is exactly {knowledge:unknown} or {knowledge:known,value:{system,code, optional display}}, with existing nonempty text constraints. reaction/severity/onset each have {knowledge:unknown} or {knowledge:known,value:nonempty string}. Missing optional facts on creation normalize to explicit unknown. Do not invent reaction/severity enums, dates, medical codes or clinical normalization. Available validated coding uses the existing allowed validation boundary; unavailable coding remains unknown.

Reason logical object is exactly {contractId:SHIFAA-F011-ALLERGY-REASON/1, reason:nonempty exact string}. No other field. The public request schema supplies the reason; this is not a new public version field.

Payload bytes are compact UTF-8 JSON: recursively sort object keys by Unicode scalar value; arrays retain order; strings preserve every scalar, including literal whitespace, Arabic, combining sequences and control values. Escape quote/backslash, use the short JSON escapes for backspace/form-feed/LF/CR/tab, and lowercase `\u00xx` for other U+0000–001F; all other scalars are emitted literally. No slash/HTML/U+2028 escaping, BOM, whitespace outside strings or newline terminator. Booleans/null use lowercase JSON tokens; any integer uses minimal decimal ASCII (no sign for positive versions). Reject duplicate keys, unknown fields, invalid UTF-8/unpaired surrogates and non-canonical serialized inputs. Protected facts/reason contain no floats. On decryption require exact canonical reserialization equality and closed schema. This byte rule is shared by receipt body serialization, not ARTIFACT/1. No plaintext payload is sent to SQL or durable diagnostic sinks.

## Producer, consumer and physical representation

Only the trusted application Protection Port can produce either envelope after current API/native-session/action checks. AES-256-GCM only; keyRef must identify an immutable/versioned external KMS/HSM key, never key material or current/latest alias. Producer establishes the version identity using its configured key boundary, not a guessed URI pattern. SQL treats keyRef as opaque nonempty strict UTF-8 text without NUL. Random nonce exactly 12 bytes; authTag exactly 16; ciphertext nonempty. Each encryption invocation, including unchanged facts and reason, obtains a fresh random nonce. No caller-authored envelope/keyRef/trust assertion. Key/network/KMS preparation and facts/reason encryption finish before database locks.

Each envelope is closed {contractId:SHIFAA-F011-ALLERGY-PROTECTED/1,keyRef,nonce,ciphertext,authTag}. JSONB transport may carry the three byte fields as even-length lowercase hex, decoded once to bytea; this is not the durable envelope representation. Duplicate-member rejection precedes JSONB conversion. SQL validates closed structure, envelope ID, length and metadata equality, never encrypts/decrypts or receives a key.

On clinical.allergies each prefix has exactly five typed columns:

| Prefix | Columns | Nullability |
| --- | --- | --- |
| facts | facts_contract_id text; facts_key_ref text; facts_nonce bytea; facts_ciphertext bytea; facts_auth_tag bytea | All NOT NULL; exact protected ID, nonempty keyRef/ciphertext, 12-byte nonce and 16-byte tag |
| reason | reason_contract_id text; reason_key_ref text; reason_nonce bytea; reason_ciphertext bytea; reason_auth_tag bytea | All NULL for version-1 self_reported creation; all NOT NULL with identical structural constraints for every verification revision |

Retire the unspecified scalar encryption/verification_reason_ciphertext placeholder. There are no plaintext substance/source/coding/reaction/severity/onset/reason columns or blind indexes. Unknown markers are inside facts, not separate clinical plaintext. No stored free-form AAD or key material. Immutable envelopes reject UPDATE/DELETE with the revision. Protection/decryption is service-owned, authorized exact revision/record projection only; SQL reads only opaque storage. History reads reconstruct each payload under its own immutable context. AAD/authentication or schema failure denies, with no clinical plaintext in errors/logs/audit/outbox.

## Authenticated context and authoritative allocation

AAD exact prefix `SHIFAA-F011-ALLERGY-AAD/1;`, then exactly six non-null `S<byte-length>:<UTF-8 payload>,` frames:

1. resourceType = clinical.allergy_revision
2. allergyId = canonical lowercase stable allergy UUID
3. revisionId = canonical lowercase new revision UUID
4. revisionVersion = positive minimal decimal ASCII
5. fieldId = facts OR verification_reason
6. keyRef = exact immutable envelope reference

Lengths count UTF-8 octets, preserve Unicode, no delimiter escaping/normalization/locale. Text metadata rejects NUL/malformed UTF-8. Reconstruct from persisted allergy_id/id/version and the relevant envelope keyRef plus constants. Neither current head, current status, workflow state nor current authorization is cryptographic identity. Immutable globally unique allergy_id/patient_id binding plus same-patient revision FK prevents patient substitution.

Create: service allocates fresh stable allergyId/revisionId and candidate version 1 before protection; supplies normalized self_reported facts. SQL independently requires first version, no predecessor and no reason/evidence. A linked correction first authorizes and validates the same-patient terminal entered_in_error assertion; fresh assertion remains self_reported.

Verify: service authorizes and loads previous immutable facts/decrypts outside write locks, verifies old ID/version bindings, preserves unchanged fields/original source, and applies ONLY supplied AllergyCorrections during an allowed status-changing edge. It allocates a fresh revisionId with candidate version = selected current version + 1; encrypts a complete new facts payload and independently bound required reason. The closed trusted mutation preparation is {allergyId,revisionId,revisionVersion,previousRevisionId,protectedFacts,protectedReason}; create uses previousRevisionId=null/protectedReason=null. Existing validated structural request/context/evidence-ref fields are separate, not client-authored protected fields. SQL locks the head and rechecks native/current clinician/care/purpose/AAL, If-Match, candidate version, exact predecessor ID, terminal status and transition. A stale head/invalid transition rejects the entire effect; SQL never adjusts an already-protected version or edits facts in place.

Entered_in_error is terminal; no verification/correction-only same-status edge or verified-to-self_reported edge. Correction after error is a NEW linked assertion through createAllergy. Original recorder/time/source persist; action actor/time and reason/evidence are attributable to the new revision. On a rejected pre-commit attempt discard candidate envelopes; any retry uses current preflight, fresh revision ID and fresh nonces; new assertion retry also uses fresh allergy ID. Same-key committed replay is original receipt, with current disclosure authorization and no new encryption/effect. Unknown commit resolves original idempotency state before any fresh attempt.

SQL plaintext structural fields are only id, allergy_id, patient_id, version, supersedes_id, verification_status, original_recorder_person_id/original_recorded_at, action_actor_person_id, facility_id/encounter_id, verification_evidence_ref, corrects_allergy_id, recorded_at and the opaque envelope metadata. They support attribution, lineage/status/CAS/indexing/RLS and reveal no encrypted clinical scalar. Current head id/version and stable correction links remain mutable structural pointers only as already planned.

## Non-circular proof boundaries

Contract preparation freezes closed payload/envelope/handoff/columns/AAD and independent neutral fixed vectors. Synthetic physical preparation in both runtimes proves structure/nullability, immutable revisions, same-patient/head/CAS/allocation, RLS/grants and atomic receipt obligations using opaque synthetic envelopes; it makes no AES-GCM/plaintext claim. Later real Protection producer proves exact facts/reason bytes, random nonces, versioned keyRef, AES-GCM roundtrip and field/id/version/key/context/tamper denial, preserve/correct behavior, and real producer -> already-prepared SQL in both runtimes. Native/current authorization and reconstruction projections are application acceptance. No external KMS/network call occurs under locks. No stage depends on a future producer's cryptographic acceptance to prepare physical storage.

## Evidence-foundation reference (2026-10-06)

[Shared v1](verified-evidence-binding-v1.md) §7 defines verificationEvidenceRef existence/exact clinician provenance context/one-use revision association; no medical service/license-bucket reuse. Private VerifyAllergyPhysicalPreparation={protectedRevision: unchanged six-member preparation,verifiedEvidence: closed allergy_verification result}. Protection payload/envelope/columns/AAD/vectors unchanged. §8 owns approved-source-only coding; absent source accepts optional unknown/rejects new unvalidated known without silently changing values. Unchanged historical known may be preserved, never claimed freshly externally validated.
