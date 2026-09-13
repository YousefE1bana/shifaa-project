import postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';

const database = process.env.SHIFAA_F009_DATABASE;
const options = {
  host: process.env.SHIFAA_PG_HOST ?? '127.0.0.1',
  port: Number(process.env.SHIFAA_PG_PORT ?? 5432),
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
async function expectRejected(action: () => Promise<unknown>) {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}
async function context(
  sql: ReturnType<typeof postgres>,
  person: string,
  action = 'appointment.manage',
  purposes = 'appointment.scheduling',
  aal = 1,
) {
  await sql.unsafe(
    `SELECT set_config('shifaa.person_id','${person}',false),set_config('shifaa.environment','local',false),set_config('shifaa.test_now','2026-09-12T08:00:00Z',false),set_config('shifaa.action','${action}',false),set_config('shifaa.aal','${aal}',false),set_config('shifaa.purposes','${purposes}',false)`,
  );
}

async function setup(sql: ReturnType<typeof postgres>) {
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
      INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,status,created_by_person_id,updated_by_person_id) VALUES ('${ids.schedule}','${ids.facility}','${ids.doctor}','Africa/Cairo','2030-01-01','2030-01-31',30,'active','${ids.owner}','${ids.owner}');
      INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES ('${ids.schedule}',2,'09:00','15:00');
    `);
  });
}

async function book(
  sql: ReturnType<typeof postgres>,
  patient: string,
  starts: string,
  ends: string,
) {
  const localStart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(starts));
  const payload = {
    patient_person_id: patient,
    facility_id: ids.facility,
    doctor_person_id: ids.doctor,
    schedule_id: ids.schedule,
    starts_at: starts,
    ends_at: ends,
    timezone_name: 'Africa/Cairo',
    civil_date: '2030-01-07',
    local_start: localStart,
    fee_minor_units: 10000,
    currency_code: 'EGP',
  };
  const rows = await sql.begin(async (tx) => {
    await context(tx, patient);
    return tx`SELECT clinical.create_appointment_v1(${tx.json(payload)}::jsonb) AS id`;
  });
  return String(rows[0].id);
}
async function snapshot(sql: ReturnType<typeof postgres>) {
  const rows =
    await sql`SELECT (SELECT count(*) FROM clinical.schedules)::int AS schedules,(SELECT count(*) FROM clinical.appointments)::int AS appointments,(SELECT count(*) FROM clinical.queue_entries)::int AS queue_entries,(SELECT count(*) FROM clinical.schedule_exceptions)::int AS exceptions,(SELECT count(*) FROM audit.events)::int AS audit,(SELECT count(*) FROM platform.outbox_events)::int AS outbox,(SELECT count(*) FROM platform.idempotency_records)::int AS idempotency`;
  return rows[0];
}

describe.skipIf(!database)('Feature 009 PostgreSQL races and fault boundaries', () => {
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
    const second = client();
    try {
      await setup(first);
      const booking = await Promise.allSettled([
        book(first, ids.patientA, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z'),
        book(second, ids.patientB, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z'),
      ]);
      expect(booking.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const a = await book(first, ids.patientA, '2030-01-07T08:00:00Z', '2030-01-07T08:30:00Z');
      const b = await book(second, ids.patientB, '2030-01-07T09:00:00Z', '2030-01-07T09:30:00Z');
      const move = (sql: ReturnType<typeof postgres>, id: string, patient: string) =>
        sql.begin(async (tx) => {
          await context(tx, patient);
          return tx`SELECT clinical.reschedule_appointment_v1(${id},1,'2030-01-07T10:00:00Z','2030-01-07T10:30:00Z','2030-01-07','12:00')`;
        });
      const reschedules = await Promise.allSettled([
        move(first, a, ids.patientA),
        move(second, b, ids.patientB),
      ]);
      expect(reschedules.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const loserId = reschedules[0].status === 'rejected' ? a : b;
      const loser =
        await first`SELECT starts_at,ends_at,version FROM clinical.appointments WHERE id=${loserId}`;
      const expectedLoserStart =
        loserId === a ? '2030-01-07T08:00:00.000Z' : '2030-01-07T09:00:00.000Z';
      expect(new Date(loser[0].starts_at).toISOString()).toBe(expectedLoserStart);
      expect(Number(loser[0].version)).toBe(1);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it('serializes same-appointment check-in retry to one queue number and one pair of effects', async () => {
    const first = client();
    const second = client();
    try {
      await setup(first);
      const appointmentId = await book(
        first,
        ids.patientA,
        '2030-01-07T11:00:00Z',
        '2030-01-07T11:30:00Z',
      );
      const checkIn = (sql: ReturnType<typeof postgres>) =>
        sql.begin(async (tx) => {
          await context(tx, ids.patientA);
          return tx`SELECT clinical.check_in_appointment_v1(${appointmentId},1)`;
        });
      const outcomes = await Promise.allSettled([checkIn(first), checkIn(second)]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const counts =
        await first`SELECT count(*)::int AS entries, count(DISTINCT queue_number)::int AS numbers FROM clinical.queue_entries WHERE appointment_id=${appointmentId}`;
      expect(counts[0]).toMatchObject({ entries: 1, numbers: 1 });
      const effects =
        await first`SELECT count(*)::int AS count FROM audit.events WHERE resource_id=${appointmentId} AND action_code='appointment.checked_in'`;
      expect(effects[0].count).toBe(1);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it('serializes concurrent queue reorders to one approved outcome with contiguous order and unchanged appointments', async () => {
    const first = client();
    const second = client();
    try {
      await setup(first);
      const appointments = await Promise.all([
        book(first, ids.patientA, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z'),
        book(first, ids.patientA, '2030-01-07T08:00:00Z', '2030-01-07T08:30:00Z'),
        book(first, ids.patientA, '2030-01-07T09:00:00Z', '2030-01-07T09:30:00Z'),
      ]);
      for (const appointmentId of appointments) {
        await first.begin(async (tx) => {
          await context(tx, ids.patientA);
          await tx`SELECT clinical.check_in_appointment_v1(${appointmentId},1)`;
        });
      }
      const entries = await first`SELECT id FROM clinical.queue_entries ORDER BY waiting_order`;
      const reorder = (sql: ReturnType<typeof postgres>) =>
        sql.begin(async (tx) => {
          await context(tx, ids.owner, 'queue.manage', 'queue.operation', 1);
          return tx`SELECT clinical.reorder_queue_entry_v1(${entries[1].id},1,1,'concurrent reorder')`;
        });
      const outcomes = await Promise.allSettled([reorder(first), reorder(second)]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const order =
        await first`SELECT array_agg(waiting_order ORDER BY waiting_order)::int[] AS values FROM clinical.queue_entries WHERE state='waiting'`;
      expect(order[0].values).toEqual([1, 2, 3]);
      const states =
        await first`SELECT array_agg(status ORDER BY starts_at) AS values FROM clinical.appointments`;
      expect(states[0].values).toEqual(['checked_in', 'checked_in', 'checked_in']);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it('uses the schedule-exception operation for one-winner positive-overlap races and admits touching boundaries', async () => {
    const first = client();
    const second = client();
    try {
      await setup(first);
      const before = await snapshot(first);
      const exception = (sql: ReturnType<typeof postgres>, startsAt: string, endsAt: string) =>
        sql.begin(async (tx) => {
          await context(tx, ids.owner, 'schedule.manage', 'appointment.scheduling', 1);
          const payload = {
            schedule_id: ids.schedule,
            civil_date: '2030-01-07',
            starts_at: startsAt,
            ends_at: endsAt,
            exception_type: 'blocked',
            reason: 'positive overlap race',
          };
          return tx`SELECT clinical.create_schedule_exception_v1(${tx.json(payload)}::jsonb)`;
        });
      const outcomes = await Promise.allSettled([
        exception(first, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z'),
        exception(second, '2030-01-07T07:00:00Z', '2030-01-07T07:30:00Z'),
      ]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const afterRace = await snapshot(first);
      expect(Number(afterRace.exceptions)).toBe(Number(before.exceptions) + 1);
      expect(Number(afterRace.audit)).toBe(Number(before.audit) + 1);
      expect(Number(afterRace.outbox)).toBe(Number(before.outbox) + 1);
      await exception(first, '2030-01-07T07:30:00Z', '2030-01-07T08:00:00Z');
      const final =
        await first`SELECT count(*)::int AS count FROM clinical.schedule_exceptions WHERE schedule_id=${ids.schedule} AND superseded_at IS NULL`;
      expect(final[0].count).toBe(2);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it('keeps absence racing check-in atomic with one absence notice and no duplicate queue effects', async () => {
    const first = client();
    const second = client();
    try {
      await setup(first);
      const appointmentId = await book(
        first,
        ids.patientA,
        '2030-01-07T11:00:00Z',
        '2030-01-07T11:30:00Z',
      );
      const absence = first.begin(async (tx) => {
        await context(tx, ids.owner, 'absence.manage', 'appointment.scheduling', 1);
        return tx`SELECT clinical.declare_doctor_absence_v1(${ids.schedule},'2030-01-07','2030-01-07T11:00:00Z','2030-01-07T11:30:00Z','race absence')`;
      });
      const checkIn = second.begin(async (tx) => {
        await context(tx, ids.patientA);
        return tx`SELECT clinical.check_in_appointment_v1(${appointmentId},1)`;
      });
      const outcomes = await Promise.allSettled([absence, checkIn]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).not.toHaveLength(0);
      const appointment =
        await first`SELECT status,version FROM clinical.appointments WHERE id=${appointmentId}`;
      expect(appointment[0].status).toBe('reschedule_required');
      const queue =
        await first`SELECT count(*)::int AS count FROM clinical.queue_entries WHERE appointment_id=${appointmentId} AND state IN ('waiting','called')`;
      expect(queue[0].count).toBe(0);
      const absenceNotices =
        await first`SELECT count(*)::int AS count FROM platform.outbox_events WHERE event_type='clinical.doctor_absence.declared.v1'`;
      expect(absenceNotices[0].count).toBe(1);
      const queueEffects =
        await first`SELECT count(*)::int AS count FROM platform.outbox_events WHERE event_type='clinical.queue.changed.v1' AND aggregate_id IN (SELECT id FROM clinical.queue_entries WHERE appointment_id=${appointmentId})`;
      expect(queueEffects[0].count).toBeLessThanOrEqual(1);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it('makes delay concurrency deterministic, idempotent, and notice-deduplicated', async () => {
    const first = client();
    const second = client();
    try {
      await setup(first);
      const delay = (sql: ReturnType<typeof postgres>, key: string, minutes: number) =>
        sql.begin(async (tx) => {
          await context(tx, ids.owner, 'delay.manage', 'scoped.notification', 1);
          await tx.unsafe(
            `SELECT set_config('shifaa.idempotency_key','${key}',true),set_config('shifaa.request_hash','${String(minutes).padStart(2, '0')}${'a'.repeat(62)}',true)`,
          );
          return tx`SELECT clinical.send_doctor_delay_v1(${ids.schedule},'2030-01-07','2030-01-07T13:00:00Z','2030-01-07T13:30:00Z',${minutes},${`delay ${minutes}`})`;
        });
      const replay = await Promise.allSettled([
        delay(first, 'delay-same-key', 10),
        delay(second, 'delay-same-key', 10),
      ]);
      expect(replay.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
      expect(replay.filter((result) => result.status === 'rejected')).toHaveLength(0);
      await delay(first, 'delay-new-key', 20);
      const active =
        await first`SELECT count(*)::int AS count,max(delay_minutes)::int AS minutes FROM clinical.schedule_exceptions WHERE schedule_id=${ids.schedule} AND exception_type='delay' AND superseded_at IS NULL`;
      expect(active[0]).toMatchObject({ count: 1, minutes: 20 });
      const notices =
        await first`SELECT count(*)::int AS count FROM platform.outbox_events WHERE event_type='clinical.doctor_delay.declared.v1'`;
      expect(notices[0].count).toBe(2);
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
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
          sql.begin(async (tx) => {
            await context(tx, ids.patientA);
            await tx.unsafe(
              "SELECT set_config('shifaa.test_fail_operation','create_appointment',true)",
            );
            await tx`SELECT clinical.create_appointment_v1(${tx.json({ patient_person_id: ids.patientA, facility_id: ids.facility, doctor_person_id: ids.doctor, schedule_id: ids.schedule, starts_at: '2030-01-07T14:00:00Z', ends_at: '2030-01-07T14:30:00Z', timezone_name: 'Africa/Cairo', civil_date: '2030-01-07', local_start: '16:00', fee_minor_units: 10000, currency_code: 'EGP' })}::jsonb)`;
          }),
        ),
      ).toBe(true);
      const after =
        await sql`SELECT (SELECT count(*) FROM clinical.appointments)::int AS appointments,(SELECT count(*) FROM clinical.schedule_exceptions)::int AS exceptions,(SELECT count(*) FROM audit.events)::int AS audit,(SELECT count(*) FROM platform.outbox_events)::int AS outbox,(SELECT count(*) FROM platform.idempotency_records)::int AS idempotency`;
      expect(after[0]).toEqual(before[0]);
      const appointmentId = await book(
        sql,
        ids.patientA,
        '2030-01-07T14:00:00Z',
        '2030-01-07T14:30:00Z',
      );
      const beforeReschedule = await snapshot(sql);
      expect(
        await expectRejected(() =>
          sql.begin(async (tx) => {
            await context(tx, ids.patientA);
            await tx.unsafe(
              "SELECT set_config('shifaa.test_fail_operation','reschedule_appointment',true)",
            );
            await tx`SELECT clinical.reschedule_appointment_v1(${appointmentId},1,'2030-01-07T15:00:00Z','2030-01-07T15:30:00Z','2030-01-07','17:00')`;
          }),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeReschedule);
      const checkinId = await book(
        sql,
        ids.patientA,
        '2030-01-07T16:00:00Z',
        '2030-01-07T16:30:00Z',
      );
      const beforeCheckin = await snapshot(sql);
      expect(
        await expectRejected(() =>
          sql.begin(async (tx) => {
            await context(tx, ids.patientA);
            await tx.unsafe(
              "SELECT set_config('shifaa.test_fail_operation','check_in_appointment',true)",
            );
            await tx`SELECT clinical.check_in_appointment_v1(${checkinId},1)`;
          }),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeCheckin);
      const beforeDelay = await snapshot(sql);
      expect(
        await expectRejected(() =>
          sql.begin(async (tx) => {
            await context(tx, ids.owner, 'delay.manage', 'scoped.notification');
            await tx.unsafe(
              "SELECT set_config('shifaa.test_fail_operation','send_doctor_delay',true)",
            );
            await tx`SELECT clinical.send_doctor_delay_v1(${ids.schedule},'2030-01-07','2030-01-07T13:00:00Z','2030-01-07T13:30:00Z',10,'injected delay')`;
          }),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeDelay);
      const beforeAbsence = await snapshot(sql);
      expect(
        await expectRejected(() =>
          sql.begin(async (tx) => {
            await context(tx, ids.owner, 'absence.manage', 'appointment.scheduling');
            await tx.unsafe(
              "SELECT set_config('shifaa.test_fail_operation','declare_doctor_absence',true)",
            );
            await tx`SELECT clinical.declare_doctor_absence_v1(${ids.schedule},'2030-01-07','2030-01-07T14:00:00Z','2030-01-07T14:30:00Z','injected absence')`;
          }),
        ),
      ).toBe(true);
      expect(await snapshot(sql)).toEqual(beforeAbsence);
      await sql.begin(async (tx) => {
        await context(tx, ids.owner, 'schedule.manage', 'appointment.scheduling', 2);
        const record =
          await tx`SELECT record_id FROM clinical.claim_idempotency_v1('POST','/v1/clinic/schedules','completed-boundary',repeat('b',64))`;
        await tx`UPDATE platform.idempotency_records SET state='completed',response_status=201,response_body='{"resource_id":"00000000-0000-4000-8000-000000000001"}'::jsonb WHERE id=${record[0].record_id}`;
      });
      const replay = await sql.begin(async (tx) => {
        await context(tx, ids.owner, 'schedule.manage', 'appointment.scheduling', 2);
        return tx`SELECT * FROM clinical.claim_idempotency_v1('POST','/v1/clinic/schedules','completed-boundary',repeat('b',64))`;
      });
      expect(replay[0].is_new).toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
