import postgres, { type Sql, type TransactionSql } from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clinicSchedulingMetricLabels,
  clinicSchedulingTelemetry,
} from '@shifaa/observability/clinic-scheduling';

type Query = Sql | TransactionSql;
const database = process.env['SHIFAA_F009_DATABASE'];
const options = {
  host: process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1',
  port: Number(process.env['SHIFAA_PG_PORT'] ?? 5432),
  username: 'shifaa_owner',
  password: 'synthetic_owner_only',
  max: 1,
};
const ids = {
  owner: 'a0450000-0000-4000-8000-000000000001',
  doctor: 'a0450000-0000-4000-8000-000000000002',
  patient: 'a0450000-0000-4000-8000-000000000003',
  facility: 'a0450000-0000-4000-8100-000000000001',
  schedule: 'a0450000-0000-4000-8200-000000000001',
  license: 'a0450000-0000-4000-8a00-000000000001',
  patientRow: 'a0450000-0000-4000-8f00-000000000001',
} as const;

function client() {
  if (!database) throw new Error('SHIFAA_F009_DATABASE is required for atomic-effects tests');
  return postgres({ ...options, database });
}

async function context(sql: Query, person: string, key = '', hash = '', fail = '') {
  await sql`
    select set_config('shifaa.person_id',${person},true),
      set_config('shifaa.principal',${`synthetic:${person}`},true),
      set_config('shifaa.request_id','a0450000-0000-4000-8000-000000000099',true),
      set_config('shifaa.trace_id','a045000000000000000000000000000099',true),
      set_config('shifaa.environment','local',true),
      set_config('shifaa.test_now','2026-09-12T08:00:00Z',true),
      set_config('shifaa.action','appointment.manage',true),
      set_config('shifaa.aal','1',true),
      set_config('shifaa.purposes','appointment.scheduling',true),
      set_config('shifaa.idempotency_key',${key},true),
      set_config('shifaa.request_hash',${hash},true),
      set_config('shifaa.test_fail_operation',${fail},true)
  `;
}

async function setup(sql: Sql) {
  await sql.begin(async (tx) => {
    await tx.unsafe("set local session_replication_role='replica'");
    await tx.unsafe(
      'truncate clinical.queue_entries,clinical.queue_scopes,clinical.appointments,clinical.schedule_exceptions,clinical.schedule_windows,clinical.schedules cascade',
    );
    await tx.unsafe(
      'truncate audit.events,platform.outbox_events,platform.idempotency_records cascade',
    );
    await tx.unsafe(
      `delete from identity.facility_memberships where facility_id='${ids.facility}'`,
    );
    await tx.unsafe(`delete from identity.professional_licenses where id='${ids.license}'`);
    await tx.unsafe(`delete from identity.patients where id='${ids.patientRow}'`);
    await tx.unsafe(`delete from identity.facilities where id='${ids.facility}'`);
    await tx.unsafe(
      `delete from identity.people where id in ('${ids.owner}','${ids.doctor}','${ids.patient}')`,
    );
    await tx.unsafe(`
      insert into identity.people(id,user_id,display_name,profile_status) values
        ('${ids.owner}','a0450000-0000-4000-9000-000000000001','F009 atomic owner','active'),
        ('${ids.doctor}','a0450000-0000-4000-9000-000000000002','F009 atomic doctor','active'),
        ('${ids.patient}','a0450000-0000-4000-9000-000000000003','F009 atomic patient','active');
      insert into identity.patients(id,person_id,medical_record_number,record_status) values
        ('${ids.patientRow}','${ids.patient}','A045-ATOMIC','active');
      insert into identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) values
        ('${ids.facility}','clinic','عيادة ذرية','F009 atomic clinic','active','C','Cairo','Atomic','Synthetic address','${ids.owner}');
      insert into identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status) values
        ('${ids.license}','${ids.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F009 atomic regulator','2099-12-31','verified');
      insert into identity.facility_memberships(facility_id,person_id,role_code,valid_from,membership_status,created_by_person_id) values
        ('${ids.facility}','${ids.owner}','owner','2020-01-01','active','${ids.owner}'),
        ('${ids.facility}','${ids.doctor}','doctor','2020-01-01','active','${ids.owner}');
      insert into clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id) values
        ('${ids.schedule}','${ids.facility}','${ids.doctor}','Africa/Cairo','2030-01-01','2030-01-31',30,10000,'EGP','active','${ids.owner}','${ids.owner}');
      insert into clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) values ('${ids.schedule}',2,'09:00','15:00');
    `);
  });
}

async function snapshot(sql: Sql) {
  const [row] = await sql<
    { appointments: number; audit: number; outbox: number; idempotency: number }[]
  >`
    select (select count(*)::int from clinical.appointments) as appointments,
      (select count(*)::int from audit.events) as audit,
      (select count(*)::int from platform.outbox_events) as outbox,
      (select count(*)::int from platform.idempotency_records) as idempotency
  `;
  return row!;
}

function appointmentPayload() {
  return {
    patient_person_id: ids.patient,
    facility_id: ids.facility,
    doctor_person_id: ids.doctor,
    schedule_id: ids.schedule,
    starts_at: '2030-01-07T07:00:00Z',
    ends_at: '2030-01-07T07:30:00Z',
    timezone_name: 'Africa/Cairo',
    civil_date: '2030-01-07',
    local_start: '09:00',
    payment_method: 'cash_on_arrival',
  };
}

describe.skipIf(!database)('Feature 009 commit-boundary atomic effects', () => {
  beforeEach(async () => {
    const sql = client();
    try {
      await setup(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('rolls back domain, audit, outbox, and idempotency together, then retries canonically', async () => {
    const sql = client();
    const key = 'a045-atomic-retry-key';
    const hash = 'a'.repeat(64);
    try {
      const before = await snapshot(sql);
      await expect(
        sql.begin(async (tx) => {
          await context(tx, ids.patient, key, hash, 'create_appointment');
          await tx`select clinical.create_appointment_v1(${tx.json(appointmentPayload())}::jsonb)`;
        }),
      ).rejects.toThrow('synthetic injected failure');
      expect(await snapshot(sql)).toEqual(before);

      const created = await sql.begin(async (tx) => {
        await context(tx, ids.patient, key, hash);
        const [row] = await tx<
          { response: { id: string; feeMinorUnits: number; currency: string } }[]
        >`select clinical.create_appointment_v1(${tx.json(appointmentPayload())}::jsonb) as response`;
        return row!.response;
      });
      expect(created.id).toMatch(/[0-9a-f-]{36}/);
      expect(created).toMatchObject({ feeMinorUnits: 10000, currency: 'EGP' });
      const after = await snapshot(sql);
      expect(after.appointments).toBe(before.appointments + 1);
      expect(after.audit).toBe(before.audit + 1);
      expect(after.outbox).toBe(before.outbox + 1);
      expect(after.idempotency).toBe(before.idempotency + 1);

      const replay = await sql.begin(async (tx) => {
        await context(tx, ids.patient, key, hash);
        const [row] = await tx<
          { response: typeof created }[]
        >`select clinical.create_appointment_v1(${tx.json(appointmentPayload())}::jsonb) as response`;
        return row!.response;
      });
      expect(replay).toEqual(created);
      expect(await snapshot(sql)).toEqual(after);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('keeps canonical responses and effect counts unchanged after a committed response is lost', async () => {
    const sql = client();
    try {
      const before = await snapshot(sql);
      const first = await sql.begin(async (tx) => {
        await context(tx, ids.patient, 'a045-atomic-after-key', 'b'.repeat(64));
        const [row] = await tx<
          { response: { id: string } }[]
        >`select clinical.create_appointment_v1(${tx.json(appointmentPayload())}::jsonb) as response`;
        return row!.response;
      });
      const afterCommit = await snapshot(sql);
      expect(afterCommit.appointments).toBe(before.appointments + 1);
      // Model transport loss after commit: the caller discards `first`, then retries.
      const replay = await sql.begin(async (tx) => {
        await context(tx, ids.patient, 'a045-atomic-after-key', 'b'.repeat(64));
        const [row] = await tx<
          { response: { id: string } }[]
        >`select clinical.create_appointment_v1(${tx.json(appointmentPayload())}::jsonb) as response`;
        return row!.response;
      });
      expect(replay).toEqual(first);
      expect(await snapshot(sql)).toEqual(afterCommit);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

describe('Feature 009 telemetry redaction at the atomic-effects boundary', () => {
  it('emits only fixed low-cardinality fields and excludes sensitive sentinels', () => {
    const sentinels = [
      'Synthetic Patient Name',
      'patient@example.test',
      'raw reason',
      'Feature009-reschedule-reason-sentinel',
      'token-secret',
    ];
    const telemetry = clinicSchedulingTelemetry({
      requestId: 'a0450000-0000-4000-8000-000000000099',
      eventId: 'a0450000-0000-4000-8000-000000000098',
      aggregateId: ids.schedule,
      traceId: 'a0450000000000000000000000000099',
      surface: 'appointment',
      operation: 'createAppointment',
      resultClass: 'success',
      outcome: 'confirmed',
      scope: 'scoped',
      latencyMs: 42,
      patientName: sentinels[0],
      reason: sentinels[2],
      token: sentinels[3],
    } as never);
    const labels = clinicSchedulingMetricLabels(telemetry);
    expect(Object.keys(labels).toSorted()).toEqual([
      'latency_bucket',
      'operation',
      'outcome',
      'result_class',
      'scope',
      'surface',
    ]);
    const serialized = JSON.stringify({ telemetry, labels });
    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
  });
});
