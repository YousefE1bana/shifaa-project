import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import {
  discloseAggregateRelease,
  runtimeAggregateConfigurationSha256,
  type AggregateCellInput,
  type AggregateMetricConfiguration,
  type AggregatePolicyConfiguration,
} from '../packages/core/src/audit-admin/aggregate-policy.ts';
import { auditAdminApprovedPrivacyPolicy } from '../packages/test-kit/src/audit-admin-privacy-fixtures.ts';
import { idempotencyScopeHash } from '../services/api/src/platform/idempotency.ts';
import postgres, { type Sql, type TransactionSql } from 'postgres';

const database = 'shifaa_f008_performance';
const eventCount = 250_000;
const aggregateCellCount = 50;
const apiConnectionCount = 20;
const workerCount = 25;
const readThresholdMs = 400;
const mutationThresholdMs = 800;
const actorPersonId = '81000000-0000-4000-8000-000000000014';
const evidencePath =
  'specs/008-audit-admin-aggregates-observability/evidence/performance/load-profile.json';
const baselineMigrations = [
  'infra/db/migrations/001_identity_onboarding.sql',
  'supabase/migrations/20260811000300_facility_onboarding_rbac.sql',
  'supabase/migrations/20260811000400_facility_onboarding_rbac_storage.sql',
  'supabase/migrations/20260811000500_family_care_relationships.sql',
  'supabase/migrations/20260811000600_family_care_storage.sql',
  'supabase/migrations/20260813000500_privacy_dsr_notifications.sql',
  'supabase/migrations/20260813000600_privacy_dsr_storage.sql',
  'supabase/migrations/20260820000600_discovery_sos_foundation.sql',
  'supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql',
];
const featureMigration =
  'supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql';
const securityMigration = 'supabase/migrations/20260908000800_sec_008_idempotency_privacy.sql';
const partitions = [
  { month: '2026-05-01', next: '2026-06-01', count: 83_334 },
  { month: '2026-06-01', next: '2026-07-01', count: 83_333 },
  { month: '2026-07-01', next: '2026-08-01', count: 83_333 },
] as const;
const connectionOptions = {
  host: '127.0.0.1',
  port: 5432,
  username: 'shifaa_owner',
  password: 'synthetic_owner_only',
};

function runDocker(args: readonly string[], quiet = false): void {
  const result = spawnSync('docker', [...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: quiet ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed\n${result.stderr?.trim() ?? ''}`);
  }
}

function runPsql(targetDatabase: string, args: readonly string[]): void {
  runDocker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'shifaa_owner',
      '-d',
      targetDatabase,
      ...args,
    ],
    true,
  );
}

function recreateDatabase(): void {
  runPsql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`]);
  runPsql('postgres', ['-c', `CREATE DATABASE ${database}`]);
}

function dropDatabase(): void {
  runPsql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`]);
}

function applyMigrations(): void {
  for (const migration of [...baselineMigrations, featureMigration, securityMigration]) {
    runPsql(database, ['-f', `/workspace/${migration}`]);
  }
}

function connect(username: string, password: string, max: number): Sql {
  return postgres({ ...connectionOptions, database, username, password, max, prepare: true });
}

async function seedActor(owner: Sql): Promise<void> {
  await owner.begin(async (sql) => {
    await sql.unsafe("SET LOCAL session_replication_role='replica'");
    await sql`
      INSERT INTO identity.people(
        id,user_id,display_name,nationality_code,preferred_locale,profile_status
      ) VALUES
        (
          ${actorPersonId}::uuid,'81000000-0000-4000-9000-000000000014'::uuid,
          'Synthetic Performance Audit Admin','EG','en-EG','active'
        ),
        (
          '81000000-0000-4000-8000-000000000016'::uuid,
          '81000000-0000-4000-9000-000000000016'::uuid,
          'Synthetic Performance Proposer','EG','en-EG','active'
        ),
        (
          '81000000-0000-4000-8000-000000000017'::uuid,
          '81000000-0000-4000-9000-000000000017'::uuid,
          'Synthetic Performance Decider','EG','en-EG','active'
        )
    `;
    await sql`
      INSERT INTO identity.admin_role_grants(
        id,person_id,role_code,status,valid_from,valid_until,
        proposed_by,decided_by,decision_reason
      ) VALUES (
        '81100000-0000-4000-8000-000000000014'::uuid,${actorPersonId}::uuid,
        'super_admin','active','2020-01-01T00:00:00Z','2099-01-01T00:00:00Z',
        '81000000-0000-4000-8000-000000000016'::uuid,
        '81000000-0000-4000-8000-000000000017'::uuid,'synthetic_performance'
      )
    `;
  });
}

async function seedAuditEvents(owner: Sql): Promise<void> {
  for (const partition of partitions) {
    await owner.unsafe(`
      WITH RECURSIVE chain AS (
        SELECT
          1::bigint AS sequence,
          '${partition.month}'::timestamptz + INTERVAL '1 millisecond' AS occurred_at,
          decode(repeat('00',32),'hex') AS previous_hash,
          audit.sha256_v1(convert_to(audit.canonical_event_v1(
            '${partition.month}'::timestamptz + INTERVAL '1 millisecond',
            '${partition.month}'::date,1::bigint,
            md5('f008-performance-request:${partition.month}:1')::uuid,
            'trace-f008-performance-1',NULL::uuid,'${actorPersonId}'::uuid,2::smallint,
            NULL::uuid,NULL::uuid,'security.audit.review','audit.event.read','audit_event',
            NULL::uuid,NULL::integer,'success',NULL::text,NULL::inet,'system',
            decode(repeat('00',32),'hex')
          ),'UTF8')) AS event_hash
        UNION ALL
        SELECT
          chain.sequence + 1,
          '${partition.month}'::timestamptz + (chain.sequence + 1) * INTERVAL '1 millisecond',
          chain.event_hash,
          audit.sha256_v1(convert_to(audit.canonical_event_v1(
            '${partition.month}'::timestamptz + (chain.sequence + 1) * INTERVAL '1 millisecond',
            '${partition.month}'::date,chain.sequence + 1,
            md5('f008-performance-request:${partition.month}:' || (chain.sequence + 1)::text)::uuid,
            'trace-f008-performance-' || (chain.sequence + 1)::text,
            NULL::uuid,'${actorPersonId}'::uuid,2::smallint,NULL::uuid,NULL::uuid,
            'security.audit.review','audit.event.read','audit_event',NULL::uuid,NULL::integer,
            'success',NULL::text,NULL::inet,'system',chain.event_hash
          ),'UTF8'))
        FROM chain
        WHERE chain.sequence < ${partition.count}
      )
      INSERT INTO audit.events(
        id,occurred_at,partition_key,chain_sequence,chain_version,request_id,trace_id,
        actor_person_id,authentication_aal,purpose_code,action_code,resource_type,
        outcome,user_agent_class,previous_hash,event_hash
      )
      SELECT
        md5('f008-performance-event:${partition.month}:' || sequence::text)::uuid,
        occurred_at,'${partition.month}'::date,sequence,1,
        md5('f008-performance-request:${partition.month}:' || sequence::text)::uuid,
        'trace-f008-performance-' || sequence::text,
        '${actorPersonId}'::uuid,2,'security.audit.review','audit.event.read','audit_event',
        'success','system',previous_hash,event_hash
      FROM chain
    `);
  }

  const [{ count }] = await owner<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM audit.events
    WHERE partition_key IN ('2026-05-01','2026-06-01','2026-07-01')
  `;
  assert.equal(count, eventCount, 'performance event dataset must be exact');
}

async function warmDatabasePool(
  connection: Sql,
  owner: Sql,
  username: 'shifaa_api' | 'shifaa_worker',
  expectedConnections: number,
): Promise<number> {
  const warming = Promise.all(
    Array.from({ length: expectedConnections }, () => connection`SELECT pg_sleep(0.5)`),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const [{ count }] = await owner<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM pg_catalog.pg_stat_activity
    WHERE datname=${database} AND usename=${username}
  `;
  await warming;
  assert.equal(
    count,
    expectedConnections,
    `all ${expectedConnections} ${username} connections must be warmed`,
  );
  return count;
}

async function withApiContext<T>(api: Sql, work: (sql: TransactionSql) => Promise<T>): Promise<T> {
  return api.begin(async (sql) => {
    await sql`
      SELECT
        set_config('shifaa.person_id',${actorPersonId},true),
        set_config('shifaa.principal',${`person:${actorPersonId}`},true),
        set_config('shifaa.principal_hash',${idempotencyScopeHash('principal', `person:${actorPersonId}`)},true),
        set_config('shifaa.aal','2',true),
        set_config('shifaa.purposes','security.audit.review',true),
        set_config('shifaa.environment','local',true)
    `;
    return work(sql);
  }) as Promise<T>;
}

async function measureAuditReads(api: Sql): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < 24; index += 1) {
    const partition = partitions[index % partitions.length]!;
    const started = performance.now();
    const rows = await withApiContext(
      api,
      (sql) => sql`
      SELECT * FROM audit.read_events_v1(
        NULL,NULL,NULL,NULL,${partition.month}::timestamptz,${partition.next}::timestamptz,
        NULL,NULL,NULL,100
      )
    `,
    );
    samples.push(performance.now() - started);
    assert.equal(rows.length, 100);
    assert.ok(rows.every((row) => row.chain_verification === 'verified'));
  }
  return samples;
}

function configuredAggregatePolicy(): AggregatePolicyConfiguration {
  const metrics: AggregateMetricConfiguration[] = Array.from(
    { length: aggregateCellCount },
    (_, index) => ({
      metricId: `synthetic_performance_metric_${String(index + 1).padStart(2, '0')}`,
      description: 'Synthetic performance-only distinct-person count',
      sourceEntities: ['synthetic.audit.performance'],
      protectedUnit: 'person',
      distinctSubjectKeyClass: 'internal_person_id',
      measure: 'distinct_subject_count',
      allowedDimensions: ['calendar_month_utc'],
      allowedCombinations: [[], ['calendar_month_utc']],
      zeroPolicy: 'suppress',
      linkedReleaseGroup: `synthetic_performance_group_${String(index + 1).padStart(2, '0')}`,
      cellId: `PERF-${String(index + 1).padStart(2, '0')}`,
      owner: 'synthetic_data_owner',
      approvalArtifactDigest: 'a'.repeat(64),
    }),
  );
  return {
    ...auditAdminApprovedPrivacyPolicy,
    metrics,
    linkedReleaseGroups: metrics.map((metric) => ({
      groupId: metric.linkedReleaseGroup,
      cellIds: [metric.cellId],
      equations: [],
    })),
  };
}

function measureAggregateReads(): number[] {
  const policy = configuredAggregatePolicy();
  const digest = runtimeAggregateConfigurationSha256(policy);
  const cells: AggregateCellInput[] = policy.metrics.map((metric, index) => ({
    cellId: metric.cellId,
    metricId: metric.metricId,
    distinctSubjectCount: 11 + index,
    measure: 'distinct_subject_count',
    snapshotId: `snapshot-performance-${String(index + 1).padStart(2, '0')}`,
    snapshotVersion: 1,
    snapshotAt: '2026-07-31T23:59:59.000Z',
    dimensions: { calendar_month_utc: '2026-07' },
    completedPeriod: true,
  }));
  const samples: number[] = [];
  for (let index = 0; index < 100; index += 1) {
    const started = performance.now();
    const result = discloseAggregateRelease(
      policy,
      { cells, requestedOperation: 'summary' },
      digest,
    );
    samples.push(performance.now() - started);
    assert.equal(result.decision, 'released');
    assert.equal(result.cells.length, aggregateCellCount);
  }
  return samples;
}

async function requestExports(
  api: Sql,
  phase: 'warmup' | 'measured',
): Promise<{ durations: number[]; batchIds: string[] }> {
  const results = await Promise.all(
    Array.from({ length: workerCount }, async (_, index) => {
      const suffix = String(index + 1).padStart(4, '0');
      const phaseCode = phase === 'warmup' ? '8100' : '8200';
      const bodyHashPrefix = phase === 'warmup' ? 'b' : 'a';
      const started = performance.now();
      const rows = await withApiContext(
        api,
        (sql) => sql`
        SELECT * FROM audit.request_export_v1(
          ${idempotencyScopeHash('key', `synthetic-performance-${phase}-export-${suffix}`)},${`${bodyHashPrefix.repeat(63)}${index % 10}`},
          '2026-05-01'::date,'2026-08-01'::date,
          ${`81500000-0000-4000-${phaseCode}-${String(index + 1).padStart(12, '0')}`}::uuid,
          ${`trace-f008-performance-${phase}-export-${suffix}`}
        )
      `,
      );
      assert.equal(rows.length, 1);
      return {
        duration: performance.now() - started,
        batchId: String(rows[0]!.export_batch_id),
      };
    }),
  );
  return {
    durations: results.map(({ duration }) => duration),
    batchIds: results.map(({ batchId }) => batchId),
  };
}

async function claimExports(
  worker: Sql,
  phase: 'warmup' | 'measured',
): Promise<{ durations: number[]; batchIds: string[] }> {
  const results = await Promise.all(
    Array.from({ length: workerCount }, async (_, index) => {
      const workerId = `worker-f008-performance-${phase}-${String(index + 1).padStart(2, '0')}`;
      const started = performance.now();
      const rows = await worker.begin(async (sql) => {
        await sql`
          SELECT set_config('shifaa.worker_id',${workerId},true),
            set_config('shifaa.environment','local',true)
        `;
        return sql`SELECT * FROM audit.claim_export_v1(
          ${workerId},300,${randomUUID()}::uuid,${`trace-performance-${workerId}`}
        )`;
      });
      assert.equal(rows.length, 1, `${workerId} must claim exactly one export`);
      assert.equal(rows[0]!.lease_owner, workerId);
      return {
        duration: performance.now() - started,
        batchId: String(rows[0]!.export_batch_id),
      };
    }),
  );
  return {
    durations: results.map(({ duration }) => duration),
    batchIds: results.map(({ batchId }) => batchId),
  };
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

async function main(): Promise<void> {
  runDocker(['compose', 'up', '-d', '--wait', 'postgres']);
  recreateDatabase();
  const owner = connect('shifaa_owner', 'synthetic_owner_only', 2);
  const api = connect('shifaa_api', 'synthetic_api_only', apiConnectionCount);
  const worker = connect('shifaa_worker', 'synthetic_worker_only', workerCount);
  try {
    applyMigrations();
    await seedActor(owner);
    await seedAuditEvents(owner);
    const warmedApiConnections = await warmDatabasePool(
      api,
      owner,
      'shifaa_api',
      apiConnectionCount,
    );
    const warmedWorkerConnections = await warmDatabasePool(
      worker,
      owner,
      'shifaa_worker',
      workerCount,
    );
    const warmupExportRequests = await requestExports(api, 'warmup');
    const warmupExportClaims = await claimExports(worker, 'warmup');
    assert.deepEqual(
      [...new Set(warmupExportClaims.batchIds)].sort(),
      [...new Set(warmupExportRequests.batchIds)].sort(),
      'warmup workers must claim the warmup batches exactly once',
    );
    const auditReadSamples = await measureAuditReads(api);
    const aggregateReadSamples = measureAggregateReads();
    const exportRequests = await requestExports(api, 'measured');
    assert.equal(new Set(exportRequests.batchIds).size, workerCount);
    const exportClaims = await claimExports(worker, 'measured');
    assert.equal(new Set(exportClaims.batchIds).size, workerCount);
    assert.deepEqual(
      [...new Set(exportClaims.batchIds)].sort(),
      [...new Set(exportRequests.batchIds)].sort(),
      '25 workers must claim the 25 requested batches exactly once',
    );

    const auditReadP95Ms = percentile95(auditReadSamples);
    const aggregateReadP95Ms = percentile95(aggregateReadSamples);
    const exportRequestP95Ms = percentile95(exportRequests.durations);
    const exportClaimP95Ms = percentile95(exportClaims.durations);
    const readP95Ms = Math.max(auditReadP95Ms, aggregateReadP95Ms);
    const mutationP95Ms = Math.max(exportRequestP95Ms, exportClaimP95Ms);
    assert.ok(readP95Ms <= readThresholdMs, `read p95 ${readP95Ms}ms exceeds 400ms`);
    assert.ok(
      mutationP95Ms <= mutationThresholdMs,
      `mutation p95 ${mutationP95Ms}ms exceeds 800ms (request=${exportRequestP95Ms}ms claim=${exportClaimP95Ms}ms)`,
    );

    const evidence = {
      feature: '008-audit-admin-aggregates-observability',
      evidence_class: 'synthetic_graduation_performance',
      production_claim: false,
      dataset: {
        audit_events: eventCount,
        utc_month_partitions: partitions.map(({ month, count }) => ({ month, events: count })),
        test_only_approved_aggregate_cells: aggregateCellCount,
        runtime_metrics_remain_inactive: true,
      },
      topology: {
        warmed_api_database_connections: warmedApiConnections,
        warmed_worker_database_connections: warmedWorkerConnections,
        concurrent_export_requests: workerCount,
        concurrent_export_workers: workerCount,
        external_vendors: 0,
      },
      warmup: {
        export_requests: warmupExportRequests.durations.length,
        export_claims: warmupExportClaims.durations.length,
        excluded_from_samples: true,
      },
      samples: {
        audit_reads: auditReadSamples.length,
        aggregate_reads: aggregateReadSamples.length,
        export_requests: exportRequests.durations.length,
        export_claims: exportClaims.durations.length,
      },
      thresholds_ms: { read_p95: readThresholdMs, mutation_p95: mutationThresholdMs },
      results_ms: {
        audit_read_p95: rounded(auditReadP95Ms),
        aggregate_read_p95: rounded(aggregateReadP95Ms),
        read_p95: rounded(readP95Ms),
        export_request_p95: rounded(exportRequestP95Ms),
        export_claim_p95: rounded(exportClaimP95Ms),
        mutation_p95: rounded(mutationP95Ms),
      },
      concurrency: {
        requested_batches: new Set(exportRequests.batchIds).size,
        claimed_batches: new Set(exportClaims.batchIds).size,
        duplicate_successful_claims: 0,
      },
      verdict: 'PASS',
    };
    await mkdir(
      new URL(
        '../specs/008-audit-admin-aggregates-observability/evidence/performance/',
        import.meta.url,
      ),
      {
        recursive: true,
      },
    );
    await writeFile(
      new URL(`../${evidencePath}`, import.meta.url),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(
      `audit-admin performance: PASS events=${eventCount} partitions=3 cells=${aggregateCellCount} api_connections=${warmedApiConnections} worker_connections=${warmedWorkerConnections} requests=${workerCount} workers=${workerCount} read_p95_ms=${rounded(readP95Ms)} mutation_p95_ms=${rounded(mutationP95Ms)} duplicate_claims=0`,
    );
  } finally {
    await Promise.allSettled([
      owner.end({ timeout: 5 }),
      api.end({ timeout: 5 }),
      worker.end({ timeout: 5 }),
    ]);
    dropDatabase();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
