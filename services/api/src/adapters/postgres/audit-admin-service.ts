import type { TransactionSql } from 'postgres';

import type {
  AuditAdminActor,
  AuditAdminRepository,
  AuditEventRepositoryQuery,
  AuditExportBatch,
  ChainVerification,
  ReadinessSnapshot,
  RedactedAuditEvent,
} from '../../modules/audit-admin/types.js';
import type { PostgresIdentityRepository } from './identity-repository.js';

type RawTransactionRepository = Pick<PostgresIdentityRepository, 'withRawTransaction'>;

type AuditEventRow = {
  event_id: string;
  occurred_at: Date | string;
  request_id: string;
  trace_id: string;
  actor_person_id: string | null;
  auth_aal: 1 | 2 | null;
  facility_id: string | null;
  patient_id: string | null;
  purpose_code: string | null;
  action_code: string;
  resource_type: string;
  resource_id: string | null;
  resource_version: number | null;
  outcome: 'success' | 'denied' | 'failed';
  reason_code: string | null;
  source_ip_prefix: string | null;
  user_agent_class: RedactedAuditEvent['user_agent_class'];
  chain_version: 1;
  partition_key: Date | string;
  chain_sequence: number | string;
  previous_hash: string;
  event_hash: string;
  chain_verification: 'verified' | 'failed';
};

type ChainRow = {
  valid: boolean;
  checked_count: number | string;
  first_invalid_sequence: number | string | null;
  failure_code: string | null;
};

type ExportBatchRow = Omit<
  AuditExportBatch,
  'partition_start' | 'partition_end_exclusive' | 'exported_at'
> & {
  partition_start: Date | string;
  partition_end_exclusive: Date | string;
  exported_at: Date | string | null;
};

type ReadinessRow = {
  database_status: ReadinessSnapshot['database'];
  outbox_status: ReadinessSnapshot['outbox'];
};

export class PostgresAuditAdminRepository implements AuditAdminRepository {
  public constructor(
    private readonly repository: RawTransactionRepository,
    private readonly environment: 'local' | 'ci' | 'production',
  ) {}

  public async canReadAdminSummary(actor: AuditAdminActor): Promise<boolean> {
    return this.withActor(actor, async (sql) => {
      const [row] = await sql<{ allowed: boolean }[]>`
        select audit.current_admin_summary_context_v1() as allowed
      `;
      return row?.allowed === true;
    });
  }

  public async canReadAudit(actor: AuditAdminActor): Promise<boolean> {
    return this.withActor(actor, async (sql) => {
      const [row] = await sql<{ allowed: boolean }[]>`
        select audit.current_super_admin_context_v1('security.audit.review')
          and platform.feature_enabled('audit.read',platform.context_environment()) as allowed
      `;
      return row?.allowed === true;
    });
  }

  public async listRedactedAuditEvents(
    actor: AuditAdminActor,
    query: AuditEventRepositoryQuery,
  ): Promise<readonly RedactedAuditEvent[]> {
    return this.withActor(actor, async (sql) => {
      const rows = await sql<AuditEventRow[]>`
        select * from audit.read_events_v1(
          ${query.actor ?? null}::uuid,
          ${query.action ?? null},
          ${query.resourceType ?? null},
          ${query.resourceId ?? null}::uuid,
          ${query.occurredFrom ?? null}::timestamptz,
          ${query.occurredBefore ?? null}::timestamptz,
          ${query.outcome ?? null},
          ${query.after?.occurredAt ?? null}::timestamptz,
          ${query.after?.eventId ?? null}::uuid,
          ${query.limit}
        )
      `;
      return rows.map(redactedEvent);
    });
  }

  public async getRedactedAuditEvent(
    actor: AuditAdminActor,
    eventId: string,
  ): Promise<RedactedAuditEvent | null> {
    return this.withActor(actor, async (sql) => {
      const [row] = await sql<AuditEventRow[]>`
        select * from audit.read_event_v1(${eventId}::uuid)
      `;
      return row ? redactedEvent(row) : null;
    });
  }

  public async verifyAuditChain(
    actor: AuditAdminActor,
    partition: string,
  ): Promise<ChainVerification> {
    return this.withActor(actor, async (sql) => {
      const [row] = await sql<ChainRow[]>`
        select * from audit.read_chain_verification_v1(${partition}::date)
      `;
      if (!row)
        return {
          valid: false,
          checked_count: 0,
          first_invalid_sequence: null,
          failure_code: 'forbidden',
        };
      return {
        valid: row.valid,
        checked_count: Number(row.checked_count),
        first_invalid_sequence:
          row.first_invalid_sequence === null ? null : Number(row.first_invalid_sequence),
        failure_code: row.failure_code,
      };
    });
  }

  public async getAuditExportBatch(
    actor: AuditAdminActor,
    exportBatchId: string,
  ): Promise<AuditExportBatch | null> {
    return this.withActor(actor, async (sql) => {
      const [row] = await sql<ExportBatchRow[]>`
        select * from audit.read_export_batch_v1(${exportBatchId}::uuid)
      `;
      return row
        ? {
            ...row,
            partition_start: dateOnly(row.partition_start),
            partition_end_exclusive: dateOnly(row.partition_end_exclusive),
            exported_at: row.exported_at ? iso(row.exported_at) : null,
          }
        : null;
    });
  }

  public async readiness(): Promise<ReadinessSnapshot> {
    return this.repository.withRawTransaction(async (sql) => {
      const [row] = await sql<ReadinessRow[]>`select * from audit.readiness_v1()`;
      if (!row) return { status: 'not_ready', database: 'unavailable', outbox: 'integrity_failed' };
      return {
        status:
          row.database_status === 'ready' && row.outbox_status === 'ready' ? 'ready' : 'not_ready',
        database: row.database_status,
        outbox: row.outbox_status,
      };
    });
  }

  private async withActor<T>(
    actor: AuditAdminActor,
    work: (sql: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${actor.personId ?? ''},true),
          set_config('shifaa.aal',${String(actor.aal ?? 0)},true),
          set_config('shifaa.purposes',${actor.purpose ?? ''},true),
          set_config('shifaa.principal',${actor.principal ?? ''},true),
          set_config('shifaa.environment',${this.environment},true)
      `;
      return work(sql);
    });
  }
}

function redactedEvent(row: AuditEventRow): RedactedAuditEvent {
  return {
    event_id: row.event_id,
    occurred_at: iso(row.occurred_at),
    request_id: row.request_id,
    trace_id: row.trace_id,
    actor_person_id: row.actor_person_id,
    authentication_aal: row.auth_aal,
    facility_id: row.facility_id,
    patient_id: row.patient_id,
    purpose_code: row.purpose_code,
    action_code: row.action_code,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    resource_version: row.resource_version,
    outcome: row.outcome,
    reason_code: row.reason_code,
    source_ip_prefix: row.source_ip_prefix,
    user_agent_class: row.user_agent_class,
    chain: {
      version: row.chain_version,
      partition: dateOnly(row.partition_key),
      sequence: Number(row.chain_sequence),
      previous_hash: row.previous_hash,
      event_hash: row.event_hash,
      verification: row.chain_verification,
    },
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
