import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verificationHistoricalInputs, verificationPackageProjection } from './tooling-history.mjs';

const root = path.resolve(import.meta.dirname, '..');
const recordPath = 'docs/governance/safe-verification-v1/historical-inputs.json';
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shifaa-history-negative-'));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const record = JSON.parse(fs.readFileSync(path.join(root, recordPath)));
  for (const relative of [recordPath, ...record.currentInputs.map((input) => input.path)]) {
    fs.mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
    fs.copyFileSync(path.join(root, relative), path.join(directory, relative));
  }
  execFileSync('git', ['init', '-q'], { cwd: directory });
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  fs.writeFileSync(
    path.join(directory, '.git/objects/info/alternates'),
    path.resolve(root, common, 'objects').replaceAll('\\', '/') + '\n',
  );
  return { directory, record };
}

test('exact operational sources independently validate while original P4/P5 inputs remain historical', (t) => {
  const { directory, record } = fixture(t);
  const projected = verificationHistoricalInputs(directory);
  assert.equal(projected.size, record.inputs.length);
  for (const input of record.inputs) {
    const original = execFileSync('git', ['cat-file', 'blob', input.historical.gitBlob], {
      cwd: root,
    });
    assert.deepEqual(projected.get(input.path), original);
  }
  assert.equal(projected.has('docs/architecture/SHIFAA-Data-RLS.md'), false);
  assert.equal(
    projected.has('supabase/migrations/202609050001_f001_identity_onboarding.sql'),
    false,
  );
  assert.deepEqual(
    verificationPackageProjection(
      fs.readFileSync(path.join(directory, 'package.json')),
      projected.get('package.json'),
      directory,
    ),
    projected.get('package.json'),
  );
});

for (const relative of [
  'package.json',
  'tools/verification-database.mjs',
  'tools/run-feature-011-postgres-test.mjs',
  recordPath,
]) {
  test(`unapproved operational edit fails closed: ${relative}`, (t) => {
    const { directory } = fixture(t);
    fs.appendFileSync(path.join(directory, relative), '\n');
    assert.throws(() => verificationHistoricalInputs(directory), /drift/);
  });
}

test('missing binding cannot authorize changed package bytes', (t) => {
  const { directory } = fixture(t);
  fs.unlinkSync(path.join(directory, recordPath));
  assert.equal(verificationHistoricalInputs(directory).size, 0);
  assert.throws(
    () =>
      verificationPackageProjection(
        fs.readFileSync(path.join(directory, 'package.json')),
        Buffer.from('unapproved'),
        directory,
      ),
    /binding required/,
  );
});
