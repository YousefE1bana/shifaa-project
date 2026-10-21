import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import { buildApp } from '../../services/api/src/app.ts';
import { loadConfig } from '../../services/api/src/config.ts';
import { PostgresClinicSchedulingService } from '../../services/api/src/adapters/postgres/clinic-scheduling-service.ts';
import { PostgresIdentityRepository } from '../../services/api/src/adapters/postgres/identity-repository.ts';
import { ClinicSchedulingService } from '../../services/api/src/modules/clinic-scheduling/service.ts';
import { idempotencyScopeHash } from '../../services/api/src/platform/idempotency.ts';

import { createPatientClinicSchedulingClient } from '../../apps/patient/src/clinic-scheduling-api.ts';
import {
  bookingResultMatchesSelection,
  validateBookingSelection,
} from '../../apps/patient/src/clinic-scheduling-booking.ts';
import {
  canContinueToBooking,
  doctorResultPresentation,
} from '../../apps/patient/src/clinic-scheduling-discovery.ts';

const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const patientId = '91000000-0000-4000-8000-000000000003';
const selected = {
  facilityId,
  doctorId,
  startsAt: '2030-01-07T09:00:00+02:00',
  endsAt: '2030-01-07T09:30:00+02:00',
  civilDate: '2030-01-07',
  timezone: 'Africa/Cairo',
  paymentMethod: 'cash_on_arrival',
};
const doctor = {
  doctorId,
  doctorDisplayName: 'Synthetic Doctor',
  specialty: 'Internal medicine',
  professionalLicenseVerified: true,
  facilityId,
  facilityDisplayName: 'Synthetic Clinic',
  facilityVerified: true,
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  nextAvailableSlot: selected,
  distanceMeters: null,
  availabilityVersion: 1,
  updatedAt: '2029-12-01T08:00:00.000Z',
  stale: false,
};
const page = {
  items: [selected],
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
  freshness: 'fresh',
  generatedAt: '2029-12-01T08:00:00.000Z',
};
const appointment = {
  id: '92000000-0000-4000-8000-000000000001',
  patientId,
  ...selected,
  status: 'confirmed',
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fetcherFor(
  options: {
    bookingStatus?: number;
    offline?: boolean;
    availability?: typeof page;
    oneWinner?: boolean;
  } = {},
): typeof fetch {
  let bookingCalls = 0;
  return async (input, init) => {
    if (options.offline) throw new TypeError('offline-no-queue');
    const url = String(input);
    if (url.includes('/discovery/doctors'))
      return response({ items: [doctor], nextCursor: null, freshness: 'fresh' });
    if (url.includes('/availability')) return response(options.availability ?? page);
    if (url.endsWith('/appointments')) {
      bookingCalls += 1;
      if (options.oneWinner && bookingCalls > 1) return response({ code: 'slot_conflict' }, 409);
      if (options.bookingStatus) return response({ code: 'slot_conflict' }, options.bookingStatus);
      assert.equal(
        new Headers(init?.headers).get('idempotency-key')?.startsWith('clinic-ui-009-'),
        true,
      );
      return response(appointment);
    }
    throw new Error(`unexpected synthetic request: ${url}`);
  };
}

test('AC-01/02/03/14 discovery-to-booking HTTP journey is bilingual and server-authoritative', async () => {
  for (const [locale, direction] of [
    ['ar-EG', 'rtl'],
    ['en-EG', 'ltr'],
  ] as const) {
    const api = createPatientClinicSchedulingClient({
      locale,
      patientId,
      accessToken: 'synthetic-person:patient',
      apiBaseUrl: 'https://synthetic.invalid',
      fetch: fetcherFor(),
    });
    const found = await api.searchDoctors({ facilityId });
    assert.equal(found.items[0]?.facilityVerified, true);
    assert.equal(
      doctorResultPresentation(found.items[0], locale, found.freshness)?.direction,
      direction,
    );
    const availability = await api.listDoctorAvailability(facilityId, doctorId, {
      fromDate: selected.civilDate,
      toDate: selected.civilDate,
    });
    assert.equal(validateBookingSelection(availability, selected), 'ready');
    assert.equal(canContinueToBooking(availability.freshness, true, true), true);
    const booked = await api.createAppointment(selected);
    assert.equal(bookingResultMatchesSelection(booked, selected, patientId), true);
    assert.equal(booked.currency, 'EGP');
    assert.equal(booked.paymentMethod, 'cash_on_arrival');
  }
});

test('AC-02/16 stale and offline reads disable continuation without an offline mutation queue', async () => {
  const staleApi = createPatientClinicSchedulingClient({
    locale: 'ar-EG',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: fetcherFor({ availability: { ...page, freshness: 'stale' } }),
  });
  const stale = await staleApi.listDoctorAvailability(facilityId, doctorId, {
    fromDate: selected.civilDate,
    toDate: selected.civilDate,
  });
  assert.equal(validateBookingSelection(stale, selected), 'stale');
  assert.equal(canContinueToBooking('stale', true, true), false);
  const offlineApi = createPatientClinicSchedulingClient({
    locale: 'en-EG',
    patientId,
    accessToken: 'synthetic-person:patient',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: fetcherFor({ offline: true }),
  });
  await assert.rejects(() => offlineApi.createAppointment(selected), /offline-no-queue/);
});

test('AC-05 conflict leaves the current slot authoritative and does not claim a winner', async () => {
  const api = createPatientClinicSchedulingClient({
    locale: 'en-EG',
    patientId,
    accessToken: 'synthetic-person:patient',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: fetcherFor({ bookingStatus: 409 }),
  });
  await assert.rejects(() => api.createAppointment(selected), /slot_conflict|409/);
});

test('AC-05 one-winner booking race returns one confirmation and one conflict', async () => {
  const fetch = fetcherFor({ oneWinner: true });
  const makeClient = () =>
    createPatientClinicSchedulingClient({
      locale: 'en-EG',
      patientId,
      accessToken: 'synthetic-person:patient',
      apiBaseUrl: 'https://synthetic.invalid',
      fetch,
    });
  const results = await Promise.allSettled([
    makeClient().createAppointment(selected),
    makeClient().createAppointment(selected),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

test('patient P0 route families are mapped to the T056 structural journey', () => {
  for (const path of [
    'apps/patient/app/discover/index.tsx',
    'apps/patient/app/doctors/[id].tsx',
    'apps/patient/app/appointments/new.tsx',
  ])
    assert.equal(fs.existsSync(path), true, path);
  // Browser rendering, keyboard traversal, screen-reader output, 360x800/412x915,
  // 200%/400% reflow, forced-colors, and reduced-motion need live/manual evidence.
});

const databaseName = process.env['SHIFAA_F009_DATABASE'];
const dbHost = process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1';
const dbPort = process.env['SHIFAA_PG_PORT'] ?? '5432';
const realIds = {
  owner: 'f009e100-0000-4000-8c00-000000000001',
  doctor: 'f009e100-0000-4000-8c00-000000000002',
  patientA: 'f009e100-0000-4000-8c00-000000000003',
  patientB: 'f009e100-0000-4000-8c00-000000000004',
  facility: 'f009e100-0000-4000-8d00-000000000001',
  schedule: 'f009e100-0000-4000-8e00-000000000001',
  patientRowA: 'f009e100-0000-4000-8f00-000000000001',
  patientRowB: 'f009e100-0000-4000-8f00-000000000002',
  license: 'f009e100-0000-4000-8a00-000000000010',
} as const;

function realDb(): Sql {
  if (!databaseName) throw new Error('SHIFAA_F009_DATABASE is required for the real T056 race');
  return postgres({
    host: dbHost,
    port: Number(dbPort),
    username: 'shifaa_owner',
    password: 'synthetic_owner_only',
    database: databaseName,
    max: 1,
  });
}

async function seedRealFixture(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      SELECT set_config('shifaa.person_id','${realIds.owner}',true), set_config('shifaa.environment','local',true), set_config('shifaa.test_now','2029-12-01T08:00:00Z',true);
      INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
        ('${realIds.owner}','f009e100-0000-4000-9c00-000000000001','F009 T056 owner','active'),
        ('${realIds.doctor}','f009e100-0000-4000-9c00-000000000002','F009 T056 doctor','active'),
        ('${realIds.patientA}','f009e100-0000-4000-9c00-000000000003','F009 T056 patient A','active'),
        ('${realIds.patientB}','f009e100-0000-4000-9c00-000000000004','F009 T056 patient B','active');
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES
        ('${realIds.patientRowA}','${realIds.patientA}','F009-T056-A','active'), ('${realIds.patientRowB}','${realIds.patientB}','F009-T056-B','active');
      INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
        VALUES ('${realIds.facility}','clinic','عيادة اختبار','T056 Synthetic Clinic','active','C','Cairo','T056','Synthetic address','${realIds.owner}');
      INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
        VALUES ('${realIds.license}','${realIds.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'T056 synthetic regulator','2099-12-31','verified');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,valid_from,membership_status,created_by_person_id)
        VALUES ('${realIds.facility}','${realIds.owner}','owner','2020-01-01','active','${realIds.owner}');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
        VALUES ('${realIds.facility}','${realIds.doctor}','doctor','${realIds.license}','2020-01-01','active','${realIds.owner}');
      INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
        VALUES ('${realIds.schedule}','${realIds.facility}','${realIds.doctor}','Africa/Cairo','2030-01-01','2030-01-31',30,35000,'EGP','active','${realIds.owner}','${realIds.owner}');
      INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
        VALUES ('${realIds.schedule}',2,'09:00','10:00');
    `);
  });
}

async function cleanRealFixture(sql: Sql): Promise<void> {
  const keyHashes = ['a', 'b'].map((suffix) =>
    idempotencyScopeHash('key', `f009-t056-race-${suffix}`),
  );
  await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL session_replication_role='replica'");
    await tx.unsafe(`
      DELETE FROM audit.events WHERE facility_id='${realIds.facility}';
      DELETE FROM platform.outbox_events WHERE aggregate_id IN (SELECT id FROM clinical.appointments WHERE facility_id='${realIds.facility}');
      DELETE FROM clinical.queue_entries WHERE facility_id='${realIds.facility}';
      DELETE FROM clinical.appointments WHERE facility_id='${realIds.facility}';
      DELETE FROM clinical.schedule_windows WHERE schedule_id='${realIds.schedule}';
      DELETE FROM clinical.schedules WHERE id='${realIds.schedule}';
      DELETE FROM identity.facility_memberships WHERE facility_id='${realIds.facility}';
      DELETE FROM identity.professional_licenses WHERE id='${realIds.license}';
      DELETE FROM identity.patients WHERE id IN ('${realIds.patientRowA}','${realIds.patientRowB}');
      DELETE FROM identity.facilities WHERE id='${realIds.facility}';
      DELETE FROM identity.people WHERE id IN ('${realIds.owner}','${realIds.doctor}','${realIds.patientA}','${realIds.patientB}');
    `);
    await tx`DELETE FROM platform.idempotency_records WHERE key_hash = ANY(${keyHashes})`;
  });
}

test(
  'AC-05 real serial PostgreSQL/API race has exactly one winner',
  { skip: !databaseName },
  async () => {
    const sql = realDb();
    const apiUrl = `postgresql://shifaa_api:synthetic_api_only@${dbHost}:${dbPort}/${databaseName}`;
    const identity = new PostgresIdentityRepository(apiUrl);
    let harness: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      await seedRealFixture(sql);
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
          databaseUrl: apiUrl,
          identityOnboardingEnabled: true,
          syntheticMode: true,
        },
        clinicSchedulingService: new ClinicSchedulingService({
          authorization: {
            authorize: async (actor, action, target) => ({
              action,
              facilityId: target.facilityId ?? realIds.facility,
              ...(target.doctorId ? { doctorId: target.doctorId } : {}),
              ...(target.patientId ? { patientId: target.patientId } : {}),
              facilityVerified: true,
              doctorLicenseVerified: true,
              relationship: actor.personId === realIds.owner ? 'owner' : 'self',
            }),
          },
          featureFlags: { enabled: async () => true },
          read: adapter,
          repository: adapter,
          clock: { now: () => new Date('2030-01-01T00:00:00Z') },
          cache: { get: async () => undefined, set: async () => undefined },
        }),
      });
      const payload = {
        patientId: realIds.patientA,
        facilityId: realIds.facility,
        doctorId: realIds.doctor,
        startsAt: '2030-01-07T07:00:00.000Z',
        endsAt: '2030-01-07T07:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        paymentMethod: 'cash_on_arrival',
      };
      const book = (suffix: string) =>
        harness!.app.inject({
          method: 'POST',
          url: '/v1/appointments',
          headers: {
            authorization: `Bearer synthetic-person:${realIds.patientA}`,
            'idempotency-key': `f009-t056-race-${suffix}`,
          },
          payload,
        });
      const outcomes = await Promise.all([book('a'), book('b')]);
      assert.equal(outcomes.filter((result) => result.statusCode < 300).length, 1);
      assert.equal(outcomes.filter((result) => result.statusCode >= 400).length, 1);
    } finally {
      await harness?.app.close();
      await identity.close();
      await cleanRealFixture(sql);
      await sql.end({ timeout: 5 });
    }
  },
);
