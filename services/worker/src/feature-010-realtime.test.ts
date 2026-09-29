import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const sourceUrl = new URL('./feature-010-realtime.ts', import.meta.url);
const realtimeModule = existsSync(sourceUrl)
  ? ((await import(sourceUrl.href)) as Record<string, unknown>)
  : undefined;

const messageId = '6b1f0d0c-5fdc-4e91-8e08-ef1651c7e001';
const appointmentId = '6b1f0d0c-5fdc-4e91-8e08-ef1651c7e002';
const markerEventId = '6b1f0d0c-5fdc-4e91-8e08-ef1651c7e003';
const workerId = 'feature-010-realtime-test-worker';
const now = new Date('2026-09-30T08:00:00.000Z');
const prohibitedBodyCanary = 'C23_BODY_CANARY_MUST_NOT_ESCAPE_5e37a6';

type Outcome = 'delivered' | 'retry' | 'dead_letter';
type ClaimedMarker = {
  eventId: string;
  eventType: 'clinical.context_message.created.v1';
  aggregateType: 'context_message';
  aggregateId: string;
  aggregateVersion: number;
  contextId: string | null;
  attemptCount: number;
  leaseExpiresAt: string;
  readonly [key: string]: unknown;
};
type RefreshHint = { eventId: string; contextId: string; version: number };
type Completion = {
  eventId: string;
  workerId: string;
  outcome: Outcome;
  safeErrorCode?: string;
  retryAt?: string;
};
type RealtimePorts = {
  claimNext(input: {
    workerId: string;
    leaseSeconds: number;
    now: string;
  }): Promise<ClaimedMarker | null>;
  completeClaim(input: Completion): Promise<boolean>;
};
type RefreshHintSink = { publish(hint: RefreshHint): Promise<void> };
type ProcessorConstructor = new (
  ports: RealtimePorts,
  sink: RefreshHintSink,
  workerId: string,
  clock: () => Date,
) => { processNext(): Promise<'idle' | Outcome> };

function processorConstructor(): ProcessorConstructor {
  assert.ok(
    realtimeModule,
    'C23_REALTIME_BOUNDARY_MISSING: services/worker/src/feature-010-realtime.ts',
  );
  const constructor = realtimeModule['Feature010RealtimeHintProcessor'];
  assert.equal(
    typeof constructor,
    'function',
    'C23_REALTIME_BOUNDARY_MISSING: Feature010RealtimeHintProcessor export',
  );
  return constructor as ProcessorConstructor;
}

function marker(overrides: Partial<ClaimedMarker> = {}): ClaimedMarker {
  return {
    eventId: markerEventId,
    eventType: 'clinical.context_message.created.v1',
    aggregateType: 'context_message',
    aggregateId: messageId,
    aggregateVersion: 1,
    contextId: appointmentId,
    attemptCount: 1,
    leaseExpiresAt: '2026-09-30T08:00:30.000Z',
    ...overrides,
  };
}

class FakeRealtimePorts implements RealtimePorts {
  public readonly claims: ClaimedMarker[] = [];
  public readonly completions: Completion[] = [];
  public completionAccepted = true;
  public readonly completionResults: boolean[] = [];

  public async claimNext(): Promise<ClaimedMarker | null> {
    return this.claims.shift() ?? null;
  }

  public async completeClaim(input: Completion): Promise<boolean> {
    this.completions.push(input);
    return this.completionResults.shift() ?? this.completionAccepted;
  }
}

class FakeRefreshHintSink implements RefreshHintSink {
  public readonly hints: RefreshHint[] = [];
  public failure: Error | null = null;

  public async publish(hint: RefreshHint): Promise<void> {
    if (this.failure) throw this.failure;
    this.hints.push(hint);
  }
}

function processor(ports: FakeRealtimePorts, sink: FakeRefreshHintSink) {
  const Processor = processorConstructor();
  return new Processor(ports, sink, workerId, () => new Date(now));
}

describe('Feature 010 realtime refresh hints', () => {
  it('accepts a context-message marker and publishes only its minimum refresh projection', async () => {
    const ports = new FakeRealtimePorts();
    const sink = new FakeRefreshHintSink();
    ports.claims.push(marker());

    const outcome = await processor(ports, sink).processNext();

    assert.equal(outcome, 'delivered');
    assert.deepEqual(sink.hints[0], {
      eventId: markerEventId,
      contextId: appointmentId,
      version: 1,
    });
    assert.equal(ports.completions[0]?.outcome, 'delivered');
  });

  it('keeps duplicate marker retries stable and returns idle when no hint is available', async () => {
    const ports = new FakeRealtimePorts();
    const sink = new FakeRefreshHintSink();
    ports.claims.push(marker(), marker());
    const worker = processor(ports, sink);

    assert.equal(await worker.processNext(), 'delivered');
    assert.equal(await worker.processNext(), 'delivered');
    assert.equal(await worker.processNext(), 'idle');

    assert.equal(sink.hints.length, 2);
    assert.equal(
      JSON.stringify(sink.hints[0]) === JSON.stringify(sink.hints[1]),
      true,
      'duplicate marker delivery must produce the same idempotent refresh hint',
    );
    assert.deepEqual(Object.keys(sink.hints[0] ?? {}).toSorted(), [
      'contextId',
      'eventId',
      'version',
    ]);
  });

  it('uses the shared retry schedule and records only a fixed safe error code', async () => {
    const retryDelaysMs = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
    for (let attemptCount = 1; attemptCount <= retryDelaysMs.length; attemptCount += 1) {
      const ports = new FakeRealtimePorts();
      const sink = new FakeRefreshHintSink();
      ports.claims.push(marker({ attemptCount }));
      sink.failure = new Error(prohibitedBodyCanary);

      const outcome = await processor(ports, sink).processNext();
      const completion = ports.completions[0];
      const retryDelta = Date.parse(completion?.retryAt ?? '') - now.getTime();
      const baseDelay = retryDelaysMs[attemptCount - 1]!;

      assert.equal(outcome, 'retry');
      assert.equal(completion?.outcome, 'retry');
      assert.equal(
        typeof completion?.safeErrorCode === 'string' &&
          /^[a-z0-9._-]{1,64}$/.test(completion.safeErrorCode) &&
          !completion.safeErrorCode.includes(prohibitedBodyCanary),
        true,
      );
      assert.equal(retryDelta >= baseDelay * 0.9 && retryDelta <= baseDelay * 1.1, true);
    }
  });

  it('dead-letters malformed body-free projections without publishing or retaining poison data', async () => {
    const ports = new FakeRealtimePorts();
    const sink = new FakeRefreshHintSink();
    ports.claims.push(
      marker({
        contextId: null,
        payload: { aggregateId: messageId, version: 1, bodyCiphertext: prohibitedBodyCanary },
        bodyCiphertext: prohibitedBodyCanary,
      }),
    );

    const outcome = await processor(ports, sink).processNext();
    const captured = JSON.stringify({ hints: sink.hints, completions: ports.completions });

    assert.equal(outcome, 'dead_letter');
    assert.equal(sink.hints.length, 0);
    assert.equal(ports.completions[0]?.outcome, 'dead_letter');
    assert.equal(
      typeof ports.completions[0]?.safeErrorCode === 'string' &&
        /^[a-z0-9._-]{1,64}$/.test(ports.completions[0].safeErrorCode) &&
        !ports.completions[0].safeErrorCode.includes(prohibitedBodyCanary),
      true,
    );
    assert.equal(captured.includes(prohibitedBodyCanary), false);
  });

  it('makes a published hint harmless when lease loss causes the same marker to be retried', async () => {
    const ports = new FakeRealtimePorts();
    const sink = new FakeRefreshHintSink();
    ports.claims.push(marker(), marker());
    ports.completionResults.push(false, true, true);

    const worker = processor(ports, sink);
    const firstOutcome = await worker.processNext().catch(() => 'lease-lost' as const);
    const retryOutcome = await worker.processNext();

    assert.equal(firstOutcome === 'retry' || firstOutcome === 'lease-lost', true);
    assert.equal(retryOutcome, 'delivered');
    assert.equal(sink.hints.length, 2);
    assert.equal(ports.completions[0]?.eventId, markerEventId);
    assert.equal(
      JSON.stringify(sink.hints[0]) === JSON.stringify(sink.hints[1]),
      true,
      'a lease-loss replay must preserve the same event identity and context version',
    );
  });

  it('keeps the durable C22 marker payload exact and body-free', () => {
    const c22Url = new URL(
      '../../../supabase/migrations/20260929001008_f010_c22_context_messages.sql',
      import.meta.url,
    );
    const c09Url = new URL(
      '../../../supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql',
      import.meta.url,
    );
    const c22 = readFileSync(c22Url, 'utf8');
    const c09 = readFileSync(c09Url, 'utf8');
    assert.equal(
      /'clinical\.context_message\.created\.v1'\s*,\s*'context_message\.created'\s*,\s*'context_message'\s*,\s*message_id\s*,\s*1/s.test(
        c22,
      ),
      true,
    );
    assert.equal(
      /jsonb_build_object\('aggregateId',\s*p_resource_id,\s*'version',\s*p_resource_version\)/s.test(
        c09,
      ),
      true,
    );
  });

  it('rejects or strips untrusted clinical extras before a valid-context hint is captured', async () => {
    const ports = new FakeRealtimePorts();
    const sink = new FakeRefreshHintSink();
    ports.claims.push(
      marker({
        patientName: prohibitedBodyCanary,
        participantId: prohibitedBodyCanary,
        noteBody: prohibitedBodyCanary,
        reasonSummary: prohibitedBodyCanary,
        encounterType: prohibitedBodyCanary,
        attachments: [prohibitedBodyCanary],
        payload: {
          bodyCiphertext: prohibitedBodyCanary,
          noteBody: prohibitedBodyCanary,
          reason_summary: prohibitedBodyCanary,
        },
      }),
    );

    const outcome = await processor(ports, sink).processNext();
    const captured = JSON.stringify({ hints: sink.hints, completions: ports.completions });

    assert.equal(outcome === 'delivered' || outcome === 'dead_letter', true);
    assert.equal(captured.includes(prohibitedBodyCanary), false);
    if (sink.hints[0])
      assert.deepEqual(Object.keys(sink.hints[0]).toSorted(), ['contextId', 'eventId', 'version']);
  });

  it('dead-letters exhausted retries and permanent projection poison with safe codes', async () => {
    const exhaustedPorts = new FakeRealtimePorts();
    const exhaustedSink = new FakeRefreshHintSink();
    exhaustedPorts.claims.push(marker({ attemptCount: 6 }));
    exhaustedSink.failure = new Error(prohibitedBodyCanary);
    const exhausted = await processor(exhaustedPorts, exhaustedSink).processNext();

    const poisonPorts = new FakeRealtimePorts();
    const poisonSink = new FakeRefreshHintSink();
    poisonPorts.claims.push(marker({ contextId: null }));
    const poison = await processor(poisonPorts, poisonSink).processNext();

    assert.equal(exhausted, 'dead_letter');
    assert.equal(poison, 'dead_letter');
    for (const completion of [exhaustedPorts.completions[0], poisonPorts.completions[0]]) {
      assert.equal(completion?.outcome, 'dead_letter');
      assert.equal(
        typeof completion?.safeErrorCode === 'string' &&
          /^[a-z0-9._-]{1,64}$/.test(completion.safeErrorCode) &&
          !completion.safeErrorCode.includes(prohibitedBodyCanary),
        true,
      );
    }
    assert.equal(exhaustedSink.hints.length + poisonSink.hints.length, 0);
  });

  it('exposes no patient, participant, body, ciphertext, or authority fields in a refresh hint', async () => {
    const ports = new FakeRealtimePorts();
    const sink = new FakeRefreshHintSink();
    ports.claims.push(marker());

    await processor(ports, sink).processNext();

    const hint = sink.hints[0] as unknown as Record<string, unknown> | undefined;
    assert.equal(JSON.stringify(hint).includes(prohibitedBodyCanary), false);
    assert.deepEqual(Object.keys(hint ?? {}).toSorted(), ['contextId', 'eventId', 'version']);
    assert.equal(
      [
        'patientId',
        'participantId',
        'senderId',
        'body',
        'bodyCiphertext',
        'canRead',
        'canSend',
      ].some((field) => hint && Object.hasOwn(hint, field)),
      false,
    );
  });
});
