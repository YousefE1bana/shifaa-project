import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  DurableLocalSyntheticMessagingAdapter,
  LocalSyntheticMessagingAdapter,
} from '../../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresDiscoverySosProcessor } from '../../services/worker/src/discovery-sos.ts';
import type {
  MessagingAdapter,
  MessagingResult,
} from '../../services/worker/src/privacy-dsr-notifications.ts';
import {
  createDiscoverySosStack,
  key,
  person,
  workerDatabaseUrl,
} from './discovery-sos-stack-harness.ts';

type Stack = Awaited<ReturnType<typeof createDiscoverySosStack>>;
type Precision = 'none' | 'coarse' | 'exact';
type DurableNotification = {
  id: string;
  status: string;
  attempt_count: number;
  field_values: Record<string, unknown>;
  rendered_digest: string;
};
type DeliveryAttempt = {
  attempt_number: number;
  provider_idempotency_key: string;
  outcome: string;
};

class AcceptThenUncertainAdapter implements MessagingAdapter {
  public readonly code = 'local-synthetic' as const;
  public readonly attempts: string[] = [];
  public readonly visibleMessages = new Map<string, string>();

  public constructor() {}

  public async send(input: {
    idempotencyKey: string;
    destinationAlias: string;
    renderedBody: string;
  }): Promise<MessagingResult> {
    this.attempts.push(input.idempotencyKey);
    if (this.visibleMessages.has(input.idempotencyKey))
      return {
        outcome: 'delivered',
        providerReceiptReference: `synthetic-receipt-${input.idempotencyKey.slice(0, 16)}`,
      };
    this.visibleMessages.set(
      input.idempotencyKey,
      createHash('sha256').update(input.renderedBody).digest('hex'),
    );
    return { outcome: 'timeout', safeErrorCode: 'synthetic-timeout-after-accept' };
  }
}

class CrashAfterDurableAcceptAdapter implements MessagingAdapter {
  public readonly code = 'local-synthetic' as const;
  public readonly attempts: string[] = [];
  public constructor(private readonly delegate: DurableLocalSyntheticMessagingAdapter) {}
  public async send(input: {
    idempotencyKey: string;
    destinationAlias: string;
    renderedBody: string;
  }): Promise<MessagingResult> {
    this.attempts.push(input.idempotencyKey);
    await this.delegate.send(input);
    throw new Error('synthetic-crash-after-durable-provider-accept');
  }
}

async function activateContactSos(stack: Stack, label: string): Promise<string> {
  const response = await stack.app.inject({
    method: 'POST',
    url: '/v1/sos/incidents',
    headers: {
      authorization: person(stack.ids.people.patient),
      'x-shifaa-patient-context': stack.ids.patients.subject,
      'x-purpose': 'emergency_care',
      'idempotency-key': key(label),
    },
    payload: {
      managed_patient_id: stack.ids.patients.subject,
      coordinates: stack.ids.locations.activation,
      qualifying_reason_code: 'medical_emergency',
      contact_preference: 'all_confirmed',
      callback_source: 'patient_verified_contact',
      explicit_activation: true,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().incident.incident_id;
}

async function setContactPrecision(stack: Stack, precision: Precision): Promise<void> {
  await stack.owner.begin(async (sql) => {
    await sql`alter table identity.emergency_contacts disable trigger user`;
    await sql`
      update identity.emergency_contacts set location_precision=${precision}
      where id=${stack.ids.contact.confirmed}::uuid
    `;
    await sql`alter table identity.emergency_contacts enable trigger user`;
  });
}

async function releaseRetry(stack: Stack): Promise<void> {
  await stack.owner`
    update platform.outbox_events set available_at=statement_timestamp()-interval '1 second'
    where event_type='sos.emergency_contact.requested' and state='pending'
  `;
}

async function notificationForIncident(
  stack: Stack,
  incidentId: string,
): Promise<DurableNotification> {
  const [notification] = await stack.owner<DurableNotification[]>`
    select n.id,n.status,n.attempt_count,n.field_values,n.rendered_digest
    from platform.notifications n
    join platform.outbox_events e on e.id=n.source_event_id
    where e.aggregate_id=${incidentId}::uuid and n.recipient_type='emergency_contact'
  `;
  assert.ok(notification);
  return notification;
}

async function attemptsForNotification(
  stack: Stack,
  notificationId: string,
): Promise<DeliveryAttempt[]> {
  return stack.owner<DeliveryAttempt[]>`
    select attempt_number,provider_idempotency_key,outcome
    from platform.notification_delivery_attempts
    where notification_id=${notificationId}::uuid order by attempt_number
  `;
}

function assertSafeDurableProjection(
  notification: DurableNotification,
  incidentId: string,
  contactId: string,
  precision: Precision,
): void {
  assert.deepEqual(notification.field_values, {
    incident_id: incidentId,
    contact_id: contactId,
    locale: 'ar-EG',
    location_precision: precision,
  });
  assert.match(notification.rendered_digest, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(notification.field_values),
    /Synthetic SOS Patient|\+999|30\.10|31\.20|needs urgent|مساعدة عاجلة/,
  );
}

test('durable notification fields remain minimum for none, coarse, and exact delivery', async () => {
  const stack = await createDiscoverySosStack();
  const adapter = new LocalSyntheticMessagingAdapter();
  const processor = new PostgresDiscoverySosProcessor(workerDatabaseUrl, adapter);
  try {
    for (const precision of ['none', 'coarse', 'exact'] as const) {
      await stack.clean();
      await setContactPrecision(stack, precision);
      const incidentId = await activateContactSos(stack, `durable-${precision}`);
      assert.equal(await processor.processNext(), 'delivered');
      const notification = await notificationForIncident(stack, incidentId);
      assertSafeDurableProjection(notification, incidentId, stack.ids.contact.confirmed, precision);
    }
  } finally {
    await setContactPrecision(stack, 'coarse');
    await processor.close();
    await stack.close();
  }
});

test('timeout after provider acceptance reuses one key and creates one visible delivery', async () => {
  const stack = await createDiscoverySosStack();
  const adapter = new AcceptThenUncertainAdapter();
  const processor = new PostgresDiscoverySosProcessor(workerDatabaseUrl, adapter);
  try {
    const incidentId = await activateContactSos(stack, 'timeout-after-accept');
    assert.equal(await processor.processNext(), 'retry');
    assert.equal(adapter.visibleMessages.size, 1);
    await releaseRetry(stack);
    assert.equal(await processor.processNext(), 'delivered');
    assert.equal(adapter.visibleMessages.size, 1);
    assert.equal(adapter.attempts.length, 2);
    assert.equal(adapter.attempts[0], adapter.attempts[1]);

    const notification = await notificationForIncident(stack, incidentId);
    assertSafeDurableProjection(notification, incidentId, stack.ids.contact.confirmed, 'coarse');
    const attempts = await attemptsForNotification(stack, notification.id);
    assert.deepEqual(
      attempts.map((attempt) => attempt.provider_idempotency_key),
      Array(attempts.length).fill(adapter.attempts[0]),
    );
    assert.deepEqual(
      attempts.map((attempt) => attempt.attempt_number),
      [1, 2],
    );
  } finally {
    await processor.close();
    await stack.close();
  }
});

test('worker restart after durable provider acceptance preserves one visible delivery', async () => {
  const stack = await createDiscoverySosStack();
  const firstProvider = new DurableLocalSyntheticMessagingAdapter(workerDatabaseUrl);
  const crashAdapter = new CrashAfterDurableAcceptAdapter(firstProvider);
  const firstWorker = new PostgresDiscoverySosProcessor(
    workerDatabaseUrl,
    crashAdapter,
    'sos-contact-before-restart',
  );
  let secondProvider: DurableLocalSyntheticMessagingAdapter | undefined;
  let secondWorker: PostgresDiscoverySosProcessor | undefined;
  try {
    const incidentId = await activateContactSos(stack, 'restart-after-accept');
    assert.equal(await firstWorker.processNext(), 'retry');
    await firstWorker.close();
    await firstProvider.close();

    await releaseRetry(stack);
    secondProvider = new DurableLocalSyntheticMessagingAdapter(workerDatabaseUrl);
    secondWorker = new PostgresDiscoverySosProcessor(
      workerDatabaseUrl,
      secondProvider,
      'sos-contact-after-restart',
    );
    assert.equal(await secondWorker.processNext(), 'delivered');

    const receipts = await stack.owner<
      { provider_idempotency_key: string; visible_count: number }[]
    >`
      select provider_idempotency_key,count(*)::integer visible_count
      from platform.synthetic_message_receipts
      group by provider_idempotency_key
    `;
    assert.deepEqual(
      [...receipts],
      [{ provider_idempotency_key: crashAdapter.attempts[0], visible_count: 1 }],
    );
    const notification = await notificationForIncident(stack, incidentId);
    const attempts = await attemptsForNotification(stack, notification.id);
    assert.deepEqual(
      attempts.map((attempt) => attempt.attempt_number),
      [1],
    );
    assert.equal(attempts[0]?.provider_idempotency_key, crashAdapter.attempts[0]);
  } finally {
    await secondWorker?.close();
    await secondProvider?.close();
    if (!secondWorker) await firstWorker.close().catch(() => undefined);
    if (!secondProvider) await firstProvider.close().catch(() => undefined);
    await stack.close();
  }
});

test('retry rechecks the current consented precision before delivery', async () => {
  const stack = await createDiscoverySosStack();
  const retryAdapter = new LocalSyntheticMessagingAdapter(['transient_failure', 'delivered']);
  const retryProcessor = new PostgresDiscoverySosProcessor(workerDatabaseUrl, retryAdapter);
  try {
    await setContactPrecision(stack, 'coarse');
    const incidentId = await activateContactSos(stack, 'current-recheck');
    assert.equal(await retryProcessor.processNext(), 'retry');
    assert.equal(retryAdapter.visibleMessages.size, 0);
    await setContactPrecision(stack, 'exact');
    await releaseRetry(stack);
    assert.equal(await retryProcessor.processNext(), 'delivered');
    assert.equal(retryAdapter.visibleMessages.size, 1);
    assert.equal(retryAdapter.attempts[0], retryAdapter.attempts[1]);
    const delivered = await notificationForIncident(stack, incidentId);
    assertSafeDurableProjection(delivered, incidentId, stack.ids.contact.confirmed, 'exact');
  } finally {
    await setContactPrecision(stack, 'coarse');
    await retryProcessor.close();
    await stack.close();
  }
});

test('permanent provider failure enters the DLQ without visible delivery', async () => {
  const stack = await createDiscoverySosStack();
  const adapter = new LocalSyntheticMessagingAdapter(['permanent_failure']);
  const processor = new PostgresDiscoverySosProcessor(workerDatabaseUrl, adapter);
  try {
    const incidentId = await activateContactSos(stack, 'permanent-dlq');
    assert.equal(await processor.processNext(), 'dead_letter');
    assert.equal(adapter.visibleMessages.size, 0);
    const notification = await notificationForIncident(stack, incidentId);
    assert.equal(notification.status, 'dead_letter');
    assert.equal(notification.attempt_count, 1);
    assertSafeDurableProjection(notification, incidentId, stack.ids.contact.confirmed, 'coarse');
  } finally {
    await processor.close();
    await stack.close();
  }
});
