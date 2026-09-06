import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditAdminTelemetry } from '@shifaa/observability';

import {
  AuditExportOperationError,
  AuditExportWorker,
  PrivateAuditExportHttpAdapter,
  type AuditExportClaim,
  type AuditExportCompletion,
  type AuditExportOperationPort,
  type AuditExportWorkPort,
} from './audit-export.ts';

const batchId = '83000000-0000-4000-8000-000000000001';
const changedBatchId = '83000000-0000-4000-8000-000000000002';
const digest = 'a'.repeat(64);

describe('audit export worker', () => {
  it('serializes concurrent workers so only one owns and completes a batch', async () => {
    const fixture = createFixture();
    const first = worker('worker.008.a', fixture);
    const second = worker('worker.008.b', fixture);
    assert.deepEqual((await Promise.all([first.processNext(), second.processNext()])).sort(), [
      'idle',
      'proven',
    ]);
    assert.equal(fixture.operationCalls.length, 1);
    assert.equal(fixture.queue.completions.filter((value) => value.outcome === 'proven').length, 1);
    assert.equal(await second.processNext(), 'idle');
  });

  it('uses deterministic idempotency across one lease-expiry reclaim and duplicate delivery', async () => {
    const fixture = createFixture();
    const stale = await fixture.queue.claimNext('worker.old.008', 30, fixture.clock.now());
    assert.ok(stale);
    fixture.clock.advance(31_000);
    assert.equal(await worker('worker.new.008', fixture).processNext(), 'proven');
    assert.equal(
      await fixture.queue.complete({
        claim: stale,
        workerId: 'worker.old.008',
        outcome: 'proven',
        objectDigest: digest,
        proofClass: 'local_synthetic_write_once',
      }),
      false,
    );
    assert.equal(await worker('worker.new.008', fixture).processNext(), 'idle');
    assert.equal(fixture.operationCalls.length, 1);
    assert.equal(fixture.queue.attemptCount, 2);
  });

  it('applies bounded transient retries then dead-letters without changing original work', async () => {
    const fixture = createFixture({
      failures: Array(6).fill(new AuditExportOperationError('service-unavailable', 'transient')),
    });
    const subject = worker('worker.retry.008', fixture);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      assert.equal(await subject.processNext(), 'retryable');
      const retry = fixture.queue.completions.at(-1);
      assert.equal(retry?.outcome, 'retryable');
      assert.ok(retry?.retryAt);
      fixture.clock.set(Date.parse(retry!.retryAt!));
    }
    assert.equal(await subject.processNext(), 'dead_letter');
    assert.equal(fixture.queue.attemptCount, 6);
    assert.deepEqual(fixture.queue.originalPayload, { exportBatchId: batchId });
    assert.ok(Object.isFrozen(fixture.queue.originalPayload));
  });

  it('dead-letters permanent schema, service-auth, state, and proof failures', async () => {
    for (const failureCode of [
      'validation-failed',
      'authentication-required',
      'forbidden',
      'export-state-conflict',
      'retention-proof-failed',
    ] as const) {
      const fixture = createFixture({
        failures: [new AuditExportOperationError(failureCode, 'permanent')],
      });
      assert.equal(await worker('worker.dead.008', fixture).processNext(), 'dead_letter');
      assert.equal(completionFailure(fixture.queue.completions[0]), failureCode);
    }
  });

  it('fails closed when internal proof batch or digest changes', async () => {
    for (const proof of [
      {
        exportBatchId: '83000000-0000-4000-8000-000000000099',
        status: 'proven' as const,
        objectDigest: digest,
        proofClass: 'local_synthetic_write_once' as const,
      },
      {
        exportBatchId: batchId,
        status: 'proven' as const,
        objectDigest: 'changed',
        proofClass: 'local_synthetic_write_once' as const,
      },
    ]) {
      const fixture = createFixture({ proof });
      assert.equal(await worker('worker.proof.008', fixture).processNext(), 'dead_letter');
      assert.equal(completionFailure(fixture.queue.completions[0]), 'audit-integrity-failed');
    }
  });

  it('emits only bounded telemetry without batch, receipt, object, or credential values', async () => {
    const fixture = createFixture();
    await worker('worker.telemetry.008', fixture).processNext();
    assert.equal(fixture.telemetry.length, 1);
    const serialized = JSON.stringify(fixture.telemetry);
    assert.doesNotMatch(serialized, /83000000|receipt|object|credential|token/i);
  });

  it('calls only the private internal operation with exact service auth and a minimum body', async () => {
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), 'https://audit.internal/v1/internal/audit/exports');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, 'Bearer synthetic-private-worker-credential');
      assert.match(headers['Idempotency-Key']!, /^[a-f0-9]{64}$/);
      assert.deepEqual(JSON.parse(String(init?.body)), { export_batch_id: batchId });
      return new Response(
        JSON.stringify({
          export_batch_id: batchId,
          status: 'proven',
          object_digest: digest,
          retention_proof_class: 'local_synthetic_write_once',
          exported_at: '2026-09-01T12:00:00.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const fixture = createFixture();
    fixture.operation = new PrivateAuditExportHttpAdapter(
      'https://audit.internal',
      'synthetic-private-worker-credential',
      fetcher,
    );
    assert.equal(await worker('worker.http.008', fixture).processNext(), 'proven');
  });

  it('rejects public service URLs and permanently classifies changed response proof', async () => {
    assert.throws(
      () =>
        new PrivateAuditExportHttpAdapter(
          'https://public.example',
          'synthetic-private-worker-credential',
        ),
      TypeError,
    );
    const fixture = createFixture();
    fixture.operation = new PrivateAuditExportHttpAdapter(
      'https://audit.internal',
      'synthetic-private-worker-credential',
      async () =>
        new Response(
          JSON.stringify({
            export_batch_id: changedBatchId,
            status: 'proven',
            object_digest: digest,
            retention_proof_class: 'local_synthetic_write_once',
            exported_at: '2026-09-01T12:00:00.000Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    assert.equal(await worker('worker.http.008', fixture).processNext(), 'dead_letter');
    assert.equal(completionFailure(fixture.queue.completions[0]), 'audit-integrity-failed');
  });
});

type FixtureOptions = {
  failures?: AuditExportOperationError[];
  proof?: Awaited<ReturnType<AuditExportOperationPort['materialize']>>;
};

function createFixture(options: FixtureOptions = {}) {
  const clock = new MutableClock(Date.parse('2026-09-01T12:00:00.000Z'));
  const queue = new SyntheticQueue(batchId);
  const operationCalls: { batch: string; key: string }[] = [];
  const failures = [...(options.failures ?? [])];
  let operation: AuditExportOperationPort = {
    async materialize(batch, key) {
      operationCalls.push({ batch, key });
      const failure = failures.shift();
      if (failure) throw failure;
      return (
        options.proof ?? {
          exportBatchId: batch,
          status: 'proven',
          objectDigest: digest,
          proofClass: 'local_synthetic_write_once',
        }
      );
    },
  };
  return {
    clock,
    queue,
    get operation() {
      return operation;
    },
    set operation(value: AuditExportOperationPort) {
      operation = value;
    },
    operationCalls,
    telemetry: [] as AuditAdminTelemetry[],
  };
}

function worker(id: string, fixture: ReturnType<typeof createFixture>) {
  return new AuditExportWorker(id, {
    work: fixture.queue,
    operation: fixture.operation,
    clock: fixture.clock,
    telemetry: { emit: (event) => fixture.telemetry.push(event) },
  });
}

function completionFailure(completion: AuditExportCompletion | undefined) {
  assert.ok(completion);
  assert.notEqual(completion.outcome, 'proven');
  return completion.outcome === 'proven' ? undefined : completion.failureCode;
}

class MutableClock {
  private value: number;
  public constructor(value: number) {
    this.value = value;
  }
  public now() {
    return new Date(this.value);
  }
  public advance(milliseconds: number) {
    this.value += milliseconds;
  }
  public set(value: number) {
    this.value = value;
  }
}

class SyntheticQueue implements AuditExportWorkPort {
  public readonly originalPayload: Readonly<{ exportBatchId: string }>;
  public readonly completions: AuditExportCompletion[] = [];
  public attemptCount = 0;
  private state: 'queued' | 'claimed' | 'retryable' | 'proven' | 'dead_letter' = 'queued';
  private owner: string | null = null;
  private leaseUntil = 0;
  private retryAt = 0;

  private readonly exportBatchId: string;

  public constructor(exportBatchId: string) {
    this.exportBatchId = exportBatchId;
    this.originalPayload = Object.freeze({ exportBatchId });
  }

  public async claimNext(
    workerId: string,
    leaseSeconds: number,
    now: Date,
  ): Promise<AuditExportClaim | null> {
    const nowMs = now.getTime();
    const claimable =
      this.state === 'queued' ||
      (this.state === 'retryable' && this.retryAt <= nowMs) ||
      (this.state === 'claimed' && this.leaseUntil <= nowMs);
    if (!claimable) return null;
    this.state = 'claimed';
    this.owner = workerId;
    this.leaseUntil = nowMs + leaseSeconds * 1_000;
    this.attemptCount += 1;
    return {
      eventId: '85000000-0000-4000-8000-000000000001',
      receiptId: `86000000-0000-4000-8000-${String(this.attemptCount).padStart(12, '0')}`,
      exportBatchId: this.exportBatchId,
      aggregateVersion: 1,
      attemptCount: this.attemptCount,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(this.leaseUntil).toISOString(),
    };
  }

  public async complete(completion: AuditExportCompletion): Promise<boolean> {
    if (
      this.state !== 'claimed' ||
      this.owner !== completion.workerId ||
      completion.claim.attemptCount !== this.attemptCount
    )
      return false;
    this.completions.push(completion);
    this.owner = null;
    if (completion.outcome === 'retryable') {
      this.state = 'retryable';
      this.retryAt = Date.parse(completion.retryAt!);
    } else this.state = completion.outcome;
    return true;
  }
}
