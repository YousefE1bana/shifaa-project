# T012 participating-writer coverage

[Issue #523](https://github.com/YousefE1bana/shifaa-project/issues/523) and [draft PR #614](https://github.com/YousefE1bana/shifaa-project/pull/614) retain this investigation. The [source inventory](writer-inventory.json) pins the source locations and the [execution receipt](t012.json) binds the disposition. The expanded catalog reads the actual disposable PostgreSQL schema after the 38 sealed F011 migrations and T009. It records relation owners and forced-RLS flags, policies, triggers, effective role privileges, and deployed routine owners, execute grants and definition hashes. A textual helper reference is a review clue. The order of actual locks requires a two-session test.

## Writer paths and required successor behavior

| Writer family                                                                        | Effective write path and ordering                                                                                                                                                                                                                                                                                                                                                                                                           | Required coverage                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F011 allergy creation and head correction                                            | Core API invokes `clinical.create_allergy_api_v1` and `clinical.verify_allergy_api_v1` as `shifaa_api`. The effective definers are `shifaa_f011_executor`. Creation takes the F011 mutation scope and inserts the head/revision. Correction locks the existing head before changing the current revision.                                                                                                                                   | T013 must acquire exclusive rank-zero admission before F011's own locks and atomically advance the patient allergy generation, including empty-to-first insertion. Self-reported first insertion and clinician verification of an existing head are RED in both orders. Clinician creation and other correction variants still require trials.                            |
| F011 content creation, signatures, publication, supersession and current eligibility | Core API invokes `clinical.create_clinical_content_release_api_v1`, `sign_clinical_content_release_api_v1` and `publish_clinical_content_release_api_v1` through the F011 executor. Publication takes the mutation scope, series advisory lock, series row, then ordered release rows. `f011_release_current_eligibility_v1` reads current inputs.                                                                                          | T013 must fence writes that affect catalog membership, current published head or eligibility, advance the declared catalog generation, and retain the separate action-time deadline check. Both orderings remain unexecuted.                                                                                                                                              |
| F011 governance, designation and admissibility                                       | The offline evidence provisioner opens a dedicated transaction under its owner path. Governance changes take versioned row locks. Admissibility provisioning locks the series before the release. The effective F011 trigger functions are owned by the F011 executor; execute privileges and role-level DML are recorded separately.                                                                                                       | T013 must admit or quiesce offline paths and bind each authoritative current change to the affected catalog. The upstream approval authority and per-writer races still require verification.                                                                                                                                                                             |
| F010 encounter, appointments, participants and queue                                 | Core API enters the encounter wrappers and appointment/queue routines as `shifaa_api`. The catalog shows `supabase_admin` definers. The create and complete inner encounter routines are owner-only entry points reached through their wrappers. Completion locks appointment, queue then encounter. Reschedule locks the prior appointment before its successor writes.                                                                    | Encounter creation, completion, participant interval closure, independent appointment cancellation and queue call are RED in both orderings. T013 owns correction. Other participant, appointment and queue transitions remain open.                                                                                                                                      |
| Identity onboarding, binding and verification                                        | `platform.register_identity_onboarding` is a Core API-executable `supabase_admin` definer. The identity adapter uses the same repository transaction for onboarding and its audit. The profile and verification paths also use DML on `identity.people`, `identity.identities` and `identity.verification_cases`. Verification changes can affect recovery eligibility.                                                                     | Onboarding is RED in both orders. T013 must acquire exclusive admission before the first relevant person, patient or self-relationship write and retain it through audit and transaction end. Other identity writes still need predicate and ordering proof.                                                                                                              |
| Family relationships and consent                                                     | `shifaa_api` has insert/update privileges on the relationship and permission tables under RLS, and append privileges on `consent.records`. The family adapter locks the relationship before persisting relationship and permission changes. The only located callers of `setInventory` are tests. The catalog shows that `shifaa_api` lacks UPDATE on `consent.processing_inventory`. Migration and owner paths can change inventory state. | T013 must fence relationship grants and losses, current consent changes and applicable purpose-policy changes, including previously absent predicates. Delegation acceptance, delegation revocation and the representative consent append are RED in both orderings. Other variants, exact purpose predicates, and the processing-inventory owner paths need disposition. |
| Workforce, facility, licence, role and scan state                                    | The facility adapter uses one transaction with existing facility, professional/facility licence, membership and administrative role locks. `shifaa_api` holds the corresponding RLS-constrained DML grants. Evidence status enters through `identity.private_evidence_objects`.                                                                                                                                                             | T013 must fence applicable authority grants/losses and source eligibility changes ahead of those locks, including evidence scan and maintenance paths. Effective-date changes due to the clock need fresh checks. Workforce membership termination is RED in both orders. External scan writers and remaining writer races are open.                                      |
| F007 local continuity and recovery                                                   | The Core API continuity adapter writes case/restriction changes in repository transactions. Dependent transition definers are Core API-executable. The worker-only `platform.purge_expired_continuity_decoys` also expires qualifying recovery cases before deleting old decoys.                                                                                                                                                            | Worker expiry and Core API recovery restriction staging are RED in both orders. T013 must account for both the Core API and worker paths, including case creation and restriction changes, ahead of current F007 idempotency and row locks. Native account effects follow NAC-1. Other local paths remain unexecuted.                                                     |
| F012 roster and current reviewer authority                                           | F012 roster provisioning and revocation are future write paths in the [accepted task ledger](../../tasks.md). Current F011 governance, facility, role and workforce sources have the predecessor paths above.                                                                                                                                                                                                                               | T013 owns the fence composition. T015 owns roster implementation and generation/CAS rules. Actual future roster grants and races require their owning tasks.                                                                                                                                                                                                              |
| Projection and withdrawal                                                            | The accepted model has a same-transaction sign/release path and a restricted offline policy/grant/withdrawal path. The F012 product write paths are absent on this baseline.                                                                                                                                                                                                                                                                | T013 must ensure admission composition and maintenance quiescence. T055–T058 own the later projection schema and writer proofs, including current grant/policy loss.                                                                                                                                                                                                      |
| P3 prescribed statements                                                             | The accepted producer is successful F012 sign. The installed predecessor chain has no such product writer. Cancel and supersede do not rewrite the prescribed statement into an externally sourced medication status.                                                                                                                                                                                                                       | T013 must preserve the generation contract and T038/T039 own the later P3/sign implementation and proof. Unknown or later producers stay outside admitted membership.                                                                                                                                                                                                     |
| Native Auth                                                                          | The SQL-only migration run has `auth.users` and `auth.refresh_tokens` but lacks the GoTrue-managed native session and MFA tables. [NAC-1](../../contract-amendment/native-authority-nac1-successor-v0.1.0.md) binds actual native user/session/factor operations and the separate row conflicts.                                                                                                                                            | T010/T011 own pinned-native cases and transaction retention. Native writers do not participate in the application admission fence.                                                                                                                                                                                                                                        |
| Offline provisioning, restore and maintenance                                        | The inventory includes the F011 owner provisioner, physical fixture loader, backup/restore entry and native maintenance boundary. Owner and superuser privileges cannot be excluded by a Core API-level lock convention. The expanded run performed no retained restore or maintenance.                                                                                                                                                     | T013 must compose admitted online/offline writers or require drained maintenance under the approved model. Restore needs fresh admission and separate evidence from the later recovery tasks. Unclassified operator paths block the affected capability.                                                                                                                  |

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

The retained receipt is the original runtime result. The subsequent
[authenticated Core API consent receipt](t012-deployment-attribution-disposition.md#2026-11-27-authenticated-core-api-consent)
verifies the installed consent writer and withdrawal through their existing
routes. The assertions below track the remaining predicate and writer cases.
Use the [effective writer manifest](t012-effective-writer-manifest.md) for
source and installed-role attribution and the
[approved deployment disposition](t012-deployment-attribution-disposition.md)
for the target and operator scope. The [sealed-chain application observations](#sealed-chain-application-observations)
record the latest results against the five open rows.

| Boundary                              | Static source or unknown                                                                                                                                                                  | Required observations and owner                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F011 allergy and current content      | Allergy mutation adapter and versioned content provisioner. Hosted approval and offline executor attribution still need verification.                                                     | T012 must account for allergy creation and each distinct head-correction path, and for release publication, supersession, eligibility, admissibility and designation changes. Verify which principal executes each change and whether each can change the consumed revision or current eligibility. T013 owns atomic generation changes and both-order regression. |
| F010 encounter, appointment and queue | The encounter adapter has distinct create, update and complete entries. Appointment and queue transitions use separate routines.                                                          | T012 must map remaining interval and lifecycle paths to the exact F012 predicate. Prove distinct effect and denial observations for each relevant transition. T013 owns fence placement before existing ranks and atomic rollback.                                                                                                                                 |
| Family, purpose and consent           | The family adapter has distinct guardianship, delegation and emergency contact entry points. Processing-inventory DML remains unattributed outside the recorded owner or migration paths. | T012 must establish which grant, loss, expiry and consent/purpose changes affect actual F012 authority. Check current versus historical consent and both sides of applicable effective-date boundaries. T013 owns writer participation and clock revalidation.                                                                                                     |
| Workforce, licence and scanning       | Facility and licensing application writes are visible in source. The actual external scan principal and deployment entry point are unknown.                                               | T012 must attribute the effective scan writer and classify release, rejection and subsequent loss of eligibility, along with membership, licence and facility variants. Record privileges, policies and triggers for effective writers. T013 owns admission and generation composition.                                                                            |
| Continuity and deployment operations  | Local case transitions and worker expiry are distinct from GoTrue authority. Owner provisioning, maintenance and restore need deployment-specific attribution.                            | T012 must classify local restriction activation, release and expiry and record which owner paths can run online. T010/T011 own native locks. T013 owns offline exclusion and T084 owns restore execution and reconciliation.                                                                                                                                       |
| Future F012 writers                   | Roster, sign/P3 and subject release are planned in their owning tasks. No equivalent installed writer was observed.                                                                       | T015 supplies roster import and revocation, T038/T039 supply prescribed-statement production, and T055–T058 supply release-policy and withdrawal coverage. Each owning task verifies its actual write scope under T013 admission.                                                                                                                                  |

For each installed case, record the effective role and entry point, the exact
predicate and generation scope, both independent transaction orderings,
rollback, and the applicable audit, outbox and idempotency effects. Validate
that unresolved writer attribution leaves the affected capability disabled.
Issue #523 retains the unexecuted inventory and authoring work.

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

| Matrix row                            | Newly observed predecessor behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Remaining requirement and disposition                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F011 allergy and current content      | Authenticated draft and separate clinical signatures. Publication before exact admissibility returned 403 without a state change. An independent publisher committed initial and successor releases. Before publication the draft successor left the initial release selected. After publication the successor was selected. Revoking its exact admission removed current eligibility without ancestor fallback. Advancing the active designation version invalidated the bound prior signature. Independent readback matched actor, digest, publication version, successor link, signatures, binding, audit, outbox, idempotency and protected receipt. Canonical replay matched the original body digest/ETag and preserved one bundle. | The expiry follow-up below verifies clock-only loss. Additional governance/source and allergy correction variants need distinct evidence. External clinical approval is unobserved in the approved scope. T013 owns admission composition, catalog generation changes and GREEN regression.                                                                                                             |
| F010 encounter, appointment and queue | Authenticated encounter create, canonical replay, update, complete and subject projection. Missing session returned 401, unrelated read 404, stale or terminal writes 409. Owner readback tied the responsible participant and completed appointment and queue to three audit, outbox and idempotency effects. Four authenticated scheduling calls returned 200 for subject check-in and independent cancellation, clinician call and queue-only completion. Readback matched five audit and five outbox effects.                                                                                                                                                                                                                         | The accepted care predicate also includes exact participant interval, actor, facility and appointment/encounter restrictions. Existing installed interval and scheduling SQL evidence remains separately attributable. The follow-up below covers authenticated booking, rescheduling, reordering, exact interval closure and absence. Additional independently consumed scope transitions remain open. |
| Family, purpose and consent           | The authenticated consent-history route returned the same purpose's versioned grant and superseding withdrawal to its subject. An unrelated native reader saw neither. The owner seeded the two history rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The F004 relationship predicate consumes interval, purpose and permission state. Its evidence validation at intake does not establish post-approval evidence loss. The history endpoint projects both decisions. No installed F012 current-consent consumer is present in this chain. Keep consumed-current authority and unobserved operational purpose-writer evidence open.                          |
| Workforce, licence and scanning       | Seeded-synthetic Core API created a facility and quarantined evidence, submitted it after fixture release, then approved it through a distinct seeded reviewer. Owner readback verified active facility, verified licence, released evidence and the review audit actor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Facility routes accept the seeded-synthetic adapter in this scope. Release was one owner fixture DML change. Scanner integration is excluded by D2. The follow-up verifies rejection and loss before approval. Post-approval loss and other professional licence and workforce variants still need distinct observations.                                                                               |
| Continuity and deployment operations  | A real ES256 AAL2 session was locally restricted before the F007 PostgreSQL repository completed the bound case. Authorization then allowed that session and repeat completion was denied. Independent readback verified cleared restriction and binding, terminal version and one audit/outbox pair. F011 offline provisioner independently produced one attributed audit event per admission and designation change.                                                                                                                                                                                                                                                                                                                    | Repository completion leaves the full native provider enrollment flow and hosted T011 scenarios separately unexecuted. No F007 scheduler or `pg_cron` is installed in the admitted target. Actual maintenance drain/re-enable is unexecuted under T013. Restore remains under T084. D3/D4 constrain who may operate the approved paths. Fixture approvals confer no operational appointment.            |

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

F007's bound native session received 403 on the ordinary consent route
before replacement enrollment. The actual Core API enrollment handler
returned 503. The same authenticated session reached the pinned GoTrue
`/user` endpoint with status 200, while the Supabase client's configured
`/auth/v1/user` path returned 404 from the same container. The disposable
target exposes GoTrue directly and lacks the SDK route prefix mapping.
This bounds the 503 to the fixture's provider transport. Replacement
factor verification and its local release/readback are unexecuted at the
HTTP boundary. The directly verified F007 repository result above retains
its own scope. The existing approved target configuration was preserved.

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
fixtures used SQL actor context. Authenticated route evidence,
post-approval evidence loss, F012 consumption of current consent and
the separate real-session local recovery path remain open.

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
