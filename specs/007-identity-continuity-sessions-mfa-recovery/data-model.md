# Feature 007 data model

> **Boundary:** logical and planned physical contract; no migration has been implemented

## 1. Native Auth resources — authoritative, not migrated by SHIFAA

| Native resource                          | Required use                                                                      | Forbidden use                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `auth.users`                             | authentication subject only                                                       | direct SHIFAA SQL mutation, domain authorization metadata |
| `auth.sessions`                          | authoritative session ID/user/current state, AAL/factor/not-after/refreshed state | direct grants, row projection, copied validity ledger     |
| `auth.refresh_tokens`                    | native rotation/reuse/family revocation                                           | SHIFAA token copy or family table                         |
| `auth.mfa_factors`/`auth.mfa_challenges` | native TOTP enroll/challenge/verify/list/unenroll                                 | direct mutation or secret projection                      |

`platform.auth_session_is_current(uuid, uuid)` is the sole planned cross-schema read boundary. It
returns boolean only, fixes `search_path`, is revoked from public roles, and is executable only by
`shifaa_api`. Migration compatibility tests fail if pinned native columns/indexes are absent.

## 2. `identity.continuity_cases`

| Column                        | Type / nullability     | Constraint / meaning                                                                |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `id`                          | `uuid not null`        | primary key, generated UUID                                                         |
| `case_type`                   | `text not null`        | `account_recovery` or `dependent_transition`                                        |
| `subject_person_id`           | `uuid null`            | FK `identity.people`; null only for decoy/nonexistent recovery                      |
| `subject_patient_id`          | `uuid null`            | FK `identity.patients`; required only for transition                                |
| `relationship_id`             | `uuid null`            | FK `identity.care_relationships`; required transition guardianship                  |
| `verification_case_id`        | `uuid null`            | FK existing `identity.verification_cases`; released/verified proof reference        |
| `status`                      | `text not null`        | closed workflow set below                                                           |
| `public_token_digest`         | `bytea null`           | 32-byte HMAC digest; required recovery, forbidden transition                        |
| `token_key_version`           | `integer null`         | positive; present iff digest exists                                                 |
| `restriction_scope`           | `text null`            | only `mfa_enrollment_only`; only recovery `restricted_enrollment`                   |
| `bound_native_session_id`     | `uuid null`            | deny-only binding to a native session; never proves validity                        |
| `assigned_reviewer_person_id` | `uuid null`            | FK people; required in transition review states                                     |
| `reviewer_person_id`          | `uuid null`            | FK people; required for reviewed terminal transition decision                       |
| `review_required_reason_code` | `text null`            | `interdiction`, `court_order`, or `dispute`; signals review only, not legal outcome |
| `decision_reason_code`        | `text null`            | stable localized reason key; required reject/approve decisions                      |
| `expires_at`                  | `timestamptz null`     | required for recovery; transition derives proof expiry                              |
| `decided_at`                  | `timestamptz null`     | reviewed transition terminal timestamp                                              |
| `completed_at`                | `timestamptz null`     | completed recovery timestamp                                                        |
| `created_at`,`updated_at`     | `timestamptz not null` | UTC defaults                                                                        |
| `version`                     | `integer not null`     | starts 1, positive, increments each state mutation                                  |

### Status closed set

`requested`, `proof_required`, `review_required`, `human_review_required`,
`restricted_enrollment`, `approved`, `rejected`, `expired`, `completed`.

### Shape checks

- `account_recovery`: patient/relationship/review-reason are null; digest/key/expiry exist; subject may
  be null; `restricted_enrollment` requires subject, scope, and bound native session.
- `dependent_transition`: subject/person/patient/relationship exist; relationship is guardianship;
  digest/key/restriction/session binding are null; reviewer assignment exists in review states.
- `approved` is transition-only with reviewer/decision/decided time.
- `completed` is recovery-only with subject/completed time and no remaining restriction.
- `rejected` transition with a reviewed decision has reviewer/reason/decided time; proof failures may
  use a system reason without pretending a legal decision.
- `review_required_reason_code` moves only to human review and never automatically selects approval/
  rejection or changes current authority.

### Indexes

- unique live recovery per non-null subject on states `requested`, `proof_required`,
  `restricted_enrollment`;
- unique live transition per relationship on `requested`, `proof_required`, `review_required`,
  `human_review_required`;
- unique non-null `public_token_digest`;
- unique non-null `bound_native_session_id` while restricted;
- worklist `(assigned_reviewer_person_id,status,created_at,id)` partial review states;
- subject history `(subject_person_id,created_at desc,id)`;
- expiry `(status,expires_at)` partial nonterminal recovery;
- unconditional FK indexes on `subject_person_id`, `subject_patient_id`, `relationship_id`,
  `verification_case_id`, `assigned_reviewer_person_id`, and `reviewer_person_id`, in addition to the
  partial live/worklist indexes above.

## 3. State transitions

### Recovery

| From                         | To                      | Actor/guard                                                                        | Effects                                                         |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| none                         | `requested`             | preauth HMAC scope/rate; known or decoy                                            | digest+15m expiry; uniform response                             |
| `requested`                  | `proof_required`        | valid token, known subject                                                         | no account/factor projection                                    |
| `requested`/`proof_required` | `expired`               | request-time clock > expiry                                                        | terminal; no Auth mutation                                      |
| `proof_required`             | `restricted_enrollment` | repeated proofing accepted, factor lost, native session valid                      | bind deny-only native session scope                             |
| `proof_required`             | `completed`             | bound factor + independent method; native credential/session operations reconciled | all old sessions revoked; new ordinary access only after commit |
| `restricted_enrollment`      | `completed`             | replacement TOTP verified; native revocation reconciled                            | restriction removed; notification event                         |
| any nonterminal              | `rejected`              | invalid terminal proof/attempt policy                                              | no new ordinary access                                          |

### Dependent transition

| From                                      | To                      | Actor/guard                                                                                                | Effects                                                                   |
| ----------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| none                                      | `proof_required`        | authenticated existing person; Cairo date ≥ 21st birthday; exact active guardianship                       | no authority mutation                                                     |
| `proof_required`                          | `review_required`       | referenced proof verified/released/current                                                                 | assigned reviewer; no authority mutation                                  |
| `proof_required`                          | `rejected`              | proof failure/expiry                                                                                       | no inferred legal outcome                                                 |
| `review_required`                         | `human_review_required` | interdiction/order/dispute evidence                                                                        | no automatic decision                                                     |
| `review_required`/`human_review_required` | `approved`              | assigned independent ADM-SUPPORT, AAL2, purpose, factor AMR ≤300s, matching version, no unresolved blocker | same person/patient/self/clinical record; guardianship revoked atomically |
| `review_required`/`human_review_required` | `rejected`              | attributed reviewed rejection/expiry                                                                       | current lawful authorization independently remains                        |

All other transitions fail with `409 state-transition-invalid`; stale `If-Match` is `409
version-conflict`.

## 4. Person/patient/relationship continuity

- Auth JWT `sub` must equal existing `identity.people.user_id`.
- The target patient must already reference that same person.
- Approval inserts no person, patient, self relationship, medical record, clinical row, or duplicate
  link.
- Lock order is transition case → guardianship relationship → patient → person → idempotency/audit/
  outbox append.
- Approval changes only transition case state and the targeted prior guardianship status/attribution.
- Existing unrelated delegations remain governed by their own lawful grant; no inherited authority is
  created and no unrelated grant is revoked by inference.

## 5. RLS and grants

Every new table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. `shifaa_api` is
non-owner/non-`BYPASSRLS`; `PUBLIC`, `anon`, `authenticated`, and service-style roles receive no table
grant. `shifaa_api` receives only required select/insert/update and no delete.

| Context                    | Select                                               | Insert                                                          | Update                                                  |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| preauth recovery           | no row projection; opaque API result only            | recovery through exact preauth HMAC/action context              | token-bound exact recovery action only                  |
| subject person             | own minimum case                                     | own transition if person/patient/relationship/eligibility match | own proof submission only                               |
| assigned support reviewer  | assigned minimum transition worklist at AAL2/purpose | none                                                            | decision only with assignment/separation/version checks |
| restricted native session  | own minimum recovery status                          | none except Auth mutation via Core API                          | replacement completion only                             |
| direct roles/foreign actor | none                                                 | none                                                            | none                                                    |

Security-definer helpers are minimum boolean/transition functions, fixed-search-path, revoked from
`PUBLIC`, schema-qualified internally, and never accept actor/purpose facts not independently matched
to transaction context.

## 6. Shared platform changes

- Extend `platform.outbox_events.event_type` with minimum events:
  `identity.factor.changed`, `identity.recovery.completed`, `identity.transition.submitted`, and
  `identity.transition.decided`.
- Scope the existing aggregate-version uniqueness index to these event families without colliding with
  prior unrelated event version 1 rows.
- Drop/recreate the explicit `outbox_worker_select` and lease/update worker policies so
  `shifaa_worker` can select/claim exactly the four new identity events plus every previously allowed
  event; add forced-RLS tests proving both the new allowlist and unrelated-event denial.
- Extend processing inventory with `identity-continuity-synthetic` before any case evidence field is
  collected; retention classes only, no statutory duration.
- Existing encrypted idempotency response envelope is reused. One-time enrollment response TTL is ten
  minutes; ordinary non-secret mutation result TTL is 24 hours; refresh uses native replay semantics
  without storing tokens.
- No hard delete of subject-linked evidence. Expiry/revocation/terminal history remains until
  `OPEN-LEGAL-002` supplies an approved action.
- Decoy recovery rows with null subject contain no account identifier and are classified
  `TRANSIENT_TECHNICAL`; a bounded maintenance action may hard-delete them 24 hours after their
  15-minute expiry. Subject-linked recovery/transition evidence is never included in that purge.

## 7. Migration and rollback

1. Assert pinned `auth.sessions` compatibility without altering `auth`.
2. Create table/checks/indexes and processing inventory.
3. Create fixed-search-path helper and state/authorization functions.
4. Apply grants, ENABLE/FORCE RLS, and policies.
5. Extend outbox constraints/index scope, recreate exact worker RLS policies, and seed paired local
   notification templates.
6. Add synthetic fixtures only; no status/eligibility/factor/session backfill.

Before first durable continuity case, rollback may drop new objects after validation. Afterwards disable
routes/UI and roll forward; never resurrect revoked native sessions/factors/guardianship authority.
