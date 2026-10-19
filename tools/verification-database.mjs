// Test-only database boundary. Importing this file never contacts Docker or SQL.
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyRunOutput } from './disposable-test-resources.mjs';

const sharedPorts = new Set([5432, 54322, 55432]);
const deny = (message) => {
  throw new Error(`verification-resource-denied: ${message}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inspect = (command, args) => JSON.parse(command(args));
const cleanEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(DOCKER|COMPOSE|PG|DATABASE|SUPABASE_)/i.test(key),
    ),
  );

// This is an inventory comparison, not label/name-based adoption. Every ID must
// have been absent before this invocation and recorded after exclusive creation.
export function validateTestResource(record, observed) {
  assert.match(record.nonce, /^[a-f0-9]{32}$/);
  assert.ok(
    [`shifaa-verify-${record.nonce}`, `sv-${record.nonce}-sb`].includes(record.project),
    'Cross-run project',
  );
  assert.equal(observed.engine, record.engine);
  assert.equal(observed.endpoint, record.endpoint);
  assert.equal(observed.container.Id, record.container);
  assert.equal(observed.container.Image, record.image);
  assert.ok(!record.before.containers.includes(record.container), 'Preexisting container');
  assert.ok(!record.before.volumes.includes(record.volume.Name), 'Preexisting volume');
  assert.ok(!record.before.networks.includes(record.network.Id), 'Preexisting network');
  assert.ok(Date.parse(observed.container.Created) >= record.startedAt, 'Stale container');
  assert.equal(observed.container.HostConfig.Privileged, false);
  assert.ok(!['host', 'none'].includes(observed.container.HostConfig.NetworkMode));
  assert.equal(observed.container.HostConfig.VolumesFrom?.length ?? 0, 0);
  const labels = observed.container.Config.Labels;
  const project = labels['com.docker.compose.project'] ?? labels['com.supabase.cli.project'];
  assert.equal(project, record.project);
  assert.ok(!/shifaa-local|audit-round1/.test(project));
  assert.ok(
    Number.isInteger(record.port) &&
      record.port > 1024 &&
      record.port <= 65535 &&
      !sharedPorts.has(record.port),
  );
  const ports = observed.container.State.Running
    ? observed.container.NetworkSettings.Ports
    : observed.container.HostConfig.PortBindings;
  assert.deepEqual(ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(record.port) }]);
  const mounts = observed.container.Mounts;
  assert.ok(
    mounts.some(
      (mount) =>
        mount.Type === 'volume' &&
        mount.Name === record.volume.Name &&
        mount.Destination === '/var/lib/postgresql/data',
    ),
  );
  for (const mount of mounts) {
    if (mount.Type === 'volume')
      assert.ok(
        (record.volumes ?? [record.volume]).some(
          (volume) => volume.Name === mount.Name && !record.before.volumes.includes(mount.Name),
        ),
      );
    else
      assert.ok(
        mount.Type === 'bind' &&
          mount.RW === false &&
          mount.Source === record.sourceMount &&
          mount.Destination === '/workspace',
        'Unexpected mount',
      );
  }
  assert.ok(same(observed.volume, record.volume), 'Volume substitution');
  assert.deepEqual(
    observed.volumes ?? [observed.volume],
    record.volumes ?? [record.volume],
    'Additional volume substitution',
  );
  const stableNetwork = ({ Containers: _containers, ...value }) => value;
  assert.deepEqual(stableNetwork(observed.network), stableNetwork(record.network));
  assert.ok(Object.hasOwn(observed.container.NetworkSettings.Networks, record.network.Name));
  const attachedNetwork =
    observed.container.NetworkSettings.Networks[record.network.Name].NetworkID;
  if (observed.container.State.Running)
    assert.equal(attachedNetwork, record.network.Id, 'Container network identity substitution');
  else {
    // Docker leaves NetworkID empty until start. Admission still requires the
    // exact independently inspected network ID in the create configuration.
    assert.equal(observed.container.HostConfig.NetworkMode, record.network.Id);
    assert.ok(attachedNetwork === '' || attachedNetwork === record.network.Id);
  }
  assert.equal(Object.keys(observed.container.NetworkSettings.Networks).length, 1);
  return record;
}

function readEnvironment() {
  const file = process.env.SHIFAA_VERIFY_CONTEXT;
  if (!file || !path.isAbsolute(file))
    deny('pnpm verify test environment required; no shared fallback');
  if (
    lstatSync(file).isSymbolicLink() ||
    realpathSync.native(file).toLowerCase() !== file.toLowerCase()
  )
    deny('Linked test context');
  verifyRunOutput(path.dirname(file));
  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(record.schema, 'SHIFAA-VERIFY-ENVIRONMENT/1');
  assert.equal(record.root, path.resolve(import.meta.dirname, '..'));
  assert.ok(Number.isInteger(record.parentPid) && record.parentPid > 0);
  try {
    process.kill(record.parentPid, 0);
  } catch {
    deny('Test run owner no longer exists');
  }
  if (record.finished || record.failed) deny('Test run already finished or failed');
  assert.match(record.nonce, /^[a-f0-9]{32}$/);
  return record;
}

export function testRuntime(runtime = 'postgres') {
  assert.ok(['postgres', 'supabase'].includes(runtime));
  const environment = readEnvironment();
  const record = environment[runtime];
  if (!record) deny(`${runtime} test environment not created`);
  assert.equal(record.nonce, environment.nonce, 'Cross-run resource receipt');
  assert.equal(record.startedAt, environment.startedAt);
  if (runtime === 'supabase')
    assert.equal(
      createHash('sha256')
        .update(readFileSync(path.join(record.workdir, 'supabase/config.toml')))
        .digest('hex'),
      record.configSha256,
      'Native config changed after admission',
    );
  const command = (args) =>
    execFileSync('docker', ['--context', environment.context, ...args], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const [context] = inspect(command, ['context', 'inspect', environment.context]);
  const engine = inspect(command, ['info', '--format', '{{json .}}']);
  const [container] = inspect(command, ['inspect', record.container]);
  const volumes = (record.volumes ?? [record.volume]).map(
    (volume) => inspect(command, ['volume', 'inspect', volume.Name])[0],
  );
  const volume = volumes.find((volume) => volume.Name === record.volume.Name);
  const [network] = inspect(command, ['network', 'inspect', record.network.Id]);
  validateTestResource(record, {
    engine: engine.ID,
    endpoint: context.Endpoints.docker.Host,
    container,
    volume,
    volumes,
    network,
  });
  return {
    ...record,
    context: environment.context,
    name: runtime === 'postgres' ? 'shifaa-local-postgres' : 'shifaa-local-supabase',
    user: runtime === 'postgres' ? 'shifaa_owner' : 'supabase_admin',
    adminDatabase: runtime === 'postgres' ? 'shifaa' : 'postgres',
  };
}
export const assertTestDatabaseEnvironment = () => testRuntime('postgres');

export function testConnectionOptions(role = 'owner', runtime = 'postgres', database) {
  const target = testRuntime(runtime);
  const roles = {
    owner: runtime === 'postgres' ? 'shifaa_owner' : 'postgres',
    api: 'shifaa_api',
    worker: 'shifaa_worker',
    shifaa_owner: 'shifaa_owner',
    shifaa_api: 'shifaa_api',
    shifaa_worker: 'shifaa_worker',
    postgres: 'postgres',
    supabase_admin: 'supabase_admin',
  };
  const username = roles[role];
  assert.ok(username, 'Unapproved test connection role');
  const db = database ?? target.adminDatabase;
  assert.match(db, /^[a-z][a-z0-9_]{0,62}$/);
  const password = target.passwords[username];
  assert.equal(typeof password, 'string');
  return { host: '127.0.0.1', port: target.port, username, password, database: db };
}
export function testDatabaseUrl(role = 'owner', runtime = 'postgres', database) {
  const value = testConnectionOptions(role, runtime, database);
  return `postgresql://${encodeURIComponent(value.username)}:${encodeURIComponent(value.password)}@${value.host}:${value.port}/${value.database}`;
}

export function resolveTestDockerCommand(args, resolveRuntime = testRuntime) {
  let command = [...args];
  if (command[0] === 'compose') {
    const index = command.indexOf('exec');
    if (index < 0 || !same(command.slice(0, index), ['compose']))
      deny('Legacy Compose lifecycle forbidden');
    assert.equal(command[index + 1], '-T');
    assert.equal(command[index + 2], 'postgres');
    const target = resolveRuntime('postgres');
    return [
      '--context',
      target.context,
      'exec',
      '-i',
      target.container,
      ...command.slice(index + 3),
    ];
  }
  assert.ok(
    ['exec', 'cp', 'inspect'].includes(command[0]),
    'Only test-container commands permitted',
  );
  const aliases = {
    'shifaa-local-postgres-postgres-1': 'postgres',
    'supabase_db_shifaa-local-supabase': 'supabase',
  };
  let targetIndex = 1;
  if (command[0] === 'exec') {
    while (targetIndex < command.length && command[targetIndex].startsWith('-')) {
      const flag = command[targetIndex++];
      assert.ok(
        ['-i', '-t', '-it', '-e', '--env', '-w', '--workdir'].includes(flag),
        'Unsupported Docker exec flag',
      );
      if (['-e', '--env', '-w', '--workdir'].includes(flag)) targetIndex++;
    }
  } else if (command[0] === 'cp') {
    assert.equal(command.length, 3);
    targetIndex = command[1].includes(':/') ? 1 : 2;
  } else assert.equal(command.length, 2, 'Only one container may be inspected');
  const argument = command[targetIndex] ?? '';
  const suffix = command[0] === 'cp' ? argument.slice(argument.indexOf(':')) : '';
  const identity = suffix ? argument.slice(0, argument.indexOf(':')) : argument;
  let selected;
  if (Object.hasOwn(aliases, identity)) selected = resolveRuntime(aliases[identity]);
  else {
    for (const runtime of ['postgres', 'supabase']) {
      const target = resolveRuntime(runtime);
      if (identity === target.container) {
        selected = target;
        break;
      }
    }
  }
  if (!selected) deny('Unowned Docker target');
  command[targetIndex] = selected.container + suffix;
  return ['--context', selected.context, ...command];
}
export const testDockerSync = (args, options = {}) =>
  spawnSync('docker', resolveTestDockerCommand(args), {
    ...options,
    env: {
      ...cleanEnv(),
      ...(Object.hasOwn(options.env ?? {}, 'PGPASSWORD')
        ? { PGPASSWORD: options.env.PGPASSWORD }
        : {}),
    },
    windowsHide: true,
  });
export const testDocker = (args, options = {}) =>
  spawn('docker', resolveTestDockerCommand(args), {
    ...options,
    env: {
      ...cleanEnv(),
      ...(Object.hasOwn(options.env ?? {}, 'PGPASSWORD')
        ? { PGPASSWORD: options.env.PGPASSWORD }
        : {}),
    },
    windowsHide: true,
  });
export const testDockerExec = (args, options = {}) =>
  execFileSync('docker', resolveTestDockerCommand(args), {
    ...options,
    env: {
      ...cleanEnv(),
      ...(Object.hasOwn(options.env ?? {}, 'PGPASSWORD')
        ? { PGPASSWORD: options.env.PGPASSWORD }
        : {}),
    },
    windowsHide: true,
  });

export function testSupabaseArgs(args) {
  const target = testRuntime('supabase');
  if (
    args.includes('--workdir') ||
    args.some((value) => ['--linked', '--db-url', 'link', 'stop', 'start'].includes(value))
  )
    deny('Supabase target/lifecycle override');
  return [...args, '--workdir', target.workdir];
}

export function testSupabaseEnvironment() {
  const target = testRuntime('supabase');
  return { ...cleanEnv(), DOCKER_CONTEXT: target.context, DOCKER_HOST: target.endpoint };
}

export function testSupabaseStatus() {
  const args = testSupabaseArgs(['status', '-o', 'json']);
  const target = testRuntime('supabase');
  const cli = path.resolve(import.meta.dirname, '../node_modules/supabase/dist/supabase.js');
  const result = JSON.parse(
    execFileSync(process.execPath, [cli, ...args], {
      env: testSupabaseEnvironment(),
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  const database = new URL(result.DB_URL);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(Number(database.port), target.port);
  for (const key of ['API_URL', 'MAILPIT_URL']) {
    const url = new URL(result[key]);
    assert.equal(url.hostname, '127.0.0.1');
    assert.ok(target.servicePorts.includes(Number(url.port)), 'Foreign native service URL');
  }
  return result;
}

// All native reset/migration callers share this target boundary. Their pnpm
// wrappers cannot accidentally select the checkout's development project.
export function runTestSupabase(args, options = {}) {
  const target = testRuntime('supabase');
  const reset = args[0] === 'db' && args[1] === 'reset';
  const guarded = testSupabaseArgs(args);
  const command = (argv) =>
    execFileSync('docker', ['--context', target.context, ...argv], {
      encoding: 'utf8',
      env: cleanEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const environment = readEnvironment();
  if (reset) {
    assert.ok(args.includes('--local'), 'Only the admitted local test project may reset');
    assert.ok(!args.includes('--network-id'), 'Native reset network override');
    // CLI 2.113 PG17 reset recreates its DB container/volume and restarts its
    // own satellites. Check every affected identity and attachment first.
    for (const previous of environment.nativeContainers) {
      const [actual] = JSON.parse(command(['inspect', previous.id]));
      assert.equal(actual.Id, previous.id);
      assert.equal(actual.Image, previous.image);
      assert.equal(actual.Created, previous.created);
      assert.deepEqual(actual.Mounts, previous.mounts);
    }
    for (const volume of environment.nativeVolumes) {
      assert.deepEqual(JSON.parse(command(['volume', 'inspect', volume.Name]))[0], volume);
      const attachments = command(['ps', '-aq', '--no-trunc', '--filter', `volume=${volume.Name}`])
        .split(/\r?\n/)
        .filter(Boolean);
      assert.ok(
        attachments.every((id) => environment.nativeContainers.some((item) => item.id === id)),
        'Foreign attachment blocks native reset',
      );
    }
    guarded.push('--network-id', target.network.Id);
  }
  const startedAt = Math.floor(Date.now() / 1000) * 1000;
  const file = process.env.SHIFAA_VERIFY_CONTEXT;
  try {
    const result = execFileSync(
      process.execPath,
      [path.resolve(import.meta.dirname, '../node_modules/supabase/dist/supabase.js'), ...guarded],
      {
        ...options,
        env: testSupabaseEnvironment(),
        windowsHide: true,
        stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout ?? 300000,
      },
    );
    if (reset) {
      const [replacement] = JSON.parse(command(['inspect', `supabase_db_${target.project}`]));
      assert.equal(replacement.Image, target.image, 'Reset image changed');
      assert.ok(
        replacement.Id !== target.container && !target.before.containers.includes(replacement.Id),
      );
      assert.ok(Date.parse(replacement.Created) >= startedAt);
      const volumes = replacement.Mounts.filter((mount) => mount.Type === 'volume').map(
        (mount) => JSON.parse(command(['volume', 'inspect', mount.Name]))[0],
      );
      assert.deepEqual(
        volumes.map((volume) => volume.Name).sort(),
        target.volumes.map((volume) => volume.Name).sort(),
        'Reset changed mount names',
      );
      const volume = volumes.find((volume) => volume.Name === target.volume.Name);
      assert.ok(Date.parse(volume.CreatedAt) >= startedAt, 'Reset volume was not freshly created');
      const updated = { ...environment.supabase, container: replacement.Id, volume, volumes };
      const [context] = JSON.parse(command(['context', 'inspect', target.context]));
      const engine = JSON.parse(command(['info', '--format', '{{json .}}']));
      const [network] = JSON.parse(command(['network', 'inspect', target.network.Id]));
      validateTestResource(updated, {
        engine: engine.ID,
        endpoint: context.Endpoints.docker.Host,
        container: replacement,
        volume,
        volumes,
        network,
      });
      command(['update', '--cpus', '1', '--memory', '1g', '--memory-swap', '1g', replacement.Id]);
      environment.supabase = updated;
      environment.nativeContainers = environment.nativeContainers.map((item) =>
        item.id === target.container
          ? {
              id: replacement.Id,
              image: replacement.Image,
              created: replacement.Created,
              mounts: replacement.Mounts,
            }
          : item,
      );
      environment.nativeVolumes = environment.nativeVolumes.map(
        (item) => volumes.find((volume) => volume.Name === item.Name) ?? item,
      );
      environment.nativeResets = (environment.nativeResets ?? 0) + 1;
      writeFileSync(file, JSON.stringify(environment), { mode: 0o600 });
      testRuntime('supabase');
    }
    return result;
  } catch (error) {
    if (reset) {
      environment.failed = true;
      writeFileSync(file, JSON.stringify(environment), { mode: 0o600 });
    }
    throw new Error(
      'Native test operation failed; preserve the private run receipt and resources',
      { cause: error },
    );
  }
}

// Fresh execution reports never replace F011's hash-bound accepted records.
// Ordinary non-historical developer outputs remain writable as before.
export function testEvidenceDirectory(scope) {
  assert.match(scope, /^[a-z0-9][a-z0-9/-]*$/);
  assert.ok(scope.split('/').every((part) => part !== '..' && part !== '.'));
  const environment = readEnvironment();
  return path.join(environment.output, 'reports', ...scope.split('/'));
}
