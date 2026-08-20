export const privacySyntheticPeople = {
  patient: '50000000-0000-4000-8000-000000000001',
  guardian: '50000000-0000-4000-8000-000000000002',
  delegate: '50000000-0000-4000-8000-000000000003',
  unrelated: '50000000-0000-4000-8000-000000000004',
  facilityStaff: '50000000-0000-4000-8000-000000000005',
  dpo: '50000000-0000-4000-8000-000000000006',
  unassignedDpo: '50000000-0000-4000-8000-000000000007',
  templateAuthor: '50000000-0000-4000-8000-000000000008',
  templatePublisher: '50000000-0000-4000-8000-000000000009',
  platformOperator: '50000000-0000-4000-8000-000000000010',
} as const;

export const privacySyntheticPatients = {
  subject: '51000000-0000-4000-8000-000000000001',
  unrelated: '51000000-0000-4000-8000-000000000002',
} as const;

export const privacySyntheticRequests = {
  access: '52000000-0000-4000-8000-000000000001',
  correction: '52000000-0000-4000-8000-000000000002',
  restriction: '52000000-0000-4000-8000-000000000003',
  erasure: '52000000-0000-4000-8000-000000000004',
  identityRequired: '52000000-0000-4000-8000-000000000005',
  exportReady: '52000000-0000-4000-8000-000000000006',
} as const;

export const privacySyntheticEvidence = {
  decision: '53000000-0000-4000-8000-000000000001',
  fulfilment: '53000000-0000-4000-8000-000000000002',
  exportReleased: '53000000-0000-4000-8000-000000000003',
  exportQuarantined: '53000000-0000-4000-8000-000000000004',
} as const;

export const privacySyntheticTemplates = {
  submitted: '54000000-0000-4000-8000-000000000001',
  statusChanged: '54000000-0000-4000-8000-000000000002',
  exportReady: '54000000-0000-4000-8000-000000000003',
  identityRequired: '54000000-0000-4000-8000-000000000004',
} as const;

export const privacySyntheticEvents = {
  submitted: '55000000-0000-4000-8000-000000000001',
  statusChanged: '55000000-0000-4000-8000-000000000002',
  exportReady: '55000000-0000-4000-8000-000000000003',
  deadLetter: '55000000-0000-4000-8000-000000000004',
} as const;

export const privacySyntheticTokens = {
  export: 'synthetic-005-export-capability-not-production-000000000000000001',
  callbackNonce: 'synthetic-005-callback-nonce-000000000001',
  callbackSecret: 'synthetic-005-callback-secret-not-production',
  wrong: 'synthetic-005-wrong-capability-not-production-00000000000002',
} as const;

export const privacySyntheticSentinels = {
  nationalId: 'SYNTHETIC-NATIONAL-ID-MUST-NOT-ESCAPE',
  rawContact: '+999555000000',
  exportToken: 'SYNTHETIC-EXPORT-TOKEN-MUST-NOT-ESCAPE',
  exportBody: 'SYNTHETIC-EXPORT-BODY-MUST-NOT-ESCAPE',
  templateBody: 'SYNTHETIC-TEMPLATE-BODY-MUST-NOT-PERSIST',
  diagnosis: 'SYNTHETIC-DIAGNOSIS-MUST-NOT-ESCAPE',
} as const;

export const privacySyntheticClock = {
  submittedAt: '2026-08-13T08:00:00.000Z',
  dueAt: '2026-08-30T08:00:00.000Z',
  exportIssuedAt: '2026-08-13T09:00:00.000Z',
  exportExpiresAt: '2026-08-13T09:05:00.000Z',
} as const;

export function privacyIdempotencyKey(label: string): string {
  return `synthetic-005-${label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .padEnd(20, '0')}`;
}
