import assert from 'node:assert/strict';
import test from 'node:test';

import { createPrivacyStack, dpoHeaders, mutationKey } from './privacy-stack-harness';

test('real assigned DPO decisions and fulfilment are reasoned, versioned, and minimum', async () => {
  const stack = await createPrivacyStack();
  try {
    for (const decision of ['approve', 'partially_approve', 'refuse'] as const) {
      const created = await stack.create('restriction');
      assert.equal(created.statusCode, 201, created.body);
      const evidence = await stack.assign(created.json().id);
      const decided = await stack.app.inject({
        method: 'POST',
        url: `/v1/admin/privacy/requests/${created.json().id}/decision`,
        headers: { ...dpoHeaders(), 'if-match': '"2"', 'idempotency-key': mutationKey() },
        payload: {
          decision,
          reason_code: 'request.reviewed',
          reason_summary: 'Synthetic evidence reviewed',
          evidence_object_id: evidence.decisionEvidence,
          ...(decision === 'partially_approve'
            ? {
                included_scope: { data_category_codes: ['profile.demographics'] },
                excluded_scope: { data_category_codes: ['clinical.restricted'] },
              }
            : {}),
        },
      });
      assert.equal(decided.statusCode, 200, decided.body);
      assert.equal(decided.json().version, 3);
      if (decision === 'approve') {
        const fulfilled = await stack.app.inject({
          method: 'POST',
          url: `/v1/admin/privacy/requests/${created.json().id}/fulfilment`,
          headers: { ...dpoHeaders(), 'if-match': '"3"', 'idempotency-key': mutationKey() },
          payload: {
            action_codes: ['restriction.applied'],
            action_summary: 'Synthetic restriction applied',
            evidence_object_id: evidence.fulfilmentEvidence,
            subject_notice_code: 'DSR_RESTRICTION_FULFILLED',
          },
        });
        assert.equal(fulfilled.statusCode, 200, fulfilled.body);
      }
    }
    const worklist = await stack.app.inject({
      method: 'GET',
      url: '/v1/admin/privacy/requests',
      headers: dpoHeaders(),
    });
    assert.equal(worklist.statusCode, 200, worklist.body);
    assert.doesNotMatch(worklist.body, /person_id|phone|national_id|object_key/i);
    for (const headers of [
      { ...dpoHeaders(), 'x-aal': '1' },
      { ...dpoHeaders(), 'x-purpose': 'wrong.purpose' },
      {
        ...dpoHeaders(),
        authorization: 'Bearer synthetic-dpo:50000000-0000-4000-8000-000000000007',
      },
    ])
      assert.equal(
        (await stack.app.inject({ method: 'GET', url: '/v1/admin/privacy/requests', headers }))
          .statusCode,
        403,
      );
  } finally {
    await stack.close();
  }
});
