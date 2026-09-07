# SHIFAA Remaining-Specs Roadmap

> **Frozen baseline:** `origin/main@5b1e1d640dcda2060a554f799b90d8f37ce80f12`
>
> **Status:** final graduation roadmap boundary freeze after merged features 001-006
>
> **Prohibition:** this document does not create, start, specify, plan, task, issue, or implement feature 007 or any successor.

## 1. How future work must use this roadmap

Features execute one at a time in the exact order below. Before starting a feature, an agent reads its assigned row and detail block, the listed predecessor evidence, and only the canonical contracts relevant to that feature and its dependencies. The agent must not re-audit or re-split the whole program. A boundary change requires a governance PR first.

No feature may:

- reactivate `FR-FIN-001..003` or the six reserved donation operation IDs;
- add, rename, or omit an active API operation without updating canonical authority through change control;
- invent a UI route, legal/clinical threshold, vendor success, production integration, retention period, or approval;
- create a shadow table for a predecessor-owned resource;
- proceed past a canonical `OPEN-*` gate's earliest blocked lifecycle stage; or
- start before remote `main` contains its predecessor's verified squash merge and cleanup is complete.

## 2. Frozen order

| Feature | Name                                                    | Master phase                    | Primary requirement closure                             | Predecessor | Successor |
| ------- | ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------- | ----------- | --------- |
| 007     | Identity Continuity, Sessions, MFA, and Recovery        | 1 — Foundation                  | AUTH-002/005, FAM-003, ADMIN-002                        | 006         | 008       |
| 008     | Audit, Admin Aggregates, and Observability              | 1 — Foundation                  | ADMIN-003, SEC-006, observability/health foundations    | 007         | 009       |
| 009     | Clinic Scheduling, Appointments, and Queue              | 3 — Clinic/safety               | FAC-005, CLINIC-001..005/008                            | 008         | 010       |
| 010     | Encounters, Referrals, and Contextual Chat              | 3 — Clinic/safety               | FAC-006, CLINIC-006/007                                 | 009         | 011       |
| 011     | Allergies and Clinical-Content Governance               | 3 — Clinic/safety               | SAFE-002/008/012; ADMIN-004 closure                     | 010         | 012       |
| 012     | Prescription Safety and Governed Overrides              | 3 — Clinic/safety               | SAFE-001/003..007/011; SAFE-009/010 prerequisites       | 011         | 013       |
| 013     | Pharmacy Receiving, Product Catalog, and EPTTS          | 4 — Pharmacy                    | FAC-004, PHARM-001..003/007/008                         | 012         | 014       |
| 014     | Pharmacy Inventory, Fulfilment, and Substitution        | 4 — Pharmacy                    | PHARM-004..006/009/010; SAFE-009 closure                | 013         | 015       |
| 015     | Hospital Triage, Beds, and Admission/Transfer/Discharge | 5 — Hospital/lab                | HOSP-001..006                                           | 014         | 016       |
| 016     | Lab Catalog, Orders, and Specimens                      | 5 — Hospital/lab                | LAB-001 and order/specimen slice of LAB-002             | 015         | 017       |
| 017     | Lab Results and Critical-Result Loop                    | 5 — Hospital/lab                | LAB-002 release slice, LAB-003/004                      | 016         | 018       |
| 018     | Vaccinations and Chronic Observations                   | 6 — Longitudinal/support        | VAX-001/002, CHRONIC-001/002                            | 017         | 019       |
| 019     | Medication Adherence and Refills                        | 6 — Longitudinal/support        | MED-001..003; SAFE-010 closure                          | 018         | 020       |
| 020     | Disability Entitlement                                  | 6 — Longitudinal/support        | ACCESS-001/002                                          | 019         | 021       |
| 021     | Trust, Reviews, Complaints, and Discovery Completion    | 6 — Longitudinal/support        | TRUST-001/002; DISC-001 closure                         | 020         | 022       |
| 022     | Care Payments                                           | 6 — Longitudinal/support        | PAY-001                                                 | 021         | 023       |
| 023     | AI Evaluation and Release Governance                    | 7 — AI track                    | AI-005 and release-governance slice of AI-004           | 022         | 024       |
| 024     | AI Runtime and Licensed-Human Confirmation              | 7 — AI track                    | AI-001..004                                             | 023         | 025       |
| 025     | SHIFAA Control                                          | Enabling tooling before release | No product FR; parked developer-control contract        | 024         | 026       |
| 026     | Integrated Graduation Release                           | 8 — Release                     | All remaining cross-cutting NFR closure and P0 journeys | 025         | None      |

There are **20 remaining SpecKit features**. SHIFAA Control is **feature 025**, not 007: its full-scope definition requires truthful lifecycle/health support for the AI service and the complete service graph, while the baseline AI service is only a placeholder. Scheduling it earlier would either fail its own Definition of Done or force later features to reopen its boundary.

## 3. NFR profiles used below

These aliases expand to exact immutable IDs; they do not create new requirements.

- **CORE** = `NFR-SEC-001`, `NFR-SEC-002`, `NFR-SEC-004`, `NFR-SEC-005`, `NFR-SEC-006`, `NFR-SEC-007`, `NFR-PRIV-002`, `NFR-PRIV-004`, `NFR-I18N-001`, `NFR-A11Y-001`, `NFR-PERF-002`, `NFR-DATA-001`, `NFR-DATA-002`, `NFR-API-001`, `NFR-API-002`, `NFR-OBS-001`, `NFR-QUALITY-001`, `NFR-PORT-001`.
- **PATIENT** = CORE plus `NFR-SEC-003`, `NFR-PRIV-001`, `NFR-PERF-001`, `NFR-AVAIL-002`.
- **REALTIME** = CORE plus `NFR-SEC-003`, `NFR-AVAIL-001`, `NFR-AVAIL-002`.
- **ALL** = all 24 NFR IDs: `NFR-SEC-001..007`, `NFR-PRIV-001..004`, `NFR-I18N-001`, `NFR-A11Y-001`, `NFR-PERF-001/002`, `NFR-AVAIL-001/002`, `NFR-DATA-001/002`, `NFR-API-001/002`, `NFR-OBS-001`, `NFR-QUALITY-001`, `NFR-PORT-001`.

## 4. Frozen feature boundaries

### 007 — Identity Continuity, Sessions, MFA, and Recovery

- **FR/NFR:** closure owner for `FR-AUTH-002`, `FR-AUTH-005`, `FR-FAM-003`, and `FR-ADMIN-002`; PATIENT plus `NFR-PRIV-003`.
- **API operation IDs:** `refreshSession`, `logout`, `beginMfaEnrollment`, `verifyMfaEnrollment`, `removeMfaFactor`, `startRecovery`, `completeRecovery`, `transitionDependent`.
- **Data/RLS:** Supabase Auth/session/factor primitives; `identity.care_relationships` transition evidence; shared idempotency, audit, and outbox. Do not invent shadow credential/session tables. The approved `OPEN-LEGAL-006` development matrix fixes the legal behavior without selecting persistence; the API promises a transition case/result while the Data/RLS contract has no explicit transition-case model, so `OPEN-TECH-002` must reconcile the physical state/evidence shape before DDL.
- **UI/apps/services:** patient `/recovery`, `/mfa`, and governed `/relationships` transition states; workforce/admin step-up states in existing shells; `apps/patient`, staff apps, `packages/auth`, Core API.
- **Dependencies/exclusions:** consumes 001-006 identity/RBAC/relationship/audit foundations. Excludes production Valify/SMS enablement, age/capacity trigger guessing, and any weakening of MFA during recovery.
- **OPEN gates:** no valid requirement-specific or program-wide blocker remains before Feature-007 `SPEC_APPROVED`: `OPEN-LEGAL-006` is closed by v2.1.1, and `OPEN-SEC-001` plus `OPEN-TEAM-001` are closed by the Product Owner-approved v2.1.2 amendment. `OPEN-VENDOR-002`, `OPEN-LEGAL-001/002/007`, `OPEN-UX-001/002`, and `OPEN-TECH-002/003` retain their canonical implementation, verification, or production effects.
- **Evidence:** refresh-family rotation/reuse/expiry and concurrent replay; recovery factor/re-proofing negatives; AAL1-to-AAL2 step-up and factor removal; cross-device logout; relationship transition preserves patient record and denies automatic transfer; forced-RLS, CSRF/cookie/mobile-storage, Arabic/English keyboard/screen-reader/reduced-motion evidence; read/mutation p95; full `pnpm verify`.

### 008 — Audit, Admin Aggregates, and Observability

- **FR/NFR:** closure owner for `FR-ADMIN-003` and `NFR-SEC-006`; CORE plus `NFR-AVAIL-001` and `NFR-AVAIL-002`; establishes, but does not finally close, `NFR-OBS-001`.
- **API operation IDs:** `getAdminSummary`, `listAuditEvents`, `getAuditEvent`, `createAuditExport`, `exportAuditPartition`, `healthLive`, `healthReady`.
- **Data/RLS:** `audit.events`, `audit.signature_evidence`, `audit.export_batches`, feature-flag/health projections; append-only/hash-chain/export proofs; `super_admin` AAL2+purpose redacted reads; DPO has no general audit grant.
- **UI/apps/services:** admin `/dashboard` and `/audit`; `apps/admin`, Core API, worker/export adapter, `packages/observability`.
- **Dependencies/exclusions:** requires 007 real MFA/session step-up. Excludes patient-level admin analytics, raw PHI logs, guessed minimum-cell threshold, production WORM claims without evidence, and general DPO audit access.
- **OPEN gates:** no valid blocker remains before Feature-008 `SPEC_APPROVED`: `OPEN-PRIV-001` is closed for graduation engineering by approved package v1.0.0. `metrics: []` activates no aggregate and does not block planning; each metric/status mapping stays fail-closed until later approved configuration. `OPEN-LEGAL-001/002/007`, `OPEN-TECH-001/002/003`, `OPEN-UX-001/002`, and `OPEN-PRODUCT-001` retain canonical later-stage effects.
- **Evidence:** minimum-cell suppression/re-identification negatives; self/grant/purpose/AAL denial matrix; hash-chain tamper detection; write-once export digest/tabletop; redaction sentinel scan; low-cardinality metrics; health degraded/readiness behavior; restore prerequisites; admin AR/EN accessibility; performance and full verification.

### 009 — Clinic Scheduling, Appointments, and Queue

- **FR/NFR:** `FR-FAC-005`, `FR-CLINIC-001..005`, `FR-CLINIC-008`; doctor slice of `FR-DISC-001`; PATIENT plus `NFR-AVAIL-001`.
- **API operation IDs:** `searchDoctors`, `listDoctorAvailability`, `createSchedule`, `updateSchedule`, `createScheduleException`, `createAppointment`, `getAppointment`, `listAppointments`, `cancelAppointment`, `rescheduleAppointment`, `checkInAppointment`, `getQueue`, `getMyQueuePosition`, `callQueueEntry`, `reorderQueueEntry`, `completeQueueEntry`, `sendDoctorDelay`, `declareDoctorAbsence`.
- **Data/RLS:** `clinical.schedules`, `schedule_exceptions`, `appointments`, `queue_entries`; exclusion/concurrency constraints, facility/doctor/date scope, queue reasons, versioning, audit/outbox.
- **UI/apps/services:** patient `/discover`, `/doctors/:id`, `/appointments/new`, `/appointments/:id`; clinic `/today`, `/queue`, `/schedule`, `/appointments/:id`; patient/clinic apps, API, worker.
- **Dependencies/exclusions:** verified facilities/licenses/RBAC, notification foundation, session step-up. Cash-on-arrival only; excludes digital PSP, encounters, prescriptions, general chat, and shadow stock/review discovery.
- **OPEN gates:** `OPEN-UX-001/002`, `OPEN-PRODUCT-001`, `OPEN-TECH-002/003`; production delay SMS also `OPEN-VENDOR-002`.
- **Evidence:** double-book race; idempotent retry/body mismatch; schedule overlap/date exception; queue reorder reason/authorization; reconnect/reconcile/stale UI; absence-to-reschedule and scoped notification; cross-facility/RLS negatives; AR/EN patient and clinic live evidence; p95 thresholds and full verification.

### 010 — Encounters, Referrals, and Contextual Chat

- **FR/NFR:** `FR-FAC-006`, `FR-CLINIC-006`, `FR-CLINIC-007`; PATIENT and REALTIME.
- **API operation IDs:** `createEncounter`, `getEncounter`, `updateEncounter`, `signEncounterNote`, `completeEncounter`, `createReferral`, `listReferrals`, `acceptReferral`, `listContextMessages`, `sendContextMessage`.
- **Data/RLS:** `clinical.encounters`, `encounter_participants`, `clinical_notes`, `conditions`, `referrals`, `trust.messages`; encrypted/versioned notes, explicit visibility, authorized referral field set, context/expiry-bound messages.
- **UI/apps/services:** patient `/records`, `/encounters/:id`; clinic `/patients/:id/summary`, `/encounters/:id`, `/referrals`, `/messages`; patient/clinic apps, API, realtime/outbox worker.
- **Dependencies/exclusions:** 009 appointment/queue context. Excludes open-ended consultation chat, safety/prescription logic, unauthorized private-note sharing, and offline clinical writes. Chat attachments remain body-only/disabled until governance resolves the missing upload-intent operation; the patient chat composition is also a UI-contract reconciliation item.
- **OPEN gates:** `OPEN-LEGAL-001/002/007`, `OPEN-UX-001/002`, `OPEN-PRODUCT-001`, `OPEN-TECH-002/003`.
- **Evidence:** participant/care-purpose/RLS matrix; note visibility and immutable supersession; referral minimum-field consent and linked appointment; context expiry/participant removal; reconnect/stale chat; prohibited telemetry scan; AR/EN accessibility; read/mutation/realtime performance and full verification.

### 011 — Allergies and Clinical-Content Governance

- **FR/NFR:** `FR-SAFE-002`, `FR-SAFE-008`, `FR-SAFE-012`; closure slice of `FR-ADMIN-004`; CORE plus `NFR-PRIV-001`.
- **API operation IDs:** `listAllergies`, `createAllergy`, `verifyAllergy`, `listClinicalContent`, `createClinicalContentRelease`, `signClinicalContentRelease`, `publishClinicalContentRelease`.
- **Data/RLS:** `clinical.allergies`, `clinical.content_releases`, `audit.signature_evidence`; append-versioned provenance, draft/published state, physician/pharmacist independent signatures.
- **UI/apps/services:** patient `/records`; clinic `/patients/:id/summary`, `/clinical-content/status`; admin `/clinical-content`; patient/clinic/admin apps, API.
- **Dependencies/exclusions:** encounter/patient context from 010. Excludes prescription evaluation/override, unsigned rule activation, fabricated medical content, lab/vaccine policy ownership, and self-approval.
- **OPEN gates:** `OPEN-CLIN-001` gates safety content release; `OPEN-TECH-002/003`, `OPEN-UX-001/002`, legal production gates.
- **Evidence:** allergy provenance/state correction; cross-patient/RLS negatives; unpublished/unsigned content cannot affect decisions; dual-signature/self-approval matrix; digest/version rollback; AR/EN clinical/admin accessibility; performance and full verification.

### 012 — Prescription Safety and Governed Overrides

- **FR/NFR:** `FR-SAFE-001`, `FR-SAFE-003..007`, `FR-SAFE-011`; prescribing prerequisites for `FR-SAFE-009/010`; PATIENT.
- **API operation IDs:** `createPrescription`, `updatePrescription`, `runPrescriptionSafety`, `acknowledgeWarning`, `requestContraindicatedOverride`, `decideOverride`, `signPrescription`, `cancelPrescription`, `getPrescription`, `listPatientMedications`.
- **Data/RLS:** `clinical.prescriptions`, `prescription_items`, `detected_issues`, `issue_acknowledgements`, `override_requests`, `override_signatures`, `medication_statements`; signed immutability, independent decisions, expiry, FHIR-aligned provenance.
- **UI/apps/services:** patient `/records`, `/prescriptions/:id`; clinic `/prescriptions/:id`; patient/clinic apps, API.
- **Dependencies/exclusions:** 010 encounter and 011 approved allergy/content versions. Excludes dispense, final substitution, refill UI, autonomous safety claims, or controlled-drug electronic-substitute claims.
- **OPEN gates:** `OPEN-CLIN-001`, `OPEN-CLIN-002`, `OPEN-LEGAL-003`, plus `OPEN-TECH-002/003`, `OPEN-UX-001/002`.
- **Evidence:** canonical contraindicated journey; unknown input produces `not_fully_checked`; warning justification/monitoring; normal hard stop; pharmacist two-person override; emergency two-physician window/expiry; no self-approval; immutable signed/corrected history; RLS/AAL2/idempotency/race tests; AR/EN safety UI; safety-set metrics, p95, and full verification.

### 013 — Pharmacy Receiving, Product Catalog, and EPTTS

- **FR/NFR:** `FR-FAC-004`, `FR-PHARM-001..003`, `FR-PHARM-007/008`; CORE.
- **API operation IDs:** `assignPharmacyDirector`, `searchProductCatalog`, `createReceipt`, `listReceipts`, `getReceipt`, `scanReceiptPack`, `recordUnverifiedReceiptPack`, `completeReceipt`, `createEpttsExport`, `listEpttsBatches`, `getEpttsBatch`, `recordEpttsSubmission`, `runCatalogImport`, `recordEpttsImport`.
- **Data/RLS:** `identity.pharmacy_directorships`, `pharmacy.catalog_versions`, `products`, `receipts`, `receipt_items`, first physical ownership of `inventory_packs`/`inventory_movements`, `eptts_exchange_batches`; global serial uniqueness, aggregation truth, append-only receipt movements.
- **UI/apps/services:** pharmacy `/receipts`, `/receipts/:id/scan`, `/eptts`, product search/worklist; pharmacy app, API, import/EPTTS worker. Pharmacy-director and product-catalog staff routes remain `BASELINE RECONCILIATION REQUIRED` rather than invented.
- **Dependencies/exclusions:** signed prescription/product safety contracts from 012. Excludes fulfilment, patient stock projection, live EDA API, scraping presented as integration, and false EPTTS verification.
- **OPEN gates:** `OPEN-LEGAL-003` where statutory/e-prescription evidence intersects; `OPEN-TECH-002/003`, `OPEN-UX-001/002`; canonical regulator/vendor evidence remains required.
- **Evidence:** GS1 AI parsing; duplicate serial race; aggregation/disaggregation and no fabricated units; damaged-code evidence/quarantine; append-only receive movement; provenance/reviewer/digest; EPTTS file/manual import/export and receipt/error states; director partial-unique/external-evidence boundary; RLS, AR/EN scanner/accessibility, performance, and full verification.

### 014 — Pharmacy Inventory, Fulfilment, and Substitution

- **FR/NFR:** `FR-PHARM-004..006`, `FR-PHARM-009/010`; closure owner for `FR-SAFE-009`; pharmacy-stock slice of `FR-DISC-001`; PATIENT and REALTIME.
- **API operation IDs:** `searchPharmacyStock`, `listPharmacyWorklist`, `listInventory`, `getInventoryPack`, `adjustInventoryPack`, `returnInventoryPackUnits`, `changeInventoryPackState`, `getPrescriptionForFulfilment`, `createFulfilment`, `getFulfilment`, `proposeSubstitution`, `getSubstitution`, `decideSubstitution`, `dispenseFulfilment`, `rejectFulfilment`, `cancelFulfilment`.
- **Data/RLS:** consumes 013 packs/movements; owns `fulfilments`, `dispense_lines`, `substitutions`, `controlled_dispense_register_entries`, `stock_projections`; exact-pack/units atomicity and append-only corrections.
- **UI/apps/services:** patient `/discover`, `/prescriptions/:id`; pharmacy `/worklist`, `/inventory`, `/inventory/packs/:id`, `/fulfilments/:id`, `/substitutions/:id`; patient/pharmacy apps, API, projection worker.
- **Dependencies/exclusions:** 012 signed prescriptions and 013 catalog/serialized receipt. Excludes exact public stock, stale-as-confirmed, automatic refill authorization, pharmacy trading/logistics, and paper-register replacement claims.
- **OPEN gates:** `OPEN-PHARM-001` blocks `FR-PHARM-006` at `SPEC_APPROVED`; `OPEN-CLIN-002`, `OPEN-LEGAL-003`, `OPEN-TECH-002/003`, `OPEN-UX-001/002`.
- **Evidence:** exact-pack atomic dispense; partial pack balance; concurrent reserve/dispense; recall/expiry/quarantine/destroy/return/correction history; substitution authority matrix; controlled register; freshness boundary to `unknown`; cross-pharmacy/RLS negatives; AR/EN scan/worklist; performance and full verification.

### 015 — Hospital Triage, Beds, and Admission/Transfer/Discharge

- **FR/NFR:** `FR-HOSP-001..006`; CORE and REALTIME.
- **API operation IDs:** `createHospitalArrival`, `listHospitalArrivals`, `getHospitalArrival`, `createTriageAssessment`, `listWards`, `createWard`, `updateWard`, `listBeds`, `createBed`, `changeBedState`, `holdBed`, `releaseBedHold`, `createAdmissionPlan`, `getAdmission`, `listAdmissions`, `markAdmissionArrived`, `admitPatient`, `requestTransfer`, `transferAdmissionOut`, `cancelAdmission`, `createDischargeDraft`, `signDischarge`, `amendDischarge`.
- **Data/RLS:** `hospital.arrivals`, `triage_assessments`, `wards`, `beds`, `bed_holds`, `admissions`, `bed_assignments`, `transfers`, `discharge_versions`; consumes 006 capacity/pre-arrival without exposing patient/ward detail publicly.
- **UI/apps/services:** hospital `/arrivals`, `/arrivals/:id/triage`, `/wards/:id`, `/beds`, `/admissions/:id`, `/admissions/:id/transfer`, `/admissions/:id/discharge`, existing `/capacity` and `/sos-prearrivals`; hospital/patient apps, API. The subject-readable patient admission composition is `BASELINE RECONCILIATION REQUIRED`.
- **Dependencies/exclusions:** 006 SOS, 012 medication/signed prescription, 014 medication fulfilment/reconciliation projections. AI suggestion is nullable and cannot affect workflow before 024 human-confirmation integration. Excludes guaranteed reservation and autonomous triage.
- **OPEN gates:** legal/retention, `OPEN-TECH-002/003`, `OPEN-UX-001/002`, `OPEN-PRODUCT-001`.
- **Evidence:** canonical bed race/hold expiry; state-transition denial; stale version; atomic intra-facility transfer/no partial release; transfer-out; discharge checklist/sign/amendment; cross-facility RLS; realtime disconnect/reconcile/stale UI; AR/EN safety/accessibility; load p95 and full verification.

### 016 — Lab Catalog, Orders, and Specimens

- **FR/NFR:** `FR-LAB-001`; order/specimen lifecycle of `FR-LAB-002`; CORE.
- **API operation IDs:** `searchLabTests`, `createLabOrder`, `getLabOrder`, `listLabOrders`, `acceptLabOrder`, `cancelLabOrder`, `collectSpecimen`, `getSpecimen`, `receiveSpecimen`, `rejectSpecimen`, `listLabCatalogVersions`, `createLabCatalogVersion`, `publishLabCatalogVersion`.
- **Data/RLS:** `lab.test_catalog_versions`, `test_definitions`, `orders`, `order_items`, `specimens`; aggregate/child transition consistency, chain of custody, recollection, versioned signed catalog.
- **UI/apps/services:** patient `/lab-orders/:id`; lab `/orders`, `/orders/:id`, `/specimens/:id`, `/catalog`; clinic encounter order action; patient/clinic/lab apps, API.
- **Dependencies/exclusions:** 010 encounter context and 011 four-eyes content pattern. Excludes results, patient pre-release visibility, critical notification, and invented test/reference content.
- **OPEN gates:** relevant `OPEN-CLIN-003`, legal/retention, `OPEN-TECH-002/003`, `OPEN-UX-001/002`.
- **Evidence:** coded minimum order; role-projected worklists; item/order state consistency; accession uniqueness; collection/receipt/rejection/recollection chain; catalog independent publish; RLS/cross-lab negatives; AR/EN lab/patient accessibility; p95 and full verification.

### 017 — Lab Results and Critical-Result Loop

- **FR/NFR:** release-visibility closure of `FR-LAB-002`, `FR-LAB-003`, `FR-LAB-004`; PATIENT and REALTIME.
- **API operation IDs:** `recordLabResult`, `verifyLabResult`, `releaseLabResult`, `correctLabResult`, `getLabResult`, `acknowledgeCriticalResult`, `listCriticalResults`, `listCriticalPolicies`, `createCriticalPolicy`, `publishCriticalPolicy`.
- **Data/RLS:** `lab.result_versions`, `critical_policies`, `critical_events`, `critical_acknowledgements`; immutable correction chain, recipient-specific notification/ack/escalation.
- **UI/apps/services:** patient `/lab-results/:id`; lab `/results/:id`, `/critical-results`, `/critical-policies`; patient/clinic/lab apps, API, worker. The ordering-clinician critical-result worklist/acknowledgement composition is `BASELINE RECONCILIATION REQUIRED`.
- **Dependencies/exclusions:** 016 orders/specimens and 005 notification foundation. Excludes Emergency Contact notification, unapproved thresholds, overwrite correction, and patient visibility before release.
- **OPEN gates:** `OPEN-CLIN-003`, legal/retention, `OPEN-VENDOR-002` for production SMS, `OPEN-TECH-002/003`, `OPEN-UX-001/002`.
- **Evidence:** authorized verify/release; original-preserving correction; critical policy version/digest; clinician+patient delivery with no Emergency Contact; acknowledgement/escalation race/SLA; worker retry/dedup/dead-letter; RLS; AR/EN critical UI; p95 and full verification.

### 018 — Vaccinations and Chronic Observations

- **FR/NFR:** `FR-VAX-001/002`, `FR-CHRONIC-001/002`; PATIENT.
- **API operation IDs:** `listObservations`, `createObservation`, `listVaccinations`, `recordVaccination`, `verifyVaccination`.
- **Data/RLS:** `clinical.observations`, `vaccine_schedule_versions`, `vaccine_rules`, `vaccinations`; typed values/units/source, self-reported labels, approved schedule/catch-up rules.
- **UI/apps/services:** patient `/observations`, `/vaccinations`; clinic `/patients/:id/summary`; patient/clinic apps, API.
- **Dependencies/exclusions:** 011 content governance and 017 lab/clinical context where relevant. Excludes diagnosis, unapproved alarms, mandatory/optional conflation, and fabricated catch-up advice.
- **OPEN gates:** `OPEN-CLIN-003`, legal/retention, `OPEN-TECH-002/003`, `OPEN-UX-001/002`.
- **Evidence:** unit/type constraints; source/time/provenance; self-reported vs verified; trend-only/no diagnosis; schedule version and `clinical_review_required`; RLS; AR/EN charts/bidi/accessibility; p95 and full verification.

### 019 — Medication Adherence and Refills

- **FR/NFR:** `FR-MED-001..003`; closure owner for no-auto-refill portion of `FR-SAFE-010`; PATIENT and REALTIME.
- **API operation IDs:** `createDoseSchedule`, `recordDose`, `getAdherence`, `listRefillPlans`, `createRefillRequest`, `decideRefillRequest`.
- **Data/RLS:** `clinical.dose_schedules`, `dose_logs`, `refill_plans`, `refill_requests`; append-only responses, explicit calculation windows/missingness, routed decisions.
- **UI/apps/services:** patient `/medications`, `/medications/:id`; clinic patient summary; pharmacy worklist; patient/clinic/pharmacy apps, API, reminder/refill worker.
- **Dependencies/exclusions:** 012 medication statements and 014 dispensed quantity. Excludes diagnosis/adherence punishment, silent prescription changes, controlled automatic refill, and prescription auto-creation without prescriber.
- **OPEN gates:** `OPEN-CLIN-002` for controlled paths, production messaging vendor, legal/retention, team/tech/UX gates.
- **Evidence:** taken/snoozed/missed/skipped-with-reason; DST/time-zone schedule; adherence missingness/window; quantity-based depletion; no-auto-authorization; worker dedup/retry; RLS; AR/EN accessibility; performance and full verification.

### 020 — Disability Entitlement

- **FR/NFR:** `FR-ACCESS-001/002`; PATIENT.
- **API operation IDs:** `getDisabilityCredential`, `createDisabilityCredential`, `reviewDisabilityCredential`.
- **Data/RLS:** encrypted `identity.identities` disability-card value plus `identity.disability_credentials`; verification evidence/benefit-policy version; never a payment instrument.
- **UI/apps/services:** patient `/entitlements`; authorized facility projection. Exact staff review route is `BASELINE RECONCILIATION REQUIRED`; patient/staff apps and API.
- **Dependencies/exclusions:** 007 identity/re-proofing and 003 facility authorization. Excludes automatic benefit adjudication, UHI/insurance claims, free-private-care promises, and payment-method treatment.
- **OPEN gates:** `OPEN-LEGAL-005` gates automated entitlement; legal/retention, team/tech/UX gates.
- **Evidence:** encrypted/masked credential; manual/official evidence states; benefit applicability/version; canonical “not payment” journey; patient/facility/admin RLS; AR/EN accessibility; performance and full verification.

### 021 — Trust, Reviews, Complaints, and Discovery Completion

- **FR/NFR:** `FR-TRUST-001/002`; closure owner for `FR-DISC-001`; PATIENT and REALTIME.
- **API operation IDs:** `createReview`, `listReviews`, `reportReview`, `listReviewReports`, `moderateReview`, `createComplaint`, `listComplaints`, `getComplaint`, `respondComplaint`, `escalateComplaint`.
- **Data/RLS:** `trust.reviews`, `review_reports`, `complaints`, `complaint_events`; verified-source uniqueness, attributable anonymous display, private timelines, SLA/escalation history; rating summary derives from moderated reviews.
- **UI/apps/services:** patient `/reviews`, `/complaints`, `/discover`; admin `/reviews`, `/complaints`; patient/admin/staff apps, API, SLA worker. The facility complaint route/composition is `BASELINE RECONCILIATION REQUIRED`.
- **Dependencies/exclusions:** completed encounters/orders from 009-017, notification foundation, verified discovery. Excludes public complaints, unattributable reviews, exact patient disclosure in aggregates, and general chat.
- **OPEN gates:** legal/retention plus team/tech/UX/product gates; later identifying aggregates must reuse approved OPEN-PRIV-001 policy v1.0.0 or obtain an approved policy amendment.
- **Evidence:** verified-source and one-review rules; anonymous display/internal attribution; report/moderation; role-projected complaint timeline; SLA escalation/dedup; facility/admin separation; rating freshness; RLS; AR/EN accessibility; p95 and full verification.

### 022 — Care Payments

- **FR/NFR:** `FR-PAY-001`; PATIENT plus `NFR-AVAIL-001`.
- **API operation IDs:** `createPaymentIntent`, `getPaymentIntent`, `paymentProviderCallback`.
- **Data/RLS:** `finance.payment_intents`; server-derived subject/version/amount/currency, tokenized provider reference, idempotent signed callback, no PAN/CVV/wallet secret.
- **UI/apps/services:** patient `/payments/:id`; finance-review projection. Exact finance-review route is `BASELINE RECONCILIATION REQUIRED`; patient/admin apps, API, PSP adapter.
- **Dependencies/exclusions:** versioned care fees from 009 and later care subjects. Excludes SHIFAA fund custody, donations, UHI claims, card storage, and digital enablement without a licensed PSP.
- **OPEN gates:** `OPEN-VENDOR-003` blocks production digital payment release; legal, team, tech, UX/product gates.
- **Evidence:** authoritative amount mismatch rejection; cash instruction vs hosted flow; callback signature/replay/out-of-order handling; no payment secrets; finance/patient RLS; failure/expiry/reconciliation; AR/EN accessibility; p95 and full verification.

### 023 — AI Evaluation and Release Governance

- **FR/NFR:** `FR-AI-005`; release/privacy portion of `FR-AI-004`; CORE.
- **API operation IDs:** `listAiModelReleases`, `createAiModelRelease`, `signAiModelRelease`, `publishAiModelRelease`.
- **Data/RLS:** `platform.ai_model_releases`, `ai_evaluation_runs`, `ai_release_signatures`, `audit.signature_evidence`; locked dataset/artifact digests, thresholds, three mapped independent signatures, rollback target.
- **UI/apps/services:** admin `/ai-model-releases`; admin app, API, evaluation harness/isolated AI build pipeline.
- **Dependencies/exclusions:** 011 governance patterns and 008 audit. It precedes runtime so 024 cannot infer against an unsigned/unpublished release. Excludes production PHI, public access, training on inputs, and threshold invention.
- **OPEN gates:** `OPEN-AI-001` blocks graduation verification; team/tech/UX gates; production real-PHI remains under legal/vendor/privacy gates.
- **Evidence:** locked Arabic/safety set; red-flag recall/harm thresholds; dataset/model-card digests; creator/signer/publisher separation; mapped clinical/privacy/security AAL2 signatures; timeout/rollback/kill switch; RLS; admin AR/EN accessibility; release-API read/mutation p95 against `NFR-PERF-002`; evaluation-harness duration/throughput recorded on the reproducible profile; reproducibility/SBOM and full verification.

### 024 — AI Runtime and Licensed-Human Confirmation

- **FR/NFR:** `FR-AI-001..004`; consumes `FR-AI-005` release; PATIENT plus `NFR-AVAIL-001`.
- **API operation IDs:** `symptomCheck`, `suggestHospitalSeverity`, `getAiRun`.
- **Data/RLS:** `platform.ai_runs`; allow-listed structured inputs/digests, deterministic red flag first, published release reference, advisory output/uncertainty/sources, reviewer decision; no training payload.
- **UI/apps/services:** patient `/symptom-check`; hospital `/arrivals/:id/triage`; patient/hospital apps, API, real `services/ai` runtime. The authorized admin AI-run review composition is `BASELINE RECONCILIATION REQUIRED`.
- **Dependencies/exclusions:** 015 human triage and 023 approved model release. Excludes diagnosis, treatment/dose recommendation, direct identifiers/free text, external unapproved PHI, and any AI mutation of hospital state.
- **OPEN gates:** `OPEN-AI-001`; production legal/vendor/privacy gates; team/tech/UX/product gates.
- **Evidence:** deterministic red flags before model/timeout; identifier/free-text rejection; no-public-access/synthetic-only boundary; no-diagnosis routing/uncertainty/sources; licensed confirmation/change attribution; failure fallback and kill switch; RLS/minimization; Arabic evaluation; p95 and full verification.

### 025 — SHIFAA Control

- **FR/NFR:** no PRD FR closure. Applicable preservation obligations: `NFR-SEC-002`, `NFR-OBS-001`, `NFR-QUALITY-001`, `NFR-PORT-001`. Normative scope comes only from the approved reconciliation of the parked Control document.
- **API operation IDs:** none; it invokes repository commands and service health endpoints without adding product API routes.
- **Data/RLS:** no product schema or migration. Committed service topology/config schema under `tools/shifaa-control`; developer-local ownership/UI state under an ignored `.shifaa/` boundary; no secrets.
- **UI/apps/services:** Windows `SHIFAA-CONTROL.bat`, pre-Node PowerShell bootstrap, independent Control Core, headless CLI, keyboard-first TUI; coordinates all six apps, API, worker, AI, Supabase/PostgreSQL, logs, Doctor, verify, database, setup, and repository status.
- **Dependencies/exclusions:** all runnable services through 024. Excludes replacing pnpm/Turbo/Docker/Supabase/Git, role-specific dependency profiles, unsafe port-based killing, automatic destructive repair, product functionality, direct-main bypass, and agent/AI integration as a bootstrap prerequisite.
- **OPEN gates:** `OPEN-TECH-001/003`; tooling dependencies require fresh provenance/supply-chain review. Product legal/clinical gates remain visible but Control cannot close them.
- **Evidence:** clean supported-Windows bootstrap; side-by-side repository Node activation; missing/wrong/broken/auth-required detector states; explicit machine-change consent; owned process-tree graceful/forced stop, orphan/PID-reuse/crash recovery, unowned-process survival and port release; dependency graph/ref-counted shared services; truthful health/degraded states; measured bootstrap, profile-start, graceful-stop, health-poll convergence, and TUI input/render latency on a reproducible machine profile, with pass thresholds approved in the feature plan rather than invented here; redacted logs; destructive confirmations; manual-command fallback; all app/service profiles; keyboard TUI; full `pnpm verify`.

### 026 — Integrated Graduation Release

- **FR/NFR:** no new FR. Closure owner for every still-PARTIAL/PLANNED cross-cutting NFR; ALL. Rechecks all 92 active FRs and confirms the three deferred FRs remain absent.
- **API operation IDs:** no new operations. Exact parity gate is all **242 active** catalog IDs across catalog, generated OpenAPI 3.1.1, contracts, generated clients, authorization, and registered routes; all six donation reservations absent.
- **Data/RLS:** no new domain scope; clean migration of every graduation table, forced-RLS matrix, backup/restore and rollback/roll-forward evidence, retention blocks preserved where unresolved.
- **UI/apps/services:** every canonical P0 route in patient, clinic, pharmacy, hospital, lab, and admin; full service graph through SHIFAA Control.
- **Dependencies/exclusions:** 001-025 merged, verified, and cleaned. Excludes production PHI/claims where release gates remain open, donations, ambulance dispatch, insurance/UHI claims, autonomous AI, and any hidden waiver.
- **OPEN gates:** all 23 open items are rechecked. Release may record an honest synthetic graduation release with production capabilities disabled, but cannot relabel a production-blocking gate as closed without its named evidence. `OPEN-AI-001` must pass graduation acceptance.
- **Evidence:** deterministic PRD journeys; all feature acceptance manifests; AR RTL/EN LTR at required viewports/devices; keyboard, NVDA/TalkBack, 200%/400%, contrast, reduced motion; all forced-RLS/authorization/idempotency/concurrency negatives; complete API/DDL/UI/trace parity; load/SLO/SOS; ASVS/API/SAST/dependency/secrets/SBOM; breach and restore/DR table-tops; no-PHI telemetry; signed clinical/security/DPO/Product evidence as applicable; one isolated clean `pnpm verify`; `git diff --check`; exact-head green PR and merged-main re-verification.

## 5. Dependency DAG and execution rule

The integration graph is intentionally a single topological order. Domain prerequisites may be reused by later nodes, but no edge may point backward and no node may execute in parallel in the current delivery policy.

```mermaid
flowchart LR
  S006[006 Discovery and SOS] --> S007[007 Identity continuity]
  S007 --> S008[008 Audit and observability]
  S008 --> S009[009 Clinic schedule and queue]
  S009 --> S010[010 Encounters referrals chat]
  S010 --> S011[011 Allergies and content]
  S011 --> S012[012 Prescription safety]
  S012 --> S013[013 Pharmacy receiving EPTTS]
  S013 --> S014[014 Pharmacy fulfilment]
  S014 --> S015[015 Hospital flow]
  S015 --> S016[016 Lab orders specimens]
  S016 --> S017[017 Lab results critical loop]
  S017 --> S018[018 Vaccination chronic]
  S018 --> S019[019 Adherence refills]
  S019 --> S020[020 Disability]
  S020 --> S021[021 Trust discovery closure]
  S021 --> S022[022 Care payments]
  S022 --> S023[023 AI release governance]
  S023 --> S024[024 AI runtime]
  S024 --> S025[025 SHIFAA Control]
  S025 --> S026[026 Integrated release]
```

This graph has 21 nodes including completed predecessor 006, 20 forward edges, no cycle, and no unowned prerequisite.

## 6. OPEN-gate ownership map

| Gate                                                 | Earliest affected remaining feature(s) | Frozen effect                                                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN-SEC-001                                         | 007                                    | CLOSED for Feature-007 specification/development by the Product Owner/Architecture-approved v2.1.2 policy; implementation/security/release evidence remains required                  |
| OPEN-LEGAL-006                                       | 007                                    | CLOSED for FR-FAM-003 specification/development by the Product Owner-approved v2.1.1 amendment; production legal/DPO/PHI gates remain open                                            |
| OPEN-PRIV-001                                        | 008                                    | CLOSED for Feature-008 graduation engineering by package v1.0.0; later aggregate metrics remain fail-closed pending approved configuration and policy-level changes require amendment |
| OPEN-PHARM-001                                       | 014                                    | Blocks FR-PHARM-006 `SPEC_APPROVED`                                                                                                                                                   |
| OPEN-LEGAL-003                                       | 012-014, 019                           | Blocks controlled/e-prescription production release                                                                                                                                   |
| OPEN-LEGAL-005                                       | 020                                    | Blocks automated disability entitlement                                                                                                                                               |
| OPEN-CLIN-001                                        | 011-012                                | Blocks prescription-safety release                                                                                                                                                    |
| OPEN-CLIN-002                                        | 012, 014, 019                          | Blocks controlled/NTI paths                                                                                                                                                           |
| OPEN-CLIN-003                                        | 016-018                                | Blocks lab/vaccine governed content                                                                                                                                                   |
| OPEN-VENDOR-001                                      | completed identity / 026               | Automated production proofing remains disabled                                                                                                                                        |
| OPEN-VENDOR-002                                      | 007, 009, 017, 019                     | Production OTP/SMS remains disabled                                                                                                                                                   |
| OPEN-VENDOR-003                                      | 022                                    | Production digital payments remain disabled                                                                                                                                           |
| OPEN-AI-001                                          | 023-024                                | Blocks graduation AI verification, not scope                                                                                                                                          |
| `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007` | all PHI features / 026                 | Production PHI, retention automation, and article-level claims remain blocked                                                                                                         |
| `OPEN-UX-001`, `OPEN-UX-002`                         | every UI feature / 026                 | Pixel-identical/formal visual claims remain blocked                                                                                                                                   |
| OPEN-PRODUCT-001                                     | journey features / 026                 | UAT baseline remains blocked                                                                                                                                                          |
| OPEN-TEAM-001                                        | every feature                          | CLOSED by the Product Owner-approved v2.1.2 operating model; implementation assignments activate under approved specs/tasks and do not create independent lifecycle approvers         |
| OPEN-TECH-001                                        | 025-026 and reproducibility claims     | Byte-reproducible tool/runtime claim remains blocked                                                                                                                                  |
| OPEN-TECH-002                                        | every affected feature / 026           | Full active API/DDL/client parity closes incrementally                                                                                                                                |
| OPEN-TECH-003                                        | every performance/UI feature / 026     | Formal device/network/accessibility performance acceptance remains blocked                                                                                                            |

## 7. Machine-checkable reconciliation targets

Before this freeze is changed or feature 007 is started, the governance baseline must continue to satisfy:

1. PRD extraction: 95 unique FR IDs, exactly 92 active and 3 deferred; 24 unique NFR IDs.
2. Coverage ledger: 119 unique rows, no duplicate/missing ID, category totals `27/23/60/6/3` for DONE/PARTIAL/PLANNED/BLOCKED/DEFERRED.
3. API catalog: 242 unique active operation IDs plus six reserved donation IDs; 72 implemented by 001-006; 170 future IDs assigned exactly once across 007-024; no product API added by 025-026.
4. Deferred exclusion: no future row owns `FR-FIN-001..003` or a reserved donation operation.
5. DAG: 20 remaining nodes, exact order 007-026, no cycle, no missing predecessor/successor.
6. Every active requirement has a completed or future closure owner; every blocker names a canonical `OPEN-*` ID.
7. Every future feature lists data/RLS, UI/app/service, security, performance, acceptance, dependency, and exclusion boundaries.

Any failure is `BASELINE RECONCILIATION REQUIRED`; it is not permission to modify a canonical requirement to make the roadmap pass.
