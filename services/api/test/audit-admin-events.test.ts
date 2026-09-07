import { auditAdminAuthorizationFixtures } from '@shifaa/test-kit/audit-admin-fixtures';
import { describe, expect, it, vi } from 'vitest';

import { AuditAdminService } from '../src/modules/audit-admin/service.js';
import type {
  AuditAdminActor,
  AuditAdminRepository,
  RedactedAuditEvent,
} from '../src/modules/audit-admin/types.js';

const authorizedPersonId = '81000000-0000-4000-8000-000000000014';

describe('audit admin event reads', () => {
  it('allows only the current super-admin, AAL2, purpose matrix case', async () => {
    for (const fixture of auditAdminAuthorizationFixtures) {
      const event = auditEvent(1);
      const repository = repositoryStub({
        canReadAudit: vi.fn().mockResolvedValue(fixture.auditRead === 'allow'),
        listRedactedAuditEvents: vi.fn().mockResolvedValue([event]),
      });
      const service = makeService(repository);
      const actor = actorFrom(fixture);

      if (fixture.auditRead === 'allow') {
        await expect(service.listAuditEvents(actor, {})).resolves.toEqual({
          data: [event],
          meta: { next_cursor: null },
        });
      } else {
        await expect(service.listAuditEvents(actor, {})).rejects.toMatchObject({
          status: expect.any(Number),
        });
        expect(repository.listRedactedAuditEvents).not.toHaveBeenCalled();
      }
    }
  });

  it('caps pages at 100 and emits an encrypted, bounded cursor', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => auditEvent(index + 1));
    const listRedactedAuditEvents = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    const service = makeService(repositoryStub({ listRedactedAuditEvents }));
    const actor = authorizedActor();

    const first = await service.listAuditEvents(actor, { limit: 100 });

    expect(first.data).toHaveLength(100);
    expect(first.meta.next_cursor).toEqual(expect.any(String));
    expect(first.meta.next_cursor!.length).toBeLessThanOrEqual(512);
    expect(first.meta.next_cursor).not.toContain(first.data[99]!.event_id);
    await service.listAuditEvents(actor, { cursor: first.meta.next_cursor! });
    expect(listRedactedAuditEvents).toHaveBeenLastCalledWith(
      actor,
      expect.objectContaining({
        limit: 26,
        after: {
          occurredAt: first.data[99]!.occurred_at,
          eventId: first.data[99]!.event_id,
        },
      }),
    );
  });

  it('rejects unbounded, malformed, or tampered cursors before repository reads', async () => {
    const repository = repositoryStub();
    const service = makeService(repository);
    for (const query of [
      { limit: 0 },
      { limit: 101 },
      { cursor: 'not-a-valid-cursor' },
      { cursor: 'a'.repeat(513) },
    ]) {
      await expect(service.listAuditEvents(authorizedActor(), query)).rejects.toMatchObject({
        code: 'validation-failed',
        status: 400,
      });
    }
    expect(repository.listRedactedAuditEvents).not.toHaveBeenCalled();
  });

  it('returns only a fixed redacted detail projection and hides unauthorized existence', async () => {
    const event = auditEvent(1);
    const allowed = makeService(
      repositoryStub({ getRedactedAuditEvent: vi.fn().mockResolvedValue(event) }),
    );
    await expect(allowed.getAuditEvent(authorizedActor(), event.event_id)).resolves.toEqual({
      event,
    });

    const deniedRepository = repositoryStub({
      canReadAudit: vi.fn().mockResolvedValue(false),
      getRedactedAuditEvent: vi.fn().mockResolvedValue(event),
    });
    await expect(
      makeService(deniedRepository).getAuditEvent(
        { ...authorizedActor(), personId: '81000000-0000-4000-8000-000000000008' },
        event.event_id,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(deniedRepository.getRedactedAuditEvent).not.toHaveBeenCalled();
  });
});

function makeService(repository: AuditAdminRepository): AuditAdminService {
  return new AuditAdminService({
    repository,
    policy: {
      getApprovedPolicy: vi.fn(),
      getApprovedRuntimeConfigurationSha256: vi.fn(),
    },
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
    requestAuditExport: vi.fn(),
    readiness: vi.fn(),
    healthExposureEnabled: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function actorFrom(fixture: (typeof auditAdminAuthorizationFixtures)[number]): AuditAdminActor {
  return {
    personId: fixture.actorPersonId,
    principal: fixture.actorPersonId ? `principal-${fixture.scenario}` : null,
    sessionCurrent: fixture.scenario !== 'unauthenticated',
    aal: fixture.aal,
    factorAgeSeconds: fixture.factorAgeSeconds,
    purpose: fixture.purpose,
    requestId: '84000000-0000-4000-8000-000000000002',
    traceId: `trace-008-${fixture.scenario}`,
  };
}

function authorizedActor(): AuditAdminActor {
  return {
    personId: authorizedPersonId,
    principal: 'synthetic-super-admin',
    sessionCurrent: true,
    aal: 2,
    factorAgeSeconds: 300,
    purpose: 'security.audit.review',
    requestId: '84000000-0000-4000-8000-000000000003',
    traceId: 'trace-008-audit-read',
  };
}

function auditEvent(index: number): RedactedAuditEvent {
  const suffix = String(index).padStart(12, '0');
  return {
    event_id: `82000000-0000-4000-8000-${suffix}`,
    occurred_at: new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999 - index)).toISOString(),
    request_id: '84000000-0000-4000-8000-000000000004',
    trace_id: 'trace-008-redacted',
    actor_person_id: authorizedPersonId,
    authentication_aal: 2,
    facility_id: null,
    patient_id: null,
    purpose_code: 'security.audit.review',
    action_code: 'list_audit_events',
    resource_type: 'audit_event',
    resource_id: null,
    resource_version: 1,
    outcome: 'success',
    reason_code: null,
    source_ip_prefix: '192.0.2.0/24',
    user_agent_class: 'web',
    chain: {
      version: 1,
      partition: '2026-08-01',
      sequence: index,
      previous_hash: '0'.repeat(64),
      event_hash: '1'.repeat(64),
      verification: 'verified',
    },
  };
}
