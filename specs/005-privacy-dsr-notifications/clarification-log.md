# Clarification Log: Privacy DSR and Notifications

**Date:** 2026-08-13
**Result:** No unresolved ambiguity requires a Product Owner question before planning.

## Canonical resolutions

| Topic                     | Resolution                                                                                                                              | Source of truth                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| DSR types                 | Closed set: access/export, correction, restriction, erasure/pseudonymization review                                                     | PRD and explicit authority                     |
| Existing privacy behavior | Reuse 001 notice, consent, and withdrawal; no fork                                                                                      | 001 artifacts and authority                    |
| Subject authority         | Patient own scope; guardian only active approved `consent.manage`; delegation/facility membership never grants DSR authority            | Data/RLS and 004                               |
| DPO boundary              | Active designation + assignment + AAL2 + purpose + minimum projection; no general admin/audit routes                                    | API Catalog, Data/RLS, FR-ADMIN-002            |
| Due date                  | `synthetic_dsr_due_v1` is exactly 17 calendar days and visibly non-statutory; production activation remains blocked                     | Data/RLS plus `OPEN-LEGAL-002/007`             |
| Erasure                   | Review/evidence lifecycle is built; automated deletion/pseudonymization is blocked                                                      | `OPEN-LEGAL-002`                               |
| Export                    | Private scanner-released object and one-time capability expiring exactly 5 minutes after issue; no-store response                       | architecture/storage/privacy contracts         |
| Templates                 | One draft release contains paired Arabic/English content and exact recipient/field schemas; another AAL2 support publisher publishes it | FR-NOTIF-001, FR-ADMIN-004                     |
| Export consumption        | Issue and one-time consume modes share `downloadDsrExport`; the returned link targets the patient app and adds no API operation         | API Catalog plus private/no-store contract     |
| Messaging                 | Deterministic local adapter and signed receipt fixture only; production SMS disabled                                                    | `OPEN-VENDOR-002`                              |
| Retry                     | Canonical delays are 1m, 5m, 30m, 2h, 12h with ±10% bounded jitter; per-aggregate ordering and immutable replay                         | Architecture §7 plus feature test bound        |
| Breach evidence           | Build a synthetic tabletop/timestamp evidence path without adding a public operation or claiming a real incident                        | NFR-PRIV-003 and canonical operation inventory |
| Later domains             | 006/SOS and all clinical/facility/payment/AI triggers remain excluded                                                                   | Master sequencing and explicit authority       |

## Coverage result

The specification resolves actors, state machines, schemas, authorization/RLS, processing inventory, idempotency/concurrency, exports, template governance, worker/provider behavior, bilingual UI, accessibility, degraded states, observability, performance, rollback, and synthetic-only boundaries. Remaining `OPEN-*` items are named governance gates rather than engineering ambiguities.
