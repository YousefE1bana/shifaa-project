import { createHash } from 'node:crypto';

import { retryDecision } from '@shifaa/core/privacy-dsr-notifications/policy';
import postgres, { type Sql } from 'postgres';

import type { MessagingAdapter, MessagingResult } from './privacy-dsr-notifications.ts';

export const FACTOR_CHANGED_TEMPLATE_CODE = 'IDENTITY_FACTOR_CHANGED';
export const RECOVERY_COMPLETED_TEMPLATE_CODE = 'IDENTITY_RECOVERY_COMPLETED';
const notificationFields = ['action_time', 'support_action'] as const;
const factorPayloadFields = ['action_time', 'recipientPersonId', 'support_action'] as const;
const recoveryPayloadFields = ['action_time', 'support_action'] as const;
const prohibited = /(?:otp|token|password|credential|proof|factor|handle|email|phone|diagnos|phi)/i;
const placeholder = /\{\{([a-z][a-z0-9_]*)\}\}/g;
const syntheticAddressAlias = /^SYNTHETIC-[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IdentityEvent = {
  event_id: string;
  event_type: 'identity.factor.changed' | 'identity.recovery.completed';
  payload: Record<string, unknown>;
  attempt_count: number;
  recipient_person_id: string | null;
  locale: 'ar-EG' | 'en-EG' | null;
  destination_alias: string | null;
};

type IdentityTemplate = {
  id: string;
  template_code: string;
  channel: 'sms';
  arabic_body: string;
  english_body: string;
  allowed_recipient_types: readonly string[];
  allowed_field_schema: { properties: Record<string, { type: string }>; required: string[] };
};

type DeliveryAttempt = {
  event: IdentityEvent;
  notification: { id: string; attempt_count: number };
  idempotencyKey: string;
  result: MessagingResult;
  outcome: IdentityNotificationOutcome;
  started: Date;
  finished: Date;
  retryAt: Date | null;
  receiptHash: string | null;
};

export type IdentityNotificationOutcome = 'delivered' | 'retry' | 'dead_letter';

export function projectIdentityNotification(input: {
  event: Pick<
    IdentityEvent,
    'event_type' | 'payload' | 'recipient_person_id' | 'locale' | 'destination_alias'
  >;
  template: IdentityTemplate;
}) {
  assertIdentityPayload(input.event);
  assertIdentityTemplate(input.event.event_type, input.template);
  const fields = {
    action_time: String(input.event.payload.action_time),
    support_action: String(input.event.payload.support_action),
  };
  const renderedBody = (
    input.event.locale === 'ar-EG' ? input.template.arabic_body : input.template.english_body
  ).replace(placeholder, (_whole, field: string) => fields[field as keyof typeof fields] ?? '');
  return {
    fields,
    renderedBody,
    renderedDigest: createHash('sha256').update(renderedBody).digest('hex'),
    destinationAlias: input.event.destination_alias!,
  };
}

export class PostgresIdentityNotificationProcessor {
  private readonly sql: Sql;
  private readonly adapter: MessagingAdapter;
  private readonly workerId: string;
  private readonly now: () => Date;

  public constructor(
    databaseUrl: string,
    adapter: MessagingAdapter,
    workerId = `identity-notification-${process.pid}`,
    now = () => new Date(),
  ) {
    if (adapter.code !== 'local-synthetic') throw new Error('production-messaging-disabled');
    this.sql = postgres(databaseUrl, { max: 2, prepare: true });
    this.adapter = adapter;
    this.workerId = workerId;
    this.now = now;
  }

  public close() {
    return this.sql.end({ timeout: 5 });
  }

  public async processNext(): Promise<'idle' | IdentityNotificationOutcome> {
    const [event] = await this.sql<IdentityEvent[]>`
      select * from platform.claim_next_identity_notification_event(${this.workerId},30)`;
    if (!event) return 'idle';
    let outcome: IdentityNotificationOutcome;
    let errorCode: string | null = null;
    try {
      outcome = await this.deliver(event);
    } catch {
      const decision = retryDecision('transient', event.attempt_count, 0);
      outcome = decision.state === 'dead_letter' ? 'dead_letter' : 'retry';
      errorCode = 'identity-notification-failed';
    }
    const retry = retryDecision('transient', event.attempt_count, 0);
    const retryAt =
      outcome === 'retry' && retry.state === 'retry'
        ? new Date(this.now().getTime() + retry.delayMs)
        : null;
    const [completed] = await this.sql<{ completed: boolean }[]>`
      select platform.complete_identity_notification_event(
        ${event.event_id}::uuid,${this.workerId},${outcome},${errorCode},${retryAt}
      ) completed`;
    if (!completed?.completed) throw new Error('identity-notification-lease-lost');
    return outcome;
  }

  private async deliver(event: IdentityEvent): Promise<IdentityNotificationOutcome> {
    const templateCode = templateCodeFor(event.event_type);
    const [template] = await this.sql<IdentityTemplate[]>`
      select id,template_code,channel,arabic_body,english_body,allowed_recipient_types,allowed_field_schema
      from platform.notification_template_releases
      where template_code=${templateCode} and channel='sms'
        and status='published' and effective_at<=now()
      order by release_version desc,id limit 1`;
    if (!template) throw new Error('identity-notification-template-unavailable');
    const projection = projectIdentityNotification({ event, template });
    const recipientPersonId = event.recipient_person_id!;
    const notification = await this.sql.begin(async (sql) => {
      await sql`
        insert into platform.notifications(
          source_event_id,template_release_id,recipient_type,recipient_person_id,locale,channel,field_values,rendered_digest
        ) values(
          ${event.event_id}::uuid,${template.id}::uuid,'patient',${recipientPersonId}::uuid,
          ${event.locale},'sms',${sql.json(projection.fields)},${projection.renderedDigest}
        ) on conflict do nothing`;
      const [current] = await sql<{ id: string; status: string; attempt_count: number }[]>`
        select id,status,attempt_count from platform.notifications
        where template_release_id=${template.id}::uuid and source_event_id=${event.event_id}::uuid
          and recipient_type='patient' and recipient_person_id=${recipientPersonId}::uuid and channel='sms'
        for update`;
      if (!current) throw new Error('identity-notification-persistence-failed');
      if (current.status === 'delivered') return { ...current, terminal: 'delivered' as const };
      if (current.status === 'dead_letter') return { ...current, terminal: 'dead_letter' as const };
      const [claimed] = await sql<{ id: string; attempt_count: number }[]>`
        update platform.notifications set status='processing',version=version+1,updated_at=${this.now()}
        where id=${current.id}::uuid and status in ('pending','failed','processing')
        returning id,attempt_count`;
      if (!claimed) throw new Error('identity-notification-claim-lost');
      return { ...claimed, terminal: null };
    });
    if (notification.terminal) return notification.terminal;
    return this.send(event, template, projection, notification);
  }

  private async send(
    event: IdentityEvent,
    template: IdentityTemplate,
    projection: ReturnType<typeof projectIdentityNotification>,
    notification: { id: string; attempt_count: number },
  ): Promise<IdentityNotificationOutcome> {
    const idempotencyKey = createHash('sha256')
      .update(`${template.id}\u0000${event.event_id}\u0000${event.recipient_person_id}\u0000sms`)
      .digest('hex');
    const started = this.now();
    const result = await this.adapter.send({
      idempotencyKey,
      destinationAlias: projection.destinationAlias,
      renderedBody: projection.renderedBody,
    });
    const finished = this.now();
    const outcome = notificationOutcome(result, notification.attempt_count + 1);
    const retry =
      outcome === 'retry' ? retryDecision('transient', notification.attempt_count + 1, 0) : null;
    const retryAt = retry?.state === 'retry' ? new Date(finished.getTime() + retry.delayMs) : null;
    const receiptHash = result.providerReceiptReference
      ? createHash('sha256').update(result.providerReceiptReference).digest('hex')
      : null;
    await this.persistAttempt({
      event,
      notification,
      idempotencyKey,
      result,
      outcome,
      started,
      finished,
      retryAt,
      receiptHash,
    });
    return outcome;
  }

  private async persistAttempt(attempt: DeliveryAttempt) {
    const { event, notification, idempotencyKey, result, outcome } = attempt;
    const { started, finished, retryAt, receiptHash } = attempt;
    await this.sql.begin(async (sql) => {
      await sql`
        insert into platform.notification_delivery_attempts(
          notification_id,source_event_id,attempt_number,adapter_code,provider_idempotency_key,outcome,
          safe_error_code,started_at,finished_at,retry_at,provider_receipt_hash
        ) values(
          ${notification.id}::uuid,${event.event_id}::uuid,${notification.attempt_count + 1},'local-synthetic',
          ${idempotencyKey},${result.outcome},${result.safeErrorCode ?? null},${started},${finished},${retryAt},${receiptHash}
        )`;
      await sql`
        update platform.notifications set
          status=${outcome === 'retry' ? 'failed' : outcome},attempt_count=${notification.attempt_count + 1},
          next_attempt_at=${retryAt ?? finished},delivered_at=${outcome === 'delivered' ? finished : null},
          dead_lettered_at=${outcome === 'dead_letter' ? finished : null},provider_reference_hash=${receiptHash},
          version=version+1,updated_at=${finished}
        where id=${notification.id}::uuid`;
    });
  }
}

function templateCodeFor(eventType: IdentityEvent['event_type']): string {
  return eventType === 'identity.factor.changed'
    ? FACTOR_CHANGED_TEMPLATE_CODE
    : RECOVERY_COMPLETED_TEMPLATE_CODE;
}

function notificationOutcome(
  result: MessagingResult,
  attempt: number,
): IdentityNotificationOutcome {
  if (result.outcome === 'accepted' || result.outcome === 'delivered') return 'delivered';
  const failure =
    result.outcome === 'timeout'
      ? 'timeout'
      : result.outcome === 'transient_failure'
        ? 'transient'
        : 'permanent';
  return retryDecision(failure, attempt, 0).state;
}

function assertIdentityPayload(
  event: Pick<
    IdentityEvent,
    'event_type' | 'payload' | 'recipient_person_id' | 'locale' | 'destination_alias'
  >,
): void {
  const expected =
    event.event_type === 'identity.factor.changed' ? factorPayloadFields : recoveryPayloadFields;
  if (Object.keys(event.payload).toSorted().join(',') !== [...expected].toSorted().join(','))
    throw new Error('identity-notification-payload-denied');
  if (
    !event.recipient_person_id ||
    !uuid.test(event.recipient_person_id) ||
    !event.locale ||
    !event.destination_alias ||
    !syntheticAddressAlias.test(event.destination_alias)
  )
    throw new Error('identity-notification-recipient-denied');
  if (
    event.event_type === 'identity.factor.changed' &&
    event.payload.recipientPersonId !== event.recipient_person_id
  )
    throw new Error('identity-notification-recipient-denied');
  if (
    Object.entries(event.payload).some(
      ([key, value]) =>
        typeof value !== 'string' ||
        (key !== 'recipientPersonId' && prohibited.test(`${key}\n${value}`)),
    )
  )
    throw new Error('identity-notification-payload-denied');
}

function assertIdentityTemplate(
  eventType: IdentityEvent['event_type'],
  template: IdentityTemplate,
): void {
  if (
    template.template_code !== templateCodeFor(eventType) ||
    template.channel !== 'sms' ||
    template.allowed_recipient_types.length !== 1 ||
    template.allowed_recipient_types[0] !== 'patient'
  )
    throw new Error('identity-notification-template-governance-invalid');
  const fields = Object.keys(template.allowed_field_schema.properties).toSorted();
  const required = [...template.allowed_field_schema.required].toSorted();
  if (
    JSON.stringify(fields) !== JSON.stringify([...notificationFields].toSorted()) ||
    JSON.stringify(required) !== JSON.stringify([...notificationFields].toSorted()) ||
    fields.some((field) => template.allowed_field_schema.properties[field]?.type !== 'string') ||
    prohibited.test(`${template.arabic_body}\n${template.english_body}`)
  )
    throw new Error('identity-notification-template-governance-invalid');
  for (const body of [template.arabic_body, template.english_body]) {
    const fieldsInBody = [...body.matchAll(placeholder)].map((match) => match[1]!).toSorted();
    if (JSON.stringify(fieldsInBody) !== JSON.stringify([...notificationFields].toSorted()))
      throw new Error('identity-notification-template-governance-invalid');
  }
}
