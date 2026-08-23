import { describe, expect, it } from 'vitest';

import {
  discoverySosShareFields,
  discoverySosSyntheticConfig,
  discoverySosSyntheticLocations,
  discoverySosSyntheticPeople,
  discoverySosUnavailableShareFields,
} from './discovery-sos.js';

describe('006 seeded-synthetic fixture contract', () => {
  it('keeps each eligible fixed point inside WGS84 and every actor identity distinct', () => {
    for (const point of [
      discoverySosSyntheticLocations.activation,
      discoverySosSyntheticLocations.nearestFreshHospital,
      discoverySosSyntheticLocations.fartherFreshHospital,
      discoverySosSyntheticLocations.staleHospital,
    ]) {
      expect(point.longitude).toBeGreaterThanOrEqual(-180);
      expect(point.longitude).toBeLessThanOrEqual(180);
      expect(point.latitude).toBeGreaterThanOrEqual(-90);
      expect(point.latitude).toBeLessThanOrEqual(90);
    }
    expect(new Set(Object.values(discoverySosSyntheticPeople)).size).toBe(
      Object.keys(discoverySosSyntheticPeople).length,
    );
  });

  it('keeps the one-use share and missing-clinical-source boundary explicit', () => {
    expect(discoverySosSyntheticConfig.shareAccessLimit).toBe(1);
    expect(discoverySosSyntheticConfig.shareExpiryMs).toBe(30 * 60 * 1000);
    expect(discoverySosShareFields).toEqual(['blood_group', ...discoverySosUnavailableShareFields]);
  });
});
