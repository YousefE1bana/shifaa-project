# OPEN-LEGAL-006 — dependent-transition decision request

> **Status:** OPEN; external decision required
>
> **Required owners:** licensed Egyptian legal counsel, registered DPO, and Product Owner
>
> **Boundary:** no age/capacity rule, state matrix, evidence class, reviewer authority, or DDL is approved

## What authoritative research establishes

- The canonical gate itself requires written Egyptian-law analysis and an approved state/event matrix
  plus test vectors before `SPEC_APPROVED` for `FR-FAM-003`.
- The official [State Information Service law index](https://hrightsstudies.sis.gov.eg/قوانين/) lists
  the Child Law, later amendments, and executive regulations as separate instruments.
- The official [Gazette archive](https://mediadr.sis.gov.eg/handle/123456789/49361) records a 2023
  amendment to the Child Law, showing that the controlling version and amendment chain matter.
- [Official 2026 State Information Service reporting](https://africa.sis.gov.eg/أفريقيا-اليوم/الأخبار/الحكومة-توافق-على-مشروع-قانون-الأسرة-منفتحون-على-أى-آراء-أو-تعديلات/)
  describes active family-law proposals and court/authority digitization for guardianship matters. A
  proposal or media summary is not enacted-law evidence and cannot be converted into a SHIFAA trigger.

This research does **not** establish the correct medical-record autonomy age, capacity threshold,
effect of majority on a current guardianship, evidence required for adults lacking capacity, interim
access, reviewer authority, or retention. No age stated by AGY or a secondary source is accepted.

## Exact signed legal/DPO/Product decision package required

### Counsel questions

1. Identify every controlling Egyptian instrument, amendment, regulation, and competent authority,
   using official Arabic texts and exact articles effective on the decision date.
2. Define the exact trigger or triggers for independent digital-health record management. Distinguish,
   where legally necessary, identity-document eligibility, childhood, medical consent/privacy,
   contractual/financial capacity, disability/capacity orders, and court-directed representation.
3. State whether an existing guardianship ends, narrows, persists, or must be replaced at each trigger;
   identify the legally effective date and whether SHIFAA may act automatically, only on subject claim,
   or only after official review/order.
4. Define the treatment of adults lacking capacity without allowing SHIFAA staff to adjudicate legal or
   medical capacity. Name the competent authority and exact official evidence.
5. Define interim guardian and subject rights while proof/review/dispute is pending, separately for
   profile, appointments, records, medication, consent, SOS, and notifications.
6. Define post-transition and historical access for the subject and former guardian, including whether
   any third-party/guardian-originated information requires a separate projection.
7. Define rejection, expiry, reapplication, appeal, fraud quarantine, later court order, correction, and
   reversal behavior without inventing an unreviewed legal status.
8. Name the permitted SHIFAA reviewer role, required qualifications, assignment rules, separation of
   duties, whether one or two reviewers are required, and the limits of documentary review.

### Registered-DPO questions

9. Approve the exact processing purpose, lawful basis, data classes, recipients, countries, retention
   class/period, deletion or preservation rule, and approval digest before any evidence is collected.
10. Approve each evidence field and the minimum reviewer projection; determine quarantine/release,
    access logging, notification, subject rights, breach handling, and rejected-case treatment.
11. Decide whether transition initiation or pending status may be disclosed to the current guardian and
    how coercion/safety risks are handled without silently changing legal authority.

### Product Owner questions

12. Select the exact existing admin role and reviewer workflow approved by counsel; do not expand the
    five-role catalog or presume four-eyes unless the signed matrix requires it.
13. Approve user-visible reason codes, review SLA, expiry/reapplication UX, and bilingual notification
    policy within the legal/DPO result.
14. Approve the final matrix and deterministic vectors with version/digest; no conversational approval
    substitutes for the signed artifacts.

## Required matrix

The signed matrix must provide a value for every column below; blank cells keep the gate open.

| Rule ID                | Effective trigger and source article | Subject proof | Evidence issuer/type/validity | Pending subject rights | Pending guardian permissions | Reviewer role/count/qualification | Allowed decision and relationship effect | Auth-user/person linkage | Historical access | Appeal/reversal/correction | DPO purpose/fields/retention/recipients | Test IDs |
| ---------------------- | ------------------------------------ | ------------- | ----------------------------- | ---------------------- | ---------------------------- | --------------------------------- | ---------------------------------------- | ------------------------ | ----------------- | -------------------------- | --------------------------------------- | -------- |
| Counsel/DPO/PO to fill |                                      |               |                               |                        |                              |                                   |                                          |                          |                   |                            |                                         |          |

The matrix must preserve the same `identity.patients.id` and clinical record, prohibit automatic access
transfer, and define how the subject's verified Supabase Auth user binds to the existing
`identity.people.user_id`. The current non-null unique user/person/patient constraints make this an
explicit Architecture/`OPEN-TECH-002` reconciliation before DDL.

## Required deterministic vector families

- Gate-open attempt: `legal-gate-disabled`, zero mutation/evidence upload.
- Every approved trigger boundary at immediately-before, exact, and immediately-after instants.
- Wrong, expired, mismatched, quarantined, unreleased, foreign-patient, and over-broad evidence.
- Subject/guardian/reviewer/self-review/unassigned/wrong-role/AAL/purpose and forced-RLS negatives.
- Pending interim permissions for every closed Family Care permission.
- Concurrent subject submissions and conflicting reviewer decisions; one winner, stable replay, changed
  body rejection, stale version conflict, audit/outbox atomicity.
- Same patient/person/record continuity with no duplicate person or replacement record.
- Adult-lacking-capacity and official-order paths exactly as counsel approves—no guessed fixture.
- Former-guardian and subject historical/current access after each decision.
- Rejection, expiry, reapplication, appeal, fraud/correction, later order, and reversal.
- Evidence minimization, retention, notification, redaction, access-log, and breach vectors approved by
  the DPO.

## AGY findings: parent disposition

| AGY finding                                                | Parent decision                        | Reason                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retained_guardianship` is a substantive legal conclusion  | **Accepted structurally**              | Remove the term from the proposal; reject AGY's unverified statutory conclusion and invented replacement relationship type. Counsel must name the lawful outcome.                  |
| Pending guardian access is undefined/unsafe                | **Accepted as a blocking question**    | Do not choose freeze/full/emergency-only behavior without the signed matrix.                                                                                                       |
| Existing dependent auth-user/person linkage is unresolved  | **Accepted**                           | Current non-null unique linkage and immutable record requirement need explicit Architecture/OPEN-TECH-002 mechanics.                                                               |
| `transitionDependent` has subject/reviewer actor ambiguity | **Accepted**                           | Reject AGY's split/rename: the operation is frozen. The signed matrix/spec must define actor-specific commands under the existing operation or stop for governance reconciliation. |
| Reviewer competence/role/four-eyes is missing              | **Accepted in part**                   | Role and competence are open; reject the claim that FR-ADMIN-004 automatically mandates four-eyes for this decision. Counsel/PO must decide.                                       |
| Historical access is unspecified                           | **Accepted as a counsel/DPO question** | No clinical-record split or new operation is invented in readiness.                                                                                                                |
| Appeal/reversal/fraud/court-order paths are missing        | **Accepted as decision coverage**      | Reject proposed new states/operations until the legal matrix exists.                                                                                                               |
| Opaque evidence lacks processing inventory                 | **Accepted**                           | No evidence intake before DPO-approved purpose, fields, recipients, and retention; reject invented lawful-basis/retention codes.                                                   |
| Multiple age thresholds allegedly control                  | **Rejected as a legal conclusion**     | Only the need for counsel to distinguish applicable concepts is retained; no AGY age/article claim is treated as verified.                                                         |
| Rename `transitionDependent`                               | **Rejected**                           | The canonical operation ID and frozen boundary cannot be renamed here. Neutral internal case/event names remain for later approved design.                                         |

## Closure artifacts

1. Counsel-signed Arabic-source legal analysis with effective-date/version/article mapping.
2. Registered-DPO-signed processing/DPIA decision with exact inventory and evidence rules.
3. Counsel/DPO/PO-signed state/event/permission matrix and deterministic test vectors.
4. Product Owner approval with artifact versions/digests and named reviewer role.
5. Architecture note resolving auth-user/person linkage and the existing single operation without DDL.

Until all five exist and are attributable, `OPEN-LEGAL-006` remains open, `SPEC_APPROVED` is blocked,
and no threshold-neutral table or feature-flagged implementation is considered authorized.
