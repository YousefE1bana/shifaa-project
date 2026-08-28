import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';

import { PostgresIdentityContinuityService } from '../src/adapters/postgres/identity-continuity-service.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import { SupabaseAuthIssuer } from '../src/adapters/supabase-auth.js';
import { PostgresIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { IdentityContinuityService } from '../src/modules/identity-continuity/service.js';
import { registerIdentityContinuityRoutes } from '../src/routes/identity-continuity.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';

const requireFromApi = createRequire(new URL('../package.json', import.meta.url));
const { createClient } = requireFromApi('@supabase/supabase-js') as {
  createClient(url: string, key: string, options: unknown): any;
};
const postgres = requireFromApi('postgres') as any;

interface SupabaseStatus {
  API_URL: string;
  ANON_KEY: string;
  DB_URL: string;
  MAILPIT_URL: string;
}

function status(): SupabaseStatus {
  const command = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'corepack';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'corepack pnpm exec supabase status -o json']
      : ['pnpm', 'exec', 'supabase', 'status', '-o', 'json'];
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8' })) as SupabaseStatus;
}

async function confirmationCode(runtime: SupabaseStatus, email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${runtime.MAILPIT_URL}/api/v1/messages`).then(
      (response) => response.json() as Promise<any>,
    );
    const message = list.messages?.find((entry: any) =>
      entry.To?.some((recipient: any) => recipient.Address === email),
    );
    if (message) {
      const detail = await fetch(`${runtime.MAILPIT_URL}/api/v1/message/${message.ID}`).then(
        (response) => response.json() as Promise<any>,
      );
      const code = /\b\d{6}\b/.exec(detail.Text ?? '')?.[0];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Synthetic confirmation code was not delivered.');
}

async function confirmedSession(runtime: SupabaseStatus, email: string, password: string) {
  const client = createClient(runtime.API_URL, runtime.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signup = await client.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  const confirmation = await client.auth.verifyOtp({
    email,
    token: await confirmationCode(runtime, email),
    type: 'signup',
  });
  if (confirmation.error || !confirmation.data.session) {
    throw confirmation.error ?? new Error('Synthetic native session is missing.');
  }
  return { client, session: confirmation.data.session };
}

export async function runRealSessionJourney(locale: 'ar-EG' | 'en-EG') {
  const runtime = status();
  const password = 'Synthetic-007-Session-Stack!';
  const email = `session-${locale.toLowerCase()}-${randomUUID()}@synthetic.shifaa.test`;
  const first = await confirmedSession(runtime, email, password);
  const secondClient = createClient(runtime.API_URL, runtime.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const secondLogin = await secondClient.auth.signInWithPassword({ email, password });
  if (secondLogin.error || !secondLogin.data.session) {
    throw secondLogin.error ?? new Error('Second device session is missing.');
  }
  const webClient = createClient(runtime.API_URL, runtime.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const webLogin = await webClient.auth.signInWithPassword({ email, password });
  if (webLogin.error || !webLogin.data.session) {
    throw webLogin.error ?? new Error('Web session is missing.');
  }

  const apiUrl = new URL(runtime.DB_URL);
  apiUrl.username = 'shifaa_api';
  apiUrl.password = 'synthetic_api_only';
  const repository = new PostgresIdentityRepository(apiUrl.toString());
  await repository.ready();
  const continuityRepository = new PostgresIdentityContinuityService(
    repository,
    Buffer.alloc(32, 10),
    'ci',
  );
  const auth = new SupabaseAuthIssuer({
    url: runtime.API_URL,
    anonKey: runtime.ANON_KEY,
    jwksUrl: `${runtime.API_URL}/auth/v1/.well-known/jwks.json`,
    issuer: `${runtime.API_URL}/auth/v1`,
    audience: 'authenticated',
  });
  await auth.ready();
  const service = new IdentityContinuityService({
    auth,
    repository: continuityRepository,
    allowedWebOrigins: new Set(['https://patient.synthetic.test']),
    hmacKey: Buffer.alloc(32, 9),
    now: () => new Date(),
  });
  const app = Fastify({ logger: false, genReqId: () => randomUUID() });
  installIdentityErrorHandler(app);
  await registerIdentityContinuityRoutes(app, {
    service,
    idempotency: new PostgresIdempotencyStore(repository, Buffer.alloc(32, 10)),
    hmacKey: Buffer.alloc(32, 9),
  });
  await app.ready();

  const nativeRefresh = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/refresh',
    headers: { 'idempotency-key': `native-refresh-${randomUUID()}`, 'accept-language': locale },
    payload: {
      client: 'native',
      foregroundEngaged: true,
      refreshToken: first.session.refresh_token,
    },
  });
  if (nativeRefresh.statusCode !== 200) {
    throw new Error(
      `Native refresh rejected: token_length=${first.session.refresh_token.length}; response=${nativeRefresh.body}`,
    );
  }
  const rotated = nativeRefresh.json();

  const csrfToken = `synthetic-csrf-${randomUUID()}`;
  const webRefresh = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/refresh',
    headers: {
      'idempotency-key': `web-refresh-${randomUUID()}`,
      'accept-language': locale,
      cookie: `shifaa_refresh=${encodeURIComponent(webLogin.data.session.refresh_token)}; shifaa_csrf=${encodeURIComponent(csrfToken)}`,
      'x-csrf-token': csrfToken,
      origin: 'https://patient.synthetic.test',
      'sec-fetch-site': 'same-origin',
    },
    payload: { client: 'web', foregroundEngaged: true },
  });
  if (webRefresh.statusCode !== 200) throw new Error(webRefresh.body);
  const webBody = webRefresh.json();
  const webSetCookie = String(webRefresh.headers['set-cookie']);
  const webRotatedToken = decodeURIComponent(
    /^shifaa_refresh=([^;]+)/.exec(webSetCookie)?.[1] ?? '',
  );
  if (!webRotatedToken) throw new Error('Web refresh cookie did not contain the rotated token.');

  const currentLogout = await app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: {
      authorization: `Bearer ${rotated.accessToken}`,
      'idempotency-key': `current-logout-${randomUUID()}`,
      'accept-language': locale,
    },
    payload: { allSessions: false },
  });
  if (currentLogout.statusCode !== 200) throw new Error(currentLogout.body);

  const secondRefresh = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/refresh',
    headers: { 'idempotency-key': `second-refresh-${randomUUID()}`, 'accept-language': locale },
    payload: {
      client: 'native',
      foregroundEngaged: true,
      refreshToken: secondLogin.data.session.refresh_token,
    },
  });
  if (secondRefresh.statusCode !== 200) throw new Error(secondRefresh.body);
  const secondRotated = secondRefresh.json();

  const globalLogout = await app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: {
      authorization: `Bearer ${secondRotated.accessToken}`,
      'idempotency-key': `global-logout-${randomUUID()}`,
      'accept-language': locale,
    },
    payload: { allSessions: true },
  });
  if (globalLogout.statusCode !== 200) throw new Error(globalLogout.body);

  const revokedChild = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/refresh',
    headers: { 'idempotency-key': `revoked-child-${randomUUID()}`, 'accept-language': locale },
    payload: {
      client: 'native',
      foregroundEngaged: true,
      refreshToken: secondRotated.refreshToken,
    },
  });
  const revokedWebChild = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/refresh',
    headers: {
      'idempotency-key': `revoked-web-child-${randomUUID()}`,
      'accept-language': locale,
      cookie: `shifaa_refresh=${encodeURIComponent(webRotatedToken)}; shifaa_csrf=${encodeURIComponent(csrfToken)}`,
      'x-csrf-token': csrfToken,
      origin: 'https://patient.synthetic.test',
      'sec-fetch-site': 'same-origin',
    },
    payload: { client: 'web', foregroundEngaged: true },
  });

  const owner = postgres(runtime.DB_URL, { max: 1 });
  const auditRows = await owner`
    select action,metadata::text metadata
    from audit.events
    where action in ('identity.session.refreshed','identity.session.logged_out')
    order by occurred_at desc limit 4`;
  const idempotencyRows = await owner`
    select route,response_body::text response_body
    from platform.idempotency_records
    where route in ('/v1/auth/session/refresh','/v1/auth/logout')`;
  const outboxRows = await owner`
    select event_type,payload::text payload
    from platform.outbox_events
    where event_type like 'identity.session.%'`;
  await owner.end({ timeout: 5 });
  await app.close();
  await repository.close();

  return {
    nativeRefreshStatus: nativeRefresh.statusCode,
    currentLogoutStatus: currentLogout.statusCode,
    secondDeviceContinued: secondRefresh.statusCode === 200,
    globalLogoutStatus: globalLogout.statusCode,
    revokedChildStatus: revokedChild.statusCode,
    revokedWebChildStatus: revokedWebChild.statusCode,
    webRefreshStatus: webRefresh.statusCode,
    webResponseHasRefreshToken: Object.hasOwn(webBody, 'refreshToken'),
    webCookieStrict:
      webSetCookie.includes('HttpOnly') &&
      webSetCookie.includes('Secure') &&
      webSetCookie.includes('SameSite=Strict') &&
      webSetCookie.includes('Path=/v1/auth'),
    contentLanguage: nativeRefresh.headers['content-language'],
    currentCookieCleared: String(currentLogout.headers['set-cookie']).includes('Max-Age=0'),
    providerRefreshTokenLength: first.session.refresh_token.length,
    refreshPersistenceCount: idempotencyRows.filter(
      (row: { route: string }) => row.route === '/v1/auth/session/refresh',
    ).length,
    auditCount: auditRows.length,
    durableText: JSON.stringify({ auditRows, idempotencyRows, outboxRows }),
    tokenSentinels: [
      first.session.refresh_token,
      rotated.refreshToken,
      secondLogin.data.session.refresh_token,
      secondRotated.refreshToken,
      webLogin.data.session.refresh_token,
      webRotatedToken,
    ],
  };
}
