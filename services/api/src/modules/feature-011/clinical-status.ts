import { Value } from '@sinclair/typebox/value';
import { feature011Schemas, type Feature011StatusRelease } from '@shifaa/contracts/feature-011';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import type { ContentReadContext } from './list-clinical-content.js';

export function requireClinicStatusContext(context: ContentReadContext): void {
  if (
    !['CLN', 'PHA'].includes(context.role) ||
    !context.facilityId ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(context.facilityId)
  )
    throw new ApiPolicyError('forbidden', 403, 'Current clinic status context is unavailable.');
}

/** SQL owns current grants and eligibility. Reject surplus or unsigned data at
 * this boundary; no resolver, protection capability or clinical inference. */
export function composeClinicalStatus(row: Record<string, unknown>): Feature011StatusRelease {
  if (
    !Value.Check(feature011Schemas.StatusRelease, row) ||
    !row.signatureStatus.physicianApproved ||
    !row.signatureStatus.pharmacistApproved
  )
    throw new ApiPolicyError('forbidden', 403, 'Current clinic status is unavailable.');
  return structuredClone(row);
}
