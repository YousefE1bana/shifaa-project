import type {
  AuthorizationContext,
  AuthorizationDecision,
  FacilityStatus,
  LicenseStatus,
} from './types.js';
const facilityTransitions: Readonly<Record<FacilityStatus, readonly FacilityStatus[]>> = {
  draft: ['pending_review'],
  pending_review: ['active', 'rejected'],
  active: ['suspended'],
  suspended: ['pending_review'],
  rejected: ['draft'],
  closed: [],
};
const licenseTransitions: Readonly<Record<LicenseStatus, readonly LicenseStatus[]>> = {
  pending: ['verified', 'rejected'],
  verified: ['suspended', 'expired'],
  rejected: ['pending'],
  suspended: ['pending'],
  expired: [],
};
export const canTransitionFacility = (from: FacilityStatus, to: FacilityStatus) =>
  facilityTransitions[from].includes(to);
export const canTransitionLicense = (from: LicenseStatus, to: LicenseStatus) =>
  licenseTransitions[from].includes(to);
export function effectiveLicenseStatus(
  status: LicenseStatus,
  expiresOn: string,
  now: Date,
): LicenseStatus {
  return status === 'verified' && expiresOn < now.toISOString().slice(0, 10) ? 'expired' : status;
}
export function authorizeFacilityAction(
  context: AuthorizationContext,
  now = new Date(),
): AuthorizationDecision {
  if (
    !context.facilityId ||
    !context.requestedFacilityId ||
    context.facilityId !== context.requestedFacilityId
  )
    return { allowed: false, reason: 'facility-mismatch' };
  if (context.requestedFacilityType && context.actualFacilityType !== context.requestedFacilityType)
    return { allowed: false, reason: 'application-mismatch' };
  if (context.membershipStatus !== 'active')
    return { allowed: false, reason: 'membership-inactive' };
  if (!context.permissions.includes(context.action))
    return { allowed: false, reason: 'permission-missing' };
  if (context.aal < 2 && context.requiredPurpose)
    return { allowed: false, reason: 'aal-insufficient' };
  if (context.requiredPurpose && context.purpose !== context.requiredPurpose)
    return { allowed: false, reason: 'purpose-missing' };
  if (
    context.regulated &&
    (!context.professionalLicenseStatus ||
      !context.professionalLicenseExpiresOn ||
      effectiveLicenseStatus(
        context.professionalLicenseStatus,
        context.professionalLicenseExpiresOn,
        now,
      ) !== 'verified')
  )
    return { allowed: false, reason: 'professional-license-invalid' };
  if (context.patientRelationshipRequired && !context.patientRelationshipSatisfied)
    return { allowed: false, reason: 'patient-relationship-missing' };
  return { allowed: true, reason: 'allowed' };
}
export function independentActors(input: {
  proposerId: string;
  deciderId: string;
  targetId: string;
}): boolean {
  return (
    input.proposerId !== input.deciderId &&
    input.proposerId !== input.targetId &&
    input.deciderId !== input.targetId
  );
}
