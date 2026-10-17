// Verification-only historical projection; no runtime, clinical or lifecycle authority.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readToolingPolicyInput } from './tooling-history.mjs';

const feature = 'specs/012-prescription-safety-governed-overrides';
export const twoInputBindingPath = `${feature}/decisions/f011-two-input-successor-v1.json`;
const bindingSha256 = '7fe1b9ccd5e6f35ec164eae0b2f47f9b661c545799a8f6fa5078ce96769317aa';
const inventoryPath = `${feature}/contract-amendment/publication-inventory.json`;
const inventorySha256 = '61322ad7a3abdfc4a27a43eaf17998f869218db7870d49846ff4f07e95205228';
export const twoInputSuccessorInputPaths = [
  twoInputBindingPath,
  'tools/feature-011-two-input-successor.mjs',
  'docs/architecture/SHIFAA-API-Catalog.md',
  'docs/architecture/SHIFAA-Data-RLS.md',
  'docs/architecture/SHIFAA-Architecture.md',
  'specs/012-prescription-safety-governed-overrides/contract-amendment/ui-contract-successor-v0.1.0.md',
  'shifaa-prd.md',
  'SHIFAA-Implementation-Plan-MASTER.md',
  'docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md',
  'docs/architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md',
  'specs/012-prescription-safety-governed-overrides/contract-amendment/traceability-successor-v0.1.0.md',
  'docs/governance/SHIFAA-Completion-Coverage.md',
  'docs/traceability/SHIFAA-F012-Graduation-Evidence-Overlay.md',
  'specs/012-prescription-safety-governed-overrides/readiness/reviewer-journey-boundary-decision-proposal-2026-10-16.md',
  'specs/012-prescription-safety-governed-overrides/decisions/reviewer-boundary-approval-2026-10-16.md',
  'specs/012-prescription-safety-governed-overrides/contract-amendment/reviewer-contract-v0.1.0.md',
  'specs/012-prescription-safety-governed-overrides/contract-amendment/scope-successor.json',
  'specs/012-prescription-safety-governed-overrides/contract-amendment/documentary-validation.json',
  'specs/012-prescription-safety-governed-overrides/contract-amendment/publication-inventory.json',
];
const historicalDigests = {
  'docs/architecture/SHIFAA-API-Catalog.md':
    'ba6dd9177ee07410ebde92140ea086b06a86750e146a267625bbff498e832490',
  'docs/architecture/SHIFAA-Data-RLS.md':
    '0df367f69aa016bcfd2d345b727d7dcc3539e4fdbb7b69f44dc0d171a950de2b',
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const immutableBlobs = new Map();

function historicalBytes(root, descriptor) {
  const key = `${descriptor.blob}:${descriptor.sha256}:${descriptor.bytes}`;
  if (!immutableBlobs.has(key)) {
    const bytes = execFileSync('git', ['cat-file', 'blob', descriptor.blob], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(bytes.length, descriptor.bytes);
    assert.equal(sha(bytes), descriptor.sha256, 'Historical input drift');
    immutableBlobs.set(key, bytes);
  }
  // Only immutable Git objects are cached. Live files/approvals are always rechecked.
  return Buffer.from(immutableBlobs.get(key));
}

function verifiedBytes(root, descriptor) {
  const bytes = readToolingPolicyInput(root, descriptor.path);
  assert.equal(bytes.length, descriptor.bytes, `Successor byte length drift: ${descriptor.path}`);
  assert.equal(sha(bytes), descriptor.sha256, `Successor digest drift: ${descriptor.path}`);
  return bytes;
}

export function readTwoInputDocumentationSuccessor(root) {
  const historical = new Map();
  if (!existsSync(join(root, twoInputBindingPath))) {
    // No binding grants no exception. Original bytes may still verify normally.
    for (const [file, digest] of Object.entries(historicalDigests)) {
      if (existsSync(join(root, file)))
        assert.equal(sha(readFileSync(join(root, file))), digest, 'Missing two-input approval');
    }
    return historical;
  }
  const bytes = readFileSync(join(root, twoInputBindingPath));
  assert.equal(sha(bytes), bindingSha256, 'Two-input approval binding drift');
  const record = JSON.parse(bytes);
  assert.equal(record.bindingId, 'SHIFAA-F011-TWO-INPUT-SUCCESSOR@1.0.0');
  assert.equal(record.disposition, 'AUTHORIZED_VERIFICATION_COMPATIBILITY_ONLY');
  assert.equal(record.clinicalAuthority, false);
  assert.equal(record.lifecycleAuthorization, false);
  assert.equal(record.contractActivation, false);
  verifiedBytes(root, record.readerSuccessor);
  const inventoryBytes = readFileSync(join(root, inventoryPath));
  assert.equal(sha(inventoryBytes), inventorySha256, 'Approved F012 inventory drift');
  const inventory = JSON.parse(inventoryBytes);
  assert.equal(inventory.pathCount, 17);
  assert.equal(inventory.entries.length, 16);
  assert.equal(new Set(inventory.allowlist).size, 17);
  assert.deepEqual(
    [...inventory.allowlist].sort(),
    [...inventory.entries.map((entry) => entry.path), inventoryPath].sort(),
  );
  for (const entry of inventory.entries) verifiedBytes(root, entry);
  assert.deepEqual(
    record.inputs.map((input) => input.path).sort(),
    Object.keys(historicalDigests).sort(),
  );
  for (const input of record.inputs) {
    assert.equal(input.historical.sha256, historicalDigests[input.path]);
    assert.match(input.historical.blob, /^[a-f0-9]{40}$/);
    const original = historicalBytes(root, input.historical);
    const current = verifiedBytes(root, input);
    assert.ok(current.subarray(0, original.length).equals(original), 'Historical prefix changed');
    const appendix = current.subarray(original.length);
    assert.equal(appendix.length, input.appendix.bytes);
    assert.equal(sha(appendix), input.appendix.sha256, 'Approved appendix drift');
    historical.set(input.path, original);
  }
  return historical;
}
