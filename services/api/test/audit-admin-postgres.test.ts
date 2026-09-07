import type { TransactionSql } from 'postgres';
import { describe, expect, it } from 'vitest';

import { PostgresAuditAdminRepository } from '../src/adapters/postgres/audit-admin-service.js';
import type { AuditAdminActor } from '../src/modules/audit-admin/types.js';

describe('Postgres audit admin repository', () => {
  it('uses non-owner fixed-shape functions and strips non-DTO source fields', async () => {
    const statements: string[] = [];
    const sql = fakeSql(statements);
    const repository = new PostgresAuditAdminRepository(
      { withRawTransaction: async (work) => work(sql) },
      'ci',
    );

    await expect(repository.canReadAdminSummary(actor())).resolves.toBe(true);
    await expect(repository.canReadAudit(actor())).resolves.toBe(true);
    await expect(
      repository.approvedAdminSummaryMetricIds(actor(), ['synthetic_patient_total']),
    ).resolves.toEqual(new Set());
    const events = await repository.listRedactedAuditEvents(actor(), { limit: 26 });
    const detail = await repository.getRedactedAuditEvent(actor(), events[0]!.event_id);
    const chain = await repository.verifyAuditChain(actor(), '2026-08-01');
    const batch = await repository.getAuditExportBatch(
      actor(),
      '83000000-0000-4000-8000-000000000001',
    );
    const accepted = await repository.requestAuditExport(actor(), {
      input: { partition_start: '2026-05-01', partition_end_exclusive: '2026-08-01' },
      idempotencyKey: 'synthetic-idempotency-key-0001',
      requestHash: 'a'.repeat(64),
    });
    const readiness = await repository.readiness();
    await expect(repository.healthExposureEnabled()).resolves.toBe(true);
    await expect(repository.auditIntegrity()).resolves.toBe('ready');
    await expect(repository.exportProof()).resolves.toBe('ready');

    expect(events).toHaveLength(1);
    expect(detail).toEqual(events[0]);
    expect(JSON.stringify(events)).not.toContain('raw_metadata');
    expect(JSON.stringify(events)).not.toContain('SYNTHETIC-RAW-METADATA');
    expect(chain).toEqual({
      valid: true,
      checked_count: 1,
      first_invalid_sequence: null,
      failure_code: null,
    });
    expect(batch).toMatchObject({
      export_batch_id: '83000000-0000-4000-8000-000000000001',
      object_digest: null,
    });
    expect(accepted).toEqual({
      export_batch_id: '83000000-0000-4000-8000-000000000001',
      status: 'queued',
      partition_start: '2026-05-01',
      partition_end_exclusive: '2026-08-01',
      accepted_at: '2026-09-01T12:00:00.000Z',
    });
    expect(readiness).toEqual({ status: 'ready', database: 'ready', outbox: 'ready' });
    expect(statements.join('\n')).toContain("set_config('shifaa.environment'");
    expect(statements.join('\n')).toContain('audit.read_events_v1');
    expect(statements.join('\n')).toContain('audit.read_event_v1');
    expect(statements.join('\n').match(/audit\.record_admin_read_v1/g)).toHaveLength(2);
    expect(statements.join('\n')).toContain('audit.read_chain_verification_v1');
    expect(statements.join('\n')).toContain('audit.read_export_batch_v1');
    expect(statements.join('\n')).toContain('audit.request_export_v1');
    expect(statements.join('\n')).toContain('audit.readiness_v1');
    expect(statements.join('\n')).not.toMatch(
      /from\s+audit\.(events|export_batches|signature_evidence)\b/i,
    );
    expect(statements.join('\n')).not.toContain('metadata');
  });
});

function fakeSql(statements: string[]): TransactionSql {
  const execute = (strings: TemplateStringsArray) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim();
    statements.push(statement);
    if (statement.includes('current_admin_summary_context_v1'))
      return Promise.resolve([{ allowed: true }]);
    if (statement.includes('current_super_admin_context_v1'))
      return Promise.resolve([{ allowed: true }]);
    if (statement.includes('read_events_v1') || statement.includes('read_event_v1')) {
      return Promise.resolve([auditRow()]);
    }
    if (statement.includes('read_chain_verification_v1')) {
      return Promise.resolve([
        { valid: true, checked_count: '1', first_invalid_sequence: null, failure_code: null },
      ]);
    }
    if (statement.includes('read_export_batch_v1')) {
      return Promise.resolve([
        {
          export_batch_id: '83000000-0000-4000-8000-000000000001',
          status: 'queued',
          partition_start: '2026-05-01',
          partition_end_exclusive: '2026-08-01',
          object_digest: null,
          exported_at: null,
          failure_code: null,
          version: 1,
        },
      ]);
    }
    if (statement.includes('request_export_v1')) {
      return Promise.resolve([
        {
          export_batch_id: '83000000-0000-4000-8000-000000000001',
          status: 'queued',
          partition_start: '2026-05-01',
          partition_end_exclusive: '2026-08-01',
          accepted_at: '2026-09-01T12:00:00.000Z',
          idempotency_state: 'created',
        },
      ]);
    }
    if (statement.includes('readiness_v1')) {
      return Promise.resolve([{ database_status: 'ready', outbox_status: 'ready' }]);
    }
    if (statement.includes("feature_enabled('health.exposure'")) {
      return Promise.resolve([{ enabled: true }]);
    }
    if (statement.includes('health_integrity_v1')) {
      return Promise.resolve([{ audit_integrity: 'ready', export_proof: 'ready' }]);
    }
    return Promise.resolve([]);
  };
  return execute as unknown as TransactionSql;
}

function auditRow() {
  return {
    event_id: '82000000-0000-4000-8000-000000000001',
    occurred_at: '2026-08-31T12:00:00.000Z',
    request_id: '84000000-0000-4000-8000-000000000001',
    trace_id: 'trace-008-postgres',
    actor_person_id: '81000000-0000-4000-8000-000000000014',
    auth_aal: 2,
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
    chain_version: 1,
    partition_key: '2026-08-01',
    chain_sequence: '1',
    previous_hash: '0'.repeat(64),
    event_hash: '1'.repeat(64),
    chain_verification: 'verified',
    raw_metadata: 'SYNTHETIC-RAW-METADATA',
  };
}

function actor(): AuditAdminActor {
  return {
    personId: '81000000-0000-4000-8000-000000000014',
    principal: 'synthetic-super-admin',
    sessionCurrent: true,
    aal: 2,
    factorAgeSeconds: 300,
    purpose: 'security.audit.review',
    requestId: '84000000-0000-4000-8000-000000000001',
    traceId: 'trace-008-postgres',
  };
}
