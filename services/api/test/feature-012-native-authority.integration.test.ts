import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseAuthIssuer } from '../src/adapters/supabase-auth.js';
import {
  assertNativeAuthorityProfile,
  verifyNativeAuthorityContext,
} from '../src/modules/feature-012/native-authority.js';

const issuer = 'http://auth.fixture.test/auth/v1';
const subjectId = '74120000-0000-4000-8000-000000000010';
const sessionId = '74120000-0000-4000-8000-000000000011';
const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'ES256' };
const jwks = createServer((_request, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ keys: [jwk] }));
});

let auth: SupabaseAuthIssuer;

beforeAll(async () => {
  await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
  const address = jwks.address();
  if (!address || typeof address === 'string') throw new Error('JWKS fixture did not start.');
  const url = `http://127.0.0.1:${address.port}`;
  auth = new SupabaseAuthIssuer({
    url,
    anonKey: 'synthetic-verification-fixture',
    jwksUrl: url + '/jwks',
    issuer,
    audience: 'authenticated',
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    jwks.close((error) => (error ? reject(error) : resolve()));
  });
});

function fixtureToken(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = [
    encode({ alg: 'ES256', kid: 'fixture' }),
    encode({ iss: issuer, aud: 'authenticated', sub: subjectId, session_id: sessionId, ...claims }),
  ].join('.');
  const signature = sign('sha256', Buffer.from(data), {
    key: pair.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return data + '.' + signature.toString('base64url');
}

// This is the verification boundary before a repository transaction starts.
// Live session retention, person binding and replay require T011's installed guard.
describe('F012 signed native context input through the existing Auth adapter', () => {
  it('projects signed assurance and deadlines without projecting person or workforce metadata', async () => {
    const now = Math.floor(Date.now() / 1000);
    const amr = [{ method: 'totp', timestamp: now - 300 }];
    const expiresAt = now + 60;
    const input = fixtureToken({
      exp: expiresAt,
      aal: 'aal2',
      amr,
      user_metadata: { person_id: 'different-person', role: 'CLN', aal: 'aal1' },
      app_metadata: { purpose: 'synthetic.feature012', facility_id: 'different-facility' },
    });
    expect(await auth.verifyAccessToken(input)).toEqual({
      subjectId,
      sessionId,
      aal: 2,
      amr,
      expiresAt,
    });
  });

  it.each([
    ['missing access deadline', { exp: undefined }],
    ['access deadline at equality', { exp: 0 }],
    ['missing bound session', { session_id: undefined }],
    ['untrusted issuer', { iss: 'http://other.fixture.test/auth/v1' }],
  ])('denies %s before handing context to the repository', async (scenario, overrides) => {
    const now = Math.floor(Date.now() / 1000);
    const input = fixtureToken({
      exp: now + 60,
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: now }],
      ...overrides,
      ...(scenario === 'access deadline at equality' ? { exp: now } : {}),
    });
    expect(await auth.verifyAccessToken(input)).toBeUndefined();
  });
});

describe('F012 trusted guard context', () => {
  const binding = {
    personId: '74120000-0000-4000-8000-000000000021',
    deploymentId: '74120000-0000-4000-8000-000000000022',
    admissionEpoch: '74120000-0000-4000-8000-000000000023',
    instanceId: '74120000-0000-4000-8000-000000000024',
    facilityId: '74120000-0000-4000-8000-000000000025',
    caseId: '74120000-0000-4000-8000-000000000026',
    action: 'getPrescription',
    purpose: 'synthetic.feature012',
  };

  it('binds the server-selected scope to the qualifying signed TOTP event', async () => {
    const now = Math.floor(Date.now() / 1000);
    const input = fixtureToken({
      exp: now + 60,
      iat: now,
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: now },
        { method: 'totp', timestamp: now - 120 },
      ],
      user_metadata: { facilityId: 'untrusted', caseId: 'untrusted' },
    });
    const context = await verifyNativeAuthorityContext(auth, input, binding, 'workforce_sensitive');
    expect(context).toMatchObject({ ...binding, subjectId, sessionId, totpAt: now - 120 });
    expect(() => assertNativeAuthorityProfile(context, 'workforce_sensitive')).not.toThrow();
    expect(() => assertNativeAuthorityProfile(context, 'subject_projection_read')).toThrow();
    expect(() =>
      assertNativeAuthorityProfile({ ...context, caseId: null }, 'workforce_sensitive'),
    ).toThrow();
  });

  it('keeps signed subject AAL1 without a synthetic factor event', async () => {
    const now = Math.floor(Date.now() / 1000);
    const input = fixtureToken({
      exp: now + 60,
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: now }],
    });
    const context = await verifyNativeAuthorityContext(
      auth,
      input,
      { ...binding, facilityId: null, caseId: null },
      'subject_projection_read',
    );
    expect(context).toMatchObject({ subjectId, sessionId, aal: 1, totpAt: null });
    expect(() => assertNativeAuthorityProfile(context, 'subject_projection_read')).not.toThrow();
    expect(() => assertNativeAuthorityProfile(context, 'workforce_sensitive')).toThrow();
  });
});
