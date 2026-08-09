import { describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { LocalAuthIssuer, LocalProofingProvider } from '../src/adapters/index.js';
import { buildApp, type AppHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';

async function registerAndVerify(
  app: FastifyInstance,
  handle: string,
  keySuffix: string,
): Promise<{ token: string; profile: Record<string, unknown> }> {
  const registration = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'idempotency-key': `register-${keySuffix}-0001` },
    payload: { locale: 'ar-EG', handle, password: 'Synthetic-Only-2026!' },
  });
  expect(registration.statusCode).toBe(201);
  const challenge = registration.json().challenge_id as string;
  const verified = await app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    headers: { 'idempotency-key': `otp-${keySuffix}-verify-01` },
    payload: { challenge_id: challenge, code: LocalAuthIssuer.developmentOtp },
  });
  expect(verified.statusCode).toBe(200);
  const token = verified.json().access_token as string;
  const profileResponse = await app.inject({
    method: 'GET',
    url: '/v1/people/me',
    headers: { authorization: `Bearer ${token}` },
  });
  return { token, profile: profileResponse.json() as Record<string, unknown> };
}

describe('identity onboarding API acceptance', () => {
  it('AC-01/02/03 registers once, rejects government ID login, and terminally replays OTP', async () => {
    const harness = await buildApp();
    const payload = {
      locale: 'ar-EG',
      handle: 'atomic.patient@synthetic.shifaa.test',
      password: 'Synthetic-Only-2026!',
    };
    const headers = { 'idempotency-key': 'atomic-register-0001' };
    const first = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers,
      payload,
    });
    const replay = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers,
      payload,
    });
    expect(replay.json()).toEqual(first.json());
    expect(
      harness.repository.audits.filter((audit) => audit.action === 'identity.registration.created'),
    ).toHaveLength(1);

    const invalidLogin = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'idempotency-key': 'government-login-01' },
      payload: { handle: '29913991234567', password: 'Synthetic-Only-2026!' },
    });
    expect(invalidLogin).toMatchObject({ statusCode: 400 });
    expect(invalidLogin.json()).toMatchObject({ code: 'validation-failed' });

    const otpPayload = {
      challenge_id: first.json().challenge_id,
      code: LocalAuthIssuer.developmentOtp,
    };
    const otpHeaders = { 'idempotency-key': 'terminal-otp-00001' };
    const otpFirst = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      headers: otpHeaders,
      payload: otpPayload,
    });
    const otpReplay = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      headers: otpHeaders,
      payload: otpPayload,
    });
    expect(otpReplay.json()).toEqual(otpFirst.json());
    expect(otpFirst.headers['cache-control']).toBe('private, no-store');
    await harness.app.close();
  });

  it('AC-04/05/06 preserves provider outcomes, masks values, and permits one reasoned AAL2 review', async () => {
    const fixtures = new Map([
      ['SYNTHETIC-TIMEOUT', 'timeout'],
      ['SYNTHETIC-FAILED', 'failed'],
      ['SYNTHETIC-MANUAL', 'manual_review'],
    ] as const);
    const harness = await buildApp({ proofing: new LocalProofingProvider(fixtures) });
    const { token } = await registerAndVerify(
      harness.app,
      'proof.patient@synthetic.shifaa.test',
      'proof',
    );
    const auth = { authorization: `Bearer ${token}` };
    const created: Record<string, unknown>[] = [];
    for (const [index, value] of [...fixtures.keys()].entries()) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/v1/people/me/identities',
        headers: { ...auth, 'idempotency-key': `proof-outcome-${index}-0001` },
        payload: { identity_type: 'passport', value, issuing_country: 'EG' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.body).not.toContain(value);
      expect(response.body).not.toContain('ciphertext');
      created.push(response.json() as Record<string, unknown>);
    }
    expect((created[0]?.['verification_case'] as Record<string, unknown>)['status']).toBe(
      'pending',
    );
    expect((created[1]?.['verification_case'] as Record<string, unknown>)['status']).toBe('failed');
    expect((created[2]?.['verification_case'] as Record<string, unknown>)['status']).toBe(
      'manual_review',
    );

    const manualCase = created[2]?.['verification_case'] as Record<string, unknown>;
    const caseId = manualCase['id'] as string;
    const decision = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/identity-verifications/${caseId}/decision`,
      headers: {
        authorization: 'Bearer synthetic-reviewer:synthetic-reviewer',
        'x-aal': '2',
        'x-purpose': 'identity.review',
        'if-match': `"${manualCase['version']}"`,
        'idempotency-key': 'manual-review-0001',
      },
      payload: { decision: 'approve', reason: 'Synthetic document matched.' },
    });
    expect(decision).toMatchObject({ statusCode: 200 });
    expect(decision.json()).toMatchObject({ status: 'verified', version: 2 });
    const repeated = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/identity-verifications/${caseId}/decision`,
      headers: {
        authorization: 'Bearer synthetic-reviewer:synthetic-reviewer',
        'x-aal': '2',
        'x-purpose': 'identity.review',
        'if-match': '"2"',
        'idempotency-key': 'manual-review-0002',
      },
      payload: { decision: 'reject', reason: 'Second decision prohibited.' },
    });
    expect(repeated.statusCode).toBe(409);
    await harness.app.close();
  });

  it('AC-07 denies identity collection when inventory is inactive', async () => {
    const harness = await buildApp();
    const { token } = await registerAndVerify(
      harness.app,
      'inventory.patient@synthetic.shifaa.test',
      'inventory',
    );
    harness.repository.setInventory('identity_proofing', false);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/people/me/identities',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'inventory-proof-0001' },
      payload: { identity_type: 'passport', value: 'SYNTHETIC-INVENTORY', issuing_country: 'EG' },
    });
    expect(response).toMatchObject({ statusCode: 503 });
    expect(response.json()).toMatchObject({ code: 'processing-purpose-disabled' });
    expect(
      harness.repository.identitiesForPerson(response.json().request_id as string),
    ).toHaveLength(0);
    await harness.app.close();
  });

  it('AC-08/09 records independent grant/refusal and append-only withdrawal', async () => {
    const fixedNow = new Date('2026-08-09T12:00:00.000Z');
    const harness = await buildApp({ clock: { now: () => fixedNow } });
    const { token } = await registerAndVerify(
      harness.app,
      'consent.patient@synthetic.shifaa.test',
      'consent',
    );
    const auth = { authorization: `Bearer ${token}` };
    const grant = await harness.app.inject({
      method: 'POST',
      url: '/v1/privacy/consents',
      headers: { ...auth, 'idempotency-key': 'consent-grant-0001' },
      payload: {
        purpose_code: 'care_updates',
        purpose_version: '1.0.0',
        decision: 'granted',
        notice_version: '1.0.0',
      },
    });
    const refusal = await harness.app.inject({
      method: 'POST',
      url: '/v1/privacy/consents',
      headers: { ...auth, 'idempotency-key': 'consent-refuse-001' },
      payload: {
        purpose_code: 'identity_proofing',
        purpose_version: '1.0.0',
        decision: 'refused',
        notice_version: '1.0.0',
      },
    });
    expect(grant.json().decision).toBe('granted');
    expect(refusal.json().decision).toBe('refused');
    const withdrawal = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/consents/${grant.json().id}/withdraw`,
      headers: { ...auth, 'if-match': '"1"', 'idempotency-key': 'consent-withdraw-01' },
      payload: { reason: 'Changed preference.' },
    });
    expect(withdrawal.json()).toMatchObject({
      decision: 'withdrawn',
      supersedes_id: grant.json().id,
      version: 2,
    });
    const list = await harness.app.inject({
      method: 'GET',
      url: '/v1/privacy/consents',
      headers: auth,
    });
    expect(list.json()).toHaveLength(3);
    await harness.app.close();
  });

  it('AC-10/11 denies queued/unauthorized behavior and minimum reviewer access below AAL2', async () => {
    const harness = await buildApp();
    const first = await registerAndVerify(
      harness.app,
      'owner.patient@synthetic.shifaa.test',
      'owner',
    );
    const second = await registerAndVerify(
      harness.app,
      'other.patient@synthetic.shifaa.test',
      'other',
    );
    const identity = await harness.app.inject({
      method: 'POST',
      url: '/v1/people/me/identities',
      headers: { authorization: `Bearer ${first.token}`, 'idempotency-key': 'owner-proof-000001' },
      payload: { identity_type: 'passport', value: 'SYNTHETIC-OWNER', issuing_country: 'EG' },
    });
    const caseId = identity.json().verification_case.id as string;
    const crossPatient = await harness.app.inject({
      method: 'GET',
      url: `/v1/identity-verifications/${caseId}`,
      headers: { authorization: `Bearer ${second.token}` },
    });
    expect(crossPatient.statusCode).toBe(403);
    const aal1 = await harness.app.inject({
      method: 'GET',
      url: '/v1/admin/identity-verifications',
      headers: {
        authorization: 'Bearer synthetic-reviewer:synthetic-reviewer',
        'x-aal': '1',
        'x-purpose': 'identity.review',
      },
    });
    expect(aal1.statusCode).toBe(403);
    const noPurpose = await harness.app.inject({
      method: 'GET',
      url: '/v1/admin/identity-verifications',
      headers: { authorization: 'Bearer synthetic-reviewer:synthetic-reviewer', 'x-aal': '2' },
    });
    expect(noPurpose.statusCode).toBe(403);
    expect(harness.repository.outbox.every((event) => !('otp' in event.payload))).toBe(true);
    await harness.app.close();
  });

  it('AC-13/15 allows one profile version update and fails production synthetic startup closed', async () => {
    const harness = await buildApp();
    const { token, profile } = await registerAndVerify(
      harness.app,
      'race.patient@synthetic.shifaa.test',
      'race',
    );
    const headers = { authorization: `Bearer ${token}`, 'if-match': `"${profile['version']}"` };
    const first = await harness.app.inject({
      method: 'PATCH',
      url: '/v1/people/me',
      headers: { ...headers, 'idempotency-key': 'profile-race-first' },
      payload: { display_name: 'First synthetic name' },
    });
    const second = await harness.app.inject({
      method: 'PATCH',
      url: '/v1/people/me',
      headers: { ...headers, 'idempotency-key': 'profile-race-second' },
      payload: { display_name: 'Second synthetic name' },
    });
    expect(first.json().version).toBe(2);
    expect(second).toMatchObject({ statusCode: 409 });
    expect(() => loadConfig({ NODE_ENV: 'production', SHIFAA_SYNTHETIC_MODE: 'true' })).toThrow(
      /Production startup denied/,
    );
    await harness.app.close();
  });
});
