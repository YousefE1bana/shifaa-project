import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const c22Migration = 'supabase/migrations/20260929001008_f010_c22_context_messages.sql';
const c23Migration = 'supabase/migrations/20260930001000_f010_c23_realtime_hint.sql';
const testFile = 'src/feature-010-realtime.postgres.test.ts';
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const migrateCommand = packageJson.scripts?.['db:migrate'];
if (typeof migrateCommand !== 'string') throw new Error('package.json is missing db:migrate.');

const migrations = [...migrateCommand.matchAll(/-f \/workspace\/([^\s]+\.sql)/g)].map((match) =>
  match[1].replaceAll('\\', '/'),
);
const c22Index = migrations.indexOf(c22Migration);
const c23Index = migrations.indexOf(c23Migration);
if (
  c22Index < 0 ||
  migrations.lastIndexOf(c22Migration) !== c22Index ||
  c23Index !== c22Index + 1 ||
  migrations.lastIndexOf(c23Migration) !== c23Index
) {
  throw new Error('db:migrate must include C23 exactly once, immediately after the C22 migration.');
}

const runtimes = [
  {
    name: 'shifaa-local-postgres',
    container: 'shifaa-local-postgres-postgres-1',
    user: 'shifaa_owner',
    adminDatabase: 'shifaa',
  },
  {
    name: 'shifaa-local-supabase',
    container: 'supabase_db_shifaa-local-supabase',
    user: 'supabase_admin',
    adminDatabase: 'postgres',
  },
];
const requestedRuntime = process.env['SHIFAA_TEST_POSTGRES_RUNTIME'];
const selectedRuntimes = requestedRuntime
  ? runtimes.filter((runtime) => runtime.name === requestedRuntime)
  : runtimes;
if (selectedRuntimes.length === 0)
  throw new Error(`Unknown SHIFAA_TEST_POSTGRES_RUNTIME: ${requestedRuntime}`);

function runDocker(runtime, args, { input, label }) {
  const dockerArgs = ['exec'];
  if (input !== undefined) dockerArgs.push('-i');
  dockerArgs.push(runtime.container, ...args);
  const result = spawnSync('docker', dockerArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${label} failed${result.status === null ? '' : ` (exit ${result.status})`}${result.error ? `: ${result.error.message}` : ''}${detail ? `\n${detail}` : ''}`,
    );
  }
  return result.stdout;
}

function runPsql(runtime, database, sql, label, user = runtime.user) {
  return runDocker(
    runtime,
    ['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database],
    { input: sql, label },
  );
}

function runPsqlTuples(runtime, database, sql, label, user = runtime.user) {
  return runDocker(
    runtime,
    ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database],
    { input: sql, label },
  ).trim();
}

function applyMigration(runtime, database, migrationPath, label) {
  const sourcePath = resolve(root, migrationPath);
  const sourceDirectory = dirname(sourcePath);
  const source = readFileSync(sourcePath, 'utf8');
  const sql = source.replace(/^\\ir\s+(\S+)\s*$/gm, (_directive, includedPath) => {
    const includeFile = resolve(sourceDirectory, includedPath);
    return `-- Expanded relative psql include: ${includedPath}\n${readFileSync(includeFile, 'utf8')}`;
  });
  if (/^\\ir\s+\S+/m.test(sql))
    throw new Error(`${migrationPath} has an unresolved relative psql include.`);
  runPsql(runtime, database, sql, `${runtime.name} ${label}`);
}

function createScratch(runtime, database) {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `CREATE DATABASE "${database}" TEMPLATE template0;`,
    `${runtime.name} create C23 scratch database`,
  );
}

function dropScratch(runtime, database) {
  if (!/^f010_c23_[0-9]+_[a-f0-9]+$/.test(database))
    throw new Error('Refusing to drop a database not owned by this C23 run.');
  runPsql(
    runtime,
    runtime.adminDatabase,
    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`,
    `${runtime.name} drop C23 scratch database`,
  );
}

function hostPort(runtime) {
  const result = spawnSync('docker', ['port', runtime.container, '5432/tcp'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${runtime.name} PostgreSQL port lookup failed.`);
  const port = result.stdout.trim().split(/\r?\n/)[0]?.split(':').at(-1);
  if (!port || !/^\d+$/.test(port))
    throw new Error(`${runtime.name} has no usable host PostgreSQL port.`);
  return port;
}

function supabasePostgresPassword(runtime) {
  const result = spawnSync(
    'docker',
    ['inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}', runtime.container],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error('Could not inspect the local Supabase database container.');
  const value = result.stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('POSTGRES_PASSWORD='));
  if (value) return value.slice('POSTGRES_PASSWORD='.length);
  return 'postgres';
}

function connectionUrl(username, password, port, database) {
  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}?connect_timeout=10`;
}

function prepareSupabaseFixtureWriter(runtime, database) {
  if (runtime.name !== 'shifaa-local-supabase') return;
  runPsql(
    runtime,
    database,
    `
    -- The postgres login is only a fixture writer in this disposable test database.
    GRANT USAGE ON SCHEMA identity,clinical,trust,platform TO postgres;
    GRANT SELECT,INSERT,UPDATE,DELETE ON
      identity.people,identity.facilities,clinical.schedules,clinical.appointments,
      trust.messages,platform.feature_flags,platform.outbox_events,platform.event_receipts
      TO postgres;
  `,
    `${runtime.name} grant disposable fixture-writer table access`,
  );
}

function assertDefaultsAndRls(runtime, database) {
  const flags = runPsqlTuples(
    runtime,
    database,
    `
    SELECT count(*)::text || '|' || count(*) FILTER (WHERE enabled)::text
    FROM platform.feature_flags
    WHERE code='feature_010.realtime_hints' AND environment IN ('local','ci','production');
  `,
    `${runtime.name} verify C23 feature gates are off`,
  );
  if (flags !== '3|0')
    throw new Error(`${runtime.name} C23 gate defaults were not all disabled (${flags}).`);
  const forced = runPsqlTuples(
    runtime,
    database,
    `
    SELECT count(*)::text
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (
      ('platform','feature_flags'),('platform','outbox_events'),
      ('platform','event_receipts'),('trust','messages')
    ) AND c.relrowsecurity AND c.relforcerowsecurity;
  `,
    `${runtime.name} verify C23 forced-RLS defaults`,
  );
  if (forced !== '4')
    throw new Error(`${runtime.name} C23 RLS preconditions changed (${forced}/4).`);
  const functions = runPsqlTuples(
    runtime,
    database,
    `
    SELECT count(*)::text FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='platform' AND p.proname IN (
      'claim_next_feature_010_realtime_hint_event','complete_feature_010_realtime_hint_event'
    );
  `,
    `${runtime.name} verify C23 function pair`,
  );
  if (functions !== '2')
    throw new Error(`${runtime.name} C23 function pair is incomplete (${functions}/2).`);
}

function setLocalGate(runtime, database, enabled) {
  runPsql(
    runtime,
    database,
    `
    UPDATE platform.feature_flags SET enabled=${enabled ? 'true' : 'false'}
    WHERE code='feature_010.realtime_hints' AND environment='local';
  `,
    `${runtime.name} ${enabled ? 'enable' : 'disable'} local C23 test gate`,
  );
}

function runWorkerVectors(runtime, database) {
  const port = hostPort(runtime);
  const owner =
    runtime.name === 'shifaa-local-postgres'
      ? connectionUrl('shifaa_owner', 'synthetic_owner_only', port, database)
      : connectionUrl('postgres', supabasePostgresPassword(runtime), port, database);
  const worker = connectionUrl('shifaa_worker', 'synthetic_worker_only', port, database);
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: resolve(root, 'services/worker'),
    env: {
      ...process.env,
      SHIFAA_F010_C23_OWNER_DATABASE_URL: owner,
      SHIFAA_F010_C23_WORKER_DATABASE_URL: worker,
    },
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${runtime.name} C23 durable worker vectors failed with status ${result.status}.`,
    );
}

function testRuntime(runtime) {
  const database = `f010_c23_${process.pid}_${randomBytes(8).toString('hex')}`;
  let created = false;
  try {
    createScratch(runtime, database);
    created = true;
    for (const migration of migrations.slice(0, c23Index + 1))
      applyMigration(runtime, database, migration, 'apply migration');
    applyMigration(runtime, database, c23Migration, 'replay C23 migration');
    assertDefaultsAndRls(runtime, database);
    prepareSupabaseFixtureWriter(runtime, database);
    setLocalGate(runtime, database, true);
    runWorkerVectors(runtime, database);
    setLocalGate(runtime, database, false);
    assertDefaultsAndRls(runtime, database);
    console.log(`${runtime.name}: C23 durable hint vectors passed in disposable scratch database.`);
  } finally {
    if (created) dropScratch(runtime, database);
  }
}

for (const runtime of selectedRuntimes) testRuntime(runtime);
