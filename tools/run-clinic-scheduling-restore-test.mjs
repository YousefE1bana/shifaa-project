import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

const mode = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'fixture';
if (mode !== 'fixture') throw new Error(`Unsupported clinic scheduling restore mode: ${mode}`);

const root = process.cwd();
const runId = randomUUID().replaceAll('-', '').slice(0, 16);
const sourceDatabase = `shifaa_f009_rs_${runId}_src`;
const targetDatabase = `shifaa_f009_rs_${runId}_dst`;
const reportPath = join(
  root,
  'specs/009-clinic-scheduling-appointments-queue/evidence/operations/restore-report.md',
);
const captureEvidence = process.env.FEATURE_009_CAPTURE_EVIDENCE === '1';
const rpoLimitMinutes = 15;
const rtoLimitMinutes = 60;
const createdDatabases = new Set();
const migrations = [
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
const migrationNames = migrations.map((migration) => `\`${migration}\``).join(', ');

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: options.binary ? null : 'utf8',
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.input || options.binary ? 'pipe' : options.quiet ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `docker ${args.join(' ')} failed\n${safeDiagnostics(result.stderr?.toString?.() ?? '')}`,
    );
  return result;
}
function safeDiagnostics(value) {
  return value
    .replaceAll('restore fixture block', '[reason redacted]')
    .replaceAll('synthetic restore worker replay', '[reason redacted]');
}

function psql(database, args, options = {}) {
  return docker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      options.user ?? 'shifaa_owner',
      '-d',
      database,
      ...args,
    ],
    options,
  );
}
function create(database) {
  psql('postgres', ['-c', `CREATE DATABASE ${database}`], { quiet: true });
  createdDatabases.add(database);
}
function drop(database) {
  if (!createdDatabases.has(database)) return;
  psql('postgres', ['-c', `DROP DATABASE ${database} WITH (FORCE)`], { quiet: true });
  createdDatabases.delete(database);
}
function apply(database, path) {
  psql(database, ['-f', `/workspace/${path}`], { quiet: true });
}
function seedWorkerReplay(database) {
  psql(
    database,
    [
      '-c',
      `
      BEGIN;
      SELECT pg_catalog.set_config('shifaa.environment','local',true);
      SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8800-000000000001',true);
      INSERT INTO clinical.schedule_exceptions(
        id,schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,
        starts_at,ends_at,exception_type,delay_minutes,reason,created_by_person_id,updated_by_person_id
      ) VALUES (
        'f0090000-0000-4000-8200-000000000011',
        'f0090000-0000-4000-8200-000000000010',
        'f0090000-0000-4000-8100-000000000002',
        'f0090000-0000-4000-8800-000000000002',
        'Africa/Cairo','2026-09-13','2026-09-12T21:00:00Z','2026-09-13T21:00:00Z',
        'delay',15,'synthetic restore worker replay',
        'f0090000-0000-4000-8800-000000000001','f0090000-0000-4000-8800-000000000001'
      );
      UPDATE clinical.queue_scopes
      SET current_delay_exception_id='f0090000-0000-4000-8200-000000000011',version=version+1,
          estimates_recalculated_at=statement_timestamp()
      WHERE id='f0090000-0000-4000-8400-000000000010';
      SELECT clinical.record_mutation_effect_v1(
        'clinical.doctor_delay.declared.v1','doctor.delay.declared','schedule_exception',
        'f0090000-0000-4000-8200-000000000011',1,'f0090000-0000-4000-8100-000000000002'
      );
      UPDATE platform.outbox_events
      SET state='processing',attempt_count=2,lease_owner='synthetic-pre-restore-worker',
          lease_expires_at=statement_timestamp()-interval '1 minute'
      WHERE aggregate_id='f0090000-0000-4000-8200-000000000011'
        AND event_type='clinical.doctor_delay.declared.v1';
      COMMIT;
      `,
    ],
    { quiet: true },
  );
}
function latestDurableOutboxWrite(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      `SELECT max(created_at)::text FROM platform.outbox_events
       WHERE aggregate_id IN (
         'f0090000-0000-4000-8200-000000000010',
         'f0090000-0000-4000-8200-000000000011'
       )`,
    ],
    { quiet: true },
  );
  const timestamp = Date.parse(result.stdout.trim());
  if (!Number.isFinite(timestamp))
    throw new Error('latest durable outbox write timestamp is missing');
  return timestamp;
}

function databaseClock(database) {
  const result = psql(database, ['-At', '-c', 'SELECT clock_timestamp()::text'], { quiet: true });
  const timestamp = Date.parse(result.stdout.trim());
  if (!Number.isFinite(timestamp)) throw new Error('database recovery-start timestamp is missing');
  return timestamp;
}
function truth(database, includeOutboxOperationalFields = true) {
  const outboxOperationalFields = includeOutboxOperationalFields
    ? "'state',state,'attempt_count',attempt_count,'available_at',available_at,'last_error_code',last_error_code,'lease_owner',lease_owner,'lease_expires_at',lease_expires_at,'created_at',created_at,'updated_at',updated_at"
    : "'created_at',created_at";
  const result = psql(
    database,
    [
      '-At',
      '-c',
      `
    SELECT pg_catalog.jsonb_build_object(
      'schedules', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'facility_id',facility_id,'doctor_person_id',doctor_person_id,
        'timezone_name',timezone_name,'valid_from',valid_from,'valid_to',valid_to,
        'slot_duration_minutes',slot_duration_minutes,'fee_minor_units',fee_minor_units,
        'currency_code',currency_code,'status',status,'version',version
      ) ORDER BY id) FROM clinical.schedules),
      'schedule_windows', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'schedule_id',schedule_id,'iso_weekday',iso_weekday,'local_start',local_start,'local_end',local_end
      ) ORDER BY schedule_id,iso_weekday,local_start,local_end,id) FROM clinical.schedule_windows),
      'schedule_exceptions', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'schedule_id',schedule_id,'civil_date',civil_date,'starts_at',starts_at,
        'ends_at',ends_at,'exception_type',exception_type,'delay_minutes',delay_minutes,
        'reason_hash',pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(reason,'UTF8')),'hex'),'version',version
      ) ORDER BY id) FROM clinical.schedule_exceptions WHERE schedule_id='f0090000-0000-4000-8200-000000000010'),
      'appointments', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'patient_person_id',patient_person_id,'facility_id',facility_id,
        'doctor_person_id',doctor_person_id,'schedule_id',schedule_id,'starts_at',starts_at,
        'ends_at',ends_at,'timezone_name',timezone_name,'civil_date',civil_date,
        'local_start',local_start,'fee_minor_units',fee_minor_units,'currency_code',currency_code,
        'payment_method',payment_method,'status',status,'version',version
      ) ORDER BY id) FROM clinical.appointments WHERE schedule_id='f0090000-0000-4000-8200-000000000010'),
      'queue_scopes', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'facility_id',facility_id,'doctor_person_id',doctor_person_id,
        'civil_date',civil_date,'timezone_name',timezone_name,'next_queue_number',next_queue_number,
        'current_delay_exception_id',current_delay_exception_id,'version',version
      ) ORDER BY id) FROM clinical.queue_scopes WHERE facility_id='f0090000-0000-4000-8100-000000000002'),
      'queue_entries', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'queue_scope_id',queue_scope_id,'appointment_id',appointment_id,
        'queue_number',queue_number,'waiting_order',waiting_order,'state',state,'version',version
      ) ORDER BY id) FROM clinical.queue_entries WHERE facility_id='f0090000-0000-4000-8100-000000000002'),
      'idempotency', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'method',method,'route_template',route_template,'state',state,
        'response_status',response_status,'response_body',response_body,
        'resource_type',resource_type,'resource_id',resource_id
      ) ORDER BY id) FROM platform.idempotency_records WHERE route_template='/v1/clinic/restore'),
      'audit', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'request_id',request_id,'occurred_at',occurred_at,'partition_key',partition_key,
        'actor_person_id',actor_person_id,'facility_id',facility_id,'action_code',action_code,
        'resource_type',resource_type,'resource_id',resource_id,'resource_version',resource_version,
        'outcome',outcome,'reason_code',reason_code,'previous_hash',previous_hash,'event_hash',event_hash
      ) ORDER BY id) FROM audit.events WHERE resource_id IN (
        'f0090000-0000-4000-8200-000000000010','f0090000-0000-4000-8200-000000000011'
      )),
      'outbox', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'event_type',event_type,'aggregate_type',aggregate_type,'aggregate_id',aggregate_id,
        'aggregate_version',aggregate_version,'payload',payload,${outboxOperationalFields}
      ) ORDER BY id) FROM platform.outbox_events WHERE aggregate_id IN (
        'f0090000-0000-4000-8200-000000000010','f0090000-0000-4000-8200-000000000011'
      ))
    )::text;
  `,
    ],
    { quiet: true },
  );
  return result.stdout.trim();
}
function runWorkerReplay(database) {
  const ownerDatabaseUrl = `postgres://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/${database}`;
  const workerDatabaseUrl = `postgres://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/${database}`;
  const workerSource = `
    import postgres from 'postgres';
    import { DurableClinicSchedulingSyntheticMessagingAdapter } from './src/adapters/local-synthetic-messaging.ts';
    import { PostgresClinicSchedulingNotificationProcessor } from './src/postgres-clinic-scheduling-notification-processor.ts';
    const ownerDatabaseUrl = process.env.OWNER_DATABASE_URL;
    const workerDatabaseUrl = process.env.WORKER_DATABASE_URL;
    const control = postgres(ownerDatabaseUrl, { max: 1, prepare: true });
    const adapter = new DurableClinicSchedulingSyntheticMessagingAdapter(workerDatabaseUrl, 'local');
    const processor = new PostgresClinicSchedulingNotificationProcessor(workerDatabaseUrl, adapter, 'f009-restore-worker');
    try {
      const disabled = await processor.processNext();
      await control\`UPDATE platform.feature_flags SET enabled=true,version=version+1,updated_at=statement_timestamp()
        WHERE code='clinic_scheduling.dispatch' AND environment='local'\`;
      const replay = await processor.processNext();
      const duplicate = await processor.processNext();
      process.stdout.write(JSON.stringify({ disabled, replay, duplicate }));
    } finally {
      await processor.close();
      await adapter.close();
      await control.end({ timeout: 5 });
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', workerSource],
    {
      cwd: join(root, 'services/worker'),
      encoding: 'utf8',
      env: {
        ...process.env,
        OWNER_DATABASE_URL: ownerDatabaseUrl,
        WORKER_DATABASE_URL: workerDatabaseUrl,
        NODE_ENV: 'development',
      },
      maxBuffer: 8 * 1024 * 1024,
      stdio: 'pipe',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `clinic notification worker replay failed\n${safeDiagnostics(result.stderr.trim())}`,
    );
  let evidence;
  try {
    evidence = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(
      `clinic notification worker returned invalid evidence: ${result.stdout.trim()}`,
    );
  }
  if (
    evidence.disabled !== 'idle' ||
    evidence.replay !== 'dead_letter' ||
    evidence.duplicate !== 'idle'
  )
    throw new Error(`unexpected clinic worker replay outcomes: ${JSON.stringify(evidence)}`);
  return evidence;
}
function runApplicationGates(database) {
  const databaseUrl = `postgres://shifaa_api:synthetic_api_only@127.0.0.1:5432/${database}`;
  const source = `
    import postgres from 'postgres';
    import { ClinicSchedulingService } from './src/modules/clinic-scheduling/service.ts';
    const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: true });
    try {
      const [gate] = await sql\`SELECT
        platform.feature_enabled('clinic_scheduling.server','local') AS server,
        platform.feature_enabled('clinic_scheduling.mutations','local') AS mutations\`;
      const flags = { 'clinic_scheduling.server': gate.server, 'clinic_scheduling.mutations': gate.mutations };
      const service = new ClinicSchedulingService({
        authorization: { authorize: async () => { throw new Error('authorization reached while mutation switch was off'); } },
        featureFlags: { enabled: async (code) => Boolean(flags[code]) },
        read: { searchDoctors: async () => ({ items: [], nextCursor: null, freshness: 'fresh' }) },
        clock: { now: () => new Date() },
        cache: { get: async () => null, set: async () => undefined },
        repository: { updateSchedule: async () => { throw new Error('repository reached while mutation switch was off'); } },
      });
      const read = await service.searchDoctors(null, {}, { limit: 1 });
      const prices = await sql\`SELECT fee_minor_units,currency_code,payment_method,schedule_version
        FROM clinical.read_schedule_public_pricing_v1(
          'f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','2026-09-13','2026-09-13'
        )\`;
      const pricing = prices.map((row) => [Number(row.fee_minor_units),String(row.currency_code).trim(),row.payment_method,Number(row.schedule_version)]);
      let mutation;
      try {
        await service.updateSchedule({ actor: {} }, 'f0090000-0000-4000-8200-000000000010', 1, {});
        throw new Error('mutation unexpectedly passed');
      } catch (error) {
        mutation = error?.code;
        if (mutation !== 'mutations-disabled') throw error;
      }
      if (!read || read.degraded || read.items.length !== 0 || mutation !== 'mutations-disabled' ||
          pricing.length < 1 || pricing.some((row) => JSON.stringify(row) !== JSON.stringify([10000,'EGP','cash_on_arrival',2])) )
        throw new Error('safe-read / mutation-gate assertion failed');
      process.stdout.write(JSON.stringify({ safe_read: 'fresh', mutation, server: flags['clinic_scheduling.server'], mutations: flags['clinic_scheduling.mutations'], pricing }));
    } finally {
      await sql.end({ timeout: 5 });
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', source],
    {
      cwd: join(root, 'services/api'),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' },
      maxBuffer: 8 * 1024 * 1024,
      stdio: 'pipe',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `clinic service gate exercise failed\n${safeDiagnostics(result.stderr.trim())}`,
    );
  let evidence;
  try {
    evidence = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`clinic service gate returned invalid evidence: ${result.stdout.trim()}`);
  }
  if (
    evidence.safe_read !== 'fresh' ||
    evidence.mutation !== 'mutations-disabled' ||
    evidence.server !== true ||
    evidence.mutations !== false ||
    !Array.isArray(evidence.pricing) ||
    evidence.pricing.length < 1
  )
    throw new Error(`unexpected clinic service gate outcomes: ${JSON.stringify(evidence)}`);
  return evidence;
}
function setLocalDispatch(database, enabled) {
  psql(
    database,
    [
      '-c',
      `UPDATE platform.feature_flags SET enabled=${enabled ? 'true' : 'false'},version=version+1,updated_at=statement_timestamp()
       WHERE code='clinic_scheduling.dispatch' AND environment='local'`,
    ],
    { quiet: true },
  );
}
function setLocalServerReads(database) {
  psql(
    database,
    [
      '-c',
      "UPDATE platform.feature_flags SET enabled=true,version=version+1,updated_at=statement_timestamp() WHERE code='clinic_scheduling.server' AND environment='local'",
    ],
    { quiet: true },
  );
}
function safeReadAndKillSwitchTruth(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      `
      SELECT pg_catalog.jsonb_build_object(
        'server', (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.server' AND environment='local'),
        'safe_reads', (SELECT constraints->>'safe_reads' FROM platform.feature_flags WHERE code='clinic_scheduling.server' AND environment='local'),
        'mutations', (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.mutations' AND environment='local'),
        'dispatch', (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.dispatch' AND environment='local'),
        'production_dispatch', (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.dispatch' AND environment='production'),
        'production_sms', (SELECT constraints->>'production_sms' FROM platform.feature_flags WHERE code='clinic_scheduling.dispatch' AND environment='production'),
        'pricing', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(fee_minor_units,currency_code,payment_method,schedule_version))
          FROM clinical.read_schedule_public_pricing_v1(
            'f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','2026-09-13','2026-09-13'
          ))
      )::text;
      `,
    ],
    { quiet: true },
  );
  const evidence = JSON.parse(result.stdout.trim());
  const expectedPricing = JSON.stringify([10000, 'EGP', 'cash_on_arrival', 2]);
  if (
    evidence.server !== true ||
    evidence.safe_reads !== 'true' ||
    evidence.mutations !== false ||
    evidence.dispatch !== false ||
    evidence.production_dispatch !== false ||
    evidence.production_sms !== 'false' ||
    !Array.isArray(evidence.pricing) ||
    evidence.pricing.length < 1 ||
    evidence.pricing.some((row) => JSON.stringify(row) !== expectedPricing)
  ) {
    throw new Error(`safe-read or kill-switch profile changed: ${JSON.stringify(evidence)}`);
  }
  return evidence;
}
function workerEvidence(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      `SELECT pg_catalog.jsonb_build_object(
        'event_state',(SELECT state FROM platform.outbox_events WHERE aggregate_id='f0090000-0000-4000-8200-000000000011' AND event_type='clinical.doctor_delay.declared.v1'),
        'attempt_count',(SELECT attempt_count FROM platform.outbox_events WHERE aggregate_id='f0090000-0000-4000-8200-000000000011' AND event_type='clinical.doctor_delay.declared.v1'),
        'receipts',(SELECT count(*) FROM platform.event_receipts r JOIN platform.outbox_events e ON e.id=r.event_id WHERE e.aggregate_id='f0090000-0000-4000-8200-000000000011' AND r.consumer='clinic-scheduling-notifications'),
        'notifications',(SELECT count(*) FROM platform.notifications n JOIN platform.outbox_events e ON e.id=n.source_event_id WHERE e.aggregate_id='f0090000-0000-4000-8200-000000000011'),
        'provider_receipts',(SELECT count(*) FROM platform.synthetic_message_receipts)
      )::text`,
    ],
    { quiet: true },
  );
  const evidence = JSON.parse(result.stdout.trim());
  if (
    evidence.event_state !== 'dead_letter' ||
    evidence.attempt_count !== 3 ||
    evidence.receipts !== 1 ||
    evidence.notifications !== 0 ||
    evidence.provider_receipts !== 0
  ) {
    throw new Error(`unexpected post-restore worker dedup truth: ${JSON.stringify(evidence)}`);
  }
  return evidence;
}
function roleGrantEvidence(database) {
  const result = psql(
    database,
    [
      '-At',
      '-c',
      `SELECT pg_catalog.jsonb_build_object(
        'api_feature_gate',pg_catalog.has_function_privilege('shifaa_api','platform.feature_enabled(text,text)','EXECUTE'),
        'api_public_pricing',pg_catalog.has_function_privilege('shifaa_api','clinical.read_schedule_public_pricing_v1(uuid,uuid,date,date)','EXECUTE'),
        'api_doctor_search',pg_catalog.has_function_privilege('shifaa_api','clinical.search_doctors_v1(text,uuid,double precision,double precision,integer,date,double precision,uuid,uuid,integer)','EXECUTE'),
        'api_no_direct_schedule_read',NOT pg_catalog.has_table_privilege('shifaa_api','clinical.schedules','SELECT'),
        'worker_feature_gate',pg_catalog.has_function_privilege('shifaa_worker','platform.feature_enabled(text,text)','EXECUTE'),
        'worker_claim',pg_catalog.has_function_privilege('shifaa_worker','platform.claim_next_clinic_scheduling_notification_event(text,integer)','EXECUTE'),
        'worker_recipients',pg_catalog.has_function_privilege('shifaa_worker','platform.clinic_scheduling_notification_recipients(uuid,text)','EXECUTE'),
        'worker_complete',pg_catalog.has_function_privilege('shifaa_worker','platform.complete_clinic_scheduling_notification_event(uuid,text,text,text,timestamptz)','EXECUTE'),
        'worker_delivery',pg_catalog.has_function_privilege('shifaa_worker','platform.deliver_clinic_scheduling_local_synthetic_message(text,text,text)','EXECUTE'),
        'worker_no_direct_schedule_read',NOT pg_catalog.has_table_privilege('shifaa_worker','clinical.schedules','SELECT')
      )::text`,
    ],
    { quiet: true },
  );
  const evidence = JSON.parse(result.stdout.trim());
  if (Object.values(evidence).some((granted) => granted !== true))
    throw new Error(
      `restored runtime-role grants are incomplete or overbroad: ${JSON.stringify(evidence)}`,
    );
  return evidence;
}

let stage = 'PostgreSQL stack readiness';
docker(['compose', 'up', '-d', '--wait', 'postgres']);
try {
  stage = 'synthetic source migration and seed';
  create(sourceDatabase);
  for (const migration of migrations) apply(sourceDatabase, migration);
  apply(sourceDatabase, 'infra/db/fixtures/clinic-scheduling-restore.sql');
  seedWorkerReplay(sourceDatabase);
  const sourceTruth = truth(sourceDatabase);
  const sourceDurableTruth = truth(sourceDatabase, false);
  if (!sourceTruth || sourceTruth === 'null')
    throw new Error('synthetic source truth set was empty');
  const latestDurableWriteAt = latestDurableOutboxWrite(sourceDatabase);
  stage = 'synthetic logical backup';
  const dump = docker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-Fc',
      '-U',
      'shifaa_owner',
      '-d',
      sourceDatabase,
    ],
    { binary: true, quiet: true },
  ).stdout;
  if (!Buffer.isBuffer(dump) || dump.length === 0)
    throw new Error('logical restore dump was empty');
  const recoveryStartedAt = databaseClock(sourceDatabase);
  const recoveryStarted = performance.now();
  stage = 'isolated logical restore';
  create(targetDatabase);
  docker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '--exit-on-error',
      '--no-owner',
      '-U',
      'shifaa_owner',
      '-d',
      targetDatabase,
    ],
    { input: dump, quiet: true },
  );
  const targetTruth = truth(targetDatabase);
  if (targetTruth !== sourceTruth) throw new Error('restored durable truth mismatch');

  stage = 'forward-only migration after durable restore';
  apply(
    targetDatabase,
    'supabase/migrations/20260924000100_f009_patient_queue_delay_projection.sql',
  );
  const postRollForwardTruth = truth(targetDatabase);
  if (postRollForwardTruth !== sourceTruth)
    throw new Error('forward-only migration changed restored durable truth');

  stage = 'restored SEC-007/API/worker runtime grants';
  apply(targetDatabase, 'infra/db/tests/function-execute-privileges.sql');
  const grants = roleGrantEvidence(targetDatabase);

  stage = 'safe-read and mutation-kill-switch checks';
  setLocalServerReads(targetDatabase);
  const applicationGates = runApplicationGates(targetDatabase);
  const safeReadBeforeReplay = safeReadAndKillSwitchTruth(targetDatabase);

  stage = 'worker dispatch-off and replay/dedup checks';
  let workerReplay;
  try {
    workerReplay = runWorkerReplay(targetDatabase);
  } finally {
    setLocalDispatch(targetDatabase, false);
  }
  const replayTruth = workerEvidence(targetDatabase);
  const safeReadAfterReplay = safeReadAndKillSwitchTruth(targetDatabase);
  if (JSON.stringify(safeReadAfterReplay.pricing) !== JSON.stringify(safeReadBeforeReplay.pricing))
    throw new Error('safe-read projection changed across worker replay');
  if (truth(targetDatabase, false) !== sourceDurableTruth)
    throw new Error('worker replay changed restored clinical/idempotency/audit/outbox content');

  const rpoMinutes = (recoveryStartedAt - latestDurableWriteAt) / 60_000;
  const rtoMinutes = (performance.now() - recoveryStarted) / 60_000;
  if (rpoMinutes < 0 || rpoMinutes > rpoLimitMinutes)
    throw new Error(
      `synthetic recovery-point age ${rpoMinutes}m is outside 0..${rpoLimitMinutes}m`,
    );
  if (rtoMinutes > rtoLimitMinutes)
    throw new Error(`RTO ${rtoMinutes}m exceeds ${rtoLimitMinutes}m`);

  stage = 'run-scoped synthetic database cleanup';
  drop(sourceDatabase);
  drop(targetDatabase);
  const remainingDatabases = psql(
    'postgres',
    [
      '-At',
      '-c',
      `SELECT count(*) FROM pg_catalog.pg_database WHERE datname IN ('${sourceDatabase}','${targetDatabase}')`,
    ],
    { quiet: true },
  ).stdout.trim();
  if (remainingDatabases !== '0')
    throw new Error('run-scoped synthetic database cleanup was incomplete');

  stage = 'restore evidence report';
  if (captureEvidence) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      `# Feature 009 synthetic restore report\n\n- Verdict: **PASS — synthetic profile only**\n- Scope: local disposable PostgreSQL logical backup/restore and synthetic worker recovery. This is not a production disaster-recovery certification.\n- Fixture: \`infra/db/fixtures/clinic-scheduling-restore.sql\`, plus one synthetic doctor-delay event with an expired worker lease and no published notification-template release. No production identifiers, PHI, vendor calls, or real delivery were used.\n- Migration chain applied in order: ${migrationNames}.\n- Durable truth: source, restored target before roll-forward, and restored target after the forward-only migration matched across schedules/versions, schedule windows, exceptions, appointments, queue scopes/entries/order, completed idempotency response, audit events, and transactional outbox payloads. The post-replay durable truth still matched.\n- Runtime-role grants: pg_restore retained ACLs; ${Object.keys(grants).length} API/worker function-execute and direct-schedule-read boundary assertions passed. Restored public reads and worker replay connected through shifaa_api and shifaa_worker.\n- Backup size: ${dump.length} bytes.\n- Synthetic recovery-point age observation: ${rpoMinutes.toFixed(4)} minutes (limit ${rpoLimitMinutes}), from the latest seeded durable outbox write to target recovery start. The source was isolated and quiescent. This local observation is not a measured production RPO and says nothing about production replication or backup cadence.\n- RTO observation: ${rtoMinutes.toFixed(4)} minutes (limit ${rtoLimitMinutes}), from target creation through logical restore, forward-only migration, safe-read/mutation-gate checks, worker replay/dedup, and post-checks.\n- Safe-read readiness: the application \`ClinicSchedulingService\` public-search gate returned fresh using a synthetic read port while the server flag was on and the mutation flag was off; the real database public-pricing projection returned ${safeReadBeforeReplay.pricing.length} row(s), each fixed to EGP/cash_on_arrival and schedule version 2.\n- Mutation kill switch: an application \`updateSchedule\` attempt returned \`mutations-disabled\`; its repository and authorization seams were not reached. The local mutation flag remained off.\n- Dispatch kill switch and replay: the worker returned \`${workerReplay.disabled}\` while local dispatch was off; after enabling dispatch only in the disposable local target it reclaimed the expired lease and returned \`${workerReplay.replay}\`; a subsequent pass returned \`${workerReplay.duplicate}\`. Durable evidence: state=\`${replayTruth.event_state}\`, attempt_count=${replayTruth.attempt_count}, exactly ${replayTruth.receipts} event receipt, ${replayTruth.notifications} notification rows, and ${replayTruth.provider_receipts} synthetic provider receipts. No notification was delivered; the replay dead-lettered because no template release is published. Local dispatch was reset off. Production dispatch/SMS remained off.\n- Roll-forward: reapplied \`20260924000100_f009_patient_queue_delay_projection.sql\` after restoring durable rows. It changed no canonical durable data; no destructive rollback was performed. Disposable source/target databases were removed by run-scoped cleanup.\n- Retained gates: production SMS remains disabled under OPEN-VENDOR-002; production retention claims remain gated under OPEN-LEGAL-002.\n`,
      'utf8',
    );
  }
  console.log(
    `clinic-scheduling restore: PASS fixture=synthetic snapshots=3 worker=${workerReplay.replay}/${workerReplay.duplicate} receipts=${replayTruth.receipts} mutation_gate=${applicationGates.mutation} rpo_observation_minutes=${rpoMinutes.toFixed(4)} rto_minutes=${rtoMinutes.toFixed(4)} dump_bytes=${dump.length} retention=OPEN-LEGAL-002`,
  );
} catch (error) {
  if (captureEvidence) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      `# Feature 009 synthetic restore report\n\n- Verdict: **FAIL / NO ACCEPTANCE CLAIM**\n- Scope: local synthetic restore exercise did not complete all required checks.\n- Last stage: ${stage}.\n- Evidence: runner output contains the failing assertion or command diagnostics; no PASS metrics are recorded.\n- Migration chain configured: ${migrationNames}.\n- Production SMS remains disabled under OPEN-VENDOR-002; production retention claims remain gated under OPEN-LEGAL-002.\n`,
      'utf8',
    );
  }
  throw error;
} finally {
  drop(sourceDatabase);
  drop(targetDatabase);
}
