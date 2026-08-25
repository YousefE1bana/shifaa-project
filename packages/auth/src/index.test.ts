import { createServer } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseJwtVerifier } from './index.js';

let server: ReturnType<typeof createServer>;
let verifier: SupabaseJwtVerifier;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'ES256', use: 'sig' }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('JWKS test server did not start.');
  verifier = new SupabaseJwtVerifier(
    `http://127.0.0.1:${address.port}/jwks`,
    'http://local.test/auth/v1',
    'authenticated',
  );
});
afterAll(() => server.close());

async function token(
  overrides: { audience?: string; expires?: string; claims?: Record<string, unknown> } = {},
) {
  return new SignJWT({
    aal: 'aal1',
    session_id: '00000000-0000-4000-8000-000000000011',
    amr: [{ method: 'password', timestamp: 1_777_000_000 }],
    ...overrides.claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject('00000000-0000-4000-8000-000000000010')
    .setIssuer('http://local.test/auth/v1')
    .setAudience(overrides.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(overrides.expires ?? '5m')
    .sign(privateKey);
}

describe('Supabase JWT verifier', () => {
  it('accepts only the pinned ES256 issuer and audience', async () => {
    expect((await verifier.verify(await token()))?.subjectId).toBe(
      '00000000-0000-4000-8000-000000000010',
    );
    expect(await verifier.verify(await token({ audience: 'wrong' }))).toBeUndefined();
    expect(await verifier.verify(await token({ expires: '-1s' }))).toBeUndefined();
    expect(await verifier.verify('forged.header.payload')).toBeUndefined();
  });

  it.each([
    { session_id: undefined },
    { session_id: 'not-a-uuid' },
    { aal: 'aal3' },
    { amr: undefined },
    { amr: [{ method: 'totp', timestamp: 'recent' }] },
  ])('rejects malformed continuity claims %#', async (claims) => {
    expect(await verifier.verify(await token({ claims }))).toBeUndefined();
  });

  it('projects timestamped AMR without trusting user metadata for authorization', async () => {
    const verified = await verifier.verify(
      await token({
        claims: {
          aal: 'aal2',
          amr: [{ method: 'totp', timestamp: 1_777_000_100 }],
          user_metadata: { role: 'ADM-SUPER', purpose: 'guardianship_review' },
        },
      }),
    );
    expect(verified).toMatchObject({
      aal: 2,
      sessionId: '00000000-0000-4000-8000-000000000011',
      amr: [{ method: 'totp', timestamp: 1_777_000_100 }],
    });
    expect(verified).not.toHaveProperty('role');
  });
});
