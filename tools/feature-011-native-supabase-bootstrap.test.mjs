import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNativeBootstrapScope } from './feature-011-native-supabase-bootstrap.mjs';
const own = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const labels = {
  'com.supabase.cli.project': 'shifaa-local-supabase',
  'com.supabase.cli.workdir': own,
};
test('native reset accepts only the pinned CLI and current worktree-owned project', () => {
  assert.doesNotThrow(() => assertNativeBootstrapScope(labels, '2.113.0'));
});
for (const [name, actual, version, expected] of [
  [
    'another worktree with same project ID',
    { ...labels, 'com.supabase.cli.workdir': resolve(own, '..', 'foreign') },
    '2.113.0',
    /Foreign Supabase worktree/,
  ],
  [
    'another project',
    { ...labels, 'com.supabase.cli.project': 'unrelated' },
    '2.113.0',
    /Foreign Supabase project/,
  ],
  ['unpinned CLI', labels, '2.114.0', /Pinned project-local CLI/],
])
  test('native reset denies ' + name, () =>
    assert.throws(() => assertNativeBootstrapScope(actual, version), expected),
  );
