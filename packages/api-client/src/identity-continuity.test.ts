import { describe, expect, it } from 'vitest';

import {
  IdentityContinuityClient,
  generatedIdentityContinuityOperationIds,
} from './identity-continuity.js';

describe('identity continuity generated client', () => {
  it('exports exactly eight operations and sends a standard JSON DELETE body', async () => {
    expect(generatedIdentityContinuityOperationIds).toHaveLength(8);
    expect(generatedIdentityContinuityOperationIds).not.toContain('getAdminSummary');
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const client = new IdentityContinuityClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic-access-token',
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(JSON.stringify({ removedFactorId: 'one' }), { status: 200 });
      },
    });
    await client.removeMfaFactor(
      '71000000-0000-4000-8000-000000000010',
      { proofCaseId: null, confirmOptionalLastFactor: true },
      'synthetic-idempotency-key-0001',
    );
    const headers = new Headers(requestInit?.headers);
    expect(requestUrl.endsWith('/v1/auth/mfa/factors/71000000-0000-4000-8000-000000000010')).toBe(
      true,
    );
    expect(requestInit?.method).toBe('DELETE');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      proofCaseId: null,
      confirmOptionalLastFactor: true,
    });
  });

  it('uses credentials and CSRF for web refresh without putting a token in its body', async () => {
    let requestInit: RequestInit | undefined;
    const client = new IdentityContinuityClient({
      baseUrl: 'https://patient.synthetic.test',
      csrfToken: () => 'synthetic-csrf-token',
      origin: 'https://patient.synthetic.test',
      fetch: async (_input, init) => {
        requestInit = init;
        return new Response(JSON.stringify({ sessionId: 'one' }), { status: 200 });
      },
    });
    await client.refreshSession(
      { client: 'web', foregroundEngaged: true },
      'synthetic-idempotency-key-0002',
    );
    const headers = new Headers(requestInit?.headers);
    expect(requestInit?.credentials).toBe('include');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-csrf-token')).toBe('synthetic-csrf-token');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      client: 'web',
      foregroundEngaged: true,
    });
  });
});
