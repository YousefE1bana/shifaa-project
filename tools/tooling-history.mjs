// One-time policy migration for historical checks, independent of mutable versions.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

const recordPath = 'docs/governance/tooling-maintenance-v1/historical-compatibility.json';
export const appendixSuccessorPath =
  'specs/012-prescription-safety-governed-overrides/readiness/historical-reader-repair-2026-11-12/successor-binding-v1.json';
const appendixSuccessorSha256 = '8b6500c6571bf2c0d75373483452e0942be0c1e1104ca66de05dc35689bfc8b1';
export const toolingPolicyInputPaths = [
  recordPath,
  appendixSuccessorPath,
  'shifaa-prd.md',
  'docs/architecture/SHIFAA-API-Catalog.md',
  'docs/architecture/SHIFAA-Data-RLS.md',
  'docs/design/SHIFAA-UI-Contract.md',
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
// flag and updates the CI bootstrap action. The 2026-11-11 directive additionally
// admits exactly five team/tooling bindings and their focused CI test command.
// No unrelated script or workflow change is admitted by these exact digests.
// Their sealed F011 acceptance view stays historical; current execution and CI
// validate the new runtime separately. Any further byte change fails closed.
const maintenancePins = [
  {
    path: 'package.json',
    currentSha256: '3d79f5c6c5e5f5fde13ec98c63e202b75023c25884106549792edd5606ed1776',
    acceptedMaintenanceSha256: [
      'b922e33712a9b003cb5f46e7661d06db0e6a985d8178ada9c341b878d577c738',
      '4cdf91ba4ca331944fde2610a05d75158351b74e96cac2b41ca47894c56731b7',
    ],
    historicalSha256: '2b15d2515d1fed80b6ea30ed8a19a7aa51d488571fc7a64675cd04812ffe2200',
    gitBlob: 'f205a80ae41b5507afaa1a7868fbbc8e84deb217',
  },
  {
    path: '.github/workflows/ci.yml',
    currentSha256: 'fd78bd9143813c864b990ba6789eb2ae4478b348a7c7c17ba2f9162897b44c05',
    acceptedMaintenanceSha256: ['b31dbe6aeacafddfb4da49ee65d70afd6ad974a6781bff9fca0e5de9b4fd7435'],
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
  const predecessors = approvedAppendixPredecessors(root);
  const historical = new Map(predecessors);
  for (const input of record.inputs) {
    const current = predecessors.get(input.path) ?? readFileSync(safeFile(root, input.path));
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
        assert.ok(
          [binding.currentSha256, ...(binding.acceptedMaintenanceSha256 ?? [])].includes(
            sha(current),
          ),
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

// Validate live bytes on every call, including after an earlier successful read.
// These prefixes feed the existing historical projection; they never activate policy.
function approvedAppendixPredecessors(root) {
  const bindingFile = safeFile(root, appendixSuccessorPath);
  if (!existsSync(bindingFile)) return new Map();
  const bindingBytes = readFileSync(bindingFile);
  assert.equal(sha(bindingBytes), appendixSuccessorSha256, 'Appendix successor binding drift');
  const binding = JSON.parse(bindingBytes);
  assert.equal(binding.bindingId, 'SHIFAA-F012-PLAN-HISTORICAL-READER-SUCCESSOR/1.0.0');
  assert.equal(binding.historicalRecord.path, recordPath);
  assert.equal(binding.historicalRecord.sha256, recordSha256);
  const predecessors = new Map();
  for (const input of binding.inputs) {
    const current = readFileSync(safeFile(root, input.path));
    assert.equal(
      current.length,
      input.successor.bytes,
      `Appendix successor length drift: ${input.path}`,
    );
    assert.equal(
      sha(current),
      input.successor.sha256,
      `Appendix successor digest drift: ${input.path}`,
    );
    assert.equal(input.appendix.offset, input.predecessor.bytes);
    const prefix = current.subarray(0, input.appendix.offset);
    const appendix = current.subarray(input.appendix.offset);
    assert.equal(prefix.length, input.predecessor.bytes);
    assert.equal(sha(prefix), input.predecessor.sha256, 'Appendix predecessor drift');
    assert.equal(appendix.length, input.appendix.bytes);
    assert.equal(sha(appendix), input.appendix.sha256, 'Approved appendix drift');
    assert.match(input.predecessor.gitBlob, /^[a-f0-9]{40}$/);
    const key = `${resolve(root)}:${input.predecessor.gitBlob}`;
    if (!immutableObjects.has(key))
      immutableObjects.set(
        key,
        execFileSync('git', ['cat-file', 'blob', input.predecessor.gitBlob], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 4 * 1024 * 1024,
        }),
      );
    const original = immutableObjects.get(key);
    assert.ok(prefix.equals(original), 'Appendix predecessor Git bytes drift');
    predecessors.set(input.path, prefix);
  }
  return predecessors;
}

export function readToolingPolicyInput(root, file) {
  return toolingPolicyHistoricalInputs(root).get(file) ?? readFileSync(safeFile(root, file));
}
