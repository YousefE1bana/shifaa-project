// Local native-Auth test setup only. F011 role/owner provisioning uses the
// already-approved offline admin boundary, never an online or elevated API role.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  currentPhysicalSourceDigests,
  verifyFeature011Contracts,
  currentEvidenceRoot,
} from './verify-feature-011-contracts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'shifaa-local-supabase';
const container = `supabase_db_${project}`;
const predecessorVersion = '20261001001002';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assertNativeBootstrapScope(labels, cliVersion, workdir = root) {
  assert.equal(cliVersion, '2.113.0', 'Pinned project-local CLI required');
  assert.equal(labels['com.supabase.cli.project'], project, 'Foreign Supabase project');
  assert.equal(
    resolve(labels['com.supabase.cli.workdir']),
    resolve(workdir),
    'Foreign Supabase worktree',
  );
}

export function assertNativeSupabaseOwnership(runPnpm) {
  const inspect = JSON.parse(
    execFileSync('docker', ['inspect', container], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }),
  )[0];
  assertNativeBootstrapScope(
    inspect.Config.Labels,
    runPnpm(['exec', 'supabase', '--version'], true).trim(),
  );
  assert.equal(inspect.State.Health.Status, 'healthy');
  assert.match(
    readFileSync(join(root, 'supabase/config.toml'), 'utf8'),
    /^project_id = "shifaa-local-supabase"$/m,
  );
}

export async function resetFeature011NativeSupabase(runPnpm) {
  assertNativeSupabaseOwnership(runPnpm);
  const parity = await verifyFeature011Contracts({ root });
  assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
  const pins = currentPhysicalSourceDigests(root);
  const directory = join(root, 'supabase/migrations');
  const tail = readdirSync(directory)
    .filter((file) => /^\d+_.*\.sql$/.test(file) && file.split('_')[0] > predecessorVersion)
    .sort();
  assert.equal(tail.length, 11, 'Exact F011 chain and approved F010 handoff required');
  const migrations = tail.map((file) => {
    assert.match(
      file,
      /^(?:20261006\d+_f011_.*|20261008013921_f010_patient_identifier_handoff)\.sql$/,
      'Unexpected successor migration',
    );
    const path = `supabase/migrations/${file}`;
    const bytes = readFileSync(join(root, path));
    assert.equal(hash(bytes), pins[path], 'Unbound migration');
    return { path, version: file.split('_')[0], sha256: hash(bytes), bytes };
  });
  const psql = (input) =>
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
      ],
      {
        cwd: root,
        input,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  const roles = () =>
    JSON.parse(
      psql(
        "SELECT json_agg(json_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,'login',rolcanlogin) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('supabase_admin','postgres','shifaa_api','shifaa_worker','service_role');",
      ),
    );
  const beforeBaseline = roles();
  assert.equal(beforeBaseline.find((role) => role.name === 'supabase_admin')?.superuser, true);
  assert.equal(beforeBaseline.find((role) => role.name === 'postgres')?.superuser, false);
  const startedAt = new Date().toISOString();
  // Preserve native Auth's official local reset semantics. This is the existing
  // worktree-owned synthetic reset; the exact predecessor chain still uses CLI.
  runPnpm(['exec', 'supabase', 'db', 'reset', '--local', '--version', predecessorVersion]);
  // A cold native database has no SHIFAA roles until the approved predecessor
  // chain creates them. Compare the F011 tail against that populated baseline.
  const before = roles();
  for (const existing of beforeBaseline)
    assert.deepEqual(
      before.find((role) => role.name === existing.name),
      existing,
      'Predecessor reset changed an existing runtime role',
    );
  for (const name of ['shifaa_api', 'shifaa_worker']) {
    const role = before.find((role) => role.name === name);
    assert.ok(role, 'Predecessor online role is missing');
    assert.equal(role.superuser, false, 'Online role must not be superuser');
    assert.equal(role.bypassRls, false, 'Online role must not bypass RLS');
  }
  for (const migration of migrations) {
    const result = psql(
      Buffer.concat([Buffer.from('BEGIN;\n'), migration.bytes, Buffer.from('\nCOMMIT;\n')]),
    );
    assert(!result.includes('ERROR'), 'Migration setup failed');
    console.log('PASS offline-admin migration ' + migration.path);
  }
  // Mark only files actually committed above, using the official local tracker.
  runPnpm([
    'exec',
    'supabase',
    'migration',
    'repair',
    '--local',
    '--status',
    'applied',
    ...migrations.map((m) => m.version),
  ]);
  const observed = psql(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version > '${predecessorVersion}' ORDER BY version;`,
  )
    .trim()
    .split('\n');
  assert.deepEqual(
    observed,
    migrations.map((m) => m.version),
  );
  const executor = JSON.parse(
    psql(
      "SELECT json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'ownsClinicalTable',EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relkind IN ('r','p') AND c.relowner=r.oid),'apiMember',pg_has_role('shifaa_api',r.oid,'MEMBER'),'workerMember',pg_has_role('shifaa_worker',r.oid,'MEMBER'),'serviceMember',pg_has_role('service_role',r.oid,'MEMBER')) FROM pg_roles r WHERE rolname='shifaa_f011_executor';",
    ),
  );
  assert.deepEqual(executor, {
    name: 'shifaa_f011_executor',
    login: false,
    superuser: false,
    bypassRls: false,
    ownsClinicalTable: false,
    apiMember: false,
    workerMember: false,
    serviceMember: false,
  });
  const after = roles();
  assert.deepEqual(after, before, 'Existing runtime role attributes changed');
  assert.deepEqual(currentPhysicalSourceDigests(root), pins, 'Pinned source changed');
  const evidence = join(root, currentEvidenceRoot(root));
  assert(existsSync(evidence));
  mkdirSync(join(evidence, 'native-bootstrap'), { recursive: true });
  const path = join(evidence, 'native-bootstrap', randomUUID() + '.json');
  writeFileSync(
    path,
    JSON.stringify(
      {
        result: 'PASS_OFFLINE_ADMIN_NATIVE_TEST_BOOTSTRAP',
        startedAt,
        finishedAt: new Date().toISOString(),
        project,
        workdir: root,
        cliVersion: '2.113.0',
        predecessorVersion,
        migrations: migrations.map(({ bytes, ...m }) => m),
        sourceDigests: pins,
        harnessSources: Object.fromEntries(
          [
            'tools/feature-011-native-supabase-bootstrap.mjs',
            'tools/feature-011-native-supabase-bootstrap.test.mjs',
            'tools/start-feature-011-native-supabase.mjs',
            'tools/start-feature-011-native-supabase.test.mjs',
            'tools/reset-feature-011-native-supabase.mjs',
            'tools/reset-feature-011-native-supabase.test.mjs',
            'tools/run-identity-continuity-supabase-test.mjs',
            'tools/run-identity-continuity-mfa-test.mjs',
            'tools/run-identity-continuity-recovery-test.mjs',
          ].map((path) => [path, hash(readFileSync(join(root, path)))]),
        ),
        offlineAdmin: 'supabase_admin',
        rolesBeforeBaseline: beforeBaseline,
        rolesBefore: before,
        rolesAfter: after,
        executor,
        sqlChanged: false,
        newPrivileges: false,
        productionOrClinicalAcceptance: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS native test bootstrap: unchanged complete F011 chain; non-owner executor and online roles restricted',
  );
}
