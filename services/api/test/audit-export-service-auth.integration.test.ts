import { createHash, randomUUID } from 'node:crypto';

import { linkAuditEvents } from '@shifaa/core/audit-admin/audit-integrity';
import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditExportService } from '../src/modules/audit-admin/export-service.js';
import type {
  AuditExportOrchestrationPort,
  AuditExportServiceActor,
  AuditExportWork,
  ObjectProofPort,
  ProvenAuditExportWork,
} from '../src/modules/audit-admin/types.js';
import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';
import { InMemoryIdempotencyStore } from '../src/platform/idempotency.js';
import { registerAuditAdminRoutes } from '../src/routes/audit-admin.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';

const batchId = '83000000-0000-4000-8000-000000000001';
const changedBatchId = '83000000-0000-4000-8000-000000000002';
const serviceCredential = 'synthetic-private-audit-export-credential';
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('internal audit export service authentication', () => {
  it('accepts only the exact private-network service principal', async () => {
    const { app, repository } = await buildInternalApp();
    for (const request of [
      { authorization: undefined, remoteAddress: '10.10.0.8', status: 401 },
      { authorization: 'Bearer wrong', remoteAddress: '10.10.0.8', status: 401 },
      { authorization: `Bearer ${serviceCredential}`, remoteAddress: '203.0.113.8', status: 403 },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/internal/audit/exports',
        remoteAddress: request.remoteAddress,
        headers: {
          ...(request.authorization ? { authorization: request.authorization } : {}),
          'idempotency-key': `synthetic-service-auth-${request.status}`,
        },
        payload: { export_batch_id: batchId },
      });
      expect(response.statusCode).toBe(request.status);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(repository.getAuditExportWork).not.toHaveBeenCalled();

    const accepted = await injectAuthorized(app, batchId, 'synthetic-service-auth-accepted');
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ export_batch_id: batchId, status: 'proven' });
    expect(repository.recordProvenAuditExport).toHaveBeenCalledTimes(1);
  });

  it('denies wrong-batch, wrong-range, extra integrity input, and changed-body replay', async () => {
    const { app } = await buildInternalApp();
    const first = await injectAuthorized(app, batchId, 'synthetic-changed-body-replay');
    expect(first.statusCode).toBe(200);
    const changed = await injectAuthorized(app, changedBatchId, 'synthetic-changed-body-replay');
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused' });
    const wrongBatch = await injectAuthorized(app, changedBatchId, 'synthetic-wrong-batch-key');
    expect(wrongBatch.statusCode).toBe(409);
    expect(wrongBatch.json()).toMatchObject({ code: 'export-state-conflict' });
    const extraIntegrity = await app.inject({
      method: 'POST',
      url: '/v1/internal/audit/exports',
      remoteAddress: '10.10.0.8',
      headers: serviceHeaders('synthetic-extra-integrity-key'),
      payload: { export_batch_id: batchId, object_digest: 'a'.repeat(64) },
    });
    expect(extraIntegrity.statusCode).toBe(400);

    const badRange = await buildInternalApp({ partitionEndExclusive: '2026-05-01' });
    const range = await injectAuthorized(badRange.app, batchId, 'synthetic-wrong-range-key');
    expect(range.statusCode).toBe(409);
    expect(range.json()).toMatchObject({ code: 'export-state-conflict' });
  });

  it('rate-limits the exact authorized service principal without leaking state', async () => {
    const app = Fastify({ genReqId: () => randomUUID() });
    apps.push(app);
    installIdentityErrorHandler(app);
    const exportService = {
      exportAuditPartition: vi.fn(async (_actor, input: { export_batch_id: string }) => ({
        export_batch_id: input.export_batch_id,
        status: 'proven' as const,
        object_digest: 'a'.repeat(64),
        retention_proof_class: 'local_synthetic_write_once' as const,
        exported_at: '2026-09-01T12:00:00.000Z',
      })),
    };
    await registerAuditAdminRoutes(app, routeDependencies(exportService));
    for (let index = 0; index < 20; index += 1)
      expect(
        (
          await injectAuthorized(
            app,
            batchId,
            `synthetic-rate-key-${String(index).padStart(3, '0')}`,
          )
        ).statusCode,
      ).toBe(200);
    const limited = await injectAuthorized(app, batchId, 'synthetic-rate-key-020');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.body).not.toMatch(/batch|credential|worker|10\.10/i);
    expect(exportService.exportAuditPartition).toHaveBeenCalledTimes(20);
  });
});

async function buildInternalApp(overrides: { partitionEndExclusive?: string } = {}) {
  const app = Fastify({ genReqId: () => randomUUID() });
  apps.push(app);
  installIdentityErrorHandler(app);
  const repository = statefulRepository(overrides);
  const service = new AuditExportService({
    repository,
    objects: memoryObjects(),
    idempotency: new InMemoryIdempotencyStore(() => Date.parse('2026-09-01T12:00:00.000Z')),
    clock: { now: () => new Date('2026-09-01T12:00:00.000Z') },
  });
  await registerAuditAdminRoutes(app, routeDependencies(service));
  return { app, repository };
}

function routeDependencies(exportService: {
  exportAuditPartition: AuditExportService['exportAuditPartition'];
}) {
  return {
    adminService: {
      getAdminSummary: vi.fn(),
      listAuditEvents: vi.fn(),
      getAuditEvent: vi.fn(),
      createAuditExport: vi.fn(),
    },
    exportService,
    healthService: {
      healthLive: vi.fn(),
      healthReady: vi.fn(),
    },
    resolveAdminActor: vi.fn(),
    resolveServiceActor: async (request: FastifyRequest): Promise<AuditExportServiceActor> => {
      if (!isPrivateAddress(request.ip)) throw new ApiPolicyError('forbidden', 403, 'forbidden');
      if (request.headers.authorization !== `Bearer ${serviceCredential}`)
        throw new ApiPolicyError('authentication-required', 401, 'authentication-required');
      return {
        authenticated: true,
        principal: 'service:audit-export-worker',
        workerId: 'worker.export.008',
        requestId: request.id,
        traceId: 'f'.repeat(32),
      };
    },
    rateLimitHmacKey: new Uint8Array(32).fill(8),
    now: () => Date.parse('2026-09-01T12:00:00.000Z'),
  };
}

function isPrivateAddress(address: string): boolean {
  return /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address);
}

function serviceHeaders(idempotencyKey: string) {
  return { authorization: `Bearer ${serviceCredential}`, 'idempotency-key': idempotencyKey };
}

function injectAuthorized(app: ReturnType<typeof Fastify>, exportBatchId: string, key: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/internal/audit/exports',
    remoteAddress: '10.10.0.8',
    headers: serviceHeaders(key),
    payload: { export_batch_id: exportBatchId },
  });
}

function statefulRepository(overrides: {
  partitionEndExclusive?: string;
}): AuditExportOrchestrationPort & {
  getAuditExportWork: ReturnType<typeof vi.fn>;
  recordProvenAuditExport: ReturnType<typeof vi.fn>;
} {
  const partitionEndExclusive = overrides.partitionEndExclusive ?? '2026-08-01';
  const objectKey = `audit-exports/${sha256(batchId)}.jsonl`;
  let work: AuditExportWork = {
    exportBatchId: batchId,
    status: 'claimed',
    partitionStart: '2026-05-01',
    partitionEndExclusive,
    objectKey,
    events: linkAuditEvents([
      {
        occurredAt: '2026-05-01T00:00:00.000Z',
        partitionKey: '2026-05-01',
        requestId: '84000000-0000-4000-8000-000000000001',
        traceId: 'f'.repeat(32),
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
  };
  const getAuditExportWork = vi.fn(async (_actor, requestedBatchId: string) =>
    requestedBatchId === batchId ? work : null,
  );
  const recordProvenAuditExport = vi.fn(async (_actor, input) => {
    work = {
      exportBatchId: batchId,
      status: 'proven',
      partitionStart: '2026-05-01',
      partitionEndExclusive,
      objectKey,
      objectDigest: input.objectDigest,
      retentionProof: input.retentionProof,
      exportedAt: '2026-09-01T12:00:00.000Z',
    } satisfies ProvenAuditExportWork;
    return work;
  });
  return { getAuditExportWork, recordProvenAuditExport };
}

function memoryObjects(): ObjectProofPort {
  const objects = new Map<string, Uint8Array>();
  return {
    async createIfAbsent(objectKey, content) {
      const previous = objects.get(objectKey);
      if (previous && !Buffer.from(previous).equals(content)) throw new Error('immutable mismatch');
      objects.set(objectKey, new Uint8Array(content));
      return {
        objectKey,
        digestSha256: createHash('sha256').update(content).digest('hex'),
        retentionProof: {
          proof_version: 1,
          proof_class: 'synthetic_write_once',
          verified_at: '2026-09-01T11:59:59.000Z',
        },
      };
    },
    async readForVerification(objectKey) {
      const value = objects.get(objectKey);
      if (!value) throw new Error('missing object');
      return value;
    },
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
