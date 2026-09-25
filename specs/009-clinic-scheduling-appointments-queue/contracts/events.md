# Feature 009 Event and Notification Contract

## Outbox rules

- Every event is inserted in the same transaction as its aggregate mutation and audit row.
- Event identity is unique; ordering is by aggregate ID and positive aggregate version.
- Payloads contain only aggregate/event IDs, facility/doctor/date scope where required, state/version, relevant UTC/civil times, locale/template-safe fields, and correlation ID.
- Raw reasons, patient names, contacts, coordinates, credentials, tokens, and unrelated appointment data are forbidden.
- Worker receipts deduplicate event/consumer. Retry is bounded with observable dead-letter state. Same-key API replay cannot add another event.

| Event family                          | Aggregate                  | Producer                                                      | Consumers/effect                                                                 |
| ------------------------------------- | -------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `clinical.schedule.changed.v1`        | schedule                   | create/update schedule or exception                           | cache/projection invalidation only                                               |
| `clinical.appointment.changed.v1`     | appointment                | create/cancel/reschedule/check-in/absence                     | subject projection and eligible notification work                                |
| `clinical.queue.changed.v1`           | queue scope/entry          | check-in/call/reorder/complete/absence/delay estimate refresh | queue projection refresh; eligible notification work                             |
| `clinical.doctor_delay.declared.v1`   | facility-doctor-date delay | `sendDoctorDelay`                                             | resolve independently published bilingual template; no state/time/order mutation |
| `clinical.doctor_absence.declared.v1` | absence exception          | `declareDoctorAbsence`                                        | eligible affected-subject notification work after transaction commits            |

## Template lifecycle

- Plan new paired Arabic/English candidate template codes for delay and absence using `platform.notification_template_releases`.
- Candidate creation is not publication. Existing author/publisher separation, digest, allowed recipient types, allowed field schema, placeholder allow-list, effective time, and revocation controls apply.
- Tests may install deterministic synthetic published fixtures solely in isolated test migrations; evidence must not claim a production publication.
- Production SMS remains disabled under `OPEN-VENDOR-002`. Local/test adapters use synthetic addresses and recorded delivery/dedup/failure evidence.
