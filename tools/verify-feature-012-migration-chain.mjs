// Review candidate. This read-only command does not replace either F011 CI job.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const predecessor = 'fbd2b5312a5038aad21db0001a17dac22bdcbf7e';
const directory = 'supabase/migrations';
const addition = `${directory}/20261112001200_f012_source_admission.sql`;
const verifier = 'tools/verify-feature-011-contracts.mjs';
const f011 = 'specs/011-allergies-clinical-content-governance';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

function paths(cwd, dir) {
  return git(cwd, 'ls-tree', '-rz', '--name-only', predecessor, '--', dir)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

function bytes(cwd, file) {
  const path = join(cwd, file);
  assert(lstatSync(path).isFile(), `Expected regular proof input: ${file}`);
  return readFileSync(path);
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function assertExactMigrationInventory(actual, sealed) {
  assert.equal(sealed.length, 38, 'Original F011 migration inventory has drifted');
  assert(sealed.at(-1) < addition, 'F012 migration is not additive');
  assert.deepEqual(actual, [...sealed, addition], 'Migration inventory has unexpected changes');
}

export async function verifyExtendedChain(predecessorRoot, candidateRoot = root) {
  const historical = realpathSync(predecessorRoot);
  const candidate = realpathSync(candidateRoot);
  assert.notEqual(historical, candidate, 'Separate predecessor view required');
  assert.equal(git(historical, 'rev-parse', 'HEAD').toString().trim(), predecessor);
  assert.equal(git(historical, 'status', '--porcelain=v1').toString(), '', 'Dirty predecessor');
  git(candidate, 'merge-base', '--is-ancestor', predecessor, 'HEAD');
  const sealed = paths(candidate, directory);
  const list = (cwd) =>
    readdirSync(join(cwd, directory))
      .map((name) => `${directory}/${name}`)
      .sort();
  assert.deepEqual(list(historical), sealed, 'Original migration view changed');
  assertExactMigrationInventory(list(candidate), sealed);
  assert.equal(
    sha256(bytes(historical, verifier)),
    sha256(git(candidate, 'show', `${predecessor}:${verifier}`)),
  );
  const { verifyFeature011Contracts } = await import(
    pathToFileURL(join(historical, verifier)).href
  );
  const original = await verifyFeature011Contracts({ root: historical });
  assert.equal(original.result, 'PASS', original.failures.join('\n'));
  const sealedInputs = new Set([
    ...paths(candidate, f011),
    ...Object.keys(original.inputDigests),
    ...sealed,
    verifier,
    'tools/feature-011-native-supabase-bootstrap.mjs',
  ]);
  for (const file of sealedInputs) {
    assert.equal(
      sha256(bytes(candidate, file)),
      sha256(bytes(historical, file)),
      `F011 input changed: ${file}`,
    );
  }
  const extended = [...sealed, addition].map((file) => ({
    path: file,
    sha256: sha256(bytes(candidate, file)),
  }));
  return {
    historical: {
      result: original.result,
      predecessor,
      preservedInputs: sealedInputs.size,
      migrations: sealed.length,
    },
    extended: { result: 'SOURCE_INVENTORY_PASS', migrations: extended },
    physicalF012: 'SEPARATE_T002_DISPOSABLE_EXECUTION_REQUIRED',
    activation: 'PENDING_OWNER_DECISION',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Supply the separate clean predecessor worktree path');
  const result = await verifyExtendedChain(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
}
