# SHIFAA Graduation-MVP REST API Catalog

> **Version:** 1.1.0 · **Status:** Complete active-MVP inventory plus an explicitly non-MVP reserved appendix · **Last verified:** 2026-08-09  
> REST/OpenAPI 3.1.1 is canonical. **gRPC operations: none in MVP.**

## 1. Global contract

Base URL is `/v1`. JSON is UTF-8. Success returns the resource or `{data, meta}` for collections. Errors use RFC 9457 `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, `code`, `request_id`, `errors[]`, and optional `retry_after_seconds`.

Request-header applicability:

- `Authorization: Bearer <access-token>` is required except on routes explicitly marked `PUB`, token, or signed provider;
- `Accept-Language: ar-EG|en-EG` is optional; absence selects `ar-EG` and the selected locale is returned in `Content-Language`;
- `X-Request-Id: <uuid>` is optional from the client and is always returned or generated;
- `Idempotency-Key: <uuid-or-opaque 16..128 chars>` on every mutation marked `I`;
- `If-Match: "<version>"` on operations marked `V`.

Every authenticated response and every response containing PHI, a one-time token result, identity/proofing state, or security-sensitive data uses `Cache-Control: private, no-store`; this includes `viewEmergencyShare` even though the caller is unauthenticated. Only explicitly public non-PHI projections may define separate cache validators. Collections use `limit` (default 25, max 100) and opaque `cursor`; sorting is endpoint-defined. Dates/times are RFC 3339 UTC. Mutations return `201` create, `200` state/action result, or `202` accepted async. One-time token replays return the already-recorded terminal outcome without repeating effects.

The idempotency principal is never null: authenticated requests use the internal actor ID; pre-auth registration/login/recovery use a server-secret HMAC of the normalized handle or challenge ID plus route-domain separator; one-time token actions use the token hash and their catalogued terminal-replay rule; provider callbacks use the verified provider account/event ID. Raw handles, tokens, credentials, and provider secrets are not stored in the idempotency scope.

Actor codes: `PAT` self-managed patient, `GUA` guardian, `DEL` authorized delegate, `CLN` clinic workforce, `PHA` pharmacy workforce, `HSP` hospital workforce, `LAB` laboratory workforce, `DPO` the currently designated data-protection officer, `PUB` unauthenticated token holder, and `SYS` internal service. Admin mappings are exact: `ADM-SUPER=super_admin`, `ADM-SUPPORT=support_admin`, `ADM-MEDICAL=medical_reviewer`, `ADM-FACILITY=facility_approver`, and `ADM-FINANCE=finance_reviewer`. `DPO` is a restricted governance designation, not a sixth platform-admin role. `managed-patient-id` is authorized through relationship scope, never a free cross-patient selector.

For compact tables, functional references in the `FR` column omit only the literal leading `FR-`: for example, `AUTH-001/002` means `FR-AUTH-001` and `FR-AUTH-002`. Any `NFR-*` reference is written in full. This is a display convention; generated OpenAPI uses full IDs in `x-shifaa-requirements`.

Common problem codes include `authentication-required`, `mfa-required`, `forbidden`, `purpose-required`, `not-found`, `validation-failed`, `state-transition-invalid`, `version-conflict`, `idempotency-key-reused`, `idempotency-in-progress`, `rate-limited`, `vendor-unavailable`, `legal-gate-disabled`, `clinical-gate-disabled`, and domain codes below.

## 2. Session, proofing, privacy, and Family Care

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `registerPerson` | `POST /auth/register` | PUB | locale, phone/email, password/passkey intent → person/session or verification challenge | I | AUTH-001/002 |
| `login` | `POST /auth/login` | PUB | handle + credential → session/AAL/challenge | I | AUTH-002 |
| `verifyOtp` | `POST /auth/otp/verify` | PUB | challenge ID/code → session or verified factor | I | AUTH-002 |
| `refreshSession` | `POST /auth/session/refresh` | PUB cookie/mobile token | rotated refresh → access token/session | I | AUTH-005; NFR-SEC-003 |
| `logout` | `POST /auth/logout` | any | session/all-sessions flag → revoked timestamp | I | AUTH-005 |
| `beginMfaEnrollment` | `POST /auth/mfa/enroll` | any | factor type → secret/challenge without logging secret | I | AUTH-002 |
| `verifyMfaEnrollment` | `POST /auth/mfa/enroll/verify` | any | enrollment ID/code → factor summary | I | AUTH-002 |
| `removeMfaFactor` | `DELETE /auth/mfa/factors/{factorId}` | any AAL2 | recovery verification → removed | I | AUTH-002/005 |
| `startRecovery` | `POST /auth/recovery` | PUB | recovery handle → opaque challenge status | I | AUTH-005 |
| `completeRecovery` | `POST /auth/recovery/{caseId}/complete` | PUB | proofing/MFA evidence + new credential → sessions revoked/new session | I | AUTH-005 |
| `getMyProfile` | `GET /people/me` | any | — → minimum profile/verification/AAL | — | AUTH-001 |
| `updateMyProfile` | `PATCH /people/me` | any | locale/contact/display fields → versioned profile | I,V | AUTH-001 |
| `createIdentityProof` | `POST /people/me/identities` | PAT | identity type/value/issuer/expiry → masked identity + case | I | AUTH-003/004/006 |
| `listMyIdentities` | `GET /people/me/identities` | PAT | — → masked identities and current verification cases | — | AUTH-003/004 |
| `createIdentityUpload` | `POST /identity-verifications/{caseId}/upload-intent` | PAT/ADM-FACILITY | file metadata → one-time upload URL/object ID | I | AUTH-004 |
| `getVerificationCase` | `GET /identity-verifications/{caseId}` | subject/ADM-FACILITY | — → status/reason/next action | — | AUTH-003/004 |
| `listIdentityVerificationCases` | `GET /admin/identity-verifications` | ADM-FACILITY AAL2 | status/type/age/assignee/cursor → review worklist | — | AUTH-003/004; ADMIN-002 |
| `reviewVerificationCase` | `POST /admin/identity-verifications/{caseId}/decision` | ADM-FACILITY AAL2 | approve/reject + reason/evidence → decision | I,V | AUTH-003/004 |
| `createProfessionalLicense` | `POST /people/me/professional-licenses` | verified workforce person | profession/license/issuer/specialty/expiry → pending license | I | FAC-007 |
| `createProfessionalLicenseUpload` | `POST /professional-licenses/{licenseId}/upload-intent` | license subject | file metadata → one-time upload URL/object ID | I | FAC-007 |
| `getProfessionalLicense` | `GET /professional-licenses/{licenseId}` | subject/authorized facility/ADM-FACILITY | — → masked license/review/expiry state | — | FAC-007 |
| `listProfessionalLicenseCases` | `GET /admin/professional-licenses` | ADM-FACILITY AAL2 | profession/status/expiry/assignee/cursor → review worklist | — | FAC-007; ADMIN-002 |
| `reviewProfessionalLicense` | `POST /admin/professional-licenses/{licenseId}/decision` | ADM-FACILITY AAL2 | verify/reject/suspend + reason/evidence → decision | I,V | FAC-007; ADMIN-004 |
| `getPrivacyNotice` | `GET /privacy/notices/current` | PUB | purpose/locale → notice/version/purposes | — | AUTH-007/008 |
| `listMyConsents` | `GET /privacy/consents` | PAT/GUA | managed patient → decisions/versions | — | AUTH-007 |
| `recordConsent` | `POST /privacy/consents` | PAT/GUA | purpose version + granted/refused → consent evidence | I | AUTH-007/008 |
| `withdrawConsent` | `POST /privacy/consents/{consentId}/withdraw` | subject | reason optional → withdrawal/effective time | I,V | AUTH-007 |
| `createDsr` | `POST /privacy/requests` | PAT/GUA with legal scope | type/scope/contact → request/due date | I | AUTH-007 |
| `listMyDsrs` | `GET /privacy/requests` | PAT/GUA with legal scope | cursor → requests | — | AUTH-007 |
| `getDsr` | `GET /privacy/requests/{requestId}` | PAT/GUA with legal scope or DPO | — → request/events/decision | — | AUTH-007 |
| `downloadDsrExport` | `POST /privacy/requests/{requestId}/download-link` | PAT/GUA with legal scope AAL2 | — → one-time short-lived link | I | AUTH-007 |
| `listAdminDsrs` | `GET /admin/privacy/requests` | DPO AAL2 | type/status/due date/cursor → purpose-limited worklist | — | AUTH-007; ADMIN-002 |
| `decideDsr` | `POST /admin/privacy/requests/{requestId}/decision` | DPO AAL2 | approve/partially approve/refuse + reason/scope → decision/event | I,V | AUTH-007; ADMIN-002 |
| `fulfilDsr` | `POST /admin/privacy/requests/{requestId}/fulfilment` | DPO AAL2 | action summary/evidence object/subject notice → fulfilled/event | I,V | AUTH-007; ADMIN-002 |
| `listRelationships` | `GET /patients/{managedPatientId}/relationships` | PAT/GUA/DEL | cursor → scoped relationships | — | FAM-001/007 |
| `createGuardianship` | `POST /patients/{managedPatientId}/guardianships` | proposed guardian | evidence metadata/scope → pending relationship | I | FAM-002 |
| `listGuardianshipCases` | `GET /admin/guardianships` | ADM-SUPPORT AAL2 | status/age/assignee/cursor → review worklist | — | FAM-002/008; ADMIN-002 |
| `reviewGuardianship` | `POST /admin/guardianships/{relationshipId}/decision` | ADM-SUPPORT AAL2 | approve/reject/reason/validity → decision | I,V | FAM-002/008 |
| `transitionDependent` | `POST /guardianships/{relationshipId}/transition` | subject + reviewer | identity proof/decision → transition case/result | I,V | FAM-003 |
| `createDelegation` | `POST /patients/{managedPatientId}/delegations` | PAT | delegate identity, permissions, validity → pending invite | I | FAM-004 |
| `acceptDelegation` | `POST /delegations/{relationshipId}/accept` | invited person | token/confirmation → active grant | I | FAM-004 |
| `updateDelegation` | `PATCH /delegations/{relationshipId}` | delegator | permissions/validity → version | I,V | FAM-004 |
| `revokeRelationship` | `POST /relationships/{relationshipId}/revoke` | delegator/authorized reviewer | reason → revoked | I,V | FAM-003/004/008 |
| `createEmergencyContact` | `POST /patients/{managedPatientId}/emergency-contacts` | PAT/GUA | name/phone/location precision → pending contact | I | FAM-005/006 |
| `listEmergencyContacts` | `GET /patients/{managedPatientId}/emergency-contacts` | PAT/GUA | — → masked contacts/status | — | FAM-005 |
| `respondEmergencyContact` | `POST /emergency-contact-invites/response` | PUB | confirmed/declined → terminal response | token in write-only request body | FAM-005 |
| `revokeEmergencyContact` | `POST /emergency-contacts/{contactId}/revoke` | PAT/GUA | reason → revoked | I,V | FAM-005 |

## 3. Facilities, workforce, discovery, and SOS

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `createFacility` | `POST /facilities` | verified person | type, bilingual identity, address/location → draft facility | I | FAC-001 |
| `updateFacility` | `PATCH /facilities/{facilityId}` | owner | allowed fields → versioned facility | I,V | FAC-001/002 |
| `submitFacility` | `POST /facilities/{facilityId}/submit` | owner AAL2 | license/evidence checklist → pending review | I,V | FAC-001 |
| `createFacilityLicenseUpload` | `POST /facilities/{facilityId}/licenses/upload-intent` | owner | metadata → upload URL/object | I | FAC-001 |
| `listFacilityApprovalCases` | `GET /admin/facilities` | ADM-FACILITY AAL2 | type/status/expiry/assignee/cursor → approval worklist | — | FAC-001; ADMIN-002 |
| `reviewFacility` | `POST /admin/facilities/{facilityId}/decision` | ADM-FACILITY AAL2 | approve/reject/suspend + evidence/reason → state | I,V | FAC-001; ADMIN-004 |
| `getFacility` | `GET /facilities/{facilityId}` | public/auth by projection | — → public or authorized detail | — | FAC-001 |
| `listFacilityMemberships` | `GET /facilities/{facilityId}/memberships` | owner | cursor/status → memberships | — | FAC-002/003 |
| `inviteFacilityMember` | `POST /facilities/{facilityId}/memberships` | owner | person/contact, role, validity → invitation | I | FAC-002/003 |
| `acceptFacilityMembership` | `POST /facility-membership-invites/{token}/accept` | PUB/invitee | confirmation → membership | I | FAC-002 |
| `updateFacilityMembership` | `PATCH /facilities/{facilityId}/memberships/{membershipId}` | owner | role/validity/status → version | I,V | FAC-002/003 |
| `endFacilityMembership` | `POST /facilities/{facilityId}/memberships/{membershipId}/end` | owner | reason/effective time → ended | I,V | FAC-002 |
| `assignPharmacyDirector` | `POST /facilities/{facilityId}/pharmacy-director` | owner + ADM-FACILITY review | pharmacist/license/effective date → pending/active directorship | I,V | FAC-004 |
| `searchFacilities` | `GET /discovery/facilities` | PUB/auth | type/service/near/radius/cursor → verified facilities/signals/freshness | — | DISC-001 |
| `searchDoctors` | `GET /discovery/doctors` | PUB/auth | specialty/facility/near/date/cursor → verified doctors/slots/fees | — | CLINIC-001 |
| `getFacilityCapacity` | `GET /discovery/hospitals/{facilityId}/capacity` | PUB/auth | — → emergency capacity signal/freshness | — | HOSP-007; DISC-001 |
| `searchPharmacyStock` | `GET /discovery/pharmacy-stock` | PUB/auth | product/near/radius/cursor → verified pharmacies with coarse stock status/freshness | — | PHARM-006; DISC-001 |
| `createSosIncident` | `POST /sos/incidents` | PAT/GUA/DEL with `sos.activate` | managed patient, coordinates, qualifying reason, contact preference → matches/incident | I | SOS-001/002/004 |
| `getSosIncident` | `GET /sos/incidents/{incidentId}` | subject/authorized HSP | — → status/match/acceptance/contact delivery | — | SOS-001/002 |
| `acceptSosPrearrival` | `POST /hospitals/{facilityId}/sos-incidents/{incidentId}/accept` | HSP | acknowledgement/capacity note → accepted pre-arrival | I,V | SOS-002 |
| `closeSosIncident` | `POST /sos/incidents/{incidentId}/close` | subject/HSP | outcome/reason → closed | I,V | SOS-001 |
| `createEmergencyShare` | `POST /sos/incidents/{incidentId}/share-links` | PAT/GUA/DEL with `sos.share` | allowed fields → one-time token URL/expiry | I | SOS-003 |
| `revokeEmergencyShare` | `POST /sos/share-links/{shareId}/revoke` | subject | — → revoked | I,V | SOS-003 |
| `viewEmergencyShare` | `GET /sos/share/{token}` | PUB | token → minimum emergency profile or expiry problem | token | SOS-003 |

## 4. Clinic, queues, encounters, referrals, and chat

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `listDoctorAvailability` | `GET /clinics/{facilityId}/doctors/{doctorId}/availability` | PUB/auth | date range → slots/version | — | CLINIC-001 |
| `createSchedule` | `POST /clinics/{facilityId}/schedules` | doctor/owner | recurrence/slot/dates → schedule | I | FAC-005 |
| `updateSchedule` | `PATCH /clinics/{facilityId}/schedules/{scheduleId}` | doctor/owner | recurrence/slot/status → version | I,V | FAC-005 |
| `createScheduleException` | `POST /clinics/{facilityId}/schedules/{scheduleId}/exceptions` | doctor/owner | type/start/end/reason → exception/affected count | I,V | FAC-005; CLINIC-005 |
| `createAppointment` | `POST /appointments` | PAT/GUA/DEL | patient/slot/reason/referral → confirmed appointment | I | CLINIC-002/003/008 |
| `getAppointment` | `GET /appointments/{appointmentId}` | participant/scoped CLN | — → appointment/queue/referral | — | CLINIC-003 |
| `listAppointments` | `GET /appointments` | subject/CLN | patient/facility/doctor/status/date/cursor → appointments | — | CLINIC-003 |
| `cancelAppointment` | `POST /appointments/{appointmentId}/cancel` | subject/CLN | reason → cancelled/refund policy result | I,V | CLINIC-003 |
| `rescheduleAppointment` | `POST /appointments/{appointmentId}/reschedule` | subject/CLN | new slot/reason → new version | I,V | CLINIC-003/005 |
| `checkInAppointment` | `POST /appointments/{appointmentId}/check-in` | subject/CLN | arrival confirmation → queue entry | I,V | CLINIC-003/004 |
| `getQueue` | `GET /clinics/{facilityId}/queues` | CLN | doctor/date/cursor → authorized queue | — | CLINIC-004 |
| `getMyQueuePosition` | `GET /appointments/{appointmentId}/queue-position` | subject | — → position/estimate/updated/stale | — | CLINIC-004 |
| `callQueueEntry` | `POST /queue-entries/{queueEntryId}/call` | CLN | — → called state | I,V | CLINIC-004 |
| `reorderQueueEntry` | `POST /queue-entries/{queueEntryId}/reorder` | authorized CLN | target position/reason → queue version | I,V | CLINIC-004 |
| `completeQueueEntry` | `POST /queue-entries/{queueEntryId}/complete` | CLN | — → completed | I,V | CLINIC-004 |
| `sendDoctorDelay` | `POST /clinics/{facilityId}/doctors/{doctorId}/delay` | doctor/owner | date/minutes/template → affected appointments/outbox IDs | I | CLINIC-005 |
| `declareDoctorAbsence` | `POST /clinics/{facilityId}/doctors/{doctorId}/absence` | doctor/owner | interval/reason/replacement options → exception/affected appointments | I | CLINIC-005 |
| `createEncounter` | `POST /encounters` | CLN | appointment/patient/type/participants → open encounter | I | CLINIC-006 |
| `getEncounter` | `GET /encounters/{encounterId}` | subject/authorized care team | fields projection → authorized encounter | — | CLINIC-006 |
| `updateEncounter` | `PATCH /encounters/{encounterId}` | treating CLN | structured fields → version | I,V | CLINIC-006 |
| `signEncounterNote` | `POST /encounters/{encounterId}/notes` | treating CLN | type/body/visibility → signed note version | I | CLINIC-006 |
| `completeEncounter` | `POST /encounters/{encounterId}/complete` | responsible clinician | summary/checklist → completed | I,V | CLINIC-006 |
| `createReferral` | `POST /encounters/{encounterId}/referrals` | treating clinician | specialty/target/reason/authorized fields → referral | I | CLINIC-007 |
| `listReferrals` | `GET /referrals` | subject/CLN | patient/facility/specialty/status/date/cursor → role-projected referral worklist | — | CLINIC-007 |
| `acceptReferral` | `POST /referrals/{referralId}/accept` | PAT/GUA/DEL | target slot/facility → appointment/referral status | I,V | CLINIC-007 |
| `listContextMessages` | `GET /contexts/{contextType}/{contextId}/messages` | context participant | cursor → messages | — | FAC-006 |
| `sendContextMessage` | `POST /contexts/{contextType}/{contextId}/messages` | context participant | body/attachment → message | I | FAC-006 |

## 5. Clinical safety, medications, observations, and vaccination

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `listAllergies` | `GET /patients/{managedPatientId}/allergies` | subject/authorized care team | status/cursor → allergies | — | SAFE-001/008 |
| `createAllergy` | `POST /patients/{managedPatientId}/allergies` | subject/clinician | substance/reaction/severity/onset/source → allergy | I | SAFE-008 |
| `verifyAllergy` | `POST /allergies/{allergyId}/verification` | clinician | confirmed/refuted/reason → new version | I,V | SAFE-008 |
| `createPrescription` | `POST /encounters/{encounterId}/prescriptions` | prescriber | items/substitution/expiry → draft + safety result | I | SAFE-001/003/009 |
| `updatePrescription` | `PATCH /prescriptions/{prescriptionId}` | prescriber | item changes → version + rerun safety | I,V | SAFE-001/003 |
| `runPrescriptionSafety` | `POST /prescriptions/{prescriptionId}/safety-checks` | prescriber | content version optional → issues/check digest | I,V | SAFE-001/002/003 |
| `acknowledgeWarning` | `POST /detected-issues/{issueId}/acknowledgements` | prescriber | reason/justification/monitoring → acknowledgement | I | SAFE-004 |
| `requestContraindicatedOverride` | `POST /detected-issues/{issueId}/override-requests` | prescriber | rationale/alternatives/monitoring/emergency → request | I | SAFE-005/006/007 |
| `decideOverride` | `POST /override-requests/{overrideId}/decisions` | independent pharmacist/physician by pathway | decision/comment/signature digest → status/signatures | I,V | SAFE-006/007 |
| `signPrescription` | `POST /prescriptions/{prescriptionId}/sign` | prescriber AAL2 | signature confirmation → signed prescription or domain problem | I,V | SAFE-001/005/006/012 |
| `cancelPrescription` | `POST /prescriptions/{prescriptionId}/cancel` | prescriber | reason → cancelled | I,V | SAFE-011 |
| `getPrescription` | `GET /prescriptions/{prescriptionId}` | subject/authorized care/pharmacy | — → role-projected prescription/issues/provenance | — | SAFE-011 |
| `listPatientMedications` | `GET /patients/{managedPatientId}/medications` | subject/authorized care | status/cursor → statements | — | SAFE-001 |
| `createDoseSchedule` | `POST /medications/{medicationId}/dose-schedules` | subject/clinician | schedule/timezone → schedule/reminders | I | MED-001 |
| `recordDose` | `POST /medications/{medicationId}/dose-logs` | PAT/GUA/DEL | scheduled time/response/reason → dose log/status impact | I | MED-001 |
| `getAdherence` | `GET /medications/{medicationId}/adherence` | subject/authorized clinician | window → counts/rate/missingness | — | MED-002 |
| `listRefillPlans` | `GET /patients/{managedPatientId}/refill-plans` | subject/authorized clinician | cursor → plans/predictions | — | MED-003 |
| `createRefillRequest` | `POST /refill-plans/{planId}/requests` | PAT/GUA/DEL | target/reason → routed request | I | MED-003 |
| `decideRefillRequest` | `POST /refill-requests/{requestId}/decision` | prescriber/pharmacist within scope | approve route/reject/reason → status; never prescription auto-create without prescriber | I,V | MED-003; SAFE-010 |
| `listObservations` | `GET /patients/{managedPatientId}/observations` | subject/authorized care | code/date/cursor → observations | — | CHRONIC-001/002 |
| `createObservation` | `POST /patients/{managedPatientId}/observations` | subject/clinician | code/typed value/unit/time/source → observation | I | CHRONIC-001 |
| `listVaccinations` | `GET /patients/{managedPatientId}/vaccinations` | subject/authorized care | — → doses/schedule/catch-up status | — | VAX-001/002 |
| `recordVaccination` | `POST /patients/{managedPatientId}/vaccinations` | subject/clinician | vaccine/dose/date/product/lot/source → dose | I | VAX-002 |
| `verifyVaccination` | `POST /vaccinations/{vaccinationId}/verification` | clinician | confirm/refute/correct → new version | I,V | VAX-002 |
| `getDisabilityCredential` | `GET /patients/{managedPatientId}/entitlements/disability-card` | subject/authorized facility | — → masked credential/status/verified benefits if any | — | ACCESS-001/002 |
| `createDisabilityCredential` | `POST /patients/{managedPatientId}/entitlements/disability-card` | PAT/GUA | encrypted identity/evidence → pending credential | I | ACCESS-001 |
| `reviewDisabilityCredential` | `POST /admin/disability-credentials/{credentialId}/decision` | ADM-FACILITY | decision/evidence/applicability → status | I,V | ACCESS-001/002 |

## 6. Pharmacy and EPTTS

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `searchProductCatalog` | `GET /pharmacy/products` | PHA/CLN | query/GTIN/version/cursor → approved products/provenance | — | PHARM-007 |
| `listPharmacyWorklist` | `GET /pharmacies/{facilityId}/worklist` | PHA | prescription/fulfilment/status/priority/date/cursor → actionable prescriptions and fulfilments | — | PHARM-004/010 |
| `createReceipt` | `POST /pharmacies/{facilityId}/receipts` | PHA | supplier/aggregation reference → draft receipt | I | PHARM-001/002 |
| `listReceipts` | `GET /pharmacies/{facilityId}/receipts` | PHA | status/date/supplier/cursor → receipts | — | PHARM-001/002 |
| `getReceipt` | `GET /pharmacies/{facilityId}/receipts/{receiptId}` | PHA | — → receipt/items/reconciliation/version | — | PHARM-001/002/003 |
| `scanReceiptPack` | `POST /pharmacies/{facilityId}/receipts/{receiptId}/packs:scan` | PHA | raw DataMatrix → parsed exact pack or error | I,V | PHARM-001/002 |
| `recordUnverifiedReceiptPack` | `POST /pharmacies/{facilityId}/receipts/{receiptId}/packs:exception` | pharmacist AAL2 | controlled product/batch/expiry/units/reason/evidence → unverified pack | I,V | PHARM-003 |
| `completeReceipt` | `POST /pharmacies/{facilityId}/receipts/{receiptId}/complete` | PHA | reconciliation confirmation → received packs/movements | I,V | PHARM-001/002 |
| `listInventory` | `GET /pharmacies/{facilityId}/inventory` | PHA | product/status/expiry/cursor → internal packs/units | — | PHARM-005/009 |
| `getInventoryPack` | `GET /pharmacies/{facilityId}/inventory-packs/{packId}` | PHA | — → pack/movement summary/version | — | PHARM-004/005/009 |
| `adjustInventoryPack` | `POST /pharmacies/{facilityId}/inventory-packs/{packId}/adjustments` | pharmacist AAL2 | units/reason/evidence → movement/balance | I,V | PHARM-009 |
| `returnInventoryPackUnits` | `POST /pharmacies/{facilityId}/inventory-packs/{packId}/returns` | pharmacist AAL2 | units/return type/source/reason/evidence → return movement and quarantine/release disposition | I,V | PHARM-005/009 |
| `changeInventoryPackState` | `POST /pharmacies/{facilityId}/inventory-packs/{packId}/state` | pharmacist | quarantine/recall/expire/destroy + reason/evidence → state/movement | I,V | PHARM-009 |
| `getPrescriptionForFulfilment` | `GET /pharmacies/{facilityId}/prescriptions/{prescriptionId}` | PHA | — → fulfilment-safe projection | — | PHARM-004/010 |
| `createFulfilment` | `POST /pharmacies/{facilityId}/fulfilments` | PHA | prescription/reservations → reserved fulfilment | I | PHARM-004/010 |
| `getFulfilment` | `GET /fulfilments/{fulfilmentId}` | subject/authorized PHA | — → role-projected fulfilment/items/substitutions/movements | — | PHARM-004/010 |
| `proposeSubstitution` | `POST /fulfilments/{fulfilmentId}/substitutions` | pharmacist | item/product/type/reason → auto-accepted generic or approval pending | I,V | SAFE-009 |
| `getSubstitution` | `GET /substitutions/{substitutionId}` | subject/prescriber/PHA | — → proposal/authority/decision/status | — | SAFE-009 |
| `decideSubstitution` | `POST /substitutions/{substitutionId}/decision` | prescriber | decision/reason → substitution status | I,V | SAFE-009 |
| `dispenseFulfilment` | `POST /fulfilments/{fulfilmentId}/dispense` | pharmacist AAL2 | exact pack scans/selections + units → atomic dispense/movements/medication status | I,V | PHARM-004/005/010 |
| `rejectFulfilment` | `POST /fulfilments/{fulfilmentId}/reject` | pharmacist | reason → rejected/released reservations | I,V | PHARM-010 |
| `cancelFulfilment` | `POST /fulfilments/{fulfilmentId}/cancel` | patient/pharmacist by state | reason → cancelled/released reservations | I,V | PHARM-010 |
| `createEpttsExport` | `POST /pharmacies/{facilityId}/eptts/exports` | pharmacist | event/date range/format version → queued batch | I | PHARM-008 |
| `listEpttsBatches` | `GET /pharmacies/{facilityId}/eptts/batches` | PHA/ADM-FACILITY | direction/status/date/cursor → batches/errors/receipts | — | PHARM-008 |
| `getEpttsBatch` | `GET /pharmacies/{facilityId}/eptts/batches/{batchId}` | PHA/ADM-FACILITY | — → status/file/errors/external receipt | — | PHARM-008 |
| `recordEpttsSubmission` | `POST /pharmacies/{facilityId}/eptts/batches/{batchId}/submission` | pharmacist | external receipt/evidence → submitted/verified state | I,V | PHARM-008 |

## 7. Hospital beds and admission

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `createHospitalArrival` | `POST /hospitals/{facilityId}/arrivals` | HSP | patient/SOS/source/mode/time → arrival | I | HOSP-001 |
| `listHospitalArrivals` | `GET /hospitals/{facilityId}/arrivals` | HSP | status/source/severity/date/cursor → arrival worklist | — | HOSP-001 |
| `getHospitalArrival` | `GET /hospitals/{facilityId}/arrivals/{arrivalId}` | HSP | — → arrival/triage/admission summary | — | HOSP-001 |
| `listSosPrearrivals` | `GET /hospitals/{facilityId}/sos-prearrivals` | HSP | status/freshness/distance/cursor → pending/accepted pre-arrivals | — | SOS-002; HOSP-001 |
| `createTriageAssessment` | `POST /hospitals/{facilityId}/arrivals/{arrivalId}/triage-assessments` | licensed HSP | symptoms/vitals/confirmed severity/AI reference → signed assessment | I | HOSP-001; AI-003 |
| `listWards` | `GET /hospitals/{facilityId}/wards` | HSP | status/type → wards | — | HOSP-002 |
| `createWard` | `POST /hospitals/{facilityId}/wards` | hospital owner/admin | name/type → ward | I | HOSP-002 |
| `updateWard` | `PATCH /hospitals/{facilityId}/wards/{wardId}` | hospital owner/admin | name/status → version | I,V | HOSP-002 |
| `listBeds` | `GET /hospitals/{facilityId}/beds` | HSP | ward/status/cursor → beds/version | — | HOSP-002 |
| `createBed` | `POST /hospitals/{facilityId}/wards/{wardId}/beds` | hospital owner/admin | code/type → bed | I | HOSP-002 |
| `changeBedState` | `POST /hospitals/{facilityId}/beds/{bedId}/state` | authorized HSP | target state/reason → version/capacity | I,V | HOSP-002 |
| `holdBed` | `POST /hospitals/{facilityId}/beds/{bedId}/holds` | HSP | arrival/patient/expiry → hold | I,V | HOSP-003 |
| `releaseBedHold` | `POST /bed-holds/{holdId}/release` | HSP | reason → released | I,V | HOSP-003 |
| `createAdmissionPlan` | `POST /hospitals/{facilityId}/admissions` | HSP | patient/attending/planned time/reason → planned admission | I | HOSP-004 |
| `getAdmission` | `GET /admissions/{admissionId}` | subject/authorized HSP | — → role-projected admission | — | HOSP-004 |
| `listAdmissions` | `GET /hospitals/{facilityId}/admissions` | HSP | status/ward/date/cursor → admissions | — | HOSP-004 |
| `markAdmissionArrived` | `POST /admissions/{admissionId}/arrival` | HSP | hospital arrival/time → arrived | I,V | HOSP-001/004 |
| `admitPatient` | `POST /admissions/{admissionId}/admit` | HSP | hold/bed version/attending → admitted or conflict | I,V | HOSP-003/004 |
| `requestTransfer` | `POST /admissions/{admissionId}/transfers` | HSP | target ward/bed/reason/source+target versions → atomic intra-facility bed transfer; admission remains admitted | I,V | HOSP-005 |
| `transferAdmissionOut` | `POST /admissions/{admissionId}/transfer-out` | authorized HSP AAL2 | receiving facility/handoff/reason → transferred and bed released | I,V | HOSP-004/005 |
| `cancelAdmission` | `POST /admissions/{admissionId}/cancel` | authorized HSP | reason → cancelled/released bed | I,V | HOSP-004 |
| `createDischargeDraft` | `POST /admissions/{admissionId}/discharge-summaries` | treating clinician | diagnoses/reconciliation/instructions/follow-up → draft version | I | HOSP-006 |
| `signDischarge` | `POST /admissions/{admissionId}/discharge-summaries/{summaryId}/sign` | responsible clinician AAL2 | signature confirmation → discharged/released bed | I,V | HOSP-006 |
| `amendDischarge` | `POST /admissions/{admissionId}/discharge-summaries/{summaryId}/amendments` | authorized clinician | corrected fields/reason → new signed version | I,V | HOSP-006 |

## 8. Laboratory

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `searchLabTests` | `GET /labs/{facilityId}/tests` | CLN/LAB/PAT | query/cursor → approved test definitions | — | LAB-001 |
| `createLabOrder` | `POST /encounters/{encounterId}/lab-orders` | clinician | performing lab/priority/tests/minimum context → order | I | LAB-001 |
| `getLabOrder` | `GET /lab-orders/{orderId}` | subject/ordering/performing staff | — → role-projected order/status/results | — | LAB-001/002 |
| `listLabOrders` | `GET /lab-orders` | subject/LAB/CLN | patient/facility/status/date/cursor → orders | — | LAB-002 |
| `acceptLabOrder` | `POST /lab-orders/{orderId}/accept` | LAB | schedule/requirements → accepted | I,V | LAB-002 |
| `cancelLabOrder` | `POST /lab-orders/{orderId}/cancel` | requester/LAB by state | reason → cancelled | I,V | LAB-002 |
| `collectSpecimen` | `POST /lab-orders/{orderId}/specimens` | LAB | item/accession/type/time/collector → specimen | I | LAB-002 |
| `getSpecimen` | `GET /specimens/{specimenId}` | LAB/authorized ordering clinician | — → specimen/status/chain-of-custody/recollection | — | LAB-002 |
| `receiveSpecimen` | `POST /specimens/{specimenId}/receive` | LAB | condition/time → in process or rejection | I,V | LAB-002 |
| `rejectSpecimen` | `POST /specimens/{specimenId}/reject` | LAB | reason/recollection → rejected state | I,V | LAB-002 |
| `recordLabResult` | `POST /lab-order-items/{itemId}/results` | LAB | typed value/unit/reference/interpretation → preliminary version | I | LAB-003 |
| `verifyLabResult` | `POST /lab-results/{resultId}/verify` | authorized verifier AAL2 | signature/critical evaluation → verified + possible event | I,V | LAB-003/004 |
| `releaseLabResult` | `POST /lab-results/{resultId}/release` | authorized LAB | confirmation → released/notifications | I,V | LAB-002/003/004 |
| `correctLabResult` | `POST /lab-results/{resultId}/corrections` | authorized verifier | replacement/reason/signature → corrected version | I,V | LAB-003 |
| `getLabResult` | `GET /lab-results/{resultId}` | subject/authorized care | — → released/authorized result/version history | — | LAB-002/003 |
| `acknowledgeCriticalResult` | `POST /critical-results/{criticalEventId}/acknowledgements` | ordering clinician/patient by recipient type | action/comment → acknowledgement/closed or escalated | I,V | LAB-004 |
| `listCriticalResults` | `GET /critical-results` | LAB/ordering CLN by scope | facility/recipient/status/SLA/date/cursor → critical-result worklist | — | LAB-004 |
| `listLabCatalogVersions` | `GET /labs/{facilityId}/catalog-versions` | LAB owner/verifier | status/effective date/cursor → catalog versions | — | LAB-001 |
| `createLabCatalogVersion` | `POST /labs/{facilityId}/catalog-versions` | LAB owner/verifier | source/digest/test definitions → draft version | I | LAB-001 |
| `publishLabCatalogVersion` | `POST /labs/{facilityId}/catalog-versions/{versionId}/publish` | independent LAB verifier AAL2 | signature/effective date → published version | I,V | LAB-001; ADMIN-004 |
| `listCriticalPolicies` | `GET /labs/{facilityId}/critical-policies` | LAB verifier/ADM-MEDICAL | test/status/effective date/cursor → policy versions | — | LAB-004 |
| `createCriticalPolicy` | `POST /labs/{facilityId}/critical-policies` | LAB verifier | test/rules/SLA/source/digest → draft policy | I | LAB-004 |
| `publishCriticalPolicy` | `POST /labs/{facilityId}/critical-policies/{policyId}/publish` | independent LAB verifier or ADM-MEDICAL AAL2 | effective date/confirmation → published only when required signatures exist | I,V | LAB-004; ADMIN-004 |

## 9. Trust, administration, clinical content, care payments, and mandatory AI

| Operation ID | Method and path | Actor | Request → success | Flags | FR |
|---|---|---|---|---|---|
| `createReview` | `POST /reviews` | PAT/GUA | verified source/target/rating/mode/text → review | I | TRUST-001 |
| `listReviews` | `GET /reviews` | PUB | target/cursor → moderated display projection | — | TRUST-001 |
| `reportReview` | `POST /reviews/{reviewId}/reports` | auth | reason → report | I | TRUST-001 |
| `listReviewReports` | `GET /admin/review-reports` | ADM-SUPPORT AAL2 | status/reason/age/cursor → moderation worklist | — | TRUST-001; ADMIN-002 |
| `moderateReview` | `POST /admin/reviews/{reviewId}/decision` | ADM-SUPPORT | keep/hide/remove/reason → state | I,V | TRUST-001 |
| `createComplaint` | `POST /complaints` | PAT/GUA/DEL with `complaint.create` | source/facility/category/severity/body → complaint/SLA | I | TRUST-002 |
| `listComplaints` | `GET /complaints` | complainant/facility/ADM-SUPPORT | facility/status/severity/SLA/date/cursor → role-projected worklist | — | TRUST-002 |
| `getComplaint` | `GET /complaints/{complaintId}` | complainant/facility/ADM-SUPPORT | — → role-projected timeline | — | TRUST-002 |
| `respondComplaint` | `POST /complaints/{complaintId}/responses` | participant/ADM-SUPPORT | response/status proposal → event | I,V | TRUST-002 |
| `escalateComplaint` | `POST /complaints/{complaintId}/escalate` | participant/SYS | reason → assigned escalation | I,V | TRUST-002 |
| `getAdminSummary` | `GET /admin/dashboard-summary` | ADM-* | — → minimum-cell aggregate counts | — | ADMIN-001/003 |
| `listAuditEvents` | `GET /admin/audit/events` | ADM-SUPER AAL2 | actor/action/resource/time/outcome/cursor + purpose → redacted events | — | ADMIN-002; NFR-SEC-006 |
| `getAuditEvent` | `GET /admin/audit/events/{eventId}` | ADM-SUPER AAL2 | purpose → redacted event/hash-chain evidence | — | ADMIN-002; NFR-SEC-006 |
| `createAuditExport` | `POST /admin/audit/exports` | ADM-SUPER AAL2 | partition/time range/purpose → queued export | I | ADMIN-002; NFR-SEC-006 |
| `listAdminRoleGrants` | `GET /admin/role-grants` | ADM-SUPER | cursor → grants | — | ADMIN-001 |
| `proposeAdminRoleGrant` | `POST /admin/role-grants` | ADM-SUPER AAL2 | person/role/validity/reason → pending grant | I | ADMIN-001/004 |
| `decideAdminRoleGrant` | `POST /admin/role-grants/{grantId}/decision` | second ADM-SUPER AAL2 | approve/reject/reason → grant | I,V | ADMIN-004 |
| `proposeAdminRoleRevocation` | `POST /admin/role-grants/{grantId}/revocation-requests` | ADM-SUPER AAL2 | reason → pending revocation request; grant remains active | I,V | ADMIN-001/002/004 |
| `decideAdminRoleRevocation` | `POST /admin/role-grant-revocations/{requestId}/decision` | second ADM-SUPER AAL2 | approve/reject/reason → grant atomically revoked or retained | I,V | ADMIN-001/002/004 |
| `listClinicalContent` | `GET /admin/clinical-content/{contentType}` | ADM-MEDICAL | version/status/cursor → releases | — | SAFE-002/012 |
| `createClinicalContentRelease` | `POST /admin/clinical-content/{contentType}/releases` | ADM-MEDICAL | source/content digest/effective data → draft | I | SAFE-002/012 |
| `signClinicalContentRelease` | `POST /admin/clinical-content/releases/{releaseId}/signatures` | credentialed physician/pharmacist | role/signature digest/decision → signature/gate status | I,V | SAFE-012 |
| `publishClinicalContentRelease` | `POST /admin/clinical-content/releases/{releaseId}/publish` | ADM-MEDICAL AAL2 | confirmation → published or missing-signature problem | I,V | SAFE-002/012 |
| `listNotificationTemplates` | `GET /admin/notification-templates` | ADM-SUPPORT | code/locale/channel/status/cursor → template versions and allowed-field schemas | — | NOTIF-001 |
| `createNotificationTemplateRelease` | `POST /admin/notification-templates/{templateCode}/releases` | ADM-SUPPORT | bilingual/channel content/allowed recipients/field schema/digest → draft | I | NOTIF-001 |
| `publishNotificationTemplateRelease` | `POST /admin/notification-templates/releases/{releaseId}/publish` | independent ADM-SUPPORT AAL2 | approval/effective date → published version | I,V | NOTIF-001; ADMIN-004 |
| `createPaymentIntent` | `POST /payments/intents` | PAT/GUA | care subject type/id/version + method → server-derived amount and currency + hosted PSP URL or cash instruction | I | PAY-001 |
| `getPaymentIntent` | `GET /payments/intents/{intentId}` | subject/ADM-FINANCE | — → status/receipt; no card data | — | PAY-001 |
| `paymentProviderCallback` | `POST /callbacks/payments/{provider}` | PUB signed | provider event → 200 receipt | provider replay | PAY-001 |
| `symptomCheck` | `POST /ai/symptom-checks` | synthetic PAT/GUA/DEL with `symptom_routing.use` | allow-listed symptom codes, age band, duration/severity flags; identifiers/free text rejected → red-flag routing or ranked specialties | I | AI-001/002/004/005 |
| `suggestHospitalSeverity` | `POST /ai/hospital-severity-suggestions` | synthetic HSP | allow-listed structured synthetic triage/vital fields; identifiers/free text rejected → advisory severity/version/evidence | I | AI-003/004/005 |
| `getAiRun` | `GET /ai/runs/{runId}` | subject/authorized HSP/ADM-MEDICAL | — → minimum run/output/version/reviewer state | — | AI-002/003/005 |
| `listAiModelReleases` | `GET /admin/ai-model-releases` | ADM-MEDICAL | status/model/version/cursor → releases/evaluation summaries | — | AI-005 |
| `createAiModelRelease` | `POST /admin/ai-model-releases` | ADM-MEDICAL AAL2 | model/provider/version/card/evaluation digest/thresholds → draft release | I | AI-004/005 |
| `signAiModelRelease` | `POST /admin/ai-model-releases/{releaseId}/signatures` | independent ADM-MEDICAL (clinical), DPO (privacy), or ADM-SUPER (security), AAL2 | mapped signature role/decision/artifact digest → signature/gate status; creator cannot sign | I,V | AI-004/005 |
| `publishAiModelRelease` | `POST /admin/ai-model-releases/{releaseId}/publish` | independent ADM-MEDICAL AAL2 | confirmation → published only with all three mapped signatures; publisher cannot be creator or signer | I,V | AI-005 |

### 9.1 Reserved post-MVP donation operations — forbidden in the graduation build

These six operation IDs preserve future trace history only. They MUST NOT appear in the graduation OpenAPI document, generated clients, route registration, authorization policy, migrations, UI, tests, or the active-MVP operation count. ADR-016 permits a future spec only after its licensed-partner re-entry condition is met.

| Reserved operation ID | Reserved method and path | Future actor | Future contract sketch | Flags | Reserved FR |
|---|---|---|---|---|---|
| `createDonationCase` | `POST /admin/donation-cases` | ADM-FINANCE | partner-backed evidence/amount/reason → nominated case | I | FIN-001/002 |
| `listDonationCases` | `GET /admin/donation-cases` | ADM-FINANCE | status/age/assignee/cursor → restricted worklist | — | FIN-001/002 |
| `getDonationCase` | `GET /admin/donation-cases/{caseId}` | ADM-FINANCE | — → restricted case/timeline | — | FIN-001 |
| `decideDonationCase` | `POST /admin/donation-cases/{caseId}/decision` | independent ADM-FINANCE | approve/reject/reason → decision | I,V | FIN-001/002 |
| `recordDonationDisbursement` | `POST /admin/donation-cases/{caseId}/disbursements` | ADM-FINANCE | licensed partner/payee/provider/amount/evidence → partner result | I,V | FIN-001/002 |
| `getDonationImpact` | `GET /donations/impact` | PUB/PAT | period → thresholded aggregate impact | — | FIN-003 |

## 10. Internal operations

These are private-network, service-authenticated operations and are still part of the inventory.

| Operation ID | Method and path | Actor | Purpose | Flags | Requirement |
|---|---|---|---|---|---|
| `healthLive` | `GET /internal/health/live` | platform | process liveness; no dependency/secret detail | — | NFR-AVAIL-001 |
| `healthReady` | `GET /internal/health/ready` | platform | database/outbox readiness summary | — | NFR-AVAIL-001 |
| `identityProviderCallback` | `POST /internal/callbacks/identity/{provider}` | signed provider | idempotent proofing result | provider replay | AUTH-003 |
| `smsProviderCallback` | `POST /internal/callbacks/messages/{provider}` | signed provider | delivery receipt only | provider replay | NOTIF-002 |
| `runCatalogImport` | `POST /internal/imports/pharmacy-catalog` | SYS AAL/service | create versioned import batch | I | PHARM-007 |
| `recordEpttsImport` | `POST /internal/imports/eptts` | SYS/service | validate and record approved file input | I | PHARM-008 |
| `replayDeadLetter` | `POST /internal/outbox/dead-letters/{eventId}/replay` | authorized platform operator AAL2 | append replay attempt with reason | I,V | NOTIF-002 |
| `exportAuditPartition` | `POST /internal/audit/exports` | SYS/service | create write-once export/proof | I | NFR-SEC-006 |

## 11. Domain-specific problem codes

| Code | Status | Meaning |
|---|---:|---|
| `slot-no-longer-available` | 409 | appointment slot lost a race |
| `queue-transition-invalid` | 409 | queue action invalid for current state |
| `contraindicated-medication` | 409 | prescription cannot sign without valid override |
| `clinical-content-not-approved` | 503 | required signed content unavailable |
| `override-signature-conflict` | 409 | requester/self or wrong independent signer |
| `serialization-invalid` | 422 | DataMatrix missing/invalid required AIs |
| `serialized-pack-duplicate` | 409 | GTIN/serial already exists |
| `inventory-insufficient` | 409 | exact pack lacks units or valid state |
| `eptts-not-verified` | 409 | no external/manual evidence supports claimed status |
| `bed-version-conflict` | 409 | bed changed or is no longer assignable |
| `bed-hold-expired` | 409 | hold is no longer valid |
| `result-not-released` | 403 | patient cannot view preliminary/unreleased result |
| `critical-acknowledgement-invalid` | 409 | actor/recipient/state cannot acknowledge |
| `relationship-terminal` | 409 | attempted transition/resend from declined/revoked/expired |
| `emergency-share-expired` | 410 | link expired/revoked/used beyond limit |
| `capacity-stale` | 409 | data too old to qualify for confirmed SOS match |
| `separation-of-duties` | 409 | actor is prohibited self-approver |
| `entitlement-unverified` | 409 | benefit cannot be automatically applied |

## 12. Completeness and change rule

This inventory contains 242 active operations for PRD 2.1 graduation scope at operation level, including patient and staff worklists, identity/facility/professional-license reviews, subject/admin DSR lifecycle, patient pharmacy-stock discovery, pharmacy receipt/fulfilment/return/EPTTS worklists, explicit admission transitions and arrival/SOS worklists, laboratory catalog/policy/critical worklists, admin moderation/audit/content/notification governance, care payments, and mandatory AI execution/release governance. The six Section 9.1 donation reservations bring the document total to 248 but are intentionally excluded from the generated graduation OpenAPI and active count. Full machine-readable payload schemas do not yet exist; OPEN-TECH-002 owns that evidence. A feature spec may define payload schemas but may not add, rename, or remove an active operation without updating this catalog, the OpenAPI source, PRD/ADR if scope changes, and the traceability matrix in the same review. CI must fail on an active OpenAPI operation without a catalog row/FR reference or an active catalog operation without an OpenAPI operation before release, and must fail if a reserved operation is registered in the graduation build.

### 12.1 Feature 005 realization note

Feature 005 implements the existing seven DSR and five notification operations without changing the active inventory. Generated contracts, client methods, and registered routes are checked as one exact 12-operation set. All sensitive responses are private/no-store; every catalogued mutation is versioned/idempotent where specified and commits its minimum audit/outbox effects atomically. `smsProviderCallback` remains signed and replay-safe without adding an idempotency header, and `replayDeadLetter` appends rather than mutating the original dead letter. Production SMS and automated statutory erasure remain disabled by `OPEN-VENDOR-002` and `OPEN-LEGAL-002`.
