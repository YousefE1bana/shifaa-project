import { createHash, randomUUID } from 'node:crypto';

import type {
  CreateDsrInput,
  CreateNotificationTemplateReleaseInput,
  DsrDecisionInput,
  DsrFulfilmentInput,
  PublishNotificationTemplateReleaseInput,
  ReplayDeadLetterInput,
  SmsProviderCallbackInput,
} from '@shifaa/contracts/privacy-dsr-notifications';
import {
  canPublishTemplate,
  canonicalTemplateDigest,
  dueAtForSyntheticDsr,
  signProviderCallback,
  validateDsrDecision,
  validateDsrFulfilment,
  verifyProviderCallback,
  type DsrStatus,
  type NotificationTemplateRelease,
} from '@shifaa/core/privacy-dsr-notifications';

import { ApiPolicyError } from '../identity-onboarding/errors.js';

export interface PrivacyActor {
  personId: string;
  principal: string;
  requestId: string;
  role: 'patient' | 'dpo' | 'support_admin' | 'platform_operator';
  aal: 1 | 2;
  purpose?: string;
  selectedPatientId?: string;
}
export interface PrivacyPageQuery {
  managed_patient_id?: string;
  type?: string;
  status?: string;
  due_before?: string;
  code?: string;
  locale?: string;
  channel?: string;
  cursor?: string;
  limit?: number;
}
type Event = {
  id: string;
  event_type: string;
  from_status: DsrStatus | null;
  to_status: DsrStatus;
  reason_code: string | null;
  aggregate_version: number;
  occurred_at: string;
};
type RequestRecord = {
  id: string;
  person_id: string;
  patient_id: string;
  submitted_by_person_id: string;
  request_type: CreateDsrInput['request_type'];
  scope: CreateDsrInput['scope'];
  contact_preference: CreateDsrInput['contact_preference'];
  status: DsrStatus;
  identity_verification_required: boolean;
  identity_verified_at: string | null;
  submitted_at: string;
  due_at: string;
  due_policy_label: 'synthetic_non_statutory';
  decision_code: string | null;
  included_scope: CreateDsrInput['scope'] | null;
  excluded_scope: CreateDsrInput['scope'] | null;
  fulfilment_action_codes: string[];
  evidence_object_id: string | null;
  released_at: string | null;
  version: number;
  events: Event[];
};
type ExportCapability = {
  requestId: string;
  recipientPersonId: string;
  tokenDigest: string;
  expiresAt: string;
  usedAt: string | null;
  body: Uint8Array;
};
type Delivery = {
  id: string;
  status: 'pending' | 'delivered' | 'dead_letter';
  version: number;
  visibleCount: number;
};

const ids = {
  patientPerson: '50000000-0000-4000-8000-000000000001',
  guardian: '50000000-0000-4000-8000-000000000002',
  patient: '51000000-0000-4000-8000-000000000001',
  dpo: '50000000-0000-4000-8000-000000000006',
  templateAuthor: '50000000-0000-4000-8000-000000000008',
  templatePublisher: '50000000-0000-4000-8000-000000000009',
  operator: '50000000-0000-4000-8000-000000000010',
} as const;

export class PrivacyDsrNotificationService {
  public readonly requests = new Map<string, RequestRecord>();
  public readonly templates = new Map<string, NotificationTemplateRelease>();
  public readonly deliveries = new Map<string, Delivery>();
  public readonly audit: Record<string, unknown>[] = [];
  public readonly outbox: Record<string, unknown>[] = [];
  public readonly callbackReceipts = new Set<string>();
  private readonly exports = new Map<string, ExportCapability>();
  private readonly assignedRequestIds = new Set([
    '52000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000003',
  ]);

  public constructor(
    private readonly now = () => new Date(),
    private readonly callbackSecret = 'synthetic-005-callback-secret-not-production',
  ) {
    const submittedAt = new Date('2026-08-13T08:00:00.000Z');
    const request: RequestRecord = {
      id: '52000000-0000-4000-8000-000000000001',
      person_id: ids.patientPerson,
      patient_id: ids.patient,
      submitted_by_person_id: ids.patientPerson,
      request_type: 'access_export',
      scope: { data_category_codes: ['profile.demographics'] },
      contact_preference: 'in_app',
      status: 'under_review',
      identity_verification_required: false,
      identity_verified_at: null,
      submitted_at: submittedAt.toISOString(),
      due_at: dueAtForSyntheticDsr(submittedAt).toISOString(),
      due_policy_label: 'synthetic_non_statutory',
      decision_code: null,
      included_scope: null,
      excluded_scope: null,
      fulfilment_action_codes: [],
      evidence_object_id: null,
      released_at: null,
      version: 2,
      events: [
        {
          id: '55000000-0000-4000-8000-000000000001',
          event_type: 'submitted',
          from_status: null,
          to_status: 'submitted',
          reason_code: null,
          aggregate_version: 1,
          occurred_at: submittedAt.toISOString(),
        },
        {
          id: '55000000-0000-4000-8000-000000000002',
          event_type: 'under_review',
          from_status: 'submitted',
          to_status: 'under_review',
          reason_code: 'synthetic.assigned',
          aggregate_version: 2,
          occurred_at: '2026-08-13T08:05:00.000Z',
        },
      ],
    };
    this.requests.set(request.id, request);
    this.requests.set('52000000-0000-4000-8000-000000000002', {
      ...structuredClone(request),
      id: '52000000-0000-4000-8000-000000000002',
      request_type: 'correction',
      scope: { data_category_codes: ['identity.proof'] },
      status: 'identity_verification_required',
      identity_verification_required: true,
      version: 2,
      events: [
        {
          id: '55000000-0000-4000-8000-000000000005',
          event_type: 'identity_verification_required',
          from_status: null,
          to_status: 'identity_verification_required',
          reason_code: 'identity.verification_required',
          aggregate_version: 1,
          occurred_at: submittedAt.toISOString(),
        },
      ],
    });
    this.requests.set('52000000-0000-4000-8000-000000000003', {
      ...structuredClone(request),
      id: '52000000-0000-4000-8000-000000000003',
      request_type: 'erasure_pseudonymization',
      status: 'approved',
      decision_code: 'approve',
      version: 3,
      events: structuredClone(request.events),
    });
    this.deliveries.set('55000000-0000-4000-8000-000000000004', {
      id: '55000000-0000-4000-8000-000000000004',
      status: 'dead_letter',
      version: 1,
      visibleCount: 0,
    });
    this.deliveries.set('55000000-0000-4000-8000-000000000003', {
      id: '55000000-0000-4000-8000-000000000003',
      status: 'pending',
      version: 1,
      visibleCount: 0,
    });
  }

  private deny(code: string, status = 403): never {
    throw new ApiPolicyError(code, status, code);
  }
  private subjectPatient(actor: PrivacyActor, requested?: string) {
    const patientId = requested ?? actor.selectedPatientId ?? ids.patient;
    const self = actor.personId === ids.patientPerson && patientId === ids.patient;
    const guardian = actor.personId === ids.guardian && patientId === ids.patient;
    if (!self && !guardian) this.deny('permission-denied');
    return patientId;
  }
  private subjectRecord(actor: PrivacyActor, requestId: string) {
    const record = this.requests.get(requestId);
    if (!record) this.deny('not-found', 404);
    this.subjectPatient(actor, record.patient_id);
    return record;
  }
  private dpo(actor: PrivacyActor, requestId?: string) {
    if (actor.role !== 'dpo' || actor.personId !== ids.dpo) this.deny('dpo-designation-required');
    if (actor.aal < 2) this.deny('aal2-required');
    if (actor.purpose !== 'privacy.dsr.review') this.deny('purpose-required');
    if (requestId && !this.assignedRequestIds.has(requestId)) this.deny('assignment-required');
  }
  private support(actor: PrivacyActor, purpose: string, aal2 = false) {
    if (actor.role !== 'support_admin') this.deny('permission-denied');
    if (aal2 && actor.aal < 2) this.deny('aal2-required');
    if (actor.purpose !== purpose) this.deny('purpose-required');
  }
  private version(actual: number, expected: number) {
    if (actual !== expected) this.deny('version-conflict', 409);
  }
  private event(record: RequestRecord, type: string, from: DsrStatus, reason: string | null) {
    record.events.push({
      id: randomUUID(),
      event_type: type,
      from_status: from,
      to_status: record.status,
      reason_code: reason,
      aggregate_version: record.version,
      occurred_at: this.now().toISOString(),
    });
  }
  private effect(actor: PrivacyActor, action: string, resourceId: string) {
    const value = {
      action,
      actor_person_id: actor.personId,
      resource_id: resourceId,
      request_id: actor.requestId,
    };
    this.audit.push(value);
    this.outbox.push(value);
  }
  private detail(record: RequestRecord) {
    const { person_id: _p, submitted_by_person_id: _s, contact_preference: _c, ...safe } = record;
    return structuredClone(safe);
  }
  private summary(record: RequestRecord) {
    const {
      id,
      patient_id,
      request_type,
      status,
      submitted_at,
      due_at,
      due_policy_label,
      released_at,
      version,
    } = record;
    return {
      id,
      patient_id,
      request_type,
      status,
      submitted_at,
      due_at,
      due_policy_label,
      released_at,
      version,
    };
  }

  public createDsr(actor: PrivacyActor, body: CreateDsrInput) {
    const patientId = this.subjectPatient(actor, body.managed_patient_id);
    const submittedAt = this.now();
    const record: RequestRecord = {
      id: randomUUID(),
      person_id: ids.patientPerson,
      patient_id: patientId,
      submitted_by_person_id: actor.personId,
      request_type: body.request_type,
      scope: structuredClone(body.scope),
      contact_preference: body.contact_preference,
      status: body.scope.data_category_codes.includes('identity.proof')
        ? 'identity_verification_required'
        : 'submitted',
      identity_verification_required: body.scope.data_category_codes.includes('identity.proof'),
      identity_verified_at: null,
      submitted_at: submittedAt.toISOString(),
      due_at: dueAtForSyntheticDsr(submittedAt).toISOString(),
      due_policy_label: 'synthetic_non_statutory',
      decision_code: null,
      included_scope: null,
      excluded_scope: null,
      fulfilment_action_codes: [],
      evidence_object_id: null,
      released_at: null,
      version: 1,
      events: [],
    };
    record.events.push({
      id: randomUUID(),
      event_type: record.status,
      from_status: null,
      to_status: record.status,
      reason_code: record.identity_verification_required ? 'identity.verification_required' : null,
      aggregate_version: 1,
      occurred_at: submittedAt.toISOString(),
    });
    this.requests.set(record.id, record);
    this.effect(actor, 'privacy.dsr.submitted', record.id);
    return this.detail(record);
  }
  public listMyDsrs(actor: PrivacyActor, query: PrivacyPageQuery = {}) {
    const patientId = this.subjectPatient(actor, query.managed_patient_id);
    const items = [...this.requests.values()]
      .filter((item) => item.patient_id === patientId)
      .filter((item) => !query.type || item.request_type === query.type)
      .filter((item) => !query.status || item.status === query.status)
      .map((item) => this.summary(item));
    return { items, next_cursor: null };
  }
  public getDsr(actor: PrivacyActor, requestId: string) {
    const record = this.requests.get(requestId);
    if (!record) this.deny('not-found', 404);
    if (actor.role === 'dpo') this.dpo(actor, requestId);
    else this.subjectPatient(actor, record.patient_id);
    return this.detail(record);
  }
  public downloadDsrExport(actor: PrivacyActor, requestId: string, token?: string) {
    if (actor.aal < 2) this.deny('aal2-required');
    const record = this.subjectRecord(actor, requestId);
    if (
      record.status !== 'fulfilled' ||
      record.request_type !== 'access_export' ||
      !record.released_at
    )
      this.deny('export-not-ready', 409);
    if (!token) {
      const plaintext = `synthetic-005-${randomUUID()}-${randomUUID()}`;
      const tokenDigest = createHash('sha256').update(plaintext).digest('hex');
      const expiresAt = new Date(this.now().getTime() + 5 * 60_000).toISOString();
      this.exports.set(requestId, {
        requestId,
        recipientPersonId: actor.personId,
        tokenDigest,
        expiresAt,
        usedAt: null,
        body: new TextEncoder().encode(
          JSON.stringify({ request_reference: requestId, synthetic: true }),
        ),
      });
      return {
        download_url: `/privacy/requests/${requestId}?capability=${plaintext}`,
        expires_at: expiresAt,
        one_time: true as const,
      };
    }
    const capability = this.exports.get(requestId);
    if (!capability || capability.recipientPersonId !== actor.personId)
      this.deny('export-capability-invalid', 403);
    if (capability.usedAt || Date.parse(capability.expiresAt) <= this.now().getTime())
      this.deny('export-capability-gone', 410);
    if (createHash('sha256').update(token).digest('hex') !== capability.tokenDigest)
      this.deny('export-capability-invalid', 403);
    capability.usedAt = this.now().toISOString();
    this.effect(actor, 'privacy.dsr.export_consumed', requestId);
    return capability.body;
  }
  public listAdminDsrs(actor: PrivacyActor, query: PrivacyPageQuery = {}) {
    this.dpo(actor);
    const items = [...this.requests.values()]
      .filter((item) => this.assignedRequestIds.has(item.id))
      .filter((item) => !query.type || item.request_type === query.type)
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.due_before || item.due_at <= query.due_before)
      .map((item) => this.summary(item));
    return { items, next_cursor: null };
  }
  public decideDsr(
    actor: PrivacyActor,
    requestId: string,
    body: DsrDecisionInput,
    expected: number,
  ) {
    this.dpo(actor, requestId);
    const record = this.requests.get(requestId);
    if (!record) this.deny('not-found', 404);
    this.version(record.version, expected);
    if (record.identity_verification_required && !record.identity_verified_at)
      this.deny('identity-verification-required', 409);
    const coreScope = (scope: DsrDecisionInput['included_scope']) =>
      scope === null || scope === undefined
        ? scope
        : {
            dataCategoryCodes: scope.data_category_codes,
            ...(scope.record_reference_codes
              ? { recordReferenceCodes: scope.record_reference_codes }
              : {}),
            ...(scope.correction_codes ? { correctionCodes: scope.correction_codes } : {}),
          };
    const includedScope = coreScope(body.included_scope);
    const excludedScope = coreScope(body.excluded_scope);
    const result = validateDsrDecision({
      currentStatus: record.status,
      decision: body.decision,
      reasonCode: body.reason_code,
      evidenceObjectId: body.evidence_object_id,
      ...(includedScope !== undefined ? { includedScope } : {}),
      ...(excludedScope !== undefined ? { excludedScope } : {}),
    });
    if (!result.valid || !result.targetStatus) this.deny(result.reason ?? 'validation-failed', 422);
    const from = record.status;
    record.status = result.targetStatus;
    record.decision_code = body.decision;
    record.included_scope = body.included_scope ?? null;
    record.excluded_scope = body.excluded_scope ?? null;
    record.evidence_object_id = body.evidence_object_id;
    record.version += 1;
    this.event(record, record.status, from, body.reason_code);
    this.effect(actor, 'privacy.dsr.status_changed', requestId);
    return this.detail(record);
  }
  public fulfilDsr(
    actor: PrivacyActor,
    requestId: string,
    body: DsrFulfilmentInput,
    expected: number,
  ) {
    this.dpo(actor, requestId);
    const record = this.requests.get(requestId);
    if (!record) this.deny('not-found', 404);
    this.version(record.version, expected);
    const result = validateDsrFulfilment({
      currentStatus: record.status,
      requestType: record.request_type,
      actionCodes: body.action_codes,
      actionSummary: body.action_summary,
      evidenceObjectId: body.evidence_object_id,
      subjectNoticeCode: body.subject_notice_code,
      retentionPolicyApproved: false,
    });
    if (!result.valid) this.deny(result.reason ?? 'validation-failed', 422);
    const from = record.status;
    record.status = 'fulfilled';
    record.fulfilment_action_codes = [...body.action_codes];
    record.evidence_object_id = body.evidence_object_id;
    record.released_at = this.now().toISOString();
    record.version += 1;
    this.event(record, 'fulfilled', from, 'fulfilment.recorded');
    this.effect(actor, 'privacy.dsr.status_changed', requestId);
    return this.detail(record);
  }
  public listNotificationTemplates(actor: PrivacyActor, query: PrivacyPageQuery = {}) {
    if (actor.purpose === 'notification.template.publish') this.support(actor, actor.purpose, true);
    else this.support(actor, 'notification.template.manage');
    const items = [...this.templates.values()].filter(
      (item) => !query.code || item.templateCode === query.code,
    );
    return { items: structuredClone(items), next_cursor: null };
  }
  public createNotificationTemplateRelease(
    actor: PrivacyActor,
    templateCode: string,
    body: CreateNotificationTemplateReleaseInput,
  ) {
    this.support(actor, 'notification.template.manage');
    const properties = body.allowed_field_schema.properties as Record<string, { type?: string }>;
    const draft = {
      id: randomUUID(),
      templateCode,
      releaseVersion:
        [...this.templates.values()].filter((t) => t.templateCode === templateCode).length + 1,
      channel: 'sms' as const,
      arabicBody: body.arabic_body,
      englishBody: body.english_body,
      allowedRecipientTypes: body.allowed_recipient_types,
      allowedFields: Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          value.type === 'date-time' ? 'date-time' : 'string',
        ]),
      ) as Record<string, 'string' | 'date-time'>,
      requiredFields: body.allowed_field_schema.required,
      contentDigest: body.content_digest,
      status: 'draft' as const,
      createdByPersonId: actor.personId,
      version: 1,
    } satisfies NotificationTemplateRelease;
    if (canonicalTemplateDigest(draft) !== body.content_digest)
      this.deny('notification-template-digest-mismatch', 422);
    this.templates.set(draft.id, draft);
    this.effect(actor, 'notification.template.drafted', draft.id);
    return structuredClone(draft);
  }
  public publishNotificationTemplateRelease(
    actor: PrivacyActor,
    releaseId: string,
    body: PublishNotificationTemplateReleaseInput,
    expected: number,
  ) {
    this.support(actor, 'notification.template.publish', true);
    const release = this.templates.get(releaseId);
    if (!release) this.deny('not-found', 404);
    const result = canPublishTemplate({
      release,
      publisherPersonId: actor.personId,
      aal: actor.aal,
      ...(actor.purpose ? { purposeCode: actor.purpose } : {}),
      expectedVersion: expected,
      approvalDigest: body.approval_digest,
    });
    if (!result.allowed)
      this.deny(
        result.reason ?? 'permission-denied',
        result.reason === 'version-conflict' ? 409 : 403,
      );
    release.status = 'published';
    release.publishedByPersonId = actor.personId;
    release.effectiveAt = body.effective_at;
    release.version += 1;
    this.effect(actor, 'notification.template.published', releaseId);
    return structuredClone(release);
  }
  public providerSignature(body: SmsProviderCallbackInput, timestamp: string) {
    return signProviderCallback(JSON.stringify(body), timestamp, this.callbackSecret);
  }
  public smsProviderCallback(body: SmsProviderCallbackInput, signature: string, timestamp: string) {
    if (
      !verifyProviderCallback({
        canonicalBody: JSON.stringify(body),
        timestamp,
        signature,
        secret: this.callbackSecret,
        now: this.now(),
      })
    )
      this.deny('provider-signature-invalid', 401);
    const receiptKey = `${body.receipt_reference}\u0000${body.nonce}`;
    if (this.callbackReceipts.has(receiptKey)) this.deny('provider-receipt-replayed', 409);
    this.callbackReceipts.add(receiptKey);
    const delivery = this.deliveries.get(body.event_reference);
    if (delivery && body.delivery_status === 'delivered') {
      delivery.status = 'delivered';
      delivery.visibleCount = 1;
      delivery.version += 1;
    }
    return { accepted: true as const };
  }
  public replayDeadLetter(
    actor: PrivacyActor,
    eventId: string,
    _body: ReplayDeadLetterInput,
    expected: number,
  ) {
    if (actor.role !== 'platform_operator' || actor.personId !== ids.operator)
      this.deny('permission-denied');
    if (actor.aal < 2) this.deny('aal2-required');
    if (actor.purpose !== 'platform.outbox.replay') this.deny('purpose-required');
    const original = this.deliveries.get(eventId);
    if (!original) this.deny('not-found', 404);
    this.version(original.version, expected);
    if (original.status !== 'dead_letter') this.deny('dead-letter-required', 409);
    const replayId = randomUUID();
    original.version += 1;
    this.deliveries.set(replayId, { id: replayId, status: 'pending', version: 1, visibleCount: 0 });
    this.effect(actor, 'notification.delivery.replay_requested', replayId);
    return {
      original_event_id: eventId,
      replay_event_id: replayId,
      status: 'pending' as const,
      version: original.version,
    };
  }
}

export interface PrivacyDsrNotificationServicePort {
  createDsr(actor: PrivacyActor, body: CreateDsrInput): unknown | Promise<unknown>;
  listMyDsrs(actor: PrivacyActor, query?: PrivacyPageQuery): unknown | Promise<unknown>;
  getDsr(actor: PrivacyActor, requestId: string): unknown | Promise<unknown>;
  downloadDsrExport(
    actor: PrivacyActor,
    requestId: string,
    token?: string,
  ): unknown | Promise<unknown>;
  listAdminDsrs(actor: PrivacyActor, query?: PrivacyPageQuery): unknown | Promise<unknown>;
  decideDsr(
    actor: PrivacyActor,
    requestId: string,
    body: DsrDecisionInput,
    expected: number,
  ): unknown | Promise<unknown>;
  fulfilDsr(
    actor: PrivacyActor,
    requestId: string,
    body: DsrFulfilmentInput,
    expected: number,
  ): unknown | Promise<unknown>;
  listNotificationTemplates(
    actor: PrivacyActor,
    query?: PrivacyPageQuery,
  ): unknown | Promise<unknown>;
  createNotificationTemplateRelease(
    actor: PrivacyActor,
    templateCode: string,
    body: CreateNotificationTemplateReleaseInput,
  ): unknown | Promise<unknown>;
  publishNotificationTemplateRelease(
    actor: PrivacyActor,
    releaseId: string,
    body: PublishNotificationTemplateReleaseInput,
    expected: number,
  ): unknown | Promise<unknown>;
  smsProviderCallback(
    body: SmsProviderCallbackInput,
    signature: string,
    timestamp: string,
  ): unknown | Promise<unknown>;
  replayDeadLetter(
    actor: PrivacyActor,
    eventId: string,
    body: ReplayDeadLetterInput,
    expected: number,
  ): unknown | Promise<unknown>;
}
