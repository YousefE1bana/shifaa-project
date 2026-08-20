import { describe, expect, it } from 'vitest';
import {
  generatedPrivacyDsrNotificationOperationIds,
  PrivacyDsrNotificationApiError,
  PrivacyDsrNotificationClient,
} from './privacy-dsr-notifications.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

describe('privacy DSR and notification generated client', () => {
  it('exports exactly twelve calls and maps subject context without persistent caching', async () => {
    expect(generatedPrivacyDsrNotificationOperationIds).toHaveLength(12);
    let seen: RequestInit | undefined;
    let url = '';
    const client = new PrivacyDsrNotificationClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:patient',
      fetch: async (input, init) => {
        url = String(input);
        seen = init;
        return jsonResponse({ id: 'request' }, 201);
      },
    });
    await client.createDsr(
      {
        managed_patient_id: '51000000-0000-4000-8000-000000000001',
        request_type: 'access_export',
        scope: { data_category_codes: ['profile.demographics'] },
        contact_preference: 'in_app',
      },
      'synthetic-005-create-0001',
    );
    const headers = new Headers(seen?.headers);
    expect(url).toMatch(/\/v1\/privacy\/requests$/);
    expect(headers.get('x-shifaa-patient-context')).toBe('51000000-0000-4000-8000-000000000001');
    expect(headers.get('idempotency-key')).toBe('synthetic-005-create-0001');
    expect(seen?.cache).toBe('no-store');
  });

  it('sets independent AAL2 purpose and optimistic version headers', async () => {
    let seen = new Headers();
    const client = new PrivacyDsrNotificationClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:dpo',
      fetch: async (_input, init) => {
        seen = new Headers(init?.headers);
        return jsonResponse({ status: 'approved' });
      },
    });
    await client.decideDsr(
      '52000000-0000-4000-8000-000000000001',
      {
        decision: 'approve',
        reason_code: 'request.valid',
        evidence_object_id: '53000000-0000-4000-8000-000000000001',
      },
      2,
      'synthetic-005-decision-0001',
    );
    expect(seen.get('x-aal')).toBe('2');
    expect(seen.get('x-purpose')).toBe('privacy.dsr.review');
    expect(seen.get('if-match')).toBe('"2"');
  });

  it('keeps callback credentials out of URLs and strips inherited authorization', async () => {
    let seen = new Headers();
    let url = '';
    const client = new PrivacyDsrNotificationClient({
      baseUrl: 'https://synthetic.invalid',
      defaultHeaders: { Authorization: 'Bearer must-not-leak' },
      fetch: async (input, init) => {
        url = String(input);
        seen = new Headers(init?.headers);
        return jsonResponse({ accepted: true });
      },
    });
    await client.smsProviderCallback(
      {
        event_reference: 'synthetic-event',
        receipt_reference: 'synthetic-receipt',
        delivery_status: 'delivered',
        occurred_at: '2026-08-13T09:00:00.000Z',
        nonce: 'synthetic-nonce-0001',
      },
      `sha256=${'a'.repeat(64)}`,
      '2026-08-13T09:00:00.000Z',
    );
    expect(url).toMatch(/\/v1\/internal\/callbacks\/messages\/local-synthetic$/);
    expect(seen.get('authorization')).toBeNull();
    expect(seen.get('x-provider-signature')).toMatch(/^sha256=/);
    expect(url).not.toContain('synthetic-nonce');
  });

  it('supports cancellation and rejects unsafe cache policy', async () => {
    const controller = new AbortController();
    const client = new PrivacyDsrNotificationClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:patient',
      fetch: async (_input, init) => {
        expect(init?.signal).toBe(controller.signal);
        return new Response(JSON.stringify({ items: [] }), {
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
        });
      },
    });
    await expect(client.listMyDsrs({}, { signal: controller.signal })).rejects.toMatchObject({
      status: 502,
      problem: { code: 'unsafe-cache-policy' },
    } satisfies Partial<PrivacyDsrNotificationApiError>);
  });
});
