import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { operationIds } from '@shifaa/contracts';

import { IdentityOnboardingClient, generatedOperationIds } from './identity-onboarding.js';

describe('generated identity onboarding API client', () => {
  it('is generated and contains all 16 approved operations', () => {
    const source = readFileSync(new URL('./identity-onboarding.ts', import.meta.url), 'utf8');
    expect(source.startsWith('// @generated')).toBe(true);
    expect(new Set(generatedOperationIds)).toEqual(new Set(operationIds));
    for (const operationId of operationIds) expect(source).toContain(operationId);
  });

  it('applies auth, localization, no-store, idempotency, and version headers', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ version: 3 }), { status: 200 }),
    );
    const client = new IdentityOnboardingClient({
      baseUrl: 'http://localhost:3000/',
      accessToken: 'synthetic-session',
      acceptLanguage: 'ar-EG',
      fetch: fetcher,
    });
    await client.updateMyProfile({ display_name: 'Synthetic Person' }, 2, 'profile-save-0001');
    const init = fetcher.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer synthetic-session');
    expect(headers.get('Idempotency-Key')).toBe('profile-save-0001');
    expect(headers.get('If-Match')).toBe('"2"');
    expect(init?.cache).toBe('no-store');
  });

  it('binds fetch to the global receiver required by browser implementations', async () => {
    let receiver: unknown;
    const fetcher = async function (this: unknown) {
      receiver = this;
      return new Response(JSON.stringify({ kind: 'challenge', challenge_id: 'synthetic' }), {
        status: 201,
      });
    } as typeof fetch;
    const client = new IdentityOnboardingClient({
      baseUrl: 'http://localhost:3000',
      fetch: fetcher,
    });

    await client.registerPerson(
      { handle: 'synthetic@example.test', password: 'Synthetic-Only-2026!', locale: 'en-EG' },
      'browser-binding-0001',
    );

    expect(receiver).toBe(globalThis);
  });
});
