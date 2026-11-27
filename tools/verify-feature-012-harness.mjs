import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  dependencyInputs,
  excluded,
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
const coreApiPassword = password();
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

function startAuth(readSessionPolicy, signingKey) {
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
      ...(signingKey ? { GOTRUE_JWT_KEYS: JSON.stringify([signingKey]) } : {}),
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

async function withNativeFixtureLock(db, statement, trial, exercise) {
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
      SET SESSION AUTHORIZATION supabase_auth_admin;
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

function applySealedF011(db, coreApiPeers) {
  if (coreApiPeers) {
    const [auth, probe] = coreApiPeers;
    assert.deepEqual([db.role, auth.role, probe.role], ['db', 'auth', 'probe']);
    assert.deepEqual(
      receipt.containers.map(({ id }) => id),
      [db.id, auth.id, probe.id],
    );
    for (const resource of [db, auth, probe]) {
      assert.equal(resource.network, networkId);
      assert.equal(checkContainer(resource).State.Running, true);
    }
  } else {
    assert.equal(db.network, 'none');
  }
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

const writerFixtureDeployment = '01000000-0000-4000-8000-000000000001';
const writerFixtureEpoch = '02000000-0000-4000-8000-000000000001';

function seedWriterAdmission(db) {
  sql(
    db,
    `INSERT INTO platform.f012_source_admission
    VALUES ('${writerFixtureDeployment}', '${writerFixtureEpoch}');`,
  );
}

async function sourceFenceLockConflict(db) {
  const deployment = writerFixtureDeployment;
  const epoch = writerFixtureEpoch;
  seedWriterAdmission(db);
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

function captureWriterCatalog(db) {
  const catalog = readFileSync(
    safeSource(root, 'infra/db/tests/feature-012-participating-writers.sql'),
  );
  const result = {
    sha256: createHash('sha256').update(catalog).digest('hex'),
    ...observedSql(db, catalog),
  };
  (receipt.participatingWriters ??= {}).catalog = result;
  assert.equal(result.exit, 0, result.stderr);
  const rows = result.stdout.split(/\r?\n/);
  for (const name of [
    'identity.people',
    'identity.patients',
    'identity.care_relationships',
    'clinical.content_artifact_admissibility_bindings',
    'consent.purpose_versions',
  ]) {
    const prefix = `relation|${name}|`;
    const relation = rows.find((line) => line.startsWith(prefix));
    assert.ok(relation, `Missing RLS catalog observation for ${name}`);
    const policy = JSON.parse(relation.slice(prefix.length));
    assert.equal(policy.rls, true, name);
    assert.equal(policy.forceRls, true, name);
  }
}

function applyWriterBaseline(db, coreApiPeers) {
  applySealedF011(db, coreApiPeers);
  const migration = readFileSync(
    safeSource(root, 'supabase/migrations/20261112001200_f012_source_admission.sql'),
  );
  receipt.migrationSha256 = createHash('sha256').update(migration).digest('hex');
  receipt.migration = observedSql(db, migration);
  assert.equal(receipt.migration.exit, 0, 'F012 source fence migration');
}

function runWriterCatalog(db, coreApiPeers) {
  applyWriterBaseline(db, coreApiPeers);
  captureWriterCatalog(db);
}

function runPredecessorSqlFixtures(db, paths) {
  applyWriterBaseline(db);
  receipt.predecessorWriterBehaviors = paths.map((path) => {
    const fixture = readFileSync(safeSource(root, path));
    assert.deepEqual(fixture, git(root, ['show', receipt.base + ':' + path]), path);
    return {
      path,
      sha256: createHash('sha256').update(fixture).digest('hex'),
      ...observedSql(db, fixture),
    };
  });
  const failed = receipt.predecessorWriterBehaviors.filter(
    (result) => result.exit !== 0 || !/^ROLLBACK$/m.test(result.stdout),
  );
  assert.equal(failed.length, 0, failed.map(({ path }) => path).join(', '));
}

function runPredecessorAllergyWriters(db) {
  applyWriterBaseline(db);
  const results = (receipt.predecessorAllergy = {});
  const patientPerson = randomUUID();
  const patient = randomUUID();
  const clinician = randomUUID();
  const unrelated = randomUUID();
  results.people = observedSql(
    db,
    `BEGIN;
     INSERT INTO identity.people(id,user_id,display_name,profile_status)
     SELECT person,gen_random_uuid(),'Synthetic T012 actor','active'
     FROM unnest(ARRAY['${patientPerson}','${clinician}','${unrelated}']::uuid[]) person;
     INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
     VALUES ('${patient}','${patientPerson}','T012-allergy-writers','active');
     COMMIT;`,
  );
  assert.equal(results.people.exit, 0, results.people.stderr);
  const fixture = seedEncounterWriter(db, { patientPerson, clinician, unrelated }, results);
  const { facility, encounter } = fixture;
  const facilityEvidence = randomUUID();
  const observeWriter = (writer) =>
    observedSql(
      db,
      `\\set VERBOSITY verbose
       BEGIN;
       SET SESSION AUTHORIZATION shifaa_api;
       SELECT 'writer', session_user, current_user;
       SET LOCAL shifaa.person_id = '${clinician}';
       SET LOCAL shifaa.actor_role = 'CLN';
       SET LOCAL shifaa.test_now = '2030-04-05T08:00:00Z';
       SET LOCAL shifaa.facility_id = '${facility}';
       SET LOCAL shifaa.encounter_id = '${encounter}';
       ${writer.write}
       COMMIT;`,
    );
  results.licence = observedSql(
    db,
    `BEGIN;${syntheticFacilityLicence(facilityEvidence, facility, clinician)} COMMIT;`,
  );
  assert.equal(results.licence.exit, 0, results.licence.stderr);
  const first = allergyInsertWriter(patient);
  const correction = allergyInsertWriter(patient, first.allergy);
  results.create = observeWriter(first);
  assert.equal(results.create.exit, 0, results.create.stderr);
  results.prematureCorrection = observeWriter(correction);
  assert.equal(results.prematureCorrection.exit, 3);
  assert.match(
    results.prematureCorrection.stderr,
    /23514: allergy correction target is not current terminal error/,
  );
  results.afterDenial = observedSql(db, first.state);
  assert.equal(results.afterDenial.exit, 0, results.afterDenial.stderr);
  assert.equal(results.afterDenial.stdout, first.after);

  const terminal = allergyVerificationWriter(db, {
    ...fixture,
    patient,
    first,
    results,
    targetStatus: 'entered_in_error',
    facilityEvidence,
  });
  results.enteredInError = observeWriter(terminal);
  assert.equal(results.enteredInError.exit, 0, results.enteredInError.stderr);
  results.correction = observeWriter(correction);
  assert.equal(results.correction.exit, 0, results.correction.stderr);
  results.effects = observedSql(
    db,
    `SELECT
       original_head.current_version,
       original_revision.verification_status,
       replacement_head.current_version,
       replacement_revision.verification_status,
       replacement_head.corrects_allergy_id = original_head.id,
       replacement_revision.corrects_allergy_id = original_head.id,
       replacement_revision.action_actor_person_id = '${clinician}',
       replacement_revision.facility_id = '${facility}',
       replacement_revision.encounter_id = '${encounter}',
       (SELECT count(*) FROM clinical.allergies WHERE patient_id = '${patient}'),
       (SELECT count(*) FROM audit.events WHERE resource_id IN (original_head.id,replacement_head.id)),
       (SELECT count(*) FROM platform.outbox_events
         WHERE aggregate_type='clinical.allergy_revision' AND aggregate_id IN (original_head.id,replacement_head.id)),
       (SELECT count(*) FROM clinical.mutation_receipts receipt
         JOIN platform.idempotency_records idem ON idem.id=receipt.idempotency_record_id AND idem.state='completed'
         WHERE receipt.resource_id IN (original_head.id,replacement_head.id))
     FROM clinical.allergy_heads original_head
     JOIN clinical.allergies original_revision ON original_revision.id=original_head.current_revision_id
     CROSS JOIN clinical.allergy_heads replacement_head
     JOIN clinical.allergies replacement_revision ON replacement_revision.id=replacement_head.current_revision_id
     WHERE original_head.id='${first.allergy}' AND replacement_head.id='${correction.allergy}';`,
  );
  assert.equal(results.effects.exit, 0, results.effects.stderr);
  assert.equal(
    results.effects.stdout.trim(),
    '2|entered_in_error|1|self_reported|t|t|t|t|t|3|3|3|3',
  );
}

async function runOnboardingWriterOrder(db, focusedWriters) {
  const deployment = writerFixtureDeployment;
  const epoch = writerFixtureEpoch;
  const firstSubject = '74120000-0000-4000-8000-000000000001';
  const secondSubject = '74120000-0000-4000-8000-000000000002';
  const deniedSubject = '74120000-0000-4000-8000-000000000003';
  const admission = `SELECT platform.f012_lock_admission_v1('${deployment}', '${epoch}', true);`;
  const onboard = (subject) =>
    `SELECT 'onboarded', count(*) FROM platform.register_identity_onboarding(
      '${subject}', '${subject}@t012.invalid', 'en-EG');`;
  const identity = (subject) =>
    observedSql(
      db,
      `SELECT count(p.id), count(patient.id), count(rel.id)
       FROM identity.people p
       LEFT JOIN identity.patients patient ON patient.person_id = p.id
       LEFT JOIN identity.care_relationships rel ON rel.actor_person_id = p.id
         AND rel.subject_patient_id = patient.id AND rel.relationship_type = 'self'
       WHERE p.user_id = '${subject}';`,
    );
  const contend = (statement, role = 'shifaa_api') =>
    observedSql(
      db,
      `\\set VERBOSITY verbose
       BEGIN;
       SET LOCAL lock_timeout = '250ms';
       SET LOCAL statement_timeout = '3s';
       SET SESSION AUTHORIZATION ${role};
       SELECT 'contender', pg_backend_pid(), session_user;
       ${statement}
       COMMIT;`,
    );

  const writerMigration = 'supabase/migrations/20261112001202_f012_writer_participation.sql';
  const results = (receipt.participatingWriters = {});
  if (existsSync(resolve(root, writerMigration))) {
    const migration = readFileSync(safeSource(root, writerMigration));
    results.migration = {
      sha256: createHash('sha256').update(migration).digest('hex'),
      ...observedSql(db, migration),
    };
    assert.equal(results.migration.exit, 0, writerMigration);
  }

  captureWriterCatalog(db);

  function expectIdentity(observation, counts) {
    assert.equal(observation.exit, 0, observation.stderr);
    assert.equal(observation.stdout.trim(), counts);
  }
  function backendPid(output, label, role = 'shifaa_api') {
    const pid = output.match(new RegExp('^' + label + '\\|(\\d+)\\|' + role + '$', 'm'))?.[1];
    assert.ok(pid, 'Missing session evidence for ' + role);
    return pid;
  }
  function expectTimeout(observation) {
    assert.equal(observation.exit, 3, observation.stdout);
    assert.match(observation.stderr, /55P03:.*lock timeout/);
    assert.match(observation.stderr, /relation "f012_source_admission"/);
  }
  async function hold(statement, observe, role = 'shifaa_api') {
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
          if (/^T012_HOLDER_READY$/m.test(stdout)) resolve(true);
        });
        holder.stdin.on('error', reject);
        timer = setTimeout(() => reject(new Error('T012 holder did not become ready')), 10_000);
      });
      holder.stdin.write(`
        BEGIN;
        SET LOCAL idle_in_transaction_session_timeout = '15s';
        SET LOCAL statement_timeout = '3s';
        SET SESSION AUTHORIZATION ${role};
        SELECT 'holder', pg_backend_pid(), session_user;
        ${statement}
        \\echo T012_HOLDER_READY
      `);
      assert.equal(await Promise.race([ready, closed]), true, stderr);
      return observe(stdout);
    } finally {
      clearTimeout(timer);
      holder.stdin.end('ROLLBACK;\n');
      const [exit] = await closed;
      receipt.commands.push({ args, exit });
      assert.equal(exit, 0, stderr);
    }
  }

  if (focusedWriters) {
    seedWriterAdmission(db);
    results[focusedWriters] = [];
    await runContextWriterOrder(db, results[focusedWriters], focusedWriters, {
      admission,
      onboard,
      contend,
      hold,
      backendPid,
      expectTimeout,
    });
    assert.deepEqual(
      results[focusedWriters].flatMap(({ failedOrderings }) => failedOrderings),
      [],
      'T012 tested writers must serialize with rank-zero admission',
    );
    return;
  }

  results.initial = [firstSubject, secondSubject, deniedSubject].map(identity);
  for (const observation of results.initial) expectIdentity(observation, '0|0|0');
  results.nonCoreApi = contend(onboard(deniedSubject), 'authenticated');
  assert.equal(results.nonCoreApi.exit, 3);
  assert.match(results.nonCoreApi.stderr, /42501: permission denied for (schema|function)/);
  results.deniedIdentity = identity(deniedSubject);
  expectIdentity(results.deniedIdentity, '0|0|0');

  results.admissionFirst = await hold(admission, (holder) => ({
    holder,
    control: contend(admission),
    writer: contend(onboard(firstSubject)),
    visible: identity(firstSubject),
  }));
  results.writerFirst = await hold(onboard(secondSubject), (holder) => ({
    holder,
    contender: contend(admission),
    visible: identity(secondSubject),
  }));
  results.afterRollback = identity(secondSubject);
  results.released = contend(admission);

  const { admissionFirst, writerFirst } = results;
  expectTimeout(admissionFirst.control);
  for (const [trial, contender] of [
    [admissionFirst, admissionFirst.writer],
    [writerFirst, writerFirst.contender],
  ]) {
    assert.notEqual(backendPid(trial.holder, 'holder'), backendPid(contender.stdout, 'contender'));
  }
  assert.match(writerFirst.holder, /^onboarded\|1$/m);
  expectIdentity(writerFirst.visible, '0|0|0');
  expectIdentity(results.afterRollback, '0|0|0');
  assert.equal(results.released.exit, 0, results.released.stderr);

  // Capture both independent orderings before failing the verification.
  const failures = [];
  for (const [name, check] of [
    [
      'admission first',
      () => {
        expectTimeout(admissionFirst.writer);
        expectIdentity(admissionFirst.visible, '0|0|0');
      },
    ],
    ['writer first', () => expectTimeout(writerFirst.contender)],
  ]) {
    try {
      check();
    } catch {
      failures.push(name);
    }
  }
  results.failedOrderings = failures;
  results.recoveryWorker = await runRecoveryWorkerOrder(db, {
    admission,
    onboard,
    contend,
    hold,
    backendPid,
  });
  assert.deepEqual(
    [...failures, ...results.recoveryWorker.failedOrderings],
    [],
    'T012 onboarding and recovery worker must serialize with rank-zero admission in both orders',
  );
  results.successAfterRelease = contend(onboard(firstSubject));
  assert.equal(results.successAfterRelease.exit, 0, results.successAfterRelease.stderr);
  assert.match(results.successAfterRelease.stdout, /^onboarded\|1$/m);
  results.committed = identity(firstSubject);
  expectIdentity(results.committed, '1|1|1');
}

async function runContextWriterOrder(
  db,
  results,
  focusedWriters,
  { admission, onboard, contend, hold, backendPid, expectTimeout },
) {
  const prefix = '74120000-0000-4000-8000-0000000000';
  const ownerSubject = prefix + '11';
  const delegateSubject = prefix + '12';
  const unrelatedSubject = prefix + '13';
  for (const subject of [ownerSubject, delegateSubject, unrelatedSubject]) {
    const result = contend(onboard(subject));
    assert.equal(result.exit, 0, result.stderr);
    assert.match(result.stdout, /^onboarded\|1$/m);
  }
  const identities = observedSql(
    db,
    `SELECT person.id, patient.id
    FROM identity.people person JOIN identity.patients patient ON patient.person_id = person.id
    WHERE person.user_id IN ('${ownerSubject}', '${delegateSubject}', '${unrelatedSubject}')
    ORDER BY person.user_id;`,
  );
  assert.equal(identities.exit, 0, identities.stderr);
  const rows = identities.stdout.trim().split('\n');
  assert.equal(rows.length, 3);
  for (const row of rows) assert.match(row, /^[\da-f-]{36}\|[\da-f-]{36}$/);
  const [[patientPerson, patient], [delegate], [unrelated]] = rows.map((row) => row.split('|'));
  if (focusedWriters === 'allergy') {
    // Onboarding creates a pending profile. F011 self-reporting needs an active person.
    const activated = observedSql(
      db,
      `UPDATE identity.people SET profile_status = 'active'
       WHERE id = '${patientPerson}' AND profile_status = 'pending';`,
    );
    receipt.participatingWriters.allergyFixtureActivation = activated;
    assert.equal(activated.exit, 0, activated.stderr);
    assert.match(activated.stdout, /^UPDATE 1$/m);
  }
  const context = (person) => `SET LOCAL shifaa.person_id = '${person}';
    SET LOCAL shifaa.actor_role = 'PAT'; SET LOCAL shifaa.aal = '1';
    SET LOCAL shifaa.purposes = 'family_support';`;
  let cases;
  if (focusedWriters === 'allergy') {
    cases = [allergyInsertWriter(patient)];
  } else if (focusedWriters === 'familyGrant') {
    cases = [familyGrantWriter(db, contend, context, { patientPerson, patient, delegate })];
  } else if (focusedWriters === 'workforceTermination') {
    cases = [workforceTerminationWriter(db, { owner: patientPerson, clinician: delegate })];
  } else if (focusedWriters === 'appointmentCancellation') {
    const fixture = seedEncounterWriter(db, { patientPerson, clinician: delegate, unrelated });
    cases = [appointmentCancellationWriter(db, fixture)];
  } else if (focusedWriters === 'queueCall' || focusedWriters === 'encounterCreate') {
    const fixture = seedEncounterWriter(db, { patientPerson, clinician: delegate, unrelated });
    const call = queueCallWriter(db, fixture);
    if (focusedWriters === 'encounterCreate') {
      const called = contend(context(delegate) + call.write);
      receipt.participatingWriters.encounterCreateCalledQueue = called;
      assert.equal(called.exit, 0, called.stderr);
      assert.match(called.stdout, call.written);
      cases = [encounterCreateWriter(fixture, call)];
    } else {
      cases = [call];
    }
  } else if (focusedWriters === 'recoveryRestriction') {
    cases = [recoveryRestrictionWriter(db, patientPerson)];
  } else if (focusedWriters === 'allergyVerification') {
    const fixture = seedEncounterWriter(db, { patientPerson, clinician: delegate, unrelated });
    const first = allergyInsertWriter(patient);
    const seeded = contend(context(patientPerson) + first.write);
    results.allergyVerificationSeed = seeded;
    assert.equal(seeded.exit, 0, seeded.stderr);
    assert.match(seeded.stdout, first.written);
    cases = [allergyVerificationWriter(db, { ...fixture, patient, first })];
  } else if (
    focusedWriters === 'encounterParticipant' ||
    focusedWriters === 'encounterCompletion'
  ) {
    const fixture = seedEncounterWriter(db, { patientPerson, clinician: delegate, unrelated });
    cases = [
      focusedWriters === 'encounterCompletion'
        ? encounterCompletionWriter(db, fixture)
        : encounterParticipantWriter(fixture),
    ];
  } else {
    cases = familyAndConsentWriters(contend, context, { patientPerson, patient, delegate, prefix });
  }
  const admissionControl = await hold(admission, (holder) => ({
    holder,
    contender: contend(admission),
  }));
  expectTimeout(admissionControl.contender);
  assert.notEqual(
    backendPid(admissionControl.holder, 'holder'),
    backendPid(admissionControl.contender.stdout, 'contender'),
  );
  receipt.participatingWriters.focusedAdmissionControl = admissionControl;
  for (const test of cases) {
    const state = () => observedSql(db, test.state);
    const write = context(test.actor ?? patientPerson) + test.write;
    const initial = state();
    assert.equal(initial.exit, 0, initial.stderr);
    assert.equal(initial.stdout, test.before);
    const unrelatedWriter = contend(context(unrelated) + test.write);
    assert.equal(unrelatedWriter.exit, test.deniedExit, unrelatedWriter.stderr);
    assert.match(unrelatedWriter.stdout + unrelatedWriter.stderr, test.denied);
    assert.deepEqual(state(), initial);

    const writerFirst = await hold(write, (holder) => ({
      holder,
      contender: contend(admission),
      visible: state(),
    }));
    assert.match(writerFirst.holder, test.written);
    assert.deepEqual(writerFirst.visible, initial);
    assert.deepEqual(state(), initial);
    const admissionFirst = await hold(admission, (holder) => ({
      holder,
      contender: contend(write),
      visible: state(),
    }));

    const failedOrderings = [];
    for (const [order, trial] of Object.entries({ writerFirst, admissionFirst })) {
      assert.notEqual(
        backendPid(trial.holder, 'holder'),
        backendPid(trial.contender.stdout, 'contender'),
      );
      if (trial.contender.exit === 3) {
        expectTimeout(trial.contender);
      } else {
        assert.equal(trial.contender.exit, 0, trial.contender.stderr);
        failedOrderings.push(order);
      }
    }
    const wasBlocked = admissionFirst.contender.exit === 3;
    if (!wasBlocked) assert.match(admissionFirst.contender.stdout, test.written);
    assert.equal(admissionFirst.visible.exit, 0, admissionFirst.visible.stderr);
    assert.equal(admissionFirst.visible.stdout, wasBlocked ? test.before : test.after);
    const retry = wasBlocked ? contend(write) : null;
    if (retry) {
      assert.equal(retry.exit, 0, retry.stderr);
      assert.match(retry.stdout, test.written);
    }
    const committed = state();
    assert.equal(committed.exit, 0, committed.stderr);
    assert.equal(committed.stdout, test.after);
    results.push({
      name: test.name,
      unrelatedWriter,
      initial,
      writerFirst,
      admissionFirst,
      retry,
      committed,
      failedOrderings,
    });
  }
}

function familyGrantWriter(db, contend, context, { patientPerson, patient, delegate }) {
  const relationship = randomUUID();
  const effect = 'relationship.delegation.accepted';
  const seed = contend(`${context(patientPerson)}
    INSERT INTO identity.care_relationships
      (id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,
       valid_from,valid_until,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at)
    VALUES ('${relationship}','${patient}','${delegate}','delegation','pending','family_support',
            now(),now()+interval '1 year','${patientPerson}',decode(repeat('aa',32),'hex'),
            1,now()+interval '1 day');
    INSERT INTO identity.care_relationship_permissions
      (relationship_id,permission_code,created_by_person_id)
    VALUES ('${relationship}','record.view','${patientPerson}');`);
  receipt.participatingWriters.familyGrantInvitation = seed;
  assert.equal(seed.exit, 0, seed.stderr);
  const audit = observedSql(
    db,
    `SELECT event_id FROM audit.append_event_v1(
      '${randomUUID()}', '${randomUUID()}', '${effect}', 'family-care', 'success',
      p_actor_person_id => '${delegate}', p_resource_id => '${randomUUID()}');`,
  );
  assert.equal(audit.exit, 0, audit.stderr);
  return {
    name: 'F004 invitee activates a pending delegation',
    actor: delegate,
    write: `DO $accept$
    DECLARE accepted_version integer;
    BEGIN
      UPDATE identity.care_relationships
        SET status = 'active', invite_token_digest = NULL, invite_expires_at = NULL, invite_consumed_at = now()
        WHERE id = '${relationship}' AND version = 1
        RETURNING version INTO accepted_version;
      IF NOT FOUND THEN RAISE EXCEPTION 'invitation unavailable' USING ERRCODE = '42501'; END IF;
      PERFORM platform.append_family_mutation_audit_v1(
        '${randomUUID()}', '${effect}', '${delegate}', '${patient}', '${relationship}', accepted_version);
      INSERT INTO platform.outbox_events(aggregate_type,aggregate_id,event_type,payload)
        VALUES ('family-care','${relationship}','${effect}',
          jsonb_build_object('version', accepted_version, 'status', 'active', 'permissions', jsonb_build_array('record.view')));
      RAISE NOTICE 'delegation accepted %', accepted_version;
    END
    $accept$;`,
    written: /^DO$/m,
    deniedExit: 3,
    denied: /42501:.*invitation unavailable/,
    state: `SET shifaa.purposes = 'family_support';
      SELECT r.status, r.version, r.invite_consumed_at IS NOT NULL,
        platform.person_has_family_relationship('${patient}', '${delegate}', 'record.view'),
        (SELECT count(*) FROM audit.events WHERE resource_id = r.id AND action_code = '${effect}'),
        (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = r.id AND event_type = '${effect}')
      FROM identity.care_relationships r WHERE r.id = '${relationship}';`,
    before: 'SET\npending|1|f|f|0|0\n',
    after: 'SET\nactive|2|t|t|1|1\n',
  };
}

function familyAndConsentWriters(contend, context, { patientPerson, patient, delegate, prefix }) {
  const relationship = prefix + '14';
  const granted = prefix + '15';
  const withdrawn = prefix + '16';
  const seed = contend(`${context(patientPerson)}
    INSERT INTO identity.care_relationships
      (id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,
       valid_from,valid_until,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at)
    VALUES ('${relationship}','${patient}','${delegate}','delegation','pending','family_support',
            now(),now()+interval '1 year','${patientPerson}',decode(repeat('aa',32),'hex'),
            1,now()+interval '1 day');
    INSERT INTO identity.care_relationship_permissions
      (relationship_id,permission_code,created_by_person_id)
    VALUES ('${relationship}','record.view','${patientPerson}');
    ${context(delegate)}
    UPDATE identity.care_relationships
      SET status = 'active', invite_token_digest = NULL, invite_expires_at = NULL, invite_consumed_at = now()
      WHERE id = '${relationship}' AND version = 1;`);
  assert.equal(seed.exit, 0, seed.stderr);
  assert.match(seed.stdout, /^UPDATE 1$/m);

  const seedConsent = contend(`${context(patientPerson)}
    INSERT INTO consent.records
      (id,person_id,purpose_code,purpose_version,decision,capture_channel,notice_version,occurred_at)
    VALUES ('${granted}','${patientPerson}','care_updates','1.0.0','granted','patient_app','1.0.0',now());`);
  assert.equal(seedConsent.exit, 0, seedConsent.stderr);
  return [
    {
      name: 'family delegation revocation',
      write: `UPDATE identity.care_relationships SET status = 'revoked',
        revoked_by_person_id = '${patientPerson}', revoked_at = now()
        WHERE id = '${relationship}' AND version = 2;`,
      written: /^UPDATE 1$/m,
      deniedExit: 0,
      denied: /^UPDATE 0$/m,
      state: `SELECT status, version FROM identity.care_relationships WHERE id = '${relationship}';`,
      before: 'active|2\n',
      after: 'revoked|3\n',
    },
    {
      name: 'consent withdrawal append',
      write: `INSERT INTO consent.records
        (id,person_id,purpose_code,purpose_version,decision,capture_channel,notice_version,
         occurred_at,supersedes_id,version)
        VALUES ('${withdrawn}','${patientPerson}','care_updates','1.0.0','withdrawn','patient_app',
                '1.0.0',now(),'${granted}',2);`,
      written: /^INSERT 0 1$/m,
      deniedExit: 3,
      denied: /42501:.*row-level security/,
      state: `SELECT decision, version FROM consent.records
        WHERE id IN ('${granted}', '${withdrawn}') ORDER BY version;`,
      before: 'granted|1\n',
      after: 'granted|1\nwithdrawn|2\n',
    },
  ];
}

// Structural envelopes use the same synthetic shape as the F011 component fixture.
function syntheticF011Envelope(contractId, suffix) {
  return {
    contractId,
    keyRef: 'synthetic-kms/' + suffix + '/versions/1',
    nonce: randomBytes(12).toString('hex'),
    ciphertext: 'aabb',
    authTag: '0102030405060708090a0b0c0d0e0f10',
  };
}

function allergyInsertWriter(patient, correctsAllergyId = null) {
  const allergy = randomUUID();
  const revision = randomUUID();
  const request = randomUUID();
  const key = randomUUID();
  const payload = {
    responseLanguage: 'en-EG',
    responseRequestId: request,
    preparation: {
      allergyId: allergy,
      revisionId: revision,
      revisionVersion: 1,
      previousRevisionId: null,
      protectedFacts: syntheticF011Envelope('SHIFAA-F011-ALLERGY-PROTECTED/1', 'facts'),
      protectedReason: null,
      correctsAllergyId,
    },
  };
  const finalizer = syntheticF011Envelope('SHIFAA-F011-RECEIPT-PROTECTED/1', 'receipt');
  return {
    name: 'F011 allergy empty-to-first insertion',
    allergy,
    revision,
    write: `SET LOCAL shifaa.environment = 'local';
      SET LOCAL shifaa.action = 'createAllergy';
      SET LOCAL shifaa.aal = '2';
      SET LOCAL shifaa.purposes = 'synthetic.feature011';
      SET LOCAL shifaa.request_id = '${request}';
      SET LOCAL shifaa.idempotency_key = '${key}';
      SET LOCAL shifaa.request_hash = '${'a'.repeat(64)}';
      DO $fixture$
        DECLARE result jsonb;
        BEGIN
          result := clinical.create_allergy_api_v1('${patient}', '${JSON.stringify(payload)}'::jsonb);
          PERFORM clinical.f011_finalize_receipt_v1(
            (result->>'receiptId')::uuid, '${JSON.stringify(finalizer)}'::jsonb
          );
          IF result->>'resourceVersion' IS DISTINCT FROM '1' THEN
            RAISE EXCEPTION 'expected first allergy revision';
          END IF;
        END
      $fixture$;`,
    written: /^DO$/m,
    deniedExit: 3,
    denied: /42501:.*(allergy authority|patient)/i,
    state: `SELECT
      (SELECT count(*) FROM clinical.allergy_heads WHERE patient_id = '${patient}'),
      (SELECT count(*) FROM clinical.allergies WHERE patient_id = '${patient}'),
      (SELECT count(*) FROM platform.outbox_events
        WHERE aggregate_id = '${allergy}' AND aggregate_type = 'clinical.allergy_revision');`,
    before: '0|0|0\n',
    after: '1|1|1\n',
  };
}

function syntheticFacilityLicence(evidence, facility, clinician) {
  return `INSERT INTO identity.private_evidence_objects
      (id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status,released_at)
    VALUES ('${evidence}','facility-license-evidence','synthetic/${evidence}',
      '${clinician}','${facility}',repeat('1',64),'application/pdf',10,'released',now());
    INSERT INTO identity.facility_licenses
      (facility_id,license_type,number_ciphertext,number_hash,issuer,expires_on,licensed_activities,status,evidence_object_id)
    VALUES ('${facility}','clinic',decode('01','hex'),decode('01','hex'),'Synthetic issuer',
      '2035-12-31',ARRAY['consultation'],'verified','${evidence}');`;
}

function allergyVerificationWriter(
  db,
  {
    patient,
    clinician,
    facility,
    encounter,
    first,
    results = receipt.participatingWriters,
    targetStatus = 'clinician_confirmed',
    facilityEvidence,
  },
) {
  const allergyId = first.allergy;
  const previousRevisionId = first.revision;
  const revisionId = randomUUID();
  const evidenceRef = randomUUID();
  const responseRequestId = randomUUID();
  const source = 'synthetic.internal_clinician_provenance';
  const producer = 'f011.allergy_evidence_boundary';
  const verifiedAt = '2030-04-05T07:15:00Z';
  const seed = observedSql(
    db,
    `BEGIN;
    ${facilityEvidence ? '' : syntheticFacilityLicence(randomUUID(), facility, clinician)}
    INSERT INTO clinical.allergy_verification_support
    (id,patient_id,allergy_id,previous_revision_id,previous_version,target_status,
      attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic)
    VALUES ('${evidenceRef}','${patient}','${allergyId}','${previousRevisionId}',1,
      '${targetStatus}','${clinician}','${source}','${evidenceRef}','${producer}',
      '${verifiedAt}',true);
    COMMIT;`,
  );
  results.allergyVerificationSupport = seed;
  assert.equal(seed.exit, 0, seed.stderr);
  const payload = {
    responseLanguage: 'en-EG',
    responseRequestId,
    preparation: {
      protectedRevision: {
        allergyId,
        revisionId,
        revisionVersion: 2,
        previousRevisionId,
        protectedFacts: syntheticF011Envelope(
          'SHIFAA-F011-ALLERGY-PROTECTED/1',
          'verification-facts',
        ),
        protectedReason: syntheticF011Envelope(
          'SHIFAA-F011-ALLERGY-PROTECTED/1',
          'verification-reason',
        ),
      },
      verifiedEvidence: {
        contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
        profile: 'allergy_verification',
        bindingId: randomUUID(),
        producerId: producer,
        verifiedAt,
        evidenceRef,
        patientId: patient,
        allergyId,
        previousRevisionId,
        previousVersion: 1,
        revisionId,
        revisionVersion: 2,
        targetStatus,
        attestorPersonId: clinician,
        sourceIdentity: source,
        sourceEvidenceIdentity: evidenceRef,
        synthetic: true,
      },
    },
  };
  const finalizer = syntheticF011Envelope('SHIFAA-F011-RECEIPT-PROTECTED/1', 'verify-receipt');
  return {
    name: 'F011 clinician allergy verification and head replacement',
    actor: clinician,
    write: `${encounterWriterContext('verifyAllergy')}
      SET LOCAL shifaa.request_id = '${responseRequestId}';
      SET LOCAL shifaa.purposes = 'synthetic.feature011';
      SET LOCAL shifaa.facility_id = '${facility}';
      SET LOCAL shifaa.encounter_id = '${encounter}';
      DO $fixture$
        DECLARE result jsonb;
        BEGIN
          result := clinical.verify_allergy_api_v1('${allergyId}',1,'${JSON.stringify(payload)}'::jsonb);
          PERFORM clinical.f011_finalize_receipt_v1(
            (result->>'receiptId')::uuid, '${JSON.stringify(finalizer)}'::jsonb
          );
          IF result->>'resourceVersion' IS DISTINCT FROM '2' THEN
            RAISE EXCEPTION 'expected second allergy revision';
          END IF;
        END
      $fixture$;`,
    written: /^DO$/m,
    deniedExit: 3,
    denied: /42501:.*allergy authority denied/i,
    state: `SELECT head.current_version, revision.verification_status,
      (SELECT count(*) FROM clinical.allergies WHERE allergy_id = head.id),
      (SELECT count(*) FROM platform.outbox_events
        WHERE aggregate_id = head.id AND aggregate_type = 'clinical.allergy_revision')
      FROM clinical.allergy_heads head JOIN clinical.allergies revision ON head.current_revision_id = revision.id
      WHERE head.id = '${allergyId}';`,
    before: '1|self_reported|1|1\n',
    after: `2|${targetStatus}|2|2\n`,
  };
}

function recoveryRestrictionWriter(db, person) {
  const caseId = randomUUID();
  const seeded = observedSql(
    db,
    `INSERT INTO identity.continuity_cases
      (id,case_type,subject_person_id,status,public_token_digest,recovery_handle_digest,
       token_key_version,expires_at)
    VALUES ('${caseId}','account_recovery','${person}','proof_required',
      decode(repeat('c1',32),'hex'),decode(repeat('d2',32),'hex'),1,now() + interval '1 hour');`,
  );
  receipt.participatingWriters.recoveryRestrictionFixture = seeded;
  assert.equal(seeded.exit, 0, seeded.stderr);
  return {
    name: 'F007 Core API recovery restriction staging',
    actor: person,
    write: `SET LOCAL shifaa.actor_role = 'PAT';
      SET LOCAL shifaa.aal = '1';
      SET LOCAL shifaa.purposes = '';
      SET LOCAL shifaa.action = 'completeRecovery';
      SET LOCAL shifaa.case_id = '${caseId}';
      UPDATE identity.continuity_cases
      SET restriction_scope = 'mfa_enrollment_only', version = version + 1, updated_at = now()
      WHERE id = '${caseId}' AND subject_person_id = platform.context_person_id()
        AND status = 'proof_required'
      RETURNING id;`,
    written: /^UPDATE 1$/m,
    deniedExit: 0,
    denied: /^UPDATE 0$/m,
    state: `SELECT status, version, coalesce(restriction_scope, '')
      FROM identity.continuity_cases WHERE id = '${caseId}';`,
    before: 'proof_required|1|\n',
    after: 'proof_required|2|mfa_enrollment_only\n',
  };
}

function workforceTerminationWriter(db, { owner, clinician }) {
  const facility = randomUUID();
  const licence = randomUUID();
  const membership = randomUUID();
  const seeded = observedSql(
    db,
    `BEGIN;
    UPDATE identity.people SET profile_status = 'active' WHERE id IN ('${owner}', '${clinician}');
    INSERT INTO identity.facilities
      (id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
    VALUES ('${facility}','clinic','عيادة اختبار','Synthetic clinic','active','C','Cairo','Test','Synthetic address','${owner}');
    INSERT INTO identity.professional_licenses
      (id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
    VALUES ('${licence}','${clinician}','doctor',decode(repeat('12',16),'hex'),decode(repeat('53',32),'hex'),
      'Synthetic issuer','2035-12-31','verified');
    INSERT INTO identity.facility_memberships
      (id,facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
    VALUES ('${membership}','${facility}','${clinician}','doctor','${licence}','2020-01-01','active','${owner}');
    COMMIT;`,
  );
  receipt.participatingWriters.workforceTerminationFixture = seeded;
  assert.equal(seeded.exit, 0, seeded.stderr);
  return {
    name: 'F003 clinical workforce membership termination',
    actor: owner,
    write: `SET LOCAL shifaa.actor_role = 'ADM-FACILITY';
      SET LOCAL shifaa.aal = '2';
      INSERT INTO identity.facility_memberships
        (id,facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id,version)
      VALUES ('${membership}','${facility}','${clinician}','doctor','${licence}','2020-01-01',
        'ended',platform.context_person_id(),2)
      ON CONFLICT (id) DO UPDATE SET role_code = excluded.role_code,
        employment_license_id = excluded.employment_license_id, invite_token_hash = excluded.invite_token_hash,
        invite_expires_at = excluded.invite_expires_at, valid_from = excluded.valid_from,
        valid_until = excluded.valid_until, membership_status = excluded.membership_status,
        version = excluded.version;`,
    written: /^INSERT 0 1$/m,
    deniedExit: 3,
    denied: /42501:.*row-level security/i,
    state: `SELECT membership_status, version, valid_until IS NOT NULL
      FROM identity.facility_memberships WHERE id = '${membership}';`,
    before: 'active|1|f\n',
    after: 'ended|2|f\n',
  };
}

function seedEncounterWriter(
  db,
  { patientPerson, clinician, unrelated },
  results = receipt.participatingWriters,
) {
  const facility = randomUUID();
  const licence = randomUUID();
  const schedule = randomUUID();
  const appointment = randomUUID();
  const encounter = randomUUID();
  const starts = '2030-04-05T07:00:00Z';
  const seed = observedSql(
    db,
    `BEGIN;
    UPDATE identity.people SET profile_status = 'active'
      WHERE id IN ('${patientPerson}', '${clinician}', '${unrelated}');
    INSERT INTO identity.facilities
      (id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
    VALUES ('${facility}','clinic','عيادة اختبار','Synthetic clinic','active','C','Cairo','Test','Synthetic address','${clinician}');
    INSERT INTO identity.professional_licenses
      (id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
    VALUES ('${licence}','${clinician}','doctor',decode(repeat('12',16),'hex'),decode(repeat('53',32),'hex'),
      'Synthetic issuer','2035-12-31','verified');
    INSERT INTO identity.facility_memberships
      (facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
    VALUES ('${facility}','${clinician}','doctor','${licence}','2020-01-01','active','${clinician}');
    INSERT INTO clinical.schedules
      (id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,
       fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
    VALUES ('${schedule}','${facility}','${clinician}','Africa/Cairo','2030-04-01','2030-04-30',30,
      100,'EGP','${clinician}','${clinician}');
    INSERT INTO clinical.appointments
      (id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,
       civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id)
    VALUES ('${appointment}','${patientPerson}','${facility}','${clinician}','${schedule}',
      '${starts}','2030-04-05T07:30:00Z','Africa/Cairo','2030-04-05','09:00',100,'EGP',
      'cash_on_arrival','confirmed','${clinician}','${clinician}');
    UPDATE clinical.appointments SET status = 'checked_in' WHERE id = '${appointment}';
    SET LOCAL shifaa.clinic_internal_transition = 'f010_create_encounter';
    UPDATE clinical.appointments SET status = 'in_consultation' WHERE id = '${appointment}';
    INSERT INTO clinical.encounters
      (id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status,started_at)
    VALUES ('${encounter}','${patientPerson}','${facility}','${appointment}','${clinician}','consultation','open','${starts}');
    INSERT INTO clinical.encounter_participants (encounter_id,person_id,role_code,started_at) VALUES
      ('${encounter}','${clinician}','responsible_clinician','${starts}'),
      ('${encounter}','${unrelated}','consulting_clinician','${starts}');
    COMMIT;`,
  );
  results.encounterFixture = seed;
  assert.equal(seed.exit, 0, seed.stderr);
  assert.match(seed.stdout, /^INSERT 0 2\nCOMMIT\n$/m);
  return {
    appointment,
    encounter,
    facility,
    schedule,
    patientPerson,
    clinician,
    unrelated,
    starts,
  };
}

function encounterWriterContext(action, purpose = 'appointment.scheduling') {
  const request = randomUUID();
  return `SET LOCAL shifaa.environment = 'local';
    SET LOCAL shifaa.test_now = '2030-04-05T08:00:00Z';
    SET LOCAL shifaa.actor_role = 'CLN';
    SET LOCAL shifaa.action = '${action}';
    SET LOCAL shifaa.aal = '2';
    SET LOCAL shifaa.purposes = '${purpose}';
    SET LOCAL shifaa.request_id = '${request}';
    SET LOCAL shifaa.trace_id = '${request}';
    SET LOCAL shifaa.idempotency_key = '${randomUUID()}';
    SET LOCAL shifaa.request_hash = '${'b'.repeat(64)}';`;
}

function standaloneAppointment(db, { facility, schedule, patientPerson, clinician }) {
  const appointment = randomUUID();
  const seed = observedSql(
    db,
    `INSERT INTO clinical.appointments
      (id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,
       civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id)
    VALUES ('${appointment}','${patientPerson}','${facility}','${clinician}','${schedule}',
      '2030-04-06T07:00:00Z','2030-04-06T07:30:00Z','Africa/Cairo','2030-04-06','09:00',100,'EGP',
      'cash_on_arrival','confirmed','${clinician}','${clinician}');`,
  );
  assert.equal(seed.exit, 0, seed.stderr);
  assert.match(seed.stdout, /^INSERT 0 1$/m);
  return appointment;
}

function appointmentCancellationWriter(db, fixture) {
  const { clinician } = fixture;
  const appointment = standaloneAppointment(db, fixture);
  const seed = observedSql(
    db,
    `BEGIN;
    SET LOCAL shifaa.environment = 'local';
    SET LOCAL shifaa.test_now = '2030-04-05T08:00:00Z';
    -- Initialize the synthetic audit partition before racing the installed writer.
    SELECT event_id FROM audit.append_event_v1(
      '${randomUUID()}', '${randomUUID()}', 'appointment.cancelled', 'appointment', 'success',
      p_actor_person_id => '${clinician}', p_resource_id => '${randomUUID()}');
    COMMIT;`,
  );
  receipt.participatingWriters.appointmentCancellationFixture = seed;
  assert.equal(seed.exit, 0, seed.stderr);
  return {
    name: 'F010 independent appointment cancellation',
    actor: clinician,
    write: `${encounterWriterContext('appointment.manage')}
      SELECT 'cancelled', result->>'status', result->>'version'
        FROM clinical.cancel_appointment_v1('${appointment}',1,'Synthetic cancellation') AS result;`,
    written: /^cancelled\|cancelled\|2$/m,
    deniedExit: 3,
    denied: /42501:.*clinic facility, membership, or licence scope denied/,
    state: `SELECT a.status, a.version, a.cancelled_at IS NOT NULL,
      (SELECT count(*) FROM platform.idempotency_records
        WHERE resource_id = a.id AND route_template = '/v1/appointments/{appointmentId}/cancel'
          AND state = 'completed'),
      (SELECT count(*) FROM audit.events
        WHERE resource_id = a.id AND action_code = 'appointment.cancelled'),
      (SELECT count(*) FROM platform.outbox_events
        WHERE aggregate_id = a.id AND event_type = 'clinical.appointment.changed.v1')
      FROM clinical.appointments a WHERE a.id = '${appointment}';`,
    before: 'confirmed|1|f|0|0|0\n',
    after: 'cancelled|2|t|1|1|1\n',
  };
}

function queueCallWriter(db, fixture) {
  const { facility, clinician } = fixture;
  const appointment = standaloneAppointment(db, fixture);
  const scope = randomUUID();
  const queue = randomUUID();
  const seed = observedSql(
    db,
    `BEGIN;
    UPDATE clinical.appointments SET status = 'checked_in' WHERE id = '${appointment}';
    INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name)
      VALUES ('${scope}','${facility}','${clinician}','2030-04-06','Africa/Cairo');
    INSERT INTO clinical.queue_entries
      (id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,state,waiting_order)
      VALUES ('${queue}','${scope}','${appointment}','${facility}','${clinician}',
        '2030-04-06',1,'waiting',1);
    SET LOCAL shifaa.environment = 'local';
    SET LOCAL shifaa.test_now = '2030-04-05T08:00:00Z';
    SELECT event_id FROM audit.append_event_v1(
      '${randomUUID()}', '${randomUUID()}', 'queue.entry.called', 'queue_entry', 'success',
      p_actor_person_id => '${clinician}', p_resource_id => '${randomUUID()}');
    COMMIT;`,
  );
  receipt.participatingWriters.queueCallFixture = seed;
  assert.equal(seed.exit, 0, seed.stderr);
  return {
    name: 'F010 independent queue entry call',
    actor: clinician,
    appointment,
    queue,
    write: `${encounterWriterContext('queue.manage', 'queue.operation')}
      SELECT 'called', result->>'state', result->>'version'
        FROM clinical.call_queue_entry_v1('${queue}',1) AS result;`,
    written: /^called\|called\|2$/m,
    deniedExit: 3,
    denied: /42501:.*clinic facility, membership, or licence scope denied/,
    state: `SELECT q.state, q.version, q.called_at IS NOT NULL, q.waiting_order IS NOT NULL,
      (SELECT count(*) FROM platform.idempotency_records
        WHERE resource_id = q.id AND route_template = '/v1/queue-entries/{queueEntryId}/call'
          AND state = 'completed'),
      (SELECT count(*) FROM audit.events
        WHERE resource_id = q.id AND action_code = 'queue.entry.called'),
      (SELECT count(*) FROM platform.outbox_events
        WHERE aggregate_id = q.id AND event_type = 'clinical.queue.changed.v1')
      FROM clinical.queue_entries q WHERE q.id = '${queue}';`,
    before: 'waiting|1|f|t|0|0|0\n',
    after: 'called|2|t|f|1|1|1\n',
  };
}

function encounterCreateWriter({ patientPerson, clinician }, { appointment, queue }) {
  const payload = JSON.stringify({
    appointmentId: appointment,
    patientId: patientPerson,
    encounterType: 'consultation',
  });
  return {
    name: 'F010 independent encounter creation',
    actor: clinician,
    write: `${encounterWriterContext('createEncounter')}
      SELECT 'created', result #>> '{encounter,status}', result #>> '{encounter,version}'
        FROM clinical.create_encounter_api_v1('${payload}'::jsonb) AS result;`,
    written: /^created\|open\|1$/m,
    deniedExit: 3,
    denied: /42501:.*current treating appointment scope denied/,
    state: `SELECT a.status, a.version, q.state, q.version, coalesce(e.status, ''),
      (SELECT count(*) FROM clinical.encounter_participants WHERE encounter_id = e.id),
      (SELECT count(*) FROM platform.idempotency_records
        WHERE resource_id = e.id AND route_template = '/v1/encounters' AND state = 'completed'),
      (SELECT count(*) FROM audit.events WHERE resource_id = e.id AND action_code = 'encounter.created'),
      (SELECT count(*) FROM platform.outbox_events
        WHERE aggregate_id = e.id AND event_type = 'clinical.encounter.opened.v1')
      FROM clinical.appointments a JOIN clinical.queue_entries q ON q.appointment_id = a.id
      LEFT JOIN clinical.encounters e ON e.appointment_id = a.id
      WHERE a.id = '${appointment}' AND q.id = '${queue}';`,
    before: 'checked_in|2|called|2||0|0|0|0\n',
    after: 'in_consultation|3|in_service|3|open|1|1|1|1\n',
  };
}

function encounterParticipantWriter({ encounter, clinician, unrelated, starts }) {
  const payload = JSON.stringify({
    participantIntervalsEnd: [
      { personId: unrelated, roleCode: 'consulting_clinician', startedAt: starts },
    ],
  });
  return {
    name: 'F010 encounter participant interval closure',
    actor: clinician,
    write: `${encounterWriterContext('updateEncounter')}
      SELECT 'updated', clinical.update_encounter_api_v1('${encounter}',1,'${payload}'::jsonb)->>'version';`,
    written: /^updated\|2$/m,
    deniedExit: 3,
    denied: /P0002:.*encounter was not found/,
    state: `SELECT encounter.version, participant.version, participant.ended_at IS NOT NULL,
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_id = encounter.id)
      FROM clinical.encounters encounter JOIN clinical.encounter_participants participant
        ON participant.encounter_id = encounter.id
      WHERE encounter.id = '${encounter}' AND participant.person_id = '${unrelated}';`,
    before: '1|1|f|0\n',
    after: '2|2|t|1\n',
  };
}

function encounterCompletionWriter(db, { appointment, encounter, facility, clinician, starts }) {
  const scope = randomUUID();
  const queue = randomUUID();
  const seed = observedSql(
    db,
    `BEGIN;
      INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name)
        VALUES ('${scope}','${facility}','${clinician}','2030-04-05','Africa/Cairo');
      INSERT INTO clinical.queue_entries
        (id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,state,waiting_order)
        VALUES ('${queue}','${scope}','${appointment}','${facility}','${clinician}',
          '2030-04-05',1,'waiting',1);
      UPDATE clinical.queue_entries SET state = 'called', waiting_order = NULL, called_at = '${starts}'
        WHERE id = '${queue}';
      SET LOCAL shifaa.clinic_internal_transition = 'f010_create_encounter';
      UPDATE clinical.queue_entries SET state = 'in_service' WHERE id = '${queue}';
      -- Pre-provision the month with a synthetic event so concurrent audit reads
      -- observe the transaction without waiting for first-write partition DDL.
      SET LOCAL shifaa.environment = 'local';
      SET LOCAL shifaa.test_now = '2030-04-05T08:00:00Z';
      SELECT event_id FROM audit.append_event_v1(
        '${randomUUID()}', '${randomUUID()}', 'encounter.updated', 'encounter', 'success',
        p_actor_person_id => '${clinician}', p_resource_id => '${randomUUID()}');
      COMMIT;`,
  );
  receipt.participatingWriters.queueFixture = seed;
  assert.equal(seed.exit, 0, seed.stderr);
  return {
    name: 'F010 encounter, appointment and queue completion',
    actor: clinician,
    write: `${encounterWriterContext('completeEncounter')}
      SELECT 'completed', result->'encounter'->>'status', result->>'appointmentStatus',
        result->>'queueStatus'
      FROM clinical.complete_encounter_api_v1('${encounter}',1,
        '{"summary":"Synthetic completion","structuralConfirmation":true}'::jsonb) AS result;`,
    written: /^completed\|completed\|completed\|completed$/m,
    deniedExit: 3,
    denied: /P0002:.*encounter was not found/,
    state: `SELECT encounter.status, encounter.version, appointment.status, appointment.version,
      queue.state, queue.version,
      (SELECT count(*) FROM platform.idempotency_records
        WHERE resource_id = encounter.id AND route_template = '/v1/encounters/{encounterId}/complete'
          AND state = 'completed'),
      (SELECT count(*) FROM audit.events
        WHERE resource_id = encounter.id AND action_code = 'encounter.completed'),
      (SELECT count(*) FROM platform.outbox_events
        WHERE aggregate_id = encounter.id AND event_type = 'clinical.encounter.completed.v1')
      FROM clinical.encounters encounter
      JOIN clinical.appointments appointment ON appointment.id = encounter.appointment_id
      JOIN clinical.queue_entries queue ON queue.appointment_id = appointment.id
      WHERE encounter.id = '${encounter}';`,
    before: 'open|1|in_consultation|3|in_service|3|0|0|0\n',
    after: 'completed|2|completed|4|completed|4|1|1|1\n',
  };
}

async function runRecoveryWorkerOrder(db, { admission, onboard, contend, hold, backendPid }) {
  const worker = 'shifaa_worker';
  const subject = '74120000-0000-4000-8000-000000000004';
  const before = contend(onboard(subject));
  assert.equal(before.exit, 0, before.stderr);
  assert.match(before.stdout, /^onboarded\|1$/m);
  const seed = observedSql(
    db,
    `INSERT INTO identity.continuity_cases
      (case_type, subject_person_id, status, public_token_digest, recovery_handle_digest,
       token_key_version, restriction_scope, bound_native_session_id, created_at, expires_at)
      SELECT 'account_recovery', id, 'restricted_enrollment',
             decode(repeat('a1', 32), 'hex'), decode(repeat('b2', 32), 'hex'),
             1, 'mfa_enrollment_only', '74120000-0000-4000-8000-000000000005',
             now() - interval '2 hours', now() - interval '1 hour'
      FROM identity.people WHERE user_id = '${subject}';`,
  );
  assert.equal(seed.exit, 0, seed.stderr);
  assert.match(seed.stdout, /^INSERT 0 1$/m);
  const state = () =>
    observedSql(
      db,
      `SELECT c.status, c.version, c.restriction_scope
    FROM identity.continuity_cases c JOIN identity.people p ON p.id = c.subject_person_id
    WHERE p.user_id = '${subject}';`,
    );
  const expire = "SELECT 'purged', platform.purge_expired_continuity_decoys(clock_timestamp());";
  const coreApi = contend(expire);
  assert.equal(coreApi.exit, 3);
  assert.match(coreApi.stderr, /42501: permission denied for (schema|function)/);
  const initial = state();
  assert.equal(initial.stdout, 'restricted_enrollment|1|mfa_enrollment_only\n');

  // Run worker-first before the admission-first trial can commit the expiry.
  const writerFirst = await hold(
    expire,
    (holder) => ({ holder, admission: contend(admission), visible: state() }),
    worker,
  );
  assert.match(writerFirst.holder, /^purged\|0$/m);
  assert.notEqual(
    backendPid(writerFirst.holder, 'holder', worker),
    backendPid(writerFirst.admission.stdout, 'contender'),
  );
  assert.deepEqual(writerFirst.visible, initial);
  const rollback = state();
  assert.deepEqual(rollback, initial);

  const admissionFirst = await hold(admission, (holder) => ({
    holder,
    writer: contend(expire, worker),
    visible: state(),
  }));
  assert.notEqual(
    backendPid(admissionFirst.holder, 'holder'),
    backendPid(admissionFirst.writer.stdout, 'contender', worker),
  );
  const failedOrderings = [];
  for (const [name, observation] of [
    ['worker first', writerFirst.admission],
    ['admission first with worker', admissionFirst.writer],
  ]) {
    if (observation.exit === 3) {
      assert.match(observation.stderr, /55P03:.*lock timeout/);
      assert.match(observation.stderr, /relation "f012_source_admission"/);
    } else {
      assert.equal(observation.exit, 0, observation.stderr);
      failedOrderings.push(name);
    }
  }
  const blocked = admissionFirst.writer.exit === 3;
  assert.equal(
    admissionFirst.visible.stdout,
    blocked ? initial.stdout : 'expired|2|mfa_enrollment_only\n',
  );
  const retry = blocked ? contend(expire, worker) : null;
  if (retry) assert.equal(retry.exit, 0, retry.stderr);
  const committed = state();
  assert.equal(committed.stdout, 'expired|2|mfa_enrollment_only\n');
  return {
    seed,
    coreApi,
    initial,
    writerFirst,
    rollback,
    admissionFirst,
    retry,
    committed,
    failedOrderings,
  };
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

function coreApiWriter(db, probe, fixture, signingKeyId) {
  const api = 'services/api';
  const workspaces = [
    api,
    'packages/auth',
    'packages/contracts',
    'packages/core',
    'packages/observability',
  ];
  const entry = 'tools/feature-012-core-api-writer.mjs';
  const paths = [
    entry,
    ...workspaces.flatMap((workspace) => [workspace + '/package.json', workspace + '/src']),
  ];
  const entries = git(root, ['ls-tree', '-rz', receipt.base, '--', ...paths])
    .toString()
    .split('\0')
    .filter(Boolean);
  assert.ok(entries.length > paths.length);
  for (const entry of entries) {
    const [mode, path] = entry.split('\t');
    assert.match(mode, /^100(?:644|755) blob [a-f0-9]+$/);
    assert.ok(path && !excluded(path), 'Unexpected Core API source path');
    safeSource(root, path);
  }
  const archive = git(root, ['archive', '--format=tar', receipt.base, '--', ...paths]);
  assert.ok(archive.length < 16 * 1024 * 1024, 'Core API source exceeds disposable budget');
  const target = '/tmp/f012-core-api';
  exec(probe, ['mkdir', target]);
  exec(probe, ['tar', '-xf', '-', '-C', target], { input: archive });
  const outcome = JSON.parse(
    exec(probe, [
      'node',
      '--import',
      '/opt/deps/services/api/node_modules/tsx/dist/loader.mjs',
      `${target}/${entry}`,
      fixture.subject,
      signingKeyId ?? 'local-fixture',
      ...workspaces,
    ]),
  );
  assert.equal(outcome.sessionRole, 'shifaa_api');
  assert.equal(outcome.effectiveRole, 'shifaa_api');
  assert.equal(outcome.database, 'postgres');
  assert.equal(outcome.serverAddress, outcome.configuredAddress);
  assert.equal(outcome.serverPort, 5432);
  assert.ok(Number.isInteger(outcome.backend) && outcome.backend > 0);
  assert.match(outcome.requestId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const effect = observedSql(
    db,
    `SELECT count(DISTINCT p.id), count(DISTINCT pt.id),
      count(DISTINCT cr.id), count(DISTINCT a.id)
    FROM identity.people p
    JOIN identity.patients pt ON pt.person_id = p.id
    JOIN identity.care_relationships cr ON cr.actor_person_id = p.id
      AND cr.subject_patient_id = pt.id AND cr.relationship_type = 'self'
    JOIN audit.events a ON a.resource_id = p.id AND a.actor_person_id = p.id
      AND a.action_code = 'identity.registration.created' AND a.outcome = 'success'
      AND a.request_id = '${outcome.requestId}'
    WHERE p.user_id = '${fixture.subject}';`,
  );
  receipt.coreApiWriter = {
    sourceArchiveSha256: createHash('sha256').update(archive).digest('hex'),
    outcome,
    effect,
  };
  assert.equal(effect.exit, 0, effect.stderr);
  assert.equal(effect.stdout, '1|1|1|1\n');
  if (signingKeyId) {
    assert.equal(outcome.authenticated?.session, fixture.session);
    assert.equal(outcome.authenticated.keyId, signingKeyId);
    const { consent, requestId, withdrawal, withdrawalRequestId } = outcome.authenticated;
    for (const id of [consent, requestId, withdrawal, withdrawalRequestId]) {
      assert.match(id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    }
    const consentEffect = observedSql(
      db,
      `SELECT count(DISTINCT c.id), count(DISTINCT a.id), count(DISTINCT o.id)
      FROM consent.records c
      JOIN identity.people p ON p.id = c.person_id
      JOIN audit.events a ON a.resource_id = c.id AND a.actor_person_id = p.id
        AND a.action_code = 'consent.decision.recorded' AND a.request_id = '${requestId}'
      JOIN platform.outbox_events o ON o.aggregate_id = c.id AND o.event_type = 'consent.changed'
      WHERE c.id = '${consent}' AND p.user_id = '${fixture.subject}'
        AND c.purpose_code = 'care_updates' AND c.decision = 'granted'
        AND c.version = 1 AND c.supersedes_id IS NULL;`,
    );
    receipt.coreApiWriter.consentEffect = consentEffect;
    assert.equal(consentEffect.exit, 0, consentEffect.stderr);
    assert.equal(consentEffect.stdout, '1|1|1\n');
    const withdrawalEffect = observedSql(
      db,
      `SELECT count(DISTINCT c.id), count(DISTINCT a.id), count(DISTINCT o.id)
      FROM consent.records c
      JOIN identity.people p ON p.id = c.person_id
      JOIN audit.events a ON a.resource_id = c.id AND a.actor_person_id = p.id
        AND a.action_code = 'consent.withdrawn' AND a.request_id = '${withdrawalRequestId}'
      JOIN platform.outbox_events o ON o.aggregate_id = c.id AND o.event_type = 'consent.changed'
      WHERE c.id = '${withdrawal}' AND p.user_id = '${fixture.subject}'
        AND c.purpose_code = 'care_updates' AND c.decision = 'withdrawn'
        AND c.version = 2 AND c.supersedes_id = '${consent}';`,
    );
    receipt.coreApiWriter.withdrawalEffect = withdrawalEffect;
    assert.equal(withdrawalEffect.exit, 0, withdrawalEffect.stderr);
    assert.equal(withdrawalEffect.stdout, '1|1|1\n');
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
  const nativeMutation =
    argumentsList.length === 1 &&
    new Map([
      ['--native-ban', 'ban'],
      ['--native-downgrade', 'downgrade'],
      ['--native-recovery', 'recovery'],
    ]).get(argumentsList[0]);
  const atomicity = argumentsList.length === 1 && argumentsList[0] === '--atomicity';
  const onlyArgument = argumentsList.length === 1 ? argumentsList[0] : undefined;
  const writerCatalog = onlyArgument === '--participating-writer-catalog';
  const predecessorSql = new Map([
    [
      '--predecessor-writer-behaviors',
      {
        status: 'PASS_T012_PREDECESSOR_WRITER_BEHAVIORS',
        paths: [
          'infra/db/tests/clinic-scheduling-schema.sql',
          'infra/db/tests/facility-onboarding-rls.sql',
          'infra/db/tests/feature-012-predecessor-family.sql',
          'infra/db/tests/feature-012-predecessor-recovery.sql',
          'infra/db/tests/feature-012-predecessor-governance.sql',
        ],
      },
    ],
    [
      '--predecessor-workforce-predicate',
      {
        status: 'PASS_T012_PREDECESSOR_WORKFORCE_PREDICATE',
        paths: ['infra/db/tests/feature-012-predecessor-workforce.sql'],
      },
    ],
    [
      '--predecessor-purpose-projection',
      {
        status: 'PASS_T012_PREDECESSOR_PURPOSE_PROJECTION',
        paths: ['infra/db/tests/feature-012-predecessor-purpose.sql'],
      },
    ],
    [
      '--predecessor-scheduling-writers',
      {
        status: 'PASS_T012_PREDECESSOR_SCHEDULING_WRITERS',
        paths: ['infra/db/tests/feature-012-predecessor-scheduling.sql'],
      },
    ],
  ]).get(onlyArgument);
  const predecessorAllergy = onlyArgument === '--predecessor-allergy-writers';
  const authenticatedWriter = onlyArgument === '--participating-authenticated-core-api-writer';
  const applicationWriter =
    authenticatedWriter || onlyArgument === '--participating-core-api-writer';
  const focusedWriters = new Map([
    ['--participating-family-writers', 'familyAndConsent'],
    ['--participating-family-grant', 'familyGrant'],
    ['--participating-allergy-writer', 'allergy'],
    ['--participating-allergy-verification', 'allergyVerification'],
    ['--participating-encounter-participant', 'encounterParticipant'],
    ['--participating-encounter-completion', 'encounterCompletion'],
    ['--participating-appointment-cancellation', 'appointmentCancellation'],
    ['--participating-queue-call', 'queueCall'],
    ['--participating-encounter-create', 'encounterCreate'],
    ['--participating-workforce-termination', 'workforceTermination'],
    ['--participating-recovery-restriction', 'recoveryRestriction'],
  ]).get(onlyArgument);
  const participatingWriters =
    Boolean(focusedWriters) || onlyArgument === '--participating-writers';
  const redOnly = argumentsList.length === 1 && argumentsList[0] === '--source-fence-red';
  const upgrade = argumentsList.length === 1 && argumentsList[0] === '--source-fence-upgrade';
  const sqlOnly =
    atomicity ||
    writerCatalog ||
    Boolean(predecessorSql) ||
    predecessorAllergy ||
    participatingWriters ||
    redOnly ||
    upgrade ||
    (argumentsList.length === 1 && argumentsList[0] === '--source-fence');
  assert.deepEqual(
    sqlOnly ||
      nativeBaseline ||
      nativeRefresh ||
      nativeDeadlines ||
      nativeLogoutFirst ||
      applicationWriter ||
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
    stage = predecessorAllergy
      ? 'isolated PostgreSQL predecessor allergy writers'
      : predecessorSql
        ? 'isolated PostgreSQL predecessor writer behaviors'
        : atomicity
          ? 'isolated structural atomicity SQL'
          : 'isolated PostgreSQL source fence';
    try {
      const source = startDatabase(
        predecessorSql || predecessorAllergy
          ? 'predecessor-writers'
          : atomicity
            ? 'atomicity'
            : 'source-fence',
        'none',
      );
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
      } else if (predecessorAllergy) {
        runPredecessorAllergyWriters(source);
      } else if (predecessorSql) {
        runPredecessorSqlFixtures(source, predecessorSql.paths);
      } else if (writerCatalog) {
        stage = 'T012 read-only catalog on the disposable migrated database';
        runWriterCatalog(source);
      } else {
        sourceFence(source, redOnly, upgrade || participatingWriters);
        if (!redOnly && !focusedWriters) {
          await sourceFenceLockConflict(source);
          sourceFenceRawBypass(source);
          sourceFenceDurability(source);
          sourceFencePrivilegeNegatives(source);
          sourceFenceScopeNegatives(source);
          sourceFenceRlsNegatives(source);
        }
        if (participatingWriters) {
          stage = 'T012 participating writers against the disposable migrated database';
          await runOnboardingWriterOrder(source, focusedWriters);
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
    if (predecessorSql) {
      receipt.status = predecessorSql.status;
      return;
    }
    if (predecessorAllergy) {
      receipt.status = 'PASS_T012_PREDECESSOR_ALLERGY_WRITERS';
      return;
    }
    receipt.status = atomicity
      ? 'EXECUTED_ATOMICITY_SQL'
      : writerCatalog
        ? 'PASS_T012_WRITER_CATALOG'
        : focusedWriters
          ? 'PASS_T012_FOCUSED_WRITER_SQL'
          : participatingWriters
            ? 'PASS_T012_ONBOARDING_WRITER_SQL'
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
      nativeMutation,
      applicationWriter,
      authenticatedWriter,
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
  if (nativeMutation) receipt.status = 'PASS_NATIVE_MUTATION_ORDERING';
  if (applicationWriter) receipt.status = 'PASS_T012_CORE_API_WRITER';
  if (authenticatedWriter) receipt.status = 'PASS_T012_AUTHENTICATED_CORE_API_WRITER';
}

async function runNativeAdmission({
  nativeBaseline,
  nativeRefresh,
  nativeDeadlines,
  nativeLogoutFirst,
  nativeMutation,
  applicationWriter,
  authenticatedWriter,
}) {
  const db = startDatabase('db', networkId);
  receipt.databaseSystems = { source: db.system };
  const restore =
    nativeBaseline ||
    nativeRefresh ||
    nativeDeadlines ||
    nativeLogoutFirst ||
    nativeMutation ||
    applicationWriter
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
    nativeRefresh || nativeDeadlines || nativeLogoutFirst || nativeMutation || applicationWriter;
  const signingKey = authenticatedWriter
    ? {
        ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }),
        alg: 'ES256',
        kid: randomUUID(),
        use: 'sig',
        key_ops: ['sign', 'verify'],
      }
    : undefined;
  const auth = startAuth(readSessionPolicy, signingKey);
  if (readSessionPolicy) observeNativePolicy(auth);
  const probe = create('probe', receipt.images.probe, {
    env: {
      F012_PROBE_PASSWORD: apiPassword,
      ...(applicationWriter ? { F012_CORE_API_PASSWORD: coreApiPassword } : {}),
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
  if (applicationWriter) {
    stage = 'T012 combined Core API and native Auth writer attribution';
    runWriterCatalog(db, [auth, probe]);
    sql(db, `ALTER ROLE shifaa_api PASSWORD '${coreApiPassword}';`);
    coreApiWriter(db, probe, fixtures[0], signingKey?.kid);
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
