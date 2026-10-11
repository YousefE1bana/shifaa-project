import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFileSync, copyFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import {
  currentEvidenceRoot,
  nativeDigestAuthorizationPath,
  nativeDigestRecordPath,
  documentationRenewalAuthorizationPath,
  prReviewEvidenceRoot,
} from './verify-feature-011-contracts.mjs';
import { documentationSuccessorInputPaths } from './feature-011-documentation-successor.mjs';
const feature = 'specs/011-allergies-clinical-content-governance';
test('current native SHA repair selects renewed proof boundary with no stale P5 fallback', () =>
  assert.equal(currentEvidenceRoot(), prReviewEvidenceRoot));
for (const target of [nativeDigestAuthorizationPath, nativeDigestRecordPath])
  test('unapproved native receipt binding drift is denied: ' + target, () => {
    const parent = resolve('artifacts/feature-011/k24/binding-fixtures');
    mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(join(parent, 'f011-native-binding-'));
    try {
      for (const p of [
        ...documentationSuccessorInputPaths,
        documentationRenewalAuthorizationPath,
        nativeDigestAuthorizationPath,
        nativeDigestRecordPath,
        feature + '/decisions/recovered-plan-approval-manifest-v1.json',
      ]) {
        mkdirSync(dirname(join(root, p)), { recursive: true });
        copyFileSync(p, join(root, p));
      }
      appendFileSync(join(root, target), '\nUNAPPROVED DRIFT\n');
      assert.throws(() => currentEvidenceRoot(root), /remediation authorization drift/);
    } finally {
      assert.ok(resolve(root).startsWith(parent + sep));
      rmSync(root, { recursive: true });
    }
  });
