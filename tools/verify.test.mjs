import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { verify } from './verify.mjs';
import { verificationPlan, requiredIds, assertComplete } from './verification-plan.mjs';
import { localVerificationHost, verificationRoutes } from './verification-host.mjs';
import { verifyCiDatabase } from './verification-ci.mjs';
import { verificationPackageProjection } from './tooling-history.mjs';

const root = path.resolve(import.meta.dirname, '..');
const plan = verificationPlan(root);
const passed = () => requiredIds(plan).map((id) => ({ id, status: 'PASS', exitCode: 0 }));

test('all 42 original obligations plus Family/Privacy remain exact and unique', () => {
  assert.equal(plan.requiredSteps.length, 42);
  assert.deepEqual(plan.additionalRequiredSuites, ['family', 'privacy']);
  const ids = requiredIds(plan);
  assert.equal(ids.length, 44);
  assert.equal(new Set(ids).size, 44);
  assert.deepEqual(
    verificationRoutes(plan).map((r) => r.id),
    ids,
  );
});

for (const change of [
  (r) => r.pop(),
  (r) => r.push(r[0]),
  (r) => (r[1].id = r[0].id),
  (r) => (r[0].status = 'SKIP'),
  (r) => (r[0].status = 'BLOCKED'),
  (r) => (r[0].exitCode = 1),
])
  test(`incomplete or false coverage cannot PASS: ${change}`, () => {
    const results = passed();
    change(results);
    assert.throws(() => assertComplete(plan, results));
  });

test('all required checks have executable routes without an unported/BLOCKED stub', () => {
  assert.ok(
    verificationRoutes(plan).every((entry) =>
      ['original-check', 'guarded-e2e'].includes(entry.route),
    ),
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.doesNotMatch(manifest.scripts['db:reset'], /compose down|compose up/);
  for (const name of ['db:reset', 'db:migrate', 'db:test', 'db:rls-test', 'supabase:reset'])
    assert.match(manifest.scripts[name], /test-database-command/);
});

test('actual local dispatcher executes all 44 obligations only after successful resource admission', async () => {
  const calls = [];
  let closed = 0;
  const host = localVerificationHost(root, {
    createEnvironment: async () => ({
      close: async () => {
        closed++;
      },
    }),
    run: (program, args) => {
      calls.push([program, args]);
      return { status: 0 };
    },
  });
  const result = await verify(host, plan);
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 44);
  assert.equal(closed, 1);
  assert.equal(calls.filter((call) => call[1].includes('tools/verification-e2e.mjs')).length, 3);
  assert.equal(
    calls.filter((call) => call[1].includes('test:identity-continuity:stack')).length,
    1,
  );
  assert.equal(calls.filter((call) => call[1].includes('test:feature-011:composition')).length, 1);
});

test('missing engine denies actual dispatcher before a test process and never falls back', async () => {
  let commands = 0;
  const host = localVerificationHost(root, {
    createEnvironment: async () => {
      throw new Error('engine unavailable');
    },
    run: () => {
      commands++;
      return { status: 0 };
    },
  });
  const result = await verify(host, plan);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(commands, 0);
  assert.ok(result.results.every((entry) => entry.status === 'BLOCKED'));
});

test('identity loss at final teardown cannot produce PASS or leak raw errors', async () => {
  const result = await verify(
    {
      preflight: () => ({ status: 'PASS' }),
      execute: () => ({ exitCode: 0, cleanupVerified: true }),
      close: () => {
        throw new Error('SECRET ownership loss');
      },
    },
    plan,
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'OWNED_RESOURCE_CLEANUP_INCOMPLETE');
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test('preflight denial, missing engine and interruption never trigger execution or guessed teardown', async () => {
  for (const failure of ['missing engine', 'substituted target', 'interrupted admission']) {
    const calls = [];
    const result = await verify(
      {
        preflight() {
          throw new Error(failure + ' SECRET');
        },
        execute() {
          calls.push('execute');
        },
        teardown() {
          calls.push('teardown');
        },
      },
      plan,
    );
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(calls, []);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
  }
});

test('mocked successful dispatch requires all 44 exits AND verified resource disposition', async () => {
  const called = [];
  const result = await verify(
    {
      preflight: () => ({ status: 'PASS' }),
      execute(id) {
        called.push(id);
        return { exitCode: 0, cleanupVerified: true };
      },
    },
    plan,
  );
  assert.equal(result.status, 'PASS');
  assert.deepEqual(called, requiredIds(plan));
  // This synthetic host is algorithm coverage, never real integration evidence.
});

test('failed check stops the sequence and never produces PASS or fake remaining results', async () => {
  const called = [];
  const result = await verify(
    {
      preflight: () => ({ status: 'PASS' }),
      execute(id) {
        called.push(id);
        return { exitCode: 17, cleanupVerified: true };
      },
    },
    plan,
  );
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(called, ['legacy-01']);
  assert.equal(result.results[0].exitCode, 17);
  assert.ok(result.results.slice(1).every((r) => r.status === 'BLOCKED'));
});

test('ownership loss or partial cleanup never becomes a test PASS', async () => {
  const result = await verify(
    {
      preflight: () => ({ status: 'PASS' }),
      execute: () => ({ exitCode: 0, cleanupVerified: false }),
    },
    plan,
  );
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.results.every((r) => r.status === 'BLOCKED'));
});

test('no VM backend, appliance, credential or per-run configuration dependency survives', () => {
  for (const file of ['verify.mjs', 'verification-host.mjs', 'verification-plan.mjs']) {
    const source = fs.readFileSync(path.join(root, 'tools', file), 'utf8');
    assert.doesNotMatch(
      source,
      /verification-hyperv|verification-guest|SHIFAA_VERIFY_CONFIG|VHDX|PSCredential|New-VM|Enter-PSSession/,
    );
  }
  for (const file of [
    'verification-hyperv.ps1',
    'verification-hyperv.test.ps1',
    'verification-guest.mjs',
    'verification-graph.mjs',
  ])
    assert.equal(fs.existsSync(path.join(root, 'tools', file)), false);
});

test('package historical projection requires the exact source-level safety repair binding', () => {
  const original = childProcess.execFileSync(
    'git',
    ['cat-file', 'blob', plan.historicalPackage.gitBlob],
    { cwd: root },
  );
  const current = fs.readFileSync(path.join(root, 'package.json'));
  assert.deepEqual(verificationPackageProjection(current, original), original);
  const corrupt = Buffer.from(current);
  corrupt[20] ^= 1;
  assert.throws(() => verificationPackageProjection(corrupt, original));
  assert.throws(() =>
    verificationPackageProjection(current, Buffer.concat([original, Buffer.from('\n')])),
  );
});

// The CI entrypoints exercise the same boundary without legacy Compose teardown.
test('CI database suites require admission, preserve failures and close only their owner', async () => {
  for (const scope of ['database', 'native']) {
    let closed = 0;
    const scripts = [];
    const result = await verifyCiDatabase(scope, {
      createEnvironment: async () => ({
        close: async () => {
          closed++;
        },
      }),
      run: (_program, args) => {
        scripts.push(args[1]);
        return { status: 0 };
      },
    });
    assert.equal(result, 0);
    assert.deepEqual(
      scripts,
      scope === 'database' ? ['db:migrate', 'db:test', 'db:rls-test'] : ['supabase:test'],
    );
    assert.equal(closed, 1);
  }
  let commands = 0,
    closed = 0;
  await assert.rejects(verifyCiDatabase('foreign', { createEnvironment: () => assert.fail() }));
  await assert.rejects(
    verifyCiDatabase('database', {
      createEnvironment: () => {
        throw Error('missing engine');
      },
      run: () => {
        commands++;
      },
    }),
  );
  assert.equal(commands, 0);
  assert.equal(
    await verifyCiDatabase('database', {
      createEnvironment: async () => ({
        close: () => {
          closed++;
        },
      }),
      run: () => ({ status: 13 }),
    }),
    13,
  );
  assert.equal(closed, 1);
  await assert.rejects(
    verifyCiDatabase('database', {
      createEnvironment: async () => ({
        close: () => {
          throw Error('ownership lost');
        },
      }),
      run: () => ({ status: 0 }),
    }),
    /ownership lost/,
  );
});

for (const code of ['DOCKER_ENGINE_UNAVAILABLE', 'POSTGIS_IMAGE_MISSING'])
  test(`${code} returns an actionable prerequisite without running any check`, async () => {
    let executions = 0;
    const result = await verify(
      localVerificationHost(root, {
        createEnvironment: async () => {
          throw Object.assign(new Error('private raw error'), { verificationPrerequisite: code });
        },
        run: () => {
          executions++;
          assert.fail('preflight must stop');
        },
      }),
      plan,
    );
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.code, code);
    assert.equal(executions, 0);
    assert.ok(result.results.every((entry) => entry.status === 'BLOCKED'));
    assert.doesNotMatch(JSON.stringify(result), /private raw error/);
  });
