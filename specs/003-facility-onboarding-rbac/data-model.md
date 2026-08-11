# Data Model: Facility Onboarding and Contextual RBAC

All primary keys are UUID v4, timestamps are UTC `timestamptz`, mutable rows carry `version integer default 1 check (version > 0)`, and online domain tables use `ENABLE` plus `FORCE ROW LEVEL SECURITY`. The API executes as `shifaa_api`, a non-owner role without `BYPASSRLS`. License plaintext, invite tokens, document bodies, private URLs, and signed URLs are never stored in projections, audit metadata, or events.

## Entities and constraints

### `identity.facilities`

Required columns: `id`, `facility_type`, `name_ar`, `name_en`, `facility_status`, `governorate_code`, `city`, `district`, `address_line`, optional `latitude`/`longitude` for this non-discovery slice, `created_by_person_id`, `submitted_at`, `reviewed_by_person_id`, `reviewed_at`, `decision_reason`, `created_at`, `updated_at`, `version`.

- Type check: `clinic|pharmacy|hospital|laboratory`.
- State check: `draft|pending_review|active|suspended|rejected|closed`.
- Indexes: creator, `(facility_status, created_at, id)`, `(facility_type, facility_status, created_at, id)`.

### `identity.facility_licenses`

Required columns: `id`, `facility_id`, `license_type`, `license_number_ciphertext`, `license_number_nonce`, `license_number_key_version`, `license_number_hash`, `issuer`, `issued_on`, `expires_on`, `licensed_activities text[]`, `status`, `document_object_id`, `reviewed_by_person_id`, `reviewed_at`, `decision_reason`, timestamps/version.

- Status: `pending|verified|rejected|suspended|expired`.
- Partial unique `(license_type, license_number_hash)` while status is `pending|verified|suspended`.
- Index every FK plus `(facility_id,status,expires_on)` and pending review order.

### `identity.professional_licenses`

Required columns: `id`, `person_id`, `profession`, `specialty_code`, encrypted/nonce/key-version/hash license number columns, `issuer`, `expires_on`, `status`, `document_object_id`, `reviewed_by_person_id`, `reviewed_at`, `decision_reason`, timestamps/version.

- Profession fixture closed set for 003 probes: `doctor|pharmacist|nurse|lab_professional`; the domain port permits later approved catalog expansion without changing authorization shape.
- Status: `pending|verified|rejected|suspended|expired`.
- Partial unique `(profession,license_number_hash)` while non-terminal.
- Index `(person_id,profession,status,expires_on)`, review/status ordering, and all FKs.

### `identity.facility_memberships`

Required columns: `id`, `facility_id`, `person_id`, `role_code`, `employment_license_id`, `membership_status`, `invite_token_hash`, `invite_expires_at`, `valid_from`, `valid_until`, `invited_by_person_id`, `accepted_at`, `ended_by_person_id`, `end_reason`, timestamps/version.

- State: `invited|active|suspended|ended|rejected|expired`.
- One active owner per `(facility_id,person_id,'owner')`; partial unique active `(facility_id,person_id,role_code)`.
- Token is a server-secret HMAC; plaintext is shown once only.
- Index `(facility_id,membership_status,created_at,id)`, `(person_id,membership_status,valid_from,valid_until)`, and every FK.

### `identity.role_permissions`

Columns: `role_code`, `action_code`, `resource_code`, `min_aal`, `purpose_code`, `required_profession`, `patient_relationship_required`, `created_at`; PK `(role_code,action_code,resource_code)`.

Admin roles are exactly `super_admin|support_admin|medical_reviewer|facility_approver|finance_reviewer`. They have no inheritance. Remote `action_code` equals the canonical operation ID. `contracts/admin-role-actions.yaml` is the exhaustive API-Catalog-derived role/action registry; migration generation rejects missing/extra role or operation entries and emits only entries whose `availability` is `existing` or `feature_003`. Facility roles are separate explicit codes scoped to the facility type and contain only 003 onboarding/team/probe permissions.

### `identity.admin_role_grants`

Columns: `id`, `person_id`, exact `role_code`, `status`, `valid_from`, `valid_until`, `proposed_by_person_id`, `decided_by_person_id`, `decision_reason`, `decided_at`, timestamps/version.

- State: `pending|active|rejected|revoked|expired`.
- Checks: decider differs from proposer and target; active validity is current.
- Partial unique active `(person_id,role_code)` and partial one-pending equivalent.
- Index `(status,created_at,id)`, target, proposer, decider.

### `identity.admin_role_revocation_requests`

Columns: `id`, `grant_id`, `status`, `reason`, `proposed_by_person_id`, `decided_by_person_id`, `decision_reason`, `decided_at`, timestamps/version.

- State: `pending|approved|rejected|cancelled`.
- One pending request per grant; decider differs from proposer and grant target.
- Approval locks request then grant in UUID order, validates both versions/current active grant, updates request and grant, then persists audit/outbox/idempotency in the same transaction.

## Private Storage metadata

Use bucket `identity-evidence`, `public=false`. Random object names have no person/facility/license semantics. Allow-listed metadata contains `resource_type`, `resource_id`, `owner_person_id`, `facility_id` when applicable, `mime_type`, `size_bytes`, `sha256`, and `scan_status=quarantined|released|rejected`. Upload intent accepts JPEG/PNG/PDF up to 10 MiB. Approval download/preview is a short-lived single-object authorization and only for released evidence requested by an eligible role/AAL/purpose reviewer. Anonymous/client list, public URL, cross-owner, cross-facility, and quarantined/rejected fetch all deny.

## State transition functions

- `identity.submit_facility(id, expected_version, actor)`: `draft|rejected|suspended → pending_review` only with required current license and released object.
- `identity.decide_facility(id, expected_version, actor, decision, reason)`: `pending_review → active|rejected`; `active → suspended`; actor differs from creator/owner and holds current approver grant/AAL2/purpose.
- `identity.decide_professional_license(...)`: `pending → verified|rejected`; `verified → suspended`; resubmission creates/increments pending version with new released evidence.
- `identity.accept_facility_membership(...)`: current unexpired invite and target person only; `invited → active` after facility active and license gate.
- `identity.change_facility_membership(...)`: owner-only allowed matrix; terminal states never reopen.
- `identity.decide_admin_role_grant(...)`: `pending → active|rejected`; independent super admin only.
- `identity.decide_admin_role_revocation(...)`: `pending → approved|rejected`; approval atomically marks active grant `revoked`.

Every function is revoked from public/client roles and callable only through guarded API repository transactions. Direct status updates are blocked by triggers or column privilege/state guards.

## Authorization predicate

The pure policy and SQL helper evaluate:

```text
actor exists
AND requested action/resource mapping exists
AND current AAL >= min_aal
AND required purpose matches current purpose
AND (admin grant current OR active facility membership current at requested facility)
AND stored facility type matches target application/action
AND (no professional requirement OR a current verified unexpired license matches)
AND (no patient basis required OR a current approved relationship/care basis matches)
```

Missing data denies. JWT metadata is never a grant. Membership/license/grant expiry and revocation take effect on the next authorization check.

## RLS summary

- Owner sees/manages only the matching facility and membership rows allowed by named actions.
- Member sees own membership and minimum facility shell only.
- Eligible facility approver at AAL2 with the exact facility or professional-license review purpose sees only minimum current worklist projections.
- Active super admin at AAL2 can see governance projections and use proposal/independent-decision functions; roles do not grant arbitrary patient/facility detail.
- Missing context, other facility, other person, wrong role, AAL1, wrong/missing purpose, inactive membership/grant, and invalid license deny.

## Transaction boundaries

1. Facility creation: idempotency reservation + facility + owner membership + audit + outbox + stored response.
2. Facility/license/professional decision: version lock + evidence/AAL/purpose/separation check + transition + audit/outbox + stored response.
3. Membership invite/accept/change/end: token preparation outside transaction where needed; current facility/license/policy lock + mutation + audit/outbox + stored response.
4. Admin grant/revocation: lock resources in deterministic UUID order + independence checks + state changes + audit/outbox + stored response.

Network/Auth/Storage/scanner calls never occur while a database transaction is open.
