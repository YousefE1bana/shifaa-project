// Runs only inside the owned F012 probe after the harness admits its database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdirSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
assert.equal(root, '/tmp/f012-core-api');
const [subject, signingProfile, ...workspaces] = process.argv.slice(2);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
assert.match(subject, uuid);
const authenticated = signingProfile !== 'local-fixture';
if (authenticated) assert.match(signingProfile, uuid);
const password = process.env.F012_CORE_API_PASSWORD;
assert.ok(password && /^[a-f0-9]{64}$/.test(password), 'Generated Core API password required');

for (const workspace of workspaces) {
  const installed = join('/opt/deps', workspace, 'node_modules');
  const target = join(root, workspace, 'node_modules');
  mkdirSync(join(target, '@shifaa'), { recursive: true });
  for (const dependency of readdirSync(installed)) {
    if (dependency.startsWith('.')) continue;
    if (dependency === '@shifaa') {
      for (const name of readdirSync(join(installed, dependency))) {
        if (workspaces.includes('packages/' + name)) {
          symlinkSync(join(root, 'packages', name), join(target, dependency, name));
        }
      }
    } else {
      symlinkSync(join(installed, dependency), join(target, dependency));
    }
  }
}

const { buildApp } = await import(pathToFileURL(join(root, 'services/api/src/app.ts')));
const { loadConfig } = await import(pathToFileURL(join(root, 'services/api/src/config.ts')));
const { PostgresIdentityRepository } = await import(
  pathToFileURL(join(root, 'services/api/src/adapters/postgres/identity-repository.ts'))
);
const issuer = 'http://auth:9999';
const config = loadConfig({
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  AUTH_ADAPTER: authenticated ? 'supabase' : 'local',
  REPOSITORY_ADAPTER: 'postgres',
  DATABASE_URL: `postgresql://shifaa_api:${password}@db:5432/postgres`,
  ...(authenticated
    ? {
        SUPABASE_URL: issuer,
        SUPABASE_ANON_KEY: 'unused-disposable-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'unused-disposable-service-key',
        SUPABASE_JWKS_URL: issuer + '/.well-known/jwks.json',
        SUPABASE_JWT_ISSUER: issuer,
      }
    : {}),
});
const { app, repository, service } = await buildApp({ config });
try {
  assert.ok(repository instanceof PostgresIdentityRepository);
  const { address } = await lookup('db', { family: 4 });
  const evidence = await repository.withRawTransaction(async (tx) => {
    const [binding] = await tx`select session_user as "sessionRole",
      current_user as "effectiveRole", current_database() as database,
      host(inet_server_addr()) as "serverAddress", inet_server_port() as "serverPort",
      pg_backend_pid() as backend, pg_current_xact_id()::text as transaction`;
    const challengeId = randomUUID();
    const requestId = randomUUID();
    const result = await service.completeRegistration(
      { handle: `t012-${subject}@example.invalid`, locale: 'en-EG', requestId },
      { subjectId: subject, challengeId },
    );
    assert.equal(result.challenge_id, challengeId);
    const [after] =
      await tx`select pg_backend_pid() as backend, pg_current_xact_id()::text as transaction`;
    assert.deepEqual(after, { backend: binding.backend, transaction: binding.transaction });
    return { ...binding, requestId };
  });
  const routeEvidence = authenticated ? await exerciseAuthenticatedConsent() : undefined;
  console.log(
    JSON.stringify({ ...evidence, configuredAddress: address, authenticated: routeEvidence }),
  );
} finally {
  await app.close();
}

async function exerciseAuthenticatedConsent() {
  const fixtures = JSON.parse(readFileSync('/tmp/f012-admission-fixtures.json', 'utf8'));
  const fixture = fixtures.find((entry) => entry.subject === subject);
  assert.ok(fixture?.token && uuid.test(fixture.session), 'Expected run-owned GoTrue session');
  const [encodedHeader] = fixture.token.split('.');
  const { alg, kid } = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
  assert.equal(alg, 'ES256');
  assert.equal(kid, signingProfile);

  const notice = await app.inject({
    method: 'GET',
    url: '/v1/privacy/notices/current',
    headers: { 'accept-language': 'en-EG' },
  });
  assert.equal(notice.statusCode, 200);
  const { purposes, version } = notice.json();
  const purpose = purposes.find((entry) => entry.purpose_code === 'care_updates');
  assert.ok(purpose, 'Expected the migrated care updates purpose');

  const requestId = randomUUID();
  const route = {
    method: 'POST',
    url: '/v1/privacy/consents',
    headers: { 'idempotency-key': randomUUID(), 'x-request-id': requestId },
    payload: {
      purpose_code: purpose.purpose_code,
      purpose_version: purpose.version,
      decision: 'granted',
      notice_version: version,
    },
  };
  const denied = await app.inject(route);
  assert.equal(denied.statusCode, 401);
  const authorization = `Bearer ${fixture.token}`;
  const authorized = await app.inject({
    ...route,
    headers: { ...route.headers, authorization },
  });
  assert.equal(authorized.statusCode, 201, 'Native session consent write');
  const { id: consent, version: grantedVersion, decision } = authorized.json();
  assert.match(consent, uuid);
  assert.equal(decision, 'granted');
  assert.equal(grantedVersion, 1);

  const withdrawalRequestId = randomUUID();
  const withdrawal = await app.inject({
    method: 'POST',
    url: `/v1/privacy/consents/${consent}/withdraw`,
    headers: {
      authorization,
      'if-match': '"1"',
      'idempotency-key': randomUUID(),
      'x-request-id': withdrawalRequestId,
    },
  });
  assert.equal(withdrawal.statusCode, 200, 'Native session consent withdrawal');
  const withdrawn = withdrawal.json();
  assert.match(withdrawn.id, uuid);
  assert.notEqual(withdrawn.id, consent);
  assert.equal(withdrawn.supersedes_id, consent);
  assert.equal(withdrawn.version, 2);
  assert.equal(withdrawn.decision, 'withdrawn');
  return {
    issuer,
    algorithm: alg,
    keyId: kid,
    session: fixture.session,
    requestId,
    consent,
    withdrawal: withdrawn.id,
    withdrawalRequestId,
    deniedStatus: denied.statusCode,
    authorizedStatus: authorized.statusCode,
    withdrawalStatus: withdrawal.statusCode,
  };
}
