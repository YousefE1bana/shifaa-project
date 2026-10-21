import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { LocalSyntheticMessagingAdapter } from '../../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresIdentityNotificationProcessor } from '../../services/worker/src/identity-continuity.ts';
import postgres from 'postgres';

const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const workerUrl = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa';

test('real recovery worker projects one completed bound patient notification without contact or recovery secrets', async () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const adapter = new LocalSyntheticMessagingAdapter();
  const first = new PostgresIdentityNotificationProcessor(workerUrl, adapter, 'recovery-worker-a');
  const second = new PostgresIdentityNotificationProcessor(workerUrl, adapter, 'recovery-worker-b');
  const personId = randomUUID();
  const caseId = randomUUID();
  const eventId = randomUUID();
  try {
    await owner.begin(async (sql) => {
      await sql`
        insert into identity.people(id,user_id,email_normalized,preferred_locale,profile_status)
        values(${personId}::uuid,${randomUUID()}::uuid,'recovery-worker@synthetic.shifaa.test','en-EG','active')`;
      await sql`
        insert into identity.continuity_cases(
          id,case_type,subject_person_id,status,public_token_digest,recovery_handle_digest,
          token_key_version,expires_at,completed_at
        ) values(
          ${caseId}::uuid,'account_recovery',${personId}::uuid,'completed',
          decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),1,
          statement_timestamp()+interval '15 minutes',statement_timestamp()
        )`;
      await sql`
        insert into platform.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload)
        values(
          ${eventId}::uuid,'identity-continuity',${caseId}::uuid,1,'identity.recovery.completed',
          ${sql.json({ support_action: 'completed', action_time: '2026-08-27T00:00:00.000Z' })}
        )`;
    });
    const outcomes = await Promise.all([first.processNext(), second.processNext()]);
    assert.deepEqual(outcomes.toSorted(), ['delivered', 'idle']);
    const [notification] = await owner<
      Array<{
        status: string;
        attempt_count: number;
        field_values: Record<string, unknown>;
        recipient_type: string;
      }>
    >`
      select status,attempt_count,field_values,recipient_type
      from platform.notifications where source_event_id=${eventId}::uuid`;
    assert.deepEqual(notification, {
      status: 'delivered',
      attempt_count: 1,
      recipient_type: 'patient',
      field_values: { action_time: '2026-08-27T00:00:00.000Z', support_action: 'completed' },
    });
    assert.equal(adapter.visibleMessages.size, 1);
    const [event] = await owner<Array<{ state: string }>>`
      select state from platform.outbox_events where id=${eventId}::uuid`;
    assert.equal(event?.state, 'delivered');
  } finally {
    await first.close();
    await second.close();
    await owner.begin(async (sql) => {
      await sql`alter table platform.notification_delivery_attempts disable trigger user`;
      await sql`
        delete from platform.notification_delivery_attempts where source_event_id=${eventId}::uuid`;
      await sql`alter table platform.notification_delivery_attempts enable trigger user`;
      await sql`delete from platform.notifications where source_event_id=${eventId}::uuid`;
      await sql`delete from platform.event_receipts where event_id=${eventId}::uuid`;
      await sql`delete from platform.outbox_events where id=${eventId}::uuid`;
      await sql`delete from identity.continuity_cases where id=${caseId}::uuid`;
      await sql`delete from identity.people where id=${personId}::uuid`;
    });
    await owner.end({ timeout: 5 });
  }
});

test('factor worker resolves only the owner current active address and deduplicates replay', async () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const adapter = new LocalSyntheticMessagingAdapter(['transient_failure', 'delivered']);
  const worker = new PostgresIdentityNotificationProcessor(workerUrl, adapter, 'factor-worker');
  const personId = randomUUID();
  const factorId = randomUUID();
  const eventId = randomUUID();
  const staleAddress = 'factor-owner-stale@synthetic.shifaa.test';
  const currentAddress = 'factor-owner-current@synthetic.shifaa.test';
  try {
    await owner`
      insert into identity.people(id,user_id,email_normalized,preferred_locale,profile_status)
      values(${personId}::uuid,${randomUUID()}::uuid,${staleAddress},'ar-EG','active')`;
    await owner`
      insert into platform.outbox_events(
        id,aggregate_type,aggregate_id,aggregate_version,event_type,payload
      ) values(
        ${eventId}::uuid,'identity-continuity',${factorId}::uuid,1,'identity.factor.changed',
        ${owner.json({
          recipientPersonId: personId,
          support_action: 'verified',
          action_time: '2026-08-27T00:00:00.000Z',
        })}
      )`;
    await owner`
      update identity.people set email_normalized=${currentAddress},updated_at=statement_timestamp()
      where id=${personId}::uuid`;

    assert.equal(await worker.processNext(), 'retry');
    await owner`update platform.outbox_events set available_at=statement_timestamp() where id=${eventId}::uuid`;
    assert.equal(await worker.processNext(), 'delivered');
    const expectedAlias = `SYNTHETIC-${createHash('sha256').update(currentAddress).digest('hex')}`;
    const staleAlias = `SYNTHETIC-${createHash('sha256').update(staleAddress).digest('hex')}`;
    assert.deepEqual(
      [...adapter.visibleMessages.values()].map((message) => message.destinationAlias),
      [expectedAlias],
    );
    assert.ok(
      [...adapter.visibleMessages.values()].every(
        (message) => message.destinationAlias !== staleAlias,
      ),
    );

    await owner`
      update platform.outbox_events set state='pending',available_at=statement_timestamp()
      where id=${eventId}::uuid`;
    assert.equal(await worker.processNext(), 'delivered');
    assert.equal(adapter.visibleMessages.size, 1);
    assert.equal(adapter.attempts.length, 2);

    const [durable] = await owner<
      Array<{
        payload: Record<string, unknown>;
        field_values: Record<string, unknown>;
        last_error_code: string | null;
      }>
    >`
      select e.payload,n.field_values,e.last_error_code
      from platform.outbox_events e join platform.notifications n on n.source_event_id=e.id
      where e.id=${eventId}::uuid`;
    assert.deepEqual(Object.keys(durable!.payload).toSorted(), [
      'action_time',
      'recipientPersonId',
      'support_action',
    ]);
    assert.deepEqual(durable!.field_values, {
      action_time: '2026-08-27T00:00:00.000Z',
      support_action: 'verified',
    });
    assert.doesNotMatch(
      JSON.stringify(durable),
      /otp|token|password|credential|proof|secret|qr|email|phone|diagnos|phi/i,
    );
  } finally {
    await worker.close();
    await owner.begin(async (sql) => {
      await sql`alter table platform.notification_delivery_attempts disable trigger user`;
      await sql`delete from platform.notification_delivery_attempts where source_event_id=${eventId}::uuid`;
      await sql`alter table platform.notification_delivery_attempts enable trigger user`;
      await sql`delete from platform.notifications where source_event_id=${eventId}::uuid`;
      await sql`delete from platform.event_receipts where event_id=${eventId}::uuid`;
      await sql`delete from platform.outbox_events where id=${eventId}::uuid`;
      await sql`delete from identity.people where id=${personId}::uuid`;
    });
    await owner.end({ timeout: 5 });
  }
});

test('factor worker rejects inactive owners into bounded DLQ without an Emergency Contact fallback', async () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresIdentityNotificationProcessor(workerUrl, adapter, 'factor-dlq-worker');
  const personId = randomUUID();
  const eventId = randomUUID();
  try {
    await owner`
      insert into identity.people(id,user_id,email_normalized,preferred_locale,profile_status)
      values(
        ${personId}::uuid,${randomUUID()}::uuid,'unverified-owner@synthetic.shifaa.test',
        'en-EG','pending'
      )`;
    await owner`
      insert into platform.outbox_events(
        id,aggregate_type,aggregate_id,aggregate_version,event_type,payload
      ) values(
        ${eventId}::uuid,'identity-continuity',${randomUUID()}::uuid,1,'identity.factor.changed',
        ${owner.json({
          recipientPersonId: personId,
          support_action: 'removed',
          action_time: '2026-08-27T00:00:00.000Z',
        })}
      )`;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const outcome = await worker.processNext();
      assert.equal(outcome, attempt === 6 ? 'dead_letter' : 'retry');
      await owner`
        update platform.outbox_events set available_at=statement_timestamp()
        where id=${eventId}::uuid and state='pending'`;
    }
    assert.equal(adapter.visibleMessages.size, 0);
    const [event] = await owner<Array<{ state: string; last_error_code: string }>>`
      select state,last_error_code from platform.outbox_events where id=${eventId}::uuid`;
    assert.deepEqual(event, {
      state: 'dead_letter',
      last_error_code: 'identity-notification-failed',
    });
    const [functionSource] = await owner<Array<{ source: string }>>`
      select pg_get_functiondef('platform.claim_next_identity_notification_event(text,integer)'::regprocedure) source`;
    assert.doesNotMatch(functionSource!.source, /auth\.|emergency_contacts|client.*header/i);
  } finally {
    await worker.close();
    await owner.begin(async (sql) => {
      await sql`delete from platform.event_receipts where event_id=${eventId}::uuid`;
      await sql`delete from platform.outbox_events where id=${eventId}::uuid`;
      await sql`delete from identity.people where id=${personId}::uuid`;
    });
    await owner.end({ timeout: 5 });
  }
});
