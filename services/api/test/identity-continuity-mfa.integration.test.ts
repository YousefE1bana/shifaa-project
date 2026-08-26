import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  buildMfaHarness,
  confirmedSignup,
  currentTotp,
  freshPasswordLogin,
  supabaseStatus,
  type MfaHarness,
  type SupabaseStatus,
} from './identity-continuity-mfa-harness.js';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_MFA'] === 'true';
const password = 'Synthetic-007-Mfa-Stack!';

let runtime: SupabaseStatus;
let harness: MfaHarness;

interface Actor {
  email: string;
  accessToken: string;
  refreshToken: string;
}

function key(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

async function createPatientActor(prefix: string): Promise<Actor> {
  const email = `${prefix}-${randomUUID()}@synthetic.shifaa.test`;
  const signup = await confirmedSignup(runtime, email, password);
  await harness.seedPerson(signup.userId, email);
  return { email, ...signup };
}

function decodeTotpTimestamp(accessToken: string): number {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'),
  ) as { amr?: Array<{ method: string; timestamp: number }> };
  const stamps = (payload.amr ?? [])
    .filter((entry) => entry.method === 'totp')
    .map((entry) => entry.timestamp);
  if (!stamps.length) throw new Error('Synthetic token carries no qualifying totp amr event.');
  return Math.max(...stamps);
}

function decodeNativeSession(accessToken: string): { subjectId: string; sessionId: string } {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'),
  ) as { sub?: unknown; session_id?: unknown };
  if (typeof payload.sub !== 'string' || typeof payload.session_id !== 'string') {
    throw new Error('Synthetic token carries no native session binding.');
  }
  return { subjectId: payload.sub, sessionId: payload.session_id };
}

async function beginEnrollment(accessToken: string, friendlyName?: string): Promise<Outcome> {
  const response = await harness.inject({
    method: 'POST',
    url: '/v1/auth/mfa/enroll',
    headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': key('mfa-begin') },
    payload: { factorType: 'totp', ...(friendlyName ? { friendlyName } : {}) },
  });
  return { status: response.statusCode, body: response.json() };
}

async function verifyEnrollment(
  accessToken: string,
  enrollmentId: string,
  code: string,
): Promise<Outcome> {
  const response = await harness.inject({
    method: 'POST',
    url: '/v1/auth/mfa/enroll/verify',
    headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': key('mfa-verify') },
    payload: { enrollmentId, code },
  });
  return { status: response.statusCode, body: response.json() };
}

async function removeFactor(
  accessToken: string,
  factorId: string,
  confirmOptionalLastFactor: boolean,
  idempotencyKey = key('mfa-remove'),
): Promise<Outcome> {
  const response = await harness.inject({
    method: 'DELETE',
    url: `/v1/auth/mfa/factors/${factorId}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    payload: { proofCaseId: null, confirmOptionalLastFactor },
  });
  return { status: response.statusCode, body: response.json() };
}

async function enrollVerifiedFactor(actor: Actor, friendlyName?: string): Promise<string> {
  const begin = await beginEnrollment(actor.accessToken, friendlyName);
  expect(begin.status, JSON.stringify(begin.body)).toBe(200);
  const verify = await verifyEnrollment(
    actor.accessToken,
    String(begin.body['enrollmentId']),
    currentTotp(String(begin.body['secret'])),
  );
  expect(verify.status, JSON.stringify(verify.body)).toBe(200);
  return (verify.body['factor'] as { id: string }).id;
}

async function createActorWithVerifiedFactor(
  prefix: string,
): Promise<{ actor: Actor; factorId: string }> {
  harness.setClockOffsetMs(0);
  let actor = await createPatientActor(prefix);
  const factorId = await enrollVerifiedFactor(actor, `Synthetic ${prefix} factor`);
  actor = await rotate(actor);
  return { actor, factorId };
}

async function rotate(actor: Actor): Promise<Actor> {
  const projected = await harness.authAdapter.refresh(actor.refreshToken);
  return { ...actor, accessToken: projected.accessToken, refreshToken: projected.refreshToken! };
}

async function setOffsetForAge(accessToken: string, ageSeconds: number): Promise<void> {
  const totpAt = decodeTotpTimestamp(accessToken);
  harness.setClockOffsetMs((totpAt + ageSeconds) * 1_000 - Date.now());
}

beforeAll(async () => {
  runtime = supabaseStatus();
  harness = await buildMfaHarness(runtime);
});

afterEach(() => {
  harness.setClockOffsetMs(0);
});

afterAll(async () => {
  await harness?.close();
});

describe.skipIf(!enabled).sequential('007 real native TOTP enrollment and removal', () => {
  it('serializes concurrent pending enrollment creation to one native factor', async () => {
    const actor = await createPatientActor('mfa-pending-race');
    const responses = await Promise.all([
      beginEnrollment(actor.accessToken, 'Synthetic pending race one'),
      beginEnrollment(actor.accessToken, 'Synthetic pending race two'),
    ]);
    try {
      expect(
        responses.map((response) => response.status).sort((left, right) => left - right),
      ).toEqual([200, 409]);
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    } finally {
      await Promise.all(
        responses
          .filter((response) => response.status === 200)
          .map((response) =>
            harness.authAdapter.unenrollFactor(
              actor.accessToken,
              String(response.body['enrollmentId']),
            ),
          ),
      );
    }
  });

  it('enforces the per-person enrollment rate across a fresh native session', async () => {
    const actor = await createPatientActor('mfa-rate');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await harness.inject({
        method: 'POST',
        url: '/v1/auth/mfa/enroll',
        headers: {
          authorization: `Bearer ${actor.accessToken}`,
          'idempotency-key': key(`mfa-rate-${attempt}`),
        },
        payload: { factorType: 'passkey' },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'factor-type-unsupported' });
    }

    const freshSession = await freshPasswordLogin(runtime, actor.email, password);
    const limited = await harness.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      headers: {
        authorization: `Bearer ${freshSession.accessToken}`,
        'idempotency-key': key('mfa-rate-fresh-session'),
      },
      payload: { factorType: 'passkey' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toMatch(/^[1-9][0-9]*$/);
    expect(limited.json()).toMatchObject({ code: 'rate-limited' });
  });

  it('exhausts the pending quota and replays the encrypted one-time secret envelope', async () => {
    const actor = await createPatientActor('mfa-quota');
    const sharedKey = key('mfa-begin-first');
    const firstResponse = await harness.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${actor.accessToken}`, 'idempotency-key': sharedKey },
      payload: { factorType: 'totp' },
    });
    expect(firstResponse.statusCode).toBe(200);
    const secret = String(firstResponse.json()['secret']);
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    expect(String(firstResponse.json().qrUri).startsWith('data:image/svg+xml')).toBe(true);
    expect(firstResponse.headers['cache-control']).toBe('private, no-store');

    const replayResponse = await harness.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${actor.accessToken}`, 'idempotency-key': sharedKey },
      payload: { factorType: 'totp' },
    });
    expect(replayResponse.statusCode, replayResponse.body).toBe(200);
    expect(replayResponse.json()['enrollmentId']).toBe(firstResponse.json()['enrollmentId']);
    expect(replayResponse.json()['secret']).toBe(secret);

    const changedReplay = await harness.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      headers: { authorization: `Bearer ${actor.accessToken}`, 'idempotency-key': sharedKey },
      payload: { factorType: 'totp', friendlyName: 'Changed replay body' },
    });
    expect(changedReplay.statusCode).toBe(409);
    expect(changedReplay.json()).toMatchObject({ code: 'idempotency-key-reused' });

    const relapsed = await freshPasswordLogin(runtime, actor.email, password);
    const second = await beginEnrollment(relapsed.accessToken);
    expect(second.status, JSON.stringify(second.body)).toBe(409);
    expect(second.body).toMatchObject({ code: 'factor-enrollment-pending' });

    const passkey = await harness.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll',
      headers: {
        authorization: `Bearer ${relapsed.accessToken}`,
        'idempotency-key': key('mfa-passkey'),
      },
      payload: { factorType: 'passkey' },
    });
    expect(passkey.statusCode).toBe(422);
    expect(passkey.json()).toMatchObject({ code: 'factor-type-unsupported' });

    const durable = await harness.ownerSql(async (sql) => {
      const rows = await sql`
        select response_body
        from platform.idempotency_records
        where route='/v1/auth/mfa/enroll' and state='completed'
        order by created_at desc limit 3`;
      const audits = await sql`
        select metadata::text metadata from audit.events
        where action like 'identity.factor.%' order by occurred_at desc limit 10`;
      const outbox = await sql`
        select payload::text payload from platform.outbox_events
        where event_type='identity.factor.changed'`;
      return {
        rows: rows as Array<{ response_body: { encoding?: unknown } }>,
        durableText: `${JSON.stringify(rows)}${JSON.stringify(audits)}${JSON.stringify(outbox)}`,
      };
    });
    let sawEncryptedEnvelope = false;
    for (const row of durable.rows) {
      expect(row.response_body.encoding).toBe('aes-256-gcm-v1');
      sawEncryptedEnvelope = true;
    }
    expect(sawEncryptedEnvelope).toBe(true);
    expect(durable.durableText).not.toContain(secret);
  });

  it('rejects invalid and replayed codes and expires pending enrollment at ten minutes', async () => {
    let actor = await createPatientActor('mfa-codes');
    const foreignId = await verifyEnrollment(
      actor.accessToken,
      '71000000-0000-4000-8000-000000000001',
      '000000',
    );
    expect(foreignId.status).toBe(422);
    expect(foreignId.body).toMatchObject({ code: 'factor-code-invalid' });

    const begin = await beginEnrollment(actor.accessToken);
    expect(begin.status).toBe(200);
    const enrollmentId = String(begin.body['enrollmentId']);
    const invalid = await verifyEnrollment(actor.accessToken, enrollmentId, '000000');
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ code: 'factor-code-invalid' });
    const code = currentTotp(String(begin.body['secret']));
    const correct = await verifyEnrollment(actor.accessToken, enrollmentId, code);
    expect(correct.status).toBe(200);
    expect(correct.body['assurance']).toBe('aal2');
    expect(correct.body['factor']).not.toHaveProperty('secret');
    actor = await rotate(actor);
    const replayedCode = await verifyEnrollment(actor.accessToken, enrollmentId, code);
    expect(replayedCode.status).toBe(422);
    expect(replayedCode.body).toMatchObject({ code: 'factor-code-invalid' });

    const rotated = await rotate(actor);
    const expiredBegin = await beginEnrollment(rotated.accessToken, 'Synthetic expiry factor');
    expect(expiredBegin.status).toBe(200);
    const expiredId = String(expiredBegin.body['enrollmentId']);
    harness.setClockOffsetMs(10 * 60_000 + 5_000);
    try {
      const expiredVerify = await verifyEnrollment(
        rotated.accessToken,
        expiredId,
        currentTotp(String(expiredBegin.body['secret'])),
      );
      expect(expiredVerify.status).toBe(410);
      expect(expiredVerify.body).toMatchObject({ code: 'factor-enrollment-pending' });
    } finally {
      await harness.authAdapter.unenrollFactor(rotated.accessToken, expiredId);
      harness.setClockOffsetMs(0);
    }
  });

  it('serializes removal races and enforces the closed 299/300/301-second AMR boundary', async () => {
    let actor = await createPatientActor('mfa-boundary');
    const firstFactorId = await enrollVerifiedFactor(actor, 'Synthetic boundary factor one');
    actor = await rotate(actor);
    const secondFactorId = await enrollVerifiedFactor(actor, 'Synthetic boundary factor two');
    actor = await rotate(actor);
    const factors = await harness.authAdapter.listFactors(actor.accessToken);
    expect(factors.map((factor) => factor.id).sort()).toEqual(
      [firstFactorId, secondFactorId].sort(),
    );

    const [winner, loser] = await Promise.all([
      removeFactor(actor.accessToken, secondFactorId, false),
      removeFactor(actor.accessToken, secondFactorId, false),
    ]);
    expect(
      [winner.status, loser.status].sort((a, b) => a - b),
      JSON.stringify([winner.body, loser.body]),
    ).toEqual([200, 404]);
    const successfulRemoval = [winner, loser].find((outcome) => outcome.status === 200)!;
    expect(successfulRemoval.body).toMatchObject({
      removedFactorId: secondFactorId,
      assurance: 'aal1',
    });
    expect(await harness.authAdapter.listFactors(actor.accessToken)).toHaveLength(1);
    const nativeSession = decodeNativeSession(actor.accessToken);
    const currentAfterRemoval = await harness.ownerSql(async (sql) => {
      return sql.begin(async (tx: any) => {
        await tx`select set_config('shifaa.claimed_aal','aal2',true)`;
        const [row] = await tx`
          select platform.auth_session_is_current(
            ${nativeSession.sessionId}::uuid,${nativeSession.subjectId}::uuid
          ) current`;
        return row.current as boolean;
      });
    });
    expect(currentAfterRemoval).toBe(false);

    const boundary299 = await createActorWithVerifiedFactor('mfa-299');
    await setOffsetForAge(boundary299.actor.accessToken, 299);
    const fresh299 = await removeFactor(boundary299.actor.accessToken, boundary299.factorId, false);
    expect(fresh299.status).toBe(422);
    expect(fresh299.body).toMatchObject({ code: 'last-factor-removal-denied' });

    const boundary300 = await createActorWithVerifiedFactor('mfa-300');
    await setOffsetForAge(boundary300.actor.accessToken, 300);
    const fresh300 = await removeFactor(boundary300.actor.accessToken, boundary300.factorId, false);
    expect(fresh300.status).toBe(422);
    expect(fresh300.body).toMatchObject({ code: 'last-factor-removal-denied' });

    const boundary301 = await createActorWithVerifiedFactor('mfa-301');
    await setOffsetForAge(boundary301.actor.accessToken, 301);
    const stale301 = await removeFactor(boundary301.actor.accessToken, boundary301.factorId, false);
    expect(stale301.status).toBe(403);
    expect(stale301.body).toMatchObject({ code: 'mfa-step-up-required' });

    const refreshStaleness = await createActorWithVerifiedFactor('mfa-refresh-stale');
    refreshStaleness.actor = await rotate(refreshStaleness.actor);
    await setOffsetForAge(refreshStaleness.actor.accessToken, 310);
    const staleAfterRefresh = await removeFactor(
      refreshStaleness.actor.accessToken,
      refreshStaleness.factorId,
      false,
    );
    expect(staleAfterRefresh.status).toBe(403);
    expect(staleAfterRefresh.body).toMatchObject({ code: 'mfa-step-up-required' });

    const optionalRemoval = await createActorWithVerifiedFactor('mfa-optional-removal');
    await setOffsetForAge(optionalRemoval.actor.accessToken, 30);
    const removal = await removeFactor(
      optionalRemoval.actor.accessToken,
      optionalRemoval.factorId,
      true,
    );
    expect(removal.status).toBe(200);
    expect(removal.body).toMatchObject({
      removedFactorId: optionalRemoval.factorId,
      assurance: 'aal1',
    });
    expect(await harness.authAdapter.listFactors(optionalRemoval.actor.accessToken)).toEqual([]);
    const downgraded = await harness.authAdapter.refresh(optionalRemoval.actor.refreshToken);
    expect(downgraded.assurance).toBe('aal1');
  });

  it('denies the workforce mandatory last factor even with explicit confirmation', async () => {
    const email = `mfa-workforce-${randomUUID()}@synthetic.shifaa.test`;
    const signup = await confirmedSignup(runtime, email, password);
    const personId = await harness.seedPerson(signup.userId, email);
    await harness.seedWorkforceGrant(personId);
    let actor: Actor = { email, ...signup };
    const firstFactorId = await enrollVerifiedFactor(actor, 'Synthetic workforce factor one');
    actor = await rotate(actor);
    const denied = await removeFactor(actor.accessToken, firstFactorId, true);
    expect(denied.status).toBe(422);
    expect(denied.body).toMatchObject({ code: 'last-factor-removal-denied' });
    expect(await harness.authAdapter.listFactors(actor.accessToken)).toHaveLength(1);

    const secondFactorId = await enrollVerifiedFactor(actor, 'Synthetic workforce factor two');
    actor = await rotate(actor);
    const concurrentLastFactorRace = await Promise.all([
      removeFactor(actor.accessToken, firstFactorId, false),
      removeFactor(actor.accessToken, secondFactorId, false),
    ]);
    expect(
      concurrentLastFactorRace.map((outcome) => outcome.status).sort((left, right) => left - right),
      JSON.stringify(concurrentLastFactorRace.map((outcome) => outcome.body)),
    ).toEqual([200, 422]);
    expect(await harness.authAdapter.listFactors(actor.accessToken)).toHaveLength(1);
  });

  it('parses DELETE bodies with the standard Fastify JSON parser only', async () => {
    let actor = await createPatientActor('mfa-delete');
    const factorId = await enrollVerifiedFactor(actor, 'Synthetic delete factor');
    actor = await rotate(actor);

    const unknownField = await harness.inject({
      method: 'DELETE',
      url: `/v1/auth/mfa/factors/${randomUUID()}`,
      headers: {
        authorization: `Bearer ${actor.accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': key('mfa-delete-schema'),
      },
      payload: { confirmOptionalLastFactor: true, unexpected: true },
    });
    expect(unknownField.statusCode).toBe(400);
    expect(unknownField.json()).toMatchObject({ code: 'validation-failed' });

    const malformed = await harness.inject({
      method: 'DELETE',
      url: `/v1/auth/mfa/factors/${randomUUID()}`,
      headers: {
        authorization: `Bearer ${actor.accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': key('mfa-delete-malformed'),
      },
      payload: '{not-json',
    });
    expect(malformed.statusCode).toBe(400);

    const sharedKey = key('mfa-delete-changed');
    const originalBody = await removeFactor(actor.accessToken, factorId, true, sharedKey);
    expect(originalBody.status).toBe(200);
    expect(originalBody.body).toMatchObject({ removedFactorId: factorId, assurance: 'aal1' });
    const changedReplay = await harness.inject({
      method: 'DELETE',
      url: `/v1/auth/mfa/factors/${randomUUID()}`,
      headers: {
        authorization: `Bearer ${actor.accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': sharedKey,
      },
      payload: { proofCaseId: null, confirmOptionalLastFactor: false },
    });
    expect(changedReplay.statusCode).toBe(409);
    expect(changedReplay.json()).toMatchObject({ code: 'idempotency-key-reused' });
  });
});
