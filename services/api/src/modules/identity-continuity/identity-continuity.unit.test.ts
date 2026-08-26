import type {
  ContinuityAuthPort,
  NativeSessionProjection,
  VerifiedContinuitySession,
} from '@shifaa/auth';
import { describe, expect, it, vi } from 'vitest';

import { StagedNativeCommandCoordinator } from './coordinator.js';
import { HmacRateLimiter, TransientReplayCipher, scopedPrincipal } from './security.js';
import { IdentityContinuityService } from './service.js';
import type { ContinuityAuditInput, ContinuityRepository } from './types.js';

const subjectId = '71000000-0000-4000-8000-000000000001';
const sessionId = '71000000-0000-4000-8000-000000000002';
const accessToken = 'synthetic-access-token-without-secret-authority';
const refreshToken = 'synthetic-refresh-token-000000000000000000';
const now = new Date('2026-08-26T00:00:00.000Z');

class FakeAuth implements ContinuityAuthPort {
  public readonly logoutCalls: Array<'local' | 'global'> = [];
  public verifyAccessToken(token: string): Promise<VerifiedContinuitySession | undefined> {
    return Promise.resolve(
      token === accessToken
        ? { subjectId, sessionId, aal: 1, amr: [], expiresAt: now.getTime() / 1_000 + 900 }
        : undefined,
    );
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
    return Promise.resolve([]);
  }
  public enrollTotp() {
    return Promise.reject(new Error('not used'));
  }
  public verifyTotp() {
    return Promise.reject(new Error('not used'));
  }
  public unenrollFactor() {
    return Promise.resolve();
  }
  public startRecovery() {
    return Promise.resolve();
  }
  public updateRecoveredCredential() {
    return Promise.resolve();
  }
}

class FakeRepository implements ContinuityRepository {
  public current = true;
  public restriction: 'mfa_enrollment_only' | null = null;
  public readonly audits: ContinuityAuditInput[] = [];
  public isNativeSessionCurrent(): Promise<boolean> {
    return Promise.resolve(this.current);
  }
  public restrictionForSession() {
    return Promise.resolve(this.restriction);
  }
  public appendAudit(input: ContinuityAuditInput): Promise<void> {
    this.audits.push(input);
    return Promise.resolve();
  }
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
