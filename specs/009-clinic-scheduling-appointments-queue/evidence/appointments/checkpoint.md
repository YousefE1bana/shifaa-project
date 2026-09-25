# Feature 009 — Checkpoint G appointment management

Feature: `009-clinic-scheduling-appointments-queue`. This is **synthetic graduation engineering** evidence. Production approval: not granted. Verification used the dirty Checkpoint G implementation based on `270999a3929cd463b0f73cd3ce4769c5b03ee390`; that base SHA alone does not identify the final capture or implementation tree.

## Authority and privacy result

The approved contract still contains exactly 18 operations. `rescheduleAppointment` now requires a restricted `reason` of 1–500 characters and rejects CR, LF, and tab. The domain service rejects missing, empty, oversized, or control-character reasons before authorization or persistence. The PostgreSQL mutation validates and stores a valid reason atomically in nullable `clinical.appointments.reschedule_reason` with the replacement slot and appointment version. Closed appointment projections, API responses, audit records, transactional outbox payloads, logs, metric labels, and request-context attributes exclude the reason. Same-key replay with a changed reason conflicts through the canonical request hash.

The patient and clinic flows expose only the approved appointment actions. Cancellation and rescheduling are available for `confirmed`; `reschedule_required` may cancel without a replacement and may reschedule only to a valid future replacement. Check-in is available only for `confirmed`. No ordinary edit is available after check-in. Server state, queue position, fee, fixed `EGP`, and `cash_on_arrival` remain authoritative, and offline mutations are rejected rather than queued.

## Executable state and action evidence

The Playwright suites render and assert all nine states—`requested`, `confirmed`, `checked_in`, `in_queue`, `in_consultation`, `completed`, `cancelled`, `no_show`, and `reschedule_required`—for both patient and clinic flows in `ar-EG` RTL and `en-EG` LTR. The matrices verify localized state projection and the state-specific absence or presence of cancel, reschedule, and check-in actions. The journey cases additionally exercise cancellation confirmation, required reschedule-reason validation and invalid-field focus, fresh server replacement selection, serialized reason payload, check-in/queue projection, offline blocking, conflict refresh, keyboard focus, named controls/live regions, forced colors, reduced motion, and horizontal reflow.

The serial API/PostgreSQL journey verifies view/cancel/reschedule/check-in, stale versions, relationship revocation, one-winner replacement-slot contention, commit-boundary recovery, authoritative EGP/cash projection, and absence of Feature 009 producers for forbidden states. The final focused result was 3/3 passing after the contract-required reason was added to every reschedule fixture.

Exact Feature 009 producer inventory remains:

- `createAppointment`: appointment `confirmed`.
- `cancelAppointment`: `confirmed|reschedule_required` → `cancelled`.
- `rescheduleAppointment`: `confirmed|reschedule_required` → `confirmed` on the same appointment.
- `checkInAppointment`: appointment `confirmed` → `checked_in` plus queue `waiting`.
- `callQueueEntry`: queue `waiting` → `called`; no appointment-state change.
- `reorderQueueEntry`: waiting-order change only; no appointment-state change.
- `completeQueueEntry`: queue `called` → `completed`; no appointment-state change.
- `declareDoctorAbsence`: intersecting appointment → `reschedule_required` and associated `waiting|called` queue entry → `removed`.
- `sendDoctorDelay`: estimate overlay only; no appointment or queue-state change.
- Appointment `requested`, `in_queue`, `in_consultation`, `completed`, and `no_show`, plus queue `in_service`, have no Feature 009 producer.

## Informative actual captures

New actual captures exist only below `evidence/actual/appointments/`; they do not replace approved references:

- Patient AR/EN: confirmed, checked-in queue, cancelled, rescheduled, offline, and 320 CSS-pixel reflow.
- Clinic AR/EN: confirmed, cancelled, and offline.

The patient captures use 360×800 (`ar-EG`) and 412×915 (`en-EG`) for the primary journeys; the clinic captures use 768×1024 (`ar-EG`) and 1440×900 (`en-EG`). Browser assertions and captures are informative engineering evidence, not pixel-identity proof. No screen reader was operated. No real 200% text-scale or 400% browser-zoom acceptance was performed in Checkpoint G; 320 CSS-pixel reflow is labeled only as structural reflow evidence. The browser checked accessible names, focus, live-region structure, target rectangles, forced-colors media, reduced-motion media, direction, and horizontal overflow; those structural checks are not assistive-technology certification.

## Focused commands

- `node tools/generate-feature-009-contracts.mjs --check` — PASS; generated artifacts current.
- `node tools/verify-feature-009-contract.mjs --generated --implemented` — PASS; OpenAPI 3.1.1 and 18 operations.
- `node tools/verify-feature-009-scope.mjs` — PASS; 18 operations, nine appointment states, five queue states, cash only, production SMS disabled, retained gates, and Feature 010 excluded.
- `corepack pnpm --filter @shifaa/api test -- service.test.ts` — PASS, 265 unit tests with 56 DB-gated tests skipped; the restricted reschedule-reason negatives execute before authorization or persistence.
- `corepack pnpm --filter @shifaa/patient test` — PASS, 59/59.
- `corepack pnpm --filter @shifaa/clinic test` — PASS, 7/7.
- Patient and clinic package typechecks — PASS.
- `corepack pnpm exec playwright test --config tools/clinic-scheduling-patient-appointment-playwright.config.ts` — PASS, 4/4.
- `corepack pnpm exec playwright test --config tools/clinic-scheduling-appointment-playwright.config.ts` — PASS, 4/4.
- `corepack pnpm test:clinic-scheduling:e2e -- appointments` — PASS, 3/3, isolated serial PostgreSQL database.

## Immutable baseline metadata and retained gates

Approved metadata authority remains source `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`, manifest digest `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`, 492 references, 29237789 recorded bytes, 8 route families, and locales `ar-EG` plus `en-EG`. This checkpoint did not open, compare, modify, re-hash, regenerate, recompress, or move any approved reference PNG. `OPEN-UX-002`, `OPEN-TECH-003`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, and applicable legal gates remain open. No Feature 006 or Feature 010 behavior is claimed.
