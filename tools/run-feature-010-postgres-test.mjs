import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const featureMigration =
  'supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql';
const c10ApiMigration = 'supabase/migrations/20260929001001_f010_c10_encounter_api.sql';
const c11UpdateMigration = 'supabase/migrations/20260929001002_f010_c11_encounter_update_api.sql';
const c12NoteMigration = 'supabase/migrations/20260929001003_f010_c12_note_signing.sql';
const c13CompletionMigration =
  'supabase/migrations/20260929001004_f010_c13_encounter_completion.sql';
const c17ReferralsMigration = 'supabase/migrations/20260929001005_f010_c17_referrals_api.sql';
const c18ReferralAcceptanceMigration =
  'supabase/migrations/20260929001006_f010_c18_referral_acceptance.sql';
const c19ReferralProjectionMigration =
  'supabase/migrations/20260929001007_f010_c19_referral_projections.sql';
const c22ContextMessagesMigration =
  'supabase/migrations/20260929001008_f010_c22_context_messages.sql';
const c23RealtimeHintMigration = 'supabase/migrations/20260930001000_f010_c23_realtime_hint.sql';
const c26PrivacyGuardsMigration = 'supabase/migrations/20260930001001_f010_c26_privacy_guards.sql';
const c13CompletionRedTest = 'infra/db/tests/feature-010-completion-red.sql';
const c13CompletionTest = 'infra/db/tests/feature-010-completion.sql';
const schemaTest = 'infra/db/tests/feature-010-schema.sql';
const lifecycleTest = 'infra/db/tests/feature-010-lifecycle.sql';
const storageTest = 'infra/db/tests/feature-010-storage-invariants.sql';
const rlsTest = 'infra/db/tests/feature-010-rls.sql';
const f009RegressionTest = 'infra/db/tests/clinic-scheduling-schema.sql';
const bookingSeamTest = 'infra/db/tests/feature-010-booking-seam.sql';
const apiTest = 'infra/db/tests/feature-010-api.sql';
const updateTest = 'infra/db/tests/feature-010-update.sql';
const notesTest = 'infra/db/tests/feature-010-notes.sql';
const referralsTest = 'infra/db/tests/feature-010-referrals.sql';
const referralAcceptanceTest = 'infra/db/tests/feature-010-referral-accept.sql';
const referralProjectionsTest = 'infra/db/tests/feature-010-referral-projections.sql';
const messagesTest = 'infra/db/tests/feature-010-messages.sql';
const messagesRaceRedTest = 'infra/db/tests/feature-010-messages-race-red.sql';
const defaultDenySnapshotSql = `SELECT format(
  'C04 default-deny snapshot: forced_rls=%s/6; policies=%s; direct_online_acl_entries=%s',
  count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity),
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid IN (
    'clinical.encounters'::regclass,
    'clinical.encounter_participants'::regclass,
    'clinical.clinical_notes'::regclass,
    'clinical.conditions'::regclass,
    'clinical.referrals'::regclass,
    'trust.messages'::regclass
  )),
  COALESCE(sum(acl.privilege_count), 0)
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN LATERAL (
  SELECT count(*) AS privilege_count
  FROM aclexplode(c.relacl) entry
  LEFT JOIN pg_roles r ON r.oid = entry.grantee
  WHERE entry.grantee = 0 OR r.rolname = ANY(ARRAY[
    'shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role'
  ])
) acl ON true
WHERE (n.nspname, c.relname) IN (
  ('clinical', 'encounters'),
  ('clinical', 'encounter_participants'),
  ('clinical', 'clinical_notes'),
  ('clinical', 'conditions'),
  ('clinical', 'referrals'),
  ('trust', 'messages')
);`;
const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const migrateCommand = packageJson.scripts?.['db:migrate'];

if (typeof migrateCommand !== 'string') {
  throw new Error('package.json is missing the db:migrate script.');
}

const migrations = [...migrateCommand.matchAll(/-f \/workspace\/([^\s]+\.sql)/g)].map((match) =>
  match[1].replaceAll('\\', '/'),
);
const featureMigrationIndex = migrations.indexOf(featureMigration);
const c10ApiMigrationIndex = migrations.indexOf(c10ApiMigration);
const c11UpdateMigrationIndex = migrations.indexOf(c11UpdateMigration);
const c12NoteMigrationIndex = migrations.indexOf(c12NoteMigration);
const c13CompletionMigrationIndex = migrations.indexOf(c13CompletionMigration);
const c17ReferralsMigrationIndex = migrations.indexOf(c17ReferralsMigration);
const c18ReferralAcceptanceMigrationIndex = migrations.indexOf(c18ReferralAcceptanceMigration);
const c19ReferralProjectionMigrationIndex = migrations.indexOf(c19ReferralProjectionMigration);
const c22ContextMessagesMigrationIndex = migrations.indexOf(c22ContextMessagesMigration);
const c23RealtimeHintMigrationIndex = migrations.indexOf(c23RealtimeHintMigration);
const c26PrivacyGuardsMigrationIndex = migrations.indexOf(c26PrivacyGuardsMigration);
const c13Red = process.env['SHIFAA_TEST_F010_C13_RED'] === 'true';
if (
  featureMigrationIndex < 0 ||
  migrations.lastIndexOf(featureMigration) !== featureMigrationIndex ||
  c10ApiMigrationIndex <= featureMigrationIndex ||
  migrations.lastIndexOf(c10ApiMigration) !== c10ApiMigrationIndex ||
  c11UpdateMigrationIndex !== c10ApiMigrationIndex + 1 ||
  migrations.lastIndexOf(c11UpdateMigration) !== c11UpdateMigrationIndex ||
  c12NoteMigrationIndex !== c11UpdateMigrationIndex + 1 ||
  migrations.lastIndexOf(c12NoteMigration) !== c12NoteMigrationIndex ||
  (!c13Red &&
    (c13CompletionMigrationIndex !== c12NoteMigrationIndex + 1 ||
      migrations.lastIndexOf(c13CompletionMigration) !== c13CompletionMigrationIndex)) ||
  c17ReferralsMigrationIndex !== c13CompletionMigrationIndex + 1 ||
  migrations.lastIndexOf(c17ReferralsMigration) !== c17ReferralsMigrationIndex ||
  c18ReferralAcceptanceMigrationIndex !== c17ReferralsMigrationIndex + 1 ||
  migrations.lastIndexOf(c18ReferralAcceptanceMigration) !== c18ReferralAcceptanceMigrationIndex ||
  c19ReferralProjectionMigrationIndex !== c18ReferralAcceptanceMigrationIndex + 1 ||
  migrations.lastIndexOf(c19ReferralProjectionMigration) !== c19ReferralProjectionMigrationIndex ||
  c22ContextMessagesMigrationIndex !== c19ReferralProjectionMigrationIndex + 1 ||
  migrations.lastIndexOf(c22ContextMessagesMigration) !== c22ContextMessagesMigrationIndex ||
  c23RealtimeHintMigrationIndex !== c22ContextMessagesMigrationIndex + 1 ||
  migrations.lastIndexOf(c23RealtimeHintMigration) !== c23RealtimeHintMigrationIndex ||
  c26PrivacyGuardsMigrationIndex !== c23RealtimeHintMigrationIndex + 1 ||
  migrations.lastIndexOf(c26PrivacyGuardsMigration) !== c26PrivacyGuardsMigrationIndex
) {
  throw new Error(
    `The standalone db:migrate chain must include ${featureMigration}, ${c10ApiMigration}, ${c11UpdateMigration}, ${c12NoteMigration}, ${c13CompletionMigration}, ${c17ReferralsMigration}, ${c18ReferralAcceptanceMigration}, ${c19ReferralProjectionMigration}, ${c22ContextMessagesMigration}, ${c23RealtimeHintMigration}, and ${c26PrivacyGuardsMigration} in order, each exactly once (C13 may be omitted only while probing C13 RED).`,
  );
}

const configuredRuntimes = [
  {
    name: 'shifaa-local-postgres',
    container: 'shifaa-local-postgres-postgres-1',
    user: 'shifaa_owner',
    adminDatabase: 'shifaa',
  },
  {
    name: 'shifaa-local-supabase',
    container: 'supabase_db_shifaa-local-supabase',
    user: 'supabase_admin',
    adminDatabase: 'postgres',
  },
];
const requestedRuntime = process.env['SHIFAA_TEST_POSTGRES_RUNTIME'];
const runtimes = requestedRuntime
  ? configuredRuntimes.filter((runtime) => runtime.name === requestedRuntime)
  : configuredRuntimes;
if (process.argv[2] === 'c28' && runtimes.length !== 2) {
  throw new Error(
    'C28 verification requires both named runtimes; a runtime filter cannot satisfy it.',
  );
}
if (runtimes.length === 0) {
  throw new Error(`Unknown SHIFAA_TEST_POSTGRES_RUNTIME: ${requestedRuntime}`);
}

function runDocker(runtime, args, { input, label }) {
  const dockerArgs = ['exec'];
  if (input !== undefined) dockerArgs.push('-i');
  dockerArgs.push(runtime.container, ...args);
  const dockerProcess = spawnSync('docker', dockerArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });

  if (dockerProcess.error || dockerProcess.status !== 0) {
    const detail = [dockerProcess.stdout, dockerProcess.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${label} failed${dockerProcess.status === null ? '' : ` (exit ${dockerProcess.status})`}${dockerProcess.error ? `: ${dockerProcess.error.message}` : ''}${detail ? `\n${detail}` : ''}`,
    );
  }

  return dockerProcess.stdout;
}

function runPsql(runtime, database, sql, label) {
  return runDocker(
    runtime,
    ['psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', runtime.user, '-d', database],
    { input: sql, label },
  );
}

function runPsqlTuples(runtime, database, sql, label) {
  return runDocker(
    runtime,
    ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', runtime.user, '-d', database],
    { input: sql, label },
  ).trim();
}

function startPsqlSession(runtime, database, label) {
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      runtime.container,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-U',
      runtime.user,
      '-d',
      database,
    ],
    { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const closed = new Promise((resolveClose, rejectClose) => {
    child.once('error', (error) =>
      rejectClose(new Error(`${label} could not start: ${error.message}`)),
    );
    child.once('close', (code, signal) => resolveClose({ code, signal }));
  });
  return {
    child,
    get output() {
      return `${stdout}${stderr}`;
    },
    write(sql) {
      return new Promise((resolveWrite, rejectWrite) => {
        if (child.stdin.destroyed || child.stdin.writableEnded) {
          rejectWrite(new Error(`${label} stdin is already closed.`));
          return;
        }
        child.stdin.write(sql, 'utf8', (error) => (error ? rejectWrite(error) : resolveWrite()));
      });
    },
    end(sql = '') {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end(sql);
    },
    closed,
  };
}

async function waitForSessionText(session, text, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (session.output.includes(text)) return;
    const result = await Promise.race([
      session.closed.then((closed) => ({ closed })),
      new Promise((resolveWait) => setTimeout(() => resolveWait(null), 25)),
    ]);
    if (result?.closed) {
      throw new Error(
        `${label} exited before emitting ${JSON.stringify(text)} (exit ${result.closed.code}):\n${session.output}`,
      );
    }
  }
  throw new Error(
    `${label} did not emit ${JSON.stringify(text)} within the lock-test deadline:\n${session.output}`,
  );
}

async function waitForLockWaiters(runtime, database, applicationNames, label) {
  const names = applicationNames.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');
  const sql = `SELECT count(*)::text FROM pg_catalog.pg_stat_activity WHERE application_name IN (${names}) AND wait_event_type='Lock';`;
  const deadline = Date.now() + 15000;
  let lastCount = '0';
  while (Date.now() < deadline) {
    lastCount = runDocker(
      runtime,
      ['psql', '-X', '-qAt', '-U', runtime.user, '-d', database, '-c', sql],
      { label: `${label}: inspect lock waiters` },
    ).trim();
    if (lastCount === String(applicationNames.length)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(
    `${label} did not place all contenders in a PostgreSQL lock wait; saw ${lastCount}/${applicationNames.length}.`,
  );
}

function candidateContext(personId, key, hash) {
  return `
SELECT pg_catalog.set_config('shifaa.person_id','${personId}',false);
SELECT pg_catalog.set_config('shifaa.environment','local',false);
SELECT pg_catalog.set_config('shifaa.test_now','2026-09-27T08:00:00Z',false);
SELECT pg_catalog.set_config('shifaa.action','clinic.scheduling',false);
SELECT pg_catalog.set_config('shifaa.aal','2',false);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',false);
SELECT pg_catalog.set_config('shifaa.idempotency_key','${key}',false);
SELECT pg_catalog.set_config('shifaa.request_hash','${hash}',false);
`;
}

function raceBookingSql(applicationName, personId, key, hash) {
  const request = `jsonb_build_object(
    'patient_person_id','${personId}',
    'facility_id','f0100000-0000-4000-8100-000000000001',
    'doctor_person_id','f0100000-0000-4000-8000-000000000002',
    'starts_at',make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo'),
    'ends_at',make_timestamptz(2030,9,1,11,0,0,'Africa/Cairo'),
    'timezone_name','Africa/Cairo',
    'civil_date','2030-09-01',
    'local_start','10:30',
    'payment_method','cash_on_arrival'
  )`;
  return `SET application_name='${applicationName}';\nBEGIN;\n${candidateContext(personId, key, hash)}SELECT clinical.create_appointment_v1(${request})->>'id';\nCOMMIT;\n`;
}

function primitiveVersionRaceSql(applicationName, personId, expectedScheduleVersion) {
  const request = `jsonb_build_object(
    'patient_person_id','${personId}',
    'facility_id','f0100000-0000-4000-8100-000000000001',
    'doctor_person_id','f0100000-0000-4000-8000-000000000002',
    'schedule_id','f0100000-0000-4000-8200-000000000001',
    'starts_at',make_timestamptz(2030,9,1,11,0,0,'Africa/Cairo'),
    'ends_at',make_timestamptz(2030,9,1,11,30,0,'Africa/Cairo'),
    'timezone_name','Africa/Cairo',
    'civil_date','2030-09-01',
    'local_start','11:00'
  )`;
  const slot = `jsonb_build_object(
    'starts_at',make_timestamptz(2030,9,1,11,0,0,'Africa/Cairo'),
    'ends_at',make_timestamptz(2030,9,1,11,30,0,'Africa/Cairo'),
    'timezone_name','Africa/Cairo',
    'civil_date','2030-09-01',
    'local_start','11:00'
  )`;
  return `SET application_name='${applicationName}';\nBEGIN;\nSELECT pg_catalog.set_config('shifaa.person_id','${personId}',false);\nSELECT clinical.book_appointment_internal_v1(${request},${expectedScheduleVersion},${slot});\nCOMMIT;\n`;
}

async function finishSessions(sessions, { release = false } = {}) {
  if (release) {
    await Promise.all(sessions.map((session) => session.write('ROLLBACK;\n').catch(() => {})));
  }
  for (const session of sessions) session.end();
  return Promise.all(sessions.map((session) => session.closed));
}

async function checkConcurrentBookingWinner(runtime, database) {
  const scheduleId = 'f0100000-0000-4000-8200-000000000001';
  const holder = startPsqlSession(runtime, database, `${runtime.name} C08 booking lock holder`);
  let contenders = [];
  try {
    await holder.write(
      `SET application_name='f010_c08_booking_holder';\nBEGIN;\nSELECT id::text || '|F010_BOOKING_LOCK_HELD' FROM clinical.schedules WHERE id='${scheduleId}' FOR UPDATE;\n`,
    );
    await waitForSessionText(
      holder,
      'F010_BOOKING_LOCK_HELD',
      `${runtime.name} booking lock holder`,
    );

    const candidates = [
      [
        'f010_c08_booking_a',
        'f0100000-0000-4000-8000-000000000003',
        'f010-c08-race-a',
        'f'.repeat(64),
      ],
      [
        'f010_c08_booking_b',
        'f0100000-0000-4000-8000-000000000004',
        'f010-c08-race-b',
        '0'.repeat(64),
      ],
    ];
    contenders = candidates.map(([name]) =>
      startPsqlSession(runtime, database, `${runtime.name} ${name}`),
    );
    contenders.forEach((session, index) => session.end(raceBookingSql(...candidates[index])));
    await waitForLockWaiters(
      runtime,
      database,
      candidates.map(([name]) => name),
      `${runtime.name} C08 one-winner booking race`,
    );
    await holder.write('COMMIT;\n');
    holder.end();
    const holderResult = await holder.closed;
    if (holderResult.code !== 0)
      throw new Error(
        `${runtime.name} booking holder failed (exit ${holderResult.code}):\n${holder.output}`,
      );
    const results = await Promise.all(contenders.map((session) => session.closed));
    const outputs = contenders.map((session) => session.output);
    const successes = results.filter((result) => result.code === 0).length;
    const conflicts = outputs.filter((output) => output.includes('23P01')).length;
    if (
      successes !== 1 ||
      conflicts !== 1 ||
      results.some((result, index) => result.code !== 0 && !outputs[index].includes('23P01'))
    ) {
      throw new Error(
        `${runtime.name} concurrent booking must produce one success and one 23P01 conflict; results=${JSON.stringify(results)}, outputs:\n${outputs.join('\n---\n')}`,
      );
    }

    const state = runPsqlTuples(
      runtime,
      database,
      `SELECT
      (SELECT count(*) FROM clinical.appointments WHERE starts_at=make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo'))::text || '|' ||
      (SELECT count(*) FROM platform.idempotency_records WHERE route_template='/v1/appointments' AND state='completed' AND resource_id IN (SELECT id FROM clinical.appointments WHERE starts_at=make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo')))::text || '|' ||
      (SELECT count(*) FROM audit.events WHERE resource_type='appointment' AND action_code='appointment.created' AND resource_id IN (SELECT id FROM clinical.appointments WHERE starts_at=make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo')))::text || '|' ||
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='appointment' AND event_type='clinical.appointment.changed.v1' AND aggregate_id IN (SELECT id FROM clinical.appointments WHERE starts_at=make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo')));`,
      `${runtime.name} C08 concurrent booking effects`,
    );
    if (state !== '1|1|1|1')
      throw new Error(
        `${runtime.name} booking race effects must be appointment/idempotency/audit/outbox=1 each, saw ${state}.`,
      );
    console.log(
      `${runtime.name}: C08 concurrent F009 booking produced one 23P01 loser; appointment/idempotency/audit/outbox=1 each.`,
    );
  } finally {
    await finishSessions([holder, ...contenders], { release: true });
  }
}

async function checkConcurrentVersionStale(runtime, database) {
  const scheduleId = 'f0100000-0000-4000-8200-000000000001';
  const expectedScheduleVersion = Number(
    runPsqlTuples(
      runtime,
      database,
      `SELECT version FROM clinical.schedules WHERE id='${scheduleId}';`,
      `${runtime.name} C08 version-race starting version`,
    ),
  );
  if (!Number.isInteger(expectedScheduleVersion) || expectedScheduleVersion < 1) {
    throw new Error(
      `${runtime.name} C08 fixture schedule has an invalid starting version: ${expectedScheduleVersion}.`,
    );
  }
  const holder = startPsqlSession(runtime, database, `${runtime.name} C08 version lock holder`);
  let contenders = [];
  try {
    await holder.write(
      `SET application_name='f010_c08_version_holder';\nBEGIN;\nSELECT id::text || '|F010_VERSION_LOCK_HELD' FROM clinical.schedules WHERE id='${scheduleId}' FOR UPDATE;\n${candidateContext('f0100000-0000-4000-8000-000000000001', 'f010-c08-version-update', '1'.repeat(64))}SELECT clinical.update_schedule_v1('${scheduleId}',${expectedScheduleVersion},jsonb_build_object('fee_minor_units',54321));\nSELECT 'F010_VERSION_BUMPED';\n`,
    );
    await waitForSessionText(
      holder,
      'F010_VERSION_BUMPED',
      `${runtime.name} schedule version update`,
    );

    const candidates = [
      ['f010_c08_version_a', 'f0100000-0000-4000-8000-000000000003'],
      ['f010_c08_version_b', 'f0100000-0000-4000-8000-000000000004'],
    ];
    contenders = candidates.map(([name]) =>
      startPsqlSession(runtime, database, `${runtime.name} ${name}`),
    );
    contenders.forEach((session, index) =>
      session.end(primitiveVersionRaceSql(...candidates[index], expectedScheduleVersion)),
    );
    await waitForLockWaiters(
      runtime,
      database,
      candidates.map(([name]) => name),
      `${runtime.name} C08 stale schedule version race`,
    );
    await holder.write('COMMIT;\n');
    holder.end();
    const holderResult = await holder.closed;
    if (holderResult.code !== 0)
      throw new Error(
        `${runtime.name} version holder failed (exit ${holderResult.code}):\n${holder.output}`,
      );
    const results = await Promise.all(contenders.map((session) => session.closed));
    const outputs = contenders.map((session) => session.output);
    if (
      results.some((result) => result.code === 0) ||
      outputs.some((output) => !output.includes('40001'))
    ) {
      throw new Error(
        `${runtime.name} stale-version contenders must both fail with 40001; results=${JSON.stringify(results)}, outputs:\n${outputs.join('\n---\n')}`,
      );
    }
    const state = runPsqlTuples(
      runtime,
      database,
      `SELECT
      (SELECT version FROM clinical.schedules WHERE id='${scheduleId}')::text || '|' ||
      (SELECT fee_minor_units FROM clinical.schedules WHERE id='${scheduleId}')::text || '|' ||
      (SELECT count(*) FROM clinical.appointments WHERE starts_at=make_timestamptz(2030,9,1,11,0,0,'Africa/Cairo'))::text;`,
      `${runtime.name} C08 stale-version state`,
    );
    const expectedState = `${expectedScheduleVersion + 1}|54321|0`;
    if (state !== expectedState)
      throw new Error(
        `${runtime.name} stale-version race state must be version/fee/appointments=${expectedState}, saw ${state}.`,
      );
    console.log(
      `${runtime.name}: C08 schedule-version race blocked both callers then returned 40001 after version advanced to ${expectedScheduleVersion + 1}.`,
    );
  } finally {
    await finishSessions([holder, ...contenders], { release: true });
  }
}

function completionRaceSql(applicationName, key, hash) {
  return `SET application_name='${applicationName}';
SET SESSION AUTHORIZATION shifaa_api;
BEGIN;
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.actor_role','CLN',true);
SELECT pg_catalog.set_config('shifaa.action','completeEncounter',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
SELECT pg_catalog.set_config('shifaa.idempotency_key','${key}',true);
SELECT pg_catalog.set_config('shifaa.request_hash','${hash}',true);
SELECT clinical.complete_encounter_api_v1(
  'f0101000-0000-4000-8800-000000000002',5,
  jsonb_build_object('summary','C13 concurrent completion winner','structuralConfirmation',true)
);
COMMIT;
`;
}

async function checkConcurrentCompletionWinner(runtime, templateDatabase) {
  const database = `f010_c13_race_${process.pid}_${randomBytes(5).toString('hex')}`;
  let databaseCreated = false;
  try {
    runPsql(
      runtime,
      runtime.adminDatabase,
      `CREATE DATABASE "${database}" TEMPLATE "${templateDatabase}";`,
      `${runtime.name} clone isolated completion-race database`,
    );
    databaseCreated = true;

    const fixture = readFileSync(resolve(root, updateTest), 'utf8');
    const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
    if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
      throw new Error(`${updateTest} no longer ends at its expected rollback boundary.`);
    }
    runPsql(
      runtime,
      database,
      `${fixture.slice(0, rollbackIndex)}\nCOMMIT;\n`,
      `${runtime.name} commit C11 fixture in isolated C13 race database`,
    );

    const appointmentId = 'f0101000-0000-4000-8500-000000000004';
    const holder = startPsqlSession(
      runtime,
      database,
      `${runtime.name} C13 completion lock holder`,
    );
    let contenders = [];
    try {
      await holder.write(
        `SET application_name='f010_c13_completion_holder';\nBEGIN;\nSELECT id::text || '|F010_C13_LOCK_HELD' FROM clinical.appointments WHERE id='${appointmentId}' FOR UPDATE;\n`,
      );
      await waitForSessionText(
        holder,
        'F010_C13_LOCK_HELD',
        `${runtime.name} C13 completion lock holder`,
      );

      const candidates = [
        ['f010_c13_complete_a', 'f010-c13-race-a', 'a'.repeat(64)],
        ['f010_c13_complete_b', 'f010-c13-race-b', 'b'.repeat(64)],
      ];
      contenders = candidates.map(([name]) =>
        startPsqlSession(runtime, database, `${runtime.name} ${name}`),
      );
      contenders.forEach((session, index) => session.end(completionRaceSql(...candidates[index])));
      await waitForLockWaiters(
        runtime,
        database,
        candidates.map(([name]) => name),
        `${runtime.name} C13 single-winner completion race`,
      );
      await holder.write('COMMIT;\n');
      holder.end();
      const holderResult = await holder.closed;
      if (holderResult.code !== 0) {
        throw new Error(
          `${runtime.name} C13 completion lock holder failed (exit ${holderResult.code}):\n${holder.output}`,
        );
      }

      const results = await Promise.all(contenders.map((session) => session.closed));
      const outputs = contenders.map((session) => session.output);
      const successes = results.filter((result) => result.code === 0).length;
      const staleConflicts = outputs.filter((output) => output.includes('40001')).length;
      if (
        successes !== 1 ||
        staleConflicts !== 1 ||
        results.some((result, index) => result.code !== 0 && !outputs[index].includes('40001'))
      ) {
        throw new Error(
          `${runtime.name} C13 completion race must produce one success and one 40001 loser; results=${JSON.stringify(results)}, outputs:\n${outputs.join('\n---\n')}`,
        );
      }

      const state = runPsqlTuples(
        runtime,
        database,
        `SELECT
          (SELECT count(*) FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002' AND status='completed')::text || '|' ||
          (SELECT version FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002')::text || '|' ||
          (SELECT status FROM clinical.appointments WHERE id='${appointmentId}') || '|' ||
          (SELECT state FROM clinical.queue_entries WHERE id='f0101000-0000-4000-8700-000000000004') || '|' ||
          (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/complete' AND state='completed')::text || '|' ||
          (SELECT count(*) FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.completed' AND resource_id='f0101000-0000-4000-8800-000000000002')::text || '|' ||
          (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.completed.v1' AND aggregate_id='f0101000-0000-4000-8800-000000000002');`,
        `${runtime.name} C13 concurrent completion effects`,
      );
      if (state !== '1|6|completed|completed|1|1|1') {
        throw new Error(
          `${runtime.name} C13 race effects must be completed triple/idempotency/audit/outbox=1 each, saw ${state}.`,
        );
      }
      console.log(
        `${runtime.name}: C13 PostgreSQL race blocked both callers, then produced one completion and one 40001 loser with exactly-once effects.`,
      );
    } finally {
      await finishSessions([holder, ...contenders], { release: true });
    }
  } finally {
    if (databaseCreated) dropScratchDatabase(runtime, database);
  }
}

function runPgDump(runtime, database, label) {
  const dump = runDocker(
    runtime,
    [
      'pg_dump',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--table=clinical.appointments',
      '--table=clinical.queue_entries',
      '--username',
      runtime.user,
      '--dbname',
      database,
    ],
    { label },
  );
  // pg_dump emits fresh random psql safety tokens on every invocation; they are not schema state.
  return dump.replace(/^\\(?:un)?restrict\s+\S+\s*$/gm, '');
}

function firstDifference(before, after) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  let line = 0;
  while (
    line < beforeLines.length &&
    line < afterLines.length &&
    beforeLines[line] === afterLines[line]
  ) {
    line += 1;
  }
  if (line === beforeLines.length && line === afterLines.length)
    return 'no textual difference found';
  const from = Math.max(0, line - 2);
  const to = Math.min(Math.max(beforeLines.length, afterLines.length), line + 3);
  return [
    `first differing line ${line + 1}`,
    `before:\n${beforeLines.slice(from, to).join('\n')}`,
    `after:\n${afterLines.slice(from, to).join('\n')}`,
  ].join('\n');
}

function runMigration(runtime, database, migrationPath, phase) {
  const sourcePath = resolve(root, migrationPath);
  const sourceDirectory = dirname(sourcePath);
  const source = readFileSync(sourcePath, 'utf8');
  const sql = source.replace(/^\\ir\s+(\S+)\s*$/gm, (_directive, includedPath) => {
    const includeFile = resolve(sourceDirectory, includedPath);
    const includeSql = readFileSync(includeFile, 'utf8');
    return `-- Relative psql includes cannot resolve from the stdin-based runner.\n${includeSql}`;
  });
  if (/^\\ir\s+\S+/m.test(sql)) {
    throw new Error(`${migrationPath} contains an unsupported nested psql include.`);
  }
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${migrationPath}`);
}

function checkSchema(runtime, database, phase) {
  const sql = readFileSync(resolve(root, schemaTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${schemaTest}`);
}

function checkLifecycle(runtime, database, phase) {
  const sql = readFileSync(resolve(root, lifecycleTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${lifecycleTest}`);
}

function checkStorage(runtime, database, phase) {
  const sql = readFileSync(resolve(root, storageTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${storageTest}`);
}

function checkRls(runtime, database, phase) {
  const sql = readFileSync(resolve(root, rlsTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${rlsTest}`);
}

function checkF009Regression(runtime, database, phase) {
  const sql = readFileSync(resolve(root, f009RegressionTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${f009RegressionTest}`);
}

function checkBookingSeam(runtime, database, phase) {
  const sql = readFileSync(resolve(root, bookingSeamTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${bookingSeamTest}`);
}

function checkApi(runtime, database, phase) {
  const sql = readFileSync(resolve(root, apiTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${apiTest}`);
}

function checkUpdate(runtime, database, phase) {
  const sql = readFileSync(resolve(root, updateTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${updateTest}`);
}

function checkNotes(runtime, database, phase) {
  const fixture = readFileSync(resolve(root, updateTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${updateTest} no longer ends at its expected rollback boundary.`);
  }
  const vectors = readFileSync(resolve(root, notesTest), 'utf8');
  runPsql(
    runtime,
    database,
    `${fixture.slice(0, rollbackIndex)}\n${vectors}\nROLLBACK;\n`,
    `${runtime.name} ${phase}: C11 encounter fixture plus C12 signing/projection vectors`,
  );
}

function checkCompletion(runtime, database, phase) {
  const fixture = readFileSync(resolve(root, updateTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${updateTest} no longer ends at its expected rollback boundary.`);
  }
  const vectors = readFileSync(resolve(root, c13CompletionTest), 'utf8');
  runPsql(
    runtime,
    database,
    `${fixture.slice(0, rollbackIndex)}\n${vectors}\nROLLBACK;\n`,
    `${runtime.name} ${phase}: C11 encounter fixture plus C13 completion vectors`,
  );
}

function checkMessages(runtime, database, phase) {
  const fixture = readFileSync(resolve(root, updateTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${updateTest} no longer ends at its expected rollback boundary.`);
  }
  const vectors = readFileSync(resolve(root, messagesTest), 'utf8');
  runPsql(
    runtime,
    database,
    `${fixture.slice(0, rollbackIndex)}\n${vectors}\nROLLBACK;\n`,
    `${runtime.name} ${phase}: C11 encounter fixture plus C22 message vectors`,
  );
}

function commitMessagesFixture(runtime, database) {
  const fixture = readFileSync(resolve(root, updateTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${updateTest} no longer ends at its expected rollback boundary.`);
  }
  runPsql(
    runtime,
    database,
    `${fixture.slice(0, rollbackIndex)}\nCOMMIT;\n`,
    `${runtime.name}: provision committed synthetic C11 fixture for C22 API smoke`,
  );
}

function runMessageApiPostgresTest(runtime, database, projection = false, authorityRace = false) {
  if (authorityRace && runtime.name !== 'shifaa-local-postgres') return;
  const dockerPort = spawnSync('docker', ['port', runtime.container, '5432/tcp'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (dockerPort.error || dockerPort.status !== 0) {
    throw new Error(
      `${runtime.name} PostgreSQL host port lookup failed: ${dockerPort.stderr ?? dockerPort.error?.message ?? ''}`,
    );
  }
  const port = dockerPort.stdout.trim().split(/\r?\n/)[0]?.split(':').at(-1);
  if (!port || !/^\d+$/.test(port)) {
    throw new Error(`${runtime.name} has no usable host-mapped PostgreSQL port.`);
  }
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--fileParallelism=false',
      authorityRace
        ? 'services/api/test/feature-010-authority-race.postgres.integration.test.ts'
        : projection
          ? 'services/api/test/feature-010-encounter-projection.postgres.integration.test.ts'
          : 'services/api/test/feature-010-messages.postgres.integration.test.ts',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        SHIFAA_F010_C22_DATABASE: database,
        SHIFAA_F010_C28_DATABASE: database,
        SHIFAA_PG_HOST: '127.0.0.1',
        SHIFAA_PG_PORT: port,
      },
      encoding: 'utf8',
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${runtime.name} ${projection ? 'C28 encounter projection' : 'C22 message'} real-PostgreSQL API regression failed with status ${result.status}.`,
    );
  }
}

function checkEncounterProjectionApi(runtime, templateDatabase) {
  const database = `f010_c28_projection_${process.pid}_${randomBytes(8).toString('hex')}`;
  let created = false;
  try {
    runPsql(
      runtime,
      runtime.adminDatabase,
      `CREATE DATABASE "${database}" TEMPLATE "${templateDatabase}";`,
      `${runtime.name} clone isolated encounter projection regression`,
    );
    created = true;
    setC22ApiSmokeClock(runtime, database);
    runMessageApiPostgresTest(runtime, database, true, true);
    runMessageApiPostgresTest(runtime, database, true);
  } finally {
    if (created) dropScratchDatabase(runtime, database);
  }
}

const c22RaceCiphertext = Buffer.from(
  `01${'d1'.repeat(12)}${'e2'.repeat(16)}${'f3'.repeat(96)}`,
  'hex',
).toString('base64');

function c22SendHeldSql(applicationName, key, hash) {
  return `SET application_name='${applicationName}';
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.action','sendContextMessage',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
SELECT pg_catalog.set_config('shifaa.idempotency_key','${key}',true);
SELECT pg_catalog.set_config('shifaa.request_hash','${hash}',true);
SELECT trust.send_context_message_api_v1(
  'f0101000-0000-4000-8500-000000000004'::uuid,
  pg_catalog.jsonb_build_object('bodyCiphertext','${c22RaceCiphertext}')
)->>'id' || '|F010_C22_SEND_HELD';
`;
}

function c22SendContenderSql(applicationName, key, hash) {
  return `SET application_name='${applicationName}';
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.action','sendContextMessage',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
SELECT pg_catalog.set_config('shifaa.idempotency_key','${key}',true);
SELECT pg_catalog.set_config('shifaa.request_hash','${hash}',true);
DO $c22_send_after_completion$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM trust.send_context_message_api_v1(
      'f0101000-0000-4000-8500-000000000004'::uuid,
      pg_catalog.jsonb_build_object('bodyCiphertext','${c22RaceCiphertext}')
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 send succeeded after completion won the lock'; END IF;
END
$c22_send_after_completion$;
SELECT 'F010_C22_SEND_DENIED_AFTER_COMPLETION';
COMMIT;
`;
}

function c22CompletionHeldSql(applicationName) {
  return `SET application_name='${applicationName}';
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.actor_role','CLN',true);
SELECT pg_catalog.set_config('shifaa.action','completeEncounter',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
SELECT pg_catalog.set_config('shifaa.idempotency_key','f010-c22-race-complete-01',true);
SELECT pg_catalog.set_config('shifaa.request_hash','${'c'.repeat(64)}',true);
DO $c22_complete_lifecycle$
BEGIN
  PERFORM clinical.complete_encounter_api_v1(
  'f0101000-0000-4000-8800-000000000002',5,
  pg_catalog.jsonb_build_object('summary','C22 deterministic lifecycle race','structuralConfirmation',true)
  );
END
$c22_complete_lifecycle$;
SELECT 'F010_C22_COMPLETION_HELD';
`;
}

function c22CompletionContenderSql(applicationName) {
  return `${c22CompletionHeldSql(applicationName)}COMMIT;\n`;
}

function c22RaceState(runtime, database, expected, label) {
  const state = runPsqlTuples(
    runtime,
    database,
    `SELECT
      (SELECT count(*) FROM trust.messages WHERE context_type='appointment' AND context_id='f0101000-0000-4000-8500-000000000004' AND deleted_at IS NULL)::text || '|' ||
      (SELECT count(*) FROM platform.idempotency_records WHERE route_template='/v1/contexts/{contextType}/{contextId}/messages')::text || '|' ||
      (SELECT count(*) FROM audit.events WHERE resource_type='context_message' AND action_code='context_message.created')::text || '|' ||
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='context_message' AND event_type='clinical.context_message.created.v1')::text || '|' ||
      (SELECT count(*) FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002' AND status='completed')::text || '|' ||
      (SELECT status FROM clinical.appointments WHERE id='f0101000-0000-4000-8500-000000000004') || '|' ||
      (SELECT state FROM clinical.queue_entries WHERE appointment_id='f0101000-0000-4000-8500-000000000004') || '|' ||
      (SELECT version FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002')::text || '|' ||
      (SELECT count(*) FROM platform.idempotency_records WHERE route_template='/v1/encounters/{encounterId}/complete' AND state='completed')::text || '|' ||
      (SELECT count(*) FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.completed' AND resource_id='f0101000-0000-4000-8800-000000000002')::text || '|' ||
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.completed.v1' AND aggregate_id='f0101000-0000-4000-8800-000000000002')::text;`,
    label,
  );
  if (state !== expected) throw new Error(`${label}: expected state ${expected}, saw ${state}.`);
}

async function checkC22LifecycleRace(runtime, templateDatabase, order) {
  const database = `f010_c22_${order}_${process.pid}_${randomBytes(5).toString('hex')}`;
  let databaseCreated = false;
  let holder;
  let contender;
  try {
    runPsql(
      runtime,
      runtime.adminDatabase,
      `CREATE DATABASE "${database}" TEMPLATE "${templateDatabase}";`,
      `${runtime.name} clone isolated C22 ${order} race database`,
    );
    databaseCreated = true;
    if (order === 'send_first') {
      holder = startPsqlSession(runtime, database, `${runtime.name} C22 send-first holder`);
      await holder.write(
        c22SendHeldSql('f010_c22_send_first_holder', 'f010-c22-race-send-first', 'a'.repeat(64)),
      );
      await waitForSessionText(
        holder,
        'F010_C22_SEND_HELD',
        `${runtime.name} C22 send-first holder`,
      );
      contender = startPsqlSession(runtime, database, `${runtime.name} C22 completion contender`);
      contender.end(c22CompletionContenderSql('f010_c22_completion_contender'));
      await waitForLockWaiters(
        runtime,
        database,
        ['f010_c22_completion_contender'],
        `${runtime.name} C22 send-first completion barrier`,
      );
      await holder.write('COMMIT;\n');
      holder.end();
      const holderResult = await holder.closed;
      const contenderResult = await contender.closed;
      if (
        holderResult.code !== 0 ||
        contenderResult.code !== 0 ||
        !contender.output.includes('F010_C22_COMPLETION_HELD')
      ) {
        throw new Error(
          `${runtime.name} C22 send-first barrier failed; holder=${holder.output}; contender=${contender.output}`,
        );
      }
      c22RaceState(
        runtime,
        database,
        '1|1|1|1|1|completed|completed|6|1|1|1',
        `${runtime.name} C22 send-first committed lifecycle state`,
      );
      console.log(
        `${runtime.name}: C22 send-first lock barrier committed one message before completion; one set of effects remained.`,
      );
    } else {
      holder = startPsqlSession(runtime, database, `${runtime.name} C22 completion-first holder`);
      await holder.write(c22CompletionHeldSql('f010_c22_completion_first_holder'));
      await waitForSessionText(
        holder,
        'F010_C22_COMPLETION_HELD',
        `${runtime.name} C22 completion-first holder`,
      );
      contender = startPsqlSession(runtime, database, `${runtime.name} C22 send contender`);
      contender.end(
        c22SendContenderSql(
          'f010_c22_send_contender',
          'f010-c22-race-send-after-completion',
          'b'.repeat(64),
        ),
      );
      await waitForLockWaiters(
        runtime,
        database,
        ['f010_c22_send_contender'],
        `${runtime.name} C22 completion-first send barrier`,
      );
      await holder.write('COMMIT;\n');
      holder.end();
      const holderResult = await holder.closed;
      const contenderResult = await contender.closed;
      if (
        holderResult.code !== 0 ||
        contenderResult.code !== 0 ||
        !contender.output.includes('F010_C22_SEND_DENIED_AFTER_COMPLETION')
      ) {
        throw new Error(
          `${runtime.name} C22 completion-first barrier failed; holder=${holder.output}; contender=${contender.output}`,
        );
      }
      c22RaceState(
        runtime,
        database,
        '0|0|0|0|1|completed|completed|6|1|1|1',
        `${runtime.name} C22 completion-first committed lifecycle state`,
      );
      console.log(
        `${runtime.name}: C22 completion-first lock barrier denied the waiting send with zero message effects.`,
      );
    }
  } finally {
    await finishSessions([holder, contender].filter(Boolean), { release: true });
    if (databaseCreated) dropScratchDatabase(runtime, database);
  }
}

async function checkC22LifecycleRaces(runtime, templateDatabase) {
  await checkC22LifecycleRace(runtime, templateDatabase, 'send_first');
  await checkC22LifecycleRace(runtime, templateDatabase, 'completion_first');
}

function setC22ApiSmokeClock(runtime, database) {
  runPsql(
    runtime,
    database,
    `ALTER ROLE shifaa_api IN DATABASE "${database}" SET shifaa.test_now TO '2030-04-05T08:00:00Z';`,
    `${runtime.name} configure disposable C22 API smoke clock`,
  );
}

function checkC22ApiSmokeEffects(runtime, database) {
  const result = runPsqlTuples(
    runtime,
    database,
    `SELECT
      (SELECT count(*) FROM trust.messages WHERE context_id='f0101000-0000-4000-8500-000000000004' AND deleted_at IS NULL)::text || '|' ||
      (SELECT count(*) FROM trust.messages WHERE context_id='f0101000-0000-4000-8500-000000000004' AND pg_catalog.octet_length(body_ciphertext)>=30 AND pg_catalog.get_byte(body_ciphertext,0)=1 AND position(pg_catalog.convert_to('C22 synthetic','UTF8') in body_ciphertext)=0)::text || '|' ||
      (SELECT count(*) FROM trust.messages WHERE context_id='f0101000-0000-4000-8500-000000000004' AND attachment IS NULL)::text || '|' ||
      (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/contexts/{contextType}/{contextId}/messages')::text || '|' ||
      (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/contexts/{contextType}/{contextId}/messages' AND response_body->>'bodyCiphertext' IS NOT NULL AND NOT (response_body ? 'body') AND response_body::text NOT LIKE '%C22 synthetic%')::text || '|' ||
      (SELECT count(*) FROM audit.events WHERE resource_type='context_message' AND action_code='context_message.created')::text || '|' ||
      (SELECT count(*) FROM audit.events event WHERE resource_type='context_message' AND action_code='context_message.created' AND pg_catalog.to_jsonb(event)::text NOT LIKE '%C22 synthetic%')::text || '|' ||
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='context_message' AND event_type='clinical.context_message.created.v1')::text || '|' ||
      (SELECT count(*) FROM platform.outbox_events event WHERE aggregate_type='context_message' AND event_type='clinical.context_message.created.v1' AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(event.payload))=2 AND event.payload->>'aggregateId'=event.aggregate_id::text AND event.payload->>'version'='1' AND pg_catalog.to_jsonb(event)::text NOT LIKE '%C22 synthetic%')::text || '|' ||
      (SELECT count(*) FROM platform.idempotency_records record WHERE method='POST' AND route_template='/v1/contexts/{contextType}/{contextId}/messages' AND pg_catalog.to_jsonb(record)::text NOT LIKE '%C22 synthetic%')::text;`,
    `${runtime.name} C22 encrypted API effects and plaintext-metadata inspection`,
  );
  if (result !== '2|2|2|2|2|2|2|2|2|2') {
    throw new Error(
      `${runtime.name} C22 API owner inspection expected two encrypted sends with ciphertext-only idempotency and body-free balanced effects, saw ${result}.`,
    );
  }
  console.log(
    `${runtime.name}: C22 API smoke round-tripped decrypted bodies; owner inspection confirmed two encrypted rows and no plaintext in idempotency, audit, or outbox metadata.`,
  );
}

function checkReferrals(runtime, database, phase) {
  const fixture = readFileSync(resolve(root, apiTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${apiTest} no longer ends at its expected rollback boundary.`);
  }
  const vectors = readFileSync(resolve(root, referralsTest), 'utf8');
  runPsql(
    runtime,
    database,
    `${fixture.slice(0, rollbackIndex)}\n${vectors}\nROLLBACK;\n`,
    `${runtime.name} ${phase}: C10 encounter fixture plus C17 real-PostgreSQL referral vectors`,
  );
}

function referralAcceptanceSql() {
  const fixture = readFileSync(resolve(root, apiTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${apiTest} no longer ends at its expected rollback boundary.`);
  }
  const referralVectors = readFileSync(resolve(root, referralsTest), 'utf8');
  const acceptanceVectors = readFileSync(resolve(root, referralAcceptanceTest), 'utf8');
  const projectionVectors = readFileSync(resolve(root, referralProjectionsTest), 'utf8');
  const postAcceptanceMarker = '-- C19_POST_ACCEPTANCE_VECTORS';
  const postAcceptanceIndex = projectionVectors.indexOf(postAcceptanceMarker);
  const acceptanceMarker = 'DO $feature_010_c18_acceptance_vectors$';
  if (
    postAcceptanceIndex < 0 ||
    projectionVectors.indexOf(postAcceptanceMarker, postAcceptanceIndex + 1) >= 0 ||
    acceptanceVectors.indexOf(acceptanceMarker) < 0 ||
    acceptanceVectors.indexOf(acceptanceMarker, acceptanceVectors.indexOf(acceptanceMarker) + 1) >=
      0
  ) {
    throw new Error(
      'C19 projection vectors must have one pre-acceptance insertion point and one post-acceptance marker.',
    );
  }
  const preAcceptanceVectors = projectionVectors.slice(0, postAcceptanceIndex);
  const postAcceptanceVectors = projectionVectors.slice(
    postAcceptanceIndex + postAcceptanceMarker.length,
  );
  const acceptanceWithC19Precheck = acceptanceVectors.replace(
    acceptanceMarker,
    `${preAcceptanceVectors}\n${acceptanceMarker}`,
  );
  return `${fixture.slice(0, rollbackIndex)}\n${referralVectors}\n${acceptanceWithC19Precheck}\n${postAcceptanceVectors}\nROLLBACK;\n`;
}

function checkReferralAcceptance(runtime, database, phase) {
  runPsql(
    runtime,
    database,
    referralAcceptanceSql(),
    `${runtime.name} ${phase}: C10 encounter fixture plus C17/C18 real-PostgreSQL acceptance vectors`,
  );
}

function referralAcceptanceRaceFixtureSql() {
  const fixture = readFileSync(resolve(root, apiTest), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  const acceptance = readFileSync(resolve(root, referralAcceptanceTest), 'utf8');
  const apiBoundaryIndex = acceptance.indexOf('\nSET SESSION AUTHORIZATION shifaa_api;');
  if (
    rollbackIndex < 0 ||
    fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;' ||
    apiBoundaryIndex < 0
  ) {
    throw new Error('C18 concurrent fixture setup boundaries changed unexpectedly.');
  }
  return `${fixture.slice(0, rollbackIndex)}\n${acceptance.slice(0, apiBoundaryIndex)}\nCOMMIT;\n`;
}

function referralAcceptanceRaceSql(applicationName, key, hash, scheduleVersion) {
  const targetSlot = `jsonb_build_object(
  'facilityId','f0101000-0000-4000-8200-000000000001',
  'doctorId','f0101000-0000-4000-8000-000000000003',
  'startsAt','2030-04-05T12:30:00Z','endsAt','2030-04-05T13:00:00Z',
  'timezone','Africa/Cairo','civilDate','2030-04-05','availabilityVersion',${scheduleVersion}
)`;
  return `SET application_name='${applicationName}';
SET SESSION AUTHORIZATION shifaa_api;
BEGIN;
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.action','acceptReferral',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
SELECT pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000081',true);
SELECT pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000081',true);
SELECT pg_catalog.set_config('shifaa.idempotency_key','${key}',true);
SELECT pg_catalog.set_config('shifaa.request_hash','${hash}',true);
SELECT clinical.accept_referral_api_v1(
  'f0101000-0000-4000-8a00-00000000000f',1,
  jsonb_build_object('authorizedFieldCodes',jsonb_build_array('reason_summary'),'targetSlot',${targetSlot})
);
COMMIT;
`;
}

async function checkConcurrentReferralAcceptanceWinner(runtime, templateDatabase) {
  const database = `f010_c18_race_${process.pid}_${randomBytes(5).toString('hex')}`;
  let databaseCreated = false;
  try {
    runPsql(
      runtime,
      runtime.adminDatabase,
      `CREATE DATABASE "${database}" TEMPLATE "${templateDatabase}";`,
      `${runtime.name} clone isolated C18 acceptance-race database`,
    );
    databaseCreated = true;
    runPsql(
      runtime,
      database,
      referralAcceptanceRaceFixtureSql(),
      `${runtime.name} commit C18 concurrency fixture`,
    );
    const scheduleVersion = Number(
      runPsqlTuples(
        runtime,
        database,
        `SELECT version FROM clinical.schedules WHERE id='f0101000-0000-4000-8400-000000000002';`,
        `${runtime.name} C18 acceptance race schedule version`,
      ),
    );
    if (!Number.isInteger(scheduleVersion) || scheduleVersion < 1) {
      throw new Error(
        `${runtime.name} C18 target schedule version is invalid: ${scheduleVersion}.`,
      );
    }

    const holder = startPsqlSession(
      runtime,
      database,
      `${runtime.name} C18 acceptance lock holder`,
    );
    let contenders = [];
    try {
      await holder.write(
        `SET application_name='f010_c18_acceptance_holder';\nBEGIN;\nSELECT id::text || '|F010_C18_LOCK_HELD' FROM clinical.referrals WHERE id='f0101000-0000-4000-8a00-00000000000f' FOR UPDATE;\n`,
      );
      await waitForSessionText(holder, 'F010_C18_LOCK_HELD', `${runtime.name} C18 referral lock`);

      const candidates = [
        ['f010_c18_accept_a', 'f010-c18-race-a', 'a'.repeat(64)],
        ['f010_c18_accept_b', 'f010-c18-race-b', 'b'.repeat(64)],
      ];
      contenders = candidates.map(([name]) =>
        startPsqlSession(runtime, database, `${runtime.name} ${name}`),
      );
      contenders.forEach((session, index) =>
        session.end(referralAcceptanceRaceSql(...candidates[index], scheduleVersion)),
      );
      await waitForLockWaiters(
        runtime,
        database,
        candidates.map(([name]) => name),
        `${runtime.name} C18 one-winner referral acceptance`,
      );
      await holder.write('COMMIT;\n');
      holder.end();
      const holderResult = await holder.closed;
      if (holderResult.code !== 0) {
        throw new Error(
          `${runtime.name} C18 lock holder failed (exit ${holderResult.code}):\n${holder.output}`,
        );
      }
      const results = await Promise.all(contenders.map((session) => session.closed));
      const outputs = contenders.map((session) => session.output);
      const successes = results.filter((result) => result.code === 0).length;
      const conflicts = outputs.filter((output) => output.includes('40001')).length;
      if (
        successes !== 1 ||
        conflicts !== 1 ||
        results.some((result, index) => result.code !== 0 && !outputs[index].includes('40001'))
      ) {
        throw new Error(
          `${runtime.name} C18 acceptance race must produce one success and one 40001 loser; results=${JSON.stringify(results)}, outputs:\n${outputs.join('\n---\n')}`,
        );
      }

      const state = runPsqlTuples(
        runtime,
        database,
        `SELECT
          (SELECT status || '|' || version::text FROM clinical.referrals WHERE id='f0101000-0000-4000-8a00-00000000000f') || '|' ||
          (SELECT count(*) FROM clinical.appointments WHERE source_referral_id='f0101000-0000-4000-8a00-00000000000f')::text || '|' ||
          (SELECT count(*) FROM platform.idempotency_records WHERE route_template='/v1/referrals/{referralId}/accept' AND resource_id='f0101000-0000-4000-8a00-00000000000f' AND state='completed' AND response_status=200 AND response_body IS NOT NULL)::text || '|' ||
          (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/referrals/{referralId}/accept' AND request_hash IN ('${'a'.repeat(64)}','${'b'.repeat(64)}'))::text || '|' ||
          (SELECT count(*) FROM audit.events WHERE resource_type='referral' AND action_code='referral.accepted' AND resource_id='f0101000-0000-4000-8a00-00000000000f')::text || '|' ||
          (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='referral' AND event_type='clinical.referral.accepted.v1' AND aggregate_id='f0101000-0000-4000-8a00-00000000000f');`,
        `${runtime.name} C18 acceptance race effect counts`,
      );
      if (state !== 'accepted|2|1|1|1|1|1') {
        throw new Error(
          `${runtime.name} C18 one-winner race must leave referral/appointment/completed response/idempotency/audit/outbox counts 1/1/1/1/1/1; saw ${state}.`,
        );
      }
      console.log(
        `${runtime.name}: C18 concurrent acceptance blocked both callers then committed one referral/appointment/response/audit/outbox; loser returned 40001.`,
      );
    } finally {
      await finishSessions([holder, ...contenders], { release: true });
    }
  } finally {
    if (databaseCreated) dropScratchDatabase(runtime, database);
  }
}

function checkExpectedNotesRed(runtime, database) {
  const sql = readFileSync(resolve(root, notesTest), 'utf8');
  try {
    runPsql(runtime, database, sql, `${runtime.name} expected C12 RED: ${notesTest}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes('F010_C12_MISSING_SIGNER: clinical.sign_encounter_note_api_v1(uuid,jsonb)')
    ) {
      throw error;
    }
    console.log(`${runtime.name}: expected C12 RED: ${detail}`);
    return;
  }
  throw new Error('F010_C12 RED was not observed: the note signer API already exists.');
}

function checkExpectedCompletionRed(runtime, database) {
  const sql = readFileSync(resolve(root, c13CompletionRedTest), 'utf8');
  try {
    runPsql(runtime, database, sql, `${runtime.name} expected C13 RED: ${c13CompletionRedTest}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes(
        'F010_C13_MISSING_API: clinical.complete_encounter_api_v1(uuid,integer,jsonb)',
      )
    ) {
      throw error;
    }
    console.log(`${runtime.name}: expected C13 RED: ${detail}`);
    return;
  }

  throw new Error(
    'F010 C13 RED was not observed: the completion API wrapper already exists after C05–C12.',
  );
}

function checkExpectedReferralAcceptanceRed(runtime, database) {
  const sql = referralAcceptanceSql();
  try {
    runPsql(runtime, database, sql, `${runtime.name} expected C18 RED: ${referralAcceptanceTest}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes('F010_C18_MISSING_API: clinical.accept_referral_api_v1(uuid,integer,jsonb)')
    ) {
      throw error;
    }
    console.log(`${runtime.name}: expected C18 RED: ${detail}`);
    return;
  }

  throw new Error(
    'F010 C18 RED was not observed: accept_referral_api_v1 already exists after C10-C17.',
  );
}

function checkExpectedMessagesRed(runtime, database) {
  const messagesRedTest = 'infra/db/tests/feature-010-messages-red.sql';
  const sql = readFileSync(resolve(root, messagesRedTest), 'utf8');
  try {
    runPsql(runtime, database, sql, `${runtime.name} expected C22 RED: ${messagesRedTest}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes(
        'F010_C22_MISSING_API: trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer)',
      ) ||
      !detail.includes('F010_C22_MISSING_API: trust.send_context_message_api_v1(uuid,jsonb)')
    ) {
      throw error;
    }
    console.log(`${runtime.name}: expected C22 RED: ${detail}`);
    return;
  }

  throw new Error(
    `${runtime.name} C22 RED was not observed: both C22 API functions already exist after C19.`,
  );
}

function checkExpectedMessageRaceRed(runtime, database) {
  const sql = readFileSync(resolve(root, messagesRaceRedTest), 'utf8');
  try {
    runPsql(runtime, database, sql, `${runtime.name} supplemental C22 lifecycle-race seam RED`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes(
        'F010_C22_RACE_BOUNDARY_MISSING: trust.send_context_message_api_v1(uuid,jsonb)',
      )
    ) {
      throw error;
    }
    console.log(`${runtime.name}: supplemental C22 race-boundary omission probe: ${detail}`);
    return;
  }
  throw new Error(
    'Supplemental C22 race-boundary omission was not observed: the send API already exists after C19.',
  );
}

function checkActualMessageRaceRed(runtime, database) {
  try {
    runPsql(
      runtime,
      database,
      c22SendHeldSql('f010_c22_red_send_first', 'f010-c22-race-red-send', 'd'.repeat(64)),
      `${runtime.name} supplemental C22 send-first race probe against committed C11 fixture`,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes('function trust.send_context_message_api_v1(uuid, jsonb) does not exist')
    ) {
      throw error;
    }
    const state = runPsqlTuples(
      runtime,
      database,
      `SELECT
        (SELECT count(*) FROM trust.messages WHERE context_id='f0101000-0000-4000-8500-000000000004')::text || '|' ||
        (SELECT count(*) FROM platform.idempotency_records WHERE route_template='/v1/contexts/{contextType}/{contextId}/messages')::text || '|' ||
        (SELECT count(*) FROM audit.events WHERE resource_type='context_message' AND action_code='context_message.created')::text || '|' ||
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='context_message' AND event_type='clinical.context_message.created.v1')::text || '|' ||
        (SELECT status FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002') || '|' ||
        (SELECT version FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002')::text;`,
      `${runtime.name} C22 race RED committed-fixture effect check`,
    );
    if (state !== '0|0|0|0|open|5') {
      throw new Error(
        `${runtime.name} C22 race RED encountered an invalid fixture/effect state: ${state}.`,
      );
    }
    console.log(
      `${runtime.name}: supplemental post-implementation C22 race RED used the committed C11 fixture; the actual send-first invocation stopped at the missing SQL boundary with zero C22 effects. ${detail}`,
    );
    return;
  }
  throw new Error(
    'Supplemental C22 send-first omission was not observed: the send boundary returned.',
  );
}

function checkExpectedBookingPrimitiveRed(runtime, database) {
  const sql = readFileSync(resolve(root, bookingSeamTest), 'utf8');
  try {
    runPsql(runtime, database, sql, `${runtime.name} expected C08 RED: ${bookingSeamTest}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      !detail.includes('F009_BOOKING_PARITY_PASS') ||
      !detail.includes(
        'F010_INTERNAL_BOOKING_PRIMITIVE_MISSING: clinical.book_appointment_internal_v1(jsonb,integer,jsonb)',
      )
    ) {
      throw error;
    }
    console.log(
      `${runtime.name}: expected C08 RED before the F010 migration; exact psql output follows.\n${detail}`,
    );
    return;
  }

  throw new Error(
    `${runtime.name} C08 RED was not observed: the F009 booking vectors passed but the internal primitive assertion did not fail.`,
  );
}

function reportDefaultDenySnapshot(runtime, database) {
  const snapshot = runPsql(
    runtime,
    database,
    defaultDenySnapshotSql,
    `${runtime.name} C04 default-deny snapshot`,
  );
  console.log(`${runtime.name}: ${snapshot.trim()}`);
}

function createScratchDatabase(runtime, database) {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `CREATE DATABASE "${database}" TEMPLATE template0;`,
    `${runtime.name} create isolated scratch database`,
  );
}

function applyBaselineMigrations(runtime, database) {
  for (const migrationPath of migrations.slice(0, featureMigrationIndex)) {
    runMigration(runtime, database, migrationPath, 'baseline migration');
  }
}

async function verifyFreshAndReplay(runtime, database, replayHistorical = true) {
  const f009SchemaBefore = runPgDump(
    runtime,
    database,
    `${runtime.name} capture F009 schema baseline`,
  );
  runMigration(runtime, database, featureMigration, 'fresh F010 migration');
  runMigration(runtime, database, c10ApiMigration, 'fresh C10 API migration');
  runMigration(runtime, database, c11UpdateMigration, 'fresh C11 update API migration');
  runMigration(runtime, database, c12NoteMigration, 'fresh C12 note signing API migration');
  runMigration(
    runtime,
    database,
    c13CompletionMigration,
    'fresh C13 encounter completion API migration',
  );
  runMigration(runtime, database, c17ReferralsMigration, 'fresh C17 referral API migration');
  runMigration(
    runtime,
    database,
    c18ReferralAcceptanceMigration,
    'fresh C18 referral acceptance API migration',
  );
  runMigration(
    runtime,
    database,
    c19ReferralProjectionMigration,
    'fresh C19 referral projection correction migration',
  );
  runMigration(
    runtime,
    database,
    c22ContextMessagesMigration,
    'fresh C22 context messages API migration',
  );
  runMigration(runtime, database, c23RealtimeHintMigration, 'fresh C23 realtime hint migration');
  runMigration(runtime, database, c26PrivacyGuardsMigration, 'fresh C26 privacy guard migration');
  reportDefaultDenySnapshot(runtime, database);
  checkSchema(runtime, database, 'fresh F010 schema assertions');
  checkLifecycle(runtime, database, 'fresh F010 lifecycle vectors');
  checkStorage(runtime, database, 'fresh F010 storage vectors');
  checkRls(runtime, database, 'fresh F010 non-owner RLS matrix');
  checkF009Regression(runtime, database, 'F009 check-in and queue regression after F010');
  checkBookingSeam(runtime, database, 'C08 F009 parity and F010 primitive vectors');
  checkApi(runtime, database, 'C10 create/read API vectors');
  checkUpdate(runtime, database, 'C11 update API vectors');
  checkNotes(runtime, database, 'C12 note signing and projection API vectors');
  checkCompletion(runtime, database, 'C13 completion API vectors');
  checkMessages(runtime, database, 'C22 context messages API vectors');
  checkReferrals(runtime, database, 'C17 create/list API vectors');
  checkReferralAcceptance(runtime, database, 'C18 acceptance API vectors');
  await checkConcurrentCompletionWinner(runtime, database);
  await checkConcurrentBookingWinner(runtime, database);
  await checkConcurrentVersionStale(runtime, database);
  if (replayHistorical) {
    runMigration(runtime, database, featureMigration, 'F010 migration replay');
    runMigration(runtime, database, c10ApiMigration, 'C10 API migration replay');
    runMigration(runtime, database, c11UpdateMigration, 'C11 update API migration replay');
    runMigration(runtime, database, c12NoteMigration, 'C12 note signing API migration replay');
    runMigration(
      runtime,
      database,
      c13CompletionMigration,
      'C13 encounter completion API migration replay',
    );
    runMigration(runtime, database, c17ReferralsMigration, 'C17 referral API migration replay');
    runMigration(
      runtime,
      database,
      c18ReferralAcceptanceMigration,
      'C18 referral acceptance API migration replay',
    );
    runMigration(
      runtime,
      database,
      c19ReferralProjectionMigration,
      'C19 referral projection correction migration replay',
    );
    runMigration(
      runtime,
      database,
      c22ContextMessagesMigration,
      'C22 context messages API migration replay',
    );
    runMigration(runtime, database, c23RealtimeHintMigration, 'C23 realtime hint migration replay');
    runMigration(
      runtime,
      database,
      c26PrivacyGuardsMigration,
      'C26 privacy guard migration replay',
    );
    checkSchema(runtime, database, 'replayed F010 schema assertions');
    checkStorage(runtime, database, 'replayed F010 storage vectors');
    checkApi(runtime, database, 'replayed C10 create/read API vectors');
    checkUpdate(runtime, database, 'replayed C11 update API vectors');
    checkNotes(runtime, database, 'replayed C12 note signing and projection API vectors');
    checkCompletion(runtime, database, 'replayed C13 completion API vectors');
    checkMessages(runtime, database, 'replayed C22 context messages API vectors');
    checkReferrals(runtime, database, 'replayed C17 create/list API vectors');
    checkReferralAcceptance(runtime, database, 'replayed C18 acceptance API vectors');
  }

  const f009SchemaAfter = runPgDump(
    runtime,
    database,
    `${runtime.name} verify F009 schema unchanged`,
  );
  if (f009SchemaAfter !== f009SchemaBefore) {
    throw new Error(
      `${runtime.name} F009 appointments/queue schema dump changed while applying F010.\n${firstDifference(f009SchemaBefore, f009SchemaAfter)}`,
    );
  }

  console.log(
    `${runtime.name}: fresh migration, ${replayHistorical ? 'same-database replay, ' : ''}schema assertions, and F009 schema parity passed.`,
  );
}

function dropScratchDatabase(runtime, database) {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`,
    `${runtime.name} drop isolated scratch database`,
  );
}

async function testRuntime(runtime) {
  const database = `f010_c04_${process.pid}_${randomBytes(8).toString('hex')}`;
  let scratchDatabaseCreated = false;
  const c10Only = process.env['SHIFAA_TEST_F010_C10_ONLY'] === 'true';
  const c11Only = process.env['SHIFAA_TEST_F010_C11_ONLY'] === 'true';
  const c12Red = process.env['SHIFAA_TEST_F010_C12_RED'] === 'true';
  const c12Only = process.env['SHIFAA_TEST_F010_C12_ONLY'] === 'true';
  const c13Only = process.env['SHIFAA_TEST_F010_C13_ONLY'] === 'true';
  const c17Only = process.env['SHIFAA_TEST_F010_C17_ONLY'] === 'true';
  const c18Only = process.env['SHIFAA_TEST_F010_C18_ONLY'] === 'true';
  const c19Only = process.env['SHIFAA_TEST_F010_C19_ONLY'] === 'true';
  const c22Only = process.env['SHIFAA_TEST_F010_C22_ONLY'] === 'true';
  const runC13Red = process.env['SHIFAA_TEST_F010_C13_RED'] === 'true';
  const runC18Red = process.env['SHIFAA_TEST_F010_C18_RED'] === 'true';
  const runC22Red = process.env['SHIFAA_TEST_F010_C22_RED'] === 'true';
  const runC22RaceRed = process.env['SHIFAA_TEST_F010_C22_RACE_RED'] === 'true';
  const redDatabase = `f010_c08_red_${process.pid}_${randomBytes(8).toString('hex')}`;
  let redDatabaseCreated = false;
  try {
    if (
      !c10Only &&
      !c11Only &&
      !c12Red &&
      !c12Only &&
      !c13Only &&
      !c17Only &&
      !c18Only &&
      !c19Only &&
      !c22Only &&
      !runC13Red &&
      !runC18Red &&
      !runC22Red &&
      !runC22RaceRed
    ) {
      createScratchDatabase(runtime, redDatabase);
      redDatabaseCreated = true;
      applyBaselineMigrations(runtime, redDatabase);
      checkExpectedBookingPrimitiveRed(runtime, redDatabase);
      dropScratchDatabase(runtime, redDatabase);
      redDatabaseCreated = false;
    }

    createScratchDatabase(runtime, database);
    scratchDatabaseCreated = true;
    applyBaselineMigrations(runtime, database);
    if (process.argv[2] === 'projection') {
      for (const migration of migrations.slice(featureMigrationIndex)) {
        runMigration(runtime, database, migration, 'C28 prerequisite projection chain');
      }
      commitMessagesFixture(runtime, database);
      runMessageApiPostgresTest(runtime, database, true, true);
      checkEncounterProjectionApi(runtime, database);
      return;
    }
    if (runC22Red) {
      runMigration(runtime, database, featureMigration, 'focused C22 RED base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C22 RED prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C22 RED prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C22 RED prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'focused C22 RED prerequisite C13 API migration',
      );
      runMigration(
        runtime,
        database,
        c17ReferralsMigration,
        'focused C22 RED prerequisite C17 API migration',
      );
      runMigration(
        runtime,
        database,
        c18ReferralAcceptanceMigration,
        'focused C22 RED prerequisite C18 API migration',
      );
      runMigration(
        runtime,
        database,
        c19ReferralProjectionMigration,
        'focused C22 RED prerequisite C19 API migration',
      );
      checkStorage(runtime, database, 'focused C06 storage regression before C22 RED');
      checkRls(runtime, database, 'focused C07 forced-RLS regression before C22 RED');
      checkExpectedMessagesRed(runtime, database);
      console.log(`${runtime.name}: focused C22 RED PostgreSQL probe passed.`);
      return;
    }
    if (runC22RaceRed) {
      runMigration(
        runtime,
        database,
        featureMigration,
        'supplemental C22 race RED base F010 migration',
      );
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'supplemental C22 race RED prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'supplemental C22 race RED prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'supplemental C22 race RED prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'supplemental C22 race RED prerequisite C13 completion boundary',
      );
      runMigration(
        runtime,
        database,
        c17ReferralsMigration,
        'supplemental C22 race RED prerequisite C17 API migration',
      );
      runMigration(
        runtime,
        database,
        c18ReferralAcceptanceMigration,
        'supplemental C22 race RED prerequisite C18 API migration',
      );
      runMigration(
        runtime,
        database,
        c19ReferralProjectionMigration,
        'supplemental C22 race RED C19 message baseline',
      );
      checkExpectedMessageRaceRed(runtime, database);
      commitMessagesFixture(runtime, database);
      checkActualMessageRaceRed(runtime, database);
      console.log(`${runtime.name}: supplemental C22 lifecycle-race seam RED passed after C19.`);
      return;
    }
    if (runC18Red) {
      runMigration(runtime, database, featureMigration, 'focused C18 RED base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C18 RED prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C18 RED prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C18 RED prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'focused C18 RED prerequisite C13 API migration',
      );
      runMigration(
        runtime,
        database,
        c17ReferralsMigration,
        'focused C18 RED prerequisite C17 API migration',
      );
      checkExpectedReferralAcceptanceRed(runtime, database);
      console.log(`${runtime.name}: focused C18 RED PostgreSQL probe passed.`);
      return;
    }
    if (c22Only) {
      runMigration(runtime, database, featureMigration, 'focused C22 base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C22 prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C22 prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C22 prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'focused C22 prerequisite C13 API migration',
      );
      runMigration(
        runtime,
        database,
        c17ReferralsMigration,
        'focused C22 prerequisite C17 API migration',
      );
      runMigration(
        runtime,
        database,
        c18ReferralAcceptanceMigration,
        'focused C22 prerequisite C18 API migration',
      );
      runMigration(
        runtime,
        database,
        c19ReferralProjectionMigration,
        'focused C22 prerequisite C19 API migration',
      );
      runMigration(
        runtime,
        database,
        c22ContextMessagesMigration,
        'focused C22 context messages API migration',
      );
      if (process.env['SHIFAA_TEST_F010_C23_REGRESSION'] === 'true') {
        runMigration(
          runtime,
          database,
          'supabase/migrations/20260930001000_f010_c23_realtime_hint.sql',
          'C23 compatibility migration before C22 authorization regressions',
        );
      }
      runMigration(
        runtime,
        database,
        c26PrivacyGuardsMigration,
        'C26 guards before focused C22 vectors',
      );
      checkStorage(runtime, database, 'focused C06 storage regression before C22 vectors');
      checkRls(runtime, database, 'focused C07 forced-RLS regression before C22 vectors');
      checkUpdate(runtime, database, 'focused C11 update regression before C22 vectors');
      checkCompletion(runtime, database, 'focused C13 completion regression before C22 vectors');
      checkMessages(runtime, database, 'focused C22 real-PostgreSQL message vectors');
      runMigration(runtime, database, c22ContextMessagesMigration, 'focused C22 migration replay');
      if (process.env['SHIFAA_TEST_F010_C23_REGRESSION'] === 'true') {
        runMigration(
          runtime,
          database,
          c23RealtimeHintMigration,
          'C23 compatibility migration before C22 replay authorization regressions',
        );
      }
      runMigration(
        runtime,
        database,
        c26PrivacyGuardsMigration,
        'C26 guards before C22 replay vectors',
      );
      checkMessages(runtime, database, 'focused C22 replayed message vectors');
      commitMessagesFixture(runtime, database);
      await checkC22LifecycleRaces(runtime, database);
      setC22ApiSmokeClock(runtime, database);
      runMessageApiPostgresTest(runtime, database);
      checkC22ApiSmokeEffects(runtime, database);
      console.log(
        `${runtime.name}: focused C22 SQL/API message, live authorization, and replay vectors passed.`,
      );
      return;
    }
    if (c18Only || c19Only) {
      runMigration(runtime, database, featureMigration, 'focused C18 base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C18 prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C18 prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C18 prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'focused C18 prerequisite C13 API migration',
      );
      runMigration(
        runtime,
        database,
        c17ReferralsMigration,
        'focused C18 prerequisite C17 API migration',
      );
      runMigration(
        runtime,
        database,
        c18ReferralAcceptanceMigration,
        'focused C18 referral acceptance API migration',
      );
      runMigration(
        runtime,
        database,
        c19ReferralProjectionMigration,
        'focused C19 referral projection correction migration',
      );
      runMigration(
        runtime,
        database,
        c26PrivacyGuardsMigration,
        'focused C26 privacy guard migration',
      );
      checkStorage(runtime, database, 'focused C06 storage invariants before C18 vectors');
      checkRls(runtime, database, 'focused C07 RLS regression before C18 vectors');
      checkBookingSeam(runtime, database, 'focused C08 F009 parity before C18 vectors');
      checkReferralAcceptance(runtime, database, 'focused C18 real-PostgreSQL API vectors');
      runMigration(
        runtime,
        database,
        c18ReferralAcceptanceMigration,
        'focused C18 migration replay',
      );
      runMigration(
        runtime,
        database,
        c19ReferralProjectionMigration,
        'focused C19 migration replay',
      );
      runMigration(
        runtime,
        database,
        c26PrivacyGuardsMigration,
        'focused C26 privacy guard replay',
      );
      checkReferralAcceptance(
        runtime,
        database,
        'focused C18 replayed real-PostgreSQL API vectors',
      );
      await checkConcurrentReferralAcceptanceWinner(runtime, database);
      console.log(
        `${runtime.name}: focused ${c19Only ? 'C19 projection plus C18 acceptance' : 'C18 acceptance'}, migration replay, F009 parity, and concurrency vectors passed.`,
      );
      return;
    }
    if (runC13Red) {
      runMigration(runtime, database, featureMigration, 'focused C13 RED base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C13 RED prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C13 RED prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C13 RED prerequisite C12 API migration',
      );
      checkExpectedCompletionRed(runtime, database);
      console.log(`${runtime.name}: focused C13 RED PostgreSQL probe passed.`);
      return;
    }
    if (c12Red) {
      runMigration(runtime, database, featureMigration, 'focused C12 RED base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C12 RED prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C12 RED prerequisite C11 API migration',
      );
      checkExpectedNotesRed(runtime, database);
      console.log(`${runtime.name}: focused C12 RED PostgreSQL probe passed.`);
      return;
    }
    if (c12Only) {
      runMigration(runtime, database, featureMigration, 'focused C12 base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C12 prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C12 prerequisite C11 API migration',
      );
      runMigration(runtime, database, c12NoteMigration, 'focused C12 note signing API migration');
      checkNotes(runtime, database, 'focused C12 PostgreSQL signing/projection vectors');
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C12 note signing API migration replay',
      );
      checkNotes(runtime, database, 'focused C12 replayed migration signing/projection vectors');
      console.log(
        `${runtime.name}: focused C12 note signing and projection PostgreSQL vectors passed.`,
      );
      return;
    }
    if (c13Only) {
      runMigration(runtime, database, featureMigration, 'focused C13 base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C13 prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C13 prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C13 prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'focused C13 completion API migration',
      );
      checkRls(runtime, database, 'focused C07 RLS regression before C13 vectors');
      checkCompletion(runtime, database, 'focused C13 real-PostgreSQL completion vectors');
      await checkConcurrentCompletionWinner(runtime, database);
      console.log(
        `${runtime.name}: focused C13 completion, chat cutoff, and concurrency vectors passed.`,
      );
      return;
    }
    if (c17Only) {
      runMigration(runtime, database, featureMigration, 'focused C17 base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C17 prerequisite C10 API migration',
      );
      runMigration(
        runtime,
        database,
        c11UpdateMigration,
        'focused C17 prerequisite C11 API migration',
      );
      runMigration(
        runtime,
        database,
        c12NoteMigration,
        'focused C17 prerequisite C12 API migration',
      );
      runMigration(
        runtime,
        database,
        c13CompletionMigration,
        'focused C17 prerequisite C13 API migration',
      );
      runMigration(runtime, database, c17ReferralsMigration, 'focused C17 referral API migration');
      runMigration(
        runtime,
        database,
        c18ReferralAcceptanceMigration,
        'focused C17 prerequisite C18 referral acceptance migration',
      );
      runMigration(
        runtime,
        database,
        c19ReferralProjectionMigration,
        'focused C17 prerequisite C19 referral projection migration',
      );
      runMigration(
        runtime,
        database,
        c26PrivacyGuardsMigration,
        'focused C26 privacy guard migration',
      );
      checkStorage(runtime, database, 'focused C06 storage invariants before C17 vectors');
      checkRls(runtime, database, 'focused C07 RLS regression before C17 vectors');
      checkReferrals(runtime, database, 'focused C17 real-PostgreSQL API vectors');
      runMigration(
        runtime,
        database,
        c17ReferralsMigration,
        'focused C17 referral API migration replay',
      );
      runMigration(
        runtime,
        database,
        c26PrivacyGuardsMigration,
        'focused C26 privacy guard replay',
      );
      checkReferrals(runtime, database, 'focused C17 replayed real-PostgreSQL API vectors');
      console.log(
        `${runtime.name}: focused C17 create/list, atomic effects, idempotency, and C07 authorization vectors passed.`,
      );
      return;
    }
    if (c10Only) {
      runMigration(runtime, database, featureMigration, 'focused C10 base F010 migration');
      runMigration(runtime, database, c10ApiMigration, 'focused C10 API migration');
      checkApi(runtime, database, 'focused C10 create/read API vectors');
      console.log(`${runtime.name}: focused C10 PostgreSQL vectors passed.`);
      return;
    }
    if (c11Only) {
      runMigration(runtime, database, featureMigration, 'focused C11 base F010 migration');
      runMigration(
        runtime,
        database,
        c10ApiMigration,
        'focused C11 prerequisite C10 API migration',
      );
      runMigration(runtime, database, c11UpdateMigration, 'focused C11 update API migration');
      checkRls(runtime, database, 'focused C07 RLS regression before C11 API vectors');
      checkUpdate(runtime, database, 'focused C11 real-PostgreSQL API vectors');
      console.log(`${runtime.name}: focused C11 update and C07 RLS PostgreSQL vectors passed.`);
      return;
    }
    // C28 proves fresh application here; the restore runner executes a populated
    // previous-checkpoint database with only pending forward migrations.
    await verifyFreshAndReplay(runtime, database, process.argv[2] !== 'c28');
    if (process.argv[2] === 'c28') {
      await checkConcurrentReferralAcceptanceWinner(runtime, database);
      commitMessagesFixture(runtime, database);
      checkEncounterProjectionApi(runtime, database);
      await checkC22LifecycleRaces(runtime, database);
      setC22ApiSmokeClock(runtime, database);
      runMessageApiPostgresTest(runtime, database);
      checkC22ApiSmokeEffects(runtime, database);
      console.log(
        `${runtime.name}: C28 referral/slot and send/completion races plus real C22 API regression passed.`,
      );
    }
  } finally {
    if (scratchDatabaseCreated) dropScratchDatabase(runtime, database);
    if (redDatabaseCreated) dropScratchDatabase(runtime, redDatabase);
  }
}

for (const runtime of runtimes) {
  await testRuntime(runtime);
}
