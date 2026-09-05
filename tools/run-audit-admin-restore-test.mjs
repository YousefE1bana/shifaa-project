import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import postgres from 'postgres';

const root = process.cwd();
const requestedMode = process.argv.slice(2).find((argument) => argument !== '--') ?? 'fixture';

if (requestedMode !== 'fixture') {
  throw new Error(`Unsupported audit-admin restore test mode: ${requestedMode}`);
}

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
const restoreFixture = 'infra/db/fixtures/audit-admin-restore.sql';
const sourceDatabase = 'shifaa_f008_restore_source';
const targetDatabase = 'shifaa_f008_restore_target';
const connectionOptions = {
  host: '127.0.0.1',
  port: 5432,
  username: 'shifaa_owner',
  password: 'synthetic_owner_only',
  max: 1,
};
const objectBytes = Buffer.from(
  '{"fixture":"feature-008-c3a","partitions":["2026-05-01","2026-06-01"],"version":1}\n',
  'utf8',
);
const objectDigest = createHash('sha256').update(objectBytes).digest('hex');

function runDocker(args, { input, quiet = false, binary = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: binary ? null : 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: quiet || input || binary ? 'pipe' : 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : (result.stderr ?? '');
    throw new Error(`docker ${args.join(' ')} failed\n${stderr.trim()}`);
  }
  return result;
}

function runPsql(database, args, options) {
  return runDocker(
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
      database,
      ...args,
    ],
    options,
  );
}

function recreateDatabase(database) {
  runPsql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], {
    quiet: true,
  });
  runPsql('postgres', ['-c', `CREATE DATABASE ${database}`], { quiet: true });
}

function dropDatabase(database) {
  runPsql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], {
    quiet: true,
  });
}

function applySql(database, path) {
  runPsql(database, ['-f', `/workspace/${path}`], { quiet: true });
}

async function readEvidence(database) {
  const sql = postgres({ ...connectionOptions, database });
  try {
    const partitions = await sql`
      SELECT
        fixture.partition_key::text AS partition_key,
        partition.valid,
        partition.checked_count::int AS checked_count,
        partition.failure_code,
        pg_catalog.encode(event.event_hash,'hex') AS terminal_hash
      FROM (VALUES ('2026-05-01'::date),('2026-06-01'::date)) AS fixture(partition_key)
      CROSS JOIN LATERAL audit.verify_event_chain_v1(fixture.partition_key) AS partition
      CROSS JOIN LATERAL (
        SELECT chain.event_hash
        FROM audit.events AS chain
        WHERE chain.partition_key = fixture.partition_key
        ORDER BY chain.chain_sequence DESC
        LIMIT 1
      ) AS event
      ORDER BY fixture.partition_key
    `;
    const [exportRow] = await sql`
      SELECT
        status,object_key,pg_catalog.encode(object_digest,'hex') AS object_digest,
        retention_proof,version
      FROM audit.export_batches
      WHERE id='81600000-0000-4000-8000-000000000031'
    `;
    const [signature] = await sql`
      SELECT pg_catalog.encode(artifact_digest,'hex') AS artifact_digest
      FROM audit.signature_evidence
      WHERE id='81600000-0000-4000-8000-000000000021'
    `;
    return { partitions, exportRow, signature };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

runDocker(['compose', 'up', '-d', '--wait', 'postgres']);
recreateDatabase(sourceDatabase);
recreateDatabase(targetDatabase);

try {
  for (const migration of baselineMigrations) applySql(sourceDatabase, migration);
  applySql(sourceDatabase, featureMigration);
  applySql(sourceDatabase, restoreFixture);

  const sourceEvidence = await readEvidence(sourceDatabase);
  assert.ok(sourceEvidence.partitions.every((partition) => partition.valid));
  assert.deepEqual(
    sourceEvidence.partitions.map(({ checked_count: count }) => count),
    [2, 1],
  );
  assert.equal(sourceEvidence.exportRow.status, 'proven');
  assert.equal(sourceEvidence.exportRow.object_digest, objectDigest);
  assert.deepEqual(sourceEvidence.exportRow.retention_proof, {
    proof_class: 'synthetic_write_once',
    proof_version: 1,
    verified_at: '2026-07-01T00:00:00Z',
  });

  const dump = runDocker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-Fc',
      '-U',
      'shifaa_owner',
      '-d',
      sourceDatabase,
    ],
    { binary: true },
  ).stdout;
  assert(Buffer.isBuffer(dump) && dump.length > 0, 'logical backup must contain bytes');

  runDocker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '-U',
      'shifaa_owner',
      '-d',
      targetDatabase,
    ],
    { input: dump, quiet: true },
  );

  const targetEvidence = await readEvidence(targetDatabase);
  assert.deepEqual(targetEvidence, sourceEvidence, 'restored evidence must match the source');
  assert.equal(targetEvidence.exportRow.object_digest, objectDigest);

  console.log(
    `audit-admin restore: PASS partitions=2 events=3 object_digest=${objectDigest} proof=synthetic_write_once database_match=1`,
  );
} finally {
  dropDatabase(sourceDatabase);
  dropDatabase(targetDatabase);
}
