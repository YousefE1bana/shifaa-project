export const syntheticPeople = {
  owner: '30000000-0000-4000-8000-000000000001',
  worker: '30000000-0000-4000-8000-000000000002',
  otherWorker: '30000000-0000-4000-8000-000000000003',
  facilityApprover: '30000000-0000-4000-8000-000000000010',
  superAdminA: '30000000-0000-4000-8000-000000000011',
  superAdminB: '30000000-0000-4000-8000-000000000012',
} as const;
export const syntheticFacilityTypes = ['clinic', 'pharmacy', 'hospital', 'laboratory'] as const;
export const syntheticClock = {
  active: new Date('2026-08-11T08:00:00.000Z'),
  futureExpiry: '2027-08-11',
  pastExpiry: '2025-08-11',
} as const;
export const syntheticEvidence = {
  releasedSha256: 'a'.repeat(64),
  quarantinedSha256: '0'.repeat(64),
  mimeType: 'application/pdf',
  sizeBytes: 1024,
} as const;
export function syntheticIdempotencyKey(label: string): string {
  return `synthetic-003-${label.padEnd(16, '0')}`;
}
