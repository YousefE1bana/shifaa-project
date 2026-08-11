import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  AdminRoleSchema,
  FacilityPatchSchema,
  FacilityReviewSchema,
  ProfessionalReviewSchema,
  facilityOperationIds,
} from './facility-onboarding.js';
describe('facility contracts', () => {
  it('exports exactly 22 unique operations', () => {
    expect(facilityOperationIds).toHaveLength(22);
    expect(new Set(facilityOperationIds).size).toBe(22);
  });
  it('keeps partial update and review states exact', () => {
    expect(Value.Check(FacilityPatchSchema, { name_en: 'Clinic' })).toBe(true);
    expect(Value.Check(FacilityPatchSchema, { facility_type: 'clinic' })).toBe(false);
    expect(Value.Check(FacilityReviewSchema, { decision: 'verify', reason: 'no' })).toBe(false);
    expect(Value.Check(ProfessionalReviewSchema, { decision: 'approve', reason: 'no' })).toBe(
      false,
    );
    expect(Value.Check(AdminRoleSchema, 'dpo')).toBe(false);
  });
});
