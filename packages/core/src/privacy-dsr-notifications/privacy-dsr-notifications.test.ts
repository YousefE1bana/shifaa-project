import { describe, expect, it } from 'vitest';
import {
  authorizeDsrAction,
  canPublishTemplate,
  canTransitionDsr,
  canonicalTemplateDigest,
  dueAtForSyntheticDsr,
  projectDsrNotification,
  projectPrivacyAudit,
  retryDecision,
  signProviderCallback,
  validateDsrDecision,
  validateDsrFulfilment,
  verifyProviderCallback,
  type DsrAuthorizationContext,
  type NotificationTemplateRelease,
} from './index.js';

const baseContext: DsrAuthorizationContext = {
  actorPersonId: 'patient-person',
  subjectPersonId: 'patient-person',
  subjectPatientId: 'subject-patient',
  relation: 'self',
  relationshipActive: false,
  relationshipPermissions: [],
  dpoDesignationActive: false,
  dpoAssigned: false,
  aal: 2,
};

function draftRelease(): NotificationTemplateRelease {
  const release = {
    id: 'release',
    templateCode: 'DSR_EXPORT_READY',
    releaseVersion: 1,
    channel: 'sms' as const,
    arabicBody: '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
    englishBody: '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
    allowedRecipientTypes: ['patient'] as const,
    allowedFields: {
      privacy_requests_path: 'string' as const,
      ready_until_label: 'string' as const,
      request_reference: 'string' as const,
    },
    requiredFields: ['privacy_requests_path', 'ready_until_label', 'request_reference'],
    status: 'draft' as const,
    createdByPersonId: 'author',
    version: 1,
  };
  return { ...release, contentDigest: canonicalTemplateDigest(release) };
}

describe('privacy DSR and notification policy', () => {
  it('keeps terminal DSR states closed and freezes the synthetic due rule', () => {
    expect(canTransitionDsr('submitted', 'under_review')).toBe(true);
    for (const terminal of ['refused', 'fulfilled', 'cancelled'] as const)
      expect(canTransitionDsr(terminal, 'under_review')).toBe(false);
    expect(dueAtForSyntheticDsr(new Date('2026-08-13T08:00:00.000Z')).toISOString()).toBe(
      '2026-08-30T08:00:00.000Z',
    );
  });

  it('allows only self or a current consent-managing guardian on subject routes', () => {
    expect(authorizeDsrAction('subject.create', baseContext).allowed).toBe(true);
    const guardian = {
      ...baseContext,
      actorPersonId: 'guardian',
      relation: 'guardianship' as const,
      relationshipActive: true,
      relationshipSubjectPatientId: baseContext.subjectPatientId,
      relationshipPermissions: ['consent.manage'],
    };
    expect(authorizeDsrAction('subject.create', guardian).allowed).toBe(true);
    expect(
      authorizeDsrAction('subject.create', {
        ...guardian,
        relationshipSubjectPatientId: 'other-patient',
      }).allowed,
    ).toBe(false);
    for (const relation of ['delegation', 'facility', 'none'] as const)
      expect(authorizeDsrAction('subject.read', { ...guardian, relation }).allowed).toBe(false);
    expect(authorizeDsrAction('subject.download', { ...baseContext, aal: 1 }).reason).toBe(
      'aal2-required',
    );
  });

  it('requires DPO designation, assignment, AAL2, and exact purpose', () => {
    const dpo = {
      ...baseContext,
      actorPersonId: 'dpo',
      relation: 'none' as const,
      dpoDesignationActive: true,
      dpoAssigned: true,
      purposeCode: 'privacy.dsr.review',
    };
    expect(authorizeDsrAction('dpo.decide', dpo).allowed).toBe(true);
    expect(authorizeDsrAction('dpo.read', { ...dpo, dpoDesignationActive: false }).reason).toBe(
      'designation-required',
    );
    expect(authorizeDsrAction('dpo.read', { ...dpo, dpoAssigned: false }).reason).toBe(
      'assignment-required',
    );
    expect(authorizeDsrAction('dpo.read', { ...dpo, aal: 1 }).reason).toBe('aal2-required');
    expect(authorizeDsrAction('dpo.read', { ...dpo, purposeCode: 'admin.general' }).reason).toBe(
      'purpose-required',
    );
  });

  it('requires valid transitions, reasons, evidence, and partial scopes', () => {
    expect(
      validateDsrDecision({
        currentStatus: 'under_review',
        decision: 'approve',
        reasonCode: 'request.valid',
        evidenceObjectId: 'evidence',
      }),
    ).toEqual({ valid: true, targetStatus: 'approved' });
    expect(
      validateDsrDecision({
        currentStatus: 'under_review',
        decision: 'partially_approve',
        reasonCode: 'scope.partial',
        evidenceObjectId: 'evidence',
      }).reason,
    ).toBe('dsr-partial-scope-required');
    expect(
      validateDsrDecision({
        currentStatus: 'fulfilled',
        decision: 'refuse',
        reasonCode: 'request.invalid',
        evidenceObjectId: 'evidence',
      }).reason,
    ).toBe('dsr-transition-invalid');
  });

  it('blocks guessed erasure automation while allowing evidenced review fulfilment', () => {
    const input = {
      currentStatus: 'approved' as const,
      requestType: 'erasure_pseudonymization',
      actionCodes: ['hard_delete'],
      actionSummary: 'Synthetic review',
      evidenceObjectId: 'evidence',
      subjectNoticeCode: 'DSR_STATUS_CHANGED',
      retentionPolicyApproved: false,
    };
    expect(validateDsrFulfilment(input).reason).toBe('retention-policy-unapproved');
    expect(validateDsrFulfilment({ ...input, actionCodes: ['review_recorded'] }).valid).toBe(true);
  });

  it('enforces independent AAL2 publication against the reviewed digest', () => {
    const release = draftRelease();
    expect(
      canPublishTemplate({
        release,
        publisherPersonId: 'publisher',
        aal: 2,
        purposeCode: 'notification.template.publish',
        expectedVersion: 1,
        approvalDigest: release.contentDigest,
      }).allowed,
    ).toBe(true);
    expect(
      canPublishTemplate({
        release,
        publisherPersonId: 'author',
        aal: 2,
        purposeCode: 'notification.template.publish',
        expectedVersion: 1,
        approvalDigest: release.contentDigest,
      }).reason,
    ).toBe('separation-of-duties');
  });

  it('projects an exact minimum notification schema and rejects PHI fields', () => {
    const valid = projectDsrNotification({
      templateCode: 'DSR_EXPORT_READY',
      recipientType: 'patient',
      recipientPersonId: 'patient',
      sourceEventId: 'event',
      locale: 'ar-EG',
      fields: {
        privacy_requests_path: '/privacy/requests',
        ready_until_label: 'five minutes',
        request_reference: 'DSR-005',
      },
    });
    expect(valid.allowed).toBe(true);
    const denied = projectDsrNotification({
      templateCode: 'DSR_EXPORT_READY',
      recipientType: 'patient',
      recipientPersonId: 'patient',
      sourceEventId: 'event',
      locale: 'en-EG',
      fields: {
        privacy_requests_path: '/privacy/requests',
        ready_until_label: 'five minutes',
        request_reference: 'DSR-005',
        diagnosis: 'SYNTHETIC-DIAGNOSIS-MUST-NOT-ESCAPE',
      },
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.reason).toBe('notification-field-denied');
  });

  it('uses bounded retry, dead-letter, and signed callback rules', () => {
    expect(retryDecision('transient', 1, -1)).toEqual({ state: 'retry', delayMs: 54_000 });
    expect(retryDecision('timeout', 5, 1)).toEqual({ state: 'retry', delayMs: 47_520_000 });
    expect(retryDecision('transient', 6)).toEqual({ state: 'dead_letter' });
    expect(retryDecision('auth', 1)).toEqual({ state: 'dead_letter' });
    const timestamp = '2026-08-13T09:00:00.000Z';
    const signature = signProviderCallback('{"receipt":"synthetic"}', timestamp, 'secret');
    expect(
      verifyProviderCallback({
        canonicalBody: '{"receipt":"synthetic"}',
        timestamp,
        signature,
        secret: 'secret',
        now: new Date('2026-08-13T09:04:59.000Z'),
      }),
    ).toBe(true);
    expect(
      verifyProviderCallback({
        canonicalBody: '{"receipt":"synthetic"}',
        timestamp,
        signature,
        secret: 'secret',
        now: new Date('2026-08-13T09:05:01.000Z'),
      }),
    ).toBe(false);
  });

  it('drops secrets, raw contacts, and bodies from audit projection', () => {
    expect(
      projectPrivacyAudit({
        action: 'dsr.created',
        actor_person_id: 'actor',
        patient_id: 'patient',
        request_id: 'request',
        outcome: 'allowed',
        raw_contact: '+999',
        token: 'secret',
        template_body: 'private',
      }),
    ).toEqual({
      action: 'dsr.created',
      actor_person_id: 'actor',
      patient_id: 'patient',
      request_id: 'request',
      outcome: 'allowed',
    });
  });
});
