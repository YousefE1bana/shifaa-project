import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authClient,
  buildMfaHarness,
  confirmedSignup,
  currentTotp,
  supabaseStatus,
  type MfaHarness,
  type SupabaseStatus,
} from './identity-continuity-mfa-harness.js';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_RECOVERY'] === 'true';
const initialCredential = 'Synthetic-007-Recovery-Initial!';
const replacementCredential = 'Synthetic-007-Recovery-Replaced!';

function percentile95(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]!;
}

async function recoveryOtp(
  runtime: SupabaseStatus,
  email: string,
  previousIds: ReadonlySet<string>,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${runtime.MAILPIT_URL}/api/v1/messages`).then(
      (response) =>
        response.json() as Promise<{
          messages?: Array<{ ID: string; To?: Array<{ Address: string }> }>;
        }>,
    );
    const message = list.messages?.find(
      (candidate) =>
        !previousIds.has(candidate.ID) &&
        candidate.To?.some((recipient) => recipient.Address === email),
    );
    if (message) {
      const detail = await fetch(`${runtime.MAILPIT_URL}/api/v1/message/${message.ID}`).then(
        (response) => response.json() as Promise<{ Text?: string }>,
      );
      const code = /\b\d{6}\b/.exec(detail.Text ?? '')?.[0];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Synthetic recovery OTP was not delivered.');
}

async function mailboxIds(runtime: SupabaseStatus, email: string): Promise<Set<string>> {
  const list = await fetch(`${runtime.MAILPIT_URL}/api/v1/messages`).then(
    (response) =>
      response.json() as Promise<{
        messages?: Array<{ ID: string; To?: Array<{ Address: string }> }>;
      }>,
  );
  return new Set(
    list.messages
      ?.filter((message) => message.To?.some((recipient) => recipient.Address === email))
      .map((message) => message.ID),
  );
}

describe.skipIf(!enabled).sequential('007 recovery completion with native Supabase OTP', () => {
  let runtime: SupabaseStatus;
  let harness: MfaHarness;

  beforeAll(async () => {
    runtime = supabaseStatus();
    harness = await buildMfaHarness(runtime);
  });

  afterAll(async () => harness.close());

  it('returns fixed-shape anonymous acceptance for existing and nonexistent handles', async () => {
    const existingEmail = `recovery-existing-${randomUUID()}@synthetic.shifaa.test`;
    await confirmedSignup(runtime, existingEmail, initialCredential);
    const [existing, nonexistent] = await Promise.all([
      harness.inject({
        method: 'POST',
        url: '/v1/auth/recovery',
        headers: { 'idempotency-key': `recovery-existing-${randomUUID()}` },
        payload: { handle: existingEmail, locale: 'en-EG' },
      }),
      harness.inject({
        method: 'POST',
        url: '/v1/auth/recovery',
        headers: { 'idempotency-key': `recovery-missing-${randomUUID()}` },
        payload: {
          handle: `recovery-missing-${randomUUID()}@synthetic.shifaa.test`,
          locale: 'en-EG',
        },
      }),
    ]);
    expect(existing.statusCode).toBe(202);
    expect(nonexistent.statusCode).toBe(202);
    expect(Object.keys(existing.json()).sort()).toEqual(Object.keys(nonexistent.json()).sort());
    expect(existing.body.length).toBe(nonexistent.body.length);
    expect(existing.json()).toMatchObject({ status: 'accepted', messageCode: 'recovery.accepted' });
    expect(nonexistent.json()).toMatchObject({
      status: 'accepted',
      messageCode: 'recovery.accepted',
    });
  });

  it('keeps 100 existing and 100 nonexistent warmed recovery starts within the 50ms p95 oracle budget', async () => {
    const existingHandles: string[] = [];
    for (let batch = 0; batch < 21; batch += 1) {
      const accounts = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const email = `recovery-timing-${randomUUID()}@synthetic.shifaa.test`;
          await confirmedSignup(runtime, email, initialCredential);
          return email;
        }),
      );
      existingHandles.push(...accounts);
    }
    const nonexistentHandles = Array.from(
      { length: 105 },
      () => `recovery-timing-missing-${randomUUID()}@synthetic.shifaa.test`,
    );
    const measure = async (handle: string, index: number) => {
      const started = performance.now();
      const response = await harness.service.startRecovery(
        {
          requestId: randomUUID(),
          idempotencyKey: `recovery-timing-${index}-${randomUUID()}`,
        },
        { handle, locale: index % 2 === 0 ? 'ar-EG' : 'en-EG' },
      );
      const elapsed = performance.now() - started;
      expect(Object.keys(response).toSorted()).toEqual([
        'caseId',
        'caseToken',
        'messageCode',
        'status',
      ]);
      expect(response.status).toBe('accepted');
      return elapsed;
    };
    for (let index = 0; index < 5; index += 1) {
      await measure(existingHandles[index]!, -index - 1);
      await measure(nonexistentHandles[index]!, -index - 101);
    }
    const existingMs: number[] = [];
    const nonexistentMs: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      existingMs.push(await measure(existingHandles[index + 5]!, index));
      nonexistentMs.push(await measure(nonexistentHandles[index + 5]!, index + 100));
    }
    const existingP95 = percentile95(existingMs);
    const nonexistentP95 = percentile95(nonexistentMs);
    const deltaMs = Math.abs(existingP95 - nonexistentP95);
    console.info(
      JSON.stringify({
        evidence: 'T029-recovery-no-oracle',
        existingAttempts: existingMs.length,
        nonexistentAttempts: nonexistentMs.length,
        existingP95Ms: Number(existingP95.toFixed(3)),
        nonexistentP95Ms: Number(nonexistentP95.toFixed(3)),
        deltaMs: Number(deltaMs.toFixed(3)),
      }),
    );
    expect(deltaMs).toBeLessThanOrEqual(50);
  }, 120_000);

  it('rejects a valid cross-account recovery OTP against a different intake without exposing the account', async () => {
    const firstEmail = `recovery-first-${randomUUID()}@synthetic.shifaa.test`;
    const secondEmail = `recovery-second-${randomUUID()}@synthetic.shifaa.test`;
    await confirmedSignup(runtime, firstEmail, initialCredential);
    await confirmedSignup(runtime, secondEmail, initialCredential);
    const firstStart = await harness.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      headers: { 'idempotency-key': `recovery-first-start-${randomUUID()}` },
      payload: { handle: firstEmail, locale: 'en-EG' },
    });
    const intake = firstStart.json<{ caseId: string; caseToken: string }>();
    const existing = await mailboxIds(runtime, secondEmail);
    await harness.authAdapter.startRecovery(secondEmail);
    const response = await harness.inject({
      method: 'POST',
      url: `/v1/auth/recovery/${intake.caseId}/complete`,
      headers: { 'idempotency-key': `recovery-cross-account-${randomUUID()}` },
      payload: {
        caseToken: intake.caseToken,
        handle: secondEmail,
        recoveryOtp: await recoveryOtp(runtime, secondEmail, existing),
        proofMethod: 'bound_factor_independent_method',
        factorEvidence: '000000',
        newCredential: replacementCredential,
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'recovery-challenge-invalid' });
    expect(response.body).not.toContain(firstEmail);
    expect(response.body).not.toContain(secondEmail);
  });

  it('binds an unbound intake only after provider OTP, then revokes old sessions and returns a fresh session', async () => {
    const email = `recovery-${randomUUID()}@synthetic.shifaa.test`;
    const original = await confirmedSignup(runtime, email, initialCredential);
    await harness.seedPerson(original.userId, email);
    const enrollment = await harness.authAdapter.enrollTotp(
      original.accessToken,
      'Recovery factor',
    );
    await harness.authAdapter.verifyTotp(
      original.accessToken,
      enrollment.enrollmentId,
      currentTotp(enrollment.secret),
    );
    const previousIds = await mailboxIds(runtime, email);

    const started = await harness.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      headers: { 'idempotency-key': `recovery-start-${randomUUID()}` },
      payload: { handle: email, locale: 'en-EG' },
    });
    expect(started.statusCode, started.body).toBe(202);
    const intake = started.json<{ caseId: string; caseToken: string }>();
    const completed = await harness.inject({
      method: 'POST',
      url: `/v1/auth/recovery/${intake.caseId}/complete`,
      headers: { 'idempotency-key': `recovery-complete-${randomUUID()}` },
      payload: {
        caseToken: intake.caseToken,
        handle: email,
        recoveryOtp: await recoveryOtp(runtime, email, previousIds),
        proofMethod: 'bound_factor_independent_method',
        factorEvidence: currentTotp(enrollment.secret),
        newCredential: replacementCredential,
      },
    });
    expect(completed.statusCode, completed.body).toBe(200);
    const result = completed.json<{
      status: string;
      session: { accessToken: string; sessionId: string };
    }>();
    expect(result.status).toBe('completed');
    expect(result.session.accessToken).not.toBe(original.accessToken);

    const oldRefresh = await authClient(runtime).auth.refreshSession({
      refresh_token: original.refreshToken,
    });
    expect(oldRefresh.error).toBeTruthy();
    const fresh = await authClient(runtime).auth.getUser(result.session.accessToken);
    expect(fresh.data.user?.id).toBe(original.userId);

    const replayMessages = await mailboxIds(runtime, email);
    await harness.authAdapter.startRecovery(email);
    const replay = await harness.inject({
      method: 'POST',
      url: `/v1/auth/recovery/${intake.caseId}/complete`,
      headers: { 'idempotency-key': `recovery-replay-${randomUUID()}` },
      payload: {
        caseToken: intake.caseToken,
        handle: email,
        recoveryOtp: await recoveryOtp(runtime, email, replayMessages),
        proofMethod: 'bound_factor_independent_method',
        factorEvidence: currentTotp(enrollment.secret),
        newCredential: replacementCredential,
      },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: 'recovery-challenge-invalid' });
  });

  it('enforces the 15-minute case lifetime after a valid provider OTP', async () => {
    const email = `recovery-expired-${randomUUID()}@synthetic.shifaa.test`;
    const account = await confirmedSignup(runtime, email, initialCredential);
    await harness.seedPerson(account.userId, email);
    const previousIds = await mailboxIds(runtime, email);
    const started = await harness.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      headers: { 'idempotency-key': `recovery-expired-start-${randomUUID()}` },
      payload: { handle: email, locale: 'en-EG' },
    });
    const intake = started.json<{ caseId: string; caseToken: string }>();
    await harness.ownerSql(
      (sql) => sql`
      update identity.continuity_cases set expires_at=created_at+interval '1 millisecond'
      where id=${intake.caseId}::uuid`,
    );
    const response = await harness.inject({
      method: 'POST',
      url: `/v1/auth/recovery/${intake.caseId}/complete`,
      headers: { 'idempotency-key': `recovery-expired-complete-${randomUUID()}` },
      payload: {
        caseToken: intake.caseToken,
        handle: email,
        recoveryOtp: await recoveryOtp(runtime, email, previousIds),
        proofMethod: 'bound_factor_independent_method',
        factorEvidence: '000000',
        newCredential: replacementCredential,
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'recovery-challenge-invalid' });
  });

  it('allows exactly one concurrent completion winner for the provider OTP and case token', async () => {
    const email = `recovery-race-${randomUUID()}@synthetic.shifaa.test`;
    const account = await confirmedSignup(runtime, email, initialCredential);
    await harness.seedPerson(account.userId, email);
    const enrollment = await harness.authAdapter.enrollTotp(account.accessToken, 'Race factor');
    await harness.authAdapter.verifyTotp(
      account.accessToken,
      enrollment.enrollmentId,
      currentTotp(enrollment.secret),
    );
    const previousIds = await mailboxIds(runtime, email);
    const started = await harness.inject({
      method: 'POST',
      url: '/v1/auth/recovery',
      headers: { 'idempotency-key': `recovery-race-start-${randomUUID()}` },
      payload: { handle: email, locale: 'en-EG' },
    });
    const intake = started.json<{ caseId: string; caseToken: string }>();
    const payload = {
      caseToken: intake.caseToken,
      handle: email,
      recoveryOtp: await recoveryOtp(runtime, email, previousIds),
      proofMethod: 'bound_factor_independent_method' as const,
      factorEvidence: currentTotp(enrollment.secret),
      newCredential: replacementCredential,
    };
    const completions = await Promise.all([
      harness.inject({
        method: 'POST',
        url: `/v1/auth/recovery/${intake.caseId}/complete`,
        headers: { 'idempotency-key': `recovery-race-a-${randomUUID()}` },
        payload,
      }),
      harness.inject({
        method: 'POST',
        url: `/v1/auth/recovery/${intake.caseId}/complete`,
        headers: { 'idempotency-key': `recovery-race-b-${randomUUID()}` },
        payload,
      }),
    ]);
    expect(completions.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(completions.filter((response) => response.statusCode !== 200)).toHaveLength(1);
  });
});
