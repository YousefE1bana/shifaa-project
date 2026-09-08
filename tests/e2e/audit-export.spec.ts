import assert from 'node:assert/strict';
import test from 'node:test';

import { generatedAuditAdminOperationIds } from '../../packages/api-client/src/audit-admin.ts';
import { auditAdminAuthorizationFixtures } from '../../packages/test-kit/src/audit-admin-fixtures.ts';
import { AuditAdminService } from '../../services/api/src/modules/audit-admin/service.ts';
import type {
  AuditAdminActor,
  AuditAdminRepository,
  AuditExportAccepted,
  AuditExportRequestCommand,
} from '../../services/api/src/modules/audit-admin/types.ts';
import { ApiPolicyError } from '../../services/api/src/modules/identity-onboarding/errors.ts';
import {
  canQueueAuditExport,
  exportStateFromEvidence,
  parseAuditDetail,
} from '../../apps/admin/src/app/audit/audit-model.ts';

const body = { partition_start: '2026-05-01', partition_end_exclusive: '2026-08-01' };

test('AC-03/05: authorized concurrent export requests collapse and changed-body replay conflicts', async () => {
  assert.equal(
    auditAdminAuthorizationFixtures.filter((fixture) => fixture.adminExport === 'allow').length,
    1,
  );
  const harness = exportServiceHarness();

  const [first, replay] = await Promise.all([
    harness.service.createAuditExport(authorizedActor(), body, 'synthetic-008-export-key'),
    harness.service.createAuditExport(authorizedActor(), body, 'synthetic-008-export-key'),
  ]);
  assert.deepEqual(replay, first);
  assert.equal(harness.effects(), 1);
  await assert.rejects(
    harness.service.createAuditExport(
      authorizedActor(),
      { ...body, partition_start: '2026-06-01' },
      'synthetic-008-export-key',
    ),
    (error: unknown) =>
      error instanceof ApiPolicyError &&
      error.status === 409 &&
      error.code === 'idempotency-key-reused',
  );
  assert.equal(harness.effects(), 1);
});

test('AC-06/07: export UI trusts only verified catalogued audit evidence', () => {
  for (const [actionCode, expected] of [
    ['audit.export.requested', 'queued'],
    ['audit.export.retryable', 'retrying'],
    ['audit.export.failed', 'failed'],
    ['audit.export.dead_lettered', 'dead_letter'],
    ['audit.export.proven', 'proven'],
  ] as const) {
    const parsed = parseAuditDetail({ event: safeEvent(actionCode) });
    assert.ok(parsed);
    assert.equal(exportStateFromEvidence(parsed), expected);
  }
  const tampered = parseAuditDetail({
    event: {
      ...safeEvent('audit.export.proven'),
      chain: { ...safeEvent('audit.export.proven').chain, verification: 'failed' },
    },
  });
  assert.ok(tampered);
  assert.equal(exportStateFromEvidence(tampered), 'failed');
  assert.equal(generatedAuditAdminOperationIds.includes('getAuditExportStatus' as never), false);
  assert.equal(generatedAuditAdminOperationIds.length, 7);
});

test('AC-08: offline export produces zero effects and monthly range/purpose gates fail closed', () => {
  assert.equal(
    canQueueAuditExport({
      online: false,
      authorized: true,
      purpose: 'security.audit.review',
      partitionStart: '2026-05-01',
      partitionEndExclusive: '2026-08-01',
    }),
    false,
  );
  assert.equal(
    canQueueAuditExport({
      online: true,
      authorized: true,
      purpose: null,
      partitionStart: '2026-05-01',
      partitionEndExclusive: '2026-08-01',
    }),
    false,
  );
  assert.equal(
    canQueueAuditExport({
      online: true,
      authorized: true,
      purpose: 'security.audit.review',
      partitionStart: '2026-05-02',
      partitionEndExclusive: '2026-08-01',
    }),
    false,
  );
});

function exportServiceHarness() {
  const requests = new Map<string, { hash: string; response: Promise<AuditExportAccepted> }>();
  let effectCount = 0;
  const accepted: AuditExportAccepted = {
    export_batch_id: '83000000-0000-4000-8000-000000000001',
    status: 'queued',
    partition_start: body.partition_start,
    partition_end_exclusive: body.partition_end_exclusive,
    accepted_at: '2026-09-01T12:00:00.000Z',
  };
  const repository: AuditAdminRepository = {
    canReadAdminSummary: async () => true,
    canReadAudit: async () => true,
    listRedactedAuditEvents: async () => [],
    getRedactedAuditEvent: async () => null,
    verifyAuditChain: async () => ({
      valid: true,
      checked_count: 0,
      first_invalid_sequence: null,
      failure_code: null,
    }),
    getAuditExportBatch: async () => null,
    requestAuditExport: async (_actor, command: AuditExportRequestCommand) => {
      const previous = requests.get(command.idempotencyKey);
      if (previous && previous.hash !== command.requestHash)
        throw new ApiPolicyError('idempotency-key-reused', 409, 'idempotency-key-reused');
      if (previous) return previous.response;
      const response = Promise.resolve(accepted);
      requests.set(command.idempotencyKey, { hash: command.requestHash, response });
      effectCount += 1;
      return response;
    },
    readiness: async () => ({ status: 'ready', database: 'ready', outbox: 'ready' }),
  };
  const service = new AuditAdminService({
    repository,
    policy: {
      getApprovedPolicy: async () => null,
      getApprovedRuntimeConfigurationSha256: async () => null,
    },
    aggregates: { getCells: async () => [] },
    clock: { now: () => new Date('2026-09-01T12:00:00.000Z') },
    cursorSecret: 'synthetic-cursor-secret-008-at-least-32-bytes',
  });
  return {
    service,
    effects: () => effectCount,
  };
}

function authorizedActor(): AuditAdminActor {
  return {
    personId: '81000000-0000-4000-8000-000000000014',
    principal: 'synthetic-super-admin',
    sessionCurrent: true,
    aal: 2,
    factorAgeSeconds: 300,
    requestedPurpose: 'security.audit.review',
    requestId: '84000000-0000-4000-8000-000000000003',
    traceId: 'trace-008-audit-export',
  };
}

function safeEvent(actionCode: string) {
  return {
    event_id: '82000000-0000-4000-8000-000000000001',
    occurred_at: '2026-09-01T12:00:00.000Z',
    request_id: '84000000-0000-4000-8000-000000000001',
    trace_id: '84000000000040008000000000000001',
    actor_person_id: null,
    authentication_aal: 2,
    facility_id: null,
    patient_id: null,
    purpose_code: 'security.audit.review',
    action_code: actionCode,
    resource_type: 'audit_export',
    resource_id: '83000000-0000-4000-8000-000000000001',
    resource_version: 1,
    outcome: 'success',
    reason_code: null,
    source_ip_prefix: null,
    user_agent_class: 'worker',
    chain: {
      version: 1,
      partition: '2026-09-01',
      sequence: 1,
      previous_hash: '0'.repeat(64),
      event_hash: '1'.repeat(64),
      verification: 'verified',
    },
  };
}
