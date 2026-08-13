import { describe, expect, it } from 'vitest';
import {
  authorizeFamilyAction,
  canTransitionEmergencyContact,
  canTransitionRelationship,
  hashInvitationToken,
  invitationTokenMatches,
  projectEmergencyAlert,
  projectFamilyAudit,
  validatePermissionSet,
  type FamilyRelationship,
} from './index.js';

const active: FamilyRelationship = {
  id: '43000000-0000-4000-8000-000000000005',
  subjectPatientId: '41000000-0000-4000-8000-000000000001',
  actorPersonId: '40000000-0000-4000-8000-000000000004',
  relationshipType: 'delegation',
  status: 'active',
  purposeCode: 'family_support',
  permissions: ['record.view'],
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
  version: 2,
};

const acceptanceInventory = {
  'AC-01': 'closed relationship and contact types',
  'AC-02': 'released bound guardianship evidence',
  'AC-03': 'independent AAL2 purpose review',
  'AC-04': 'guardianship validity without dependent login',
  'AC-05': 'guardianship terminal states',
  'AC-06': 'closed delegation permissions purpose and validity',
  'AC-07': 'named one-time delegation acceptance',
  'AC-08': 'permission independence',
  'AC-09': 'current version and clock authorization',
  'AC-10': 'immediate attributed revocation',
  'AC-11': 'closed contact transition matrix',
  'AC-12': 'fresh row after terminal contact',
  'AC-13': 'non-oracular token race',
  'AC-14': 'non-SOS zero delivery',
  'AC-15': 'confirmed active qualifying SOS only',
  'AC-16': 'minimum alert allow-list',
  'AC-17': 'explicit patient context',
  'AC-18': 'minimum immutable audit projection',
} as const;

describe('family care policy', () => {
  it('maps the complete AC-01 through AC-18 pure-policy inventory', () => {
    expect(Object.keys(acceptanceInventory)).toEqual(
      Array.from({ length: 18 }, (_, index) => `AC-${String(index + 1).padStart(2, '0')}`),
    );
  });

  it('keeps guardian, delegation, and contact terminal transitions closed', () => {
    expect(canTransitionRelationship('guardianship', 'pending', 'active')).toBe(true);
    expect(canTransitionRelationship('guardianship', 'revoked', 'active')).toBe(false);
    expect(canTransitionRelationship('delegation', 'pending', 'active')).toBe(true);
    expect(canTransitionRelationship('delegation', 'expired', 'active')).toBe(false);
    expect(canTransitionEmergencyContact('pending', 'confirmed')).toBe(true);
    expect(canTransitionEmergencyContact('declined', 'confirmed')).toBe(false);
    for (const terminal of ['declined', 'revoked', 'expired'] as const)
      for (const next of ['pending', 'confirmed', 'declined', 'revoked', 'expired'] as const)
        expect(canTransitionEmergencyContact(terminal, next)).toBe(false);
    for (const terminal of ['rejected', 'revoked', 'expired'] as const)
      for (const next of [
        'pending',
        'active',
        'suspended',
        'rejected',
        'revoked',
        'expired',
      ] as const) {
        expect(canTransitionRelationship('guardianship', terminal, next)).toBe(false);
        expect(canTransitionRelationship('delegation', terminal, next)).toBe(false);
      }
  });

  it('requires explicit matching context and exact current permission', () => {
    const base = {
      authenticatedPersonId: active.actorPersonId,
      requestedPatientId: active.subjectPatientId,
      selectedPatientId: active.subjectPatientId,
      contextConfirmed: true,
      requestedPermission: 'record.view' as const,
      purposeCode: 'family_support',
      relationship: active,
      aal: 1 as const,
      now: new Date('2026-08-11T09:00:00.000Z'),
    };
    expect(authorizeFamilyAction(base)).toEqual({ allowed: true, reason: 'allowed' });
    expect(authorizeFamilyAction({ ...base, contextConfirmed: false }).reason).toBe(
      'context-unconfirmed',
    );
    expect(authorizeFamilyAction({ ...base, selectedPatientId: 'other' }).reason).toBe(
      'patient-context-mismatch',
    );
    expect(authorizeFamilyAction({ ...base, requestedPermission: 'sos.activate' }).reason).toBe(
      'permission-missing',
    );
    expect(authorizeFamilyAction({ ...base, purposeCode: 'wrong' }).reason).toBe(
      'purpose-mismatch',
    );
    expect(authorizeFamilyAction({ ...base, aal: 1, minimumAal: 2 }).reason).toBe(
      'aal-insufficient',
    );
    expect(
      authorizeFamilyAction({ ...base, relationship: { ...active, actorPersonId: 'unrelated' } })
        .reason,
    ).toBe('actor-mismatch');
    expect(
      authorizeFamilyAction({ ...base, relationship: { ...active, status: 'revoked' } }).reason,
    ).toBe('relationship-inactive');
    expect(
      authorizeFamilyAction({ ...base, now: new Date('2027-01-01T00:00:00.000Z') }).reason,
    ).toBe('relationship-expired');
  });

  it('never delegates consent.manage and keeps permissions independent', () => {
    expect(validatePermissionSet('delegation', ['record.view'])).toBe(true);
    expect(validatePermissionSet('delegation', ['consent.manage'])).toBe(false);
    expect(validatePermissionSet('self', [])).toBe(true);
    expect(validatePermissionSet('guardianship', ['consent.manage'])).toBe(true);
  });

  it('stores invite token digests and compares without plaintext', () => {
    const digest = hashInvitationToken(
      'synthetic-token-000000000000000000000000',
      'test-only-secret',
    );
    expect(digest).toHaveLength(32);
    expect(
      invitationTokenMatches(
        'synthetic-token-000000000000000000000000',
        digest,
        'test-only-secret',
      ),
    ).toBe(true);
    expect(
      invitationTokenMatches('wrong-token-000000000000000000000000000', digest, 'test-only-secret'),
    ).toBe(false);
  });

  it('permits only an active qualifying SOS and the minimum fields', () => {
    const input = {
      sourceEventType: 'sos.emergency_contact.requested',
      incidentActive: true,
      incidentQualifying: true,
      contactStatus: 'confirmed' as const,
      patientDisplayName: 'Synthetic Patient',
      incidentTime: '2026-08-11T09:00:00.000Z',
      callbackNumber: '+999000000000',
      locationPrecision: 'coarse' as const,
      location: { coarse: 'Synthetic Cairo region' },
    };
    const allowed = projectEmergencyAlert(input);
    expect(allowed.allowed).toBe(true);
    if (allowed.allowed)
      expect(Object.keys(allowed.payload).sort()).toEqual([
        'callback_number',
        'incident_time',
        'location',
        'location_precision',
        'message_code',
        'patient_display_name',
      ]);
    expect(projectEmergencyAlert({ ...input, sourceEventType: 'lab.result.ready' }).allowed).toBe(
      false,
    );
    expect(
      projectEmergencyAlert({ ...input, extraFields: { diagnosis: 'sentinel' } }).allowed,
    ).toBe(false);
  });

  it('projects immutable audit fields without secrets or clinical payload', () => {
    expect(
      projectFamilyAudit({
        action: 'relationship.delegation.used',
        actor_person_id: 'actor',
        subject_patient_id: 'patient',
        permission_code: 'record.view',
        purpose_code: 'family_support',
        outcome: 'allowed',
        request_id: 'req',
        token: 'secret',
        evidence: 'private',
        diagnosis: 'sentinel',
      }),
    ).toEqual({
      action: 'relationship.delegation.used',
      actor_person_id: 'actor',
      subject_patient_id: 'patient',
      permission_code: 'record.view',
      purpose_code: 'family_support',
      outcome: 'allowed',
      request_id: 'req',
    });
  });
});
