# Feature 011 validation quickstart

Recovery contract set: SHIFAA-F011-ARTIFACT/1; SHIFAA-F011-CREATE-RELEASE-HANDOFF/1; SHIFAA-F011-PROTECTED-BODY/1; SHIFAA-F011-PROTECTED-AAD/1. SHIFAA-F011-ALLERGY-FACTS/1 + REASON/1 + ALLERGY-PROTECTED/1 + ALLERGY-AAD/1; SHIFAA-F011-RECEIPT-PROTECTED/1 + RECEIPT-AAD/1. R2 superseding authority: [dated decision](decisions/plan-recovery-r2-2026-10-06.md).

Recovered evidence-foundation Plan validation guide, not execution evidence. Prior Plan approval is suspended and implementation fully paused. The 95-task/29-checkpoint ledger is historical recovery input. Run the commands below only under subsequent recovered-Plan, rebuilt-Tasks and explicit checkpoint authorization; recovery starts no services, resets no databases, creates no migrations and runs no feature tests. [Current lifecycle decision](decisions/plan-recovery-2026-10-06.md) overrides old labels.

## Prerequisites and isolation

Use the pinned repository toolchain in plan §3, installed Docker/psql and existing local DB harnesses. No installation/upgrade/hosted production connection is authorized here. Use project-local corepack pnpm exec supabase only; CLI remains exactly 2.113.0, never bare/global supabase. Confirm branch codex/011-allergies-clinical-content-governance and worktree under repository .worktrees. Preserve .specify/feature.json.

Two required real runtimes, using the predecessor harness configuration:

| Runtime             | Existing container / admin setup identity                            | Evidence boundary                                                                              |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Compose PostgreSQL  | shifaa-local-postgres-postgres-1; shifaa_owner; database shifaa      | Admin identity creates isolated temporary test DB only; online API/executor roles prove access |
| Supabase PostgreSQL | supabase_db_shifaa-local-supabase; supabase_admin; database postgres | Same migration chain in isolated temporary test DB; forced-RLS/JWT-bound API checks            |

Inspect actual container/runtime versions at verification; identifiers come from current harness defaults and may require configuration if the local profile changes. Do not treat PostgreSQL major-version matching as proof. Use isolated databases and cleanup by exact harness-owned names; never force cleanup or run shared db:reset/supabase:reset as a feature-specific shortcut. Test failure/missing runtime is failure, not a skip-green.

Existing tools/run-feature-010-postgres-test.mjs and tools/run-feature-010-completion-authority-concurrency-test.mjs demonstrate real sessions, barriers and privilege assertions; reuse their structure without altering historical evidence. tools/run-native-clinical-composition-test.mjs establishes the native/browser module-resolution pattern.

## Ordered parity and producer evidence stages

The recovered [Plan §6.1](plan.md) owns P1–P7; these are dependency descriptions, not new checkpoint IDs. C01/C02/C02A history and C03 RED are preserved pending revalidation. No C02B/C03/T017 implementation is authorized and no historic completion transfers automatically.

| Stage | Validation / expected result | Fail-closed limit |
| --- | --- | --- |
| P1 generated public parity | Inspect seven unchanged operation/method/path/header/closed DTO definitions; later run both generators/checks and legacy C02 regressions; repeated generation must have zero-byte diff | No physical or handoff acceptance |
| P2 canonical parity | Check approved ARTIFACT/1 text/profile/vector/registry hashes; fixed V01–V07 positive bytes/hash and negative inputs; C02A metadata regressions | No encoder, material resolver or SQL proof |
| P3 handoff parity | Current closed handoff, BODY/AAD/allocation vectors and model/governance/recovery decision hashes must be bound in data-only generated metadata; stale/missing/inconsistent inputs fail | NOT implemented by existing C02A verifier; later authorized metadata work required before SQL consumers |
| P4 synthetic physical proof | Full baseline plus additive chain, roles/RLS/grants/functions, canonical exact bytes/hash, opaque five-field envelopes and allocation/lineage/authority races in BOTH runtimes | Synthetic structure/storage is not AES-GCM or evidence-port acceptance |
| P5 owner/stage assertion | Default/full verifier requires accepted current P1–P4 evidence and separate applicable stage disposition | OPEN-TECH-002 stays OPEN; no global closure or demand for later real-producer proof |
| P6 real producer/composition | Exact immutable Evidence Port material SHA-256/reference association; AES-GCM/AAD/key-version/context/tamper/random nonce/intended plaintext; real producer -> prepared SQL in BOTH runtimes | No production KMS/content/clinical/legal readiness |
| P7 SQL/core equivalence | Later pure-core encoder against SAME ARTIFACT/1 fixed vectors; compare actual SQL/core canonical bytes and SHA-256 in BOTH runtimes | No private serialization or implementation-generated expected vectors |

The current tools below exist as C02/C02A/partial C03 work. Their existence does not establish readiness for changed inputs. The existing contract verifier does not implement trusted-handoff parity; its legacy contracts-only PASS cannot accept P3. Default/full must remain fail-closed while current physical evidence is absent. Future accepted metadata work must extend verification before any physical consumer.

Later authorized P1/P2 preparation commands:

```powershell
node tools/generate-feature-011-contract.mjs
node tools/generate-feature-011-client.mjs
node tools/generate-feature-011-contract.mjs --check
node tools/generate-feature-011-client.mjs --check
node tools/verify-feature-011-contracts.mjs --contracts-only
```

Repeat both generators and compare zero changed bytes. Generation/checks and contract regressions belong to later checkpoint execution/revalidation, not this recovery. The metadata binding includes fixed-input hashes only; it never generates an encoder or replacement expected bytes.

After P3 acceptance and explicit physical authorization, the existing harnesses accept red/green positional modes and iterate BOTH runtimes; they do not accept the old proposed --runtime syntax:

```powershell
node tools/run-feature-011-postgres-test.mjs red
node tools/run-feature-011-concurrency-test.mjs red
node tools/run-feature-011-postgres-test.mjs green
node tools/run-feature-011-concurrency-test.mjs green
```

Revalidate/finish the preserved drafts before these runs: a RED capture success means the intended missing behavior was observed, not GREEN acceptance; missing/syntax-broken fixtures are invalid RED. Both harnesses must apply the full baseline plus additive chain, initialize correct table/function owners, provision synthetic authority/evidence facts and inspect pg_roles/RLS/grants. Store outputs under evidence/implementation with current input/generated/migration/fixture hashes, runtime/toolchain, commands, assertions and redacted barriers. Never inject actual raw evidence material/keys into SQL negatives; service-boundary negatives reject before DB invocation.

At the later separately authorized P5 stage, node tools/verify-feature-011-contracts.mjs and scope/trace checks must reject missing/stale/failed/unaccepted evidence. Scope text/hash checks do not prove required approver roles; the authoritative dated gate record remains separate. No command in this guide closes a gate by itself.

## Fixed artifact, BODY/AAD and allocation checks

SQL constructs ARTIFACT/1 canonical bytes using normalized facts/trusted evidence hashes; it never hashes external material. Execute V01–V07 exact fixed bytes and SHA-256 in both runtimes, including initial N, field 8, successor UUID, future-effective facts, Unicode/NFC/NFD preservation and six UTC microseconds. Reject malformed facts and declaredDigest mismatch. Never regenerate expected outputs from SQL/core.

Verify exactly body_contract_id/body_key_ref/body_nonce/body_ciphertext/body_auth_tag, NOT NULL typed text/text/bytea/bytea/bytea; exact BODY/1 ID, nonce 12, ciphertext nonempty, tag 16. SQL stores opaque structure only; actual immutable versioned keyRef and AES-GCM authentication are P6. Private keyRef never leaks to DTO/log/audit/receipt/outbox. No plaintext body, raw evidence material, key, algorithm agility or free-form AAD storage is allowed.

At P6, independently consume the fixed AAD positive/negative vectors. Prefix SHIFAA-F011-PROTECTED-AAD/1; then five UTF-8 octet-length S frames in resourceType/resourceId/fieldId/artifactVersion/keyRef order. workflowVersion is excluded; the context reconstructs from persisted ID/version/keyRef plus constants. Prove wrong release/version/key/context/body/tag and tamper fail; plaintext corresponds to the intended immutable content. Instrument real evidence/KMS/network calls to prove all occur before write locks.

Candidate releaseId precedes protection. initial=1; successor=authoritative predecessor.artifactVersion+1. SQL must reject stale/incorrect candidate equality atomically after locked revalidation; distinct competing drafts may share a version under different IDs. No next_artifact_version allocator or unique(series_id, artifact_version) draft ordinal survives. Published-root/successor constraints remain. Rejected attempts require fresh ID/nonce/envelope outside locks; committed replay and commit-unknown recovery must not produce a second release/encryption.

## Independent-session database scenarios

Use separate physical DB connections A/B/C, explicit barriers and pg_locks checks; no time-delay-only proof or in-memory mutex. Assert SQLSTATE/API problem, durable row/evidence/receipt counts and exact immutable digest/version after every race in **both** runtimes.

| Scenario                          | Controlled schedule                                                                         | Required outcome                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Allergy version race              | A/B verify the same current If-Match with distinct keys                                     | One appended revision; one version-conflict; prior rows unchanged                                            |
| Duplicate mutation                | A holds claimed key; B submits same principal/action/key/body                               | One effect; B returns original result after commit or canonical in-progress; no extra event/signature        |
| Key binding conflict              | Replay with changed body, path, If-Match or selected facility/encounter                     | idempotency-key-reused; original effect unchanged                                                            |
| Replay after later revision       | Commit first result then mutate current resource with new key                               | First key returns original encrypted snapshot/version/status, not current row                                |
| Replay after lost authority       | Revoke care/grant/consent/session before replay                                             | Denial without original clinical body; no second mutation                                                    |
| Authority revocation first        | A updates membership/license/designation/grant/approval status; commit before B check       | B sees revocation and denies; no new evidence/publication                                                    |
| Authorized action first           | A locks current authority FOR SHARE; B attempts non-key status revocation                   | Observe B blocked on conflicting row lock; A commits checked effect, then B commits revocation; record order |
| Signature workflow race           | Two distinct eligible roles sign same workflow ETag                                         | One CAS success/one conflict; reload then second signature binds same artifact, not mutable workflow         |
| Signature substitution            | Wrong person/role/credential/designation/version/digest or same creator/dual-role person    | No accepted approval/publication; exact historical signature unchanged                                       |
| Publish versus revocation/signing | Hold candidate/series and authority/signature locks; reorder revocation or second signature | No publication without both current matching independent approvals; no torn outcome                          |
| Initial publication race          | Different fully signed initial drafts, absent published root                                | Advisory series guard/unique root yields one root; other conflicts                                           |
| Successor publication race        | Two drafts target same currently applicable predecessor/scope                               | One accepted successor; reject second even when first future-dated                                           |
| Time/lineage boundaries           | Before/at future effective instant; stale/cross-series/cyclic/equal-date predecessor        | No early eligibility; only one applicable chain; invalid links denied                                        |
| Allocation/protection race | Preflight predecessor then change authoritative lineage/version before locked admission | Atomic rejection with no partial effects; later retry uses fresh ID/nonce/envelope outside locks |
| Competing draft versions | Two distinct initial or same-predecessor drafts | Shared lineage-relative version permitted under distinct release IDs; only one published root/successor |
| Committed replay versus retry | Lost response/unknown commit, duplicate key and changed workflow | Resolve recorded result/current authority first; no second encryption/effect; internal randomness is not public request hash |
| Transaction fault                 | Inject failure between domain/evidence/outbox/receipt steps; disconnect after commit        | Before commit: zero partial effects; after commit: exact one-effect replay                                   |
| Restore and rollback              | Restore populated history/receipts; fresh separately signed superseding rollback            | Digests/lineage/counts/RLS/replay survive; no old signature reuse or ancestor reactivation                   |

Native Auth dependency tests run at the API boundary using supported verification, not direct auth.sessions edits or synthetic JWT role authority. The database race tests cover authority facts stored in the canonical DB; no claim to distributed atomic session revocation is made.

## RLS, contracts and API acceptance

Connect as actual non-owner/NOBYPASSRLS execution role and shifaa_api, not harness owner. Verify ENABLE/FORCE RLS, no PUBLIC direct EXECUTE, minimum entrypoint grants, and deny direct tables/helper spoofing/anon/authenticated/service_role access. A table owner/BYPASSRLS result cannot certify RLS.

Exercise every AC-01–16 from spec and plan §6. Assert GUA/DEL authorized read/denied create, cross-patient/facility denial, current clinician transitions/error correction and known/unknown provenance. For each content operation exercise wrong/expired/grantless/AAL1/purpose-less contexts, separate ADM/signing authorities and complete initial/future/supersession history.

Check closed clinic status serialization at SQL, API, client and UI: no draft/unsigned row, content body, evidence references, signer identities or mutation/admin controls. An explicitly scoped reviewer may inspect only its assigned artifact and signs without ADM-MEDICAL. Missing real admissibility/gate approval remains unavailable. Use neutral artifacts such as SYNTHETIC-CONTENT-A and opaque synthetic evidence; no diseases, treatments, severity thresholds, warnings or drug rules.

Contract verification must resolve all local refs, validate request/response/Problem shapes and generated client parity, method/path mapping, required Idempotency-Key/If-Match and cursor scoping. Do not run only manifest counts and call schema/RLS parity complete.

## Bilingual, degraded, redaction, performance and recovery

Capture live Arabic/English read/report/verify/review/publish/status journeys on approved compositions, including offline/no queue/reconnect original-receipt reconciliation, stale conflict, focus/announcements/scale/reflow/contrast/targets/reduced motion. Native Node ESM resolution and browser/native rendering must both pass. Preserve OPEN-UX and formal reference-environment limits.

Insert synthetic clinical-text/token/signature-secret sentinels and inspect permitted audit attribution versus logs/events/URLs/analytics/evidence; prohibited values never appear. Mutation rollback leaves no partial outbox/evidence. Worker redelivery cannot repeat publication.

Record proposed engineering workload of 10,000 synthetic allergy assertions with revision histories, 1,000 synthetic release artifacts across separate series and concurrency 1/10/25. These are disclosed test inputs, not clinical or formally approved reference datasets; owner-approved formal workload/equipment belongs to OPEN-TECH-003. Measure both reads and all five mutation operations, separately report p95 ≤400/800 ms targets excluding vendors, counts/conflicts, date/runtime/network. Do not hide contention failures or claim real regional performance from local runs.

After populated upgrade/restore compare original/version/signature/digest/lineage/receipt counts and RLS/grants. Reserve future successors and test rollback conflicts. Retention classes/holds remain canonical and no production deletion duration is invented.

## Existing repository gates for eventual delivery

These commands exist today; run at the appropriate later authorized verification stage, not during Plan:

```powershell
corepack pnpm contracts:check
corepack pnpm architecture:check
corepack pnpm secrets:check
corepack pnpm test:pre-011:integration
corepack pnpm verify
```

The full verify includes shared database reset and broad feature checks; coordinate the approved verification environment first. Preserve first failure and unrelated generated evidence according to repo policy. Require local green plus live AR/EN, then feature-branch PR and current required checks; stop for Product Owner squash merge. Plan alone satisfies none of these runtime/integration gates.

Deferred installation-checklist and roadmap progress updates are maintenance later; no frozen ownership/scope changes or premature Feature 011 completion. Stop after the authorized lifecycle phase.

## R2 protection/disclosure/atomic receipt evidence extension

No commands run during recovery. P3 must bind current [disclosure](contracts/artifact-review-disclosure-v1.md), [allergy](contracts/allergy-protection-v1.md)/[profile](contracts/allergy-protection-v1.json)/[vectors](contracts/allergy-protection-v1-vectors.json), [receipt](contracts/mutation-receipt-v1.md)/[profile](contracts/mutation-receipt-v1.json)/[vectors](contracts/mutation-receipt-v1-vectors.json), model and R2 decision through the current [foundation parity](contracts/verified-evidence-binding-parity-v1.json) before physical consumers. The old [R2 protection parity](contracts/plan-protection-parity-r2.json) is an immutable historical input with superseded hashes. Fixed new vector plaintext/AAD bytes are independent design reference inputs, not generated by an encoder under test. Existing ARTIFACT and release BODY/AAD positives remain frozen/unchanged.

P4 synthetic physical proof in BOTH runtimes adds exact facts/reason column/nullability/structural envelope checks, immutable allergy allocation/CAS/history, receipt/obligation typed fields/FKs including composite audit FK, deferred commit denial without final receipt/completed idempotency/audit/outbox, wrong-tuple finalization, forced RLS/grants and no raw evidence SQL input. Synthetic opaque envelope acceptance is never AES-GCM/evidence-port acceptance. Existing RED drafts are retained but must be revalidated/extended under later authorization, not silently declared current.

P6 real producers add exact allergy facts/reason canonical UTF-8 bytes, six-field AAD, correct preservation/corrections/source/unknown and fresh revision/nonces; real receipt twelve-field AAD/schema-exact response/body/header/status and locally prepared capability. For EACH of five mutations, inject serializer/local encryption/finalizer failure after SQL domain work and prove rollback of domain, audit, outbox, receipt and idempotency in both runtimes. Trace zero external KMS/network/evidence activity under locks, permit bounded local receipt AES-GCM only. Inspect capability cleanup on success/error/timeout, nonce/context/key/tag tamper and receipt substitution across each AAD field. Domain-body/facts protection remains outside locks.

Authorized artifactReview tests cover exact UTF-8/Arabic/control/combining values, wrong/missing/substituted immutable reference/digest, unauthorized reviewer, wrong release/purpose/AAL/signing-only authority, clinic projection with zero resolver/decryptor calls, and prohibited sinks. Required create/publish response review is prepared before locks and encoded in dedicated encrypted canonical receipt only. Replay after newer workflow returns original bytes/status/headers, reauthorizes and re-verifies original review integrity without rebuilding a response; missing evidence/key/current authority denies.

Concurrency adds actual predecessor facility writer, F007 transition relationship/patient/person and F010 completion races against [exact lock ranks](data-model.md), not synthetic reordered writer substitutes. Capture independent-session pg_locks/barriers and revocation/action linearization. No claim a losing concurrent preflight performs zero encryption: prove no losing effect committed; rejected retry uses fresh ID/nonces/envelopes; known committed replay performs zero encryption. Commit-unknown DB failure/ongoing transaction is not absence; establish a settled authoritative scope before any fresh mutation.

Client X-Role/X-AAL/body/JWT spoof tests and unauthorized direct SQL are separate from trusted repository setting verified request-local GUC context. GUCs are not cryptographic authentication; non-owner/NOBYPASSRLS execution and minimum grants remain mandatory. P5 asserts accepted current P1–P4 only, P6 then proves real producer composition; P7 later SQL/core ARTIFACT equivalence remains unchanged. No backwards/circular acceptance is introduced.

## Plan-level recovery and formal approvals

Only document/schema/vector/hash/contract-boundary checks and a fresh architecture/data review run during recovery; none is runtime acceptance. The prior Plan approval is suspended; affected-UI Plan remains unapproved because OPEN-UX-001 requires Product Owner + Design Lead and no Feature 011 Design Lead approval/designation is recorded. OPEN-TECH-002 remains OPEN and current physical/generated acceptance pending. OPEN-CLIN-001, OPEN-TECH-003, OPEN-UX-002 and applicable legal gates preserve their owners/restrictions. Preserve synthetic-only fixtures and excluded Feature 012 behavior. Do not regenerate Tasks until independent review and explicit subsequent authorization.

Historical R2 readiness was BLOCKED by [R2-SD-04](evidence/plan-recovery-r2-self-debate.md); current shared foundation supersedes that incomplete architecture. No commands here authorize execution while Plan recovery is open.

## Current evidence-foundation preparation and acceptance

P3 freezes [shared contract/profile/vectors](contracts/verified-evidence-binding-v1.md), [current parity](contracts/verified-evidence-binding-parity-v1.json), model and [complete matrix](evidence/plan-recovery-evidence-foundation-matrix.md) before physical consumers. Legacy C02/C02A cannot accept new metadata. Existing R2 parity/matrix are historical inputs, not current hashes/authority. No tooling/implementation run during recovery.

P4 BOTH runtimes: typed columns/nullability/stable-ID authority FKs permitting updates/exact artifact composite FKs, reciprocal clinical signature/revision completeness, three material rows, one-use evidence identity, immutable snapshots, RLS/non-owner/grants/functions. Consume fixed VE shapes and S/Q/D/A/B/M/C/P/T/I cases as independent design expectations. Synthetic tuples prove storage/admission/current facts, NOT real signature/clinical/source authenticity.

P6 real producers: approved source schema/authenticity/correlation/reference, wrong/missing/unavailable/substituted source, locked full credential/designation/grant field/version comparison, same-ID advanced versions/unrelated replacements deny, historical snapshot unchanged, valid rejected-decision binding, exact-artifact vs broad scope admission, allergy support existence/patient/assertion/attestor/head/target/single use. No new professional verification journey. Real coding absence rejects new known and accepts explicit unknown; preserved known history is not fresh validation; synthetic cannot enter real mode.

Both-runtime independent sessions/barriers/pg_locks: revoke/version update after preflight, one-use source/support contention, approval update/revoke vs publish, multiple eligible admission ambiguity, missing sidecar/binding reciprocal commit denial, FK parents acquired before audit, resolver/provider failure before locks, original receipt replay without retrovalidating history. Assert durable counts/full tuple, not syntax only.

Named private wrappers: CreateReleasePhysicalPreparation={handoff,materialBindings}; VerifyAllergyPhysicalPreparation={protectedRevision,verifiedEvidence}. No public/HND/BODY member expansion. All-five atomic receipt faults/crashes and P7 fixed ARTIFACT equivalence unchanged. P5 stage assertion cannot accept P6 or globally close TECH002.

Fresh Tasks remain prohibited until formal recovered-Plan approval AND explicit Tasks authorization. C01/C02/C02A/C03 RED preserved pending revalidation; UX001 lacks required Feature011 Design Lead evidence; all other gates unchanged.
