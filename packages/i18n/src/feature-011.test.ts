import assert from 'node:assert/strict';
import test from 'node:test';
import * as feature from './feature-011.ts';
const required = [
  'title',
  'synthetic',
  'loading',
  'empty',
  'permission',
  'stepup',
  'error',
  'unavailable',
  'offline',
  'stale',
  'reconciling',
  'success',
  'future',
  'gated',
  'create',
  'successor',
  'rollback',
  'approve',
  'reject',
  'publish',
  'confirmCreate',
  'confirmSuccessor',
  'confirmRollback',
  'confirmApprove',
  'confirmReject',
  'confirmPublish',
  'cancel',
  'refresh',
  'retry',
  'content',
  'code',
  'testVectors',
  'effectiveAt',
  'eligibilityUnavailable',
  'version',
  'digest',
  'source',
  'capacity',
  'independence',
  'initial',
  'published',
  'draft',
  'effective',
  'superseded',
  'next',
  'reference',
  'time',
  'authority',
  'purpose',
  'projection',
  'governance',
  'assigned_review',
  'releaseId',
  'contentType',
  'key',
  'scope',
  'contentRef',
  'codeRef',
  'testRef',
  'declaredDigest',
  'predecessor',
  'evidence',
  'reason',
  'approved',
  'rejected',
  'physician',
  'pharmacist',
  'workflow',
  'signatureHistory',
  'unknown',
  'locale',
  'load',
  'more',
  'reviewFirst',
  'submission',
  'status',
  'facility',
];
test('K19 complete Arabic-first and English governance copy with identical closed keys', () => {
  const copy = (feature as unknown as { contentCopy: Record<string, Record<string, string>> })
    .contentCopy;
  assert(copy, 'MISSING_F011_GOVERNANCE_COPY');
  assert.deepEqual(Object.keys(copy['ar-EG']).sort(), required.toSorted());
  assert.deepEqual(Object.keys(copy['en-EG']).sort(), required.toSorted());
  for (const locale of ['ar-EG', 'en-EG'])
    for (const key of required) assert(copy[locale][key].trim(), `${locale}/${key}`);
});
test('K19 operation-specific confirmations and retained clinical/design limits are explicit', () => {
  const copy = (feature as unknown as { contentCopy: Record<string, Record<string, string>> })
    .contentCopy;
  assert(copy, 'MISSING_F011_GOVERNANCE_COPY');
  for (const c of Object.values(copy)) {
    assert.equal(
      new Set(
        [
          'confirmCreate',
          'confirmSuccessor',
          'confirmRollback',
          'confirmApprove',
          'confirmReject',
          'confirmPublish',
        ].map((k) => c[k]),
      ).size,
      6,
    );
    assert(c.synthetic.includes('OPEN-CLIN-001'));
    assert(c.synthetic.includes('OPEN-UX-002'));
    assert.notEqual(c.future, c.effective);
    assert.notEqual(c.rejected, c.unavailable);
  }
});
