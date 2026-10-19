import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVerificationEnvironment } from './verification-test-environment.mjs';
import { validateTestResource } from './verification-database.mjs';

// Exercise the real creation, configuration and teardown algorithm. Only OS
// edges are mocked: none of these tests executes Docker, PostgreSQL or the CLI.
function fixture(t, attack = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'shifaa-verify-mock-'));
  const root = path.join(temporary, 'repository');
  fs.mkdirSync(path.join(root, 'supabase'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'supabase/config.toml'),
    'project_id = "shifaa-local-supabase"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[db.pooler]\nenabled = true\nport = 54329\n[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n',
  );
  const previous = process.env.SHIFAA_VERIFY_CONTEXT;
  t.after(() => {
    if (previous === undefined) delete process.env.SHIFAA_VERIFY_CONTEXT;
    else process.env.SHIFAA_VERIFY_CONTEXT = previous;
    assert.ok(temporary.startsWith(path.join(os.tmpdir(), 'shifaa-verify-mock-')));
    fs.rmSync(temporary, { recursive: true });
  });
  const calls = [],
    containers = new Map(),
    volumes = new Map(),
    networks = new Map();
  const existing = {
    containers: ['shared-container'],
    volumes: ['shared-volume'],
    networks: ['shared-network'],
    networkNames: ['shared-network'],
    projects: ['shifaa-local-postgres'],
  };
  const image = 'sha256:' + 'd'.repeat(64);
  let counter = 0,
    port = 60000,
    nativeStarts = 0,
    changedEngine = false,
    foreignAttachment = false;
  const id = () => (++counter).toString(16).padStart(64, '0');
  const labelArgs = (args) =>
    Object.fromEntries(
      args.flatMap((value, index) => (value === '--label' ? [args[index + 1].split('=')] : [])),
    );
  const value = (args, key) => args[args.indexOf(key) + 1];
  const makeVolume = (name, labels) => {
    const v = { Name: name, Labels: labels, CreatedAt: new Date().toISOString() };
    volumes.set(name, v);
    return v;
  };
  function makeContainer(name, imageId, networkId, publishedPort, data, labels, mounts = []) {
    const network = networks.get(networkId);
    const container = {
      Id: id(),
      Image: imageId,
      Name: '/' + name,
      Created: new Date().toISOString(),
      Config: { Labels: labels },
      HostConfig: {
        Privileged: false,
        NetworkMode: networkId,
        VolumesFrom: [],
        PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(publishedPort) }] },
      },
      State: { Running: true },
      NetworkSettings: {
        Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(publishedPort) }] },
        Networks: { [network.Name]: { NetworkID: networkId } },
      },
      Mounts: [
        { Type: 'volume', Name: data.Name, Destination: '/var/lib/postgresql/data' },
        ...mounts,
      ],
    };
    containers.set(container.Id, container);
    network.Containers[container.Id] = {};
    return container;
  }
  const observation = () => ({
    engine: changedEngine ? 'foreign-engine' : 'engine',
    endpoint: 'unix:///mock-engine',
    context: 'mock',
  });
  function command(program, original) {
    assert.equal(program, 'docker');
    const args = original[0] === '--context' ? original.slice(2) : original;
    calls.push([...args]);
    if (attack.command) attack.command(args);
    if (args[0] === 'context' && args[1] === 'show') return 'mock';
    if (args[0] === 'info')
      return JSON.stringify({ ID: 'engine', OSType: 'linux', MemTotal: 8 * 1024 ** 3 });
    if (args[0] === 'image') {
      if (attack.image) throw Error('missing image');
      return JSON.stringify([{ Id: image }]);
    }
    if (args[0] === 'volume' && args[1] === 'create') {
      const name = args.at(-1);
      assert.ok(!volumes.has(name));
      makeVolume(name, labelArgs(args));
      return name;
    }
    if (args[0] === 'volume' && args[1] === 'inspect')
      return JSON.stringify([volumes.get(args[2])]);
    if (args[0] === 'network' && args[1] === 'create') {
      const network = {
        Name: args.at(-1),
        Id: id(),
        Labels: labelArgs(args),
        Internal: args.includes('--internal'),
        Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' },
        Containers: {},
      };
      networks.set(network.Id, network);
      return network.Id;
    }
    if (args[0] === 'network' && args[1] === 'inspect')
      return JSON.stringify([
        networks.get(args[2]) ?? [...networks.values()].find((n) => n.Name === args[2]),
      ]);
    if (args[0] === 'create') {
      const volume = volumes.get(args[args.indexOf('--mount') + 1].match(/src=([^,]+)/)[1]);
      const container = makeContainer(
        value(args, '--name'),
        args.at(-1),
        value(args, '--network'),
        Number(value(args, '-p').split(':')[1]),
        volume,
        labelArgs(args),
        [{ Type: 'bind', Source: root, Destination: '/workspace', RW: false }],
      );
      container.State.Running = false;
      container.HostConfig.PortBindings = structuredClone(container.NetworkSettings.Ports);
      Object.values(container.NetworkSettings.Networks)[0].NetworkID = '';
      return container.Id;
    }
    if (args[0] === 'inspect') return JSON.stringify([containers.get(args[1])]);
    if (args[0] === 'start') {
      const c = containers.get(args[1]);
      c.State.Running = true;
      Object.values(c.NetworkSettings.Networks)[0].NetworkID = c.HostConfig.NetworkMode;
      // Docker internal bridges do not program external port connectivity.
      // Model the real runtime observation, not just the requested bindings.
      if (networks.get(c.HostConfig.NetworkMode).Internal) c.NetworkSettings.Ports = {};
      return '';
    }
    if (args[0] === 'exec' || args[0] === 'update') return '';
    if (args[0] === 'ps') {
      const filter = value(args, '--filter');
      if (filter.startsWith('volume='))
        return [...containers.values()]
          .filter((c) => c.Mounts.some((m) => m.Name === filter.slice(7)))
          .map((c) => c.Id)
          .concat(foreignAttachment ? ['shared-container'] : [])
          .join('\n');
      return [...containers.values()]
        .filter((c) => c.Config.Labels['com.supabase.cli.project'] === filter.split('=')[2])
        .map((c) => c.Id)
        .join('\n');
    }
    if (args[0] === 'rm') {
      assert.ok(containers.has(args[2]));
      containers.delete(args[2]);
      for (const n of networks.values()) delete n.Containers[args[2]];
      return '';
    }
    if (args[0] === 'volume' && args[1] === 'rm') {
      assert.ok(volumes.has(args[2]));
      volumes.delete(args[2]);
      return '';
    }
    if (args[0] === 'network' && args[1] === 'rm') {
      assert.ok(networks.has(args[2]));
      networks.delete(args[2]);
      return '';
    }
    assert.fail('unexpected command: ' + args.join(' '));
  }
  function execute(program, args, options) {
    if (program === 'git') {
      assert.deepEqual(args, ['ls-files', '-z', 'supabase']);
      return 'supabase/config.toml\0';
    }
    assert.equal(program, process.execPath);
    if (args.includes('--version')) return '2.113.0\n';
    nativeStarts++;
    assert.ok(args.includes('--network-id'));
    assert.equal(options.env.DOCKER_HOST, 'unix:///mock-engine');
    assert.equal(options.env.SUPABASE_CLI_BINARY_OVERRIDE, undefined);
    for (const key of ['SUPABASE_DB_PORT', 'SUPABASE_API_PORT', 'SUPABASE_PROJECT_ID'])
      assert.equal(
        options.env[key],
        undefined,
        'Ambient CLI targets must not override private config',
      );
    const workdir = value(args, '--workdir');
    assert.ok(workdir.startsWith(temporary) && workdir !== root);
    const config = fs.readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
    assert.match(config, /\[db.migrations\]\nenabled = false/);
    assert.match(config, /\[db.pooler\]\nenabled = false/);
    if (attack.nativeFailure) throw Error('SECRET partial startup failed');
    const configuredProject = /project_id = "([^"]+)"/.exec(config)[1];
    // Match official CLI sanitization, not a mock that accepts overlong IDs.
    const project = configuredProject.slice(0, 40);
    assert.equal(configuredProject, project);
    assert.match(project, /^sv-[a-f0-9]{32}-sb$/);
    const port = Number(/\[db\]\nport = (\d+)/.exec(config)[1]);
    const volume = makeVolume(project + '-db', { 'com.supabase.cli.project': project });
    const c = makeContainer(
      'supabase_db_' + project,
      image,
      value(args, '--network-id'),
      port,
      volume,
      { 'com.supabase.cli.project': project, 'com.supabase.cli.workdir': workdir },
    );
    const configuration = makeVolume(project + '-config', { 'com.supabase.cli.project': project });
    c.Mounts.push({
      Type: 'volume',
      Name: configuration.Name,
      Destination: '/etc/postgresql-custom',
    });
    attack.nativeContainer?.(c);
    const mailpitPort = Number(/\[local_smtp\]\nenabled = true\nport = (\d+)/.exec(config)?.[1]);
    assert.ok(mailpitPort > 55432, 'Implicit Mailpit port must be allocated explicitly');
    const mail = makeContainer(
      'supabase_inbucket_' + project,
      image,
      value(args, '--network-id'),
      mailpitPort,
      volume,
      { 'com.supabase.cli.project': project },
    );
    attack.mailpitContainer?.(mail);
    return '';
  }
  const boundaries = {
    command,
    execute,
    observe: observation,
    inventory: () => structuredClone(existing),
    temporaryRoot: temporary,
    platform: 'linux',
    freeMemory: () => (attack.memory ? 0 : 8 * 1024 ** 3),
    diskSpace: () => ({ bavail: 32 * 1024, bsize: 1024 ** 2 }),
    sleep: async () => {},
    allocatePort: async () => ++port,
    privateOutput: ({ path: output }) => {
      if (attack.output) throw Error('preexisting output');
      fs.mkdirSync(output, { mode: 0o700 });
    },
    validateRuntime: (runtime) => {
      const env = JSON.parse(fs.readFileSync(process.env.SHIFAA_VERIFY_CONTEXT));
      const record = env[runtime];
      const container = containers.get(record.container);
      validateTestResource(record, {
        ...observation(),
        container,
        volume: volumes.get(record.volume.Name),
        volumes: (record.volumes ?? [record.volume]).map((v) => volumes.get(v.Name)),
        network: networks.get(record.network.Id),
      });
    },
  };
  return {
    root,
    boundaries,
    calls,
    containers,
    volumes,
    networks,
    nativeStarts: () => nativeStarts,
    loseEngine: () => {
      changedEngine = true;
    },
    foreignAttachment: () => {
      foreignAttachment = true;
    },
  };
}

test('actual orchestration creates one reusable pair, then deletes only those exact identities', async (t) => {
  const f = fixture(t);
  const run = await createVerificationEnvironment(f.root, f.boundaries);
  assert.equal(f.nativeStarts(), 1);
  assert.equal(f.containers.size, 3);
  // Include multiple real-looking native mounts and change only enumeration
  // order across inspect calls, as Docker's daemon map is allowed to do.
  for (const c of f.containers.values()) c.Mounts.reverse();
  assert.equal(f.calls.filter((args) => args[0] === 'create').length, 1);
  assert.ok(f.calls.find((args) => args[0] === 'create').includes('--memory'));
  await run.close();
  assert.equal(f.containers.size + f.volumes.size + f.networks.size, 0);
  assert.equal(run.environment.finished, true);
  assert.ok(
    f.calls
      .filter((args) => ['rm', 'down', 'prune'].includes(args[0]))
      .every((args) => args[0] === 'rm' && args[2] !== 'shared-container'),
  );
});

test('Docker 29 live network counters may change through identity-checked teardown', async (t) => {
  const f = fixture(t);
  const run = await createVerificationEnvironment(f.root, f.boundaries);
  for (const [id, network] of f.networks) {
    const recorded = [run.environment.postgres.network, run.environment.supabase.network].find(
      (n) => n.Id === id,
    );
    const status = {
      IPAM: { Subnets: { '172.21.0.0/16': { IPsInUse: 4, DynamicIPsAvailable: 65532 } } },
    };
    recorded.Status = structuredClone(status);
    network.Status = structuredClone(status);
    network.Status.IPAM.Subnets['172.21.0.0/16'].IPsInUse--;
    network.Status.IPAM.Subnets['172.21.0.0/16'].DynamicIPsAvailable++;
  }
  // The private receipt retains the creation record, rather than live counters.
  fs.writeFileSync(run.file, JSON.stringify(run.environment));
  await run.close();
  assert.equal(f.containers.size + f.volumes.size + f.networks.size, 0);
});

test('ambient Supabase shared-target overrides cannot escape the private configuration', async (t) => {
  const keys = ['SUPABASE_DB_PORT', 'SUPABASE_API_PORT', 'SUPABASE_PROJECT_ID'];
  const before = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    }),
  );
  for (const key of keys) process.env[key] = key.endsWith('ID') ? 'shifaa-local-supabase' : '5432';
  const f = fixture(t);
  const run = await createVerificationEnvironment(f.root, f.boundaries);
  await run.close();
});
for (const reason of ['image', 'memory', 'output'])
  test(`missing ${reason} prevents resource creation`, async (t) => {
    const f = fixture(t, { [reason]: true });
    await assert.rejects(createVerificationEnvironment(f.root, f.boundaries));
    assert.equal(
      f.calls.filter(
        (args) =>
          ['create', 'start', 'rm', 'volume', 'network'].includes(args[0]) && args[1] !== 'inspect',
      ).length,
      0,
    );
    assert.equal(f.nativeStarts(), 0);
  });
test('partial native startup preserves all resources and redacts raw errors', async (t) => {
  const f = fixture(t, { nativeFailure: true });
  await assert.rejects(createVerificationEnvironment(f.root, f.boundaries), (error) => {
    assert.doesNotMatch(error.message, /SECRET/);
    return /BLOCKED/.test(error.message);
  });
  assert.ok(f.containers.size > 0);
  assert.equal(f.calls.filter((args) => args[0] === 'rm').length, 0);
});
for (const [name, attack] of Object.entries({
  'shared volume': (c) => {
    c.Mounts[0].Name = 'shared-volume';
  },
  'host networking': (c) => {
    c.HostConfig.NetworkMode = 'host';
  },
  'exposed port': (c) => {
    c.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
  },
  'network substitution': (c) => {
    Object.values(c.NetworkSettings.Networks)[0].NetworkID = 'foreign';
  },
}))
  test(`native ${name} is rejected without guessed cleanup`, async (t) => {
    const f = fixture(t, { nativeContainer: attack });
    await assert.rejects(createVerificationEnvironment(f.root, f.boundaries), (error) => {
      if (name === 'exposed port')
        assert.equal(error.verificationPrerequisite, 'NATIVE_LOOPBACK_BINDING_REQUIRED');
      return /BLOCKED/.test(error.message);
    });
    assert.equal(f.calls.filter((args) => args[0] === 'rm').length, 0);
  });
for (const loss of ['loseEngine', 'foreignAttachment'])
  test(`${loss} blocks teardown before deletion`, async (t) => {
    const f = fixture(t);
    const run = await createVerificationEnvironment(f.root, f.boundaries);
    f[loss]();
    await assert.rejects(run.close());
    assert.equal(f.calls.filter((args) => args[0] === 'rm').length, 0);
    assert.equal(f.containers.size, 3);
  });

for (const [name, mutate] of Object.entries({
  'default unallocated port': (c) => {
    c.NetworkSettings.Ports['5432/tcp'][0].HostPort = '54324';
  },
  'public interface': (c) => {
    c.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
  },
}))
  test(`Mailpit ${name} is rejected without cleanup`, async (t) => {
    const f = fixture(t, { mailpitContainer: mutate });
    await assert.rejects(createVerificationEnvironment(f.root, f.boundaries));
    assert.equal(f.calls.filter((args) => args[0] === 'rm').length, 0);
  });
