import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { verify } from './verify.mjs';
import { verificationPlan, requiredIds, assertComplete } from './verification-plan.mjs';
import {
  localVerificationHost,
  verificationRoutes,
  inspectUnsafeEntrypoints,
} from './verification-host.mjs';
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

test('actual unsafe entrypoints remain visibly blocked, not environment-retargeted', () => {
  const evidence = inspectUnsafeEntrypoints(root);
  assert.equal(evidence.length, 6);
  assert.ok(evidence.every((item) => item.lines.every((line) => line > 0)));
  assert.equal(
    verificationRoutes(plan).find((r) => r.id === 'legacy-23').route,
    'unported-native-supabase',
  );
  assert.equal(
    verificationRoutes(plan).find((r) => r.id === 'legacy-42').route,
    'unported-two-runtime',
  );
});

test('real aggregate admission blocks before every subprocess, DB import or lifecycle action', async (t) => {
  const calls = [];
  for (const method of ['execFileSync', 'spawnSync', 'spawn', 'exec', 'execSync'])
    t.mock.method(childProcess, method, (...args) => {
      calls.push(args);
      throw new Error('Unexpected process');
    });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const host = localVerificationHost(root);
  host.execute = () => {
    calls.push('execute');
    throw new Error('Must never execute');
  };
  const result = await verify(host, plan);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'ISOLATED_LEGACY_RUNNERS_INCOMPLETE');
  assert.equal(result.results.length, 44);
  assert.ok(result.results.every((r) => r.status === 'BLOCKED' && r.exitCode === null));
  assert.deepEqual(calls, []);
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

test('package historical projection allows only the exact original verify replacement', () => {
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
