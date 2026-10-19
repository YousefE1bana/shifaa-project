// One reusable PostgreSQL environment and one native Auth/Storage project per
// aggregate invocation. No machine-wide service, VM or existing volume is used.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, cpSync, lstatSync, statfsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {
  createPrivateOutput,
  dockerObservation,
  resourceInventory,
  resourceCommand,
} from './disposable-test-resources.mjs';
import { testRuntime } from './verification-database.mjs';

const rejectedPorts = new Set([5432, 54322, 55432]);
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  assert.ok(!rejectedPorts.has(port));
  return port;
}
const json = (bytes) => JSON.parse(bytes);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Injection is limited to OS boundaries so tests execute the real orchestration
// without creating containers, connecting databases or changing machine ACLs.
export async function createVerificationEnvironment(root, boundaries = {}) {
  const {
    command = resourceCommand,
    execute = execFileSync,
    observe = dockerObservation,
    inventory = resourceInventory,
    privateOutput = createPrivateOutput,
    validateRuntime = testRuntime,
    allocatePort = freePort,
    sleep = wait,
    freeMemory = os.freemem,
    diskSpace = statfsSync,
    temporaryRoot = os.tmpdir(),
    platform = process.platform,
  } = boundaries;
  assert.ok(
    ['win32', 'linux'].includes(platform),
    'Windows or Linux private-output support required',
  );
  let context;
  try {
    context = command('docker', ['context', 'show']);
  } catch {
    throw Object.assign(new Error('Docker context unavailable'), {
      verificationPrerequisite: 'DOCKER_ENGINE_UNAVAILABLE',
    });
  }
  const docker = (...args) => command('docker', ['--context', context, ...args], undefined, root);
  let observation, engine;
  try {
    observation = observe(context);
    engine = json(docker('info', '--format', '{{json .}}'));
  } catch {
    throw Object.assign(new Error('Docker engine unavailable'), {
      verificationPrerequisite: 'DOCKER_ENGINE_UNAVAILABLE',
    });
  }
  assert.equal(engine.OSType, 'linux', 'Linux Docker engine required');
  assert.ok(
    engine.MemTotal >= 5 * 1024 ** 3 && freeMemory() >= 3 * 1024 ** 3,
    'Insufficient available memory; stop other workloads first',
  );
  const disk = diskSpace(temporaryRoot);
  assert.ok(disk.bavail * disk.bsize >= 8 * 1024 ** 3, 'At least 8 GiB free output space required');
  let image;
  try {
    image = json(docker('image', 'inspect', 'shifaa/postgis:17-3.5-006-local'))[0];
  } catch {
    throw Object.assign(new Error('Approved local PostGIS image must be built first'), {
      verificationPrerequisite: 'POSTGIS_IMAGE_MISSING',
    });
  }
  assert.match(image.Id, /^sha256:[a-f0-9]{64}$/);
  // The immutable local image ID is captured before creation; no implicit pull,
  // mutable-tag fallback, existing container or automatic build is attempted.
  const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
  assert.equal(
    execute(process.execPath, [cli, '--version'], { encoding: 'utf8', windowsHide: true }).trim(),
    '2.113.0',
  );
  const before = inventory(context);
  assert.ok(
    !before.projects.some((project) =>
      /^(?:shifaa-verify-[a-f0-9]{32}(?:-native)?|sv-[a-f0-9]{32}-sb)$/.test(project),
    ),
    'An earlier verification run still owns resources; inspect its private receipt before another run',
  );
  const nonce = randomBytes(16).toString('hex');
  const project = `shifaa-verify-${nonce}`;
  const output = path.join(temporaryRoot, project);
  privateOutput({ path: output, nonce });
  const file = path.join(output, 'environment.json');
  const previousContext = process.env.SHIFAA_VERIFY_CONTEXT;
  let environment = {
    schema: 'SHIFAA-VERIFY-ENVIRONMENT/1',
    root,
    parentPid: process.pid,
    context,
    nonce,
    output,
    startedAt: Math.floor(Date.now() / 1000) * 1000,
  };
  const save = (first = false) =>
    writeFileSync(file, JSON.stringify(environment), { flag: first ? 'wx' : 'w', mode: 0o600 });
  save(true);
  process.env.SHIFAA_VERIFY_CONTEXT = file;
  const labels = [
    '--label',
    `com.docker.compose.project=${project}`,
    '--label',
    'com.docker.compose.service=postgres',
    '--label',
    `shifaa.verify.nonce=${nonce}`,
  ];
  const volumeName = project + '-data';
  const networkName = project + '-net';
  assert.ok(
    !before.projects.includes(project) &&
      !before.volumes.includes(volumeName) &&
      !before.networkNames.includes(networkName),
    'Resource collision',
  );
  // Only resources returned by successful exclusive creation are candidates for
  // later teardown. Partial/ambiguous startup preserves state and its receipt.
  try {
    assert.ok(
      !inventory(context).volumes.includes(volumeName),
      'Volume name appeared before creation',
    );
    docker('volume', 'create', ...labels, volumeName);
    const networkId = docker(
      'network',
      'create',
      ...labels,
      '--internal',
      '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      networkName,
    );
    const port = await allocatePort();
    const passwords = {
      shifaa_owner: randomBytes(24).toString('hex'),
      shifaa_api: 'synthetic_api_only',
      shifaa_worker: 'synthetic_worker_only',
    };
    const container = docker(
      'create',
      '--name',
      project + '-postgres',
      ...labels,
      '--network',
      networkId,
      '--cpus',
      '2',
      '--memory',
      '1g',
      '--memory-swap',
      '1g',
      '--pids-limit',
      '128',
      '--shm-size',
      '64m',
      '--log-driver',
      'local',
      '--log-opt',
      'max-size=10m',
      '--log-opt',
      'max-file=2',
      '-p',
      `127.0.0.1:${port}:5432`,
      '--mount',
      `type=volume,src=${volumeName},dst=/var/lib/postgresql/data`,
      '--mount',
      `type=bind,src=${root},dst=/workspace,readonly`,
      '-e',
      'POSTGRES_DB=shifaa',
      '-e',
      'POSTGRES_USER=shifaa_owner',
      '-e',
      `POSTGRES_PASSWORD=${passwords.shifaa_owner}`,
      image.Id,
    );
    environment.postgres = {
      nonce,
      project,
      container,
      image: image.Id,
      engine: observation.engine,
      endpoint: observation.endpoint,
      startedAt: environment.startedAt,
      before,
      port,
      sourceMount: root,
      passwords,
      volume: json(docker('volume', 'inspect', volumeName))[0],
      network: json(docker('network', 'inspect', networkId))[0],
    };
    const initial = json(docker('inspect', container))[0];
    environment.postgres.created = initial.Created;
    environment.postgres.mounts = initial.Mounts;
    save();
    // Independently inspect before start, then each destructive runner rechecks.
    validateRuntime('postgres');
    docker('start', container);
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        docker('exec', container, 'pg_isready', '-U', 'shifaa_owner', '-d', 'shifaa');
        ready = true;
        break;
      } catch {
        await sleep(500);
      }
    }
    assert.ok(ready, 'Disposable PostgreSQL startup timed out');
    // Native Supabase uses a separate fresh workdir/project, preserving official
    // Auth, Storage, Mailpit and reset behavior. Copy only public tracked inputs.
    const workdir = path.join(output, 'native');
    mkdirSync(workdir);
    // Supabase v2.113.0 truncates IDs above 40 characters. Keep all 128 nonce bits.
    const nativeProject = `sv-${nonce}-sb`;
    assert.ok(nativeProject.length <= 40);
    assert.ok(!inventory(context).projects.includes(nativeProject), 'Native project collision');
    const nativeNetwork = docker(
      'network',
      'create',
      ...labels,
      '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      nativeProject + '-net',
    );
    const tracked = execute('git', ['ls-files', '-z', 'supabase'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    for (const relative of tracked) {
      assert.ok(
        relative.startsWith('supabase/') && !relative.split('/').includes('..'),
        'Invalid native source path',
      );
      let cursor = path.join(root, relative);
      while (cursor !== root) {
        assert.ok(!lstatSync(cursor).isSymbolicLink(), 'Linked native source');
        cursor = path.dirname(cursor);
      }
      const destination = path.join(workdir, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(path.join(root, relative), destination);
    }
    let config = readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
    config = config.replace(/^project_id = "[^"]+"/m, `project_id = "${nativeProject}"`);
    // Every published native port is run-specific, not merely the SQL port.
    const assigned = new Set();
    const mappings = new Map();
    for (const match of config.matchAll(
      /^(?:port|shadow_port|smtp_port|pop3_port|imap_port|smtps_port|pop3s_port|imaps_port) = (\d+)$/gm,
    )) {
      let next;
      do {
        next = await allocatePort();
      } while (assigned.has(next));
      assigned.add(next);
      mappings.set(match[0], match[0].replace(/\d+$/, String(next)));
    }
    for (const [from, to] of mappings) config = config.replace(from, to);
    // Keep migrations disabled only at initial boot; existing verified native
    // reset/bootstrap subsequently applies the original migration chain.
    config = config.replace(/(\[db.pooler\][\s\S]*?enabled = )true/, '$1false');
    config = config
      .replace(/(\[db.migrations\][\s\S]*?enabled = )true/, '$1false')
      .replace(/(\[db.seed\][\s\S]*?enabled = )true/, '$1false');
    writeFileSync(path.join(workdir, 'supabase/config.toml'), config);
    const nativePort = Number(/\[db\][\s\S]*?^port = (\d+)/m.exec(config)?.[1]);
    execute(
      process.execPath,
      [
        cli,
        'start',
        '--workdir',
        workdir,
        '--network-id',
        nativeNetwork,
        '--exclude',
        'studio,postgres-meta,vector,logflare,supavisor,edge-runtime,imgproxy',
      ],
      {
        cwd: root,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) => !/^(DOCKER|COMPOSE|PG|DATABASE|SUPABASE_CLI_BINARY_OVERRIDE)/i.test(key),
            ),
          ),
          DOCKER_CONTEXT: context,
          DOCKER_HOST: observation.endpoint,
        },
        windowsHide: true,
        timeout: 300000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    config = config
      .replace(/(\[db.migrations\][\s\S]*?enabled = )false/, '$1true')
      .replace(/(\[db.seed\][\s\S]*?enabled = )false/, '$1true');
    writeFileSync(path.join(workdir, 'supabase/config.toml'), config);
    const ids = docker(
      'ps',
      '-aq',
      '--no-trunc',
      '--filter',
      `label=com.supabase.cli.project=${nativeProject}`,
    )
      .split(/\r?\n/)
      .filter(Boolean);
    assert.ok(ids.length > 0 && ids.every((id) => !before.containers.includes(id)));
    const containers = ids.map((id) => json(docker('inspect', id))[0]);
    const database = containers.find((item) => item.Name === `/supabase_db_${nativeProject}`);
    assert.ok(database, 'Native disposable database missing');
    const data = database.Mounts.find((mount) => mount.Destination === '/var/lib/postgresql/data');
    assert.ok(data?.Type === 'volume', 'Native data volume required');
    const nativeNetworkName = Object.keys(database.NetworkSettings.Networks)[0];
    assert.equal(
      database.NetworkSettings.Networks[nativeNetworkName].NetworkID,
      nativeNetwork,
      'Native network substitution',
    );
    environment.supabase = {
      nonce,
      project: nativeProject,
      container: database.Id,
      image: database.Image,
      engine: observation.engine,
      endpoint: observation.endpoint,
      startedAt: environment.startedAt,
      before,
      port: nativePort,
      workdir,
      configSha256: createHash('sha256').update(config).digest('hex'),
      servicePorts: [...assigned],
      passwords: {
        postgres: 'postgres',
        supabase_admin: 'postgres',
        shifaa_owner: 'synthetic_owner_only',
        shifaa_api: 'synthetic_api_only',
        shifaa_worker: 'synthetic_worker_only',
      },
      volume: json(docker('volume', 'inspect', data.Name))[0],
      volumes: database.Mounts.filter((mount) => mount.Type === 'volume').map(
        (mount) => json(docker('volume', 'inspect', mount.Name))[0],
      ),
      network: json(docker('network', 'inspect', nativeNetworkName))[0],
    };
    environment.nativeVolumes = [
      ...new Set(
        containers.flatMap((item) =>
          item.Mounts.filter((mount) => mount.Type === 'volume').map((mount) => mount.Name),
        ),
      ),
    ].map((name) => json(docker('volume', 'inspect', name))[0]);
    for (const volume of environment.nativeVolumes)
      assert.ok(!before.volumes.includes(volume.Name), 'Preexisting native volume');
    environment.nativeContainers = containers.map((item) => ({
      id: item.Id,
      image: item.Image,
      created: item.Created,
      mounts: item.Mounts,
    }));
    save();
    validateRuntime('supabase');
    for (const item of containers) {
      assert.equal(item.HostConfig.Privileged, false);
      assert.equal(item.Config.Labels['com.supabase.cli.project'], nativeProject);
      assert.ok(Date.parse(item.Created) >= environment.startedAt);
      assert.ok(!['host', 'none'].includes(item.HostConfig.NetworkMode));
      assert.deepEqual(
        Object.values(item.NetworkSettings.Networks).map((n) => n.NetworkID),
        [nativeNetwork],
      );
      for (const bindings of Object.values(item.NetworkSettings.Ports ?? {}))
        for (const binding of bindings ?? [])
          assert.ok(
            binding.HostIp === '127.0.0.1' && assigned.has(Number(binding.HostPort)),
            'Foreign native published port',
          );
      assert.ok(!before.containers.includes(item.Id));
      assert.ok(
        item.Mounts.every((mount) =>
          mount.Type === 'volume'
            ? !before.volumes.includes(mount.Name)
            : mount.Type === 'bind' && mount.Source.startsWith(workdir + path.sep),
        ),
        'Foreign native mount',
      );
      docker(
        'update',
        '--cpus',
        '1',
        '--memory',
        item.Id === database.Id ? '1g' : '256m',
        '--memory-swap',
        item.Id === database.Id ? '1g' : '256m',
        item.Id,
      );
    }
    return {
      get environment() {
        return environment;
      },
      file,
      async close() {
        const latest = json(readFileSync(file, 'utf8'));
        for (const key of ['nonce', 'context', 'root', 'parentPid', 'startedAt'])
          assert.equal(latest[key], environment[key], 'Run receipt substitution');
        assert.deepEqual(latest.postgres, environment.postgres, 'PostgreSQL receipt substitution');
        environment = latest;
        // A changed/foreign mount, ID, engine or attachment blocks cleanup. No
        // compose down, prune, wildcard removal or preexisting resource deletion.
        validateRuntime('postgres');
        validateRuntime('supabase');
        const current = environment.nativeContainers.map(
          (item) => json(docker('inspect', item.id))[0],
        );
        for (const [index, item] of current.entries()) {
          const previous = environment.nativeContainers[index];
          assert.equal(item.Image, previous.image);
          assert.equal(item.Created, previous.created);
          assert.deepEqual(item.Mounts, previous.mounts);
        }
        const ownedIds = new Set([
          environment.postgres.container,
          ...current.map((item) => item.Id),
        ]);
        const volumes = new Set([
          environment.postgres.volume.Name,
          ...current.flatMap((item) =>
            item.Mounts.filter((mount) => mount.Type === 'volume').map((mount) => mount.Name),
          ),
        ]);
        const networks = new Set([
          environment.postgres.network.Id,
          environment.supabase.network.Id,
        ]);
        for (const name of volumes) {
          assert.ok(!before.volumes.includes(name));
          const attached = docker('ps', '-aq', '--no-trunc', '--filter', `volume=${name}`)
            .split(/\r?\n/)
            .filter(Boolean);
          assert.ok(
            attached.every((id) => ownedIds.has(id)),
            'Foreign volume attachment; preserve resources',
          );
        }
        for (const id of networks)
          assert.ok(
            Object.keys(json(docker('network', 'inspect', id))[0].Containers ?? {}).every(
              (containerId) => ownedIds.has(containerId),
            ),
            'Foreign network attachment',
          );
        const volumeSnapshots = [environment.postgres.volume, ...environment.nativeVolumes];
        for (const id of ownedIds) {
          const observed = observe(context);
          assert.equal(observed.engine, observation.engine);
          assert.equal(observed.endpoint, observation.endpoint);
          const actual = json(docker('inspect', id))[0];
          const expected =
            id === environment.postgres.container
              ? {
                  id,
                  image: environment.postgres.image,
                  created: environment.postgres.created,
                  mounts: environment.postgres.mounts,
                }
              : environment.nativeContainers.find((item) => item.id === id);
          assert.equal(actual.Id, expected.id);
          assert.equal(actual.Image, expected.image);
          if (expected.created) assert.equal(actual.Created, expected.created);
          if (expected.mounts) assert.deepEqual(actual.Mounts, expected.mounts);
          docker('rm', '-f', id);
        }
        for (const name of volumes) {
          assert.deepEqual(observe(context), observation, 'Engine changed before volume teardown');
          assert.deepEqual(
            json(docker('volume', 'inspect', name))[0],
            volumeSnapshots.find((item) => item.Name === name),
            'Volume changed before teardown',
          );
          assert.equal(
            docker('ps', '-aq', '--no-trunc', '--filter', `volume=${name}`),
            '',
            'Volume remains attached',
          );
          docker('volume', 'rm', name);
        }
        for (const id of networks) {
          assert.deepEqual(observe(context), observation, 'Engine changed before network teardown');
          const actual = json(docker('network', 'inspect', id))[0];
          const expected = [environment.postgres.network, environment.supabase.network].find(
            (item) => item.Id === id,
          );
          const stable = ({ Containers: _containers, ...value }) => value;
          assert.deepEqual(stable(actual), stable(expected), 'Network changed before teardown');
          assert.equal(Object.keys(actual.Containers ?? {}).length, 0, 'Network remains attached');
          docker('network', 'rm', id);
        }
        environment.finished = true;
        save();
        if (previousContext === undefined) delete process.env.SHIFAA_VERIFY_CONTEXT;
        else process.env.SHIFAA_VERIFY_CONTEXT = previousContext;
      },
    };
  } catch (error) {
    environment.failed = true;
    save();
    if (previousContext === undefined) delete process.env.SHIFAA_VERIFY_CONTEXT;
    else process.env.SHIFAA_VERIFY_CONTEXT = previousContext;
    throw new Error(
      `Verification startup BLOCKED; preserve run ${nonce}. Private receipt: ${file}`,
      { cause: error },
    );
  }
}
