import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalTemplateDigest } from '@shifaa/core/privacy-dsr-notifications/policy';

import {
  DurableClinicSchedulingSyntheticMessagingAdapter,
  LocalSyntheticMessagingAdapter,
  ProductionMessagingAdapterDisabled,
} from './adapters/local-synthetic-messaging.ts';
import type {
  ClinicSchedulingNotificationPorts,
  ClinicSchedulingNotificationEvent,
  ClinicSchedulingNotificationRecipient,
  ClinicSchedulingNotificationRecord,
  ClinicSchedulingNotificationAttempt,
  ClinicSchedulingTemplateRelease,
  ClinicNotificationOutcome,
  ClinicNotificationState,
} from './clinic-scheduling-notifications.ts';
import { PostgresClinicSchedulingNotificationProcessor } from './postgres-clinic-scheduling-notification-processor.ts';

type Candidate = {
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
  placeholder_names: string[];
  content_digest: string;
  status: 'candidate';
  publisher_person_id: null;
  published_at: null;
};

const candidateDocument = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/009-clinic-scheduling-appointments-queue/contracts/notification-template-candidates.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { status: 'candidate'; publication: null; templates: Candidate[] };

function event(
  eventType: ClinicSchedulingNotificationEvent['eventType'] = 'clinical.doctor_delay.declared.v1',
  attemptCount = 1,
): ClinicSchedulingNotificationEvent {
  return {
    eventId: '10000000-0000-4000-8000-000000000001',
    eventType,
    aggregateId: '20000000-0000-4000-8000-000000000001',
    aggregateVersion: 1,
    attemptCount,
    leaseExpiresAt: '2026-09-20T10:00:30.000Z',
  };
}

function release(candidate: Candidate): ClinicSchedulingTemplateRelease {
  return {
    id:
      candidate.template_code === 'CLINIC_DOCTOR_DELAY'
        ? '30000000-0000-4000-8000-000000000001'
        : '30000000-0000-4000-8000-000000000002',
    templateCode: candidate.template_code,
    releaseVersion: candidate.release_version,
    channel: 'sms',
    arabicBody: candidate.arabic_body,
    englishBody: candidate.english_body,
    allowedRecipientTypes: ['patient'],
    allowedFields: Object.fromEntries(
      Object.entries(candidate.allowed_field_schema.properties).map(([key, value]) => [
        key,
        value.type,
      ]),
    ),
    requiredFields: candidate.allowed_field_schema.required,
    contentDigest: candidate.content_digest,
    status: 'published',
    effectiveAt: '2026-09-20T09:00:00.000Z',
    version: 1,
  };
}

function recipient(
  eventType: ClinicSchedulingNotificationEvent['eventType'],
  locale: 'ar-EG' | 'en-EG' = 'en-EG',
  extra: Record<string, string> = {},
): ClinicSchedulingNotificationRecipient {
  const fields =
    eventType === 'clinical.doctor_delay.declared.v1'
      ? {
          action_reference: 'appointment',
          appointment_reference: 'appointment-1',
          delay_date_label: '2026-09-20',
          delay_minutes_label: '15 minutes',
          doctor_display_name: 'Synthetic Doctor',
          facility_display_name: 'Synthetic Clinic',
        }
      : {
          affected_interval_label: '2026-09-20 10:00 - 11:00',
          appointment_reference: 'appointment-1',
          doctor_display_name: 'Synthetic Doctor',
          facility_display_name: 'Synthetic Clinic',
          replacement_instruction: 'Use the appointment screen to choose a replacement.',
        };
  return {
    recipientPersonId: '40000000-0000-4000-8000-000000000001',
    locale,
    fields: { ...fields, ...extra } as unknown as Record<string, string>,
  };
}

class FakeNotificationStore implements ClinicSchedulingNotificationPorts {
  public readonly clock = { now: () => new Date('2026-09-20T10:00:00.000Z') };
  public readonly completed: Array<{ eventId: string; outcome: ClinicNotificationOutcome }> = [];
  public readonly safeErrors: string[] = [];
  public readonly retryTimes: string[] = [];
  public readonly attempts: ClinicSchedulingNotificationAttempt[] = [];
  public readonly telemetry: {
    emit: (input: { outcome: ClinicNotificationOutcome | 'idle' }) => void;
  } = {
    emit: () => undefined,
  };
  public eventQueue: ClinicSchedulingNotificationEvent[] = [];
  public release: ClinicSchedulingTemplateRelease | null = null;
  public recipients: ClinicSchedulingNotificationRecipient[] = [];
  public records = new Map<string, ClinicSchedulingNotificationRecord>();

  public async claimNext(): Promise<ClinicSchedulingNotificationEvent | null> {
    return this.eventQueue.shift() ?? null;
  }

  public async completeClaim(input: {
    eventId: string;
    workerId: string;
    outcome: ClinicNotificationOutcome;
    safeErrorCode?: string;
    retryAt?: string;
  }): Promise<boolean> {
    this.completed.push({ eventId: input.eventId, outcome: input.outcome });
    if (input.safeErrorCode) this.safeErrors.push(input.safeErrorCode);
    if (input.retryAt) this.retryTimes.push(input.retryAt);
    return true;
  }

  public async resolveCurrentRecipients(): Promise<
    readonly ClinicSchedulingNotificationRecipient[]
  > {
    return this.recipients;
  }

  public async resolvePublishedRelease(): Promise<ClinicSchedulingTemplateRelease | null> {
    return this.release;
  }

  public async ensureNotification(input: {
    event: ClinicSchedulingNotificationEvent;
    recipient: ClinicSchedulingNotificationRecipient;
    release: ClinicSchedulingTemplateRelease;
    renderedDigest: string;
  }): Promise<ClinicSchedulingNotificationRecord> {
    const id = `${input.event.eventId}:${input.recipient.recipientPersonId}:${input.recipient.fields['appointment_reference'] ?? ''}`;
    const previous = this.records.get(id);
    if (previous) return previous;
    const created: ClinicSchedulingNotificationRecord = {
      id,
      sourceEventId: input.event.eventId,
      templateReleaseId: input.release.id,
      recipientPersonId: input.recipient.recipientPersonId,
      locale: input.recipient.locale,
      fieldValues: input.recipient.fields,
      renderedDigest: input.renderedDigest,
      state: 'pending',
      attemptCount: 0,
      nextAttemptAt: this.clock.now().toISOString(),
    };
    this.records.set(id, created);
    return created;
  }

  public async recordAttempt(input: ClinicSchedulingNotificationAttempt): Promise<void> {
    this.attempts.push(input);
  }

  public async finalizeNotification(input: {
    notificationId: string;
    attemptNumber: number;
    outcome: ClinicNotificationOutcome;
    finishedAt: string;
    retryAt?: string;
  }): Promise<void> {
    const previous = this.records.get(input.notificationId);
    assert.ok(previous);
    this.records.set(input.notificationId, {
      ...previous,
      state: input.outcome === 'retry' ? 'failed' : input.outcome,
      attemptCount: input.attemptNumber,
      nextAttemptAt: input.retryAt ?? input.finishedAt,
    });
  }
}

test('candidate artifacts are publishable through the Feature 005 digest contract but remain unpublished', () => {
  assert.equal(candidateDocument.status, 'candidate');
  assert.equal(candidateDocument.publication, null);
  assert.equal(candidateDocument.templates.length, 2);
  for (const candidate of candidateDocument.templates) {
    const placeholders = (body: string) =>
      [...body.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map((m) => m[1]!).toSorted();
    assert.deepEqual(placeholders(candidate.arabic_body), placeholders(candidate.english_body));
    assert.deepEqual(
      placeholders(candidate.arabic_body),
      [...candidate.placeholder_names].toSorted(),
    );
    const allowedFields = Object.fromEntries(
      Object.entries(candidate.allowed_field_schema.properties).map(([key, value]) => [
        key,
        value.type,
      ]),
    );
    assert.equal(
      canonicalTemplateDigest({
        templateCode: candidate.template_code,
        channel: 'sms',
        arabicBody: candidate.arabic_body,
        englishBody: candidate.english_body,
        allowedRecipientTypes: candidate.allowed_recipient_types,
        allowedFields,
        requiredFields: candidate.allowed_field_schema.required,
      }),
      candidate.content_digest,
    );
    assert.equal(candidate.publisher_person_id, null);
    assert.equal(candidate.published_at, null);
    assert.deepEqual(
      Object.keys(candidate.allowed_field_schema.properties).filter((key) =>
        /diagnosis|reason|phone|email|token|destination|contact/i.test(key),
      ),
      [],
    );
  }
});

test('unpublished releases never dispatch and remain bounded retry work', async () => {
  const store = new FakeNotificationStore();
  store.eventQueue = [event()];
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'retry');
  assert.equal(adapter.attempts.length, 0);
  assert.deepEqual(store.completed, [{ eventId: event().eventId, outcome: 'retry' }]);
  assert.equal(store.retryTimes.length, 1);
  assert.ok(new Date(store.retryTimes[0]!).getTime() > Date.now());
});

test('unpublished releases dead-letter at the bounded attempt and carry a future retry only before exhaustion', async () => {
  const store = new FakeNotificationStore();
  store.eventQueue = [event(undefined, 3)];
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'dead_letter');
  assert.equal(adapter.attempts.length, 0);
  assert.deepEqual(store.completed, [{ eventId: event().eventId, outcome: 'dead_letter' }]);
  assert.equal(store.retryTimes.length, 0);
});

test('unknown thrown text is replaced with a closed safe processing code', async () => {
  const candidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(candidate);
  store.recipients = [recipient(event().eventType)];
  store.eventQueue = [event()];
  const adapter = {
    code: 'local-synthetic' as const,
    send: async () => {
      throw new Error('raw-contact-token-+201001234567');
    },
  };
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'retry');
  assert.deepEqual(store.safeErrors, ['clinic-notification-processing-failed']);
});

test('adapter throws record an immutable transient attempt before bounded retry', async () => {
  const candidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(candidate);
  store.recipients = [recipient(event().eventType)];
  store.eventQueue = [event(), event(undefined, 2)];
  let sends = 0;
  const adapter = {
    code: 'local-synthetic' as const,
    send: async () => {
      sends += 1;
      if (sends === 1) throw new Error('raw-contact-destination-token-sentinel');
      return { outcome: 'delivered' as const, providerReceiptReference: 'synthetic-receipt' };
    },
  };
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');

  assert.equal(await worker.processNext(), 'retry');
  const firstAttempt = [...store.records.values()][0]!;
  assert.equal(firstAttempt.state, 'failed');
  assert.equal(firstAttempt.attemptCount, 1);
  assert.equal(store.attempts.length, 1);
  assert.equal(store.attempts[0]!.attemptNumber, 1);
  assert.equal(store.attempts[0]!.outcome, 'transient_failure');
  assert.equal(store.attempts[0]!.safeErrorCode, 'clinic-notification-processing-failed');
  assert.deepEqual(store.completed, [{ eventId: event().eventId, outcome: 'retry' }]);
  assert.deepEqual(store.safeErrors, ['clinic-notification-processing-failed']);

  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(sends, 2);
  const completed = [...store.records.values()][0]!;
  assert.equal(completed.state, 'delivered');
  assert.equal(completed.attemptCount, 2);
  assert.deepEqual(
    store.attempts.map((attempt) => attempt.attemptNumber),
    [1, 2],
  );
  assert.equal(
    store.attempts.some(
      (attempt) => attempt.safeErrorCode === 'raw-contact-destination-token-sentinel',
    ),
    false,
  );
});

test('published delay and absence fixtures use current locale projection and synthetic receipts only', async () => {
  const delayCandidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const absenceCandidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_ABSENCE',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(delayCandidate);
  store.recipients = [recipient(event().eventType, 'ar-EG')];
  store.eventQueue = [event()];
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(adapter.visibleMessages.size, 1);
  assert.match([...adapter.visibleMessages.values()][0]!.destinationAlias, /^SYNTHETIC-/);

  store.release = release(absenceCandidate);
  store.recipients = [recipient('clinical.doctor_absence.declared.v1', 'en-EG')];
  store.eventQueue = [
    {
      ...event('clinical.doctor_absence.declared.v1'),
      eventId: '10000000-0000-4000-8000-000000000002',
    },
  ];
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(adapter.visibleMessages.size, 2);
});

test('one patient with two affected appointments receives two scoped notices and replay dedups each appointment', async () => {
  const candidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(candidate);
  store.recipients = [
    recipient(event().eventType, 'en-EG', { appointment_reference: 'appointment-1' }),
    recipient(event().eventType, 'en-EG', { appointment_reference: 'appointment-2' }),
  ];
  store.eventQueue = [event(), event()];
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(adapter.attempts.length, 2);
  assert.equal(store.records.size, 2);
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(adapter.attempts.length, 2);
  assert.equal(store.records.size, 2);
});

test('replay is deduplicated, superseded delay has no recipients, and transient failure is bounded', async () => {
  const candidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(candidate);
  store.recipients = [recipient(event().eventType)];
  store.eventQueue = [event(), event()];
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(adapter.attempts.length, 1);

  store.recipients = [];
  store.eventQueue = [event()];
  assert.equal(await worker.processNext(), 'delivered');
  assert.equal(adapter.attempts.length, 1);

  const retryStore = new FakeNotificationStore();
  retryStore.release = release(candidate);
  retryStore.recipients = [recipient(event().eventType)];
  retryStore.eventQueue = [event(), event(undefined, 2)];
  const retryAdapter = new LocalSyntheticMessagingAdapter(['transient_failure', 'delivered']);
  const retryWorker = new PostgresClinicSchedulingNotificationProcessor(
    retryStore,
    retryAdapter,
    'worker-test',
  );
  assert.equal(await retryWorker.processNext(), 'retry');
  assert.equal(await retryWorker.processNext(), 'delivered');
  assert.deepEqual(
    retryStore.attempts.map((item) => item.attemptNumber),
    [1, 2],
  );
});

test('permanent adapter failure dead-letters without changing a claimed domain event', async () => {
  const candidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(candidate);
  store.recipients = [recipient(event().eventType)];
  store.eventQueue = [event()];
  const adapter = new LocalSyntheticMessagingAdapter(['permanent_failure']);
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'dead_letter');
  assert.equal(store.records.values().next().value?.state, 'dead_letter');
  assert.deepEqual(store.completed, [{ eventId: event().eventId, outcome: 'dead_letter' }]);
});

test('recipient and release schema separation rejects extra fields before adapter dispatch', async () => {
  const candidate = candidateDocument.templates.find(
    (item) => item.template_code === 'CLINIC_DOCTOR_DELAY',
  )!;
  const store = new FakeNotificationStore();
  store.release = release(candidate);
  store.recipients = [
    recipient(event().eventType, 'en-EG', { reason: 'raw reason must not cross projection' }),
  ];
  store.eventQueue = [event()];
  const adapter = new LocalSyntheticMessagingAdapter();
  const worker = new PostgresClinicSchedulingNotificationProcessor(store, adapter, 'worker-test');
  assert.equal(await worker.processNext(), 'retry');
  assert.equal(adapter.attempts.length, 0);
  assert.equal(store.records.size, 0);
});

test('production adapter boundary fails closed', () => {
  const store = new FakeNotificationStore();
  assert.throws(
    () =>
      new PostgresClinicSchedulingNotificationProcessor(
        store,
        new ProductionMessagingAdapterDisabled() as never,
      ),
    /production-messaging-disabled/,
  );
});

test('migration exposes only worker EXECUTE seams and no direct clinical grant', () => {
  const migration = readFileSync(
    new URL(
      '../../../supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(migration, /claim_next_clinic_scheduling_notification_event/);
  assert.match(migration, /clinic_scheduling_notification_recipients\(uuid,text\)/);
  assert.match(migration, /complete_clinic_scheduling_notification_event/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO shifaa_worker/);
  assert.doesNotMatch(migration, /GRANT SELECT ON clinical\./);
  assert.match(migration, /feature_enabled\('clinic_scheduling\.dispatch'/);
  assert.match(migration, /lease_owner=p_worker_id/);
  assert.match(
    migration,
    /p_safe_error_code IS NOT NULL AND p_safe_error_code !~ '\^\[a-z0-9\._-\]\{1,64\}\$'/,
  );
  assert.match(migration, /p_retry_at>statement_timestamp\(\)\+interval '1 day'/);
  assert.match(migration, /e\.version=event_row\.aggregate_version/);
  assert.match(migration, /deliver_clinic_scheduling_local_synthetic_message/);
  assert.match(migration, /delivery_scope_key text NOT NULL DEFAULT ''/);
  assert.match(migration, /guard_notification_delivery_scope/);
  assert.match(migration, /non-clinic notification delivery scope is not permitted/);
  assert.match(
    migration,
    /NEW\.delivery_scope_key<>COALESCE\(NEW\.field_values->>'appointment_reference',''\)/,
  );
  assert.match(migration, /DROP CONSTRAINT %I/);
});

test('durable clinic adapter calls the Feature 009 seam, independent of SOS', () => {
  assert.equal(typeof DurableClinicSchedulingSyntheticMessagingAdapter, 'function');
  const adapterSource = readFileSync(
    new URL('./adapters/local-synthetic-messaging.ts', import.meta.url),
    'utf8',
  );
  const clinicAdapterSection = adapterSource.slice(
    adapterSource.indexOf('DurableClinicSchedulingSyntheticMessagingAdapter'),
  );
  assert.match(clinicAdapterSection, /deliver_clinic_scheduling_local_synthetic_message/);
  assert.doesNotMatch(clinicAdapterSection, /deliver_local_synthetic_message/);
});
