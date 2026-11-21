import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function startAuth() {
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
    },
    flags: ['--network-alias', 'auth'],
    command: ['auth'],
  });
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

function applySealedF011(db) {
  assert.equal(db.network, 'none');
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
  const atomicity = argumentsList.length === 1 && argumentsList[0] === '--atomicity';
  const redOnly = argumentsList.length === 1 && argumentsList[0] === '--source-fence-red';
  const upgrade = argumentsList.length === 1 && argumentsList[0] === '--source-fence-upgrade';
  const sqlOnly =
    atomicity ||
    redOnly ||
    upgrade ||
    (argumentsList.length === 1 && argumentsList[0] === '--source-fence');
  assert.deepEqual(
    sqlOnly ? [] : argumentsList,
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
  const db = startDatabase('db', networkId);
  const restore = startDatabase('restore', 'none');
  receipt.databaseSystems = { source: db.system, restore: restore.system };
  trial('mismatched container binding denied', () => checkContainer({ ...db, id: restore.id }), {
    name: 'AssertionError',
  });
  trial('unknown resource ID denied', () => checkContainer({ ...db, id: db.name }), {
    name: 'AssertionError',
  });
  if (before.containers.length) {
    trial(
      'actual retained container denied',
      () => checkContainer({ ...db, id: before.containers[0].id }),
      /Retained container denied/,
    );
  }
  stage = 'bootstrap and native API admission';
  sql(db, "alter role supabase_auth_admin password '" + authPassword + "';\n" + probeSchema());
  startAuth();
  const probe = create('probe', receipt.images.probe, {
    env: { F012_PROBE_PASSWORD: apiPassword },
    tmpfs: { '/tmp': 'rw,nosuid,nodev,size=48m' },
    flags: ['--read-only', '--cap-drop=ALL', '--user=1000:1000', '--entrypoint=node'],
    command: ['-e', 'setTimeout(() => {}, 180000)'],
  });
  const source = readFileSync(safeSource(root, 'tools/feature-012-harness-probe.cjs'));
  receipt.probeSha256 = createHash('sha256').update(source).digest('hex');
  const fixtures = JSON.parse(exec(probe, ['node', '-', 'fixtures'], { input: source }));
  bindFixtures(db, fixtures);
  receipt.syntheticSessions = fixtures;
  receipt.probe = JSON.parse(exec(probe, ['node', '-', 'probe'], { input: source }));
  stage = 'separate restore';
  verifyRestore(db, restore);
  stage = 'identity-checked cleanup';
  teardown();
  stage = 'retained resource preservation';
  assert.deepEqual(inventory(), before);
  receipt.preservation = {
    containers: before.containers.length,
    volumes: before.volumes.length,
    matches: true,
  };
  receipt.status = 'PASS_HARNESS_PROBE';
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
