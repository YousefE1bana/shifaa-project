import { createHash } from 'node:crypto';

import { linkAuditEvents } from '@shifaa/core/audit-admin/audit-integrity';
import { describe, expect, it, vi } from 'vitest';

import { AuditExportService } from '../src/modules/audit-admin/export-service.js';
import type {
  AuditExportOrchestrationPort,
  AuditExportServiceActor,
  AuditExportWork,
  ObjectProofPort,
  ObjectWriteReceipt,
  ProvenAuditExportWork,
  RetentionProof,
} from '../src/modules/audit-admin/types.js';
import { InMemoryIdempotencyStore } from '../src/platform/idempotency.js';

const batchId = '83000000-0000-4000-8000-000000000001';
const objectKey = `audit-exports/${sha256(Buffer.from(batchId, 'utf8'))}.jsonl`;
const proof: RetentionProof = {
  proof_version: 1,
  proof_class: 'synthetic_write_once',
  verified_at: '2026-09-01T11:59:59.000Z',
};
const events = ['2026-05-01', '2026-06-01', '2026-07-01'].flatMap((partitionKey, index) =>
  linkAuditEvents([
    {
      occurredAt: `${partitionKey}T00:00:00.000Z`,
      partitionKey,
      requestId: '84000000-0000-4000-8000-000000000001',
      traceId: `trace-008-export-event-${index + 1}`,
      actorUserId: null,
      actorPersonId: null,
      authenticationAal: null,
      facilityId: null,
      patientId: null,
      purposeCode: 'security.audit.review',
      actionCode: 'audit.export.requested',
      resourceType: 'audit_export',
      resourceId: batchId,
      resourceVersion: 1,
      outcome: 'success',
      reasonCode: null,
      sourceIpPrefix: null,
      userAgentClass: 'service',
    },
  ]),
);

describe('service-authenticated audit export orchestration', () => {
  it('materializes a deterministic canonical object and records only verified proof', async () => {
    const repository = statefulRepository();
    const objects = memoryObjects();
    const service = makeService(repository, objects);

    const result = await service.exportAuditPartition(
      authorizedWorker(),
      { export_batch_id: batchId },
      'synthetic-internal-export-key-0001',
    );

    expect(result).toMatchObject({
      export_batch_id: batchId,
      status: 'proven',
      retention_proof_class: 'local_synthetic_write_once',
    });
    expect(objects.createIfAbsent).toHaveBeenCalledWith(objectKey, expect.any(Uint8Array));
    expect(repository.recordProvenAuditExport).toHaveBeenCalledWith(authorizedWorker(), {
      exportBatchId: batchId,
      objectDigest: result.object_digest,
      retentionProof: proof,
    });
  });

  it('accepts identical proven replay only after re-verifying stored bytes and proof', async () => {
    const repository = statefulRepository();
    const objects = memoryObjects();
    const service = makeService(repository, objects);
    const first = await service.exportAuditPartition(
      authorizedWorker(),
      { export_batch_id: batchId },
      'synthetic-internal-export-key-0002',
    );
    const replay = await service.exportAuditPartition(
      authorizedWorker(),
      { export_batch_id: batchId },
      'synthetic-internal-export-key-0003',
    );
    expect(replay).toEqual(first);
    expect(objects.createIfAbsent).toHaveBeenCalledTimes(1);
    expect(objects.readForVerification).toHaveBeenCalledTimes(2);
    expect(repository.recordProvenAuditExport).toHaveBeenCalledTimes(1);
  });

  it('rejects changed-body idempotency-key reuse and caller-supplied integrity fields', async () => {
    const service = makeService(statefulRepository(), memoryObjects());
    await service.exportAuditPartition(
      authorizedWorker(),
      { export_batch_id: batchId },
      'synthetic-internal-export-key-reuse',
    );
    await expect(
      service.exportAuditPartition(
        authorizedWorker(),
        { export_batch_id: '83000000-0000-4000-8000-000000000002' },
        'synthetic-internal-export-key-reuse',
      ),
    ).rejects.toMatchObject({ code: 'idempotency-key-reused', status: 409 });
    await expect(
      service.exportAuditPartition(
        authorizedWorker(),
        { export_batch_id: batchId, object_digest: 'caller-value' } as never,
        'synthetic-internal-export-key-extra',
      ),
    ).rejects.toMatchObject({ code: 'validation-failed', status: 400 });
  });

  it.each([
    [{ ...authorizedWorker(), authenticated: false }, 401],
    [{ ...authorizedWorker(), principal: null }, 401],
    [{ ...authorizedWorker(), workerId: null }, 401],
    [{ ...authorizedWorker(), workerId: 'invalid worker id' }, 403],
  ])(
    'denies missing or invalid service authentication before repository access',
    async (actor, status) => {
      const repository = statefulRepository();
      await expect(
        makeService(repository, memoryObjects()).exportAuditPartition(
          actor,
          { export_batch_id: batchId },
          'synthetic-internal-export-key-auth',
        ),
      ).rejects.toMatchObject({ status });
      expect(repository.getAuditExportWork).not.toHaveBeenCalled();
    },
  );

  it('rejects an object-byte mismatch on replay', async () => {
    const repository = statefulRepository();
    const objects = memoryObjects();
    const service = makeService(repository, objects);
    await service.exportAuditPartition(
      authorizedWorker(),
      { export_batch_id: batchId },
      'synthetic-internal-export-key-bytes-first',
    );
    objects.bytes.set(objectKey, Buffer.from('changed-object-bytes', 'utf8'));
    await expect(
      service.exportAuditPartition(
        authorizedWorker(),
        { export_batch_id: batchId },
        'synthetic-internal-export-key-bytes-replay',
      ),
    ).rejects.toMatchObject({ code: 'audit-integrity-failed', status: 409 });
  });

  it('rejects receipt digest, retention proof, range, object-key, completion, and state mismatches', async () => {
    const cases: Array<{
      name: string;
      repository?: AuditExportOrchestrationPort;
      objects?: ReturnType<typeof memoryObjects>;
      expected: string;
    }> = [];

    const digestObjects = memoryObjects();
    digestObjects.receiptOverride = (receipt) => ({ ...receipt, digestSha256: 'f'.repeat(64) });
    cases.push({ name: 'digest', objects: digestObjects, expected: 'audit-integrity-failed' });

    const proofObjects = memoryObjects();
    proofObjects.receiptOverride = (receipt) => ({
      ...receipt,
      retentionProof: { ...proof, proof_class: 'invalid' } as never,
    });
    cases.push({ name: 'proof', objects: proofObjects, expected: 'retention-proof-failed' });

    cases.push({
      name: 'range',
      repository: statefulRepository({ partitionEndExclusive: '2026-05-01' }),
      expected: 'export-state-conflict',
    });
    cases.push({
      name: 'object-key',
      repository: statefulRepository({ objectKey: 'audit-exports/caller-chosen.jsonl' }),
      expected: 'export-state-conflict',
    });
    cases.push({
      name: 'completion',
      repository: statefulRepository({ completionDigest: 'e'.repeat(64) }),
      expected: 'export-state-conflict',
    });
    cases.push({
      name: 'state',
      repository: statefulRepository({ status: 'queued' as never }),
      expected: 'export-state-conflict',
    });

    for (const vector of cases) {
      await expect(
        makeService(
          vector.repository ?? statefulRepository(),
          vector.objects ?? memoryObjects(),
        ).exportAuditPartition(
          authorizedWorker(),
          { export_batch_id: batchId },
          `synthetic-internal-export-key-${vector.name}`,
        ),
      ).rejects.toMatchObject({ code: vector.expected, status: 409 });
    }
  });
});

function makeService(
  repository: AuditExportOrchestrationPort,
  objects: ObjectProofPort,
): AuditExportService {
  return new AuditExportService({
    repository,
    objects,
    idempotency: new InMemoryIdempotencyStore(() => Date.parse('2026-09-01T12:00:00.000Z')),
    clock: { now: () => new Date('2026-09-01T12:00:00.000Z') },
  });
}

function statefulRepository(
  overrides: {
    status?: AuditExportWork['status'];
    partitionEndExclusive?: string;
    objectKey?: string;
    completionDigest?: string;
  } = {},
): AuditExportOrchestrationPort & {
  getAuditExportWork: ReturnType<typeof vi.fn>;
  recordProvenAuditExport: ReturnType<typeof vi.fn>;
} {
  let work: AuditExportWork = {
    exportBatchId: batchId,
    status: overrides.status ?? 'claimed',
    partitionStart: '2026-05-01',
    partitionEndExclusive: overrides.partitionEndExclusive ?? '2026-08-01',
    objectKey: overrides.objectKey ?? objectKey,
    events,
  } as AuditExportWork;
  const getAuditExportWork = vi.fn().mockImplementation(async () => work);
  const recordProvenAuditExport = vi.fn().mockImplementation(async (_actor, input) => {
    work = {
      exportBatchId: batchId,
      status: 'proven',
      partitionStart: '2026-05-01',
      partitionEndExclusive: overrides.partitionEndExclusive ?? '2026-08-01',
      objectKey: overrides.objectKey ?? objectKey,
      objectDigest: overrides.completionDigest ?? input.objectDigest,
      retentionProof: input.retentionProof,
      exportedAt: '2026-09-01T12:00:00.000Z',
    } satisfies ProvenAuditExportWork;
    return work;
  });
  return { getAuditExportWork, recordProvenAuditExport };
}

function memoryObjects(): ObjectProofPort & {
  bytes: Map<string, Uint8Array>;
  createIfAbsent: ReturnType<typeof vi.fn>;
  readForVerification: ReturnType<typeof vi.fn>;
  receiptOverride: ((receipt: ObjectWriteReceipt) => ObjectWriteReceipt) | undefined;
} {
  const bytes = new Map<string, Uint8Array>();
  const result = {
    bytes,
    receiptOverride: undefined as ((receipt: ObjectWriteReceipt) => ObjectWriteReceipt) | undefined,
    createIfAbsent: vi.fn(async (key: string, content: Uint8Array) => {
      const stored = bytes.get(key) ?? content;
      bytes.set(key, stored);
      const receipt: ObjectWriteReceipt = {
        objectKey: key,
        digestSha256: sha256(stored),
        retentionProof: proof,
      };
      return result.receiptOverride?.(receipt) ?? receipt;
    }),
    readForVerification: vi.fn(async (key: string) => {
      const stored = bytes.get(key);
      if (!stored) throw new Error('missing');
      return stored;
    }),
  };
  return result;
}

function authorizedWorker(): AuditExportServiceActor {
  return {
    authenticated: true,
    principal: 'service:audit-export-worker:worker-008-a',
    workerId: 'worker-008-a',
    requestId: '84000000-0000-4000-8000-000000000005',
    traceId: 'trace-008-internal-export',
  };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
