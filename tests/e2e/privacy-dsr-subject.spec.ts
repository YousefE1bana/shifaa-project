import assert from 'node:assert/strict';
import test from 'node:test';

import { createPrivacyStack } from './privacy-stack-harness';

test('real subject and guardian DSR intake enforces identity and unauthorized boundaries', async () => {
  const stack = await createPrivacyStack();
  try {
    for (const type of [
      'access_export',
      'correction',
      'restriction',
      'erasure_pseudonymization',
    ] as const) {
      const created = await stack.create(type);
      assert.equal(created.statusCode, 201, created.body);
      assert.equal(created.json().status, 'submitted');
      assert.equal(
        Date.parse(created.json().due_at) - Date.parse(created.json().submitted_at),
        17 * 86_400_000,
      );
    }
    const guardian = await stack.create('correction', ['profile.demographics'], stack.ids.guardian);
    assert.equal(guardian.statusCode, 201, guardian.body);
    const identity = await stack.create('correction', ['identity.proof']);
    assert.equal(identity.statusCode, 201, identity.body);
    assert.equal(identity.json().status, 'identity_verification_required');
    for (const token of [
      'synthetic-person:50000000-0000-4000-8000-000000000003',
      'synthetic-person:50000000-0000-4000-8000-000000000004',
      'synthetic-person:50000000-0000-4000-8000-000000000005',
      'synthetic-admin:support_admin:50000000-0000-4000-8000-000000000008',
    ]) {
      const denied = await stack.app.inject({
        method: 'GET',
        url: '/v1/privacy/requests',
        headers: {
          authorization: `Bearer ${token}`,
          'x-shifaa-patient-context': stack.ids.subject,
        },
      });
      assert.equal(denied.statusCode, 403);
    }
  } finally {
    await stack.close();
  }
});
