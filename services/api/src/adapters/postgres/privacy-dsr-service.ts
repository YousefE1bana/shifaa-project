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
  canonicalTemplateDigest,
  signProviderCallback,
  verifyProviderCallback,
} from '@shifaa/core/privacy-dsr-notifications/policy';
import type { TransactionSql } from 'postgres';

import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import type {
  PrivacyActor,
  PrivacyDsrNotificationServicePort,
  PrivacyPageQuery,
} from '../../modules/privacy-dsr-notifications/index.js';
import { PostgresIdentityRepository } from './identity-repository.js';

const role = (actor: PrivacyActor) =>
  actor.role === 'support_admin'
    ? 'ADM-SUPPORT'
    : actor.role === 'platform_operator'
      ? 'PLATFORM-OPERATOR'
      : actor.role === 'dpo'
        ? 'DPO'
        : 'PAT';
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

type DsrRow = {
  id: string;
  person_id: string;
  patient_id: string;
  request_type: string;
  status: string;
  submitted_at: Date | string;
  due_at: Date | string;
  released_at: Date | string | null;
  version: number;
  scope?: unknown;
  events?: unknown;
  decision_code?: string | null;
  included_scope?: unknown;
  excluded_scope?: unknown;
  fulfilment_action_codes?: string[] | null;
  evidence_object_id?: string | null;
};
type TemplateRow = {
  id: string;
  template_code: string;
  release_version: number;
  channel: 'sms';
  arabic_body: string;
  english_body: string;
  allowed_recipient_types: readonly string[];
  allowed_field_schema: {
    properties: Record<string, { type: string }>;
    required: string[];
  };
  content_digest: string;
  status: string;
  created_by_person_id: string;
  published_by_person_id: string | null;
  effective_at: Date | string | null;
  version: number;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class PostgresPrivacyDsrNotificationService implements PrivacyDsrNotificationServicePort {
  public constructor(
    private readonly repository: PostgresIdentityRepository,
    private readonly callbackSecret = 'synthetic-005-callback-secret-not-production',
    private readonly now = () => new Date(),
  ) {}

  private async context(sql: TransactionSql, actor: PrivacyActor) {
    await sql`select set_config('shifaa.person_id',${actor.personId},true),set_config('shifaa.actor_role',${role(actor)},true),set_config('shifaa.aal',${String(actor.aal)},true),set_config('shifaa.purposes',${actor.purpose ?? ''},true),set_config('shifaa.principal',${actor.principal},true),set_config('shifaa.patient_context',${actor.selectedPatientId ?? ''},true)`;
  }
  private deny(code: string, status = 403): never {
    throw new ApiPolicyError(code, status, code);
  }
  private request(row: DsrRow) {
    return {
      id: row.id,
      patient_id: row.patient_id,
      request_type: row.request_type,
      status: row.status,
      submitted_at: iso(row.submitted_at),
      due_at: iso(row.due_at),
      due_policy_label: 'synthetic_non_statutory',
      released_at: row.released_at ? iso(row.released_at) : null,
      version: row.version,
      ...(row.scope ? { scope: row.scope } : {}),
      ...(row.events ? { events: row.events } : {}),
      ...(row.decision_code ? { decision_code: row.decision_code } : {}),
      ...(row.included_scope ? { included_scope: row.included_scope } : {}),
      ...(row.excluded_scope ? { excluded_scope: row.excluded_scope } : {}),
      fulfilment_action_codes: row.fulfilment_action_codes ?? [],
    };
  }
  private async effect(
    sql: TransactionSql,
    actor: PrivacyActor,
    action: string,
    resourceId: string,
    aggregateVersion: number,
    aggregateType = 'privacy-dsr',
  ) {
    const digest = createHash('sha256')
      .update(`${action}:${resourceId}:${actor.requestId}`)
      .digest('hex');
    await sql`insert into audit.events(event_hash,actor_person_id,action,resource_type,resource_id,outcome,request_id,metadata) values(${digest},${actor.personId}::uuid,${action},'privacy-dsr-notifications',${resourceId}::uuid,'success',${actor.requestId}::uuid,${sql.json({ purpose_code: actor.purpose ?? null })})`;
    await sql`insert into platform.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload) values(${aggregateType},${resourceId}::uuid,${aggregateVersion},${action},${sql.json({ resource_id: resourceId, request_id: actor.requestId })})`;
  }

  public listMyDsrs(actor: PrivacyActor, query: PrivacyPageQuery = {}) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const patientId = query.managed_patient_id ?? actor.selectedPatientId;
      if (!patientId) this.deny('patient-context-required', 400);
      const [authority] = await sql<
        { allowed: boolean }[]
      >`select platform.person_can_manage_dsr(${patientId}::uuid,${actor.personId}::uuid) allowed`;
      if (!authority?.allowed) this.deny('permission-denied');
      const rows = await sql<
        DsrRow[]
      >`select * from consent.data_subject_requests where patient_id=${patientId}::uuid and (${query.type ?? null}::text is null or request_type=${query.type ?? null}) and (${query.status ?? null}::text is null or status=${query.status ?? null}) order by submitted_at desc,id limit ${query.limit ?? 25}`;
      return { items: rows.map((row) => this.request(row)), next_cursor: null };
    });
  }
  public createDsr(actor: PrivacyActor, body: CreateDsrInput) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const patientId = body.managed_patient_id ?? actor.selectedPatientId;
      if (!patientId) this.deny('patient-context-required', 400);
      const [patient] = await sql<
        { id: string; person_id: string | null }[]
      >`select ${patientId}::uuid id,platform.dsr_subject_person_id(${patientId}::uuid,${actor.personId}::uuid) person_id`;
      if (!patient) this.deny('permission-denied');
      if (!patient.person_id) this.deny('permission-denied');
      const id = randomUUID();
      const submitted = this.now();
      const due = new Date(submitted.getTime() + 17 * 86_400_000);
      const status = body.scope.data_category_codes.includes('identity.proof')
        ? 'identity_verification_required'
        : 'submitted';
      const [row] = await sql<
        DsrRow[]
      >`insert into consent.data_subject_requests(id,person_id,patient_id,submitted_by_person_id,request_type,scope,contact_preference,status,submitted_at,due_at) values(${id}::uuid,${patient.person_id}::uuid,${patientId}::uuid,${actor.personId}::uuid,${body.request_type},${sql.json(body.scope)},${body.contact_preference},${status},${submitted},${due}) returning *`;
      if (!row) this.deny('database-write-failed', 500);
      await sql`insert into consent.data_subject_request_events(request_id,aggregate_version,actor_person_id,actor_type,event_type,to_status,reason_code,occurred_at) values(${id}::uuid,1,${actor.personId}::uuid,${actor.personId === patient.person_id ? 'subject' : 'guardian'},${status},${status},${status === 'identity_verification_required' ? 'identity.verification_required' : null},${submitted})`;
      await this.effect(
        sql,
        actor,
        status === 'identity_verification_required'
          ? 'privacy.dsr.identity_required'
          : 'privacy.dsr.submitted',
        id,
        1,
      );
      return this.getDsr(actor, row.id);
    });
  }
  public getDsr(actor: PrivacyActor, requestId: string) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const [row] = await sql<
        DsrRow[]
      >`select r.*,coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'from_status',e.from_status,'to_status',e.to_status,'reason_code',e.reason_code,'aggregate_version',e.aggregate_version,'occurred_at',e.occurred_at) order by e.aggregate_version) from consent.data_subject_request_events e where e.request_id=r.id),'[]'::jsonb) events from consent.data_subject_requests r where r.id=${requestId}::uuid`;
      if (!row) this.deny('not-found', 404);
      return this.request(row);
    });
  }
  public listAdminDsrs(actor: PrivacyActor, query: PrivacyPageQuery = {}) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      if (actor.role !== 'dpo') this.deny('dpo-designation-required');
      if (actor.aal < 2) this.deny('aal2-required');
      if (actor.purpose !== 'privacy.dsr.review') this.deny('purpose-required');
      const [authority] = await sql<
        { designated: boolean; assigned: boolean }[]
      >`select platform.person_is_active_dpo(${actor.personId}::uuid) designated,exists(select 1 from consent.dsr_assignments where dpo_person_id=${actor.personId}::uuid and revoked_at is null) assigned`;
      if (!authority?.designated) this.deny('dpo-designation-required');
      if (!authority.assigned) this.deny('assignment-required');
      const rows = await sql<
        DsrRow[]
      >`select r.* from consent.data_subject_requests r where (${query.type ?? null}::text is null or r.request_type=${query.type ?? null}) and (${query.status ?? null}::text is null or r.status=${query.status ?? null}) and (${query.due_before ?? null}::timestamptz is null or r.due_at<=${query.due_before ?? null}::timestamptz) order by r.due_at,r.id limit ${query.limit ?? 25}`;
      return { items: rows.map((row) => this.request(row)), next_cursor: null };
    });
  }
  public decideDsr(
    actor: PrivacyActor,
    requestId: string,
    body: DsrDecisionInput,
    expected: number,
  ) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const target =
        body.decision === 'approve'
          ? 'approved'
          : body.decision === 'partially_approve'
            ? 'partially_approved'
            : 'refused';
      const [before] = await sql<
        DsrRow[]
      >`select * from consent.data_subject_requests where id=${requestId}::uuid for update`;
      if (!before) this.deny('not-found', 404);
      if (before.version !== expected) this.deny('version-conflict', 409);
      const [row] = await sql<
        DsrRow[]
      >`update consent.data_subject_requests set status=${target},decision_code=${body.decision},decision_reason=${body.reason_summary ?? body.reason_code},included_scope=${body.included_scope ? sql.json(body.included_scope) : null},excluded_scope=${body.excluded_scope ? sql.json(body.excluded_scope) : null},decided_by_person_id=${actor.personId}::uuid,decided_at=${this.now()},evidence_object_id=${body.evidence_object_id}::uuid where id=${requestId}::uuid returning *`;
      if (!row) this.deny('database-write-failed', 500);
      await sql`insert into consent.data_subject_request_events(request_id,aggregate_version,actor_person_id,actor_type,event_type,from_status,to_status,reason_code,evidence_object_id) values(${requestId}::uuid,${row.version},${actor.personId}::uuid,'dpo',${target},${before.status},${target},${body.reason_code},${body.evidence_object_id}::uuid)`;
      await this.effect(sql, actor, 'privacy.dsr.status_changed', requestId, row.version);
      return this.request(row);
    });
  }
  public fulfilDsr(
    actor: PrivacyActor,
    requestId: string,
    body: DsrFulfilmentInput,
    expected: number,
  ) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      if (
        body.action_codes.some((code) => ['hard_delete', 'automated_pseudonymize'].includes(code))
      )
        this.deny('retention-policy-unapproved', 422);
      const [before] = await sql<
        DsrRow[]
      >`select * from consent.data_subject_requests where id=${requestId}::uuid for update`;
      if (!before) this.deny('not-found', 404);
      if (before.version !== expected) this.deny('version-conflict', 409);
      const [row] = await sql<
        DsrRow[]
      >`update consent.data_subject_requests set status='fulfilled',fulfilment_action_codes=${body.action_codes},fulfilment_summary=${body.action_summary},evidence_object_id=${body.evidence_object_id}::uuid,subject_notice_code=${body.subject_notice_code},released_at=${this.now()},closed_at=${this.now()} where id=${requestId}::uuid returning *`;
      if (!row) this.deny('database-write-failed', 500);
      await sql`insert into consent.data_subject_request_events(request_id,aggregate_version,actor_person_id,actor_type,event_type,from_status,to_status,reason_code,evidence_object_id) values(${requestId}::uuid,${row.version},${actor.personId}::uuid,'dpo','fulfilled',${before.status},'fulfilled','fulfilment.recorded',${body.evidence_object_id}::uuid)`;
      await this.effect(sql, actor, 'privacy.dsr.status_changed', requestId, row.version);
      return this.request(row);
    });
  }
  public downloadDsrExport(actor: PrivacyActor, requestId: string, token?: string) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const [request] = await sql<
        DsrRow[]
      >`select * from consent.data_subject_requests where id=${requestId}::uuid`;
      if (!request || request.status !== 'fulfilled' || request.request_type !== 'access_export')
        this.deny('export-not-ready', 409);
      if (!request.evidence_object_id) this.deny('export-evidence-missing', 409);
      if (!token) {
        const plaintext = `synthetic-005-${randomUUID()}-${randomUUID()}`;
        const digest = createHash('sha256').update(plaintext).digest();
        const issued = this.now();
        const expires = new Date(issued.getTime() + 300_000);
        await sql`insert into consent.dsr_export_capabilities(request_id,evidence_object_id,token_hmac,key_version,issued_to_person_id,issued_by_person_id,created_at,expires_at) values(${requestId}::uuid,${request.evidence_object_id}::uuid,${digest},1,${actor.personId}::uuid,${actor.personId}::uuid,${issued},${expires}) on conflict(request_id,issued_to_person_id) where used_at is null and revoked_at is null do update set token_hmac=excluded.token_hmac,created_at=excluded.created_at,expires_at=excluded.expires_at,version=consent.dsr_export_capabilities.version+1`;
        return {
          download_url: `/privacy/requests/${requestId}?capability=${plaintext}`,
          expires_at: expires.toISOString(),
          one_time: true,
        };
      }
      const digest = createHash('sha256').update(token).digest();
      const [capability] = await sql<
        { id: string; used_at: Date | string | null; expires_at: Date | string; version: number }[]
      >`select * from consent.dsr_export_capabilities where request_id=${requestId}::uuid and token_hmac=${digest} for update`;
      if (!capability) this.deny('export-capability-invalid', 403);
      if (capability.used_at || new Date(capability.expires_at) <= this.now())
        this.deny('export-capability-gone', 410);
      await sql`update consent.dsr_export_capabilities set used_at=${this.now()},version=version+1 where id=${capability.id}::uuid`;
      await this.effect(
        sql,
        actor,
        'privacy.dsr.export_consumed',
        requestId,
        capability.version + 1,
        'privacy-export',
      );
      return new TextEncoder().encode(
        JSON.stringify({ request_reference: requestId, synthetic: true }),
      );
    });
  }
  public listNotificationTemplates(actor: PrivacyActor, query: PrivacyPageQuery = {}) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const rows = await sql<
        TemplateRow[]
      >`select * from platform.notification_template_releases where (${query.code ?? null}::text is null or template_code=${query.code ?? null}) order by template_code,release_version desc`;
      return { items: rows.map((row) => this.template(row)), next_cursor: null };
    });
  }
  private template(row: TemplateRow) {
    return {
      id: row.id,
      templateCode: row.template_code,
      releaseVersion: row.release_version,
      channel: row.channel,
      arabicBody: row.arabic_body,
      englishBody: row.english_body,
      allowedRecipientTypes: row.allowed_recipient_types,
      allowedFields: Object.fromEntries(
        Object.entries(row.allowed_field_schema.properties).map(([key, value]) => [
          key,
          value.type === 'date-time' ? 'date-time' : 'string',
        ]),
      ),
      requiredFields: row.allowed_field_schema.required,
      contentDigest: row.content_digest,
      status: row.status,
      createdByPersonId: row.created_by_person_id,
      publishedByPersonId: row.published_by_person_id,
      effectiveAt: row.effective_at ? iso(row.effective_at) : null,
      version: row.version,
    };
  }
  public createNotificationTemplateRelease(
    actor: PrivacyActor,
    templateCode: string,
    body: CreateNotificationTemplateReleaseInput,
  ) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const fields = Object.fromEntries(
        Object.entries(
          body.allowed_field_schema.properties as Record<string, { type: string }>,
        ).map(([key, value]) => [key, value.type === 'date-time' ? 'date-time' : 'string']),
      );
      const canonical = {
        templateCode,
        channel: 'sms' as const,
        arabicBody: body.arabic_body,
        englishBody: body.english_body,
        allowedRecipientTypes: body.allowed_recipient_types,
        allowedFields: fields,
        requiredFields: body.allowed_field_schema.required,
      };
      if (canonicalTemplateDigest(canonical) !== body.content_digest)
        this.deny('notification-template-digest-mismatch', 422);
      const [version] = await sql<
        { value: number }[]
      >`select coalesce(max(release_version),0)+1 value from platform.notification_template_releases where template_code=${templateCode}`;
      if (!version) this.deny('database-read-failed', 500);
      const placeholders = [...body.arabic_body.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)]
        .map((match) => match[1]!)
        .sort();
      const [row] = await sql<
        TemplateRow[]
      >`insert into platform.notification_template_releases(template_code,release_version,channel,arabic_body,english_body,allowed_recipient_types,allowed_field_schema,placeholder_names,content_digest,created_by_person_id) values(${templateCode},${version.value},'sms',${body.arabic_body},${body.english_body},${body.allowed_recipient_types},${sql.json(body.allowed_field_schema)},${placeholders},${body.content_digest},${actor.personId}::uuid) returning *`;
      if (!row) this.deny('database-write-failed', 500);
      await this.effect(
        sql,
        actor,
        'notification.template.drafted',
        row.id,
        row.version,
        'notification-template',
      );
      return this.template(row);
    });
  }
  public publishNotificationTemplateRelease(
    actor: PrivacyActor,
    releaseId: string,
    body: PublishNotificationTemplateReleaseInput,
    expected: number,
  ) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const [before] = await sql<
        TemplateRow[]
      >`select * from platform.notification_template_releases where id=${releaseId}::uuid for update`;
      if (!before) this.deny('not-found', 404);
      if (actor.aal < 2) this.deny('aal2-required');
      if (actor.purpose !== 'notification.template.publish') this.deny('purpose-required');
      if (before.created_by_person_id === actor.personId)
        this.deny('independent-publisher-required');
      if (before.version !== expected) this.deny('version-conflict', 409);
      if (before.content_digest !== body.approval_digest)
        this.deny('notification-template-digest-mismatch', 409);
      const [row] = await sql<
        TemplateRow[]
      >`update platform.notification_template_releases set status='published',published_by_person_id=${actor.personId}::uuid,effective_at=${body.effective_at}::timestamptz where id=${releaseId}::uuid returning *`;
      if (!row) this.deny('database-write-failed', 500);
      await this.effect(
        sql,
        actor,
        'notification.template.published',
        releaseId,
        row.version,
        'notification-template',
      );
      return this.template(row);
    });
  }
  public smsProviderCallback(body: SmsProviderCallbackInput, signature: string, timestamp: string) {
    return this.repository.withRawTransaction(async (sql) => {
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
      const receiptHash = createHash('sha256').update(body.receipt_reference).digest('hex');
      const nonceHash = createHash('sha256').update(body.nonce).digest('hex');
      const requestDigest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const receiptId = randomUUID();
      try {
        await sql`insert into platform.provider_callback_receipts(id,provider_code,event_reference,receipt_reference_hash,nonce_hash,request_digest,delivery_status,provider_occurred_at) values(${receiptId}::uuid,'local-synthetic',${body.event_reference},${receiptHash},${nonceHash},${requestDigest},${body.delivery_status},${body.occurred_at}::timestamptz)`;
      } catch (error: unknown) {
        if (isUniqueViolation(error)) this.deny('provider-receipt-replayed', 409);
        throw error;
      }
      const effectRequestId = randomUUID();
      const eventHash = createHash('sha256')
        .update(`notification.delivery.receipt_recorded:${receiptId}:${effectRequestId}`)
        .digest('hex');
      await sql`insert into audit.events(event_hash,action,resource_type,resource_id,outcome,request_id,metadata) values(${eventHash},'notification.delivery.receipt_recorded','provider-receipt',${receiptId}::uuid,'success',${effectRequestId}::uuid,${sql.json({ provider_code: 'local-synthetic', delivery_status: body.delivery_status })})`;
      await sql`insert into platform.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload) values('notification-receipt',${receiptId}::uuid,1,'notification.delivery.receipt_recorded',${sql.json({ receipt_id: receiptId, delivery_status: body.delivery_status })})`;
      return { accepted: true };
    });
  }
  public replayDeadLetter(
    actor: PrivacyActor,
    eventId: string,
    body: ReplayDeadLetterInput,
    expected: number,
  ) {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      if (
        actor.role !== 'platform_operator' ||
        actor.aal < 2 ||
        actor.purpose !== 'platform.outbox.replay'
      )
        this.deny('permission-denied');
      const [original] = await sql<
        {
          aggregate_type: string;
          aggregate_id: string;
          aggregate_version: number;
        }[]
      >`select * from platform.outbox_events where id=${eventId}::uuid and state='dead_letter'`;
      if (!original) this.deny('dead-letter-required', 409);
      if ((original.aggregate_version ?? 1) !== expected) this.deny('version-conflict', 409);
      const replayId = randomUUID();
      await sql`insert into platform.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) values(${replayId}::uuid,${original.aggregate_type},${original.aggregate_id}::uuid,${expected + 1},'notification.delivery.replay_requested',${sql.json({ original_event_id: eventId })})`;
      await sql`insert into platform.outbox_replay_attempts(original_event_id,replay_event_id,actor_person_id,reason_code,original_version) values(${eventId}::uuid,${replayId}::uuid,${actor.personId}::uuid,${body.reason_code},${expected})`;
      return {
        original_event_id: eventId,
        replay_event_id: replayId,
        status: 'pending',
        version: expected + 1,
      };
    });
  }
}
