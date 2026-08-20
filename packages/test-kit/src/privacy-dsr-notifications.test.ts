import { describe, expect, it } from 'vitest';
import {
  privacyIdempotencyKey,
  privacySyntheticClock,
  privacySyntheticPeople,
  privacySyntheticRequests,
  privacySyntheticSentinels,
  privacySyntheticTokens,
} from './privacy-dsr-notifications.js';

describe('privacy DSR and notification fixtures', () => {
  it('are deterministic, synthetic, collision-free, and explicitly non-production', () => {
    expect(new Set(Object.values(privacySyntheticPeople)).size).toBe(
      Object.keys(privacySyntheticPeople).length,
    );
    expect(new Set(Object.values(privacySyntheticRequests)).size).toBe(6);
    expect(
      Object.values(privacySyntheticTokens).every((value) => value.includes('synthetic-005')),
    ).toBe(true);
    expect(
      Object.entries(privacySyntheticSentinels)
        .filter(([key]) => key !== 'rawContact')
        .every(([, value]) => value.includes('SYNTHETIC')),
    ).toBe(true);
    expect(privacySyntheticSentinels.rawContact).toMatch(/^\+999/);
    expect(privacyIdempotencyKey('create access')).toMatch(/^synthetic-005-/);
  });

  it('freezes the visibly non-statutory due and export bounds', () => {
    expect(
      Date.parse(privacySyntheticClock.dueAt) - Date.parse(privacySyntheticClock.submittedAt),
    ).toBe(17 * 24 * 60 * 60 * 1000);
    expect(
      Date.parse(privacySyntheticClock.exportExpiresAt) -
        Date.parse(privacySyntheticClock.exportIssuedAt),
    ).toBe(5 * 60 * 1000);
  });
});
