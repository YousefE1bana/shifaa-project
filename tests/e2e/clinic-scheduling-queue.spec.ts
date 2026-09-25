import assert from 'node:assert/strict';
import test from 'node:test';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import {
  createClinicSchedulingClient,
  ClinicSchedulingApiError,
} from '@shifaa/api-client/clinic-scheduling';
import type { CreateAppointmentInput } from '@shifaa/contracts';
import { buildApp } from '../../services/api/src/app.ts';
import { loadConfig } from '../../services/api/src/config.ts';
import { PostgresClinicSchedulingService } from '../../services/api/src/adapters/postgres/clinic-scheduling-service.ts';
import { PostgresIdentityRepository } from '../../services/api/src/adapters/postgres/identity-repository.ts';
import { ClinicSchedulingService } from '../../services/api/src/modules/clinic-scheduling/service.ts';

const databaseName = process.env['SHIFAA_F009_DATABASE'];
const dbHost = process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1';
const dbPort = Number(process.env['SHIFAA_PG_PORT'] ?? '5432');
const baseUrl = 'https://synthetic.invalid';
const ids = {
  owner: 'f009b100-0000-4000-8c00-000000000001',
  doctor: 'f009b100-0000-4000-8c00-000000000002',
  patientA: 'f009b100-0000-4000-8c00-000000000003',
  patientB: 'f009b100-0000-4000-8c00-000000000004',
  patientC: 'f009b100-0000-4000-8c00-000000000005',
  patientRowA: 'f009b100-0000-4000-8f00-000000000001',
  patientRowB: 'f009b100-0000-4000-8f00-000000000002',
  patientRowC: 'f009b100-0000-4000-8f00-000000000003',
  facility: 'f009b100-0000-4000-8d00-000000000001',
  otherFacility: 'f009b100-0000-4000-8d00-000000000002',
  schedule: 'f009b100-0000-4000-8e00-000000000001',
  license: 'f009b100-0000-4000-8a00-000000000010',
} as const;

function realDb(): Sql {
  if (!databaseName) throw new Error('SHIFAA_F009_DATABASE is required for queue E2E');
  return postgres({
    host: dbHost,
    port: dbPort,
    username: 'shifaa_owner',
    password: 'synthetic_owner_only',
    database: databaseName,
    max: 1,
  });
}

function appointmentInput(patientId: string, hour: number): CreateAppointmentInput {
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
        ('${ids.owner}','f009b100-0000-4000-9c00-000000000001','F009 T066 owner','active'),
        ('${ids.doctor}','f009b100-0000-4000-9c00-000000000002','F009 T066 doctor','active'),
        ('${ids.patientA}','f009b100-0000-4000-9c00-000000000003','F009 T066 patient A','active'),
        ('${ids.patientB}','f009b100-0000-4000-9c00-000000000004','F009 T066 patient B','active'),
        ('${ids.patientC}','f009b100-0000-4000-9c00-000000000005','F009 T066 patient C','active');
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES
        ('${ids.patientRowA}','${ids.patientA}','F009-T066-A','active'),
        ('${ids.patientRowB}','${ids.patientB}','F009-T066-B','active'),
        ('${ids.patientRowC}','${ids.patientC}','F009-T066-C','active');
      INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) VALUES
        ('${ids.facility}','clinic','عيادة اختبار','F009 T066 Clinic','active','C','Cairo','T066','Synthetic address','${ids.owner}'),
        ('${ids.otherFacility}','clinic','عيادة أخرى','F009 T066 Other Clinic','active','C','Cairo','T066','Synthetic address','${ids.owner}');
      INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
        VALUES ('${ids.license}','${ids.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F009 T066 regulator','2099-12-31','verified');
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
      `DELETE FROM identity.facility_memberships WHERE facility_id IN ('${ids.facility}','${ids.otherFacility}')`,
    );
    await tx.unsafe(`DELETE FROM identity.professional_licenses WHERE id='${ids.license}'`);
    await tx.unsafe(
      `DELETE FROM identity.patients WHERE id IN ('${ids.patientRowA}','${ids.patientRowB}','${ids.patientRowC}')`,
    );
    await tx.unsafe(
      `DELETE FROM identity.facilities WHERE id IN ('${ids.facility}','${ids.otherFacility}')`,
    );
    await tx.unsafe(
      `DELETE FROM identity.people WHERE id IN ('${ids.owner}','${ids.doctor}','${ids.patientA}','${ids.patientB}','${ids.patientC}')`,
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

test(
  'T066 real serial API/PostgreSQL queue lifecycle proves allocation, privacy, scope, conflicts, absence, and reconnect',
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
      harness = await buildApp({
        config: {
          ...loadConfig({ NODE_ENV: 'test' }),
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
      const clinic = createClinicSchedulingClient({
        baseUrl,
        accessToken: `synthetic-person:${ids.owner}`,
        acceptLanguage: 'en-EG',
        fetch,
      });
      const patientA = createClinicSchedulingClient({
        baseUrl,
        accessToken: `synthetic-person:${ids.patientA}`,
        acceptLanguage: 'ar-EG',
        fetch,
      });
      const patientB = createClinicSchedulingClient({
        baseUrl,
        accessToken: `synthetic-person:${ids.patientB}`,
        acceptLanguage: 'en-EG',
        fetch,
      });
      const patientC = createClinicSchedulingClient({
        baseUrl,
        accessToken: `synthetic-person:${ids.patientC}`,
        acceptLanguage: 'ar-EG',
        fetch,
      });
      await clean(sql);
      await seed(sql);

      const [a, b, c] = await Promise.all([
        patientA.createAppointment(appointmentInput(ids.patientA, 9), 'f009-t066-create-a'),
        patientB.createAppointment(appointmentInput(ids.patientB, 10), 'f009-t066-create-b'),
        patientA.createAppointment(appointmentInput(ids.patientA, 11), 'f009-t066-create-c'),
      ]);
      assert.ok(a && b && c);
      const checkins = await Promise.all([
        clinic.checkInAppointment(a.id, a.version, 'f009-t066-checkin-a'),
        clinic.checkInAppointment(b.id, b.version, 'f009-t066-checkin-b'),
        clinic.checkInAppointment(c.id, c.version, 'f009-t066-checkin-c'),
      ]);
      assert.ok(
        checkins.every(
          (item) => item.appointment.status === 'checked_in' && item.queueEntry.state === 'waiting',
        ),
      );
      assert.equal(
        new Set(checkins.map((item) => item.queueEntry.queueNumber)).size,
        3,
        'concurrent check-ins allocate distinct queue numbers',
      );
      const durable = await sql<
        { count: number; distinct_count: number }[]
      >`SELECT count(*)::int AS count,count(DISTINCT queue_number)::int AS distinct_count FROM clinical.queue_entries WHERE facility_id=${ids.facility} AND doctor_person_id=${ids.doctor} AND civil_date='2030-01-07'`;
      assert.deepEqual(durable[0], { count: 3, distinct_count: 3 });

      const own = await patientA.getMyQueuePosition(a.id);
      assert.equal(own.state, 'waiting');
      await assert.rejects(
        () => patientA.getMyQueuePosition(b.id),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 404,
      );
      const projection = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      assert.equal(projection.entries.length, 3);
      assert.ok(
        projection.entries.every(
          (entry) =>
            entry.facilityId === ids.facility &&
            entry.doctorId === ids.doctor &&
            entry.civilDate === '2030-01-07',
        ),
      );
      assert.ok(
        projection.entries.every((entry) => !('patientId' in entry) && !('patientName' in entry)),
      );
      const appointmentStatuses = await sql<
        { status: string }[]
      >`SELECT DISTINCT status FROM clinical.appointments WHERE id=ANY(${sql.array([a.id, b.id, c.id])}::uuid[])`;
      assert.deepEqual(
        appointmentStatuses.map((row) => row.status),
        ['checked_in'],
      );

      const originalEntry = checkins[0]!.queueEntry;
      for (const [suffix, reason] of [
        ['newline', 'bad\nreason'],
        ['empty', ''],
        ['whitespace', ' \t '],
        ['control', 'reason\u0001text'],
        ['oversize', 'r'.repeat(501)],
      ] as const) {
        await assert.rejects(
          () =>
            clinic.reorderQueueEntry(
              originalEntry.id,
              { targetPosition: 2, queueVersion: projection.version, reason },
              originalEntry.version,
              `f009-t066-reorder-invalid-${suffix}`,
            ),
          (error) => error instanceof ClinicSchedulingApiError && error.status === 400,
        );
      }
      const afterInvalidReasons = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      assert.equal(afterInvalidReasons.version, projection.version);
      assert.deepEqual(
        afterInvalidReasons.entries.map((entry) => [entry.id, entry.position, entry.version]),
        projection.entries.map((entry) => [entry.id, entry.position, entry.version]),
        'invalid restricted reasons make no partial queue changes',
      );
      const unicodeReason = '😀'.repeat(500);
      const unicodeReorder = await clinic.reorderQueueEntry(
        originalEntry.id,
        { targetPosition: 2, queueVersion: projection.version, reason: unicodeReason },
        originalEntry.version,
        'f009-t066-reorder-unicode-boundary',
      );
      assert.ok(unicodeReorder.version > projection.version);
      assert.ok(
        unicodeReorder.entries.every(
          (entry) => !('reason' in entry) && !('reorderReason' in entry),
        ),
      );
      const persistedUnicodeReason = await sql<{ reorder_reason: string }[]>`
        SELECT reorder_reason FROM clinical.queue_entries WHERE id=${originalEntry.id}`;
      assert.equal(persistedUnicodeReason[0]?.reorder_reason, unicodeReason);
      const restrictedEffects = await sql<{ audit_text: string; outbox_text: string }[]>`
        SELECT
          COALESCE((SELECT string_agg(to_jsonb(a)::text, '') FROM audit.events a WHERE a.resource_id=${originalEntry.id}), '') AS audit_text,
          COALESCE((SELECT string_agg(payload::text, '') FROM platform.outbox_events WHERE aggregate_id=${originalEntry.id}), '') AS outbox_text`;
      assert.equal(restrictedEffects[0]?.audit_text.includes(unicodeReason), false);
      assert.equal(restrictedEffects[0]?.outbox_text.includes(unicodeReason), false);
      const raceProjection = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      const raceEntry = raceProjection.entries.find((entry) => entry.id === originalEntry.id)!;
      const reorderRace = await Promise.allSettled([
        clinic.reorderQueueEntry(
          raceEntry.id,
          {
            targetPosition: 2,
            queueVersion: raceProjection.version,
            reason: 'Queue race position two correction',
          },
          raceEntry.version,
          'f009-t066-reorder-race-a',
        ),
        clinic.reorderQueueEntry(
          raceEntry.id,
          {
            targetPosition: 3,
            queueVersion: raceProjection.version,
            reason: 'Urgent clinical workflow correction',
          },
          raceEntry.version,
          'f009-t066-reorder-race-b',
        ),
      ]);
      assert.equal(
        reorderRace.filter((result) => result.status === 'fulfilled').length,
        1,
        JSON.stringify(
          reorderRace.map((result) =>
            result.status === 'rejected' ? String(result.reason) : 'fulfilled',
          ),
        ),
      );
      assert.equal(reorderRace.filter((result) => result.status === 'rejected').length, 1);
      const rejected = reorderRace.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      assert.ok(rejected?.reason instanceof ClinicSchedulingApiError);
      assert.equal(rejected.reason.status, 409);
      const afterReorder = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      assert.ok(
        afterReorder.version > raceProjection.version,
        'stale queue version requires an authoritative fresh projection',
      );
      assert.ok(afterReorder.entries.every((entry) => entry.state === 'waiting'));
      assert.deepEqual(
        afterReorder.entries.map((entry) => entry.position),
        afterReorder.entries.map((_, index) => index + 1),
      );
      assert.equal(
        afterReorder.entries.find((entry) => entry.id === raceEntry.id)?.position,
        reorderRace[0].status === 'fulfilled' ? 2 : 3,
      );
      assert.ok(
        afterReorder.entries.every((entry) => !('reason' in entry) && !('reorderReason' in entry)),
      );
      assert.deepEqual(
        (
          await sql<
            { status: string }[]
          >`SELECT DISTINCT status FROM clinical.appointments WHERE id=ANY(${sql.array([a.id, b.id, c.id])}::uuid[])`
        ).map((row) => row.status),
        ['checked_in'],
      );

      const reorderedEntry = afterReorder.entries.find((entry) => entry.id === originalEntry.id)!;
      const anotherWaitingEntry = afterReorder.entries.find(
        (entry) => entry.id !== reorderedEntry.id && entry.state === 'waiting',
      )!;
      await assert.rejects(
        () =>
          clinic.reorderQueueEntry(
            reorderedEntry.id,
            {
              targetPosition: 1,
              queueVersion: afterReorder.version,
              reason: 'Stale entry version check',
            },
            originalEntry.version,
            'f009-t066-stale-entry-version',
          ),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 409,
      );
      await assert.rejects(
        () =>
          clinic.reorderQueueEntry(
            anotherWaitingEntry.id,
            {
              targetPosition: 1,
              queueVersion: raceProjection.version,
              reason: 'Stale queue version check',
            },
            anotherWaitingEntry.version,
            'f009-t066-stale-queue-version',
          ),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 409,
      );
      const afterStaleEntry = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      assert.equal(afterStaleEntry.version, afterReorder.version);
      assert.deepEqual(
        afterStaleEntry.entries.map((entry) => [entry.id, entry.position, entry.version]),
        afterReorder.entries.map((entry) => [entry.id, entry.position, entry.version]),
        'stale entry version makes no partial queue changes',
      );

      const entryToCall = afterReorder.entries.find((entry) => entry.appointmentId === a.id)!;
      const called = await clinic.callQueueEntry(
        entryToCall.id,
        entryToCall.version,
        'f009-t066-call-entry-a',
      );
      assert.equal(called.state, 'called');
      const afterCallQueue = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      await assert.rejects(
        () =>
          clinic.reorderQueueEntry(
            called.id,
            {
              targetPosition: 1,
              queueVersion: afterCallQueue.version,
              reason: 'Called entries stay in place',
            },
            called.version,
            'f009-t066-reorder-called',
          ),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 409,
      );
      assert.equal(
        (await clinic.getQueue(ids.facility, { doctorId: ids.doctor, date: '2030-01-07' })).version,
        afterCallQueue.version,
      );
      const completed = await clinic.completeQueueEntry(
        called.id,
        called.version,
        'f009-t066-complete',
      );
      assert.equal(completed.state, 'completed');
      assert.equal((await clinic.getAppointment(a.id)).status, 'checked_in');

      const absenceAppointment = await patientB.createAppointment(
        appointmentInput(ids.patientB, 12),
        'f009-t066-absence-appt',
      );
      const absenceCheckedIn = await clinic.checkInAppointment(
        absenceAppointment.id,
        absenceAppointment.version,
        'f009-t066-absence-checkin',
      );
      const absence = await clinic.declareDoctorAbsence(
        ids.facility,
        ids.doctor,
        {
          startsAt: absenceAppointment.startsAt,
          endsAt: absenceAppointment.endsAt,
          civilDate: absenceAppointment.civilDate,
          reason: 'Synthetic T066 absence test',
        },
        'f009-t066-absence',
      );
      assert.ok(absence.affectedAppointmentIds.includes(absenceAppointment.id));
      assert.ok(absence.removedQueueEntryIds.includes(absenceCheckedIn.queueEntry.id));
      assert.equal(
        (
          await clinic.getQueue(ids.facility, { doctorId: ids.doctor, date: '2030-01-07' })
        ).entries.some(
          (entry) => entry.id === absenceCheckedIn.queueEntry.id && entry.state === 'removed',
        ),
        true,
      );
      assert.equal(
        (await clinic.getAppointment(absenceAppointment.id)).status,
        'reschedule_required',
      );

      await assert.rejects(
        () => clinic.getQueue(ids.otherFacility, { doctorId: ids.doctor, date: '2030-01-07' }),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 404,
      );
      await assert.rejects(
        () =>
          clinic.getQueue(ids.facility, {
            doctorId: 'f009b100-0000-4000-8c00-000000000099',
            date: '2030-01-07',
          }),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 404,
      );
      await assert.rejects(
        () => clinic.getQueue(ids.facility, { doctorId: ids.doctor, date: '2100-01-07' }),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 404,
      );
      await assert.rejects(
        () => patientC.getMyQueuePosition(a.id),
        (error) => error instanceof ClinicSchedulingApiError && error.status === 404,
      );

      let disconnected = true;
      let attemptedOfflineRequests = 0;
      const reconnectingFetch: typeof fetch = async (input, init) => {
        if (disconnected) {
          attemptedOfflineRequests += 1;
          throw new TypeError('synthetic-offline-before-request-delivery');
        }
        return fetch(input, init);
      };
      const reconnectingClient = createClinicSchedulingClient({
        baseUrl,
        accessToken: `synthetic-person:${ids.owner}`,
        acceptLanguage: 'en-EG',
        fetch: reconnectingFetch,
      });
      const queueBeforeOfflineAttempt = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      const offlineTarget = queueBeforeOfflineAttempt.entries.find(
        (entry) => entry.state === 'waiting',
      );
      assert.ok(offlineTarget, 'offline mutation uses a current waiting queue entry');
      await assert.rejects(
        () =>
          reconnectingClient.callQueueEntry(
            offlineTarget.id,
            offlineTarget.version,
            'f009-t066-reconnect-call',
          ),
        /synthetic-offline-before-request-delivery/,
      );
      assert.equal(
        attemptedOfflineRequests,
        1,
        'the failed offline mutation is attempted once and not queued',
      );
      assert.equal(
        (
          await sql<
            { count: number }[]
          >`SELECT count(*)::int AS count FROM clinical.queue_entries WHERE id=${offlineTarget.id} AND state='waiting'`
        ).at(0)?.count,
        1,
      );
      disconnected = false;
      const reconnectedCall = await reconnectingClient.callQueueEntry(
        offlineTarget.id,
        offlineTarget.version,
        'f009-t066-reconnect-call',
      );
      assert.equal(reconnectedCall.state, 'called');
      const recovered = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      assert.equal(recovered.freshness, 'fresh');
      assert.ok(
        recovered.entries.some(
          (entry) => entry.id === offlineTarget.id && entry.state === 'called',
        ),
      );
      assert.deepEqual(
        (
          await sql<
            { status: string }[]
          >`SELECT DISTINCT status FROM clinical.appointments WHERE facility_id=${ids.facility}`
        )
          .map((row) => row.status)
          .filter((status) =>
            ['requested', 'in_queue', 'in_consultation', 'completed', 'no_show'].includes(status),
          ),
        [],
      );
      const queueStates = await sql<
        { state: string }[]
      >`SELECT DISTINCT state FROM clinical.queue_entries WHERE facility_id=${ids.facility}`;
      assert.ok(
        queueStates.every((row) =>
          ['waiting', 'called', 'in_service', 'completed', 'removed'].includes(row.state),
        ),
      );
      assert.equal(
        queueStates.some((row) => row.state === 'in_service'),
        false,
        'Feature 009 has no in-service producer',
      );
    } finally {
      await harness?.app.close();
      await identity.close();
      await clean(sql);
      await sql.end({ timeout: 5 });
    }
  },
);
