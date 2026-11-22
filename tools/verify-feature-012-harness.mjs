import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  dependencyInputs,
  git,
  hostExecutable,
  localDocker,
  safeSource,
} from './verification/sandbox.mjs';

const root = resolve(import.meta.dirname, '..');
const dbImage =
  'public.ecr.aws/supabase/postgres@sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459';
const authImage =
  'public.ecr.aws/supabase/gotrue@sha256:362659ca70eaa75ba05bbaf963caa84c1c5afe5e8fbf0777e17b830dd5f0f60a';
const label = 'shifaa.f012.admission';
const dataDir = '/var/lib/postgresql/data';
const fullId = /^[a-f0-9]{64}$/;
const run = randomUUID();
const networkName = 'shifaa-f012-' + run;
const password = () => randomBytes(32).toString('hex');
const dbPassword = password();
const authPassword = password();
const apiPassword = password();
const jwtSecret = password();
const receipt = { run, containers: [], commands: [], negatives: [] };

let settings;
let networkId;
let before;
let stage = 'argument and tool admission';

function docker(args, { input, display = args, expected = 0 } = {}) {
  const outcome = spawnSync(
    hostExecutable('docker', settings.options.env),
    [...settings.prefix, ...args],
    {
      ...settings.options,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  receipt.commands.push({ args: [...settings.prefix, ...display], exit: outcome.status });
  assert.equal(outcome.status, expected, 'Docker command failed: ' + display.slice(0, 3).join(' '));
  return outcome.stdout;
}

function inspect(type, id) {
  return JSON.parse(docker([type, 'inspect', id]))[0];
}

function list(args) {
  return docker(args).trim().split(/\s+/).filter(Boolean).sort();
}

function inventory() {
  const containers = list(['ps', '-aq', '--no-trunc']).map((id) => {
    const c = inspect('container', id);
    return {
      id,
      name: c.Name,
      image: c.Image,
      startedAt: c.State.StartedAt,
      mounts: c.Mounts,
      networks: Object.values(c.NetworkSettings.Networks)
        .map((n) => n.NetworkID)
        .sort(),
    };
  });
  const volumes = list(['volume', 'ls', '-q']).map((name) => {
    const v = inspect('volume', name);
    return { name, createdAt: v.CreatedAt, driver: v.Driver };
  });
  return { containers, volumes };
}

function checkNetwork() {
  const network = inspect('network', networkId);
  assert.equal(network.Id, networkId);
  assert.equal(network.Name, networkName);
  assert.equal(network.Labels[label], run);
  assert.equal(network.Driver, 'bridge');
  assert.equal(network.Internal, true);
  for (const id of Object.keys(network.Containers ?? {})) {
    assert.ok(
      receipt.containers.some((c) => c.id === id && c.network === networkId),
      'Unknown network peer',
    );
  }
}

function checkContainer(resource) {
  assert.match(resource.id, fullId);
  assert.ok(!before.containers.some((c) => c.id === resource.id), 'Retained container denied');
  const c = inspect('container', resource.id);
  assert.equal(c.Id, resource.id);
  assert.equal(c.Name, '/' + resource.name);
  assert.equal(c.Image, resource.image);
  assert.equal(c.Config.Labels?.[label], run);
  const host = c.HostConfig;
  assert.equal(host.Privileged, false);
  assert.equal(host.PublishAllPorts, false);
  assert.deepEqual(Object.keys(host.PortBindings ?? {}), []);
  for (const key of ['Binds', 'Mounts', 'VolumesFrom', 'Devices', 'DeviceRequests']) {
    assert.deepEqual(host[key] ?? [], []);
  }
  assert.deepEqual(host.Tmpfs ?? {}, resource.tmpfs);
  assert.ok(
    c.Mounts.every((m) => m.Type === 'tmpfs' && Object.hasOwn(resource.tmpfs, m.Destination)),
    'Unexpected persistent or host mount',
  );
  const attached = Object.entries(c.NetworkSettings.Networks);
  assert.equal(host.NetworkMode, resource.network);
  const disconnected = resource.network === 'none';
  assert.deepEqual(
    attached.map(([name]) => name),
    [disconnected ? 'none' : networkName],
  );
  if (c.State.Running) {
    assert.equal(attached[0][1].NetworkID, disconnected ? receipt.noneNetworkId : networkId);
  }
  checkNetwork();
  return c;
}

function create(
  role,
  image,
  { network = networkId, flags = [], command = [], env = {}, tmpfs = {} } = {},
) {
  const name = networkName + '-' + role;
  const environment = Object.entries(env).flatMap(([key, value]) => ['--env', key + '=' + value]);
  const mounts = Object.entries(tmpfs).flatMap(([target, options]) => [
    '--tmpfs',
    target + ':' + options,
  ]);
  const prefix = [
    'create',
    '--pull=never',
    '--name',
    name,
    '--network',
    network,
    '--label',
    label + '=' + run,
    '--pids-limit=128',
    '--memory=768m',
    '--cpus=1',
    '--security-opt=no-new-privileges',
    ...mounts,
    ...flags,
  ];
  const visibleEnv = Object.keys(env).flatMap((key) => ['--env', key + '=<generated>']);
  const id = docker([...prefix, ...environment, image, ...command], {
    display: [...prefix, ...visibleEnv, image, ...command],
  }).trim();
  assert.match(id, fullId);
  const resource = { id, name, image, network, tmpfs, role };
  receipt.containers.push(resource);
  checkContainer(resource);
  docker(['start', id]);
  checkContainer(resource);
  return resource;
}

function exec(resource, args, options) {
  assert.equal(checkContainer(resource).State.Running, true);
  return docker(['exec', '-i', resource.id, ...args], options);
}

const sql = (resource, input) =>
  exec(
    resource,
    ['psql', '-XAt', '--set=ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
    { input },
  );

function startDatabase(role, network) {
  const db = create(role, receipt.images.postgres, {
    network,
    tmpfs: { [dataDir]: 'rw,nosuid,nodev,size=768m' },
    env: { POSTGRES_PASSWORD: dbPassword, JWT_SECRET: jwtSecret, JWT_EXP: '900' },
    flags: network === 'none' ? [] : ['--network-alias', 'db'],
  });
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      // The image's bootstrap server listens only on a Unix socket.
      exec(db, ['pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres']);
      const system = sql(db, 'select system_identifier from pg_control_system();\n').trim();
      assert.match(system, /^\d{19}$/);
      return { ...db, system };
    } catch (error) {
      if (!String(error.message).startsWith('Docker command failed: exec')) throw error;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
  }
  throw new Error('Database never passed readiness');
}

function probeSchema() {
  return (
    'begin;\n' +
    [
      'create schema f012_admission;',
      "create role f012_probe login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password '" +
        apiPassword +
        "';",
      'revoke all on schema f012_admission from public;',
      'grant usage on schema f012_admission to f012_probe;',
      'create table f012_admission.person (subject uuid primary key, person uuid unique not null, hits int not null default 0);',
      'alter table f012_admission.person enable row level security;',
      'alter table f012_admission.person force row level security;',
      "create policy probe_person on f012_admission.person to f012_probe using (subject = nullif(current_setting('f012_probe.subject', true), '')::uuid);",
      'grant select, update(hits) on f012_admission.person to f012_probe;',
      'commit;',
    ].join('\n') +
    '\n'
  );
}

const nativeSessionPolicy = {
  GOTRUE_SESSIONS_TIMEBOX: '23h45m',
  GOTRUE_SESSIONS_INACTIVITY_TIMEOUT: '45m',
  GOTRUE_SESSIONS_SINGLE_PER_USER: 'false',
  GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
  GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '10',
  GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE: 'false',
  GOTRUE_MFA_TOTP_ENROLL_ENABLED: 'true',
  GOTRUE_MFA_TOTP_VERIFY_ENABLED: 'true',
  GOTRUE_MFA_MAX_ENROLLED_FACTORS: '10',
  GOTRUE_HOOK_MFA_VERIFICATION_ATTEMPT_ENABLED: 'false',
  GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED: 'false',
  GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: 'false',
  GOTRUE_HOOK_SEND_EMAIL_ENABLED: 'false',
  GOTRUE_HOOK_SEND_SMS_ENABLED: 'false',
  GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED: 'false',
  GOTRUE_HOOK_AFTER_USER_CREATED_ENABLED: 'false',
};

function startAuth(readSessionPolicy) {
  return create('auth', receipt.images.auth, {
    env: {
      API_EXTERNAL_URL: 'http://auth:9999',
      GOTRUE_SITE_URL: 'http://auth:9999',
      GOTRUE_API_HOST: '0.0.0.0',
      GOTRUE_API_PORT: '9999',
      GOTRUE_DB_DRIVER: 'postgres',
      GOTRUE_DB_DATABASE_URL:
        'postgres://supabase_auth_admin:' + authPassword + '@db:5432/postgres?sslmode=disable',
      GOTRUE_DB_MIGRATIONS_PATH: '/usr/local/etc/auth/migrations',
      GOTRUE_JWT_SECRET: jwtSecret,
      GOTRUE_JWT_ISSUER: 'http://auth:9999',
      GOTRUE_JWT_EXP: '900',
      GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_MAILER_AUTOCONFIRM: 'true',
      GOTRUE_DISABLE_SIGNUP: 'false',
      ...(readSessionPolicy ? nativeSessionPolicy : {}),
    },
    flags: ['--network-alias', 'auth'],
    command: ['auth'],
  });
}

function observeNativePolicy(auth) {
  const configuration = checkContainer(auth).Config;
  const expected = { ...nativeSessionPolicy, GOTRUE_JWT_EXP: '900' };
  const actual = Object.fromEntries(
    configuration.Env.map((entry) => entry.split(/=(.*)/s, 2)).filter(([key]) =>
      Object.hasOwn(expected, key),
    ),
  );
  assert.deepEqual(actual, expected);
  const absent = ['GOTRUE_SESSIONS_TAGS', 'GOTRUE_SESSIONS_ALLOW_LOW_AAL'];
  for (const key of absent) {
    assert.ok(configuration.Env.every((entry) => !entry.startsWith(key + '=')));
  }
  assert.deepEqual(configuration.Cmd, ['auth']);
  receipt.nativePolicy = { environment: actual, absent, command: configuration.Cmd };
}

function disposableNativeAdminToken() {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = [
    part({ alg: 'HS256', typ: 'JWT' }),
    part({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 180 }),
  ].join('.');
  return data + '.' + createHmac('sha256', jwtSecret).update(data).digest('base64url');
}

function trial(name, action, expected) {
  assert.throws(action, expected);
  receipt.negatives.push(name);
}

function pinnedImage(reference, inputs) {
  const image = inspect('image', reference);
  assert.match(image.Id, /^sha256:[a-f0-9]{64}$/);
  if (inputs) {
    assert.equal(image.Config.Labels?.['shifaa.verify.inputs'], inputs);
  } else {
    assert.ok(image.RepoDigests.includes(reference), 'Image digest could not be verified');
  }
  assert.deepEqual(Object.keys(image.Config.Volumes ?? {}), []);
  return image.Id;
}

function verifyRestore(db, restore) {
  assert.notEqual(db.id, restore.id);
  assert.notEqual(db.system, restore.system);
  assert.equal(restore.network, 'none');
  const dump = exec(db, [
    'pg_dump',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '--schema=f012_admission',
    '--no-owner',
    '--no-privileges',
  ]);
  assert.ok(dump.includes('CREATE TABLE f012_admission.person'));
  // The throwaway target requires the replica policy role; no login is needed.
  sql(restore, 'create role f012_probe nologin;\n');
  sql(restore, dump);
  const readRows = 'select subject,person,hits from f012_admission.person order by subject;\n';
  const original = sql(db, readRows).trim();
  const rows = original.split('\n').map((row) => row.split('|'));
  assert.equal(rows.length, 2);
  for (const [subject, person, hits] of rows) {
    assert.ok(
      receipt.syntheticSessions.some(
        (entry) => entry.subject === subject && entry.person === person,
      ),
    );
    assert.equal(hits, subject === receipt.syntheticSessions[0].subject ? '1' : '2');
  }
  assert.equal(sql(restore, readRows).trim(), original);
  receipt.restore = {
    rows: rows.length,
    exactMatch: true,
    dumpSha256: createHash('sha256').update(dump).digest('hex'),
  };
}

function teardown() {
  for (const c of [...receipt.containers].reverse()) {
    checkContainer(c);
    docker(['rm', '-f', c.id]);
  }
  checkNetwork();
  docker(['network', 'rm', networkId]);
}

function observeSqlCommand(db) {
  assert.equal(checkContainer(db).State.Running, true);
  return [
    ...settings.prefix,
    'exec',
    '-i',
    db.id,
    'psql',
    '-XAt',
    '--set=ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
  ];
}

function observedSql(db, input) {
  const args = observeSqlCommand(db);
  const result = spawnSync(hostExecutable('docker', settings.options.env), args, {
    ...settings.options,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  const stdout = result.stdout?.toString() ?? '';
  const stderr = result.stderr?.toString() ?? '';
  receipt.commands.push({ args, exit: result.status });
  return { exit: result.status, stdout, stderr };
}

async function nativeAuthorityBaseline(db, probe, source, fixtures) {
  const fixture = readFileSync(safeSource(root, 'infra/db/tests/feature-012-native-guard.sql'));
  const catalog = observedSql(db, fixture);
  const receiptEntry = (receipt.nativeAuthorityBaseline = {
    fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
    catalog,
    trials: [],
  });
  assert.equal(catalog.exit, 0, catalog.stderr);
  assert.match(catalog.stdout, /^probe_nobypass_nonowner\|t$/m);
  assert.match(catalog.stdout, /^probe_has_native_table_access\|f$/m);

  // bindFixtures validated both IDs and checked the relationship in Auth.
  const { subject, session } = fixtures[0];
  const userRow = `SELECT 'user', count(*) FROM (
    SELECT id FROM auth.users WHERE id = '${subject}' FOR SHARE
  ) locked;`;
  const sessionRow = `SELECT 'session', count(*) FROM (
    SELECT id FROM auth.sessions WHERE id = '${session}' AND user_id = '${subject}' FOR SHARE
  ) locked;`;
  const reader = userRow + '\n' + sessionRow;
  const mutations = [
    [
      'user ban',
      `UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 minute'
       WHERE id = '${subject}';`,
    ],
    [
      'session removal',
      `DELETE FROM auth.sessions WHERE id = '${session}' AND user_id = '${subject}';`,
    ],
  ];
  for (const [name, mutation] of mutations) {
    const relation = name === 'user ban' ? 'users' : 'sessions';
    for (const writerFirst of [false, true]) {
      const trial = { name, writerFirst };
      receiptEntry.trials.push(trial);
      await observeNativeLockConflict(db, relation, reader, mutation, trial);
    }
  }
  const intact = observedSql(db, reader);
  receiptEntry.afterRollback = intact;
  assert.equal(intact.exit, 0, intact.stderr);
  assert.equal(intact.stdout, 'user|1\nsession|1\n');
  receiptEntry.localLogout = {};
  await observeNativeLogout(db, probe, source, reader, receiptEntry.localLogout);
}

async function observeNativeLogout(db, probe, source, reader, observation) {
  const holderArgs = observeSqlCommand(db);
  assert.equal(checkContainer(probe).State.Running, true);
  const cli = hostExecutable('docker', settings.options.env);
  const holder = spawn(cli, holderArgs, { ...settings.options, stdio: ['pipe', 'pipe', 'pipe'] });
  const holderClosed = once(holder, 'close');
  let holderOutput = '';
  let holderError = '';
  let readyTimeout;
  let logout;
  holder.stderr.setEncoding('utf8').on('data', (chunk) => (holderError += chunk));
  try {
    const ready = new Promise((resolve, reject) => {
      holder.stdout.setEncoding('utf8').on('data', (chunk) => {
        holderOutput += chunk;
        if (/^T010_LOGOUT_READY$/m.test(holderOutput)) resolve(true);
      });
      holder.stdin.on('error', reject);
      readyTimeout = setTimeout(() => reject(new Error('Logout holder did not start')), 10_000);
    });
    holder.stdin.write(`BEGIN;
      SET LOCAL idle_in_transaction_session_timeout = '15s';
      SET SESSION AUTHORIZATION supabase_auth_admin;
      SELECT 'holder', pg_backend_pid();
      ${reader}
      \\echo T010_LOGOUT_READY
    `);
    assert.equal(await Promise.race([ready, holderClosed]), true, holderError);
    assert.match(holderOutput, /^user\|1\nsession\|1$/m);
    const holderPid = holderOutput.match(/^holder\|(\d+)$/m)?.[1];
    assert.ok(holderPid);
    observation.holder = holderOutput;

    const args = [...settings.prefix, 'exec', '-i', probe.id, 'node', '-', 'local-logout'];
    const request = spawn(cli, args, { ...settings.options, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    request.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    request.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    logout = once(request, 'close').then(([exit]) => {
      receipt.commands.push({ args, exit });
      return { exit, stdout, stderr };
    });
    request.stdin.on('error', () => request.kill());
    request.stdin.end(source);

    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const wait = observedSql(
        db,
        `SELECT pid, usename, wait_event_type FROM pg_stat_activity
        WHERE usename = 'supabase_auth_admin' AND ${holderPid} = ANY(pg_blocking_pids(pid));`,
      );
      assert.equal(wait.exit, 0, wait.stderr);
      if (wait.stdout) {
        assert.match(wait.stdout, /^\d+\|supabase_auth_admin\|Lock\n$/);
        observation.nativeWait = wait.stdout;
        break;
      }
      await delay(80);
    }
  } finally {
    clearTimeout(readyTimeout);
    holder.stdin.end('ROLLBACK;\n');
    const [exit] = await holderClosed;
    receipt.commands.push({ args: holderArgs, exit });
    if (logout) observation.http = await logout;
    assert.equal(exit, 0, holderError);
  }
  assert.ok(observation.nativeWait, 'Did not observe GoTrue waiting on the native session holder');
  assert.equal(observation.http.exit, 0, observation.http.stderr);
  assert.deepEqual(JSON.parse(observation.http.stdout), { status: 204 });
  observation.afterLogout = observedSql(db, reader);
  assert.equal(observation.afterLogout.exit, 0, observation.afterLogout.stderr);
  assert.equal(observation.afterLogout.stdout, 'user|1\nsession|0\n');
}

async function observeNativeLockConflict(db, relation, reader, mutation, trial) {
  const { writerFirst } = trial;
  const args = observeSqlCommand(db);
  const holder = spawn(hostExecutable('docker', settings.options.env), args, {
    ...settings.options,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(holder, 'close');
  let stdout = '';
  let stderr = '';
  let timeout;
  holder.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  const contend = () =>
    observedSql(
      db,
      `\\set VERBOSITY verbose
        BEGIN;
        SET LOCAL lock_timeout = '500ms';
        SET LOCAL statement_timeout = '3s';
        SET SESSION AUTHORIZATION supabase_auth_admin;
        SELECT 'contender', pg_backend_pid(), session_user;
        ${writerFirst ? reader : mutation}
        ROLLBACK;`,
    );
  try {
    const ready = new Promise((resolve, reject) => {
      holder.stdout.setEncoding('utf8').on('data', (chunk) => {
        stdout += chunk;
        if (/^T010_HOLDER_READY$/m.test(stdout)) resolve(true);
      });
      holder.stdin.on('error', reject);
      timeout = setTimeout(() => reject(new Error('Native holder did not become ready')), 10_000);
    });
    holder.stdin.write(`
        BEGIN;
        SET LOCAL idle_in_transaction_session_timeout = '15s';
        SET LOCAL statement_timeout = '3s';
        SET SESSION AUTHORIZATION supabase_auth_admin;
        SELECT 'holder', pg_backend_pid(), session_user;
        ${writerFirst ? mutation : reader}
        \\echo T010_HOLDER_READY
      `);
    assert.equal(await Promise.race([ready, closed]), true, stderr);
    trial.holder = stdout;
    const blocked = (trial.blocked = contend());
    assert.match(stdout, writerFirst ? /^(?:UPDATE|DELETE) 1$/m : /^user\|1\nsession\|1$/m);
    const holderPid = stdout.match(/^holder\|(\d+)\|supabase_auth_admin$/m)?.[1];
    const contenderPid = blocked.stdout.match(/^contender\|(\d+)\|supabase_auth_admin$/m)?.[1];
    assert.ok(holderPid && contenderPid, 'Missing independent native backend evidence');
    assert.notEqual(holderPid, contenderPid);
    assert.equal(blocked.exit, 3, blocked.stdout);
    assert.match(blocked.stderr, /55P03:.*lock timeout/);
    assert.ok(blocked.stderr.includes('relation "' + relation + '"'), blocked.stderr);
  } finally {
    clearTimeout(timeout);
    holder.stdin.end('ROLLBACK;\n');
    const [exit] = await closed;
    receipt.commands.push({ args, exit });
    assert.equal(exit, 0, stderr);
  }
  const released = (trial.released = contend());
  assert.equal(released.exit, 0, released.stderr);
  assert.match(released.stdout, writerFirst ? /^user\|1\nsession\|1$/m : /^(?:UPDATE|DELETE) 1$/m);
  assert.match(released.stdout, /^ROLLBACK$/m);
}

async function withNativeFixtureLock(db, statement, trial, exercise, role = 'supabase_auth_admin') {
  const args = observeSqlCommand(db);
  const holder = spawn(hostExecutable('docker', settings.options.env), args, {
    ...settings.options,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(holder, 'close');
  let stdout = '';
  let stderr = '';
  let timer;
  holder.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  try {
    const ready = new Promise((resolve, reject) => {
      holder.stdout.setEncoding('utf8').on('data', (chunk) => {
        stdout += chunk;
        if (/^T010_NATIVE_FIXTURE_READY$/m.test(stdout)) resolve(true);
      });
      holder.stdin.on('error', reject);
      timer = setTimeout(() => reject(new Error('Native fixture lock was not ready')), 10_000);
    });
    holder.stdin.write(`BEGIN;
      SET LOCAL idle_in_transaction_session_timeout = '20s';
      SET LOCAL statement_timeout = '3s';
      SET SESSION AUTHORIZATION ${role};
      SELECT 'holder', pg_backend_pid();
      ${statement}
      \\echo T010_NATIVE_FIXTURE_READY
    `);
    assert.equal(await Promise.race([ready, closed]), true, stderr);
    trial.holder = stdout;
    const pid = stdout.match(/^holder\|(\d+)$/m)?.[1];
    assert.ok(pid);
    await exercise(pid);
  } finally {
    clearTimeout(timer);
    holder.stdin.end('ROLLBACK;\n');
    const [exit] = await closed;
    receipt.commands.push({ args, exit });
    assert.equal(exit, 0, stderr);
  }
}

async function nativeRefreshTrials(db, probe, source, fixtures) {
  const results = (receipt.nativeRefresh = { readerFirst: {}, refreshFirst: {} });
  const lockRows = ({ subject, session }) => `
    SELECT 'user', id FROM auth.users WHERE id = '${subject}' FOR SHARE;
    SELECT 'session', id FROM auth.sessions
      WHERE id = '${session}' AND user_id = '${subject}' FOR SHARE;`;
  const sessionState = ({ subject, session }) =>
    observedSql(
      db,
      `SELECT id, user_id, refreshed_at IS NOT NULL
      FROM auth.sessions WHERE id = '${session}' AND user_id = '${subject}';`,
    );
  const [first, second] = fixtures;
  const firstTrial = results.readerFirst;
  firstTrial.before = sessionState(first);
  assert.equal(firstTrial.before.exit, 0, firstTrial.before.stderr);
  assert.equal(firstTrial.before.stdout, `${first.session}|${first.subject}|f\n`);
  await withNativeFixtureLock(db, lockRows(first), firstTrial, () => {
    assert.match(firstTrial.holder, /^user\|.+\nsession\|.+$/m);
    firstTrial.exhausted = JSON.parse(
      exec(probe, ['node', '-', 'native-refresh'], { input: source }),
    );
    firstTrial.whileHeld = sessionState(first);
    assert.deepEqual(firstTrial.exhausted, { status: 409 });
    assert.deepEqual(firstTrial.whileHeld, firstTrial.before);
  });
  const success = { status: 200, sessionBinding: true, refreshIssued: true };
  firstTrial.retry = JSON.parse(exec(probe, ['node', '-', 'native-refresh'], { input: source }));
  assert.deepEqual(firstTrial.retry, success);
  firstTrial.after = sessionState(first);
  assert.equal(firstTrial.after.exit, 0, firstTrial.after.stderr);
  assert.equal(firstTrial.after.stdout, `${first.session}|${first.subject}|t\n`);

  const secondTrial = results.refreshFirst;
  let pendingRefresh;
  try {
    // The pinned refresh writes its audit entry only after locking the session.
    await withNativeFixtureLock(
      db,
      'LOCK TABLE auth.audit_log_entries IN SHARE MODE;',
      secondTrial,
      async (auditHolderPid) => {
        assert.equal(checkContainer(probe).State.Running, true);
        const args = [
          ...settings.prefix,
          'exec',
          '-i',
          probe.id,
          'node',
          '-',
          'native-refresh-second',
        ];
        const cli = hostExecutable('docker', settings.options.env);
        const request = spawn(cli, args, { ...settings.options, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        request.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
        request.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
        pendingRefresh = once(request, 'close').then(([exit]) => {
          receipt.commands.push({ args, exit });
          return { exit, stdout, stderr };
        });
        request.stdin.on('error', () => request.kill());
        request.stdin.end(source);
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline) {
          const wait = observedSql(
            db,
            `SELECT pid, wait_event_type FROM pg_stat_activity
              WHERE usename = 'supabase_auth_admin'
                AND ${auditHolderPid} = ANY(pg_blocking_pids(pid));`,
          );
          assert.equal(wait.exit, 0, wait.stderr);
          if (wait.stdout) {
            secondTrial.refreshWait = wait;
            break;
          }
          await delay(80);
        }
        assert.match(secondTrial.refreshWait?.stdout ?? '', /^\d+\|Lock\n$/);
        secondTrial.reader = observedSql(
          db,
          `\\set VERBOSITY verbose
          BEGIN;
          SET LOCAL lock_timeout = '500ms';
          SET LOCAL statement_timeout = '3s';
          SET SESSION AUTHORIZATION supabase_auth_admin;
          SELECT 'reader', pg_backend_pid();
          ${lockRows(second)}
          ROLLBACK;`,
        );
        assert.equal(secondTrial.reader.exit, 3, secondTrial.reader.stdout);
        assert.match(secondTrial.reader.stderr, /55P03:.*lock timeout/);
        assert.match(secondTrial.reader.stderr, /relation "sessions"/);
        assert.match(secondTrial.reader.stdout, new RegExp('^user\\|' + second.subject + '$', 'm'));
      },
    );
  } finally {
    if (pendingRefresh) secondTrial.http = await pendingRefresh;
  }
  assert.equal(secondTrial.http.exit, 0, secondTrial.http.stderr);
  assert.deepEqual(JSON.parse(secondTrial.http.stdout), success);
  secondTrial.retry = observedSql(db, lockRows(second));
  assert.equal(secondTrial.retry.exit, 0, secondTrial.retry.stderr);
  assert.equal(secondTrial.retry.stdout, `user|${second.subject}\nsession|${second.session}\n`);
  secondTrial.after = sessionState(second);
  assert.equal(secondTrial.after.exit, 0, secondTrial.after.stderr);
  assert.equal(secondTrial.after.stdout, `${second.session}|${second.subject}|t\n`);
}

async function nativeLogoutFirstTrial(db, probe, source, { subject, session }) {
  const trial = (receipt.nativeLogoutFirst = {});
  // Hold a disposable AFTER DELETE barrier to observe the real logout before commit.
  const barrier = observedSql(
    db,
    `CREATE FUNCTION auth.t010_logout_barrier() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $fixture$
      BEGIN PERFORM pg_advisory_xact_lock(7412, 10); RETURN NULL; END $fixture$;
    CREATE TRIGGER t010_logout_barrier AFTER DELETE ON auth.sessions FOR EACH ROW
      WHEN (OLD.id = '${session}'::uuid AND OLD.user_id = '${subject}'::uuid)
      EXECUTE FUNCTION auth.t010_logout_barrier();`,
  );
  trial.barrier = barrier;
  assert.equal(barrier.exit, 0, barrier.stderr);
  const read = `SELECT 'user', id FROM auth.users WHERE id = '${subject}' FOR SHARE;
    SELECT 'session', id FROM auth.sessions
      WHERE id = '${session}' AND user_id = '${subject}' FOR SHARE;`;
  let logout;
  try {
    await withNativeFixtureLock(
      db,
      'SELECT pg_advisory_xact_lock(7412, 10);',
      trial,
      async (pid) => {
        assert.equal(checkContainer(probe).State.Running, true);
        const args = [...settings.prefix, 'exec', '-i', probe.id, 'node', '-', 'local-logout-held'];
        const cli = hostExecutable('docker', settings.options.env);
        const request = spawn(cli, args, { ...settings.options, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        request.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
        request.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
        logout = once(request, 'close').then(([exit]) => {
          receipt.commands.push({ args, exit });
          return { exit, stdout, stderr };
        });
        request.stdin.on('error', () => request.kill());
        request.stdin.end(source);

        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline) {
          const wait = observedSql(
            db,
            `SELECT pid, wait_event FROM pg_stat_activity WHERE usename = 'supabase_auth_admin'
            AND ${pid} = ANY(pg_blocking_pids(pid));`,
          );
          assert.equal(wait.exit, 0, wait.stderr);
          if (wait.stdout) {
            trial.logoutWait = wait;
            break;
          }
          await delay(80);
        }
        assert.match(trial.logoutWait?.stdout ?? '', /^\d+\|advisory\n$/);
        trial.reader = observedSql(
          db,
          `\\set VERBOSITY verbose
          BEGIN;
          SET LOCAL lock_timeout = '500ms';
          SET LOCAL statement_timeout = '3s';
          SET SESSION AUTHORIZATION supabase_auth_admin;
          SELECT 'reader', pg_backend_pid();
          ${read}
          ROLLBACK;`,
        );
        assert.equal(trial.reader.exit, 3, trial.reader.stdout);
        assert.match(trial.reader.stderr, /55P03:.*lock timeout/);
        assert.match(trial.reader.stderr, /relation "sessions"/);
        assert.ok(trial.reader.stdout.includes(`user|${subject}\n`));
        assert.notEqual(
          trial.reader.stdout.match(/^reader\|(\d+)$/m)?.[1],
          trial.logoutWait.stdout.split('|')[0],
        );
      },
    );
  } finally {
    if (logout) trial.http = await logout;
  }
  assert.equal(trial.http.exit, 0, trial.http.stderr);
  assert.deepEqual(JSON.parse(trial.http.stdout), { status: 204 });
  trial.afterCommit = observedSql(db, read);
  assert.equal(trial.afterCommit.exit, 0, trial.afterCommit.stderr);
  assert.equal(trial.afterCommit.stdout, `user|${subject}\n`);
}

function startNativeMutation(probe, source, operation, fixtureIndex) {
  assert.equal(checkContainer(probe).State.Running, true);
  const args = [
    ...settings.prefix,
    'exec',
    '-i',
    probe.id,
    'node',
    '-',
    'native-mutation',
    operation,
    String(fixtureIndex),
  ];
  const cli = hostExecutable('docker', settings.options.env);
  const request = spawn(cli, args, { ...settings.options, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  request.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
  request.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  const closed = once(request, 'close').then(([exit]) => {
    receipt.commands.push({ args, exit });
    return { exit, stdout, stderr };
  });
  request.stdin.on('error', () => request.kill());
  request.stdin.end(source);
  return closed;
}

async function waitForNativeWriter(db, holderPid, expectedEvent) {
  assert.match(holderPid, /^\d+$/);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const wait = observedSql(
      db,
      `SELECT pid, wait_event FROM pg_stat_activity WHERE usename = 'supabase_auth_admin'
        AND ${holderPid} = ANY(pg_blocking_pids(pid));`,
    );
    assert.equal(wait.exit, 0, wait.stderr);
    if (wait.stdout) {
      assert.match(wait.stdout, expectedEvent);
      return wait;
    }
    await delay(80);
  }
  throw new Error('Pinned Auth writer did not wait on the expected holder');
}

async function nativeMutationTrials(db, probe, source, fixtures, operation) {
  const result = (receipt.nativeMutation = { operation, readerFirst: {}, writerFirst: {} });
  const details =
    operation === 'ban'
      ? []
      : JSON.parse(
          exec(probe, ['node', '-', 'prepare-native-mutation', operation], { input: source }),
        );
  result.prepared = details;
  const targetsUser = operation !== 'downgrade';
  const relation = targetsUser ? 'users' : 'sessions';
  const initial = { ban: 'f|1\n', downgrade: 'aal2|1\n', recovery: '1|1\n' }[operation];
  const expected = { ban: 't|1\n', downgrade: 'aal1|0\n', recovery: '0|1\n' }[operation];
  const expectedHttp =
    operation === 'downgrade' ? { status: 200 } : { status: 200, previousLogin: 400 };
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  for (const fixtureIndex of [0, 1]) {
    const { subject, session } = fixtures[fixtureIndex];
    const trial = fixtureIndex === 0 ? result.readerFirst : result.writerFirst;
    const detail = details[fixtureIndex];
    const fixtureId = detail?.factor ?? detail?.recoverySession;
    if (detail) assert.match(fixtureId, uuid);
    const boundSession = `user_id = '${subject}' AND id = '${session}'`;
    const lockRows = `
      SELECT 'user', id FROM auth.users WHERE id = '${subject}' FOR SHARE;
      SELECT 'session', id FROM auth.sessions WHERE ${boundSession} FOR SHARE;`;
    const readState = {
      ban: `SELECT coalesce(banned_until > clock_timestamp(), false),
        (SELECT count(*) FROM auth.sessions WHERE ${boundSession})
        FROM auth.users WHERE id = '${subject}';`,
      downgrade: `SELECT aal, (SELECT count(*) FROM auth.mfa_factors
        WHERE id = '${fixtureId}' AND user_id = '${subject}') FROM auth.sessions WHERE ${boundSession};`,
      recovery: `SELECT count(*) FILTER (WHERE id = '${session}'),
        count(*) FILTER (WHERE id = '${fixtureId}') FROM auth.sessions WHERE user_id = '${subject}';`,
    }[operation];
    trial.before = observedSql(db, readState);
    assert.equal(trial.before.exit, 0, trial.before.stderr);
    assert.equal(trial.before.stdout, initial);

    let mutation;
    try {
      if (fixtureIndex === 0) {
        await withNativeFixtureLock(db, lockRows, trial, async (holderPid) => {
          assert.match(trial.holder, /^user\|[\da-f-]+\nsession\|[\da-f-]+$/m);
          mutation = startNativeMutation(probe, source, operation, fixtureIndex);
          trial.wait = await waitForNativeWriter(db, holderPid, /^\d+\|(transactionid|tuple)\n$/);
          assert.deepEqual(observedSql(db, readState), trial.before);
        });
      } else {
        const target = targetsUser ? subject : session;
        const changedColumn = {
          ban: 'banned_until',
          downgrade: 'aal',
          recovery: 'encrypted_password',
        }[operation];
        trial.barrier = observedSql(
          db,
          `CREATE FUNCTION auth.t010_mutation_barrier() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog AS $fixture$
            BEGIN PERFORM pg_advisory_xact_lock(7412, 11); RETURN NULL; END $fixture$;
          CREATE TRIGGER t010_mutation_barrier AFTER UPDATE OF ${changedColumn}
            ON auth.${relation} FOR EACH ROW WHEN (OLD.id = '${target}'::uuid)
            EXECUTE FUNCTION auth.t010_mutation_barrier();`,
        );
        assert.equal(trial.barrier.exit, 0, trial.barrier.stderr);
        await withNativeFixtureLock(
          db,
          'SELECT pg_advisory_xact_lock(7412, 11);',
          trial,
          async (holderPid) => {
            mutation = startNativeMutation(probe, source, operation, fixtureIndex);
            trial.wait = await waitForNativeWriter(db, holderPid, /^\d+\|advisory\n$/);
            trial.reader = observedSql(
              db,
              `\\set VERBOSITY verbose
            BEGIN;
            SET LOCAL lock_timeout = '500ms';
            SET LOCAL statement_timeout = '3s';
            SET SESSION AUTHORIZATION supabase_auth_admin;
            SELECT 'reader', pg_backend_pid();
            ${lockRows}
            ROLLBACK;`,
            );
            assert.equal(trial.reader.exit, 3, trial.reader.stdout);
            assert.match(trial.reader.stderr, /55P03:.*lock timeout/);
            assert.ok(trial.reader.stderr.includes('relation "' + relation + '"'));
            const readerPid = trial.reader.stdout.match(/^reader\|(\d+)$/m)?.[1];
            assert.ok(readerPid);
            assert.notEqual(readerPid, trial.wait.stdout.split('|')[0]);
            assert.deepEqual(observedSql(db, readState), trial.before);
          },
        );
      }
    } finally {
      if (mutation) trial.http = await mutation;
    }
    assert.equal(trial.http.exit, 0, trial.http.stderr);
    assert.deepEqual(JSON.parse(trial.http.stdout), expectedHttp);
    trial.after = observedSql(db, readState);
    assert.equal(trial.after.exit, 0, trial.after.stderr);
    assert.equal(trial.after.stdout, expected);
    trial.freshReader = observedSql(db, lockRows);
    assert.equal(trial.freshReader.exit, 0, trial.freshReader.stderr);
    assert.ok(trial.freshReader.stdout.includes(`user|${subject}\n`));
    assert.equal(
      trial.freshReader.stdout.includes(`session|${session}\n`),
      operation !== 'recovery',
    );
  }
}

async function nativeDeadlineTrials(db, { subject, session }) {
  const results = (receipt.nativeDeadlines = {});
  const setExpiry = observedSql(
    db,
    `UPDATE auth.sessions
    SET not_after = clock_timestamp() + interval '7 seconds'
    WHERE id = '${session}' AND user_id = '${subject}'
    RETURNING not_after::text;`,
  );
  assert.equal(setExpiry.exit, 0, setExpiry.stderr);
  const expiry = setExpiry.stdout.trim().split('\n')[0];
  assert.match(expiry, /^[\d +:.-]+$/);
  results.deadline = expiry;
  results.boundary = observedSql(
    db,
    `
    SELECT clock.as_of < candidate.not_after
    FROM auth.sessions candidate
    CROSS JOIN LATERAL (VALUES
      (1, candidate.not_after - interval '1 microsecond'),
      (2, candidate.not_after),
      (3, candidate.not_after + interval '1 microsecond')
    ) clock(ordinal, as_of)
    WHERE candidate.id = '${session}' AND candidate.user_id = '${subject}'
    ORDER BY clock.ordinal;`,
  );
  assert.equal(results.boundary.exit, 0, results.boundary.stderr);
  assert.equal(results.boundary.stdout, 't\nf\nf\n');

  let pendingReader;
  try {
    await withNativeFixtureLock(
      db,
      `SELECT id FROM auth.sessions WHERE id = '${session}' FOR UPDATE;`,
      results,
      async (holderPid) => {
        const args = observeSqlCommand(db);
        const reader = spawn(hostExecutable('docker', settings.options.env), args, {
          ...settings.options,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        reader.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
        reader.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
        pendingReader = once(reader, 'close').then(([exit]) => {
          receipt.commands.push({ args, exit });
          return { exit, stdout, stderr };
        });
        reader.stdin.on('error', () => reader.kill());
        reader.stdin.end(`BEGIN;
          SET LOCAL statement_timeout = '12s';
          SET SESSION AUTHORIZATION supabase_auth_admin;
          SELECT 'reader', pg_backend_pid();
          SELECT id FROM auth.users WHERE id = '${subject}' FOR SHARE;
          WITH retained AS MATERIALIZED (
            SELECT not_after FROM auth.sessions
            WHERE id = '${session}' AND user_id = '${subject}' FOR SHARE
          )
          SELECT 'deadline', statement_timestamp() < not_after, clock_timestamp() < not_after
          FROM retained;
          ROLLBACK;`);
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline) {
          const wait = observedSql(
            db,
            `SELECT pid, wait_event_type FROM pg_stat_activity
              WHERE ${holderPid} = ANY(pg_blocking_pids(pid));`,
          );
          assert.equal(wait.exit, 0, wait.stderr);
          if (wait.stdout) {
            results.readerWait = wait;
            break;
          }
          await delay(80);
        }
        assert.match(results.readerWait?.stdout ?? '', /^\d+\|Lock\n$/);
        results.advance = observedSql(
          db,
          `SET statement_timeout = '10s'; SELECT pg_sleep_until('${expiry}'::timestamptz);`,
        );
        assert.equal(results.advance.exit, 0, results.advance.stderr);
      },
    );
  } finally {
    if (pendingReader) results.reader = await pendingReader;
  }
  assert.equal(results.reader.exit, 0, results.reader.stderr);
  assert.equal(
    results.readerWait.stdout.split('|')[0],
    results.reader.stdout.match(/^reader\|(\d+)$/m)?.[1],
  );
  assert.match(results.reader.stdout, /^deadline\|t\|f$/m);
}

function applySealedF011(db) {
  assert.ok(db.network === 'none' || db.network === networkId);
  checkContainer(db);
  const predecessor = 'fbd2b5312a5038aad21db0001a17dac22bdcbf7e';
  const files = git(root, ['ls-tree', '--name-only', predecessor, 'supabase/migrations/'])
    .toString()
    .trim()
    .split(/\r?\n/);
  assert.equal(files.length, 38);
  receipt.predecessor = { commit: predecessor, migrations: [] };
  for (const path of files) {
    assert.match(path, /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/);
    const bytes = git(root, ['show', predecessor + ':' + path]);
    const result = observedSql(db, bytes);
    receipt.predecessor.migrations.push({
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      exit: result.exit,
      stderr: result.stderr,
    });
    assert.equal(result.exit, 0, path);
  }
}

async function nativeRetainedGuardTrials(db, probe, source, fixtures) {
  applySealedF011(db);
  const result = (receipt.nativeRetainedGuard = { migrations: [], cases: {} });
  for (const path of [
    'supabase/migrations/20261112001200_f012_source_admission.sql',
    'supabase/migrations/20261112001201_f012_native_guard.sql',
  ]) {
    const bytes = readFileSync(safeSource(root, path));
    const migration = observedSql(db, bytes);
    result.migrations.push({
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...migration,
    });
    assert.equal(migration.exit, 0, migration.stderr);
  }
  const [fixture, other] = fixtures;
  const deployment = randomUUID();
  const epoch = randomUUID();
  const seeded = observedSql(
    db,
    `INSERT INTO platform.f012_source_admission VALUES ('${deployment}', '${epoch}');
      SET SESSION AUTHORIZATION shifaa_api;
      SELECT person_id FROM platform.register_identity_onboarding(
        '${fixture.subject}', 'native-guard-${fixture.subject}', 'en-EG'
      );
      SELECT person_id FROM platform.register_identity_onboarding(
        '${other.subject}', 'native-guard-${other.subject}', 'en-EG'
      );
      RESET SESSION AUTHORIZATION;
      SELECT instance_id FROM auth.users WHERE id = '${fixture.subject}';`,
  );
  result.seed = seeded;
  assert.equal(seeded.exit, 0, seeded.stderr);
  const [person, otherPerson, instance] = seeded.stdout
    .trim()
    .split('\n')
    .filter((line) => /^[\da-f-]{36}$/.test(line));
  assert.ok(person && otherPerson && instance, 'Expected exact native instance and both mappings');

  const admission = `SELECT platform.f012_lock_admission_v1('${deployment}', '${epoch}', false);`;
  const facility = randomUUID();
  const context = (actorPerson, role = 'PAT', aal = 1) => `
    SET LOCAL shifaa.person_id = '${actorPerson}';
    SET LOCAL shifaa.principal = '${fixture.subject}';
    SET LOCAL shifaa.session_id = '${fixture.session}';
    SET LOCAL shifaa.aal = '${aal}';
    SET LOCAL shifaa.actor_role = '${role}';
    SET LOCAL shifaa.action = 'getPrescription';
    SET LOCAL shifaa.facility_id = '${role === 'PAT' ? '' : facility}';
    SET LOCAL shifaa.purposes = 'synthetic.feature012';`;
  const guard = ({
    actorPerson = person,
    nativeInstance = instance,
    nativeSession = fixture.session,
    expiresAt = 'floor(extract(epoch from clock_timestamp()))::bigint + 60',
    aal = 1,
    totpAt = 'NULL',
    profile = 'subject_projection_read',
  } = {}) => `SELECT platform.f012_retain_native_authority_v1(
      '${deployment}', '${epoch}', '${nativeInstance}', '${fixture.subject}',
      '${nativeSession}', '${actorPerson}', ${aal}, ${expiresAt}, ${totpAt},
      '${profile}', 'getPrescription',
      ${profile === 'workforce_sensitive' ? "'" + facility + "'" : 'NULL'}, 'synthetic.feature012', NULL
    );`;
  function execute(name, statement, expected = null, role = 'shifaa_api') {
    const observed = observedSql(
      db,
      `\\set VERBOSITY verbose
        BEGIN; SET SESSION AUTHORIZATION ${role};
        SET LOCAL lock_timeout = '500ms'; SET LOCAL statement_timeout = '3s';
        SELECT 'contender', pg_backend_pid();
        ${statement}
        COMMIT;`,
    );
    result.cases[name] = observed;
    if (expected) {
      assert.equal(observed.exit, 3, observed.stdout);
      assert.match(observed.stderr, expected);
    } else {
      assert.equal(observed.exit, 0, observed.stderr);
      assert.match(observed.stdout, /^COMMIT$/m);
    }
    return observed;
  }
  const denied = /42501:/;
  execute('current subject at AAL1', admission + context(person) + guard());
  execute('missing retained admission', context(person) + guard(), denied);
  execute('missing trusted context', admission + guard(), denied);
  execute(
    'signed subject and mapped person mismatch',
    admission + context(otherPerson) + guard({ actorPerson: otherPerson }),
    denied,
  );
  execute(
    'session context mismatch',
    admission + context(person) + guard({ nativeSession: other.session }),
    denied,
  );
  execute(
    'cross-subject session row',
    admission +
      context(person).replace(fixture.session, other.session) +
      guard({ nativeSession: other.session }),
    denied,
  );
  execute(
    'instance mismatch',
    admission + context(person) + guard({ nativeInstance: randomUUID() }),
    denied,
  );
  execute(
    'workforce cannot fall back to subject',
    admission + context(person, 'CLN') + guard(),
    denied,
  );
  execute(
    'access expiry equality',
    admission +
      context(person) +
      guard({ expiresAt: 'floor(extract(epoch from clock_timestamp()))::bigint' }),
    denied,
  );
  for (const role of ['anon', 'authenticated', 'shifaa_worker']) {
    execute(
      `${role} cannot execute with matching settings`,
      context(person) + guard(),
      denied,
      role,
    );
  }
  execute('Core API cannot assume executor role', 'SET ROLE shifaa_f012_native_executor;', denied);
  execute('Core API cannot read Auth users', 'SELECT id FROM auth.users;', denied);
  execute('Core API cannot read Auth sessions', 'SELECT id FROM auth.sessions;', denied);
  const patientRead = admission + context(person) + guard();
  const timeout = /55P03:.*lock timeout/;
  result.locks = {};
  for (const [relation, write] of [
    [
      'users',
      `UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 minute' WHERE id = '${fixture.subject}';`,
    ],
    [
      'sessions',
      `UPDATE auth.sessions SET not_after = clock_timestamp() WHERE id = '${fixture.session}';`,
    ],
  ]) {
    const evidence = (result.locks[relation] = { guardFirst: {}, writerFirst: {} });
    const proveConflict = (name, statement, role, pid) => {
      const contender = execute(name, statement, timeout, role);
      assert.match(contender.stderr, new RegExp('relation "' + relation + '"'));
      assert.notEqual(contender.stdout.match(/^contender\|(\d+)$/m)?.[1], pid);
    };
    await withNativeFixtureLock(
      db,
      patientRead,
      evidence.guardFirst,
      (pid) =>
        proveConflict(`guard-first ${relation} writer waits`, write, 'supabase_auth_admin', pid),
      'shifaa_api',
    );
    await withNativeFixtureLock(db, write, evidence.writerFirst, (pid) =>
      proveConflict(`writer-first ${relation} guard waits`, patientRead, 'shifaa_api', pid),
    );
    execute(`fresh retry after ${relation} rollback`, patientRead);
  }

  result.mfa = JSON.parse(
    exec(probe, ['node', '-', 'prepare-native-mutation', 'downgrade'], { input: source }),
  );
  assert.equal(result.mfa[0].verifiedAal, 'aal2');
  const workforce = (totpAt) =>
    admission +
    context(person, 'CLN', 2) +
    guard({ aal: 2, profile: 'workforce_sensitive', totpAt });
  const seconds = 'floor(extract(epoch from statement_timestamp()))::bigint';
  execute('native AAL2 with recent TOTP', workforce(seconds + ' - 120'));
  execute('workforce without qualifying TOTP', workforce('NULL'), denied);
  execute('workforce with stale TOTP', workforce(seconds + ' - 301'), denied);
  execute('workforce with future TOTP', workforce(seconds + ' + 5'), denied);
  execute('AAL1 claim no longer matches current native session', patientRead, denied);
  result.downgrade = await startNativeMutation(probe, source, 'downgrade', 0);
  assert.equal(result.downgrade.exit, 0, result.downgrade.stderr);
  assert.equal(JSON.parse(result.downgrade.stdout).status, 200);
  execute(
    'stale workforce claim after committed native downgrade',
    workforce(seconds + ' - 120'),
    denied,
  );
  execute('current subject after committed native downgrade', patientRead);
}

function runAtomicity(db) {
  applySealedF011(db);
  const fixture = readFileSync(safeSource(root, 'infra/db/tests/feature-012-atomicity.sql'));
  const observed = observedSql(db, fixture);
  receipt.atomicity = {
    fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
    ...observed,
  };
  assert.equal(observed.exit, 0, 'T016 SQL fixture');
}

async function sourceFenceLockConflict(db) {
  const deployment = '01000000-0000-4000-8000-000000000001';
  const epoch = '02000000-0000-4000-8000-000000000001';
  sql(db, `INSERT INTO platform.f012_source_admission VALUES ('${deployment}', '${epoch}');`);
  receipt.lockTrials = [];
  for (const write of [false, true]) {
    const args = observeSqlCommand(db);
    const holder = spawn(hostExecutable('docker', settings.options.env), args, {
      ...settings.options,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = once(holder, 'close');
    let stdout = '';
    let stderr = '';
    holder.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    const hold = (exclusive) =>
      `SELECT platform.f012_lock_admission_v1('${deployment}', '${epoch}', ${exclusive});`;
    try {
      const ready = new Promise((resolve) => {
        holder.stdout.setEncoding('utf8').on('data', (chunk) => {
          stdout += chunk;
          if (stdout.includes('FENCE_LOCK_READY')) resolve();
        });
      });
      holder.stdin.write(`
        BEGIN;
        SET LOCAL idle_in_transaction_session_timeout = '10s';
        SET SESSION AUTHORIZATION shifaa_api;
        SELECT 'holder_pid', pg_backend_pid();
        ${hold(write)}
        \\echo FENCE_LOCK_READY
      `);
      const result = await Promise.race([ready, closed]);
      assert.equal(result, undefined, 'Source fence holder exited before taking the lock');
      const borrow = observedSql(
        db,
        `\\set VERBOSITY verbose
          BEGIN;
          SET SESSION AUTHORIZATION shifaa_api;
          SELECT 'borrower_pid', pg_backend_pid();
          SELECT clinical.f012_read_generation_v1('${deployment}', '${epoch}',
            'f011_content_status', 'deployment', '1', false);
          ROLLBACK;`,
      );
      const shared = write
        ? null
        : observedSql(
            db,
            `BEGIN; SET LOCAL lock_timeout = '250ms';
          SET SESSION AUTHORIZATION shifaa_api;
          SELECT 'reader_pid', pg_backend_pid(); ${hold(false)} COMMIT;`,
          );
      const contender = observedSql(
        db,
        `\\set VERBOSITY verbose
          BEGIN;
          SET LOCAL lock_timeout = '250ms';
          SET SESSION AUTHORIZATION shifaa_api;
          SELECT 'contender_pid', pg_backend_pid();
          ${hold(!write)}
          COMMIT;`,
      );
      receipt.lockTrials.push({ write, holder: stdout, borrow, shared, contender });
      assert.notEqual(
        stdout.match(/holder_pid\|(\d+)/)?.[1],
        borrow.stdout.match(/borrower_pid\|(\d+)/)?.[1],
      );
      assert.equal(borrow.exit, 3);
      assert.match(borrow.stderr, /42501: F012 source admission was not retained/);
      if (shared) {
        assert.equal(shared.exit, 0, shared.stderr);
        assert.match(shared.stdout, /reader_pid\|\d+/);
      }
      assert.notEqual(
        stdout.match(/holder_pid\|(\d+)/)?.[1],
        contender.stdout.match(/contender_pid\|(\d+)/)?.[1],
      );
      assert.equal(contender.exit, 3);
      assert.match(contender.stderr, /55P03:.*lock timeout/);
    } finally {
      holder.stdin.end('ROLLBACK;\n');
      const [exit] = await closed;
      receipt.commands.push({ args, exit });
      assert.equal(exit, 0, stderr);
    }
    const released = observedSql(
      db,
      `BEGIN; SET SESSION AUTHORIZATION shifaa_api; ${hold(!write)} COMMIT;`,
    );
    receipt.lockTrials.at(-1).released = released;
    assert.equal(released.exit, 0);
  }
}

function sourceFenceRawBypass(db) {
  // Golden negative. The mutator must fail before the generation UPDATE when
  // an API connection skips rank zero. A rollback keeps the probe disposable.
  const result = observedSql(
    db,
    `\\set VERBOSITY verbose
      BEGIN;
      INSERT INTO clinical.safety_source_generations VALUES (
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
        'f011_content_status', 'deployment', '1', 1
      );
      SET SESSION AUTHORIZATION shifaa_api;
      SELECT 'unretained-generation', clinical.f012_advance_generation_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
        'f011_content_status', 'deployment', '1', 1
      );
      ROLLBACK;`,
  );
  receipt.rawBypass = result;
  assert.equal(result.exit, 3, 'Direct generation call skipped rank zero');
  assert.match(result.stderr, /42501:/);
  const upgrade = observedSql(
    db,
    `\\set VERBOSITY verbose
      BEGIN;
      SET SESSION AUTHORIZATION shifaa_api;
      SELECT platform.f012_lock_admission_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', false
      );
      DISCARD TEMP;
      SELECT 'unlawful-upgrade', platform.f012_lock_admission_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', true
      );
      ROLLBACK;`,
  );
  receipt.rawUpgrade = upgrade;
  assert.equal(upgrade.exit, 3, 'Discarding temp state allowed a lock upgrade');
  assert.match(upgrade.stderr, /42501: F012 source admission denied/);
  assert.doesNotMatch(upgrade.stdout, /unlawful-upgrade/);
  const sharedAdvance = observedSql(
    db,
    `\\set VERBOSITY verbose
      BEGIN;
      SET SESSION AUTHORIZATION shifaa_api;
      SELECT platform.f012_lock_admission_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', false
      );
      SELECT 'shared-advance', clinical.f012_advance_generation_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
        'f011_content_status', 'deployment', '1', 1
      );
      ROLLBACK;`,
  );
  receipt.rawSharedAdvance = sharedAdvance;
  assert.equal(sharedAdvance.exit, 3);
  assert.match(sharedAdvance.stderr, /42501: F012 source admission was not retained/);
  assert.doesNotMatch(sharedAdvance.stdout, /shared-advance/);
  const snapshot = observedSql(
    db,
    `\\set VERBOSITY verbose
    BEGIN ISOLATION LEVEL REPEATABLE READ;
    SET SESSION AUTHORIZATION shifaa_api;
    SELECT platform.f012_lock_admission_v1(
      '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', false
    );
    ROLLBACK;`,
  );
  receipt.repeatableReadDenied = snapshot;
  assert.equal(snapshot.exit, 3);
  assert.match(snapshot.stderr, /42501: F012 source admission denied/);
  const duplicate = observedSql(
    db,
    `\\set VERBOSITY verbose
      BEGIN;
      INSERT INTO clinical.safety_source_generations VALUES (
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
        'f011_content_status', 'deployment', '1', 1
      );
      SET SESSION AUTHORIZATION shifaa_api;
      SELECT platform.f012_lock_admission_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', true
      );
      SAVEPOINT first_mutation;
      SELECT 'first-advance', clinical.f012_advance_generation_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
        'f011_content_status', 'deployment', '1', 1
      );
      RELEASE SAVEPOINT first_mutation;
      SELECT 'second-advance', clinical.f012_advance_generation_v1(
        '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
        'f011_content_status', 'deployment', '1', 2
      );
      ROLLBACK;`,
  );
  receipt.rawDuplicateAdvance = duplicate;
  assert.equal(duplicate.exit, 3, 'Same transaction advanced the same generation twice');
  assert.match(duplicate.stdout, /first-advance\|2/);
  assert.match(duplicate.stderr, /40001:.*already advanced in this transaction/);
  assert.doesNotMatch(duplicate.stdout, /second-advance/);
}

function sourceFenceDurability(db) {
  const deployment = '01000000-0000-4000-8000-000000000001';
  const epoch = '02000000-0000-4000-8000-000000000001';
  const scope = `'${deployment}', '${epoch}', 'f011_content_status', 'deployment', '1'`;
  const other = `'${deployment}', '${epoch}', 'f012_projection_policy', 'deployment', '1'`;
  const lock = `SELECT platform.f012_lock_admission_v1('${deployment}', '${epoch}', true);`;
  const advance = (revision) =>
    `SELECT 'advance', clinical.f012_advance_generation_v1(${scope}, ${revision});`;
  sql(
    db,
    `CREATE TABLE platform.f012_probe_head (revision integer NOT NULL);
    INSERT INTO platform.f012_probe_head VALUES (1);
    GRANT SELECT, UPDATE ON platform.f012_probe_head TO shifaa_api;
    INSERT INTO clinical.safety_source_generations
      (deployment_id, admission_epoch, producer_key, scope_key, contract_version, generation)
      VALUES (${scope}, 1), (${other}, 1);`,
  );
  const write = (revision, finish, before = '', after = '') =>
    observedSql(
      db,
      `\\set VERBOSITY verbose
    BEGIN;
    SET SESSION AUTHORIZATION shifaa_api;
    SELECT 'pid', pg_backend_pid();
    ${lock}
    ${before}
    UPDATE platform.f012_probe_head SET revision = revision + 1;
    ${advance(revision)}
    ${after}
    ${finish};`,
    );
  const state = () =>
    observedSql(
      db,
      `SELECT 'state', revision, generation,
    last_advance_xid IS NOT NULL FROM platform.f012_probe_head
    CROSS JOIN clinical.safety_source_generations
    WHERE producer_key = 'f011_content_status';`,
    );
  const rolledBack = write(1, 'ROLLBACK');
  const afterRollback = state();
  const retry = write(
    1,
    'COMMIT',
    `SAVEPOINT abandoned;
    UPDATE platform.f012_probe_head SET revision = revision + 1;
    ${advance(1)}
    ROLLBACK TO SAVEPOINT abandoned;
    RELEASE SAVEPOINT abandoned;`,
  );
  const afterFirst = state();
  const distinct = write(
    2,
    'COMMIT',
    '',
    `SELECT 'other-scope-advance',
    clinical.f012_advance_generation_v1(${other}, 1);`,
  );
  const afterDistinct = state();
  const stale = write(2, 'COMMIT');
  const afterStale = state();
  const nestedUpgrade = observedSql(
    db,
    `\\set VERBOSITY verbose
    BEGIN;
    SET SESSION AUTHORIZATION shifaa_api;
    SAVEPOINT choose_read;
    SELECT platform.f012_lock_admission_v1('${deployment}', '${epoch}', false);
    RELEASE SAVEPOINT choose_read;
    SELECT 'forbidden-after-release', platform.f012_lock_admission_v1('${deployment}', '${epoch}', true);
    ROLLBACK;`,
  );
  receipt.durability = {
    rolledBack,
    afterRollback,
    retry,
    afterFirst,
    distinct,
    afterDistinct,
    stale,
    afterStale,
    nestedUpgrade,
  };
  assert.equal(rolledBack.exit, 0, rolledBack.stderr);
  assert.match(rolledBack.stdout, /advance\|2/);
  assert.deepEqual(afterRollback, { exit: 0, stdout: 'state|1|1|f\n', stderr: '' });
  assert.equal(retry.exit, 0, retry.stderr);
  assert.equal((retry.stdout.match(/advance\|2/g) ?? []).length, 2);
  assert.deepEqual(afterFirst, { exit: 0, stdout: 'state|2|2|t\n', stderr: '' });
  assert.equal(distinct.exit, 0, distinct.stderr);
  assert.match(distinct.stdout, /advance\|3/);
  assert.match(distinct.stdout, /other-scope-advance\|2/);
  assert.notEqual(retry.stdout.match(/pid\|(\d+)/)?.[1], distinct.stdout.match(/pid\|(\d+)/)?.[1]);
  assert.deepEqual(afterDistinct, { exit: 0, stdout: 'state|3|3|t\n', stderr: '' });
  assert.equal(stale.exit, 3, 'A stale generation committed its preceding source write');
  assert.match(stale.stderr, /40001: F012 generation is missing, stale or already advanced/);
  assert.deepEqual(afterStale, afterDistinct, 'Stale CAS left a partial source mutation');
  assert.equal(nestedUpgrade.exit, 3, 'Releasing a savepoint allowed rank-zero upgrade');
  assert.match(
    nestedUpgrade.stderr,
    /42501: F012 source admission denied: top-level acquisition required/,
  );
  assert.doesNotMatch(nestedUpgrade.stdout, /forbidden-after-release/);
}

function sourceFenceMigrationRecovery(db, migration) {
  const stateSql = `SELECT 'migration-state',
    to_regclass('platform.f012_source_admission') IS NOT NULL,
    to_regclass('clinical.safety_source_generations') IS NOT NULL,
    EXISTS (SELECT FROM pg_roles WHERE rolname = 'shifaa_f012_fence_executor'),
    EXISTS (SELECT FROM pg_extension WHERE extname = 'pgrowlocks');`;
  const beforeFailure = observedSql(db, stateSql);
  assert.equal(beforeFailure.exit, 0, beforeFailure.stderr);
  assert.equal(beforeFailure.stdout, 'migration-state|f|f|f|f\n');
  const source = migration.toString('utf8');
  assert.match(source, /COMMIT;\s*$/);
  const failed = observedSql(
    db,
    '\\set VERBOSITY verbose\n' + source.replace(/COMMIT;\s*$/, 'SELECT 1 / 0;\nCOMMIT;\n'),
  );
  const afterFailure = observedSql(db, stateSql);
  receipt.migrationRecovery = { beforeFailure, failed, afterFailure };
  assert.equal(failed.exit, 3, 'Injected migration failure was not observed');
  assert.match(failed.stderr, /22012: division by zero/);
  assert.deepEqual(afterFailure, beforeFailure, 'Failed migration left partial F012 objects');
}

function sourceFencePrivilegeNegatives(db) {
  const deployment = "'01000000-0000-4000-8000-000000000001'";
  const epoch = "'02000000-0000-4000-8000-000000000001'";
  const deniedStatements = [
    'SELECT * FROM platform.f012_source_admission',
    'SELECT * FROM clinical.safety_source_generations',
    `INSERT INTO platform.f012_source_admission VALUES (${deployment}, ${epoch})`,
    `INSERT INTO clinical.safety_source_generations VALUES (${deployment}, ${epoch},
      'f012_reviewer_roster', 'deployment', '1', 1)`,
    'UPDATE platform.f012_source_admission SET admission_epoch = admission_epoch',
    'UPDATE clinical.safety_source_generations SET generation = generation + 1',
    'DELETE FROM platform.f012_source_admission',
    'DELETE FROM clinical.safety_source_generations',
    'SET ROLE shifaa_f012_fence_executor',
    "SELECT * FROM platform.pgrowlocks('platform.f012_source_admission')",
  ];
  receipt.privilegeNegatives = [];
  for (const role of ['shifaa_api', 'anon', 'authenticated', 'service_role']) {
    const statements = [...deniedStatements];
    if (role !== 'shifaa_api') {
      statements.push(
        `SELECT platform.f012_lock_admission_v1(${deployment}, ${epoch}, false)`,
        `SELECT clinical.f012_read_generation_v1(${deployment}, ${epoch},
          'f011_content_status', 'deployment', '1', false)`,
        `SELECT clinical.f012_advance_generation_v1(${deployment}, ${epoch},
          'f011_content_status', 'deployment', '1', 3)`,
      );
    }
    const quoted = statements.map((statement) => "'" + statement.replaceAll("'", "''") + "'");
    const result = observedSql(
      db,
      `BEGIN;
      SET SESSION AUTHORIZATION ${role};
      DO $$
      DECLARE command text; denied integer := 0;
      BEGIN
        FOREACH command IN ARRAY ARRAY[${quoted.join(',')}]
        LOOP
          BEGIN
            EXECUTE command;
            RAISE EXCEPTION 'Unexpected success for role %: %', session_user, command;
          EXCEPTION WHEN insufficient_privilege THEN
            denied := denied + 1;
            RAISE NOTICE 'T009 denied role=%, command=%, sqlstate=%', session_user, command, SQLSTATE;
          END;
        END LOOP;
        RAISE NOTICE 'T009 role=% denials=%', session_user, denied;
      END
      $$;
      ROLLBACK;`,
    );
    receipt.privilegeNegatives.push({ role, expectedDenials: statements.length, ...result });
    assert.equal(result.exit, 0, result.stderr);
    assert.match(result.stderr, new RegExp(`T009 role=${role} denials=${statements.length}`));
  }
}

function sourceFenceScopeNegatives(db) {
  const deployment = "'01000000-0000-4000-8000-000000000001'";
  const epoch = "'02000000-0000-4000-8000-000000000001'";
  const scope = `${deployment}, ${epoch}, 'f011_content_status', 'deployment', '1'`;
  const invalidReads = [
    `${deployment}, ${epoch}, NULL, 'deployment', '1', false`,
    `${deployment}, ${epoch}, 'unknown', 'deployment', '1', false`,
    `${deployment}, ${epoch}, 'f011_content_status', NULL, '1', false`,
    `${deployment}, ${epoch}, 'f011_content_status', 'deployment', '2', false`,
    `${scope}, NULL`,
  ];
  receipt.scopeNegatives = [];
  for (const args of invalidReads) {
    const result = observedSql(
      db,
      `\\set VERBOSITY verbose
      BEGIN;
      SET SESSION AUTHORIZATION shifaa_api;
      SELECT platform.f012_lock_admission_v1(${deployment}, ${epoch}, true);
      SELECT clinical.f012_read_generation_v1(${args});
      COMMIT;`,
    );
    receipt.scopeNegatives.push({ args, ...result });
    assert.equal(result.exit, 3, 'Invalid generation scope was accepted');
    assert.match(result.stderr, /42501: F012 generation scope denied/);
  }
  const nullExpected = observedSql(
    db,
    `\\set VERBOSITY verbose
    BEGIN;
    SET SESSION AUTHORIZATION shifaa_api;
    SELECT platform.f012_lock_admission_v1(${deployment}, ${epoch}, true);
    SELECT clinical.f012_advance_generation_v1(${scope}, NULL);
    COMMIT;`,
  );
  receipt.scopeNegatives.push({ args: 'null expected generation', ...nullExpected });
  assert.equal(nullExpected.exit, 3);
  assert.match(nullExpected.stderr, /40001: F012 generation is missing, stale or already advanced/);
}

function sourceFenceRlsNegatives(db) {
  const result = observedSql(
    db,
    `BEGIN;
    CREATE ROLE f012_rls_probe NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
    GRANT USAGE ON SCHEMA platform, clinical TO f012_rls_probe;
    GRANT SELECT, INSERT, UPDATE ON platform.f012_source_admission,
      clinical.safety_source_generations TO f012_rls_probe;
    SELECT 'forced-rls', count(*) FROM pg_class
      WHERE oid IN ('platform.f012_source_admission'::regclass,
        'clinical.safety_source_generations'::regclass)
      AND relrowsecurity AND relforcerowsecurity;
    SET SESSION AUTHORIZATION f012_rls_probe;
    SELECT set_config('request.jwt.claims', '{"role":"shifaa_f012_fence_executor"}', true);
    SELECT 'rls-visible-admission', count(*) FROM platform.f012_source_admission;
    SELECT 'rls-visible-generations', count(*) FROM clinical.safety_source_generations;
    WITH changed AS (
      UPDATE clinical.safety_source_generations SET generation = generation + 1 RETURNING 1
    ) SELECT 'rls-updated-generations', count(*) FROM changed;
    DO $$
    BEGIN
      BEGIN
        INSERT INTO platform.f012_source_admission VALUES (
          '01000000-0000-4000-8000-000000000002', '02000000-0000-4000-8000-000000000002'
        );
        RAISE EXCEPTION 'Default-deny RLS admitted a forged deployment';
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'T009 RLS admission insert denied: %', SQLSTATE;
      END;
    END
    $$;
    ROLLBACK;`,
  );
  receipt.rlsNegatives = result;
  assert.equal(result.exit, 0, result.stderr);
  for (const expected of [
    'forced-rls|2',
    'rls-visible-admission|0',
    'rls-visible-generations|0',
    'rls-updated-generations|0',
  ])
    assert.ok(result.stdout.includes(expected), 'Missing RLS observation: ' + expected);
  assert.match(result.stderr, /T009 RLS admission insert denied: 42501/);
}

function sourceFence(db, red, upgrade) {
  assert.equal(db.network, 'none');
  if (upgrade) applySealedF011(db);
  else
    sql(
      db,
      `CREATE SCHEMA platform;
        CREATE SCHEMA clinical;
        CREATE ROLE shifaa_api LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT;
        GRANT USAGE ON SCHEMA platform, clinical TO shifaa_api;`,
    );
  if (!red) {
    const migration = readFileSync(
      safeSource(root, 'supabase/migrations/20261112001200_f012_source_admission.sql'),
    );
    receipt.migrationSha256 = createHash('sha256').update(migration).digest('hex');
    sourceFenceMigrationRecovery(db, migration);
    receipt.migration = observedSql(db, migration);
    assert.equal(receipt.migration.exit, 0, 'F012 source fence migration');
  }
  const fixture = readFileSync(safeSource(root, 'infra/db/tests/feature-012-source-fence.sql'));
  receipt.fixtureSha256 = createHash('sha256').update(fixture).digest('hex');
  const result = observedSql(db, fixture);
  receipt.sourceFence = result;
  assert.match(result.stdout, /T008 raw member evidence/);
  assert.match(result.stdout, /T008 raw clock evidence/);
  if (red) {
    assert.equal(result.exit, 3, 'Expected test-first SQL failure');
    assert.match(result.stderr, /42P01:.*platform\.f012_source_admission/);
  } else {
    assert.equal(result.exit, 0, 'Source fence assertions');
    assert.match(result.stdout, /ROLLBACK/);
  }
}

async function admit() {
  const argumentsList = process.argv.slice(2);
  const nativeBaseline =
    argumentsList.length === 1 && argumentsList[0] === '--native-authority-baseline';
  const nativeRefresh = argumentsList.length === 1 && argumentsList[0] === '--native-refresh';
  const nativeDeadlines = argumentsList.length === 1 && argumentsList[0] === '--native-deadlines';
  const nativeLogoutFirst =
    argumentsList.length === 1 && argumentsList[0] === '--native-logout-first';
  const nativeRetainedGuard =
    argumentsList.length === 1 && argumentsList[0] === '--native-retained-guard';
  const nativeMutation =
    argumentsList.length === 1 &&
    new Map([
      ['--native-ban', 'ban'],
      ['--native-downgrade', 'downgrade'],
      ['--native-recovery', 'recovery'],
    ]).get(argumentsList[0]);
  const atomicity = argumentsList.length === 1 && argumentsList[0] === '--atomicity';
  const redOnly = argumentsList.length === 1 && argumentsList[0] === '--source-fence-red';
  const upgrade = argumentsList.length === 1 && argumentsList[0] === '--source-fence-upgrade';
  const sqlOnly =
    atomicity ||
    redOnly ||
    upgrade ||
    (argumentsList.length === 1 && argumentsList[0] === '--source-fence');
  assert.deepEqual(
    sqlOnly ||
      nativeBaseline ||
      nativeRefresh ||
      nativeDeadlines ||
      nativeLogoutFirst ||
      nativeRetainedGuard ||
      nativeMutation
      ? []
      : argumentsList,
    [],
    'This command accepts no external resource arguments',
  );
  assert.equal(process.version, 'v' + readFileSync(resolve(root, '.node-version'), 'utf8').trim());
  settings = localDocker();
  const inputs = dependencyInputs(root).hash;
  receipt.base = git(root, ['rev-parse', 'HEAD']).toString().trim();
  receipt.context = settings.prefix[1];
  receipt.engineId = docker(['info', '--format', '{{.ID}}']).trim();
  receipt.images = {
    postgres: pinnedImage(dbImage),
    ...(sqlOnly ? {} : { auth: pinnedImage(authImage) }),
    ...(sqlOnly ? {} : { probe: pinnedImage('shifaa/verify:' + inputs, inputs) }),
  };
  receipt.dependencyInputs = inputs;
  receipt.noneNetworkId = inspect('network', 'none').Id;
  assert.match(receipt.noneNetworkId, fullId);
  before = inventory();
  stage = 'network and resource creation';
  networkId = docker([
    'network',
    'create',
    '--internal',
    '--driver',
    'bridge',
    '--label',
    label + '=' + run,
    networkName,
  ]).trim();
  assert.match(networkId, fullId);
  assert.ok(before.containers.every((c) => !c.networks.includes(networkId)));
  receipt.networkId = networkId;
  checkNetwork();
  if (sqlOnly) {
    stage = atomicity ? 'isolated structural atomicity SQL' : 'isolated PostgreSQL source fence';
    try {
      const source = startDatabase(atomicity ? 'atomicity' : 'source-fence', 'none');
      receipt.databaseSystems = atomicity
        ? { atomicity: source.system }
        : { source: source.system };
      if (before.containers.length) {
        trial(
          'actual retained container denied',
          () => checkContainer({ ...source, id: before.containers[0].id }),
          /Retained container denied/,
        );
      }
      if (atomicity) {
        runAtomicity(source);
      } else {
        sourceFence(source, redOnly, upgrade);
        if (!redOnly) {
          await sourceFenceLockConflict(source);
          sourceFenceRawBypass(source);
          sourceFenceDurability(source);
          sourceFencePrivilegeNegatives(source);
          sourceFenceScopeNegatives(source);
          sourceFenceRlsNegatives(source);
        }
      }
    } finally {
      teardown();
      assert.deepEqual(inventory(), before);
      receipt.preservation = {
        containers: before.containers.length,
        volumes: before.volumes.length,
        matches: true,
      };
    }
    receipt.status = atomicity
      ? 'EXECUTED_ATOMICITY_SQL'
      : redOnly
        ? 'EXPECTED_RED_SOURCE_FENCE'
        : 'PASS_SOURCE_FENCE_SQL';
    return;
  }
  try {
    await runNativeAdmission({
      nativeBaseline,
      nativeRefresh,
      nativeDeadlines,
      nativeLogoutFirst,
      nativeRetainedGuard,
      nativeMutation,
    });
  } finally {
    teardown();
    assert.deepEqual(inventory(), before);
    receipt.preservation = {
      containers: before.containers.length,
      volumes: before.volumes.length,
      matches: true,
    };
  }
  receipt.status = nativeBaseline ? 'PASS_NATIVE_LOCK_PRIMITIVES' : 'PASS_HARNESS_PROBE';
  if (nativeRefresh) receipt.status = 'PASS_NATIVE_REFRESH_ORDERING';
  if (nativeDeadlines) receipt.status = 'PASS_NATIVE_DEADLINE_PRIMITIVES';
  if (nativeLogoutFirst) receipt.status = 'PASS_NATIVE_LOGOUT_FIRST';
  if (nativeRetainedGuard) receipt.status = 'PASS_NATIVE_GUARD_CONTEXT';
  if (nativeMutation) receipt.status = 'PASS_NATIVE_MUTATION_ORDERING';
}

async function runNativeAdmission({
  nativeBaseline,
  nativeRefresh,
  nativeDeadlines,
  nativeLogoutFirst,
  nativeRetainedGuard,
  nativeMutation,
}) {
  const db = startDatabase('db', networkId);
  receipt.databaseSystems = { source: db.system };
  const restore =
    nativeBaseline ||
    nativeRefresh ||
    nativeDeadlines ||
    nativeLogoutFirst ||
    nativeRetainedGuard ||
    nativeMutation
      ? null
      : startDatabase('restore', 'none');
  if (restore) {
    receipt.databaseSystems.restore = restore.system;
    trial('mismatched container binding denied', () => checkContainer({ ...db, id: restore.id }), {
      name: 'AssertionError',
    });
    trial('unknown resource ID denied', () => checkContainer({ ...db, id: db.name }), {
      name: 'AssertionError',
    });
  }
  if (before.containers.length) {
    trial(
      'actual retained container denied',
      () => checkContainer({ ...db, id: before.containers[0].id }),
      /Retained container denied/,
    );
  }
  stage = 'bootstrap and native API admission';
  sql(db, "alter role supabase_auth_admin password '" + authPassword + "';\n" + probeSchema());
  const readSessionPolicy =
    nativeRefresh || nativeDeadlines || nativeLogoutFirst || nativeRetainedGuard || nativeMutation;
  const auth = startAuth(readSessionPolicy);
  if (readSessionPolicy) observeNativePolicy(auth);
  const probe = create('probe', receipt.images.probe, {
    env: {
      F012_PROBE_PASSWORD: apiPassword,
      ...(nativeMutation === 'ban' || nativeMutation === 'recovery'
        ? { F012_NATIVE_ADMIN_TOKEN: disposableNativeAdminToken() }
        : {}),
    },
    tmpfs: { '/tmp': 'rw,nosuid,nodev,size=48m' },
    flags: ['--read-only', '--cap-drop=ALL', '--user=1000:1000', '--entrypoint=node'],
    command: ['-e', 'setTimeout(() => {}, 180000)'],
  });
  const source = readFileSync(safeSource(root, 'tools/feature-012-harness-probe.cjs'));
  receipt.probeSha256 = createHash('sha256').update(source).digest('hex');
  const fixtures = JSON.parse(exec(probe, ['node', '-', 'fixtures'], { input: source }));
  bindFixtures(db, fixtures);
  receipt.syntheticSessions = fixtures;
  if (nativeRetainedGuard) {
    stage = 'T011 installed NAC-1 context and privileges';
    await nativeRetainedGuardTrials(db, probe, source, fixtures);
    return;
  }
  if (nativeMutation) {
    stage = 'T010 pinned native ' + nativeMutation + ' ordering';
    await nativeMutationTrials(db, probe, source, fixtures, nativeMutation);
    return;
  }
  if (nativeRefresh) {
    stage = 'T010 pinned native refresh ordering';
    await nativeRefreshTrials(db, probe, source, fixtures);
    return;
  }
  if (nativeDeadlines) {
    stage = 'T010 session expiry boundary and post-wait clock';
    await nativeDeadlineTrials(db, fixtures[0]);
    return;
  }
  if (nativeLogoutFirst) {
    stage = 'T010 pinned native logout-first ordering';
    await nativeLogoutFirstTrial(db, probe, source, fixtures[0]);
    return;
  }
  receipt.probe = JSON.parse(exec(probe, ['node', '-', 'probe'], { input: source }));
  if (nativeBaseline) {
    stage = 'T010 native row lock primitives';
    await nativeAuthorityBaseline(db, probe, source, fixtures);
  } else {
    stage = 'separate restore';
    verifyRestore(db, restore);
  }
}

function bindFixtures(db, fixtures) {
  assert.equal(fixtures.length, 2);
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  for (const field of ['subject', 'person', 'session']) {
    assert.ok(fixtures.every((entry) => uuid.test(entry[field])));
    assert.notEqual(fixtures[0][field], fixtures[1][field]);
  }
  for (const { subject, person, session } of fixtures) {
    const match = sql(
      db,
      "select count(*) from auth.sessions where id='" +
        session +
        "' and user_id='" +
        subject +
        "';\n",
    ).trim();
    assert.equal(match, '1', 'Native session fixture does not match PostgreSQL');
    sql(
      db,
      "insert into f012_admission.person(subject,person) values ('" +
        subject +
        "','" +
        person +
        "');\n",
    );
  }
}

try {
  await admit();
} catch (error) {
  receipt.status = 'BLOCKED';
  receipt.stage = stage;
  receipt.reason = error.message.split('\n')[0].slice(0, 180);
  process.exitCode = 2;
}
console.log(JSON.stringify(receipt, null, 2));
