import assert from 'node:assert/strict';
import test from 'node:test';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import {
  createClinicSchedulingClient,
  ClinicSchedulingApiError,
} from '@shifaa/api-client/clinic-scheduling';
import type {
  Appointment,
  CheckInResult,
  CreateAppointmentInput,
  RescheduleInput,
} from '@shifaa/contracts';
import { createPatientClinicSchedulingClient } from '../../apps/patient/src/clinic-scheduling-api.ts';
import { buildApp } from '../../services/api/src/app.ts';
import { loadConfig } from '../../services/api/src/config.ts';
import { PostgresClinicSchedulingService } from '../../services/api/src/adapters/postgres/clinic-scheduling-service.ts';
import { PostgresIdentityRepository } from '../../services/api/src/adapters/postgres/identity-repository.ts';
import { ClinicSchedulingService } from '../../services/api/src/modules/clinic-scheduling/service.ts';

const databaseName = process.env['SHIFAA_F009_DATABASE'];
const dbHost = process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1';
const dbPort = process.env['SHIFAA_PG_PORT'] ?? '5432';
const apiBaseUrl = 'https://synthetic.invalid';

const ids = {
  owner: 'f009a100-0000-4000-8c00-000000000001',
  doctor: 'f009a100-0000-4000-8c00-000000000002',
  patientA: 'f009a100-0000-4000-8c00-000000000003',
  patientB: 'f009a100-0000-4000-8c00-000000000004',
  patientRowA: 'f009a100-0000-4000-8f00-000000000001',
  patientRowB: 'f009a100-0000-4000-8f00-000000000002',
  facility: 'f009a100-0000-4000-8d00-000000000001',
  schedule: 'f009a100-0000-4000-8e00-000000000001',
  license: 'f009a100-0000-4000-8a00-000000000010',
  relationship: 'f009a100-0000-4000-8b00-000000000001',
} as const;

const forbiddenAppointmentStatuses = new Set([
  'requested',
  'in_queue',
  'in_consultation',
  'completed',
  'no_show',
]);

const syntheticAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'f009a100-0000-4000-8900-000000000001',
  patientId: ids.patientA,
  facilityId: ids.facility,
  doctorId: ids.doctor,
  startsAt: '2030-01-07T07:00:00.000Z',
  endsAt: '2030-01-07T07:30:00.000Z',
  timezone: 'Africa/Cairo',
  civilDate: '2030-01-07',
  status: 'confirmed',
  feeMinorUnits: 10000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
  ...overrides,
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hasApiStatus(status: number): (error: unknown) => boolean {
  return (error): error is ClinicSchedulingApiError =>
    error instanceof ClinicSchedulingApiError && error.status === status;
}

type SeenRequest = {
  method: string;
  path: string;
  locale: string | null;
  authorization: string | null;
  ifMatch: string | null;
  idempotencyKey: string | null;
  body: unknown;
};

function syntheticFetch(seen: SeenRequest[]): typeof fetch {
  const appointment = syntheticAppointment();
  const queueEntry = {
    id: 'f009a100-0000-4000-8900-000000000002',
    appointmentId: appointment.id,
    facilityId: ids.facility,
    doctorId: ids.doctor,
    civilDate: appointment.civilDate,
    queueNumber: 1,
    position: 1,
    estimatedServiceAt: null,
    state: 'waiting' as const,
    version: 1,
  };
  return async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      locale: headers.get('accept-language'),
      authorization: headers.get('authorization'),
      ifMatch: headers.get('if-match'),
      idempotencyKey: headers.get('idempotency-key'),
      body,
    } satisfies SeenRequest;
    seen.push(request);
    if (url.pathname === '/v1/appointments') {
      if (request.method === 'GET')
        return jsonResponse({ items: [appointment], nextCursor: null, freshness: 'fresh' });
      return jsonResponse(appointment, 201);
    }
    if (url.pathname.endsWith('/cancel'))
      return jsonResponse(syntheticAppointment({ status: 'cancelled', version: 2 }));
    if (url.pathname.endsWith('/reschedule'))
      return jsonResponse(
        syntheticAppointment({
          startsAt: '2030-01-07T08:00:00.000Z',
          endsAt: '2030-01-07T08:30:00.000Z',
          version: 2,
        }),
      );
    if (url.pathname.endsWith('/check-in'))
      return jsonResponse({
        appointment: syntheticAppointment({ status: 'checked_in', version: 2 }),
        queueEntry,
      } satisfies CheckInResult);
    if (url.pathname.endsWith('/queue-position'))
      return jsonResponse({
        appointmentId: appointment.id,
        queueNumber: 1,
        position: 1,
        state: 'waiting',
        estimatedServiceAt: null,
        queueVersion: 1,
        updatedAt: '2030-01-07T07:00:00.000Z',
        stale: false,
      });
    if (url.pathname.includes('/appointments/')) return jsonResponse(appointment);
    throw new Error(`unexpected synthetic request: ${url.pathname}`);
  };
}

test('T062 patient and clinic adapters cover bilingual view/cancel/reschedule/check-in with a restricted reschedule reason', async () => {
  const seen: SeenRequest[] = [];
  const patient = createPatientClinicSchedulingClient({
    locale: 'ar-EG',
    patientId: ids.patientA,
    accessToken: `synthetic-person:${ids.patientA}`,
    apiBaseUrl,
    fetch: syntheticFetch(seen),
  });
  const clinic = createClinicSchedulingClient({
    baseUrl: apiBaseUrl,
    accessToken: `synthetic-person:${ids.owner}`,
    acceptLanguage: 'en-EG',
    fetch: syntheticFetch(seen),
  });

  const viewed = await patient.getMyAppointment('f009a100-0000-4000-8900-000000000001');
  assert.equal(viewed.status, 'confirmed');
  assert.deepEqual((await patient.listMyAppointments()).items, [viewed]);
  const cancelled = await patient.cancelMyAppointment(
    viewed.id,
    { reason: 'patient requested cancellation' },
    viewed.version,
    'f009-t062-cancel-synthetic',
  );
  assert.equal(cancelled.status, 'cancelled');

  const rescheduled = await clinic.rescheduleAppointment(
    viewed.id,
    {
      startsAt: '2030-01-07T08:00:00.000Z',
      endsAt: '2030-01-07T08:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      reason: 'patient requested rescheduling',
    },
    1,
    'f009-t062-reschedule-synthetic',
  );
  assert.equal(rescheduled.version, 2);
  const checkIn = await patient.checkInMyAppointment(viewed.id, 1, 'f009-t062-checkin-synthetic');
  assert.equal(checkIn.appointment.status, 'checked_in');
  assert.equal((await patient.getMyQueuePosition(viewed.id)).state, 'waiting');

  const rescheduleRequest = seen.find((request) => request.path.endsWith('/reschedule'));
  assert.deepEqual(rescheduleRequest?.body, {
    startsAt: '2030-01-07T08:00:00.000Z',
    endsAt: '2030-01-07T08:30:00.000Z',
    timezone: 'Africa/Cairo',
    civilDate: '2030-01-07',
    reason: 'patient requested rescheduling',
  });
  assert.equal(
    seen.some((request) => request.locale === 'ar-EG'),
    true,
  );
  assert.equal(
    seen.some((request) => request.locale === 'en-EG'),
    true,
  );
  assert.equal(
    seen.every((request) => request.authorization?.startsWith('Bearer synthetic-person:')),
    true,
  );
  assert.equal(
    seen.filter((request) => request.path === '/v1/appointments' && request.method === 'GET')
      .length,
    1,
  );
});

test('T062 patient mutations fail closed offline and do not enqueue an authored transition', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: false },
  });
  let calls = 0;
  try {
    const patient = createPatientClinicSchedulingClient({
      locale: 'ar-EG',
      patientId: ids.patientA,
      accessToken: `synthetic-person:${ids.patientA}`,
      apiBaseUrl,
      fetch: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });
    assert.throws(
      () => patient.checkInMyAppointment(syntheticAppointment().id, 1, 'f009-t062-offline-key'),
      /offline-no-queue/,
    );
    assert.equal(calls, 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

function realDb(): Sql {
  if (!databaseName) throw new Error('SHIFAA_F009_DATABASE is required for appointment E2E');
  return postgres({
    host: dbHost,
    port: Number(dbPort),
    username: 'shifaa_owner',
    password: 'synthetic_owner_only',
    database: databaseName,
    max: 1,
  });
}

function inputFor(patientId: string, hour: number): CreateAppointmentInput {
  const utcHour = String(hour - 2).padStart(2, '0');
  return {
    patientId,
    facilityId: ids.facility,
    doctorId: ids.doctor,
    startsAt: `2030-01-07T${utcHour}:00:00.000Z`,
    endsAt: `2030-01-07T${utcHour}:30:00.000Z`,
    timezone: 'Africa/Cairo',
    civilDate: '2030-01-07',
    paymentMethod: 'cash_on_arrival',
  };
}

async function seed(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('shifaa.person_id','${ids.owner}',true),set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2030-01-01T00:00:00Z',true)`,
    );
    await tx.unsafe(`
      INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
        ('${ids.owner}','f009a100-0000-4000-9c00-000000000001','F009 T062 owner','active'),
        ('${ids.doctor}','f009a100-0000-4000-9c00-000000000002','F009 T062 doctor','active'),
        ('${ids.patientA}','f009a100-0000-4000-9c00-000000000003','F009 T062 patient A','active'),
        ('${ids.patientB}','f009a100-0000-4000-9c00-000000000004','F009 T062 patient B','active');
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES
        ('${ids.patientRowA}','${ids.patientA}','F009-T062-A','active'),
        ('${ids.patientRowB}','${ids.patientB}','F009-T062-B','active');
      INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
        VALUES ('${ids.facility}','clinic','عيادة اختبار','F009 T062 Clinic','active','C','Cairo','T062','Synthetic address','${ids.owner}');
      INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
        VALUES ('${ids.license}','${ids.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F009 T062 regulator','2099-12-31','verified');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,valid_from,membership_status,created_by_person_id)
        VALUES ('${ids.facility}','${ids.owner}','owner','2020-01-01','active','${ids.owner}');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
        VALUES ('${ids.facility}','${ids.doctor}','doctor','${ids.license}','2020-01-01','active','${ids.owner}');
      INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
        VALUES ('${ids.schedule}','${ids.facility}','${ids.doctor}','Africa/Cairo','2030-01-01','2030-01-31',30,10000,'EGP','active','${ids.owner}','${ids.owner}');
      INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
        VALUES ('${ids.schedule}',1,'09:00','15:00');
    `);
  });
}

async function clean(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL session_replication_role='replica'");
    await tx.unsafe(
      'TRUNCATE clinical.queue_entries,clinical.queue_scopes,clinical.appointments,clinical.schedule_exceptions,clinical.schedule_windows,clinical.schedules CASCADE',
    );
    await tx.unsafe(
      'TRUNCATE audit.events,platform.outbox_events,platform.idempotency_records CASCADE',
    );
    await tx.unsafe(
      `DELETE FROM identity.care_relationship_permissions WHERE relationship_id='${ids.relationship}'`,
    );
    await tx.unsafe(`DELETE FROM identity.care_relationships WHERE id='${ids.relationship}'`);
    await tx.unsafe(
      `DELETE FROM identity.facility_memberships WHERE facility_id='${ids.facility}'`,
    );
    await tx.unsafe(`DELETE FROM identity.professional_licenses WHERE id='${ids.license}'`);
    await tx.unsafe(
      `DELETE FROM identity.patients WHERE id IN ('${ids.patientRowA}','${ids.patientRowB}')`,
    );
    await tx.unsafe(`DELETE FROM identity.facilities WHERE id='${ids.facility}'`);
    await tx.unsafe(
      `DELETE FROM identity.people WHERE id IN ('${ids.owner}','${ids.doctor}','${ids.patientA}','${ids.patientB}')`,
    );
  });
}

function injectFetch(app: {
  inject: (options: Record<string, unknown>) => Promise<any>;
}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const result = await app.inject({
      method: init?.method ?? 'GET',
      url: `${url.pathname}${url.search}`,
      headers,
      ...(init?.body === undefined ? {} : { payload: JSON.parse(String(init.body)) }),
    });
    return new Response(result.body, {
      status: result.statusCode,
      headers: { 'content-type': String(result.headers['content-type'] ?? 'application/json') },
    });
  };
}

async function insertRelationship(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL session_replication_role='replica'");
    await tx.unsafe(`
      INSERT INTO identity.care_relationships(
        id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,purpose_code,created_by_person_id,version
      ) VALUES (
        '${ids.relationship}','${ids.patientRowB}','${ids.patientA}','delegation','active','2020-01-01T00:00:00Z',
        'appointment.scheduling','${ids.owner}',1
      );
      INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
        VALUES ('${ids.relationship}','appointment.manage','${ids.owner}');
    `);
  });
}

test(
  'T062 real serial API journey covers atomic booking effects, patient/clinic actions, stale versions, relationship revocation, and one-winner slot race',
  { skip: !databaseName },
  async () => {
    const sql = realDb();
    const apiDatabaseUrl = `postgresql://shifaa_api:synthetic_api_only@${dbHost}:${dbPort}/${databaseName}`;
    const identity = new PostgresIdentityRepository(apiDatabaseUrl);
    let harness: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      await identity.ready();
      const adapter = new PostgresClinicSchedulingService(
        {
          withRawTransaction: <T>(work: (tx: TransactionSql) => Promise<T>) =>
            identity.withRawTransaction(work),
        },
        'local',
      );
      const base = loadConfig({ NODE_ENV: 'test' });
      harness = await buildApp({
        config: {
          ...base,
          repositoryAdapter: 'postgres',
          databaseUrl: apiDatabaseUrl,
          identityOnboardingEnabled: true,
          syntheticMode: true,
        },
        clinicSchedulingService: new ClinicSchedulingService({
          authorization: {
            authorize: async (actor, action, target) => ({
              action,
              facilityId: target.facilityId ?? ids.facility,
              ...(target.doctorId === undefined ? {} : { doctorId: target.doctorId }),
              ...(target.patientId === undefined ? {} : { patientId: target.patientId }),
              facilityVerified: true,
              doctorLicenseVerified: true,
              relationship: actor.personId === ids.owner ? 'owner' : 'self',
            }),
          },
          featureFlags: { enabled: async () => true },
          read: adapter,
          repository: adapter,
          clock: { now: () => new Date('2030-01-01T00:00:00Z') },
          cache: { get: async () => undefined, set: async () => undefined },
        }),
      });

      const fetch = injectFetch(harness.app);
      const patientA = createPatientClinicSchedulingClient({
        locale: 'ar-EG',
        patientId: ids.patientA,
        accessToken: `synthetic-person:${ids.patientA}`,
        apiBaseUrl,
        fetch,
      });
      const patientB = createPatientClinicSchedulingClient({
        locale: 'en-EG',
        patientId: ids.patientB,
        accessToken: `synthetic-person:${ids.patientB}`,
        apiBaseUrl,
        fetch,
      });
      const clinic = createClinicSchedulingClient({
        baseUrl: apiBaseUrl,
        accessToken: `synthetic-person:${ids.owner}`,
        acceptLanguage: 'en-EG',
        fetch,
      });

      await clean(sql);
      await seed(sql);
      const original = inputFor(ids.patientA, 9);
      let disconnected = true;
      const uncertainFetch: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (disconnected && init?.method === 'POST' && String(input).endsWith('/v1/appointments')) {
          disconnected = false;
          throw new TypeError('connection-reset-after-commit');
        }
        return response;
      };
      const reconnectingPatient = createPatientClinicSchedulingClient({
        locale: 'ar-EG',
        patientId: ids.patientA,
        accessToken: `synthetic-person:${ids.patientA}`,
        apiBaseUrl,
        fetch: uncertainFetch,
      });
      await assert.rejects(
        () => reconnectingPatient.createAppointment(original, 'f009-t062-commit-boundary-create'),
        /connection-reset-after-commit/,
      );
      const durable = await reconnectingPatient.createAppointment(
        original,
        'f009-t062-commit-boundary-create',
      );
      assert.equal(durable.status, 'confirmed');
      assert.equal(durable.feeMinorUnits, 10000);
      assert.equal(durable.currency, 'EGP');
      assert.equal(durable.paymentMethod, 'cash_on_arrival');
      const effects = await sql<
        {
          appointments: number;
          audit: number;
          outbox: number;
          idempotency: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM clinical.appointments WHERE id=${durable.id}) AS appointments,
          (SELECT count(*)::int FROM audit.events WHERE resource_id=${durable.id}) AS audit,
          (SELECT count(*)::int FROM platform.outbox_events WHERE aggregate_id=${durable.id}) AS outbox,
          (SELECT count(*)::int FROM platform.idempotency_records) AS idempotency`;
      assert.deepEqual(effects[0], { appointments: 1, audit: 1, outbox: 1, idempotency: 1 });

      const patientView = await patientA.getMyAppointment(durable.id);
      const clinicView = await clinic.getAppointment(durable.id);
      assert.equal(patientView.id, durable.id);
      assert.equal(clinicView.status, 'confirmed');
      assert.equal((await patientA.listMyAppointments()).items.length, 1);

      const cancelledInput = inputFor(ids.patientA, 10);
      const cancelled = await patientA.createAppointment(cancelledInput, 'f009-t062-cancel-create');
      const cancelledResult = await patientA.cancelMyAppointment(
        cancelled.id,
        { reason: 'patient requested cancellation' },
        cancelled.version,
        'f009-t062-cancel-transition',
      );
      assert.equal(cancelledResult.status, 'cancelled');
      assert.equal(cancelledResult.version, 2);
      assert.equal(forbiddenAppointmentStatuses.has(cancelledResult.status), false);
      await assert.rejects(
        () =>
          patientA.cancelMyAppointment(
            cancelled.id,
            { reason: 'stale cancellation attempt' },
            cancelled.version,
            'f009-t062-stale-cancel',
          ),
        hasApiStatus(409),
      );
      const cancelledPreserved = await patientA.getMyAppointment(cancelled.id);
      assert.equal(cancelledPreserved.status, 'cancelled');
      assert.equal(cancelledPreserved.version, 2);

      const rescheduledInput = inputFor(ids.patientA, 11);
      const rescheduled = await patientA.createAppointment(
        rescheduledInput,
        'f009-t062-reschedule-create',
      );
      const replacement: RescheduleInput = {
        startsAt: '2030-01-07T10:30:00.000Z',
        endsAt: '2030-01-07T11:00:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        reason: 'patient requested a replacement time',
      };
      const replacementResult = await patientA.rescheduleMyAppointment(
        rescheduled.id,
        replacement,
        rescheduled.version,
        'f009-t062-reschedule-transition',
      );
      assert.equal(replacementResult.status, 'confirmed');
      assert.equal(replacementResult.version, 2);
      await assert.rejects(
        () =>
          patientA.rescheduleMyAppointment(
            rescheduled.id,
            {
              ...replacement,
              startsAt: '2030-01-07T10:00:00.000Z',
              endsAt: '2030-01-07T10:30:00.000Z',
            },
            1,
            'f009-t062-stale-reschedule',
          ),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 409,
      );
      const preserved = await patientA.getMyAppointment(rescheduled.id);
      assert.equal(preserved.version, 2);
      assert.equal(
        new Date(preserved.startsAt).toISOString(),
        new Date(replacement.startsAt).toISOString(),
      );

      const checkInInput = inputFor(ids.patientA, 12);
      const checkInAppointment = await patientA.createAppointment(
        checkInInput,
        'f009-t062-checkin-create',
      );
      const checkedIn = await clinic.checkInAppointment(
        checkInAppointment.id,
        checkInAppointment.version,
        'f009-t062-checkin-transition',
      );
      assert.equal(checkedIn.appointment.status, 'checked_in');
      assert.equal(checkedIn.queueEntry.state, 'waiting');
      assert.equal((await patientA.getMyQueuePosition(checkInAppointment.id)).state, 'waiting');
      const afterCheckIn = await patientA.getMyAppointment(checkInAppointment.id);
      assert.equal(afterCheckIn.status, 'checked_in');
      assert.equal(forbiddenAppointmentStatuses.has(afterCheckIn.status), false);
      const queueRows = await sql<{ entries: number }[]>`
        SELECT count(*)::int AS entries FROM clinical.queue_entries WHERE appointment_id=${checkInAppointment.id}`;
      assert.deepEqual(queueRows[0], { entries: 1 });
      const queueStates = await sql<{ state: string }[]>`
        SELECT DISTINCT state FROM clinical.queue_entries WHERE facility_id=${ids.facility}`;
      assert.deepEqual(
        queueStates.map((row) => row.state),
        ['waiting'],
      );
      await assert.rejects(
        () =>
          patientA.checkInMyAppointment(
            checkInAppointment.id,
            checkInAppointment.version,
            'f009-t062-stale-check-in',
          ),
        hasApiStatus(409),
      );
      const calledQueueEntry = await clinic.callQueueEntry(
        checkedIn.queueEntry.id,
        checkedIn.queueEntry.version,
        'f009-t062-forbidden-producer-call',
      );
      assert.equal(calledQueueEntry.state, 'called');
      const completedQueueEntry = await clinic.completeQueueEntry(
        calledQueueEntry.id,
        calledQueueEntry.version,
        'f009-t062-forbidden-producer-complete',
      );
      assert.equal(completedQueueEntry.state, 'completed');
      const afterQueueLifecycle = await patientA.getMyAppointment(checkInAppointment.id);
      assert.equal(afterQueueLifecycle.status, 'checked_in');
      assert.equal(forbiddenAppointmentStatuses.has(afterQueueLifecycle.status), false);

      const absenceAppointment = await patientA.createAppointment(
        inputFor(ids.patientA, 14),
        'f009-t062-reschedule-required-create',
      );
      const absence = await clinic.declareDoctorAbsence(
        ids.facility,
        ids.doctor,
        {
          startsAt: absenceAppointment.startsAt,
          endsAt: absenceAppointment.endsAt,
          civilDate: absenceAppointment.civilDate,
          reason: 'synthetic doctor absence for T062',
        },
        'f009-t062-reschedule-required-absence',
      );
      assert.equal(absence.affectedAppointmentIds.includes(absenceAppointment.id), true);
      const rescheduleRequired = await patientA.getMyAppointment(absenceAppointment.id);
      assert.equal(rescheduleRequired.status, 'reschedule_required');
      assert.equal(rescheduleRequired.version, 2);
      const cancelledWithoutReplacement = await patientA.cancelMyAppointment(
        absenceAppointment.id,
        { reason: 'patient cancels after doctor absence' },
        rescheduleRequired.version,
        'f009-t062-reschedule-required-cancel',
      );
      assert.equal(cancelledWithoutReplacement.status, 'cancelled');
      assert.equal(cancelledWithoutReplacement.version, 3);

      const delegated = inputFor(ids.patientB, 13);
      const delegatedAppointment = await patientB.createAppointment(
        delegated,
        'f009-t062-relationship-create',
      );
      const delegatedCheckIn = await patientB.checkInMyAppointment(
        delegatedAppointment.id,
        delegatedAppointment.version,
        'f009-t062-cross-patient-check-in',
      );
      await assert.rejects(
        () => patientA.getMyAppointment(delegatedAppointment.id),
        hasApiStatus(404),
      );
      await assert.rejects(
        () => patientA.getMyQueuePosition(delegatedAppointment.id),
        hasApiStatus(404),
      );
      await insertRelationship(sql);
      const delegatedQueuePosition = await patientA.getMyQueuePosition(delegatedAppointment.id);
      assert.equal(delegatedQueuePosition.state, delegatedCheckIn.queueEntry.state);
      const delegatedActor = {
        personId: ids.patientA,
        principal: `synthetic-person:${ids.patientA}`,
        requestId: 'f009-t062-relationship-read',
        traceId: 'f009a100000040008c00000000000001',
        aal: 1 as const,
        locale: 'ar-EG' as const,
      };
      const related = await adapter.readMyAppointment(delegatedActor, delegatedAppointment.id);
      assert.equal(related?.id, delegatedAppointment.id);
      await sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL session_replication_role='replica'");
        await tx.unsafe(
          `UPDATE identity.care_relationships SET status='revoked',version=version+1 WHERE id='${ids.relationship}'`,
        );
      });
      await assert.rejects(
        () => patientA.getMyQueuePosition(delegatedAppointment.id),
        hasApiStatus(404),
      );
      assert.equal(await adapter.readMyAppointment(delegatedActor, delegatedAppointment.id), null);

      const raceOriginalA = await patientA.createAppointment(
        inputFor(ids.patientA, 15),
        'f009-t062-reschedule-race-original-a',
      );
      const raceOriginalB = await patientB.createAppointment(
        inputFor(ids.patientB, 16),
        'f009-t062-reschedule-race-original-b',
      );
      const occupiedReplacement: RescheduleInput = {
        startsAt: '2030-01-07T08:00:00.000Z',
        endsAt: '2030-01-07T08:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        reason: 'competing replacement request',
      };
      const race = await Promise.allSettled([
        patientA.rescheduleMyAppointment(
          raceOriginalA.id,
          occupiedReplacement,
          raceOriginalA.version,
          'f009-t062-reschedule-race-a',
        ),
        patientB.rescheduleMyAppointment(
          raceOriginalB.id,
          occupiedReplacement,
          raceOriginalB.version,
          'f009-t062-reschedule-race-b',
        ),
      ]);
      assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(race.filter((result) => result.status === 'rejected').length, 1);
      const fulfilledRace = race.filter(
        (result): result is PromiseFulfilledResult<Appointment> => result.status === 'fulfilled',
      );
      const rejectedRace = race.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      assert.equal(rejectedRace[0]?.reason instanceof ClinicSchedulingApiError, true);
      assert.equal((rejectedRace[0]?.reason as ClinicSchedulingApiError).status, 409);
      const raceRows = await sql<
        { id: string; patient_id: string; starts_at: string; status: string; version: number }[]
      >`
        SELECT id,patient_person_id AS patient_id,starts_at::text,status,version
        FROM clinical.appointments
        WHERE id=${raceOriginalA.id} OR id=${raceOriginalB.id}
        ORDER BY id`;
      assert.equal(raceRows.length, 2);
      const occupiedRows = raceRows.filter(
        (row) =>
          new Date(row.starts_at).toISOString() ===
          new Date(occupiedReplacement.startsAt).toISOString(),
      );
      assert.equal(occupiedRows.length, 1);
      assert.equal(fulfilledRace[0]?.value.id, occupiedRows[0]?.id);
      const loserRow = raceRows.find((row) => row.id !== occupiedRows[0]?.id);
      assert.ok(loserRow);
      const loserOriginal = loserRow.id === raceOriginalA.id ? raceOriginalA : raceOriginalB;
      assert.equal(loserRow.status, 'confirmed');
      assert.equal(loserRow.version, 1);
      assert.equal(
        new Date(loserRow.starts_at).toISOString(),
        new Date(loserOriginal.startsAt).toISOString(),
      );
      const statuses = await sql<{ status: string }[]>`
        SELECT DISTINCT status FROM clinical.appointments WHERE facility_id=${ids.facility}`;
      assert.equal(
        statuses.some((row) => forbiddenAppointmentStatuses.has(row.status)),
        false,
      );
    } finally {
      await harness?.app.close();
      await identity.close();
      await clean(sql);
      await sql.end({ timeout: 5 });
    }
  },
);
