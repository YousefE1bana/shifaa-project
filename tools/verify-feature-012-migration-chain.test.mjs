import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  additivePaths,
  assertExactMigrationInventory,
  readCandidateMigration,
} from './verify-feature-012-migration-chain.mjs';

const sealed = Array.from(
  { length: 38 },
  (_, i) => `supabase/migrations/2026100100${String(i).padStart(4, '0')}_sealed.sql`,
);
const expected = [...sealed, ...additivePaths];

test('permits the exact ordered predecessor chain and additive migrations', () => {
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

test('denies missing or reordered additive migrations', () => {
  for (const changes of [expected.slice(0, -1), [...sealed, ...additivePaths.toReversed()]]) {
    assert.throws(() => assertExactMigrationInventory(changes, sealed), /unexpected changes/);
  }
});

test('denies an invalid sealed filename or a repeated or unordered version', () => {
  for (const badSeals of [
    ['supabase/migrations/20261001000000_INVALID.sql', ...sealed.slice(1)],
    [sealed[0], sealed[0].replace('_sealed.sql', '_duplicate.sql'), ...sealed.slice(2)],
    [sealed[1], sealed[0], ...sealed.slice(2)],
  ]) {
    assert.throws(
      () => assertExactMigrationInventory([...badSeals, ...additivePaths], badSeals),
      /Invalid migration path|unique and increasing/,
    );
  }
});

test('denies a missing or altered candidate SQL file even with the canonical filename', (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'shifaa-f012-chain-test-'));
  const files = additivePaths.map((path) => join(workspace, path));
  mkdirSync(dirname(files[0]), { recursive: true });
  t.after(() => {
    for (const file of files) unlinkSync(file);
    rmdirSync(dirname(files[0]));
    rmdirSync(join(workspace, 'supabase'));
    rmdirSync(workspace);
  });
  for (const [index, path] of additivePaths.entries()) {
    assert.throws(() => readCandidateMigration(workspace, path), { code: 'ENOENT' });
    writeFileSync(files[index], 'SELECT 1;\n', { flag: 'wx' });
    assert.throws(() => readCandidateMigration(workspace, path), /F012 migration bytes differ/);
  }
});
