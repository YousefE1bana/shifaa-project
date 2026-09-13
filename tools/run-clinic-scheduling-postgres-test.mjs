import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const requestedMode = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'all';
const modes = new Set([
  'all',
  'schema-schedules',
  'schedule-constraints',
  'exception-constraints',
  'appointment-constraints',
  'queue-constraints',
  'availability',
  'appointment-transactions',
  'queue-transactions',
  'delay-absence',
  'atomic-effects',
  'rls',
  'migration',
  'restore',
]);
if (!modes.has(requestedMode))
  throw new Error(`Unsupported clinic scheduling database test mode: ${requestedMode}`);

const baseline = [
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
  'supabase/migrations/20260908000700_sec_007_function_execute_grants.sql',
  'supabase/migrations/20260908000800_sec_008_idempotency_privacy.sql',
];
const featureMigration =
  'supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql';
const preFeatureUpgradeFixture = 'infra/db/tests/clinic-scheduling-pre-feature-upgrade.sql';
const fixture = 'infra/db/tests/clinic-scheduling-schema.sql';
const rlsFixture = 'infra/db/tests/clinic-scheduling-rls.sql';
const db = `shifaa_f009_${requestedMode.replaceAll('-', '_')}`;
const databases = requestedMode === 'migration' ? [db, `${db}_upgrade`] : [db];
function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`docker ${args.join(' ')} failed\n${result.stderr ?? ''}`);
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
function recreateDatabase(database) {
  psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], { quiet: true });
  psql('postgres', ['-c', `CREATE DATABASE ${database}`], { quiet: true });
}
function apply(database, path) {
  psql(database, ['-f', `/workspace/${path}`], { quiet: true });
}
function assertFeatureAbsent(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      "SELECT count(*) FROM (VALUES ('clinical.schedules'::text),('clinical.schedule_windows'),('clinical.schedule_exceptions'),('clinical.appointments'),('clinical.queue_scopes'),('clinical.queue_entries')) AS expected(name) WHERE to_regclass(name) IS NOT NULL",
    ],
    { quiet: true },
  );
  const output = String(result.output ?? '').replace(/[^0-9]/g, '');
  if (output !== '0')
    throw new Error(
      `Feature 009 objects unexpectedly exist before upgrade: ${String(result.output ?? '').trim()}`,
    );
}
function assertUpgradeSeed(database, phase) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      "SELECT count(*) FROM identity.people WHERE id='f0090000-0000-4f00-8c00-000000000099' AND user_id='f0090000-0000-4f00-9c00-000000000099' AND display_name='pre-feature baseline person' AND profile_status='active'",
    ],
    { quiet: true },
  );
  const output = String(result.output ?? '').replace(/[\s,]/g, '');
  if (output !== '1')
    throw new Error(
      `Pre-Feature 009 seed ${phase} assertion failed: ${String(result.output ?? '').trim()}`,
    );
}
function assertUpgradeObjectsAndFlags(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      "SELECT (to_regclass('clinical.schedules') IS NOT NULL)::int || '|' || (SELECT count(*)::int FROM platform.feature_flags WHERE code IN ('clinic_scheduling.server','clinic_scheduling.mutations','clinic_scheduling.dispatch') AND environment='local' AND enabled=false)",
    ],
    { quiet: true },
  );
  const output = String(result.output ?? '').replace(/[\s,]/g, '');
  if (output !== '1|3')
    throw new Error(
      `Feature 009 upgrade objects/flags assertion failed: ${String(result.output ?? '').trim()}`,
    );
}
function ensureRlsServiceRole(database) {
  if (requestedMode !== 'rls') return;
  psql(
    database,
    [
      '-c',
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$;",
    ],
    { quiet: true },
  );
}
function runRaceTests(database) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      'services/api/test/clinic-scheduling-postgres.integration.test.ts',
    ],
    {
      cwd: root,
      env: { ...process.env, SHIFAA_F009_DATABASE: database },
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Feature 009 race tests failed with status ${result.status}`);
}
for (const database of databases) recreateDatabase(database);
try {
  for (const database of databases) {
    const isUpgradePath = requestedMode === 'migration' && database === `${db}_upgrade`;
    for (const migration of baseline) apply(database, migration);
    if (isUpgradePath) {
      apply(database, preFeatureUpgradeFixture);
      assertFeatureAbsent(database);
      assertUpgradeSeed(database, 'before upgrade');
    }
    apply(database, featureMigration);
    if (isUpgradePath) {
      assertUpgradeSeed(database, 'after upgrade');
      assertUpgradeObjectsAndFlags(database);
    }
    ensureRlsServiceRole(database);
    if (requestedMode === 'rls') apply(database, rlsFixture);
    else if (requestedMode === 'migration')
      apply(database, 'infra/db/tests/clinic-scheduling-migration.sql');
    else if (requestedMode === 'restore')
      apply(database, 'infra/db/fixtures/clinic-scheduling-restore.sql');
    else if (requestedMode !== 'all') apply(database, fixture);
    else apply(database, fixture);
    if (requestedMode === 'all') runRaceTests(database);
  }
  console.log(
    `clinic-scheduling postgres: PASS mode=${requestedMode} databases=${databases.length}`,
  );
} finally {
  for (const database of databases)
    psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`], { quiet: true });
}
