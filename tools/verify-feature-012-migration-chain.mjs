// Verify the sealed F011 source and the separately bound additive F012 migration.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { f012CiWorkflowSha256 } from './tooling-history.mjs';
import { safeSource } from './verification/sandbox.mjs';

const predecessor = 'fbd2b5312a5038aad21db0001a17dac22bdcbf7e';
const directory = 'supabase/migrations';
export const addition = `${directory}/20261112001200_f012_source_admission.sql`;
const additionSha256 = '96719e8101fc247df4e2b75b7bb46c1f0709f82985208f50286a5176253d89da';
const ciWorkflow = '.github/workflows/ci.yml';
const verifier = 'tools/verify-feature-011-contracts.mjs';
const f011 = 'specs/011-allergies-clinical-content-governance';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

function predecessorBlobs(cwd) {
  const entries = git(cwd, 'ls-tree', '-rz', predecessor).toString('utf8').split('\0');
  return new Map(
    entries.filter(Boolean).flatMap((entry) => {
      const tab = entry.indexOf('\t');
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      return type === 'blob' && (mode === '100644' || mode === '100755')
        ? [[entry.slice(tab + 1), oid]]
        : [];
    }),
  );
}

function assertSealedBytes(cwd, file, blob, gitFormat) {
  assert.ok(blob, `Missing regular F011 predecessor blob: ${file}`);
  const content = bytes(cwd, file);
  const oid = createHash(gitFormat)
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex');
  assert.equal(oid, blob, `F011 input changed: ${file}`);
}

function bytes(cwd, file) {
  return readFileSync(safeSource(cwd, file));
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function assertExactMigrationInventory(actual, sealed) {
  assert.equal(sealed.length, 38, 'Original F011 migration inventory has drifted');
  const expected = [...sealed, addition];
  const versions = expected.map((file) => {
    const format = /^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/;
    const match = format.exec(file);
    assert.ok(match, `Invalid migration path: ${file}`);
    return match[1];
  });
  assert.ok(
    versions.every((version, i) => i === 0 || version > versions[i - 1]),
    'Migration versions must be unique and increasing',
  );
  assert.deepEqual(actual, [...sealed, addition], 'Migration inventory has unexpected changes');
}

export function readCandidateMigration(candidateRoot) {
  const migration = bytes(candidateRoot, addition);
  assert.equal(sha256(migration), additionSha256, 'F012 migration bytes differ from the candidate');
  return migration;
}

export async function verifyExtendedChain(predecessorRoot, candidateRoot = root) {
  const historical = realpathSync(predecessorRoot);
  const candidate = realpathSync(candidateRoot);
  assert.notEqual(historical, candidate, 'Separate predecessor view required');
  assert.equal(git(historical, 'rev-parse', 'HEAD').toString().trim(), predecessor);
  assert.equal(git(historical, 'status', '--porcelain=v1').toString(), '', 'Dirty predecessor');
  git(candidate, 'merge-base', '--is-ancestor', predecessor, 'HEAD');
  const blobs = predecessorBlobs(candidate);
  const gitFormat = git(candidate, 'rev-parse', '--show-object-format').toString().trim();
  const sealedPaths = (dir) =>
    [...blobs.keys()].filter((file) => file.startsWith(dir + '/')).sort();
  const sealed = sealedPaths(directory);
  const list = (cwd) =>
    readdirSync(join(cwd, directory))
      .map((name) => `${directory}/${name}`)
      .sort();
  assert.deepEqual(list(historical), sealed, 'Original migration view changed');
  assertExactMigrationInventory(list(candidate), sealed);
  assertSealedBytes(historical, verifier, blobs.get(verifier), gitFormat);
  const { verifyFeature011Contracts } = await import(
    pathToFileURL(join(historical, verifier)).href
  );
  const original = await verifyFeature011Contracts({ root: historical });
  assert.equal(original.result, 'PASS', original.failures.join('\n'));
  const sealedInputs = new Set([
    ...sealedPaths(f011),
    ...Object.keys(original.inputDigests),
    ...sealed,
    verifier,
    'tools/feature-011-native-supabase-bootstrap.mjs',
  ]);
  // The pinned F011 verifier sees the original workflow. The candidate workflow
  // is bound separately because it orchestrates both the 38- and 39-file views.
  assert(sealedInputs.delete(ciWorkflow), 'Missing historical workflow binding');
  assertSealedBytes(historical, ciWorkflow, blobs.get(ciWorkflow), gitFormat);
  assert.equal(
    sha256(bytes(candidate, ciWorkflow)),
    f012CiWorkflowSha256,
    'The exact additive CI workflow has changed',
  );
  for (const file of sealedInputs) {
    assertSealedBytes(candidate, file, blobs.get(file), gitFormat);
  }
  const extended = sealed.map((file) => ({
    path: file,
    sha256: sha256(bytes(candidate, file)),
  }));
  extended.push({ path: addition, sha256: sha256(readCandidateMigration(candidate)) });
  return {
    historical: {
      result: original.result,
      predecessor,
      preservedInputs: sealedInputs.size,
      migrations: sealed.length,
    },
    extended: {
      result: 'SOURCE_INVENTORY_PASS',
      migrations: extended,
      ciWorkflowSha256: f012CiWorkflowSha256,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Supply the separate clean predecessor worktree path');
  const result = await verifyExtendedChain(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
}
