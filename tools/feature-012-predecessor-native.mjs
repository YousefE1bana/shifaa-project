// Real native sessions, ordinary Core API routes, and the F007 local repository.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildApp } from '../services/api/src/app.ts';
import { loadConfig } from '../services/api/src/config.ts';
import { SupabaseAuthIssuer } from '../services/api/src/adapters/supabase-auth.ts';
import { PostgresIdentityContinuityService } from '../services/api/src/adapters/postgres/identity-continuity-service.ts';
import { consentHistory, facilityReview } from './feature-012-predecessor-identity.mjs';

assert.equal(import.meta.dirname, '/tmp/f012-core-api/tools');
const [phase, fixtureInput] = process.argv.slice(2);
const fixtures = JSON.parse(readFileSync('/tmp/f012-admission-fixtures.json', 'utf8'));
const password = process.env.F012_CORE_API_PASSWORD;
assert.match(password, /^[a-f0-9]{64}$/);
const issuer = 'http://auth:9999';
const config = loadConfig({
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  AUTH_ADAPTER: 'supabase',
  REPOSITORY_ADAPTER: 'postgres',
  DATABASE_URL: `postgresql://shifaa_api:${password}@db:5432/postgres`,
  SUPABASE_URL: issuer,
  SUPABASE_ANON_KEY: 'unused-disposable-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-disposable-service-key',
  SUPABASE_JWKS_URL: issuer + '/.well-known/jwks.json',
  SUPABASE_JWT_ISSUER: issuer,
});
const { app, repository } = await buildApp({ config });
try {
  const actorBindings = await repository.withRawTransaction(async (tx) => {
    const [row] = await tx`SELECT session_user AS login,current_user AS effective,
      current_database() AS database,host(inet_server_addr()) AS address`;
    assert.equal(row.login, 'shifaa_api');
    assert.equal(row.effective, 'shifaa_api');
    assert.equal(row.database, 'postgres');
    return row;
  });
  const checks = {
    encounter,
    recovery,
    consent: () => consentHistory(app, fixtures[1], fixtures[2]),
    facility: () => facilityReview(app, fixtureInput ? JSON.parse(fixtureInput) : undefined),
  };
  assert.ok(Object.hasOwn(checks, phase));
  const result = await checks[phase]();
  console.log(JSON.stringify({ actorBindings, ...result }));
} finally {
  await app.close();
}

async function encounter() {
  const [clinician, patient, outsider] = fixtures;
  const calls = [];
  const identifiers = {};
  const path = '/v1/encounters';
  const write = (method, url, payload, version, key = randomUUID()) => ({
    method,
    url,
    payload,
    headers: {
      'idempotency-key': key,
      ...(version ? { 'if-match': '"' + version + '"' } : {}),
    },
  });
  const invoke = async (name, fixture, request, expected) => {
    const requestId = randomUUID();
    const response = await app.inject({
      ...request,
      headers: {
        ...request.headers,
        'accept-language': 'en-EG',
        'x-purpose': 'appointment.scheduling',
        'x-request-id': requestId,
        ...(fixture ? { authorization: 'Bearer ' + fixture.token } : {}),
      },
    });
    const body = response.json();
    calls.push({ name, status: response.statusCode, requestId, code: body.code });
    assert.equal(response.statusCode, expected, name + ': ' + body.code);
    return body;
  };
  const create = write('POST', path, {
    appointmentId: 'f0120100-0000-4000-8500-000000000001',
    patientId: 'f0110000-0000-4000-8000-000000000001',
    encounterType: 'consultation',
  });
  await invoke('create without native session', null, create, 401);
  const created = await invoke('create', clinician, create, 201);
  assert.equal(created.appointmentStatus, 'in_consultation');
  assert.equal(created.queueStatus, 'in_service');
  const { id, version } = created.encounter;
  identifiers.id = id;
  identifiers.queueId = created.queueEntryId;
  assert.equal(created.encounter.status, 'open');
  assert.equal(created.encounter.responsibleClinicianId, 'f0110000-0000-4000-8000-000000000002');
  assert.deepEqual(await invoke('canonical create replay', clinician, create, 201), created);
  const url = path + '/' + id;
  const read = { method: 'GET', url: url + '?fields=participants' };
  await invoke('foreign read', outsider, read, 404);
  const visible = await invoke('subject open projection', patient, read, 200);
  assert.equal(visible.status, 'open');
  const patch = write('PATCH', url, { observationIds: [] }, version);
  const updated = await invoke('update', clinician, patch, 200);
  assert.equal(updated.version, version + 1);
  await invoke('stale update', clinician, write('PATCH', url, patch.payload, version), 409);
  const complete = await invoke(
    'complete',
    clinician,
    write(
      'POST',
      url + '/complete',
      { summary: 'Synthetic C28 completion.', structuralConfirmation: true },
      updated.version,
    ),
    200,
  );
  assert.equal(complete.encounter.status, 'completed');
  assert.equal(complete.appointmentStatus, 'completed');
  assert.equal(complete.queueStatus, 'completed');
  const history = await invoke('subject completed history', patient, read, 200);
  assert.equal(history.endedAt, complete.encounter.endedAt);
  assert.equal(history.version, updated.version + 1);
  await invoke(
    'post-completion update',
    clinician,
    write('PATCH', url, patch.payload, history.version),
    409,
  );
  return { calls, ...identifiers };
}

async function recovery() {
  const fixture = fixtures[3];
  const native = new SupabaseAuthIssuer({
    url: issuer,
    anonKey: config.supabaseAnonKey,
    jwksUrl: config.supabaseJwksUrl,
    issuer,
    audience: config.supabaseJwtAudience,
  });
  await native.ready();
  const claims = await native.resolveSession(fixture.token);
  assert.equal(claims?.subjectId, fixture.subject);
  assert.equal(claims.sessionId, fixture.session);
  assert.equal(claims.aal, 2);
  const continuity = new PostgresIdentityContinuityService(
    repository,
    config.identityEncryptionKey,
    'ci',
  );
  const before = await continuity.authorize(claims);
  assert.equal(before, 'restricted');
  const requestId = randomUUID();
  const request = {
    subjectId: claims.subjectId,
    sessionId: claims.sessionId,
    requestId,
    occurredAt: new Date().toISOString(),
  };
  await continuity.completeRestrictedEnrollmentCase(request);
  const after = await continuity.authorize(claims);
  assert.equal(after, 'allowed');
  await assert.rejects(
    continuity.completeRestrictedEnrollmentCase({ ...request, requestId: randomUUID() }),
    (error) => error?.statusCode === 409 || error?.code === 'state-transition-invalid',
  );
  return {
    subject: claims.subjectId,
    session: claims.sessionId,
    aal: claims.aal,
    requestId,
    before,
    after,
    replay: 'denied',
  };
}
