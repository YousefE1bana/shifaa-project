import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalTemplateDigest } from '@shifaa/core/privacy-dsr-notifications';

import { createPrivacyStack, mutationKey } from './privacy-stack-harness';

test('real bilingual template draft requires an independent AAL2 publisher', async () => {
  const stack = await createPrivacyStack();
  try {
    const code = 'DSR_RESTRICTION_FULFILLED';
    const content = '{{request_reference}} {{privacy_requests_path}}';
    const digest = canonicalTemplateDigest({
      templateCode: code,
      channel: 'sms',
      arabicBody: content,
      englishBody: content,
      allowedRecipientTypes: ['patient'],
      allowedFields: { privacy_requests_path: 'string', request_reference: 'string' },
      requiredFields: ['privacy_requests_path', 'request_reference'],
    });
    const draft = await stack.app.inject({
      method: 'POST',
      url: `/v1/admin/notification-templates/${code}/releases`,
      headers: {
        authorization: 'Bearer synthetic-admin:support_admin:50000000-0000-4000-8000-000000000008',
        'x-purpose': 'notification.template.manage',
        'idempotency-key': mutationKey(),
      },
      payload: {
        channel: 'sms',
        arabic_body: content,
        english_body: content,
        allowed_recipient_types: ['patient'],
        allowed_field_schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            privacy_requests_path: { type: 'string' },
            request_reference: { type: 'string' },
          },
          required: ['privacy_requests_path', 'request_reference'],
        },
        content_digest: digest,
      },
    });
    assert.equal(draft.statusCode, 201, draft.body);
    const publish = (person: string, aal: string) =>
      stack.app.inject({
        method: 'POST',
        url: `/v1/admin/notification-templates/releases/${draft.json().id}/publish`,
        headers: {
          authorization: `Bearer synthetic-admin:support_admin:${person}`,
          'x-purpose': 'notification.template.publish',
          'x-aal': aal,
          'if-match': '"1"',
          'idempotency-key': mutationKey(),
        },
        payload: { approval_digest: digest, effective_at: new Date().toISOString() },
      });
    assert.equal((await publish('50000000-0000-4000-8000-000000000008', '2')).statusCode, 403);
    assert.equal((await publish('50000000-0000-4000-8000-000000000009', '1')).statusCode, 403);
    assert.equal((await publish('50000000-0000-4000-8000-000000000009', '2')).statusCode, 200);
  } finally {
    await stack.close();
  }
});
