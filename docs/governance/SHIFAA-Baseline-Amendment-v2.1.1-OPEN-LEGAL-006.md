# SHIFAA Baseline Amendment — v2.1.1 / OPEN-LEGAL-006

| Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Amendment ID     | `SHIFAA-AMENDMENT-OPEN-LEGAL-006-2026-08-25`                           |
| Approver         | Yousef Osama                                                           |
| Role             | Product Owner                                                          |
| Decision         | Approved development-stage closure of `OPEN-LEGAL-006` for Feature 007 |
| Approval date    | 25-Aug-2026                                                            |
| Version          | v2.1.1                                                                 |
| Source           | `External Egyptian legal counsel analysis — Product Owner approved`    |
| Digest algorithm | SHA-256                                                                |

The external counsel's name or identity is neither required nor stored. This amendment records only
the approved source label, the attributable Product Owner decision, the frozen development rules,
the logical state/event matrix, and deterministic test vectors.

## Closure scope

`OPEN-LEGAL-006` is **CLOSED for Feature-007 specification/development with seeded-synthetic data**.
This closure removes the legal ambiguity that blocked `SPEC_APPROVED` for `FR-FAM-003`; it does not
approve implementation by itself and selects no endpoint, relationship type, table, column, DDL,
auth/session state, production evidence workflow, or retention rule.

`OPEN-LEGAL-001`, `OPEN-LEGAL-002`, and `OPEN-LEGAL-007` remain unchanged and fully open. Live
identity-document intake, real PHI, DPO registration/production review, processor/cross-border terms,
production evidence retention/deletion, and article-level production compliance claims remain blocked.
Production Valify/SMS and every applicable vendor/release gate also remain disabled.

## Frozen legal transition rules

1. 18 is not an automatic SHIFAA account-transfer trigger.
2. 21 is a passive eligibility predicate evaluated on demand; it starts eligibility and verification,
   not silent automatic transfer or a background state mutation.
3. Transition requires identity proofing and reviewed confirmation.
4. An active interdiction, controlling court order, or dispute blocks the automatic path and requires
   human review; SHIFAA infers no legal outcome from age or an unresolved flag.
5. Successful transition preserves the same patient and clinical record.
6. Prior guardian acting authority does not continue automatically after approved transition.
7. Any later guardian or delegate access requires a separately lawful relationship or grant using the
   existing canonical relationship types and operations.

## Logical state/event matrix

These are specification-level workflow outcomes, not physical database enums. Existing
`identity.care_relationships` types/statuses remain unchanged. Before an approved outcome, current
authorization continues to derive only from the current lawful relationship and any controlling
evidence; this matrix neither extends nor terminates authority by inference.

| Current logical outcome                      | Event or condition                                                                                            | Mandatory guard/review                                                                                 | Next logical outcome                              | Authority and record effect                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `not_eligible`                               | Age 18 is reached or observed                                                                                 | None for `FR-FAM-003`                                                                                  | `not_eligible`                                    | No account transfer, relationship mutation, or authority change.                                                   |
| `not_eligible`                               | Transition is requested before 21                                                                             | Deterministic current clock and candidate birth date                                                   | `not_eligible`                                    | Deny transition; no authority change.                                                                              |
| `not_eligible`                               | Subject requests transition on or after 21                                                                    | Begin identity proofing; no autonomous scheduler mutation                                              | `verification_required`                           | Eligibility only; no access transfer.                                                                              |
| `verification_required`                      | Proof is missing, mismatched, failed, expired, or unreleased                                                  | Fail closed                                                                                            | `not_approved`                                    | No transition-derived authority change and no new legal status inferred.                                           |
| `verification_required`                      | Identity proof succeeds and no exception is identified                                                        | Attributed proof result                                                                                | `review_required`                                 | No access transfer while human confirmation is pending.                                                            |
| Any pre-approval outcome                     | Active interdiction, controlling court order, or dispute is identified                                        | Assigned human review of controlling evidence; no algorithmic legal judgment                           | `human_review_required`                           | Automatic path stops; no transition-derived authority change or inferred outcome.                                  |
| `human_review_required`                      | Controlling evidence remains unresolved or reviewer does not approve                                          | Attributed human outcome where available                                                               | `not_approved` or remains `human_review_required` | No transition; current lawful authorization is evaluated independently.                                            |
| `review_required` or `human_review_required` | Authorized human reviewer rejects, defers, or lets the request expire                                         | Assigned, AAL2, purpose-bound, separated reviewer; exact existing role/payload fixed later in the spec | `not_approved`                                    | No transition-derived authority change and no new legal status inferred.                                           |
| `review_required` or `human_review_required` | Identity proof and authorized reviewed confirmation approve transition with no unresolved controlling blocker | One attributed versioned decision                                                                      | `approved`                                        | Preserve the same patient/clinical record; prior guardian acting authority no longer authorizes on the next check. |
| `approved`                                   | Former guardian attempts to act using the prior authority                                                     | Live current-state API authorization and forced RLS                                                    | `approved`                                        | Deny; the former relationship supplies no continuing acting authority.                                             |
| `approved`                                   | A guardian or delegate later requests access                                                                  | Separately lawful, current, purpose/permission-scoped relationship or grant                            | `approved`                                        | Deny without a separate grant; otherwise allow only the new grant's exact valid scope.                             |

The reviewer is an attributable human authorized under the existing closed admin-role catalog, with
required AAL2, purpose, assignment, and separation from the subject and prior guardian. Exact command
payloads and role mapping belong to the later Feature-007 specification; this amendment creates none.

## Deterministic test vectors

| ID                               | Given / When                                                                                                                                  | Expected result                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TV-FAM-CAPACITY-TRANSITION-001` | Clock is immediately before, exactly at, and immediately after age 18.                                                                        | No automatic transition, relationship mutation, or authority change in all three cases.                                                                                      |
| `TV-FAM-CAPACITY-TRANSITION-002` | Subject requests transition one instant before 21.                                                                                            | Deny as not eligible; zero transition effect.                                                                                                                                |
| `TV-FAM-CAPACITY-TRANSITION-003` | Subject requests transition exactly at or after 21.                                                                                           | Enter eligibility/verification only; no access transfer.                                                                                                                     |
| `TV-FAM-CAPACITY-TRANSITION-004` | No request occurs when the clock reaches 21.                                                                                                  | No background/scheduled state or authority mutation occurs.                                                                                                                  |
| `TV-FAM-CAPACITY-TRANSITION-005` | Identity proof is missing, failed, mismatched, expired, or unreleased.                                                                        | No transition; minimum non-oracular failure; no authority change.                                                                                                            |
| `TV-FAM-CAPACITY-TRANSITION-006` | Identity proof succeeds but reviewed confirmation is absent.                                                                                  | Review remains required; no access transfer.                                                                                                                                 |
| `TV-FAM-CAPACITY-TRANSITION-007` | An active interdiction is identified.                                                                                                         | Automatic path stops; assigned human review is required; no inferred outcome.                                                                                                |
| `TV-FAM-CAPACITY-TRANSITION-008` | A controlling court order is identified.                                                                                                      | Automatic path stops; assigned human review applies the controlling evidence; no inferred outcome.                                                                           |
| `TV-FAM-CAPACITY-TRANSITION-009` | A transition or authority dispute is identified.                                                                                              | Automatic path stops; human review is required; no inferred outcome.                                                                                                         |
| `TV-FAM-CAPACITY-TRANSITION-010` | Proof and reviewed confirmation approve transition.                                                                                           | Exactly one approved result preserves the same `patient_id`, person linkage, medical-record identity, and clinical history; no duplicate patient/clinical record is created. |
| `TV-FAM-CAPACITY-TRANSITION-011` | Former guardian uses the prior relationship for each existing Family Care permission after approval.                                          | Every action is denied on the next authorization check by API policy and forced RLS/current-state predicates.                                                                |
| `TV-FAM-CAPACITY-TRANSITION-012` | Former guardian or another delegate requests later access without a separate lawful relationship/grant.                                       | Denied.                                                                                                                                                                      |
| `TV-FAM-CAPACITY-TRANSITION-013` | A later guardian/delegate has a separately lawful, current relationship/grant.                                                                | Only that new relationship's current purpose, validity, and exact permissions authorize; nothing is inherited from the former authority.                                     |
| `TV-FAM-CAPACITY-TRANSITION-014` | Concurrent authorized reviewers submit conflicting decisions for the same version.                                                            | One winner commits; loser receives `409 version-conflict`; no partial authority state.                                                                                       |
| `TV-FAM-CAPACITY-TRANSITION-015` | An identical `transitionDependent` request replays with the same idempotency principal/key/body.                                              | Return the stored terminal outcome without repeating effects.                                                                                                                |
| `TV-FAM-CAPACITY-TRANSITION-016` | A key is reused with a changed body.                                                                                                          | `409 idempotency-key-reused`; no second effect.                                                                                                                              |
| `TV-FAM-CAPACITY-TRANSITION-017` | Actor is cross-patient, subject attempts reviewer decision, reviewer is self/prior guardian/unassigned/wrong role, or AAL/purpose is missing. | Deny before mutation with the canonical localized problem; no state, audit-success, or outbox-success effect.                                                                |
| `TV-FAM-CAPACITY-TRANSITION-018` | Direct SQL is attempted by anon/authenticated/foreign API context or an owner/service-role user path is proposed.                             | Forced RLS/default deny; no online owner/service-role bypass.                                                                                                                |
| `TV-FAM-CAPACITY-TRANSITION-019` | An approved transition is committed or any atomic dependency fails.                                                                           | Domain result, old-authority invalidation, audit, outbox, canonical response, and idempotency record commit together, or all roll back.                                      |
| `TV-FAM-CAPACITY-TRANSITION-020` | Governance provenance is scanned.                                                                                                             | Exact source label is present; no external counsel name/identity is present; production OPEN gates remain unchanged.                                                         |

## AGY adversarial review disposition

AGY review used `gemini-3.7-flash-high`, HIGH effort, read-only, project
`b74e5dcd-5850-459f-9013-a857c04b3de8`, conversation
`424177e9-0389-4c3f-86d1-6350fed77485`, exit `0`, and no read-only violation.

| Finding                                                       | Parent decision | Repository basis                                                                                                                           |
| ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Development closure could be mistaken for production approval | Accepted        | Closure is explicitly development/synthetic-only and preserves `OPEN-LEGAL-001/002/007` plus vendor/release gates.                         |
| Reaching 21 looked like an autonomous clock mutation          | Accepted        | Age 21 is now a passive predicate evaluated on request; no scheduler/state trigger is authorized.                                          |
| Revoke guardian-created subordinate delegations               | Rejected        | `createDelegation` is `PAT`-only in the API Catalog; revoking unrelated lawful grants would widen the legal rule and scope.                |
| Freeze discriminated command payloads and `ADM-SUPPORT` role  | Partly accepted | Actor separation/AAL/purpose tests are required; exact payload and existing-role binding belong to the later spec, not this legal closure. |
| Bind a new Auth user to the existing person row               | Partly accepted | Same patient/person/record continuity is frozen; exact auth-link mutation is technical `OPEN-TECH-002` work and is not selected here.      |
| Logical outcomes could be mistaken for new DB enums           | Accepted        | Matrix explicitly creates no physical enum/table/column and infers no pending authority outcome.                                           |
| Use HTTP `412` for stale versions                             | Rejected        | SHIFAA's established version contract is `409 version-conflict`; identical replay and changed-body behavior remain canonical.              |
| Immediate former-guardian denial                              | Accepted        | Current-state API/RLS checks deny on the next authorization check; no JWT/permission cache may extend old authority.                       |
| Add an exact-label CI rule                                    | Partly accepted | Exact-label/no-identity provenance is frozen as vector 020; no new CI/tooling scope is authorized by this amendment.                       |

## Approved artifact digests

| Artifact                                            | SHA-256                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shifaa-prd.md`                                     | `5c11f22128874cababd3a20f1a763ea237036b2e5f5c85ffd29d8a9865862438`             |
| `SHIFAA-Implementation-Plan-MASTER.md`              | `9df5da793aec33430a52917806746f62f04b7d4a156f4fcd962f42373f2ea0fe`             |
| `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md` | `faab04e6986b75c36d8e2b747ec161158137e178c93fa133973f5f13e0a8f9c2`             |
| `docs/governance/SHIFAA-Completion-Coverage.md`     | `3eacd85bab6f8e350490a96809ae20bc69b1b03da4cf92378b81e4e3ed1d4860`             |
| `docs/traceability/SHIFAA-Traceability-Matrix.md`   | `6e6fd50d8385d588396d0697113dd3bee5927310bbc909d01aa73241e982d647`             |
| `.specify/memory/constitution.md`                   | `25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a` (unchanged) |

This amendment is the attributable Product Owner approval record for v2.1.1. The original v2.1.0
approval remains immutable history.
