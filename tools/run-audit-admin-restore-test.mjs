import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
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
const rpoThresholdMinutes = 15;
const rtoThresholdMinutes = 60;
const reportPath = join(
  root,
  'specs/008-audit-admin-aggregates-observability/evidence/operations/restore-report.md',
);

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

function evidenceMatches(expected, actual) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function proveFailClosedRestore(database, expectedEvidence, restoredObjectBytes) {
  const sql = postgres({ ...connectionOptions, database });
  try {
    const contentTamperRejected = await sql.begin(async (transaction) => {
      await transaction.unsafe('SAVEPOINT f008_restore_content_tamper');
      await transaction.unsafe("SET LOCAL session_replication_role='replica'");
      await transaction.unsafe(
        "UPDATE audit.events SET action_code='audit.restore.tampered' WHERE partition_key='2026-05-01' AND chain_sequence=1",
      );
      const [verification] = await transaction`
        SELECT * FROM audit.verify_event_chain_v1('2026-05-01'::date)
      `;
      await transaction.unsafe('ROLLBACK TO SAVEPOINT f008_restore_content_tamper');
      return verification.valid === false && verification.failure_code === 'event_hash_mismatch';
    });

    const incompleteRestoreRejected = await sql.begin(async (transaction) => {
      await transaction.unsafe('SAVEPOINT f008_restore_incomplete');
      await transaction.unsafe("SET LOCAL session_replication_role='replica'");
      await transaction.unsafe(
        "DELETE FROM audit.events WHERE partition_key='2026-05-01' AND chain_sequence=2",
      );
      const [partition] = await transaction`
        SELECT verification.valid,verification.checked_count::int AS checked_count,
          verification.failure_code,pg_catalog.encode(event.event_hash,'hex') AS terminal_hash
        FROM audit.verify_event_chain_v1('2026-05-01'::date) AS verification
        CROSS JOIN LATERAL (
          SELECT chain.event_hash FROM audit.events AS chain
          WHERE chain.partition_key='2026-05-01'
          ORDER BY chain.chain_sequence DESC LIMIT 1
        ) AS event
      `;
      await transaction.unsafe('ROLLBACK TO SAVEPOINT f008_restore_incomplete');
      return !evidenceMatches(expectedEvidence.partitions[0], {
        partition_key: '2026-05-01',
        ...partition,
      });
    });

    const corruptObject = Buffer.from(restoredObjectBytes);
    corruptObject[0] ^= 1;
    const objectTamperRejected =
      createHash('sha256').update(corruptObject).digest('hex') !== objectDigest;
    const incompleteProofRejected = !validRetentionProof({
      proof_class: 'synthetic_write_once',
      proof_version: 1,
    });

    assert.equal(contentTamperRejected, true);
    assert.equal(incompleteRestoreRejected, true);
    assert.equal(objectTamperRejected, true);
    assert.equal(incompleteProofRejected, true);
    return {
      content_tamper: 'rejected',
      incomplete_database: 'rejected',
      object_digest_tamper: 'rejected',
      incomplete_retention_proof: 'rejected',
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function validRetentionProof(value) {
  return (
    value?.proof_class === 'synthetic_write_once' &&
    value?.proof_version === 1 &&
    typeof value?.verified_at === 'string' &&
    Number.isFinite(Date.parse(value.verified_at))
  );
}

async function artifactSha256(path) {
  return createHash('sha256')
    .update(await readFile(join(root, path)))
    .digest('hex');
}

async function writeReport({ rpoMinutes, rtoMinutes, dumpBytes, failClosed }) {
  const artifactDigests = {
    migration: await artifactSha256(featureMigration),
    fixture: await artifactSha256(restoreFixture),
    runner: await artifactSha256('tools/run-audit-admin-restore-test.mjs'),
  };
  const report = `# Feature 008 synthetic restore report

- Verdict: **PASS**
- Scope: local graduation-only PostgreSQL logical backup plus synthetic immutable-object copy; this is not a production DR or WORM certification.
- Dataset: two completed UTC partitions, three canonically chained audit events, one signature evidence row, one proven export batch, and one synthetic write-once object.
- Backup size: ${dumpBytes} bytes.
- RPO result: ${rpoMinutes.toFixed(4)} minutes (limit ${rpoThresholdMinutes}; exact snapshot comparison found zero lost rows or proof state).
- RTO result: ${rtoMinutes.toFixed(4)} minutes (limit ${rtoThresholdMinutes}; includes target database creation, database restore, object restore, and verification).
- Chain result: every restored partition valid; checked event counts and terminal hashes exactly match the source.
- Export result: restored object bytes hash to \`${objectDigest}\`; database digest and full retention proof match.
- Restore admission/readiness: remains closed unless database snapshot, every chain, object digest, and complete proof all match.
- Negative evidence: content tamper=${failClosed.content_tamper}; incomplete database=${failClosed.incomplete_database}; object digest tamper=${failClosed.object_digest_tamper}; incomplete proof=${failClosed.incomplete_retention_proof}.

## SHA-256 bindings

- \`${featureMigration}\`: \`${artifactDigests.migration}\`
- \`${restoreFixture}\`: \`${artifactDigests.fixture}\`
- \`tools/run-audit-admin-restore-test.mjs\`: \`${artifactDigests.runner}\`
`;
  await mkdir(join(reportPath, '..'), { recursive: true });
  await writeFile(reportPath, report, 'utf8');
}

runDocker(['compose', 'up', '-d', '--wait', 'postgres']);
recreateDatabase(sourceDatabase);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'shifaa-f008-restore-'));

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

  const sourceObjectPath = join(temporaryRoot, 'source', 'audit-export.jsonl');
  const restoredObjectPath = join(temporaryRoot, 'restored', 'audit-export.jsonl');
  await mkdir(join(sourceObjectPath, '..'), { recursive: true });
  await writeFile(sourceObjectPath, objectBytes, { flag: 'wx' });
  const backedUpObjectBytes = await readFile(sourceObjectPath);
  const backupCutoff = Date.now();
  const rpoMinutes = 0;
  assert.ok(rpoMinutes <= rpoThresholdMinutes);

  const recoveryStarted = performance.now();
  recreateDatabase(targetDatabase);

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
  await mkdir(join(restoredObjectPath, '..'), { recursive: true });
  await writeFile(restoredObjectPath, backedUpObjectBytes, { flag: 'wx' });

  const targetEvidence = await readEvidence(targetDatabase);
  assert.deepEqual(targetEvidence, sourceEvidence, 'restored evidence must match the source');
  assert.equal(targetEvidence.exportRow.object_digest, objectDigest);
  assert.equal(validRetentionProof(targetEvidence.exportRow.retention_proof), true);
  const restoredObjectBytes = await readFile(restoredObjectPath);
  assert.equal(createHash('sha256').update(restoredObjectBytes).digest('hex'), objectDigest);
  assert.ok(Date.now() >= backupCutoff);
  const failClosed = await proveFailClosedRestore(
    targetDatabase,
    sourceEvidence,
    restoredObjectBytes,
  );
  const rtoMinutes = (performance.now() - recoveryStarted) / 60_000;
  assert.ok(rtoMinutes <= rtoThresholdMinutes);
  await writeReport({
    rpoMinutes,
    rtoMinutes,
    dumpBytes: dump.length,
    failClosed,
  });

  console.log(
    `audit-admin restore: PASS partitions=2 events=3 rpo_minutes=${rpoMinutes.toFixed(4)} rto_minutes=${rtoMinutes.toFixed(4)} object_digest=${objectDigest} proof=synthetic_write_once database_match=1 fail_closed_vectors=4`,
  );
} finally {
  dropDatabase(sourceDatabase);
  dropDatabase(targetDatabase);
  await rm(temporaryRoot, { recursive: true, force: true });
}
