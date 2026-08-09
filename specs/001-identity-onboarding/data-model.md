# Data Model: Identity Onboarding

All UUIDs use `gen_random_uuid()`, timestamps are `timestamptz`, mutable rows carry `version integer default 1 check (version > 0)`, and every online table uses forced RLS. Identity plaintext, OTPs, passwords, tokens, and private-object URLs are never stored in these domain tables.

| Table | Required feature columns and constraints |
|---|---|
| `identity.people` | `id`, `user_id uuid unique not null`, `display_name`, `birth_date null`, `nationality_code char(2)`, `preferred_locale in ('ar-EG','en-EG')`, `phone_e164 null`, `email_normalized null`, `profile_status in ('pending','active','suspended','pseudonymized','deceased')`, timestamps/version |
| `identity.patients` | `id`, `person_id unique not null`, `medical_record_number unique not null`, `record_status in ('active','suspended','closed')`, timestamps/version |
| `identity.care_relationships` | `id`, `subject_patient_id`, `actor_person_id`, `relationship_type='self'`, `status='active'`, validity, timestamps/version; partial unique active self per patient |
| `identity.identities` | `id`, `person_id`, type check, `ciphertext bytea`, `nonce bytea`, `key_version`, `blind_index bytea`, issuer/country/expiry, verification status, timestamps/version; partial unique `(identity_type,blind_index)` excluding rejected/revoked |
| `identity.verification_cases` | `id`, `identity_id`, provider/transaction, state check, assigned/reviewer IDs, reason/evidence object, decision time, timestamps/version; terminal-state trigger |
| `consent.notice_versions` | `id`, code/version/locale/content/digest/effective/retired; unique code-version-locale |
| `consent.purpose_versions` | `id`, purpose/version, bilingual labels, lawful basis, data/recipient/cross-border arrays, retention class, effective/retired; unique purpose-version |
| `consent.records` | `id`, person/purpose, decision check, capture channel, notice version, occurred time, supersedes; append-only |
| `consent.processing_inventory` | `id`, unique process code, owner/controller/processor, purposes/data/systems/recipients/countries/retention/lawful basis, approval digest/status |
| `platform.idempotency_records` | non-null principal/method/route/key/request hash, state, status/headers/body, resource, expiry; unique composite; mutation commits result atomically |
| `platform.outbox_events` | event/aggregate/type/payload, state/attempt/availability/error/timestamps; no prohibited values |
| `platform.event_receipts` | event/consumer/received/result; unique event-consumer |
| `audit.events` | partition/id, previous/event hashes, actor/purpose/patient/facility/action/resource/outcome/request/time/metadata allow-list; append-only |

## State transitions

- Verification: `pending → verified|manual_review|failed|expired`; `manual_review → verified|rejected`; terminal states do not change.
- Consent: decisions are events, not mutable state. A current decision is the latest valid record in the supersession chain.
- Profile: `pending → active`; suspension/pseudonymization/deceased are outside this slice and cannot be invoked by these routes.

## Transaction boundaries

1. Registration: idempotency claim + person + patient + self relationship + audit + stored response.
2. Identity submission: idempotency claim + ciphertext/blind index + case + audit/outbox + stored response.
3. Consent decision/withdrawal: idempotency claim + append-only record + audit/outbox + stored response.
4. Review: version lock + assignment/AAL/purpose check + terminal transition + audit/outbox + stored response.

## RLS summary

- `PAT` request context maps auth user to person and permits only that person's profile, masked identity projection, cases, and consent records through approved functions.
- `ADM-FACILITY` at AAL2 with `identity.review` purpose and assignment sees minimum case fields and can call the guarded transition.
- `GUA`, `DEL`, other staff/admin roles, missing context, and cross-person selectors deny in this slice.
- Table owners, superuser, `service_role`, and `BYPASSRLS` are forbidden for online user requests.
