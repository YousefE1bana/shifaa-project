// Explicit documentation-only successor. Original approvals remain immutable.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const feature = 'specs/011-allergies-clinical-content-governance';
export const documentationSuccessorPath = `${feature}/decisions/documentation-successor-v1.json`;
export const documentationSuccessorSha256 =
  'cc8b2024129325404bf745e55f6ee3183922e9244fe11f7687699e18e2ed9e62';
export const documentationSuccessorInputPaths = [
  documentationSuccessorPath,
  `${feature}/decisions/k24-documentation-maintenance-approved-2026-10-09.md`,
  `${feature}/evidence/fresh-implementation/K24/doc-proposal/manifest.json`,
  'docs/TEAM-INSTALLATION-CHECKLIST.md',
  'docs/governance/SHIFAA-Remaining-Specs-Roadmap.md',
  'docs/traceability/SHIFAA-Traceability-Matrix.md',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readDocumentationSuccessor(root) {
  const read = (p) => readFileSync(join(root, p));
  if (!existsSync(join(root, documentationSuccessorPath))) return null;
  const bytes = read(documentationSuccessorPath);
  assert.equal(sha(bytes), documentationSuccessorSha256, 'Documentation successor binding drift');
  const record = JSON.parse(bytes);
  assert.equal(record.bindingId, 'SHIFAA-F011-DOCUMENTATION-SUCCESSOR@1.0.0');
  assert.equal(record.disposition, 'APPROVED_DOCUMENTATION_MAINTENANCE_ONLY');
  assert.equal(
    sha(read(record.decision.path)),
    record.decision.sha256,
    'Documentation owner decision drift',
  );
  assert.equal(
    sha(read(record.proposal.path)),
    record.proposal.sha256,
    'Documentation proposal drift',
  );
  assert.equal(
    sha(read(`${feature}/decisions/recovered-plan-approval-manifest-v1.json`)),
    record.originalApprovalManifestSha256,
    'Original approval must remain immutable',
  );
  assert.equal(record.inputs.length, 3);
  for (const input of record.inputs)
    assert.equal(
      sha(read(input.path)),
      input.sha256,
      `Approved documentation input drift: ${input.path}`,
    );
  return {
    bindingId: record.bindingId,
    binding: { path: documentationSuccessorPath, sha256: documentationSuccessorSha256 },
    decision: record.decision,
    inputDigests: Object.fromEntries(record.inputs.map((i) => [i.path, i.sha256])),
  };
}
