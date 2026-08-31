import { describe, expect, it } from 'vitest';

import {
  identityContinuityAcceptanceCriteria,
  identityContinuityBoundaries,
  identityContinuityLegalVectors,
  identityContinuityRestrictedOperations,
  identityContinuitySyntheticActors,
  identityContinuitySyntheticSentinels,
} from './identity-continuity.js';

describe('007 deterministic seeded-synthetic fixtures', () => {
  it('enumerates every acceptance criterion and legal transition vector', () => {
    expect(identityContinuityAcceptanceCriteria).toEqual(
      Array.from({ length: 32 }, (_, index) => `AC-${String(index + 1).padStart(2, '0')}`),
    );
    expect(identityContinuityLegalVectors).toHaveLength(20);
    expect(identityContinuityLegalVectors.at(0)?.id).toBe('TV-FAM-CAPACITY-TRANSITION-001');
    expect(identityContinuityLegalVectors.at(-1)?.id).toBe('TV-FAM-CAPACITY-TRANSITION-020');
  });

  it('freezes exact security boundaries without wall-clock sleeps', () => {
    expect(identityContinuityBoundaries.factorAmrSeconds).toEqual([299, 300, 301]);
    expect(identityContinuityBoundaries.refreshReuseSeconds).toEqual([10, 10.001]);
    expect(identityContinuityBoundaries.jwtSeconds).toBe(900);
    expect(identityContinuityRestrictedOperations).toEqual([
      'refreshSession',
      'logout',
      'beginMfaEnrollment',
      'verifyMfaEnrollment',
    ]);
  });

  it('uses distinct synthetic UUID actors and explicit prohibited sentinels', () => {
    expect(new Set(Object.values(identityContinuitySyntheticActors)).size).toBe(
      Object.keys(identityContinuitySyntheticActors).length,
    );
    expect(Object.values(identityContinuitySyntheticSentinels)).toHaveLength(5);
    expect(
      Object.values(identityContinuitySyntheticSentinels).every((value) =>
        value.includes('SYNTHETIC'),
      ),
    ).toBe(true);
  });
});
