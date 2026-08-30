import type {
  ContinuityAuthPort,
  NativeSessionProjection,
  VerifiedContinuitySession,
} from '@shifaa/auth';
import { describe, expect, it, vi } from 'vitest';

import { StagedNativeCommandCoordinator } from './coordinator.js';
import { HmacRateLimiter, TransientReplayCipher, scopedPrincipal } from './security.js';
import { IdentityContinuityService } from './service.js';
import type { ContinuityAuditInput, ContinuityOutboxInput, ContinuityRepository } from './types.js';

const subjectId = '71000000-0000-4000-8000-000000000001';
const sessionId = '71000000-0000-4000-8000-000000000002';
const accessToken = 'synthetic-access-token-without-secret-authority';
const refreshToken = 'synthetic-refresh-token-000000000000000000';
const now = new Date('2026-08-26T00:00:00.000Z');

class FakeAuth implements ContinuityAuthPort {
  public readonly logoutCalls: Array<'local' | 'global'> = [];
  public aal: 1 | 2 = 1;
  public amr: ReadonlyArray<{ method: string; timestamp: number }> = [];
  public verifiedFactors: Array<{
    id: string;
    type: 'totp';
    status: 'verified';
    friendlyName: string | null;
    createdAt: string;
  }> = [];
  public pending: { id: string; createdAt: string } | undefined;
  public unenrolledIds: string[] = [];
  public enrollSecrets = new Map<string, string>();
  public afterUnenroll: () => void = () => undefined;
  public updatedRecoveredCredentials: string[] = [];
  public recoveryOtpAttempts: Array<{ handle: string; recoveryOtp: string }> = [];
  public restrictionWasStaged: () => boolean = () => true;

  private claims(): VerifiedContinuitySession {
    return {
      subjectId,
      sessionId,
      aal: this.aal,
      amr: this.amr.map((entry) => ({ ...entry })),
      expiresAt: now.getTime() / 1_000 + 900,
    };
  }
  public verifyAccessToken(token: string): Promise<VerifiedContinuitySession | undefined> {
    return Promise.resolve(token === accessToken ? this.claims() : undefined);
  }
  public refresh(token: string): Promise<NativeSessionProjection> {
    if (token !== refreshToken) return Promise.reject(new Error('unexpected refresh token'));
    return Promise.resolve({
      accessToken,
      refreshToken: `${refreshToken}-rotated`,
      sessionId,
      assurance: 'aal1',
      expiresAt: '2026-08-26T00:15:00.000Z',
    });
  }
  public logout(_token: string, scope: 'local' | 'global'): Promise<void> {
    this.logoutCalls.push(scope);
    return Promise.resolve();
  }
  public listFactors() {
    return Promise.resolve(this.verifiedFactors);
  }
  public enrollTotp(_token: string, _friendlyName?: string) {
    const enrollmentId = `71000000-0000-4000-8000-${String(this.enrollSecrets.size + 10).padStart(12, '0')}`;
    this.enrollSecrets.set(enrollmentId, 'SYNTHETICONETIMESECRET');
    return Promise.resolve({
      enrollmentId,
      secret: 'SYNTHETICONETIMESECRET',
      qrUri: 'data:image/svg+xml;utf8,<svg aria-label="synthetic"></svg>',
    });
  }
  public async verifyTotp(token: string, enrollmentId: string, code: string) {
    if (token !== accessToken || !this.enrollSecrets.has(enrollmentId) || code !== '123456')
      throw Object.assign(new Error('invalid code'), {
        code: 'factor-code-invalid',
        status: 422,
      });
    const factor = {
      id: enrollmentId,
      type: 'totp' as const,
      status: 'verified' as const,
      friendlyName: null,
      createdAt: new Date(now).toISOString(),
    };
    this.enrollSecrets.delete(enrollmentId);
    this.verifiedFactors = [...this.verifiedFactors, factor];
    return factor;
  }
  public async unenrollFactor(_token: string, factorId: string) {
    if (!this.verifiedFactors.some((factor) => factor.id === factorId))
      throw Object.assign(new Error('missing factor'), { code: 'not-found', status: 404 });
    this.unenrolledIds.push(factorId);
    this.verifiedFactors = this.verifiedFactors.filter((factor) => factor.id !== factorId);
    this.afterUnenroll();
  }
  public startRecovery() {
    return Promise.resolve();
  }
  public updateRecoveredCredential() {
    if (!this.restrictionWasStaged())
      return Promise.reject(new Error('recovery restriction was not staged'));
    return Promise.resolve();
  }
  public redeemRecoveryOtp(handle: string, recoveryOtp: string) {
    this.recoveryOtpAttempts.push({ handle, recoveryOtp });
    if (handle !== 'patient@synthetic.shifaa.test' || recoveryOtp !== '123456')
      return Promise.reject(
        Object.assign(new Error('invalid recovery OTP'), { code: 'recovery-challenge-invalid' }),
      );
    return Promise.resolve({
      subjectId,
      handle,
      session: {
        accessToken,
        sessionId,
        assurance: 'aal1' as const,
        expiresAt: '2026-08-26T00:15:00.000Z',
      },
    });
  }
  public signInWithPassword(handle: string, credential: string) {
    if (
      handle !== 'patient@synthetic.shifaa.test' ||
      credential !== 'Synthetic-Recovery-Credential!'
    )
      return Promise.reject(new Error('unexpected recovery sign-in'));
    return Promise.resolve({
      accessToken: 'synthetic-fresh-recovery-access-token',
      refreshToken: 'synthetic-fresh-recovery-refresh-token',
      sessionId: '71000000-0000-4000-8000-000000000034',
      assurance: 'aal1' as const,
      expiresAt: '2026-08-26T00:15:00.000Z',
    });
  }
}

class FakeRepository implements ContinuityRepository {
  public current = true;
  public staleAalAfterFactorMutation = false;
  public restriction: 'mfa_enrollment_only' | null = null;
  public readonly audits: ContinuityAuditInput[] = [];
  public readonly outbox: ContinuityOutboxInput[] = [];
  public readonly recoveryIntakes: Array<{
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
    expiresAt: string;
  }> = [];
  public readonly recoveryBindings: Array<{
    caseId: string;
    subjectId: string;
    handleDigest: Uint8Array;
  }> = [];
  public recoveryProofApproved = true;
  public failRecoveryFinalization = false;
  public readonly recoveryFinalizations: Array<{
    caseId: string;
    personId: string;
    sessionId: string;
    restricted: boolean;
  }> = [];
  public readonly recoveryRestrictionStages: Array<{ caseId: string; personId: string }> = [];
  public readonly transitionActions: Array<{
    action: 'submit_proof' | 'decide';
    relationshipId: string;
    expectedVersion: number;
    actorPersonId: string;
    verificationCaseId?: string;
    decision?: 'approve' | 'reject' | 'defer';
    purpose?: string;
    factorAmrAt?: string;
  }> = [];
  public markers = new Map<
    string,
    { enrollmentId: string; expiresAtMs: number; savedAt: number }
  >();
  public isNativeSessionCurrent(
    _sessionId: string,
    _subjectId: string,
    claimedAal: 1 | 2,
  ): Promise<boolean> {
    return Promise.resolve(this.current && !(this.staleAalAfterFactorMutation && claimedAal === 2));
  }
  public restrictionForSession() {
    return Promise.resolve(this.restriction);
  }
  public withSerializedFactorState<T>(_subjectId: string, work: () => Promise<T>): Promise<T> {
    return work();
  }
  public appendAudit(input: ContinuityAuditInput): Promise<void> {
    this.audits.push(input);
    return Promise.resolve();
  }
  public appendFactorChangedEvidence(input: {
    audit: ContinuityAuditInput;
    event: Omit<ContinuityOutboxInput, 'eventType' | 'payload'> & {
      eventType: 'identity.factor.changed';
      payload: {
        recipientPersonId: string;
        support_action: 'verified' | 'removed';
        action_time: string;
      };
    };
  }): Promise<void> {
    this.audits.push(input.audit);
    this.outbox.push(input.event);
    return Promise.resolve();
  }
  public resolveSubjectPerson(): Promise<string | undefined> {
    return Promise.resolve('71000000-0000-4000-8000-000000000004');
  }
  public accountClassForPerson(): Promise<'patient_optional_mfa' | 'workforce_mandatory_mfa'> {
    return Promise.resolve('patient_optional_mfa');
  }
  public async findPendingEnrollmentMarker(input: {
    markerKey: string;
    liveOnly: boolean;
  }): Promise<{ enrollmentId: string; expiresAtMs: number } | undefined> {
    const rows = [...this.markers.entries()].sort((a, b) => b[1].savedAt - a[1].savedAt);
    for (const [key, marker] of rows) {
      if (key !== input.markerKey) continue;
      if (input.liveOnly && marker.expiresAtMs <= now.getTime()) continue;
      return { enrollmentId: marker.enrollmentId, expiresAtMs: marker.expiresAtMs };
    }
    return undefined;
  }
  public async savePendingEnrollmentMarker(input: {
    markerKey: string;
    enrollmentId: string;
    expiresAt: string;
  }): Promise<void> {
    this.markers.set(input.markerKey, {
      enrollmentId: input.enrollmentId,
      expiresAtMs: Date.parse(input.expiresAt),
      savedAt: now.getTime(),
    });
  }
  public async consumePendingEnrollmentMarker(input: { markerKey: string }): Promise<void> {
    this.markers.delete(input.markerKey);
  }
  public completeRestrictedEnrollmentCase(): Promise<void> {
    return Promise.resolve();
  }
  public appendOutboxEvent(input: ContinuityOutboxInput): Promise<void> {
    this.outbox.push(input);
    return Promise.resolve();
  }
  public createRecoveryIntake(input: {
    caseId: string;
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
    expiresAt: string;
  }): Promise<void> {
    this.recoveryIntakes.push(input);
    return Promise.resolve();
  }
  public bindRecoveryIntake(input: {
    caseId: string;
    subjectId: string;
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
  }): Promise<{ personId: string }> {
    this.recoveryBindings.push({
      caseId: input.caseId,
      subjectId: input.subjectId,
      handleDigest: input.handleDigest,
    });
    return Promise.resolve({ personId: '71000000-0000-4000-8000-000000000004' });
  }
  public recoveryProofIsApproved(): Promise<boolean> {
    return Promise.resolve(this.recoveryProofApproved);
  }
  public stageRecoveryRestriction(input: { caseId: string; personId: string }): Promise<void> {
    this.recoveryRestrictionStages.push(input);
    return Promise.resolve();
  }
  public finalizeRecovery(input: {
    caseId: string;
    personId: string;
    sessionId: string;
    restricted: boolean;
  }): Promise<void> {
    if (this.failRecoveryFinalization) {
      this.failRecoveryFinalization = false;
      return Promise.reject(new Error('synthetic recovery finalization interruption'));
    }
    this.recoveryFinalizations.push(input);
    return Promise.resolve();
  }
  public submitTransitionProof(
    input: Parameters<ContinuityRepository['submitTransitionProof']>[0],
  ) {
    this.transitionActions.push({ action: 'submit_proof', ...input });
    return Promise.resolve(transitionResult('review_required', 2));
  }
  public decideTransition(input: Parameters<ContinuityRepository['decideTransition']>[0]) {
    this.transitionActions.push({ action: 'decide', ...input });
    const status =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'human_review_required';
    return Promise.resolve(transitionResult(status, input.expectedVersion + 1));
  }
}

function transitionResult(
  status: 'review_required' | 'human_review_required' | 'approved' | 'rejected',
  version: number,
) {
  return {
    caseId: '71000000-0000-4000-8000-000000000050',
    relationshipId: '71000000-0000-4000-8000-000000000051',
    patientId: '71000000-0000-4000-8000-000000000052',
    personId: '71000000-0000-4000-8000-000000000004',
    status,
    version,
    updatedAt: now.toISOString(),
  };
}

function transitionContext(label: string) {
  return {
    requestId: `71000000-0000-4000-8000-${label.padStart(12, '0').slice(-12)}`,
    idempotencyKey: `synthetic-${label.padEnd(20, '0')}`,
    accessToken,
  };
}

function service() {
  const auth = new FakeAuth();
  const repository = new FakeRepository();
  return {
    auth,
    repository,
    service: new IdentityContinuityService({
      auth,
      repository,
      allowedWebOrigins: new Set(['https://patient.synthetic.test']),
      hmacKey: Buffer.alloc(32, 6),
      now: () => now,
    }),
  };
}

describe('identity continuity transaction foundation', () => {
  it('encrypts one-time replay material and rejects it at the ten-minute boundary', () => {
    const cipher = new TransientReplayCipher(Buffer.alloc(32, 7));
    const envelope = cipher.seal(
      { secret: 'synthetic-totp-secret-never-plaintext' },
      new Date(now.getTime() + 10 * 60_000),
    );
    expect(JSON.stringify(envelope)).not.toContain('synthetic-totp-secret');
    expect(cipher.open(envelope, new Date(now.getTime() + 10 * 60_000 - 1))).toEqual({
      secret: 'synthetic-totp-secret-never-plaintext',
    });
    expect(() => cipher.open(envelope, new Date(now.getTime() + 10 * 60_000))).toThrow('expired');
  });

  it('uses route-scoped HMAC buckets without retaining the rate subject', () => {
    let timestamp = now.getTime();
    const limiter = new HmacRateLimiter(Buffer.alloc(32, 8), () => timestamp);
    expect(limiter.consume('refresh', sessionId, 2, 300_000)).toBeNull();
    expect(limiter.consume('refresh', sessionId, 2, 300_000)).toBeNull();
    expect(limiter.consume('refresh', sessionId, 2, 300_000)).toBe(300);
    expect(scopedPrincipal('refresh', sessionId, Buffer.alloc(32, 8))).not.toContain(sessionId);
    timestamp += 300_000;
    expect(limiter.consume('refresh', sessionId, 2, 300_000)).toBeNull();
  });

  it('bounds distinct live rate subjects and admits a new subject after expiry', () => {
    let timestamp = now.getTime();
    const limiter = new HmacRateLimiter(Buffer.alloc(32, 8), () => timestamp, 2);
    expect(limiter.consume('refresh', 'subject-one', 2, 300_000)).toBeNull();
    expect(limiter.consume('refresh', 'subject-two', 2, 300_000)).toBeNull();
    expect(limiter.consume('refresh', 'subject-three', 2, 300_000)).toBe(300);
    timestamp += 300_000;
    expect(limiter.consume('refresh', 'subject-three', 2, 300_000)).toBeNull();
  });

  it('marks a native success with failed commit for denial and reconciliation', async () => {
    const stages: string[] = [];
    const coordinator = new StagedNativeCommandCoordinator();
    await expect(
      coordinator.execute({
        journal: {
          reserve: async () => ({ commandId: 'one' }),
          nativeCompleted: async () => {
            stages.push('native-completed');
          },
          committed: async () => {
            stages.push('committed');
          },
          failed: async (_prepared, stage) => {
            stages.push(`failed-${stage}`);
          },
        },
        runNative: async () => ({ revoked: true }),
        commit: async () => {
          throw new Error('database unavailable');
        },
      }),
    ).rejects.toMatchObject({ code: 'continuity-reconciliation-required', status: 503 });
    expect(stages).toEqual(['native-completed', 'failed-commit']);
  });
});

describe('bounded session service', () => {
  it('refreshes a native session without placing either token in durable audit', async () => {
    const harness = service();
    const response = await harness.service.refreshSession(
      { requestId: '71000000-0000-4000-8000-000000000003', idempotencyKey: 'synthetic-key-0001' },
      { client: 'native', foregroundEngaged: true, refreshToken },
    );
    expect(response.refreshToken).toContain('rotated');
    expect(JSON.stringify(harness.repository.audits)).not.toContain('token');
    expect(harness.repository.audits).toHaveLength(1);
  });

  it('requires strict same-origin CSRF validation for the web cookie bridge', async () => {
    const harness = service();
    const context = {
      requestId: '71000000-0000-4000-8000-000000000003',
      idempotencyKey: 'synthetic-key-0002',
      refreshCookie: refreshToken,
      csrfCookie: 'synthetic-csrf-token',
      csrfHeader: 'synthetic-csrf-token',
      origin: 'https://patient.synthetic.test',
      fetchSite: 'same-origin',
    };
    await expect(
      harness.service.refreshSession(context, { client: 'web', foregroundEngaged: true }),
    ).resolves.toMatchObject({ sessionId });
    await expect(
      harness.service.refreshSession(
        { ...context, origin: 'https://hostile.invalid' },
        { client: 'web', foregroundEngaged: true },
      ),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('revokes current and all scopes while preserving logout without step-up', async () => {
    const harness = service();
    const context = {
      requestId: '71000000-0000-4000-8000-000000000003',
      idempotencyKey: 'synthetic-key-0003',
      accessToken,
    };
    await harness.service.logout(context, { allSessions: false });
    await harness.service.logout(context, { allSessions: true });
    expect(harness.auth.logoutCalls).toEqual(['local', 'global']);
    expect(harness.repository.audits.map((entry) => entry.metadata?.['scope'])).toEqual([
      'current',
      'all',
    ]);
  });

  it('fails closed before native logout when the current-session check denies', async () => {
    const harness = service();
    harness.repository.current = false;
    await expect(
      harness.service.logout(
        {
          requestId: '71000000-0000-4000-8000-000000000003',
          idempotencyKey: 'synthetic-key-0004',
          accessToken,
        },
        { allSessions: false },
      ),
    ).rejects.toMatchObject({ code: 'session-revoked', status: 401 });
    expect(harness.auth.logoutCalls).toEqual([]);
  });
});

describe('totp enrollment, verification, and removal service policy', () => {
  let clockMs = now.getTime();
  const context = (suffix: string) => ({
    requestId: `71000000-0000-4000-8000-00000000000${suffix}`,
    idempotencyKey: `synthetic-mfa-key-${suffix}`,
    accessToken,
  });

  function mfaService() {
    clockMs = now.getTime();
    const auth = new FakeAuth();
    const repository = new FakeRepository();
    auth.afterUnenroll = () => {
      repository.staleAalAfterFactorMutation = true;
    };
    const instance = new IdentityContinuityService({
      auth,
      repository,
      allowedWebOrigins: new Set(['https://patient.synthetic.test']),
      hmacKey: Buffer.alloc(32, 6),
      now: () => new Date(clockMs),
    });
    return { auth, repository, service: instance };
  }

  it('rejects unsupported factor types and duplicate pending enrollments before native calls', async () => {
    const harness = mfaService();
    await expect(
      harness.service.beginMfaEnrollment(context('1'), { factorType: 'passkey' }),
    ).rejects.toMatchObject({ code: 'factor-type-unsupported', status: 422 });
    harness.auth.amr = [{ method: 'password', timestamp: Math.floor(clockMs / 1_000) }];
    const started = await harness.service.beginMfaEnrollment(context('1'), { factorType: 'totp' });
    expect(started.factorType).toBe('totp');
    await expect(
      harness.service.beginMfaEnrollment(context('1'), { factorType: 'totp' }),
    ).rejects.toMatchObject({ code: 'factor-enrollment-pending', status: 409 });
    expect(harness.auth.enrollSecrets.size).toBe(1);
  });

  it('allows a rebinding begin once the previous enrollment completed verification', async () => {
    const harness = mfaService();
    harness.auth.amr = [{ method: 'password', timestamp: Math.floor(clockMs / 1_000) }];
    const first = await harness.service.beginMfaEnrollment(context('2'), { factorType: 'totp' });
    const verifiedFactor = await harness.service.verifyMfaEnrollment(context('2'), {
      enrollmentId: first.enrollmentId,
      code: '123456',
    });
    expect(verifiedFactor.assurance).toBe('aal2');
    harness.auth.aal = 2;
    harness.auth.amr = [{ method: 'totp', timestamp: Math.floor(clockMs / 1_000) }];
    const second = await harness.service.beginMfaEnrollment(context('2'), { factorType: 'totp' });
    expect(second.factorType).toBe('totp');
  });

  it('distinguishes fresh MFA step-up from fresh primary reauthentication for the first factor', async () => {
    const staleSeconds = now.getTime() / 1_000 - 301;
    const freshSeconds = now.getTime() / 1_000 - 299;
    const withoutProof = mfaService();
    await expect(
      withoutProof.service.beginMfaEnrollment(context('3'), { factorType: 'totp' }),
    ).rejects.toMatchObject({ code: 'identity-proof-required', status: 403 });
    const stalePrimary = mfaService();
    stalePrimary.auth.amr = [{ method: 'password', timestamp: staleSeconds }];
    await expect(
      stalePrimary.service.beginMfaEnrollment(context('3'), { factorType: 'totp' }),
    ).rejects.toMatchObject({ code: 'identity-proof-required', status: 403 });
    const freshPrimary = mfaService();
    freshPrimary.auth.amr = [{ method: 'password', timestamp: freshSeconds }];
    const started = await freshPrimary.service.beginMfaEnrollment(context('3'), {
      factorType: 'totp',
    });
    expect(started.factorType).toBe('totp');
    expect(started.expiresAt).toBe(new Date(clockMs + 10 * 60_000).toISOString());
    expect(JSON.stringify(freshPrimary.repository.audits)).not.toContain(started.secret);
    const rebinding = mfaService();
    rebinding.auth.verifiedFactors = [
      {
        id: '71000000-0000-4000-8000-000000000012',
        type: 'totp',
        status: 'verified',
        friendlyName: null,
        createdAt: new Date(clockMs).toISOString(),
      },
    ];
    await expect(
      rebinding.service.beginMfaEnrollment(context('3'), { factorType: 'totp' }),
    ).rejects.toMatchObject({ code: 'mfa-step-up-required', status: 403 });
    rebinding.auth.aal = 2;
    rebinding.auth.amr = [{ method: 'totp', timestamp: freshSeconds }];
    await expect(
      rebinding.service.beginMfaEnrollment(context('3'), { factorType: 'totp' }),
    ).resolves.toMatchObject({ factorType: 'totp' });
  });

  it('expires the pending enrollment at the ten-minute boundary and rejects foreign ids', async () => {
    const harness = mfaService();
    await expect(
      harness.service.verifyMfaEnrollment(context('4'), {
        enrollmentId: '71000000-0000-4000-8000-000000000099',
        code: '123456',
      }),
    ).rejects.toMatchObject({ code: 'factor-code-invalid', status: 422 });
    harness.auth.amr = [{ method: 'password', timestamp: Math.floor(clockMs / 1_000) }];
    const started = await harness.service.beginMfaEnrollment(context('4'), { factorType: 'totp' });
    clockMs += 10 * 60_000;
    await expect(
      harness.service.verifyMfaEnrollment(context('4'), {
        enrollmentId: started.enrollmentId,
        code: '123456',
      }),
    ).rejects.toMatchObject({ code: 'factor-enrollment-pending', status: 410 });
  });

  it('verifies a live enrollment once and completes a bound restricted case', async () => {
    const harness = mfaService();
    harness.repository.restriction = 'mfa_enrollment_only';
    harness.auth.amr = [{ method: 'password', timestamp: Math.floor(clockMs / 1_000) }];
    const started = await harness.service.beginMfaEnrollment(context('5'), { factorType: 'totp' });
    const result = await harness.service.verifyMfaEnrollment(context('5'), {
      enrollmentId: started.enrollmentId,
      code: '123456',
    });
    expect(result.assurance).toBe('aal2');
    expect(harness.auth.verifiedFactors).toHaveLength(1);
    expect(harness.repository.outbox).toEqual([
      {
        aggregateId: harness.auth.verifiedFactors[0]!.id,
        aggregateVersion: 1,
        eventType: 'identity.factor.changed',
        payload: {
          recipientPersonId: '71000000-0000-4000-8000-000000000004',
          support_action: 'verified',
          action_time: new Date(clockMs).toISOString(),
        },
      },
    ]);
    expect(JSON.stringify(harness.repository.outbox)).not.toContain('SYNTHETIC');
  });

  it('serializes removal races to one winner and applies last-factor rules per account class', async () => {
    const factorId = '71000000-0000-4000-8000-000000000015';
    const seconds = now.getTime() / 1_000 - 299;
    const patient = mfaService();
    patient.auth.aal = 2;
    patient.auth.amr = [{ method: 'totp', timestamp: seconds }];
    patient.auth.verifiedFactors = [
      { id: factorId, type: 'totp', status: 'verified', friendlyName: null, createdAt: '' },
    ];
    await expect(
      patient.service.removeMfaFactor(context('5'), factorId, {
        proofCaseId: null,
        confirmOptionalLastFactor: false,
      }),
    ).rejects.toMatchObject({ code: 'last-factor-removal-denied', status: 422 });
    const removal = await patient.service.removeMfaFactor(context('5'), factorId, {
      proofCaseId: null,
      confirmOptionalLastFactor: true,
    });
    expect(removal).toMatchObject({ removedFactorId: factorId, assurance: 'aal1' });
    await expect(
      patient.service.removeMfaFactor(context('6'), factorId, {
        proofCaseId: null,
        confirmOptionalLastFactor: true,
      }),
    ).rejects.toMatchObject({ code: 'session-revoked', status: 401 });
    const workforce = mfaService();
    workforce.repository.accountClassForPerson = () =>
      Promise.resolve('workforce_mandatory_mfa' as const);
    workforce.auth.aal = 2;
    workforce.auth.amr = [{ method: 'totp', timestamp: seconds }];
    workforce.auth.verifiedFactors = [
      { id: factorId, type: 'totp', status: 'verified', friendlyName: null, createdAt: '' },
    ];
    await expect(
      workforce.service.removeMfaFactor(context('5'), factorId, {
        proofCaseId: null,
        confirmOptionalLastFactor: true,
      }),
    ).rejects.toMatchObject({ code: 'last-factor-removal-denied', status: 422 });
    expect(workforce.auth.unenrolledIds).toEqual([]);
  });

  it('denies removal without a fresh qualifying MFA proof even with verified factors', async () => {
    const factorId = '71000000-0000-4000-8000-000000000016';
    const harness = mfaService();
    harness.auth.verifiedFactors = [
      { id: factorId, type: 'totp', status: 'verified', friendlyName: null, createdAt: '' },
    ];
    await expect(
      harness.service.removeMfaFactor(context('7'), factorId, {
        proofCaseId: null,
        confirmOptionalLastFactor: true,
      }),
    ).rejects.toMatchObject({ code: 'mfa-step-up-required', status: 403 });
    expect(harness.auth.unenrolledIds).toEqual([]);
  });
});

describe('dependent transition service policy', () => {
  it('submits verified proof and forwards a fresh purpose-bound decision to PostgreSQL', async () => {
    const harness = service();
    const relationshipId = '71000000-0000-4000-8000-000000000051';
    const verificationCaseId = '71000000-0000-4000-8000-000000000053';
    const submitted = await harness.service.transitionDependent(
      transitionContext('101'),
      relationshipId,
      { action: 'submit_proof', verificationCaseId },
      1,
    );
    expect(submitted).toMatchObject({ status: 'review_required', version: 2 });
    const factorAt = Math.floor(now.getTime() / 1_000) - 300;
    harness.auth.aal = 2;
    harness.auth.amr = [{ method: 'totp', timestamp: factorAt }];
    const decided = await harness.service.transitionDependent(
      { ...transitionContext('102'), purpose: 'guardianship_review' },
      relationshipId,
      { action: 'decide', decision: 'approve', reasonCode: 'human_review.approved' },
      2,
    );
    expect(decided).toMatchObject({ status: 'approved', version: 3 });
    expect(harness.repository.transitionActions).toMatchObject([
      { action: 'submit_proof', relationshipId, verificationCaseId, expectedVersion: 1 },
      {
        action: 'decide',
        relationshipId,
        decision: 'approve',
        expectedVersion: 2,
        purpose: 'guardianship_review',
        factorAmrAt: new Date(factorAt * 1_000).toISOString(),
      },
    ]);
  });

  it.each([299, 300])('allows a qualifying factor at %s seconds', async (ageSeconds) => {
    const harness = service();
    harness.auth.aal = 2;
    harness.auth.amr = [
      { method: 'totp', timestamp: Math.floor(now.getTime() / 1_000) - ageSeconds },
    ];
    await expect(
      harness.service.transitionDependent(
        { ...transitionContext(String(ageSeconds)), purpose: 'guardianship_review' },
        '71000000-0000-4000-8000-000000000051',
        { action: 'decide', decision: 'reject', reasonCode: 'human_review.rejected' },
        2,
      ),
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  it('denies stale MFA, missing purpose, and defer without a controlling blocker before PostgreSQL', async () => {
    const relationshipId = '71000000-0000-4000-8000-000000000051';
    const stale = service();
    stale.auth.aal = 2;
    stale.auth.amr = [{ method: 'totp', timestamp: Math.floor(now.getTime() / 1_000) - 301 }];
    await expect(
      stale.service.transitionDependent(
        { ...transitionContext('301'), purpose: 'guardianship_review' },
        relationshipId,
        { action: 'decide', decision: 'approve', reasonCode: 'human_review.approved' },
        2,
      ),
    ).rejects.toMatchObject({ code: 'mfa-step-up-required', status: 403 });
    const missingPurpose = service();
    missingPurpose.auth.aal = 2;
    missingPurpose.auth.amr = [{ method: 'totp', timestamp: Math.floor(now.getTime() / 1_000) }];
    await expect(
      missingPurpose.service.transitionDependent(
        transitionContext('302'),
        relationshipId,
        { action: 'decide', decision: 'approve', reasonCode: 'human_review.approved' },
        2,
      ),
    ).rejects.toMatchObject({ code: 'purpose-required', status: 403 });
    await expect(
      missingPurpose.service.transitionDependent(
        { ...transitionContext('303'), purpose: 'guardianship_review' },
        relationshipId,
        { action: 'decide', decision: 'defer', reasonCode: 'human_review.deferred' },
        2,
      ),
    ).rejects.toMatchObject({ code: 'human-review-required', status: 409 });
  });
});

describe('recovery service policy', () => {
  it('denies remove and transition outside the exact four-operation restricted registry', async () => {
    const harness = service();
    harness.repository.restriction = 'mfa_enrollment_only';
    const restrictedContext = {
      requestId: '71000000-0000-4000-8000-000000000040',
      idempotencyKey: 'synthetic-restricted-registry',
      accessToken,
    };
    await expect(
      harness.service.removeMfaFactor(restrictedContext, '71000000-0000-4000-8000-000000000015', {
        proofCaseId: null,
        confirmOptionalLastFactor: true,
      }),
    ).rejects.toMatchObject({ code: 'recovery-mfa-enrollment-required', status: 403 });
    await expect(
      harness.service.transitionDependent(
        restrictedContext,
        '71000000-0000-4000-8000-000000000016',
        {
          action: 'submit_proof',
          verificationCaseId: '71000000-0000-4000-8000-000000000017',
        },
        1,
      ),
    ).rejects.toMatchObject({ code: 'recovery-mfa-enrollment-required', status: 403 });
  });

  it('accepts anonymous recovery intake without revealing the supplied handle', async () => {
    const harness = service();
    const response = await harness.service.startRecovery(
      {
        requestId: '71000000-0000-4000-8000-000000000031',
        idempotencyKey: 'synthetic-recovery-key-0001',
      },
      { handle: 'patient@synthetic.shifaa.test', locale: 'ar-EG' },
    );

    expect(response).toMatchObject({ status: 'accepted', messageCode: 'recovery.accepted' });
    expect(JSON.stringify(response)).not.toContain('patient@synthetic.shifaa.test');
    expect(harness.repository.recoveryIntakes).toHaveLength(1);
    expect(harness.repository.recoveryIntakes[0]!.handleDigest).toHaveLength(32);
    expect(harness.repository.recoveryIntakes[0]!.caseTokenDigest).toHaveLength(32);
    expect(JSON.stringify(harness.repository.recoveryIntakes)).not.toContain(response.caseToken);
    expect(harness.repository.recoveryIntakes[0]!.expiresAt).toBe('2026-08-26T00:15:00.000Z');
  });

  it('redeems a matching recovery OTP before binding, revocation, and fresh sign-in', async () => {
    const harness = service();
    const result = await harness.service.completeRecovery(
      {
        requestId: '71000000-0000-4000-8000-000000000035',
        idempotencyKey: 'synthetic-recovery-key-0002',
      },
      '71000000-0000-4000-8000-000000000032',
      {
        caseToken: 'synthetic-case-token-00000000000000000000',
        handle: 'patient@synthetic.shifaa.test',
        recoveryOtp: '123456',
        proofMethod: 'repeated_identity_proof',
        verificationCaseId: '71000000-0000-4000-8000-000000000033',
        newCredential: 'Synthetic-Recovery-Credential!',
      },
    );

    expect(result).toMatchObject({
      status: 'restricted_enrollment',
      session: { sessionId: '71000000-0000-4000-8000-000000000034' },
    });
    expect(harness.repository.recoveryBindings).toHaveLength(1);
    expect(harness.auth.logoutCalls).toEqual(['global']);
    expect(harness.repository.recoveryFinalizations).toMatchObject([
      {
        caseId: '71000000-0000-4000-8000-000000000032',
        personId: '71000000-0000-4000-8000-000000000004',
        sessionId: '71000000-0000-4000-8000-000000000034',
        restricted: true,
      },
    ]);
    expect(JSON.stringify(harness.repository.audits)).not.toContain(
      'Synthetic-Recovery-Credential!',
    );
  });

  it('stages a subject-wide recovery restriction before changing native credentials', async () => {
    const harness = service();
    harness.auth.restrictionWasStaged = () =>
      harness.repository.recoveryRestrictionStages.length === 1;

    await harness.service.prepareRecoveryCompletion(
      {
        requestId: '71000000-0000-4000-8000-000000000038',
        idempotencyKey: 'synthetic-recovery-key-0005',
      },
      '71000000-0000-4000-8000-000000000032',
      {
        caseToken: 'synthetic-case-token-00000000000000000000',
        handle: 'patient@synthetic.shifaa.test',
        recoveryOtp: '123456',
        proofMethod: 'repeated_identity_proof',
        verificationCaseId: '71000000-0000-4000-8000-000000000033',
        newCredential: 'Synthetic-Recovery-Credential!',
      },
    );

    expect(harness.repository.recoveryRestrictionStages).toEqual([
      {
        caseId: '71000000-0000-4000-8000-000000000032',
        personId: '71000000-0000-4000-8000-000000000004',
      },
    ]);
  });

  it('rejects ordinary sessions, malformed proof combinations, and invalid OTPs before binding or revocation', async () => {
    const harness = service();
    const context = {
      requestId: '71000000-0000-4000-8000-000000000036',
      idempotencyKey: 'synthetic-recovery-key-0003',
      accessToken,
    };
    const base = {
      caseToken: 'synthetic-case-token-00000000000000000000',
      handle: 'patient@synthetic.shifaa.test',
      proofMethod: 'bound_factor_independent_method' as const,
      factorEvidence: '123456',
      newCredential: 'Synthetic-Recovery-Credential!',
    };
    await expect(
      harness.service.completeRecovery(context, '71000000-0000-4000-8000-000000000032', {
        ...base,
        recoveryOtp: 'wrong',
      }),
    ).rejects.toMatchObject({ code: 'recovery-challenge-invalid' });
    await expect(
      harness.service.completeRecovery(context, '71000000-0000-4000-8000-000000000032', {
        ...base,
        proofMethod: 'repeated_identity_proof',
        factorEvidence: null,
        recoveryOtp: '123456',
      }),
    ).rejects.toMatchObject({ code: 'identity-proof-required' });
    expect(harness.repository.recoveryBindings).toHaveLength(0);
    expect(harness.repository.recoveryFinalizations).toHaveLength(0);
    expect(harness.auth.logoutCalls).toEqual([]);
    expect(harness.auth.recoveryOtpAttempts).toEqual([
      { handle: 'patient@synthetic.shifaa.test', recoveryOtp: 'wrong' },
    ]);
  });

  it('resumes a staged recovery finalization without replaying the provider OTP or native credential work', async () => {
    const harness = service();
    const prepared = await harness.service.prepareRecoveryCompletion(
      {
        requestId: '71000000-0000-4000-8000-000000000037',
        idempotencyKey: 'synthetic-recovery-key-0004',
      },
      '71000000-0000-4000-8000-000000000032',
      {
        caseToken: 'synthetic-case-token-00000000000000000000',
        handle: 'patient@synthetic.shifaa.test',
        recoveryOtp: '123456',
        proofMethod: 'repeated_identity_proof',
        verificationCaseId: '71000000-0000-4000-8000-000000000033',
        newCredential: 'Synthetic-Recovery-Credential!',
      },
    );
    harness.repository.failRecoveryFinalization = true;
    await expect(harness.service.commitRecoveryCompletion(prepared)).rejects.toThrow(
      'synthetic recovery finalization interruption',
    );
    await expect(harness.service.commitRecoveryCompletion(prepared)).resolves.toMatchObject({
      status: 'restricted_enrollment',
    });
    expect(harness.auth.recoveryOtpAttempts).toEqual([
      { handle: 'patient@synthetic.shifaa.test', recoveryOtp: '123456' },
    ]);
    expect(harness.auth.logoutCalls).toEqual(['global']);
    expect(harness.repository.recoveryFinalizations).toHaveLength(1);
  });
});
