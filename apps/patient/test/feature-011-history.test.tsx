import assert from 'node:assert/strict';
import test from 'node:test';
import * as state from '@shifaa/api-client/feature-011-allergy-state';
const row = {
  allergyId: crypto.randomUUID(),
  revisionId: crypto.randomUUID(),
  version: 2,
  previousRevisionId: crypto.randomUUID(),
  recorderPersonId: crypto.randomUUID(),
  recordedAt: '2026-10-08T00:00:00Z',
  actionActorPersonId: crypto.randomUUID(),
  actionAt: '2026-10-08T01:00:00Z',
  verification: {
    reason: 'Synthetic reason',
    evidenceRef: crypto.randomUUID(),
    verifierPersonId: crypto.randomUUID(),
  },
  correctsAllergyId: null,
};
for (const status of ['self_reported', 'clinician_confirmed', 'refuted', 'entered_in_error'])
  test(`authorized ${status} history keeps attribution and exact terminal distinction`, () => {
    assert.equal(typeof state.allergyHistoryMetadata, 'function', 'MISSING_HISTORY_METADATA');
    const detail = state.allergyHistoryMetadata({ ...row, status });
    assert.equal(detail.status, status);
    assert.equal(detail.terminal, status === 'entered_in_error');
    assert.equal(detail.previousRevisionId, row.previousRevisionId);
    assert.equal(detail.originalRecorder, row.recorderPersonId);
    assert.equal(detail.actor, row.actionActorPersonId);
    assert.equal(detail.reason, row.verification.reason);
  });
test('corrected assertion stays separate self_reported with original error link', () => {
  assert.equal(typeof state.allergyHistoryMetadata, 'function', 'MISSING_HISTORY_METADATA');
  const corrected = {
    ...row,
    version: 1,
    status: 'self_reported',
    previousRevisionId: null,
    verification: null,
    correctsAllergyId: crypto.randomUUID(),
  };
  const detail = state.allergyHistoryMetadata(corrected);
  assert.equal(detail.correctsAllergyId, corrected.correctsAllergyId);
  assert.equal(detail.status, 'self_reported');
  assert.equal(detail.reason, null);
  assert.equal(detail.terminal, false);
});
