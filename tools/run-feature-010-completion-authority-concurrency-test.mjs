import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const featureMigration =
  'supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql';
const f010Migrations = [
  'supabase/migrations/20260929001001_f010_c10_encounter_api.sql',
  'supabase/migrations/20260929001002_f010_c11_encounter_update_api.sql',
  'supabase/migrations/20260929001003_f010_c12_note_signing.sql',
  'supabase/migrations/20260929001004_f010_c13_encounter_completion.sql',
  'supabase/migrations/20260929001005_f010_c17_referrals_api.sql',
  'supabase/migrations/20260929001006_f010_c18_referral_acceptance.sql',
  'supabase/migrations/20260929001007_f010_c19_referral_projections.sql',
  'supabase/migrations/20260929001008_f010_c22_context_messages.sql',
  'supabase/migrations/20260930001000_f010_c23_realtime_hint.sql',
  'supabase/migrations/20260930001001_f010_c26_privacy_guards.sql',
];
const f04Migration = 'supabase/migrations/20261001001002_f010_f04_completion_authority.sql';
const fixturePath = 'infra/db/tests/feature-010-update.sql';
const encounterId = 'f0101000-0000-4000-8800-000000000002';
const appointmentId = 'f0101000-0000-4000-8500-000000000004';
const queueEntryId = 'f0101000-0000-4000-8700-000000000004';
const clinicianId = 'f0101000-0000-4000-8000-000000000001';
const lockDeadlineMs = 15_000;

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const migrateCommand = packageJson.scripts?.['db:migrate'];
if (typeof migrateCommand !== 'string') {
  throw new Error('package.json is missing the db:migrate script.');
}
const migrations = [...migrateCommand.matchAll(/-f \/workspace\/([^\s]+\.sql)/g)].map((match) =>
  match[1].replaceAll('\\', '/'),
);
const featureMigrationIndex = migrations.indexOf(featureMigration);
const c26MigrationIndex = migrations.indexOf(f010Migrations.at(-1));
if (
  featureMigrationIndex < 0 ||
  migrations.lastIndexOf(featureMigration) !== featureMigrationIndex ||
  c26MigrationIndex <= featureMigrationIndex ||
  f010Migrations.some(
    (path, index) =>
      migrations.indexOf(path) <= featureMigrationIndex ||
      (index > 0 && migrations.indexOf(path) !== migrations.indexOf(f010Migrations[index - 1]) + 1),
  )
) {
  throw new Error(
    'The standalone db:migrate chain must contain the canonical F010 migrations in order.',
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
const requestedRuntime = process.argv.find((arg) => arg.startsWith('--runtime='))?.slice(10);
const runtimes = requestedRuntime
  ? configuredRuntimes.filter((runtime) => runtime.name === requestedRuntime)
  : configuredRuntimes;
const expectRed = process.argv.includes('--expect-red');
const expectGreen = process.argv.includes('--expect-green');
const includeForwardFix = process.argv.includes('--with-forward-fix');
if (runtimes.length === 0) throw new Error(`Unknown runtime: ${requestedRuntime}`);
if (expectRed === expectGreen) {
  throw new Error('Pass exactly one of --expect-red or --expect-green.');
}
if (expectGreen !== includeForwardFix) {
  throw new Error('--expect-green requires --with-forward-fix, and the RED baseline must omit it.');
}
if (includeForwardFix) readFileSync(resolve(root, f04Migration), 'utf8');

function runDocker(runtime, args, { input, label }) {
  const dockerArgs = ['exec'];
  if (input !== undefined) dockerArgs.push('-i');
  dockerArgs.push(runtime.container, ...args);
  const result = spawnSync('docker', dockerArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${label} failed${result.status === null ? '' : ` (exit ${result.status})`}${result.error ? `: ${result.error.message}` : ''}${detail ? `\n${detail}` : ''}`,
    );
  }
  return result.stdout;
}

function runPsql(runtime, database, sql, label) {
  return runDocker(
    runtime,
    ['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', runtime.user, '-d', database],
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
  let inputEnded = false;
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
      return `${stdout}${stderr ? `\n${stderr}` : ''}`;
    },
    closed,
    write(sql) {
      return new Promise((resolveWrite, rejectWrite) => {
        if (inputEnded || child.stdin.destroyed || child.exitCode !== null) {
          rejectWrite(new Error(`${label} is already closed.`));
          return;
        }
        child.stdin.write(sql, (error) => (error ? rejectWrite(error) : resolveWrite()));
      });
    },
    end() {
      if (!inputEnded && !child.stdin.destroyed) {
        inputEnded = true;
        child.stdin.end();
      }
    },
  };
}

async function waitForSessionText(session, expected, label) {
  const deadline = Date.now() + lockDeadlineMs;
  while (Date.now() < deadline) {
    if (session.output.includes(expected)) return;
    const outcome = await Promise.race([
      session.closed.then((closed) => ({ closed })),
      new Promise((resolveWait) => setTimeout(() => resolveWait(null), 25)),
    ]);
    if (outcome?.closed) {
      if (session.output.includes(expected)) return;
      throw new Error(
        `${label} exited before ${JSON.stringify(expected)} (exit ${outcome.closed.code}):\n${session.output}`,
      );
    }
  }
  throw new Error(
    `${label} did not emit ${JSON.stringify(expected)} within ${lockDeadlineMs}ms:\n${session.output}`,
  );
}

function activitySql(applicationName) {
  const name = applicationName.replaceAll("'", "''");
  return `SELECT waiting.application_name || '|' || blocker.application_name || '|' ||
                 waiting.wait_event_type || '|' || COALESCE(waiting.wait_event,'')
          FROM pg_catalog.pg_stat_activity waiting
          JOIN LATERAL pg_catalog.unnest(pg_catalog.pg_blocking_pids(waiting.pid)) blocked(pid) ON true
          JOIN pg_catalog.pg_stat_activity blocker ON blocker.pid=blocked.pid
          WHERE waiting.application_name='${name}' AND waiting.wait_event_type='Lock'
          ORDER BY blocker.application_name LIMIT 1;`;
}

async function waitForBlocker(runtime, database, applicationName, label) {
  const deadline = Date.now() + lockDeadlineMs;
  let last = '';
  while (Date.now() < deadline) {
    last = runPsqlTuples(
      runtime,
      database,
      activitySql(applicationName),
      `${label}: inspect pg_stat_activity`,
    );
    if (last) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(
    `${label} did not enter a PostgreSQL Lock wait within ${lockDeadlineMs}ms; last row=${last || '(none)'}.`,
  );
}

async function waitForCompleteOrBlocked(runtime, database, applicationName, session, label) {
  const deadline = Date.now() + lockDeadlineMs;
  while (Date.now() < deadline) {
    const blockedBy = runPsqlTuples(
      runtime,
      database,
      activitySql(applicationName),
      `${label}: inspect pg_stat_activity`,
    );
    if (blockedBy) return { kind: 'blocked', blockedBy };
    const closed = await Promise.race([
      session.closed,
      new Promise((resolveWait) => setTimeout(() => resolveWait(null), 25)),
    ]);
    if (closed) return { kind: 'completed', closed, output: session.output };
  }
  throw new Error(
    `${label} neither completed nor entered a PostgreSQL Lock wait within ${lockDeadlineMs}ms.`,
  );
}

function runMigration(runtime, database, migrationPath, label) {
  const sourcePath = resolve(root, migrationPath);
  const sourceDirectory = dirname(sourcePath);
  const source = readFileSync(sourcePath, 'utf8');
  const sql = source.replace(/^\\ir\s+(\S+)\s*$/gm, (_directive, includedPath) => {
    return readFileSync(resolve(sourceDirectory, includedPath), 'utf8');
  });
  if (/^\\ir\s+\S+/m.test(sql))
    throw new Error(`${migrationPath} has an unsupported nested psql include.`);
  runPsql(runtime, database, sql, `${runtime.name} ${label}: ${migrationPath}`);
}

function createDatabase(runtime, database, template = 'template0') {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `CREATE DATABASE "${database}" TEMPLATE "${template}";`,
    `${runtime.name} create ${database}`,
  );
}

function dropDatabase(runtime, database) {
  runPsql(
    runtime,
    runtime.adminDatabase,
    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`,
    `${runtime.name} drop ${database}`,
  );
}

function committedFixtureSql() {
  const fixture = readFileSync(resolve(root, fixturePath), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  if (rollbackIndex < 0 || fixture.slice(rollbackIndex).trim() !== 'ROLLBACK;') {
    throw new Error(`${fixturePath} no longer ends at its expected rollback boundary.`);
  }
  return `${fixture.slice(0, rollbackIndex)}\nCOMMIT;\n`;
}

function prepareFixture(runtime, database) {
  runPsql(
    runtime,
    database,
    committedFixtureSql(),
    `${runtime.name} commit synthetic C11/C13 fixture`,
  );
}

function completionSql(applicationName, keySuffix) {
  const hash = keySuffix.repeat(64);
  return `SET application_name='${applicationName}';
SET SESSION AUTHORIZATION shifaa_api;
BEGIN;
DO $f04_online_boundary$
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
     OR NOT pg_catalog.has_function_privilege(current_user,
       'clinical.complete_encounter_api_v1(uuid,integer,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege(current_user,
       'clinical.complete_encounter_v1(uuid,integer,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'F04 completion must use the narrow non-owner API grant';
  END IF;
END
$f04_online_boundary$;
SELECT pg_catalog.set_config('shifaa.person_id','${clinicianId}',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.actor_role','CLN',true);
SELECT pg_catalog.set_config('shifaa.action','completeEncounter',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
SELECT pg_catalog.set_config('shifaa.idempotency_key','f010-f04-${keySuffix}',true);
SELECT pg_catalog.set_config('shifaa.request_hash','${hash}',true);
SELECT clinical.complete_encounter_api_v1(
  '${encounterId}',5,
  jsonb_build_object('summary','F04 responsible clinician concurrent completion','structuralConfirmation',true)
);
COMMIT;
`;
}

function lifecycleAndEffects(runtime, database, keySuffix) {
  const idempotencyKey = `f010-f04-${keySuffix}`;
  return runPsqlTuples(
    runtime,
    database,
    `WITH completion_idempotency AS (
       SELECT state,response_status,response_body
       FROM platform.idempotency_records
       WHERE method='POST'
         AND route_template='/v1/encounters/{encounterId}/complete'
         AND key_hash=pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(
           'shifaa:idempotency:key:v1:'||pg_catalog.octet_length('${idempotencyKey}')||':${idempotencyKey}','UTF8')),'hex')
     )
     SELECT
       (SELECT profile_status FROM identity.people WHERE id='${clinicianId}') || '|' ||
       (SELECT status FROM clinical.encounters WHERE id='${encounterId}') || '|' ||
       (SELECT version::text FROM clinical.encounters WHERE id='${encounterId}') || '|' ||
       (SELECT status FROM clinical.appointments WHERE id='${appointmentId}') || '|' ||
       (SELECT state FROM clinical.queue_entries WHERE id='${queueEntryId}') || '|' ||
       (SELECT count(*)::text FROM completion_idempotency) || '|' ||
       COALESCE((SELECT state FROM completion_idempotency),'none') || '|' ||
       COALESCE((SELECT response_status::text FROM completion_idempotency),'none') || '|' ||
       COALESCE((SELECT CASE WHEN response_body IS NULL THEN 'missing' ELSE 'present' END
         FROM completion_idempotency),'none') || '|' ||
       (SELECT count(*)::text FROM audit.events WHERE resource_type='encounter'
         AND action_code='encounter.completed' AND resource_id='${encounterId}') || '|' ||
       (SELECT count(*)::text FROM platform.outbox_events WHERE aggregate_type='encounter'
         AND event_type='clinical.encounter.completed.v1' AND aggregate_id='${encounterId}');`,
    `${runtime.name} inspect completion lifecycle and effects`,
  );
}

function assertEquals(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, saw ${actual}.`);
}

function assertDenied(result, output, label) {
  if (result.code === 0 || !/(42501|P0002)/.test(output)) {
    throw new Error(
      `${label}: expected a current-authority denial, got exit ${result.code}:\n${output}`,
    );
  }
}

async function checkSuspensionWinsAfterPrecheck(runtime, database, prefix) {
  const holderName = `${prefix}_a_holder`;
  const completionName = `${prefix}_a_completion`;
  const suspensionName = `${prefix}_a_suspend`;
  const holder = startPsqlSession(runtime, database, `${runtime.name} F04 A lifecycle holder`);
  let completion;
  let suspender;
  try {
    await holder.write(`SET application_name='${holderName}';
BEGIN;
SELECT id::text || '|F04_A_APPOINTMENT_HELD' FROM clinical.appointments
WHERE id='${appointmentId}' FOR UPDATE;
`);
    await waitForSessionText(holder, 'F04_A_APPOINTMENT_HELD', `${runtime.name} F04 A holder`);

    completion = startPsqlSession(runtime, database, `${runtime.name} F04 A completion`);
    await completion.write(completionSql(completionName, 'a'));
    completion.end();
    const completionBlocker = await waitForBlocker(
      runtime,
      database,
      completionName,
      `${runtime.name} F04 A completion`,
    );
    assertEquals(
      completionBlocker.split('|')[1],
      holderName,
      `${runtime.name} F04 A completion blocker`,
    );
    if (completionBlocker.split('|')[2] !== 'Lock')
      throw new Error(
        `${runtime.name} F04 A wait was not a PostgreSQL Lock wait: ${completionBlocker}`,
      );
    console.log(`${runtime.name} F04 A: pg_stat_activity observed ${completionBlocker}.`);

    suspender = startPsqlSession(runtime, database, `${runtime.name} F04 A suspension`);
    await suspender.write(`SET application_name='${suspensionName}';
BEGIN;
UPDATE identity.people SET profile_status='suspended' WHERE id='${clinicianId}';
COMMIT;
SELECT 'F04_A_PROFILE_SUSPENDED';
`);
    suspender.end();
    await waitForSessionText(
      suspender,
      'F04_A_PROFILE_SUSPENDED',
      `${runtime.name} F04 A profile suspension`,
    );
    const suspensionResult = await suspender.closed;
    if (suspensionResult.code !== 0)
      throw new Error(`${runtime.name} F04 A suspension failed: ${suspender.output}`);

    await holder.write('COMMIT;\n');
    holder.end();
    const holderResult = await holder.closed;
    if (holderResult.code !== 0)
      throw new Error(`${runtime.name} F04 A holder failed: ${holder.output}`);
    completion.end();
    const completionResult = await completion.closed;
    const state = lifecycleAndEffects(runtime, database, 'a');

    if (expectRed) {
      if (completionResult.code !== 0) {
        throw new Error(
          `${runtime.name} F04 A baseline did not reproduce completion after suspension:\n${completion.output}`,
        );
      }
      assertEquals(
        state,
        'suspended|completed|6|completed|completed|1|completed|200|present|1|1',
        `${runtime.name} F04 A baseline effects`,
      );
      console.log(
        `${runtime.name} F04 A RED reproduced: committed profile suspension preceded successful completion; state=${state}.`,
      );
      return;
    }

    assertDenied(completionResult, completion.output, `${runtime.name} F04 A completion`);
    assertEquals(
      state,
      'suspended|open|5|in_consultation|in_service|0|none|none|none|0|0',
      `${runtime.name} F04 A protected effects`,
    );
    console.log(
      `${runtime.name} F04 A GREEN: denied after the committed suspension with zero lifecycle/audit/outbox/idempotency effects; state=${state}.`,
    );
  } finally {
    await holder.write('ROLLBACK;\n').catch(() => {});
    holder.end();
    await Promise.race([
      holder.closed,
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
    ]);
    if (completion) {
      completion.end();
      await Promise.race([
        completion.closed,
        new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
      ]);
    }
    if (suspender) {
      suspender.end();
      await Promise.race([
        suspender.closed,
        new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
      ]);
    }
  }
}

function installCompletionGate(runtime, database, lockKey1, lockKey2) {
  runPsql(
    runtime,
    database,
    `CREATE FUNCTION clinical.f010_f04_test_completion_gate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    BEGIN
      IF OLD.status='open' AND NEW.status='completed' THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(${lockKey1},${lockKey2});
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER f010_f04_test_completion_gate
      BEFORE UPDATE OF status ON clinical.encounters
      FOR EACH ROW WHEN (OLD.status='open' AND NEW.status='completed')
      EXECUTE FUNCTION clinical.f010_f04_test_completion_gate();`,
    `${runtime.name} install disposable F04 completion pause trigger`,
  );
}

async function checkCompletionProtectsFirst(runtime, database, prefix) {
  const lockKey1 = 1_840_104;
  const lockKey2 = process.pid;
  const gateName = `${prefix}_b_gate`;
  const completionName = `${prefix}_b_completion`;
  const suspensionName = `${prefix}_b_suspend`;
  installCompletionGate(runtime, database, lockKey1, lockKey2);

  const gate = startPsqlSession(runtime, database, `${runtime.name} F04 B trigger gate`);
  let completion;
  let suspender;
  try {
    await gate.write(`SET application_name='${gateName}';
SELECT pg_catalog.pg_advisory_lock(${lockKey1},${lockKey2}) || '|F04_B_GATE_HELD';
`);
    await waitForSessionText(gate, 'F04_B_GATE_HELD', `${runtime.name} F04 B gate`);

    completion = startPsqlSession(runtime, database, `${runtime.name} F04 B completion`);
    await completion.write(completionSql(completionName, 'b'));
    completion.end();
    const completionBlocker = await waitForBlocker(
      runtime,
      database,
      completionName,
      `${runtime.name} F04 B completion pause`,
    );
    assertEquals(completionBlocker.split('|')[1], gateName, `${runtime.name} F04 B gate blocker`);
    console.log(
      `${runtime.name} F04 B: completion reached its test-only post-authority pause at ${completionBlocker}.`,
    );

    suspender = startPsqlSession(runtime, database, `${runtime.name} F04 B suspension`);
    await suspender.write(`SET application_name='${suspensionName}';
BEGIN;
UPDATE identity.people SET profile_status='suspended' WHERE id='${clinicianId}';
COMMIT;
SELECT 'F04_B_PROFILE_SUSPENDED';
`);
    suspender.end();
    const suspensionOutcome = await waitForCompleteOrBlocked(
      runtime,
      database,
      suspensionName,
      suspender,
      `${runtime.name} F04 B profile suspension`,
    );

    if (expectRed) {
      if (suspensionOutcome.kind !== 'completed' || suspensionOutcome.closed.code !== 0) {
        throw new Error(
          `${runtime.name} F04 B baseline unexpectedly protected the profile first: ${JSON.stringify(suspensionOutcome)}\n${suspender.output}`,
        );
      }
      if (!suspensionOutcome.output.includes('F04_B_PROFILE_SUSPENDED')) {
        throw new Error(
          `${runtime.name} F04 B suspension exited without its commit marker:\n${suspensionOutcome.output}`,
        );
      }
      console.log(
        `${runtime.name} F04 B RED reproduced: profile suspension committed while completion was paused after its authority precheck.`,
      );
    } else {
      if (suspensionOutcome.kind !== 'blocked') {
        throw new Error(
          `${runtime.name} F04 B suspension was not blocked by completion: ${JSON.stringify(suspensionOutcome)}\n${suspensionOutcome.output}`,
        );
      }
      assertEquals(
        suspensionOutcome.blockedBy.split('|')[1],
        completionName,
        `${runtime.name} F04 B suspension blocker`,
      );
      if (suspensionOutcome.blockedBy.split('|')[2] !== 'Lock') {
        throw new Error(
          `${runtime.name} F04 B suspension was not in a PostgreSQL Lock wait: ${suspensionOutcome.blockedBy}`,
        );
      }
      console.log(
        `${runtime.name} F04 B GREEN: pg_stat_activity confirmed suspension waited on completion: ${suspensionOutcome.blockedBy}.`,
      );
    }

    await gate.write(
      `SELECT pg_catalog.pg_advisory_unlock(${lockKey1},${lockKey2}) || '|F04_B_GATE_RELEASED';\n`,
    );
    await waitForSessionText(gate, 'F04_B_GATE_RELEASED', `${runtime.name} F04 B release gate`);
    gate.end();
    const gateResult = await gate.closed;
    if (gateResult.code !== 0) throw new Error(`${runtime.name} F04 B gate failed: ${gate.output}`);

    completion.end();
    const completionResult = await completion.closed;
    if (expectGreen) {
      if (completionResult.code !== 0)
        throw new Error(`${runtime.name} F04 B completion failed: ${completion.output}`);
    } else if (completionResult.code !== 0) {
      throw new Error(
        `${runtime.name} F04 B baseline completion did not succeed after suspension:\n${completion.output}`,
      );
    }
    suspender.end();
    const suspensionResult = await suspender.closed;
    if (suspensionResult.code !== 0)
      throw new Error(`${runtime.name} F04 B suspension failed: ${suspender.output}`);

    const state = lifecycleAndEffects(runtime, database, 'b');
    assertEquals(
      state,
      'suspended|completed|6|completed|completed|1|completed|200|present|1|1',
      `${runtime.name} F04 B final state`,
    );
    if (expectRed) {
      console.log(
        `${runtime.name} F04 B RED confirmed: suspended clinician completion still committed; state=${state}.`,
      );
    } else {
      console.log(
        `${runtime.name} F04 B GREEN: completion committed atomically before suspension; final state=${state}.`,
      );
    }
  } finally {
    await gate
      .write(`SELECT pg_catalog.pg_advisory_unlock(${lockKey1},${lockKey2});\n`)
      .catch(() => {});
    gate.end();
    await Promise.race([gate.closed, new Promise((resolveWait) => setTimeout(resolveWait, 2_000))]);
    if (completion) {
      completion.end();
      await Promise.race([
        completion.closed,
        new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
      ]);
    }
    if (suspender) {
      suspender.end();
      await Promise.race([
        suspender.closed,
        new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
      ]);
    }
  }
}

async function testRuntime(runtime) {
  const suffix = `${process.pid}_${randomBytes(4).toString('hex')}`;
  const templateDatabase = `f010_f04_base_${suffix}`;
  const raceADatabase = `f010_f04_a_${suffix}`;
  const raceBDatabase = `f010_f04_b_${suffix}`;
  const created = [];
  try {
    createDatabase(runtime, templateDatabase);
    created.push(templateDatabase);
    for (const migrationPath of migrations.slice(0, featureMigrationIndex)) {
      runMigration(runtime, templateDatabase, migrationPath, 'baseline migration');
    }
    runMigration(runtime, templateDatabase, featureMigration, 'F010 base migration');
    for (const migrationPath of f010Migrations) {
      runMigration(runtime, templateDatabase, migrationPath, 'F010 migration');
    }
    if (includeForwardFix) runMigration(runtime, templateDatabase, f04Migration, 'F04 forward fix');

    createDatabase(runtime, raceADatabase, templateDatabase);
    created.push(raceADatabase);
    prepareFixture(runtime, raceADatabase);
    await checkSuspensionWinsAfterPrecheck(runtime, raceADatabase, `f010_f04_${suffix}`);

    createDatabase(runtime, raceBDatabase, templateDatabase);
    created.push(raceBDatabase);
    prepareFixture(runtime, raceBDatabase);
    await checkCompletionProtectsFirst(runtime, raceBDatabase, `f010_f04_${suffix}`);
    console.log(
      `${runtime.name}: F04 ${expectRed ? 'baseline RED' : 'forward-fix GREEN'} overlap regressions completed.`,
    );
  } finally {
    for (const database of created.reverse()) {
      try {
        dropDatabase(runtime, database);
      } catch (error) {
        console.error(`${runtime.name} cleanup could not drop ${database}: ${error.message}`);
        throw error;
      }
    }
  }
}

console.log(
  `F04 concurrent authority regression mode: ${expectRed ? 'expected baseline RED' : 'expected forward-fix GREEN'}; runtimes=${runtimes.map((runtime) => runtime.name).join(', ')}.`,
);
for (const runtime of runtimes) await testRuntime(runtime);
