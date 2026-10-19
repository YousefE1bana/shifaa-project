import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { parsers } from 'prettier/plugins/babel';
import { testDockerSync, testConnectionOptions } from './verification-database.mjs';

const runners = [
  'run-audit-admin-postgres-test.mjs',
  'run-audit-admin-e2e.mjs',
  'run-audit-admin-restore-test.mjs',
  'audit-admin-performance.ts',
  'run-clinic-scheduling-postgres-test.mjs',
  'run-clinic-scheduling-e2e.mjs',
  'run-clinic-scheduling-migration-test.mjs',
  'run-clinic-scheduling-restore-test.mjs',
  'clinic-scheduling-performance.ts',
  'run-feature-010-postgres-test.mjs',
  'run-feature-010-realtime-postgres-test.mjs',
  'run-feature-010-restore-test.mjs',
  'feature-010-performance.ts',
  'run-feature-010-completion-authority-concurrency-test.mjs',
];

const childCallers = [
  '../services/api/test/clinic-scheduling-adapter.integration.test.ts',
  '../services/api/test/clinic-scheduling-atomic-effects.integration.test.ts',
  '../services/api/test/clinic-scheduling-postgres.integration.test.ts',
  '../services/api/test/feature-010-messages.postgres.integration.test.ts',
  '../services/api/test/feature-010-encounter-projection.postgres.integration.test.ts',
  '../services/api/test/feature-010-authority-race.postgres.integration.test.ts',
  '../tests/e2e/clinic-scheduling-discovery-booking.spec.ts',
  '../tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts',
  '../tests/e2e/clinic-scheduling-appointments.spec.ts',
  '../tests/e2e/clinic-scheduling-queue.spec.ts',
  '../tests/e2e/pre-011-patient-notes.postgres.integration.test.ts',
  '../services/worker/src/feature-010-realtime.postgres.test.ts',
  'feature-010-restore-api-fixture.ts',
];

function sourceFile(file) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  return { text, statements: parsers['babel-ts'].parse(text, {}).program.body };
}

// Evaluate only the actual boundary function, with every process/DB edge mocked.
// Importing the complete runner would execute its historical test workload.
function boundary(file, name, bindings) {
  const source = sourceFile(file);
  const declaration = source.statements.find(
    (node) => node.type === 'FunctionDeclaration' && node.id?.name === name,
  );
  assert.ok(declaration, `${file}: missing boundary ${name}`);
  const javascript = stripTypeScriptTypes(source.text.slice(declaration.start, declaration.end), {
    mode: 'transform',
  });
  return vm.runInNewContext(`${javascript}\n${name}`, {
    root: '/synthetic/worktree',
    process: { cwd: () => '/synthetic/worktree' },
    ...bindings,
  });
}

for (const file of runners) {
  test(`${file} has no raw Docker execution or shared Compose startup`, () => {
    const source = sourceFile(file);
    const rawDocker = [];
    function visit(node) {
      if (
        node.type === 'CallExpression' &&
        ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync'].includes(
          node.callee.name,
        ) &&
        node.arguments[0]?.value === 'docker'
      )
        rawDocker.push(source.text.slice(node.start, node.end));
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.filter((item) => item?.type).forEach(visit);
        else if (value?.type) visit(value);
      }
    }
    source.statements.forEach(visit);
    assert.deepEqual(rawDocker, []);
    assert.doesNotMatch(source.text, /\['compose', '(?:up|down)'/);
    assert.match(source.text, /from '\.\/verification-database\.mjs'/);
  });
}

const dockerBoundaries = [
  [
    'run-audit-admin-postgres-test.mjs',
    'runDocker',
    [['compose', 'exec', '-T', 'postgres', 'psql']],
  ],
  [
    'run-audit-admin-restore-test.mjs',
    'runDocker',
    [['compose', 'exec', '-T', 'postgres', 'pg_dump']],
  ],
  ['audit-admin-performance.ts', 'runDocker', [['compose', 'exec', '-T', 'postgres', 'psql']]],
  [
    'run-clinic-scheduling-postgres-test.mjs',
    'docker',
    [['compose', 'exec', '-T', 'postgres', 'psql']],
  ],
  [
    'run-clinic-scheduling-restore-test.mjs',
    'docker',
    [['compose', 'exec', '-T', 'postgres', 'pg_restore']],
  ],
  [
    'run-feature-010-postgres-test.mjs',
    'runDocker',
    [{ container: 'owned-native' }, ['psql'], { label: 'synthetic' }],
  ],
  [
    'run-feature-010-postgres-test.mjs',
    'startPsqlSession',
    [{ container: 'owned-native' }, 'scratch', 'synthetic'],
  ],
  [
    'run-feature-010-realtime-postgres-test.mjs',
    'runDocker',
    [{ container: 'owned-native' }, ['psql'], { label: 'synthetic' }],
  ],
  ['run-feature-010-restore-test.mjs', 'docker', [{ container: 'owned-native' }, ['pg_restore']]],
  [
    'feature-010-performance.ts',
    'runDocker',
    [{ container: 'owned-native' }, ['psql'], 'synthetic'],
  ],
  [
    'run-feature-010-completion-authority-concurrency-test.mjs',
    'runDocker',
    [{ container: 'owned-native' }, ['psql'], { label: 'synthetic' }],
  ],
  [
    'run-feature-010-completion-authority-concurrency-test.mjs',
    'startPsqlSession',
    [{ container: 'owned-native' }, 'scratch', 'synthetic'],
  ],
];

for (const [file, name, args] of dockerBoundaries) {
  test(`${file} ${name} stops at rejected ownership before any process`, () => {
    const denied = new Error('synthetic ownership rejection');
    let guarded = 0;
    const reject = () => {
      guarded++;
      throw denied;
    };
    const fn = boundary(file, name, {
      testDockerSync: reject,
      testDocker: reject,
      spawnSync: () => assert.fail('raw process boundary reached'),
      spawn: () => assert.fail('raw process boundary reached'),
    });
    assert.throws(
      () => fn(...args),
      (error) => error === denied,
    );
    assert.equal(guarded, 1);
  });
}

for (const [file, name, args] of [
  ['run-audit-admin-postgres-test.mjs', 'connect', ['scratch']],
  ['run-audit-admin-postgres-test.mjs', 'connectAs', ['scratch', 'shifaa_api']],
  ['audit-admin-performance.ts', 'connect', ['shifaa_worker', 2]],
  ['feature-010-performance.ts', 'apiDatabaseUrl', [{ name: 'shifaa-local-supabase' }, 'scratch']],
]) {
  test(`${file} ${name} rejects ownership before constructing a client`, () => {
    const denied = new Error('synthetic ownership rejection');
    const reject = () => {
      throw denied;
    };
    const fn = boundary(file, name, {
      database: 'scratch',
      testConnectionOptions: reject,
      testDatabaseUrl: reject,
      postgres: () => assert.fail('client constructed without verified target'),
    });
    assert.throws(
      () => fn(...args),
      (error) => error === denied,
    );
  });
}

test('audit database clients use guard-derived host, port, password and exact role/database', () => {
  const calls = [];
  const options = { host: '127.0.0.1', port: 65432, password: 'synthetic-private-test' };
  const connect = boundary('run-audit-admin-postgres-test.mjs', 'connectAs', {
    testConnectionOptions: (...args) => {
      calls.push(args);
      return { ...options, username: args[0], database: args[2] };
    },
    postgres: (value) => value,
  });
  const actual = connect('scratch', 'shifaa_worker');
  assert.deepEqual(calls, [['shifaa_worker', 'postgres', 'scratch']]);
  assert.equal(actual.host, options.host);
  assert.equal(actual.port, options.port);
  assert.equal(actual.password, options.password);
  assert.equal(actual.username, 'shifaa_worker');
  assert.equal(actual.database, 'scratch');
});

for (const file of [
  'run-feature-010-postgres-test.mjs',
  'run-feature-010-realtime-postgres-test.mjs',
  'run-feature-010-restore-test.mjs',
  'feature-010-performance.ts',
  'run-feature-010-completion-authority-concurrency-test.mjs',
]) {
  test(`${file} runtime declaration remains lazy and resolves native identity at use`, () => {
    const statement = sourceFile(file).statements.find(
      (node) =>
        node.type === 'VariableDeclaration' &&
        node.declarations.some((item) =>
          ['configuredRuntimes', 'runtimes', 'runtimeConfigs'].includes(item.id.name),
        ),
    );
    const declaration = statement.declarations[0];
    const calls = [];
    const runtimes = vm.runInNewContext(
      `(${sourceFile(file).text.slice(declaration.init.start, declaration.init.end)})`,
      {
        verifiedRuntime: (runtime) => {
          calls.push(runtime);
          return {
            container: `owned-${runtime}`,
            user: 'synthetic-admin',
            adminDatabase: 'postgres',
          };
        },
      },
    );
    assert.deepEqual(calls, []);
    assert.equal(runtimes[1].name, 'shifaa-local-supabase');
    assert.equal(runtimes[1].container, 'owned-supabase');
    assert.deepEqual(calls, ['supabase']);
  });
}

for (const [file, name, args] of [
  ['run-clinic-scheduling-postgres-test.mjs', 'runRaceTests', ['scratch']],
  ['run-clinic-scheduling-restore-test.mjs', 'runWorkerReplay', ['scratch']],
]) {
  test(`${file} child hand-off rejects stale ownership before spawning`, () => {
    const denied = new Error('synthetic stale receipt');
    const fn = boundary(file, name, {
      assertTestDatabaseEnvironment: () => {
        throw denied;
      },
      spawnSync: () => assert.fail('child spawned after ownership rejection'),
    });
    assert.throws(
      () => fn(...args),
      (error) => error === denied,
    );
  });
}

test('F009 restore child source revalidates its own connection instead of trusting URL env', () => {
  const source = sourceFile('run-clinic-scheduling-restore-test.mjs').text;
  assert.doesNotMatch(source, /postgres\(process\.env\.DATABASE_URL/);
  assert.doesNotMatch(source, /process\.env\.(?:OWNER|WORKER)_DATABASE_URL/);
  assert.equal(
    source.match(
      /import \{ testDatabaseUrl \} from '\.\.\/\.\.\/tools\/verification-database\.mjs'/g,
    )?.length,
    2,
  );
});

test('actual shared guard rejects direct runner calls without a receipt before Docker or clients', (t) => {
  const previousContext = process.env.SHIFAA_VERIFY_CONTEXT;
  delete process.env.SHIFAA_VERIFY_CONTEXT;
  t.after(() => {
    if (previousContext === undefined) delete process.env.SHIFAA_VERIFY_CONTEXT;
    else process.env.SHIFAA_VERIFY_CONTEXT = previousContext;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  for (const name of ['spawnSync', 'spawn', 'execFileSync'])
    t.mock.method(childProcess, name, () => assert.fail('OS boundary reached without a receipt'));
  syncBuiltinESMExports();
  const docker = boundary('run-clinic-scheduling-postgres-test.mjs', 'docker', { testDockerSync });
  assert.throws(
    () => docker(['compose', 'exec', '-T', 'postgres', 'psql']),
    /verification-resource-denied/,
  );
  const connect = boundary('run-audit-admin-postgres-test.mjs', 'connect', {
    testConnectionOptions,
    postgres: () => assert.fail('DB client constructed without a receipt'),
  });
  assert.throws(() => connect('scratch'), /verification-resource-denied/);
});

for (const file of childCallers) {
  test(`${file} has no URL fallback and no resource checks during disabled collection`, () => {
    const source = sourceFile(file);
    assert.doesNotMatch(source.text, /SHIFAA_PG_(?:HOST|PORT)|DATABASE_URL|postgres(?:ql)?:\/\//);
    const topLevelResources = [];
    function visit(node, functionDepth = 0) {
      if (
        ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
      )
        functionDepth++;
      if (
        ['CallExpression', 'NewExpression'].includes(node.type) &&
        [
          'postgres',
          'PostgresIdentityRepository',
          'testDatabaseUrl',
          'testConnectionOptions',
        ].includes(node.callee.name) &&
        functionDepth === 0
      )
        topLevelResources.push(source.text.slice(node.start, node.end));
      for (const value of Object.values(node)) {
        if (Array.isArray(value))
          value.filter((item) => item?.type).forEach((item) => visit(item, functionDepth));
        else if (value?.type) visit(value, functionDepth);
      }
    }
    source.statements.forEach((node) => visit(node));
    assert.deepEqual(topLevelResources, []);
  });
}

for (const [file, name] of [
  ['../services/api/test/clinic-scheduling-atomic-effects.integration.test.ts', 'client'],
  ['../services/api/test/clinic-scheduling-postgres.integration.test.ts', 'client'],
  ['../tests/e2e/clinic-scheduling-discovery-booking.spec.ts', 'realDb'],
  ['../tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts', 'db'],
  ['../tests/e2e/clinic-scheduling-appointments.spec.ts', 'realDb'],
  ['../tests/e2e/clinic-scheduling-queue.spec.ts', 'realDb'],
]) {
  test(`${file} constructor rejects an unverified target before the SDK`, () => {
    const denied = new Error('synthetic rejected target');
    const fn = boundary(file, name, {
      database: 'scratch',
      databaseName: 'scratch',
      verificationRuntime: 'supabase',
      testConnectionOptions: (role, runtime, database) => {
        assert.deepEqual([role, runtime, database], ['owner', 'supabase', 'scratch']);
        throw denied;
      },
      postgres: () => assert.fail('unverified SDK client'),
    });
    assert.throws(
      () => fn(),
      (error) => error === denied,
    );
  });
}

for (const file of [
  '../services/api/test/clinic-scheduling-adapter.integration.test.ts',
  '../services/api/test/clinic-scheduling-postgres.integration.test.ts',
  '../services/api/test/feature-010-messages.postgres.integration.test.ts',
  '../services/api/test/feature-010-encounter-projection.postgres.integration.test.ts',
  '../services/api/test/feature-010-authority-race.postgres.integration.test.ts',
  '../tests/e2e/pre-011-patient-notes.postgres.integration.test.ts',
  '../services/worker/src/feature-010-realtime.postgres.test.ts',
]) {
  test(`${file} enabled setup rejects ownership before creating clients`, async () => {
    const source = sourceFile(file);
    let callback;
    function visit(node) {
      if (node.type === 'CallExpression' && ['beforeAll', 'before'].includes(node.callee.name))
        callback ??= node.arguments.find((argument) => argument.type === 'ArrowFunctionExpression');
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.filter((item) => item?.type).forEach(visit);
        else if (value?.type) visit(value);
      }
    }
    source.statements.forEach(visit);
    assert.ok(callback, 'setup hook is required');
    const denied = new Error('synthetic rejected target');
    const javascript = stripTypeScriptTypes(
      `const setup = ${source.text.slice(callback.start, callback.end)};`,
      { mode: 'transform' },
    );
    const setup = vm.runInNewContext(`${javascript}\nsetup`, {
      database: 'scratch',
      verificationRuntime: 'supabase',
      testDatabaseUrl: (_role, runtime, database) => {
        assert.equal(runtime, 'supabase');
        assert.equal(database, 'scratch');
        throw denied;
      },
      postgres: () => assert.fail('unverified SDK client'),
      loadConfig: () => ({}),
      storeConstructor: () => function Store() {},
    });
    await assert.rejects(
      async () => setup(),
      (error) => error === denied,
    );
  });
}
