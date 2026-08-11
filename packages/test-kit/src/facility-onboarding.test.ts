import { expect, test } from 'vitest';
import {
  syntheticEvidence,
  syntheticFacilityTypes,
  syntheticIdempotencyKey,
  syntheticPeople,
} from './facility-onboarding.js';
test('fixtures are deterministic, synthetic, and cover all facility types', () => {
  expect(syntheticFacilityTypes).toEqual(['clinic', 'pharmacy', 'hospital', 'laboratory']);
  expect(new Set(Object.values(syntheticPeople)).size).toBe(Object.keys(syntheticPeople).length);
  expect(syntheticEvidence.releasedSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(syntheticIdempotencyKey('create')).toMatch(/^synthetic-003-/);
});
