import { describe, expect, it } from 'vitest';
import {
  createDiscoverySosClient,
  DiscoverySosApiError,
  generatedDiscoverySosOperationIds,
} from './discovery-sos.js';

const response = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('discovery and SOS generated client', () => {
  it('exports exactly ten calls and maps transient discovery query parameters', async () => {
    expect(generatedDiscoverySosOperationIds).toHaveLength(10);
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    const client = createDiscoverySosClient({
      baseUrl: 'https://synthetic.invalid',
      fetch: async (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return response({ data: [], meta: { next_cursor: null } });
      },
    });
    await client.searchFacilities({
      type: 'hospital',
      service: 'emergency',
      near: '30.0444,31.2357',
      radius: 5000,
    });
    expect(requestedUrl).toContain(
      '/v1/discovery/facilities?type=hospital&service=emergency&near=30.0444%2C31.2357&radius=5000',
    );
    expect(requestedInit?.cache).toBe('no-store');
  });

  it('sets patient context, idempotency, version, AAL, and purpose headers', async () => {
    let requestedHeaders = new Headers();
    const client = createDiscoverySosClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:60000000-0000-4000-8000-000000000001',
      fetch: async (_input, init) => {
        requestedHeaders = new Headers(init?.headers);
        return response({ incident: {}, guidance: {} }, { 'cache-control': 'private, no-store' });
      },
    });
    await client.acceptSosPrearrival(
      '63000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000001',
      { acknowledgement: true, capacity_note_code: 'capacity_acknowledged' },
      2,
      'synthetic-006-accept-0001',
    );
    expect(requestedHeaders.get('idempotency-key')).toBe('synthetic-006-accept-0001');
    expect(requestedHeaders.get('if-match')).toBe('"2"');
    expect(requestedHeaders.get('x-aal')).toBe('2');
    expect(requestedHeaders.get('x-purpose')).toBe('sos_prearrival');
  });

  it('strips inherited authorization from public token views and supports cancellation', async () => {
    const controller = new AbortController();
    let requestedHeaders = new Headers();
    let requestedSignal: AbortSignal | null | undefined;
    const client = createDiscoverySosClient({
      baseUrl: 'https://synthetic.invalid',
      defaultHeaders: { Authorization: 'Bearer must-not-leak' },
      fetch: async (_input, init) => {
        requestedHeaders = new Headers(init?.headers);
        requestedSignal = init?.signal;
        return response(
          { available_fields: {}, unavailable_fields: [], expires_at: '2026-08-20T10:30:00Z' },
          { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' },
        );
      },
    });
    await client.viewEmergencyShare('x'.repeat(43), { signal: controller.signal });
    expect(requestedHeaders.get('authorization')).toBeNull();
    expect(requestedSignal).toBe(controller.signal);
  });

  it('rejects unsafe sensitive response cache policy', async () => {
    const client = createDiscoverySosClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:60000000-0000-4000-8000-000000000001',
      fetch: async () => response({ incident: {}, guidance: {} }, { 'cache-control': 'public' }),
    });
    await expect(
      client.getSosIncident('64000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(DiscoverySosApiError);
  });

  it('preserves a terminal share 410 when every secrecy header is present', async () => {
    const client = createDiscoverySosClient({
      baseUrl: 'https://synthetic.invalid',
      fetch: async () =>
        new Response(
          JSON.stringify({ code: 'emergency-share-expired', instance: '/v1/sos/share/[REDACTED]' }),
          {
            status: 410,
            headers: {
              'content-type': 'application/problem+json',
              'cache-control': 'private, no-store',
              pragma: 'no-cache',
              'referrer-policy': 'no-referrer',
            },
          },
        ),
    });
    await expect(client.viewEmergencyShare('x'.repeat(43))).rejects.toMatchObject({
      status: 410,
      problem: { code: 'emergency-share-expired' },
    });
  });
});
