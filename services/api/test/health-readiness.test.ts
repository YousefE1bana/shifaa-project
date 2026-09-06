import { describe, expect, it, vi } from 'vitest';

import { AuditAdminHealthService } from '../src/modules/audit-admin/health-service.js';
import type {
  AuditExportServiceActor,
  ReadinessSnapshot,
} from '../src/modules/audit-admin/types.js';

const observedAt = '2026-09-01T12:00:00.000Z';

describe('Feature 008 bounded health policy', () => {
  it('keeps liveness process-only and rejects non-platform principals', () => {
    const readiness = vi.fn<() => Promise<ReadinessSnapshot>>();
    const auditIntegrity = vi.fn<() => Promise<'ready' | 'failed'>>();
    const exportProof = vi.fn<() => Promise<'ready' | 'failed'>>();
    const telemetry = { emit: vi.fn() };
    const service = new AuditAdminHealthService({
      readiness: { readiness },
      integrity: { auditIntegrity, exportProof },
      clock: { now: () => new Date(observedAt) },
      telemetry,
    });

    expect(service.healthLive(platformActor())).toEqual({
      status: 'live',
      observed_at: observedAt,
    });
    expect(readiness).not.toHaveBeenCalled();
    expect(auditIntegrity).not.toHaveBeenCalled();
    expect(exportProof).not.toHaveBeenCalled();
    expect(telemetry.emit).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'health', operation: 'healthLive', outcome: 'succeeded' }),
    );
    expect(() => service.healthLive({ ...platformActor(), authenticated: false })).toThrowError(
      expect.objectContaining({ code: 'authentication-required', status: 401 }),
    );
    expect(() =>
      service.healthLive({
        ...platformActor(),
        principal: 'service:audit-export-worker',
        workerId: 'worker.export.008',
      }),
    ).toThrowError(expect.objectContaining({ code: 'forbidden', status: 403 }));
  });

  it.each([
    [snapshot('ready', 'ready'), 'ready', []],
    [snapshot('ready', 'backlogged'), 'degraded', ['outbox_backlog']],
    [snapshot('unavailable', 'ready'), 'not_ready', ['database_unavailable']],
    [snapshot('ready', 'integrity_failed'), 'not_ready', ['outbox_integrity_failed']],
  ] as const)(
    'maps database/outbox state to bounded readiness %#',
    async (databaseSnapshot, expectedStatus, expectedReasons) => {
      const service = serviceFor({ readiness: databaseSnapshot });
      const result = await service.healthReady(platformActor());
      expect(result).toEqual({
        status: expectedStatus,
        reasons: expectedReasons,
        observed_at: observedAt,
      });
    },
  );

  it('fails closed for audit-chain, export-proof, thrown, and timed-out checks', async () => {
    const failedIntegrity = serviceFor({ auditIntegrity: 'failed', exportProof: 'failed' });
    expect(await failedIntegrity.healthReady(platformActor())).toMatchObject({
      status: 'not_ready',
      reasons: ['audit_integrity_failed', 'export_proof_failed'],
    });

    const timedOut = new AuditAdminHealthService({
      readiness: { readiness: () => new Promise(() => undefined) },
      integrity: {
        auditIntegrity: async () => {
          throw new Error('synthetic SQL detail must not escape');
        },
        exportProof: () => new Promise(() => undefined),
      },
      clock: { now: () => new Date(observedAt) },
      timeoutMs: 5,
    });
    expect(await timedOut.healthReady(platformActor())).toEqual({
      status: 'not_ready',
      reasons: ['database_unavailable', 'audit_integrity_failed', 'export_proof_failed'],
      observed_at: observedAt,
    });

    const ambiguous = serviceFor({
      readiness: { status: 'not_ready', database: 'ready', outbox: 'ready' },
    });
    expect(await ambiguous.healthReady(platformActor())).toMatchObject({
      status: 'not_ready',
      reasons: ['database_unavailable'],
    });
  });
});

function serviceFor(
  overrides: {
    readiness?: ReadinessSnapshot;
    auditIntegrity?: 'ready' | 'failed';
    exportProof?: 'ready' | 'failed';
  } = {},
) {
  return new AuditAdminHealthService({
    readiness: { readiness: async () => overrides.readiness ?? snapshot('ready', 'ready') },
    integrity: {
      auditIntegrity: async () => overrides.auditIntegrity ?? 'ready',
      exportProof: async () => overrides.exportProof ?? 'ready',
    },
    clock: { now: () => new Date(observedAt) },
  });
}

function snapshot(
  database: ReadinessSnapshot['database'],
  outbox: ReadinessSnapshot['outbox'],
): ReadinessSnapshot {
  return {
    status:
      database === 'ready' && outbox === 'ready'
        ? 'ready'
        : outbox === 'backlogged' && database === 'ready'
          ? 'degraded'
          : 'not_ready',
    database,
    outbox,
  };
}

function platformActor(): AuditExportServiceActor {
  return {
    authenticated: true,
    principal: 'service:platform-probe',
    workerId: null,
    requestId: '84000000-0000-4000-8000-000000000099',
    traceId: 'f'.repeat(32),
  };
}
