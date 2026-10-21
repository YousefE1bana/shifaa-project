import assert from 'node:assert/strict';
import test from 'node:test';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import { Value } from '@sinclair/typebox/value';
import { clinicSchedulingRequestSchemas } from '@shifaa/contracts';

import {
  createClinicSchedulingClient,
  ClinicSchedulingApiError,
} from '@shifaa/api-client/clinic-scheduling';
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
  owner: 'f009a700-0000-4000-8c00-000000000001',
  doctor: 'f009a700-0000-4000-8c00-000000000002',
  patients: [
    'f009a700-0000-4000-8c00-000000000003',
    'f009a700-0000-4000-8c00-000000000004',
    'f009a700-0000-4000-8c00-000000000005',
    'f009a700-0000-4000-8c00-000000000006',
  ],
  facility: 'f009a700-0000-4000-8d00-000000000001',
  otherFacility: 'f009a700-0000-4000-8d00-000000000002',
  license: 'f009a700-0000-4000-8a00-000000000010',
  schedule: 'f009a700-0000-4000-8e00-000000000001',
} as const;

function db(): Sql {
  if (!databaseName) throw new Error('SHIFAA_F009_DATABASE is required for schedule E2E');
  return postgres({
    host: dbHost,
    port: Number(dbPort),
    username: 'shifaa_owner',
    password: 'synthetic_owner_only',
    database: databaseName,
    max: 1,
  });
}

async function clean(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL session_replication_role='replica'");
    await tx.unsafe(
      `DELETE FROM platform.idempotency_records WHERE resource_id IN (SELECT id FROM clinical.schedule_exceptions WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)) OR resource_id IN (SELECT id FROM clinical.appointments WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)) OR resource_id IN (SELECT id FROM clinical.schedules WHERE id='${ids.schedule}'::uuid OR facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid))`,
    );
    await tx.unsafe(
      `DELETE FROM platform.outbox_events WHERE aggregate_id IN (SELECT id FROM clinical.schedule_exceptions WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)) OR aggregate_id IN (SELECT id FROM clinical.appointments WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)) OR aggregate_id IN (SELECT id FROM clinical.schedules WHERE id='${ids.schedule}'::uuid OR facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid))`,
    );
    await tx.unsafe(
      `DELETE FROM audit.events WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM clinical.queue_entries WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM clinical.queue_scopes WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM clinical.appointments WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM clinical.schedule_exceptions WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM clinical.schedule_windows WHERE schedule_id='${ids.schedule}'::uuid`,
    );
    await tx.unsafe(
      `DELETE FROM clinical.schedules WHERE id='${ids.schedule}'::uuid OR facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM identity.facility_memberships WHERE facility_id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(`DELETE FROM identity.professional_licenses WHERE id='${ids.license}'::uuid`);
    await tx.unsafe(
      `DELETE FROM identity.patients WHERE person_id=ANY(ARRAY[${ids.patients.map((p) => `'${p}'::uuid`).join(',')}])`,
    );
    await tx.unsafe(
      `DELETE FROM identity.facilities WHERE id IN ('${ids.facility}'::uuid,'${ids.otherFacility}'::uuid)`,
    );
    await tx.unsafe(
      `DELETE FROM identity.people WHERE id IN ('${ids.owner}'::uuid,'${ids.doctor}'::uuid,${ids.patients.map((p) => `'${p}'::uuid`).join(',')})`,
    );
  });
}

async function seed(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
        ('${ids.owner}','f009a700-0000-4000-9c00-000000000001','F009 T070 owner','active'),
        ('${ids.doctor}','f009a700-0000-4000-9c00-000000000002','F009 T070 doctor','active'),
        ${ids.patients.map((p, i) => `('${p}','f009a700-0000-4000-9c00-00000000000${i + 3}','F009 T070 synthetic patient ${i + 1}','active')`).join(',')};
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
        VALUES ${ids.patients.map((p, i) => `('f009a700-0000-4000-8f00-00000000000${i + 1}','${p}','F009-T070-${i + 1}','active')`).join(',')};
      INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) VALUES
        ('${ids.facility}','clinic','عيادة اختبار','F009 T070 Clinic','active','C','Cairo','T070','Synthetic address','${ids.owner}'),
        ('${ids.otherFacility}','clinic','عيادة اختبار أخرى','F009 T070 Other Clinic','active','C','Cairo','T070','Synthetic address','${ids.owner}');
      INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
        VALUES ('${ids.license}','${ids.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F009 T070 regulator','2099-12-31','verified');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES
        ('${ids.facility}','${ids.owner}','owner',NULL,'2020-01-01','active','${ids.owner}'),
        ('${ids.facility}','${ids.doctor}','doctor','${ids.license}','2020-01-01','active','${ids.owner}');
      SELECT set_config('shifaa.person_id','${ids.owner}',true),set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2030-01-01T00:00:00Z',true);
    `);
  });
}

function injectFetch(app: {
  inject: (options: Record<string, unknown>) => Promise<any>;
}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const result = await app.inject({
      method: init?.method ?? 'GET',
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      ...(init?.body === undefined ? {} : { payload: JSON.parse(String(init.body)) }),
    });
    return new Response(result.body, {
      status: result.statusCode,
      headers: { 'content-type': String(result.headers['content-type'] ?? 'application/json') },
    });
  };
}

test(
  'T070 serial real API/PostgreSQL schedule, DST, delay, absence, scope and reconnect journey',
  { skip: !databaseName },
  async () => {
    const sql = db();
    const databaseUrl = `postgresql://shifaa_api:synthetic_api_only@${dbHost}:${dbPort}/${databaseName}`;
    const identity = new PostgresIdentityRepository(databaseUrl);
    let harness: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      await clean(sql);
      await seed(sql);
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
          databaseUrl,
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
        baseUrl: apiBaseUrl,
        accessToken: `synthetic-person:${ids.owner}`,
        acceptLanguage: 'en-EG',
        fetch,
      });
      const patients = ids.patients.map((personId, i) =>
        createPatientClinicSchedulingClient({
          locale: i % 2 ? 'en-EG' : 'ar-EG',
          patientId: personId,
          accessToken: `synthetic-person:${personId}`,
          apiBaseUrl,
          fetch,
        }),
      );

      const createScheduleBody = {
        doctorId: ids.doctor,
        timezone: 'Africa/Cairo',
        validFrom: '2030-01-01',
        validTo: '2030-05-01',
        slotDurationMinutes: 30,
        feeMinorUnits: 10000,
        status: 'active' as const,
        windows: [
          { isoWeekday: 1, localStart: '09:00:00Z', localEnd: '15:00:00Z' },
          { isoWeekday: 5, localStart: '00:00:00Z', localEnd: '02:00:00Z' },
        ],
      };
      assert.equal(
        Value.Check(clinicSchedulingRequestSchemas.createSchedule, createScheduleBody),
        true,
      );
      const schedule = await clinic.createSchedule(
        ids.facility,
        createScheduleBody,
        'f009-t070-create-schedule',
      );
      assert.equal(schedule.currency, 'EGP');
      assert.equal(schedule.version, 1);
      const updated = await clinic.updateSchedule(
        ids.facility,
        schedule.id,
        { feeMinorUnits: 12500 },
        schedule.version,
        'f009-t070-update-schedule',
      );
      assert.equal(updated.version, 2);
      assert.equal(updated.feeMinorUnits, 12500);

      let currentScheduleVersion = updated.version;
      const assertAddedConflictHasNoEffects = async (
        startsAt: string,
        endsAt: string,
        civilDate: string,
        idempotencyKey: string,
        expectedVersion: number,
        message: string,
      ) => {
        const before = await sql<{ version: number; exception_count: number }[]>`
          SELECT s.version,
            (SELECT count(*)::int FROM clinical.schedule_exceptions e WHERE e.schedule_id=s.id) exception_count
          FROM clinical.schedules s WHERE s.id=${schedule.id}`;
        assert.equal(before.length, 1);
        assert.equal(before[0]!.version, expectedVersion);
        await assert.rejects(
          () =>
            clinic.createScheduleException(
              ids.facility,
              schedule.id,
              {
                type: 'added',
                startsAt,
                endsAt,
                civilDate,
                reason: `synthetic T070 ${message}`,
              },
              expectedVersion,
              idempotencyKey,
            ),
          (e) => e instanceof ClinicSchedulingApiError && e.status === 409,
          message,
        );
        const after = await sql<{ version: number; exception_count: number }[]>`
          SELECT s.version,
            (SELECT count(*)::int FROM clinical.schedule_exceptions e WHERE e.schedule_id=s.id) exception_count
          FROM clinical.schedules s WHERE s.id=${schedule.id}`;
        assert.deepEqual(
          after,
          before,
          `${message}: conflict creates no row and changes no version`,
        );
      };
      await assertAddedConflictHasNoEffects(
        '2030-01-07T08:00:00Z',
        '2030-01-07T08:30:00Z',
        '2030-01-07',
        'f009-t070-added-overlap-base',
        currentScheduleVersion,
        'added exception cannot overlap an effective base schedule window',
      );
      const boundaryA = await clinic.createScheduleException(
        ids.facility,
        schedule.id,
        {
          type: 'blocked',
          startsAt: '2030-01-14T07:00:00Z',
          endsAt: '2030-01-14T08:00:00Z',
          civilDate: '2030-01-14',
          reason: 'synthetic T070 boundary A',
        },
        currentScheduleVersion++,
        'f009-t070-exception-a',
      );
      const boundaryB = await clinic.createScheduleException(
        ids.facility,
        schedule.id,
        {
          type: 'blocked',
          startsAt: '2030-01-14T08:00:00Z',
          endsAt: '2030-01-14T09:00:00Z',
          civilDate: '2030-01-14',
          reason: 'synthetic T070 boundary B',
        },
        currentScheduleVersion++,
        'f009-t070-exception-b',
      );
      assert.ok(boundaryA.id && boundaryB.id, 'half-open adjacent exception ranges both persist');
      await assertAddedConflictHasNoEffects(
        '2030-01-14T07:30:00Z',
        '2030-01-14T08:30:00Z',
        '2030-01-14',
        'f009-t070-added-overlap-blocked',
        currentScheduleVersion,
        'added exception cannot enter an effective blocked interval',
      );
      await assert.rejects(
        () =>
          clinic.createScheduleException(
            ids.facility,
            schedule.id,
            {
              type: 'blocked',
              startsAt: '2030-01-14T07:30:00Z',
              endsAt: '2030-01-14T08:30:00Z',
              civilDate: '2030-01-14',
              reason: 'synthetic T070 positive overlap',
            },
            currentScheduleVersion,
            'f009-t070-exception-overlap',
          ),
        (e) => e instanceof ClinicSchedulingApiError && e.status === 409,
      );
      const overlapCount = await sql<
        { count: number }[]
      >`SELECT count(*)::int count FROM clinical.schedule_exceptions WHERE schedule_id=${schedule.id} AND exception_type='blocked'`;
      assert.equal(overlapCount[0]?.count, 2, 'overlap conflict leaves no partial exception');

      const dst = await clinic.listDoctorAvailability(ids.facility, ids.doctor, {
        fromDate: '2030-04-26',
        toDate: '2030-04-26',
      });
      assert.equal(dst.items.length, 2, 'spring-forward date retains exactly two valid slots');
      assert.ok(dst.items.every((slot) => slot.civilDate === '2030-04-26'));
      assert.equal(
        new Set(dst.items.map((slot) => slot.startsAt)).size,
        dst.items.length,
        'DST recurrence yields unique UTC slot identities',
      );
      assert.ok(
        dst.items.every(
          (slot) =>
            new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime() === 30 * 60_000,
        ),
      );
      const cairoClock = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      assert.ok(
        dst.items.every(
          (slot) => !['00:00', '00:30'].includes(cairoClock.format(new Date(slot.startsAt))),
        ),
        'nonexistent local starts at the spring-forward boundary are omitted',
      );
      assert.deepEqual(
        dst.items.map((slot) => cairoClock.format(new Date(slot.startsAt))),
        ['01:00', '01:30'],
        'only the two surviving half-hour starts in the 00:00-02:00 window are available',
      );

      const createAt = async (patientIndex: number, hour: number) =>
        patients[patientIndex]!.createAppointment(
          {
            patientId: ids.patients[patientIndex]!,
            facilityId: ids.facility,
            doctorId: ids.doctor,
            startsAt: `2030-01-07T${String(hour - 2).padStart(2, '0')}:00:00.000Z`,
            endsAt: `2030-01-07T${String(hour - 2).padStart(2, '0')}:30:00.000Z`,
            timezone: 'Africa/Cairo',
            civilDate: '2030-01-07',
            paymentMethod: 'cash_on_arrival',
          },
          `f009-t070-book-${patientIndex}`,
        );
      const a = await createAt(0, 9);
      const b = await createAt(1, 10);
      const c = await createAt(2, 11);
      const outside = await createAt(3, 12);
      const checked = await clinic.checkInAppointment(b.id, b.version, 'f009-t070-checkin');
      const called = await clinic.callQueueEntry(
        checked.queueEntry.id,
        checked.queueEntry.version,
        'f009-t070-call-entry',
      );

      const beforeDelay = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      const timeStateBefore = await sql<
        { id: string; starts_at: string; status: string }[]
      >`SELECT id,starts_at,status FROM clinical.appointments WHERE id=ANY(${sql.array([a.id, b.id, c.id, outside.id])}::uuid[]) ORDER BY id`;
      const delayBody = {
        civilDate: '2030-01-07',
        delayMinutes: 15,
        templateCode: 'CLINIC_DOCTOR_DELAY',
        reason: 'synthetic T070 delay',
      };
      const delayed = await clinic.sendDoctorDelay(
        ids.facility,
        ids.doctor,
        delayBody,
        'f009-t070-delay-replay',
      );
      const replay = await clinic.sendDoctorDelay(
        ids.facility,
        ids.doctor,
        delayBody,
        'f009-t070-delay-replay',
      );
      assert.deepEqual(
        replay,
        delayed,
        'same-key delay replay returns canonical original response',
      );
      const superseded = await clinic.sendDoctorDelay(
        ids.facility,
        ids.doctor,
        { ...delayBody, delayMinutes: 30 },
        'f009-t070-delay-distinct',
      );
      assert.notEqual(superseded.delayId, delayed.delayId);
      const delayRows = await sql<
        { delay_minutes: number; superseded_at: string | null }[]
      >`SELECT delay_minutes,superseded_at FROM clinical.schedule_exceptions WHERE schedule_id=${schedule.id} AND exception_type='delay' ORDER BY created_at,id`;
      assert.deepEqual(
        delayRows.map((row) => [row.delay_minutes, row.superseded_at === null]),
        [
          [15, false],
          [30, true],
        ],
      );
      const afterDelay = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      const timeStateAfter = await sql<
        { id: string; starts_at: string; status: string }[]
      >`SELECT id,starts_at,status FROM clinical.appointments WHERE id=ANY(${sql.array([a.id, b.id, c.id, outside.id])}::uuid[]) ORDER BY id`;
      assert.deepEqual(
        timeStateAfter,
        timeStateBefore,
        'delay cannot change appointment time or status',
      );
      assert.deepEqual(
        afterDelay.entries.map((e) => [e.id, e.position, e.state]),
        beforeDelay.entries.map((e) => [e.id, e.position, e.state]),
        'delay cannot change queue order or state',
      );
      const delayEvents = await sql<
        { count: number; payload: string }[]
      >`SELECT count(*)::int count, string_agg(payload::text,'') payload FROM platform.outbox_events WHERE event_type='clinical.doctor_delay.declared.v1' AND aggregate_id=ANY(${sql.array([delayed.delayId, superseded.delayId])}::uuid[])`;
      assert.equal(
        delayEvents[0]?.count,
        2,
        'replay adds no second event; distinct supersession adds one eligible governed event each',
      );
      assert.equal(
        delayEvents[0]?.payload.includes('synthetic T070 delay'),
        false,
        'raw delay reason is absent from outbox',
      );
      const notificationEligibility = await sql<
        { published_count: number; event_count: number; sms_enabled: boolean }[]
      >`
      SELECT
        (SELECT count(*)::int FROM platform.notification_template_releases WHERE template_code IN ('CLINIC_DOCTOR_DELAY','CLINIC_DOCTOR_ABSENCE') AND status='published' AND effective_at<=statement_timestamp()) published_count,
        (SELECT count(*)::int FROM platform.outbox_events WHERE event_type='clinical.doctor_delay.declared.v1' AND aggregate_id=ANY(${sql.array([delayed.delayId, superseded.delayId])}::uuid[])) event_count,
        COALESCE((SELECT (constraints->>'production_sms')::boolean FROM platform.feature_flags WHERE code='clinic_scheduling.dispatch' AND environment='production'),false) production_sms`;
      assert.deepEqual(
        notificationEligibility[0],
        { published_count: 0, event_count: 2, production_sms: false },
        'delay events are recorded, but unpublished candidates are ineligible and production SMS stays disabled under OPEN-VENDOR-002',
      );

      const unprivilegedClinic = createClinicSchedulingClient({
        baseUrl: apiBaseUrl,
        accessToken: `synthetic-person:${ids.patients[3]}`,
        acceptLanguage: 'en-EG',
        fetch,
      });
      await assert.rejects(
        () =>
          unprivilegedClinic.updateSchedule(
            ids.facility,
            schedule.id,
            { feeMinorUnits: 999 },
            currentScheduleVersion,
            'f009-t070-cross-scope',
          ),
        (e) => e instanceof ClinicSchedulingApiError && e.status === 404,
      );

      const absence = await clinic.declareDoctorAbsence(
        ids.facility,
        ids.doctor,
        {
          civilDate: '2030-01-07',
          startsAt: '2030-01-07T07:00:00Z',
          endsAt: '2030-01-07T08:30:00Z',
          reason: 'synthetic T070 absence',
        },
        'f009-t070-absence',
      );
      const scheduleAfterAbsence = await sql<{ version: number }[]>`
        SELECT version FROM clinical.schedules WHERE id=${schedule.id}`;
      await assertAddedConflictHasNoEffects(
        '2030-01-07T07:15:00Z',
        '2030-01-07T07:30:00Z',
        '2030-01-07',
        'f009-t070-added-overlap-absence',
        scheduleAfterAbsence[0]!.version,
        'added exception cannot enter an effective absence interval',
      );
      assert.deepEqual(
        new Set(absence.affectedAppointmentIds),
        new Set([a.id, b.id]),
        'only intersecting confirmed/checked-in appointments are affected',
      );
      assert.deepEqual(
        new Set(absence.removedQueueEntryIds),
        new Set([checked.queueEntry.id]),
        'only the queue entry associated with an affected appointment is removed',
      );
      assert.ok(absence.removedQueueEntryIds.includes(checked.queueEntry.id));
      const suggestedSlots = absence.replacementSuggestions.flatMap(
        (suggestion) => suggestion.slots,
      );
      const suggested = suggestedSlots[0];
      assert.ok(suggested, 'absence offers a future replacement slot');
      assert.ok(
        absence.replacementSuggestions.every((s) =>
          s.slots.every(
            (slot, index) => index === 0 || s.slots[index - 1]!.startsAt <= slot.startsAt,
          ),
        ),
        'each replacement list is earliest-first',
      );
      assert.ok(absence.replacementSuggestions.every((s) => s.held !== true));
      assert.ok(
        suggestedSlots.every(
          (s) =>
            s.facilityId === ids.facility &&
            s.doctorId === ids.doctor &&
            new Date(s.startsAt) > new Date('2030-01-07T00:00:00Z'),
        ),
      );
      const suggestionOccupancy = await sql<
        { count: number }[]
      >`SELECT count(*)::int count FROM clinical.appointments WHERE schedule_id=${schedule.id} AND occupied_range && tstzrange(${suggested.startsAt}::timestamptz,${suggested.endsAt}::timestamptz,'[)')`;
      assert.equal(suggestionOccupancy[0]?.count, 0, 'suggestion creates no appointment slot hold');
      const postAbsence = await clinic.getQueue(ids.facility, {
        doctorId: ids.doctor,
        date: '2030-01-07',
      });
      assert.equal(
        postAbsence.entries.find((e) => e.id === checked.queueEntry.id)?.state,
        'removed',
      );
      const persisted = await sql<
        { id: string; status: string }[]
      >`SELECT id,status FROM clinical.appointments WHERE id=ANY(${sql.array([a.id, b.id, c.id, outside.id])}::uuid[]) ORDER BY id`;
      assert.deepEqual(
        persisted.map((row) => [row.id, row.status]),
        [
          [a.id, 'reschedule_required'],
          [b.id, 'reschedule_required'],
          [c.id, 'confirmed'],
          [outside.id, 'confirmed'],
        ].sort((x, y) => x[0].localeCompare(y[0])),
      );
      const availability = await patients[0]!.listDoctorAvailability(ids.facility, ids.doctor, {
        fromDate: suggested.civilDate,
        toDate: suggested.civilDate,
      });
      assert.ok(
        availability.items.some(
          (slot) => Date.parse(slot.startsAt) === Date.parse(suggested.startsAt),
        ),
        `replacement suggestion remains visible availability, not a hold: ${suggested.civilDate} ${suggested.startsAt}; current=${availability.items.map((slot) => slot.startsAt).join(',')}`,
      );
      const reservedSuggestion = await patients[3]!.createAppointment(
        {
          patientId: ids.patients[3],
          facilityId: ids.facility,
          doctorId: ids.doctor,
          startsAt: suggested.startsAt,
          endsAt: suggested.endsAt,
          timezone: suggested.timezone,
          civilDate: suggested.civilDate,
          paymentMethod: 'cash_on_arrival',
        },
        'f009-t070-book-suggestion',
      );
      assert.equal(
        reservedSuggestion.status,
        'confirmed',
        'a patient can acquire the unheld suggested slot',
      );
      const absenceEvents = await sql<
        { count: number; payload: string }[]
      >`SELECT count(*)::int count,string_agg(payload::text,'') payload FROM platform.outbox_events WHERE event_type='clinical.doctor_absence.declared.v1' AND aggregate_id=${absence.absenceId}`;
      assert.equal(absenceEvents[0]?.count, 1);
      assert.equal(absenceEvents[0]?.payload.includes('synthetic T070 absence'), false);

      let online = false;
      let dropCommittedResponse = false;
      const reconnecting = createClinicSchedulingClient({
        baseUrl: apiBaseUrl,
        accessToken: `synthetic-person:${ids.owner}`,
        acceptLanguage: 'ar-EG',
        fetch: async (input, init) => {
          if (!online) throw new TypeError('synthetic-disconnect-before-delivery');
          const response = await fetch(input, init);
          if (dropCommittedResponse) {
            dropCommittedResponse = false;
            throw new TypeError('synthetic-disconnect-after-commit-before-response');
          }
          return response;
        },
      });
      await assert.rejects(
        () =>
          reconnecting.updateSchedule(
            ids.facility,
            schedule.id,
            { feeMinorUnits: 13000 },
            currentScheduleVersion,
            'f009-t070-reconnect-update',
          ),
        /synthetic-disconnect-before-delivery/,
      );
      assert.equal(
        (await clinic.getAppointment(c.id)).status,
        'confirmed',
        'disconnect left committed domain state readable and unchanged',
      );
      online = true;
      const eventCountBeforeCommit = await sql<{ count: number }[]>`
        SELECT count(*)::int count FROM platform.outbox_events
        WHERE event_type='clinical.schedule.changed.v1' AND aggregate_id=${schedule.id}`;
      dropCommittedResponse = true;
      await assert.rejects(
        () =>
          reconnecting.updateSchedule(
            ids.facility,
            schedule.id,
            { feeMinorUnits: 13000 },
            currentScheduleVersion,
            'f009-t070-reconnect-update',
          ),
        /synthetic-disconnect-after-commit-before-response/,
      );
      const committedAfterDrop = await sql<{ version: number; fee_minor_units: number }[]>`
        SELECT version,fee_minor_units FROM clinical.schedules WHERE id=${schedule.id}`;
      assert.deepEqual(committedAfterDrop[0], {
        version: currentScheduleVersion + 1,
        fee_minor_units: '13000',
      });
      const eventCountAfterCommit = await sql<{ count: number }[]>`
        SELECT count(*)::int count FROM platform.outbox_events
        WHERE event_type='clinical.schedule.changed.v1' AND aggregate_id=${schedule.id}`;
      assert.equal(eventCountAfterCommit[0]?.count, eventCountBeforeCommit[0]!.count + 1);

      const reconnected = await reconnecting.updateSchedule(
        ids.facility,
        schedule.id,
        { feeMinorUnits: 13000 },
        currentScheduleVersion,
        'f009-t070-reconnect-update',
      );
      assert.equal(reconnected.feeMinorUnits, 13000);
      assert.equal(reconnected.version, currentScheduleVersion + 1);
      const eventCountAfterReplay = await sql<{ count: number }[]>`
        SELECT count(*)::int count FROM platform.outbox_events
        WHERE event_type='clinical.schedule.changed.v1' AND aggregate_id=${schedule.id}`;
      assert.equal(
        eventCountAfterReplay[0]?.count,
        eventCountAfterCommit[0]!.count,
        'same-key reconnect replays canonical result without another outbox event',
      );
      assert.equal((await clinic.getAppointment(c.id)).status, 'confirmed');
    } finally {
      await harness?.app.close();
      await identity.close();
      await clean(sql);
      await sql.end({ timeout: 5 });
    }
  },
);
