# Feature 011 planning research

Recovery contract set: SHIFAA-F011-ARTIFACT/1; SHIFAA-F011-CREATE-RELEASE-HANDOFF/1; SHIFAA-F011-PROTECTED-BODY/1; SHIFAA-F011-PROTECTED-AAD/1. SHIFAA-F011-ALLERGY-FACTS/1 + REASON/1 + ALLERGY-PROTECTED/1 + ALLERGY-AAD/1; SHIFAA-F011-RECEIPT-PROTECTED/1 + RECEIPT-AAD/1. R2 superseding authority: [dated decision](decisions/plan-recovery-r2-2026-10-06.md).

Input: clarified spec 0.12, Product Owner SPEC_APPROVED on 2026-10-01. Research and design only; no runtime, clinical or release evidence is claimed. The root owns this recovery. The original October 1 research used a bounded read-only explorer for predecessor patterns; no delegation or runtime work is claimed for this recovery.

## 1. Existing runtime and boundaries

**Decision:** retain Node 24.18.0/pnpm 11.13.0, PostgreSQL 17, Supabase CLI 2.113.0, supabase-js 2.112.2, Fastify 5.11.3, postgres 3.4.9, TypeScript 7.0.2 in root/API packages, TypeBox 0.34.52 and the existing test tools. Patient Expo 57.0.15 uses its checked-in TypeScript 6.0.3; clinic/admin Next 16.3.0 remain unchanged.

**Rationale:** package manifests, supabase/config.toml and infra/db/Dockerfile.postgis are checked-in authority. No dependency upgrade, hosted database, new app, SDK, vendor, medical source or integration is needed. The historical October 1 research referenced upstream changelog material; this recovery uses repository evidence and accepted architecture decisions, without new external/provider conclusions. Database minor-version compatibility must be recorded against the actual two local runtimes at later verification; no upgrade or compatibility pass is inferred here.

**Alternatives considered:** new signing vendor, second app, direct PostgREST domain access and dependency upgrades are unnecessary or outside the frozen boundary.

## 2. Physical baseline and API reconciliation

**Decision:** create additive Feature 011 clinical storage and narrow functions later; reuse identity, Feature 010 context, audit, outbox and idempotency ownership. The current migration tree contains audit.signature_evidence but no physical clinical.allergies or clinical.content_releases table. Its existing signature role CHECK accepts only five admin role labels, so add resource-scoped physician/pharmacist evidence capacities without changing identity.admin_role_grants or treating those capacities as admin roles.

**Rationale:** canonical logical names exist in Data/RLS §§3/5; the concrete audit migration is supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql. Canonical catalog mismatches are reconciled now in the [approval/reconciliation record](../../docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md): terminal entered_in_error in verifyAllergy and clinic metadata in existing listClinicalContent.

**Alternatives considered:** rewriting old migrations, inventing an eighth operation, granting ADM-MEDICAL to signers, or adding a shadow patient/encounter table violates the approved boundary.

## 3. Append-versioned allergies

**Decision:** clinical.allergies holds immutable revision rows with a stable allergy_id and same-patient supersedes_id; a private clinical.allergy_heads table serializes revision creation. A separate corrects_allergy_id links a new assertion to a terminal erroneous assertion. Every creation starts self_reported; verified revisions require reason/evidence. Known and explicitly unknown values remain distinct.

**Rationale:** this separates append-only clinical facts from a small mutable concurrency pointer. A composite same-assertion/same-patient FK and monotonic version prevent an unrelated revision from becoming a predecessor. Error correction is creation, never resurrection.

**Alternatives considered:** in-place clinical updates lose attribution; one mutable row plus unbounded log JSON hides constraints; inheriting confirmation into a replacement contradicts the clarified spec.

## 4. Artifact binding and signing authority

**Protection boundary:** current packages/core/src/identity-onboarding/crypto.ts and services/api/src/modules/identity-continuity/security.ts provide AES-GCM patterns, not a general clinical field-protection port. Plan an internal exact-byte clinical protection seam with versioned keys/authenticated context; do not apply identifier normalization or authentication-replay expiration semantics to clinical artifacts/receipts. No vendor or operation is added.

**Decision:** immutable artifact_version and server-computed SHA-256 bind category/source/effective instant/scope/supersession/content/code/test-vector evidence. workflow_version is a separate CAS counter. Signature resource_version binds artifact_version, never the workflow counter. Signers require authoritative credential verification, evidence-backed reviewer designation, explicit current signing authority, purpose and AAL2; no ADM-MEDICAL requirement.

**Rationale:** the first signature increments workflow_version but must not invalidate the artifact evidence used by the second. All approval claims are validated server-side and rechecked at publication. New private authority/eligibility evidence records persist clinical-owner decisions; their provisioning is controlled offline administration, not another Feature 011 API.

**Alternatives considered:** trusting role headers, a license alone, one person in both capacities, storing private keys, or deriving signing permission from an admin grant are rejected.

## 5. Explicit publication chain

**Decision:** one private content-series row per owner-defined governed-content/effective-scope identity serializes publication. An initial release has no predecessor only if no published root exists. Every replacement names the currently applicable same-series release; a published future successor reserves that predecessor so another successor cannot compete. When effective, it replaces the predecessor through time-based selection, not an activation operation. Rollback is a new artifact and release.

**Rationale:** an absent-row initial race needs serialization as well as row constraints; a transaction-scoped advisory lock on the server-resolved series identity precedes row locking. Partial unique published-root and published-successor constraints remain a backstop. Content admissibility comes from separately approved clinical-owner policy; absent policy denies real eligibility. Neutral synthetic fixtures have no medical assertions.

**Alternatives considered:** latest timestamp wins, multiple overlapping branches, relabeling an old signed release as current, or an activation/rollback endpoint contradict the approved chain.

## 6. Transactions, RLS and revocation

**Decision:** use explicit short transactions, a common lock order and FOR SHARE on authorization facts whose non-key status/validity updates must conflict. FOR KEY SHARE alone is insufficient for that guarantee. Re-read under locks before append/sign/publish; no external signing/KMS call holds database locks. Independently enforced forced RLS applies to non-owner, non-BYPASSRLS execution; public/service roles get no domain grants.

**Rationale:** predecessor Feature 010 F04 already uses authority-row locks and two-session barriers. PostgreSQL documents the differing row-lock conflicts and consistent-order deadlock handling; forced RLS still does not constrain superuser/BYPASSRLS roles. See [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html), [PostgreSQL 17 row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). SHIFAA's private-schema/API-only contract overrides generic authenticated-table grants.

**Alternatives considered:** application-only checks, check-then-write without locks, KEY SHARE for mutable authority, owner-executed RLS proof, and process-local mutexes cannot establish the required evidence.

## 7. Real database evidence and portable composition

**Decision:** extend the repository's isolated-database runner pattern for both named runtimes: shifaa-local-postgres and shifaa-local-supabase. Test separate physical connections, observable pg_locks/barriers, online role identity, constraints, canonical replay and audit/outbox counts. Preserve native Node ESM and Expo/browser shared-module resolution with explicit imports where required.

**Rationale:** tools/run-feature-010-postgres-test.mjs and tools/run-feature-010-completion-authority-concurrency-test.mjs are current reusable patterns; mocked repositories cannot prove SQL locks/RLS. tools/run-native-clinical-composition-test.mjs protects the consumed clinical facade.

**Alternatives considered:** Promise.all against an in-memory fake, SQLite, sleeps without proven overlap, one skipped runtime, or browser-only module tests are insufficient.

## 8. UI gates, validation and environment

**Decision:** specify state/copy/disclosure contracts using existing design-system primitives, Arabic-first RTL and English LTR. New Feature 011 compositions/immutable references still need approval under OPEN-UX-001 before affected-UI PLAN_APPROVED. Do not reuse Feature 010's scoped approval.

**Rationale:** the provisional UI Contract supplies tokens/routes and accessibility constraints, not Feature 011 composition approval. All other retained stage effects remain in plan.md. Planning schema/reference/scope checks are separate from later PostgreSQL/live acceptance.

**Alternatives considered:** claiming design approval from predecessor screenshots, generating medical-looking fixtures, installing a plugin or running implementation verification during Plan is unjustified.

A concrete configuration gap: root package.json format:check explicitly lists specs through 009 and omits 010/011. Later maintenance should extend its coverage; this Plan does not change package.json. No missing test tool was evidenced. No installation is proposed.

## 9. Recovered canonical byte/signing contract

**Decision:** own SHIFAA-F011-ARTIFACT/1 as a frozen language-neutral signing protocol in Plan, before SQL or core encoder work. Exact prefix, fourteen-field order, length-framed strict UTF-8, null/initial representation, UTC microseconds, digest/UUID spelling and rejection rules come from the approved text/profile/fixed vectors/parity registry. SQL computes artifact SHA-256 and verifies optional declaredDigest; later pure-core encoding must produce identical bytes/hash in both PostgreSQL runtimes. Signatures separately bind resource ID and immutable artifact version.

**Rationale:** the first C03 blocker exposed missing byte interoperability, despite the original Plan's resolved-engineering claim. A common facts list is insufficient when two languages must sign the same artifact. Evidence reference/material-digest binding remains distinct from workflow state and encryption metadata. Frozen positive expected outputs are independent inputs, never regenerated from an implementation under test.

**Alternatives considered:** JSON/JSONB textual serialization, insertion-order-dependent objects, implementation-private SQL formatting, locale/whitespace/Unicode normalization and delayed protocol choice in C13 were rejected. They could produce distinct signing bytes for the same reviewed facts. This uses accepted repository contracts; it makes no new vendor or external compatibility claim.

## 10. Recovered trusted evidence boundary

**Decision:** the trusted service Evidence Port resolves exact immutable unencrypted material and verifies SHA-256/reference association, emitting only reference + verifiedSha256 for content/code/test-vector evidence. External callers never author that trusted result. PostgreSQL validates normalized facts and exact equality with the trusted results, builds ARTIFACT/1 canonical bytes and hashes the artifact; SQL never obtains raw material or hashes external evidence. Optional declaredDigest is checked against SQL's computed artifact hash.

**Rationale:** external evidence identity/material verification and SQL artifact construction have separate authorities. The internal closed handoff makes the distinction executable without changing seven public wire shapes. Raw bytes stay transient in the service boundary and never enter SQL as evidence-resolution input, generic receipts, logs, audit, signatures, outbox or unauthorized returns. R2 explicitly permits the existing integrity-verified authorized artifactReview strings and ciphertext-only dedicated clinical canonical receipts; see the disclosure and receipt contracts. Actual material verification is later producer evidence, not implied by a well-formed hash.

**Alternatives considered:** caller/precomputed digests as authority, hashing reference strings/ciphertext instead of material, SQL evidence lookup/network I/O, and the superseded C02B raw-material-to-SQL proposal were rejected. The C03 resumption record's historical statement that SQL must hash material is not current authority; the accepted October 6 decision assigns that responsibility to the application Evidence Port.

## 11. Recovered BODY/1 and AAD/1

**Decision:** application-layer AES-256-GCM only under SHIFAA-F011-PROTECTED-BODY/1. The exact contractId/keyRef/nonce/ciphertext/authTag map to five immutable NOT NULL typed columns; nonce=12 octets, ciphertext nonempty, authTag=16 octets. C04 validates immutable/versioned external keyRef with no key material/mutable aliases. SQL performs structural validation and opaque storage only; KMS/HSM and encryption/decryption remain outside PostgreSQL.

AAD/1 is a fixed prefix and five UTF-8 octet-length frames in resourceType/resourceId/fieldId/artifactVersion/keyRef order. Reconstruct it from persisted id/artifact_version/body_key_ref plus exact constants. Exclude workflowVersion and any independently stored AAD payload. The handoff profile/fixed AAD vectors are authoritative; this research does not redefine their bytes.

**Rationale:** typed fields make the physical storage contract explicit and prevent an adapter inventing another envelope. Fixed AAD binds ciphertext to its intended immutable resource/body/version/key. Workflow increments must leave that binding intact. Only the real producer can prove AES-GCM authentication, nonce generation, key-version/context/tamper denial and intended-plaintext correspondence; SQL structural acceptance cannot do so.

**Alternatives considered:** PostgreSQL encryption/KMS work, plaintext durable content, JSON/text persisted envelopes, algorithm agility, extra keyVersion/free-form AAD fields, mutable key aliases, workflowVersion-authenticated bodies and reuse of identity-normalizing/transient-auth ciphers were rejected. No provider selection, production KMS readiness or external key existence is inferred.

## 12. Recovered lineage-relative allocation and retries

**Decision:** service allocates releaseId before protection and preflights series/predecessor without later write locks. Candidate artifactVersion is initial=1 or predecessor.artifactVersion+1. Evidence resolution and body protection finish before the locked mutation. SQL follows the deterministic idempotency/series/domain/authority lock order, revalidates lineage/version/current authority and requires exact candidate equality or atomic rejection. No network, evidence-port or KMS/HSM call runs while locks are held.

Retire next_artifact_version and unique(series_id, artifact_version) draft-ordinal allocation. Distinct release IDs can share a lineage-relative version. Preserve release-scoped unique(id, series_id, artifact_version), same-series lineage, unique published root/successor and immutable resource/version/digest signatures.

**Rationale:** competing initial/replacement drafts use version 1; same-predecessor competitors use the same predecessor.version+1. A global draft ordinal contradicts that accepted allocation and blocks valid replacement drafts. Version alone is not an artifact identity; current release ID plus immutable version/digest binds signatures and AAD. Locked revalidation handles stale preflight and races without trusting a preflight snapshot as mutation authority.

**Alternatives considered:** the old global draft allocator/per-series version uniqueness, version assignment after encryption with silent AAD substitution, locks held across KMS/evidence calls, and retrying a stale protected tuple were rejected. The old allocator was a planned invariant, not an implemented migration to repair.

**Retry decision and rationale:** every rejected pre-commit attempt starts outside locks with current preflight, fresh releaseId, fresh random nonce and fresh protected envelope while preserving public idempotency bindings. Reusing an attempt could authenticate stale identity/version facts and reuse a GCM nonce/envelope. Derived internal randomness is not a public request binding. Resolve unknown commit outcome using stored idempotency status first; a successful committed replay reauthorizes and returns the stored result without creating or encrypting again. Late real-producer tests must prove this behavior and instrument the absence of external calls under locks.

## 13. Evidence stages and lifecycle recovery

**Decision:** [Plan §6.1](plan.md) owns the ordered P1–P7 evidence stages: public generation; frozen canonical metadata; trusted handoff metadata; synthetic physical proof; physical/generated owner-stage assertion; real Evidence/Protection Port composition; later SQL/core equivalence. Both PostgreSQL runtimes, actual non-owner/NOBYPASSRLS execution, FORCE RLS/grant/function boundaries and independent-connection/barrier/pg_locks probes remain mandatory.

**Rationale:** moving physical preparation before adapters was a sequencing repair, but required a pre-existing internal contract. Synthetic handoffs allow physical tests to establish storage/binding/SQL hashing without claiming later cryptographic or evidence-port proof. The stage assertion cannot depend on the producer it unlocks. An acyclic Tasks graph is insufficient without these Plan-owned boundaries.

**Alternatives considered:** demanding C04 proof before C04 can run, treating synthetic envelopes as real encryption evidence, treating metadata-only validation as SQL acceptance, or patching the old ledger again before Plan recovery were rejected. The 95-task/29-checkpoint ledger and prior accepted checkpoints remain historical recovery inputs, not execution authority.

## Research outcome

The original October 1 assertion that all engineering choices were resolved was premature; its exact capture remains in evidence/plan-recovery/research.md. This recovery integrates the accepted canonical, evidence, BODY/AAD, allocation and retry decisions into the Plan family rather than hiding them in Tasks. Fresh architecture/data review must validate the complete family; no runtime or generated-metadata acceptance is inferred.

SPEC_APPROVED remains authoritative. Prior Plan approval is suspended; independent review and new digest-bound approval remain pending. OPEN-UX-001 still requires Feature 011 Product Owner + Design Lead evidence: the PO capture approval is recorded, but no authoritative Feature 011 Design Lead approval/designation exists. All clinical, legal, technical and formal UX gates retain their named owners and fail-closed stage effects. No Tasks generation, C02B/C03/T017 implementation or gate closure is authorized.

## R2 superseding architecture rationale (2026-10-06)

R1 static validation and its fresh review missed three foundational contracts; the subsequent adversarial self-debate FAILED. Its optimistic “no unresolved design decision” disposition is superseded, not proof of earlier completeness. [R2 decision](decisions/plan-recovery-r2-2026-10-06.md) records authorized recovery edits, not Plan approval. These choices now belong to Plan/model/contracts, not future Tasks.

**SD-01 decision/rationale:** honor existing required ArtifactReview string fields through lossless UTF-8 material plus current exact-release authorization and immutable reference/hash verification. Public code/vector strings remain domain-opaque, not medical interpretation. Generic/no-authority sinks are prohibited; authorized exact review disclosure is necessary for the already-promised response. Dedicated encrypted canonical mutation receipts preserve that exact response while raw material never enters SQL as evidence input. Rejected alternatives: retaining blanket no-return while returning required fields, lossy/base64 re-encoding without a public encoding contract, omitting required review fields, reference-only authorization, clinic body access or reconstructing replay from newer state. Existing current neutral evidence vectors fit UTF-8; no assertion about arbitrary binary/real content compatibility.

**SD-02 decision/rationale:** one versioned facts payload plus required reason payload uses one AES-GCM envelope protocol, exact typed columns and six-field revision AAD. Encrypting each scalar separately would add unnecessary contexts/key metadata and complicate known/unknown preservation without a current clinical query requirement. Protected facts must be decrypted/validated only by the authorized application before preservation/correction, then freshly protected for the new immutable revision. SQL handles structural status/provenance/CAS/RLS, never medical scalar crypto. Rejected: reusing release BODY/1 identity, identity-normalizing ciphers, current-head/workflow AAD, plaintext clinical indexes, unspecified SQL packed ciphertext and per-scalar protocols. Exact report strings/source and approved corrections remain unchanged.

**SD-03 decision/rationale:** PostgreSQL provides authoritative mutation result metadata only after locked admission; that result must be serialized/encrypted before the same transaction commits. Prepare a bounded local cryptographic capability before entry, perform local receipt AES-GCM after result construction, and enforce encrypted receipt/idempotency completion through a private commit obligation/deferred guard. Existing idempotency-store.ts local encrypt-inside-transaction is a pattern, not the new versioned clinical receipt implementation. Composite audit FK follows actual audit.events(occurred_at,id). Rejected: PostgreSQL/KMS encryption, network under locks, durable plaintext generic bodies, post-commit receipt completion, service-only unchecked atomicity, reconstructing newer resources and a blanket prohibition on local receipt encryption. A provider unable to supply a local capability fails before mutation; no provider is selected. Private receipt retention remains gated; generic expired-scope purge cannot erase linked clinical effects.

**Lock/context decision/rationale:** source confirms different predecessor lock sequences, so an invented universal inherited order would be false. The F011 rank follows actual exclusive facility writer and relationship/patient/person sequence, places consumed encounter before authority, and retains compatible SHARE authority reads against F010. Cross-predecessor barrier/pg_locks tests are future proof, not permission to decide order later. GUCs are trusted process-set values; native authentication happens before them. RLS tests cannot authenticate arbitrary SQL authored by a compromised trusted API credential. Rejected: client headers/JWT metadata as current authority, calling GUCs cryptographic proof, blindly retaining R1 people-before-patient inversion and demanding a losing concurrent preflight performed zero encryption.

**Threat/privacy and migration impact:** no public/new clinical resource/operation/vendor. New protected columns and private commit-obligation storage are additive future DDL, ENABLE/FORCE RLS/executor-only, with immutable row/FK/COMMIT enforcement and populated predecessor preservation. Decryption/material/receipt-key surfaces are restricted; no raw clinical values or live keys enter logs/audit/outbox. Synthetic physical acceptance and real producer composition remain separate, with P3 contracts before P4 SQL and P6 real proof. Production key/PHI/retention and clinical/UX/reference-environment approvals remain open. No live compatibility, performance, provider or regulatory conclusion was fabricated.

**Historical R2 research outcome (superseded technical disposition):** [The sole-root adversarial review](evidence/plan-recovery-r2-self-debate.md) resolves SD-01/02/03 as proposed design but finds blocking R2-SD-04: the exact trusted external signing-verification result and immutable sidecar/reference mapping are still unspecified. Current actor/artifact matching requirements do not supply that contract. No alternative verifier protocol is selected in this round; Plan remains technically NOT READY, formal approval suspended, Tasks prohibited. Static/vector consistency is not proof that this fourth boundary is complete.

## Evidence-foundation superseding rationale (2026-10-06)

[Recovery-only decision](decisions/plan-recovery-evidence-foundation-2026-10-06.md) adopts the accepted shared-evidence direction and resolves R2-SD-04/AC-02/03/04 in proposed design. The historical R2 FAIL above remains earlier failure evidence. No external/vendor research/acceptance conclusion fabricated.

Share evidence identity/provenance/subject association mechanics, never authorization or medical rules. Exact typed profiles/domain tables replace repeated unspecified handoffs. Material hashing remains Evidence Port; ARTIFACT hashing SQL. Signing has exact verified tuple/source plus immutable qualified basis, using existing professional verification rather than a new registry. Rejected: one contract per repeated concept, verified=true/JSON bag, generic physical authorization table, SQL external verification and invented vendor/signing algorithm.

Temporal choice: baseline professional rows (20260811000300_facility_onboarding_rbac.sql:29–34) and new grants/designations have mutable versions, no proven successor lineage. EXACT_BOUND_ROW_VERSION_ONLY plus captured-field equality avoids guessed renewal/regrant equivalence. Stable ID FKs/snapshot versions permit current revocation; composite current-version FKs would block it. Fresh signing follows existing final-decision uniqueness through a new reviewed draft. No medical qualification criteria selected.

Admissibility: BOTH current approval and immutable binding target release/version/digest plus scope/policy/support facts. Broad scope policy is not exact approval. Controlled explicit approval follows draft SQL digest creation, avoiding circular approval of a nonexistent artifact. Publication uses exact current database approval; no new external call. Changed approved basis can produce a fresh explicit binding while preserving history. Reject scope-only admission, arbitrary LIMIT 1 and mutable release approval pointer.

Allergy: identity.private_evidence_objects accepts only facility/professional-license buckets (baseline lines 11–16). Extending it mixes privacy/authorization. Minimal metadata-only governed provenance binds clinician/patient/assertion/head/target and is consumed by exact revision. No medical truth, new document storage or public upload/provisioning operation. Missing legitimate record denies; never manufacture evidence from caller UUID. Protected reason unchanged. Reject cross-context reference reuse/blind echo/invented medical verifier.

Coding: Spec:205 and OpenAPI:744–768 allow optional explicit unknown. No approved real terminology boundary identified. Reject new known without matching approved source; syntax is not terminology verification; do not silently drop submitted values. Preserve unchanged historical known facts without new external-validation claim. Synthetic known fixtures stay isolated. No vocabulary/provider/policy chosen.

Physical and real acceptance are non-circular: P3 fixed profiles/vectors before P4 synthetic schema/FKs/deferred guards/current-version/races, P6 actual source authenticity/composition, P7 same frozen ARTIFACT equivalence. Private wrappers do not change public or HND/BODY members. Needed FK evidence/people/support locks have ranks before audit. No behavior deferred to Tasks.

Current technical outcome comes from fresh validation/self-debate; formal Plan approval remains suspended. UX authority/retained gates unchanged, no checkpoint/Tasks/implementation authorization.
