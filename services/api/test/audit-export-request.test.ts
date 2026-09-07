import { describe, expect, it, vi } from 'vitest';

import { hashRequest } from '../src/platform/idempotency.js';
import { AuditAdminService } from '../src/modules/audit-admin/service.js';
import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';
import type {
  AuditAdminActor,
  AuditAdminRepository,
  AuditExportAccepted,
  AuditExportRequestCommand,
} from '../src/modules/audit-admin/types.js';

const accepted: AuditExportAccepted = {
  export_batch_id: '83000000-0000-4000-8000-000000000001',
  status: 'queued',
  partition_start: '2026-05-01',
  partition_end_exclusive: '2026-08-01',
  accepted_at: '2026-09-01T12:00:00.000Z',
};

describe('transactional audit export request', () => {
  it('passes only the canonical server-computed request hash into the atomic repository command', async () => {
    const requestAuditExport = vi.fn().mockResolvedValue(accepted);
    const service = makeService(repositoryStub({ requestAuditExport }));
    const input = { partition_end_exclusive: '2026-08-01', partition_start: '2026-05-01' };

    await expect(
      service.createAuditExport(authorizedActor(), input, 'synthetic-idempotency-key-0001'),
    ).resolves.toEqual(accepted);
    expect(requestAuditExport).toHaveBeenCalledWith(authorizedActor(), {
      input,
      idempotencyKey: 'synthetic-idempotency-key-0001',
      requestHash: hashRequest(input),
    });
  });

  it.each([
    [{ partition_start: '2026-05-02', partition_end_exclusive: '2026-08-01' }],
    [{ partition_start: '2026-05-01', partition_end_exclusive: '2026-08-02' }],
    [{ partition_start: '2026-08-01', partition_end_exclusive: '2026-08-01' }],
    [{ partition_start: '2026-05-01', partition_end_exclusive: '2026-09-01' }],
    [{ partition_start: '2026-08-01', partition_end_exclusive: '2026-10-01' }],
    [{ partition_start: 'not-a-date', partition_end_exclusive: '2026-08-01' }],
  ])('rejects a non-month, non-positive, over-three-month, or incomplete range', async (input) => {
    const repository = repositoryStub();
    await expect(
      makeService(repository).createAuditExport(
        authorizedActor(),
        input,
        'synthetic-idempotency-key-0002',
      ),
    ).rejects.toMatchObject({ code: 'export-range-invalid', status: 409 });
    expect(repository.requestAuditExport).not.toHaveBeenCalled();
  });

  it('rejects extra request fields and non-canonical idempotency key lengths', async () => {
    const service = makeService(repositoryStub());
    await expect(
      service.createAuditExport(
        authorizedActor(),
        {
          partition_start: '2026-05-01',
          partition_end_exclusive: '2026-08-01',
          object_digest: 'caller-controlled',
        } as never,
        'synthetic-idempotency-key-0003',
      ),
    ).rejects.toMatchObject({ code: 'validation-failed', status: 400 });
    await expect(
      service.createAuditExport(
        authorizedActor(),
        { partition_start: '2026-05-01', partition_end_exclusive: '2026-08-01' },
        'fifteen-chars--',
      ),
    ).rejects.toMatchObject({ code: 'validation-failed', status: 400 });
  });

  it('collapses 25 concurrent identical requests to one atomic effect', async () => {
    const records = new Map<string, Promise<AuditExportAccepted>>();
    let effects = 0;
    const requestAuditExport = vi.fn((_actor, command: AuditExportRequestCommand) => {
      const current = records.get(command.idempotencyKey);
      if (current) return current;
      effects += 1;
      const result = Promise.resolve(accepted);
      records.set(command.idempotencyKey, result);
      return result;
    });
    const service = makeService(repositoryStub({ requestAuditExport }));
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        service.createAuditExport(
          authorizedActor(),
          { partition_start: '2026-05-01', partition_end_exclusive: '2026-08-01' },
          'synthetic-idempotency-key-concurrent',
        ),
      ),
    );
    expect(new Set(results.map((result) => result.export_batch_id))).toEqual(
      new Set([accepted.export_batch_id]),
    );
    expect(effects).toBe(1);
  });

  it('propagates changed-body key reuse as 409 without a second effect', async () => {
    let requestHash: string | undefined;
    let effects = 0;
    const requestAuditExport = vi.fn((_actor, command: AuditExportRequestCommand) => {
      if (requestHash && requestHash !== command.requestHash) {
        throw new ApiPolicyError('idempotency-key-reused', 409, 'idempotency-key-reused');
      }
      requestHash = command.requestHash;
      effects += 1;
      return Promise.resolve(accepted);
    });
    const service = makeService(repositoryStub({ requestAuditExport }));
    await service.createAuditExport(
      authorizedActor(),
      { partition_start: '2026-05-01', partition_end_exclusive: '2026-08-01' },
      'synthetic-idempotency-key-reused',
    );
    await expect(
      service.createAuditExport(
        authorizedActor(),
        { partition_start: '2026-06-01', partition_end_exclusive: '2026-08-01' },
        'synthetic-idempotency-key-reused',
      ),
    ).rejects.toMatchObject({ code: 'idempotency-key-reused', status: 409 });
    expect(effects).toBe(1);
  });
});

function makeService(repository: AuditAdminRepository): AuditAdminService {
  return new AuditAdminService({
    repository,
    policy: { getApprovedPolicy: vi.fn(), getApprovedRuntimeConfigurationSha256: vi.fn() },
    aggregates: { getCells: vi.fn() },
    clock: { now: () => new Date('2026-09-01T12:00:00.000Z') },
    cursorSecret: 'synthetic-cursor-secret-008-at-least-32-bytes',
  });
}

function repositoryStub(overrides: Partial<AuditAdminRepository> = {}): AuditAdminRepository {
  return {
    canReadAdminSummary: vi.fn().mockResolvedValue(true),
    approvedAdminSummaryMetricIds: vi.fn().mockResolvedValue(new Set<string>()),
    canReadAudit: vi.fn().mockResolvedValue(true),
    listRedactedAuditEvents: vi.fn().mockResolvedValue([]),
    getRedactedAuditEvent: vi.fn().mockResolvedValue(null),
    verifyAuditChain: vi.fn(),
    getAuditExportBatch: vi.fn().mockResolvedValue(null),
    requestAuditExport: vi.fn().mockResolvedValue(accepted),
    readiness: vi.fn(),
    healthExposureEnabled: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function authorizedActor(): AuditAdminActor {
  return {
    personId: '81000000-0000-4000-8000-000000000014',
    principal: 'synthetic-super-admin',
    sessionCurrent: true,
    aal: 2,
    factorAgeSeconds: 300,
    purpose: 'security.audit.review',
    requestId: '84000000-0000-4000-8000-000000000003',
    traceId: 'trace-008-audit-export',
  };
}
