import { describe, expect, it } from 'vitest';
import { FamilyCareClient, generatedFamilyCareOperationIds } from './family-care.js';

describe('family care generated client', () => {
  it('exports twelve calls and sends explicit patient context', async () => {
    expect(generatedFamilyCareOperationIds).toHaveLength(12);
    expect(generatedFamilyCareOperationIds).not.toContain('transitionDependent');
    let seen: RequestInit | undefined;
    let url = '';
    const client = new FamilyCareClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:40000000-0000-4000-8000-000000000001',
      fetch: async (input, init) => {
        url = String(input);
        seen = init;
        return new Response(JSON.stringify({ id: 'one' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await client.createDelegation(
      '41000000-0000-4000-8000-000000000001',
      {
        delegate_person_id: '40000000-0000-4000-8000-000000000004',
        purpose_code: 'family_support',
        permissions: ['record.view'],
        valid_until: '2027-08-11T09:00:00.000Z',
      },
      'synthetic-key-0001',
    );
    const headers = new Headers(seen?.headers);
    expect(url).toContain('/v1/patients/41000000-0000-4000-8000-000000000001/delegations');
    expect(headers.get('x-shifaa-patient-context')).toBe('41000000-0000-4000-8000-000000000001');
    expect(headers.get('if-match')).toBeNull();
  });
  it('keeps the public contact token out of URLs and strips inherited authorization', async () => {
    let headers = new Headers();
    let url = '';
    let body = '';
    const client = new FamilyCareClient({
      baseUrl: 'https://synthetic.invalid',
      defaultHeaders: { Authorization: 'Bearer must-not-leak' },
      fetch: async (input, init) => {
        url = String(input);
        body = String(init?.body);
        headers = new Headers(init?.headers);
        return new Response(JSON.stringify({ status: 'confirmed' }), { status: 200 });
      },
    });
    const token = 'synthetic-token-000000000000000000000000';
    await client.respondEmergencyContact(
      token,
      { decision: 'confirmed' },
      'synthetic-response-0001',
    );
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('idempotency-key')).toBe('synthetic-response-0001');
    expect(url).toMatch(/\/v1\/emergency-contact-invites\/response$/);
    expect(url).not.toContain(token);
    expect(JSON.parse(body)).toEqual({ decision: 'confirmed', token });
  });
});
