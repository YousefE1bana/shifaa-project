import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { LocalSyntheticMessagingAdapter } from '../../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresIdentityNotificationProcessor } from '../../services/worker/src/identity-continuity.ts';
import postgres from 'postgres';

const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const workerUrl = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa';
const subjectPersonId = '50000000-0000-4000-8000-000000000001';
const subjectPatientId = '51000000-0000-4000-8000-000000000001';
const relationshipId = '56000000-0000-4000-8000-000000000003';
const reviewerPersonId = '40000000-0000-4000-8000-000000000006';

test('transition worker gates consent, resolves the current subject, orders, retries, and deduplicates', async () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const adapter = new LocalSyntheticMessagingAdapter([
    'transient_failure',
    'delivered',
    'delivered',
  ]);
  const worker = new PostgresIdentityNotificationProcessor(
    workerUrl,
    adapter,
    `transition-worker-${randomUUID()}`,
  );
  const caseId = randomUUID();
  const submittedEventId = randomUUID();
  const decidedEventId = randomUUID();
  const currentAddress = `transition-current-${randomUUID()}@synthetic.shifaa.test`;
  try {
    await owner.begin(async (sql) => {
      await sql`
        update identity.people set email_normalized=${currentAddress},profile_status='active'
        where id=${subjectPersonId}::uuid`;
      await sql`
        insert into identity.continuity_cases(
          id,case_type,subject_person_id,subject_patient_id,relationship_id,status,
          assigned_reviewer_person_id,reviewer_person_id,decision_reason_code,decided_at,version
        ) values(
          ${caseId}::uuid,'dependent_transition',${subjectPersonId}::uuid,${subjectPatientId}::uuid,
          ${relationshipId}::uuid,'approved',${reviewerPersonId}::uuid,${reviewerPersonId}::uuid,
          'human_review.approved',statement_timestamp(),2
        )`;
      await sql`
        insert into platform.outbox_events(
          id,aggregate_type,aggregate_id,aggregate_version,event_type,payload
        ) values
          (${submittedEventId}::uuid,'identity-continuity',${caseId}::uuid,1,
           'identity.transition.submitted',${sql.json({ case_status: 'review_required', action_time: '2026-08-29T00:00:00.000Z' })}),
          (${decidedEventId}::uuid,'identity-continuity',${caseId}::uuid,2,
           'identity.transition.decided',${sql.json({ case_status: 'approved', action_time: '2026-08-29T00:01:00.000Z' })})`;
      await sql`
        update consent.processing_inventory set status='suspended'
        where process_code='identity-continuity-synthetic'`;
    });

    assert.equal(await worker.processNext(), 'idle');
    await owner`
      update consent.processing_inventory set status='active'
      where process_code='identity-continuity-synthetic'`;
    assert.equal(await worker.processNext(), 'retry');
    assert.equal(await worker.processNext(), 'idle');
    await owner`
      update platform.outbox_events set available_at=statement_timestamp()
      where id=${submittedEventId}::uuid`;
    assert.equal(await worker.processNext(), 'delivered');
    assert.equal(await worker.processNext(), 'delivered');

    const expectedAlias = `SYNTHETIC-${createHash('sha256').update(currentAddress).digest('hex')}`;
    assert.deepEqual(
      [...adapter.visibleMessages.values()].map((message) => message.destinationAlias),
      [expectedAlias, expectedAlias],
    );
    const rows = await owner<
      Array<{
        source_event_id: string;
        field_values: Record<string, unknown>;
        recipient_person_id: string;
        status: string;
      }>
    >`
      select source_event_id,field_values,recipient_person_id,status
      from platform.notifications
      where source_event_id in (${submittedEventId}::uuid,${decidedEventId}::uuid)
      order by created_at,id`;
    assert.deepEqual(
      rows.map((row) => row.source_event_id),
      [submittedEventId, decidedEventId],
    );
    assert.ok(rows.every((row) => row.recipient_person_id === subjectPersonId));
    assert.ok(rows.every((row) => row.status === 'delivered'));
    assert.ok(
      rows.every(
        (row) => Object.keys(row.field_values).toSorted().join(',') === 'action_time,case_status',
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(rows),
      /token|credential|otp|verificationCaseId|relationshipId|patientId|diagnos|clinical/i,
    );

    await owner`
      update platform.outbox_events set state='pending',available_at=statement_timestamp()
      where id=${decidedEventId}::uuid`;
    assert.equal(await worker.processNext(), 'delivered');
    assert.equal(adapter.visibleMessages.size, 2);
    assert.equal(adapter.attempts.length, 3);
  } finally {
    await worker.close();
    await owner.begin(async (sql) => {
      await sql`
        update consent.processing_inventory set status='active'
        where process_code='identity-continuity-synthetic'`;
      await sql`alter table platform.notification_delivery_attempts disable trigger user`;
      await sql`
        delete from platform.notification_delivery_attempts
        where source_event_id in (${submittedEventId}::uuid,${decidedEventId}::uuid)`;
      await sql`alter table platform.notification_delivery_attempts enable trigger user`;
      await sql`
        delete from platform.notifications
        where source_event_id in (${submittedEventId}::uuid,${decidedEventId}::uuid)`;
      await sql`
        delete from platform.event_receipts
        where event_id in (${submittedEventId}::uuid,${decidedEventId}::uuid)`;
      await sql`
        delete from platform.outbox_events
        where id in (${submittedEventId}::uuid,${decidedEventId}::uuid)`;
      await sql`delete from identity.continuity_cases where id=${caseId}::uuid`;
      await sql`
        update identity.people set email_normalized=null where id=${subjectPersonId}::uuid`;
    });
    await owner.end({ timeout: 5 });
  }
});
