import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import postgres, { type Sql, type TransactionSql } from 'postgres';

import { buildApp } from '../../services/api/src/app.ts';
import { loadConfig } from '../../services/api/src/config.ts';
import { PostgresClinicSchedulingService } from '../../services/api/src/adapters/postgres/clinic-scheduling-service.ts';
import { PostgresIdentityRepository } from '../../services/api/src/adapters/postgres/identity-repository.ts';
import { ClinicSchedulingService } from '../../services/api/src/modules/clinic-scheduling/service.ts';
import { idempotencyScopeHash } from '../../services/api/src/platform/idempotency.ts';
import { canonicalTemplateDigest } from '../../packages/core/src/privacy-dsr-notifications/policy.ts';
import { DurableClinicSchedulingSyntheticMessagingAdapter } from '../../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresClinicSchedulingNotificationProcessor } from '../../services/worker/src/postgres-clinic-scheduling-notification-processor.ts';

const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const workerUrl = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa';

const ids = {
  owner: 'f009e000-0000-4000-8c00-000000000001',
  doctor: 'f009e000-0000-4000-8c00-000000000002',
  patient: 'f009e000-0000-4000-8c00-000000000003',
  facility: 'f009e000-0000-4000-8d00-000000000001',
  schedule: 'f009e000-0000-4000-8e00-000000000001',
  patientRow: 'f009e000-0000-4000-8f00-000000000001',
  license: 'f009e000-0000-4000-8a00-000000000010',
  delayRelease: 'f009e000-0000-4000-8b00-000000000001',
  absenceRelease: 'f009e000-0000-4000-8b00-000000000002',
};

type FixtureCandidate = {
  template_code: 'CLINIC_DOCTOR_DELAY' | 'CLINIC_DOCTOR_ABSENCE';
  release_version: number;
  channel: 'sms';
  arabic_body: string;
  english_body: string;
  allowed_recipient_types: readonly ['patient'];
  allowed_field_schema: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, { type: 'string' }>;
    required: string[];
  };
  placeholder_names: string[];
  content_digest: string;
};

const candidates = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../specs/009-clinic-scheduling-appointments-queue/contracts/notification-template-candidates.json',
        import.meta.url,
      ),
    ),
    'utf8',
  ),
) as { templates: FixtureCandidate[] };

const owner = postgres(ownerUrl, { max: 2, prepare: true });
let app: Awaited<ReturnType<typeof buildApp>>;
let identity: PostgresIdentityRepository;
const runToken = `f009-notification-e2e-${randomUUID()}`;
let dispatchSnapshot: { enabled: boolean; constraints: unknown } | undefined;
const usedIdempotencyKeys = new Set<string>();

const fixtureEventWhere = `(e.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
  AND (e.aggregate_id IN (SELECT id FROM clinical.schedule_exceptions WHERE facility_id='${ids.facility}'::uuid)
    OR e.aggregate_id IN (SELECT id FROM clinical.appointments WHERE facility_id='${ids.facility}'::uuid)))`;

function row<T>(rows: readonly T[], index = 0): T {
  const value = rows[index];
  assert.ok(value, `expected row ${index}`);
  return value;
}

async function seedFixture(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
        ('${ids.owner}','f009e000-0000-4000-9c00-000000000001','F009 E2E owner','active'),
        ('${ids.doctor}','f009e000-0000-4000-9c00-000000000002','F009 E2E doctor','active'),
        ('${ids.patient}','f009e000-0000-4000-9c00-000000000003','F009 E2E patient','active');
      INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
        VALUES ('${ids.patientRow}','${ids.patient}','F009-E2E-P','active');
      INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
        VALUES ('${ids.facility}','clinic','عيادة اختبار','F009 E2E clinic','active','C','Cairo','E2E','Synthetic E2E address','${ids.owner}');
      INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
        VALUES ('${ids.license}','${ids.doctor}','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F009 E2E regulator','2099-12-31','verified');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,valid_from,membership_status,created_by_person_id)
        VALUES ('${ids.facility}','${ids.owner}','owner','2020-01-01','active','${ids.owner}');
      INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
        VALUES ('${ids.facility}','${ids.doctor}','doctor','${ids.license}','2020-01-01','active','${ids.owner}');
      INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
        VALUES ('${ids.schedule}','${ids.facility}','${ids.doctor}','Africa/Cairo','2030-01-01','2030-01-31',30,10000,'EGP','active','${ids.owner}','${ids.owner}');
      INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
        VALUES ('${ids.schedule}',2,'09:00','15:00');
    `);
    await tx.unsafe(`
      SELECT set_config('shifaa.environment','local',true),
             set_config('shifaa.actor_role','ADM-SUPPORT',true),
             set_config('shifaa.aal','2',true),
             set_config('shifaa.purposes','notification.template.manage',true),
             set_config('shifaa.person_id','${ids.owner}',true)
    `);
    for (const [index, candidate] of candidates.templates.entries()) {
      const releaseId = index === 0 ? ids.delayRelease : ids.absenceRelease;
      assert.equal(
        canonicalTemplateDigest({
          templateCode: candidate.template_code,
          channel: candidate.channel,
          arabicBody: candidate.arabic_body,
          englishBody: candidate.english_body,
          allowedRecipientTypes: candidate.allowed_recipient_types,
          allowedFields: Object.fromEntries(
            Object.entries(candidate.allowed_field_schema.properties).map(([key, value]) => [
              key,
              value.type,
            ]),
          ),
          requiredFields: candidate.allowed_field_schema.required,
        }),
        candidate.content_digest,
        `candidate digest ${candidate.template_code}`,
      );
      await tx`
        INSERT INTO platform.notification_template_releases(
          id,template_code,release_version,channel,arabic_body,english_body,
          allowed_recipient_types,allowed_field_schema,placeholder_names,content_digest,
          status,created_by_person_id
        ) VALUES (
          ${releaseId}::uuid,${candidate.template_code},${candidate.release_version},${candidate.channel},
          ${candidate.arabic_body},${candidate.english_body},${candidate.allowed_recipient_types},
          ${tx.json(candidate.allowed_field_schema)},${candidate.placeholder_names},${candidate.content_digest},
          'draft',${ids.owner}::uuid
        )
      `;
      await tx.unsafe(`
        SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true),
               set_config('shifaa.aal','2',true),
               set_config('shifaa.purposes','notification.template.publish',true),
               set_config('shifaa.person_id','${ids.doctor}',true)
      `);
      await tx`
        UPDATE platform.notification_template_releases
        SET status='published',published_by_person_id=${ids.doctor}::uuid,effective_at=statement_timestamp()-interval '1 minute'
        WHERE id=${releaseId}::uuid
      `;
      await tx.unsafe(`
        SELECT set_config('shifaa.purposes','notification.template.manage',true),
               set_config('shifaa.person_id','${ids.owner}',true)
      `);
    }
    await tx`
      INSERT INTO platform.feature_flags(code,environment,enabled,constraints)
      VALUES ('clinic_scheduling.dispatch','local',true,'{"stage":"e2e"}'::jsonb)
      ON CONFLICT(code,environment) DO UPDATE SET enabled=true,updated_at=statement_timestamp()
    `;
  });
}

async function cleanupRuntime(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    for (const table of [
      'platform.notifications',
      'platform.notification_delivery_attempts',
      'platform.event_receipts',
      'platform.synthetic_message_receipts',
      'platform.outbox_events',
      'platform.idempotency_records',
      'audit.events',
    ])
      await tx.unsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    const keyHashes = [...usedIdempotencyKeys].map((key) => idempotencyScopeHash('key', key));
    if (keyHashes.length > 0) {
      await tx`DELETE FROM platform.idempotency_records WHERE key_hash = ANY(${keyHashes})`;
    }
    await tx.unsafe(`
      DELETE FROM platform.synthetic_message_receipts
      WHERE provider_idempotency_key IN (
        SELECT a.provider_idempotency_key FROM platform.notification_delivery_attempts a
        WHERE a.source_event_id IN (SELECT e.id FROM platform.outbox_events e WHERE ${fixtureEventWhere})
      );
      DELETE FROM platform.notification_delivery_attempts
      WHERE source_event_id IN (
        SELECT e.id FROM platform.outbox_events e WHERE ${fixtureEventWhere}
      );
      DELETE FROM platform.notifications
      WHERE source_event_id IN (
        SELECT e.id FROM platform.outbox_events e WHERE ${fixtureEventWhere}
      );
      DELETE FROM platform.event_receipts
      WHERE event_id IN (
        SELECT e.id FROM platform.outbox_events e WHERE ${fixtureEventWhere}
      );
      DELETE FROM platform.outbox_events e
      WHERE ${fixtureEventWhere};
      DELETE FROM audit.events WHERE facility_id='${ids.facility}' OR resource_id IN (SELECT id FROM clinical.schedule_exceptions WHERE schedule_id='${ids.schedule}'::uuid);
      DELETE FROM clinical.queue_entries WHERE facility_id='${ids.facility}';
      DELETE FROM clinical.queue_scopes WHERE facility_id='${ids.facility}';
      DELETE FROM clinical.appointments WHERE facility_id='${ids.facility}';
      DELETE FROM clinical.schedule_exceptions WHERE schedule_id='${ids.schedule}';
    `);
    for (const table of [
      'audit.events',
      'platform.idempotency_records',
      'platform.outbox_events',
      'platform.synthetic_message_receipts',
      'platform.event_receipts',
      'platform.notification_delivery_attempts',
      'platform.notifications',
    ])
      await tx.unsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  });
}

async function resetScenario(): Promise<void> {
  await cleanupRuntime(owner);
  await owner`
    UPDATE platform.feature_flags SET enabled=true,updated_at=statement_timestamp()
    WHERE code='clinic_scheduling.dispatch' AND environment='local'
  `;
}

async function apiRequest(
  personId: string,
  method: 'POST',
  url: string,
  payload: unknown,
  suffix: string,
): Promise<Record<string, unknown>> {
  const idempotencyKey = `${runToken}-${suffix}`;
  usedIdempotencyKeys.add(idempotencyKey);
  const response = await app.app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer synthetic-person:${personId}`,
      'idempotency-key': idempotencyKey,
    },
    payload,
  });
  assert.ok(response.statusCode < 400, `${method} ${url}: ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

async function book(startsAt: string, suffix: string): Promise<string> {
  const result = await apiRequest(
    ids.patient,
    'POST',
    '/v1/appointments',
    {
      patientId: ids.patient,
      facilityId: ids.facility,
      doctorId: ids.doctor,
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      paymentMethod: 'cash_on_arrival',
    },
    suffix,
  );
  return String(result['id']);
}

async function delay(minutes: number, suffix: string): Promise<void> {
  await apiRequest(
    ids.owner,
    'POST',
    `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/delay`,
    {
      civilDate: '2030-01-07',
      delayMinutes: minutes,
      templateCode: 'CLINIC_DOCTOR_DELAY',
      reason: `synthetic delay ${minutes}`,
    },
    suffix,
  );
}

async function absence(suffix: string): Promise<void> {
  await apiRequest(
    ids.owner,
    'POST',
    `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/absence`,
    {
      civilDate: '2030-01-07',
      startsAt: '2030-01-07T07:00:00Z',
      endsAt: '2030-01-07T07:30:00Z',
      reason: 'synthetic absence sentinel must not leave the domain boundary',
    },
    suffix,
  );
}

async function processUntilIdle(
  processor: PostgresClinicSchedulingNotificationProcessor,
  maximum = 12,
): Promise<void> {
  for (let i = 0; i < maximum; i += 1) {
    if ((await processor.processNext()) === 'idle') return;
  }
  assert.fail('worker did not become idle within bounded processing attempts');
}

async function clinicEvents() {
  return owner<
    {
      id: string;
      event_type: string;
      state: string;
      aggregate_version: number;
      last_error_code: string | null;
    }[]
  >`
    SELECT id,event_type,state,aggregate_version,last_error_code
    FROM platform.outbox_events e
    WHERE e.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
      AND (e.aggregate_id IN (SELECT id FROM clinical.schedule_exceptions WHERE facility_id=${ids.facility}::uuid)
        OR e.aggregate_id IN (SELECT id FROM clinical.appointments WHERE facility_id=${ids.facility}::uuid))
    ORDER BY created_at,id
  `;
}

async function notificationRows() {
  return owner<
    {
      source_event_id: string;
      recipient_person_id: string;
      delivery_scope_key: string;
      status: string;
      attempt_count: number;
      field_values: Record<string, unknown>;
    }[]
  >`
    SELECT source_event_id,recipient_person_id,delivery_scope_key,status,attempt_count,field_values
    FROM platform.notifications n
    WHERE n.source_event_id IN (
      SELECT e.id FROM platform.outbox_events e
      WHERE e.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
        AND (e.aggregate_id IN (SELECT id FROM clinical.schedule_exceptions WHERE facility_id=${ids.facility}::uuid)
          OR e.aggregate_id IN (SELECT id FROM clinical.appointments WHERE facility_id=${ids.facility}::uuid))
    )
    ORDER BY created_at,id
  `;
}

async function deliveryAttempts(eventId: string) {
  return owner<
    {
      notification_id: string;
      attempt_number: number;
      outcome: string;
      safe_error_code: string | null;
      status: string;
      attempt_count: number;
    }[]
  >`
    SELECT a.notification_id,a.attempt_number,a.outcome,a.safe_error_code,
      n.status,n.attempt_count
    FROM platform.notification_delivery_attempts a
    JOIN platform.notifications n ON n.id=a.notification_id
    WHERE a.source_event_id=${eventId}::uuid
    ORDER BY a.attempt_number,a.id
  `;
}

type AppointmentQueueSnapshot = {
  appointment_id: string;
  appointment_status: string;
  appointment_version: number;
  queue_entry_id: string | null;
  queue_state: string | null;
  waiting_order: number | null;
  queue_number: number | null;
  queue_version: number | null;
};

async function appointmentQueueSnapshot(
  appointmentIds: readonly string[],
): Promise<AppointmentQueueSnapshot[]> {
  if (appointmentIds.length === 0) return [];
  return owner<AppointmentQueueSnapshot[]>`
    SELECT a.id appointment_id,a.status appointment_status,a.version appointment_version,
      q.id queue_entry_id,q.state queue_state,q.waiting_order,q.queue_number,q.version queue_version
    FROM clinical.appointments a
    LEFT JOIN clinical.queue_entries q ON q.appointment_id=a.id
    WHERE a.id=ANY(${appointmentIds}::uuid[])
    ORDER BY a.id
  `;
}

async function assertNoSentinel(): Promise<void> {
  const rows = await owner<{ text: string }[]>`
    SELECT concat_ws('|',coalesce(last_error_code,''),coalesce(field_values::text,''),coalesce(safe_error_code,'')) text
    FROM platform.outbox_events e
    LEFT JOIN platform.notifications n ON n.source_event_id=e.id
    LEFT JOIN platform.notification_delivery_attempts a ON a.source_event_id=e.id
    WHERE e.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
      AND (e.aggregate_id IN (SELECT id FROM clinical.schedule_exceptions WHERE facility_id=${ids.facility}::uuid)
        OR e.aggregate_id IN (SELECT id FROM clinical.appointments WHERE facility_id=${ids.facility}::uuid))
  `;
  assert.ok(rows.every((item) => !item.text.includes('raw-contact-destination-sentinel')));
}

before(async () => {
  await owner`SELECT 1`;
  const snapshot = await owner<{ enabled: boolean; constraints: unknown }[]>`
    SELECT enabled,constraints FROM platform.feature_flags
    WHERE code='clinic_scheduling.dispatch' AND environment='local'
  `;
  dispatchSnapshot = row(snapshot);
  await cleanupRuntime(owner);
  await owner`DELETE FROM platform.notification_template_releases WHERE id IN (${ids.delayRelease}::uuid,${ids.absenceRelease}::uuid)`;
  await owner`DELETE FROM clinical.schedule_windows WHERE schedule_id=${ids.schedule}::uuid`;
  await owner`DELETE FROM clinical.schedules WHERE id=${ids.schedule}::uuid`;
  await owner`DELETE FROM identity.facility_memberships WHERE facility_id=${ids.facility}::uuid`;
  await owner`DELETE FROM identity.professional_licenses WHERE id=${ids.license}::uuid`;
  await owner`DELETE FROM identity.patients WHERE id=${ids.patientRow}::uuid`;
  await owner`DELETE FROM identity.facilities WHERE id=${ids.facility}::uuid`;
  await owner`DELETE FROM identity.people WHERE id IN (${ids.owner}::uuid,${ids.doctor}::uuid,${ids.patient}::uuid)`;
  await seedFixture(owner);
  const apiIdentity = new PostgresIdentityRepository(apiUrl);
  identity = apiIdentity;
  const adapter = new PostgresClinicSchedulingService(
    {
      withRawTransaction: <T>(work: (tx: TransactionSql) => Promise<T>) =>
        apiIdentity.withRawTransaction(work),
    },
    'local',
  );
  const base = loadConfig({ NODE_ENV: 'test' });
  app = await buildApp({
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
      clock: { now: () => new Date('2030-01-01T00:00:00.000Z') },
      cache: { get: async () => undefined, set: async () => undefined },
    }),
  });
});

after(async () => {
  await app?.app.close();
  await identity?.close();
  await cleanupRuntime(owner);
  await owner`DELETE FROM platform.notification_template_releases WHERE id IN (${ids.delayRelease}::uuid,${ids.absenceRelease}::uuid)`;
  await owner`DELETE FROM clinical.schedule_windows WHERE schedule_id=${ids.schedule}::uuid`;
  await owner`DELETE FROM clinical.schedules WHERE id=${ids.schedule}::uuid`;
  await owner`DELETE FROM identity.facility_memberships WHERE facility_id=${ids.facility}::uuid`;
  await owner`DELETE FROM identity.professional_licenses WHERE id=${ids.license}::uuid`;
  await owner`DELETE FROM identity.patients WHERE id=${ids.patientRow}::uuid`;
  await owner`DELETE FROM identity.facilities WHERE id=${ids.facility}::uuid`;
  await owner`DELETE FROM identity.people WHERE id IN (${ids.owner}::uuid,${ids.doctor}::uuid,${ids.patient}::uuid)`;
  if (dispatchSnapshot) {
    await owner`
      UPDATE platform.feature_flags
      SET enabled=${dispatchSnapshot.enabled},constraints=${owner.json(dispatchSnapshot.constraints)},updated_at=statement_timestamp()
      WHERE code='clinic_scheduling.dispatch' AND environment='local'
    `;
  }
  await owner.end({ timeout: 5 });
});

test('API commit-to-worker proves delay and absence, current recipients, exact fields, and replay dedup', async () => {
  await resetScenario();
  const firstAppointment = await book('2030-01-07T07:00:00Z', 'delay-a');
  const secondAppointment = await book('2030-01-07T08:00:00Z', 'delay-b');
  await delay(15, 'delay');
  const delayEvents = await clinicEvents();
  assert.ok(delayEvents.length > 0, 'API commit did not produce a scoped delay outbox event');
  const delayEvent = row(delayEvents);
  const delayStateBeforeWorker = await appointmentQueueSnapshot([
    firstAppointment,
    secondAppointment,
  ]);
  const adapter = new DurableClinicSchedulingSyntheticMessagingAdapter(workerUrl, 'local');
  const processor = new PostgresClinicSchedulingNotificationProcessor(
    workerUrl,
    adapter,
    'f009-e2e-delay',
  );
  try {
    await processUntilIdle(processor);
  } finally {
    await processor.close();
    await adapter.close();
  }
  assert.deepEqual(
    await appointmentQueueSnapshot([firstAppointment, secondAppointment]),
    delayStateBeforeWorker,
    'delay notification processing must not mutate appointment or queue state',
  );
  assert.equal(
    (await clinicEvents()).filter((event) => event.id === delayEvent.id)[0]?.state,
    'delivered',
  );
  const delayRows = await notificationRows();
  assert.equal(delayRows.length, 2, 'one minimum notification per affected appointment');
  assert.deepEqual(
    new Set(delayRows.map((item) => item.delivery_scope_key)),
    new Set([firstAppointment, secondAppointment]),
  );
  for (const notification of delayRows) {
    assert.equal(notification.status, 'delivered');
    assert.deepEqual(Object.keys(notification.field_values).toSorted(), [
      'action_reference',
      'appointment_reference',
      'delay_date_label',
      'delay_minutes_label',
      'doctor_display_name',
      'facility_display_name',
    ]);
    assert.equal(
      notification.field_values['appointment_reference'],
      notification.delivery_scope_key,
    );
    assert.equal(notification.field_values['raw_contact'], undefined);
    assert.equal(notification.field_values['destination'], undefined);
    assert.equal(notification.field_values['token'], undefined);
  }
  const replayAdapter = new DurableClinicSchedulingSyntheticMessagingAdapter(workerUrl, 'local');
  const replay = new PostgresClinicSchedulingNotificationProcessor(
    workerUrl,
    replayAdapter,
    'f009-e2e-reconnect',
  );
  try {
    await processUntilIdle(replay);
  } finally {
    await replay.close();
    await replayAdapter.close();
  }
  assert.equal((await notificationRows()).length, 2, 'reconnect/replay remains deduplicated');

  await resetScenario();
  const absenceFirstAppointment = await book('2030-01-07T07:00:00Z', 'absence-a');
  const absenceSecondAppointment = await book('2030-01-07T08:00:00Z', 'absence-b');
  await absence('absence');
  const absenceStateBeforeWorker = await appointmentQueueSnapshot([
    absenceFirstAppointment,
    absenceSecondAppointment,
  ]);
  const absenceProcessorAdapter = new DurableClinicSchedulingSyntheticMessagingAdapter(
    workerUrl,
    'local',
  );
  const absenceProcessor = new PostgresClinicSchedulingNotificationProcessor(
    workerUrl,
    absenceProcessorAdapter,
    'f009-e2e-absence',
  );
  try {
    await processUntilIdle(absenceProcessor);
  } finally {
    await absenceProcessor.close();
    await absenceProcessorAdapter.close();
  }
  assert.deepEqual(
    await appointmentQueueSnapshot([absenceFirstAppointment, absenceSecondAppointment]),
    absenceStateBeforeWorker,
    'absence notification processing must not mutate appointment or queue state',
  );
  const absenceRows = await notificationRows();
  assert.equal(absenceRows.length, 1, 'absence only addresses the overlapping appointment');
  assert.equal(absenceRows[0]?.status, 'delivered');
  assert.deepEqual(Object.keys(absenceRows[0]?.field_values ?? {}).toSorted(), [
    'affected_interval_label',
    'appointment_reference',
    'doctor_display_name',
    'facility_display_name',
    'replacement_instruction',
  ]);
});

test('superseded overlay resolves current exception and adapter failure retries without domain rollback or sentinel leakage', async () => {
  await resetScenario();
  await book('2030-01-07T07:00:00Z', 'overlay-a');
  await delay(10, 'overlay-old');
  await delay(20, 'overlay-current');
  const overlayEvents = await clinicEvents();
  assert.equal(overlayEvents.length, 2);
  const overlayAdapter = new DurableClinicSchedulingSyntheticMessagingAdapter(workerUrl, 'local');
  const overlayProcessor = new PostgresClinicSchedulingNotificationProcessor(
    workerUrl,
    overlayAdapter,
    'f009-e2e-overlay',
  );
  try {
    await processUntilIdle(overlayProcessor);
  } finally {
    await overlayProcessor.close();
    await overlayAdapter.close();
  }
  assert.equal((await notificationRows()).length, 1, 'superseded overlay emits no stale recipient');
  assert.ok((await clinicEvents()).every((event) => event.state === 'delivered'));

  await resetScenario();
  const failedAppointment = await book('2030-01-07T07:00:00Z', 'failure-a');
  await delay(15, 'failure');
  const failureStateBeforeWorker = await appointmentQueueSnapshot([failedAppointment]);
  const failingAdapter = {
    code: 'local-synthetic' as const,
    send: async () => {
      throw new Error('raw-contact-destination-sentinel');
    },
  };
  const failingProcessor = new PostgresClinicSchedulingNotificationProcessor(
    workerUrl,
    failingAdapter,
    'f009-e2e-failure',
  );
  try {
    assert.equal(await failingProcessor.processNext(), 'retry');
  } finally {
    await failingProcessor.close();
  }
  assert.deepEqual(
    await appointmentQueueSnapshot([failedAppointment]),
    failureStateBeforeWorker,
    'failed notification processing must not mutate appointment or queue state',
  );
  const failedEvent = row(await clinicEvents());
  assert.equal(failedEvent.state, 'pending');
  assert.equal(failedEvent.last_error_code, 'clinic-notification-processing-failed');
  const failedNotification = row(await notificationRows());
  assert.equal(failedNotification.status, 'failed');
  assert.equal(failedNotification.attempt_count, 1);
  const firstAttempts = await deliveryAttempts(failedEvent.id);
  assert.equal(firstAttempts.length, 1);
  assert.equal(firstAttempts[0]?.attempt_number, 1);
  assert.equal(firstAttempts[0]?.outcome, 'transient_failure');
  assert.equal(firstAttempts[0]?.safe_error_code, 'clinic-notification-processing-failed');
  assert.equal(firstAttempts[0]?.status, 'failed');
  assert.equal(firstAttempts[0]?.attempt_count, 1);
  const exception = row(
    await owner<{ exception_type: string; reason: string }[]>`
    SELECT exception_type,reason FROM clinical.schedule_exceptions WHERE schedule_id=${ids.schedule}::uuid AND superseded_at IS NULL
  `,
  );
  assert.equal(exception.exception_type, 'delay');
  assert.match(exception.reason, /synthetic delay/);
  await assertNoSentinel();
  await owner`UPDATE platform.outbox_events SET available_at=statement_timestamp() WHERE id=${failedEvent.id}::uuid`;
  const reconnectAdapter = new DurableClinicSchedulingSyntheticMessagingAdapter(workerUrl, 'local');
  const reconnectProcessor = new PostgresClinicSchedulingNotificationProcessor(
    workerUrl,
    reconnectAdapter,
    'f009-e2e-reconnect-failure',
  );
  try {
    await processUntilIdle(reconnectProcessor);
  } finally {
    await reconnectProcessor.close();
    await reconnectAdapter.close();
  }
  assert.deepEqual(
    await appointmentQueueSnapshot([failedAppointment]),
    failureStateBeforeWorker,
    'replayed notification processing must not mutate appointment or queue state',
  );
  const deliveredNotification = row(await notificationRows());
  assert.equal(deliveredNotification.status, 'delivered');
  assert.equal(deliveredNotification.attempt_count, 2);
  const completedAttempts = await deliveryAttempts(failedEvent.id);
  assert.deepEqual(
    completedAttempts.map((attempt) => attempt.attempt_number),
    [1, 2],
  );
  assert.equal(completedAttempts[1]?.outcome, 'delivered');
  assert.equal(completedAttempts[1]?.status, 'delivered');
  assert.equal(completedAttempts[1]?.attempt_count, 2);
  await assertNoSentinel();
});
