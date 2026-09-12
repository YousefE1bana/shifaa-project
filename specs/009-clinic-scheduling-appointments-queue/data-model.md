# Feature 009 Physical Data Model

## 1. PostgreSQL prerequisites and ownership

- Use PostgreSQL 17 and the existing schema-owner/runtime-role split.
- Create `clinical` under the migration owner. `shifaa_api` and `shifaa_worker` must not own tables and must not have `BYPASSRLS`.
- Install or verify `btree_gist` through the repository's extension schema convention before exclusions.
- All application functions use schema-qualified objects, `SECURITY INVOKER` unless a minimum-disclosure projection requires `SECURITY DEFINER`, and `SET search_path = ''`.
- Every clinical table has RLS enabled and forced; revoke public access and DELETE unless a future approved retention workflow explicitly adds it.

## 2. Tables

### `clinical.schedules`

| Column                   | Type/constraint                                                            |
| ------------------------ | -------------------------------------------------------------------------- |
| `id`                     | `uuid primary key default gen_random_uuid()`                               |
| `facility_id`            | `uuid not null references identity.facilities(id)`                         |
| `doctor_person_id`       | `uuid not null references identity.people(id)`                             |
| `timezone_name`          | `text not null`, validated against IANA timezone names by guarded function |
| `valid_from`, `valid_to` | `date not null`, `valid_to >= valid_from`; inclusive civil dates           |
| `valid_dates`            | generated `daterange(valid_from, valid_to + 1, '[)')`                      |
| `slot_duration_minutes`  | `smallint not null`, positive and bounded to one civil day                 |
| `status`                 | `text check in ('active','paused','retired')`                              |
| `version`                | `integer not null default 1 check (version > 0)`                           |
| audit columns            | `created_at`, `updated_at`, `created_by_person_id`, `updated_by_person_id` |

Constraints/indexes:

- Partial GiST exclusion `(facility_id WITH =, doctor_person_id WITH =, valid_dates WITH &&) WHERE status='active'`.
- B-tree `(facility_id, doctor_person_id, status, valid_from, valid_to, id)` for scoped reads.
- Trigger rejects every transition out of `retired`, validates doctor active membership/licence at write time, and increments version on effective update.

### `clinical.schedule_windows`

| Column                       | Type/constraint                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                         | UUID primary key                                                                                     |
| `schedule_id`                | UUID FK, not null                                                                                    |
| `iso_weekday`                | smallint `1..7`                                                                                      |
| `local_start`, `local_end`   | `time(0) without time zone`, start < end; overnight windows are represented as two civil-day windows |
| `start_second`, `end_second` | generated integer seconds from local midnight                                                        |
| `local_span`                 | generated `int4range(start_second,end_second,'[)')`                                                  |
| `version`                    | positive integer                                                                                     |

- GiST exclusion `(schedule_id WITH =, iso_weekday WITH =, local_span WITH &&)` rejects positive overlap while allowing boundary contact.
- Unique `(schedule_id, iso_weekday, local_start, local_end)` prevents duplicates.
- All weekly windows for a validity period belong to the same schedule row; window changes increment the parent schedule version in the same transaction.

### `clinical.schedule_exceptions`

| Column         | Type/constraint                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| identity/scope | `id`, `schedule_id`, materialized `facility_id`, `doctor_person_id`, `timezone_name`, `civil_date` |
| interval       | `starts_at`, `ends_at` timestamptz, `ends_at > starts_at`; generated `tstzrange(...,'[)')`         |
| type           | `blocked`, `added`, `delay`, or `absence`                                                          |
| delay fields   | nullable `delay_minutes`; required and positive only for `delay`                                   |
| reason         | bounded non-empty restricted text; excluded from public/event/log projections                      |
| supersession   | nullable `superseded_at`, `superseded_by_exception_id` self-FK; used only by dedicated delay path  |
| control        | `version`, creator/update actor and timestamps                                                     |

- Scope trigger verifies schedule/facility/doctor/timezone/date agreement.
- Partial GiST exclusion `(schedule_id WITH =, exception_type WITH =, effective_range WITH &&) WHERE superseded_at IS NULL` governs ordinary create behavior. `sendDoctorDelay` serializes the scope, marks the prior active delay superseded, and inserts its replacement atomically so the exclusion is never bypassed.
- Ordinary `createScheduleException` never coalesces. Same-key retry is intercepted by idempotency; a different-key duplicate/overlap conflicts deterministically.
- Guarded function under schedule lock rejects `added` overlap with effective base/added and insertion within effective absence/blocked. Absence and blocked may overlap each other and yield one unavailable projection.
- Index `(facility_id,doctor_person_id,civil_date,exception_type,superseded_at)` supports derivation and active delay lookup.

### `clinical.appointments`

| Column         | Type/constraint                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| identity/scope | `id`, `patient_person_id`, `facility_id`, `doctor_person_id`, `schedule_id` FKs                                                               |
| slot identity  | `starts_at`, `ends_at` timestamptz; generated half-open `occupied_range`; `timezone_name`, `civil_date`, `local_start`                        |
| commerce       | `fee_minor_units bigint >= 0`, ISO currency code, `payment_method='cash_on_arrival'`                                                          |
| status         | exact nine: `requested`, `confirmed`, `checked_in`, `in_queue`, `in_consultation`, `completed`, `cancelled`, `no_show`, `reschedule_required` |
| source         | nullable opaque `source_referral_id`; storage compatibility only, with no Feature 010 validation, route, or producer                          |
| cancellation   | nullable bounded restricted reason and actor/time                                                                                             |
| control        | positive `version`, created/updated actor/time                                                                                                |

- Partial GiST exclusion `(doctor_person_id WITH =, occupied_range WITH &&) WHERE status IN ('confirmed','checked_in','in_queue','in_consultation')` is the final double-booking guard across facilities.
- Indexes: patient status/time; facility/doctor/civil-date/status/time; doctor upcoming occupying; schedule/time; status/time.
- State guard permits only Feature 009-produced transitions documented in the approved matrix. It explicitly has no Feature 009 transition into `requested`, `in_queue`, `in_consultation`, `completed`, or `no_show`.
- Reschedule changes this row in one transaction. A failed replacement constraint/validation rolls back every field and retains the original occupancy.

### `clinical.queue_scopes`

| Column              | Type/constraint                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| scope               | `id`, `facility_id`, `doctor_person_id`, `civil_date`, `timezone_name` |
| allocation          | `next_queue_number bigint not null default 1`                          |
| concurrency         | `version integer not null default 1`                                   |
| estimate projection | nullable current delay exception FK and recalculation timestamp        |

- Unique `(facility_id,doctor_person_id,civil_date)`.
- Scope row is the serialization lock for check-in number allocation, reorder, delay supersession, and absence effects.

### `clinical.queue_entries`

| Column             | Type/constraint                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| identity           | `id`, `queue_scope_id`, `appointment_id unique`                                     |
| materialized scope | `facility_id`, `doctor_person_id`, `civil_date` guarded against scope/appointment   |
| numbering/order    | immutable positive `queue_number`; positive `waiting_order` used only while waiting |
| state              | exact five: `waiting`, `called`, `in_service`, `completed`, `removed`               |
| estimate           | nullable `estimated_service_at`, `estimate_version`                                 |
| override           | nullable bounded restricted reorder reason and actor/time                           |
| control            | positive `version`, created/updated/called/completed/removed timestamps             |

- Unique `(facility_id,doctor_person_id,civil_date,queue_number)` and partial unique `(queue_scope_id,waiting_order) WHERE state='waiting'`.
- Index `(queue_scope_id,state,waiting_order,queue_number,id)` supports queue reads.
- State guard allows only `waiting→called` and `called→completed`; absence can atomically set `waiting|called→removed`. It defines no producer for `in_service`.
- Reorder changes only waiting-order/estimate fields and versions; it cannot change appointment or queue state.

## 3. Transaction boundaries

| Use case               | Locked rows and atomic effects                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/update schedule | facility/doctor active schedules, target schedule/windows; validate licence, active-range and window exclusions; audit/outbox/idempotency               |
| Create exception       | schedule plus intersecting exceptions; validate precedence/overlap; audit/outbox/idempotency                                                            |
| Book                   | schedule/slot plus candidate occupying appointments; insert confirmed appointment; audit/outbox/idempotency                                             |
| Cancel                 | appointment; validate actor/state/pre-start rule; cancel and release occupancy; audit/outbox/idempotency                                                |
| Reschedule             | appointment plus replacement schedule/slot; one-row update guarded by exclusion; audit/outbox/idempotency                                               |
| Check in               | appointment plus queue scope; allocate immutable number, create exactly one waiting entry, set appointment checked_in; audit/outbox/idempotency         |
| Call/complete          | queue scope and entry; exact state/version transition; appointment unchanged; audit/outbox/idempotency                                                  |
| Reorder                | queue scope and affected waiting rows; validate reason/target/version, rewrite bounded order/estimates; appointment unchanged; audit/outbox/idempotency |
| Delay                  | queue scope and active delay exception; supersede/insert/recalculate estimates and notification work; no order/time/state/slot change                   |
| Absence                | schedule/scope, intersecting appointments and waiting/called entries; exception insert, appointment/queue effects, audit/outbox/idempotency             |

All idempotent use cases first lock/claim their canonical idempotency record. Unique/exclusion violations map to deterministic RFC 9457 conflicts; no retry loop may duplicate an effect.

## 4. RLS and disclosure matrix

| Actor            | Read                                                                                            | Mutation                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Public/anonymous | minimum verified doctor/facility/availability projection only                                   | none                                                                              |
| Patient          | own appointments and minimum own queue position                                                 | book/cancel/reschedule/check-in only where catalog state/scope allows             |
| GUA/DEL          | represented patient's minimum rows through active canonical relationship + `appointment.manage` | same bounded patient actions                                                      |
| CLN              | exact active membership/licence facility/doctor/date worklist                                   | only operation/action/purpose-authorized schedule, appointment, and queue effects |
| Worker           | published template and claimed outbox/minimum event projection only                             | receipts/delivery state through existing worker functions; no clinical mutation   |

Tests cover wrong patient, expired/revoked relationship, wrong permission, wrong facility/doctor/date, inactive membership/licence, missing purpose/AAL, stale version, and enumeration-safe not-found behavior.

## 5. Availability algorithm

1. Select the single active facility/doctor schedule whose inclusive civil validity contains the requested date.
2. Expand matching weekday windows by slot duration in clinic wall time.
3. Resolve local candidates: omit nonexistent DST instants; select earlier offset for ambiguity; persist/return UTC plus civil context.
4. Remove effective absence intervals, then blocked intervals.
5. Add valid added intervals, excluding any overlap prohibited at write time.
6. Remove occupying appointment ranges.
7. Attach, but never apply to slot identity/time, the current delay estimate overlay.
8. Return bounded, ordered, opaque-cursor results with freshness metadata.

## 6. Migration lifecycle

1. **Expand:** extension verification, schema/tables/functions/indexes, RLS/policies, event-type allowance, flag default off.
2. **Validate:** clean install and upgrade, constraints `VALIDATE`, synthetic derivation/race/RLS tests, query plans, restore compatibility.
3. **Activate:** enable internal reads, then writes, then route cohorts in local/test after evidence; notification dispatch remains independently gated.
4. **Contract:** no Feature 009 contract migration is scheduled now. Future cleanup requires separate evidence after compatibility and retention review.

Before writes, rollback can remove additive code in a controlled migration. After writes, disable flags, preserve records, and roll forward.
