export const facilityTypes = ['clinic', 'pharmacy', 'hospital', 'laboratory'] as const;
export type FacilityType = (typeof facilityTypes)[number];
export type FacilityStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'suspended'
  | 'rejected'
  | 'closed';
export type LicenseStatus = 'pending' | 'verified' | 'rejected' | 'suspended' | 'expired';
export const adminRoles = [
  'super_admin',
  'support_admin',
  'medical_reviewer',
  'facility_approver',
  'finance_reviewer',
] as const;
export type AdminRole = (typeof adminRoles)[number];
export type EvidenceStatus = 'quarantined' | 'released' | 'rejected';
export interface AuthorizationContext {
  personId: string;
  facilityId?: string;
  requestedFacilityId?: string;
  requestedFacilityType?: FacilityType;
  actualFacilityType?: FacilityType;
  action: string;
  permissions: readonly string[];
  membershipStatus?: 'invited' | 'active' | 'suspended' | 'ended' | 'expired' | 'rejected';
  professionalLicenseStatus?: LicenseStatus;
  professionalLicenseExpiresOn?: string;
  regulated?: boolean;
  aal: 1 | 2;
  purpose?: string;
  requiredPurpose?: string;
  patientRelationshipSatisfied?: boolean;
  patientRelationshipRequired?: boolean;
}
export interface AuthorizationDecision {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'facility-mismatch'
    | 'application-mismatch'
    | 'membership-inactive'
    | 'permission-missing'
    | 'aal-insufficient'
    | 'purpose-missing'
    | 'professional-license-invalid'
    | 'patient-relationship-missing';
}
