import { describe, expect, it } from 'vitest';
import {
  authorizeSosPermission,
  canTransitionEmergencyShare,
  canTransitionSosIncident,
  capacityCountBand,
  capacityFreshness,
  capacityQualifies,
  facilityMatchesDiscovery,
  normalizeEmergencyShareScope,
  projectEmergencyContact,
  projectEmergencyShare,
  rankFacilities,
  sosGuidance,
  type CapacityFact,
} from './index.js';

const now = new Date('2026-08-20T10:00:00.000Z');
const capacity: CapacityFact = {
  signal: 'available',
  availableCount: 2,
  observedAt: new Date('2026-08-20T09:55:00.000Z'),
  freshUntil: now,
  sourceCode: 'synthetic_seed',
};

describe('discovery and SOS policies', () => {
  it.each([
    [{ active: false }, false],
    [{ locationVerified: false }, false],
    [{ licenseVerified: false }, false],
    [{ licenseExpiresAt: now }, false],
    [{ facilityType: 'clinic' as const }, false],
    [{ services: ['general'] }, false],
    [{}, true],
  ])('evaluates every discovery authority boundary', (override, expected) => {
    expect(
      facilityMatchesDiscovery(
        {
          active: true,
          locationVerified: true,
          licenseVerified: true,
          licenseExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
          facilityType: 'hospital',
          services: ['emergency'],
          ...override,
        },
        { facilityType: 'hospital', service: 'emergency', now },
      ),
    ).toBe(expected);
  });

  it('uses an inclusive freshness boundary and fails closed for absent configuration', () => {
    expect(capacityFreshness(capacity, now, 'synthetic_seed')).toBe('fresh');
    expect(capacityQualifies(capacity, now, 'synthetic_seed')).toBe(true);
    expect(capacityFreshness(capacity, now, undefined)).toBe('unknown');
    expect(capacityQualifies({ ...capacity, signal: 'unknown' }, now, 'synthetic_seed')).toBe(
      false,
    );
    expect(
      capacityFreshness(capacity, new Date('2026-08-20T10:00:00.001Z'), 'synthetic_seed'),
    ).toBe('stale');
  });

  it('projects aggregate availability into closed privacy-safe count bands', () => {
    expect(capacityCountBand(undefined)).toBe('unknown');
    expect(capacityCountBand({ ...capacity, signal: 'unknown', availableCount: 0 })).toBe(
      'unknown',
    );
    expect(capacityCountBand({ ...capacity, signal: 'unavailable', availableCount: 0 })).toBe(
      'none',
    );
    expect(capacityCountBand({ ...capacity, availableCount: 1 })).toBe('one_to_four');
    expect(capacityCountBand({ ...capacity, availableCount: 4 })).toBe('one_to_four');
    expect(capacityCountBand({ ...capacity, availableCount: 5 })).toBe('five_to_nine');
    expect(capacityCountBand({ ...capacity, availableCount: 9 })).toBe('five_to_nine');
    expect(capacityCountBand({ ...capacity, availableCount: 10 })).toBe('ten_or_more');
  });

  it('orders distance ties by stable facility id and puts manual results last', () => {
    expect(
      rankFacilities([
        { facilityId: 'b', distanceM: 100 },
        { facilityId: 'c', distanceM: null },
        { facilityId: 'a', distanceM: 100 },
        { facilityId: 'd', distanceM: 20 },
      ]).map(({ facilityId }) => facilityId),
    ).toEqual(['d', 'a', 'b', 'c']);
  });

  it('keeps incident and share terminal states closed', () => {
    expect(canTransitionSosIncident('matched', 'accepted')).toBe(true);
    expect(canTransitionSosIncident('accepted', 'matched')).toBe(false);
    expect(canTransitionSosIncident('closed', 'matched')).toBe(false);
    expect(canTransitionEmergencyShare('active', 'used')).toBe(true);
    expect(canTransitionEmergencyShare('used', 'active')).toBe(false);
  });

  it('keeps activate, share, and record permissions independent', () => {
    const relationship = {
      isSelf: false,
      relationshipActive: true,
      relationshipValidNow: true,
      permissions: ['sos.activate'],
    };
    expect(authorizeSosPermission({ ...relationship, requestedPermission: 'sos.activate' })).toBe(
      true,
    );
    expect(authorizeSosPermission({ ...relationship, requestedPermission: 'sos.share' })).toBe(
      false,
    );
    expect(
      authorizeSosPermission({
        ...relationship,
        permissions: ['record.view'],
        requestedPermission: 'sos.activate',
      }),
    ).toBe(false);
  });

  it('intersects share scope in canonical order and never invents unavailable clinical facts', () => {
    expect(normalizeEmergencyShareScope(['emergency_notes', 'blood_group'])).toEqual([
      'blood_group',
      'emergency_notes',
    ]);
    expect(
      projectEmergencyShare(['blood_group', 'confirmed_allergies', 'active_dispensed_medicines'], {
        blood_group: 'O+',
      }),
    ).toEqual({
      available_fields: { blood_group: 'O+' },
      unavailable_fields: ['confirmed_allergies', 'active_dispensed_medicines'],
    });
  });

  it('projects one confirmed-contact minimum and rejects prohibited contact states', () => {
    const input = {
      incidentActive: true,
      contactPreference: 'all_confirmed' as const,
      contactStatus: 'confirmed' as const,
      locationPrecision: 'coarse' as const,
      coarseLocation: 'Synthetic Cairo region',
      patientDisplayName: 'Synthetic Patient',
      incidentTime: now.toISOString(),
      callbackNumber: '+999000000000',
    };
    expect(projectEmergencyContact(input)).toMatchObject({ allowed: true });
    expect(projectEmergencyContact({ ...input, contactPreference: 'none' })).toEqual({
      allowed: false,
      reason: 'preference-none',
    });
    expect(projectEmergencyContact({ ...input, contactStatus: 'revoked' })).toEqual({
      allowed: false,
      reason: 'contact-unconfirmed',
    });
  });

  it('never claims dispatch or reservation', () => {
    expect(sosGuidance).toEqual({
      call_ambulance_123: true,
      ambulance_dispatched: false,
      bed_reserved: false,
    });
  });
});
