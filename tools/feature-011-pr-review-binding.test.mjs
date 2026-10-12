import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFileSync, copyFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import {
  currentEvidenceRoot,
  prReviewAuthorizationPath,
  prReviewRecordPath,
  prReviewEvidenceRoot,
} from './verify-feature-011-contracts.mjs';

for (const target of [prReviewAuthorizationPath, prReviewRecordPath]) {
  test(
    'PR remediation refuses altered authorization without historical proof fallback: ' + target,
    () => {
      const parent = resolve('artifacts/feature-011/pr-remediation/binding-fixtures');
      mkdirSync(parent, { recursive: true });
      const root = mkdtempSync(join(parent, 'fixture-'));
      try {
        for (const file of [prReviewAuthorizationPath, prReviewRecordPath]) {
          mkdirSync(dirname(join(root, file)), { recursive: true });
          copyFileSync(file, join(root, file));
        }
        assert.equal(currentEvidenceRoot(root), prReviewEvidenceRoot);
        appendFileSync(join(root, target), '\nUNAPPROVED DRIFT\n');
        assert.throws(() => currentEvidenceRoot(root), /PR review remediation authorization drift/);
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  );
}
