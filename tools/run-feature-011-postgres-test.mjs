import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { feature011HarnessFixture } from '../packages/test-kit/src/feature-011/fixtures.ts';
import { readFeature011ProtocolMetadata } from './generate-feature-011-contract.mjs';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const runtimes = Object.freeze([
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
]);
const owned = new Set();
const key = (runtime, database) => `${runtime.container}/${database}`;
export function assertHarnessDatabase(database) {
  if (!/^f011_k0[345678]_[a-f0-9]{16}$/.test(database))
    throw new Error('Unsafe harness-owned temporary database name.');
}
export function assertOwnedDatabase(runtime, database) {
  assertHarnessDatabase(database);
  if (!runtimes.includes(runtime) || !owned.has(key(runtime, database)))
    throw new Error('Database was not created by this harness process.');
}
function execSql(runtime, database, input, user = runtime.user) {
  if (!runtimes.includes(runtime))
    throw new Error('Only the two approved local runtimes are allowed.');
  const executor = user !== runtime.user;
  const command = [
    'exec',
    '-i',
    ...(executor ? ['-e', 'PGPASSWORD'] : []),
    runtime.container,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
    ...(executor ? ['-h', '127.0.0.1'] : []),
    '-U',
    user,
    '-d',
    database,
  ];
  const env = executor
    ? {
        ...process.env,
        PGPASSWORD: user === 'shifaa_api' ? 'synthetic_api_only' : 'synthetic_worker_only',
      }
    : process.env;
  const result = spawnSync('docker', command, {
    cwd: root,
    env,
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    command: ['docker', ...command],
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}
export function sql(runtime, database, input, options = {}) {
  const { allowFailure = false, user = runtime.user } = options;
  assertOwnedDatabase(runtime, database);
  if (![runtime.user, 'shifaa_api', 'shifaa_worker'].includes(user))
    throw new Error('Unapproved harness SQL identity.');
  const result = execSql(runtime, database, input, user);
  if (!allowFailure && result.exitCode !== 0)
    throw new Error(
      `${runtime.name}: SQL setup/smoke failed (${result.exitCode})\n${result.output}`,
    );
  return result;
}
export async function withDatabase(runtime, callback, checkpoint = 'K03') {
  if (!['K03', 'K04', 'K05', 'K06', 'K07', 'K08'].includes(checkpoint))
    throw new Error('Unapproved harness checkpoint.');
  const database = `f011_${checkpoint.toLowerCase()}_${randomBytes(8).toString('hex')}`;
  assertHarnessDatabase(database);
  const create = execSql(
    runtime,
    runtime.adminDatabase,
    `CREATE DATABASE "${database}" TEMPLATE template0;`,
  );
  if (create.exitCode !== 0) throw new Error(`Scratch CREATE failed: ${create.output}`);
  owned.add(key(runtime, database));
  let result;
  try {
    result = await callback(database);
  } finally {
    assertHarnessDatabase(database);
    if (!owned.has(key(runtime, database)))
      throw new Error('Refusing cleanup outside this run ownership.');
    const drop = execSql(runtime, runtime.adminDatabase, `DROP DATABASE "${database}";`);
    if (drop.exitCode !== 0)
      throw new Error(`Exact cleanup failed (no forced termination): ${drop.output}`);
    owned.delete(key(runtime, database));
    const absence = execSql(
      runtime,
      runtime.adminDatabase,
      `SELECT count(*) FROM pg_database WHERE datname='${database}';`,
    );
    assert.equal(absence.exitCode, 0);
    assert.equal(absence.stdout.trim(), '0');
  }
  return { ...result, cleanup: { database, dropped: true, absenceVerified: true, forced: false } };
}
export function migrationChain(includeFeature = false) {
  if (includeFeature)
    throw new Error('K03 permits baseline-only preparation; Feature 011 DDL is not authorized.');
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const baseline = [
    ...manifest.scripts['db:migrate'].matchAll(/-f \/workspace\/([^\s]+\.sql)/g),
  ].map((match) => match[1]);
  if (
    baseline.length !== 27 ||
    new Set(baseline).size !== 27 ||
    baseline.some((path) => /f011/i.test(path))
  )
    throw new Error('Approved full predecessor chain drift.');
  return baseline;
}
export function readMigration(path, seen = new Set()) {
  const absolute = resolve(root, path),
    within = relative(root, absolute);
  if (within.startsWith('..') || isAbsolute(within) || seen.has(absolute))
    throw new Error('Unsafe or cyclic migration include.');
  const chain = new Set(seen).add(absolute);
  return readFileSync(absolute, 'utf8').replace(/^\\ir\s+(\S+)\s*$/gm, (_, include) =>
    readMigration(relative(root, resolve(dirname(absolute), include)), chain),
  );
}
export function digest(path) {
  return createHash('sha256')
    .update(readFileSync(resolve(root, path)))
    .digest('hex');
}
export function harnessInputs() {
  readFeature011ProtocolMetadata(root);
  const packagePath = resolve(root, 'node_modules/supabase/package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(pkg.version, '2.113.0');
  const cli =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase --version'], {
          cwd: root,
          encoding: 'utf8',
          windowsHide: true,
          timeout: 15000,
        })
      : spawnSync('pnpm', ['exec', 'supabase', '--version'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 15000,
        });
  if (cli.error || cli.status !== 0 || cli.stdout.trim() !== '2.113.0')
    throw new Error('Pinned project-local pnpm exec supabase 2.113.0 is required.');
  const paths = [
    ...migrationChain(),
    'package.json',
    'pnpm-lock.yaml',
    'compose.yml',
    'infra/db/Dockerfile.postgis',
    'supabase/config.toml',
    'infra/db/fixtures/feature-011.sql',
    'packages/test-kit/src/feature-011/fixtures.ts',
    'tools/run-feature-011-postgres-test.mjs',
    'tools/run-feature-011-concurrency-test.mjs',
  ];
  return {
    cli: {
      command: 'pnpm exec supabase --version',
      version: cli.stdout.trim(),
      packageVersion: pkg.version,
      packageSha256: createHash('sha256').update(readFileSync(packagePath)).digest('hex'),
    },
    baselineCount: 27,
    inputDigests: Object.fromEntries(paths.map((path) => [path, digest(path)])),
    fixture: feature011HarnessFixture,
    feature011MigrationFiles: readdirSync(resolve(root, 'supabase/migrations')).filter((name) =>
      /_f011_.*\.sql$/.test(name),
    ),
  };
}
export function runtimeManifest(runtime) {
  const inspect = spawnSync(
    'docker',
    [
      'inspect',
      '--format',
      '{{json .State.Running}}|{{.Config.Image}}|{{.Image}}',
      runtime.container,
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000 },
  );
  if (inspect.error || inspect.status !== 0 || !inspect.stdout.startsWith('true|'))
    throw new Error(`${runtime.name} must be running; missing runtime is a blocker, never RED.`);
  const [running, image, imageId] = inspect.stdout.trim().split('|');
  return { ...runtime, running: running === 'true', image, imageId };
}
export function prepare(runtime, database, includeFeature = false) {
  // Plain PostgreSQL needs the existing Supabase role's restricted denial-test
  // counterpart. Never alter an existing runtime role or grant it privileges.
  sql(
    runtime,
    database,
    `DO $fixture$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
      CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
  END $fixture$;`,
  );
  const applied = [];
  for (const path of migrationChain(includeFeature)) {
    try {
      const result = sql(runtime, database, readMigration(path));
      applied.push({ path, sha256: digest(path), exitCode: result.exitCode });
    } catch (error) {
      throw new Error(
        `Baseline prerequisite failed at ${path}; never valid RED: ${error.message}`,
        { cause: error },
      );
    }
  }
  // Revalidated neutral predecessor rows only. No legacy Feature 011 SQL helpers.
  const amendment = 'docs/governance/SHIFAA-Identifier-Handoff-Amendment-2026-10-08.md';
  if (process.getBuiltinModule('node:fs').existsSync(resolve(root, amendment))) {
    const path = 'supabase/migrations/20261008013921_f010_patient_identifier_handoff.sql';
    const result = sql(runtime, database, readMigration(path));
    applied.push({ path, sha256: digest(path), exitCode: result.exitCode });
  }
  const source = readFileSync(resolve(root, 'infra/db/fixtures/feature-011.sql'), 'utf8').split(
    '-- Session-local test conveniences',
  )[0];
  sql(runtime, database, source);
  return {
    applied,
    fixtureSha256: digest('infra/db/fixtures/feature-011.sql'),
    legacyFeatureHelpersUsed: false,
  };
}
export function smoke(runtime, database) {
  const result = sql(
    runtime,
    database,
    `SELECT json_build_object(
    'database',current_database(),'owner',current_user,'serverVersion',current_setting('server_version'),
    'actors',(SELECT count(*) FROM identity.people WHERE display_name LIKE 'F011 synthetic%'),
    'encounters',(SELECT count(*) FROM clinical.encounters WHERE id='${feature011HarnessFixture.encounterId}'),
    'feature010Entrypoint',to_regprocedure('clinical.complete_encounter_api_v1(uuid,integer,jsonb)') IS NOT NULL,
    'roles',(SELECT json_agg(json_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,'login',rolcanlogin)) FROM pg_roles WHERE rolname IN ('shifaa_api','shifaa_worker')),
    'peopleOwner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='identity.people'::regclass),
    'peopleForceRls',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='identity.people'::regclass));`,
  );
  const manifest = JSON.parse(result.stdout.trim());
  assert.equal(manifest.owner, runtime.user);
  assert.equal(manifest.peopleOwner, runtime.user);
  assert.equal(manifest.actors, feature011HarnessFixture.actorCount);
  assert.equal(manifest.encounters, 1);
  assert.equal(manifest.feature010Entrypoint, true);
  assert.equal(manifest.peopleForceRls, true);
  assert.equal(manifest.roles.length, 2);
  assert.ok(manifest.roles.every((role) => role.login && !role.superuser && !role.bypassRls));
  const api = sql(
    runtime,
    database,
    "SELECT json_build_object('user',current_user,'visiblePeople',(SELECT count(*) FROM identity.people),'backendPid',pg_backend_pid());",
    { user: 'shifaa_api' },
  );
  const nonOwner = JSON.parse(api.stdout.trim());
  assert.equal(nonOwner.user, 'shifaa_api');
  assert.equal(nonOwner.visiblePeople, 0);
  return {
    result: 'PASS',
    manifest,
    nonOwner,
    setupCommand: result.command,
    nonOwnerCommand: api.command,
  };
}
export function assertValidMissingBehavior(result) {
  if (
    result.exitCode !== 3 ||
    !result.stderr.includes(`P0001: ${feature011HarnessFixture.missingBehaviorMessage}`)
  )
    throw new Error(`Not the exact intentional missing-behavior RED: ${result.output}`);
  if (/syntax error|permission denied|does not exist|connection.*failed/i.test(result.stderr))
    throw new Error('Setup/syntax/privilege failure cannot count as RED.');
}
export function missingBehavior(runtime, database) {
  const absent = sql(
    runtime,
    database,
    "SELECT json_build_object('allergies',to_regclass('clinical.allergies') IS NULL,'releases',to_regclass('clinical.content_releases') IS NULL,'verify',to_regprocedure('clinical.verify_allergy_api_v1(uuid,integer,jsonb)') IS NULL);",
  );
  const inventory = JSON.parse(absent.stdout.trim());
  assert.ok(Object.values(inventory).every((value) => value === true));
  const result = sql(
    runtime,
    database,
    `DO $probe$ BEGIN IF to_regprocedure('clinical.verify_allergy_api_v1(uuid,integer,jsonb)') IS NULL THEN RAISE EXCEPTION '${feature011HarnessFixture.missingBehaviorMessage}'; END IF; END $probe$;`,
    { allowFailure: true },
  );
  assertValidMissingBehavior(result);
  return { result: 'VALID_RED', absence: inventory, expectedSqlstate: 'P0001', ...result };
}
export function writeHarnessReport(name, value) {
  const directory = resolve(root, 'artifacts/feature-011/k03');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
}
async function main() {
  if (process.argv.length !== 3 || !['health', 'red', 'green'].includes(process.argv[2]))
    throw new Error('Runner accepts health, red or authorized K07 green only.');
  if (process.argv[2] === 'green') {
    const { runPhysicalGreen } = await import('./feature-011-physical-green.mjs');
    await runPhysicalGreen();
    return;
  }
  if (process.argv[2] === 'red') {
    const { runPhysicalRed } = await import('./run-feature-011-physical-red.mjs');
    await runPhysicalRed('sql');
    return;
  }
  const inputs = harnessInputs(),
    results = [];
  for (const runtime of runtimes) {
    const identity = runtimeManifest(runtime);
    results.push(
      await withDatabase(runtime, (database) => ({
        runtime: identity,
        database,
        setup: prepare(runtime, database),
        smoke: smoke(runtime, database),
        missing: missingBehavior(runtime, database),
      })),
    );
    console.log(
      `${runtime.name}: baseline smoke PASS, intended missing behavior VALID_RED, exact cleanup PASS`,
    );
  }
  writeHarnessReport('postgres-health.json', {
    result: 'PASS',
    checkpoint: 'K03',
    mode: 'BASELINE_ONLY_HEALTH_AND_INTENTIONAL_MISSING_BEHAVIOR',
    inputs,
    results,
    realProducerAcceptance: false,
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
