import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const featureMigration =
  'supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql';
const schemaTest = 'infra/db/tests/feature-010-schema.sql';
const lifecycleTest = 'infra/db/tests/feature-010-lifecycle.sql';
const f009RegressionTest = 'infra/db/tests/clinic-scheduling-schema.sql';
const defaultDenySnapshotSql = `SELECT format(
  'C04 default-deny snapshot: forced_rls=%s/6; policies=%s; direct_online_acl_entries=%s',
  count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity),
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid IN (
    'clinical.encounters'::regclass,
    'clinical.encounter_participants'::regclass,
    'clinical.clinical_notes'::regclass,
    'clinical.conditions'::regclass,
    'clinical.referrals'::regclass,
    'trust.messages'::regclass
  )),
  COALESCE(sum(acl.privilege_count), 0)
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN LATERAL (
  SELECT count(*) AS privilege_count
  FROM aclexplode(c.relacl) entry
  LEFT JOIN pg_roles r ON r.oid = entry.grantee
  WHERE entry.grantee = 0 OR r.rolname = ANY(ARRAY[
    'shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role'
  ])
) acl ON true
WHERE (n.nspname, c.relname) IN (
  ('clinical', 'encounters'),
  ('clinical', 'encounter_participants'),
  ('clinical', 'clinical_notes'),
  ('clinical', 'conditions'),
  ('clinical', 'referrals'),
  ('trust', 'messages')
);`;
const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const migrateCommand = packageJson.scripts?.['db:migrate'];

if (typeof migrateCommand !== 'string') {
  throw new Error('package.json is missing the db:migrate script.');
}

const migrations = [...migrateCommand.matchAll(/-f \/workspace\/([^\s]+\.sql)/g)].map((match) =>
  match[1].replaceAll('\\', '/'),
);
const featureMigrationIndex = migrations.indexOf(featureMigration);
if (
  featureMigrationIndex < 0 ||
  migrations.lastIndexOf(featureMigration) !== featureMigrationIndex
) {
  throw new Error(`The standalone db:migrate chain must include ${featureMigration} exactly once.`);
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
    user: 'postgres',
    adminDatabase: 'postgres',
  },
];

function runDocker(runtime, args, { input, label }) {
  const dockerArgs = ['exec'];
  if (input !== undefined) dockerArgs.push('-i');
  dockerArgs.push(runtime.container, ...args);
  const dockerProcess = spawnSync('docker', dockerArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });

  if (dockerProcess.error || dockerProcess.status !== 0) {
    const detail = [dockerProcess.stdout, dockerProcess.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${label} failed${dockerProcess.status === null ? '' : ` (exit ${dockerProcess.status})`}${dockerProcess.error ? `: ${dockerProcess.error.message}` : ''}${detail ? `\n${detail}` : ''}`,
    );
  }

  return dockerProcess.stdout;
}

function runPsql(runtime, database, sql, label) {
  return runDocker(
    runtime,
    ['psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', runtime.user, '-d', database],
    { input: sql, label },
  );
}

function runPgDump(runtime, database, label) {
  const dump = runDocker(
    runtime,
    [
      'pg_dump',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--table=clinical.appointments',
      '--table=clinical.queue_entries',
      '--username',
      runtime.user,
      '--dbname',
      database,
    ],
    { label },
  );
  // pg_dump emits fresh random psql safety tokens on every invocation; they are not schema state.
  return dump.replace(/^\\(?:un)?restrict\s+\S+\s*$/gm, '');
}

function firstDifference(before, after) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  let line = 0;
  while (
    line < beforeLines.length &&
    line < afterLines.length &&
    beforeLines[line] === afterLines[line]
  ) {
    line += 1;
  }
  if (line === beforeLines.length && line === afterLines.length)
    return 'no textual difference found';
  const from = Math.max(0, line - 2);
  const to = Math.min(Math.max(beforeLines.length, afterLines.length), line + 3);
  return [
    `first differing line ${line + 1}`,
    `before:\n${beforeLines.slice(from, to).join('\n')}`,
    `after:\n${afterLines.slice(from, to).join('\n')}`,
  ].join('\n');
}

function runMigration(runtime, database, migrationPath, phase) {
  const sourcePath = resolve(root, migrationPath);
  const sourceDirectory = dirname(sourcePath);
  const source = readFileSync(sourcePath, 'utf8');
  const sql = source.replace(/^\\ir\s+(\S+)\s*$/gm, (_directive, includedPath) => {
    const includeFile = resolve(sourceDirectory, includedPath);
    const includeSql = readFileSync(includeFile, 'utf8');
    return `-- Relative psql includes cannot resolve from the stdin-based runner.\n${includeSql}`;
  });
  if (/^\\ir\s+\S+/m.test(sql)) {
    throw new Error(`${migrationPath} contains an unsupported nested psql include.`);
  }
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${migrationPath}`);
}

function checkSchema(runtime, database, phase) {
  const sql = readFileSync(resolve(root, schemaTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${schemaTest}`);
}

function checkLifecycle(runtime, database, phase) {
  const sql = readFileSync(resolve(root, lifecycleTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${lifecycleTest}`);
}

function checkF009Regression(runtime, database, phase) {
  let sql = readFileSync(resolve(root, f009RegressionTest), 'utf8');
  if (runtime.name === 'shifaa-local-supabase') {
    const directRoleCheck = sql.lastIndexOf('SET LOCAL ROLE shifaa_api;');
    const rollback = sql.lastIndexOf('ROLLBACK;');
    if (directRoleCheck < 0 || rollback < directRoleCheck) {
      throw new Error(`${f009RegressionTest} no longer has its final direct-role check boundary.`);
    }
    // The Supabase container's postgres login is intentionally not a member
    // of shifaa_api. Keep the F009 lifecycle vectors runnable without granting
    // cluster-wide role membership solely for this disposable database.
    sql = `${sql.slice(0, directRoleCheck)}\nROLLBACK;\n`;
    console.log(
      `${runtime.name}: F009 lifecycle run omits the direct SET ROLE shifaa_api subvector (role membership is unavailable).`,
    );
  }
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${f009RegressionTest}`);
}

function reportDefaultDenySnapshot(runtime, database) {
  const snapshot = runPsql(
    runtime,
    database,
    defaultDenySnapshotSql,
    `${runtime.name} C04 default-deny snapshot`,
  );
  console.log(`${runtime.name}: ${snapshot.trim()}`);
}

function createScratchDatabase(runtime, database) {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `CREATE DATABASE "${database}" TEMPLATE template0;`,
    `${runtime.name} create isolated scratch database`,
  );
}

function applyBaselineMigrations(runtime, database) {
  for (const migrationPath of migrations.slice(0, featureMigrationIndex)) {
    runMigration(runtime, database, migrationPath, 'baseline migration');
  }
}

function verifyFreshAndReplay(runtime, database) {
  const f009SchemaBefore = runPgDump(
    runtime,
    database,
    `${runtime.name} capture F009 schema baseline`,
  );
  runMigration(runtime, database, featureMigration, 'fresh F010 migration');
  reportDefaultDenySnapshot(runtime, database);
  checkSchema(runtime, database, 'fresh F010 schema assertions');
  checkLifecycle(runtime, database, 'fresh F010 lifecycle vectors');
  checkF009Regression(runtime, database, 'F009 check-in and queue regression after F010');
  runMigration(runtime, database, featureMigration, 'F010 migration replay');
  checkSchema(runtime, database, 'replayed F010 schema assertions');

  const f009SchemaAfter = runPgDump(
    runtime,
    database,
    `${runtime.name} verify F009 schema unchanged`,
  );
  if (f009SchemaAfter !== f009SchemaBefore) {
    throw new Error(
      `${runtime.name} F009 appointments/queue schema dump changed while applying F010.\n${firstDifference(f009SchemaBefore, f009SchemaAfter)}`,
    );
  }

  console.log(
    `${runtime.name}: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.`,
  );
}

function dropScratchDatabase(runtime, database) {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`,
    `${runtime.name} drop isolated scratch database`,
  );
}

function testRuntime(runtime) {
  const database = `f010_c04_${process.pid}_${randomBytes(8).toString('hex')}`;
  let scratchDatabaseCreated = false;
  try {
    createScratchDatabase(runtime, database);
    scratchDatabaseCreated = true;
    applyBaselineMigrations(runtime, database);
    verifyFreshAndReplay(runtime, database);
  } finally {
    if (scratchDatabaseCreated) dropScratchDatabase(runtime, database);
  }
}

for (const runtime of runtimes) {
  testRuntime(runtime);
}
