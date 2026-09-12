# Feature 009 Technical Research

## Decision summary

All planning questions are resolved without changing approved scope. Repository-native PostgreSQL, RLS, idempotency, audit, outbox, notification governance, OpenAPI generation, applications, i18n, and design-system foundations are reused. No new operation, role, relationship, route, payment flow, vendor claim, or Feature 010 producer is required.

## R-001 — Weekly civil time and DST

**Decision:** store one IANA timezone and normalized weekday/local windows. Derive local candidates only within inclusive `valid_from..valid_to`, then resolve to UTC. Persist UTC start/end plus timezone, civil date, and local context. Intervals are `[start,end)`; nonexistent local times emit no slot; ambiguous times emit one slot using the earlier offset.

**Rejected:** UTC-recurring clinic hours, RFC 5545, draft schedules.

## R-002 — Availability and exceptions

**Decision:** derive base slots from active schedules and apply `absence > blocked > added > base`; query delay separately. Ordinary exception creation locks the schedule, rejects positive-duration same-type overlap, allows boundary contact, and rejects added intervals duplicating effective base/added or entering effective absence/blocked time.

**Rejected:** implicit coalescing, delay-created/deleted/shifted slots, hidden write paths.

## R-003 — Appointment occupancy and reschedule

**Decision:** use a partial GiST exclusion on doctor plus UTC `tstzrange` for `confirmed`, `checked_in`, `in_queue`, `in_consultation`. `createAppointment` inserts `confirmed`. Reschedule locks and updates the same row only after version, authorization, state, future effective same-facility/same-doctor replacement, and exclusion acquisition succeed in one transaction.

**Rejected:** holds, delete-and-recreate, cross-doctor/facility replacement, optimistic client ownership.

## R-004 — Queue concurrency

**Decision:** a `(facility,doctor,civil_date)` queue-scope row owns monotonic `next_queue_number` and `version`. Queue numbers never change; waiting order is separate. Reorder locks the scope and affected waiting rows, validates current versions/scope/position/restricted reason, rewrites only the affected order, recomputes estimates, and increments versions atomically.

**Rejected:** renumbering, reordering called/later entries, authoritative client ordering.

## R-005 — Absence and delay

**Decision:** absence is one idempotent transaction: insert exception, lock intersecting `confirmed`/`checked_in` appointments, set `reschedule_required`, remove associated `waiting`/`called` entries, refresh queue projections, append audit/outbox. Replacement offers are earliest-first read-only suggestions without holds.

Delay locks its facility/doctor/civil-date scope and supersedes the prior active delay with the latest valid distinct declaration. Same-key replay performs no supersession, compounding, or duplicate work. Delay changes estimates/notification work only.

## R-006 — Idempotency, audit, outbox, templates

**Decision:** reuse hardened `platform.idempotency_records`. Principal/route/request binding and stored replay precede effects. Domain mutation, restricted audit, aggregate-versioned outbox, and idempotency completion commit together. Delay/absence templates are new bilingual candidates in the existing template-release lifecycle—not existing/published templates. Dispatch requires independent publication and an enabled adapter; production SMS remains off.

## R-007 — Forced RLS and projections

**Decision:** enable and force RLS on all clinical tables; runtime roles are neither owners nor BYPASSRLS. Bind internal person, active relationship/permission, active membership/licence, facility/doctor/date, action/purpose, and state. Minimum public and subject projections use SECURITY DEFINER functions with empty search paths and narrow execute grants.

## R-008 — Contract/client parity

**Decision:** `contracts/openapi.yaml` contains exactly 18 operation IDs. Repository generation produces the client, and CI compares frozen inventory, OpenAPI operationIds, and generated exports. Existing RFC 9457, cache, correlation, cursor, idempotency, and version conventions apply.

## R-009 — UI architecture

**Decision:** eight thin route containers use generated-client adapters and explicit view-state models. Server state is authoritative; offline is read-only; destructive actions use approved confirmations/results. Current design-system components compose against the eight `F009-P0-*` families with Arabic-first/English structural parity.

## R-010 — Migration, telemetry, restore

**Decision:** expand/validate/activate/contract. Additive schema deploys with flag off; constraints/RLS/backfill validate before activation. After durable writes, disable and roll forward rather than drop data. Low-cardinality PHI-free metrics cover operations, conflicts, replay, queue, outbox, and restore. Restore recovers clinical, idempotency, audit, and outbox consistently.

## R-011 — Binary evidence storage

**Finding:** PNG is binary in `.gitattributes`; no LFS pattern exists. Prior immutable visual evidence is committed directly; CI artifacts are transient SBOM/SARIF only. The unchanged approved set is 492 PNGs, 29,237,789 bytes (27.883 MiB), manifest SHA-256 `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`.

**Recommendation, not applied:** persist the exact set directly in Git in one versioned feature PR beside source, inventory, validator, and manifest. Do not substitute CI artifacts. Any later LFS adoption requires a separate repository-wide governance/infrastructure decision.

## Unresolved decisions

None prevents task generation. Later gates remain: `OPEN-TECH-002/003`, `OPEN-UX-002`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, and applicable production legal gates.
