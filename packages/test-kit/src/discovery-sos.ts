export const discoverySosSyntheticClock = new Date('2026-08-20T10:00:00.000Z');

export const discoverySosSyntheticPeople = {
  patient: '60000000-0000-4000-8000-000000000001',
  guardian: '60000000-0000-4000-8000-000000000002',
  activateDelegate: '60000000-0000-4000-8000-000000000003',
  shareDelegate: '60000000-0000-4000-8000-000000000004',
  recordOnlyDelegate: '60000000-0000-4000-8000-000000000005',
  unrelated: '60000000-0000-4000-8000-000000000006',
  hospitalAOwner: '60000000-0000-4000-8000-000000000007',
  hospitalBOwner: '60000000-0000-4000-8000-000000000008',
} as const;

export const discoverySosSyntheticPatients = {
  subject: '61000000-0000-4000-8000-000000000001',
  unrelated: '61000000-0000-4000-8000-000000000002',
} as const;

export const discoverySosSyntheticFacilities = {
  nearestFreshHospital: '63000000-0000-4000-8000-000000000001',
  fartherFreshHospital: '63000000-0000-4000-8000-000000000002',
  staleHospital: '63000000-0000-4000-8000-000000000003',
  suspendedHospital: '63000000-0000-4000-8000-000000000004',
  activeClinic: '63000000-0000-4000-8000-000000000005',
  unlicensedHospital: '63000000-0000-4000-8000-000000000006',
} as const;

export const discoverySosSyntheticLocations = {
  activation: { longitude: 31.2005, latitude: 30.1005 },
  nearestFreshHospital: { longitude: 31.2, latitude: 30.1 },
  fartherFreshHospital: { longitude: 31.21, latitude: 30.11 },
  staleHospital: { longitude: 31.22, latitude: 30.12 },
  invalidLongitude: { longitude: 180.000001, latitude: 30.1 },
  invalidLatitude: { longitude: 31.2, latitude: 90.000001 },
} as const;

export const discoverySosSyntheticConfig = {
  environment: 'local',
  defaultDiscoveryRadiusM: 25_000,
  maximumDiscoveryRadiusM: 100_000,
  sosMatchRadiusM: 25_000,
  allowedCapacitySource: 'synthetic_seed',
  freshWindowMs: 10 * 60 * 1000,
  shareExpiryMs: 30 * 60 * 1000,
  shareAccessLimit: 1,
} as const;

export const discoverySosSyntheticRelationships = {
  guardian: '62000000-0000-4000-8000-000000000003',
  activateDelegate: '62000000-0000-4000-8000-000000000004',
  shareDelegate: '62000000-0000-4000-8000-000000000005',
  recordOnlyDelegate: '62000000-0000-4000-8000-000000000006',
} as const;

export const discoverySosSyntheticContact = {
  confirmed: '66000000-0000-4000-8000-000000000001',
  maskedPhone: '+999••••0601',
  locationPrecision: 'coarse',
} as const;

export const discoverySosShareFields = [
  'blood_group',
  'confirmed_allergies',
  'active_dispensed_medicines',
  'chronic_conditions',
  'emergency_notes',
] as const;

export const discoverySosUnavailableShareFields = [
  'confirmed_allergies',
  'active_dispensed_medicines',
  'chronic_conditions',
  'emergency_notes',
] as const;

export const discoverySosSyntheticSentinels = {
  queryCoordinate: 'SYNTHETIC-QUERY-COORDINATE-MUST-NOT-PERSIST',
  rawShareToken: 'SYNTHETIC-SHARE-TOKEN-MUST-NOT-PERSIST',
  diagnosis: 'SYNTHETIC-DIAGNOSIS-MUST-NOT-ESCAPE',
  medication: 'SYNTHETIC-MEDICATION-MUST-NOT-ESCAPE',
  recordLink: 'https://invalid.example/synthetic-record-must-not-escape',
} as const;

export function discoverySosIdempotencyKey(label: string): string {
  return `synthetic-006-${label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .padEnd(20, '0')}`;
}
