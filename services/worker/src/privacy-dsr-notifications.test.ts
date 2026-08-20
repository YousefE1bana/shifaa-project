import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalTemplateDigest } from '@shifaa/core/privacy-dsr-notifications/policy';
import type { NotificationTemplateRelease } from '@shifaa/core/privacy-dsr-notifications/types';

import {
  LocalSyntheticMessagingAdapter,
  ProductionMessagingAdapterDisabled,
} from './adapters/local-synthetic-messaging.ts';
import {
  PrivacyNotificationWorker,
  type PrivacyNotificationEvent,
} from './privacy-dsr-notifications.ts';

function release(): NotificationTemplateRelease {
  const base = {
    id: '54000000-0000-4000-8000-000000000003',
    templateCode: 'DSR_EXPORT_READY',
    releaseVersion: 1,
    channel: 'sms' as const,
    arabicBody: '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
    englishBody: '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
    allowedRecipientTypes: ['patient'] as const,
    allowedFields: {
      privacy_requests_path: 'string' as const,
      ready_until_label: 'string' as const,
      request_reference: 'string' as const,
    },
    requiredFields: ['privacy_requests_path', 'ready_until_label', 'request_reference'],
    status: 'published' as const,
    createdByPersonId: 'author',
    publishedByPersonId: 'publisher',
    effectiveAt: '2026-08-13T09:00:00.000Z',
    version: 2,
  };
  return { ...base, contentDigest: canonicalTemplateDigest(base) };
}
function event(version = 1): PrivacyNotificationEvent {
  return {
    templateCode: 'DSR_EXPORT_READY',
    recipientType: 'patient',
    recipientPersonId: 'patient',
    sourceEventId: 'event-005',
    locale: 'ar-EG',
    fields: {
      privacy_requests_path: '/privacy/requests',
      ready_until_label: 'five minutes',
      request_reference: 'DSR-005',
    },
    aggregateId: 'request-005',
    aggregateVersion: version,
    destinationAlias: 'SYNTHETIC-PATIENT-005',
  };
}

describe('privacy notification worker', () => {
  it('deduplicates concurrent and repeated visible delivery', async () => {
    const adapter = new LocalSyntheticMessagingAdapter();
    const worker = new PrivacyNotificationWorker(adapter);
    const [first, second] = await Promise.all([
      worker.consume(event(), release()),
      worker.consume(event(), release()),
    ]);
    assert.equal(first.visibleDeliveries, 1);
    assert.deepEqual(second, first);
    assert.equal(adapter.visibleMessages.size, 1);
    assert.equal((await worker.consume(event(), release())).visibleDeliveries, 1);
    assert.equal(adapter.visibleMessages.size, 1);
  });

  it('uses bounded retry then delivers without duplicate visibility', async () => {
    const adapter = new LocalSyntheticMessagingAdapter(['transient_failure', 'delivered']);
    const worker = new PrivacyNotificationWorker(
      adapter,
      () => new Date('2026-08-13T09:00:00.000Z'),
    );
    const first = await worker.consume(event(), release());
    assert.equal(first.state, 'retry');
    assert.equal(first.nextAttemptAt, '2026-08-13T09:01:00.000Z');
    const second = await worker.consume(event(), release());
    assert.equal(second.state, 'delivered');
    assert.equal(adapter.visibleMessages.size, 1);
  });

  it('dead-letters permanent failure and rejects aggregate gaps and PHI', async () => {
    const adapter = new LocalSyntheticMessagingAdapter(['permanent_failure']);
    const worker = new PrivacyNotificationWorker(adapter);
    assert.equal((await worker.consume(event(), release())).state, 'dead_letter');
    await assert.rejects(
      () => worker.consume({ ...event(3), sourceEventId: 'event-gap' }, release()),
      /aggregate-gap/,
    );
    const unsafe = {
      ...event(),
      sourceEventId: 'event-unsafe',
      fields: { ...event().fields, diagnosis: 'SYNTHETIC-DIAGNOSIS' },
    };
    await assert.rejects(
      () =>
        new PrivacyNotificationWorker(new LocalSyntheticMessagingAdapter()).consume(
          unsafe,
          release(),
        ),
      /field-denied/,
    );
  });

  it('keeps production SMS hard-disabled', async () => {
    await assert.rejects(() => new ProductionMessagingAdapterDisabled().send(), /OPEN-VENDOR-002/);
  });
});
