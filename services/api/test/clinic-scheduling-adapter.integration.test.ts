import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresClinicSchedulingService } from '../src/adapters/postgres/clinic-scheduling-service.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import type { ClinicSchedulingActor } from '../src/modules/clinic-scheduling/types.js';

const database = process.env['SHIFAA_F009_DATABASE'];
const testDatabase = database ?? 'shifaa_f009_adapter_skipped';

const databaseUrl =
  process.env['SHIFAA_F009_API_DATABASE_URL'] ??
  `postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/${testDatabase}`;
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, onnotice: () => undefined });
const ownerSql = postgres(
  `postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/${testDatabase}`,
  { max: 1, connect_timeout: 10, onnotice: () => undefined },
);
const identity = new PostgresIdentityRepository(databaseUrl);
const adapter = new PostgresClinicSchedulingService(identity);
const actor: ClinicSchedulingActor = {
  personId: 'f0090000-0000-4000-8000-000000000003',
  principal: 'f009-adapter-test',
  requestId: 'f009-adapter-request',
  traceId: 'f009-adapter-trace',
  aal: 2,
  locale: 'en-EG',
};

async function seedPageActorsAndSchedules() {
  await ownerSql.begin(async (tx) => {
    await tx.unsafe("set local session_replication_role='replica'");
    await tx.unsafe(`
      insert into identity.people(id,user_id,display_name,profile_status) values
        ('f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-9000-000000000001','F009 adapter owner','active'),
        ('f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-9000-000000000002','F009 adapter doctor','active'),
        ('f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-9000-000000000003','F009 adapter patient','active')
      on conflict do nothing;
      insert into identity.patients(id,person_id,medical_record_number,record_status)
      values ('f0090000-0000-4000-8900-000000000001','f0090000-0000-4000-8000-000000000003','F009-ADAPTER','active')
      on conflict do nothing;
      insert into identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,location,created_by_person_id)
      values ('f0090000-0000-4000-8100-000000000001','clinic','عيادة تجريبية','Synthetic adapter clinic','active','C','Cairo','Test','Synthetic address',
        public.ST_SetSRID(public.ST_MakePoint(31.2,30),4326)::public.geography,
        'f0090000-0000-4000-8000-000000000001')
      on conflict do nothing;
      insert into identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
      values ('f0090000-0000-4000-8a00-000000000001','f0090000-0000-4000-8000-000000000002','doctor',
        decode(repeat('1',16),'hex'),decode(repeat('2',64),'hex'),'F009 adapter regulator','2035-12-31','verified')
      on conflict do nothing;
      insert into identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) values
        ('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000001','owner',null,'2020-01-01','active','f0090000-0000-4000-8000-000000000001'),
        ('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','doctor','f0090000-0000-4000-8a00-000000000001','2020-01-01','active','f0090000-0000-4000-8000-000000000001')
      on conflict do nothing;
      insert into clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
      values ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001',
        'f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-01','2026-09-30',30,10000,'EGP',
        'f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001')
      on conflict do nothing;
    `);
  });
}

describe.skipIf(!database)('Feature 009 non-owner PostgreSQL adapter', () => {
  beforeAll(async () => {
    const [role] = await sql<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      select current_user, r.rolsuper, r.rolbypassrls
      from pg_roles r where r.rolname = current_user`;
    expect(role).toMatchObject({
      current_user: 'shifaa_api',
      rolsuper: false,
      rolbypassrls: false,
    });
  });

  afterAll(async () => {
    await identity.close();
    await sql.end({ timeout: 5 });
    await ownerSql.end({ timeout: 5 });
  });

  it('uses fixed availability and subject projections through the runtime role', async () => {
    const rls = await sql<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owner: string }[]
    >`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clinical'
        and c.relname in ('schedules','schedule_windows','schedule_exceptions','appointments','queue_scopes','queue_entries')`;
    expect(rls).toHaveLength(6);
    expect(
      rls.every(
        (row) =>
          row['relrowsecurity'] && row['relforcerowsecurity'] && row['owner'] !== 'shifaa_api',
      ),
    ).toBe(true);

    const fixedResults = await sql<{ proname: string; result: string }[]>`
      select p.proname, pg_get_function_result(p.oid) as result
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clinical'
        and p.proname in ('list_availability_v1','read_my_appointment_v1','read_my_queue_position_v1')`;
    expect(fixedResults).toHaveLength(3);
    expect(fixedResults.map((row) => row['result']).join(' ')).not.toMatch(
      /reason|facility|doctor_person|patient_person|queue_scope/i,
    );

    const indexes = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'clinical'
        and indexname in ('clinical_schedules_scope_idx','clinical_schedule_exceptions_schedule_idx','clinical_appointments_schedule_idx','clinical_queue_entries_read_idx')`;
    expect(indexes.map((row) => row['indexname'])).toEqual(
      expect.arrayContaining([
        'clinical_schedules_scope_idx',
        'clinical_schedule_exceptions_schedule_idx',
      ]),
    );
    const plan = await sql`explain (format json)
      select starts_at, ends_at from clinical.list_availability_v1(
        '00000000-0000-0000-0000-000000000000'::uuid, '2030-01-01'::date
      ) order by starts_at limit 500`;
    expect(JSON.stringify(plan)).toContain('Limit');
    const indexedPlan = await ownerSql.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      return tx`explain (format json)
        select id from clinical.schedules
        where facility_id = '00000000-0000-0000-0000-000000000000'::uuid
          and doctor_person_id = '00000000-0000-0000-0000-000000000000'::uuid
          and status = 'active' and valid_from <= '2030-01-01'::date
          and valid_to >= '2030-01-01'::date
        order by valid_from, id limit 1`;
    });
    expect(JSON.stringify(indexedPlan)).toMatch(
      /schedules_active_validity_excl|clinical_schedules_scope_idx/,
    );

    const availability = await adapter.listAvailability(
      actor,
      'f0090000-0000-4000-8200-000000000001',
      '2026-09-13',
    );
    expect(availability).toEqual([]);

    const appointment = await adapter.readMyAppointment(
      actor,
      'f0090000-0000-4000-8300-000000000001',
    );
    expect(appointment).toBeNull();
  });

  it('pages distance-ordered public doctors without dropping a second facility for the same doctor', async () => {
    const secondFacility = 'f0090000-0000-4000-8100-000000000009';
    const secondSchedule = 'f0090000-0000-4000-8200-000000000009';
    await seedPageActorsAndSchedules();
    await ownerSql`
      update identity.facilities
      set location = public.ST_SetSRID(public.ST_MakePoint(31.2,30),4326)::public.geography
      where id = 'f0090000-0000-4000-8100-000000000001'::uuid`;
    await ownerSql`
      insert into identity.facilities
        (id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,location,created_by_person_id)
      values (${secondFacility}::uuid,'clinic','عيادة ثانية','Synthetic second clinic','active','C','Cairo','Test','Synthetic address',
        public.ST_SetSRID(public.ST_MakePoint(31.25,30.05),4326)::public.geography,
        'f0090000-0000-4000-8000-000000000001'::uuid)`;
    await ownerSql`
      insert into identity.facility_memberships
        (facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
      values (${secondFacility}::uuid,'f0090000-0000-4000-8000-000000000002'::uuid,'doctor',
        'f0090000-0000-4000-8a00-000000000001'::uuid,'2020-01-01','active',
        'f0090000-0000-4000-8000-000000000001'::uuid)`;
    await ownerSql`
      insert into clinical.schedules
        (id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
      values (${secondSchedule}::uuid,${secondFacility}::uuid,
        'f0090000-0000-4000-8000-000000000002'::uuid,'Africa/Cairo','2026-09-01','2026-09-30',30,12000,'EGP',
        'f0090000-0000-4000-8000-000000000001'::uuid,
        'f0090000-0000-4000-8000-000000000001'::uuid)`;
    try {
      const filter = { near: '30,31.2', radius: 100000, date: '2026-09-20' };
      const first = await adapter.searchDoctors(null, filter, { limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await adapter.searchDoctors(null, filter, {
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map((item) => item.facilityId))).toEqual(
        new Set(['f0090000-0000-4000-8100-000000000001', secondFacility]),
      );
      expect(second.items[0]?.distanceMeters).toBeGreaterThan(first.items[0]?.distanceMeters ?? 0);
      await expect(
        adapter.searchDoctors(
          null,
          { ...filter, radius: 1000 },
          { limit: 1, cursor: first.nextCursor! },
        ),
      ).rejects.toThrow();
    } finally {
      await ownerSql`delete from clinical.schedules where id=${secondSchedule}::uuid`;
      await ownerSql`delete from identity.facility_memberships where facility_id=${secondFacility}::uuid`;
      await ownerSql`delete from identity.facilities where id=${secondFacility}::uuid`;
      await ownerSql`
        update identity.facilities set location = null
        where id = 'f0090000-0000-4000-8100-000000000001'::uuid`;
    }
  });

  it('bounds queue pages in authoritative order and rejects a stale queue version cursor', async () => {
    await seedPageActorsAndSchedules();
    await ownerSql.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role='replica'");
      await tx.unsafe(`
        insert into clinical.appointments
          (id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
        values
          ('f0090000-0000-4000-8300-000000000001','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-20T07:00:00Z','2026-09-20T07:30:00Z','Africa/Cairo','2026-09-20','09:00',10000,'EGP','checked_in','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003'),
          ('f0090000-0000-4000-8300-000000000002','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-20T07:30:00Z','2026-09-20T08:00:00Z','Africa/Cairo','2026-09-20','09:30',10000,'EGP','checked_in','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003')
        on conflict do nothing;
        insert into clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name)
        values ('f0090000-0000-4000-8400-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','2026-09-20','Africa/Cairo')
        on conflict do nothing;
        insert into clinical.queue_entries
          (id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state)
        values
          ('f0090000-0000-4000-8500-000000000001','f0090000-0000-4000-8400-000000000001','f0090000-0000-4000-8300-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','2026-09-20',1,1,'waiting'),
          ('f0090000-0000-4000-8500-000000000002','f0090000-0000-4000-8400-000000000001','f0090000-0000-4000-8300-000000000002','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','2026-09-20',2,2,'waiting')
        on conflict do nothing;
      `);
    });
    const clinicActor = {
      ...actor,
      personId: 'f0090000-0000-4000-8000-000000000001',
      principal: 'f009-adapter-owner',
    };
    const filter = {
      facilityId: 'f0090000-0000-4000-8100-000000000001',
      doctorId: 'f0090000-0000-4000-8000-000000000002',
      date: '2026-09-20',
    };
    const first = await adapter.getQueue(clinicActor, filter, { limit: 1 });
    expect(first.items[0]?.entries).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await adapter.getQueue(clinicActor, filter, {
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items[0]?.entries).toHaveLength(1);
    expect(second.items[0]?.entries[0]?.id).not.toBe(first.items[0]?.entries[0]?.id);
    await ownerSql`
      update clinical.queue_scopes set version=version+1
      where facility_id=${filter.facilityId}::uuid
        and doctor_person_id=${filter.doctorId}::uuid and civil_date=${filter.date}::date`;
    await expect(
      adapter.getQueue(clinicActor, filter, { limit: 1, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: '40001' });
  });
});
