# Tasks: Clinic Scheduling, Appointments, and Queue

> **Feature:** `009-clinic-scheduling-appointments-queue` · **Specification:** `SPEC_APPROVED` · **Plan:** `PLAN_APPROVED`
> Every task remains open. This ledger does not authorize implementation, Issue publication, commit, or push.

## Execution rules

- Execute test-first and in dependency order. `[P]` is used only for disjoint files whose listed dependencies are complete and whose tests do not share a mutable Supabase, PostgreSQL, migration, or end-to-end harness.
- Preserve exactly the 18 operations listed below, the nine appointment states, the five queue states, and every clarified producer boundary. Do not add a route, operation, role, relationship, offline write queue, hidden transition, or Feature 010 behavior.
- `cash_on_arrival` is the only payment method. Production SMS remains disabled under `OPEN-VENDOR-002`; Feature 009 delay/absence templates begin as governed bilingual candidates and are not described as published without independent lifecycle evidence.
- Use synthetic data only. Keep `OPEN-UX-002`, `OPEN-TECH-002`, `OPEN-TECH-003`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, and `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007` at their approved later-stage effects.
- The approved `SHIFAA-F009-P0-SOURCE@1.0.0-candidate` visual set is immutable: 492 PNGs, 29,237,789 bytes, manifest SHA-256 `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`. No task may modify, move, recompress, regenerate, or re-hash those PNGs. Actual captures and implementation evidence must use separate evidence paths.
- A checked task without its stated acceptance evidence is incomplete. The root agent owns checkpoint acceptance, task-ledger updates, Git integration, and lifecycle decisions.

## Frozen operation and state inventory

The implementation must expose exactly: `searchDoctors`, `listDoctorAvailability`, `createSchedule`, `updateSchedule`, `createScheduleException`, `createAppointment`, `getAppointment`, `listAppointments`, `cancelAppointment`, `rescheduleAppointment`, `checkInAppointment`, `getQueue`, `getMyQueuePosition`, `callQueueEntry`, `reorderQueueEntry`, `completeQueueEntry`, `sendDoctorDelay`, and `declareDoctorAbsence`.

Appointment states are exactly `requested`, `confirmed`, `checked_in`, `in_queue`, `in_consultation`, `completed`, `cancelled`, `no_show`, and `reschedule_required`. Feature 009 has no producer for appointment `requested`, `in_queue`, `in_consultation`, `completed`, or `no_show`. Queue states are exactly `waiting`, `called`, `in_service`, `completed`, and `removed`; Feature 009 has no producer for queue `in_service`, and only the approved absence side effect produces `removed`.

## Phase 1 — Contract, gate, and deterministic fixture freeze

- [x] T001 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-API-001, NFR-QUALITY-001] Add a fail-closed Feature 009 scope verifier and the planned serial task-level command aliases for the frozen requirements, exact 18 operations, exact routes/states/producers, cash-only boundary, production-SMS kill switch, retained gates, and Feature 010 exclusions — `tools/verify-feature-009-scope.mjs`, `package.json`
  - Depends on: `none`
  - Acceptance evidence: `node tools/verify-feature-009-scope.mjs` exits 0 and prints `operation_count=18`, `appointment_state_count=9`, `queue_state_count=5`, `payment_methods=cash_on_arrival`, and every retained gate without reading or changing PNG bytes

- [x] T002 [P] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add exact canonical OpenAPI 3.1.1/catalog flags, approved query/request/response shapes, problem, cache, cursor, idempotency, and version-header parity verification — `tools/verify-feature-009-contract.mjs`
  - Depends on: `T001`
  - Acceptance evidence: `node tools/verify-feature-009-contract.mjs` exits 0 with OpenAPI `3.1.1`; all 18 operation IDs, methods, paths, and `I`/`V` flags; doctor `near`/`radius`, appointment `status`, and queue cursor/`nextCursor` contracts; availability `version`; queue-position `updatedAt`/`stale`; the closed minimum `PublicDoctorProjection`; private-cache rules; and RFC 9457 problem families matching the approved contract. Negative assertions prove ordinary `createScheduleException` accepts only `blocked|added` and no `delayMinutes`, `UpdateScheduleRequest` rejects `doctorId`, and delay/absence inputs remain exclusive to `sendDoctorDelay`/`declareDoctorAbsence`

- [x] T003 [P] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-DATA-001, NFR-QUALITY-001, NFR-PORT-001] Add deterministic civil-time, DST, exception-precedence, appointment-state, queue-state, delay, absence, retry, and race fixtures — `packages/test-kit/src/clinic-scheduling-fixtures.ts`, `packages/test-kit/src/clinic-scheduling-fixtures.test.ts`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/test-kit test -- clinic-scheduling-fixtures` exits 0 and covers normal, nonexistent, ambiguous, boundary-touching, overlap, stale-version, same-key, changed-body, and competing-writer vectors

- [x] T004 [P] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-PRIV-001, NFR-PRIV-002, NFR-QUALITY-001] Add the patient/guardian/delegate/doctor/owner/clinic/worker/unrelated actor, relationship, licence, facility, doctor, civil-date, action, AAL, and purpose matrix with minimum expected projections — `packages/test-kit/src/clinic-scheduling-security-fixtures.ts`, `packages/test-kit/src/clinic-scheduling-security-fixtures.test.ts`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/test-kit test -- clinic-scheduling-security-fixtures` exits 0 with each authorized cell explicit and every unspecified cell default-denied

- [x] T005 [P] [FR-CLINIC-001, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Add Arabic-first and English-parity strings for all eight routes, nine appointment states, five queue states, cash instructions, confirmations, result regions, and loading/empty/error/offline/stale/conflict/success states — `packages/i18n/src/clinic-scheduling.ts`, `packages/i18n/src/clinic-scheduling.test.ts`, `packages/i18n/src/index.ts`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/i18n test -- clinic-scheduling` exits 0 with zero missing/asymmetric keys, bidi-safe interpolations, and no production-SMS delivery claim

- [x] T006 [P] [NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Add a metadata-only baseline validator and generic checkpoint-evidence verifier scaffold that check the approved source version, manifest digest string, 492-entry route/locale/viewport/state mapping, total recorded byte count, and all eight `F009-P0-*` families without opening, hashing, or rewriting PNG files — `tools/verify-feature-009-ui-baselines.mjs`, `tools/verify-feature-009-evidence.mjs`
  - Depends on: `T001`
  - Acceptance evidence: `node tools/verify-feature-009-ui-baselines.mjs` and `node tools/verify-feature-009-evidence.mjs --self-test` exit 0 with `reference_count=492`, `recorded_bytes=29237789`, all eight families, both locales, canonical viewports, valid checkpoint schemas, and zero PNG file reads or writes

**Checkpoint A — Frozen boundary:** T001–T006 pass; no operation, state, route, payment, vendor, or gate drift is present before schema work begins, and the metadata-only visual check matches the approved manifest digest string, 492-entry mapping, recorded byte count, and eight families. This check does not read or establish fresh byte-integrity proof for the PNGs; the already-approved manifest/digest remains the immutable authority.

## Phase 2 — PostgreSQL schema, constraints, transactions, and forced RLS

All Phase 2 tasks are serial because they share one migration and mutable database harness.

- [ ] T007 [FR-FAC-005, FR-CLINIC-001, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-004] Add the fail-closed expand preflight plus `clinical.schedules` and `clinical.schedule_windows` tables, audit columns, classifications, and generated half-open validity/window ranges — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T003`, `T004`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- schema-schedules` exits 0 on clean and upgrade fixtures with inclusive civil dates represented by the next-local-day exclusive boundary and no fabricated legacy facts

- [ ] T008 [FR-FAC-005, FR-CLINIC-001, NFR-DATA-001, NFR-PERF-002] Add schedule status/transition guards, IANA timezone validation, normalized ISO-weekday windows, active-validity and local-window GiST exclusions, lookup indexes, and terminal retirement enforcement — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T007`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- schedule-constraints` exits 0 with `active|paused|retired` only, retired terminal, active validity overlap rejected, local overlap rejected, and half-open boundary touch allowed

- [ ] T009 [FR-FAC-005, FR-CLINIC-005, NFR-SEC-003, NFR-DATA-001, NFR-PRIV-004] Add `clinical.schedule_exceptions` with the four exact types, restricted reasons, scope/timezone/civil-date materialization, positive-duration checks, ordinary same-type overlap exclusion, and delay supersession history fields — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T008`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- exception-constraints` exits 0 with ordinary overlap/duplicate rejected, boundary touch allowed, no coalescing, absence/blocked overlap safe, and delay history representable without slot mutation

- [ ] T010 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-008, NFR-SEC-003, NFR-DATA-001, NFR-PRIV-004, NFR-PERF-002] Add `clinical.appointments` with exact state/payment checks, UTC plus civil context, restricted reason handling, versioning, lookup indexes, and partial doctor-time GiST exclusion for occupied states — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T009`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- appointment-constraints` exits 0 with nine states only, `cash_on_arrival` only, one occupied range winner, and no database producer for the five producerless appointment states

- [ ] T011 [FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-003, NFR-DATA-001, NFR-PERF-002] Add `clinical.queue_scopes` and `clinical.queue_entries` with immutable per-scope numbers, unique appointment/scope/number, waiting-order uniqueness, scope-equality guards, exact five states, estimates, restricted reorder reasons, and versions — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T010`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- queue-constraints` exits 0 with one queue entry per appointment, unique monotonic numbers, waiting-only order, exact scope equality, and no producer for `in_service`

- [ ] T012 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-DATA-001, NFR-PORT-001] Add fixed-search-path schedule mutation and availability projection functions implementing weekly civil time, DST rules, inclusive validity, `absence > blocked > added > base`, and delay as a separate projection overlay — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T011`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- availability` exits 0 with no nonexistent-time slot, one earlier-offset ambiguous slot, deterministic UTC identity/context, no invalid added slot, and no delay-created/deleted/shifted slot

- [ ] T013 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-008, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002] Add transactional create/cancel/reschedule/check-in functions with current authorization/version, slot exclusion, same-row atomic replacement, cash-only invariants, idempotency, audit, outbox, and canonical stored response — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T012`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- appointment-transactions` exits 0 with create→`confirmed`, check-in→`checked_in` plus one `waiting` entry, valid cancellation/reschedule rules, one race winner, and the original slot unchanged for every failed replacement

- [ ] T014 [FR-CLINIC-003, FR-CLINIC-004, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002] Add serialized queue allocation, call, waiting-only reorder, estimate recalculation, and completion functions with exact scope/version/reason checks, idempotency, audit, outbox, and no appointment-state side effect — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T013`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- queue-transactions` exits 0 with one queue number, `waiting→called→completed` queue-only transitions, atomic reorder/estimates, stale/invalid denial, and appointment remaining `checked_in`

- [ ] T015 [FR-FAC-005, FR-CLINIC-005, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002] Add serialized `sendDoctorDelay` supersession and `declareDoctorAbsence` cascade functions with exact facility/doctor/civil-date scope, deduplicated outbox, restricted reasons, and atomic affected-row behavior — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T014`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- delay-absence` exits 0 with same-key replay inert, latest distinct delay replacing rather than accumulating, no delay state/order/time/slot mutation, and absence changing only intersecting `confirmed|checked_in` plus associated `waiting|called→removed`

- [ ] T016 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-002, NFR-DATA-002, NFR-OBS-001] Integrate hardened platform idempotency, attributable audit, aggregate-versioned minimum outbox payloads, payload allow-lists, ordering keys, and crash-safe completion into every Feature 009 mutation — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T013`, `T014`, `T015`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db -- atomic-effects` exits 0 with one domain/audit/outbox/idempotency effect per success, canonical same-key replay, changed-body conflict, and zero raw reason/contact/token/unrelated-PHI payload fields

- [ ] T017 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-PRIV-001, NFR-PRIV-002] Enable and force RLS on every new table; add current-fact patient/relationship/licence/membership/action/AAL/purpose policies, minimum projections, fixed-search-path security-definer helpers, non-owner grants, and PUBLIC/service-role/direct-table denials — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T016`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:rls` exits 0 with only approved actor/scope/action cells allowed and no existence, cross-patient, cross-facility, cross-doctor, cross-date, stale-context, raw-reason, or worker-table disclosure

- [ ] T018 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002] Add default-off server/UI/dispatch flags and explicit expand→validate→activate sequencing with safe reads, independent mutation/dispatch kill switches, roll-forward after durable writes, and no destructive contract step — `supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql`
  - Depends on: `T017`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:migration` exits 0 for clean, upgrade, flag-off, validation, local/test activation, disabled-mutation, disabled-dispatch, and roll-forward paths without deleting or reinterpreting clinical history

- [ ] T019 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, NFR-DATA-001, NFR-DATA-002, NFR-QUALITY-001] Add clean/upgrade schema, enum, constraint, index, function, transition, payment, and feature-flag assertions — `infra/db/tests/clinic-scheduling-schema.sql`
  - Depends on: `T018`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:db` exits 0 twice from clean resets with deterministic schema and state results

- [ ] T020 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-PRIV-001, NFR-PRIV-002, NFR-QUALITY-001] Add the complete actor/relationship/licence/facility/doctor/date/action/AAL/purpose/stale-token/worker/direct-SQL forced-RLS negative matrix — `infra/db/tests/clinic-scheduling-rls.sql`
  - Depends on: `T017`, `T019`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:rls` exits 0 with every authorized cell minimally projected and every unauthorized cell producing zero rows and zero effects

- [ ] T021 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001, NFR-QUALITY-001] Add serial PostgreSQL race/fault coverage for booking, reschedule, check-in, queue allocation/reorder, ordinary exception overlap, delay supersession, absence cascade, replay, and transaction rollback — `services/api/test/clinic-scheduling-postgres.integration.test.ts`, `tools/run-clinic-scheduling-postgres-test.mjs`
  - Depends on: `T019`, `T020`
  - Acceptance evidence: `node tools/run-clinic-scheduling-postgres-test.mjs` exits 0 with one winner per contested resource and zero partial effects, duplicate numbers, compounded delays, duplicate notices, or changed producer boundaries

- [ ] T022 [FR-CLINIC-002, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-002, NFR-AVAIL-001, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-004, NFR-QUALITY-001] Add synthetic migration and point-in-time restore fixtures covering schedules, exceptions, appointments, queues, idempotency, audit, and outbox as one consistent truth set — `infra/db/tests/clinic-scheduling-migration.sql`, `infra/db/fixtures/clinic-scheduling-restore.sql`
  - Depends on: `T021`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:restore -- fixture` exits 0 with consistent references/versions/order after restore, no fabricated history, and retention duration left gated by `OPEN-LEGAL-002`

**Checkpoint B — Data authority:** T007–T022 pass serially from clean reset. Schema, concurrency, transaction atomicity, feature flags, and forced RLS are sufficient for non-owner API integration.

## Phase 3 — Portable recurrence, availability, state, queue, and telemetry policy

- [ ] T023 [P] [FR-FAC-005, FR-CLINIC-001, NFR-DATA-001, NFR-PORT-001] Implement vendor-free weekly civil-time recurrence, inclusive-date boundaries, IANA timezone resolution, earlier-offset ambiguous time, nonexistent-time omission, and stable UTC slot identity/context — `packages/core/src/clinic-scheduling/recurrence.ts`, `packages/core/src/clinic-scheduling/types.ts`
  - Depends on: `T003`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-recurrence` exits 0 and the module imports no framework, database, transport, or vendor package

- [ ] T024 [FR-FAC-005, FR-CLINIC-001, NFR-DATA-001, NFR-QUALITY-001, NFR-PORT-001] Add property and deterministic tests for weekdays, half-open windows, inclusive end dates, timezone-rule boundaries, nonexistent times, ambiguous times, and stable slot identity — `packages/core/src/clinic-scheduling/recurrence.test.ts`
  - Depends on: `T023`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-recurrence` exits 0 across every approved DST/civil-time fixture with no duplicate or nonexistent slot

- [ ] T025 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-DATA-001, NFR-PORT-001] Implement pure availability derivation with `absence > blocked > added > base`, added-window restrictions, overlap/boundary rules, freshness qualification, earliest replacement suggestions, and delay kept outside slot creation — `packages/core/src/clinic-scheduling/availability.ts`
  - Depends on: `T023`, `T024`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-availability` exits 0 with exact effective ranges and future same-facility/same-doctor unreserved suggestions ordered earliest-first without holds

- [ ] T026 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-DATA-001, NFR-QUALITY-001] Add exhaustive base/added/blocked/absence/delay, same-type overlap, boundary-touch, freshness, and replacement-suggestion tests — `packages/core/src/clinic-scheduling/availability.test.ts`
  - Depends on: `T025`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-availability` exits 0 with delay never changing slots and ordinary exception create never coalescing

- [ ] T027 [P] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-008, NFR-DATA-001, NFR-PORT-001] Implement pure appointment transition/payment policy for all nine states, current-time/version preconditions, cash-only consequences, and explicit Feature 009 producer allow-list — `packages/core/src/clinic-scheduling/appointment-policy.ts`
  - Depends on: `T003`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-appointment` exits 0 with only approved create/cancel/reschedule/check-in outcomes and no refund or producer for `requested|in_queue|in_consultation|completed|no_show`

- [ ] T028 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-008, NFR-DATA-001, NFR-QUALITY-001] Add a complete nine-state operation matrix including pre-start, post-check-in, `reschedule_required`, invalid replacement, stale, conflict, and transaction-failure cases — `packages/core/src/clinic-scheduling/appointment-policy.test.ts`
  - Depends on: `T027`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-appointment` exits 0 with all unspecified transitions denied and failed reschedule preserving the original appointment/slot model

- [ ] T029 [P] [FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-DATA-001, NFR-PORT-001] Implement pure queue transition, waiting-order, version, scoped-reorder reason, wait-estimate, delay-overlay, and absence-removal policy for all five states — `packages/core/src/clinic-scheduling/queue-policy.ts`
  - Depends on: `T003`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-queue` exits 0 with queue-only call/complete, waiting-only reorder, delay estimate-only behavior, absence-only removal, and no `in_service` producer

- [ ] T030 [FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-DATA-001, NFR-QUALITY-001] Add complete five-state, target-position, stale-version, reason, estimate, delay replay/supersession, and absence-removal tests — `packages/core/src/clinic-scheduling/queue-policy.test.ts`
  - Depends on: `T029`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- clinic-scheduling-queue` exits 0 with atomic expected reorder projections and no appointment-state mutation

- [ ] T031 [P] [FR-CLINIC-002, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-007, NFR-PRIV-002, NFR-OBS-001, NFR-PORT-001] Implement default-deny Feature 009 telemetry/redaction helpers with bounded labels and request/event/aggregate correlation — `packages/observability/src/clinic-scheduling.ts`, `packages/observability/src/index.ts`
  - Depends on: `T004`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/observability test -- clinic-scheduling` exits 0 with no patient name/contact, raw reason, exact public coordinate, token, appointment details, or identifier-valued metric label

- [ ] T032 [FR-CLINIC-002, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-007, NFR-PRIV-002, NFR-OBS-001, NFR-QUALITY-001] Add prohibited-sentinel, high-cardinality, malformed-context, conflict/replay, outbox, queue, and delay/absence telemetry tests — `packages/observability/src/clinic-scheduling.test.ts`
  - Depends on: `T031`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/observability test -- clinic-scheduling` exits 0 with zero prohibited sentinel values and only approved low-cardinality result classes

**Checkpoint C — Portable domain policy:** T023–T032 pass without database, framework, UI, or vendor dependencies and agree exactly with Checkpoint B constraints.

## Phase 4 — OpenAPI generation, repositories, use cases, and exact routes

- [ ] T033 [P] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-API-001, NFR-PORT-001] Add deterministic generation and generate TypeBox contracts plus the API client only from the approved OpenAPI source — `tools/generate-feature-009-contracts.mjs`, `packages/contracts/src/clinic-scheduling.ts`, `packages/api-client/src/clinic-scheduling.ts`
  - Depends on: `T002`
  - Acceptance evidence: `node tools/generate-feature-009-contracts.mjs --check` exits 0 and a write run followed by check yields zero Git diff with exactly 18 operations

- [ ] T034 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add generated schema/client tests and public export maps for canonical OpenAPI version, operation names, methods, paths, approved DTO shapes, filters, cursors, freshness fields, problems, idempotency, versions, and cash-only payloads — `packages/contracts/src/clinic-scheduling.test.ts`, `packages/contracts/src/index.ts`, `packages/api-client/src/clinic-scheduling.test.ts`, `packages/api-client/src/index.ts`
  - Depends on: `T033`
  - Acceptance evidence: `corepack pnpm contracts:check` and `node tools/verify-feature-009-contract.mjs --generated` exit 0 with exact OpenAPI 3.1.1/contract/client parity for doctor near/distance filters and the closed public projection, appointment status filtering, availability version, queue cursor/`nextCursor`, and queue-position updated/stale fields. Generated negative-schema vectors reject `doctorId` schedule reassignment and ordinary exception `delay`, `absence`, or `delayMinutes` bypass inputs while the dedicated delay/absence operations remain valid; no handwritten transport type drift exists

- [ ] T035 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-SEC-001, NFR-QUALITY-001, NFR-PORT-001] Define framework-free repository, authorization, clock, transaction, idempotency, audit, outbox, feature-flag, and projection ports plus use-case DTOs — `services/api/src/modules/clinic-scheduling/types.ts`, `services/api/src/modules/clinic-scheduling/ports.ts`, `services/api/src/modules/clinic-scheduling/index.ts`
  - Depends on: `T023`, `T025`, `T027`, `T029`, `T031`, `T034`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api typecheck` exits 0 and module ports trust no client-supplied facility, relationship, licence, role, purpose, fee, queue scope, or transition authority

- [ ] T036 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-DATA-001, NFR-PERF-002] Implement the non-owner PostgreSQL repository and fixed projections over the approved functions/indexes with bounded queries and transaction isolation — `services/api/src/adapters/postgres/clinic-scheduling-service.ts`, `services/api/src/adapters/postgres/index.ts`
  - Depends on: `T017`, `T021`, `T035`
  - Acceptance evidence: `node tools/run-clinic-scheduling-postgres-test.mjs --adapter` exits 0 with forced RLS active, bounded plans using intended indexes, and no raw reason or cross-scope DTO

- [ ] T037 [FR-CLINIC-001, FR-DISC-001, NFR-SEC-001, NFR-PRIV-001, NFR-PRIV-002, NFR-PERF-002, NFR-API-002, NFR-AVAIL-001] Implement `searchDoctors`, `listDoctorAvailability`, `getAppointment`, `listAppointments`, `getQueue`, and `getMyQueuePosition` use cases with current-fact authorization, freshness, bounded cursors, private caching, and degraded safe-read behavior — `services/api/src/modules/clinic-scheduling/service.ts`
  - Depends on: `T025`, `T032`, `T036`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- clinic-scheduling-reads` exits 0 with only verified/licensed/scoped projections, stale/unknown labels, own-position privacy, bounded pages, and safe reads under mutation kill switch

- [ ] T038 [FR-FAC-005, FR-CLINIC-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-002] Implement `createSchedule`, `updateSchedule`, and `createScheduleException` orchestration with authorization, versions, idempotency, deterministic overlap conflicts, audit, outbox, and terminal retirement — `services/api/src/modules/clinic-scheduling/service.ts`
  - Depends on: `T026`, `T036`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- clinic-scheduling-schedules` exits 0 with exact facility/doctor/date scope, ordinary overlap rejected/no coalescing, and same-key replay stored. Focused service negatives prove `updateSchedule` rejects every payload containing `doctorId`; `createScheduleException` rejects `type: delay`, `type: absence`, and every `delayMinutes` payload; each rejected bypass attempt causes zero domain mutation, audit, or outbox effect; and delay/absence semantics remain reachable only through `sendDoctorDelay`/`declareDoctorAbsence`

- [ ] T039 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-008, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-002] Implement create/cancel/reschedule/check-in orchestration using the approved transaction functions, current patient context, versions, canonical replay, cash-only effects, and exact appointment producers — `services/api/src/modules/clinic-scheduling/service.ts`
  - Depends on: `T028`, `T036`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- clinic-scheduling-appointments` exits 0 with create confirmed, check-in checked-in plus waiting, clarified cancel/reschedule rules, atomic replacement, and no producer/refund drift

- [ ] T040 [FR-CLINIC-003, FR-CLINIC-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-002] Implement call/reorder/complete orchestration with current action/scope/version, restricted reason, authoritative queue refresh, canonical replay, and no appointment-state change — `services/api/src/modules/clinic-scheduling/service.ts`
  - Depends on: `T030`, `T036`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- clinic-scheduling-queue` exits 0 with waiting-only reorder, queue-only state changes, atomic estimates, called/later denial, and no `in_service` producer

- [ ] T041 [FR-FAC-005, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-002, NFR-API-002] Implement delay and absence orchestration with sole delay supersession path, exact affected-set computation, minimum response/outbox data, replacement suggestions without holds, and production dispatch disabled — `services/api/src/modules/clinic-scheduling/service.ts`
  - Depends on: `T026`, `T030`, `T036`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- clinic-scheduling-delay-absence` exits 0 with same-key delay inert, latest distinct delay superseding, exact absence cascade/removal, no cross-scope effect, and no production-SMS success claim

- [ ] T042 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-API-001, NFR-API-002] Register the exact 18 routes with generated schemas, request correlation, localized RFC 9457 problems, private/no-store sensitive responses, actor/route-risk throttles, `Idempotency-Key`, and `If-Match` rules — `services/api/src/routes/clinic-scheduling.ts`, `services/api/src/app.ts`
  - Depends on: `T034`, `T037`, `T038`, `T039`, `T040`, `T041`
  - Acceptance evidence: `node tools/verify-feature-009-contract.mjs --implemented` exits 0 with exactly 18 registered Feature 009 operations, zero undocumented route, and every mutation flag enforced

- [ ] T043 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-007, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add API contract, authorization, enumeration, validation, cursor, cache, throttle, state, replay, stale-version, and problem integration tests for all 18 operations — `services/api/test/clinic-scheduling.integration.test.ts`
  - Depends on: `T042`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test:integration -- clinic-scheduling` exits 0 with AC-01 through AC-15 API cases and the complete negative actor matrix passing. Focused HTTP negatives prove `updateSchedule` rejects every payload containing `doctorId`; `createScheduleException` rejects `type: delay`, `type: absence`, and every `delayMinutes` payload with a contracted non-success problem response; rejected bypass attempts produce no domain mutation, audit, or outbox effect; and only the dedicated `sendDoctorDelay` and `declareDoctorAbsence` endpoints accept their respective semantics

- [ ] T044 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001, NFR-QUALITY-001] Execute the API through non-owner PostgreSQL for slot, reschedule, check-in, queue, delay, absence, overlap, and rollback races without parallel database workers — `services/api/test/clinic-scheduling-postgres.integration.test.ts`
  - Depends on: `T021`, `T043`
  - Acceptance evidence: `node tools/run-clinic-scheduling-postgres-test.mjs --api` exits 0 with one winner, deterministic conflicts, authoritative responses, and zero partial or duplicate effects

- [ ] T045 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-005, NFR-SEC-006, NFR-DATA-002, NFR-OBS-001, NFR-QUALITY-001] Add commit-boundary crash/retry verification across domain rows, idempotency records, audit events, ordered outbox events, canonical responses, and redacted telemetry — `services/api/test/clinic-scheduling-atomic-effects.integration.test.ts`
  - Depends on: `T032`, `T044`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- clinic-scheduling-atomic-effects` exits 0 with exactly one durable effect after every injected before/after-commit failure and no sensitive payload/log field

**Checkpoint D — API authority:** T033–T045 pass with exact 18-operation OpenAPI/generated-client/route parity, non-owner forced RLS, and proven atomic effects.

## Phase 5 — Notification candidate lifecycle and local/test worker

- [ ] T046 [P] [FR-CLINIC-005, NFR-SEC-002, NFR-PRIV-001, NFR-PRIV-002, NFR-I18N-001, NFR-QUALITY-001] Author versioned Arabic/English doctor-delay and doctor-absence candidate bodies, exact placeholder schemas, minimum recipient projections, and digests as unpublished Feature 005 lifecycle inputs — `specs/009-clinic-scheduling-appointments-queue/contracts/notification-template-candidates.json`
  - Depends on: `T005`, `T016`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:notifications -- candidates` exits 0 with locale placeholder equality, no diagnosis/raw reason/contact destination, status `candidate`, and no fabricated publisher or publication evidence

- [ ] T047 [FR-CLINIC-005, NFR-SEC-002, NFR-PRIV-001, NFR-PRIV-002, NFR-PORT-001] Define minimum delay/absence outbox claim, current recipient resolution, published-release resolution, delivery receipt, retry, dead-letter, clock, and telemetry ports — `services/worker/src/clinic-scheduling-notifications.ts`
  - Depends on: `T035`, `T045`, `T046`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker typecheck` exits 0 and ports expose no general appointment table, raw reason, contact destination, token, credential, or production-provider contract

- [ ] T048 [FR-CLINIC-005, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-001, NFR-PRIV-002, NFR-OBS-001] Implement ordered claims, current governed recipient/template resolution, aggregate/event/version deduplication, bounded lease/backoff, immutable receipts, and dead letter without reversing domain transactions — `services/worker/src/postgres-clinic-scheduling-notification-processor.ts`
  - Depends on: `T032`, `T047`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker test -- clinic-scheduling-notifications` exits 0 with ordered one-time delivery eligibility, superseded-delay suppression, absence deduplication, bounded retry, and no dispatch for an unpublished/mismatched release

- [ ] T049 [FR-CLINIC-005, NFR-SEC-002, NFR-SEC-007, NFR-PRIV-002, NFR-PORT-001] Wire Feature 009 only to the existing local synthetic adapter and enforce startup/runtime denial for production SMS configuration while `OPEN-VENDOR-002` is open — `services/worker/src/adapters/local-synthetic-messaging.ts`, `services/worker/src/clinic-scheduling-runner.ts`, `services/api/src/config.ts`
  - Depends on: `T048`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker test -- clinic-scheduling-production-disabled` exits 0 with synthetic receipts locally and production SMS startup/dispatch rejected without logging destinations or credentials

- [ ] T050 [FR-CLINIC-005, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-I18N-001, NFR-OBS-001, NFR-QUALITY-001] Add candidate/unpublished/published-fixture, separation, locale, schema, recipient, replay, supersession, lease, transient, permanent, DLQ, redaction, and production-disabled worker tests — `services/worker/src/clinic-scheduling-notifications.test.ts`
  - Depends on: `T048`, `T049`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker test -- clinic-scheduling-notifications` exits 0 with truthful pending/retrying/failed receipts, no duplicate work, and no production delivery claim

- [ ] T051 [FR-CLINIC-005, NFR-SEC-001, NFR-SEC-002, NFR-SEC-005, NFR-SEC-007, NFR-PRIV-002, NFR-OBS-001, NFR-QUALITY-001] Add serial end-to-end delay/absence commit-to-worker tests using synthetic recipients, approved test fixtures, adapter failure, superseded overlay, reconnect, and prohibited-sentinel cases — `tests/e2e/clinic-scheduling-notifications.spec.ts`
  - Depends on: `T045`, `T050`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:e2e -- notifications` exits 0 with authoritative appointment/queue state preserved and one minimum notification result per eligible aggregate/event/version

- [ ] T052 [FR-CLINIC-005, NFR-SEC-002, NFR-SEC-005, NFR-PRIV-002, NFR-I18N-001, NFR-OBS-001] Record the candidate-template and local/test worker checkpoint without asserting independent publication or production SMS — `specs/009-clinic-scheduling-appointments-queue/evidence/notifications/checkpoint.md`
  - Depends on: `T006`, `T046`, `T051`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --checkpoint notifications` exits 0 with candidate digests, test-fixture provenance, production kill-switch evidence, and retained `OPEN-VENDOR-002`

**Checkpoint E — Truthful notifications:** Domain state is authoritative; candidate lifecycle and local/test delivery are verified, while production SMS and any unrecorded publication remain disabled.

## Phase 6 — User story 1: discover and book a doctor

**Independent outcome:** An eligible patient can discover a verified doctor, inspect current civil-date availability and fee, and create one confirmed cash-on-arrival appointment.

- [ ] T053 [US1] [FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-008, FR-DISC-001, NFR-API-001, NFR-AVAIL-002, NFR-PORT-001] Add the patient generated-client adapter and explicit discovery/availability/booking view-state models with authoritative reconciliation and no offline mutation queue — `apps/patient/src/clinic-scheduling-api.ts`, `apps/patient/src/clinic-scheduling-view-models.ts`
  - Depends on: `T034`, `T037`, `T039`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/patient test -- clinic-scheduling-api` exits 0 with generated DTO use only, same-key uncertain retry, private state, and offline writes denied

- [ ] T054 [US1] [FR-CLINIC-001, FR-CLINIC-008, FR-DISC-001, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001] Implement patient `/discover` and `/doctors/:id` loading, empty, location-denied, filtered, stale/unknown, no-slots, offline, error, and success compositions for `F009-P0-PAT-DISCOVER-001` and `F009-P0-PAT-DOCTOR-001` — `apps/patient/app/discover/index.tsx`, `apps/patient/app/doctors/[id].tsx`, `apps/patient/src/ClinicSchedulingShell.tsx`
  - Depends on: `T005`, `T006`, `T053`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/patient test -- clinic-scheduling-discovery` exits 0 in `ar-EG`/RTL and `en-EG`/LTR with verified facility/licence, fee, next slot/freshness, named controls, logical layout, and no false availability

- [ ] T055 [US1] [FR-CLINIC-002, FR-CLINIC-008, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001] Implement patient `/appointments/new` patient-context review, slot/fee/cash instruction, submitting, uncertain retry, validation, conflict, offline, error, and durable result region for `F009-P0-PAT-BOOK-001` — `apps/patient/app/appointments/new.tsx`
  - Depends on: `T053`, `T054`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/patient test -- clinic-scheduling-booking` exits 0 with one primary submit, current availability recheck, conflict-to-current-slots recovery, first-invalid focus, result focus, 48px primary target, and no payment initiation UI

- [ ] T056 [US1] [FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-008, FR-DISC-001, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001, NFR-QUALITY-001] Add Arabic/English component and end-to-end discovery-to-booking tests at 360×800 and 412×915 for keyboard/focus, screen-reader names, bidi, 200% text, 400% reflow, forced colors, reduced motion, targets, stale/offline/conflict, and one-winner booking — `apps/patient/test/clinic-scheduling-discovery-booking.test.ts`, `tests/e2e/clinic-scheduling-discovery-booking.spec.ts`
  - Depends on: `T043`, `T044`, `T055`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:e2e -- discovery-booking` exits 0 with AC-01 through AC-05, AC-14, and the three patient P0 families structurally mapped without formal pixel-acceptance claims

- [ ] T057 [US1] [FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-008, FR-DISC-001, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Record the independently demonstrable discovery-and-booking checkpoint with synthetic AR/EN evidence references — `specs/009-clinic-scheduling-appointments-queue/evidence/patient/discovery-booking-checkpoint.md`
  - Depends on: `T006`, `T056`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --story US1` exits 0 with each state, locale, viewport, fixture, build SHA, actual-capture path, accessibility result, and approved baseline ID/reference metadata mapped separately from immutable PNGs

**Checkpoint F — US1 demonstrable:** Discovery and booking work end to end without queue, clinic-operation, vendor, payment, or Feature 010 behavior.

## Phase 7 — User story 2: manage an appointment

**Independent outcome:** An authorized patient context or clinic actor can view and perform only the approved cancel, reschedule, and check-in actions with atomic conflict recovery.

- [ ] T058 [US2] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-008, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement patient `/appointments/:id` all-state projection, own queue position/estimate/delay, cancel confirmation, replacement suggestions/no-hold warning, reschedule, check-in, stale/offline/conflict/error, and result focus for `F009-P0-PAT-APPOINTMENT-001` — `apps/patient/app/appointments/[id].tsx`
  - Depends on: `T053`, `T055`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/patient test -- clinic-scheduling-appointment` exits 0 with only current-state actions, `reschedule_required` cancellation without replacement, replacement required only for reschedule, no post-check-in ordinary edit, and cash-only consequence

- [ ] T059 [P] [US2] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-008, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement the clinic generated-client adapter and `/appointments/:id` minimum patient-context, state, fee/cash, queue, reschedule-required, destructive confirmation, conflict, offline, error, and result composition for `F009-P0-CLN-APPOINTMENT-001` — `apps/clinic/src/lib/clinic-scheduling-api.ts`, `apps/clinic/src/app/appointments/[id]/page.tsx`
  - Depends on: `T005`, `T006`, `T034`, `T037`, `T039`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-appointment` exits 0 with role-projected data, generated DTOs, only approved actions, current version, no offline write, and no payment/refund control

- [ ] T060 [US2] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-008, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add patient appointment component tests for all nine states, queue projection, cancel/reschedule/check-in, uncertain retry, stale version, first-invalid/result/dialog focus, RTL/LTR, reflow, contrast, targets, and reduced motion — `apps/patient/test/clinic-scheduling-appointment.test.ts`
  - Depends on: `T058`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/patient test -- clinic-scheduling-appointment` exits 0 with exact producer boundaries and every required `F009-P0-PAT-APPOINTMENT-001` state

- [ ] T061 [P] [US2] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-008, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add clinic appointment component tests for role scope, all projected states, current actions, destructive confirmation, authoritative conflict refresh, focus restoration, RTL/LTR, tablet/desktop reflow, contrast, targets, and reduced motion — `apps/clinic/test/clinic-scheduling-appointment.test.ts`
  - Depends on: `T059`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-appointment` exits 0 at 768×1024 and 1440×900 with complete `F009-P0-CLN-APPOINTMENT-001` coverage

- [ ] T062 [US2] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-008, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add serial end-to-end appointment view/cancel/reschedule/check-in, relationship revocation, stale version, slot race, commit-boundary disconnect, reconnect, and no-producer-drift tests in both apps/locales — `tests/e2e/clinic-scheduling-appointments.spec.ts`
  - Depends on: `T044`, `T045`, `T060`, `T061`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:e2e -- appointments` exits 0 with AC-06 through AC-09, AC-14 through AC-16, one durable result, and no offline-authored transition

- [ ] T063 [US2] [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-008, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Record the independently demonstrable patient/clinic appointment-management checkpoint — `specs/009-clinic-scheduling-appointments-queue/evidence/appointments/checkpoint.md`
  - Depends on: `T006`, `T062`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --story US2` exits 0 with both baseline families, all states/actions/conflicts, AR/EN accessibility results, and exact state-producer inventory

**Checkpoint G — US2 demonstrable:** Appointment management is independently usable and every failed mutation preserves authoritative appointment, slot, idempotency, audit, and outbox truth.

## Phase 8 — User story 3: operate today's clinic queue

**Independent outcome:** An authorized clinic actor can inspect today's exact scope and call, reorder, or complete only eligible queue entries while patients see only their own queue projection.

- [ ] T064 [US3] [FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement clinic `/today` facility/role/AAL/environment, doctor/date worklist, empty/delay/absence/stale/offline/error states and `/queue` five-state projections, freshness, delay overlay, call/reorder/complete controls, restricted reason, conflict refresh, and result regions — `apps/clinic/src/app/today/page.tsx`, `apps/clinic/src/app/queue/page.tsx`, `apps/clinic/src/components/clinic-scheduling/QueueWorkspace.tsx`
  - Depends on: `T037`, `T040`, `T041`, `T059`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-queue` exits 0 with `F009-P0-CLN-TODAY-001` and `F009-P0-CLN-QUEUE-001`, exact scope, stable order, waiting-only reorder, polite announcements, and no local authoritative transition

- [ ] T065 [US3] [FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add clinic today/queue component tests for all queue states, empty/delay/absence, permission, stale/offline/error, call/reorder/complete, reason validation, version conflict, focus return, RTL/LTR, reflow, contrast, targets, and reduced motion — `apps/clinic/test/clinic-scheduling-queue.test.ts`
  - Depends on: `T064`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-queue` exits 0 at both clinic viewports with no reorder for called/later states, no `in_service` producer, and no appointment-state change

- [ ] T066 [US3] [FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add serial end-to-end check-in-to-waiting, concurrent number allocation, own-position privacy, clinic projection, call, reorder race/reason, complete, absence removal, stale/offline/reconnect, and cross-scope denial tests — `tests/e2e/clinic-scheduling-queue.spec.ts`
  - Depends on: `T044`, `T045`, `T062`, `T065`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:e2e -- queue` exits 0 with AC-08 through AC-10, AC-12, AC-15, and AC-16 passing without shared-harness parallelism

- [ ] T067 [US3] [FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Record the independently demonstrable today/queue checkpoint — `specs/009-clinic-scheduling-appointments-queue/evidence/queue/checkpoint.md`
  - Depends on: `T006`, `T066`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --story US3` exits 0 with both clinic baseline families, exact actor/scope/state/race evidence, own-position privacy, and AR/EN accessibility results

**Checkpoint H — US3 demonstrable:** Queue operations are independently usable with unique numbering, serialized reorder/version truth, exact state boundaries, and default-deny scope.

## Phase 9 — User story 4: manage schedules, delays, and absences

**Independent outcome:** An authorized doctor/owner can manage one facility/doctor schedule, declare a scoped delay, or declare an absence with exact atomic effects and no production delivery claim.

- [ ] T068 [US4] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement clinic `/schedule` recurrence, status, validity, exception, overlap, delay, absence, affected-count, destructive confirmation, stale/offline/error/conflict/success, and result compositions for `F009-P0-CLN-SCHEDULE-001` — `apps/clinic/src/app/schedule/page.tsx`, `apps/clinic/src/components/clinic-scheduling/ScheduleWorkspace.tsx`
  - Depends on: `T038`, `T041`, `T059`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-schedule` exits 0 with bounded weekly civil controls, active/paused/retired only, exact exception types, delay distinct from ordinary exception create, no offline save, and current version required

- [ ] T069 [US4] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add clinic schedule component tests for recurrence/DST explanation, overlap/boundary conflict, terminal retirement, added restrictions, delay supersession, absence confirmation/count, reason validation, focus restoration, RTL/LTR, reflow, contrast, targets, and reduced motion — `apps/clinic/test/clinic-scheduling-schedule.test.ts`
  - Depends on: `T068`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-schedule` exits 0 at 768×1024 and 1440×900 with every approved schedule baseline state and no new product behavior

- [ ] T070 [US4] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Add serial end-to-end schedule/create/update/exception, DST, overlap, delay replay/supersession, absence exact affected set, queue removal, replacement suggestion/no-hold, notification eligibility, cross-scope denial, and disconnect/reconnect tests — `tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts`
  - Depends on: `T044`, `T051`, `T066`, `T069`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:e2e -- schedule-delay-absence` exits 0 with AC-02, AC-04, AC-11 through AC-13, AC-15, and AC-16 passing and no slot/time/order/state drift from delay

- [ ] T071 [US4] [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Record the independently demonstrable schedule/delay/absence checkpoint — `specs/009-clinic-scheduling-appointments-queue/evidence/schedule/checkpoint.md`
  - Depends on: `T006`, `T070`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --story US4` exits 0 with schedule baseline states, civil-time/DST/overlap vectors, exact affected sets, truthful notification state, and AR/EN accessibility results

**Checkpoint I — US4 demonstrable:** Schedule, delay, and absence are independently usable within one facility/doctor/date scope, and no delay/absence behavior creates a hidden operation or producer.

## Phase 10 — Security, performance, restore, UI evidence, and final verification

- [ ] T072 [NFR-API-001, NFR-API-002, NFR-QUALITY-001] Wire serial Feature 009 database, RLS, contracts, worker, E2E, security, performance, restore, evidence, and exact-scope commands into repository verification without changing other feature commands — `package.json`, `services/api/package.json`, `services/worker/package.json`, `apps/patient/package.json`, `apps/clinic/package.json`
  - Depends on: `T022`, `T034`, `T052`, `T057`, `T063`, `T067`, `T071`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:scope`, `corepack pnpm test:clinic-scheduling:contract`, and `corepack pnpm test:clinic-scheduling:stack` exit 0 with database-mutating suites forced to concurrency 1

- [ ] T073 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-QUALITY-001] Run ASVS L2, applicable health-data L3, API Top 10, authorization/RLS/search-path/grant, injection, enumeration, replay/race, dependency, secret, reason-redaction, outbox, and production-adapter reviews and close applicable findings — `specs/009-clinic-scheduling-appointments-queue/evidence/security/security-report.md`
  - Depends on: `T020`, `T032`, `T043`, `T045`, `T051`, `T070`, `T072`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:security` exits 0 with zero unresolved reportable high/critical finding, forced RLS proven, and production SMS/PHI/legal claims still disabled

- [ ] T074 [FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-004, FR-CLINIC-005, FR-DISC-001, NFR-PERF-001, NFR-PERF-002, NFR-API-002, NFR-QUALITY-001] Run the approved synthetic discovery/availability, booking/reschedule race, queue contention/reorder, delay/absence, patient LCP/input-response, and API read/mutation load profile with recorded topology, warm-up, percentiles, errors, and contention — `tools/clinic-scheduling-performance.ts`, `specs/009-clinic-scheduling-appointments-queue/evidence/performance/report.md`
  - Depends on: `T056`, `T062`, `T066`, `T070`, `T072`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:performance` exits 0 with patient LCP p95 ≤3.0s, input response p95 ≤200ms, reads p95 ≤400ms, mutations p95 ≤800ms, one race winner, and the `OPEN-TECH-003` limitation stated

- [ ] T075 [FR-CLINIC-002, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-002, NFR-AVAIL-001, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-004, NFR-QUALITY-001] Execute consistent database/idempotency/audit/outbox restore, worker replay/deduplication, safe-read readiness, mutation/dispatch kill switches, and roll-forward recovery under the approved synthetic RPO/RTO profile — `tools/run-clinic-scheduling-restore-test.mjs`, `specs/009-clinic-scheduling-appointments-queue/evidence/operations/restore-report.md`
  - Depends on: `T022`, `T045`, `T051`, `T072`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:restore` exits 0 with RPO ≤15 minutes, RTO ≤60 minutes, consistent versions/order/effects, zero duplicate replay, and no destructive rollback after durable writes

- [ ] T076 [FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001, NFR-QUALITY-001] Capture live Arabic RTL and English LTR evidence for all eight routes, approved states, canonical viewports, keyboard/focus/dialog/result behavior, screen-reader announcements, bidi, 200% text, applicable 400% reflow, forced colors, contrast, targets, reduced motion, and responsive structure — `specs/009-clinic-scheduling-appointments-queue/evidence/ui/acceptance.md`, `specs/009-clinic-scheduling-appointments-queue/evidence/ui/actual/`
  - Depends on: `T057`, `T063`, `T067`, `T071`, `T074`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --ui` exits 0 with actual captures stored outside `visual-baselines/references`, every capture mapped to an existing `F009-P0-*` manifest row, no approved PNG read/write/re-hash, and comparisons labeled structural/manual while `OPEN-UX-002` remains open

- [ ] T077 [FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-OBS-001, NFR-QUALITY-001] Run the prohibited-sentinel scan across API/UI/logs/traces/metrics/cache metadata/audit/outbox/worker/evidence and verify bounded operational dashboards/alerts for latency, conflicts, contention, replay, queue versions, delay/absence effects, outbox age/retry/DLQ, RLS denials, and restore freshness — `specs/009-clinic-scheduling-appointments-queue/evidence/observability/redaction-report.md`
  - Depends on: `T032`, `T045`, `T051`, `T076`
  - Acceptance evidence: `corepack pnpm test:clinic-scheduling:privacy` exits 0 with zero prohibited value, raw reason, destination, token, appointment detail, or high-cardinality identifier label

- [ ] T078 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-AVAIL-001, NFR-AVAIL-002, NFR-OBS-001, NFR-QUALITY-001] Generate a SHA-bound synthetic evidence manifest mapping AC-01 through AC-18 and SC-001 through SC-010 to commands, fixtures, environment versions, outputs, UI actuals, and retained gates without changing approved visual references — `tools/verify-feature-009-evidence.mjs`, `specs/009-clinic-scheduling-appointments-queue/evidence/manifest.json`
  - Depends on: `T073`, `T074`, `T075`, `T076`, `T077`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --all` exits 0 with every AC/SC present, exact 18-operation and state parity, 492 references recorded but untouched, and no unsupported production/release claim

- [ ] T079 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-API-001, NFR-DATA-001, NFR-OBS-001, NFR-PORT-001] Update Feature 009 realization, API/data/RLS/UI catalogs, traceability, processing inventory, and clinic-scheduling incident/restore/roll-forward runbook without altering future-feature or program-wide gate status — `docs/architecture/SHIFAA-API-Catalog.md`, `docs/architecture/SHIFAA-Data-RLS.md`, `docs/design/SHIFAA-UI-Contract.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`, `docs/privacy/SHIFAA-Processing-Inventory.md`, `infra/runbooks/clinic-scheduling-appointments-queue.md`
  - Depends on: `T078`
  - Acceptance evidence: `corepack pnpm architecture:check` and `node tools/verify-feature-009-scope.mjs` exit 0 with only the frozen Feature 009 scope realized and all retained `OPEN-*` gates unchanged

- [ ] T080 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Run clean full repository verification, contract regeneration zero-diff, clean migration reset, serial race suites, baseline metadata validation, exact-scope/state/producer audit, and final whitespace check — `specs/009-clinic-scheduling-appointments-queue/evidence/final-verification.md`
  - Depends on: `T034`, `T072`, `T073`, `T074`, `T075`, `T076`, `T077`, `T078`, `T079`
  - Acceptance evidence: `corepack pnpm verify`, `node tools/generate-feature-009-contracts.mjs --check`, `node tools/verify-feature-009-scope.mjs`, `node tools/verify-feature-009-ui-baselines.mjs`, and `git diff --check` exit 0 with 18 operations, exact state producers, cash only, production SMS disabled, no Feature 010 behavior, and no approved PNG mutation

- [ ] T081 [FR-FAC-005, FR-CLINIC-001, FR-CLINIC-002, FR-CLINIC-003, FR-CLINIC-004, FR-CLINIC-005, FR-CLINIC-008, FR-DISC-001, NFR-QUALITY-001] Record implementation-stage Architecture/Data/Security/QA/Product evidence status, preserve later formal visual/device/UAT/vendor/legal gates, and approve only the supported synthetic local/test rollout state — `specs/009-clinic-scheduling-appointments-queue/checklists/requirements.md`
  - Depends on: `T080`
  - Acceptance evidence: `node tools/verify-feature-009-evidence.mjs --release` exits 0 without fabricated `OPEN-UX-002`, `OPEN-TECH-003`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, legal, template-publication, production-SMS, or production-PHI closure

**Checkpoint J — Implementation complete, integration not implied:** T072–T081 pass, including the fast metadata/manifest/count/recorded-bytes visual check. That metadata-only result is not fresh PNG byte-integrity proof and does not replace or revalidate the already-approved immutable manifest/digest. The root may then perform post-implementation `speckit-analyze`; Issue/commit/push/PR actions still require their separately authorized lifecycle steps.

## Dependency graph and implementation routing

```text
Checkpoint A (T001-T006)
  -> Checkpoint B (T007-T022, serial DB/RLS/races)
  -> Checkpoint C (T023-T032, portable policy)
  -> Checkpoint D (T033-T045, contracts/API)
  -> Checkpoint E (T046-T052, notification lifecycle)
  -> Checkpoint F (T053-T057, US1 patient discovery/booking)
  -> Checkpoint G (T058-T063, US2 appointment management)
  -> Checkpoint H (T064-T067, US3 queue)
  -> Checkpoint I (T068-T071, US4 schedule/delay/absence)
  -> Checkpoint J (T072-T081, hardening/final evidence)
```

- Route normal non-UI package/API/worker tasks to a bounded `worker`; route already-bounded migration, RLS, transaction, race, and state-machine tasks to `deep-worker`; route UI composition tasks to `ui-worker`; route focused verification/failure diagnosis to `tester`.
- Never run two agents against the migration, live Supabase/PostgreSQL state, `package.json`, or a shared E2E harness at once. The root reviews each checkpoint and updates this ledger only after evidence passes.
- Genuine `[P]` examples after their dependencies: T002–T006 use disjoint files; T023, T027, T029, and T031 use disjoint pure-package files; T033 and T046 use disjoint generated-contract and candidate-template files; T059 may proceed beside T058 because clinic and patient app ownership is separate; T061 may proceed beside T060 for the same reason.
- Suggested first independently demonstrable MVP is Checkpoints A–F (US1). Checkpoints G–I add the remaining approved journeys without changing the frozen release boundary.
