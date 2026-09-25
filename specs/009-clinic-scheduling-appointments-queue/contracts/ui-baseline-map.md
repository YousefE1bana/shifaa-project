# Feature 009 UI Architecture and Baseline Map

## Immutable source

- Source version: `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`
- Manifest SHA-256: `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`
- Immutable references: 492 PNGs, 29,237,789 bytes
- Machine mapping authority: `../visual-baselines/reference-manifest.json`
- Human composition authority: `../decisions/OPEN-UX-001-test-only-p0-baselines.md`

This planning map does not alter or replace the manifest. Formal pixel-regression acceptance remains behind `OPEN-UX-002`.

## Route ownership

| Baseline                      | App/route                   | Canonical viewports | Data operations                                                                                            |
| ----------------------------- | --------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `F009-P0-PAT-DISCOVER-001`    | patient `/discover`         | 360×800, 412×915    | `searchDoctors`                                                                                            |
| `F009-P0-PAT-DOCTOR-001`      | patient `/doctors/:id`      | 360×800, 412×915    | `listDoctorAvailability`                                                                                   |
| `F009-P0-PAT-BOOK-001`        | patient `/appointments/new` | 360×800, 412×915    | `createAppointment`                                                                                        |
| `F009-P0-PAT-APPOINTMENT-001` | patient `/appointments/:id` | 360×800, 412×915    | `getAppointment`, `cancelAppointment`, `rescheduleAppointment`, `checkInAppointment`, `getMyQueuePosition` |
| `F009-P0-CLN-TODAY-001`       | clinic `/today`             | 768×1024, 1440×900  | `listAppointments`, `getQueue`                                                                             |
| `F009-P0-CLN-QUEUE-001`       | clinic `/queue`             | 768×1024, 1440×900  | `getQueue`, `callQueueEntry`, `reorderQueueEntry`, `completeQueueEntry`                                    |
| `F009-P0-CLN-SCHEDULE-001`    | clinic `/schedule`          | 768×1024, 1440×900  | `createSchedule`, `updateSchedule`, `createScheduleException`, `sendDoctorDelay`, `declareDoctorAbsence`   |
| `F009-P0-CLN-APPOINTMENT-001` | clinic `/appointments/:id`  | 768×1024, 1440×900  | `getAppointment`, `cancelAppointment`, `rescheduleAppointment`, `checkInAppointment`                       |

## Component and state architecture

- Route containers own routing, authorization context, query keys, mutation orchestration, and focus restoration.
- Pure view-state reducers map generated-client results to the exact states enumerated in `baseline-inventory.json`.
- Shared functional components include scope/date/doctor selectors, availability list, fee/payment summary, appointment status/action panel, queue worklist/card, schedule/window editor, exception/delay/absence panels, confirmation dialog, status banner, stale/offline/conflict surface, and polite result/live regions.
- Server responses own appointment/queue status and ordering. The client never produces `requested`, `in_queue`, `in_consultation`, appointment `completed`, `no_show`, or queue `in_service`.
- `cash_on_arrival` is the sole displayed/posted payment method. No payment initiation component exists.
- Offline permits cached minimum reads with freshness labeling and retry; every mutation control is disabled and no write is queued.

## Localization and accessibility

- Every manifest entry is exercised in `ar-EG` and `en-EG`; information hierarchy, actions, result regions, and responsive structure are equivalent.
- Use logical layout properties and whole-root direction. Isolate IDs, timestamps, and currency codes; do not reverse numeric/date semantics merely because the page is RTL.
- On route load, focus follows the application shell convention. On validation failure, focus the first invalid field and associate localized help. On mutation result/conflict, focus the approved heading/result region. On dialog close, return focus to the invoker.
- Queue/delay changes use polite announcements; destructive confirmations are modal, labelled, keyboard-contained, escape-aware where safe, and never rely on color alone.
- Verify keyboard-only order, screen-reader names/states, 200% text, applicable 400% reflow, forced colors/high contrast, reduced motion, and minimum approved touch targets.

## Responsive structure

- Patient layouts remain single-column and preserve primary action/result visibility without horizontal scrolling at both canonical mobile widths.
- Clinic layouts use the approved tablet stacking and desktop split-pane/table structure; controls remain in DOM/logical order when panels move.
- No breakpoint may remove an operation, state explanation, destructive confirmation, or result region.

## Evidence contract

Implementation evidence must record baseline ID, route, locale, viewport, state, source version, reference path/hash, build SHA, test fixture, actual capture, comparison status, accessibility result, and reviewer. Until `OPEN-UX-002` closes, comparisons are structural/manual and must not be described as formal pixel acceptance.
