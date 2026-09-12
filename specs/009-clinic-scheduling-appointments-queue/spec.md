# Feature Specification: Clinic Scheduling, Appointments, and Queue

> This specification is bounded by the frozen Feature 009 roadmap row. It does not authorize planning, implementation, production PHI, production SMS, digital payment, or any operation outside the exact inventory below.

## 0. Metadata and traceability

| Field | Value |
|---|---|
| SpecKit feature ID | `009-clinic-scheduling-appointments-queue` |
| Status | `SPEC_APPROVED — 2026-09-10; PLAN_APPROVED — 2026-09-10 by Yousef Osama, Product Owner, for planning only` |
| Target FR IDs | `FR-FAC-005`; `FR-CLINIC-001..005`; `FR-CLINIC-008`; doctor-search slice only of `FR-DISC-001` |
| Target NFR IDs | `NFR-SEC-001..007`; `NFR-PRIV-001/002/004`; `NFR-I18N-001`; `NFR-A11Y-001`; `NFR-PERF-001/002`; `NFR-AVAIL-001/002`; `NFR-DATA-001/002`; `NFR-API-001/002`; `NFR-OBS-001`; `NFR-QUALITY-001`; `NFR-PORT-001` |
| Scope eligibility | `ACTIVE — PRD/Master v2.1.3, approved by Yousef Osama on 2026-09-02 under approval record OPEN-PRIV-001 decision package v1.0.0; frozen roadmap Feature 009; predecessor 008 merged into origin/main; baseline c59514249c797fcbb414f404f7e4310cf58fbe80` |
| Target app/service/package | Patient and clinic applications; Core API; generated contracts/client; portable core policy; worker/notification projection; PostgreSQL/RLS |
| Owner | Yousef Osama — Product Owner / SpecKit and Governance Owner |
| Reviewers | Product `[SPEC_APPROVED and planning-only PLAN_APPROVED 2026-09-10 by Yousef Osama; exact Feature 009 P0 visual set approved]`; QA `[pending]`; Architecture `[pending]`; Security `[pending]`; DPO/Legal `[pending]`; Clinical `[not a clinical-content decision; licensed-workforce review remains applicable]`; Design/A11y `[Yousef Osama assigned Feature 009 Design Lead and separately approved the exact 492-reference source/manifest on 2026-09-10; OPEN-UX-001 satisfied for Feature 009 affected UI; OPEN-UX-002 pending]` |
| Risk class | `sensitive-data / clinical-operations / availability` |
| Regulatory domains | PDPL; facility and professional licensing; production processing/retention remains gated |
| Clinical sign-off required | No new clinical-content rule is created; clinic operational ownership and professional-license validity remain mandatory dependencies |
| Dependencies | Features 003, 005, 006, 007, and 008; approved PRD/Master/API/Data-RLS/UI/traceability baselines v2.1.3 |
| Parent roadmap entry | `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md`, Feature 009 |
| Created / updated | `2026-09-10 / 2026-09-10` |

## Clarifications

### Session 2026-09-10

- Q: Which appointment-and-queue ownership model should Feature 009 adopt while preserving every canonical state and adding no operation? → A: Modified Option A — `createAppointment` creates `confirmed`; `checkInAppointment` ends at `checked_in` and creates one `waiting` queue entry; `callQueueEntry` changes only `waiting` to `called`; reorder changes position only; and `completeQueueEntry` changes only `called` to `completed`. Appointment `requested`, `in_queue`, `in_consultation`, and `completed` remain valid canonical states with no Feature 009 producer; later clarification also preserves appointment `no_show` and queue `in_service` without a Feature 009 producer while assigning queue `removed` only to the approved absence side effect. No substitute operation or hidden producer is permitted; consultation state production remains outside Feature 009.
- Q: Which schedule-status, recurrence, civil-time, exception-precedence, overlap, and DST contract should Feature 009 adopt? → A: Adjusted Option A — statuses are `active`, `paused`, and terminal `retired`; recurrence is bounded weekly civil time with an IANA timezone and non-overlapping local windows; operational intervals are half-open; validity dates are inclusive civil dates whose instant end is the next local day boundary; precedence is `absence > blocked > added > base`; `delay` is a separate non-availability overlay; active validity periods cannot overlap for the same facility/doctor; wall-clock time survives DST by omitting nonexistent slots and emitting one earlier-offset slot for ambiguous times; persisted slot identity includes an unambiguous UTC instant plus timezone/civil-date context.
- Q: For overlapping same-type schedule exceptions, should create reject overlaps or coalesce compatible intervals? → A: Ordinary `createScheduleException` rejects every positive-duration same-type overlap for the same schedule. Half-open boundary-touching intervals are allowed. A same-key identical retry replays the stored canonical result; a different key attempting a duplicate or overlap fails with a deterministic conflict and no partial effect. Automatic coalescing is prohibited; `sendDoctorDelay` remains the existing dedicated path that atomically supersedes the prior active facility/doctor/civil-date delay overlay with a latest valid distinct declaration, not an implicit create/coalescing path.
- Q: Which cancellation/rescheduling/no-show, absence-replacement, queue-reorder, and delay-estimate policy should Feature 009 adopt? → A: Adjusted Option A — patient/GUA/DEL and authorized CLN may cancel or reschedule only `confirmed` appointments before scheduled start; a `reschedule_required` appointment may be cancelled without replacement availability but requires a valid future replacement to be rescheduled. Ordinary actions after `checked_in` are denied and `no_show` has no Feature 009 producer. Rescheduling atomically acquires the replacement before releasing the old slot on the same appointment. Absence moves only intersecting `confirmed`/`checked_in` appointments to `reschedule_required` and atomically removes associated `waiting`/`called` queue entries. Offers are future, currently effective, unreserved same-facility/same-doctor slots ordered earliest-first and create no hold. Reorder is limited to `waiting`, exact current permission/scope/version/position, and a bounded non-empty restricted reason, with atomic position/estimate recalculation and no appointment-state change. Delay is facility/doctor/civil-date scoped, may change estimates and create governed notification work, but changes no ordering, times, states, or availability; same-key replay never supersedes, compounds, or duplicates work, and the latest valid distinct declaration atomically supersedes the prior active overlay rather than accumulating minutes.

## 1. Problem and scope

### Problem statement

Patients cannot yet discover an active licensed doctor and complete a trustworthy appointment journey, while authorized clinic staff cannot yet manage facility-specific schedules, check-in, queues, delays, or absences. Feature 009 must provide concurrency-safe scheduling and queue outcomes that remain scoped to the selected facility, doctor, patient, and civil date, with accessible Arabic-first and English-parity experiences and explicit degraded states.

### Actors and authorization context

| Actor | Facility/patient relationship | Permitted outcome | Explicitly prohibited |
|---|---|---|---|
| Public or authenticated searcher | No patient-record authority is required for the minimum doctor discovery projection | Search verified active licensed doctors and view public availability, facility identity, fee, and next slot | View appointments, queue identities, private schedule reasons, or unverified doctors/facilities |
| Patient | Self and current authenticated subject | Create, view, list, cancel, reschedule, check in, and view own queue position where state permits | Act for another patient or alter staff queue order |
| Guardian or delegate | Current canonical relationship with the exact appointment-management permission | Perform the same bounded patient actions for the managed patient | Infer authority from a stale token, relationship label, or unrelated grant |
| Doctor | Current verified professional licence and active membership at the selected clinic | Manage only their authorized facility/date schedule, exceptions, delay, absence, and clinic workflow actions | Act across facilities or through an expired/suspended/rejected licence |
| Clinic owner | Current owner membership for the selected clinic | Manage catalog-authorized schedule/delay/absence outcomes and clinic worklists | Receive a universal clinical or patient-record grant |
| Clinic workforce member (`CLN`) | Current named membership and action-level permission in the selected clinic | View/work the authorized appointment and queue projection; perform only catalog-authorized actions | Shared-account, role-name-only, cross-facility, or unassigned access |
| Notification worker | Minimum event claim and current recipient-resolution authority | Deliver governed delay/absence/reschedule notices through enabled adapters | Read general appointment data, use a service-role online path, or enable production SMS |

### In scope

- Doctor-search slice of discovery: active, verified, licensed doctors filtered by specialty, facility, availability, distance/date, with verified facility identity, fee, and next available slot.
- Facility/doctor/date-specific recurring schedules and bounded exceptions of the canonical types `blocked`, `added`, `delay`, and `absence`.
- Idempotent, concurrency-safe appointment booking with one confirmed use of a doctor time range.
- Appointment read/list, cancellation, rescheduling, check-in, canonical state visibility, and version-conflict handling.
- Facility/doctor/date-scoped queue creation and position/estimate visibility; authorized call, reorder-with-reason, and completion behavior.
- Doctor delay notices and absence-driven `reschedule_required` outcomes with replacement-slot offers.
- Facility-defined fee presentation with `cash_on_arrival` as the only enabled MVP payment method.
- Patient routes `/discover`, `/doctors/:id`, `/appointments/new`, `/appointments/:id` and clinic routes `/today`, `/queue`, `/schedule`, `/appointments/:id`.
- Exactly these 18 operation IDs: `searchDoctors`, `listDoctorAvailability`, `createSchedule`, `updateSchedule`, `createScheduleException`, `createAppointment`, `getAppointment`, `listAppointments`, `cancelAppointment`, `rescheduleAppointment`, `checkInAppointment`, `getQueue`, `getMyQueuePosition`, `callQueueEntry`, `reorderQueueEntry`, `completeQueueEntry`, `sendDoctorDelay`, `declareDoctorAbsence`.

### Non-goals

- Encounters, referrals, prescriptions, medication safety, general consultation chat, and Feature 010 behavior.
- Digital PSP, hosted/tokenized payment, card/wallet processing, refunds, deposits, or payment custody; `cash_on_arrival` only.
- Pharmacy-stock or review discovery, shadow doctor/facility ratings, or any discovery operation beyond the doctor slice.
- New roles, relationship types, endpoints, operation IDs, UI routes, offline write queues, or direct client database access.
- Production SMS or OTP; local/synthetic or otherwise approved non-production notification evidence only while `OPEN-VENDOR-002` remains open.
- Pixel-identical, formal visual-regression, reference-device, formal UAT, production PHI, statutory retention, or article-level legal claims while their gates remain open.

### Dependencies and assumptions

| Item | Type | Evidence / open ID |
|---|---|---|
| Feature 008 is merged and the feature worktree/branch is cleaned | verified fact | `origin/main@c59514249c797fcbb414f404f7e4310cf58fbe80`; PR 294 and later security remediations |
| Facilities, professional licences, memberships, action-level RBAC, and forced-RLS foundations exist | verified fact | Features 002/003 and canonical identity contracts |
| Notification/outbox, discovery, session step-up, audit, health, and restore foundations exist | verified fact | Features 005–008 |
| `OPEN-TEAM-001` is formally closed | verified fact | PRD §14.1 and Master §14.1: Product Owner approval dated 2026-08-25; Yousef solely owns `specify -> clarify -> plan -> tasks -> analyze -> taskstoissues`; implementation assignments activate only under approved specs/tasks, create no independent lifecycle approver, grant no runtime/repository permission, and implementation still requires Yousef's explicit authorization |
| `cash_on_arrival` is the sole enabled payment method | SHIFAA policy | `FR-CLINIC-008`; digital payment excluded until `FR-PAY-001` prerequisites close |
| Feature 009 test-only P0 compositions | Approved versioned visual baseline; Feature 009 gate satisfied | [`decisions/OPEN-UX-001-test-only-p0-baselines.md`](./decisions/OPEN-UX-001-test-only-p0-baselines.md) freezes functional compositions and IDs; 492 source-node/version/SHA-mapped references exist; exact Product Owner and Feature 009 Design Lead approvals were recorded after digest revalidation; program-wide `OPEN-UX-001` remains applicable to future UI features |
| Visual tolerance and formal automated acceptance are unresolved | OPEN | `OPEN-UX-002` blocks verification claims |
| Generated payloads, physical DDL/RLS, and client parity close incrementally | OPEN | `OPEN-TECH-002`, earliest effect `IMPLEMENTING` |
| Formal device/network/accessibility-performance profile is unresolved | OPEN | `OPEN-TECH-003`, earliest effect `VERIFYING` |
| Production SMS is disabled | OPEN | `OPEN-VENDOR-002`, earliest effect `RELEASE_APPROVED for SMS/OTP` |
| Production PHI/retention/article claims and formal UAT remain disabled | OPEN | `OPEN-LEGAL-001/002/007`; `OPEN-PRODUCT-001` |

## 2. Egyptian regulatory and legal validation

- [x] The processing purpose is appointment discovery, scheduling, check-in, queue operation, and scoped notification; production inventory approval remains gated.
- [x] Appointment, queue, reason, and relationship data are sensitive health/operational data; public doctor discovery is a minimum verified professional/facility projection.
- [x] No new consent surface or legal basis is invented; current self/guardian/delegate authority is resolved from canonical relationships for every mutation.
- [x] Data is minimized by actor projection; no patient/queue identity, free-text reason, token, or destination is allowed in logs, metrics, or general event payloads.
- [x] Retention class is recorded, but duration/deletion remains unresolved under `OPEN-LEGAL-002`; no purge automation is authorized.
- [x] Production geography, processor, licence, and permit evidence remains under `OPEN-LEGAL-001`.
- [x] DPO and article-level production claims remain gated by `OPEN-LEGAL-001/007`.
- [x] Doctor and clinic actions require current facility and professional-licence facts; the feature makes no new statutory interpretation.
- [x] Controlled medicine, e-prescription, EPTTS, disability, donation, AI, and digital-payment gates are outside this feature; digital payment is expressly disabled.
- [x] Security incidents and data-subject requests use existing Feature 005/008 governance without creating new operations.
- [x] No new Egyptian-law statement is introduced.

**Planning gate:** `PLAN_APPROVED` was explicitly granted by Yousef Osama, Product Owner, on 2026-09-10 for planning only. `OPEN-UX-002` and all other retained gates remain open at their recorded later stages. No implementation, task publication, Issue creation, commit, or push is authorized.

## 3. User Scenarios & Testing

### Journey J-01 — Discover and book a doctor

1. Given a public or authenticated user searching within the doctor-discovery slice.
2. When specialty, facility, location/distance, availability, or date filters are applied and an available slot is selected.
3. The system shows only active licensed doctors at verified facilities, the facility-defined fee, `cash_on_arrival`, next slot, freshness, and a final patient-context confirmation.
4. A successful authenticated booking returns one confirmed appointment; an identical retry returns the stored outcome and a competing booking cannot confirm the same doctor time range.

### Journey J-02 — Manage an appointment

1. Given the patient or a currently authorized guardian/delegate viewing the correct patient context.
2. When the actor views an appointment, cancels or reschedules a `confirmed` appointment before its scheduled start, cancels a `reschedule_required` appointment without a replacement prerequisite, reschedules a `reschedule_required` appointment to a valid future replacement, or checks in an eligible `confirmed` appointment.
3. The system applies the one valid versioned transition, atomically preserves the old slot unless a replacement is acquired, shows status/reference/time/next step, and never implies digital payment/refund.
4. The mutation, idempotency result, audit record, and minimum outbox effect are atomic where an event is required.

### Journey J-03 — Operate today's clinic queue

1. Given a named clinic member with current action permission at the selected facility and doctor/date scope.
2. When `checkInAppointment` ends the appointment at `checked_in`, it creates exactly one `waiting` queue entry; authorized staff may call it to `called`, reorder its position with a required reason, or complete a `called` entry to queue state `completed`.
3. Queue actions in this feature do not advance the appointment beyond `checked_in`; the clinic sees a minimum role-projected queue, while the patient sees only their own position, estimate, last-updated time, and stale state.
4. Reconnect reconciles from authoritative server state; stale versions fail without partial reorder or duplicate queue numbers.

### Journey J-04 — Manage schedule, delay, and absence

1. Given an authorized doctor or owner acting at the selected facility and date.
2. When a schedule or exception is created/updated, a delay is declared, or an absence interval is declared.
3. The system rejects overlap/conflict, scopes effects to the same facility/doctor/civil date, and identifies the bounded affected appointment count.
4. A delay replaces the current scoped overlay without accumulating minutes and creates deduplicated notice work; absence changes only intersecting `confirmed`/`checked_in` appointments to `reschedule_required`, removes associated `waiting`/`called` queue entries, offers valid same-facility/same-doctor replacement slots, and creates minimum outbox events without enabling production SMS.

### Alternate, failure, and degraded paths

| Case | Trigger | UI/API result | State/audit effect | Recovery |
|---|---|---|---|---|
| Permission denied | Wrong patient relationship, facility, membership, licence, action, or purpose | Minimum localized denial; no sensitive projection | No domain effect; denied-access evidence where policy requires | Switch to a currently authorized context |
| Offline/disconnected | Read or mutation attempted without connectivity | Persistent offline/stale state; mutation is not queued | No client-authored domain effect | Reconnect, reconcile, then explicitly retry with the same key if outcome is unknown |
| Notification adapter failure | Delay/absence delivery adapter unavailable | Appointment state remains authoritative; delivery is pending/retrying/failed without a success claim | Bounded attempt and DLQ evidence only | Retry through existing notification policy; alternate non-SMS instructions remain visible |
| Duplicate/replay | Same idempotency key and same body | Stored canonical result | Exactly one domain/audit/outbox effect | None |
| Body mismatch | Same key with different request | Stable conflict/problem | No second effect | Submit a new intentional request/key |
| Concurrent booking/change | Slot exclusion, schedule change, queue version, or appointment version loses race | Conflict plus refreshed authoritative options | Losing transaction has no partial effect | Refresh and choose a current slot/action |
| Invalid transition | Operation not allowed from current appointment/queue state | Stable localized problem and current state | No partial effect | Use an allowed current-state action |
| Stale queue/availability | Connection gap or freshness qualification fails | Last-updated time plus `May be outdated` or `Unknown`; never shown as current | No write | Refresh/reconnect and reconcile |
| Absence | A `confirmed` or `checked_in` appointment intersects an authorized absence | `reschedule_required` plus current same-facility/same-doctor replacement suggestions; no cancellation/payment claim | Atomic appointment, applicable queue `removed`, version, audit, and outbox effects | Patient selects a current replacement slot or follows clinic guidance |

## 4. Requirements

### Functional Requirements

| Target PRD requirement | Required feature behavior | Acceptance coverage |
|---|---|---|
| `FR-FAC-005` | Every schedule, exception, delay, and absence is bound to one verified facility, one licensed doctor, and the applicable date/interval. | `AC-04`, `AC-11`, `AC-12` |
| `FR-CLINIC-001` | Search and availability show only active licensed doctors and verified facility identity with specialty, facility, distance/date/availability filters, fee, and next slot. | `AC-01`, `AC-02` |
| `FR-CLINIC-002` | Booking is idempotent and prevents two confirmed appointments from occupying the same doctor time range. | `AC-03`, `AC-05` |
| `FR-CLINIC-003` | Appointment status is restricted to `requested`, `confirmed`, `checked_in`, `in_queue`, `in_consultation`, `completed`, `cancelled`, `no_show`, or `reschedule_required`; only the clarified versioned transitions occur, and unreachable canonical states are not given hidden producers. | `AC-06`, `AC-07`, `AC-08` |
| `FR-CLINIC-004` | Check-in ends the appointment at `checked_in` and atomically creates one doctor/facility/civil-date-scoped `waiting` queue entry; reorder is limited to currently authorized `waiting` entries with valid target/version and a bounded restricted reason, and atomically recalculates affected positions/estimates without changing appointments. | `AC-08`, `AC-09`, `AC-10` |
| `FR-CLINIC-005` | The latest valid facility/doctor/civil-date delay declaration supersedes the prior active overlay without accumulation or duplicate notices; absence moves only intersecting `confirmed`/`checked_in` appointments to `reschedule_required`, removes associated `waiting`/`called` entries, and offers current same-facility/same-doctor replacements without holds. | `AC-11`, `AC-12`, `AC-13` |
| `FR-CLINIC-008` | The facility-defined fee is disclosed before confirmation and the only enabled payment outcome is `cash_on_arrival`. | `AC-01`, `AC-03`, `AC-14` |
| Doctor-search slice of `FR-DISC-001` | Doctor discovery consumes verified facility identity and freshness-qualified operational signals only; stock and review slices remain excluded. | `AC-01`, `AC-02` |

## 5. Domain model and invariants

### Entities and ownership

| Entity | Owning domain | Authoritative source | Lifecycle owner |
|---|---|---|---|
| Schedule | Clinical scheduling | `clinical.schedules` | Authorized doctor/clinic owner at the bound facility |
| Schedule exception | Clinical scheduling | `clinical.schedule_exceptions` | Authorized doctor/clinic owner at the schedule facility |
| Appointment | Clinical scheduling | `clinical.appointments` | Core API under subject/clinic action authorization |
| Queue entry | Clinical queue | `clinical.queue_entries` | Core API under clinic queue authorization; subject read projection only |
| Doctor discovery projection | Discovery | Verified identity/facility/licence plus current schedule projection | Core API read projection |
| Notification delivery attempt | Existing notification foundation | Existing notification/outbox records | Existing worker/operator policy |

### State models

Appointment states are the exact nine PRD values. Queue states are the exact five Data/RLS values `waiting`, `called`, `in_service`, `completed`, and `removed`. Schedule exceptions are the exact four values `blocked`, `added`, `delay`, and `absence`.

| Existing Feature 009 operation | Appointment transition/effect | Queue transition/effect | Boundary condition |
|---|---|---|---|
| `createAppointment` | Creates a new appointment in `confirmed`. | None. | It never creates `requested` or a queue entry. |
| `cancelAppointment` | `confirmed` before scheduled start → `cancelled`; `reschedule_required` → `cancelled` without requiring replacement-slot availability. | None because ordinary cancel is denied after `checked_in`. | Requires current actor authority and version; it creates no refund or digital-payment effect. |
| `rescheduleAppointment` | `confirmed` before scheduled start → `confirmed` at the replacement slot; `reschedule_required` → `confirmed` only with a valid future replacement. | None because ordinary reschedule is denied after `checked_in`. | Updates the same appointment; it acquires the replacement and releases the old slot atomically, preserving the original on failure. |
| `checkInAppointment` | `confirmed` → `checked_in`; the appointment ends this operation in `checked_in`. | Atomically creates exactly one matching queue entry in `waiting`. | A retry/race cannot create a second queue entry, and check-in never advances the appointment to `in_queue`. |
| `callQueueEntry` | No appointment-state change. | `waiting` → `called`. | The appointment remains `checked_in`. |
| `reorderQueueEntry` | No appointment-state change. | A `waiting` entry remains `waiting`; its position and every affected waiting position/estimate are recalculated atomically. | `called` and later states are denied; requires current mapped permission, exact facility/doctor/civil-date scope, version, valid target, and bounded non-empty restricted reason. |
| `completeQueueEntry` | No appointment-state change. | `called` → `completed`. | It does not produce appointment `completed` or any consultation/service state. |
| `sendDoctorDelay` | No appointment-state change or appointment-time change. | No queue state or ordering change; the current scoped delay overlay may change matching estimates. | A same-key replay does not supersede, compound, or duplicate work; a latest valid distinct declaration atomically supersedes the prior active overlay for the facility/doctor/civil date. |
| `declareDoctorAbsence` | Only intersecting `confirmed` or `checked_in` appointments → `reschedule_required`. | Any associated `waiting` or `called` entry → `removed`, in the same transaction. | It offers only future, currently effective, unreserved slots for the same facility and doctor, ordered earliest-first; offers are not holds. |

Appointment states `requested`, `in_queue`, `in_consultation`, `completed`, and `no_show` remain valid canonical appointment states but have no Feature 009 producer. Queue state `in_service` remains valid with no Feature 009 producer; queue `removed` is produced only by the clarified absence side effect above. No substitute operation, timed automation, implicit producer, or client-authored transition may make an otherwise unreachable state reachable.

All unspecified transitions are denied. No encounter is created and no Feature 010 state is implied.

### Invariants and concurrency

- A doctor time range cannot overlap another appointment while either is `confirmed`, `checked_in`, `in_queue`, or `in_consultation`; the loser receives a conflict with no partial effect.
- One appointment has at most one queue entry; queue number is unique for facility/doctor/queue date and materialized scope must equal the appointment.
- Schedule and exception effects never cross facility, doctor, or applicable date/interval.
- Schedule status is restricted to `active`, `paused`, and `retired`. An active schedule publishes eligible availability, a paused schedule publishes none until reactivated, and `retired` is terminal and publishes none. Status transitions outside `active ↔ paused`, `active → retired`, and `paused → retired` are denied.
- Recurrence is a bounded weekly civil-time structure: one schedule contains the complete set of ISO weekdays `1..7`, each with zero or more non-overlapping `{start_local, end_local}` windows, for that schedule's validity period. RFC 5545 recurrence and UTC-recurring clinic hours are excluded.
- Every operational interval is half-open `[start, end)`. `valid_from` and `valid_to` are inclusive civil dates in the schedule's IANA timezone; the instant end boundary is the start of the local civil day immediately after `valid_to`.
- Slot identity and persistence resolve to one unambiguous UTC instant while retaining the schedule timezone and local civil-date context. Civil-date and queue-date comparisons use that schedule timezone, not the client or server default timezone.
- Clinic wall-clock semantics survive timezone-rule changes: a nonexistent local time produces no slot, while an ambiguous local time produces exactly one slot using the earlier offset.
- Active schedule records for the same facility and doctor cannot have overlapping validity periods; all weekly windows for one validity period belong to the same schedule.
- Availability precedence is `absence > blocked > added > base`. `added` cannot overlap already-effective base or added availability and cannot create availability inside an effective `absence` or `blocked` interval. `absence` and `blocked` may overlap, but the interval remains unavailable and produces no duplicate effect.
- `delay` is evaluated separately as a non-availability overlay: it never creates or deletes a slot and never silently changes an appointment instant. `sendDoctorDelay` is the sole existing dedicated supersession path and atomically replaces the prior active facility/doctor/civil-date delay overlay with the latest valid distinct declaration; it does not create an additional operation or hidden write path.
- Ordinary `createScheduleException` rejects every positive-duration same-type exception overlap on the same schedule. Half-open boundary-touching intervals are permitted. A same-key identical retry replays its stored canonical result; a different idempotency key attempting a duplicate or overlap returns a deterministic conflict with no partial effect. Ordinary create never auto-coalesces. Delay supersession occurs only through `sendDoctorDelay` and is not coalescing.
- Every mutation uses atomic idempotency, current authorization, attributable audit, required outbox, canonical response, and completed idempotency state in one transaction where contracted.
- Versioned operations reject stale versions. Reads reconcile after reconnect; clients never authoritatively reorder or confirm locally.
- Reasons required for cancellation, rescheduling, exception, absence, or reorder are purpose-limited and never copied into logs, metrics, or unrestricted event payloads.
- Ordinary cancellation/rescheduling is allowed only for `confirmed` appointments before their scheduled start. A `reschedule_required` appointment may be cancelled without replacement availability; rescheduling it requires a valid future replacement. After `checked_in`, ordinary cancellation/rescheduling is denied. No cancellation penalty, refund, PSP, wallet, or payment-custody behavior exists; `cash_on_arrival` remains the sole payment outcome.
- Rescheduling mutates the same appointment and atomically acquires the replacement before releasing the old slot. A conflict, stale version, invalid slot, authorization failure, or transaction failure leaves the original appointment and slot unchanged.
- Replacement suggestions are future, currently effective, unreserved slots for the same facility and same doctor, ordered earliest-first. Suggestions create no hold; only a successful `rescheduleAppointment` concurrency check acquires the slot.
- `reorderQueueEntry` applies only to `waiting`. It requires current permission mapped to the operation, exact facility/doctor/civil-date scope, current queue version, a valid target position, and a bounded non-empty restricted reason. It atomically recalculates affected waiting positions and estimates without changing appointment state. `called`, `in_service`, `completed`, and `removed` entries cannot be reordered.
- Delay has one deterministic current overlay per facility, doctor, and applicable civil date. A same-key identical replay does not supersede the current overlay, compound the estimate, or duplicate notification work; `sendDoctorDelay` atomically supersedes the prior active projection only for a latest valid distinct declaration rather than accumulating minutes. Delay may recalculate matching estimates and create scoped governed notification work but never reorders entries, changes appointment times or states, changes queue states, or creates availability.

## 6. Exact data and RLS contract

### Required logical fields and constraints

| Table | Required feature data | Mandatory constraint/classification |
|---|---|---|
| `clinical.schedules` | doctor, facility, IANA timezone, bounded weekly weekday/local-window recurrence, inclusive civil `valid_from`/`valid_to`, slot duration, `active`/`paused`/`retired` status, version | Doctor/facility/date scoped; one non-overlapping active validity period per doctor/facility; local windows do not overlap; `retired` terminal; sensitive operational data |
| `clinical.schedule_exceptions` | schedule, half-open start/end, exact exception type, reason, version, current/supersession semantics where needed for delay history | Same schedule/timezone scope; `absence > blocked > added > base`; ordinary create rejects positive-duration same-type overlap while boundary-touch is allowed and never coalesces; `sendDoctorDelay` alone atomically supersedes the one current non-accumulating facility/doctor/civil-date delay overlay; reason is restricted |
| `clinical.appointments` | patient, doctor, facility, start/end, fee minor units/currency, `cash_on_arrival`, status, source/referral reference if already lawful, cancellation reason, version | Doctor active-range exclusion; atomic same-record reschedule; `no_show` has no Feature 009 producer; patient health/operational data; no digital payment artifact |
| `clinical.queue_entries` | unique appointment, materialized facility/doctor, queue date/number, queue status, optional authorized reorder reason, timestamps, version | Scope-equality guard; unique facility/doctor/date/number; reorder only while `waiting`; absence atomically changes associated `waiting`/`called` to `removed`; patient identity hidden from unrelated subjects |

Exact physical types, generated schema shapes, indexes, and retention duration are not invented here; they must conform to canonical UTC/RFC 3339, integer-minor-unit/ISO-currency, Data/RLS, `OPEN-TECH-002`, and `OPEN-LEGAL-002` during later approved stages.

### Migration constraints

- Later planning must use expand/validate/activate/contract sequencing and fail closed on incompatible existing rows.
- No fabricated backfill may assert confirmed booking, queue order, licence validity, fee, notification delivery, or audit truth.
- Roll-forward is required where rollback could erase or reinterpret appointment/queue history.
- Backup and restore evidence must cover schedules, exceptions, appointments, queues, idempotency, audit, and outbox consistently under `NFR-AVAIL-001`.

### RLS/action matrix

| Actor/context | Read | Create | State action | Negative coverage |
|---|---|---|---|---|
| Public/auth discovery | Minimum verified doctor/facility/availability/fee projection only | Denied | Denied | unverified licence/facility and private-field denial |
| Patient self | Own appointments and own queue-position projection | Own appointment in valid context | Own allowed cancel/reschedule/check-in | other-patient and cross-context denial |
| Guardian/delegate | Managed patient only under current exact permission | Same bounded permission | Same bounded permission | expired/revoked/wrong-permission denial |
| Doctor/owner | Bound facility/date schedule and authorized work projection | Bound schedule/exception | Catalog-authorized schedule/delay/absence actions | cross-facility/licence/state denial |
| Clinic member | Minimum bound facility/doctor/date worklist | Check-in/queue effect only where operation and permission allow | Catalog-authorized appointment/queue action | wrong facility/action/patient-purpose denial |
| Worker | Minimum eligible outbox claim and current recipient resolution | No user-domain insert | Delivery attempt only | general table/direct PHI denial |
| Unrelated/admin/general client | Denied except separately cataloged support/complaint projection outside Feature 009 | Denied | Denied | default-deny proof |

Every new table must use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Online execution uses named non-owner roles without `BYPASSRLS` or service role. Any security-definer helper must have a fixed search path, revoke public execute, accept minimum typed context, and re-resolve current database facts rather than trust mutable JWT metadata.

## 7. Exact operation contract boundary

The future machine-readable contract must contain exactly the following rows and no additional Feature 009 operation. `I` means idempotency is required; `V` means current version/`If-Match` is required. Full payload schemas must be generated under `OPEN-TECH-002` without renaming paths or operation IDs.

| Operation | Method/path | Canonical actor | Minimum outcome | Flags |
|---|---|---|---|---|
| `searchDoctors` | `GET /discovery/doctors` | PUB/auth | verified doctors/slots/fees for specialty/facility/near/date/cursor filters | — |
| `listDoctorAvailability` | `GET /clinics/{facilityId}/doctors/{doctorId}/availability` | PUB/auth | bounded date-range slots and version | — |
| `createSchedule` | `POST /clinics/{facilityId}/schedules` | doctor/owner | facility-bound weekly civil-time schedule in an approved status | I |
| `updateSchedule` | `PATCH /clinics/{facilityId}/schedules/{scheduleId}` | doctor/owner | updated recurrence/status version; terminal retirement enforced | I,V |
| `createScheduleException` | `POST /clinics/{facilityId}/schedules/{scheduleId}/exceptions` | doctor/owner | ordinary half-open typed-exception create; same-type overlap/duplicate under another key conflicts without coalescing | I,V |
| `createAppointment` | `POST /appointments` | PAT/GUA/DEL | one confirmed appointment | I |
| `getAppointment` | `GET /appointments/{appointmentId}` | participant/scoped CLN | role-projected appointment/queue/referral reference | — |
| `listAppointments` | `GET /appointments` | subject/CLN | bounded cursor page filtered by patient/facility/doctor/status/date | — |
| `cancelAppointment` | `POST /appointments/{appointmentId}/cancel` | subject/CLN | allowed `confirmed`/`reschedule_required` appointment to cancelled version; cash-only consequence | I,V |
| `rescheduleAppointment` | `POST /appointments/{appointmentId}/reschedule` | subject/CLN | same appointment atomically moved to one acquired current replacement slot | I,V |
| `checkInAppointment` | `POST /appointments/{appointmentId}/check-in` | subject/CLN | appointment ending at `checked_in` and unique queue entry starting at `waiting` | I,V |
| `getQueue` | `GET /clinics/{facilityId}/queues` | CLN | authorized doctor/date cursor page | — |
| `getMyQueuePosition` | `GET /appointments/{appointmentId}/queue-position` | subject | own position/estimate/updated/stale projection | — |
| `callQueueEntry` | `POST /queue-entries/{queueEntryId}/call` | CLN | queue-only `waiting` → `called` version; appointment remains `checked_in` | I,V |
| `reorderQueueEntry` | `POST /queue-entries/{queueEntryId}/reorder` | authorized CLN | `waiting`-only target position/restricted reason and atomically recalculated queue version/estimates | I,V |
| `completeQueueEntry` | `POST /queue-entries/{queueEntryId}/complete` | CLN | queue-only `called` → `completed` version; no appointment-state change | I,V |
| `sendDoctorDelay` | `POST /clinics/{facilityId}/doctors/{doctorId}/delay` | doctor/owner | dedicated atomic supersession of the current scoped delay overlay, affected estimates/appointments, and deduplicated outbox references | I |
| `declareDoctorAbsence` | `POST /clinics/{facilityId}/doctors/{doctorId}/absence` | doctor/owner | absence exception, intersecting `confirmed`/`checked_in` appointments, removed active queue entries, and same-doctor/facility replacement suggestions | I |

All operations require request correlation and localized RFC 9457 problems. Authenticated sensitive responses are private/no-store. Mutations validate current actor, patient relationship, facility membership, professional licence, resource scope, action, state, and version before effects. Read pages use bounded opaque cursors. Rate limits key on authenticated actor plus route/risk, with IP only supplemental. Audit and outbox payloads exclude raw reasons, coordinates, contact destinations, tokens, credentials, and unrelated appointment details.

## 8. UI/UX and edge-state matrix

| App/route | Required states and content | Controls/focus | Offline/stale/conflict behavior | Baseline |
|---|---|---|---|---|
| Patient `/discover` | loading, empty, location denied, filtered doctors, stale/unknown, error; verified facility/licence, fee, next slot | Search/filter order and named doctor-detail action | Read-only stale results are labeled; no false availability | `F009-P0-PAT-DISCOVER-001` |
| Patient `/doctors/:id` | doctor/facility identity, availability, fee, `cash_on_arrival`, no slots/error | Date/slot selection then explicit booking action | Booking disabled offline; current availability refetched before confirmation | `F009-P0-PAT-DOCTOR-001` |
| Patient `/appointments/new` | selected patient context, slot, fee, cash instruction, submitting/conflict/success | Context confirmation, review, one primary submit, focus to error summary/status | Same idempotency key on uncertain retry; conflict returns to current slots | `F009-P0-PAT-BOOK-001` |
| Patient `/appointments/:id` | all authorized states, queue position/estimate, current non-accumulating delay, reschedule-required suggestions, stale/error | Only clarified current-state actions; destructive cancellation confirmation; replacement suggestions state that no slot is held | No offline mutation; reconnect reconciles appointment/queue | `F009-P0-PAT-APPOINTMENT-001` |
| Clinic `/today` | facility/role/AAL/environment, doctor/date worklist, empty/delay/absence/error | Keyboard-first filters and named row actions | Stale label; no local authoritative transition | `F009-P0-CLN-TODAY-001` |
| Clinic `/queue` | waiting/called/in-service/completed/removed projections, freshness, current delay overlay, and restricted reorder reason | Stable queue order; reorder only on waiting entries; accessible call/reorder/complete controls and focus return | No offline reorder; version conflict refreshes whole authoritative queue | `F009-P0-CLN-QUEUE-001` |
| Clinic `/schedule` | recurrence, exceptions, overlap/conflict, delay/absence, affected count | Accessible date/time controls, reason fields, explicit confirmation | No offline save; current version required | `F009-P0-CLN-SCHEDULE-001` |
| Clinic `/appointments/:id` | minimum appointment, patient context, state, fee/cash, queue and reschedule-required states | Only current action-permitted controls; result region includes status/reference/time/next step | No offline mutation; stale/version conflict gives refresh path | `F009-P0-CLN-APPOINTMENT-001` |

All routes are Arabic `ar-EG` first with root RTL and complete English `en-EG` LTR parity. Logical layout mirrors; codes, currency codes, reference IDs, and RFC 3339 timestamps are bidi-isolated. Screens must pass visible keyboard focus/order/return, named controls and polite live queue announcements, 200% text, applicable 400% reflow, forced colors/high contrast, reduced motion, and 44×44 targets with 48 px patient primary actions. Status never relies on color/icon alone. The immutable functional composition, state, confirmation, result-region, focus, responsive, and evidence-ID contract is defined in [`decisions/OPEN-UX-001-test-only-p0-baselines.md`](./decisions/OPEN-UX-001-test-only-p0-baselines.md) and is approved for Feature 009 affected UI. Styling remains neutral and replaceable; final branding, logo, colors, typography, decoration, illustrations, polish, and animation language are deferred to the project-wide Polish phase. `OPEN-UX-002` still prevents formal automated visual-regression acceptance or a pixel-identical implementation claim until its renderer, tolerance, and review requirements close.

## 9. Notifications and asynchronous events

| Source | Recipient policy | Channel/template | Allowed projection | Dedup/order | Failure behavior |
|---|---|---|---|---|---|
| Doctor delay | Each currently affected appointment subject; resolve current governed address at claim time | No Feature 009 template exists at this baseline. A paired Arabic/English template must be authored, independently published, and schema-validated through the existing Feature 005 governance before use; production SMS remains disabled. | Minimum appointment reference, facility/doctor display projection, current superseding delay/date, action link/reference; no diagnosis/free-text reason | Appointment + scoped delay event/version; same-key replay neither supersedes nor duplicates work, and superseded overlays cannot duplicate work; preserve aggregate order | Existing bounded retry/DLQ policy may be reused only after the Feature 009 template is approved; UI remains authoritative and never claims delivery without receipt |
| Doctor absence | Each appointment moved to `reschedule_required` | No Feature 009 absence template exists at this baseline. Any notice requires a paired Arabic/English governed release through the existing template lifecycle; production SMS remains disabled. | Minimum appointment reference, facility/doctor display projection, affected interval, replacement-availability instruction | Appointment + absence event/version | Existing retry/DLQ policy may be reused only with an approved Feature 009 template; rescheduling remains available through authoritative UI |
| Appointment/queue state events | Subject only where an approved existing template/channel applies | No new channel or operation | Minimum IDs/status/time needed by the existing consumer | Aggregate/version order | Delivery failure never rolls back an already committed valid state |

Emergency Contacts receive **no Feature 009 event**. Guardian/delegate notification is not inferred from management authority; recipient policy follows the appointment subject and separately approved notification preferences/relationships.

## 10. Security, privacy, and abuse cases

| Threat/misuse | Control | Required verification |
|---|---|---|
| Other-patient or cross-facility access | Full-context API authorization plus forced RLS and minimum projections | Patient/guardian/delegate/unrelated/clinic cross-matrix |
| Unlicensed or stale workforce action | Re-resolve current licence, facility membership, action, and state | expired/suspended/rejected/unverified and revoked-membership negatives |
| Double booking/check-in/queue number | Exclusion/uniqueness plus one atomic transaction | concurrent winner/loser tests at database and API boundaries |
| Replay/body substitution | Atomic idempotency and request fingerprint | identical retry, same-key-different-body, crash/reclaim tests |
| Queue manipulation | Action-level authorization, current queue version, mandatory restricted reason, `waiting`-only transition guard, attributable audit | unauthorized/non-waiting reorder, missing reason, invalid target, stale version, cross-doctor/civil-date tests |
| Absence/delay overreach | Bound facility/doctor/civil-date/interval, affected-set calculation, atomic queue removal, and one current non-accumulating delay overlay | adjacent date/facility/doctor exclusion, repeated-delay dedup, distinct-delay supersession, and partial-effect tests |
| Discovery leakage | Public allow-list and verified/current predicates | unverified doctor/facility and private-field sentinel tests |
| PHI/secret telemetry | Fixed low-cardinality telemetry and prohibited-value scanning | response/log/trace/metric/evidence sentinel scan |
| Offline duplicate mutation | No offline mutation queue; explicit same-key retry only after reconciliation | disconnect before/after commit and reconnect tests |
| SMS/vendor overclaim | Production adapter kill switch and truthful delivery state | production configuration denial and local synthetic failure tests |

## 11. Success Criteria

### Measurable outcomes

| ID | Outcome | Measurement | Threshold |
|---|---|---|---|
| `SC-001` | Eligible patients find only verified active licensed doctors with fee and current availability. | Deterministic discovery matrix | 100% qualifying results; 0 unverified results |
| `SC-002` | Booking and rescheduling never double-confirm a doctor time range. | Concurrent slot-race profiles | Exactly 1 winner per contested range; 0 partial losers |
| `SC-003` | Retries are safe. | Same-key replay/body-mismatch vectors | 1 effect for identical replay; 0 second effects for mismatch |
| `SC-004` | Queue visibility and actions remain correctly scoped. | Actor/facility/doctor/date/RLS matrix | 100% expected allows/denies; 0 cross-scope disclosure |
| `SC-005` | Delay and absence affect only intended appointments and create truthful notification work. | Boundary-date and failure vectors | 100% exact affected set; 0 production-SMS success claims |
| `SC-006` | Offline/reconnect experiences preserve server authority. | Commit-boundary disconnect matrix | 0 offline writes; 100% reconciled current state after reconnect |
| `SC-007` | Arabic and English journeys are accessible. | P0 UI matrix | 100% required keyboard, semantic, reflow, contrast, target, locale, and reduced-motion checks in engineering profile |
| `SC-008` | Patient experience meets assigned performance; reads/mutations meet regional service targets. | Approved synthetic load profile | Patient LCP p95 ≤3.0 s and input response p95 ≤200 ms; reads p95 ≤400 ms; mutations p95 ≤800 ms, subject to `OPEN-TECH-003` limitation |
| `SC-009` | Availability and recovery objectives remain measurable. | Synthetic health/restore/reconnect evidence | 99.9% monthly target represented; RPO ≤15 min and RTO ≤60 min; formal production claim remains gated |
| `SC-010` | The released contract has no scope drift. | Catalog/OpenAPI/client/route/trace parity | Exactly 18 Feature 009 operations; 0 added/renamed/omitted operations |

### Acceptance criteria and deterministic vectors

- **AC-01 Verified discovery:** qualifying verified doctor/facility rows appear with fee/next slot; unverified/expired/cross-slice records do not.
- **AC-02 Availability freshness:** date-bounded slots reconcile under the approved weekly civil-time, precedence, validity-date, and DST rules; stale/unknown data is labeled and never presented as confirmed.
- **AC-03 Booking:** one authorized patient-context action produces one confirmed cash-on-arrival appointment with status/reference/time/next step.
- **AC-04 Schedule scope:** the same doctor at another facility/date is unaffected by a schedule or exception mutation; overlapping active validity periods, overlapping local windows, and ordinary `createScheduleException` positive-duration same-type overlaps are rejected without partial effect, while boundary-touching exception intervals remain valid and delay supersession is available only through `sendDoctorDelay`.
- **AC-05 Race/replay:** concurrent booking has exactly one winner; identical retry returns stored response; changed body conflicts.
- **AC-06 Appointment states:** `createAppointment` creates `confirmed`; `checkInAppointment` moves `confirmed` to `checked_in`; every other Feature 009 appointment transition resolved by CLARIFY-009-003 succeeds once, while all unspecified transitions fail without partial effect. Appointment `requested`, `in_queue`, `in_consultation`, `completed`, and `no_show`, plus queue `in_service`, have no Feature 009 producer; queue `removed` is produced only by the clarified absence side effect.
- **AC-07 Cancel/reschedule:** only clarified `confirmed`-before-start actions succeed; `reschedule_required` cancellation succeeds without replacement availability, while its reschedule requires a valid future replacement. Reschedule acquires the replacement and releases the old slot atomically on the same appointment, every failure preserves the original, and no digital refund/payment behavior is created.
- **AC-08 Check-in:** valid check-in ends the appointment at `checked_in` and creates exactly one matching `waiting` queue entry; duplicate/race cannot allocate a second number, and no queue operation changes the appointment state.
- **AC-09 Queue privacy:** subject sees only own position/estimate; clinic receives only authorized facility/doctor/date projection.
- **AC-10 Queue reorder:** only a currently authorized, exactly scoped, current-version `waiting` entry with a valid target and bounded non-empty restricted reason can change order; all affected waiting positions/estimates change atomically, no appointment state changes, and called/later entries are denied.
- **AC-11 Delay:** one current facility/doctor/civil-date delay overlay affects only matching projections and creates ordered minimum notification work per eligible subject; same-key replay does not supersede, compound, or duplicate, while a latest valid distinct `sendDoctorDelay` declaration atomically supersedes rather than accumulates. Ordinary `createScheduleException` still rejects same-type overlap, and neither path changes availability, ordering, appointment time, or state.
- **AC-12 Absence:** an intersecting absence moves only `confirmed`/`checked_in` appointments to `reschedule_required`, atomically changes associated `waiting`/`called` entries to `removed`, and offers earliest future current unreserved same-facility/same-doctor slots without holding them.
- **AC-13 Worker failure:** retry/DLQ evidence is truthful, the appointment state is preserved, prohibited fields are absent, and production SMS remains disabled.
- **AC-14 Cash-only:** every booking/detail/cancel/reschedule surface shows `cash_on_arrival`; no PSP/card/wallet/refund artifact exists.
- **AC-15 Authorization/RLS:** full actor, relationship, licence, facility, doctor, date, action, purpose, and stale-context negatives deny by default.
- **AC-16 UI/degraded:** Arabic RTL and English LTR patient/clinic journeys cover loading, empty, permission, offline, stale, recoverable/unrecoverable error, conflict, and success with required accessibility behavior.
- **AC-17 Restore/rollback:** synthetic restore preserves mutually consistent appointment, queue, idempotency, audit, and outbox truth without fabricated history.
- **AC-18 Scope:** automated inventory comparison proves exactly the 18 named operations and the frozen requirements/exclusions.

## 12. Observability, rollout, rollback, and incidents

- SLO/SLI: read/mutation p95, booking conflict rate, queue reconciliation lag, oldest pending notification, DLQ count, availability, and restore objectives; labels are bounded and contain no person/patient/facility/appointment/queue IDs.
- Logs/traces: request/trace correlation and fixed reason/status codes only; no free-text reason, coordinates, patient data, contact destination, payload, token, or credential.
- Dashboard/alerts: extend existing health/observability foundations only during later approved planning; do not add a new Feature 009 operation.
- Feature flag/cohort: synthetic graduation environment first; production PHI and provider adapters remain disabled by canonical gates.
- Rollout: expand and validate data/contract behavior before activating writes; Arabic and English patient/clinic evidence precedes PR integration.
- Rollback: disable new entry points; reconcile in-flight authoritative state; roll forward data corrections rather than erase appointment/queue/audit history.
- Kill switch/degraded behavior: disable booking/schedule mutations while preserving truthful minimum reads and contact guidance; notification adapter failure never becomes delivery success.
- Incident/runbook: to be defined during planning within Feature 009; no new route or operation is implied.

## 13. Evidence and approvals

| Gate | Reviewer(s) | Artifact | Decision/date | Blocking findings |
|---|---|---|---|---|
| Scope eligibility | Yousef Osama | Roadmap Feature 009 and baseline `c595142...` | Approved to specify / 2026-09-09 | None for specification |
| Product/QA | Yousef Osama / assigned QA owner | This clarified spec plus later deterministic vectors | Product Owner `SPEC_APPROVED` and planning-only `PLAN_APPROVED` / 2026-09-10; QA evidence remains later-stage | No implementation, task publication, Issue, commit, or push authorization |
| Legal/DPO | Named owners | Existing OPEN register | Not production-approved | `OPEN-LEGAL-001/002/007` |
| Architecture/Security | Named owners | Later plan/threat/RLS evidence | Pending | `OPEN-TECH-002/003`; verification required |
| Design/Accessibility | Product Owner + Design Lead + QA Lead | [`F009-OPEN-UX-001-P0-BASELINES`](./decisions/OPEN-UX-001-test-only-p0-baselines.md), source version `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`, and 492-entry SHA-mapped manifest | Yousef Osama assigned Feature 009 Design Lead; Product Owner and Design Lead exact-set approvals recorded separately / 2026-09-10 | `OPEN-UX-001` satisfied for Feature 009 affected UI; `OPEN-UX-002` remains a later verification gate |
| Vendor | Procurement + Platform Lead + DPO | SMS vendor evidence | Pending | `OPEN-VENDOR-002`; production SMS disabled |
| Team operating model | Yousef Osama | PRD/Master v2.1.2 amendment retained in v2.1.3 | `OPEN-TEAM-001 CLOSED` / 2026-08-25 | No team gate; implementation still requires explicit authorization |
| Release/UAT | Named release/product owners | Later evidence manifest/UAT | Not applicable at specification | `OPEN-PRODUCT-001` and production gates |

## 14. Open items and change log

| Open ID | Owner | Next action/evidence | Blocks gate |
|---|---|---|---|
| `CLARIFY-009-001` | Product/Architecture/Data | **RESOLVED 2026-09-10:** exact appointment/queue transition, producer, and Feature 010 boundary recorded above | None |
| `CLARIFY-009-002` | Product/Architecture/Data | **RESOLVED 2026-09-10:** schedule status, recurrence, timezone/date, precedence, overlap, and DST contract recorded above | None |
| `CLARIFY-009-003` | Product/Clinic Ops/Security | **RESOLVED 2026-09-10:** cancellation/reschedule/no-show, replacement, reorder, and delay-estimate policy recorded above | None |
| `OPEN-UX-001` | Product Owner + Design Lead | **SATISFIED FOR FEATURE 009 AFFECTED UI 2026-09-10:** Yousef Osama was explicitly assigned Feature 009 Design Lead and separately approved, as Product Owner and Design Lead, source `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`, manifest SHA-256 `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`, all eight baseline families, and 492 immutable references after exact digest revalidation. This is not a program-wide closure for future UI features. | None for Feature 009 planning |
| `OPEN-UX-002` | Product Owner + Design Lead + QA Lead | Approve render matrix/tolerance/review rule | `VERIFYING` |
| `OPEN-TECH-002` | API Lead + Data Lead + QA Lead | Generate exact payload/DDL/RLS/client parity in later approved implementation | `IMPLEMENTING` |
| `OPEN-TECH-003` | QA Lead + Platform Lead + Product Owner | Approve reproducible device/network/accessibility-performance profile | `VERIFYING` |
| `OPEN-PRODUCT-001` | Product Owner + UX Research Owner | Complete target-user validation | `RELEASE_APPROVED/UAT` |
| `OPEN-VENDOR-002` | Procurement + Platform Lead + DPO | Approve production messaging vendors/contracts | `RELEASE_APPROVED for SMS/OTP` |
| `OPEN-LEGAL-001/002/007` | Legal counsel + DPO | Complete production PHI, retention, and article-mapping evidence | Production release claims |

| Date | Version | Change and affected FR/NFR/contracts |
|---|---|---|
| 2026-09-10 | `0.1.0-draft` | Initial Feature 009 specification from the frozen roadmap boundary; exactly 18 operations; three bounded clarification items; no planning or implementation. |
| 2026-09-10 | `0.2.0-spec-approved+p0-candidate` | Recorded explicit Product Owner `SPEC_APPROVED`; froze eight TEST-ONLY P0 functional composition IDs and route/state behavior with neutral replaceable styling; retained `OPEN-UX-001` because canonical Design Lead approval and reference-image digests are not yet present. |
| 2026-09-10 | `0.3.0-spec-approved+p0-visual-candidate` | Exported 492 immutable candidate references for all eight routes, both locales, canonical viewports, required states, confirmations, and result paths; recorded source node/version and SHA-256 manifest evidence; retained `OPEN-UX-001` because exact Product Owner acceptance and a formally assigned Design Lead acceptance are not yet recorded. |
| 2026-09-10 | `0.4.0-spec-approved+p0-visual-approved` | Recorded the Feature 009-only Design Lead assignment and separate Product Owner/Design Lead approvals of the exact source version and manifest digest after revalidation; `OPEN-UX-001` is satisfied for Feature 009 affected UI and no longer blocks planning, while program-wide `OPEN-UX-001`, `OPEN-UX-002`, and all later-stage gates remain unchanged. |
| 2026-09-10 | `0.5.0-plan-approved` | Recorded explicit Product Owner `PLAN_APPROVED` for Feature 009 planning only. This authorizes the `speckit-plan` phase and does not authorize implementation, task or Issue publication, commit, or push. |
