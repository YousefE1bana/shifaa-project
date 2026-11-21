import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  addition,
  assertExactMigrationInventory,
  readCandidateMigration,
} from './verify-feature-012-migration-chain.mjs';

const sealed = Array.from(
  { length: 38 },
  (_, i) => `supabase/migrations/2026100100${String(i).padStart(4, '0')}_sealed.sql`,
);
const expected = [...sealed, addition];

test('permits the exact ordered predecessor chain and one candidate migration', () => {
  assert.doesNotThrow(() => assertExactMigrationInventory(expected, sealed));
});

test('denies a missing, replaced or reordered predecessor migration', () => {
  for (const changes of [
    expected.slice(1),
    ['supabase/migrations/other.sql', ...expected.slice(1)],
    [expected[1], expected[0], ...expected.slice(2)],
  ]) {
    assert.throws(() => assertExactMigrationInventory(changes, sealed), /unexpected changes/);
  }
});

test('denies an unexpected addition beyond the candidate', () => {
  assert.throws(
    () => assertExactMigrationInventory([...expected, 'extra.sql'], sealed),
    /unexpected changes/,
  );
});

test('denies an invalid sealed filename or a repeated or unordered version', () => {
  for (const badSeals of [
    ['supabase/migrations/20261001000000_INVALID.sql', ...sealed.slice(1)],
    [sealed[0], sealed[0].replace('_sealed.sql', '_duplicate.sql'), ...sealed.slice(2)],
    [sealed[1], sealed[0], ...sealed.slice(2)],
  ]) {
    assert.throws(
      () => assertExactMigrationInventory([...badSeals, addition], badSeals),
      /Invalid migration path|unique and increasing/,
    );
  }
});

test('denies a missing or altered candidate SQL file even with the canonical filename', (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'shifaa-f012-chain-test-'));
  const sql = join(workspace, addition);
  mkdirSync(dirname(sql), { recursive: true });
  t.after(() => {
    unlinkSync(sql);
    rmdirSync(dirname(sql));
    rmdirSync(join(workspace, 'supabase'));
    rmdirSync(workspace);
  });
  assert.throws(() => readCandidateMigration(workspace), { code: 'ENOENT' });
  writeFileSync(sql, 'SELECT 1;\n', { flag: 'wx' });
  assert.throws(() => readCandidateMigration(workspace), /F012 migration bytes differ/);
});
