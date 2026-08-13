export const relationshipTypes = ['self', 'guardianship', 'delegation'] as const;
export type RelationshipType = (typeof relationshipTypes)[number];
export const relationshipStatuses = [
  'pending',
  'active',
  'suspended',
  'rejected',
  'revoked',
  'expired',
] as const;
export type RelationshipStatus = (typeof relationshipStatuses)[number];
export const familyPermissionCodes = [
  'profile.view',
  'appointment.manage',
  'record.view',
  'medication.manage',
  'sos.activate',
  'sos.share',
  'complaint.create',
  'symptom_routing.use',
  'consent.manage',
] as const;
export type FamilyPermissionCode = (typeof familyPermissionCodes)[number];
export type DelegablePermissionCode = Exclude<FamilyPermissionCode, 'consent.manage'>;
export const emergencyContactStatuses = [
  'pending',
  'confirmed',
  'declined',
  'revoked',
  'expired',
] as const;
export type EmergencyContactStatus = (typeof emergencyContactStatuses)[number];
export type LocationPrecision = 'none' | 'coarse' | 'exact';

export interface FamilyRelationship {
  id: string;
  subjectPatientId: string;
  actorPersonId: string;
  relationshipType: RelationshipType;
  status: RelationshipStatus;
  purposeCode?: string;
  permissions: readonly FamilyPermissionCode[];
  validFrom: string;
  validUntil?: string | null;
  version: number;
}

export interface FamilyAuthorizationContext {
  authenticatedPersonId: string;
  requestedPatientId: string;
  selectedPatientId?: string;
  contextConfirmed: boolean;
  requestedPermission: FamilyPermissionCode;
  purposeCode: string;
  relationship?: FamilyRelationship;
  aal: 1 | 2;
  minimumAal?: 1 | 2;
  now: Date;
}

export type FamilyAuthorizationReason =
  | 'allowed'
  | 'context-unconfirmed'
  | 'patient-context-mismatch'
  | 'relationship-missing'
  | 'actor-mismatch'
  | 'relationship-inactive'
  | 'relationship-not-yet-valid'
  | 'relationship-expired'
  | 'purpose-mismatch'
  | 'permission-missing'
  | 'aal-insufficient';

export interface EmergencyAlertInput {
  sourceEventType: string;
  incidentActive: boolean;
  incidentQualifying: boolean;
  contactStatus: EmergencyContactStatus;
  patientDisplayName: string;
  incidentTime: string;
  callbackNumber: string;
  locationPrecision: LocationPrecision;
  location?: { coarse?: string; exact?: string };
  extraFields?: Record<string, unknown>;
}
