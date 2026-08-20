export const dsrTypes = [
  'access_export',
  'correction',
  'restriction',
  'erasure_pseudonymization',
] as const;
export type DsrType = (typeof dsrTypes)[number];

export const dsrStatuses = [
  'submitted',
  'identity_verification_required',
  'under_review',
  'approved',
  'partially_approved',
  'refused',
  'fulfilled',
  'cancelled',
] as const;
export type DsrStatus = (typeof dsrStatuses)[number];
export type DsrDecision = 'approve' | 'partially_approve' | 'refuse';

export interface DsrScope {
  dataCategoryCodes: readonly string[];
  recordReferenceCodes?: readonly string[];
  correctionCodes?: readonly string[];
}

export interface DsrRequest {
  id: string;
  patientId: string;
  submittedByPersonId: string;
  requestType: DsrType;
  scope: DsrScope;
  status: DsrStatus;
  identityVerificationRequired: boolean;
  identityVerifiedAt?: string | null;
  submittedAt: string;
  dueAt: string;
  version: number;
}

export interface DsrAuthorizationContext {
  actorPersonId: string;
  subjectPersonId: string;
  subjectPatientId: string;
  relation: 'self' | 'guardianship' | 'delegation' | 'facility' | 'none';
  relationshipSubjectPatientId?: string;
  relationshipActive: boolean;
  relationshipPermissions: readonly string[];
  dpoDesignationActive: boolean;
  dpoAssigned: boolean;
  aal: 1 | 2;
  purposeCode?: string;
}

export type DsrAccessAction =
  | 'subject.read'
  | 'subject.create'
  | 'subject.download'
  | 'dpo.read'
  | 'dpo.decide'
  | 'dpo.fulfil';
export type DsrAuthorizationReason =
  | 'allowed'
  | 'subject-mismatch'
  | 'relationship-denied'
  | 'designation-required'
  | 'assignment-required'
  | 'aal2-required'
  | 'purpose-required';

export interface NotificationTemplateRelease {
  id: string;
  templateCode: string;
  releaseVersion: number;
  channel: 'sms';
  arabicBody: string;
  englishBody: string;
  allowedRecipientTypes: readonly NotificationRecipientType[];
  allowedFields: Readonly<Record<string, 'string' | 'date-time'>>;
  requiredFields: readonly string[];
  contentDigest: string;
  status: 'draft' | 'published' | 'retired';
  createdByPersonId: string;
  publishedByPersonId?: string | null;
  effectiveAt?: string | null;
  version: number;
}

export type NotificationRecipientType = 'patient';
export type DsrNotificationCode =
  | 'DSR_SUBMITTED'
  | 'DSR_STATUS_CHANGED'
  | 'DSR_EXPORT_READY'
  | 'DSR_IDENTITY_REQUIRED';

export interface NotificationProjectionInput {
  templateCode: DsrNotificationCode;
  recipientType: NotificationRecipientType;
  recipientPersonId: string;
  sourceEventId: string;
  locale: 'ar-EG' | 'en-EG';
  fields: Readonly<Record<string, unknown>>;
}

export type DeliveryFailureKind = 'transient' | 'timeout' | 'permanent' | 'schema' | 'auth';
