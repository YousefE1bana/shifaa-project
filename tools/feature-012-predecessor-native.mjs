// Real native sessions, ordinary Core API routes, and the F007 local repository.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildApp } from '../services/api/src/app.ts';
import { loadConfig } from '../services/api/src/config.ts';
import { SupabaseAuthIssuer } from '../services/api/src/adapters/supabase-auth.ts';
import { PostgresIdentityContinuityService } from '../services/api/src/adapters/postgres/identity-continuity-service.ts';
import probe from './feature-012-harness-probe.cjs';
import { verifyMailedRecovery } from './feature-012-recovery-mail.mjs';
import {
  consentHistory,
  facilityReview,
  guardianshipReview,
  professionalReview,
} from './feature-012-predecessor-identity.mjs';

assert.equal(import.meta.dirname, '/tmp/f012-core-api/tools');
const [phase, fixtureInput] = process.argv.slice(2);
const fixtures = JSON.parse(readFileSync('/tmp/f012-admission-fixtures.json', 'utf8'));
const password = process.env.F012_CORE_API_PASSWORD;
assert.match(password, /^[a-f0-9]{64}$/);
const allergy = phase === 'allergy-verification-api';
const directAuth = 'http://auth:9999';
const recoveryHttp = phase === 'recovery-api' || phase === 'recovery-mail-api';
const supabaseUrl = recoveryHttp ? 'http://kong:8000' : directAuth;
const issuer = recoveryHttp ? supabaseUrl + '/auth/v1' : directAuth;
const anonKey = recoveryHttp ? process.env.F012_RECOVERY_ANON_KEY : 'unused-disposable-anon-key';
if (recoveryHttp) assert.match(anonKey, /^[\w-]+\.[\w-]+\.[\w-]+$/);
const config = loadConfig({
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  AUTH_ADAPTER: 'supabase',
  REPOSITORY_ADAPTER: 'postgres',
  DATABASE_URL: `postgresql://shifaa_api:${password}@db:5432/postgres`,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: 'unused-disposable-service-key',
  SUPABASE_JWKS_URL: issuer + '/.well-known/jwks.json',
  SUPABASE_JWT_ISSUER: issuer,
  ...(allergy
    ? {
        FEATURE_011_ENABLED: 'true',
        FEATURE_011_ISOLATED_TEST: 'true',
        FEATURE_011_KILL_SWITCH: 'false',
      }
    : {}),
});
const allergyModule = allergy ? await import('./feature-012-predecessor-allergy.mjs') : null;
const allergyInput = allergy ? JSON.parse(fixtureInput) : null;
const allergyFixture = allergyModule?.openAllergyFixture(config, allergyInput.support);
const { app, repository } = await buildApp({
  config,
  feature011Allergies: allergyFixture?.service,
});
let checkpoint = 'database binding';
let transport;
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
    'recovery-intake': recoveryIntake,
    'recovery-api': recoveryApi,
    'recovery-mail-api': () =>
      verifyMailedRecovery(app, config, fixtures[3], probe.totp, (step) => {
        checkpoint = step;
      }),
    'participant-api': () => participantApi(JSON.parse(fixtureInput)),
    'allergy-verification-api': () => allergyModule.allergyApi(app, fixtures, allergyInput),
    'appointment-link-api': () => appointmentLinkApi(JSON.parse(fixtureInput)),
    'booking-api': () => bookingApi(JSON.parse(fixtureInput)),
    'absence-api': () => absenceApi(JSON.parse(fixtureInput)),
    scheduling: () => scheduling(JSON.parse(fixtureInput)),
    consent: () => consentHistory(app, fixtures[1], fixtures[2]),
    'guardianship-api': () => guardianshipReview(app, JSON.parse(fixtureInput)),
    'licence-scope-api': () => licenceScope(JSON.parse(fixtureInput)),
    'membership-scope-api': () => membershipScope(JSON.parse(fixtureInput)),
    'membership-invite-api': () => membershipInviteApi(JSON.parse(fixtureInput)),
    'facility-scope-api': () => facilityScope(JSON.parse(fixtureInput)),
    'professional-review-api': () =>
      professionalReview(app, fixtureInput ? JSON.parse(fixtureInput) : undefined, (step) => {
        checkpoint = step;
      }),
    'professional-omitted-specialty-api': professionalOmittedSpecialty,
    facility: () => facilityReview(app, fixtureInput ? JSON.parse(fixtureInput) : undefined),
  };
  assert.ok(Object.hasOwn(checks, phase));
  checkpoint = phase;
  const result = await checks[phase]();
  console.log(JSON.stringify({ actorBindings, ...result }));
} catch (error) {
  const apiCode = /\(([a-z0-9-]{1,70})\)$/.exec(error.message)?.[1];
  console.log(
    JSON.stringify({
      failure: {
        checkpoint,
        ...(transport ? { transport } : {}),
        ...(typeof error.actual === 'number' ? { actual: error.actual } : {}),
        ...(typeof error.expected === 'number' ? { expected: error.expected } : {}),
        ...(apiCode ? { apiCode } : {}),
        ...(typeof error.code === 'string' && /^[A-Z0-9_]{1,45}$/.test(error.code)
          ? { code: error.code }
          : {}),
      },
    }),
  );
} finally {
  await app.close();
  await allergyFixture?.close();
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

async function encounterAuthorityLoss(changeAuthority) {
  const [clinician] = fixtures;
  const action = async (url, token, payload, expected, headers) => {
    checkpoint = url;
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: 'Bearer ' + token,
        'x-request-id': requestId,
        'idempotency-key': randomUUID(),
        ...headers,
      },
    });
    const body = response.json();
    assert.equal(response.statusCode, expected, url + ' (' + body.code + ')');
    return { body, requestId, status: response.statusCode };
  };
  const created = await action(
    '/v1/encounters',
    clinician.token,
    {
      appointmentId: 'f0120100-0000-4000-8500-000000000001',
      patientId: 'f0110000-0000-4000-8000-000000000001',
      encounterType: 'consultation',
    },
    201,
    { 'x-purpose': 'appointment.scheduling' },
  );
  const { id, version, status } = created.body.encounter;
  assert.equal(status, 'open');
  const change = await changeAuthority(action);
  const denied = await action(
    '/v1/encounters/' + id + '/complete',
    clinician.token,
    { summary: 'Synthetic completion after care scope loss.', structuralConfirmation: true },
    404,
    { 'x-purpose': 'appointment.scheduling', 'if-match': '"' + version + '"' },
  );
  assert.equal(denied.body.code, 'not-found');
  return {
    id,
    version,
    create: { requestId: created.requestId, status: created.status },
    change: { requestId: change.requestId, status: change.status },
    complete: { requestId: denied.requestId, status: denied.status, code: denied.body.code },
  };
}

async function licenceScope({ licence }) {
  const { change, ...result } = await encounterAuthorityLoss(async (action) => {
    const suspended = await action(
      '/v1/admin/professional-licenses/' + licence + '/decision',
      'synthetic-admin:facility_approver:f0110000-0000-4000-8000-000000000008',
      { decision: 'suspend', reason: 'Synthetic professional review' },
      200,
      { 'x-purpose': 'professional_license_review', 'x-aal': '2', 'if-match': '"1"' },
    );
    assert.equal(suspended.body.id, licence);
    assert.equal(suspended.body.status, 'suspended');
    assert.equal(suspended.body.version, 2);
    return suspended;
  });
  return { ...result, suspend: change };
}

async function membershipInviteApi({ facility, owner, invitee, licence }) {
  const post = async (url, person, payload) => {
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: 'Bearer synthetic-person:' + person,
        'x-aal': '2',
        'x-request-id': requestId,
        'idempotency-key': randomUUID(),
      },
    });
    const body = response.json();
    return { body, result: { status: response.statusCode, code: body.code, requestId } };
  };
  checkpoint = 'facility-owner invitation';
  const invite = await post('/v1/facilities/' + facility + '/memberships', owner, {
    person_id: invitee,
    role_code: 'pharmacist',
    employment_license_id: licence,
    valid_from: '2020-01-01T00:00:00Z',
  });
  if (invite.result.status !== 201) return { invite: invite.result };
  assert.equal(invite.body.status, 'invited');
  assert.equal(invite.body.version, 1);
  assert.ok(typeof invite.body.invite_token === 'string');
  checkpoint = 'bound invitee acceptance';
  const accepted = await post(
    '/v1/facility-membership-invites/' + encodeURIComponent(invite.body.invite_token) + '/accept',
    invitee,
    {},
  );
  if (accepted.result.status === 200) {
    assert.equal(accepted.body.id, invite.body.id);
    assert.equal(accepted.body.status, 'active');
    assert.equal(accepted.body.version, 2);
    assert.equal(accepted.body.invite_token, undefined);
  }
  return { invite: invite.result, accept: accepted.result, id: invite.body.id };
}

async function professionalOmittedSpecialty() {
  const url = '/v1/people/me/professional-licenses';
  checkpoint = url;
  const requestId = randomUUID();
  const request = {
    method: 'POST',
    url,
    payload: {
      profession: 'doctor',
      license_number: 'SYN-' + randomUUID(),
      issuer: 'Synthetic professional authority',
      expires_on: '2099-01-01',
    },
    headers: {
      authorization: 'Bearer synthetic-person:f0110000-0000-4000-8000-000000000005',
      'x-request-id': requestId,
      'x-aal': '2',
      'idempotency-key': randomUUID(),
    },
  };
  const created = await app.inject(request);
  const licence = created.json();
  assert.equal(created.statusCode, 201, url + ' (' + licence.code + ')');
  assert.equal(licence.status, 'pending');
  assert.equal(licence.version, 1);
  const replay = await app.inject({
    ...request,
    headers: { ...request.headers, 'x-request-id': randomUUID() },
  });
  assert.equal(replay.statusCode, 201);
  assert.deepEqual(replay.json(), licence);
  return { id: licence.id, requestId, status: created.statusCode, replay: replay.statusCode };
}

async function membershipScope({ membership, facility, facilityOwner, ownerIsClinician }) {
  const { change, ...result } = await encounterAuthorityLoss(async (action) => {
    const url = '/v1/facilities/' + facility + '/memberships/' + membership + '/end';
    const actor = 'synthetic-person:' + facilityOwner;
    const body = { reason: 'Synthetic end of current workforce membership' };
    const headers = { 'if-match': '"1"', 'x-aal': '2' };
    if (ownerIsClinician) {
      const stale = await action(url, actor, body, 409, { ...headers, 'if-match': '"2"' });
      assert.equal(stale.body.code, 'version-conflict');
    }
    const ended = await action(url, actor, body, 200, headers);
    assert.equal(ended.body.id, membership);
    assert.equal(ended.body.status, 'ended');
    assert.equal(ended.body.version, 2);
    return ended;
  });
  return { ...result, end: change };
}

async function facilityScope({ facility, evidence }) {
  const { change, ...result } = await encounterAuthorityLoss(async (action) => {
    const suspended = await action(
      '/v1/admin/facilities/' + facility + '/decision',
      'synthetic-admin:facility_approver:f0110000-0000-4000-8000-000000000008',
      {
        decision: 'suspend',
        reason: 'Synthetic facility review',
        evidence_object_id: evidence,
      },
      200,
      { 'x-purpose': 'facility_approval', 'x-aal': '2', 'if-match': '"1"' },
    );
    assert.equal(suspended.body.id, facility);
    assert.equal(suspended.body.facility_status, 'suspended');
    assert.equal(suspended.body.version, 2);
    return suspended;
  });
  return { ...result, suspend: change };
}

async function bookingApi({ booking, nextSlot, secondId }) {
  const [clinician, patient] = fixtures;
  const calls = [];
  const invoke = async (name, fixture, method, url, expected, version, payload) => {
    checkpoint = name;
    const requestId = randomUUID();
    const response = await app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: {
        authorization: 'Bearer ' + fixture.token,
        'x-request-id': requestId,
        ...(method === 'POST' ? { 'idempotency-key': randomUUID() } : {}),
        ...(version ? { 'if-match': '"' + version + '"' } : {}),
      },
    });
    const body = response.json();
    calls.push({ name, requestId, status: response.statusCode, code: body.code });
    assert.equal(response.statusCode, expected, name + ' (' + body.code + ')');
    return body;
  };
  const appointments = '/v1/appointments';
  const created = await invoke('book', patient, 'POST', appointments, 201, null, booking);
  assert.equal(created.status, 'confirmed');
  const path = appointments + '/' + created.id;
  const changed = await invoke(
    'reschedule',
    patient,
    'POST',
    path + '/reschedule',
    200,
    created.version,
    nextSlot,
  );
  assert.equal(changed.id, created.id);
  assert.equal(changed.version, created.version + 1);
  assert.equal(Date.parse(changed.startsAt), Date.parse(nextSlot.startsAt));
  const first = await invoke(
    'check in rescheduled booking',
    patient,
    'POST',
    path + '/check-in',
    200,
    changed.version,
  );
  const second = await invoke(
    'check in second appointment',
    patient,
    'POST',
    appointments + '/' + secondId + '/check-in',
    200,
    1,
  );
  const queuePath =
    '/v1/clinics/' +
    booking.facilityId +
    '/queues?' +
    new URLSearchParams({
      doctorId: booking.doctorId,
      date: booking.civilDate,
    });
  const queue = await invoke('read waiting order', clinician, 'GET', queuePath, 200);
  const [firstId, secondEntryId] = [first.queueEntry.id, second.queueEntry.id];
  assert.deepEqual(
    queue.entries.map((entry) => entry.id),
    [firstId, secondEntryId],
  );
  const reordered = await invoke(
    'reorder waiting entry',
    clinician,
    'POST',
    '/v1/queue-entries/' + secondEntryId + '/reorder',
    200,
    second.queueEntry.version,
    {
      targetPosition: 1,
      queueVersion: queue.version,
      reason: 'Synthetic waiting order adjustment',
    },
  );
  assert.deepEqual(
    reordered.entries.map((entry) => entry.id),
    [secondEntryId, firstId],
  );
  return { calls, appointmentId: created.id, firstId, secondEntryId };
}

async function absenceApi({ facilityId, doctorId, appointmentId, ...interval }) {
  const [clinician, patient] = fixtures;
  const calls = [];
  const invoke = async (name, actor, url, payload, expected, headers = {}) => {
    checkpoint = name;
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      ...(payload ? { payload } : {}),
      headers: {
        authorization: 'Bearer ' + actor.token,
        'x-request-id': requestId,
        'idempotency-key': randomUUID(),
        ...headers,
      },
    });
    const body = response.json();
    calls.push({ name, status: response.statusCode, requestId });
    assert.equal(response.statusCode, expected, name + ' (' + body.code + ')');
    return body;
  };
  const checked = await invoke(
    'subject checks in appointment for absence fixture',
    patient,
    '/v1/appointments/' + appointmentId + '/check-in',
    null,
    200,
    { 'if-match': '"1"' },
  );
  assert.equal(checked.queueEntry.state, 'waiting');
  const queueEntryId = checked.queueEntry.id;
  const url = '/v1/clinics/' + facilityId + '/doctors/' + doctorId + '/absence';
  const payload = { ...interval, reason: 'Synthetic clinician absence' };
  const denied = await invoke(
    'patient cannot declare clinician absence',
    patient,
    url,
    payload,
    404,
  );
  assert.equal(denied.code, 'not-found');
  const result = await invoke('clinician declares absence', clinician, url, payload, 200);
  assert.deepEqual(result.affectedAppointmentIds, [appointmentId]);
  assert.deepEqual(result.removedQueueEntryIds, [queueEntryId]);
  return { calls, queueEntryId, absenceId: result.absenceId };
}

async function appointmentLinkApi(cases) {
  const [clinician] = fixtures;
  const calls = [];
  for (const { name, appointmentId, patientId, status, code } of cases) {
    checkpoint = name;
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      payload: { appointmentId, patientId, encounterType: 'consultation' },
      headers: {
        authorization: 'Bearer ' + clinician.token,
        'x-purpose': 'appointment.scheduling',
        'x-request-id': requestId,
        'idempotency-key': randomUUID(),
      },
    });
    const actual = { name, requestId, status: response.statusCode, code: response.json().code };
    assert.equal(actual.status, status, name + ': ' + actual.code);
    assert.equal(actual.code, code);
    calls.push(actual);
  }
  return { calls };
}

async function participantApi({ encounterId, consultantId, startedAt }) {
  const [responsible, , consultant] = fixtures;
  const url = '/v1/encounters/' + encounterId;
  const calls = [];
  const invoke = async (name, actor, options, expected) => {
    checkpoint = name;
    const requestId = randomUUID();
    const response = await app.inject({
      url,
      ...options,
      headers: {
        ...options.headers,
        authorization: 'Bearer ' + actor.token,
        'x-purpose': 'appointment.scheduling',
        'x-request-id': requestId,
      },
    });
    const body = response.json();
    calls.push({ name, requestId, status: response.statusCode, code: body.code });
    assert.equal(response.statusCode, expected, name + ' (' + body.code + ')');
    return body;
  };
  const read = { method: 'GET', url: url + '?fields=participants' };
  const project = (body) =>
    body.participants.find(
      (actor) => actor.personId === consultantId && actor.roleCode === 'consulting_clinician',
    );
  const before = await invoke('active participant read', consultant, read, 200);
  const active = project(before);
  assert.ok(active);
  assert.equal(active.endedAt, undefined);
  const close = (version, time) => ({
    method: 'PATCH',
    payload: {
      participantIntervalsEnd: [
        { personId: consultantId, roleCode: 'consulting_clinician', startedAt: time },
      ],
    },
    headers: { 'if-match': '"' + version + '"', 'idempotency-key': randomUUID() },
  });
  await invoke(
    'nonmatching interval close',
    responsible,
    close(before.version, '2020-01-02T00:00:00.000Z'),
    409,
  );
  const changed = await invoke(
    'responsible clinician closes interval',
    responsible,
    close(before.version, startedAt),
    200,
  );
  assert.equal(changed.version, before.version + 1);
  assert.ok(Date.parse(project(changed)?.endedAt) > Date.parse(startedAt));
  await invoke('closed participant read', consultant, read, 404);
  return { calls, version: changed.version };
}

async function scheduling({ checkInId, cancelId }) {
  const [clinician, patient] = fixtures;
  const calls = [];
  const action = async (fixture, url, version, payload) => {
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      ...(payload ? { payload } : {}),
      headers: {
        authorization: 'Bearer ' + fixture.token,
        'x-request-id': requestId,
        'if-match': '"' + version + '"',
        'idempotency-key': randomUUID(),
        'accept-language': 'en-EG',
      },
    });
    const body = response.json();
    calls.push({ url, requestId, status: response.statusCode, code: body.code });
    assert.equal(response.statusCode, 200, url + ' (' + body.code + ')');
    return body;
  };
  const appointment = '/v1/appointments/';
  const checked = await action(patient, appointment + checkInId + '/check-in', 1);
  assert.equal(checked.appointment.status, 'checked_in');
  assert.equal(checked.queueEntry.state, 'waiting');
  const { id, version } = checked.queueEntry;
  const queue = '/v1/queue-entries/' + id;
  const called = await action(clinician, queue + '/call', version);
  assert.equal(called.state, 'called');
  const complete = await action(clinician, queue + '/complete', called.version);
  assert.equal(complete.state, 'completed');
  const cancelled = await action(patient, appointment + cancelId + '/cancel', 1, {
    reason: 'Synthetic appointment cancellation',
  });
  assert.equal(cancelled.status, 'cancelled');
  return { calls, queueId: id };
}

async function recoveryIntake() {
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
  const continuity = new PostgresIdentityContinuityService(
    repository,
    config.identityEncryptionKey,
    'ci',
  );
  const intake = {
    caseId: randomUUID(),
    handleDigest: randomBytes(32),
    caseTokenDigest: randomBytes(32),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  await continuity.createRecoveryIntake(intake);
  checkpoint = 'reject invalid recovery intake digest';
  const bindingInput = { ...intake, subjectId: claims.subjectId };
  const invalidToken = Buffer.from(intake.caseTokenDigest);
  invalidToken[0] ^= 1;
  await assert.rejects(
    continuity.bindRecoveryIntake({ ...bindingInput, caseTokenDigest: invalidToken }),
    (error) => error?.status === 401 && error?.code === 'recovery-challenge-invalid',
  );
  // This is the repository boundary. GoTrue OTP redemption belongs to the HTTP flow.
  checkpoint = 'bind recovery intake to the resolved owner';
  const bound = await continuity.bindRecoveryIntake(bindingInput);
  assert.deepEqual(await continuity.bindRecoveryIntake(bindingInput), bound);
  return {
    caseId: intake.caseId,
    subject: claims.subjectId,
    personId: bound.personId,
    invalidDigest: 'denied',
    repeatedBinding: 'same-person',
  };
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

async function recoveryApi() {
  const fixture = fixtures[3];
  const client = new SupabaseAuthIssuer({
    url: supabaseUrl,
    anonKey: config.supabaseAnonKey,
    jwksUrl: config.supabaseJwksUrl,
    issuer,
    audience: config.supabaseJwtAudience,
  });
  await client.ready();
  const history = async (token) =>
    app.inject({
      method: 'GET',
      url: '/v1/privacy/consents',
      headers: { authorization: 'Bearer ' + token },
    });
  checkpoint = 'restricted ordinary read';
  const blocked = await history(fixture.token);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().code, 'recovery-mfa-enrollment-required');
  checkpoint = 'recovery gateway transport';
  const userPath = async (url, token) => {
    const result = await fetch(url, {
      headers: { apikey: anonKey, ...(token ? { authorization: 'Bearer ' + token } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    await result.body?.cancel();
    return result.status;
  };
  transport = {
    sdkBaseUrl: supabaseUrl,
    issuer,
    jwksUrl: config.supabaseJwksUrl,
    directNativeUser: await userPath(directAuth + '/user', fixture.token),
    configuredSdkUser: await userPath(issuer + '/user', fixture.token),
    gatewayUserWithoutSession: await userPath(issuer + '/user'),
    gatewayUnmappedRoot: await userPath(supabaseUrl + '/user', fixture.token),
    restrictedOrdinaryRead: blocked.statusCode,
  };
  assert.equal(transport.directNativeUser, 200);
  assert.equal(transport.configuredSdkUser, 200);
  assert.ok([401, 403].includes(transport.gatewayUserWithoutSession));
  assert.equal(transport.gatewayUnmappedRoot, 404);
  const submit = async (url, payload) => {
    checkpoint = url;
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: 'Bearer ' + fixture.token,
        'x-request-id': requestId,
        'idempotency-key': randomUUID(),
      },
    });
    const body = response.json();
    assert.equal(response.statusCode, 200, url + ' (' + body.code + ')');
    return { body, requestId, status: response.statusCode };
  };
  const path = '/v1/auth/mfa/enroll';
  const begin = await submit(path, { factorType: 'totp', friendlyName: 'Disposable replacement' });
  const verified = await submit(path + '/verify', {
    enrollmentId: begin.body.enrollmentId,
    code: probe.totp(begin.body.secret),
  });
  assert.equal(verified.body.factor.id, begin.body.enrollmentId);
  assert.equal(verified.body.factor.status, 'verified');
  assert.equal(verified.body.assurance, 'aal2');
  assert.equal(verified.body.session.restriction, null);
  const session = await client.resolveSession(verified.body.session.accessToken);
  assert.equal(session?.subjectId, fixture.subject);
  assert.equal(session.sessionId, fixture.session);
  assert.equal(session.aal, 2);
  checkpoint = 'ordinary read after verification';
  const after = await history(verified.body.session.accessToken);
  assert.equal(after.statusCode, 200);
  return {
    transport,
    subject: session.subjectId,
    session: session.sessionId,
    aal: session.aal,
    factorId: verified.body.factor.id,
    begin: { status: begin.status, requestId: begin.requestId },
    verify: { status: verified.status, requestId: verified.requestId },
    ordinaryRouteBefore: blocked.statusCode,
    ordinaryRouteAfter: after.statusCode,
  };
}
