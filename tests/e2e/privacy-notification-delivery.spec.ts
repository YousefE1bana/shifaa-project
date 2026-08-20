import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { LocalSyntheticMessagingAdapter } from '@shifaa/worker/adapters/local-synthetic-messaging';
import { PostgresPrivacyNotificationProcessor } from '@shifaa/worker/privacy-dsr-notifications';
import postgres from 'postgres';

const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const workerUrl = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa';

test('real PostgreSQL workers claim once and persist one minimum visible delivery', async () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const adapter = new LocalSyntheticMessagingAdapter();
  const first = new PostgresPrivacyNotificationProcessor(workerUrl, adapter);
  const second = new PostgresPrivacyNotificationProcessor(workerUrl, adapter);
  const sourceEvent = randomUUID();
  const notification = randomUUID();
  const aggregate = randomUUID();
  try {
    await owner.begin(async (sql) => {
      await sql`insert into platform.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) values(${sourceEvent}::uuid,'privacy-dsr',${aggregate}::uuid,1,'notification.delivery.requested',${sql.json({ request_reference: 'DSR-E2E-005' })})`;
      await sql`insert into platform.notifications(id,source_event_id,template_release_id,recipient_type,recipient_person_id,locale,channel,field_values,rendered_digest) values(${notification}::uuid,${sourceEvent}::uuid,'54000000-0000-4000-8000-000000000001','patient','50000000-0000-4000-8000-000000000001','ar-EG','sms',${sql.json({ due_date_label: '17 days', request_reference: 'DSR-E2E-005', request_type_label: 'access', submitted_date: '2026-08-13', support_path: '/privacy/requests' })},${createHash('sha256').update('synthetic-minimum').digest('hex')})`;
    });
    const outcomes = await Promise.all([first.processNext(), second.processNext()]);
    assert.deepEqual(outcomes.toSorted(), ['delivered', 'idle']);
    const [persisted] = await owner<
      any[]
    >`select n.status,n.attempt_count,count(a.id)::int attempts,n.field_values from platform.notifications n left join platform.notification_delivery_attempts a on a.notification_id=n.id where n.id=${notification}::uuid group by n.id`;
    assert.deepEqual(
      {
        status: persisted.status,
        attempt_count: persisted.attempt_count,
        attempts: persisted.attempts,
      },
      { status: 'delivered', attempt_count: 1, attempts: 1 },
    );
    assert.equal(adapter.visibleMessages.size, 1);
    assert.doesNotMatch(JSON.stringify(persisted), /phone|diagnos|token|rendered_body/i);
  } finally {
    await first.close();
    await second.close();
    await owner.begin(async (sql) => {
      await sql`alter table platform.notification_delivery_attempts disable trigger user`;
      await sql`delete from platform.notification_delivery_attempts where notification_id=${notification}::uuid`;
      await sql`alter table platform.notification_delivery_attempts enable trigger user`;
      await sql`delete from platform.notifications where id=${notification}::uuid`;
      await sql`delete from platform.outbox_events where id=${sourceEvent}::uuid`;
    });
    await owner.end({ timeout: 5 });
  }
});
