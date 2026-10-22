// One-time policy migration for historical checks, independent of mutable versions.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

const recordPath = 'docs/governance/tooling-maintenance-v1/historical-compatibility.json';
export const toolingPolicyInputPaths = [
  recordPath,
  '.specify/memory/constitution.md',
  'SHIFAA-Implementation-Plan-MASTER.md',
  'tools/feature-011-constitution-successor.mjs',
  'tools/feature-011-two-input-successor.mjs',
];
const recordSha256 = 'e38049b11787c49e01d0c6cfe0ef3cb3f825fc68f207be5bb224eebc4567fb07';
const sha = (raw) => createHash('sha256').update(raw).digest('hex');
const immutableObjects = new Map();
// Product Owner's verification repair, 2026-10-21: route the physical
// preflight through the already approved historical reader. Preserve frozen
// acceptance digests while admitting only these exact corrected source bytes.
const physicalPreflightRepair = {
  path: 'tools/run-feature-011-postgres-test.mjs',
  currentSha256: 'f7fe95c1d5039b222f7bf08266173638109bba63c204956471aa5de05992f2b5',
  historicalSha256: '23aebfab979d8fa4ca131b5a983d929463f95a9ac4bfa19fe39584e0fee9d54b',
  gitBlob: '8ba2568f4108ca5e09b2e6baa4f32efc54b8d649',
};
// Maintenance changes runtime/security pins and removes the audit ignore-writer
// flag; no unrelated script or workflow change is admitted by these exact digests.
// Their sealed F011 acceptance view stays historical; current execution and CI
// validate the new runtime separately. Any further byte change fails closed.
const maintenancePins = [
  {
    path: 'package.json',
    currentSha256: 'b922e33712a9b003cb5f46e7661d06db0e6a985d8178ada9c341b878d577c738',
    historicalSha256: '2b15d2515d1fed80b6ea30ed8a19a7aa51d488571fc7a64675cd04812ffe2200',
    gitBlob: 'f205a80ae41b5507afaa1a7868fbbc8e84deb217',
  },
  {
    path: '.github/workflows/ci.yml',
    currentSha256: '79e16ac1adc71fc20b9cb80d16e0c3ba2e1f133c1350d2728d476aee9f82529c',
    historicalSha256: 'd070253268ca8db1e28054b8a68e2b596b5c19a115a70900fbad456f24b407d2',
    gitBlob: '66199253e1d8c9d03034abc7f9eb6f4b1b596d64',
  },
];

function safeFile(root, relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(!isAbsolute(relative) && !/[\\:]/.test(relative));
  assert.ok(relative.split('/').every((part) => part && part !== '.' && part !== '..'));
  const absoluteRoot = resolve(root);
  let parent = absoluteRoot;
  for (;;) {
    assert.ok(!lstatSync(parent).isSymbolicLink(), 'Linked tooling root');
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  let current = absoluteRoot;
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (existsSync(current))
      assert.ok(!lstatSync(current).isSymbolicLink(), 'Linked policy evidence');
  }
  assert.ok(current.startsWith(absoluteRoot + sep));
  return current;
}

export function toolingPolicyHistoricalInputs(root) {
  const file = safeFile(root, recordPath);
  if (!existsSync(file)) return new Map();
  const raw = readFileSync(file);
  assert.equal(sha(raw), recordSha256, 'Tooling policy history binding drift');
  const record = JSON.parse(raw);
  const historical = new Map();
  for (const input of record.inputs) {
    const current = readFileSync(safeFile(root, input.path));
    assert.equal(current.length, input.current.bytes, `Tooling policy source drift: ${input.path}`);
    assert.equal(sha(current), input.current.sha256, `Tooling policy source drift: ${input.path}`);
    const old = input.historical;
    assert.match(old.gitBlob, /^[a-f0-9]{40}$/);
    const key = `${resolve(root)}:${old.gitBlob}`;
    if (!immutableObjects.has(key))
      immutableObjects.set(
        key,
        execFileSync('git', ['cat-file', 'blob', old.gitBlob], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 4 * 1024 * 1024,
        }),
      );
    // Only immutable Git objects are cached; live inputs and the record are rechecked.
    const bytes = immutableObjects.get(key);
    assert.equal(bytes.length, old.bytes);
    assert.equal(sha(bytes), old.sha256, 'Historical tooling policy bytes drift');
    historical.set(input.path, bytes);
  }
  for (const binding of [physicalPreflightRepair, ...maintenancePins]) {
    const repairedPath = safeFile(root, binding.path);
    if (existsSync(repairedPath)) {
      const current = readFileSync(repairedPath);
      if (sha(current) !== binding.historicalSha256) {
        assert.equal(
          sha(current),
          binding.currentSha256,
          `Physical preflight source drift: ${binding.path}`,
        );
        const key = `${resolve(root)}:${binding.gitBlob}`;
        if (!immutableObjects.has(key))
          immutableObjects.set(
            key,
            execFileSync('git', ['cat-file', 'blob', binding.gitBlob], {
              cwd: root,
              stdio: ['ignore', 'pipe', 'pipe'],
              maxBuffer: 4 * 1024 * 1024,
            }),
          );
        const original = immutableObjects.get(key);
        assert.equal(sha(original), binding.historicalSha256);
        historical.set(binding.path, original);
      }
    }
  }
  return historical;
}

export function readToolingPolicyInput(root, file) {
  return toolingPolicyHistoricalInputs(root).get(file) ?? readFileSync(safeFile(root, file));
}
