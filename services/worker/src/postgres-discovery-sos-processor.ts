import { createHash } from 'node:crypto';

import { retryDecision } from '@shifaa/core/privacy-dsr-notifications/policy';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import {
  aggregateSosContactOutcomes,
  assertLocalSyntheticAdapter,
  assertSafeSosEventPayload,
  projectSosContactDelivery,
  sosFailureKind,
  sosProviderIdempotencyKey,
  type SosContactCandidate,
  type SosContactProcessingOutcome,
  type SosContactProjection,
  type SosContactTemplateRelease,
} from './discovery-sos.ts';
import type { MessagingAdapter, MessagingResult } from './privacy-dsr-notifications.ts';

type ClaimedSosContactEvent = {
  event_id: string;
  incident_id: string;
  aggregate_version: number;
  payload: Record<string, unknown>;
  attempt_count: number;
  lease_expires_at: Date;
};

type SosNotification = {
  id: string;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter';
  attempt_count: number;
  rendered_digest: string;
  field_values: Record<string, unknown>;
};

type DurableSosNotificationFields = {
  incident_id: string;
  contact_id: string;
  locale: string;
  location_precision: string;
};

type AttemptContext = {
  notification: SosNotification;
  sourceEventId: string;
  attemptNumber: number;
  providerKey: string;
  startedAt: Date;
  result: MessagingResult;
};

export class PostgresDiscoverySosProcessor {
  private readonly sql: Sql;
  private readonly adapter: MessagingAdapter;
  private readonly workerId: string;
  private readonly now: () => Date;
  private readonly environment: 'local' | 'ci';

  public constructor(
    databaseUrl: string,
    adapter: MessagingAdapter,
    workerId = `sos-contact-${process.pid}`,
    now = () => new Date(),
  ) {
    assertLocalSyntheticAdapter(adapter);
    this.environment = workerEnvironment(process.env);
    this.sql = postgres(databaseUrl, { max: 2, prepare: true });
    this.adapter = adapter;
    this.workerId = workerId;
    this.now = now;
  }

  public close() {
    return this.sql.end({ timeout: 5 });
  }

  public async processNext(): Promise<'idle' | SosContactProcessingOutcome> {
    const [event] = await this.withSyntheticEnvironment(
      (sql) =>
        sql<ClaimedSosContactEvent[]>`
        select * from platform.claim_next_sos_contact_event(${this.workerId},30)
      `,
    );
    if (!event) return 'idle';

    let outcome: SosContactProcessingOutcome;
    let safeErrorCode: string | null = null;
    try {
      assertSafeSosEventPayload(event.payload);
      outcome = await this.deliverCurrentCandidates(event);
    } catch (error) {
      const classified = classifyProcessingError(error, event.attempt_count);
      outcome = classified.outcome;
      safeErrorCode = classified.safeErrorCode;
    }

    let retryAt: Date | null = null;
    if (outcome === 'retry') {
      const eventRetry = retryDecision('transient', event.attempt_count, 0);
      if (eventRetry.state === 'dead_letter') {
        outcome = 'dead_letter';
        safeErrorCode = 'sos-contact-event-retries-exhausted';
      } else {
        retryAt = new Date(this.now().getTime() + eventRetry.delayMs);
      }
    }
    const [completed] = await this.withSyntheticEnvironment(
      (sql) =>
        sql<{ completed: boolean }[]>`
        select platform.complete_sos_contact_event(
          ${event.event_id}::uuid,
          ${this.workerId},
          ${outcome},
          ${safeErrorCode},
          ${retryAt}
        ) completed
      `,
    );
    if (!completed?.completed) throw new Error('sos-contact-event-lease-lost');
    return outcome;
  }

  private async deliverCurrentCandidates(
    event: ClaimedSosContactEvent,
  ): Promise<SosContactProcessingOutcome> {
    const candidates = await this.deliveryCandidates(event.incident_id);
    const outcomes: SosContactProcessingOutcome[] = [];
    for (const candidate of candidates) {
      const release = await this.currentTemplate(event.event_id, candidate.contact_id);
      outcomes.push(await this.deliverCandidate(event, candidate.contact_id, release));
    }
    return aggregateSosContactOutcomes(outcomes);
  }

  private deliveryCandidates(incidentId: string): Promise<SosContactCandidate[]> {
    return this.withSyntheticEnvironment(
      (sql) => sql<SosContactCandidate[]>`
      select * from platform.sos_contact_delivery_candidates(${incidentId}::uuid)
      order by contact_id
    `,
    );
  }

  private async currentCandidate(incidentId: string, contactId: string) {
    const [candidate] = await this.withSyntheticEnvironment(
      (sql) =>
        sql<SosContactCandidate[]>`
        select * from platform.sos_contact_delivery_candidates(${incidentId}::uuid)
        where contact_id=${contactId}::uuid
      `,
    );
    return candidate;
  }

  private withSyntheticEnvironment<T>(query: (sql: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => {
      await sql`select set_config('shifaa.environment',${this.environment},true)`;
      return query(sql);
    }) as Promise<T>;
  }

  private async currentTemplate(
    sourceEventId: string,
    contactId: string,
  ): Promise<SosContactTemplateRelease> {
    const [existingNotification] = await this.sql<{ template_release_id: string }[]>`
      select template_release_id from platform.notifications
      where source_event_id=${sourceEventId}::uuid
        and recipient_type='emergency_contact'
        and recipient_emergency_contact_id=${contactId}::uuid
        and channel='sms'
      order by created_at,id
      limit 1
    `;
    if (existingNotification) {
      const [existingRelease] = await this.sql<SosContactTemplateRelease[]>`
        select id,template_code,release_version,channel,arabic_body,english_body,
          allowed_recipient_types,allowed_field_schema,status,effective_at
        from platform.notification_template_releases
        where id=${existingNotification.template_release_id}::uuid
          and template_code='SOS_LIFE_SAFETY' and channel='sms'
          and status='published' and effective_at<=now()
          and allowed_recipient_types=ARRAY['emergency_contact']::text[]
      `;
      if (!existingRelease) throw new Error('sos-contact-template-unavailable');
      return existingRelease;
    }

    const [release] = await this.sql<SosContactTemplateRelease[]>`
      select id,template_code,release_version,channel,arabic_body,english_body,
        allowed_recipient_types,allowed_field_schema,status,effective_at
      from platform.notification_template_releases
      where template_code='SOS_LIFE_SAFETY' and channel='sms'
        and status='published' and effective_at<=now()
        and allowed_recipient_types=ARRAY['emergency_contact']::text[]
      order by release_version desc,id
      limit 1
    `;
    if (!release) throw new Error('sos-contact-template-unavailable');
    return release;
  }

  private async deliverCandidate(
    event: ClaimedSosContactEvent,
    contactId: string,
    release: SosContactTemplateRelease,
  ): Promise<SosContactProcessingOutcome> {
    const candidate = await this.currentCandidate(event.incident_id, contactId);
    if (!candidate) return 'delivered';
    const projection = projectSosContactDelivery(candidate, release);
    const notification = await this.notification(event, release, projection);
    if (notification.status === 'delivered') return 'delivered';
    if (notification.status === 'dead_letter') return 'dead_letter';

    const sendCandidate = await this.currentCandidate(event.incident_id, contactId);
    if (!sendCandidate) return 'delivered';
    const sendProjection = projectSosContactDelivery(sendCandidate, release);
    const sendNotification = await this.refreshNotification(notification.id, event, sendProjection);
    if (sendNotification.status === 'delivered') return 'delivered';
    if (sendNotification.status === 'dead_letter') return 'dead_letter';

    const attemptNumber = sendNotification.attempt_count + 1;
    const providerKey = sosProviderIdempotencyKey({
      releaseId: release.id,
      sourceEventId: event.event_id,
      contactId: sendCandidate.contact_id,
    });
    const startedAt = this.now();
    const result = await this.adapter.send({
      idempotencyKey: providerKey,
      destinationAlias: sendProjection.destinationAlias,
      renderedBody: sendProjection.renderedBody,
    });
    return this.recordAttempt({
      notification: sendNotification,
      sourceEventId: event.event_id,
      attemptNumber,
      providerKey,
      startedAt,
      result,
    });
  }

  private async notification(
    event: ClaimedSosContactEvent,
    release: SosContactTemplateRelease,
    projection: SosContactProjection,
  ): Promise<SosNotification> {
    const durableFields = durableNotificationFields(event, projection);
    await this.sql`
      insert into platform.notifications(
        source_event_id,template_release_id,recipient_type,recipient_emergency_contact_id,
        locale,channel,field_values,rendered_digest
      ) values(
        ${event.event_id}::uuid,${release.id}::uuid,'emergency_contact',${projection.contactId}::uuid,
        ${projection.locale},'sms',${this.sql.json(durableFields)},${projection.renderedDigest}
      ) on conflict do nothing
    `;
    const [notification] = await this.sql<SosNotification[]>`
      select id,status,attempt_count,rendered_digest,field_values
      from platform.notifications
      where template_release_id=${release.id}::uuid
        and source_event_id=${event.event_id}::uuid
        and recipient_type='emergency_contact'
        and recipient_emergency_contact_id=${projection.contactId}::uuid
        and channel='sms'
    `;
    if (!notification) throw new Error('sos-contact-notification-persistence-failed');
    assertSafeDurableFieldShape(notification.field_values, event, projection.contactId);
    return notification;
  }

  private async refreshNotification(
    notificationId: string,
    event: ClaimedSosContactEvent,
    projection: SosContactProjection,
  ): Promise<SosNotification> {
    const durableFields = durableNotificationFields(event, projection);
    const [refreshed] = await this.sql<SosNotification[]>`
      update platform.notifications set
        locale=${projection.locale},field_values=${this.sql.json(durableFields)},
        rendered_digest=${projection.renderedDigest},version=version+1,updated_at=${this.now()}
      where id=${notificationId}::uuid and status in ('pending','processing','failed')
      returning id,status,attempt_count,rendered_digest,field_values
    `;
    if (refreshed) {
      assertNotificationProjection(refreshed, event, projection);
      return refreshed;
    }
    const [terminal] = await this.sql<SosNotification[]>`
      select id,status,attempt_count,rendered_digest,field_values
      from platform.notifications where id=${notificationId}::uuid
    `;
    if (!terminal) throw new Error('sos-contact-notification-missing');
    assertSafeDurableFieldShape(terminal.field_values, event, projection.contactId);
    return terminal;
  }

  private recordAttempt(context: AttemptContext): Promise<SosContactProcessingOutcome> {
    return this.sql.begin((sql) =>
      persistAttempt({
        sql,
        ...context,
        finishedAt: this.now(),
      }),
    ) as Promise<SosContactProcessingOutcome>;
  }
}

async function persistAttempt(input: {
  sql: TransactionSql;
  notification: SosNotification;
  sourceEventId: string;
  attemptNumber: number;
  providerKey: string;
  startedAt: Date;
  finishedAt: Date;
  result: MessagingResult;
}): Promise<SosContactProcessingOutcome> {
  const [current] = await input.sql<SosNotification[]>`
    select id,status,attempt_count,rendered_digest,field_values
    from platform.notifications where id=${input.notification.id}::uuid for update
  `;
  if (!current) throw new Error('sos-contact-notification-missing');
  if (current.status === 'delivered') return 'delivered';
  if (current.status === 'dead_letter') return 'dead_letter';
  if (current.attempt_count >= input.attemptNumber) return statusOutcome(current.status);

  const delivered = ['accepted', 'delivered'].includes(input.result.outcome);
  const decision = delivered
    ? undefined
    : retryDecision(sosFailureKind(input.result.outcome), input.attemptNumber, 0);
  const outcome = delivered ? 'delivered' : decision!.state;
  const retryAt =
    decision?.state === 'retry' ? new Date(input.finishedAt.getTime() + decision.delayMs) : null;
  const receiptHash = input.result.providerReceiptReference
    ? createHash('sha256').update(input.result.providerReceiptReference).digest('hex')
    : null;
  await input.sql`
    insert into platform.notification_delivery_attempts(
      notification_id,source_event_id,attempt_number,adapter_code,provider_idempotency_key,
      outcome,safe_error_code,started_at,finished_at,retry_at,provider_receipt_hash
    ) values(
      ${current.id}::uuid,${input.sourceEventId}::uuid,${input.attemptNumber},'local-synthetic',
      ${input.providerKey},${input.result.outcome},${input.result.safeErrorCode ?? null},
      ${input.startedAt},${input.finishedAt},${retryAt},${receiptHash}
    ) on conflict(notification_id,attempt_number) do nothing
  `;
  await input.sql`
    update platform.notifications set
      status=${outcome === 'retry' ? 'failed' : outcome},attempt_count=${input.attemptNumber},
      next_attempt_at=${retryAt ?? input.finishedAt},delivered_at=${delivered ? input.finishedAt : null},
      dead_lettered_at=${outcome === 'dead_letter' ? input.finishedAt : null},
      provider_reference_hash=${receiptHash},version=version+1,updated_at=${input.finishedAt}
    where id=${current.id}::uuid and attempt_count<${input.attemptNumber}
  `;
  return outcome;
}

function statusOutcome(status: SosNotification['status']): SosContactProcessingOutcome {
  if (status === 'delivered') return 'delivered';
  if (status === 'dead_letter') return 'dead_letter';
  return 'retry';
}

function durableNotificationFields(
  event: ClaimedSosContactEvent,
  projection: SosContactProjection,
): DurableSosNotificationFields {
  return {
    incident_id: event.incident_id,
    contact_id: projection.contactId,
    locale: projection.locale,
    location_precision: projection.locationPrecision,
  };
}

function assertSafeDurableFieldShape(
  actual: Record<string, unknown>,
  event: ClaimedSosContactEvent,
  contactId: string,
): void {
  const keys = Object.keys(actual).toSorted();
  const expectedKeys = ['contact_id', 'incident_id', 'locale', 'location_precision'];
  if (
    JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
    actual.incident_id !== event.incident_id ||
    actual.contact_id !== contactId ||
    !['ar-EG', 'en-EG'].includes(String(actual.locale)) ||
    !['none', 'coarse', 'exact'].includes(String(actual.location_precision))
  )
    throw new Error('sos-contact-dedup-payload-mismatch');
}

function durableFieldsEqual(
  actual: Record<string, unknown>,
  expected: DurableSosNotificationFields,
): boolean {
  const actualEntries = Object.entries(actual).toSorted(([left], [right]) =>
    left.localeCompare(right),
  );
  const expectedEntries = Object.entries(expected).toSorted(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function assertNotificationProjection(
  notification: SosNotification,
  event: ClaimedSosContactEvent,
  projection: SosContactProjection,
): void {
  assertSafeDurableFieldShape(notification.field_values, event, projection.contactId);
  const terminal = ['delivered', 'dead_letter'].includes(notification.status);
  const expected = durableNotificationFields(event, projection);
  if (
    !terminal &&
    (!durableFieldsEqual(notification.field_values, expected) ||
      notification.rendered_digest !== projection.renderedDigest)
  )
    throw new Error('sos-contact-dedup-payload-mismatch');
}

const permanentProcessingErrors = new Set([
  'sos-contact-dedup-payload-mismatch',
  'sos-contact-incident-inactive',
  'sos-contact-incident-time-invalid',
  'sos-contact-locale-invalid',
  'sos-contact-location-overdisclosure',
  'sos-contact-location-precision-invalid',
  'sos-contact-location-unavailable',
  'sos-contact-required-field-missing',
  'sos-contact-source-field-denied',
  'sos-contact-template-content-denied',
  'sos-contact-template-governance-invalid',
  'sos-contact-template-placeholder-invalid',
  'sos-contact-template-schema-invalid',
  'sos-contact-template-unavailable',
]);

function classifyProcessingError(error: unknown, attemptNumber: number) {
  const message = error instanceof Error ? error.message : 'sos-contact-processing-failed';
  if (permanentProcessingErrors.has(message))
    return { outcome: 'dead_letter' as const, safeErrorCode: message.slice(0, 96) };
  const decision = retryDecision('transient', attemptNumber, 0);
  return {
    outcome: decision.state,
    safeErrorCode: 'sos-contact-transient-failure',
  };
}

function workerEnvironment(environment: NodeJS.ProcessEnv): 'local' | 'ci' {
  if (environment['NODE_ENV'] === 'production') throw new Error('production-messaging-disabled');
  return environment['NODE_ENV'] === 'test' || environment['CI'] === 'true' ? 'ci' : 'local';
}
