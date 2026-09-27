import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const featureMigration =
  'supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql';
const schemaTest = 'infra/db/tests/feature-010-schema.sql';
const lifecycleTest = 'infra/db/tests/feature-010-lifecycle.sql';
const storageTest = 'infra/db/tests/feature-010-storage-invariants.sql';
const rlsTest = 'infra/db/tests/feature-010-rls.sql';
const f009RegressionTest = 'infra/db/tests/clinic-scheduling-schema.sql';
const bookingSeamTest = 'infra/db/tests/feature-010-booking-seam.sql';
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
if (
  featureMigrationIndex < 0 ||
  migrations.lastIndexOf(featureMigration) !== featureMigrationIndex
) {
  throw new Error(`The standalone db:migrate chain must include ${featureMigration} exactly once.`);
}

const runtimes = [
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
  let sql = readFileSync(resolve(root, f009RegressionTest), 'utf8');
  if (runtime.name === 'shifaa-local-supabase') {
    const directRoleCheck = sql.lastIndexOf('SET LOCAL ROLE shifaa_api;');
    const rollback = sql.lastIndexOf('ROLLBACK;');
    if (directRoleCheck < 0 || rollback < directRoleCheck) {
      throw new Error(`${f009RegressionTest} no longer has its final direct-role check boundary.`);
    }
    // The Supabase container's postgres login is intentionally not a member
    // of shifaa_api. Keep the F009 lifecycle vectors runnable without granting
    // cluster-wide role membership solely for this disposable database.
    sql = `${sql.slice(0, directRoleCheck)}\nROLLBACK;\n`;
    console.log(
      `${runtime.name}: F009 lifecycle run omits the direct SET ROLE shifaa_api subvector (role membership is unavailable).`,
    );
  }
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${f009RegressionTest}`);
}

function checkBookingSeam(runtime, database, phase) {
  const sql = readFileSync(resolve(root, bookingSeamTest), 'utf8');
  runPsql(runtime, database, sql, `${runtime.name} ${phase}: ${bookingSeamTest}`);
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

async function verifyFreshAndReplay(runtime, database) {
  const f009SchemaBefore = runPgDump(
    runtime,
    database,
    `${runtime.name} capture F009 schema baseline`,
  );
  runMigration(runtime, database, featureMigration, 'fresh F010 migration');
  reportDefaultDenySnapshot(runtime, database);
  checkSchema(runtime, database, 'fresh F010 schema assertions');
  checkLifecycle(runtime, database, 'fresh F010 lifecycle vectors');
  checkStorage(runtime, database, 'fresh F010 storage vectors');
  checkRls(runtime, database, 'fresh F010 non-owner RLS matrix');
  checkF009Regression(runtime, database, 'F009 check-in and queue regression after F010');
  checkBookingSeam(runtime, database, 'C08 F009 parity and F010 primitive vectors');
  await checkConcurrentBookingWinner(runtime, database);
  await checkConcurrentVersionStale(runtime, database);
  runMigration(runtime, database, featureMigration, 'F010 migration replay');
  checkSchema(runtime, database, 'replayed F010 schema assertions');
  checkStorage(runtime, database, 'replayed F010 storage vectors');

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
    `${runtime.name}: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.`,
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
  const redDatabase = `f010_c08_red_${process.pid}_${randomBytes(8).toString('hex')}`;
  let redDatabaseCreated = false;
  try {
    createScratchDatabase(runtime, redDatabase);
    redDatabaseCreated = true;
    applyBaselineMigrations(runtime, redDatabase);
    checkExpectedBookingPrimitiveRed(runtime, redDatabase);
    dropScratchDatabase(runtime, redDatabase);
    redDatabaseCreated = false;

    createScratchDatabase(runtime, database);
    scratchDatabaseCreated = true;
    applyBaselineMigrations(runtime, database);
    await verifyFreshAndReplay(runtime, database);
  } finally {
    if (scratchDatabaseCreated) dropScratchDatabase(runtime, database);
    if (redDatabaseCreated) dropScratchDatabase(runtime, redDatabase);
  }
}

for (const runtime of runtimes) {
  await testRuntime(runtime);
}
