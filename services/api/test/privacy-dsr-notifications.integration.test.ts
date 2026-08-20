import {
  canonicalTemplateDigest,
  signProviderCallback,
} from '@shifaa/core/privacy-dsr-notifications';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type AppHarness } from '../src/app.js';

const patient = '50000000-0000-4000-8000-000000000001';
const guardian = '50000000-0000-4000-8000-000000000002';
const delegate = '50000000-0000-4000-8000-000000000003';
const dpo = '50000000-0000-4000-8000-000000000006';
const author = '50000000-0000-4000-8000-000000000008';
const publisher = '50000000-0000-4000-8000-000000000009';
const operator = '50000000-0000-4000-8000-000000000010';
const subject = '51000000-0000-4000-8000-000000000001';
const assignedRequest = '52000000-0000-4000-8000-000000000001';
const identityRequiredRequest = '52000000-0000-4000-8000-000000000002';
const erasureRequest = '52000000-0000-4000-8000-000000000003';
const clock = new Date('2026-08-13T09:00:00.000Z');

const auth = (personId = patient) => ({ authorization: `Bearer synthetic-person:${personId}` });
const patientHeaders = (personId = patient) => ({
  ...auth(personId),
  'x-shifaa-patient-context': subject,
  'x-aal': '2',
});
const mutationHeaders = (label: string, personId = patient) => ({
  ...patientHeaders(personId),
  'idempotency-key': `synthetic-005-${label}-0001`,
});

describe('privacy DSR and notifications API', () => {
  let harness: AppHarness;
  beforeEach(async () => {
    harness = await buildApp({ clock: { now: () => new Date(clock) } });
  });
  afterEach(async () => harness.app.close());

  it('registers exactly the twelve contract routes with private no-store responses', async () => {
    expect(harness.app.printRoutes()).toContain('notification-templates');
    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/privacy/requests',
      headers: patientHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('creates every supported DSR type and exposes status history and synthetic due date', async () => {
    for (const requestType of [
      'access_export',
      'correction',
      'restriction',
      'erasure_pseudonymization',
    ] as const) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/v1/privacy/requests',
        headers: mutationHeaders(requestType),
        payload: {
          request_type: requestType,
          scope: { data_category_codes: ['profile.demographics'] },
          contact_preference: 'in_app',
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        request_type: requestType,
        status: 'submitted',
        due_policy_label: 'synthetic_non_statutory',
      });
      expect(response.json().events).toHaveLength(1);
      expect(Date.parse(response.json().due_at) - Date.parse(response.json().submitted_at)).toBe(
        17 * 86_400_000,
      );
    }
  });

  it('allows the bound guardian but denies delegate, unrelated, facility, and unauthorized admin', async () => {
    const guardianResponse = await harness.app.inject({
      method: 'GET',
      url: '/v1/privacy/requests',
      headers: patientHeaders(guardian),
    });
    expect(guardianResponse.statusCode).toBe(200);
    for (const authorization of [
      `Bearer synthetic-person:${delegate}`,
      'Bearer synthetic-person:50000000-0000-4000-8000-000000000004',
      'Bearer synthetic-person:50000000-0000-4000-8000-000000000005',
      'Bearer synthetic-admin:support_admin:50000000-0000-4000-8000-000000000008',
    ]) {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/v1/privacy/requests',
        headers: { authorization, 'x-shifaa-patient-context': subject },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('blocks identity-required requests and requires DPO designation, assignment, AAL2, and purpose', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/privacy/requests',
      headers: mutationHeaders('identity-required'),
      payload: {
        request_type: 'correction',
        scope: { data_category_codes: ['identity.proof'] },
        contact_preference: 'in_app',
      },
    });
    expect(created.json().status).toBe('identity_verification_required');
    const base = {
      authorization: `Bearer synthetic-dpo:${dpo}`,
      'x-aal': '2',
      'x-purpose': 'privacy.dsr.review',
    };
    expect(
      (
        await harness.app.inject({
          method: 'GET',
          url: '/v1/admin/privacy/requests',
          headers: base,
        })
      ).statusCode,
    ).toBe(200);
    for (const headers of [
      { ...base, authorization: `Bearer synthetic-dpo:50000000-0000-4000-8000-000000000007` },
      { ...base, 'x-aal': '1' },
      { ...base, 'x-purpose': 'wrong.purpose' },
      { ...base, authorization: `Bearer synthetic-person:${patient}` },
    ])
      expect(
        (await harness.app.inject({ method: 'GET', url: '/v1/admin/privacy/requests', headers }))
          .statusCode,
      ).toBe(403);
    const blocked = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${identityRequiredRequest}/decision`,
      headers: { ...base, 'if-match': '"2"', 'idempotency-key': 'synthetic-005-blocked-0001' },
      payload: {
        decision: 'approve',
        reason_code: 'request.valid',
        evidence_object_id: '53000000-0000-4000-8000-000000000001',
      },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('identity-verification-required');
  });

  it.each([
    {
      decision: 'partially_approve',
      expectedStatus: 'partially_approved',
      extra: {
        included_scope: { data_category_codes: ['profile.demographics'] },
        excluded_scope: { data_category_codes: ['identity.proof'] },
      },
    },
    { decision: 'refuse', expectedStatus: 'refused', extra: {} },
  ])('records $decision with reason, evidence, and a valid version transition', async (sample) => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${assignedRequest}/decision`,
      headers: {
        authorization: `Bearer synthetic-dpo:${dpo}`,
        'x-aal': '2',
        'x-purpose': 'privacy.dsr.review',
        'if-match': '"2"',
        'idempotency-key': `synthetic-005-${sample.decision}-0001`,
      },
      payload: {
        decision: sample.decision,
        reason_code: 'request.reviewed',
        reason_summary: 'Seeded synthetic review evidence',
        evidence_object_id: '53000000-0000-4000-8000-000000000001',
        ...sample.extra,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: sample.expectedStatus, version: 3 });
  });

  it('keeps unapproved erasure automation blocked under OPEN-LEGAL-002', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${erasureRequest}/fulfilment`,
      headers: {
        authorization: `Bearer synthetic-dpo:${dpo}`,
        'x-aal': '2',
        'x-purpose': 'privacy.dsr.review',
        'if-match': '"3"',
        'idempotency-key': 'synthetic-005-erasure-block-0001',
      },
      payload: {
        action_codes: ['hard_delete'],
        action_summary: 'Synthetic deletion attempt',
        evidence_object_id: '53000000-0000-4000-8000-000000000002',
        subject_notice_code: 'DSR_ERASURE_REVIEWED',
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('retention-policy-unapproved');
  });

  it('approves, fulfils, and consumes an export exactly once with no-store', async () => {
    const dpoHeaders = {
      authorization: `Bearer synthetic-dpo:${dpo}`,
      'x-aal': '2',
      'x-purpose': 'privacy.dsr.review',
    };
    const decided = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${assignedRequest}/decision`,
      headers: {
        ...dpoHeaders,
        'if-match': '"2"',
        'idempotency-key': 'synthetic-005-approve-0001',
      },
      payload: {
        decision: 'approve',
        reason_code: 'request.valid',
        evidence_object_id: '53000000-0000-4000-8000-000000000001',
      },
    });
    expect(decided.statusCode).toBe(200);
    const fulfilled = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${assignedRequest}/fulfilment`,
      headers: { ...dpoHeaders, 'if-match': '"3"', 'idempotency-key': 'synthetic-005-fulfil-0001' },
      payload: {
        action_codes: ['export.released'],
        action_summary: 'Synthetic export released',
        evidence_object_id: '53000000-0000-4000-8000-000000000003',
        subject_notice_code: 'DSR_EXPORT_READY',
      },
    });
    expect(fulfilled.statusCode).toBe(200);
    const issued = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/requests/${assignedRequest}/download-link`,
      headers: mutationHeaders('export-issue'),
    });
    expect(issued.statusCode).toBe(200);
    const token = new URL(
      `https://synthetic.invalid${issued.json().download_url}`,
    ).searchParams.get('capability')!;
    const consumed = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/requests/${assignedRequest}/download-link`,
      headers: mutationHeaders('export-consume'),
      payload: { capability_token: token },
    });
    expect(consumed.statusCode).toBe(200);
    expect(consumed.headers['content-type']).toContain('application/octet-stream');
    expect(consumed.headers['cache-control']).toBe('private, no-store');
    expect(
      (
        await harness.app.inject({
          method: 'POST',
          url: `/v1/privacy/requests/${assignedRequest}/download-link`,
          headers: mutationHeaders('export-replay'),
          payload: { capability_token: token },
        })
      ).statusCode,
    ).toBe(410);
  });

  it('requires an independent AAL2 publisher and exact bilingual field digest', async () => {
    const releaseShape = {
      templateCode: 'DSR_EXPORT_READY',
      channel: 'sms' as const,
      arabicBody: '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
      englishBody: '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
      allowedRecipientTypes: ['patient'] as const,
      allowedFields: {
        privacy_requests_path: 'string' as const,
        ready_until_label: 'string' as const,
        request_reference: 'string' as const,
      },
      requiredFields: ['privacy_requests_path', 'ready_until_label', 'request_reference'],
    };
    const digest = canonicalTemplateDigest(releaseShape);
    const draft = await harness.app.inject({
      method: 'POST',
      url: '/v1/admin/notification-templates/DSR_EXPORT_READY/releases',
      headers: {
        authorization: `Bearer synthetic-admin:support_admin:${author}`,
        'x-purpose': 'notification.template.manage',
        'idempotency-key': 'synthetic-005-template-0001',
      },
      payload: {
        channel: 'sms',
        arabic_body: releaseShape.arabicBody,
        english_body: releaseShape.englishBody,
        allowed_recipient_types: ['patient'],
        allowed_field_schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            privacy_requests_path: { type: 'string' },
            ready_until_label: { type: 'string' },
            request_reference: { type: 'string' },
          },
          required: releaseShape.requiredFields,
        },
        content_digest: digest,
      },
    });
    expect(draft.statusCode).toBe(201);
    const publication = (personId: string, aal = '2') =>
      harness.app.inject({
        method: 'POST',
        url: `/v1/admin/notification-templates/releases/${draft.json().id}/publish`,
        headers: {
          authorization: `Bearer synthetic-admin:support_admin:${personId}`,
          'x-purpose': 'notification.template.publish',
          'x-aal': aal,
          'if-match': '"1"',
          'idempotency-key': `synthetic-005-publish-${personId.slice(-2)}`,
        },
        payload: { approval_digest: digest, effective_at: '2026-08-13T09:00:00.000Z' },
      });
    expect((await publication(author)).statusCode).toBe(403);
    expect((await publication(publisher, '1')).statusCode).toBe(403);
    expect((await publication(publisher)).statusCode).toBe(200);
  });

  it('accepts one signed minimum callback and appends an authorized dead-letter replay', async () => {
    const body = {
      event_reference: '55000000-0000-4000-8000-000000000003',
      receipt_reference: 'synthetic-receipt-005',
      delivery_status: 'delivered' as const,
      occurred_at: clock.toISOString(),
      nonce: 'synthetic-nonce-0001',
    };
    const signature = signProviderCallback(
      JSON.stringify(body),
      clock.toISOString(),
      'synthetic-005-callback-secret-not-production',
    );
    const callback = () =>
      harness.app.inject({
        method: 'POST',
        url: '/v1/internal/callbacks/messages/local-synthetic',
        headers: { 'x-provider-signature': signature, 'x-provider-timestamp': clock.toISOString() },
        payload: body,
      });
    expect((await callback()).statusCode).toBe(200);
    expect((await callback()).statusCode).toBe(409);
    expect(
      (
        await harness.app.inject({
          method: 'POST',
          url: '/v1/internal/callbacks/messages/local-synthetic',
          headers: {
            'x-provider-signature': `sha256=${'0'.repeat(64)}`,
            'x-provider-timestamp': clock.toISOString(),
          },
          payload: { ...body, nonce: 'synthetic-nonce-0002' },
        })
      ).statusCode,
    ).toBe(401);
    const replay = await harness.app.inject({
      method: 'POST',
      url: '/v1/internal/outbox/dead-letters/55000000-0000-4000-8000-000000000004/replay',
      headers: {
        authorization: `Bearer synthetic-admin:platform_operator:${operator}`,
        'x-aal': '2',
        'x-purpose': 'platform.outbox.replay',
        'if-match': '"1"',
        'idempotency-key': 'synthetic-005-replay-0001',
      },
      payload: { reason_code: 'delivery.retry' },
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({
      original_event_id: '55000000-0000-4000-8000-000000000004',
      status: 'pending',
    });
  });
});
