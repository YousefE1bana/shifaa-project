import { randomBytes, randomUUID } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

import type {
  AuditExportCompletion,
  AuditExportClaim,
  AuditExportWorkPort,
} from './audit-export.js';

type ClaimRow = {
  event_id: string;
  export_batch_id: string;
  aggregate_version: number;
  attempt_count: number;
  lease_owner: string;
  lease_expires_at: Date | string;
};

export class PostgresAuditExportWorkAdapter implements AuditExportWorkPort {
  private readonly sql: Sql;

  public constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: true,
      onnotice: () => undefined,
    });
  }

  public async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  public async claimNext(
    workerId: string,
    leaseSeconds: number,
    _now: Date,
  ): Promise<AuditExportClaim | null> {
    return this.sql.begin(async (sql) => {
      const requestId = randomUUID();
      const traceId = randomBytes(16).toString('hex');
      await sql`select set_config('shifaa.worker_id',${workerId},true),
        set_config('shifaa.environment','local',true)`;
      const [row] = await sql<ClaimRow[]>`
        select * from audit.claim_export_v1(${workerId},${leaseSeconds},${requestId}::uuid,${traceId})
      `;
      return row
        ? {
            eventId: row.event_id,
            receiptId: row.event_id,
            exportBatchId: row.export_batch_id,
            aggregateVersion: Number(row.aggregate_version),
            attemptCount: Number(row.attempt_count),
            leaseOwner: row.lease_owner,
            leaseExpiresAt: iso(row.lease_expires_at),
          }
        : null;
    });
  }

  public async complete(completion: AuditExportCompletion): Promise<boolean> {
    return this.sql.begin(async (sql) => {
      await sql`select set_config('shifaa.worker_id',${completion.workerId},true),
        set_config('shifaa.environment','local',true)`;
      const digest =
        completion.outcome === 'proven' ? Buffer.from(completion.objectDigest, 'hex') : null;
      const proof =
        completion.outcome === 'proven'
          ? {
              proof_version: 1,
              proof_class: 'synthetic_write_once',
              verified_at: new Date().toISOString(),
            }
          : null;
      const [row] = await sql<{ completed: boolean }[]>`
        select audit.complete_export_v1(
          ${completion.claim.exportBatchId}::uuid,${completion.workerId},${completion.outcome},
          ${digest}::bytea,${sql.json(proof)}::jsonb,
          ${completion.outcome === 'proven' ? null : completion.failureCode},
          ${completion.outcome === 'retryable' ? completion.retryAt : null}::timestamptz,
          ${completion.requestId}::uuid,${completion.traceId}
        ) as completed
      `;
      return row?.completed === true;
    });
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
