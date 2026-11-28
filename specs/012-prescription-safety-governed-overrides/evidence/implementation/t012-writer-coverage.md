# T012 participating-writer coverage

[Issue #523](https://github.com/YousefE1bana/shifaa-project/issues/523) and [draft PR #614](https://github.com/YousefE1bana/shifaa-project/pull/614) retain this investigation. The [source inventory](writer-inventory.json) pins the source locations and the [execution receipt](t012.json) binds the disposition. The expanded catalog reads the actual disposable PostgreSQL schema after the 38 sealed F011 migrations and T009. It records relation owners and forced-RLS flags, policies, triggers, effective role privileges, and deployed routine owners, execute grants and definition hashes. A textual helper reference is a review clue. The order of actual locks requires a two-session test.

## Writer paths and required successor behavior

| Writer family                                                                        | Effective write path and ordering                                                                                                                                                                                                                                                                                                                                                                                                           | Required coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F011 allergy creation and head correction                                            | Core API invokes `clinical.create_allergy_api_v1` and `clinical.verify_allergy_api_v1` as `shifaa_api`. The effective definers are `shifaa_f011_executor`. Creation takes the F011 mutation scope and inserts the head/revision. Correction locks the existing head before changing the current revision.                                                                                                                                   | T013 must acquire exclusive rank-zero admission before F011's own locks and atomically advance the patient allergy generation, including empty-to-first insertion. Self-reported first insertion and clinician verification of an existing head are RED in both orders. The later [native allergy runs](#f011-allergy-verification-and-correction-over-native-http) cover predecessor clinician creation and correction. Those predecessor HTTP runs leave additional T012 admission-order assertions open. T013 owns correction and GREEN proof. |
| F011 content creation, signatures, publication, supersession and current eligibility | Core API invokes `clinical.create_clinical_content_release_api_v1`, `sign_clinical_content_release_api_v1` and `publish_clinical_content_release_api_v1` through the F011 executor. Publication takes the mutation scope, series advisory lock, series row, then ordered release rows. `f011_release_current_eligibility_v1` reads current inputs.                                                                                          | T013 must fence writes that affect catalog membership, current published head or eligibility, advance the declared catalog generation, and retain the separate action-time deadline check. Both orderings remain unexecuted.                                                                                                                                                                                                                                                                                                                      |
| F011 governance, designation and admissibility                                       | The offline evidence provisioner opens a dedicated transaction under its owner path. Governance changes take versioned row locks. Admissibility provisioning locks the series before the release. The effective F011 trigger functions are owned by the F011 executor; execute privileges and role-level DML are recorded separately.                                                                                                       | T013 must admit or quiesce offline paths and bind each authoritative current change to the affected catalog. The upstream approval authority and per-writer races still require verification.                                                                                                                                                                                                                                                                                                                                                     |
| F010 encounter, appointments, participants and queue                                 | Core API enters the encounter wrappers and appointment/queue routines as `shifaa_api`. The catalog shows `supabase_admin` definers. The create and complete inner encounter routines are owner-only entry points reached through their wrappers. Completion locks appointment, queue then encounter. Reschedule locks the prior appointment before its successor writes.                                                                    | Encounter creation, completion, participant interval closure, independent appointment cancellation and queue call are RED in both orderings. T013 owns correction. Other participant, appointment and queue transitions remain open.                                                                                                                                                                                                                                                                                                              |
| Identity onboarding, binding and verification                                        | `platform.register_identity_onboarding` is a Core API-executable `supabase_admin` definer. The identity adapter uses the same repository transaction for onboarding and its audit. The profile and verification paths also use DML on `identity.people`, `identity.identities` and `identity.verification_cases`. Verification changes can affect recovery eligibility.                                                                     | Onboarding is RED in both orders. T013 must acquire exclusive admission before the first relevant person, patient or self-relationship write and retain it through audit and transaction end. Other identity writes still need predicate and ordering proof.                                                                                                                                                                                                                                                                                      |
| Family relationships and consent                                                     | `shifaa_api` has insert/update privileges on the relationship and permission tables under RLS, and append privileges on `consent.records`. The family adapter locks the relationship before persisting relationship and permission changes. The only located callers of `setInventory` are tests. The catalog shows that `shifaa_api` lacks UPDATE on `consent.processing_inventory`. Migration and owner paths can change inventory state. | T013 must fence relationship grants and losses, current consent changes and applicable purpose-policy changes, including previously absent predicates. Delegation acceptance, delegation revocation and the representative consent append are RED in both orderings. Other variants, exact purpose predicates, and the processing-inventory owner paths need disposition.                                                                                                                                                                         |
| Workforce, facility, licence, role and scan state                                    | The facility adapter uses one transaction with existing facility, professional/facility licence, membership and administrative role locks. `shifaa_api` holds the corresponding RLS-constrained DML grants. Evidence status enters through `identity.private_evidence_objects`.                                                                                                                                                             | T013 must fence applicable authority grants/losses and source eligibility changes ahead of those locks, including evidence scan and maintenance paths. Effective-date changes due to the clock need fresh checks. Workforce membership termination is RED in both orders. External scan writers and remaining writer races are open.                                                                                                                                                                                                              |
| F007 local continuity and recovery                                                   | The Core API continuity adapter writes case/restriction changes in repository transactions. Dependent transition definers are Core API-executable. The worker-only `platform.purge_expired_continuity_decoys` also expires qualifying recovery cases before deleting old decoys.                                                                                                                                                            | Worker expiry and Core API recovery restriction staging are RED in both orders. T013 must account for both the Core API and worker paths, including case creation and restriction changes, ahead of current F007 idempotency and row locks. Native account effects follow NAC-1. Other local paths remain unexecuted.                                                                                                                                                                                                                             |
| F012 roster and current reviewer authority                                           | F012 roster provisioning and revocation are future write paths in the [accepted task ledger](../../tasks.md). Current F011 governance, facility, role and workforce sources have the predecessor paths above.                                                                                                                                                                                                                               | T013 owns the fence composition. T015 owns roster implementation and generation/CAS rules. Actual future roster grants and races require their owning tasks.                                                                                                                                                                                                                                                                                                                                                                                      |
| Projection and withdrawal                                                            | The accepted model has a same-transaction sign/release path and a restricted offline policy/grant/withdrawal path. The F012 product write paths are absent on this baseline.                                                                                                                                                                                                                                                                | T013 must ensure admission composition and maintenance quiescence. T055–T058 own the later projection schema and writer proofs, including current grant/policy loss.                                                                                                                                                                                                                                                                                                                                                                              |
| P3 prescribed statements                                                             | The accepted producer is successful F012 sign. The installed predecessor chain has no such product writer. Cancel and supersede do not rewrite the prescribed statement into an externally sourced medication status.                                                                                                                                                                                                                       | T013 must preserve the generation contract and T038/T039 own the later P3/sign implementation and proof. Unknown or later producers stay outside admitted membership.                                                                                                                                                                                                                                                                                                                                                                             |
| Native Auth                                                                          | The SQL-only migration run has `auth.users` and `auth.refresh_tokens` but lacks the GoTrue-managed native session and MFA tables. [NAC-1](../../contract-amendment/native-authority-nac1-successor-v0.1.0.md) binds actual native user/session/factor operations and the separate row conflicts.                                                                                                                                            | T010/T011 own pinned-native cases and transaction retention. Native writers do not participate in the application admission fence.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Offline provisioning, restore and maintenance                                        | The inventory includes the F011 owner provisioner, physical fixture loader, backup/restore entry and native maintenance boundary. Owner and superuser privileges cannot be excluded by a Core API-level lock convention. The expanded run performed no retained restore or maintenance.                                                                                                                                                     | T013 must compose admitted online/offline writers or require drained maintenance under the approved model. Restore needs fresh admission and separate evidence from the later recovery tasks. Unclassified operator paths block the affected capability.                                                                                                                                                                                                                                                                                          |

## Investigation disposition

The catalog is verified at the disposable baseline. Onboarding and F007 worker
expiry are observed RED in both orders. The worker could commit a case expiry
while an independent transaction held admission. In the reverse order, the
admission transaction could commit while the expiry was still uncommitted. The
worker rollback preserved the restricted case and its version. The Core API
role received `42501` from the worker function and left the case unchanged.
T013 owns fencing this worker path while preserving its existing role boundary.

The focused runs reproduced RED in both orders for twelve more paths. Each
contender used a different backend and the admission-versus-admission control
returned `55P03`. In writer-first trials the independent session acquired and
committed admission while the writer stayed open. Its rollback restored the
original visible state. In admission-first trials the following effects committed
while the admission holder stayed open.

| Installed writer                                                                 | Committed effect                                                                                                          | Role or context negative                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Family delegation revocation                                                     | Relationship from `active` version 2 to `revoked` version 3                                                               | An unrelated person updated zero rows                                  |
| Consent append for the installed `care_updates` purpose                          | Original grant at version 1 and appended withdrawal at version 2                                                          | An unrelated person received `42501`                                   |
| F011 patient's first self-reported allergy, with its protected receipt finalized | Counts of the head, revision and outbox event changed from `0/0/0` to `1/1/1`                                             | An unrelated person received `42501` and committed none of the effects |
| F010 encounter participant interval closure                                      | Encounter and participant versions advanced from 1 to 2, the interval closed, and one `encounter.updated` event committed | An unrelated clinician received `P0002` and wrote nothing              |
| F010 encounter completion                                                        | Encounter, appointment and queue completed with one audit, outbox and idempotency record                                  | An unrelated clinician received `P0002` and wrote nothing              |
| F011 clinician allergy verification and head replacement                         | Head and revision advanced to version 2 with `clinician_confirmed` and a second outbox event                              | An unrelated clinician received `42501` and wrote nothing              |

The family delegation acceptance activated the installed permission predicate and committed its audit and outbox together. An unrelated invitee matched zero rows. Writer rollback preserved the pending invitation, the false permission predicate, and zero effects. T013 owns both orderings.

Independent appointment cancellation advanced a confirmed appointment to cancelled version 2 and committed one audit event, one outbox event and one idempotency record. An unrelated clinician received `42501`. The initial state and zero effect counts survived writer rollback. T013 owns the correction for both orderings.

Independent queue call committed the called state, audit, outbox and idempotency while admission was held. Independent encounter creation committed the appointment and queue transitions, the encounter and its participant, and all three receipts while admission was held. In the reverse order, admission acquired the fence while each writer stayed open. Each rollback preserved the initial state and zero writer effects. Both unrelated-clinician calls received `42501`. T013 owns correction and rerun of both orderings.

The workforce termination upsert and the F007 recovery restriction update both ran as the Core API role against the installed forced-RLS policies. Workforce termination committed the ended membership at version 2. F007 staging committed `mfa_enrollment_only` at version 2. In each writer-first trial, rollback preserved the original record. An unrelated person was denied by workforce RLS and matched zero recovery rows. T013 owns the correction of both writer paths.

The first F010 trial stopped at the treating-clinician authorization check with
no ordering result. The retry seeded the appointment in consultation, reached
the installed writer, and confirmed both failures. In the writer-first trial,
the independent observer saw the original versions, open participant interval
and no outbox event after rollback. The completion run used a legal queue
transition and a pre-provisioned synthetic audit partition. The allergy
verification run used a verified synthetic facility licence and finalized its
protected receipt in the writer transaction. T013 owns correction and rerun
of both independent-session orderings for each writer.

The consent result establishes the behavior of the installed append mechanism
for the tested purpose. Coverage of the exact F012 consent purposes remains open.
Other family grant and loss variants, allergy correction variants beyond
clinician verification, clinician creation and the content release lifecycle
also require their own trials. The
[execution receipt](t012.json) records the command outcomes and hashes of the
original files, including unsuccessful fixture and resource admission attempts.

Remaining installed writers require valid synthetic transactions, independent
sessions and effective path attribution. The accepted task ledger assigns
prospective writers and their runtime tests to their owning tasks. T012 stays
open for incomplete discovery. Its pre-fix evidence preserves these cases as
RED. T013 owns correction and both-direction regression proof. The F012
capabilities that depend on writer admission remain disabled.

## Static reconciliation on 2026-11-24

The receipt accounts for fourteen RED writer paths in both orderings.
The family-and-consent entry records separate delegation-revocation and consent
append trials. The catalog and these results retain their original revisions.
All 24 indexed original receipt files matched their recorded sizes and SHA-256
values. The historical recovery bundle verifies against its recorded
prerequisites and retains the earlier T010, T011 and T012 revisions.

The facility evidence upsert in the PostgreSQL adapter and the in-memory
`releaseEvidenceForSyntheticScanner` hook are separate source paths. The
integration fixture uses a separate owner update to seed a released evidence
row. These source findings establish neither a deployed scanner identity nor
its admission, owner-path quiescence, or runtime lock ordering. The
`setInventory` adapter update names a processing-policy write, while the
recorded application-role catalog lacks its UPDATE privilege. Assign no
effective production writer solely from either reference.

The installed-writer matrix, exact purpose and lifecycle variants, external
scan and approval attribution, offline/maintenance exclusion and restore
admission remain open. T012 records test and inventory inputs for repair.
T013 still requires accepted T011 and T012, performs the fence correction, and
owns the corresponding two-order GREEN proof. No further runtime result was
added by this reconciliation.

## Outstanding test assertions and owners

The [F003 persistence compatibility candidate](../../decisions/f003-workforce-persistence-successor-v1.md)
verified combined owner/clinician termination and valid omitted-specialty
creation on the exact corrected runtime. Independent readback verified one
mutation effect per accepted request, an unchanged protected licence during
termination, and unchanged denial of F010 completion after authority loss.
These observations are pending successor integration. The sealed control
failure receipts, remaining workforce assertions including #642, and the
original admission-order evidence retain their dispositions.

The retained receipt is the original runtime result. The subsequent
[authenticated Core API consent receipt](t012-deployment-attribution-disposition.md#2026-11-27-authenticated-core-api-consent)
verifies the installed consent writer and withdrawal through their existing
routes. The assertions below track the remaining predicate and writer cases.
Use the [effective writer manifest](t012-effective-writer-manifest.md) for
source and installed-role attribution and the
[approved deployment disposition](t012-deployment-attribution-disposition.md)
for the target and operator scope. The [sealed-chain application observations](#sealed-chain-application-observations)
record the latest results against the five open rows.

| Boundary                                  | T012 requirement and evidence before acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Later acceptance checkpoint                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F011 allergy and current content          | Under AC-02, AC-10 and AC-14, attribute each installed write that changes the current allergy head, current release, admissibility or designation, and exercise the distinct pre-fix invalidation paths. Installed allergy lifecycle, publication, supersession, and expiry have functional readback. The offline fixtures prove the recorded synthetic designation and admissibility actions. Actual independent source/governance approval and its executor are unobserved. Finish the remaining in-scope pre-fix observations and record the exclusion for any unadmitted issuer or hosted entry point.                                                                                                                                                                                                                                | T013 composes admission and atomic generations and proves both-order GREEN. T025 proves producer-internal current heads, eligibility, complete coverage and revalidation.                                                                                                                                                                                             |
| F010 encounter, appointment and queue     | Attribute the exact create, update, complete, appointment and queue writers and their actor/interval/facility/appointment predicates under AC-02 and AC-10. The linked-care and appointment-link sections record installed observations. The called queue with mismatched scope is a historical SQL fixture variant. Its fixture disables user triggers. It has no installed HTTP verdict or admitted setup that preserves those triggers. The sealed surface provides responsible participant insertion on create and exact interval closure on update. The consulting participant insertion used only a fixture. Finish distinct pre-fix invalidation cases for the installed writer entries.                                                                                                                                           | T013 proves admission before the existing ranks and rollback. T025 proves the exact F012 transaction-time care consumer.                                                                                                                                                                                                                                              |
| Family, purpose and consent               | Under AC-02, AC-10 and AC-14, account for installed family/permission writers, effective intervals, the consent append and purpose/processing-policy writes. Authenticated consent grant and withdrawal, F004 intervals, and post-approval evidence-loss observations are recorded. The remaining deployment fact is an authorized post-bootstrap processing-inventory or purpose writer, or its evidenced exclusion. Finish distinct pre-fix invalidation coverage for the installed writers.                                                                                                                                                                                                                                                                                                                                            | T013 owns writer participation. T017 owns the guard transaction and lock order. T025 owns current producer capture/revalidation and the distinction from historical consent. T026 and T039 own the current-authority effect at create/edit/check and separate sign, respectively.                                                                                     |
| Workforce, licence and scanning           | Attribute installed membership, licence, facility and evidence-status writers and exercise distinct authority or eligibility loss under AC-02, AC-10 and AC-14. Approved fixture release/rejection and installed review, suspension and termination evidence are retained. Bound invitation and acceptance remain outstanding ([F003 #642](https://github.com/YousefE1bana/shifaa-project/issues/642)). Valid omitted-specialty creation and the combined owner/clinician termination have separate F003 defect records ([#644](https://github.com/YousefE1bana/shifaa-project/issues/644), [#643](https://github.com/YousefE1bana/shifaa-project/issues/643)). D2 excludes external scanning from admitted capabilities. Finish distinct pre-fix invalidation coverage and preserve time-driven credential loss as a separate predicate. | T013 owns composition and both-order GREEN. T025 owns current producer-internal workforce/facility evidence capture and revalidation.                                                                                                                                                                                                                                 |
| F007 continuity and privileged operations | Under AC-02, AC-10 and AC-14, account for installed local restriction activation, release and expiry, and the actual entry points and ownership for provisioning, maintenance and restore. Gateway and mail-backed HTTP receipts cover the synthetic local transition. The disposable worker receipt covers a completion message. The target lacked a scheduler and the external trigger is excluded. T002 establishes the isolated restore target and D4 records approval and delegation. Any actual post-bootstrap privileged invocation still needs an exact attributable entry, role and scope or an evidenced exclusion. Finish distinct pre-fix local restriction coverage where it is safe to execute.                                                                                                                             | T010/T011 own native-authority locking and adapter proof. T013 owns admission drain/re-enable and generation composition. T084 owns restore/readback, history preservation and fresh-epoch re-admission.                                                                                                                                                              |
| Future F012 writers                       | T012 inventory records the planned writer, affected predicates and exclusion from installed coverage under AC-02, AC-10 and AC-14. These assertions remain unexecuted against F012 implementations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | T015 proves roster import/revocation. T038/T039 prove P3 schema and the atomic sign producer. T055 establishes projection schema and retains the separately fenced offline policy/grant writer. T056 owns policy, T057/T058 prove online release/withdrawal and sign-time release, T059 proves affected authorized reads, and T063 is the independent US4 checkpoint. |

[T012 and T013 in the accepted task ledger](../../tasks.md#phase-2--foundational-authority-transactions-and-protection)
and the [consolidated Plan §3](../../contract-amendment/plan-closure-consolidated-v0.2.0.md#3-single-sourcetransactionlinearization-contract)
set the sequence. T012 compares the effective grants, policies, functions and
triggers with the inventory and covers existing source/local-authority
invalidation against exclusive admission with independent sessions and real row
conflicts. Preserve the historical RED for both orderings. Record the effective
role and entry point, exact predicate and affected generation scope, and applicable
rollback, audit, outbox and idempotency observations. Identify unavailable
observations and show that unknown or bypassing writers keep affected reliance
disabled. The existing functional receipts cover the assertions stated in those
receipts.

T013 depends on accepted T011 and T012. Its correction, drain and both-order
GREEN, and the downstream runtime checkpoints listed above, remain mandatory at
their owning tasks. The accepted ledger does not require those later runtime
outcomes at T012. The five existing writer rows remain open for the T012 work in
the middle column.

The [F003 omitted-specialty candidate](https://github.com/YousefE1bana/shifaa-project/issues/644)
returned 201 on create and same-key replay. Installed readback found SQL NULL
and one audit, outbox and completed idempotency row. Revision
`4a37f1f574837249539a2702c8819159e2285e1b`, run
`ce8dea59-9402-42f1-837c-aeaf37dccaa6`, original receipt SHA-256
`6aff4209bde7535892aed0061643d547837c40b268fb14d282204b947dc820db`.

The [F003 owner/clinician termination candidate](https://github.com/YousefE1bana/shifaa-project/issues/643)
rejected a stale version and returned 200 for the current version in the original
actor/target combination. The licence row stayed identical, termination committed
one audit, outbox and receipt, and subsequent encounter completion was denied
without those effects. Revision `2963df71701d49912231b47bf1f0d0ed82bfd082`, run
`4d6a6944-0be7-4606-aa7f-f18893ee5bf5`, original receipt SHA-256
`2716e342684ed577d9cc3b76a47c5192c8e157c5e7b5838160d8aecb66262635`.

Both results bind local correction candidates on the sealed migration chain plus
T009. The [sealed-input verifier](../../../../tools/verify-feature-012-migration-chain.mjs)
passed on integrated base `72e0de8df5ed7528afe4f986d888995d0655daeb` and rejected
each candidate at the changed facility adapter. The results provide candidate
regression evidence. An approved compatibility successor is required before
using the corrections as integrated predecessor evidence.

## Installed predecessor behavior on the approved disposable database

Run `9fd6c267-4d21-47bc-8573-d92d33b90065` at
`8d8577711b6190f76c27a26db4fcc3fcb0398b5c` completed all five SQL fixtures.
It used pinned PostgreSQL on network `none`, the 38 sealed F011 migrations,
and T009 with SHA-256
`96719e8101fc247df4e2b75b7bb46c1f0709f82985208f50286a5176253d89da`.
Each fixture ended with `ROLLBACK`. The run exited 0, its launcher stderr
was empty, and the inventory still matched all 12 retained containers and
four volumes. The private receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-predecessor-behaviors-8d857771/predecessor-behaviors.json`
(79,760 bytes, SHA-256
`24c8559d7fdc087994a11791af9cc36e75c7a0c0d24a4c48ff9d0dc1cf165a49`).

| Matrix family                        | Installed observation                                                                                                                                                                                                                                                                                                                                                                                               | Remaining observation                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F011 current content                 | The installed eligibility helper returned false for an absent release under `shifaa_f011_executor`.                                                                                                                                                                                                                                                                                                                 | Publication, supersession and the changes that remove a previously eligible release still need distinct observations.                                                                                                                                                                                                                                |
| F010 appointments and queue          | The existing [scheduling SQL suite](../../../../infra/db/tests/clinic-scheduling-schema.sql) exercised booking, rescheduling, check-in, queue-only completion, reorder, and absence-driven queue removal on the installed chain. The fixture uses an owner-authenticated session for its routine calls and separately checks the online role's direct table denial.                                                 | Attribute the remaining calls to the online role or route and record the exact F012 consumed care/scope predicates. Existing historical encounter and queue results remain separately attributable.                                                                                                                                                  |
| Family, purpose and consent          | The [delegation fixture](../../../../infra/db/tests/feature-012-predecessor-family.sql) used `shifaa_api`. The installed F004 predicate denied before the start, allowed at the start and immediately before the end, and denied at and after the end. Wrong purpose and revoked rows denied throughout. The fixture controls the transaction timestamp relative to each row's validity interval deterministically. | Distinct guardianship/evidence loss, current versus historical consent and remaining accepted purpose changes. Neither authenticated consent case was repeated.                                                                                                                                                                                      |
| Workforce, licence and scanning      | The [facility RLS suite](../../../../infra/db/tests/facility-onboarding-rls.sql) verified member isolation, released facility/professional evidence projections under the respective purpose, and denial with insufficient assurance or wrong purpose under `shifaa_api`. The evidence rows were synthetic fixtures.                                                                                                | Membership and licence lifecycle variants and evidence release/rejection/loss against each relevant current predicate. The scanner remains fixture-only in the approved configuration.                                                                                                                                                               |
| F007 local recovery                  | The [local release fixture](../../../../infra/db/tests/feature-012-predecessor-recovery.sql) ran the SQL transition used by the [continuity adapter](../../../../services/api/src/adapters/postgres/identity-continuity-service.ts) under `shifaa_api`. An unbound session matched zero rows, the bound session completed version 2 and cleared restriction and binding, and replay matched zero rows.              | The fixture used synthetic session IDs. The actual repository's audit and outbox, native session integration and distinct dependent-transition effects retain their own verification. The scheduler disposition remains in the [deployment record](t012-deployment-attribution-disposition.md#f007-scheduling-and-privileged-operation-disposition). |
| Offline provisioning and maintenance | The [governance fixture](../../../../infra/db/tests/feature-012-predecessor-governance.sql) verified forced RLS on designations and signing authorities, no direct insert/update/delete or executor membership for the inspected online roles, and a confined NOLOGIN eligibility executor.                                                                                                                         | No privileged provisioning, maintenance or restore was invoked by this run. An authorized online or offline invocation requires separate entry-point and operator evidence. T013 retains drain/exclusion and T084 retains restore reconciliation.                                                                                                    |

Run `48729b78-fea4-4175-ac3c-b401accce0da` at
`6e8660f246f4be38de40d2d5570bb4ebc08dcd20` used the same database
boundary to call the installed F011 allergy writers as `shifaa_api`. The
CLN fixture created the initial allergy under a current encounter and
synthetic verified facility licence. Attempting to create a linked
correction against that live head denied with `23514`. The head, revision
and outbox counts remained one each. After the existing verification
routine made the original revision `entered_in_error`, the same
correction request succeeded. Independent readback found the original
terminal version 2 and a linked new version 1, the exact clinician,
facility and encounter, and three revisions, three audit events, three
outbox events and three completed idempotency receipts. The fixture supplied
the evidence support and structural protected envelopes. Core API route,
external provenance, other verification edges and the current content
release lifecycle retain their own evidence requirements.

The allergy run exited 0 with empty launcher stderr and the same retained
inventory. The private receipt is
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-predecessor-allergy-6e8660f2/predecessor-allergy.json`
(78,955 bytes, SHA-256
`84bf2a05ae668ac7261f4d143884fd2db80a29d385e84aba1a2facb321c8c6ad`).

These fixture results establish predecessor behavior and role boundaries. The
matrix still tracks authenticated calls, the exact consumed predicate and
independent ordering where required. T013 retains fence implementation and
subsequent regression.

### Effective purpose and clinician scope

The [purpose fixture](../../../../infra/db/tests/feature-012-predecessor-purpose.sql)
ran as a `shifaa_api` database session. It saw only version `1.1.0`, effective
at the transaction timestamp. An independent owner read verified that the
retired and one-microsecond-future versions remained present. The run
`069d986a-bca7-4f59-8f7d-3debe4d5ff68` at
`827c681c1e0bf03580fd96f9a1f030e45008eb15` passed with exit 0 and rolled back.
The private receipt at
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-purpose-projection-827c681c/purpose-projection.json`
is 69,705 bytes with SHA-256
`b5e64c99a1b6bf339e9975e3536cf684c607e5e61219587f4eb894a15dda42cc`.
The fixture adds installed purpose projection evidence. Post-bootstrap
purpose-writer attribution, current versus historical consent consumption,
and separate guardianship and evidence loss remain open.

The [workforce fixture](../../../../infra/db/tests/feature-012-predecessor-workforce.sql)
passed 15 cases through `clinical.f011_lock_clinician_scope_v1` under
`shifaa_f011_executor`. It covered effective membership start and end,
suspension, facility status, both professional and facility licence expiry
and suspension, and loss of eligibility after facility evidence quarantine
or rejection and professional evidence rejection. Each case rolled back
its synthetic fixture change. Run `c2f05d94-3d1b-4103-a73e-9d2a1d8c6fe2` at
`ad24b32a5127edbceef8fcfdbe7945d3474d5f83` exited 0. The private receipt at
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-workforce-predicate-ad24b32a/workforce-predicate.json`
is 71,470 bytes with SHA-256
`1da177c6f748732e479cd8cabc7075667a05539829abb8c0327e318b60e2af5f`.
The fixture owner supplied the synthetic evidence state. Online writer
entry points, distinct release paths, and the exact consuming F012
predicate and generation still need their own evidence. The scanner
disposition remains fixture-only.

Both runs used the same sealed predecessor chain and T009 hash recorded
above. Both launchers had empty stderr and preserved the inventory of
12 retained containers and four volumes.

### Credential eligibility at UTC date rollover

The expanded [workforce fixture](../../../../infra/db/tests/feature-012-predecessor-workforce.sql)
tested clock-only loss independently for the professional licence and the
facility licence. On each run of the predicate, the caller was
`shifaa_f011_executor` and the local fixture clock matched the intended instant.
The licence was eligible at `2030-04-05T23:59:59.999999Z` and ineligible at
`2030-04-06T00:00:00Z`. Both licence rows and the domain write counters were
unchanged between the observations in each case. The other licence stayed valid.

The successful run executed the sealed 38-migration predecessor followed by
T009. All 17 fixture cases passed, including the two new clock-only cases with
four Boolean observations. The fixture SHA-256 was
`52eba4f1e3f0bb6fa12264600d4ae791f224970816535be100025ae0ffed44b3`.
Both attempts preserved the 12 retained containers and four volumes. The
private receipts are under `LOCALAPPDATA/SHIFAA-Recovery/2026-11-28-t012-workforce-clock/`.

| Attempt                               | Candidate and run ID                                                                | Result                                                                                                     | Receipt SHA-256                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `t012-workforce-clock-attempt-1.json` | `5a634eadd426406b3e5f87009b49c11c27a3c116` / `4a0ebf96-f5bc-4fed-a22d-2bf9cdc66167` | Fixture exit 3. The original 15 verdicts were emitted before a PL/pgSQL parse error in the new assertions. | `5e00a0a0acb2aabf7ee7cfbd2dc89701dde6a5a97d9836fdfa268e42f6847f45` |
| `t012-workforce-clock-attempt-2.json` | `3b878c64de9468b01fa43f9c9424ef6b5e826618` / `0d1d0dcb-796e-44fa-b222-3ded6e9a16d8` | Exit 0 after parenthesizing the fixture's conditional expressions. Both new cases passed.                  | `997cefe81d5f08b2a3d22aaf679b02cf553e768483fcf4ea9f47f5ed419fa3e7` |

This satisfies the predecessor clock-only credential predicate assertion.
The workforce row remains open for corrected invitation and acceptance
compatibility, the applicable operational writer dispositions and the remaining
T012 admission evidence. T013 owns the correction and GREEN regression.

### Scheduling routine calls under the API database role

The [scheduling writer fixture](../../../../infra/db/tests/feature-012-predecessor-scheduling.sql)
used the current patient and clinic staff contexts with
`SET SESSION AUTHORIZATION shifaa_api`. It verified booking and canonical
replay, rescheduling, two check-ins, displaced queue order, calling and
queue-only completion. The independent owner read confirmed that two
appointments remained checked in, no encounter was created, and the
operations left seven completed idempotency records, nine audit events
and nine outbox events for the fixture resources.

Run `45faab3d-c4ae-4998-b074-1c55102783e0` at
`69106b831ed26a7c80002a8d4a2889f9a27ca28c` exited 0 and rolled back.
The private receipt at
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-scheduling-writers-69106b83/scheduling-writers.json`
is 70,694 bytes with SHA-256
`26f0df4df2237c72f424d47460eaad3db2baa6dcad835333a48a455cb50b65ba`.
The sealed migrations matched the catalog, launcher stderr was empty,
and inventory still matched all 12 retained containers and four volumes.
This proof covers installed database routine calls with synthetic request
context. Authenticated routes, encounter lifecycle, remaining scheduling
variants and the exact consumed F012 predicate retain their own proof.

The four earlier attempts are retained under `LOCALAPPDATA/SHIFAA-Recovery`,
each as `scheduling-writers.json` in the directory shown.

| Directory                                           | Result                                                                                | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-27-t012-scheduling-writers-07724e36`       | Fixture request identifier did not match the audit UUID input.                        | `c28fa72c0c641ff6f6bda8ed4ab3081d5ba4bbefc01c259bbcff651114d146f4` |
| `2026-11-27-t012-scheduling-writers-631ee8b5`       | The reschedule fixture was already in the past under the server clock.                | `01ea3b149e8751bfab26bf53122beae068b4ee48299c0c95c9d6d810fc3860d6` |
| `2026-11-27-t012-scheduling-writers-9df23666`       | The database command for a sealed migration returned no exit code before the fixture. | `6791746be76b0b32c357d0478b8bd706f002d98e83a1c2f4c31f22ca5d254f78` |
| `2026-11-27-t012-scheduling-writers-9df23666-retry` | Routine calls ran. Owner readback queried a pre-privacy-migration column name.        | `562bcce9d9c543f75be19f385f62d950dda40bc2999216ba760b5fa824e57345` |

### F011 publication and offline evidence from the predecessor project

The F011 [publication receipt](../../../011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publish-api.json)
records 63 passing checks in each historical runtime. It covers initial
publication, successor reservation, loss of current eligibility without
ancestor fallback, and audited synthetic offline designation, authority
and exact-artifact admissibility changes. The
[publication boundary receipt](../../../011-allergies-clinical-content-governance/evidence/fresh-implementation/K17/publication-boundaries.json)
also records ambiguity denial and admissibility expiry during a real wait.
These original receipts are Git blobs
`cf3331faefe369158e63eb97406f52a75680874f` and
`93f03bbd6d8c899a16e4876ffe05f8e6a2209c61` respectively.

A comparison of the receipts' ten F011 migration digests with the T012
disposable catalog found three exact matches. Seven differ, including the
publication functions and their grants. The recorded publication route
digest also differs from the sealed F011 route. LF and CRLF normalization
did not explain the differences. The published results establish historical
synthetic behavior. The existing F011 runner targets retained local clusters.
The application observations below use a separate disposable port and
record fresh results on the exact sealed bytes.

### Sealed-chain application observations

Each run installed the 38 migrations from sealed F011 commit
`fbd2b5312a5038aad21db0001a17dac22bdcbf7e` and T009 with SHA-256
`96719e8101fc247df4e2b75b7bb46c1f0709f82985208f50286a5176253d89da`.
The fixed [disposable runner](../../../../tools/verify-feature-012-harness.mjs)
used run-owned resources, compared the retained inventory before and after
execution, and bound the Core API connection to the run-owned database.
The API logged in as `shifaa_api`. Auth used the approved pinned GoTrue
image and issued synthetic ES256 AAL2 sessions for the native paths. The
owner was `supabase_admin` for fixture setup and independent readback.
The F011 provisioner ran in a separate run-owned process with the owner
credential and the fixture-specific approval source.

The [K17 fixture port](../../../../tools/feature-012-publication-scenario.mjs)
compares ten original migration hashes. The seven differing suffixes are
`allergy_revisions`, `atomic_receipts`, `allergy_functions`,
`release_functions`, `publication_functions`, `rls_grants`, and
`receipt_functions`. `content_artifacts`, `governance_evidence`, and
`signing_functions` match. The historical route comparison stays separate.
The fresh receipt binds the tested routes through its exact source revision
and source archive digest. Historical K17 supplies fixture provenance.

| Matrix row                            | Newly observed predecessor behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Remaining requirement and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F011 allergy and current content      | Authenticated draft and separate clinical signatures. Publication before exact admissibility returned 403 without a state change. An independent publisher committed initial and successor releases. Before publication the draft successor left the initial release selected. After publication the successor was selected. Revoking its exact admission removed current eligibility without ancestor fallback. Advancing the active designation version invalidated the bound prior signature. Independent readback matched actor, digest, publication version, successor link, signatures, binding, audit, outbox, idempotency and protected receipt. Canonical replay matched the original body digest/ETag and preserved one bundle. | The expiry follow-up below verifies clock-only loss. Installed F011 allergy authority denied an active guardian after bound evidence rejection. The installed refutation writer advanced only the current head and preserved history. The [native allergy runs](#f011-allergy-verification-and-correction-over-native-http) verify patient and clinician creation, governed revision transitions and linked corrections with installed readback. Independent governance/source approval and hosted approval attribution still need evidence. External clinical approval is unobserved in the approved scope. T013 owns admission composition, catalog generation changes and GREEN regression.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F010 encounter, appointment and queue | Authenticated encounter create, canonical replay, update, complete and subject projection. Missing session returned 401, unrelated read 404, stale or terminal writes 409. Owner readback tied the responsible participant and completed appointment and queue to three audit, outbox and idempotency effects. Four authenticated scheduling calls returned 200 for subject check-in and independent cancellation, clinician call and queue-only completion. Readback matched five audit and five outbox effects.                                                                                                                                                                                                                         | The accepted care predicate also includes exact participant interval, actor, facility and appointment/encounter restrictions. Existing installed interval and scheduling SQL evidence remains separately attributable. The follow-up below covers authenticated booking, rescheduling, reordering, exact interval closure and absence. Authenticated professional licence suspension, workforce membership termination and facility suspension each removed F010 completion authority. The responsible participant is inserted during create and was independently read back. The sealed contract has no standalone participant insertion. The [linked-care run](#installed-linked-care-predicates) verifies the responsible participant start boundary, a consulting participant without current workforce authority, and the F011 consumer's exact patient and facility linkage. The recorded native participant run verifies qualified consulting read and immediate loss after exact interval closure. The [native appointment-link run](#f010-appointment-link-guards-over-native-http) verifies denial for the wrong patient, an absent or waiting queue, and a confirmed appointment. A called entry with mismatched queue scope remains a separate installed HTTP assertion. T025 owns the exact F012 transaction-time care consumer. |
| Family, purpose and consent           | The authenticated consent-history route returned the same purpose's versioned grant and superseding withdrawal to its subject. An unrelated native reader saw neither. The owner seeded the two history rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | F004 approval and revocation and F011 evidence-only authority loss are demonstrated below. The history endpoint projects both decisions. F012 current-consent consumption awaits T025 capture and revalidation, T026 action and T039 separate sign where applicable. T017 owns coordination. An operational processing-inventory writer and its approved boundary remain unobserved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Workforce, licence and scanning       | Seeded-synthetic Core API created a facility and quarantined evidence, submitted it after fixture release, then approved it through a distinct seeded reviewer. Owner readback verified active facility, verified licence, released evidence and the review audit actor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Facility routes accept the seeded-synthetic adapter in this scope. Release was one owner fixture DML change. Scanner integration is excluded by D2. The follow-up verifies rejection and loss before approval. The native professional licence suspension and resulting F010 denial are demonstrated below. The distinct synthetic facility owner ended a treating membership online, and the seeded reviewer suspended the facility. The [professional licence decision run](#professional-licence-decisions-over-the-seeded-api) verifies initial approval and rejection with explicit null specialty. The [workforce invitation run](#workforce-invitation-through-the-installed-facility-adapter) reached the installed owner route but returned 409 for a verified invitee licence. Successful invitation, acceptance, the valid omitted-specialty variant and applicable role and evidence changes after approval remain outstanding.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Continuity and deployment operations  | A real ES256 AAL2 session was locally restricted before the F007 PostgreSQL repository completed the bound case. Authorization then allowed that session and repeat completion was denied. Independent readback verified cleared restriction and binding, terminal version and one audit/outbox pair. F011 offline provisioner independently produced one attributed audit event per admission and designation change.                                                                                                                                                                                                                                                                                                                    | The [gateway-backed run](#gateway-backed-f007-replacement-enrollment) verifies the native provider enrollment, verification and local restriction release over HTTP. Bound-case replacement over HTTP and installed repository intake and binding are demonstrated. The [isolated mail-backed run](#mail-backed-f007-http-recovery) demonstrates HTTP intake, OTP plus independent TOTP proof, credential update, fresh native session activation and invalidation of the prior session, refresh token and credential. Mailpit was approved only for these disposable attempts. The [disposable worker run](#f007-recovery-notification-processor) verifies synthetic delivery from a repository-produced completion event. Operational worker ownership and privileged-operation dispositions retain separate evidence requirements. The F007 scheduler is absent and an external trigger is unobserved and excluded. T013 owns admission drain and re-enable. T084 owns restore reconciliation. Hosted T011 scenarios retain their separate gate.                                                                                                                                                                                                                                                                                           |

The predecessor observations leave five T012 rows open plus the future-writer
row assigned to its later owning tasks. Existing admission-order evidence
remains in [the original T012 receipt](t012.json).

#### Retained disposable run index

Original JSON files and launcher stderr are retained under
`%LOCALAPPDATA%/SHIFAA-Recovery/2026-11-27-t012-<suffix>/`.
Every listed run confirmed the same 12 retained containers and four retained
volumes. Launcher stderr was empty for the indexed runs. Publication files
are named `publication.json` and repository files `native-repositories.json`.

| Suffix                                   | Exact evidence revision and run                                                     | Outcome                                                                                                                                        | Original JSON SHA-256                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `publication-6d7576a`                    | `6d7576a15ea9864335261e2fc070ec3267fe880f` / `acb57b84-bfe8-4c97-b3ec-0549dbb5d440` | Exit 2. The first real publication returned `effective` as contracted. The fixture expected `current`.                                         | `0ff51cd24bd019b92d126bb3b028be98165c818da383472bda2d77f9f41ae793` |
| `publication-b5bf124`                    | `b5bf124d800cacbd5f374366e952b4c90df5e826` / `0dd8a90e-d9d1-4388-a3e8-2da40d1124be` | Exit 2. Initial and successor publication and admission loss completed. The fixture submitted `revoked` to an active-only designation profile. | `ad5ac6123ce5957d1de4d16fb0562428c175aa2157bfe6d50fb3b79256c850c6` |
| `publication-c7b7454`                    | `c7b745482beee0340ddf4844c648f9154c4204c8` / `67de6574-7325-457b-8d89-f818627296a7` | Exit 0. Publication, successor selection, both eligibility losses, replay and independent effects readback.                                    | `ab1b9c98729837e4dec208a5f71c0856b851149065b2d8396a3de77b53fa83a2` |
| `native-repositories-4eb33f9`            | `4eb33f90e71f1f817771778f6c741743ce2321d0` / `1f1232f7-1d78-426f-a1cd-bdbfe9380531` | Exit 0. Native encounter lifecycle and local recovery repository.                                                                              | `ed71ccf52b35c86e5821dea2cc2dbe7a193ca96485834dac2d7f4961e5abebd8` |
| `native-repositories-224efcf`            | `224efcf8aa64e9839af0ec5d1fa6e3abb5b0e8ec` / `0304dbf4-9cbd-4a79-8bf3-68f527eb38ce` | Exit 0. Added authenticated consent history and seeded facility evidence/review.                                                               | `557bb924b126ca5e482fed4761820f2073c03038837e4ded6d2df4bbde1eb331` |
| `publication-224efcf`                    | `224efcf8aa64e9839af0ec5d1fa6e3abb5b0e8ec` / `a5ca73ec-5c45-4390-b489-bda10409b537` | Exit 0. Verified the shared native fixture setup and three provisioner audit rows in addition to the publication lifecycle.                    | `d51da3d281d3845ecb5cd689a147f9a4f5b847dbdb4994766d3f896f48e88160` |
| `native-repositories-scheduling-0ad421a` | `0ad421a4973990b7ec5952a1afbf83a31c5174e5` / `2ceb2e4a-9daf-48c2-b1c4-01c8daf95b08` | Exit 0. Four authenticated scheduling calls, five audit effects and five outbox effects.                                                       | `8fa17ccc76643867d43be3b3cab49e127a12be31665675c786c68d87067caaea` |

#### Publication eligibility after the bound admission expires

The authenticated publication returned 200 and the current-selection route
included the published release. The offline provisioner used an exact
synthetic admission with a deadline equal to the installed binding's deadline.
The readback sampled the clock before the deadline and, following one bounded
wait, after it. The approval still had status `active`, version 1 and the
same deadline. The authenticated current-selection route returned an empty
selection. Independent readback confirmed the publication, signatures,
approval binding, receipt, audit, outbox and idempotency effects were unchanged
and the installed F011 eligibility predicate returned false. This case
observes F011 clock-only loss. T010's internal exact equality stays unexecuted.

The first attempt stopped in the offline provisioner before publication.
The fixture stored a sub-millisecond deadline, while the existing provisioner
round-trips the value through a JavaScript date. The fixture now stores the
deadline at millisecond precision. Both run receipts are retained.

| Suffix                      | Exact evidence revision and run                                                     | Outcome                                                                                         | Original JSON SHA-256                                              |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `publication-clock-532a2a2` | `532a2a20fd9e0d56e131e4ac991061e4a0ac9ca8` / `b2b815ac-e0aa-41a1-a9f4-257dd63d1476` | Exit 2. Offline provisioner stopped before the initial publication.                             | `fac820d6dc517f7d5778730de8db658b7170a022bcdc30ef5f5326ce827e7e16` |
| `publication-clock-985834d` | `985834d82c6891e449901e224e4dbae37f8a384a` / `a80ae91a-2f66-4e87-bcb8-4e4553d370b2` | Exit 0. Bound admission expired, current selection emptied, and durable effects were preserved. | `83ea6d8ab930231d4a554c478a5323e3120b49b916117d495e3ae5e72b86ad9a` |

#### Scheduling, participant authority and recovery route follow-up

The authenticated F010 participant fixture observed the exact interval
predicate on the sealed chain. A qualified consulting clinician read the
open encounter. The responsible clinician's update with the wrong start
time returned 409. The update with the exact person, role and start time
returned 200, advanced the encounter and interval versions, and ended
only the consulting interval. The consulting clinician then received 404.
Owner readback confirmed one audit, outbox and completed idempotency
effect and an open responsible clinician interval. The first attempt
expected a null `endedAt` in the active interval. The projection omits
that optional property. The fixture was corrected and the original
attempt remains indexed.

A separate authenticated F010 scheduling fixture booked a slot (201),
rescheduled the same appointment (200), checked in two distinct
appointments (200 each), read the waiting order (200) and reordered the
second entry into the first position (200). Owner readback confirmed
the rescheduled time, version 3, the reversed waiting order and seven
matching audit and outbox effects. The dates came from the disposable
database's civil calendar. Predecessor admission and current writer
claims continue to use their own scoped evidence.

The authenticated F010 absence route returned 404 with the contracted
concealment code for the patient and 200 for the scoped clinician. The
patient had first checked in the appointment. The clinician's request
moved it to `reschedule_required` and removed its waiting queue entry.
Independent readback matched the clinician, exact facility and doctor
scope, three audit events, three outbox events and one completed
idempotency record. The denied request created no absence audit. The
first fixture incorrectly expected 403 instead of the route's 404.

In the direct-GoTrue fixture, F007's bound native session received 403 on the ordinary consent route
before replacement enrollment. The actual Core API enrollment handler
returned 503. The same authenticated session reached the pinned GoTrue
`/user` endpoint with status 200, while the Supabase client's configured
`/auth/v1/user` path returned 404 from the same container. The disposable
target exposes GoTrue directly and lacks the SDK route prefix mapping.
This bounds the 503 to the fixture's provider transport. Replacement
factor verification and its local release/readback are unexecuted at the
HTTP boundary in those attempts. The later
[gateway-backed replacement run](#gateway-backed-f007-replacement-enrollment)
verifies that boundary. The F007 repository result retains its own scope.

These original JSON receipts use the same storage and preservation
conventions as the run index above.

| Suffix                                        | Exact evidence revision and run                                                     | Outcome                                                                                                              | Original JSON SHA-256                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `native-repositories-recovery-api-085b066`    | `085b066d1eb026c613844e859c8fb3eeb1307014` / `ae506935-6c48-42aa-ade6-6efa534508ef` | Exit 2. Enrollment fixture halted with opaque subprocess failure.                                                    | `8f017f7814d2244d66937ee23ad8acc12b4144409ed63ccc1545d14e12683536` |
| `native-repositories-recovery-api-29bbfce`    | `29bbfcea79f478a91a433c352afc488920ed987b` / `5f274aca-8b21-4bdf-9ca9-133005432afa` | Exit 2. Bounded diagnostics recorded 503 from enrollment.                                                            | `51552d936968a73ae2b4e5ca767ac2cd1b0e187181561b1cfd4b2ff8cd48ec15` |
| `native-repositories-participant-api-29bbfce` | `29bbfcea79f478a91a433c352afc488920ed987b` / `d0a1360e-04c7-4ac2-b2b6-1de47e3096d8` | Exit 2. Active participant read returned 200. The fixture expected a null `endedAt`.                                 | `f55d48742ffc8acfeff92a2790a9eb4317a1e028ba6dd307366cdcad8c2cea7c` |
| `native-repositories-participant-api-7e973b3` | `7e973b31ac0da71ef37add985af037f2d456360b` / `0446838b-e9db-4dd2-8b1b-cebc075393c5` | Exit 0. Exact interval closure, denied mismatched interval, revoked participant read and independent effects passed. | `333af82e2fa8cb119657bd788fd243bf8b1611a5b939b4af93f63d59f0dadead` |
| `native-repositories-recovery-api-7e973b3`    | `7e973b31ac0da71ef37add985af037f2d456360b` / `e21c4cf5-a551-4a6b-9b5f-cc6281a69065` | Exit 2. Restricted route 403. Direct provider 200, configured SDK path 404, enrollment 503.                          | `95aa5cdd1a33108d5282238642dd0a8114b2ee920dccb7ce426bb60cfe563c66` |
| `native-repositories-booking-api-42359a5`     | `42359a56160143a5bc4327eb0bb07f7cdc575e4a` / `5f2c9d64-87c3-4076-b2d4-f3bb02a8bcea` | Exit 0. Booking, reschedule, check-ins, queue read and reorder with independent audit and outbox readback.           | `ff46cbc1b44d9d0011ab06553a2bfbe5ff4a244c9187a00a8147bd79b1ba9448` |
| `native-repositories-absence-api-8ed7064`     | `8ed70640f361d38cd5c84aab815657e4256da0b6` / `8f98b1e3-977b-4059-a414-be75f87910de` | Exit 2. The patient was denied with the contracted 404. The fixture expected 403.                                    | `85c32651cb73ebf3616ca6b132e0657b0120c95dc04f1b033860cfc387109e64` |
| `native-repositories-absence-api-dbdcbe0`     | `dbdcbe0af27155eb9182b7b3d0a1ad3b789c0845` / `99bb528d-f1bc-40ff-8e79-043e5f105d82` | Exit 0. Scoped absence, concealed patient denial and atomic appointment, queue and receipt effects.                  | `ed613de85d8f933753081c2abb81e22c0eca81090cdeeddcb1181917a34ba249` |

### Gateway-backed F007 replacement enrollment

Supabase JS 2.112.2 appends `auth/v1` to its configured API base.
The direct-GoTrue fixture gave the SDK the GoTrue listener on port 9999.
Its native `/user` route returned 200, while the SDK's `/auth/v1/user`
request returned 404. The Core API mapped the provider failure to 503.
The local project launcher already uses the Supabase API URL and the
`/auth/v1` issuer and JWKS path. The fixture now reuses the cached Kong
2.8.1 image and the Auth prefix-stripping route from Supabase CLI 2.113.0.
The bridge remained internal and the gateway had no host ports, persistent
mount, Admin API, or service-role credential.
[Supabase Docker guide](https://supabase.com/docs/guides/self-hosting/docker#accessing-apis) ·
[Pinned CLI route](https://github.com/supabase/cli/blob/v2.113.0/apps/cli/src/legacy/commands/start/templates/kong.yml.ts) ·
[Local API launcher](../../../../tools/start-supabase-api.ps1).

The Core API used `http://kong:8000` as the SDK base and
`http://kong:8000/auth/v1` as the exact issuer. GoTrue issued the
fixture sessions through the same gateway route. The direct and routed
JWKS endpoints returned the run-local ES256 public key. The SDK path
returned 200 with the session, 403 without it, and the unmapped root
returned 404. The API connection remained `shifaa_api`.

The bound session received 403 on the ordinary route before enrollment.
Replacement enrollment and TOTP verification each returned 200. The
verified token retained the same subject and native session with AAL2, and
the ordinary route then returned 200. Independent database readback matched
the verified factor, the completed version-2 case, cleared restriction and
session binding, one audit event each for enrollment, verification and
recovery completion, and one outbox event each for factor change and recovery.
This satisfies the predecessor HTTP replacement and local release assertion.
Local case creation and restriction activation keep their separate effect
and attribution requirements. T013 still owns admission drain and later
regression, and T084 owns restore reconciliation.

The successful run used the exact sealed 38-migration F011 chain and T009
SHA-256 `96719e8101fc247df4e2b75b7bb46c1f0709f82985208f50286a5176253d89da`.
The following original `recovery-http.json` receipts are retained in
`%LOCALAPPDATA%/SHIFAA-Recovery/2026-11-27-t012-recovery-kong-<revision-prefix>/`.
Each launcher stderr file was empty and each run matched the inventory of
12 retained containers and four retained volumes.

| Exact revision and run                                                              | Outcome                                                                                                                                 | Original JSON SHA-256                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `64d76d44120d9782d59e8e1bc94eea3d6b3ad4ac` / `8ebd0d03-a748-4ba5-b8b9-c13231996858` | Exit 2. Peer admission expected three containers and stopped before applying the sealed chain.                                          | `f6a9e7e989069151bccebd06d02cb755a2a880749fd9557a6bd653b173e3596d` |
| `5f784dea49f85ab6fedd28e548a5411a4c07e010` / `3fda8192-702c-4c25-89e0-9e1a89379f5c` | Exit 2. The Core API probe stopped before its route assertions.                                                                         | `c7d51a7eb75ad4ad89ce91d9473af6f9754fcf9a088268b3f028b0cb6612fb31` |
| `15c0fb1774cb9f890f82d7ccea804c59b053851a` / `92f46d73-8ad4-4e98-a052-eebc76d5d4e2` | Exit 2. The first gateway JWKS readiness check produced no HTTP response.                                                               | `e7c79ca5eed1785ae0e4a6397f8d4752d5004ff0d0806139f28a289c22ddb8f7` |
| `0e3d43770cb5a3f901bf24b34751145b19213811` / `b67adb04-99ef-44a7-abf6-5b8eeec80762` | Exit 2. Routed JWKS returned the signing key. The first ordinary route received 401 using the fixture session issued via direct GoTrue. | `bd77514c65a62b4250b5f331150c6550eb51a1fc9938fb4eae224bdfb91c0c2e` |
| `394a3ca146ae31f8d4fc279e853585258ef28590` / `2fccdb3e-394b-437d-83f5-7adf32b8e0a3` | Exit 0. Native gateway Auth, restriction, enrollment, verification and independent effects passed.                                      | `ed26afed5b236a084cbfff2dd13d9d898d58f64944fbb4d33cbfab0e73112586` |

### Mail-backed F007 HTTP recovery

The Product Owner authorized the project Mailpit fixture for the initial isolated run and approved each corrected attempt separately. The focused profile added only the pinned Mailpit v1.30.2 image (`sha256:37a38e48e9338cd7e89dfeb487f37b02ebfcd9cb23111bed2d345e79d37d6dd6`). SMTP and mailbox access stayed on the internal run-owned bridge. The existing read-only Core API probe served the tracked [recovery template](../../../../supabase/templates/recovery.html) on the same bridge with no published port. The sandbox checked all five exact container IDs, mount restrictions, zero published ports and retained-resource preservation. GoTrue, the SDK, the Kong route, ES256 issuance, audience and issuer validation use the existing pins. Future execution of this fixture requires the applicable isolated-run authorization.

Both unsuccessful attempts reached HTTP 202. The second confirmed receipt of an email for the fixture address but found no code from the tracked template. Comparing the configured template host to the actual peer flags showed that the recovery probe lacked its private DNS alias. The corrected scope binds that alias to the existing probe and independently counts one request for the template. Supabase [documents the default-template fallback](https://supabase.com/docs/guides/self-hosting/custom-email-templates#overview) if the configured URL is unreachable.

The corrected attempt delivered the code to the matched synthetic inbox. The existing F007 HTTP routes returned 202 for intake and 200 for completion using that OTP and a separately enrolled native TOTP factor. After completion, the ordinary route changed from 200 to 401 for the previous native session and returned 200 for the fresh session. The previous credential and refresh token each returned 400. A separate database connection observed the completed version-four case, matching subject, cleared restriction and binding, zero rows for the prior session, one fresh session, one request-bound audit event and one completion outbox row with precisely the two approved fields. The run did not deliver the worker notification, execute admission ordering, or establish standing mail or scheduler capability.

| Private receipt                                            | Exact source revision and run                                                       | Outcome                                                                                                              | Original JSON SHA-256                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-27-t012-recovery-mail-9c2a2e2/recovery-mail.json` | `9c2a2e28ae0ba252dcb9ae5d434f34b081542e34` / `4ae58518-a92a-45c6-b71a-20fdfeed7927` | Exit 2. The run reached 202 and stopped at its mailbox assertion.                                                    | `ecb203c3002e8b30d1507acf307685c951e6353227edaf3643348cc0e41ca4d2` |
| `2026-11-27-t012-recovery-mail-4474ed0/recovery-mail.json` | `4474ed060f103c28a761f3e29942c02de1501948` / `0670ee48-69e0-4af8-8a64-8627f9575878` | Exit 2. A matched email lacked the project template's code. The recovery probe lacked the configured template alias. | `6165c5d4eb98b68e961c26e8e001b7686be8f8942dd6011d1c99e5c83ff36d7f` |
| `2026-11-27-t012-recovery-mail-1ae698f/recovery-mail.json` | `1ae698f026f751d4ed187046fe5ae1f3b05508e5` / `297ebe00-66ab-4015-a69d-42ea0aa9a4a8` | Exit 0. Native recovery, invalidation and independent SQL effects passed.                                            | `30f4249c30b83ff3f511006eded87a2d20d13e98b9be6960e2a93bfdfc0c03dd` |

### Facility review after fixture evidence loss

The seeded-synthetic Core API created the facility and its quarantined
evidence intent with 201 responses. On the run-owned database,
`supabase_admin` released one exact evidence object and the facility owner
submitted it (200). The separate fixture owner then changed the same
released object to rejected and cleared its release timestamp. The distinct
facility reviewer received 409 with `evidence-quarantined`. Independent
readback found the facility still in pending review, the pending licence,
rejected evidence with no release timestamp and no approval audit actor.
This exercises the pre-approval consumed predicate. The owner DML is a D2
fixture operation. Post-approval and other workforce or licence variants
retain distinct evidence requirements.

Run `0e3006c0-b869-4246-a4b9-063290ba0dc0` at
`c8af9858a3578a41eceeae088c7810fc7f96da66` exited 0. The original
`native-repositories.json` is retained under
`%LOCALAPPDATA%/SHIFAA-Recovery/2026-11-27-t012-native-repositories-facility-evidence-loss-c8af985/`
with SHA-256 `593a9826d3b067a21a2bb6210041ce75611bf90df71568d27c06edceb9be1e63`.
Launcher stderr was empty. All 12 retained containers and four volumes matched.

### Family and continuity policy transitions

Run `17a5818c-5f24-4102-902e-cc643402c935` at
`f0acfc0eef3a9c959683a0fe02e25b3d0d700a70` ran the existing
[family](../../../../infra/db/tests/family-care-rls.sql) and
[continuity](../../../../infra/db/tests/identity-continuity-rls.sql)
fixtures on the sealed predecessor chain and T009. Both exited 0 and
rolled back individually. The family fixture exercised
`shifaa_api` guardianship intake and review, denied quarantined or
wrong-patient evidence at intake, verified purpose and permission bounds,
and covered emergency contact confirmation and delegation isolation.
The continuity fixture exercised `platform.decide_dependent_transition`
as `shifaa_api`, denied an unassigned reviewer, and verified that the
assigned reviewer approved version 2. Independent readback verified the
same person, patient, record number and self relationship, loss of the
former guardian's authority, and only the scope of the separate later
grant. It also checked the restricted `shifaa_worker` outbox projection.

The private receipt at
`LOCALAPPDATA/SHIFAA-Recovery/2026-11-27-t012-family-continuity-f0acfc0e/family-continuity.json`
is 72,120 bytes with SHA-256
`e285954c5a4bb0a3645d6e07cff72b1cca8267d2f2a440f38a78696cd44087ce`.
The launcher stderr was empty, and all 12 retained containers and four
volumes matched. This is installed predecessor-role evidence. The
fixtures used SQL actor context. The [guardianship follow-up](#post-approval-guardianship-and-professional-licence-transitions) covers the authenticated review routes and post-approval evidence loss. The [F007 gateway run](#gateway-backed-f007-replacement-enrollment) covers real-session replacement. F012 consumption of current consent remains assigned above.

### Post-approval guardianship and professional licence transitions

The guardianship run used the Core API as `shifaa_api` and a distinct seeded
F004 reviewer. The approval route returned HTTP 200, active version 2.
The installed F011 allergy read returned an object under the same PostgreSQL
role with the guardian and `dependent_care` context. A run owner changed one
bound synthetic evidence object from released to rejected. Independent
readback confirmed the relationship remained active at version 2. The same
F011 read then denied with SQLSTATE `42501`. The reviewer explicitly revoked
the relationship by HTTP 200. Independent readback confirmed version 3,
loss of F004 family authority following revocation, two correctly attributed
audit events and two outbox events. The evidence change was synthetic fixture
DML. The denied F011 read isolates evidence loss from explicit revocation.

In the licence run, an authenticated AAL2 clinician created an encounter
(HTTP 201) on the exact linked appointment and queue. The seeded administrative
reviewer suspended the clinician’s professional licence over the API (HTTP
200). The same clinician’s authenticated encounter completion returned a
concealed HTTP 404. Independent readback found licence version 2 and released
evidence, one suspension audit and one outbox event. The encounter remained
open at version 1, the appointment in consultation, and the queue in service.
There was no completion audit, outbox event or receipt.

These runs verify predecessor behavior. T013 retains ownership of admission
order and generation changes. All three runs exited 0 with empty launcher
stderr and matched the retained inventory of 12 containers and four volumes.
The receipt directories below are relative to `LOCALAPPDATA/SHIFAA-Recovery`.

| Private receipt                                            | Exact revision and run                                                              | Scope                                                                                      | Original JSON SHA-256                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `2026-11-27-t012-guardianship-caeb9b5/guardianship.json`   | `caeb9b536ae0901ca99656991dce80326875084b` / `949c7a17-c5b1-4a25-8933-6523a04dfb6b` | Initial approval, fixture evidence rejection, explicit revocation and independent effects. | `48b83efe379ca6597d4b8c570fcbb0cdec824123aee6e0b04e5fbc35ae662977` |
| `2026-11-27-t012-guardianship-6789f78/guardianship.json`   | `6789f78c4c5291dc3eda9a992ff1c8bc8f0cd4fe` / `5287ddc7-2612-432e-8385-8a6d9ace88f2` | Added isolated installed F011 denial while the relationship was still active.              | `dd151ed319aff6df7632efb752fae803849aa5f0edd36f7a671ef0abe969a61d` |
| `2026-11-27-t012-licence-scope-8cc8bc7/licence-scope.json` | `8cc8bc798e53df264ecf800312d40d5fadd4e477` / `20e4f067-cf9d-43bd-912a-394980dda524` | Native F010 creation and denial after actual licence suspension.                           | `244843cad36a8888a53996b04e3749aa79c4166dfa27084a45d522713960cbe8` |

### Additional sealed predecessor assertions

- **F007 repository intake and binding.** The API repository logged in and ran
  as `shifaa_api` against the disposable database. The adapter resolved the
  synthetic subject from pinned GoTrue. It inserted an intake, denied an
  invalid case-token digest with 401, bound the matching person and returned
  the same person on repeat. Independent readback found `proof_required`
  version 2, with zero audit/outbox completion effects and no restriction
  or bound recovery session. OTP redemption and credential/session rotation
  are the distinct HTTP flow.
- **F003/F010 membership termination.** A native clinician created the linked
  encounter over HTTP (201). An existing seeded-synthetic facility owner
  ended the treating membership (200). The same clinician received a concealed
  HTTP 404 on completion. Independent readback found the ended membership at
  version 2 and a still-verified professional licence, one attributed audit
  event and one outbox event. The encounter, appointment and queue remained
  unchanged, with zero completion audit, outbox and receipt effects. The
  earlier combined owner/clinician fixture returned 403 on membership end.
  Its denial remains preserved as a distinct unpassed case.
- **F003/F010 facility suspension.** The seeded facility reviewer suspended
  the facility over HTTP (200). The same native clinician then received a
  concealed 404 on encounter completion. Independent readback found the
  suspended facility at version 2, with released evidence, active membership
  and verified professional licence. The suspension produced one audit and
  one outbox event. The encounter, appointment, queue and completion effects
  were unchanged.
- **F011 allergy refutation.** The sealed SQL fixture invoked the installed
  writer as `shifaa_api` with a synthetic verification-support binding. The
  current head advanced to version 2 `refuted`, and the original remained
  `self_reported`. Independent readback matched the responsible clinician and
  exact evidence predecessor, two revisions, two outbox events, two audit
  events and one completed protected verification receipt for version 2.

F010 [encounter create](../../../../supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql#L448)
inserts the responsible participant atomically. The
[update carrier](../../../../packages/contracts/src/feature-010.ts#L574)
allows exact interval closure. No separate product participant-insertion
entry exists in the installed predecessor chain. An owner fixture inserted
the consulting participant in the interval-closure case. T013 owns admission
at the actual create and update paths.

Full F007 OTP intake uses the repository’s existing
[Mailpit-backed recovery fixture](../../../../tests/e2e/identity-continuity-recovery.spec.ts#L55).
Mailpit is absent from the admitted F012 topology. An isolated, no-port mail
sink would be an additional reviewed topology member for that assertion.
Scheduled expiry remains absent. External scanning remains excluded, and the
actual offline owner and restore boundaries are in the
[deployment disposition](t012-deployment-attribution-disposition.md#f007-scheduling-and-privileged-operation-disposition).

All runs below used the sealed chain and T009. They matched the retained
inventory of 12 containers and four volumes. Receipt paths are relative to
`LOCALAPPDATA/SHIFAA-Recovery`.

| Private receipt                                              | Exact revision and run                                                              | Outcome                                                                                                                                     | Original JSON SHA-256                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-27-t012-recovery-intake-8d84a40/intake.json`        | `8d84a403fc5d8e750ebfb6003dc92e2ce644e4bc` / `d8a5fdbc-ef3e-45db-bb3b-ec7ac9c7ff07` | Exit 2. Fixture read the wrong status property on the policy error.                                                                         | `7bc5e19679de2abaf344b41644c888b062b9019de660758de5125ade64ae5565` |
| `2026-11-27-t012-recovery-intake-a12cfe3/intake.json`        | `a12cfe381dc13fcc79918716d8aa0366edb9e789` / `bd18f819-6a60-40e2-b97c-74ec2caca942` | Exit 0. Installed intake, digest denial, subject binding and readback.                                                                      | `72edaaa1c0c05c6a6024ae423ee135f74a9c26e82572d7ae0ba9b794e84c929e` |
| `2026-11-27-t012-membership-scope-a76b0e5/membership.json`   | `a76b0e599156f89b103c302b4835b583ae2546dc` / `21bb69bd-e9b3-47db-9cee-5ab01e048c3c` | Exit 2. Combined facility owner and treating clinician received HTTP 403 on membership end. The specific denying layer was not established. | `9e93b98f5c1be94644af802da3128dc258a6af87ca9a09ef459225fdf8b91557` |
| `2026-11-27-t012-membership-scope-e439bc0/membership.json`   | `e439bc05e792e59929629bf9c94d3eb064cfa5e5` / `e9176bbb-a386-4adf-8ac1-a5dd4e4217a6` | Exit 0. Distinct owner ended the membership. F010 completion was denied without effects.                                                    | `6b6b45054767822bafbc30784452ddd31bdfb3c506d3eb08ab9835e7ad67af1e` |
| `2026-11-27-t012-allergy-refutation-aac403c/refutation.json` | `aac403c60ad851c08c2ef18e9dc7899790210837` / `bef34ee8-f9bf-4276-9bc7-5de86468e083` | Exit 0. Installed refutation, protected receipt and independent readback.                                                                   | `4e2ff57b43d130473b9c2857a09c99b9dd861846446cc0f07d6cb0eae1bfb0b6` |
| `2026-11-27-t012-licence-scope-aac403c/licence-scope.json`   | `aac403c60ad851c08c2ef18e9dc7899790210837` / `c0460be1-1822-4965-92ef-739f240f18b9` | Exit 0. Licence-suspension regression passed after extracting the shared encounter scenario.                                                | `741648ef8e5884bd45c797614af56062f1fb5da537e5622b68253d566b2570ef` |
| `2026-11-27-t012-facility-scope-145f633/facility.json`       | `145f6336089a333a669e032e5a0cc830fad4d127` / `fbb3f432-8635-42ff-8350-6a74e2954313` | Exit 0. Facility suspension and denial of F010 completion passed with independent readback.                                                 | `0430afe40230daf94601b9ae05bf7568c7565d2f38a7eca7f94777f74e35c9d3` |

### Professional licence decisions over the seeded API

Two owner-issued professional licence create calls and evidence-upload intent
calls returned HTTP 201. The evidence started quarantined. The run owner
released exactly one synthetic evidence row per licence. The distinct seeded
reviewer then returned HTTP 200 for both verification and rejection through
the existing Core API decision route. Independent readback confirmed the
corresponding `verified` and `rejected` states at version 3, one audit event
attributed to the reviewer for each decision, and three licence outbox events
per case across creation, evidence registration and decision.

The first run omitted the optional `specialty_code` and received HTTP 500
during setup. With explicit `null`, the setup and both decisions passed. The
contract permits omission. The adapter binds the optional value directly in
its SQL insert. The first receipt does not contain a DB error code. Omitted
specialty remains an unresolved predecessor case. Both receipts match the
retained inventory of 12 containers and four volumes.

| Private receipt under `LOCALAPPDATA/SHIFAA-Recovery`            | Exact revision and run                                                              | Outcome                                                                                                                        | Original JSON SHA-256                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `2026-11-27-t012-professional-review-21d104b/professional.json` | `21d104b67560e0ed8aec984d2a0be675212355ac` / `0522df29-50f4-4e06-a442-e44abe3a715d` | Exit 2. Setup returned HTTP 500 with optional specialty omitted.                                                               | `7f498c555ea9ec6be4e071dc3c14629c9b963241fcc86bf0431c0966c328f4df` |
| `2026-11-27-t012-professional-review-34a5ed8/professional.json` | `34a5ed8f6a2c864c3f5564545706555a81af1b4e` / `2c4263d7-eb7c-48be-9748-cb8bed31bddc` | Exit 0. Verification and rejection both passed with explicit null specialty, seeded evidence release and independent readback. | `eac1367eb666b81c188ae9871f0701b2af35ea9075f065695c8abe4d99a4061d` |

### Installed linked-care predicates

The sealed F010 [current encounter authorization](../../../../supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql#L784) returned false one microsecond before the responsible participant's start and true at that exact start. A seeded consulting participant without facility workforce authority returned false. The installed F011 [allergy list consumer](../../../../supabase/migrations/20261006185236_f011_allergy_functions.sql#L216) returned a JSON object for the correct encounter, patient and facility. A different active patient and a different active facility each produced SQLSTATE `42501`. Each call ran with both PostgreSQL login and effective roles set to `shifaa_api`. The independent connection observed the same open version-one encounter, in-consultation appointment and both participant intervals, with zero audit or outbox effects. The predecessor fixture controls the existing local context clock for these assertions. NAC-1's internal current-clock equality remains separate.

The fixture's owner sets up synthetic rows before the independent API-role calls. This verifies the installed predecessor predicate. The [native participant run](#scheduling-participant-authority-and-recovery-route-follow-up) separately verifies qualified consulting access and loss on interval closure. The [appointment-link run](#f010-appointment-link-guards-over-native-http) separately verifies four native HTTP guard cases for encounter creation. T013 owns writer admission and GREEN proof.

Private receipts are retained below `%LOCALAPPDATA%/SHIFAA-Recovery/`. Both runs retained the same 12 containers and four volumes.

| Receipt                                             | Exact source revision and run                                                       | Outcome                                                                                                                                          | Original JSON SHA-256                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `2026-11-27-t012-care-predicates-112b3bd/care.json` | `112b3bd1725f5453b98f88ed269a79a851538adb` / `8189c45b-3493-4ba3-b7c6-2e6894142088` | Exit 2. The installed predicate returned false before start. The fixture compared escaped newline text with actual psql line breaks and stopped. | `d88db2bcdbc0738e41f585150ea2e3a6153fd25876c74361414bc696f66c84cc` |
| `2026-11-27-t012-care-predicates-88cb731/care.json` | `88cb7314ff1c56297905d4fe3bc69ef294d3be17` / `0ed44e9b-fa85-44a4-9568-4d964ce55d97` | Exit 0. All six predicates and independent readback passed.                                                                                      | `2741055d3e0acdbf98f7e66eea5a964dd96d0299d27e239496df385c1cdac292` |

## Predecessor restore entry points

Source comparison at `28dcfc46d5e68dc0e1bbee94e74087c632100b7a` and
`4ee6b1f301a15fc9120eb9c1ee9f0380bdd46530` matched all three runner blobs.
Each runner can write predecessor data under its local database owner. Their
target selection matters when attributing a restore to an F012 deployment.

| Runner                                                                                  | Observed write target and boundary                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [F008 audit restore](../../../../tools/run-audit-admin-restore-test.mjs#L33)            | Uses two fixed synthetic database names in the Compose `postgres` service. The creation helper first drops any existing database with the same name. A deployment manifest must distinguish these owner operations from approved maintenance on the admitted target.                                                       |
| [F009 scheduling restore](../../../../tools/run-clinic-scheduling-restore-test.mjs#L13) | Creates a source and target with a run ID in the Compose `postgres` service. It restores the target and replays the scheduling worker there. Its database cleanup is limited to names recorded as created by the run.                                                                                                      |
| [F010 encounter restore](../../../../tools/run-feature-010-restore-test.mjs#L590)       | Creates randomly named source and target databases inside each selected local cluster, using `shifaa_owner` or `supabase_admin` as configured. It loads the bounded F010 migration chain and restores into the newly created target. Cluster membership alone does not identify the database as the F012 admission target. |

No restore or database mutation was performed for this source comparison.
T012 still needs deployment-specific attribution of the actual restore entry
point, executing principal and target database. The
[source admission contract](../../contract-amendment/plan-closure-consolidated-v0.2.0.md#3-single-sourcetransactionlinearization-contract)
requires exposure to be disabled and drained for unadmitted owner work. T013
owns that exclusion and T084 owns the restore readback and new admission epoch.

### F007 recovery notification processor

On the sealed F011 chain plus T009, the installed F007 repository completed a
bound native recovery case and produced the actual `identity.recovery.completed`
event. The fixture used a dedicated active synthetic recipient and the
[existing F007 processor](../../../../services/worker/src/identity-continuity.ts)
with its local-synthetic messaging adapter. Two clients connected as the
non-superuser, non-BYPASSRLS `shifaa_worker` role. One delivered and the other
was idle. Independent database readback verified the bound patient, matching
minimal fields, delivered outbox and notification, one delivery attempt, and
one consumer receipt.

The first attempt stopped after repository completion with no worker verdict.
The diagnostic attempt showed one idle and one retry with zero sends. The
sealed fixture's bound person had no address, which the installed claim
requires for recipient projection. The corrected fixture adds only an address
on the reserved synthetic domain. The isolated run had no Mailpit, external
provider, deployed worker daemon or scheduled purge invocation.

| Retained receipt                                               | Exact evidence revision and run                                                     | Outcome                                                                  | Original JSON SHA-256                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `2026-11-27-t012-recovery-worker-594fe62/recovery-worker.json` | `594fe62ae0925c198e6461f1a368a56594f3f33d` / `4eb02b3b-5210-47cc-bf0f-5742bba736ce` | Exit 2. Repository completed; worker subprocess stopped before a report. | `1b22bfd0ec26ac4fec1d91b30e878555850ed9a9a18b3df5b02fd26576f1ef96` |
| `2026-11-27-t012-recovery-worker-01def65/recovery-worker.json` | `01def65af991f7ab9e390c23ba6f2d8d328568aa` / `3d54096e-2444-487a-83b0-2a8148d12108` | Exit 2. Idle and retry, zero sends.                                      | `c42552b2487b62452b094dcf9f261bef14289b50dc1e37564d03790e75529b91` |
| `2026-11-28-t012-recovery-worker-1f1b58c/recovery-worker.json` | `1f1b58cde7522d0ccf4b0972dd1b2ef1d766857e` / `bfe86003-db53-4428-9fab-838c0fd02c2e` | Exit 0. Exactly one synthetic delivery, attempt and consumer receipt.    | `5863645285ce0f19005ee2a760169b8fb39903b2c4847ab4aaff6b959e0a0288` |

### F010 appointment-link guards over native HTTP

A qualified synthetic clinician used a real native session through the
[encounter route](../../../../services/api/src/routes/feature-010-encounters.ts#L285)
and installed PostgreSQL adapter on the sealed F011 chain plus T009.
The wrong patient for the called appointment returned 403. An absent queue, a
matching but waiting queue, and a confirmed appointment each returned 409 with
`state-transition-invalid`. Independent readback preserved each appointment
and queue state and version, with zero encounter, audit, outbox or idempotency
rows before and after. The fixture leaves the installed triggers enabled.

This covers those four predecessor HTTP assertions. The sealed [F010 SQL
fixture](../../../../infra/db/tests/feature-010-api.sql) covers a called queue
with mismatched scope separately. The admitted HTTP fixture has yet to run
that variant. T025 owns producer-internal F012 consumption and revalidation;
T013 owns participating writer ordering and GREEN evidence.

| Retained receipt                                                   | Exact evidence revision and run                                                     | Outcome                                                       | Original JSON SHA-256                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-28-t012-appointment-links-bdb7dc7/appointment-links.json` | `bdb7dc7ec29d7c6298e932a819863843fcfdf5bd` / `fbf72105-3b27-4f91-9503-43834b3a5b81` | Exit 0. Four HTTP denials and unchanged independent readback. | `dcd22e51a19f86e70be5b9699b580a0be003320fe95c5a261338db05362e287c` |

### Workforce invitation through the installed facility adapter

A distinct seeded facility owner invoked the existing membership invitation
route. Owner readback confirmed an active facility and a distinct eligible
pharmacist with the exact verified, current licence. The installed adapter
returned HTTP 409 `professional-license-invalid` instead of the expected 201. The database independently showed no membership, audit, outbox or
idempotency effect. The acceptance route was unexecuted.

The [PostgreSQL adapter](../../../../services/api/src/adapters/postgres/facility-service.ts#L210)
loads the licence collection under the facility owner's context, and the
[installed predecessor policy](../../../../supabase/migrations/20260811000300_facility_onboarding_rbac.sql#L202)
allows the licence subject or an authorized professional-licence reviewer to
read it. The [service checks the invitee's licence](../../../../services/api/src/modules/facility-onboarding/service.ts#L462)
against that collection. These source references explain the observed denial
without changing the policy or granting the owner direct access to the
invitee's licence. An owning F003 correction and a distinct successful
invitation and acceptance remain necessary.

| Retained receipt                                                   | Exact evidence revision and run                                                     | Outcome                                                                                      | Original JSON SHA-256                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-28-t012-membership-invite-bb6254f/membership-invite.json` | `bb6254f2892ce0e67a06488036f45efc2207ef85` / `e42d1b5e-17c1-4ee4-9ac1-6b6e6fae2e8d` | Exit 2. Installed invitation HTTP 409, acceptance unexecuted, independent effects unchanged. | `718afb93b8961b86cbf98723a6751ebff835334c2df29a94b7f98b63fd9d1b96` |

### F011 allergy verification and correction over native HTTP

The [F011 K13 fixture](../../../../tools/run-feature-011-verify-api-test.mjs)
supplies the synthetic care selector and evidence protocol. The disposable
Core API uses live ES256 AAL2 sessions, the installed PostgreSQL adapter as
`shifaa_api`, and the F011 mutation routines. The fixture supplies a run-local
encryption key in probe tmpfs and a synthetic provenance source. The
installed routines independently check current care and the matching evidence
row. These runs cover the sealed 38-migration F011 predecessor plus T009.

- The patient-first case returned 201 for the initial report. The treating
  clinician received 200 for confirmation, refutation, reconfirmation and
  terminal error. The patient received 201 for the linked correction and 200
  for the original five-revision history.
- The clinician case returned 201 for the initial report, 200 for terminal
  error and 201 for the linked correction. Independent readback identified
  the treating clinician as actor and recorder on both new reports and
  matched the facility, encounter and protected receipt.
- A separate PostgreSQL connection confirmed each updated head, clinician
  and support binding, an unchanged digest of the original revision, and
  both linked heads. Each write produced one revision, audit event, outbox
  event, mutation obligation, protected receipt and completed idempotency
  record. The history reads produced zero additional effects.

This completes these predecessor application assertions. Independent
governance/source approval, attribution of a hosted approval principal and
any applicable real evidence integration remain unobserved in the disposable
scope. T013 owns admission and generation composition and both-order GREEN
proof.

| Retained receipt                                                   | Exact evidence revision and run                                                     | Outcome                                                        | Original JSON SHA-256                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-11-28-t012-allergy-api-9a2431b/allergy-api.json`             | `9a2431ba9847eab878685af9742188a27dcb6464` / `4dcd1212-802d-4a27-a78d-a66e4615a81c` | Exit 0. Seven HTTP assertions and independent readback passed. | `57b9fa22097ef1148fde151e10685056541937942d90245d6397c33848cea960` |
| `2026-11-28-t012-allergy-clinician-2c68b48/allergy-clinician.json` | `2c68b482ab14ec7c4c740912616e06a42e6b07b4` / `dd71d070-0d04-423a-b1d1-b08c5a453f64` | Exit 0. Four HTTP assertions and independent readback passed.  | `ecfe56e50d91b83195419f5a359e8b8f483bc9c769fe40062223b1f29d1ec7b3` |
