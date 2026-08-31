import { createHash } from 'node:crypto';

import {
  projectDsrNotification,
  retryDecision,
} from '@shifaa/core/privacy-dsr-notifications/policy';
import type {
  DsrNotificationCode,
  NotificationTemplateRelease,
} from '@shifaa/core/privacy-dsr-notifications/types';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import type { MessagingAdapter } from './privacy-dsr-notifications.ts';

type ClaimedNotification = {
  id: string;
  source_event_id: string;
  recipient_person_id: string;
  recipient_type: 'patient';
  locale: 'ar-EG' | 'en-EG';
  field_values: Record<string, unknown>;
  attempt_count: number;
  template_code: string;
  release_id: string;
  release_version: number;
  channel: 'sms';
  arabic_body: string;
  english_body: string;
  allowed_recipient_types: readonly string[];
  allowed_field_schema: {
    properties: Record<string, { type: 'string' }>;
    required: string[];
  };
  content_digest: string;
  created_by_person_id: string;
  published_by_person_id: string;
  effective_at: Date;
  release_row_version: number;
};

export class PostgresPrivacyNotificationProcessor {
  private readonly sql: Sql;
  private readonly adapter: MessagingAdapter;
  private readonly now: () => Date;

  public constructor(databaseUrl: string, adapter: MessagingAdapter, now = () => new Date()) {
    this.sql = postgres(databaseUrl, { max: 2, prepare: true });
    this.adapter = adapter;
    this.now = now;
  }

  public close() {
    return this.sql.end({ timeout: 5 });
  }

  public processNext(): Promise<'idle' | 'delivered' | 'retry' | 'dead_letter'> {
    return this.sql.begin(async (sql) => {
      const [row] = await sql<ClaimedNotification[]>`
        select n.*,t.id release_id,t.template_code,t.release_version,t.channel,
          t.arabic_body,t.english_body,t.allowed_recipient_types,t.allowed_field_schema,
          t.content_digest,t.created_by_person_id,t.published_by_person_id,t.effective_at,
          t.version release_row_version
        from platform.notifications n
        join platform.notification_template_releases t on t.id=n.template_release_id
        where n.status in ('pending','failed') and n.next_attempt_at<=now()
          and n.recipient_type='patient'
          and t.status='published' and t.effective_at<=now()
          and t.template_code in ('DSR_SUBMITTED','DSR_STATUS_CHANGED','DSR_EXPORT_READY','DSR_IDENTITY_REQUIRED')
        order by n.next_attempt_at,n.created_at,n.id
        for update of n skip locked limit 1`;
      if (!row) return 'idle';
      await sql`update platform.notifications set status='processing',version=version+1,updated_at=${this.now()} where id=${row.id}::uuid`;
      return this.deliver(sql, row);
    }) as Promise<'idle' | 'delivered' | 'retry' | 'dead_letter'>;
  }

  private async deliver(sql: TransactionSql, row: ClaimedNotification) {
    const properties = row.allowed_field_schema.properties;
    const release: NotificationTemplateRelease = {
      id: row.release_id,
      templateCode: row.template_code,
      releaseVersion: row.release_version,
      channel: row.channel,
      arabicBody: row.arabic_body,
      englishBody: row.english_body,
      allowedRecipientTypes: row.allowed_recipient_types as readonly ['patient'],
      allowedFields: Object.fromEntries(
        Object.entries(properties).map(([name, definition]) => [name, definition.type]),
      ),
      requiredFields: row.allowed_field_schema.required,
      contentDigest: row.content_digest,
      status: 'published',
      createdByPersonId: row.created_by_person_id,
      publishedByPersonId: row.published_by_person_id,
      effectiveAt: row.effective_at.toISOString(),
      version: row.release_row_version,
    };
    const projected = projectDsrNotification({
      templateCode: row.template_code as DsrNotificationCode,
      recipientType: row.recipient_type,
      recipientPersonId: row.recipient_person_id,
      sourceEventId: row.source_event_id,
      locale: row.locale,
      fields: row.field_values,
    });
    if (!projected.allowed) throw new Error(projected.reason);
    const body = row.locale === 'ar-EG' ? release.arabicBody : release.englishBody;
    const rendered = body.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_whole, name: string) =>
      String(projected.payload?.[name]),
    );
    const attempt = row.attempt_count + 1;
    const idempotencyKey = createHash('sha256')
      .update(
        `${row.release_id}\u0000${row.source_event_id}\u0000${row.recipient_person_id}\u0000sms`,
      )
      .digest('hex');
    const started = this.now();
    const result = await this.adapter.send({
      idempotencyKey,
      destinationAlias: `SYNTHETIC-${row.recipient_person_id}`,
      renderedBody: rendered,
    });
    const finished = this.now();
    const delivered = result.outcome === 'accepted' || result.outcome === 'delivered';
    const failure =
      result.outcome === 'timeout'
        ? 'timeout'
        : result.outcome === 'transient_failure'
          ? 'transient'
          : 'permanent';
    const decision = delivered ? undefined : retryDecision(failure, attempt, 0);
    const state = delivered ? 'delivered' : decision!.state;
    const retryAt =
      decision?.state === 'retry' ? new Date(finished.getTime() + decision.delayMs) : null;
    const receiptHash = result.providerReceiptReference
      ? createHash('sha256').update(result.providerReceiptReference).digest('hex')
      : null;
    await sql`insert into platform.notification_delivery_attempts(notification_id,source_event_id,attempt_number,adapter_code,provider_idempotency_key,outcome,safe_error_code,started_at,finished_at,retry_at,provider_receipt_hash) values(${row.id}::uuid,${row.source_event_id}::uuid,${attempt},'local-synthetic',${idempotencyKey},${result.outcome},${result.safeErrorCode ?? null},${started},${finished},${retryAt},${receiptHash})`;
    await sql`update platform.notifications set status=${state === 'retry' ? 'failed' : state},attempt_count=${attempt},next_attempt_at=${retryAt ?? finished},delivered_at=${delivered ? finished : null},dead_lettered_at=${state === 'dead_letter' ? finished : null},provider_reference_hash=${receiptHash},version=version+1,updated_at=${finished} where id=${row.id}::uuid`;
    return state;
  }
}
