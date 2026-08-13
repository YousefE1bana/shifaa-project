import { Value } from '@sinclair/typebox/value';
import { FormatRegistry } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import {
  CreateDelegationSchema,
  CreateEmergencyContactSchema,
  CreateGuardianshipSchema,
  RespondEmergencyContactSchema,
  FAMILY_CARE_FEATURE_ID,
  familyCareOperationIds,
  familyCareRequirementIds,
} from './family-care.js';

FormatRegistry.Set('uuid', (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
);
FormatRegistry.Set('date-time', (value) => Number.isFinite(Date.parse(value)));

describe('family care contracts', () => {
  it('exports exactly the seven active requirements and twelve operations', () => {
    expect(FAMILY_CARE_FEATURE_ID).toBe('004-family-care-relationships');
    expect(familyCareRequirementIds).toEqual([
      'FR-FAM-001',
      'FR-FAM-002',
      'FR-FAM-004',
      'FR-FAM-005',
      'FR-FAM-006',
      'FR-FAM-007',
      'FR-FAM-008',
    ]);
    expect(familyCareOperationIds).toHaveLength(12);
    expect(new Set(familyCareOperationIds).size).toBe(12);
    expect(familyCareOperationIds).not.toContain('transitionDependent');
  });

  it('keeps delegation exact and forbids consent management', () => {
    const valid = {
      delegate_person_id: '40000000-0000-4000-8000-000000000004',
      purpose_code: 'family_support',
      permissions: ['record.view'],
      valid_until: '2027-08-11T09:00:00.000Z',
    };
    expect(Value.Check(CreateDelegationSchema, valid)).toBe(true);
    expect(Value.Check(CreateDelegationSchema, { ...valid, permissions: ['consent.manage'] })).toBe(
      false,
    );
    expect(Value.Check(CreateDelegationSchema, { ...valid, wildcard: true })).toBe(false);
  });

  it('requires released-evidence reference shape and separate contact precision', () => {
    expect(
      Value.Check(CreateGuardianshipSchema, {
        evidence_object_id: '42000000-0000-4000-8000-000000000001',
        purpose_code: 'dependent_care',
        requested_permissions: ['profile.view'],
      }),
    ).toBe(true);
    expect(
      Value.Check(CreateEmergencyContactSchema, {
        display_name: 'Synthetic Contact',
        phone_e164: '+999000000000',
        preferred_locale: 'ar-EG',
        location_precision: 'coarse',
      }),
    ).toBe(true);
    expect(
      Value.Check(RespondEmergencyContactSchema, { token: 'x'.repeat(32), decision: 'confirmed' }),
    ).toBe(true);
    expect(Value.Check(RespondEmergencyContactSchema, { decision: 'confirmed' })).toBe(false);
  });
});
