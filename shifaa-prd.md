# SHIFAA (شفاء) — Product Requirements Document

> **Document ID:** SHIFAA-PRD  
> **Version:** 2.1.0  
> **Status:** Approved implementation baseline; production authorization blockers remain open  
> **Owner:** Product Owner  
> **Approved by:** Yousef Osama  
> **Approved on:** 9-Aug-2026  
> **Approval version:** v2.1.0  
> **Approval record:** [`docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md`](./docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md)  
> **Last verified:** 2026-08-09 (Africa/Cairo)  
> **Delivery target:** 2027-05-31

## 1. Purpose and authority

SHIFAA is an Egyptian integrated digital-health platform connecting patients, clinics, pharmacies, hospitals, and diagnostic laboratories around one longitudinal patient record. The MVP must demonstrate a real end-to-end care journey without simulating a clinical, identity, pharmacy, or facility operation that is described as complete.

This PRD is the source of truth for product intent, scope, numbered requirements, and acceptance outcomes. The [Master Implementation Plan](./SHIFAA-Implementation-Plan-MASTER.md) is authoritative for architecture and delivery governance. Machine and implementation contracts are owned by the supporting documents below:

| Contract | Authority |
|---|---|
| Egyptian legal/compliance baseline | [`docs/compliance/EGYPT-Compliance-Baseline.md`](./docs/compliance/EGYPT-Compliance-Baseline.md) |
| Canonical architecture and repository tree | [`docs/architecture/SHIFAA-Architecture.md`](./docs/architecture/SHIFAA-Architecture.md) |
| Data model and RLS matrix | [`docs/architecture/SHIFAA-Data-RLS.md`](./docs/architecture/SHIFAA-Data-RLS.md) |
| Complete MVP REST inventory | [`docs/architecture/SHIFAA-API-Catalog.md`](./docs/architecture/SHIFAA-API-Catalog.md) |
| Deterministic UI contract | [`docs/design/SHIFAA-UI-Contract.md`](./docs/design/SHIFAA-UI-Contract.md) |
| Requirement-to-contract mapping | [`docs/traceability/SHIFAA-Traceability-Matrix.md`](./docs/traceability/SHIFAA-Traceability-Matrix.md) |
| Audit finding dispositions | [`docs/governance/SHIFAA-Audit-Resolution-P1.md`](./docs/governance/SHIFAA-Audit-Resolution-P1.md) |

Conflict precedence is: law or regulator instruction → Constitution → PRD requirement → Master architecture decision → supporting contract → feature specification → implementation. A conflict must stop the affected feature until the higher-authority artifact is reconciled; it must never be silently interpreted.

Normative words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** use RFC 2119/8174 meanings.

## 2. Product boundary

### 2.1 MVP outcome

The MVP is complete only when a patient can:

1. establish a verified or review-pending identity and a lawful care relationship;
2. find and book a clinic appointment, enter a live queue, complete an encounter, and receive a clinically checked prescription;
3. have that prescription fulfilled from serialized pharmacy inventory with exact-pack traceability;
4. be admitted to and discharged from a hospital with concurrency-safe bed assignment;
5. complete a laboratory order and receive a governed result notification; and
6. use discovery and SOS functions without disclosing more health information than the emergency purpose requires.

The supporting MVP also includes Family Care, vaccinations, chronic observations, medication adherence/refills, reviews/complaints, five-role administration, and the isolated AI Triage track defined by `FR-AI-001..005`. AI Triage is mandatory graduation-MVP scope and is staffed by a ring-fenced one-to-two-person track; it must not displace delivery of the core patient, clinic, pharmacy, hospital, and laboratory journeys.

### 2.2 Non-goals

The following are not part of the MVP:

- autonomous diagnosis, prescription, dosage selection, or treatment recommendation;
- ambulance dispatch or representation that an ambulance has been dispatched;
- insurance/UHI eligibility adjudication, claim submission, or reimbursement;
- treating the Disability Identification and Integrated Services Card as money or insurance;
- a national EDA/UHI/MoHP integration unless the responsible authority supplies and approves a production interface;
- medication shortage prediction, pharmacy-to-pharmacy trading, or a logistics fleet;
- open-ended medical consultation chat;
- public fundraising, donation collection, donation-case nomination/approval/disbursement, and donor-impact reporting;
- a live gRPC interface; REST described by OpenAPI 3.1.1 is canonical for the MVP;
- production use of real patient data before every applicable production blocker in Section 10 is closed.

### 2.3 Change-control bar

A new MVP capability requires one of: (a) three or more documented target-user interviews showing the core task cannot be completed without it; (b) a binding legal/regulatory requirement; or (c) a written Product Owner scope directive. Every addition requires new immutable requirement IDs, traceability rows, API/data/UI impact, tests, and a dated decision record. Competitor behavior alone is evidence, not an automatic inclusion criterion.

## 3. Users and operating context

| Persona | Required outcome |
|---|---|
| Self-managed patient | Manage their own identity, appointments, record, prescriptions, results, and consents. |
| Guardian | Manage a dependent patient without impersonation and within a documented legal relationship. |
| Adult delegate | Perform only explicitly granted, revocable actions for another adult. |
| Emergency contact | Receive a minimal life-safety notice only after affirmative confirmation. |
| Clinic staff and doctor | Manage queues and encounters; prescribe with cross-provider medication safety controls. |
| Pharmacist | Receive inventory, verify exact packs, dispense, and record substitutions within licensed scope. |
| Hospital staff | Triage, admit, allocate beds, transfer, discharge, and maintain live capacity. |
| Laboratory staff | Accept orders, collect/process specimens, validate results, and escalate critical results. |
| Platform administrator | Perform one of five least-privilege governance functions with attributable actions and MFA. |
| Finance reviewer | Reconcile care-payment status without access to unrelated clinical records or payment secrets. |

The default locale is Egyptian Arabic (`ar-EG`, RTL), with complete English (`en-EG`, LTR) parity. Currency is EGP, time zone is `Africa/Cairo`, dates are stored in UTC and rendered locally, and addresses use governorate/city/district plus map coordinates.

## 4. Functional requirements

Requirement IDs are immutable. Removed requirements remain in history as `RETIRED`; IDs are never reused.

### 4.1 Identity, authentication, and privacy rights

| ID | Requirement |
|---|---|
| FR-AUTH-001 | The authentication subject is an internal UUID. National ID, passport, and UNHCR document numbers are verified identity attributes and MUST NOT be usernames, URLs, log fields, analytics properties, or bearer credentials. |
| FR-AUTH-002 | A person may authenticate by verified phone OTP or password and MAY enroll a passkey; workforce and administrator accounts MUST use MFA, with TOTP or passkey at assurance level 2. |
| FR-AUTH-003 | Egyptian National ID verification uses a vendor adapter; Valify is the initial candidate. Failure, timeout, or unavailable vendor produces `verification_pending` or `verification_failed`, never a fabricated success. |
| FR-AUTH-004 | Passport and UNHCR documents follow encrypted upload, reviewer assignment, approve/reject-with-reason, and expiry/reverification states. |
| FR-AUTH-005 | Recovery MUST verify an enrolled factor or complete identity re-proofing; recovery MUST NOT disable an existing MFA requirement. |
| FR-AUTH-006 | Identity-document values use randomized application-layer envelope encryption and a keyed HMAC blind index for exact-match deduplication. Plaintext MUST never be stored. |
| FR-AUTH-007 | A data subject can view the active Arabic-first privacy notice and consent records, withdraw optional consent, request access/export, correction, restriction, or erasure/pseudonymization review. |
| FR-AUTH-008 | Processing purpose, lawful basis, retention class, recipients, and cross-border destination are recorded in the processing inventory before the corresponding field is collected. |

### 4.2 Family Care and emergency contacts

| ID | Requirement |
|---|---|
| FR-FAM-001 | Care relationships are exactly `self`, `guardianship`, or `delegation`; Emergency Contact is a separate notification relationship. |
| FR-FAM-002 | Guardianship requires evidence, reviewer approval, validity dates, and an immutable audit trail. A dependent patient has no independent login merely because a profile exists. |
| FR-FAM-003 | At the configured age/capacity transition, access is not transferred automatically: the patient completes identity proofing and a reviewed transition preserves the same clinical record. |
| FR-FAM-004 | Delegation is purpose-scoped, permission-scoped, time-bounded or indefinite, and revocable by the delegator; revocation takes effect on the next authorization check and invalidates cached grants. |
| FR-FAM-005 | Emergency-contact consent has states `pending`, `confirmed`, `declined`, `revoked`, and `expired`. No invite or alert may be sent in `declined`, `revoked`, or `expired`; a new invitation requires a new contact record and fresh consent. |
| FR-FAM-006 | Emergency-contact alerts are restricted to an active SOS/life-safety incident and disclose only patient display name, `needs urgent help`, coarse or exact location as separately consented, incident time, and a callback number. Diagnosis, medication, lab, admission, and record links are prohibited. |
| FR-FAM-007 | Guardian/delegate views clearly name the patient context and require explicit context selection before any mutation. |
| FR-FAM-008 | Every relationship create, review, scope change, revocation, and use is attributable and auditable. |

### 4.3 Facilities, workforce, and governance

| ID | Requirement |
|---|---|
| FR-FAC-001 | Clinic, pharmacy, hospital, and laboratory onboarding captures license number, issuing authority, expiry, licensed activities, address, and documents; activation requires Facility Approval Admin verification. |
| FR-FAC-002 | Every facility uses Owner/Sub-user memberships with named permissions; every action is attributed to one authenticated person and facility context. |
| FR-FAC-003 | A person may hold different roles at different facilities; authorization is evaluated for the requested facility, resource, action, and patient relationship. |
| FR-FAC-004 | SHIFAA cannot activate the same pharmacist as director of more than one pharmaceutical institution recorded in SHIFAA; partial unique constraints enforce that internal invariant. Activation also requires manual/authority evidence addressing directorships outside SHIFAA. This models Law 127/1955 Article 19 without conflating Article 30 ownership limits or claiming the database can observe every external institution. |
| FR-FAC-005 | Doctor schedule, delay, and absence are facility-specific and date-specific. |
| FR-FAC-006 | Facility chat exists only for an appointment/order/prescription context, has participant and expiry rules, and cannot be opened as a general consultation channel. |
| FR-FAC-007 | A workforce role that legally requires professional licensure cannot become active until license number, issuer, profession/specialty, expiry, and evidence are reviewed. Expired, suspended, rejected, or unverified licenses cannot authorize licensed clinical or pharmacy actions. |
| FR-ADMIN-001 | Admin roles are `super_admin`, `support_admin`, `medical_reviewer`, `facility_approver`, and `finance_reviewer`; permissions are action-level, not a single hierarchy. |
| FR-ADMIN-002 | Admin access requires MFA, reason capture for sensitive record access, and immutable audit records. |
| FR-ADMIN-003 | Dashboard counts are aggregate and minimum-cell-size protected; a count MUST NOT reveal a single identifiable patient to a role lacking detail access. |
| FR-ADMIN-004 | Role assignment/removal, facility approval, and clinical-content publication use four-eyes review where specified and cannot be self-approved. Any future governed finance approval inherits the same rule. |

### 4.4 Clinic, queues, and clinical record

| ID | Requirement |
|---|---|
| FR-CLINIC-001 | Patients search active, licensed doctors by specialty, facility, availability, and distance and see fee, next slot, and verified facility identity. |
| FR-CLINIC-002 | Appointment creation is idempotent and concurrency-safe; one slot cannot be confirmed twice. |
| FR-CLINIC-003 | Appointment states are `requested`, `confirmed`, `checked_in`, `in_queue`, `in_consultation`, `completed`, `cancelled`, `no_show`, or `reschedule_required`, with the permitted transitions defined in the data contract. |
| FR-CLINIC-004 | A checked-in patient receives a facility/doctor-scoped queue number and estimated wait; queue reorder requires permission and a reason. |
| FR-CLINIC-005 | Delay sends a scoped notice; absence changes affected appointments to `reschedule_required` and offers replacement slots. |
| FR-CLINIC-006 | An encounter records participants, facility, timestamps, conditions, observations, orders, and clinical notes; private notes are not shared merely because medication safety data is shared. |
| FR-CLINIC-007 | Referral transmits only the patient-authorized summary and links the resulting appointment to the source encounter. |
| FR-CLINIC-008 | Fees are facility-defined. The MVP supports `cash_on_arrival`; digital payment is enabled only after FR-PAY-001 prerequisites are closed. |

### 4.5 Medication and clinical safety

| ID | Requirement |
|---|---|
| FR-SAFE-001 | Before a prescription can be signed, every proposed item is checked against confirmed allergies and medications in `dispensed`, `active`, or clinically relevant recent states. |
| FR-SAFE-002 | Clinical content is versioned by source, effective date, reviewer, and publication state. Draft or unsigned rules cannot affect production decisions. |
| FR-SAFE-003 | Alerts are `informational`, `warning`, or `contraindicated`. Unknown/unstandardized input produces `not_fully_checked`; it never produces “safe.” |
| FR-SAFE-004 | A warning may be overridden by the prescriber only with a structured reason, free-text clinical justification, monitoring plan when applicable, and audit event. |
| FR-SAFE-005 | A contraindicated order cannot enter `signed` through the normal path. The prescriber must replace it or invoke the governed break-glass path in FR-SAFE-006. |
| FR-SAFE-006 | Break-glass requires a prescriber request plus independent licensed clinical-pharmacist approval before outpatient dispense or inpatient administration, with patient-specific rationale, alternatives considered, monitoring plan, expiry, and immutable signatures. Self-approval is prohibited; the only exception to prior pharmacist approval is the time-limited emergency activation defined in FR-SAFE-007. |
| FR-SAFE-007 | If delay itself threatens life, an emergency order may be activated by an attending physician plus a second licensed physician; it is immediately queued for pharmacist review and cannot be dispensed/administered after the emergency window without pharmacist approval. The exact window is a facility clinical-governance configuration requiring sign-off. |
| FR-SAFE-008 | Allergy records distinguish `self_reported`, `clinician_confirmed`, `refuted`, and `entered_in_error`, including substance, reaction, severity, onset, recorder, and verifier. |
| FR-SAFE-009 | Generic substitution requires the same active ingredient, strength, dosage form, and route, plus prescriber allowance. NTI or excluded products require prescriber approval; therapeutic substitution always requires prescriber approval. |
| FR-SAFE-010 | Controlled medicines use a versioned Egyptian schedule, no automatic refill, enhanced identity/license verification, and a separate dispensing register. The system preserves any required paper/original process until EDA/MoHP confirms an electronic substitute. |
| FR-SAFE-011 | Prescription and override events expose FHIR R4-aligned `MedicationRequest`, `DetectedIssue`, and provenance semantics without claiming national FHIR certification. |
| FR-SAFE-012 | Clinical-safety code, content, and test vectors cannot ship until jointly signed by a senior physician/medical director and clinical pharmacist. |

### 4.6 Pharmacy and EPTTS

| ID | Requirement |
|---|---|
| FR-PHARM-001 | Receiving scans each saleable pack’s GS1 DataMatrix and parses AI `(01)` GTIN, `(21)` serial, `(17)` expiry, and `(10)` batch. Duplicate serial receipt is rejected. |
| FR-PHARM-002 | Aggregated shipment receipt records aggregation/disaggregation; representative-unit scan plus manually entered carton quantity is not represented as serialized compliance. |
| FR-PHARM-003 | A damaged code uses an exception flow requiring pharmacist reason and evidence; the pack remains `serialization_unverified` and cannot be reported as EPTTS-verified. |
| FR-PHARM-004 | Fulfilment re-scans or selects the exact serialized pack, validates prescription/patient/product/expiry/recall/status, records dispensed units, and atomically updates inventory. Receiving and dispense are distinct events. |
| FR-PHARM-005 | Partial dispensing preserves the parent pack serial and records `units_per_pack`, units dispensed, units remaining, opener, and timestamps; packs are never deleted after movement. |
| FR-PHARM-006 | Patient discovery shows `in_stock`, `limited`, `out_of_stock`, or `unknown`, never exact stock. `unknown` is required when inventory freshness exceeds the configured threshold. |
| FR-PHARM-007 | Product master and safety mappings use versioned EDA-approved/public data imports with provenance and reviewer approval; absence of a public API is not filled by scraping presented as integration. |
| FR-PHARM-008 | EPTTS Phase-1 exchange is implemented as an adapter for the published file/manual process. No live EDA API is claimed until EDA publishes and authorizes one. |
| FR-PHARM-009 | Dispense, return, correction, recall quarantine, stock adjustment, expiry, and destruction are append-only inventory movements with reason and actor. |
| FR-PHARM-010 | Prescription fulfilment can be reserved, partially dispensed, completed, rejected-with-reason, or cancelled; refill requests never auto-authorize a new prescription. |

### 4.7 Hospital, beds, laboratory, and emergency

| ID | Requirement |
|---|---|
| FR-HOSP-001 | Hospital staff create an arrival and triage assessment before or with admission; AI severity, if used, is advisory until a licensed user confirms it. |
| FR-HOSP-002 | Beds have states `available`, `held`, `occupied`, `cleaning`, `maintenance`, and `out_of_service`; transitions are recorded and facility-scoped. |
| FR-HOSP-003 | A bed hold has an expiry. Assignment uses a version check in one transaction; a stale version returns `409 bed-version-conflict`. |
| FR-HOSP-004 | Admission states are `planned`, `arrived`, `admitted`, `transferred`, `discharge_pending`, `discharged`, or `cancelled`, with no direct skip from `planned` to `discharged`. |
| FR-HOSP-005 | Transfer releases and allocates beds atomically or leaves the original assignment unchanged. |
| FR-HOSP-006 | Discharge requires an authorized clinician, summary, diagnoses, medication reconciliation, instructions, and follow-up; amendment creates a new signed version. |
| FR-HOSP-007 | Discovery exposes only capacity status and freshness, never patient or ward-detail data. |
| FR-LAB-001 | A clinician creates a lab order with coded tests, priority, specimen requirements, and clinical context limited to need-to-know. |
| FR-LAB-002 | Lab states are `ordered`, `accepted`, `collected`, `in_process`, `resulted`, `verified`, `released`, `cancelled`, or `corrected`; patient visibility begins at `released`. |
| FR-LAB-003 | Result verification requires an authorized laboratory professional. A correction never overwrites the original result. |
| FR-LAB-004 | Critical-result rules are facility/test/version specific. A critical result starts a closed-loop notification to ordering clinician and patient with acknowledgement/escalation tracking; it never alerts an Emergency Contact. |
| FR-DISC-001 | Discovery returns active verified facilities with type, services, coordinates, rating summary, and freshness-qualified operational signal. |
| FR-SOS-001 | SOS requires explicit activation, captures current coordinates, and finds nearby verified hospitals with fresh emergency-capacity signals; if none qualify it returns nearby hospitals and instructs the user to call the Egyptian Ambulance Organization hotline `123`, without claiming a reservation or ambulance dispatch. |
| FR-SOS-002 | A hospital match is informational until the hospital explicitly accepts a pre-arrival; bed availability is not a guaranteed reservation. |
| FR-SOS-003 | The ER share link is single-purpose, random, revocable, expires within 30 minutes, is shown once, and exposes only blood group, confirmed allergies, active/dispensed medicines, chronic conditions, and emergency notes. Every access is audited. |
| FR-SOS-004 | Emergency-contact notification follows FR-FAM-006 and is sent only for an active life-safety incident. Lab results, drug interactions, routine admission, and stable referrals cannot trigger it. |

### 4.8 Longitudinal support features

| ID | Requirement |
|---|---|
| FR-VAX-001 | A dependent patient may receive a versioned Egyptian vaccination schedule only after medical-content approval; mandatory and optional vaccines remain distinct. |
| FR-VAX-002 | Vaccinations distinguish self-reported and clinician-confirmed doses; catch-up guidance is generated only from approved, versioned rules and otherwise says `clinical_review_required`. |
| FR-CHRONIC-001 | Patients record blood pressure, blood glucose, weight, and configured observations with device/source and timestamp; self-entered values are visibly labeled. |
| FR-CHRONIC-002 | MVP charts trends only and MUST NOT diagnose or generate unapproved clinical alarms. |
| FR-MED-001 | A signed prescription can generate dose reminders; responses are `taken`, `snoozed`, `missed`, or `skipped_with_reason`. |
| FR-MED-002 | Adherence is informational, shows its calculation window, and does not silently alter a prescription. |
| FR-MED-003 | Chronic refill prediction uses dispensed quantity and schedule; a refill request routes to a prescriber/pharmacy workflow and is never automatic authorization. |
| FR-ACCESS-001 | The Disability Identification and Integrated Services Card is stored as an optional entitlement credential, verified through the available official/manual process, and displayed to authorized staff. |
| FR-ACCESS-002 | The card is not a payment method. Applicable benefits are determined by facility type and current official rules; the platform must not promise free private care. |
| FR-TRUST-001 | Reviews require a completed verified encounter/order, may display named or anonymous, and remain internally attributable. |
| FR-TRUST-002 | Complaints are private, status-tracked, routed to the facility then Support Admin by severity/SLA, and preserve every response. |

### 4.9 Notifications, payments, finance, and AI

| ID | Requirement |
|---|---|
| FR-NOTIF-001 | Notification templates are versioned in Arabic and English, declare allowed recipients and data fields, and prohibit PHI in SMS/push bodies beyond the approved template. |
| FR-NOTIF-002 | Delivery uses an outbox with idempotency, bounded retries, dead-letter state, provider receipt storage, and no duplicate user-visible message for the same event/channel/recipient. |
| FR-PAY-001 | Digital care payments, when enabled, use a CBE-licensed PSP’s hosted/tokenized flow. Amount and currency are derived from the authoritative versioned server record and client mismatches are rejected. SHIFAA never stores PAN, CVV, or mobile-wallet secrets and never holds customer funds. |
| FR-FIN-001 | **DEFERRED_POST_MVP.** A future licensed-partner donation case flow may use `draft`, `nominated`, `under_review`, `approved`, `rejected`, `funded`, `disbursed`, `closed`, or `cancelled`; nominator and approver must differ. |
| FR-FIN-002 | **DEFERRED_POST_MVP.** Donation collection, custody, receipts, AML/KYC, and disbursement must be performed by an executed licensed partner/PSP operating model; SHIFAA must not collect or hold donation funds. |
| FR-FIN-003 | **DEFERRED_POST_MVP.** If the capability re-enters scope, donors may see aggregate, de-identified impact only; no patient can waive this restriction. |
| FR-AI-001 | Red-flag rules run before any generative model and route to SOS/call guidance without waiting for model output. |
| FR-AI-002 | Symptom checking returns specialty/routing suggestions, uncertainty, source version, and a no-diagnosis notice. |
| FR-AI-003 | Hospital severity is a recommendation; a licensed staff member must confirm or change it with attribution before it affects workflow. |
| FR-AI-004 | AI receives the minimum data needed, does not train on production PHI, and does not send PHI to an unapproved external model. |
| FR-AI-005 | Model/content release requires a locked evaluation set, thresholds for red-flag recall and harmful-output rate, clinical sign-off, monitoring, and rollback. |

`FR-AI-001..005` are mandatory graduation-MVP requirements. The track is safe to execute without additional legal review only inside an access-controlled, non-public graduation environment using seeded synthetic personas. Its payload accepts allow-listed structured symptom/vital fields and age bands, rejects direct identifiers and open clinical free text, uses no production PHI, does not train on inputs, runs deterministic red flags before model inference, returns advisory routing with explicit no-diagnosis copy, requires human confirmation before any hospital state change, and has a kill switch. `OPEN-AI-001` still owns model selection and measurable Arabic/safety acceptance; it no longer owns the scope decision. Production use with real PHI remains a later production-authorization question under the applicable legal, privacy, vendor, and clinical gates.

`FR-FIN-001..003` are retained as immutable reserved IDs for a possible post-graduation licensed-partner capability. They are excluded from graduation-MVP coverage, specifications, tasks, implementation, UI routes, migrations, and release acceptance. Generic four-eyes controls in `FR-ADMIN-004` remain mandatory for role grants, facility approval, and clinical-content publication.

## 5. Non-functional requirements

| ID | Requirement / measurable acceptance target |
|---|---|
| NFR-SEC-001 | Default deny: API authorization and PostgreSQL RLS independently enforce patient, relationship, facility, and admin scope; service/owner roles are not used for user requests. |
| NFR-SEC-002 | TLS 1.2+ in transit; encrypted volumes/backups at rest; field-level envelope encryption for identity documents and other designated secrets; keys remain outside the database and rotate under a runbook. |
| NFR-SEC-003 | Access tokens last at most 15 minutes. Web refresh tokens use `HttpOnly`, `Secure`, `SameSite=Strict` cookies with Origin/CSRF checks; mobile refresh tokens use OS secure storage. Refresh rotation and reuse detection are mandatory. |
| NFR-SEC-004 | Workforce/admin sensitive operations require AAL2; passkeys are preferred, TOTP is supported, SMS is recovery/notification rather than the sole privileged factor. |
| NFR-SEC-005 | All mutation endpoints require `Idempotency-Key` except explicitly non-repeatable token actions; identical key+idempotency-principal+route+body returns the stored result, while a different body returns `409 idempotency-key-reused`. The principal is the authenticated actor or, before authentication, a server-derived HMAC scope for the normalized handle/challenge/provider—never a nullable shared “anonymous” actor. |
| NFR-SEC-006 | Audit events are append-only, hash-chained per partition, exported to write-once retention storage, and contain actor, purpose, patient/facility context, action, outcome, request ID, and timestamp without secret payloads. |
| NFR-SEC-007 | OWASP ASVS Level 2 is the general baseline; authentication, health-data, admin, and payment-adjacent paths additionally satisfy applicable Level 3 controls. OWASP API Security Top 10 tests are release-gating. |
| NFR-PRIV-001 | Arabic is the primary language for privacy notice and consent. Consent is specific, granular, affirmative, separately recorded, and as easy to withdraw as to give. |
| NFR-PRIV-002 | Health/children data processing, PDPC licensing/permit, DPO registration/category, processors, and cross-border transfers must have documented legal evidence before production PHI. |
| NFR-PRIV-003 | Breach workflow supports PDPC notification within 72 hours of awareness and data-subject notification within three working days from regulator notification, with evidence timestamps. |
| NFR-PRIV-004 | Every data class has an approved retention rule. Where Egyptian medical-record retention is not authoritatively confirmed, production deletion automation remains blocked rather than guessing. |
| NFR-I18N-001 | Every user-visible string exists in `ar-EG` and `en-EG`; missing translations fail CI. Layout mirrors correctly in RTL, except numbers, codes, charts, phone numbers, and mixed-direction clinical identifiers. |
| NFR-A11Y-001 | All MVP web and mobile surfaces meet WCAG 2.2 AA, including keyboard navigation, screen-reader labels, focus visibility, 44×44 CSS-pixel/dp targets, text resize, contrast, and reduced motion. Color/icon alone is not sufficient; every state also has text or an accessible name. |
| NFR-PERF-001 | On the reference Android device and a 1.6 Mbps/300 ms profile, patient home LCP/p95 is ≤3.0 s after cold start; input response p95 is ≤200 ms after interactive. |
| NFR-PERF-002 | Read API p95 is ≤400 ms and mutation p95 ≤800 ms inside the deployment region excluding external vendors; SOS match p95 ≤2 s. |
| NFR-AVAIL-001 | Production target is 99.9% monthly API availability; RPO ≤15 minutes and RTO ≤60 minutes, verified by quarterly restore tests. |
| NFR-AVAIL-002 | Queue and bed updates reconnect with exponential backoff and reconcile from the server; the UI always shows last-updated time and stale state. |
| NFR-DATA-001 | PostgreSQL is the system of record. All status transitions use constraints/functions and transactions; corrections append versions rather than erase clinical or financial history. |
| NFR-DATA-002 | All timestamps are `TIMESTAMPTZ` UTC; API dates use RFC 3339; money is integer minor units plus ISO currency; quantities use explicit units. |
| NFR-API-001 | `/v1` REST is described by OpenAPI 3.1.1; errors use RFC 9457 `application/problem+json`; request/response schemas are generated from one contract package. No undocumented production endpoint is allowed. |
| NFR-API-002 | Cursor pagination is used for mutable collections. Every response includes `X-Request-Id`; mutations support optimistic versioning with `If-Match` where catalogued. |
| NFR-OBS-001 | Traces, metrics, and structured logs share request/trace IDs. Logs and analytics prohibit raw National ID, document images, free-text notes, access tokens, and full clinical payloads. |
| NFR-QUALITY-001 | CI requires formatting, lint, type check, unit tests, contract tests, migration tests, RLS tests, accessibility tests, secret scanning, dependency/SAST scans, and end-to-end tests for the trace matrix’s P0 journeys. |
| NFR-PORT-001 | Domain logic has no framework/vendor imports. Supabase, Valify, SMS, PSP, EPTTS, maps, and AI are ports with contract-tested adapters. |

## 6. Deterministic acceptance journeys

The executable test vectors live in the traceability matrix and feature specs. These cross-feature outcomes are release gates:

1. **Contraindicated prescription:** given a patient on a conflicting dispensed medication, a normal sign operation returns `409 contraindicated-medication`, creates no signed prescription, and offers replacement or the governed two-person break-glass workflow.
2. **Emergency-contact privacy:** given a confirmed contact, a critical lab result, drug interaction, or routine admission sends zero emergency-contact messages; an active qualifying SOS sends one template containing only FR-FAM-006 fields.
3. **Declined contact:** any resend, notification, or state transition from `declined` is rejected by both service logic and database constraint.
4. **Serialized dispense:** the exact pack selected at dispense must exist at that pharmacy, be unexpired/non-quarantined, match the item, and have sufficient remaining units; the inventory movement and medication status update commit atomically.
5. **Bed race:** two requests with the same bed version result in one success and one `409 bed-version-conflict`; there is never more than one active occupant.
6. **Disability credential:** presenting the card may attach an entitlement credential but never changes the payment method to “Disability Card” or promises a benefit that the facility has not verified.
7. **Authorization:** a doctor at Facility A cannot view Facility B data unless they also have an active membership and a patient-care basis there; changing JWT metadata cannot grant access.
8. **Arabic/RTL:** each P0 journey passes visual regression at 360×800 and 1440×900 in Arabic and English, plus keyboard/screen-reader checks on web.

## 7. Success measures

### 7.1 Pre-launch gates

- 100% of the 92 active FR IDs (`FR-FIN-001..003` excluded) and all 24 NFR IDs in the Product Owner-approved graduation-MVP scope have an owner, specification, API/data/UI mapping or an explicit `N/A`, and automated acceptance evidence.
- Zero unresolved P0/P1 security, privacy, safety, or data-integrity defects.
- Zero false negatives on the jointly approved contraindicated-interaction test set; warning precision/recall is reported, not hidden.
- 100% pass on RLS cross-tenant negative tests and idempotency replay tests.
- Restore drill meets RPO/RTO; breach tabletop meets notification evidence deadlines.
- Clinical, legal/DPO, security, and Product Owner release gates are signed for their governed scope.

### 7.2 Post-launch metrics

Booking completion, queue estimate error, prescription-to-dispense conversion, SOS match latency/failure, critical-result acknowledgement time, medication reminder engagement, complaint SLA, accessibility task completion, and notification delivery are measured using pseudonymous identifiers and the approved analytics inventory. Analytics are optional processing where consent/lawful basis requires it.

## 8. Delivery sequence and dependencies

| Phase | Exit outcome | Depends on |
|---|---|---|
| 0 — Governance and contracts | Constitution, compliance baseline, design baseline, OpenAPI/data skeleton, test harness, owners | None |
| 1 — Foundation | Auth, identity, consent/privacy rights, Family Care, facilities, RBAC/RLS, audit, outbox/notifications | Phase 0 |
| 2 — Emergency and discovery foundation | Facility geodata, capacity freshness, SOS, ER share, emergency-contact privacy | Phase 1 |
| 3 — Clinic and safety | Scheduling, queue, encounters, prescriptions, interaction/allergy controls, referrals | Phases 1–2 |
| 4 — Pharmacy | Receiving, EPTTS adapter, inventory, exact-pack dispense, substitution/refill | Phase 3 |
| 5 — Hospital and laboratory | Arrivals, triage, beds, admission/transfer/discharge, lab lifecycle/critical results | Phases 1–2; prescriptions where medication reconciliation is used |
| 6 — Longitudinal/support | Vaccination, chronic observations, adherence, reviews/complaints, disability credential | Relevant prior domain |
| 7 — AI Triage parallel track | Mandatory `FR-AI-001..005`, staffed by one-to-two people; deterministic red flags, symptom routing, advisory hospital severity, Arabic evaluation, monitoring, rollback | Foundation contracts plus OPEN-AI-001 safety/evaluation evidence |
| 8 — Integrated release | Full journey, security/accessibility/performance/DR/UAT evidence | All in-scope gates |

SOS and its Core API foundations intentionally precede hospital workflow that consumes them. No phase may implement against an undefined earlier-phase contract.

## 9. Risks and controls

| Risk | Control |
|---|---|
| Unlicensed handling of Egyptian health data | Synthetic data only until PDPC/DPO/hosting/processor evidence is complete. |
| Clinical alert harm or fatigue | Three tiers, content versioning, dual clinical sign-off, measured test set, controlled break-glass. |
| EPTTS/e-prescription assumptions outrun published interfaces | Adapter boundary; file/manual workflow; authority confirmation open; never claim a live API. |
| Student-team scope exceeds capacity | Dependency-ordered vertical slices and P0 journey exit gates; AI is ring-fenced to one-to-two people and donations are post-MVP, so neither may displace the core journey. |
| Third-party outage or lock-in | Ports/adapters, explicit degraded states, transactional outbox, no fabricated success. |
| Documentation drift | Immutable IDs, machine-checked links/IDs, SpecKit gates, one synchronized open-item register. |
| Pixel divergence | Shared design tokens/components and visual regression; screen compositions remain blocked until OPEN-UX-001 is approved. |

## 10. Decision register and open items

The closed decisions and remaining-open table are mirrored verbatim in Master Section 14. Closed IDs remain immutable audit history and are not reused. For remaining items, status is not evidence; the closure artifact is required.

### 10.1 Closed scope decisions

| Former open ID | Closed | Binding decision | Why this is the final MVP call | Post-graduation re-entry condition |
|---|---|---|---|---|
| OPEN-PRODUCT-002 | 2026-08-09 by Product Owner directive | **AI Triage stays in mandatory graduation-MVP scope** as the isolated one-to-two-person ADR-014 track. `FR-AI-001..005` count toward MVP completion. | It is a high-value differentiator that can be built independently without weakening the core path. The graduation build is non-public and access-controlled, uses seeded synthetic personas, accepts allow-listed structured inputs that reject identifiers/free text, runs deterministic red flags first, is advisory/no-diagnosis, cannot mutate clinical state without a licensed-human confirmation, does not train on inputs, and has a kill switch; therefore no additional production legal opinion is required for the graduation demonstration. | Real-PHI or public-production enablement requires the applicable legal/privacy basis, processor terms, clinical approval, production evaluation, monitoring, and rollback evidence; this does not reopen the MVP scope decision. |
| OPEN-LEGAL-004 | 2026-08-09 by Product Owner directive | **Donations/Four-Eyes donation workflow moves to post-MVP and is not implemented for graduation.** `FR-FIN-001..003` are reserved, excluded IDs. Generic four-eyes governance under `FR-ADMIN-004` remains in MVP. | Donation collection creates a separate fundraising, custody, AML/KYC, receipt, reconciliation, and disbursement product that does not advance the four core care touchpoints. The 2026-07-03 verbal legal review is recorded as historical input but is unnecessary for—and does not authorize—an out-of-scope production flow. | Re-entry requires an executed operating agreement with a licensed Egyptian fundraising/care-finance partner and CBE-licensed PSP. The partner must own collection, KYC/AML, custody, receipts, and disbursement; SHIFAA may provide workflow/integration only, must not hold funds, and must approve a new dated scope ADR before implementation. |

### 10.2 Remaining open items

| ID | Decision/evidence required | Owner | Next step / closure evidence | Blocks | Earliest blocked lifecycle stage |
|---|---|---|---|---|---|
| OPEN-LEGAL-001 | PDPC controller/processor/sensitive-data licenses or permits; DPO appointment/category; cross-border basis and approved destinations/processors | Legal counsel + registered DPO | Submit processing inventory and architecture to PDPC/counsel; archive written approvals and processor terms | Any production PHI | RELEASE_APPROVED |
| OPEN-LEGAL-002 | Egyptian retention periods for each medical, prescription, lab, identity, consent, audit, and finance class | Legal counsel + DPO + Medical Director | Produce signed retention schedule citing controlling instruments | Production retention/deletion automation | RELEASE_APPROVED |
| OPEN-LEGAL-003 | Controlled-drug/e-prescription workflow and whether any digital record substitutes for original statutory books/forms | EDA/MoHP liaison + Legal + Chief Pharmacist | Obtain written authority interpretation and current schedules/process rules | Controlled-drug production flow | RELEASE_APPROVED for controlled paths |
| OPEN-LEGAL-005 | Official disability-card verification interface and exact public/private facility benefits | MOSS liaison + Legal | Obtain interface/verification instructions and benefit applicability in writing | Automated entitlement decision | RELEASE_APPROVED for automated entitlement |
| OPEN-LEGAL-006 | Guardianship age/capacity transition trigger, evidence, approver, and treatment of adults lacking capacity | Legal counsel + DPO + Product Owner | Obtain written Egyptian-law analysis; approve a state/event matrix and test vectors | Automatic guardianship/dependent transition | SPEC_APPROVED for FR-FAM-003 |
| OPEN-LEGAL-007 | Official/certified Arabic Gazette copies and counsel-verified article mapping for Law 151/2020 and Executive Regulations Decision 816/2025 | Legal counsel + registered DPO | Archive controlling Arabic texts; map each compliance proposition to exact article; sign legal-validation memo | Treating article-level PDPL interpretations as production evidence | RELEASE_APPROVED for production PHI |
| OPEN-PRIV-001 | Minimum-cell-size threshold and dimensions for admin aggregate disclosure | Registered DPO + Security Lead + Data Lead | Perform documented re-identification-risk assessment; approve threshold/config/test set | FR-ADMIN-003 dashboard aggregates | SPEC_APPROVED for FR-ADMIN-003 |
| OPEN-VENDOR-001 | Valify commercial terms, DPA, SLA, Egypt processing location, production credentials, and fallback | Procurement + Security + DPO | Complete vendor assessment and signed contract | Automated National ID verification | RELEASE_APPROVED for automated proofing |
| OPEN-VENDOR-002 | SMS/OTP provider selection, sender registration, Arabic delivery, DPA, SLA, receipts, and failover | Procurement + Platform Lead + DPO | Score candidates and sign primary/secondary contracts | Production SMS/OTP | RELEASE_APPROVED for SMS/OTP |
| OPEN-VENDOR-003 | CBE-licensed PSP and hosted/tokenized integration terms | Finance Owner + Security + Legal | Verify CBE status and sign PSP agreement | Digital payments | RELEASE_APPROVED for digital payments |
| OPEN-CLIN-001 | Joint approval of interaction/allergy rules and break-glass policy | Medical Director + Chief Pharmacist | Sign versioned clinical-content bundle and deterministic test set | Prescription safety release | RELEASE_APPROVED for prescribing |
| OPEN-CLIN-002 | Current controlled/NTI product lists and facility emergency exception window | Medical Director + Chief Pharmacist + Legal | Publish signed, effective-dated lists/policy | Controlled/NTI paths | RELEASE_APPROVED for controlled/NTI paths |
| OPEN-CLIN-003 | Lab critical thresholds, vaccination schedule/catch-up rules, and escalation SLAs | Medical Director + Lab Director + Pediatric Reviewer | Publish signed per-domain content versions | Related modules | RELEASE_APPROVED for affected modules |
| OPEN-PHARM-001 | Inventory-freshness threshold by product/facility and exact stale-to-unknown transition | Chief Pharmacist + Product Owner + SRE Lead | Analyze update cadence and harm cases; approve configuration, display rules, and boundary test vectors | Patient pharmacy-stock projection | SPEC_APPROVED for FR-PHARM-006 |
| OPEN-AI-001 | Graduation-MVP model/provider, access-controlled seeded-synthetic environment, structured allow-listed input schema, Arabic evaluation set, red-flag/harm thresholds, monitoring, and rollback | AI Lead + Medical Director + Security Lead | Check in the model card and locked evaluation set; pass no-public-access, direct-identifier/free-text rejection, red-flag-first, harmful-output, human-confirmation, timeout, and kill-switch tests; record technical/clinical acceptance | Graduation AI acceptance, not AI scope | VERIFYING for Phase 7 |
| OPEN-UX-001 | Approved Figma/source-of-truth screen compositions and visual-regression baselines for every P0 state | Product Owner + Design Lead | Approve linked designs at required viewports; export immutable baseline IDs | Claim of pixel-identical builds | PLAN_APPROVED for affected UI |
| OPEN-UX-002 | Visual-regression tolerance, renderer/browser/font matrix, and diff-review rule | Product Owner + Design Lead + QA Lead | Approve deterministic render environment, numeric thresholds, masks, and review evidence | Automated visual acceptance | VERIFYING for affected UI |
| OPEN-PRODUCT-001 | Persona and workflow validation with 5–8 target users | Product Owner + UX Research Owner | Complete interviews; archive script, anonymized evidence, and accepted changes | UAT baseline, not Foundation engineering | RELEASE_APPROVED/UAT |
| OPEN-SEC-001 | Refresh-token idle lifetime, absolute lifetime, family revocation/reuse response, and reauthentication interval | Security Lead + Architecture Lead | Threat-model patient/workforce/admin sessions; approve exact values and deterministic expiry/reuse tests | Production session policy | SPEC_APPROVED for auth/session implementation |
| OPEN-TEAM-001 | Named owners, reviewers, supervisor/TA, and on-call/security contacts | Product Owner | Fill RACI and obtain acknowledgement | Attributable approvals and release governance | SPEC_APPROVED |
| OPEN-TECH-001 | Exact dependency versions, runtime/toolchain files, OCI base-image digests, lockfiles, and SBOM baseline | Architecture Lead + Platform Lead | Create the Phase-0 repository scaffold; pin and sign/checksum all versions/digests; archive a clean reproducible-build log | Claim of byte/reproducible builds | IMPLEMENTING |
| OPEN-TECH-002 | Generated full OpenAPI payload schemas, physical PostgreSQL DDL/RLS migrations, and generated API clients for the active graduation operation inventory | API Lead + Data Lead + QA Lead | Complete feature specs in dependency order, merge generated contracts/migrations/clients, and pass active-catalog/OpenAPI/DDL/trace consistency CI; reserved post-MVP operations must be absent | Code-generation-identical implementation beyond each approved feature contract | IMPLEMENTING for the affected feature |
| OPEN-TECH-003 | Reference Android device/OS/build, web browser versions, network profile harness, dataset size, and performance/accessibility test environment | QA Lead + Platform Lead + Product Owner | Approve reproducible test profiles; check in configs; archive baseline run | Deterministic NFR-PERF-001/002 and device accessibility evidence | VERIFYING |

## 11. Change log

| Date | Version | Change |
|---|---|---|
| 2026-08-09 | 2.1.0 | Closed the two scope decisions: AI Triage is mandatory graduation-MVP scope in an isolated one-to-two-person synthetic-data track; Donations/Four-Eyes donation flow is deferred to a licensed-partner-only post-graduation re-entry. Formally approved by Product Owner Yousef Osama on 9-Aug-2026. |
| 2026-08-09 | 2.0.0 | Rebuilt the PRD around immutable traceable requirements; corrected Egyptian compliance claims; reconciled clinical override and emergency privacy; assigned IDs to every proposed/conditional feature; synchronized sequencing, worklists, and open items. |
