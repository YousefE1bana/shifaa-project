# Feature Specification: Discovery and SOS Foundation

> This specification realizes the Phase 2 engineering foundation against seeded synthetic data. It does not claim live capacity, ambulance dispatch, bed reservation, production maps/SMS/PHI, clinical advice, or closure of any legal, vendor, design, team, or retention gate.

## 0. Metadata and traceability

| Field                      | Value                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SpecKit feature ID         | `006-discovery-sos-foundation`                                                                                                                                                                                                                                                                                                                           |
| Status                     | `SPEC_APPROVED — engineering scope; formal production/release gates remain open`                                                                                                                                                                                                                                                                         |
| Target FR IDs              | `FR-DISC-001` staged facility/capacity slice; `FR-HOSP-007` capacity projection slice; `FR-SOS-001`, `FR-SOS-002`, `FR-SOS-003`, `FR-SOS-004`; `FR-FAM-006` SOS-delivery integration                                                                                                                                                                     |
| Target NFR IDs             | `NFR-SEC-001`, `NFR-SEC-002`, `NFR-SEC-003`, `NFR-SEC-004`, `NFR-SEC-005`, `NFR-SEC-006`, `NFR-SEC-007`, `NFR-PRIV-001`, `NFR-PRIV-002`, `NFR-PRIV-004`, `NFR-I18N-001`, `NFR-A11Y-001`, `NFR-PERF-001`, `NFR-PERF-002`, `NFR-AVAIL-002`, `NFR-DATA-001`, `NFR-DATA-002`, `NFR-API-001`, `NFR-API-002`, `NFR-OBS-001`, `NFR-QUALITY-001`, `NFR-PORT-001` |
| Scope eligibility          | `ACTIVE — PRD v2.1.0 Phase 2, rows FR-DISC-001, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004 and delivery sequence; authoritative base 090efaa8c7ff3ea86e2b01efa2f77f874c0aa800 verified 2026-08-20`                                                                                                                                                   |
| Target app/service/package | `apps/patient`, `apps/hospital`, `services/api`, `services/worker`, `packages/core`, `packages/contracts`, `packages/api-client`, `packages/i18n`, `packages/design-system`, `packages/observability`, `supabase/migrations`, `infra/db`, `tests`                                                                                                        |
| Owner                      | `SHIFAA engineering; names pending OPEN-TEAM-001`                                                                                                                                                                                                                                                                                                        |
| Reviewers                  | Product/emergency safety `[open]`; QA `[open]`; Architecture `[open]`; Security `[open]`; DPO/Legal `[open]`; Clinical `N/A`; Design/A11y `[open]`                                                                                                                                                                                                       |
| Risk class                 | `emergency + sensitive-data + geospatial`                                                                                                                                                                                                                                                                                                                |
| Regulatory domains         | `PDPL; Egyptian emergency-number guidance; facility/professional licensing; formal production evidence remains open`                                                                                                                                                                                                                                     |
| Clinical sign-off required | `no — 006 adds no diagnosis, clinical severity/qualification rule, treatment, medicine, clinical decision support, or clinical-content test set; emergency wording remains Product, DPO/privacy, security, QA, and accessibility review`                                                                                                                 |
| Dependencies               | `001 identity/session; 002 local Supabase runtime; 003 verified facilities/RBAC/RLS; 004 care permissions/emergency-contact consent; 005 audit/outbox/templates/local delivery; API Catalog v1.1.0; Data/RLS v1.2.0; UI Contract v0.9.1`                                                                                                                 |
| Parent roadmap entry       | `shifaa-prd.md Phase 2; SHIFAA-Implementation-Plan-MASTER.md Phase 2`                                                                                                                                                                                                                                                                                    |
| Created / updated          | `2026-08-20 / 2026-08-20`                                                                                                                                                                                                                                                                                                                                |

## 1. Problem and scope

### Problem statement

Patients and their authorized caregivers need to find verified nearby facilities and explicitly activate a minimum-data SOS journey. Hospitals need a restricted pre-arrival projection and an explicit acceptance action. The journey must remain useful when capacity is stale or absent, while never claiming ambulance dispatch, bed reservation, clinical advice, or more disclosure than the emergency purpose permits.

### Actors and authorization context

| Actor               | Context                                                                                            | Permitted outcome                                                                             | Explicitly prohibited                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Public visitor      | no patient context                                                                                 | search active verified facilities and read aggregate capacity freshness                       | access patient/SOS/contact/share data or have query coordinates retained                   |
| Patient             | own active patient                                                                                 | activate/read/close own SOS; create/revoke a scoped share                                     | implicit dispatch/reservation; arbitrary clinical fields                                   |
| Guardian            | current approved relationship and patient context                                                  | same actions only when current policy grants the exact SOS permission                         | impersonation or acting after relationship expiry/revocation                               |
| Adult delegate      | current delegation plus `sos.activate` and, separately, `sos.share`                                | only the permission-specific actions                                                          | deriving either permission from `record.view` or the other SOS permission                  |
| Hospital workforce  | active membership at the matched hospital, exact action, purpose, and AAL2 for sensitive mutations | list minimum matched pre-arrivals, read its projection, accept once, or close when authorized | other-hospital incidents, full record, bed-reservation claims                              |
| Emergency Contact   | currently confirmed consent only                                                                   | receive one approved minimum life-safety message for a qualifying active SOS                  | app/account access, share link, diagnosis, medication, lab, admission, or record data      |
| Public share holder | possession of an unexpired, unrevoked, unused random token                                         | view exactly the selected emergency-profile allow-list once                                   | search, expansion, patient identifiers beyond the minimum display context, or token replay |

### In scope

- Facility discovery for active, verified facilities with type, services, coordinates, rating-summary availability, operational-signal freshness, bounded radius, deterministic distance ordering, and location-denied/manual-search degradation.
- Aggregate hospital capacity projection and freshness; stale/unknown capacity never qualifies a hospital as a confirmed SOS match.
- Explicit SOS activation, deterministic nearby-hospital match, no-capacity `123` guidance, incident read/close, hospital minimum pre-arrival list/read, and explicit acceptance.
- Independently authorized emergency-share creation, one-time token presentation, revocation, expiry within 30 minutes, one permitted view, field allow-list, and audited access.
- Confirmed Emergency Contact delivery through the existing governed outbox/template/local-synthetic worker with consented location precision and FR-FAM-006 fields only.
- Arabic RTL and English LTR patient and hospital surfaces, contracted emergency copy, offline/no-queue behavior, stale states, keyboard/screen-reader/reflow/reduced-motion evidence, security/performance evidence, and forced-RLS negatives.

### Non-goals

- `searchDoctors`, doctor profiles/slots, clinic booking, pharmacy-stock discovery, reviews/moderation, hospital arrival/triage/bed/admission workflows, and all 007 behavior.
- Ambulance calling/dispatch, transport tracking, guaranteed treatment, guaranteed bed, or any statement that SHIFAA reserved capacity.
- A production capacity publisher or invented capacity-write endpoint; 006 consumes seeded-synthetic projections only until a later approved hospital workflow owns publication.
- Production map, geocoder, SMS, push, or other vendor integration; no patient coordinates go to a third party.
- Clinical diagnosis, symptom assessment, emergency severity scoring, free-text triage, or inferred life-safety qualification.
- Completion of pharmacy/review portions of `FR-DISC-001`; those remain assigned to their canonical later phases.

### Dependencies and assumptions

| Item                                                                                       | Type          | Evidence / boundary                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Phase 1 is merged                                                                          | verified fact | `origin/main` at `090efaa8...`, 005 squash commit                                                                    |
| Capacity publisher is absent                                                               | verified fact | no catalogued write operation; local synthetic seed only                                                             |
| SOS reason is an explicit user life-safety attestation plus closed non-diagnostic category | SHIFAA policy | prevents fabricated clinical qualification                                                                           |
| Production freshness/radius values require approved operational configuration              | OPEN          | local profile uses named synthetic values; missing production configuration fails closed to stale/no-match           |
| Emergency-share access limit is one                                                        | SHIFAA policy | conservative implementation of shown-once/bounded-access contract; user may create a new link                        |
| Patient search coordinates are transient                                                   | verified fact | Architecture Section 6.4; only explicit SOS coordinates persist                                                      |
| Emergency clinical profile sources arrive incrementally                                    | verified fact | 006 reads only available canonical values and returns explicit unavailable fields; it creates no fake clinical facts |

## 2. Egyptian regulatory and legal validation

- [x] Purpose is life-safety facility discovery/SOS and is recorded separately from analytics or routine care.
- [x] SOS coordinates, incident context, Emergency Contact details, and emergency-profile fields are sensitive/health data.
- [x] Arabic-first explicit activation, independent share-field selection, confirmed-contact consent, and revocation are defined.
- [x] Public/hospital/contact/share projections are allow-listed and prohibit full records, raw tokens, and third-party coordinate disclosure.
- [x] `SOS_LOCATION`, `COMMUNICATION`, `SECURITY_AUDIT`, and `TRANSIENT_TECHNICAL` retention classes are used without inventing durations.
- [x] Production PHI, transfer, processor, DPO, and map/SMS evidence remains blocked by `OPEN-LEGAL-001/002/007` and vendor review.
- [x] Facility/professional authorization is rechecked from current server/database state.
- [x] DSR/breach behavior is unchanged; SOS data remains covered by the existing governed workflows.
- [x] `123` is presented as user guidance only, never as an action taken by SHIFAA.

**Blocking open items:** `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`, `OPEN-VENDOR-002`, `OPEN-UX-001`, `OPEN-UX-002`, `OPEN-PRODUCT-001`, `OPEN-TEAM-001`, `OPEN-TECH-001`, `OPEN-TECH-002`, and `OPEN-TECH-003`. These block production/formal approvals or reproducibility evidence as catalogued, not seeded-synthetic engineering implementation.

## 3. User Scenarios & Testing

### Journey J-01 — Discover a verified facility

1. Given a public or authenticated user and active verified facilities with deterministic synthetic coordinates and service projections.
2. When the user searches by type/service and either current location or manual area.
3. The system returns a bounded distance-ordered page with verification, service, rating availability, operational freshness, and last-updated text.
4. Search coordinates are not persisted, logged, placed in analytics, or sent to a third party.

### Journey J-02 — Activate SOS with or without fresh capacity

1. Given a patient or current caregiver with `sos.activate`, an explicit confirmation, current coordinates, a closed life-safety reason, and a unique idempotency key.
2. When SOS is activated, only active verified hospitals with configured-fresh aggregate emergency capacity can qualify.
3. If one qualifies, the incident records one informational matched hospital; it remains unaccepted until that hospital acts.
4. If none qualifies, nearby verified hospitals are returned with prominent call-`123` guidance and no reservation/dispatch claim.

### Journey J-03 — Hospital accepts a pre-arrival

1. Given an active AAL2 hospital member at the matched facility with the required purpose.
2. When the worker lists its pre-arrivals and accepts the current incident version.
3. The system records one acceptance and returns accepted pre-arrival wording, never a bed reservation.
4. Other facilities, stale memberships, wrong purpose/AAL, and concurrent losers receive no incident data or state change.

### Journey J-04 — Share a minimum emergency profile

1. Given an active incident and a current actor independently authorized with `sos.share`.
2. When the actor selects fields from the fixed allow-list, one random link expiring no later than 30 minutes is shown once; only its digest is stored.
3. The first valid view returns selected available fields with `private, no-store`; unavailable selected fields are named without invented values.
4. Replay, expiry, revocation, scope expansion, foreign-patient access, and raw-token telemetry fail and are audited safely.

### Journey J-05 — Notify a confirmed Emergency Contact

1. Given a qualifying active SOS and a currently confirmed contact whose consent includes a location precision.
2. When the SOS transaction commits, one minimum outbox event is eligible for the published paired local-synthetic template.
3. The contact receives only patient display name, urgent-help statement, consented coarse/exact location, incident time, and callback number.
4. Declined/revoked/expired contacts and routine lab/medication/interaction/admission events receive zero messages.

### Alternate, failure, and degraded paths

| Case                               | Trigger                                       | Result                                                | State/audit effect                         | Recovery                                |
| ---------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Permission denied                  | wrong patient/facility/permission/purpose/AAL | localized `403` or non-enumerating `404`              | no domain/outbox effect; safe denial audit | restore valid current authority         |
| Offline                            | any mutation while disconnected               | visible call-`123` guidance and no queued mutation    | none                                       | reconnect and explicitly activate again |
| Map unavailable/location denied    | no coordinates or local map failure           | accessible address/phone list and manual search       | no coordinate retention                    | retry/manual search                     |
| Duplicate/replay                   | same key/body                                 | stored canonical result                               | one incident/share/close/accept effect     | use returned result                     |
| Changed replay                     | same key, different body                      | `409 idempotency-key-reused`                          | none                                       | new key after explicit review           |
| Concurrent acceptance/close/revoke | stale version/race                            | one winner; loser `409 version-conflict`              | no partial effects                         | refresh current state                   |
| Stale capacity                     | missing/expired configuration or projection   | stale/unknown; never qualifies                        | no false match                             | call `123`/refresh                      |
| Share invalid                      | expired/revoked/used/token mismatch           | `410 emergency-share-expired`                         | safe access-attempt audit                  | authorized actor creates new link       |
| Contact delivery failure           | local adapter transient/permanent failure     | incident remains valid; delivery state delayed/failed | bounded retry/DLQ, no duplicate            | status visibility/manual call guidance  |

## 4. Requirements

### Functional Requirements

| Target PRD requirement      | Required feature behavior                                                                                                                                                                      | Acceptance coverage |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `FR-DISC-001`               | staged facility/capacity discovery returns active verified facilities with service/coordinate/rating-availability and freshness-qualified signals; later stock/review slices remain incomplete | `AC-01..04`         |
| `FR-HOSP-007`               | only aggregate capacity status, count band, freshness, and update time are public; no patient/ward/bed detail                                                                                  | `AC-03`, `AC-04`    |
| `FR-SOS-001`                | explicit activation, retained SOS coordinates, verified/fresh nearby match, and no-match `123` guidance                                                                                        | `AC-05..10`         |
| `FR-SOS-002`                | match is informational until one authorized hospital acceptance; acceptance is not a reservation                                                                                               | `AC-11..14`         |
| `FR-SOS-003`                | independently authorized random scoped share, maximum 30-minute expiry, one view, revocation, minimum fields, and access audit                                                                 | `AC-15..20`         |
| `FR-SOS-004` / `FR-FAM-006` | active qualifying SOS only can enqueue one confirmed-contact minimum notice respecting location consent                                                                                        | `AC-21..24`         |

## 5. Domain model and invariants

### Entities and ownership

| Entity                        | Owner              | Authoritative source                                                                                                       | Lifecycle owner                                |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Facility discovery projection | Identity/Discovery | active facility, verified location, licensed activities, future rating projection                                          | facility governance + read projection          |
| Capacity projection           | Hospital           | aggregate versioned projection with freshness                                                                              | later hospital workflow; synthetic seed in 006 |
| SOS incident                  | Discovery/SOS      | patient, exact captured point, reason code, verified callback source, status, matched facility, acceptance/closure/version | subject and matched hospital by action         |
| Emergency share link          | Discovery/SOS      | incident, token digest, selected fields, expiry/revocation/use/access limit/version                                        | subject/authorized caregiver                   |
| SOS contact event             | Platform           | minimum outbox/notification records                                                                                        | existing governed worker                       |

### State machines

`SOS incident`: creation enters `active_unmatched` or `matched`; `matched -> accepted`; `active_unmatched|matched|accepted -> closed`. No reopening or rematching in 006. All other transitions fail. Reason codes are exactly `medical_emergency`, `accident_or_injury`, or `other_life_safety`; they are user attestations, not a diagnosis or automated qualification.

`Emergency share`: `active -> used`, `active -> revoked`, and time-derived `active -> expired`. `used`, `revoked`, and `expired` are terminal.

### Invariants and concurrency

- Search coordinates are request-transient; SOS coordinates persist only on explicit activation under `SOS_LOCATION`.
- A matched facility is active, verified, a hospital, within configured local-synthetic radius, and has a fresh qualifying capacity projection at commit time.
- Acceptance rechecks incident version, matched facility, current membership, purpose, and AAL2 in one transaction; one concurrent request wins.
- Domain mutation, audit, minimum outbox, canonical response, and completed idempotency record commit atomically.
- Share token plaintext is returned once and never stored; digest is unique; expiry is at most 30 minutes; access limit is one.
- Contact notification requires active incident plus current confirmed consent at consumption time; exact location is downgraded when consent is coarse.
- The callback number is selected from the initiating patient's or authorized caregiver's current server-verified contact projection; an arbitrary request-body phone number is never accepted.

## 6. Exact data and RLS contract

### Tables and fields

| Table/fields                                           | Contract                                                                                                                                                                                                 | Classification / retention                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `identity.facilities.location`, `location_verified_at` | PostGIS point 4326; verified timestamp required for discovery; GiST index                                                                                                                                | public facility coordinate / operational                                 |
| `identity.patients.blood_group`                        | nullable constrained blood-group code from the canonical logical identity/patient contract; 006 may seed only deterministic synthetic values                                                             | health / patient record                                                  |
| `hospital.capacity_projections`                        | facility PK/FK, nonnegative emergency available/held counts, signal exactly `available`, `limited`, `unavailable`, or `unknown`; observed/fresh times, source code, version; no patient/ward/bed columns | public aggregate / transient operational                                 |
| `platform.sos_incidents`                               | patient, point, precision, reason code, status, matched facility nullable, initiated/accepted/closed times, closed reason, version, `SOS_LOCATION`                                                       | sensitive geospatial/health / unresolved duration under `OPEN-LEGAL-002` |
| `platform.emergency_share_links`                       | incident, unique SHA-256 token digest, selected field codes, expiry, revoked/used timestamps, access count/limit=1, version                                                                              | secret-derived + health capability / `TRANSIENT_TECHNICAL` plus audit    |
| existing `identity.emergency_contacts`                 | current confirmed status and location precision rechecked                                                                                                                                                | encrypted contact / existing consent contract                            |
| existing platform/audit tables                         | idempotency, outbox, notification, access/action audit minimum projections                                                                                                                               | security/communication classes                                           |

### Emergency-share field codes and deterministic 006 availability

| Field code                   | Canonical source                                                   | 006 profile                                                                     |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `blood_group`                | `identity.patients.blood_group`                                    | available only when the seeded synthetic patient has a non-null canonical value |
| `confirmed_allergies`        | future `clinical.allergies` with clinician-confirmed status        | unavailable; never represented as an empty confirmed set                        |
| `active_dispensed_medicines` | future `clinical.medication_statements` in active/dispensed states | unavailable                                                                     |
| `chronic_conditions`         | future active/confirmed `clinical.conditions`                      | unavailable                                                                     |
| `emergency_notes`            | no approved canonical source yet                                   | unavailable                                                                     |

The physical design may add a normalized facility-service projection only if research proves existing verified license activities cannot produce the canonical service filter. It may not invent pharmacy-stock, review, doctor, bed, or clinical source-of-truth tables.

### Migration

- Enable the pinned PostGIS extension/profile, then expand existing facilities, create capacity/SOS/share tables, constraints, indexes, transition helpers, policies, grants, and synthetic seeds.
- Validate SRID/range, active verified facility data, nonnegative aggregate counts, unique token digests, state/timestamp shapes, and absence of patient/ward detail in capacity.
- Roll forward for durable incidents/audit; rollback disables feature routes/flags and removes only empty newly introduced structures in development. No incident/audit history is deleted.
- Restore evidence includes geospatial indexes, constraints, forced RLS, token digest preservation, and no plaintext token.

### RLS/action matrix

| Actor/context     | Capacity/facility                      | SOS incident                                           | Share                                         | Negative evidence                  |
| ----------------- | -------------------------------------- | ------------------------------------------------------ | --------------------------------------------- | ---------------------------------- |
| public            | API public projection only             | none                                                   | token function returns scoped projection only | direct-table/default-role denial   |
| patient self      | public projection                      | own select/create/close                                | own create/revoke                             | other-patient denial               |
| guardian/delegate | public projection                      | exact current `sos.activate`                           | exact current `sos.share`                     | permission independence/revocation |
| hospital member   | aggregate; internal source unchanged   | matched-facility pre-arrival projection; AAL2 mutation | none                                          | cross-facility/purpose/AAL denial  |
| admin/DPO         | no arbitrary SOS access                | none except separately authorized audit projection     | none                                          | role-metadata escalation denial    |
| worker            | minimum contact/outbox projection only | no broad table read                                    | none                                          | prohibited-field projection test   |

Every new table uses `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; online execution is non-owner/non-`BYPASSRLS`. Security-definer helpers use a fixed empty-safe `search_path`, current transaction context, and boolean/minimum projections only.

## 7. API endpoint specifications

All operations use `/v1`, localized RFC 9457 problems, `X-Request-Id`, strict schemas, bounded query values, and no-store for authenticated, SOS, token, or PHI responses. Catalogued mutation flags remain authoritative.

| Operation                                                                              | Contract summary                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchFacilities` `GET /discovery/facilities`                                         | public/auth; type/service, `near=lat,lon` or manual area, configured radius, limit/cursor; returns active verified minimum projections, distance, services, rating availability, signal/freshness; never retains query coordinates                                                                                                                             |
| `getFacilityCapacity` `GET /discovery/hospitals/{facilityId}/capacity`                 | public/auth; aggregate status/count band/freshness/update time only; stale is explicit and never qualifying                                                                                                                                                                                                                                                    |
| `createSosIncident` `POST /sos/incidents`                                              | PAT/GUA/DEL exact permission; Idempotency-Key; managed patient, coordinates, one closed reason, confirmed activation, contact preference `none` or `all_confirmed`, and callback choice restricted to current verified subject/actor contacts; `201` incident plus ranked nearby minimum projections and `123` guidance when no match                          |
| `getSosIncident` `GET /sos/incidents/{incidentId}`                                     | subject/current authorized caregiver or matched HSP minimum projection; incident status/match/acceptance/contact delivery; no unrelated clinical record                                                                                                                                                                                                        |
| `listSosPrearrivals` `GET /hospitals/{facilityId}/sos-prearrivals`                     | current HSP, purpose, cursor; only that hospital's matched/accepted minimum projections; included for `FR-SOS-002` Phase 2 while arrival/triage remain out of scope                                                                                                                                                                                            |
| `acceptSosPrearrival` `POST /hospitals/{facilityId}/sos-incidents/{incidentId}/accept` | current matched HSP at AAL2/purpose; Idempotency-Key + If-Match; acknowledgement and bounded capacity note; `200`; rechecks current fresh signal but never reserves a bed                                                                                                                                                                                      |
| `closeSosIncident` `POST /sos/incidents/{incidentId}/close`                            | subject/current `sos.activate` caregiver or matched HSP by policy; Idempotency-Key + If-Match; closed outcome/reason; terminal `200`                                                                                                                                                                                                                           |
| `createEmergencyShare` `POST /sos/incidents/{incidentId}/share-links`                  | subject/current exact `sos.share`; Idempotency-Key; selected closed field codes; `201` returns token URL once and expiry <=30m                                                                                                                                                                                                                                 |
| `revokeEmergencyShare` `POST /sos/share-links/{shareId}/revoke`                        | subject/current exact `sos.share`; Idempotency-Key + If-Match; terminal `200`                                                                                                                                                                                                                                                                                  |
| `viewEmergencyShare` `GET /sos/share/{token}`                                          | public bearer; token only in the API path and redacted before logging; first valid view returns selected available blood group, confirmed allergies, active/dispensed medicines, chronic conditions, emergency notes; currently absent canonical sources are reported unavailable, never synthesized; `private, no-store`; subsequent/expired/revoked is `410` |

Stable domain problems add `capacity-stale`, `no-qualifying-capacity`, `sos-incident-terminal`, `sos-not-matched-to-facility`, `sos-permission-required`, and existing `emergency-share-expired`. No undocumented operation is added.

## 8. UI/UX and edge-state matrix

| App/route                            | Required states                                                                                                                 | Controls/focus and copy                                                                                             | Permission/offline                                      | Baseline                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| patient `/discover`, `/discover/map` | loading, empty, location denied, map unavailable, manual search, stale/unknown, results, error/offline                          | logical filters, list/map equivalence, freshness text, OSM attribution where map exists                             | public minimum; no coordinate persistence               | `OPEN-UX-001/002` informative |
| patient `/sos`                       | explicit inactive confirmation, permission/relationship, locating, no qualifying capacity, matched informational, error/offline | stable 48px+ emergency action, call-`123` link, no motion/blur, primary action never moves                          | no offline queue; phone fallback remains visible        | `OPEN-UX-001/002`             |
| patient `/sos/:id`                   | active/matched/accepted/closed, stale capacity, contact pending/delayed/failed                                                  | last update, acceptance meaning, no reservation/dispatch claim                                                      | subject/current permission only                         | `OPEN-UX-001/002`             |
| patient `/sos/:id/share`             | field selection, created once, copied, unavailable fields, revoked/expired/used/error                                           | risk explanation, fixed allow-list, focus summary; token never re-rendered after navigation                         | exact `sos.share`; no offline queue                     | `OPEN-UX-001/002`             |
| public `/sos/share`                  | loading, valid minimum profile, unavailable fields, expired/revoked/used, error                                                 | generated link carries token in URL fragment; client scrubs it before the API call; no indexing/referrer disclosure | bearer projection only; no navigation to patient record | `OPEN-UX-001/002`             |
| hospital `/capacity`                 | loading, aggregate fresh/stale/unknown, offline, error, success                                                                 | facility context, signal plus text and last-updated time; no patient/ward/bed detail                                | current facility shell; read-only in 006                | `OPEN-UX-001/002`             |
| hospital `/sos-prearrivals`          | AAL2/purpose, empty, matched, accepted, stale, conflict, offline/error                                                          | facility context, minimum rows, explicit accept dialog, no bed language                                             | current matched facility only; no offline submit        | `OPEN-UX-001/002`             |

All states ship authored `ar-EG` RTL and complete `en-EG` LTR parity at 360x800, 412x915, 768x1024, and 1440x900 as applicable. IDs/coordinates/phone/time use bidi isolation. Keyboard order, visible focus, live regions, screen-reader names, 44x44 targets, patient 48px actions, 200% text, 400% web reflow, high contrast, and reduced motion are required. Emergency routes use zero decorative motion.

## 9. Notifications and asynchronous events

| Event                                               | Recipient                                                                          | Template/channel                                        | Allowed fields                                                                                                     | Dedup/retry                                           | Contact allowed?                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------- |
| `sos.emergency_contact.requested`                   | all currently confirmed Emergency Contacts only when preference is `all_confirmed` | published paired `SOS_LIFE_SAFETY`, local synthetic SMS | patient display name, fixed urgent-help statement, consented coarse/exact location, incident time, callback number | incident+contact+template; existing bounded retry/DLQ | yes, only this qualifying event |
| SOS subject status                                  | patient/current authorized caregiver in app                                        | API/UI state, no new production channel                 | incident reference/status, hospital minimum, contact delivery status                                               | versioned projection                                  | no                              |
| lab/interaction/medication/admission/routine events | normal authorized recipients                                                       | existing policies                                       | no SOS contact projection                                                                                          | N/A                                                   | never                           |

The worker rechecks active incident, `all_confirmed` preference, confirmed consent, location precision, published template schema, and synthetic-only provider mode immediately before delivery. Contact failure cannot change match/acceptance or imply a provider was contacted.

## 10. Security, privacy, and abuse cases

| Threat/misuse                         | Control                                                                                                  | Verification                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| forged relationship/facility metadata | current API authorization plus forced RLS and transaction context                                        | actor/resource/action/facility/patient/purpose/AAL matrix |
| coordinate stalking/telemetry         | transient search points, retained SOS only, exact redaction, low-cardinality metrics                     | log/trace/analytics sentinels and DB inspection           |
| stale/fake capacity                   | verified hospital + approved source code + freshness configuration; missing config fails closed          | boundary/stale/unknown/negative-count tests               |
| replay/race/duplicate                 | canonical idempotency plus version locks/unique constraints                                              | same/different body and concurrent winner tests           |
| token theft/enumeration               | 256-bit CSPRNG, digest only, one view, <=30m, revoke, no-store, path redaction, low rate                 | DB/log/history/cache/token matrix                         |
| emergency profile over-disclosure     | server-sourced fixed field allow-list and selected scope intersection                                    | unknown/extra/nested/prohibited field tests               |
| contact privacy violation             | current confirmation, active SOS, `all_confirmed` preference, consented precision, exact template schema | declined/revoked/expired/routine-event negatives          |
| emergency abuse/rate limit            | actor+route+risk controls with safe `123` fallback; controls must not hide emergency guidance            | bounded burst and legitimate retry tests                  |
| fabricated vendor/emergency outcome   | local adapters and explicit delayed/unknown wording                                                      | production-mode hard-disable and copy assertions          |

## 11. Success Criteria

### Measurable Outcomes

| ID       | Outcome                                               | Measurement                                                | Threshold                                                                                                                                             |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SC-001` | users find only eligible nearby facilities            | seeded search vectors                                      | 100% active+verified included as filtered; 100% inactive/unverified excluded                                                                          |
| `SC-002` | stale/absent capacity never becomes a confirmed match | freshness boundary suite                                   | zero false qualifying matches                                                                                                                         |
| `SC-003` | SOS remains explicit and non-duplicating              | replay/concurrency suite                                   | one incident/effect per key; all changed replays rejected                                                                                             |
| `SC-004` | hospital access is facility/purpose/AAL scoped        | API + forced-RLS matrix                                    | 100% cross-facility/missing-guard attempts denied                                                                                                     |
| `SC-005` | emergency share is bounded and minimum                | token/scope suite                                          | one view within <=30m; zero plaintext persistence; zero extra fields                                                                                  |
| `SC-006` | Emergency Contact disclosure obeys consent            | worker/privacy suite                                       | exactly one minimum notice per eligible currently confirmed contact for an active `all_confirmed` SOS; zero for every prohibited contact/event vector |
| `SC-007` | API meets canonical latency                           | local seeded load evidence with dataset/resources recorded | read p95 <=400ms; mutation p95 <=800ms; SOS match p95 <=2s, excluding external vendors                                                                |
| `SC-008` | bilingual emergency flows are operable accessibly     | live AR/EN acceptance                                      | required states/viewports pass with zero unresolved critical/high accessibility finding and zero WCAG 2.2 AA blocker                                  |
| `SC-009` | 006 does not regress patient-home budget              | canonical cold-start/input profile                         | LCP p95 <=3.0s; input response p95 <=200ms                                                                                                            |

### Acceptance Criteria and Test Vectors

- **AC-01:** type/service/manual-area/radius filters and opaque pagination return deterministic active verified results only.
- **AC-02:** public discovery returns no license evidence, owner/member, patient, exact query-coordinate, or hidden operational fields.
- **AC-03:** capacity projection contains aggregate signal/freshness only; patient/ward/bed sentinels are structurally impossible.
- **AC-04:** freshness exact-boundary vectors classify fresh/stale deterministically; missing production config is stale/no-match.
- **AC-05:** explicit authorized activation stores one SOS point and one atomic audit/outbox/idempotency result.
- **AC-06:** delegation `sos.activate`, `sos.share`, and `record.view` are independent; revocation/expiry is effective on the next check.
- **AC-07:** no qualifying capacity returns nearby verified hospitals and Arabic/English call-`123` guidance, with zero match/dispatch/reservation claim.
- **AC-08:** qualifying hospitals are ordered deterministically and only one informational matched facility is persisted.
- **AC-09:** search coordinates never persist; SOS coordinates persist only after the confirmed activation mutation.
- **AC-10:** same-key replay returns the stored incident; changed body is `409`; concurrent same key has one effect.
- **AC-11:** hospital list/get returns only its matched minimum pre-arrival and no clinical record/contact details.
- **AC-12:** acceptance requires current membership, exact facility, purpose, AAL2, fresh current version, and a matched incident.
- **AC-13:** concurrent accept/close produces one valid terminal progression and no partial audit/outbox response.
- **AC-14:** every locale/state says accepted pre-arrival, never bed reserved or ambulance dispatched.
- **AC-15:** share creation rejects inactive/closed incident, missing independent permission, empty/unknown field scope, and expiry expansion.
- **AC-16:** token has >=256 random bits, is shown once, and plaintext is absent from tables, idempotency body, audit, outbox, logs, traces, screenshots, and browser history evidence.
- **AC-17:** valid first view returns only selected available fields and names unavailable selected fields; token replay/expiry/revocation returns `410` with no data.
- **AC-18:** blood group, confirmed allergies, active/dispensed medicines, chronic conditions, and emergency notes are the only possible data keys; unconfirmed/superseded data is excluded.
- **AC-19:** share access/revoke races have one winner and every access outcome has a safe audit record without raw token or payload.
- **AC-20:** public share response is always `private, no-store` and protected from indexing/referrer leakage by route/security policy.
- **AC-21:** each confirmed contact plus active SOS with `all_confirmed` produces one minimum message with exact consented location precision.
- **AC-22:** `none` preference, declined/revoked/expired contacts, and lab/interaction/medication/admission/routine events produce zero contact messages.
- **AC-23:** unknown/prohibited notification fields, unapproved template, inactive inventory, non-synthetic provider, and current-consent failure are rejected before delivery.
- **AC-24:** transient retry, permanent failure, dedup, and DLQ preserve one visible delivery and never change SOS truth.
- **AC-25:** AR RTL/EN LTR live evidence covers compact/tablet/desktop, keyboard, screen reader, 200%/400% reflow, high contrast, reduced motion, location denied, stale, offline, no match, accepted, share used/expired, and contact failure.
- **AC-26:** forced-RLS tests execute as non-owner roles and prove direct-table denial, cross-patient/cross-facility denial, current-permission checks, and missing-purpose/AAL denial.
- **AC-27:** geospatial/performance evidence records dataset cardinality, radius/freshness config, hardware/profile, query plan/index use, and p50/p95/p99 without coordinates or PHI.
- **AC-28:** migration forward/restore/roll-forward and production-disabled map/SMS/capacity-publisher checks pass with synthetic fixtures only.

Automated paths are frozen in `plan.md` and `tasks.md`; every fixture is deterministic and synthetic.

## 12. Observability, rollout, rollback, and incidents

- SLI/SLO: canonical API targets; SOS match latency/failure; stale-capacity/no-match counts; acceptance conflicts; share create/view/410/revoke counts; contact delivery lag/failure/dedup; low-cardinality only.
- Traces/logs contain request/trace IDs, operation ID, safe outcome, coarse timing, and pseudonymous IDs. Coordinates, raw/hashed share token, phone, callback, emergency-profile fields, free text, full body, and contact content are prohibited.
- Feature flags independently gate discovery UI, SOS activation, hospital pre-arrivals, share creation/view, and local contact delivery. Production map/SMS/capacity publishing stays hard-disabled.
- Kill switches disable new SOS/share creation or contact delivery while preserving call-`123`, incident read/close, share revocation, and committed audit truth.
- Deploy expands/validates/enables. Rollback disables routes/flags and rolls forward durable data; no incident/audit deletion.
- Runbooks: `infra/runbooks/discovery-sos.md` and existing notification/privacy incident runbooks.

## 13. Evidence and approvals

| Gate                  | Reviewer(s)   | Artifact                                          | Decision/date           | Blocking findings                         |
| --------------------- | ------------- | ------------------------------------------------- | ----------------------- | ----------------------------------------- |
| Product/QA            | names pending | spec/checklist/tests/live evidence                | engineering scope only  | `OPEN-TEAM-001`                           |
| Legal/DPO             | names pending | minimization/processing/retention evidence        | not production-approved | `OPEN-LEGAL-001/002/007`                  |
| Clinical              | N/A           | no clinical decision/content/qualification rule   | N/A                     | none                                      |
| Architecture/Security | names pending | PostGIS/contracts/RLS/threat/performance evidence | pending                 | `OPEN-TEAM-001`, affected `OPEN-TECH-002` |
| Design/Accessibility  | names pending | UI Contract + informative screenshots/live checks | informative only        | `OPEN-UX-001/002`, `OPEN-TEAM-001`        |
| Release               | names pending | evidence manifest + PR checks                     | not authorized          | all applicable open gates                 |

## 14. Open items and change log

| Open ID            | Owner                          | Next evidence                                               | Blocks                               |
| ------------------ | ------------------------------ | ----------------------------------------------------------- | ------------------------------------ |
| `OPEN-LEGAL-001`   | Legal + DPO                    | production permits, DPO, hosting/processors/transfers       | production PHI                       |
| `OPEN-LEGAL-002`   | Legal + DPO + Medical Director | signed `SOS_LOCATION` and related retention/action schedule | production retention automation      |
| `OPEN-LEGAL-007`   | Legal + DPO                    | controlling Arabic instruments and counsel mapping          | production legal claims              |
| `OPEN-VENDOR-002`  | Procurement + Platform + DPO   | SMS provider/DPA/SLA/sender/failover approval               | production contact SMS               |
| `OPEN-UX-001/002`  | Product + Design + QA          | approved compositions and regression tolerance              | formal visual approval               |
| `OPEN-PRODUCT-001` | Product + UX Research          | target-user validation evidence                             | formal UAT baseline                  |
| `OPEN-TEAM-001`    | Product Owner                  | named accountable owners/reviewers/on-call                  | formal approvals/release             |
| `OPEN-TECH-001`    | Architecture + Platform        | pinned reproducible PostGIS-capable runtime and SBOM        | byte-reproducible runtime claim      |
| `OPEN-TECH-002`    | API + Data + QA                | merged generated payload/DDL/client consistency evidence    | affected feature contract completion |
| `OPEN-TECH-003`    | QA + Platform                  | deterministic device/network/performance harness evidence   | formal performance acceptance        |

| Date       | Version | Change                                                                                                                                                               |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-20 | 0.1.0   | Initial Phase 2 engineering specification; no active operation added/removed; later discovery slices explicitly excluded                                             |
| 2026-08-20 | 0.2.0   | Clarification pass resolved operation boundaries, fail-closed configuration, callback source, share-use limit, state/reason vocabularies, and public viewer behavior |
