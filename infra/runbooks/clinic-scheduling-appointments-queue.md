# Clinic scheduling, appointments, and queue — Feature 009

This runbook applies to the local synthetic Feature 009 engineering environment. It does not approve production PHI, vendor messaging, a published delay/absence template, formal device/visual acceptance, or production disaster recovery. The 18-operation boundary and exact state producers are recorded in `specs/009-clinic-scheduling-appointments-queue/contracts/openapi.yaml` and the SHA-bound evidence manifest.

## Contain an incident

1. Record only a new incident correlation ID, time window, fixed operation/outcome code, and affected scope class. Keep person, patient, doctor, facility, appointment, queue, destination, token, free-text reason, and raw payload values out of ordinary logs, metrics, tickets, and evidence.
2. For uncertain writes or inconsistent queue state, disable `clinic_scheduling.mutations` through the approved environment flag process. The `clinic_scheduling.server` safe-read gate can remain on only while its authorized minimum projections and freshness status are truthful. Block offline write replay; reconcile with authoritative API/DB state after reconnect.
3. For notification risk, keep `clinic_scheduling.dispatch` off. Do not mark delivery successful from an outbox enqueue or a worker attempt. Preserve existing event/lease/receipt/dead-letter records for review. Production dispatch and SMS remain disabled under `OPEN-VENDOR-002`.
4. Recheck current patient/relationship or workforce facility/doctor/date/action authority and forced RLS. Never bypass with table owner, superuser, service role, broad grant, or ad hoc data edit.

## Diagnose and reconcile

- **Booking or reschedule conflict:** compare the request's idempotency key/body binding, `If-Match` version, schedule validity, current availability, and doctor half-open occupied interval. One contested interval has one winner; a losing request leaves its original appointment unchanged. Do not fabricate a second confirmed slot or manually release an exclusion constraint.
- **Schedule or exception conflict:** inspect the current schedule version, local recurrence window, civil date/timezone, and same-type exception intervals. A boundary-touch is distinct from positive overlap. Delay uses the dedicated declaration and a later valid declaration supersedes the current overlay; an ordinary exception is not an alternate delay path.
- **Queue conflict or absence:** reconcile appointment and queue scope together. Reorder needs both current entry version and queue-scope version. An absence changes only intersecting `confirmed`/`checked_in` appointments to `reschedule_required` and removes linked `waiting`/`called` entries. Replacement suggestions are current, same facility/doctor, future, and unheld. Never promise a suggested slot as booked.
- **Delivery backlog:** inspect bounded aggregate event state, lease, retry/dead-letter class, and outbox age in an authorized synthetic environment. No live Feature 009 dashboard or alert rule is implemented by this checkpoint. The unpublished template yields no delivered notification; a dead letter is not success.

## Local verification and restore

Run focused checks with synthetic fixtures and the existing local PostgreSQL service:

```powershell
corepack pnpm test:clinic-scheduling:stack
corepack pnpm test:clinic-scheduling:security
corepack pnpm test:clinic-scheduling:privacy
corepack pnpm test:clinic-scheduling:performance
corepack pnpm test:clinic-scheduling:restore
node tools/verify-feature-009-evidence.mjs --all
```

`test:clinic-scheduling:restore` creates disposable source/target databases, applies the recorded migration chain, logically backs up and restores the synthetic fixture, compares schedules/windows/exceptions, appointments, queue entries/order, idempotency response, audit and outbox truth, then reapplies `20260924000100_f009_patient_queue_delay_projection.sql` forward. It checks forced-role function access and safe reads with mutations off. It tests one expired-lease worker replay: with no published template, the event dead-letters and no notification/provider receipt is created. The source/target databases are removed by the runner. Do not delete or rewrite real appointment, queue, idempotency, audit, outbox, or receipt history to make a restore pass.

The recorded local exercise observed recovery-point age below 15 minutes and restore time below 60 minutes in an isolated quiescent profile. Those observations are not production RPO/RTO evidence. Before any wider rollout, separately resolve legal retention and production PHI authority, processor/vendor and template publication, product UAT, formal visual/device/network evidence, and production monitoring/backup topology. Keep `OPEN-UX-002`, `OPEN-TECH-003`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, and applicable `OPEN-LEGAL-*` gates open until their owners provide the required evidence.
