// Port of the F007 native recovery checkpoint to the admitted disposable bridge.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { SupabaseAuthIssuer } from '../services/api/src/adapters/supabase-auth.ts';

const mailbox = 'http://mailpit:8025';
const recoveryPath = '/v1/auth/recovery';

async function mailboxJson(path) {
  const response = await fetch(mailbox + path, {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, 'Disposable mailbox was unavailable');
  return response.json();
}

async function matchingMessages(email) {
  const result = await mailboxJson('/api/v1/messages');
  return (result.messages ?? []).filter((message) =>
    message.To?.some((recipient) => recipient.Address === email),
  );
}

async function findRecoveryOtp(email, previous) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const message = (await matchingMessages(email)).find(({ ID }) => !previous.has(ID));
    if (message) {
      assert.match(message.ID, /^[a-zA-Z0-9_-]+$/);
      assert.equal(message.Subject, 'SHIFAA local recovery code');
      const detail = await mailboxJson('/api/v1/message/' + message.ID);
      const code = /\b\d{6}\b/.exec(detail.Text ?? '')?.[0];
      if (code) return code;
    }
    await delay(250);
  }
  throw new Error('Disposable recovery OTP unavailable');
}

export async function verifyMailedRecovery(app, config, fixture, totp, checkpoint) {
  assert.equal(process.env.F012_RECOVERY_MAIL, 'true');
  assert.match(fixture.email, /^[0-9a-f-]{36}@example\.invalid$/);
  const template = readFileSync(new URL('../supabase/templates/recovery.html', import.meta.url));
  const templateServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/f007-recovery.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(template);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    templateServer.once('error', reject).listen(8123, '0.0.0.0', resolve);
  });
  const history = (token) =>
    app.inject({
      method: 'GET',
      url: '/v1/privacy/consents',
      headers: { authorization: 'Bearer ' + token },
    });
  const post = async (step, url, payload, expected) => {
    checkpoint(step);
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: { 'x-request-id': requestId, 'idempotency-key': randomUUID() },
    });
    const body = response.json();
    assert.equal(response.statusCode, expected, step + ' (' + body.code + ')');
    return { status: response.statusCode, requestId, body };
  };

  try {
    checkpoint('mail readiness and original session');
    const initialHistory = await history(fixture.token);
    assert.equal(initialHistory.statusCode, 200);
    const previous = new Set((await matchingMessages(fixture.email)).map(({ ID }) => ID));
    const intake = await post(
      'mail recovery intake',
      recoveryPath,
      {
        handle: fixture.email,
        locale: 'en-EG',
      },
      202,
    );
    assert.equal(intake.body.status, 'accepted');
    const { caseId, caseToken } = intake.body;
    assert.match(caseId, /^[a-f0-9-]{36}$/);
    checkpoint('mail recovery OTP delivery');
    const recoveryOtp = await findRecoveryOtp(fixture.email, previous);
    const replacement = 'Aa9!' + randomBytes(32).toString('hex');
    const completed = await post(
      'mail recovery completion',
      recoveryPath + '/' + caseId + '/complete',
      {
        caseToken,
        handle: fixture.email,
        recoveryOtp,
        proofMethod: 'bound_factor_independent_method',
        factorEvidence: totp(fixture.factorSecret),
        newCredential: replacement,
      },
      200,
    );
    assert.equal(completed.body.status, 'completed');
    assert.equal(completed.body.caseId, caseId);
    assert.equal(completed.body.session.restriction, null);

    checkpoint('fresh session and prior credential invalidation');
    const issuer = new SupabaseAuthIssuer({
      url: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      jwksUrl: config.supabaseJwksUrl,
      issuer: config.supabaseJwtIssuer,
      audience: config.supabaseJwtAudience,
    });
    const freshToken = completed.body.session.accessToken;
    const fresh = await issuer.resolveSession(freshToken);
    assert.equal(fresh?.subjectId, fixture.subject);
    assert.notEqual(fresh.sessionId, fixture.session);
    const oldHistory = await history(fixture.token);
    const newHistory = await history(freshToken);
    assert.equal(oldHistory.statusCode, 401);
    assert.equal(newHistory.statusCode, 200);
    const authStatus = async (grant, payload) => {
      const response = await fetch(config.supabaseUrl + '/auth/v1/token?grant_type=' + grant, {
        method: 'POST',
        headers: { apikey: config.supabaseAnonKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      return response.status;
    };
    const previousRefresh = await authStatus('refresh_token', {
      refresh_token: fixture.refreshToken,
    });
    const previousPassword = await authStatus('password', {
      email: fixture.email,
      password: fixture.password,
    });
    assert.equal(previousRefresh, 400);
    assert.equal(previousPassword, 400);
    return {
      caseId,
      requestId: completed.requestId,
      subject: fresh.subjectId,
      session: fresh.sessionId,
      intake: intake.status,
      complete: completed.status,
      originalRouteBefore: initialHistory.statusCode,
      originalRouteAfter: oldHistory.statusCode,
      freshRoute: newHistory.statusCode,
      previousRefresh,
      previousPassword,
    };
  } finally {
    await new Promise((resolve, reject) => {
      templateServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
