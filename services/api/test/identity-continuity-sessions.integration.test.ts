import { describe, expect, it } from 'vitest';

import { evaluateSessionFreshness } from '@shifaa/core';
import { runRealSessionJourney } from './identity-continuity-session-harness.js';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_SESSIONS'] === 'true';

describe.skipIf(!enabled).sequential('007 real native session continuation and revocation', () => {
  it('enforces fake-clock token, configured, effective, foreground, and idle boundaries', () => {
    const base = Date.parse('2026-08-26T00:00:00.000Z');
    const input = {
      sessionStartedAtMs: base,
      lastActivityAtMs: base,
      foregroundEngaged: true,
    };
    expect(
      evaluateSessionFreshness({
        ...input,
        nowMs: base + 899_000,
        tokenExpiresAtMs: base + 900_000,
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateSessionFreshness({
        ...input,
        nowMs: base + 901_000,
        tokenExpiresAtMs: base + 900_000,
      }),
    ).toMatchObject({ allowed: false, reason: 'token-expired' });
    expect(
      evaluateSessionFreshness({
        ...input,
        nowMs: base + 45 * 60_000 + 1,
        tokenExpiresAtMs: base + 2 * 60 * 60_000,
      }),
    ).toMatchObject({ allowed: false, reason: 'idle-expired' });
    expect(
      evaluateSessionFreshness({
        ...input,
        nowMs: base + 23 * 60 * 60_000 + 45 * 60_000,
        lastActivityAtMs: base + 23 * 60 * 60_000,
        tokenExpiresAtMs: base + 25 * 60 * 60_000,
      }),
    ).toMatchObject({ allowed: false, reason: 'absolute-expired' });
    expect(
      evaluateSessionFreshness({
        ...input,
        nowMs: base + 1,
        tokenExpiresAtMs: base + 900_000,
        foregroundEngaged: false,
      }),
    ).toMatchObject({ allowed: false, reason: 'foreground-required' });
  });

  it('uses real Auth session rows for current/all cross-device revocation', async () => {
    const evidence = await runRealSessionJourney('en-EG');
    expect(evidence).toMatchObject({
      nativeRefreshStatus: 200,
      currentLogoutStatus: 200,
      secondDeviceContinued: true,
      globalLogoutStatus: 200,
      revokedChildStatus: 401,
      revokedWebChildStatus: 401,
      webRefreshStatus: 200,
      webResponseHasRefreshToken: false,
      webCookieStrict: true,
      contentLanguage: 'en-EG',
      currentCookieCleared: true,
      providerRefreshTokenLength: 12,
      refreshPersistenceCount: 0,
    });
    expect(evidence.auditCount).toBeGreaterThanOrEqual(4);
    for (const sentinel of evidence.tokenSentinels) {
      expect(evidence.durableText).not.toContain(sentinel);
    }
  });
});
