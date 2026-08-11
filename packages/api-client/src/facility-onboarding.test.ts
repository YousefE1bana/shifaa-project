import { describe, expect, it } from 'vitest';
import { FacilityOnboardingClient, generatedFacilityOperationIds } from './facility-onboarding.js';
describe('facility client', () => {
  it('exports 22 calls and sends security context', async () => {
    expect(new Set(generatedFacilityOperationIds).size).toBe(22);
    let seen: RequestInit | undefined;
    const client = new FacilityOnboardingClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-owner:one',
      defaultHeaders: { 'X-Purpose': 'facility_review' },
      fetch: async (_url, init) => {
        seen = init;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await client.listFacilityApprovalCases();
    expect(new Headers(seen?.headers).get('authorization')).toBe('Bearer synthetic-owner:one');
    expect(new Headers(seen?.headers).get('x-purpose')).toBe('facility_review');
  });
});
