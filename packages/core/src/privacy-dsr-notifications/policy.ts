import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  DeliveryFailureKind,
  DsrAccessAction,
  DsrAuthorizationContext,
  DsrAuthorizationReason,
  DsrDecision,
  DsrScope,
  DsrStatus,
  NotificationProjectionInput,
  NotificationTemplateRelease,
} from './types.js';

const transitions: Readonly<Record<DsrStatus, readonly DsrStatus[]>> = {
  submitted: ['identity_verification_required', 'under_review', 'cancelled'],
  identity_verification_required: ['under_review'],
  under_review: ['approved', 'partially_approved', 'refused'],
  approved: ['fulfilled'],
  partially_approved: ['fulfilled'],
  refused: [],
  fulfilled: [],
  cancelled: [],
};

export const SYNTHETIC_DSR_DUE_DAYS = 17;
export const EXPORT_CAPABILITY_TTL_MS = 5 * 60 * 1000;
export const CALLBACK_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const RETRY_JITTER_RATIO = 0.1;
export const notificationRetryDelaysMs = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export function canTransitionDsr(from: DsrStatus, to: DsrStatus): boolean {
  return transitions[from].includes(to);
}

export function dueAtForSyntheticDsr(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + SYNTHETIC_DSR_DUE_DAYS * 24 * 60 * 60 * 1000);
}

export function authorizeDsrAction(
  action: DsrAccessAction,
  context: DsrAuthorizationContext,
): { allowed: boolean; reason: DsrAuthorizationReason } {
  if (action.startsWith('subject.')) {
    if (context.actorPersonId === context.subjectPersonId && context.relation === 'self') {
      if (action === 'subject.download' && context.aal < 2)
        return { allowed: false, reason: 'aal2-required' };
      return { allowed: true, reason: 'allowed' };
    }
    if (
      context.relation !== 'guardianship' ||
      !context.relationshipActive ||
      context.relationshipSubjectPatientId !== context.subjectPatientId ||
      !context.relationshipPermissions.includes('consent.manage')
    )
      return { allowed: false, reason: 'relationship-denied' };
    if (action === 'subject.download' && context.aal < 2)
      return { allowed: false, reason: 'aal2-required' };
    return { allowed: true, reason: 'allowed' };
  }
  if (!context.dpoDesignationActive) return { allowed: false, reason: 'designation-required' };
  if (!context.dpoAssigned) return { allowed: false, reason: 'assignment-required' };
  if (context.aal < 2) return { allowed: false, reason: 'aal2-required' };
  if (context.purposeCode !== 'privacy.dsr.review')
    return { allowed: false, reason: 'purpose-required' };
  return { allowed: true, reason: 'allowed' };
}

export function validateDsrScope(scope: DsrScope): boolean {
  const categories = scope.dataCategoryCodes;
  if (categories.length < 1 || categories.length > 32) return false;
  if (new Set(categories).size !== categories.length) return false;
  if ((scope.recordReferenceCodes?.length ?? 0) > 50) return false;
  if ((scope.correctionCodes?.length ?? 0) > 20) return false;
  const code = /^[a-z][a-z0-9_.-]{1,63}$/;
  return categories.every((value) => code.test(value));
}

export function targetStatusForDecision(decision: DsrDecision): DsrStatus {
  if (decision === 'approve') return 'approved';
  if (decision === 'partially_approve') return 'partially_approved';
  return 'refused';
}

export function validateDsrDecision(input: {
  currentStatus: DsrStatus;
  decision: DsrDecision;
  reasonCode: string;
  evidenceObjectId?: string;
  includedScope?: DsrScope | null;
  excludedScope?: DsrScope | null;
}): { valid: boolean; reason?: string; targetStatus?: DsrStatus } {
  const targetStatus = targetStatusForDecision(input.decision);
  if (!canTransitionDsr(input.currentStatus, targetStatus))
    return { valid: false, reason: 'dsr-transition-invalid' };
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(input.reasonCode) || !input.evidenceObjectId)
    return { valid: false, reason: 'dsr-decision-evidence-required' };
  if (input.decision === 'partially_approve') {
    if (!input.includedScope || !input.excludedScope)
      return { valid: false, reason: 'dsr-partial-scope-required' };
    if (!validateDsrScope(input.includedScope) || !validateDsrScope(input.excludedScope))
      return { valid: false, reason: 'dsr-scope-invalid' };
  }
  return { valid: true, targetStatus };
}

const prohibitedErasureActions = new Set(['hard_delete', 'automated_pseudonymize']);

export function validateDsrFulfilment(input: {
  currentStatus: DsrStatus;
  requestType: string;
  actionCodes: readonly string[];
  actionSummary: string;
  evidenceObjectId?: string;
  subjectNoticeCode: string;
  retentionPolicyApproved: boolean;
}): { valid: boolean; reason?: string } {
  if (!canTransitionDsr(input.currentStatus, 'fulfilled'))
    return { valid: false, reason: 'dsr-transition-invalid' };
  if (
    input.actionCodes.length === 0 ||
    !input.actionSummary.trim() ||
    !input.evidenceObjectId ||
    !/^[A-Z][A-Z0-9_]{2,63}$/.test(input.subjectNoticeCode)
  )
    return { valid: false, reason: 'dsr-fulfilment-evidence-required' };
  if (
    input.requestType === 'erasure_pseudonymization' &&
    !input.retentionPolicyApproved &&
    input.actionCodes.some((code) => prohibitedErasureActions.has(code))
  )
    return { valid: false, reason: 'retention-policy-unapproved' };
  return { valid: true };
}

const placeholderPattern = /\{\{([a-z][a-z0-9_]*)\}\}/g;

export function templatePlaceholders(body: string): string[] {
  return [...body.matchAll(placeholderPattern)].map((match) => match[1]!).toSorted();
}

export function canonicalTemplateDigest(input: {
  templateCode: string;
  channel: 'sms';
  arabicBody: string;
  englishBody: string;
  allowedRecipientTypes: readonly string[];
  allowedFields: Readonly<Record<string, string>>;
  requiredFields: readonly string[];
}): string {
  const canonical = JSON.stringify({
    template_code: input.templateCode,
    channel: input.channel,
    arabic_body: input.arabicBody,
    english_body: input.englishBody,
    allowed_recipient_types: [...input.allowedRecipientTypes].toSorted(),
    allowed_fields: Object.fromEntries(
      Object.entries(input.allowedFields).toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    required_fields: [...input.requiredFields].toSorted(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateTemplateRelease(release: NotificationTemplateRelease): {
  valid: boolean;
  reason?: string;
} {
  if (
    release.channel !== 'sms' ||
    release.allowedRecipientTypes.length !== 1 ||
    release.allowedRecipientTypes[0] !== 'patient'
  )
    return { valid: false, reason: 'notification-recipient-schema-invalid' };
  const arabic = templatePlaceholders(release.arabicBody);
  const english = templatePlaceholders(release.englishBody);
  if (JSON.stringify(arabic) !== JSON.stringify(english))
    return { valid: false, reason: 'notification-placeholder-mismatch' };
  const fields = Object.keys(release.allowedFields).toSorted();
  if (JSON.stringify(arabic) !== JSON.stringify(fields))
    return { valid: false, reason: 'notification-field-schema-invalid' };
  if (release.requiredFields.some((field) => !fields.includes(field)))
    return { valid: false, reason: 'notification-required-field-invalid' };
  const digest = canonicalTemplateDigest(release);
  if (digest !== release.contentDigest)
    return { valid: false, reason: 'notification-template-digest-mismatch' };
  return { valid: true };
}

export function canPublishTemplate(input: {
  release: NotificationTemplateRelease;
  publisherPersonId: string;
  aal: 1 | 2;
  purposeCode?: string;
  expectedVersion: number;
  approvalDigest: string;
}): { allowed: boolean; reason?: string } {
  if (input.release.status !== 'draft')
    return { allowed: false, reason: 'notification-release-not-draft' };
  if (input.release.createdByPersonId === input.publisherPersonId)
    return { allowed: false, reason: 'separation-of-duties' };
  if (input.aal < 2) return { allowed: false, reason: 'aal2-required' };
  if (input.purposeCode !== 'notification.template.publish')
    return { allowed: false, reason: 'purpose-required' };
  if (input.expectedVersion !== input.release.version)
    return { allowed: false, reason: 'version-conflict' };
  if (input.approvalDigest !== input.release.contentDigest)
    return { allowed: false, reason: 'notification-template-digest-mismatch' };
  const validity = validateTemplateRelease(input.release);
  return validity.valid
    ? { allowed: true }
    : { allowed: false, reason: validity.reason ?? 'notification-template-invalid' };
}

const notificationAllowedFields: Readonly<Record<string, readonly string[]>> = {
  DSR_SUBMITTED: [
    'due_date_label',
    'request_reference',
    'request_type_label',
    'submitted_date',
    'support_path',
  ],
  DSR_STATUS_CHANGED: ['request_reference', 'status_label', 'support_path', 'updated_date'],
  DSR_EXPORT_READY: ['privacy_requests_path', 'ready_until_label', 'request_reference'],
  DSR_IDENTITY_REQUIRED: ['request_reference', 'support_path', 'verification_path'],
};

const forbiddenNotificationFields = new Set([
  'diagnosis',
  'health_data',
  'identity',
  'national_id',
  'raw_contact',
  'phone',
  'email',
  'token',
  'download_url',
  'export_body',
  'decision_reason',
  'message_body',
  'secret',
]);

export function projectDsrNotification(
  input: NotificationProjectionInput,
): { allowed: true; payload: Record<string, string> } | { allowed: false; reason: string } {
  if (input.recipientType !== 'patient')
    return { allowed: false, reason: 'notification-recipient-denied' };
  const allowed = notificationAllowedFields[input.templateCode];
  if (!allowed) return { allowed: false, reason: 'notification-template-unknown' };
  const keys = Object.keys(input.fields).toSorted();
  if (keys.some((key) => forbiddenNotificationFields.has(key) || !allowed.includes(key)))
    return { allowed: false, reason: 'notification-field-denied' };
  if (keys.length !== allowed.length || allowed.some((key) => !keys.includes(key)))
    return { allowed: false, reason: 'notification-field-schema-invalid' };
  if (Object.values(input.fields).some((value) => typeof value !== 'string'))
    return { allowed: false, reason: 'notification-field-type-invalid' };
  return {
    allowed: true,
    payload: {
      source_event_id: input.sourceEventId,
      recipient_person_id: input.recipientPersonId,
      recipient_type: input.recipientType,
      locale: input.locale,
      template_code: input.templateCode,
      ...Object.fromEntries(Object.entries(input.fields) as [string, string][]),
    },
  };
}

export function retryDecision(
  failure: DeliveryFailureKind,
  attemptNumber: number,
  jitterUnit = 0,
): { state: 'retry'; delayMs: number } | { state: 'dead_letter' } {
  if (['permanent', 'schema', 'auth'].includes(failure)) return { state: 'dead_letter' };
  const base = notificationRetryDelaysMs[attemptNumber - 1];
  if (base === undefined) return { state: 'dead_letter' };
  const bounded = Math.max(-1, Math.min(1, jitterUnit));
  return { state: 'retry', delayMs: Math.round(base * (1 + bounded * RETRY_JITTER_RATIO)) };
}

export function signProviderCallback(
  canonicalBody: string,
  timestamp: string,
  secret: string,
): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${canonicalBody}`).digest('hex')}`;
}

export function verifyProviderCallback(input: {
  canonicalBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  now: Date;
}): boolean {
  const signedAt = Date.parse(input.timestamp);
  if (
    !Number.isFinite(signedAt) ||
    Math.abs(input.now.getTime() - signedAt) > CALLBACK_CLOCK_SKEW_MS
  )
    return false;
  const expected = Buffer.from(
    signProviderCallback(input.canonicalBody, input.timestamp, input.secret),
  );
  const actual = Buffer.from(input.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function projectPrivacyAudit(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    'action',
    'actor_person_id',
    'patient_id',
    'request_id',
    'template_release_id',
    'notification_id',
    'event_id',
    'purpose_code',
    'outcome',
    'reason_code',
    'status',
    'version',
  ]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)));
}
