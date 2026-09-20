import { createHash } from 'node:crypto';

import postgres, { type Sql, type TransactionSql } from 'postgres';

import type { MessagingAdapter, MessagingResult } from './privacy-dsr-notifications.ts';
import {
  assertPublishedRelease,
  CLINIC_NOTIFICATION_LEASE_SECONDS,
  CLINIC_NOTIFICATION_MAX_ATTEMPTS,
  CLINIC_NOTIFICATION_RETRY_DELAYS_MS,
  clinicNotificationEventTypes,
  providerIdempotencyKey,
  providerReceiptHash,
  renderedBody,
  renderedDigest,
  retryDecision,
  templateCodeForEvent,
} from './clinic-scheduling-notifications.ts';
import type {
  ClinicSchedulingNotificationEvent,
  ClinicSchedulingNotificationPorts,
  ClinicSchedulingNotificationRecipient,
  ClinicSchedulingNotificationRecord,
  ClinicSchedulingTemplateRelease,
  ClinicNotificationOutcome,
  ClinicNotificationState,
} from './clinic-scheduling-notifications.ts';

type SqlClaim = {
  event_id: string;
  event_type: (typeof clinicNotificationEventTypes)[number];
  aggregate_id: string;
  aggregate_version: number;
  attempt_count: number;
  lease_expires_at: Date;
};

type SqlRecipient = {
  recipient_person_id: string;
  locale: 'ar-EG' | 'en-EG';
  field_values: Record<string, unknown>;
};

type SqlRelease = {
  id: string;
  template_code: ClinicSchedulingTemplateRelease['templateCode'];
  release_version: number;
  channel: 'sms';
  arabic_body: string;
  english_body: string;
  allowed_recipient_types: readonly ['patient'];
  allowed_field_schema: {
    properties: Record<string, { type: 'string' }>;
    required: string[];
  };
  content_digest: string;
  status: 'published';
  effective_at: Date;
  version: number;
};

type SqlNotification = {
  id: string;
  source_event_id: string;
  template_release_id: string;
  recipient_person_id: string;
  locale: 'ar-EG' | 'en-EG';
  field_values: Record<string, string>;
  rendered_digest: string;
  status: ClinicNotificationState;
  attempt_count: number;
  next_attempt_at: Date;
};

/**
 * PostgreSQL port for Feature 009 notification work.  The only clinical
 * reads are performed by SECURITY DEFINER functions owned by the database;
 * this role receives neither table access nor raw event/reason/contact data.
 */
export class PostgresClinicSchedulingNotificationStore
  implements ClinicSchedulingNotificationPorts
{
  public readonly clock: { now: () => Date };
  private readonly sql: Sql;
  private readonly environment: 'local' | 'ci';

  public constructor(
    databaseUrl: string,
    now = () => new Date(),
    environment: 'local' | 'ci' = workerEnvironment(process.env),
  ) {
    if (!['local', 'ci'].includes(environment))
      throw new Error('Feature 009 notification worker requires local or CI environment.');
    this.sql = postgres(databaseUrl, { max: 2, prepare: true });
    this.clock = { now };
    this.environment = environment;
  }

  public close() {
    return this.sql.end({ timeout: 5 });
  }

  public async claimNext(input: {
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<ClinicSchedulingNotificationEvent | null> {
    const [row] = await this.withSyntheticEnvironment(
      (sql) => sql<SqlClaim[]>`
      select * from platform.claim_next_clinic_scheduling_notification_event(
        ${input.workerId},${input.leaseSeconds}
      )
    `,
    );
    return row
      ? {
          eventId: row.event_id,
          eventType: row.event_type,
          aggregateId: row.aggregate_id,
          aggregateVersion: Number(row.aggregate_version),
          attemptCount: Number(row.attempt_count),
          leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
        }
      : null;
  }

  public async completeClaim(input: {
    readonly eventId: string;
    readonly workerId: string;
    readonly outcome: ClinicNotificationOutcome;
    readonly safeErrorCode?: string;
    readonly retryAt?: string;
  }): Promise<boolean> {
    const [row] = await this.withSyntheticEnvironment(
      (sql) => sql<{ completed: boolean }[]>`
      select platform.complete_clinic_scheduling_notification_event(
        ${input.eventId}::uuid,${input.workerId},${input.outcome},
        ${input.safeErrorCode ?? null},${input.retryAt ?? null}
      ) completed
    `,
    );
    return row?.completed === true;
  }

  public async resolveCurrentRecipients(input: {
    readonly event: ClinicSchedulingNotificationEvent;
    readonly workerId: string;
    readonly now: string;
  }): Promise<readonly ClinicSchedulingNotificationRecipient[]> {
    const rows = await this.withSyntheticEnvironment(
      (sql) => sql<SqlRecipient[]>`
        select recipient_person_id,locale,field_values
        from platform.clinic_scheduling_notification_recipients(${input.event.eventId}::uuid,${input.workerId})
        order by recipient_person_id
      `,
    );
    return rows.map((row) => {
      const fields = exactFields(input.event, row.field_values);
      return { recipientPersonId: row.recipient_person_id, locale: row.locale, fields };
    });
  }

  public async resolvePublishedRelease(input: {
    readonly event: ClinicSchedulingNotificationEvent;
    readonly now: string;
  }): Promise<ClinicSchedulingTemplateRelease | null> {
    const code = templateCodeForEvent(input.event.eventType);
    const [row] = await this.withSyntheticEnvironment(
      (sql) => sql<SqlRelease[]>`
      select id,template_code,release_version,channel,arabic_body,english_body,
        allowed_recipient_types,allowed_field_schema,content_digest,status,effective_at,version
      from platform.notification_template_releases
      where template_code=${code} and channel='sms' and status='published'
        and effective_at<=${input.now}
      order by release_version desc,id
      limit 1
    `,
    );
    if (!row) return null;
    const release: ClinicSchedulingTemplateRelease = {
      id: row.id,
      templateCode: row.template_code,
      releaseVersion: Number(row.release_version),
      channel: 'sms',
      arabicBody: row.arabic_body,
      englishBody: row.english_body,
      allowedRecipientTypes: ['patient'],
      allowedFields: Object.fromEntries(
        Object.entries(row.allowed_field_schema.properties).map(([name, definition]) => [
          name,
          definition.type,
        ]),
      ),
      requiredFields: row.allowed_field_schema.required,
      contentDigest: row.content_digest,
      status: 'published',
      effectiveAt: new Date(row.effective_at).toISOString(),
      version: Number(row.version),
    };
    validateRelease(release);
    return release;
  }

  public async ensureNotification(input: {
    readonly event: ClinicSchedulingNotificationEvent;
    readonly recipient: ClinicSchedulingNotificationRecipient;
    readonly release: ClinicSchedulingTemplateRelease;
    readonly renderedDigest: string;
    readonly now: string;
  }): Promise<ClinicSchedulingNotificationRecord> {
    const deliveryScopeKey = input.recipient.fields['appointment_reference'] ?? '';
    const [row] = await this.withSyntheticEnvironment(
      (sql) => sql<SqlNotification[]>`
      insert into platform.notifications(
        source_event_id,template_release_id,recipient_type,recipient_person_id,
        locale,channel,field_values,rendered_digest,delivery_scope_key
      ) values(
        ${input.event.eventId}::uuid,${input.release.id}::uuid,'patient',${input.recipient.recipientPersonId}::uuid,
        ${input.recipient.locale},'sms',${sql.json(input.recipient.fields)},${input.renderedDigest},${deliveryScopeKey}
      ) on conflict (template_release_id,source_event_id,recipient_type,recipient_person_id,channel,delivery_scope_key) do nothing
      returning id,source_event_id,template_release_id,recipient_person_id,locale,field_values,rendered_digest,status,attempt_count,next_attempt_at
    `,
    );
    if (row) return toRecord(row);
    const [existing] = await this.withSyntheticEnvironment(
      (sql) => sql<SqlNotification[]>`
      select id,source_event_id,template_release_id,recipient_person_id,locale,field_values,rendered_digest,status,attempt_count,next_attempt_at
      from platform.notifications
      where template_release_id=${input.release.id}::uuid and source_event_id=${input.event.eventId}::uuid
        and recipient_person_id=${input.recipient.recipientPersonId}::uuid and channel='sms'
        and delivery_scope_key=${deliveryScopeKey}
      limit 1
    `,
    );
    if (!existing) throw new Error('clinic-notification-persistence-failed');
    const durableKeys = Object.keys(existing.field_values).toSorted();
    const expectedKeys = Object.keys(input.recipient.fields).toSorted();
    if (JSON.stringify(durableKeys) !== JSON.stringify(expectedKeys))
      throw new Error('notification-durable-field-schema-invalid');
    return toRecord(existing);
  }

  public recordAttempt(input: {
    readonly notificationId: string;
    readonly sourceEventId: string;
    readonly attemptNumber: number;
    readonly idempotencyKey: string;
    readonly outcome: MessagingResult['outcome'];
    readonly safeErrorCode?: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly retryAt?: string;
    readonly providerReceiptHash?: string;
  }): Promise<void> {
    return this.sql.begin(async (sql) => {
      await sql`
        insert into platform.notification_delivery_attempts(
          notification_id,source_event_id,attempt_number,adapter_code,provider_idempotency_key,
          outcome,safe_error_code,started_at,finished_at,retry_at,provider_receipt_hash
        ) values(
          ${input.notificationId}::uuid,${input.sourceEventId}::uuid,${input.attemptNumber},'local-synthetic',
          ${input.idempotencyKey},${input.outcome},${input.safeErrorCode ?? null},${input.startedAt},
          ${input.finishedAt},${input.retryAt ?? null},${input.providerReceiptHash ?? null}
        ) on conflict do nothing
      `;
    }) as Promise<void>;
  }

  public finalizeNotification(input: {
    readonly notificationId: string;
    readonly attemptNumber: number;
    readonly outcome: ClinicNotificationOutcome;
    readonly finishedAt: string;
    readonly retryAt?: string;
    readonly providerReceiptHash?: string;
  }): Promise<void> {
    const status = input.outcome === 'retry' ? 'failed' : input.outcome;
    return (async () => {
      await this.sql`
      update platform.notifications set
        status=${status},attempt_count=${input.attemptNumber},
        next_attempt_at=${input.retryAt ?? input.finishedAt},
        delivered_at=${input.outcome === 'delivered' ? input.finishedAt : null},
        dead_lettered_at=${input.outcome === 'dead_letter' ? input.finishedAt : null},
        provider_reference_hash=${input.providerReceiptHash ?? null},version=version+1,updated_at=${input.finishedAt}
      where id=${input.notificationId}::uuid and attempt_count<${input.attemptNumber}
      `;
    })();
  }

  private withSyntheticEnvironment<T>(query: (sql: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => {
      await sql`select set_config('shifaa.environment',${this.environment},true)`;
      return query(sql);
    }) as Promise<T>;
  }
}

export class PostgresClinicSchedulingNotificationProcessor {
  private readonly workerId: string;
  private readonly adapter: MessagingAdapter;
  private readonly ports: ClinicSchedulingNotificationPorts;
  private readonly now: () => Date;
  private readonly postgresStore: PostgresClinicSchedulingNotificationStore | null;

  public constructor(
    ports: ClinicSchedulingNotificationPorts,
    adapter: MessagingAdapter,
    workerId?: string,
    now?: () => Date,
  );
  public constructor(
    databaseUrl: string,
    adapter: MessagingAdapter,
    workerId?: string,
    now?: () => Date,
  );
  public constructor(
    databaseOrPorts: string | ClinicSchedulingNotificationPorts,
    adapter: MessagingAdapter,
    workerId = `clinic-scheduling-notifications-${process.pid}`,
    now = () => new Date(),
  ) {
    if (adapter.code !== 'local-synthetic') throw new Error('production-messaging-disabled');
    this.workerId = workerId;
    this.adapter = adapter;
    this.now = now;
    if (typeof databaseOrPorts === 'string') {
      this.postgresStore = new PostgresClinicSchedulingNotificationStore(databaseOrPorts, now);
      this.ports = this.postgresStore;
    } else {
      this.postgresStore = null;
      this.ports = databaseOrPorts;
    }
  }

  public close() {
    return this.postgresStore?.close() ?? Promise.resolve();
  }

  public async processNext(): Promise<'idle' | ClinicNotificationOutcome> {
    const now = this.now();
    const event = await this.ports.claimNext({
      workerId: this.workerId,
      leaseSeconds: CLINIC_NOTIFICATION_LEASE_SECONDS,
      now: now.toISOString(),
    });
    if (!event) return 'idle';
    try {
      const release = await this.ports.resolvePublishedRelease({ event, now: now.toISOString() });
      if (!release) {
        const retry = event.attemptCount < CLINIC_NOTIFICATION_MAX_ATTEMPTS;
        return this.finish(
          event,
          retry ? 'retry' : 'dead_letter',
          'notification-template-not-published',
          retry
            ? new Date(
                this.now().getTime() + CLINIC_NOTIFICATION_RETRY_DELAYS_MS[event.attemptCount - 1]!,
              ).toISOString()
            : undefined,
        );
      }
      assertPublishedRelease(event, release);
      const recipients = await this.ports.resolveCurrentRecipients({
        event,
        workerId: this.workerId,
        now: now.toISOString(),
      });
      if (recipients.length === 0) return this.finish(event, 'delivered');

      const outcomes: ClinicNotificationOutcome[] = [];
      let thrownProcessingErrorCode: string | undefined;
      for (const recipient of recipients) {
        assertRecipientProjection(event, recipient, release);
        const body = renderedBody(release, recipient);
        const digest = renderedDigest(body);
        const notification = await this.ports.ensureNotification({
          event,
          recipient,
          release,
          renderedDigest: digest,
          now: now.toISOString(),
        });
        if (notification.state === 'delivered') {
          outcomes.push('delivered');
          continue;
        }
        if (notification.state === 'dead_letter') {
          outcomes.push('dead_letter');
          continue;
        }
        const attemptNumber = notification.attemptCount + 1;
        const idempotencyKey = providerIdempotencyKey({
          releaseId: release.id,
          eventId: event.eventId,
          recipientPersonId: recipient.recipientPersonId,
          deliveryScopeKey: recipient.fields['appointment_reference'] ?? '',
        });
        const startedAt = this.now();
        let result: MessagingResult;
        try {
          result = await this.adapter.send({
            idempotencyKey,
            destinationAlias: `SYNTHETIC-${recipient.recipientPersonId}`,
            renderedBody: body,
          });
        } catch (error) {
          const finishedAt = this.now();
          const errorCode = safeErrorCode(error);
          const decision = deliveryDecision(
            { outcome: 'transient_failure' },
            attemptNumber,
            finishedAt,
          );
          await this.ports.recordAttempt({
            notificationId: notification.id,
            sourceEventId: event.eventId,
            attemptNumber,
            idempotencyKey,
            outcome: 'transient_failure',
            safeErrorCode: errorCode,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            ...(decision.retryAt ? { retryAt: decision.retryAt.toISOString() } : {}),
          });
          await this.ports.finalizeNotification({
            notificationId: notification.id,
            attemptNumber,
            outcome: decision.outcome,
            finishedAt: finishedAt.toISOString(),
            ...(decision.retryAt ? { retryAt: decision.retryAt.toISOString() } : {}),
          });
          thrownProcessingErrorCode ??= errorCode;
          outcomes.push(decision.outcome);
          continue;
        }
        const finishedAt = this.now();
        const decision = deliveryDecision(result, attemptNumber, finishedAt);
        await this.ports.recordAttempt({
          notificationId: notification.id,
          sourceEventId: event.eventId,
          attemptNumber,
          idempotencyKey,
          outcome: result.outcome,
          ...(result.safeErrorCode ? { safeErrorCode: result.safeErrorCode } : {}),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          ...(decision.retryAt ? { retryAt: decision.retryAt.toISOString() } : {}),
          ...(providerReceiptHash(result.providerReceiptReference)
            ? { providerReceiptHash: providerReceiptHash(result.providerReceiptReference) }
            : {}),
        });
        await this.ports.finalizeNotification({
          notificationId: notification.id,
          attemptNumber,
          outcome: decision.outcome,
          finishedAt: finishedAt.toISOString(),
          ...(decision.retryAt ? { retryAt: decision.retryAt.toISOString() } : {}),
          ...(providerReceiptHash(result.providerReceiptReference)
            ? { providerReceiptHash: providerReceiptHash(result.providerReceiptReference) }
            : {}),
        });
        outcomes.push(decision.outcome);
      }
      const outcome = outcomes.includes('dead_letter')
        ? 'dead_letter'
        : outcomes.includes('retry')
          ? 'retry'
          : 'delivered';
      const retryAt =
        outcome === 'retry' ? new Date(this.now().getTime() + 60_000).toISOString() : undefined;
      return this.finish(
        event,
        outcome,
        thrownProcessingErrorCode ?? (outcome === 'retry' ? 'delivery-retry' : undefined),
        retryAt,
      );
    } catch (error) {
      const attempt = event.attemptCount;
      const retry = attempt < 3;
      return this.finish(
        event,
        retry ? 'retry' : 'dead_letter',
        safeErrorCode(error),
        retry ? new Date(this.now().getTime() + 60_000).toISOString() : undefined,
      );
    }
  }

  private async finish(
    event: ClinicSchedulingNotificationEvent,
    outcome: ClinicNotificationOutcome,
    safeErrorCode?: string,
    retryAt?: string,
  ): Promise<ClinicNotificationOutcome> {
    const completed = await this.ports.completeClaim({
      eventId: event.eventId,
      workerId: this.workerId,
      outcome,
      ...(safeErrorCode ? { safeErrorCode } : {}),
      ...(retryAt ? { retryAt } : {}),
    });
    if (!completed) throw new Error('clinic-notification-lease-lost');
    this.ports.telemetry?.emit({
      eventType: event.eventType,
      outcome,
      attemptClass:
        event.attemptCount > 1 ? 'retry' : outcome === 'dead_letter' ? 'exhausted' : 'first',
    });
    return outcome;
  }
}

export { PostgresClinicSchedulingNotificationProcessor as ClinicSchedulingNotificationProcessor };

function workerEnvironment(env: NodeJS.ProcessEnv): 'local' | 'ci' {
  if (env['NODE_ENV'] === 'production')
    throw new Error('OPEN-VENDOR-002: Feature 009 production messaging worker is disabled.');
  if (env['CI'] === 'true' || env['NODE_ENV'] === 'test') return 'ci';
  return 'local';
}

function toRecord(row: SqlNotification): ClinicSchedulingNotificationRecord {
  return {
    id: row.id,
    sourceEventId: row.source_event_id,
    templateReleaseId: row.template_release_id,
    recipientPersonId: row.recipient_person_id,
    locale: row.locale,
    fieldValues: row.field_values,
    renderedDigest: row.rendered_digest,
    state: row.status,
    attemptCount: Number(row.attempt_count),
    nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
  };
}

function eventFields(event: ClinicSchedulingNotificationEvent): readonly string[] {
  return event.eventType === 'clinical.doctor_delay.declared.v1'
    ? [
        'action_reference',
        'appointment_reference',
        'delay_date_label',
        'delay_minutes_label',
        'doctor_display_name',
        'facility_display_name',
      ]
    : [
        'affected_interval_label',
        'appointment_reference',
        'doctor_display_name',
        'facility_display_name',
        'replacement_instruction',
      ];
}

function exactFields(
  event: ClinicSchedulingNotificationEvent,
  fields: Record<string, unknown>,
): Record<string, string> {
  const allowed = eventFields(event);
  const keys = Object.keys(fields).toSorted();
  if (JSON.stringify(keys) !== JSON.stringify([...allowed].toSorted()))
    throw new Error('notification-field-schema-invalid');
  if (Object.values(fields).some((value) => typeof value !== 'string' || value.length === 0))
    throw new Error('notification-field-type-invalid');
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]));
}

function assertRecipientProjection(
  event: ClinicSchedulingNotificationEvent,
  recipient: ClinicSchedulingNotificationRecipient,
  release: ClinicSchedulingTemplateRelease,
): void {
  const fieldKeys = Object.keys(recipient.fields).toSorted();
  const eventKeys = [...eventFields(event)].toSorted();
  const releaseKeys = Object.keys(release.allowedFields).toSorted();
  const requiredKeys = [...release.requiredFields].toSorted();
  if (
    JSON.stringify(fieldKeys) !== JSON.stringify(eventKeys) ||
    JSON.stringify(releaseKeys) !== JSON.stringify(eventKeys) ||
    JSON.stringify(requiredKeys) !== JSON.stringify(eventKeys) ||
    Object.values(recipient.fields).some((value) => typeof value !== 'string' || value.length === 0)
  )
    throw new Error('notification-field-schema-invalid');
}

function validateRelease(release: ClinicSchedulingTemplateRelease): void {
  const placeholders = (body: string) =>
    [...body.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map((match) => match[1]!).toSorted();
  const ar = placeholders(release.arabicBody);
  const en = placeholders(release.englishBody);
  const fields = Object.keys(release.allowedFields).toSorted();
  if (
    JSON.stringify(ar) !== JSON.stringify(en) ||
    JSON.stringify(ar) !== JSON.stringify(fields) ||
    JSON.stringify(fields) !== JSON.stringify([...release.requiredFields].toSorted())
  )
    throw new Error('notification-template-schema-invalid');
  const canonical = JSON.stringify({
    template_code: release.templateCode,
    channel: release.channel,
    arabic_body: release.arabicBody,
    english_body: release.englishBody,
    allowed_recipient_types: ['patient'],
    allowed_fields: Object.fromEntries(Object.entries(release.allowedFields).toSorted()),
    required_fields: [...release.requiredFields].toSorted(),
  });
  const digest = createHash('sha256').update(canonical).digest('hex');
  if (digest !== release.contentDigest) throw new Error('notification-template-digest-mismatch');
}

function deliveryDecision(
  result: MessagingResult,
  attemptNumber: number,
  finishedAt: Date,
): { readonly outcome: ClinicNotificationOutcome; readonly retryAt?: Date } {
  if (result.outcome === 'accepted' || result.outcome === 'delivered')
    return { outcome: 'delivered' };
  const decision = retryDecision(result.outcome, attemptNumber);
  return decision.outcome === 'retry'
    ? { outcome: 'retry', retryAt: new Date(finishedAt.getTime() + decision.retryAtDelayMs) }
    : { outcome: 'dead_letter' };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && SAFE_ERROR_CODES.has(error.message)) return error.message;
  return 'clinic-notification-processing-failed';
}

const SAFE_ERROR_CODES = new Set([
  'notification-template-not-published',
  'notification-template-event-mismatch',
  'notification-recipient-schema-invalid',
  'notification-field-schema-invalid',
  'notification-template-schema-invalid',
  'notification-template-digest-mismatch',
  'notification-durable-field-schema-invalid',
  'clinic-notification-persistence-failed',
  'clinic-notification-lease-lost',
  'production-messaging-disabled',
  'synthetic-provider-receipt-missing',
  'clinic-notification-processing-failed',
]);
