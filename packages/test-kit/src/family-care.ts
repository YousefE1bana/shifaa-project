export const familySyntheticClock = new Date('2026-08-11T09:00:00.000Z');

export const familySyntheticPeople = {
  self: '40000000-0000-4000-8000-000000000001',
  dependent: '40000000-0000-4000-8000-000000000002',
  proposedGuardian: '40000000-0000-4000-8000-000000000003',
  delegate: '40000000-0000-4000-8000-000000000004',
  unrelated: '40000000-0000-4000-8000-000000000005',
  supportReviewer: '40000000-0000-4000-8000-000000000006',
  wrongReviewer: '40000000-0000-4000-8000-000000000007',
} as const;

export const familySyntheticPatients = {
  self: '41000000-0000-4000-8000-000000000001',
  dependent: '41000000-0000-4000-8000-000000000002',
  unrelated: '41000000-0000-4000-8000-000000000003',
} as const;

export const familySyntheticEvidence = {
  released: '42000000-0000-4000-8000-000000000001',
  quarantined: '42000000-0000-4000-8000-000000000002',
  wrongOwner: '42000000-0000-4000-8000-000000000003',
  wrongPatient: '42000000-0000-4000-8000-000000000004',
} as const;

export const familySyntheticRelationships = {
  self: '43000000-0000-4000-8000-000000000001',
  pendingGuardian: '43000000-0000-4000-8000-000000000002',
  activeGuardian: '43000000-0000-4000-8000-000000000003',
  pendingDelegation: '43000000-0000-4000-8000-000000000004',
  activeDelegation: '43000000-0000-4000-8000-000000000005',
  revokedDelegation: '43000000-0000-4000-8000-000000000006',
} as const;

export const familySyntheticContacts = {
  pending: '44000000-0000-4000-8000-000000000001',
  confirmed: '44000000-0000-4000-8000-000000000002',
  declined: '44000000-0000-4000-8000-000000000003',
  revoked: '44000000-0000-4000-8000-000000000004',
  expired: '44000000-0000-4000-8000-000000000005',
} as const;

export const familySyntheticTokens = {
  delegation: 'synthetic-004-delegation-token-not-production-000000000001',
  contact: 'synthetic-004-contact-token-not-production-000000000000000002',
  wrong: 'synthetic-004-wrong-token-not-production-0000000000000000003',
} as const;

export const familySyntheticSentinels = {
  phone: '+999000000000',
  evidencePath: 'synthetic-only/never-a-real-document.pdf',
  diagnosis: 'SYNTHETIC-DIAGNOSIS-MUST-BE-REDACTED',
  medication: 'SYNTHETIC-MEDICATION-MUST-BE-REDACTED',
  recordLink: 'https://invalid.example/synthetic-record-must-not-escape',
} as const;

export function familyIdempotencyKey(label: string): string {
  return `synthetic-004-${label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .padEnd(20, '0')}`;
}
