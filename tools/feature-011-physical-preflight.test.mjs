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

test('maintenance pins preserve sealed F011 inputs without admitting unrelated script or workflow drift', () => {
  const pins = ['package.json', '.github/workflows/ci.yml'];
  const parent = join(source, 'artifacts/feature-011/physical-preflight-history-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'maintenance-'));
  try {
    for (const file of [...toolingPolicyInputPaths, ...pins]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(source, file), join(root, file));
    }
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: source,
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(root, '.git'), `gitdir: ${gitDir}\n`);
    const historical = toolingPolicyHistoricalInputs(root);
    const oldPackage = JSON.parse(historical.get('package.json'));
    const currentPackage = JSON.parse(readFileSync(join(root, 'package.json')));
    assert.equal(currentPackage.engines.node, '24.22.1');
    assert.equal(currentPackage.engines.pnpm, '11.13.1');
    assert.equal(currentPackage.packageManager, 'pnpm@11.13.1');
    assert.equal(
      currentPackage.scripts['dependencies:check'],
      oldPackage.scripts['dependencies:check'].replace(' --ignore-unfixable', ''),
      'The audit gate must check vulnerabilities without writing ignored advisories',
    );
    assert.deepEqual(
      ['tsx', 'vitest', 'yaml'].map((key) => currentPackage.devDependencies[key]),
      ['4.23.15', '4.1.12', '2.8.3'],
    );
    const normalized = structuredClone(currentPackage);
    normalized.engines.node = oldPackage.engines.node;
    normalized.engines.pnpm = oldPackage.engines.pnpm;
    normalized.packageManager = oldPackage.packageManager;
    normalized.scripts['dependencies:check'] = oldPackage.scripts['dependencies:check'];
    for (const key of ['tsx', 'vitest', 'yaml'])
      normalized.devDependencies[key] = oldPackage.devDependencies[key];
    assert.deepEqual(normalized, oldPackage, 'Only the enumerated pins may differ');
    assert.equal(
      readFileSync(join(root, pins[1]), 'utf8')
        .replaceAll('24.22.1', '24.18.0')
        .replaceAll('11.13.1', '11.13.0')
        .replaceAll(
          'pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10',
          'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9',
        ),
      historical.get(pins[1]).toString('utf8'),
      'CI jobs, commands and security settings must remain unchanged',
    );
    for (const file of pins) {
      const current = readFileSync(join(root, file));
      writeFileSync(join(root, file), Buffer.concat([current, Buffer.from('\nDRIFT\n')]));
      assert.throws(() => toolingPolicyHistoricalInputs(root), /Physical preflight source drift/);
      writeFileSync(join(root, file), current);
      assert.deepEqual(toolingPolicyHistoricalInputs(root).get(file), historical.get(file));
    }
    const unbound = 'application.ts';
    writeFileSync(join(root, unbound), 'changed application source');
    assert.equal(toolingPolicyHistoricalInputs(root).has(unbound), false);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(parent) + sep));
    rmSync(root, { recursive: true });
  }
});
