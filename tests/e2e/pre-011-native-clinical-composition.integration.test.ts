import { randomBytes, randomUUID } from 'node:crypto';

import { createClinicSchedulingClient } from '@shifaa/api-client/clinic-scheduling';
import { createFeature010Client } from '@shifaa/api-client/feature-010';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseAuthIssuer } from '../../services/api/src/adapters/supabase-auth.js';
import { buildApp, type AppHarness } from '../../services/api/src/app.js';
import { loadConfig } from '../../services/api/src/config.js';
import { idempotencyScopeHash } from '../../services/api/src/platform/idempotency.js';
import {
  authClient,
  buildMfaHarness,
  confirmedSignup,
  freshPasswordLogin,
  currentTotp,
  supabaseStatus,
  type MfaHarness,
  type SupabaseStatus,
} from '../../services/api/test/identity-continuity-mfa-harness.js';

type Runtime = SupabaseStatus & { SERVICE_ROLE_KEY: string };

const enabled = process.env['SHIFAA_RUN_NATIVE_CLINICAL_COMPOSITION'] === 'true';
const password = 'Synthetic-Pre011-Native-Auth!';
let runtime: Runtime;
let appHarness: AppHarness | undefined;
let identityHarness: MfaHarness | undefined;
let auth: SupabaseAuthIssuer;
let nativeSession: Awaited<ReturnType<typeof confirmedSignup>>;
let personId: string;
let clinicianSession: Awaited<ReturnType<typeof confirmedSignup>>;
let clinicianPersonId: string;
let appointmentId: string;
let encounterId: string;

function nativeConfig(status: Runtime) {
  const database = new URL(status.DB_URL);
  database.username = 'shifaa_api';
  database.password = 'synthetic_api_only';
  return loadConfig({
    NODE_ENV: 'test',
    SHIFAA_SYNTHETIC_MODE: 'false',
    AUTH_ADAPTER: 'supabase',
    REPOSITORY_ADAPTER: 'postgres',
    PROOFING_ADAPTER: 'local',
    UPLOAD_ADAPTER: 'supabase',
    IDENTITY_CONTINUITY_ENABLED: 'true',
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_JWKS_URL: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
    SUPABASE_JWT_ISSUER: `${status.API_URL}/auth/v1`,
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    DATABASE_URL: database.toString(),
    IDENTITY_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString('base64'),
    IDENTITY_BLIND_INDEX_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
    PREAUTH_HMAC_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
  });
}

function apiFetch(app: AppHarness['app']): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const response = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH',
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    const headers = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    return new Response(response.body, { status: response.statusCode, headers });
  };
}

function schedulingClient(token: string) {
  if (!appHarness) throw new Error('Native clinical API harness is not initialized.');
  return createClinicSchedulingClient({
    baseUrl: 'http://shifaa.test',
    accessToken: token,
    fetch: apiFetch(appHarness.app),
  });
}

function feature010Client(token: string, clientAal: 1 | 2 = 1) {
  if (!appHarness) throw new Error('Native clinical API harness is not initialized.');
  return createFeature010Client({
    baseUrl: 'http://shifaa.test',
    accessToken: () => token,
    purpose: 'appointment.scheduling',
    sessionAal: () => clientAal,
    fetch: apiFetch(appHarness.app),
  });
}

async function seedEncounterFixture(): Promise<void> {
  if (!identityHarness) throw new Error('Native identity harness is not initialized.');
  const facilityId = randomUUID();
  const licenseId = randomUUID();
  const licenseNumber = Buffer.from(randomUUID().replaceAll('-', ''), 'hex');
  const licenseHash = Buffer.from(randomUUID().replaceAll('-', '').repeat(2), 'hex');
  const scheduleId = randomUUID();
  const patientRecordId = randomUUID();
  const queueScopeId = randomUUID();
  const queueEntryId = randomUUID();
  appointmentId = randomUUID();
  const now = new Date();
  const start = new Date(Math.ceil((now.getTime() + 30 * 60_000) / 60_000) * 60_000);
  const end = new Date(start.getTime() + 30 * 60_000);
  const civilDate = start.toISOString().slice(0, 10);
  const startsAt = start.toISOString();
  const endsAt = end.toISOString();
  const localStart = `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`;
  await identityHarness.ownerSql(async (sql) => {
    await sql.begin(async (tx: TransactionSql) => {
      await tx`select set_config('shifaa.environment','ci',true), set_config('shifaa.clinic_internal_transition','allowed',true)`;
      await tx`
        insert into identity.patients(id,person_id,medical_record_number,record_status)
        values(${patientRecordId}::uuid,${personId}::uuid,${`PRE011-${patientRecordId}`},'active')`;
      await tx`
        insert into identity.facilities(
          id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id
        ) values(${facilityId}::uuid,'clinic','عيادة الاختبار','Pre-011 clinic','active','C','Cairo','Test','Synthetic address',${clinicianPersonId}::uuid)`;
      await tx`
        insert into identity.professional_licenses(
          id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status
        ) values(${licenseId}::uuid,${clinicianPersonId}::uuid,'doctor',${licenseNumber},${licenseHash},'Pre-011 test regulator','2099-12-31','verified')`;
      await tx`
        insert into identity.facility_memberships(
          facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id
        ) values(${facilityId}::uuid,${clinicianPersonId}::uuid,'doctor',${licenseId}::uuid,'2020-01-01','active',${clinicianPersonId}::uuid)`;
      await tx`
        insert into clinical.schedules(
          id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id
        ) values(${scheduleId}::uuid,${facilityId}::uuid,${clinicianPersonId}::uuid,'UTC',${civilDate}::date,(${civilDate}::date + 1),30,10000,'EGP',${clinicianPersonId}::uuid,${clinicianPersonId}::uuid)`;
      await tx`
        insert into clinical.appointments(
          id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id
        ) values(${appointmentId}::uuid,${personId}::uuid,${facilityId}::uuid,${clinicianPersonId}::uuid,${scheduleId}::uuid,${startsAt}::timestamptz,${endsAt}::timestamptz,'UTC',${civilDate}::date,${localStart},10000,'EGP','cash_on_arrival','confirmed',${clinicianPersonId}::uuid,${clinicianPersonId}::uuid)`;
      await tx`
        insert into clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name)
        values(${queueScopeId}::uuid,${facilityId}::uuid,${clinicianPersonId}::uuid,${civilDate}::date,'UTC')`;
      await tx`
        insert into clinical.queue_entries(id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state)
        values(${queueEntryId}::uuid,${queueScopeId}::uuid,${appointmentId}::uuid,${facilityId}::uuid,${clinicianPersonId}::uuid,${civilDate}::date,1,1,'waiting')`;
      await tx`update clinical.appointments set status='checked_in' where id=${appointmentId}::uuid`;
      await tx`update clinical.queue_entries set state='called',waiting_order=NULL,called_at=statement_timestamp() where id=${queueEntryId}::uuid`;
    });
  });
}

beforeAll(async () => {
  if (!enabled) return;
  runtime = supabaseStatus() as Runtime;
  identityHarness = await buildMfaHarness(runtime);
  const sql = postgres(runtime.DB_URL, { max: 1 });
  try {
    const rows = await sql`
      select version from supabase_migrations.schema_migrations
      where version = '20260930001001'`;
    expect(rows).toHaveLength(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
  auth = new SupabaseAuthIssuer({
    url: runtime.API_URL,
    anonKey: runtime.ANON_KEY,
    jwksUrl: `${runtime.API_URL}/auth/v1/.well-known/jwks.json`,
    issuer: `${runtime.API_URL}/auth/v1`,
    audience: 'authenticated',
  });
  await auth.ready();
  appHarness = await buildApp({ config: nativeConfig(runtime) });
  const email = `pre011-native-${randomUUID()}@synthetic.shifaa.test`;
  nativeSession = await confirmedSignup(runtime, email, password);
  nativeSession = { ...nativeSession, ...(await freshPasswordLogin(runtime, email, password)) };
  personId = await identityHarness.seedPerson(nativeSession.userId, email);
  const clinicianEmail = `pre011-clinician-${randomUUID()}@synthetic.shifaa.test`;
  clinicianSession = await confirmedSignup(runtime, clinicianEmail, password);
  clinicianSession = {
    ...clinicianSession,
    ...(await freshPasswordLogin(runtime, clinicianEmail, password)),
  };
  clinicianPersonId = await identityHarness.seedPerson(clinicianSession.userId, clinicianEmail);
  await seedEncounterFixture();
});

afterAll(async () => {
  await appHarness?.app.close();
  await identityHarness?.close();
});

describe.skipIf(!enabled).sequential('F01/F02 native clinical composition regressions', () => {
  it('accepts the real Supabase session on the ordinary PostgreSQL scheduling composition', async () => {
    const nativeScheduling = schedulingClient(nativeSession.accessToken);

    const page = await nativeScheduling.listAppointments();
    expect(page.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: appointmentId, patientId: personId })]),
    );

    await expect(
      schedulingClient(`synthetic-person:${personId}`).listAppointments(),
    ).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      schedulingClient('invalid-native-access-token').listAppointments(),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('composes PostgreSQL clinic scheduling without an injected service', async () => {
    await expect(
      schedulingClient(nativeSession.accessToken).searchDoctors(),
    ).resolves.toMatchObject({
      items: expect.any(Array),
    });
  });

  it('keeps synthetic and continuity-disabled native modes fail-closed', async () => {
    const syntheticFlagApp = await buildApp({
      config: { ...nativeConfig(runtime), syntheticMode: true },
    });
    try {
      const fixture = await syntheticFlagApp.app.inject({
        method: 'GET',
        url: '/v1/appointments',
        headers: { authorization: `Bearer synthetic-person:${personId}` },
      });
      expect(fixture.statusCode).toBe(401);
    } finally {
      await syntheticFlagApp.app.close();
    }

    const continuityDisabledApp = await buildApp({
      config: { ...nativeConfig(runtime), repositoryAdapter: 'memory' },
    });
    try {
      const native = await continuityDisabledApp.app.inject({
        method: 'GET',
        url: '/v1/appointments',
        headers: { authorization: `Bearer ${nativeSession.accessToken}` },
      });
      expect(native.statusCode).toBe(503);
      expect(native.json()).toMatchObject({ code: 'open-sec-001' });
    } finally {
      await continuityDisabledApp.app.close();
    }
  });

  it('joins current native authority, clinical operations, private projections and rotation', async () => {
    const recoveredEmail = `pre011-recovery-${randomUUID()}@synthetic.shifaa.test`;
    const recoverable = await confirmedSignup(runtime, recoveredEmail, password);
    await identityHarness!.seedPerson(recoverable.userId, recoveredEmail);

    const restrictionSession = await auth.verifyAccessToken(recoverable.accessToken);
    expect(restrictionSession).toBeDefined();
    await identityHarness!.ownerSql(async (sql) => {
      await sql`
        insert into identity.continuity_cases(
          id,case_type,subject_person_id,status,restriction_scope,bound_native_session_id,
          public_token_digest,recovery_handle_digest,token_key_version,expires_at
        ) values(
          ${randomUUID()}::uuid,'account_recovery',
          (select id from identity.people where user_id=${recoverable.userId}::uuid),
          'restricted_enrollment','mfa_enrollment_only',${restrictionSession!.sessionId}::uuid,
          ${randomBytes(32)},${randomBytes(32)},1,now()+interval '15 minutes'
        )`;
    });
    await expect(
      schedulingClient(recoverable.accessToken).listAppointments(),
    ).rejects.toMatchObject({
      status: 403,
    });

    const forgedKey = `pre011-forged-aal-${randomUUID()}`;
    const forgedAal = feature010Client(clinicianSession.accessToken, 2);
    await expect(
      forgedAal.createEncounter(
        {
          appointmentId,
          patientId: personId,
          encounterType: 'consultation',
        },
        { idempotencyKey: forgedKey },
      ),
    ).rejects.toMatchObject({
      status: 403,
      problem: expect.objectContaining({ code: 'mfa-required' }),
    });
    const forgedEffects = await identityHarness!.ownerSql(async (sql) => {
      const [row] = await sql<{ encounters: number; idempotency: number }[]>`
        select
          (select count(*)::int from clinical.encounters where appointment_id=${appointmentId}::uuid) encounters,
          (select count(*)::int from platform.idempotency_records
            where route_template='/v1/encounters' and key_hash=${idempotencyScopeHash('key', forgedKey)}) idempotency`;
      return row;
    });
    expect(forgedEffects).toEqual({ encounters: 0, idempotency: 0 });

    const clinicianEnrollment = await auth.enrollTotp(
      clinicianSession.accessToken,
      'Pre-011 clinician factor',
    );
    const verified = await auth.verifyTotp(
      clinicianSession.accessToken,
      clinicianEnrollment.enrollmentId,
      currentTotp(clinicianEnrollment.secret),
    );
    const clinicianMfa2 = verified.session;
    const created = await feature010Client(clinicianMfa2.accessToken, 2).createEncounter(
      { appointmentId, patientId: personId, encounterType: 'consultation' },
      { idempotencyKey: `pre011-native-encounter-${randomUUID()}` },
    );
    encounterId = created.encounter.id;

    const clinicianApi = feature010Client(clinicianMfa2.accessToken, 2);
    const priorVisible = await clinicianApi.signEncounterNote(
      encounterId,
      { noteType: 'assessment', visibility: 'patient_visible', body: 'PRE011 prior visible note.' },
      { idempotencyKey: `pre011-prior-note-${randomUUID()}` },
    );
    const currentVisible = await clinicianApi.signEncounterNote(
      encounterId,
      {
        noteType: 'assessment',
        visibility: 'patient_visible',
        body: 'PRE011 current visible note.',
        supersedesId: priorVisible.id,
      },
      { idempotencyKey: `pre011-current-note-${randomUUID()}` },
    );
    const defaultPatientProjection = await feature010Client(nativeSession.accessToken).getEncounter(
      encounterId,
    );
    expect(defaultPatientProjection).not.toHaveProperty('notes');

    const [{ PatientFeature010EncounterApi }, { rememberFeature010Session }] = await Promise.all([
      import(new URL('../../apps/patient/src/feature-010-encounter.ts', import.meta.url).href),
      import(new URL('../../apps/patient/src/feature-010-session.ts', import.meta.url).href),
    ]);
    const patientFetch = apiFetch(appHarness!.app);
    const wrapperResults: Array<{ notes?: Array<Record<string, unknown>> }> = [];
    for (const locale of ['ar-EG', 'en-EG'] as const) {
      rememberFeature010Session(nativeSession.accessToken, 1);
      const patientApi = new PatientFeature010EncounterApi({
        locale,
        accessToken: nativeSession.accessToken,
        apiBaseUrl: 'http://shifaa.test',
        fetch: patientFetch,
      });
      wrapperResults.push(await patientApi.getEncounter(encounterId));
    }
    expect(wrapperResults[0]).toEqual(wrapperResults[1]);
    expect(wrapperResults[1]?.notes).toHaveLength(2);
    expect(wrapperResults[1]?.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: priorVisible.id, body: 'PRE011 prior visible note.' }),
        expect.objectContaining({ id: currentVisible.id, body: 'PRE011 current visible note.' }),
      ]),
    );
    expect(wrapperResults[1]?.notes?.every((note) => !('supersedesId' in note))).toBe(true);

    const privateNote = await clinicianApi.signEncounterNote(
      encounterId,
      { noteType: 'assessment', visibility: 'private', body: 'PRE011_PRIVATE_NOTE_CANARY' },
      { idempotencyKey: `pre011-private-note-${randomUUID()}` },
    );
    rememberFeature010Session(nativeSession.accessToken, 1);
    const patientApiAfterPrivate = new PatientFeature010EncounterApi({
      locale: 'en-EG',
      accessToken: nativeSession.accessToken,
      apiBaseUrl: 'http://shifaa.test',
      fetch: patientFetch,
    });
    const afterPrivate = await patientApiAfterPrivate.getEncounter(encounterId);
    expect(afterPrivate).toEqual(wrapperResults[1]);
    expect(JSON.stringify(afterPrivate)).not.toContain(privateNote.id);
    expect(JSON.stringify(afterPrivate)).not.toContain('PRE011_PRIVATE_NOTE_CANARY');

    const rotated = await authClient(runtime).auth.refreshSession({
      refresh_token: nativeSession.refreshToken,
    });
    expect(rotated.error).toBeNull();
    expect(rotated.data.session?.user.id).toBe(nativeSession.userId);
    const rotatedAppointments = await schedulingClient(
      rotated.data.session!.access_token,
    ).listAppointments();
    expect(rotatedAppointments.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: appointmentId, patientId: personId })]),
    );
    const [
      { PatientFeature010EncounterApi: RotatedPatientEncounterApi },
      { rememberFeature010Session: rememberRotatedSession },
    ] = await Promise.all([
      import(new URL('../../apps/patient/src/feature-010-encounter.ts', import.meta.url).href),
      import(new URL('../../apps/patient/src/feature-010-session.ts', import.meta.url).href),
    ]);
    rememberRotatedSession(rotated.data.session!.access_token, 1);
    const rotatedPatientApi = new RotatedPatientEncounterApi({
      locale: 'en-EG',
      accessToken: rotated.data.session!.access_token,
      apiBaseUrl: 'http://shifaa.test',
      fetch: apiFetch(appHarness!.app),
    });
    await expect(rotatedPatientApi.getEncounter(encounterId)).resolves.toMatchObject({
      id: encounterId,
    });

    await auth.logout(rotated.data.session!.access_token, 'local');
    await expect(rotatedPatientApi.getEncounter(encounterId)).rejects.toMatchObject({
      status: 401,
    });
    expect(rotatedPatientApi.currentEncounter).toBeNull();
    await expect(
      schedulingClient(rotated.data.session!.access_token).listAppointments(),
    ).rejects.toMatchObject({ status: 401 });
  });
});
