import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
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

test('root integration discovery selects the active checkout without archived worktree copies', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shifaa-vitest-discovery-'));
  try {
    const active = 'services/api/test/identity-continuity-sessions.integration.test.ts';
    for (const relative of [active, `.worktrees/archived/${active}`]) {
      const path = join(fixture, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'throw new Error("Discovery must not execute database fixtures");\n');
    }
    const discovered = JSON.parse(
      execFileSync(
        process.execPath,
        [
          join(own, 'node_modules/vitest/vitest.mjs'),
          'list',
          active,
          '--root',
          fixture,
          '--config',
          join(own, 'vitest.config.mts'),
          '--filesOnly',
          '--json',
        ],
        { cwd: own, encoding: 'utf8', windowsHide: true },
      ),
    );
    assert.deepEqual(
      discovered.map(({ file }) => resolve(file)),
      [resolve(fixture, active)],
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
