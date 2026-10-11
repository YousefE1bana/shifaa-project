import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  assertHarnessDatabase,
  assertOwnedDatabase,
  assertValidMissingBehavior,
  migrationChain,
  readMigration,
  runtimes,
  root,
} from './run-feature-011-postgres-test.mjs';

test('temporary names cannot select either application database, escape, or use historical scratch names', () => {
  for (const name of [
    'shifaa',
    'postgres',
    'f011_c03_1234567890abcdef',
    'f011_k03_1234',
    'f011_k09_1234567890abcdef',
    'f011_k03_1234567890abcdef";DROP DATABASE shifaa;--',
  ]) {
    assert.throws(() => assertHarnessDatabase(name), /Unsafe/);
  }
  assert.doesNotThrow(() => assertHarnessDatabase('f011_k03_1234567890abcdef'));
  assert.doesNotThrow(() => assertHarnessDatabase('f011_k05_1234567890abcdef'));
  assert.doesNotThrow(() => assertHarnessDatabase('f011_k06_1234567890abcdef'));
  assert.doesNotThrow(() => assertHarnessDatabase('f011_k07_1234567890abcdef'));
  assert.doesNotThrow(() => assertHarnessDatabase('f011_k08_1234567890abcdef'));
  assert.throws(() => assertOwnedDatabase(runtimes[0], 'f011_k08_1234567890abcdef'), /not created/);
  assert.throws(() => assertOwnedDatabase(runtimes[0], 'f011_k07_1234567890abcdef'), /not created/);
  assert.throws(() => assertOwnedDatabase(runtimes[0], 'f011_k03_1234567890abcdef'), /not created/);
});
test('baseline chain contains the complete 27 prerequisites and rejects Feature 011 DDL', () => {
  const chain = migrationChain();
  assert.equal(chain.length, 27);
  assert.equal(new Set(chain).size, 27);
  assert.equal(chain[0], 'infra/db/migrations/001_identity_onboarding.sql');
  assert.equal(
    chain.at(-1),
    'supabase/migrations/20261001001002_f010_f04_completion_authority.sql',
  );
  assert.throws(() => migrationChain(true), /not authorized/);
});
test('migration includes cannot escape the repository or cycle', () => {
  assert.throws(() => readMigration('../outside.sql'), /Unsafe/);
  const path = migrationChain()[0];
  assert.throws(() => readMigration(path, new Set([resolve(root, path)])), /cyclic/);
});
test('only the exact intentional missing-behavior SQLSTATE/message qualifies as RED', () => {
  const message =
    'ERROR:  P0001: F011_K03_EXPECTED_MISSING_BEHAVIOR: clinical.verify_allergy_api_v1(uuid,integer,jsonb)';
  assert.doesNotThrow(() =>
    assertValidMissingBehavior({ exitCode: 3, stderr: message, output: message }),
  );
  for (const result of [
    { exitCode: 0, stderr: message, output: message },
    { exitCode: 2, stderr: message, output: message },
    { exitCode: 3, stderr: 'ERROR: 42601: syntax error', output: 'syntax error' },
    { exitCode: 3, stderr: 'ERROR: 42501: permission denied', output: 'permission denied' },
    { exitCode: 3, stderr: 'ERROR: P0001: unrelated failure', output: 'unrelated failure' },
    { exitCode: 3, stderr: `${message}\nsyntax error`, output: message },
  ])
    assert.throws(() => assertValidMissingBehavior(result));
});
test('runners reject malformed modes before contacting a runtime', () => {
  for (const file of [
    'run-feature-011-postgres-test.mjs',
    'run-feature-011-concurrency-test.mjs',
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, [`tools/${file}`, 'green', 'extra'], { cwd: root, stdio: 'pipe' }),
      /health, red or authorized K07 green only/,
    );
  }
});
