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
  return historical;
}

export function readToolingPolicyInput(root, file) {
  return toolingPolicyHistoricalInputs(root).get(file) ?? readFileSync(safeFile(root, file));
}
