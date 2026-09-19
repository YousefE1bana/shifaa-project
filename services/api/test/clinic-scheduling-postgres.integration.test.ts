import postgres, { type Sql, type TransactionSql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { PostgresClinicSchedulingService } from '../src/adapters/postgres/clinic-scheduling-service.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import { ClinicSchedulingService } from '../src/modules/clinic-scheduling/service.js';

type QueryClient = Sql | TransactionSql;

const database = process.env['SHIFAA_F009_DATABASE'];
const options = {
  host: process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1',
  port: Number(process.env['SHIFAA_PG_PORT'] ?? 5432),
  username: 'shifaa_owner',
  password: 'synthetic_owner_only',
  max: 1,
};
const ids = {
  owner: 'f0090000-0000-4000-8c00-000000000001',
  doctor: 'f0090000-0000-4000-8c00-000000000002',
  patientA: 'f0090000-0000-4000-8c00-000000000003',
  patientB: 'f0090000-0000-4000-8c00-000000000004',
  facility: 'f0090000-0000-4000-8d00-000000000001',
  schedule: 'f0090000-0000-4000-8e00-000000000001',
};

function client() {
  if (!database) throw new Error('SHIFAA_F009_DATABASE is required for PostgreSQL race tests');
  return postgres({ ...options, database });
}
const apiDatabaseUrl = database
  ? `postgresql://shifaa_api:synthetic_api_only@${process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1'}:${process.env['SHIFAA_PG_PORT'] ?? 5432}/${database}`
  : undefined;
let apiHarness: Awaited<ReturnType<typeof buildApp>> | undefined;
let apiIdentity: PostgresIdentityRepository | undefined;
let testFailureOperation: string | undefined;

async function apiRequest(
  person: string,
  request: {
    method: 'POST' | 'PATCH';
    url: string;
    payload?: unknown;
    key: string;
    version?: number;
  },
) {
  if (!apiHarness) throw new Error('The Feature 009 HTTP harness is not initialized.');
  const response = await apiHarness.app.inject({
    method: request.method,
    url: request.url,
    headers: {
      authorization: `Bearer synthetic-person:${person}`,
      'idempotency-key': request.key,
      ...(request.version === undefined ? {} : { 'if-match': `"${request.version}"` }),
    },
    ...(request.payload === undefined ? {} : { payload: request.payload }),
  });
  if (response.statusCode >= 400) {
    throw new Error(
      `HTTP ${response.statusCode} ${request.method} ${request.url}: ${response.body}`,
    );
  }
  return response.json() as Record<string, unknown>;
}

async function apiBook(patient: string, startsAt: string, endsAt: string, suffix: string) {
  const response = await apiRequest(patient, {
    method: 'POST',
    url: '/v1/appointments',
    key: `f009-http-book-${suffix}`,
    payload: {
      patientId: patient,
      facilityId: ids.facility,
      doctorId: ids.doctor,
      startsAt,
      endsAt,
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      paymentMethod: 'cash_on_arrival',
    },
  });
  return String(response['id']);
}

async function apiCheckIn(patient: string, appointmentId: string, version: number, suffix: string) {
  return apiRequest(patient, {
    method: 'POST',
    url: `/v1/appointments/${appointmentId}/check-in`,
    key: `f009-http-checkin-${suffix}`,
    version,
  });
}

async function apiReschedule(
  patient: string,
  appointmentId: string,
  version: number,
  startsAt: string,
  endsAt: string,
  suffix: string,
) {
  return apiRequest(patient, {
    method: 'POST',
    url: `/v1/appointments/${appointmentId}/reschedule`,
    key: `f009-http-reschedule-${suffix}`,
    version,
    payload: { startsAt, endsAt, timezone: 'Africa/Cairo', civilDate: '2030-01-07' },
  });
}

async function apiReorder(
  queueEntryId: string,
  version: number,
  targetPosition: number,
  suffix: string,
) {
  return apiRequest(ids.owner, {
    method: 'POST',
    url: `/v1/queue-entries/${queueEntryId}/reorder`,
    key: `f009-http-reorder-${suffix}`,
    version,
    payload: { targetPosition, queueVersion: version, reason: 'concurrent reorder' },
  });
}

async function apiAbsence(
  suffix: string,
  startsAt = '2030-01-07T11:00:00Z',
  endsAt = '2030-01-07T11:30:00Z',
  reason = 'race absence',
) {
  return apiRequest(ids.owner, {
    method: 'POST',
    url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/absence`,
    key: `f009-http-absence-${suffix}`,
    payload: {
      startsAt,
      endsAt,
      civilDate: '2030-01-07',
      reason,
    },
  });
}

async function apiDelay(minutes: number, suffix: string) {
  return apiRequest(ids.owner, {
    method: 'POST',
    url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/delay`,
    key: `f009-http-delay-${suffix}`,
    payload: {
      civilDate: '2030-01-07',
      delayMinutes: minutes,
      templateCode: 'F009_DELAY_RACE',
      reason: `delay ${minutes}`,
    },
  });
}

async function withFailure<T>(operation: string, action: () => Promise<T>): Promise<T> {
  testFailureOperation = operation;
  try {
    return await action();
  } finally {
    testFailureOperation = undefined;
  }
}
async function expectRejected(action: () => Promise<unknown>) {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}
function rowAt<T>(rows: readonly T[], index = 0): T {
  const row = rows[index];
  if (!row) throw new Error(`Expected PostgreSQL row at index ${index}.`);
  return row;
}
async function context(
  sql: QueryClient,
  person: string,
  action = 'appointment.manage',
  purposes = 'appointment.scheduling',
  aal = 1,
) {
  await sql.unsafe(
    `SELECT set_config('shifaa.person_id','${person}',false),set_config('shifaa.environment','local',false),set_config('shifaa.test_now','2026-09-12T08:00:00Z',false),set_config('shifaa.action','${action}',false),set_config('shifaa.aal','${aal}',false),set_config('shifaa.purposes','${purposes}',false)`,
  );
}

async function setup(sql: Sql) {
  await sql.begin(async (tx) => {
    await tx.unsafe(
      "SELECT set_config('shifaa.person_id','f0090000-0000-4000-8c00-000000000001',true),set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2026-09-12T08:00:00Z',true)",
    );
    await tx.unsafe(`
      INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
       ('${ids.owner}','f0090000-0000-4000-9c00-000000000001','F009 race owner','active'),('${ids.doctor}','f0090000-0000-4000-9c00-000000000002','F009 race doctor','active'),('${ids.patientA}','f0090000-0000-4000-9c00-000000000003','F009 race patient A','active'),('${ids.patientB}','f0090000-0000-4000-9c00-000000000004','F009 race patient B','active');
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES ('f0090000-0000-4000-8f00-000000000001','${ids.patientA}','F009-RACE-A','active'),('f0090000-0000-4000-8f00-000000000002','${ids.patientB}','F009-RACE-B','active');
      INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) VALUES ('${ids.facility}','clinic','عيادة سباق','F009 race clinic','active','C','Cairo','Race','Synthetic race address','${ids.owner}');
      INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status) VALUES ('f0090000-0000-4000-8a00-000000000010','${ids.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F009 race regulator','2099-12-31','verified');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,valid_from,membership_status,created_by_person_id) VALUES ('${ids.facility}','${ids.owner}','owner','2020-01-01','active','${ids.owner}');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES ('${ids.facility}','${ids.doctor}','doctor','f0090000-0000-4000-8a00-000000000010','2020-01-01','active','${ids.owner}');
      INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id) VALUES ('${ids.schedule}','${ids.facility}','${ids.doctor}','Africa/Cairo','2030-01-01','2030-01-31',30,10000,'EGP','active','${ids.owner}','${ids.owner}');
      INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES ('${ids.schedule}',2,'09:00','15:00');
    `);
  });
}

async function snapshot(sql: Sql) {
  const rows =
    await sql`SELECT (SELECT count(*) FROM clinical.schedules)::int AS schedules,(SELECT count(*) FROM clinical.appointments)::int AS appointments,(SELECT count(*) FROM clinical.queue_entries)::int AS queue_entries,(SELECT count(*) FROM clinical.schedule_exceptions)::int AS exceptions,(SELECT count(*) FROM audit.events)::int AS audit,(SELECT count(*) FROM platform.outbox_events)::int AS outbox,(SELECT count(*) FROM platform.idempotency_records)::int AS idempotency`;
  return rowAt(rows);
}

describe.skipIf(!database)('Feature 009 PostgreSQL races and fault boundaries', () => {
  beforeAll(async () => {
    if (!apiDatabaseUrl) throw new Error('SHIFAA_F009_DATABASE is required for the HTTP harness');
    const identity = new PostgresIdentityRepository(apiDatabaseUrl);
    apiIdentity = identity;
    await identity.ready();
    const base = loadConfig({ NODE_ENV: 'test' });
    const adapter = new PostgresClinicSchedulingService(
      {
        withRawTransaction: <T>(work: (tx: TransactionSql) => Promise<T>) =>
          identity.withRawTransaction(async (tx) => {
            if (testFailureOperation !== undefined) {
              await tx`select set_config('shifaa.test_fail_operation',${testFailureOperation},true)`;
            }
            return work(tx);
          }),
      },
      'local',
    );
    apiHarness = await buildApp({
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
        clock: { now: () => new Date('2030-01-01T00:00:00.000Z') },
        cache: { get: async () => undefined, set: async () => undefined },
        repository: adapter,
      }),
    });
  });

  afterAll(async () => {
    await apiHarness?.app.close();
    await apiIdentity?.close();
  });

  beforeEach(async () => {
    const sql = client();
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL client_min_messages='warning'");
        await tx.unsafe("SET LOCAL session_replication_role='replica'");
        await tx.unsafe(
          'TRUNCATE clinical.queue_entries,clinical.queue_scopes,clinical.appointments,clinical.schedule_exceptions,clinical.schedule_windows,clinical.schedules CASCADE',
        );
        await tx.unsafe(
          'TRUNCATE audit.events,platform.outbox_events,platform.idempotency_records CASCADE',
        );
        await tx.unsafe(
          `DELETE FROM identity.facility_memberships WHERE facility_id='${ids.facility}'`,
        );
        await tx.unsafe(
          `DELETE FROM identity.professional_licenses WHERE person_id='${ids.doctor}'`,
        );
        await tx.unsafe(
          `DELETE FROM identity.patients WHERE id IN ('f0090000-0000-4000-8f00-000000000001','f0090000-0000-4000-8f00-000000000002')`,
        );
        await tx.unsafe(`DELETE FROM identity.facilities WHERE id='${ids.facility}'`);
        await tx.unsafe(
          `DELETE FROM identity.people WHERE id IN ('${ids.owner}','${ids.doctor}','${ids.patientA}','${ids.patientB}')`,
        );
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('uses create_appointment_v1 for one-winner booking and reschedule race with loser original slot/version', async () => {
    const first = client();
    try {
      await setup(first);
      const booking = await Promise.allSettled([
        apiBook(ids.patientA, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z', 'race-a'),
        apiBook(ids.patientB, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z', 'race-b'),
      ]);
      expect(booking.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const a = await apiBook(
        ids.patientA,
        '2030-01-07T08:00:00Z',
        '2030-01-07T08:30:00Z',
        'move-a',
      );
      const b = await apiBook(
        ids.patientB,
        '2030-01-07T09:00:00Z',
        '2030-01-07T09:30:00Z',
        'move-b',
      );
      const move = (id: string, patient: string, suffix: string) =>
        apiReschedule(patient, id, 1, '2030-01-07T10:00:00Z', '2030-01-07T10:30:00Z', suffix);
      const reschedules = await Promise.allSettled([
        move(a, ids.patientA, 'move-a-race'),
        move(b, ids.patientB, 'move-b-race'),
      ]);
      expect(reschedules.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const loserId = reschedules[0].status === 'rejected' ? a : b;
      const loser =
        await first`SELECT starts_at,ends_at,version FROM clinical.appointments WHERE id=${loserId}`;
      const expectedLoserStart =
        loserId === a ? '2030-01-07T08:00:00.000Z' : '2030-01-07T09:00:00.000Z';
      const loserRow = rowAt(loser);
      expect(new Date(loserRow['starts_at']).toISOString()).toBe(expectedLoserStart);
      expect(Number(loserRow['version'])).toBe(1);
    } finally {
      await first.end({ timeout: 5 });
    }
  });

  it('serializes same-appointment check-in retry to one queue number and one pair of effects', async () => {
    const first = client();
    try {
      await setup(first);
      const appointmentId = await apiBook(
        ids.patientA,
        '2030-01-07T11:00:00Z',
        '2030-01-07T11:30:00Z',
        'checkin-book',
      );
      const outcomes = await Promise.allSettled([
        apiCheckIn(ids.patientA, appointmentId, 1, 'checkin-a'),
        apiCheckIn(ids.patientA, appointmentId, 1, 'checkin-b'),
      ]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const counts =
        await first`SELECT count(*)::int AS entries, count(DISTINCT queue_number)::int AS numbers FROM clinical.queue_entries WHERE appointment_id=${appointmentId}`;
      expect(rowAt(counts)).toMatchObject({ entries: 1, numbers: 1 });
      const effects =
        await first`SELECT count(*)::int AS count FROM audit.events WHERE resource_id=${appointmentId} AND action_code='appointment.checked_in'`;
      expect(rowAt(effects)['count']).toBe(1);
    } finally {
      await first.end({ timeout: 5 });
    }
  });

  it('serializes concurrent queue reorders to one approved outcome with contiguous order and unchanged appointments', async () => {
    const first = client();
    try {
      await setup(first);
      const appointments = await Promise.all([
        apiBook(ids.patientA, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z', 'queue-book-a'),
        apiBook(ids.patientA, '2030-01-07T08:00:00Z', '2030-01-07T08:30:00Z', 'queue-book-b'),
        apiBook(ids.patientA, '2030-01-07T09:00:00Z', '2030-01-07T09:30:00Z', 'queue-book-c'),
      ]);
      for (const [index, appointmentId] of appointments.entries())
        await apiCheckIn(ids.patientA, appointmentId, 1, `queue-checkin-${index}`);
      const entries =
        await first`SELECT id,version FROM clinical.queue_entries ORDER BY waiting_order`;
      const queueEntryId = String(rowAt(entries, 1)['id']);
      const queueEntryVersion = Number(rowAt(entries, 1)['version']);
      const outcomes = await Promise.allSettled([
        apiReorder(queueEntryId, queueEntryVersion, 1, 'queue-race-a'),
        apiReorder(queueEntryId, queueEntryVersion, 1, 'queue-race-b'),
      ]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const order =
        await first`SELECT array_agg(waiting_order ORDER BY waiting_order)::int[] AS values FROM clinical.queue_entries WHERE state='waiting'`;
      expect(rowAt(order)['values']).toEqual([1, 2, 3]);
      const states =
        await first`SELECT array_agg(status ORDER BY starts_at) AS values FROM clinical.appointments`;
      expect(rowAt(states)['values']).toEqual(['checked_in', 'checked_in', 'checked_in']);
    } finally {
      await first.end({ timeout: 5 });
    }
  });

  it('uses the schedule-exception operation for one-winner positive-overlap races and admits touching boundaries', async () => {
    const owner = client();
    try {
      await setup(owner);
      const before = await snapshot(owner);
      const scheduleRows =
        await owner`SELECT version FROM clinical.schedules WHERE id=${ids.schedule}`;
      const initialScheduleVersion = Number(rowAt(scheduleRows)['version']);
      const expectedVersion = initialScheduleVersion;
      const exception = (
        startsAt: string,
        endsAt: string,
        expectedVersion = 1,
        idempotencyKey = 'exception-race-a',
      ) =>
        apiRequest(ids.owner, {
          method: 'POST',
          url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}/exceptions`,
          key: idempotencyKey,
          version: expectedVersion,
          payload: {
            type: 'blocked',
            startsAt,
            endsAt,
            civilDate: '2030-01-07',
            reason: 'positive overlap race',
          },
        });
      const outcomes = await Promise.allSettled([
        exception(
          '2030-01-07T07:00:00Z',
          '2030-01-07T07:30:00Z',
          expectedVersion,
          'exception-race-a',
        ),
        exception(
          '2030-01-07T07:00:00Z',
          '2030-01-07T07:30:00Z',
          expectedVersion,
          'exception-race-b',
        ),
      ]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const afterRace = await snapshot(owner);
      expect(Number(afterRace['exceptions'])).toBe(Number(before['exceptions']) + 1);
      expect(Number(afterRace['audit'])).toBe(Number(before['audit']) + 1);
      expect(Number(afterRace['outbox'])).toBe(Number(before['outbox']) + 1);
      await exception(
        '2030-01-07T07:30:00Z',
        '2030-01-07T08:00:00Z',
        expectedVersion + 1,
        'exception-boundary',
      );
      const final =
        await owner`SELECT count(*)::int AS count FROM clinical.schedule_exceptions WHERE schedule_id=${ids.schedule} AND superseded_at IS NULL`;
      expect(rowAt(final)['count']).toBe(2);
    } finally {
      await owner.end({ timeout: 5 });
    }
  });

  it('keeps absence racing check-in atomic with one absence notice and no duplicate queue effects', async () => {
    const first = client();
    try {
      await setup(first);
      const appointmentId = await apiBook(
        ids.patientA,
        '2030-01-07T11:00:00Z',
        '2030-01-07T11:30:00Z',
        'absence-book',
      );
      const absence = apiAbsence('race');
      const checkIn = apiCheckIn(ids.patientA, appointmentId, 1, 'absence-checkin');
      const outcomes = await Promise.allSettled([absence, checkIn]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).not.toHaveLength(0);
      const appointment =
        await first`SELECT status,version FROM clinical.appointments WHERE id=${appointmentId}`;
      expect(rowAt(appointment)['status']).toBe('reschedule_required');
      const queue =
        await first`SELECT count(*)::int AS count FROM clinical.queue_entries WHERE appointment_id=${appointmentId} AND state IN ('waiting','called')`;
      expect(rowAt(queue)['count']).toBe(0);
      const absenceNotices =
        await first`SELECT count(*)::int AS count FROM platform.outbox_events WHERE event_type='clinical.doctor_absence.declared.v1'`;
      expect(rowAt(absenceNotices)['count']).toBe(1);
      const queueEffects =
        await first`SELECT count(*)::int AS count FROM platform.outbox_events WHERE event_type='clinical.queue.changed.v1' AND aggregate_id IN (SELECT id FROM clinical.queue_entries WHERE appointment_id=${appointmentId})`;
      expect(rowAt(queueEffects)['count']).toBeLessThanOrEqual(2);
    } finally {
      await first.end({ timeout: 5 });
    }
  });

  it('makes delay concurrency deterministic, idempotent, and notice-deduplicated', async () => {
    const first = client();
    try {
      await setup(first);
      const delay = (key: string, minutes: number) => apiDelay(minutes, key);
      const replay = await Promise.allSettled([delay('same-a', 10), delay('same-a', 10)]);
      expect(replay.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
      expect(replay.filter((result) => result.status === 'rejected')).toHaveLength(0);
      await delay('new', 20);
      const active =
        await first`SELECT count(*)::int AS count,max(delay_minutes)::int AS minutes FROM clinical.schedule_exceptions WHERE schedule_id=${ids.schedule} AND exception_type='delay' AND superseded_at IS NULL`;
      expect(rowAt(active)).toMatchObject({ count: 1, minutes: 20 });
      const notices =
        await first`SELECT count(*)::int AS count FROM platform.outbox_events WHERE event_type='clinical.doctor_delay.declared.v1'`;
      expect(rowAt(notices)['count']).toBe(2);
    } finally {
      await first.end({ timeout: 5 });
    }
  });

  it('rolls back operation-specific domain, audit, outbox, and idempotency effects and replays completed records safely', async () => {
    const sql = client();
    try {
      await setup(sql);
      const before =
        await sql`SELECT (SELECT count(*) FROM clinical.appointments)::int AS appointments,(SELECT count(*) FROM clinical.schedule_exceptions)::int AS exceptions,(SELECT count(*) FROM audit.events)::int AS audit,(SELECT count(*) FROM platform.outbox_events)::int AS outbox,(SELECT count(*) FROM platform.idempotency_records)::int AS idempotency`;
      expect(
        await expectRejected(() =>
          withFailure('create_appointment', () =>
            apiBook(
              ids.patientA,
              '2030-01-07T14:00:00Z',
              '2030-01-07T14:30:00Z',
              'rollback-create',
            ),
          ),
        ),
      ).toBe(true);
      const after =
        await sql`SELECT (SELECT count(*) FROM clinical.appointments)::int AS appointments,(SELECT count(*) FROM clinical.schedule_exceptions)::int AS exceptions,(SELECT count(*) FROM audit.events)::int AS audit,(SELECT count(*) FROM platform.outbox_events)::int AS outbox,(SELECT count(*) FROM platform.idempotency_records)::int AS idempotency`;
      expect(rowAt(after)).toEqual(rowAt(before));
      const appointmentId = await apiBook(
        ids.patientA,
        '2030-01-07T14:00:00Z',
        '2030-01-07T14:30:00Z',
        'rollback-reschedule-book',
      );
      const beforeReschedule = await snapshot(sql);
      expect(
        await expectRejected(() =>
          withFailure('reschedule_appointment', () =>
            apiReschedule(
              ids.patientA,
              appointmentId,
              1,
              '2030-01-07T15:00:00Z',
              '2030-01-07T15:30:00Z',
              'rollback-reschedule',
            ),
          ),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeReschedule);
      const checkinId = await apiBook(
        ids.patientA,
        '2030-01-07T16:00:00Z',
        '2030-01-07T16:30:00Z',
        'rollback-checkin-book',
      );
      const beforeCheckin = await snapshot(sql);
      expect(
        await expectRejected(() =>
          withFailure('check_in_appointment', () =>
            apiCheckIn(ids.patientA, checkinId, 1, 'rollback-checkin'),
          ),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeCheckin);
      const beforeDelay = await snapshot(sql);
      expect(
        await expectRejected(() =>
          withFailure('send_doctor_delay', () => apiDelay(10, 'rollback-delay')),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeDelay);
      const beforeAbsence = await snapshot(sql);
      expect(
        await expectRejected(() =>
          withFailure('declare_doctor_absence', () =>
            apiAbsence(
              'rollback-absence',
              '2030-01-07T14:00:00Z',
              '2030-01-07T14:30:00Z',
              'injected absence',
            ),
          ),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeAbsence);
      await sql.begin(async (tx) => {
        await context(tx, ids.owner, 'schedule.manage', 'appointment.scheduling', 2);
        const record =
          await tx`SELECT record_id FROM clinical.claim_idempotency_v1('POST','/v1/clinics/{facilityId}/schedules','completed-boundary',repeat('b',64))`;
        await tx`UPDATE platform.idempotency_records SET state='completed',response_status=201,response_body='{"resource_id":"00000000-0000-4000-8000-000000000001"}'::jsonb WHERE id=${rowAt(record)['record_id']}`;
      });
      const replay = await sql.begin(async (tx) => {
        await context(tx, ids.owner, 'schedule.manage', 'appointment.scheduling', 2);
        return tx`SELECT * FROM clinical.claim_idempotency_v1('POST','/v1/clinics/{facilityId}/schedules','completed-boundary',repeat('b',64))`;
      });
      expect(rowAt(replay)['is_new']).toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
