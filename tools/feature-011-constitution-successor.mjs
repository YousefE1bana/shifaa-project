// Shared by the existing documentation-successor boundary. No runtime authority.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const feature = 'specs/012-prescription-safety-governed-overrides';
const constitution = '.specify/memory/constitution.md';
const originalSha256 = '25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a';
const bindingPath = `${feature}/decisions/f011-constitution-successor-v1.json`;
const bindingSha256 = '2d5d6ce7b833c0e388f94bc52b910aa677065fc5d45042dff41859f7efa8e1a7';
const approvalPath = `${feature}/decisions/graduation-governance-approval.md`;
const manifestPath = `${feature}/readiness/real-medicine-research/source-manifest.json`;
const originalManifest =
  'specs/011-allergies-clinical-content-governance/decisions/recovered-plan-approval-manifest-v1.json';
const compatibleTools = [
  'tools/feature-011-documentation-successor.mjs',
  'tools/generate-feature-011-contract.mjs',
  'tools/verify-feature-011-contracts.mjs',
];
export const constitutionSuccessorInputPaths = [
  bindingPath,
  approvalPath,
  manifestPath,
  'tools/feature-011-constitution-successor.mjs',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const immutableBlobs = new Map();

function verifiedBinding(root) {
  const read = (file) => readFileSync(join(root, file));
  const current = read(constitution);
  if (sha(current) === originalSha256 && !existsSync(join(root, bindingPath))) return null;
  const bytes = read(bindingPath);
  assert.equal(sha(bytes), bindingSha256, 'Constitution successor binding drift');
  const record = JSON.parse(bytes);
  assert.equal(record.bindingId, 'SHIFAA-F011-CONSTITUTION-SUCCESSOR@1.0.0');
  assert.equal(record.publicationState, 'APPROVED_FOR_CONDITIONAL_ACTIVATION');
  assert.equal(record.effective, false, 'PR A must not activate the successor');
  assert.equal(record.historicalConstitution.path, constitution);
  assert.equal(record.historicalConstitution.sha256, originalSha256);
  assert.equal(record.successor.path, constitution);
  assert.equal(sha(current), record.successor.sha256, 'Conditional Constitution successor drift');
  assert.equal(current.length, record.successor.bytes);
  const text = current.toString('utf8');
  assert.ok(text.includes('APPROVED_FOR_CONDITIONAL_ACTIVATION'));
  assert.ok(text.includes('prospective release candidate; not ratified'));
  assert.equal(record.approval.path, approvalPath);
  assert.equal(sha(read(approvalPath)), record.approval.sha256, 'Successor owner approval drift');
  assert.equal(read(approvalPath).length, record.approval.bytes);
  assert.ok(
    read(approvalPath).toString('utf8').includes('EXACT_CONTENT_APPROVAL_RECORDED'),
    'Exact-content approval required',
  );
  assert.equal(record.releaseManifest.path, manifestPath);
  assert.equal(sha(read(manifestPath)), record.releaseManifest.sha256, 'Release binding drift');
  assert.equal(read(manifestPath).length, record.releaseManifest.bytes);
  assert.equal(
    sha(read(originalManifest)),
    '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548',
    'Original F011 approval must remain immutable',
  );
  assert.deepEqual(record.verificationTools.map((tool) => tool.path).sort(), compatibleTools);
  for (const tool of record.verificationTools) {
    assert.equal(sha(read(tool.path)), tool.currentSha256, `Successor tooling drift: ${tool.path}`);
    assert.equal(read(tool.path).length, tool.currentBytes);
  }
  return record;
}

export function readConstitutionSuccessor(root) {
  const record = verifiedBinding(root);
  if (!record) return null;
  return {
    bindingId: record.bindingId,
    constitutionSha256: record.successor.sha256,
    historicalConstitutionSha256: originalSha256,
    publicationState: record.publicationState,
    effective: false,
    clinicalAuthority: false,
    activation: 'SEPARATELY_AUTHORIZED_PR_B_REQUIRED',
  };
}

function historicalBlob(root, descriptor) {
  // Immutable object caching does not cache live file/approval validation.
  const key = `${descriptor.blob}:${descriptor.sha256}`;
  if (!immutableBlobs.has(key)) {
    assert.match(descriptor.blob, /^[a-f0-9]{40}$/);
    const bytes = execFileSync('git', ['cat-file', 'blob', descriptor.blob], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(sha(bytes), descriptor.sha256, `Historical bytes drift: ${descriptor.path}`);
    assert.equal(bytes.length, descriptor.bytes);
    immutableBlobs.set(key, bytes);
  }
  return Buffer.from(immutableBlobs.get(key));
}

export function readHistoricalVerificationInputs(root) {
  const record = verifiedBinding(root);
  const historical = new Map();
  if (record) {
    // Only the Constitution and these three exact verification-tool successors
    // are projected onto historical F011 evidence. All other inputs stay live.
    for (const descriptor of [record.historicalConstitution, ...record.verificationTools]) {
      historical.set(descriptor.path, historicalBlob(root, descriptor));
    }
  }
  return (file) => historical.get(file) ?? readFileSync(join(root, file));
}
