import { spawnSync } from 'node:child_process';
import process from 'node:process';

const mode = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'fixture';
if (mode !== 'fixture') throw new Error(`Unsupported clinic scheduling restore mode: ${mode}`);

const root = process.cwd();
const sourceDatabase = 'shifaa_f009_restore_source';
const targetDatabase = 'shifaa_f009_restore_target';
const migrations = [
  'infra/db/migrations/001_identity_onboarding.sql',
  'supabase/migrations/20260811000300_facility_onboarding_rbac.sql',
  'supabase/migrations/20260811000400_facility_onboarding_rbac_storage.sql',
  'supabase/migrations/20260811000500_family_care_relationships.sql',
  'supabase/migrations/20260811000600_family_care_storage.sql',
  'supabase/migrations/20260813000500_privacy_dsr_notifications.sql',
  'supabase/migrations/20260813000600_privacy_dsr_storage.sql',
  'supabase/migrations/20260820000600_discovery_sos_foundation.sql',
  'supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql',
  'supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql',
  'supabase/migrations/20260908000800_sec_008_idempotency_privacy.sql',
  'supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql',
];

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: options.binary ? null : 'utf8',
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.input || options.binary ? 'pipe' : options.quiet ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`docker ${args.join(' ')} failed\n${result.stderr?.toString?.() ?? ''}`);
  return result;
}

function psql(database, args, options = {}) {
  return docker(
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
function recreate(database) {
  psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], { quiet: true });
  psql('postgres', ['-c', `CREATE DATABASE ${database}`], { quiet: true });
}
function drop(database) {
  psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], { quiet: true });
}
function apply(database, path) {
  psql(database, ['-f', `/workspace/${path}`], { quiet: true });
}
function truth(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      `
    SELECT (SELECT count(*) FROM clinical.schedules),
           (SELECT count(*) FROM clinical.schedule_exceptions),
           (SELECT count(*) FROM clinical.appointments),
           (SELECT count(*) FROM clinical.queue_entries),
           (SELECT count(*) FROM audit.events WHERE action_code='schedule.restore.seed'),
           (SELECT count(*) FROM platform.outbox_events WHERE event_type='clinical.schedule.changed.v1' AND aggregate_id='f0090000-0000-4000-8200-000000000010'),
           (SELECT count(*) FROM platform.idempotency_records WHERE route_template='/v1/clinic/restore' AND state='completed'),
           (SELECT version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000010'),
           (SELECT waiting_order FROM clinical.queue_entries WHERE id='f0090000-0000-4000-8500-000000000010');
  `,
    ],
    { quiet: true },
  );
  return result.stdout.trim();
}

docker(['compose', 'up', '-d', '--wait', 'postgres']);
recreate(sourceDatabase);
recreate(targetDatabase);
try {
  for (const migration of migrations) apply(sourceDatabase, migration);
  apply(sourceDatabase, 'infra/db/fixtures/clinic-scheduling-restore.sql');
  const sourceTruth = truth(sourceDatabase);
  if (sourceTruth !== '1|1|1|1|1|1|1|2|1')
    throw new Error(`unexpected source restore truth set: ${sourceTruth}`);
  const dump = docker(
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
    { binary: true, quiet: true },
  ).stdout;
  if (!Buffer.isBuffer(dump) || dump.length === 0)
    throw new Error('logical restore dump was empty');
  docker(
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
  const targetTruth = truth(targetDatabase);
  if (targetTruth !== sourceTruth)
    throw new Error(`restored truth set differs: source=${sourceTruth} target=${targetTruth}`);
  console.log(
    `clinic-scheduling restore: PASS fixture=synthetic source_truth=${sourceTruth} target_truth=${targetTruth} dump_bytes=${dump.length} retention=OPEN-LEGAL-002`,
  );
} finally {
  drop(sourceDatabase);
  drop(targetDatabase);
}
