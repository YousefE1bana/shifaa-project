import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { toolingPolicyHistoricalInputs, toolingPolicyInputPaths } from '../tooling-history.mjs';

const root = resolve(import.meta.dirname, '../..');
test('exact new tooling bytes preserve immutable F011 projections and reject subsequent drift', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shifaa-verification-history-'));
  for (const file of [...toolingPolicyInputPaths, 'package.json', '.github/workflows/ci.yml']) {
    mkdirSync(dirname(join(fixture, file)), { recursive: true });
    copyFileSync(join(root, file), join(fixture, file));
  }
  const gitdir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  // Read-only immutable-object lookup; fixture writes never target that Git dir.
  writeFileSync(join(fixture, '.git'), `gitdir: ${gitdir}\n`);
  const view = toolingPolicyHistoricalInputs(fixture);
  const original = execFileSync(
    'git',
    ['cat-file', 'blob', 'f205a80ae41b5507afaa1a7868fbbc8e84deb217'],
    { cwd: root },
  );
  assert.deepEqual(view.get('package.json'), original);
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    '2b15d2515d1fed80b6ea30ed8a19a7aa51d488571fc7a64675cd04812ffe2200',
  );
  const file = join(fixture, 'package.json');
  const current = readFileSync(file);
  for (const changed of [
    current.subarray(0, -1),
    Buffer.concat([current, Buffer.from('\nDRIFT')]),
    Buffer.from(current.toString().replace('tools/verify.mjs', 'tools/unsafe.mjs')),
  ]) {
    writeFileSync(file, changed);
    assert.throws(() => toolingPolicyHistoricalInputs(fixture), /Physical preflight source drift/);
  }
  writeFileSync(file, current);
  assert.deepEqual(toolingPolicyHistoricalInputs(fixture).get('package.json'), original);
});
