// Neutral engineering identities only; no clinical or evidence-source approval.
export const feature011HarnessFixture = Object.freeze({
  kind: 'SYNTHETIC_ENGINEERING_ONLY',
  personId: 'f0110000-0000-4000-8000-000000000001',
  patientId: 'f0110000-0000-4000-8100-000000000001',
  facilityId: 'f0110000-0000-4000-8200-000000000001',
  clinicianId: 'f0110000-0000-4000-8000-000000000002',
  encounterId: 'f0110000-0000-4000-8400-000000000001',
  actorCount: 8,
  lockNamespace: 11003,
  lockKey: 1,
  missingBehaviorMessage:
    'F011_K03_EXPECTED_MISSING_BEHAVIOR: clinical.verify_allergy_api_v1(uuid,integer,jsonb)',
  rawEvidenceSqlAllowed: false,
  realClinicalApproval: false,
});
