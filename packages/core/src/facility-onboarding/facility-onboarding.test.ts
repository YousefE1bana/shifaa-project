import { describe, expect, it } from 'vitest';
import {
  adminRoles,
  authorizeFacilityAction,
  canTransitionFacility,
  effectiveLicenseStatus,
  independentActors,
} from './index.js';
describe('facility authorization', () => {
  const base = {
    personId: 'worker',
    facilityId: 'clinic-a',
    requestedFacilityId: 'clinic-a',
    requestedFacilityType: 'clinic' as const,
    actualFacilityType: 'clinic' as const,
    action: 'patient.read',
    permissions: ['patient.read'],
    membershipStatus: 'active' as const,
    professionalLicenseStatus: 'verified' as const,
    professionalLicenseExpiresOn: '2027-01-01',
    regulated: true,
    aal: 2 as const,
    purpose: 'care_delivery',
    requiredPurpose: 'care_delivery',
  };
  it('allows only a complete current context', () => {
    expect(authorizeFacilityAction(base, new Date('2026-01-01'))).toEqual({
      allowed: true,
      reason: 'allowed',
    });
    expect(authorizeFacilityAction({ ...base, requestedFacilityId: 'clinic-b' }).reason).toBe(
      'facility-mismatch',
    );
    for (const status of ['pending', 'rejected', 'suspended', 'expired'] as const)
      expect(authorizeFacilityAction({ ...base, professionalLicenseStatus: status }).allowed).toBe(
        false,
      );
  });
  it('enforces transitions and exact non-hierarchical roles', () => {
    expect(canTransitionFacility('draft', 'active')).toBe(false);
    expect(canTransitionFacility('pending_review', 'active')).toBe(true);
    expect(effectiveLicenseStatus('verified', '2025-01-01', new Date('2026-01-01'))).toBe(
      'expired',
    );
    expect(adminRoles).toHaveLength(5);
    expect(independentActors({ proposerId: 'a', deciderId: 'b', targetId: 'c' })).toBe(true);
    expect(independentActors({ proposerId: 'a', deciderId: 'a', targetId: 'c' })).toBe(false);
  });
});
