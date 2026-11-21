import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addition,
  readCandidateMigration,
  verifyExtendedChain,
} from './verify-feature-012-migration-chain.mjs';
import { safeSource } from './verification/sandbox.mjs';

assert.equal(process.platform, 'linux');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.RUNNER_OS, 'Linux');
for (const variable of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'SUPABASE_CLI_BINARY_OVERRIDE']) {
  assert.ok(!process.env[variable], `Unsupported native runtime override: ${variable}`);
}

const root = resolve(import.meta.dirname, '..');
assert.equal(root, realpathSync(process.env.GITHUB_WORKSPACE));
const historical = realpathSync(join(process.env.RUNNER_TEMP, 'shifaa-f011'));
const chain = await verifyExtendedChain(historical, root);
const migration = readCandidateMigration(root);
const versionOf = (path) => path.split('/').at(-1).split('_')[0];
const versions = chain.extended.migrations.map(({ path }) => versionOf(path));

const load = (path) => import(pathToFileURL(safeSource(historical, path)).href);
const { runFeature011NativeSupabaseTests } = await load(
  'tools/reset-feature-011-native-supabase.mjs',
);
const { assertNativeBootstrapScope, resetFeature011NativeSupabase } = await load(
  'tools/feature-011-native-supabase-bootstrap.mjs',
);

const docker = (args, input) =>
  execFileSync('docker', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.equal(docker(['context', 'show']).trim(), 'default');
assert.equal(
  docker(['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}']).trim(),
  'unix:///var/run/docker.sock',
);

async function resetAndExtend(runPnpm) {
  await resetFeature011NativeSupabase(runPnpm);
  const [database] = JSON.parse(docker(['inspect', 'supabase_db_shifaa-local-supabase']));
  assert.match(database.Id, /^[0-9a-f]{64}$/);
  assert.equal(database.State.Health.Status, 'healthy');
  assertNativeBootstrapScope(
    database.Config.Labels,
    runPnpm(['exec', 'supabase', '--version'], true).trim(),
    historical,
  );

  const sql = (input) =>
    docker(
      [
        'exec',
        '-i',
        database.Id,
        'psql',
        '-XAt',
        '--set=ON_ERROR_STOP=1',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
      ],
      input,
    );
  const applied = () =>
    sql('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;')
      .trim()
      .split('\n');
  assert.deepEqual(applied(), versions.slice(0, -1), 'Unexpected native predecessor chain');
  console.log(sql(migration).trim());
  runPnpm([
    'exec',
    'supabase',
    '--workdir',
    root,
    'migration',
    'repair',
    '--local',
    '--status',
    'applied',
    versionOf(addition),
  ]);
  assert.deepEqual(applied(), versions, 'Unexpected native extended chain');

  const fixture = readFileSync(safeSource(root, 'infra/db/tests/feature-012-source-fence.sql'));
  console.log(sql(fixture).trim());
  console.log(
    JSON.stringify({ result: 'PASS_NATIVE_EXTENDED_CHAIN', database: database.Id, chain }, null, 2),
  );
}

// Run the original F011 suite against the same native Auth/Storage/DB stack
// after its sealed reset and the F012 addition have both executed.
await runFeature011NativeSupabaseTests({ reset: resetAndExtend });
