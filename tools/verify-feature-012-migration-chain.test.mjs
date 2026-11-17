import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertExactMigrationInventory } from './verify-feature-012-migration-chain.mjs';

const sealed = Array.from(
  { length: 38 },
  (_, i) => `supabase/migrations/2026100100${String(i).padStart(4, '0')}_sealed.sql`,
);
const candidate = 'supabase/migrations/20261112001200_f012_source_admission.sql';
const expected = [...sealed, candidate];

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
