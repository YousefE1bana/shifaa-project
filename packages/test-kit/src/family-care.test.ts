import { describe, expect, it } from 'vitest';
import {
  familyIdempotencyKey,
  familySyntheticContacts,
  familySyntheticEvidence,
  familySyntheticPeople,
  familySyntheticSentinels,
  familySyntheticTokens,
} from './family-care.js';

describe('family care fixtures', () => {
  it('are deterministic, impossible, and collision free', () => {
    expect(new Set(Object.values(familySyntheticPeople)).size).toBe(
      Object.keys(familySyntheticPeople).length,
    );
    expect(new Set(Object.values(familySyntheticEvidence)).size).toBe(4);
    expect(new Set(Object.values(familySyntheticContacts)).size).toBe(5);
    expect(familyIdempotencyKey('create guardian')).toMatch(/^synthetic-004-/);
    expect(
      Object.values(familySyntheticTokens).every((token) => token.includes('synthetic-004')),
    ).toBe(true);
    expect(familySyntheticSentinels.phone.startsWith('+999')).toBe(true);
  });
});
