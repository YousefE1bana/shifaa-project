import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { toolingPolicyHistoricalInputs, toolingPolicyInputPaths } from './tooling-history.mjs';

const source = resolve(import.meta.dirname, '..');
const repaired = 'tools/run-feature-011-postgres-test.mjs';

test('physical harness hashes approved historical inputs and keeps other inputs live', () => {
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { digest } from './tools/run-feature-011-postgres-test.mjs';
console.log(JSON.stringify(['.specify/memory/constitution.md', '${repaired}', 'compose.yml'].map(digest)));`,
      ],
      { cwd: source, encoding: 'utf8', windowsHide: true },
    ),
  );
  assert.deepEqual(actual, [
    '25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a',
    '23aebfab979d8fa4ca131b5a983d929463f95a9ac4bfa19fe39584e0fee9d54b',
    createHash('sha256')
      .update(readFileSync(join(source, 'compose.yml')))
      .digest('hex'),
  ]);
});

test('physical preflight compatibility rejects live drift after a successful cached read', () => {
  const parent = join(source, 'artifacts/feature-011/physical-preflight-history-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'fixture-'));
  try {
    for (const file of [...toolingPolicyInputPaths, repaired]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(source, file), join(root, file));
    }
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: source,
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(root, '.git'), `gitdir: ${gitDir}\n`);
    const original = execFileSync(
      'git',
      ['cat-file', 'blob', '8ba2568f4108ca5e09b2e6baa4f32efc54b8d649'],
      {
        cwd: source,
      },
    );
    const current = readFileSync(join(root, repaired));
    assert.ok(!current.equals(original), 'The regression must exercise the corrected source');
    assert.deepEqual(toolingPolicyHistoricalInputs(root).get(repaired), original);
    writeFileSync(
      join(root, repaired),
      Buffer.concat([current, Buffer.from('\nUNAPPROVED DRIFT\n')]),
    );
    assert.throws(() => toolingPolicyHistoricalInputs(root), /Physical preflight source drift/);
    writeFileSync(join(root, repaired), original);
    assert.equal(toolingPolicyHistoricalInputs(root).has(repaired), false);
    writeFileSync(join(root, '.specify/memory/constitution.md'), 'UNAPPROVED CONSTITUTION');
    assert.throws(() => toolingPolicyHistoricalInputs(root), /Tooling policy source drift/);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(parent) + sep));
    rmSync(root, { recursive: true });
  }
});
