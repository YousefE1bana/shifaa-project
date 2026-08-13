import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  EmergencyAlertInput,
  EmergencyContactStatus,
  FamilyAuthorizationContext,
  FamilyAuthorizationReason,
  FamilyPermissionCode,
  RelationshipStatus,
  RelationshipType,
} from './types.js';

const relationshipTransitions: Record<
  RelationshipType,
  Record<RelationshipStatus, readonly RelationshipStatus[]>
> = {
  self: {
    pending: [],
    active: [],
    suspended: [],
    rejected: [],
    revoked: [],
    expired: [],
  },
  guardianship: {
    pending: ['active', 'rejected', 'expired'],
    active: ['revoked', 'expired'],
    suspended: [],
    rejected: [],
    revoked: [],
    expired: [],
  },
  delegation: {
    pending: ['active', 'revoked', 'expired'],
    active: ['revoked', 'expired'],
    suspended: [],
    rejected: [],
    revoked: [],
    expired: [],
  },
};

const contactTransitions: Record<EmergencyContactStatus, readonly EmergencyContactStatus[]> = {
  pending: ['confirmed', 'declined', 'revoked', 'expired'],
  confirmed: ['revoked'],
  declined: [],
  revoked: [],
  expired: [],
};

export const canTransitionRelationship = (
  type: RelationshipType,
  from: RelationshipStatus,
  to: RelationshipStatus,
) => relationshipTransitions[type][from].includes(to);

export const canTransitionEmergencyContact = (
  from: EmergencyContactStatus,
  to: EmergencyContactStatus,
) => contactTransitions[from].includes(to);

export function validatePermissionSet(
  type: RelationshipType,
  permissions: readonly FamilyPermissionCode[],
): boolean {
  if (new Set(permissions).size !== permissions.length) return false;
  if (type === 'self') return permissions.length === 0;
  if (type === 'delegation' && permissions.includes('consent.manage')) return false;
  return permissions.length > 0;
}

export function authorizeFamilyAction(context: FamilyAuthorizationContext): {
  allowed: boolean;
  reason: FamilyAuthorizationReason;
} {
  if (!context.contextConfirmed) return { allowed: false, reason: 'context-unconfirmed' };
  if (context.selectedPatientId !== context.requestedPatientId)
    return { allowed: false, reason: 'patient-context-mismatch' };
  const relationship = context.relationship;
  if (!relationship || relationship.subjectPatientId !== context.requestedPatientId)
    return { allowed: false, reason: 'relationship-missing' };
  if (relationship.actorPersonId !== context.authenticatedPersonId)
    return { allowed: false, reason: 'actor-mismatch' };
  if (relationship.status !== 'active') return { allowed: false, reason: 'relationship-inactive' };
  if (new Date(relationship.validFrom) > context.now)
    return { allowed: false, reason: 'relationship-not-yet-valid' };
  if (relationship.validUntil && new Date(relationship.validUntil) <= context.now)
    return { allowed: false, reason: 'relationship-expired' };
  if (relationship.purposeCode && relationship.purposeCode !== context.purposeCode)
    return { allowed: false, reason: 'purpose-mismatch' };
  if (
    relationship.relationshipType !== 'self' &&
    !relationship.permissions.includes(context.requestedPermission)
  )
    return { allowed: false, reason: 'permission-missing' };
  if (context.minimumAal && context.aal < context.minimumAal)
    return { allowed: false, reason: 'aal-insufficient' };
  return { allowed: true, reason: 'allowed' };
}

export function hashInvitationToken(token: string, secret: string): Uint8Array {
  return createHmac('sha256', secret).update(token, 'utf8').digest();
}

export function invitationTokenMatches(
  token: string,
  expected: Uint8Array,
  secret: string,
): boolean {
  const actual = hashInvitationToken(token, secret);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

const forbiddenAlertFields = new Set([
  'diagnosis',
  'diagnoses',
  'medication',
  'medications',
  'lab',
  'labs',
  'admission',
  'record',
  'record_link',
  'relationship',
  'evidence',
  'token',
  'identity',
]);

export function projectEmergencyAlert(input: EmergencyAlertInput):
  | { allowed: true; payload: Record<string, string> }
  | {
      allowed: false;
      reason:
        | 'wrong-source'
        | 'incident-inactive'
        | 'contact-inactive'
        | 'forbidden-field'
        | 'location-unavailable';
    } {
  if (input.sourceEventType !== 'sos.emergency_contact.requested')
    return { allowed: false, reason: 'wrong-source' };
  if (!input.incidentActive || !input.incidentQualifying)
    return { allowed: false, reason: 'incident-inactive' };
  if (input.contactStatus !== 'confirmed') return { allowed: false, reason: 'contact-inactive' };
  if (
    Object.keys(input.extraFields ?? {}).some(
      (field) => forbiddenAlertFields.has(field) || !['request_id'].includes(field),
    )
  )
    return { allowed: false, reason: 'forbidden-field' };
  const payload: Record<string, string> = {
    patient_display_name: input.patientDisplayName,
    message_code: 'needs_urgent_help',
    incident_time: input.incidentTime,
    callback_number: input.callbackNumber,
  };
  if (input.locationPrecision === 'coarse') {
    if (!input.location?.coarse) return { allowed: false, reason: 'location-unavailable' };
    payload['location'] = input.location.coarse;
    payload['location_precision'] = 'coarse';
  }
  if (input.locationPrecision === 'exact') {
    if (!input.location?.exact) return { allowed: false, reason: 'location-unavailable' };
    payload['location'] = input.location.exact;
    payload['location_precision'] = 'exact';
  }
  return { allowed: true, payload };
}

export function projectFamilyAudit(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    'action',
    'actor_person_id',
    'subject_patient_id',
    'relationship_id',
    'contact_id',
    'permission_code',
    'purpose_code',
    'outcome',
    'request_id',
    'version',
    'status',
  ]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)));
}
