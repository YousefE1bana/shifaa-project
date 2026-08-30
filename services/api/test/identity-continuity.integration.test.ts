import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  restrictedRecoveryOperationIds,
  type ContinuityRequestContext,
  type IdentityContinuityServicePort,
} from '../src/modules/identity-continuity/index.js';
import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';
import { InMemoryIdempotencyStore } from '../src/platform/idempotency.js';
import {
  registerIdentityContinuityRoutes,
  registeredIdentityContinuityOperationIds,
} from '../src/routes/identity-continuity.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';

const ids = {
  session: '71000000-0000-4000-8000-000000000001',
  factor: '71000000-0000-4000-8000-000000000002',
  case: '71000000-0000-4000-8000-000000000003',
  relationship: '71000000-0000-4000-8000-000000000004',
  patient: '71000000-0000-4000-8000-000000000005',
  person: '71000000-0000-4000-8000-000000000006',
  proof: '71000000-0000-4000-8000-000000000007',
} as const;
const accessToken = 'synthetic-access-token-000000000000000000';
const refreshToken = 'synthetic-refresh-token-0000000000000000';
const key = 'synthetic-idempotency-key-0001';

class RouteService implements IdentityContinuityServicePort {
  public calls = 0;
  public failure: ApiPolicyError | undefined;

  private invoked<T>(body: T): Promise<T> {
    this.calls += 1;
    return this.failure ? Promise.reject(this.failure) : Promise.resolve(body);
  }

  public refreshSession() {
    return this.invoked({
      accessToken,
      refreshToken,
      sessionId: ids.session,
      assurance: 'aal1' as const,
      expiresAt: '2026-08-26T00:15:00.000Z',
      restriction: null,
    });
  }
  public prepareLogout(_context: ContinuityRequestContext, body: { allSessions: boolean }) {
    return this.invoked({
      result: {
        scope: body.allSessions ? ('all' as const) : ('current' as const),
        revokedAt: '2026-08-26T00:00:00.000Z',
      },
      audit: {
        requestId: '71000000-0000-4000-8000-000000000099',
        action: 'identity.session.logged_out',
        outcome: 'succeeded' as const,
        occurredAt: '2026-08-26T00:00:00.000Z',
      },
    });
  }
  public commitLogout(prepared: Awaited<ReturnType<RouteService['prepareLogout']>>) {
    return Promise.resolve(prepared.result);
  }
  public async logout(context: ContinuityRequestContext, body: { allSessions: boolean }) {
    return this.commitLogout(await this.prepareLogout(context, body));
  }
  public beginMfaEnrollment() {
    return this.invoked({
      enrollmentId: ids.factor,
      factorType: 'totp' as const,
      secret: 'SYNTHETICONETIMESECRET',
      qrUri: 'otpauth://totp/SHIFAA:synthetic?secret=SYNTHETIC',
      expiresAt: '2026-08-26T00:10:00.000Z',
    });
  }
  public verifyMfaEnrollment() {
    return this.invoked({
      factor: {
        id: ids.factor,
        type: 'totp' as const,
        status: 'verified' as const,
        friendlyName: null,
        createdAt: '2026-08-26T00:00:00.000Z',
      },
      assurance: 'aal2' as const,
    });
  }
  public removeMfaFactor() {
    return this.invoked({
      removedFactorId: ids.factor,
      assurance: 'aal1' as const,
      removedAt: '2026-08-26T00:00:00.000Z',
    });
  }
  public startRecovery() {
    return this.invoked({
      caseId: ids.case,
      caseToken: 'synthetic-case-token-00000000000000000000',
      status: 'accepted' as const,
      messageCode: 'recovery.accepted' as const,
    });
  }
  public completeRecovery() {
    return this.invoked({
      caseId: ids.case,
      status: 'restricted_enrollment' as const,
      session: {
        accessToken,
        refreshToken,
        sessionId: ids.session,
        assurance: 'aal1' as const,
        expiresAt: '2026-08-26T00:15:00.000Z',
        restriction: 'mfa_enrollment_only' as const,
      },
    });
  }
  public prepareRecoveryCompletion(context: ContinuityRequestContext) {
    return this.invoked({
      caseId: ids.case,
      personId: ids.person,
      requestId: context.requestId,
      restricted: true,
      session: {
        accessToken,
        refreshToken,
        sessionId: ids.session,
        assurance: 'aal1' as const,
        expiresAt: '2026-08-26T00:15:00.000Z',
        restriction: 'mfa_enrollment_only' as const,
      },
    });
  }
  public commitRecoveryCompletion(
    prepared: Awaited<ReturnType<RouteService['prepareRecoveryCompletion']>>,
  ) {
    return Promise.resolve({
      caseId: prepared.caseId,
      status: prepared.restricted ? ('restricted_enrollment' as const) : ('completed' as const),
      session: prepared.session,
    });
  }
  public transitionDependent() {
    return this.invoked({
      caseId: ids.case,
      relationshipId: ids.relationship,
      patientId: ids.patient,
      personId: ids.person,
      status: 'review_required' as const,
      version: 2,
      updatedAt: '2026-08-26T00:00:00.000Z',
    });
  }
}

describe('identity continuity exact route contract', () => {
  let app = Fastify({ logger: false });
  let service = new RouteService();

  beforeEach(async () => {
    app = Fastify({ logger: false });
    service = new RouteService();
    installIdentityErrorHandler(app);
    await registerIdentityContinuityRoutes(app, {
      service,
      idempotency: new InMemoryIdempotencyStore(),
      hmacKey: Buffer.alloc(32, 7),
      now: () => Date.parse('2026-08-26T00:00:00.000Z'),
    });
    await app.ready();
  });

  afterEach(() => app.close());

  it('registers exactly the frozen eight operations', () => {
    expect(registeredIdentityContinuityOperationIds).toHaveLength(8);
    expect(new Set(registeredIdentityContinuityOperationIds)).toEqual(
      new Set([
        'refreshSession',
        'logout',
        'beginMfaEnrollment',
        'verifyMfaEnrollment',
        'removeMfaFactor',
        'startRecovery',
        'completeRecovery',
        'transitionDependent',
      ]),
    );
    expect(app.printRoutes()).not.toContain('admin/summary');
    expect(restrictedRecoveryOperationIds).toEqual([
      'refreshSession',
      'logout',
      'beginMfaEnrollment',
      'verifyMfaEnrollment',
    ]);
  });

  it.each([
    ['start', '/v1/auth/recovery', { handle: 'subject@synthetic.test', locale: 'en-EG' }],
    [
      'complete',
      `/v1/auth/recovery/${ids.case}/complete`,
      {
        caseToken: 'synthetic-case-token-00000000000000000000',
        handle: 'subject@synthetic.test',
        recoveryOtp: '123456',
        proofMethod: 'bound_factor_independent_method',
        factorEvidence: '123456',
        verificationCaseId: null,
        newCredential: 'Synthetic-Recovery-Replacement-123!',
      },
    ],
  ])(
    'denies bearer use of anonymous recovery %s under the restricted-session registry',
    async (_name, url, payload) => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: {
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'recovery-mfa-enrollment-required' });
    },
  );

  it.each([
    [
      'refresh',
      'POST',
      '/v1/auth/session/refresh',
      { client: 'native', foregroundEngaged: true, refreshToken },
      {},
    ],
    [
      'logout',
      'POST',
      '/v1/auth/logout',
      { allSessions: false },
      { authorization: `Bearer ${accessToken}` },
    ],
    [
      'begin MFA',
      'POST',
      '/v1/auth/mfa/enroll',
      { factorType: 'totp' },
      { authorization: `Bearer ${accessToken}` },
    ],
    [
      'verify MFA',
      'POST',
      '/v1/auth/mfa/enroll/verify',
      { enrollmentId: ids.factor, code: '123456' },
      { authorization: `Bearer ${accessToken}` },
    ],
    [
      'remove MFA',
      'DELETE',
      `/v1/auth/mfa/factors/${ids.factor}`,
      { proofCaseId: null, confirmOptionalLastFactor: true },
      { authorization: `Bearer ${accessToken}` },
    ],
    [
      'start recovery',
      'POST',
      '/v1/auth/recovery',
      { handle: 'subject@synthetic.test', locale: 'ar-EG' },
      {},
    ],
    [
      'complete recovery',
      'POST',
      `/v1/auth/recovery/${ids.case}/complete`,
      {
        caseToken: 'synthetic-case-token-00000000000000000000',
        handle: 'subject@synthetic.test',
        recoveryOtp: '123456',
        proofMethod: 'repeated_identity_proof',
        verificationCaseId: ids.proof,
        newCredential: 'Synthetic-New-Credential!',
      },
      {},
    ],
    [
      'transition',
      'POST',
      `/v1/guardianships/${ids.relationship}/transition`,
      { action: 'submit_proof', verificationCaseId: ids.proof },
      { authorization: `Bearer ${accessToken}`, 'if-match': '"1"' },
    ],
  ] as const)(
    'accepts the %s contract through Fastify',
    async (_name, method, url, payload, headers) => {
      const response = await app.inject({
        method,
        url,
        headers: { 'idempotency-key': key, ...headers },
        payload,
      });
      expect(response.statusCode, response.body).toBe(url === '/v1/auth/recovery' ? 202 : 200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-request-id']).toBeTruthy();
    },
  );

  it('uses normal JSON parsing for DELETE and rejects unknown schema fields as 400', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/auth/mfa/factors/${ids.factor}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { confirmOptionalLastFactor: true, unexpected: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation-failed' });
    expect(service.calls).toBe(0);
  });

  it('rejects an empty native refresh token before reaching the provider boundary', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/session/refresh',
      headers: { 'idempotency-key': key },
      payload: { client: 'native', foregroundEngaged: true, refreshToken: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation-failed' });
    expect(service.calls).toBe(0);
  });

  it('deduplicates same and concurrent bodies and rejects a changed-body key', async () => {
    const request = (allSessions: boolean) =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': key },
        payload: { allSessions },
      });
    const [first, second] = await Promise.all([request(false), request(false)]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(service.calls).toBe(1);
    const changed = await request(true);
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused' });
  });

  it('deduplicates refresh rotation by idempotency key before the provider boundary', async () => {
    const request = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/session/refresh',
        headers: { 'idempotency-key': key },
        payload: { client: 'native', foregroundEngaged: true, refreshToken: token },
      });
    const [first, replay] = await Promise.all([request(refreshToken), request(refreshToken)]);
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(service.calls).toBe(1);
    const changed = await request(`${refreshToken}-changed`);
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused' });
  });

  it.each([
    ['semantic failure', new ApiPolicyError('factor-type-unsupported', 422, 'TOTP only.'), 422],
    ['stale version', new ApiPolicyError('version-conflict', 409, 'Refresh first.'), 409],
    ['native Auth outage', new ApiPolicyError('vendor-unavailable', 503, 'Auth unavailable.'), 503],
  ] as const)('fails closed for %s', async (_name, failure, status) => {
    service.failure = failure;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': key },
      payload: { factorType: 'totp' },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code: failure.code });
  });

  it('never includes secret inputs in localized problem responses', async () => {
    service.failure = new ApiPolicyError('vendor-unavailable', 503, 'Auth unavailable.');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/session/refresh',
      headers: { 'idempotency-key': key, 'accept-language': 'ar-EG' },
      payload: { client: 'native', foregroundEngaged: true, refreshToken },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain(refreshToken);
  });
});
