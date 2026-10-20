import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import postgres, { type Sql } from 'postgres';
import { chromium } from 'playwright/test';

import { buildApp } from '../services/api/src/app.ts';
import { loadConfig } from '../services/api/src/config.ts';
import { PostgresClinicSchedulingService } from '../services/api/src/adapters/postgres/clinic-scheduling-service.ts';
import { PostgresIdentityRepository } from '../services/api/src/adapters/postgres/identity-repository.ts';
import { ClinicSchedulingService } from '../services/api/src/modules/clinic-scheduling/service.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const reportPath = path.join(
  root,
  'specs/009-clinic-scheduling-appointments-queue/evidence/performance/report.md',
);
const apiOnlyDiagnostic = process.env.F009_PERF_API_ONLY === '1';
const samples = numberEnv('F009_PERF_SAMPLES', 24, 20, 100);
const warmupReadCount = 20;
const warmupMutationCount = 6;
const queueSize = 8;
const raceCount = 2;
const reorderContenders = 8;
const browserLcpCount = 6;
const browserInputCount = 12;
const target = { lcp: 3000, input: 200, read: 400, mutation: 800 };
const date = '2030-01-08'; // Tuesday; fixture uses the approved Africa/Cairo 09:00-15:00 schedule window.
const syntheticApiAddresses = new Set<string>();
const browserDiagnostics: {
  page_errors: string[];
  console_errors: string[];
  route_failures: Array<{ operation: string; error_class: string }>;
  route_requests: Record<string, number>;
  route_statuses: Record<string, Record<string, number>>;
  page_closed?: boolean;
  browser_disconnected?: boolean;
  input_failure?: Record<string, unknown>;
} = {
  page_errors: [],
  console_errors: [],
  route_failures: [],
  route_requests: {},
  route_statuses: {},
};
const startUtc = Date.parse(`${date}T07:00:00.000Z`);
const host = process.env.SHIFAA_PG_HOST ?? '127.0.0.1';
const port = numberEnv('SHIFAA_PG_PORT', 5432, 1, 65535);
let db = '';
let ownerUrl = '';
let apiUrl = '';
let runnerStage = 'database-provisioning';
let runnerFile: string | undefined;

const migrationFiles = [
  'infra/db/migrations/001_identity_onboarding.sql',
  'supabase/migrations/20260811000300_facility_onboarding_rbac.sql',
  'supabase/migrations/20260811000400_facility_onboarding_rbac_storage.sql',
  'supabase/migrations/20260811000500_family_care_relationships.sql',
  'supabase/migrations/20260811000600_family_care_storage.sql',
  'supabase/migrations/20260813000500_privacy_dsr_notifications.sql',
  'supabase/migrations/20260813000600_privacy_dsr_storage.sql',
  'supabase/migrations/20260820000600_discovery_sos_foundation.sql',
  'supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql',
  'supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql',
  'supabase/migrations/20260908000700_sec_007_function_execute_grants.sql',
  'supabase/migrations/20260908000800_sec_008_idempotency_privacy.sql',
  'supabase/migrations/20260912000900_clinic_scheduling_appointments_queue.sql',
  'supabase/migrations/20260923000100_f009_added_exception_overlap_guard.sql',
  'supabase/migrations/20260924000100_f009_patient_queue_delay_projection.sql',
];

class InconclusiveMeasurement extends Error {
  constructor(readonly measurement: 'patient-lcp' | 'input-response') {
    super();
  }
}

type Timed = { ms: number; status: number };
type Fixture = {
  run: string;
  owner: string;
  facility: string;
  doctors: {
    load: string;
    loadSecondary: string;
    warmup: string;
    bookingRace: string;
    rescheduleRace: string;
    queue: string;
    absence: string;
  };
  patients: string[];
  appointmentPatients: string[];
  appointmentDoctors: string[];
  appointmentSlots: Array<{ startsAt: string; endsAt: string }>;
};
type Outcome = {
  operation: string;
  status: number;
  ms: number;
};

const evidence: Record<string, any> = {
  task: 'T074',
  state: 'RUNNING',
  thresholds_ms: {
    patient_lcp_p95: target.lcp,
    input_response_p95: target.input,
    reads_p95: target.read,
    mutations_p95: target.mutation,
  },
  topology: {
    runner: `${process.platform}/${os.arch()}`,
    logical_cpus: os.cpus().length,
    memory_total_bytes: os.totalmem(),
    node: process.version,
    api: 'Feature 009 Fastify app with Postgres-backed identity and clinic scheduling adapters; API load uses Fastify app.inject',
    browser: 'local Expo web app + headless Chromium on loopback; not device/network acceptance',
    postgres_endpoint: `${host}:${port}/isolated shifaa_test_t074_perf_*`,
  },
  profile: {
    synthetic_only: true,
    date,
    measured_booking_sessions: samples,
    warmup_reads: warmupReadCount,
    warmup_create_cancel_pairs: warmupMutationCount,
    api_pool_configured_connections: 20,
    booking_race_contenders: raceCount,
    reschedule_race_contenders: raceCount,
    queue_waiting_entries: queueSize,
    queue_reorder_contenders: reorderContenders,
    browser_warmup_navigations: 1,
    browser_lcp_navigations: browserLcpCount,
    browser_input_search_interactions: browserInputCount,
    api_synthetic_remote_address_cardinality: 0,
    api_synthetic_remote_address_range:
      '10.253.0.x and following RFC1918 /24 subnets; simulated by Fastify app.inject',
    database_migration_provenance: {
      chain: 'tools/run-clinic-scheduling-restore-test.mjs migration order',
      ordered_migrations: migrationFiles,
      schema_fixture: 'infra/db/tests/clinic-scheduling-schema.sql',
    },
  },
  measurements: {},
  errors: { unexpected_http_statuses: 0, exceptions: 0, unexpected: [], server_errors: [] },
  contention: {},
  limitations: [
    'API app.inject excludes network, proxy, and TLS latency; this is local application/database evidence.',
    'API app.inject remoteAddress values are simulated per-client RFC1918 identities to exercise the existing per-network limiter; no real IP traffic is generated. Browser requests use a separate single loopback client profile.',
    'Headless Chromium on this runner is not a physical-device, constrained-network, or formal accessibility-performance profile.',
    'Chromium Event Timing uses a 16 ms duration threshold; shorter input events are omitted and are not represented in the input-response percentile.',
    'OPEN-TECH-003 remains OPEN; this result does not approve production/device/network use.',
    'Production SMS remains disabled under OPEN-VENDOR-002.',
  ],
};

function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} through ${max}.`);
  return value;
}
function p95(values: number[]): number {
  if (!values.length) return Number.NaN;
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
}
function percentile(values: number[], fraction: number): number {
  if (!values.length) return Number.NaN;
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
}
function summary(values: number[]) {
  return {
    samples: values.length,
    p50_ms: Number(percentile(values, 0.5).toFixed(2)),
    p95_ms: Number(p95(values).toFixed(2)),
    p99_ms: Number(percentile(values, 0.99).toFixed(2)),
    min_ms: Number(Math.min(...values).toFixed(2)),
    max_ms: Number(Math.max(...values).toFixed(2)),
  };
}
function timings(values: Timed[]) {
  return summary(values.map((item) => item.ms));
}
function statusCounts(values: Array<{ status: number }>) {
  return Object.fromEntries(
    [...new Set(values.map((item) => item.status))]
      .sort()
      .map((status) => [status, values.filter((item) => item.status === status).length]),
  );
}
function timeSlot(index: number) {
  const start = new Date(startUtc + index * 30 * 60_000);
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
  };
}
function syntheticRemoteAddress(index: number) {
  const octet = (index % 254) + 1;
  const subnet = Math.floor(index / 254) % 254;
  const address = `10.253.${subnet}.${octet}`;
  syntheticApiAddresses.add(address);
  return address;
}
function safeOperation(method: unknown, rawUrl: unknown) {
  const pathOnly = String(rawUrl ?? '(unknown route)').split('?')[0]!;
  const safePath = pathOnly.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    '{uuid}',
  );
  return `${String(method ?? 'GET')} ${safePath}`;
}
function browserErrorClass(error: unknown): string {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
  if (message.includes('browser-api-origin-mismatch')) return 'browser-api-origin-mismatch';
  const net = message.match(/net::(ERR_[A-Z0-9_]+)/i);
  if (net) return net[1]!.toUpperCase();
  const socket = message.match(/\b(ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|ENOTFOUND)\b/);
  if (socket) return socket[1]!;
  if (/route\.fetch/i.test(message)) return 'route-fetch-failure';
  if (/execution context was destroyed|most likely because of a navigation/i.test(message))
    return 'execution-context-destroyed';
  if (/cannot find context|frame was detached/i.test(message)) return 'browser-context-detached';
  if (/timeout|timed out/i.test(message)) return 'playwright-timeout';
  if (/target page, context or browser has been closed/i.test(message)) return 'page-closed';
  return 'playwright-error';
}
function safeResponseCode(response: any): string | undefined {
  try {
    const body = response.json() as {
      code?: unknown;
      error?: { code?: unknown };
      errorCode?: unknown;
    };
    const candidate = body?.error?.code ?? body?.code ?? body?.errorCode;
    return typeof candidate === 'string' &&
      (/^[a-z][a-z0-9_-]{0,63}$/i.test(candidate) || /^[0-9A-Z]{5}$/.test(candidate))
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}
function applySqlFile(database: string, file: string) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-q',
      '-U',
      'shifaa_owner',
      '-d',
      database,
      '-f',
      `/workspace/${file}`,
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) {
    const failure = new Error();
    Object.assign(failure, {
      cause: result.error,
      code: (result.error as NodeJS.ErrnoException).code,
    });
    throw failure;
  }
  if (result.status !== 0) {
    const failure = new Error();
    const sqlstate = (result.stderr ?? '').match(/\b([0-9A-Z]{5})\b/);
    Object.assign(failure, {
      code: 'psql-exit',
      exitStatus: result.status,
      ...(sqlstate ? { sqlstate: sqlstate[1] } : {}),
    });
    throw failure;
  }
}
function auth(person: string, key: string, version?: number) {
  return {
    authorization: `Bearer synthetic-person:${person}`,
    'idempotency-key': key,
    ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
  };
}
function safeErrorCount() {
  evidence.errors.unexpected_http_statuses += 1;
}

async function makeFixture(owner: Sql): Promise<Fixture> {
  const run = randomUUID().replaceAll('-', '');
  const f: Fixture = {
    run,
    owner: randomUUID(),
    facility: randomUUID(),
    doctors: {
      load: randomUUID(),
      loadSecondary: randomUUID(),
      warmup: randomUUID(),
      bookingRace: randomUUID(),
      rescheduleRace: randomUUID(),
      queue: randomUUID(),
      absence: randomUUID(),
    },
    patients: Array.from({ length: samples + warmupMutationCount + queueSize + 8 }, () =>
      randomUUID(),
    ),
    appointmentPatients: [],
    appointmentDoctors: [],
    appointmentSlots: [],
  };
  const people = [f.owner, ...Object.values(f.doctors), ...f.patients];
  const users = people.map(() => randomUUID());
  const schedules = Object.values(f.doctors).map(() => randomUUID());
  const scheduleByDoctor = new Map(
    Object.values(f.doctors).map((id, index) => [id, schedules[index]!]),
  );
  await owner.begin(async (tx) => {
    await tx`select set_config('shifaa.person_id',${f.owner},true),set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2030-01-01T00:00:00Z',true)`;
    const doctorIds = new Set(Object.values(f.doctors));
    await tx.unsafe(
      `insert into identity.people(id,user_id,display_name,profile_status,preferred_locale) values ${people.map((id, i) => `('${id}'::uuid,'${users[i]}'::uuid,'Synthetic performance ${doctorIds.has(id) ? 'doctor' : 'person'} ${i}','active','en-EG')`).join(',')}`,
    );
    await tx.unsafe(
      `insert into identity.patients(id,person_id,medical_record_number,record_status) values ${f.patients.map((id, i) => `('${randomUUID()}'::uuid,'${id}'::uuid,'F009-PERF-${run}-${i}','active')`).join(',')}`,
    );
    await tx`insert into identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
      values (${f.facility},'clinic','عيادة اصطناعية','Synthetic performance clinic','active','C','Cairo','Synthetic','Synthetic performance fixture',${f.owner})`;
    const licenseRows = Object.values(f.doctors).map((person) => ({
      person,
      license: randomUUID(),
      ciphertext: randomBytes(16).toString('hex'),
      hash: randomBytes(32).toString('hex'),
    }));
    await tx.unsafe(`insert into identity.professional_licenses(id,person_id,profession,specialty_code,number_ciphertext,number_hash,issuer,expires_on,status,reviewed_by_person_id,reviewed_at)
      values ${licenseRows.map((row) => `('${row.license}'::uuid,'${row.person}'::uuid,'doctor','General practice',decode('${row.ciphertext}','hex'),decode('${row.hash}','hex'),'Synthetic fixture','2099-12-31','verified','${f.owner}'::uuid,'2030-01-01T00:00:00Z')`).join(',')}`);
    const licenseByDoctor = new Map(licenseRows.map((row) => [row.person, row.license]));
    await tx.unsafe(`insert into identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
      values ('${f.facility}'::uuid,'${f.owner}'::uuid,'owner',null,'2020-01-01T00:00:00Z','active','${f.owner}'::uuid),${Object.values(
        f.doctors,
      )
        .map(
          (person) =>
            `('${f.facility}'::uuid,'${person}'::uuid,'doctor','${licenseByDoctor.get(person)}'::uuid,'2020-01-01T00:00:00Z','active','${f.owner}'::uuid)`,
        )
        .join(',')}`);
    await tx.unsafe(`insert into clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
      values ${Object.values(f.doctors)
        .map(
          (person) =>
            `('${scheduleByDoctor.get(person)}'::uuid,'${f.facility}'::uuid,'${person}'::uuid,'Africa/Cairo','2030-01-01','2030-01-31',30,10000,'EGP','active','${f.owner}'::uuid,'${f.owner}'::uuid)`,
        )
        .join(',')}`);
    await tx.unsafe(
      `insert into clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) values ${schedules.map((id) => `('${id}'::uuid,2,'09:00','15:00')`).join(',')}`,
    );
  });
  f.appointmentPatients = f.patients.slice(0, samples);
  f.appointmentSlots = Array.from({ length: samples }, (_, index) => timeSlot(index % 12));
  f.appointmentDoctors = Array.from({ length: samples }, (_, index) =>
    index < 12 ? f.doctors.load : f.doctors.loadSecondary,
  );
  return f;
}

async function makeApp(f: Fixture) {
  const identity = new PostgresIdentityRepository(apiUrl);
  await identity.ready();
  const adapter = new PostgresClinicSchedulingService(
    { withRawTransaction: (work) => identity.withRawTransaction(work) },
    'local',
  );
  const service = new ClinicSchedulingService({
    authorization: {
      authorize: async (actor, action, target) => ({
        action,
        facilityId: target.facilityId ?? f.facility,
        ...(target.doctorId ? { doctorId: target.doctorId } : {}),
        ...(target.patientId ? { patientId: target.patientId } : {}),
        facilityVerified: true,
        doctorLicenseVerified: true,
        relationship: actor.personId === f.owner ? 'owner' : 'self',
      }),
    },
    featureFlags: { enabled: async () => true },
    read: adapter,
    repository: adapter,
    clock: { now: () => new Date('2030-01-01T00:00:00.000Z') },
    cache: { get: async () => undefined, set: async () => undefined },
  });
  const config = loadConfig({ NODE_ENV: 'test' });
  const app = await buildApp({
    config: { ...config, databaseUrl: apiUrl, repositoryAdapter: 'postgres', syntheticMode: true },
    clinicSchedulingService: service,
    clock: { now: () => new Date('2030-01-01T00:00:00.000Z') },
  });
  app.app.addHook('onError', async (request: any, reply: any, error: unknown) => {
    const value =
      error && typeof error === 'object'
        ? (error as {
            code?: unknown;
            status?: unknown;
            statusCode?: unknown;
            cause?: { code?: unknown };
          })
        : {};
    const sqlstate = [value.code, value.cause?.code].find(
      (code) => typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code),
    );
    const applicationCode = [value.code, value.cause?.code].find(
      (code) => typeof code === 'string' && /^[a-z][a-z0-9_-]{0,63}$/i.test(code),
    );
    const status =
      typeof value.status === 'number'
        ? value.status
        : typeof value.statusCode === 'number'
          ? value.statusCode
          : reply.statusCode || 500;
    if (status >= 500) {
      (evidence.errors.server_errors as Array<Record<string, unknown>>).push({
        operation: safeOperation(request.method, request.routeOptions?.url ?? request.url),
        status,
        ...(sqlstate === undefined ? {} : { sqlstate }),
        ...(applicationCode === undefined ? {} : { application_code: applicationCode }),
      });
    }
  });
  return { app, identity };
}

async function timed(
  app: any,
  request: Record<string, unknown>,
  accepted: number[] = [200],
  continueOnUnexpected = false,
): Promise<Timed> {
  const began = performance.now();
  const response = await app.inject(request);
  const result = { ms: performance.now() - began, status: response.statusCode };
  if (!accepted.includes(result.status)) {
    safeErrorCount();
    const operation = safeOperation(request.method, request.url);
    const responseCode = result.status >= 500 ? safeResponseCode(response) : undefined;
    const detail = {
      operation,
      status: result.status,
      elapsed_ms: Number(result.ms.toFixed(2)),
      ...(responseCode === undefined ? {} : { response_code: responseCode }),
    };
    (evidence.errors as Record<string, unknown>).last_unexpected = detail;
    (evidence.errors.unexpected as Array<typeof detail>).push(detail);
    if (!continueOnUnexpected)
      throw new Error(`Unexpected ${result.status} during ${operation}; response body withheld.`);
  }
  return result;
}

async function seedWarmup(app: any, f: Fixture) {
  const requests = Array.from({ length: warmupReadCount }, (_, i) =>
    app.inject(
      i % 2
        ? {
            method: 'GET',
            url: `/v1/clinics/${f.facility}/doctors/${f.doctors.load}/availability?fromDate=${date}&toDate=${date}`,
            remoteAddress: syntheticRemoteAddress(i),
          }
        : {
            method: 'GET',
            url: `/v1/discovery/doctors?specialty=General%20practice&date=${date}`,
            remoteAddress: syntheticRemoteAddress(i),
          },
    ),
  );
  for (const result of await Promise.all(requests))
    assert.equal(result.statusCode, 200, `read warm-up returned ${result.statusCode}`);
  for (let i = 0; i < warmupMutationCount; i += 1) {
    const patient = f.patients[samples + i]!;
    const book = await app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: auth(patient, `f009-perf-${f.run}-warmup-book-${i}`),
      remoteAddress: syntheticRemoteAddress(samples + i),
      payload: {
        patientId: patient,
        facilityId: f.facility,
        doctorId: f.doctors.warmup,
        ...timeSlot(i),
        timezone: 'Africa/Cairo',
        civilDate: date,
        paymentMethod: 'cash_on_arrival',
      },
    });
    assert.equal(book.statusCode, 201, `mutation warm-up create returned ${book.statusCode}`);
    const cancel = await app.inject({
      method: 'POST',
      url: `/v1/appointments/${book.json().id}/cancel`,
      headers: auth(patient, `f009-perf-${f.run}-warmup-cancel-${i}`, 1),
      remoteAddress: syntheticRemoteAddress(samples + i),
      payload: { reason: 'Synthetic performance warm-up cancellation' },
    });
    assert.equal(cancel.statusCode, 200, `mutation warm-up cancel returned ${cancel.statusCode}`);
  }
}

async function runApi(app: any, f: Fixture, owner: Sql) {
  const read: Timed[] = [];
  const readByOperation: Record<string, Timed[]> = {
    discovery: [],
    availability: [],
    appointment: [],
    appointment_list: [],
    queue: [],
  };
  const mutation: Timed[] = [];
  const mutationByOperation: Record<string, Timed[]> = {
    booking: [],
    check_in: [],
    reorder: [],
    delay: [],
    absence: [],
    booking_race: [],
    reschedule_race: [],
  };
  const publishMeasurements = () => {
    evidence.measurements = {
      reads: timings(read),
      reads_by_operation: Object.fromEntries(
        Object.entries(readByOperation).map(([name, values]) => [name, timings(values)]),
      ),
      mutations: timings(mutation),
      mutations_by_operation: Object.fromEntries(
        Object.entries(mutationByOperation).map(([name, values]) => [name, timings(values)]),
      ),
    };
  };
  const ids: string[] = [];
  const creates = await Promise.all(
    f.appointmentPatients.map(async (person, i) => {
      const result = await timed(
        app,
        {
          method: 'POST',
          url: '/v1/appointments',
          headers: auth(person, `f009-perf-${f.run}-create-${i}`),
          remoteAddress: syntheticRemoteAddress(i),
          payload: {
            patientId: person,
            facilityId: f.facility,
            doctorId: f.appointmentDoctors[i],
            ...f.appointmentSlots[i],
            timezone: 'Africa/Cairo',
            civilDate: date,
            paymentMethod: 'cash_on_arrival',
          },
        },
        [201],
      );
      mutation.push(result);
      mutationByOperation.booking.push(result);
      const list = await app.inject({
        method: 'GET',
        url: `/v1/appointments?patientId=${person}`,
        headers: { authorization: `Bearer synthetic-person:${person}` },
      });
      assert.equal(list.statusCode, 200);
      ids[i] = String(list.json().items[0].id);
    }),
  );
  void creates;
  publishMeasurements();
  const reads = await Promise.all(
    f.appointmentPatients
      .flatMap(
        (person, i) =>
          [
            [
              'discovery',
              {
                method: 'GET',
                url: `/v1/discovery/doctors?specialty=General%20practice&date=${date}`,
                remoteAddress: syntheticRemoteAddress(i),
              },
            ],
            [
              'availability',
              {
                method: 'GET',
                url: `/v1/clinics/${f.facility}/doctors/${f.appointmentDoctors[i]}/availability?fromDate=${date}&toDate=${date}`,
                remoteAddress: syntheticRemoteAddress(i),
              },
            ],
            [
              'appointment',
              {
                method: 'GET',
                url: `/v1/appointments/${ids[i]}`,
                remoteAddress: syntheticRemoteAddress(i),
                headers: { authorization: `Bearer synthetic-person:${person}` },
              },
            ],
            [
              'appointment_list',
              {
                method: 'GET',
                url: `/v1/appointments?patientId=${person}`,
                remoteAddress: syntheticRemoteAddress(i),
                headers: { authorization: `Bearer synthetic-person:${person}` },
              },
            ],
          ] as Array<[string, Record<string, unknown>]>,
      )
      .map(async ([name, request]) => {
        const result = await timed(app, request);
        read.push(result);
        readByOperation[name]!.push(result);
      }),
  );
  void reads;
  publishMeasurements();

  const racePeople = f.patients.slice(
    samples + warmupMutationCount + queueSize,
    samples + warmupMutationCount + queueSize + raceCount,
  );
  const bookingRace = await Promise.all(
    racePeople.map(async (person, i) => {
      const result = await timed(
        app,
        {
          method: 'POST',
          url: '/v1/appointments',
          headers: auth(person, `f009-perf-${f.run}-booking-race-${i}`),
          remoteAddress: syntheticRemoteAddress(samples + warmupMutationCount + queueSize + i),
          payload: {
            patientId: person,
            facilityId: f.facility,
            doctorId: f.doctors.bookingRace,
            ...timeSlot(0),
            timezone: 'Africa/Cairo',
            civilDate: date,
            paymentMethod: 'cash_on_arrival',
          },
        },
        [201, 409, 412],
        true,
      );
      mutation.push(result);
      mutationByOperation.booking_race.push(result);
      return result;
    }),
  );
  publishMeasurements();

  const reschedulePeople = f.patients.slice(
    samples + warmupMutationCount + queueSize + raceCount,
    samples + warmupMutationCount + queueSize + raceCount + raceCount,
  );
  const rescheduleIds = await Promise.all(
    reschedulePeople.map(async (person, i) => {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/appointments',
        headers: auth(person, `f009-perf-${f.run}-reschedule-source-${i}`),
        remoteAddress: syntheticRemoteAddress(
          samples + warmupMutationCount + queueSize + raceCount + i,
        ),
        payload: {
          patientId: person,
          facilityId: f.facility,
          doctorId: f.doctors.rescheduleRace,
          ...timeSlot(i),
          timezone: 'Africa/Cairo',
          civilDate: date,
          paymentMethod: 'cash_on_arrival',
        },
      });
      assert.equal(r.statusCode, 201, `reschedule setup returned ${r.statusCode}`);
      return String(r.json().id);
    }),
  );
  const rescheduleRace = await Promise.all(
    rescheduleIds.map(async (appointmentId, i) => {
      const result = await timed(
        app,
        {
          method: 'POST',
          url: `/v1/appointments/${appointmentId}/reschedule`,
          headers: auth(reschedulePeople[i]!, `f009-perf-${f.run}-reschedule-race-${i}`, 1),
          remoteAddress: syntheticRemoteAddress(
            samples + warmupMutationCount + queueSize + raceCount + i,
          ),
          payload: {
            ...timeSlot(2),
            timezone: 'Africa/Cairo',
            civilDate: date,
            reason: 'Synthetic concurrent replacement-slot race',
          },
        },
        [200, 409, 412],
        true,
      );
      mutation.push(result);
      mutationByOperation.reschedule_race.push(result);
      return result;
    }),
  );
  publishMeasurements();

  const queuePeople = f.patients.slice(
    samples + warmupMutationCount,
    samples + warmupMutationCount + queueSize,
  );
  const queueIds: string[] = [];
  for (let i = 0; i < queuePeople.length; i += 1) {
    const booked = await app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: auth(queuePeople[i]!, `f009-perf-${f.run}-queue-book-${i}`),
      remoteAddress: syntheticRemoteAddress(samples + warmupMutationCount + i),
      payload: {
        patientId: queuePeople[i],
        facilityId: f.facility,
        doctorId: f.doctors.queue,
        ...timeSlot(i),
        timezone: 'Africa/Cairo',
        civilDate: date,
        paymentMethod: 'cash_on_arrival',
      },
    });
    assert.equal(booked.statusCode, 201, `queue setup booking returned ${booked.statusCode}`);
    queueIds.push(String(booked.json().id));
  }
  const checkins = await Promise.all(
    queueIds.map(async (id, i) => {
      const result = await timed(app, {
        method: 'POST',
        url: `/v1/appointments/${id}/check-in`,
        headers: auth(queuePeople[i]!, `f009-perf-${f.run}-check-in-${i}`, 1),
        remoteAddress: syntheticRemoteAddress(samples + warmupMutationCount + i),
      });
      mutation.push(result);
      mutationByOperation.check_in.push(result);
    }),
  );
  void checkins;
  const rows = await owner<{ id: string; version: number; queue_version: number }[]>`
    select q.id::text,q.version::int,s.version::int queue_version from clinical.queue_entries q join clinical.queue_scopes s on s.id=q.queue_scope_id
    where q.facility_id=${f.facility}::uuid and q.doctor_person_id=${f.doctors.queue}::uuid and q.civil_date=${date}::date and q.state='waiting' order by q.waiting_order`;
  assert.equal(rows.length, queueSize, 'queue fixture count mismatch');
  const target = rows.at(-1)!;
  const reorderRace = await Promise.all(
    Array.from({ length: reorderContenders }, async (_, i) => {
      const result = await timed(
        app,
        {
          method: 'POST',
          url: `/v1/queue-entries/${target.id}/reorder`,
          headers: auth(f.owner, `f009-perf-${f.run}-reorder-${i}`, target.version),
          remoteAddress: syntheticRemoteAddress(
            samples + warmupMutationCount + queueSize + raceCount * 2 + i,
          ),
          payload: {
            targetPosition: 1,
            queueVersion: target.queue_version,
            reason: 'Synthetic queue contention profile',
          },
        },
        [200, 409, 412],
        true,
      );
      mutation.push(result);
      mutationByOperation.reorder.push(result);
      return result;
    }),
  );
  publishMeasurements();

  for (const action of [
    {
      name: 'delay',
      doctor: f.doctors.queue,
      suffix: 'delay',
      payload: {
        civilDate: date,
        delayMinutes: 15,
        templateCode: 'F009_DELAY_CANDIDATE',
        reason: 'Synthetic performance delay',
      },
    },
    {
      name: 'absence',
      doctor: f.doctors.absence,
      suffix: 'absence',
      payload: { ...timeSlot(0), civilDate: date, reason: 'Synthetic performance absence' },
    },
  ]) {
    const result = await timed(app, {
      method: 'POST',
      url: `/v1/clinics/${f.facility}/doctors/${action.doctor}/${action.suffix}`,
      headers: auth(f.owner, `f009-perf-${f.run}-${action.name}`),
      remoteAddress: syntheticRemoteAddress(
        samples +
          warmupMutationCount +
          queueSize +
          raceCount * 2 +
          reorderContenders +
          (action.name === 'delay' ? 0 : 1),
      ),
      payload: action.payload,
    });
    mutation.push(result);
    mutationByOperation[action.name]!.push(result);
  }
  const queueReads = await Promise.all(
    Array.from({ length: queueSize }, async () => {
      const result = await timed(app, {
        method: 'GET',
        url: `/v1/clinics/${f.facility}/queues?doctorId=${f.doctors.queue}&date=${date}`,
        remoteAddress: syntheticRemoteAddress(
          samples + warmupMutationCount + queueSize + raceCount * 2 + reorderContenders + 10,
        ),
        headers: { authorization: `Bearer synthetic-person:${f.owner}` },
      });
      read.push(result);
      readByOperation.queue!.push(result);
    }),
  );
  void queueReads;
  const [locks] = await owner<{ api_sessions: number; waiting_locks: number }[]>`
    select (select count(*)::int from pg_stat_activity where datname=current_database() and usename='shifaa_api') api_sessions,
      (select count(*)::int from pg_locks where not granted) waiting_locks`;
  evidence.contention = {
    booking_race: {
      contenders: raceCount,
      winners: bookingRace.filter((x) => x.status === 201).length,
      expected_conflicts: bookingRace.filter((x) => [409, 412].includes(x.status)).length,
      statuses: statusCounts(bookingRace),
      latency_ms: bookingRace.map((x) => Number(x.ms.toFixed(2))),
    },
    reschedule_race: {
      contenders: raceCount,
      winners: rescheduleRace.filter((x) => x.status === 200).length,
      expected_conflicts: rescheduleRace.filter((x) => [409, 412].includes(x.status)).length,
      statuses: statusCounts(rescheduleRace),
      latency_ms: rescheduleRace.map((x) => Number(x.ms.toFixed(2))),
    },
    queue_reorder: {
      contenders: reorderContenders,
      waiting_entries: rows.length,
      winners: reorderRace.filter((x) => x.status === 200).length,
      expected_conflicts: reorderRace.filter((x) => [409, 412].includes(x.status)).length,
      statuses: statusCounts(reorderRace),
      latency_ms: reorderRace.map((x) => Number(x.ms.toFixed(2))),
    },
    post_run_snapshot: locks,
  };
  evidence.measurements = {
    reads: timings(read),
    reads_by_operation: Object.fromEntries(
      Object.entries(readByOperation).map(([name, values]) => [name, timings(values)]),
    ),
    mutations: timings(mutation),
    mutations_by_operation: Object.fromEntries(
      Object.entries(mutationByOperation).map(([name, values]) => [name, timings(values)]),
    ),
  };
}

async function freePort(): Promise<number> {
  const net = await import('node:net');
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const value = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return value;
}

async function browserProfile(apiOrigin: string) {
  runnerStage = 'expo-startup';
  const webPort = await freePort();
  const expoOrigin = `http://127.0.0.1:${webPort}`;
  const command = `corepack pnpm --filter @shifaa/patient exec expo start --web --port ${webPort} --clear`;
  const server = spawn(
    process.platform === 'win32' ? 'cmd.exe' : 'sh',
    process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_API_BASE_URL: expoOrigin,
      },
    },
  );
  let output = '';
  const collect = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-8000);
  };
  server.stdout?.on('data', collect);
  server.stderr?.on('data', collect);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    runnerStage = 'chromium-launch';
    browser = await chromium.launch({ headless: true });
    const url = `${expoOrigin}/discover`;
    runnerStage = 'expo-readiness';
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null)
        throw new Error(`Expo exited (${server.exitCode}): ${output.slice(-1200)}`);
      try {
        if ((await fetch(`http://127.0.0.1:${webPort}`)).ok) break;
      } catch {
        /* wait for Expo */
      }
      await delay(500);
    }
    runnerStage = 'browser-context';
    const context = await browser.newContext({
      viewport: { width: 1365, height: 768 },
      locale: 'en-EG',
    });
    context.on('close', () => {
      browserDiagnostics.page_closed = true;
    });
    await context.addInitScript(() => {
      localStorage.setItem('shifaa.patient.locale', 'en-EG');
      const win = window as Window & {
        __perf?: { lcp: number[]; events: Array<{ name: string; duration: number }> };
      };
      win.__perf = { lcp: [], events: [] };
      try {
        new PerformanceObserver((list) =>
          list.getEntries().forEach((entry) => win.__perf?.lcp.push(entry.startTime)),
        ).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) =>
          list.getEntries().forEach((raw) => {
            const entry = raw as PerformanceEventTiming;
            win.__perf?.events.push({ name: entry.name, duration: entry.duration });
          }),
        ).observe({
          type: 'event',
          buffered: true,
          durationThreshold: 16,
        } as PerformanceObserverInit);
      } catch {
        win.__perf = { lcp: [], events: [] };
      }
    });
    const page = await context.newPage();
    page.on('close', () => {
      browserDiagnostics.page_closed = true;
    });
    browser.on('disconnected', () => {
      browserDiagnostics.browser_disconnected = true;
    });
    page.on('pageerror', (error) => {
      if (browserDiagnostics.page_errors.length < 8)
        browserDiagnostics.page_errors.push(browserErrorClass(error));
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && browserDiagnostics.console_errors.length < 8)
        browserDiagnostics.console_errors.push(browserErrorClass(message.text()));
    });
    page.on('requestfailed', (request) => {
      if (browserDiagnostics.route_failures.length < 8) {
        browserDiagnostics.route_failures.push({
          operation: safeOperation(request.method(), request.url()),
          error_class: browserErrorClass(request.failure()?.errorText ?? ''),
        });
      }
    });
    runnerStage = 'browser-api-proxy';
    await page.route(`${expoOrigin}/v1/**`, async (route) => {
      const originalUrl = route.request().url();
      const operation = safeOperation(route.request().method(), originalUrl);
      browserDiagnostics.route_requests[operation] =
        (browserDiagnostics.route_requests[operation] ?? 0) + 1;
      const upstreamUrl = `${apiOrigin}${originalUrl.slice(expoOrigin.length)}`;
      try {
        const upstream = await route.fetch({ url: upstreamUrl });
        const statusKey = String(upstream.status());
        const statuses = (browserDiagnostics.route_statuses[operation] ??= {});
        statuses[statusKey] = (statuses[statusKey] ?? 0) + 1;
        await route.fulfill({ response: upstream });
      } catch (error) {
        if (browserDiagnostics.route_failures.length < 8) {
          browserDiagnostics.route_failures.push({
            operation: safeOperation(route.request().method(), originalUrl),
            error_class: browserErrorClass(error),
          });
        }
        throw error;
      }
    });
    const nav = async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page
        .getByRole('textbox', { name: /specialty|التخصص/i })
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(200);
      return page.evaluate(
        () => (window as Window & { __perf?: { lcp: number[] } }).__perf?.lcp.at(-1) ?? null,
      );
    };
    runnerStage = 'browser-navigation';
    await nav(); // compile/cache warm-up excluded
    const lcp: number[] = [];
    runnerStage = 'browser-lcp-sampling';
    for (let i = 0; i < browserLcpCount; i += 1) {
      const value = await nav();
      if (value === null) throw new InconclusiveMeasurement('patient-lcp');
      lcp.push(value);
    }
    const field = page.getByRole('textbox', { name: /specialty|التخصص/i }).first();
    const dateField = page.getByRole('textbox', { name: /date|التاريخ/i }).first();
    const button = page.getByRole('button', { name: /search doctors|بحث الأطباء/i }).last();
    const inputEvents: number[] = [];
    const eventCounts: Record<string, number> = {};
    const searchMs: number[] = [];
    runnerStage = 'browser-input-sampling';
    await dateField.fill(date);
    for (let i = 0; i < browserInputCount; i += 1) {
      let step = 'event-offset';
      try {
        const offset = await page.evaluate(
          () => (window as Window & { __perf?: { events: unknown[] } }).__perf?.events.length ?? 0,
        );
        step = 'interaction-clock';
        const start = await page.evaluate(() => window.performance.now());
        step = 'clear-specialty';
        await field.fill('');
        step = 'type-specialty';
        await field.pressSequentially('General practice');
        step = 'click-search';
        await button.click();
        step = 'wait-for-doctor-result';
        await page
          .getByText(/Synthetic performance doctor/i)
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        step = 'search-duration';
        searchMs.push(await page.evaluate((startAt) => window.performance.now() - startAt, start));
        step = 'event-samples';
        const events = await page.evaluate(
          (from) =>
            (
              window as Window & { __perf?: { events: Array<{ name: string; duration: number }> } }
            ).__perf?.events.slice(from) ?? [],
          offset,
        );
        for (const event of events) {
          eventCounts[event.name] = (eventCounts[event.name] ?? 0) + 1;
          if (event.name === 'input') inputEvents.push(event.duration);
        }
      } catch (error) {
        const visibleRoles = await page
          .evaluate(() => {
            const visible = (element: Element) => element.getClientRects().length > 0;
            return {
              title: document.title,
              path: window.location.pathname,
              textboxes: Array.from(document.querySelectorAll('input,textarea,[role="textbox"]'))
                .filter(visible)
                .map((element) => {
                  const input = element as HTMLInputElement;
                  return (
                    input.getAttribute('aria-label') ||
                    input.labels?.[0]?.innerText ||
                    input.getAttribute('placeholder') ||
                    'unlabeled'
                  );
                })
                .slice(0, 8),
              buttons: Array.from(document.querySelectorAll('button,[role="button"]'))
                .filter(visible)
                .map((element) =>
                  (element.getAttribute('aria-label') || element.textContent || '')
                    .trim()
                    .slice(0, 80),
                )
                .slice(0, 12),
              doctor_result_count: Array.from(document.querySelectorAll('body *')).filter(
                (element) =>
                  element.children.length === 0 &&
                  /Synthetic performance doctor/i.test(element.textContent ?? '') &&
                  visible(element),
              ).length,
            };
          })
          .catch(() => ({ page_unavailable: true }));
        browserDiagnostics.input_failure = {
          step,
          error_class: browserErrorClass(error),
          page_closed: page.isClosed(),
          browser_connected: browser?.isConnected() ?? false,
          visible_roles: visibleRoles,
        };
        throw error;
      }
    }
    if (!inputEvents.length) throw new InconclusiveMeasurement('input-response');
    await context.close();
    return {
      browser: browser.version(),
      viewport: { width: 1365, height: 768 },
      lcp,
      inputEvents,
      searchMs,
      eventCounts,
    };
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      if (process.platform === 'win32' && server.pid) {
        await new Promise<void>((resolve) => {
          const killer = spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], {
            windowsHide: true,
            stdio: 'ignore',
          });
          killer.once('error', () => resolve());
          killer.once('close', () => resolve());
        });
      } else {
        server.kill();
        await new Promise<void>((resolve) => server.once('close', () => resolve()));
      }
    }
  }
}

function metric(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : 'INCONCLUSIVE (no sample)';
}
function decision(value: number, limit: number) {
  return !Number.isFinite(value) ? 'INCONCLUSIVE' : value <= limit ? 'PASS' : 'FAIL';
}
function safeFailure(error: unknown) {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const constructorName =
    typeof value.constructor === 'function' ? value.constructor.name : 'unknown';
  const rawCode = typeof value.code === 'string' ? value.code : undefined;
  const sqlstate = [value.sqlstate, rawCode].find(
    (candidate) => typeof candidate === 'string' && /^[0-9A-Z]{5}$/.test(candidate),
  );
  const code =
    rawCode && /^[A-Za-z0-9_-]{1,48}$/.test(rawCode) && !/^[0-9A-Z]{5}$/.test(rawCode)
      ? rawCode
      : undefined;
  return {
    stage: runnerStage,
    exception_type: /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(constructorName)
      ? constructorName
      : 'unknown',
    ...(code ? { code } : {}),
    ...(sqlstate ? { sqlstate } : {}),
    ...(runnerFile ? { file: runnerFile } : {}),
    ...(Number.isInteger(value.exitStatus) ? { exit_status: value.exitStatus } : {}),
    ...(error instanceof InconclusiveMeasurement ? { measurement: error.measurement } : {}),
    ...(runnerStage.includes('browser') ||
    runnerStage.startsWith('expo-') ||
    runnerStage === 'chromium-launch'
      ? { browser_diagnostics: browserDiagnostics }
      : {}),
  };
}
function render(outcome: string, failure?: Record<string, unknown>) {
  const m = evidence.measurements as Record<string, any>;
  const b = m.browser as any;
  return `# Feature 009 synthetic performance profile (T074)\n\n- **Run:** ${evidence.generated_at ?? 'not completed'}\n- **Outcome:** **${outcome}**\n- **Fixture:** run-scoped synthetic people/patients, one clinic, seven verified active licensed doctors, seven active schedules, and Tuesday 09:00–15:00 Africa/Cairo half-hour windows; schedule fee 10,000 minor units, EGP, cash-on-arrival.\n- **Warm-up:** ${warmupReadCount} alternating API discovery/availability reads and ${warmupMutationCount} API create/cancel pairs on a separate synthetic doctor; first Expo route navigation excluded. Warm-ups are excluded from percentiles.\n- **Topology:** ${JSON.stringify(evidence.topology)}; PostgreSQL: ${JSON.stringify(evidence.postgres ?? 'unavailable')}.\n- **Profile:** ${JSON.stringify(evidence.profile)}.\n- **API timing:** Postgres-backed Fastify routes via in-process app.inject; includes route/service/database/serialization work and excludes transport/proxy/TLS.\n- **Patient timing:** Expo /discover + headless Chromium ${b?.version ?? 'not measured'}, viewport ${JSON.stringify(b?.viewport ?? 'not measured')}; LCP is Chromium PerformanceObserver LCP candidate; input response is Chromium Event Timing input duration with 16 ms entry threshold. Search end-to-end duration is separately reported and is not substituted for input response.\n- **Error handling:** unexpected status/runner exceptions fail; expected booking/reschedule losers and stale queue reorder conflicts are reported as contention. Raw error bodies and patient identifiers are omitted.\n- **Runner failure:** ${failure ? JSON.stringify(failure) : 'none'}\n\n## Percentiles\n\n| Measurement | Samples | p50 | p95 | p99 | Target | Result |\n|---|---:|---:|---:|---:|---:|---|\n| Patient LCP | ${b?.lcp?.samples ?? 0} | ${metric(b?.lcp?.p50_ms ?? NaN)} | ${metric(b?.lcp?.p95_ms ?? NaN)} | ${metric(b?.lcp?.p99_ms ?? NaN)} | ≤ ${target.lcp} ms | ${decision(b?.lcp?.p95_ms ?? NaN, target.lcp)} |\n| Input Event Timing | ${b?.input?.samples ?? 0} | ${metric(b?.input?.p50_ms ?? NaN)} | ${metric(b?.input?.p95_ms ?? NaN)} | ${metric(b?.input?.p99_ms ?? NaN)} | ≤ ${target.input} ms | ${decision(b?.input?.p95_ms ?? NaN, target.input)} |\n| API reads | ${m.reads?.samples ?? 0} | ${metric(m.reads?.p50_ms ?? NaN)} | ${metric(m.reads?.p95_ms ?? NaN)} | ${metric(m.reads?.p99_ms ?? NaN)} | ≤ ${target.read} ms | ${decision(m.reads?.p95_ms ?? NaN, target.read)} |\n| API mutations | ${m.mutations?.samples ?? 0} | ${metric(m.mutations?.p50_ms ?? NaN)} | ${metric(m.mutations?.p95_ms ?? NaN)} | ${metric(m.mutations?.p99_ms ?? NaN)} | ≤ ${target.mutation} ms | ${decision(m.mutations?.p95_ms ?? NaN, target.mutation)} |\n\n- Read operations: ${JSON.stringify(m.reads_by_operation ?? {})}\n- Mutation operations: ${JSON.stringify(m.mutations_by_operation ?? {})}\n- Patient search response (separate): ${JSON.stringify(b?.search_response ?? 'not measured')}\n- HTTP errors: ${JSON.stringify(evidence.errors)}\n- Contention: ${JSON.stringify(evidence.contention)}\n\n## Acceptance and limits\n\n${((evidence.limitations as string[]) ?? []).map((item) => '- ' + item).join('\n')}\n`;
}

async function writeEvidence(outcome: string, failure?: Record<string, unknown>) {
  if (process.env.FEATURE_009_CAPTURE_EVIDENCE !== '1') return;
  await mkdir(path.dirname(reportPath), { recursive: true });
  const report = render(outcome, failure).replace(
    '\n## Percentiles\n',
    `\n- API rate-limit client identities: ${syntheticApiAddresses.size} distinct simulated RFC1918 remote addresses through app.inject; this is address metadata only, not real network traffic. Browser requests are separately measured as one loopback client.\n- Database migration provenance: ${JSON.stringify(evidence.profile.database_migration_provenance)}.\n- Isolated database cleanup: \`${JSON.stringify(evidence.database_cleanup ?? { status: 'not requested' })}\`. No shared database rows, append-only audit history, or unrelated records were deleted.\n\n## Percentiles\n`,
  );
  await writeFile(reportPath, report, 'utf8');
}

async function main() {
  evidence.generated_at = new Date().toISOString();
  let owner: Sql | undefined;
  let admin: Sql | undefined;
  let runtime: Awaited<ReturnType<typeof makeApp>> | undefined;
  let apiAddress: string | undefined;
  let createdDatabase = false;
  let outcome = 'FAIL';
  let failure: Record<string, unknown> | undefined;
  try {
    runnerStage = 'database-provisioning';
    assert.ok(
      ['127.0.0.1', 'localhost', '::1'].includes(host),
      'Only loopback PostgreSQL is allowed.',
    );
    admin = postgres(`postgresql://shifaa_owner:synthetic_owner_only@${host}:${port}/postgres`, {
      max: 1,
      connect_timeout: 10,
      onnotice: () => undefined,
    });
    db = `shifaa_test_t074_perf_${randomBytes(4).toString('hex')}`;
    const [before] = await admin<
      { exists: boolean }[]
    >`select exists(select 1 from pg_database where datname=${db}) exists`;
    assert.equal(before?.exists, false, 'Generated T074 database name must be unused.');
    await admin.unsafe(`create database ${db}`);
    createdDatabase = true;
    ownerUrl = `postgresql://shifaa_owner:synthetic_owner_only@${host}:${port}/${db}`;
    apiUrl = `postgresql://shifaa_api:synthetic_api_only@${host}:${port}/${db}`;
    const migrationDb = postgres(ownerUrl, {
      max: 1,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined,
    });
    try {
      for (const migrationFile of migrationFiles) {
        runnerStage = 'migration-apply';
        runnerFile = migrationFile;
        applySqlFile(db, migrationFile);
      }
      runnerStage = 'schema-fixture';
      runnerFile = 'infra/db/tests/clinic-scheduling-schema.sql';
      applySqlFile(db, runnerFile);
      runnerFile = undefined;
      runnerStage = 'migration-readiness';
      const [readiness] = await migrationDb<
        {
          reschedule: boolean;
          reorder: boolean;
          api_execute_reschedule: boolean;
          api_execute_reorder: boolean;
        }[]
      >`
        select to_regprocedure('clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time,text)') is not null reschedule,
          to_regprocedure('clinical.reorder_queue_entry_v1(uuid,integer,integer,integer,text)') is not null reorder,
          has_function_privilege('shifaa_api','clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time,text)','EXECUTE') api_execute_reschedule,
          has_function_privilege('shifaa_api','clinical.reorder_queue_entry_v1(uuid,integer,integer,integer,text)','EXECUTE') api_execute_reorder`;
      assert.deepEqual(
        readiness,
        {
          reschedule: true,
          reorder: true,
          api_execute_reschedule: true,
          api_execute_reorder: true,
        },
        'Fresh migration chain must expose and grant both scheduling RPCs.',
      );
    } finally {
      await migrationDb.end({ timeout: 5 });
    }
    runnerStage = 'database-inspection';
    owner = postgres(ownerUrl, { max: 2, connect_timeout: 10, onnotice: () => undefined });
    const [pg] = await owner<
      {
        version: string;
        current_user: string;
        database: string;
        max_connections: string;
        shared_buffers: string;
        api_sessions: number;
      }[]
    >`
      select version(),current_user,current_database() database,current_setting('max_connections') max_connections,current_setting('shared_buffers') shared_buffers,
      (select count(*)::int from pg_stat_activity where datname=current_database() and usename='shifaa_api') api_sessions`;
    assert.equal(pg?.current_user, 'shifaa_owner');
    assert.equal(pg?.database, db);
    evidence.postgres = {
      ...pg,
      database: db.startsWith('shifaa_test_t074_perf_') ? 'isolated shifaa_test_t074_perf_*' : db,
    };
    runnerStage = 'fixture-seeding';
    const f = await makeFixture(owner);
    evidence.fixture = {
      run_scoped: true,
      patient_count: f.patients.length,
      licensed_doctors: Object.keys(f.doctors).length,
      schedules: Object.keys(f.doctors).length,
      load_doctors: 2,
      read_sessions: samples,
      queue_entries: queueSize,
    };
    runtime = await makeApp(f);
    runnerStage = 'warm-up';
    await seedWarmup(runtime.app.app, f);
    runnerStage = 'api-profile';
    if (!apiOnlyDiagnostic)
      apiAddress = await runtime.app.app.listen({ host: '127.0.0.1', port: 0 });
    await runApi(runtime.app.app, f, owner);
    evidence.profile.api_synthetic_remote_address_cardinality = syntheticApiAddresses.size;
    if (apiOnlyDiagnostic) {
      evidence.limitations.push(
        'F009_PERF_API_ONLY=1 diagnostic mode: browser metrics were intentionally omitted; this is not an accepted T074 performance result, and full mode still requires all patient/API thresholds.',
      );
      outcome = 'INCONCLUSIVE';
    } else {
      if (!apiAddress) throw new Error('Fastify did not expose its loopback address.');
      runnerStage = 'browser-profile';
      const browser = await browserProfile(new URL(apiAddress).origin);
      const lcp = summary(browser.lcp);
      const input = summary(browser.inputEvents);
      const searchResponse = summary(browser.searchMs);
      (evidence.measurements as any).browser = {
        version: browser.browser,
        viewport: browser.viewport,
        lcp,
        input,
        search_response: searchResponse,
        lcp_samples_ms: browser.lcp.map((x: number) => Number(x.toFixed(2))),
        input_event_samples_ms: browser.inputEvents.map((x: number) => Number(x.toFixed(2))),
        search_response_samples_ms: browser.searchMs.map((x: number) => Number(x.toFixed(2))),
        event_counts: browser.eventCounts,
      };
      const readsP95 = (evidence.measurements as any).reads.p95_ms as number;
      const mutationsP95 = (evidence.measurements as any).mutations.p95_ms as number;
      const races = evidence.contention as any;
      const pass =
        readsP95 <= target.read &&
        mutationsP95 <= target.mutation &&
        lcp.p95_ms <= target.lcp &&
        input.p95_ms <= target.input &&
        races.booking_race.winners === 1 &&
        races.booking_race.expected_conflicts === raceCount - 1 &&
        races.reschedule_race.winners === 1 &&
        races.reschedule_race.expected_conflicts === raceCount - 1 &&
        races.queue_reorder.winners === 1 &&
        races.queue_reorder.expected_conflicts === reorderContenders - 1 &&
        evidence.errors.unexpected_http_statuses === 0;
      outcome = pass ? 'PASS' : 'FAIL';
    }
  } catch (error) {
    evidence.errors.exceptions += 1;
    failure = safeFailure(error);
    process.stderr.write(`${JSON.stringify(failure)}\n`);
    if (error instanceof InconclusiveMeasurement) outcome = 'INCONCLUSIVE';
  } finally {
    evidence.profile.api_synthetic_remote_address_cardinality = syntheticApiAddresses.size;
    if (runtime) {
      try {
        await runtime.app.app.close();
      } catch {
        /* keep primary result */
      }
      try {
        await runtime.identity.close();
      } catch {
        /* keep primary result */
      }
    }
    try {
      await owner?.end({ timeout: 5 });
    } catch {
      /* keep primary result */
    }
    if (createdDatabase && admin) {
      try {
        runnerStage = 'database-cleanup';
        if (!/^shifaa_test_t074_perf_[a-z0-9_]+$/.test(db))
          throw new Error('cleanup refused outside exact T074 database family');
        const [status] = await admin<{ database_exists: boolean; active_sessions: number }[]>`
          select exists(select 1 from pg_database where datname=${db}) database_exists,
            (select count(*)::int from pg_stat_activity where datname=${db}) active_sessions`;
        if (status?.active_sessions !== 0)
          throw new Error('cleanup refused because isolated database still has active sessions');
        if (status?.database_exists) await admin.unsafe(`drop database ${db}`);
        const [after] = await admin<{ database_exists: boolean }[]>`
          select exists(select 1 from pg_database where datname=${db}) database_exists`;
        if (after?.database_exists) throw new Error('isolated database remains after cleanup');
        evidence.database_cleanup = {
          status: 'dropped and verified absent',
          database_family: 'isolated shifaa_test_t074_perf_*',
          active_sessions_before_drop: status?.active_sessions ?? null,
        };
      } catch {
        evidence.database_cleanup = {
          status: 'failed; isolated database retained for safe inspection',
          database_family: 'isolated shifaa_test_t074_perf_*',
        };
        outcome = 'FAIL';
        failure ??= { stage: runnerStage, code: 'isolated-database-cleanup-failed' };
      }
    }
    try {
      await admin?.end({ timeout: 5 });
    } catch {
      /* cleanup evidence remains failure if not dropped */
    }
    evidence.api_listen_address = apiAddress ? 'http://127.0.0.1:{ephemeral}' : 'not started';
    evidence.duration_seconds = Number(
      ((Date.now() - Date.parse(evidence.generated_at)) / 1000).toFixed(2),
    );
    evidence.state = outcome;
    await writeEvidence(outcome, failure);
  }
  process.stdout.write(
    `${JSON.stringify({ outcome, reportPath, measurements: evidence.measurements, contention: evidence.contention, errors: evidence.errors }, null, 2)}\n`,
  );
  if (outcome !== 'PASS') process.exitCode = 1;
}

void main();
