import assert from 'node:assert/strict';
import test from 'node:test';

import { PatientOnboardingApi } from '../src/identity-onboarding-api.ts';

const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('patient gateway carries the API session through profile, identity, and consent writes', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/auth/register'))
      return response(
        { kind: 'challenge', challenge_id: '10000000-0000-4000-8000-000000000001' },
        201,
      );
    if (url.endsWith('/auth/otp/verify'))
      return response({ kind: 'session', access_token: 'session-1' });
    if (url.endsWith('/people/me') && init?.method === 'GET')
      return response({
        id: 'person-1',
        display_name: '',
        birth_date: null,
        nationality_code: 'EG',
        preferred_locale: 'ar-EG',
        verification_status: 'unverified',
        version: 1,
      });
    if (url.endsWith('/people/me') && init?.method === 'PATCH')
      return response({
        id: 'person-1',
        display_name: 'شخص تجريبي',
        birth_date: null,
        nationality_code: 'EG',
        preferred_locale: 'ar-EG',
        verification_status: 'unverified',
        version: 2,
      });
    if (url.endsWith('/people/me/identities'))
      return response(
        {
          id: 'identity-1',
          identity_type: 'passport',
          masked_value: '••••42',
          verification_case: { id: 'case-1', status: 'pending', version: 1 },
        },
        201,
      );
    if (url.endsWith('/privacy/notices/current'))
      return response({
        notice_code: 'privacy',
        version: '1.0.0',
        locale: 'ar-EG',
        content: 'بيان الخصوصية',
        purposes: [
          {
            purpose_code: 'care_updates',
            version: '1.0.0',
            label: 'تحديثات الرعاية',
            optional: true,
          },
        ],
      });
    if (url.endsWith('/privacy/consents'))
      return response({ id: 'consent-1', decision: 'refused' }, 201);
    return response({ code: 'unexpected-request' }, 500);
  };

  const gateway = new PatientOnboardingApi('http://shifaa.test', fakeFetch);
  await gateway.register('patient@synthetic.shifaa.test', 'Synthetic-Only-2026!', 'ar-EG');
  await gateway.verifyOtp('246810');
  await gateway.getProfile();
  await gateway.updateProfile({ display_name: 'شخص تجريبي' });
  await gateway.createIdentity({
    identity_type: 'passport',
    value: 'SYNTHETIC-42',
    issuing_country: 'EG',
  });
  await gateway.recordConsent('care_updates', 'refused');

  assert.equal(calls.length, 7);
  assert.match(
    String(new Headers(calls[2]?.init?.headers).get('authorization')),
    /^Bearer session-1$/,
  );
  assert.equal(new Headers(calls[3]?.init?.headers).get('if-match'), '"1"');
  assert.ok(
    calls
      .filter((call) => call.init?.method !== 'GET')
      .every((call) => new Headers(call.init?.headers).has('idempotency-key')),
  );
});

test('native OTP bootstrap stores the provider refresh credential in the secure port', async () => {
  let storedRefreshToken = '';
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/login'))
      return response({
        kind: 'challenge',
        challenge_id: '10000000-0000-4000-8000-000000000002',
      });
    if (url.endsWith('/auth/otp/verify'))
      return response({
        kind: 'session',
        access_token: 'native-access-token',
        refresh_token: 'native-refresh-token',
      });
    return response({ code: 'unexpected-request' }, 500);
  };
  const gateway = new PatientOnboardingApi('http://shifaa.test', fakeFetch, {
    platform: 'native',
    nativeRefreshTokens: {
      read: async () => storedRefreshToken || undefined,
      write: async (value) => {
        storedRefreshToken = value;
      },
      clear: async () => {
        storedRefreshToken = '';
      },
    },
  });

  await gateway.login('patient@synthetic.shifaa.test', 'Synthetic-Only-2026!');
  await gateway.verifyOtp('246810');

  assert.equal(gateway.readAccessToken(), 'native-access-token');
  assert.equal(storedRefreshToken, 'native-refresh-token');
});
