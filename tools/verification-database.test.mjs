import assert from 'node:assert/strict';
import test from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  validateTestResource,
  resolveTestDockerCommand,
  testRuntime,
  runTestSupabase,
  testResourceMounts,
} from './verification-database.mjs';

test('mount ordering is irrelevant but complete mount identity and mode remain mandatory', () => {
  const mounts = [
    { Type: 'volume', Name: 'run-volume', Destination: '/data', RW: true },
    { Type: 'bind', Source: '/run/workdir', Destination: '/config', RW: false },
  ];
  assert.deepEqual(testResourceMounts([...mounts].reverse()), testResourceMounts(mounts));
  for (const alteration of [
    { Name: 'shared-volume' },
    { RW: false },
    { Type: 'bind' },
    { Destination: '/foreign' },
  ]) {
    const changed = structuredClone(mounts);
    Object.assign(changed[0], alteration);
    assert.notDeepEqual(testResourceMounts(changed), testResourceMounts(mounts));
  }
  assert.throws(() => testResourceMounts([mounts[0], mounts[0]]));
});

export function resourceFixture() {
  const nonce = 'a'.repeat(32);
  const project = `shifaa-verify-${nonce}`;
  const volume = {
    Name: project + '-data',
    CreatedAt: '2026-10-19T00:00:01Z',
    Labels: { 'shifaa.verify.nonce': nonce },
  };
  const network = {
    Name: project + '-net',
    Id: 'c'.repeat(64),
    Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' },
  };
  const record = {
    nonce,
    project,
    container: 'b'.repeat(64),
    image: 'sha256:' + 'd'.repeat(64),
    engine: 'engine',
    endpoint: 'npipe:////./pipe/docker_engine',
    startedAt: Date.parse('2026-10-19T00:00:00Z'),
    port: 60001,
    before: {
      containers: ['old-container'],
      volumes: ['shared-volume'],
      networks: ['shared-network'],
    },
    volume,
    network,
    sourceMount: 'D:\\project',
  };
  const container = {
    Id: record.container,
    Image: record.image,
    Created: '2026-10-19T00:00:01Z',
    Config: { Labels: { 'com.docker.compose.project': project } },
    HostConfig: { Privileged: false, NetworkMode: network.Name, VolumesFrom: [] },
    State: { Running: true },
    NetworkSettings: {
      Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(record.port) }] },
      Networks: { [network.Name]: { NetworkID: network.Id } },
    },
    Mounts: [
      { Type: 'volume', Name: volume.Name, Destination: '/var/lib/postgresql/data' },
      { Type: 'bind', Source: record.sourceMount, Destination: '/workspace', RW: false },
    ],
  };
  return {
    record,
    observed: {
      engine: record.engine,
      endpoint: record.endpoint,
      container,
      volume: structuredClone(volume),
      network: structuredClone(network),
    },
  };
}

test('exact created resource is admitted and ordinary output writes do not invalidate it', () => {
  const { record, observed } = resourceFixture();
  assert.equal(validateTestResource(record, observed), record);
  record.ordinaryReportUpdated = true;
  assert.equal(validateTestResource(record, observed), record);
});

const attacks = {
  'shared PostgreSQL port': (f) => {
    f.record.port = 5432;
  },
  'native shared port': (f) => {
    f.record.port = 54322;
  },
  'old audit port': (f) => {
    f.record.port = 55432;
  },
  'different engine': (f) => {
    f.observed.engine = 'foreign';
  },
  'different endpoint': (f) => {
    f.observed.endpoint = 'tcp://foreign';
  },
  'different container ID': (f) => {
    f.observed.container.Id = 'e'.repeat(64);
  },
  'different image': (f) => {
    f.observed.container.Image = 'sha256:' + 'e'.repeat(64);
  },
  'existing container adoption': (f) => {
    f.record.before.containers.push(f.record.container);
  },
  'existing volume adoption': (f) => {
    f.record.before.volumes.push(f.record.volume.Name);
  },
  'existing network adoption': (f) => {
    f.record.before.networks.push(f.record.network.Id);
  },
  'old creation time': (f) => {
    f.observed.container.Created = '2020-01-01T00:00:00Z';
  },
  'inherited Compose label': (f) => {
    f.observed.container.Config.Labels['com.docker.compose.project'] = 'shifaa-local-postgres';
  },
  'cross-run project': (f) => {
    f.record.nonce = 'f'.repeat(32);
  },
  'privileged container': (f) => {
    f.observed.container.HostConfig.Privileged = true;
  },
  'host networking': (f) => {
    f.observed.container.HostConfig.NetworkMode = 'host';
  },
  'inherited volume': (f) => {
    f.observed.container.HostConfig.VolumesFrom.push('shared');
  },
  'external port exposure': (f) => {
    f.observed.container.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
  },
  'foreign mount': (f) => {
    f.observed.container.Mounts.push({ Type: 'volume', Name: 'shared-volume' });
  },
  'writable source bind': (f) => {
    f.observed.container.Mounts[1].RW = true;
  },
  'mount substitution': (f) => {
    f.observed.container.Mounts[1].Source = 'D:\\other';
  },
  'volume substitution': (f) => {
    f.observed.volume.CreatedAt = '2020-01-01T00:00:00Z';
  },
  'additional volume substitution': (f) => {
    f.observed.volumes = [{ Name: 'foreign' }];
  },
  'network substitution': (f) => {
    f.observed.network.Id = 'foreign';
  },
  'second network attachment': (f) => {
    f.observed.container.NetworkSettings.Networks.other = {};
  },
};
for (const [name, attack] of Object.entries(attacks))
  test(`deny ${name} before any SQL or Docker operation`, () => {
    const fixture = resourceFixture();
    attack(fixture);
    let operations = 0;
    assert.throws(() => {
      validateTestResource(fixture.record, fixture.observed);
      operations++;
    });
    assert.equal(operations, 0);
  });

test('Docker dispatcher retargets the actual positional target, never a coincidental SQL argument', () => {
  const selected = { context: 'verified', container: 'new-id' };
  const resolve = () => selected;
  assert.deepEqual(
    resolveTestDockerCommand(
      ['compose', 'exec', '-T', 'postgres', 'psql', '-d', 'shifaa'],
      resolve,
    ),
    ['--context', 'verified', 'exec', '-i', 'new-id', 'psql', '-d', 'shifaa'],
  );
  assert.deepEqual(
    resolveTestDockerCommand(
      ['exec', '-i', '-e', 'PGPASSWORD', 'shifaa-local-postgres-postgres-1', 'psql'],
      resolve,
    ),
    ['--context', 'verified', 'exec', '-i', '-e', 'PGPASSWORD', 'new-id', 'psql'],
  );
  for (const args of [
    ['compose', 'down', '-v'],
    ['volume', 'rm', 'shared'],
    ['exec', 'shared', 'echo', 'shifaa-local-postgres-postgres-1'],
    ['inspect', 'shifaa-local-postgres-postgres-1', 'foreign'],
    ['exec', '--privileged', 'shifaa-local-postgres-postgres-1', 'psql'],
  ])
    assert.throws(() => resolveTestDockerCommand(args, resolve));
});

test('missing receipt causes zero process and client activity, without a localhost fallback', (t) => {
  const previous = process.env.SHIFAA_VERIFY_CONTEXT;
  delete process.env.SHIFAA_VERIFY_CONTEXT;
  t.after(() => {
    if (previous === undefined) delete process.env.SHIFAA_VERIFY_CONTEXT;
    else process.env.SHIFAA_VERIFY_CONTEXT = previous;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  for (const method of ['execFileSync', 'spawnSync', 'spawn'])
    t.mock.method(childProcess, method, () => assert.fail('OS boundary reached'));
  syncBuiltinESMExports();
  assert.throws(() => testRuntime(), /no shared fallback/);
});

function nativeResetFixture(t, attack) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shifaa-reset-mock-'));
  fs.chmodSync(directory, 0o700);
  fs.mkdirSync(path.join(directory, 'supabase'));
  const config = 'mock private native config';
  fs.writeFileSync(path.join(directory, 'supabase/config.toml'), config);
  const f = resourceFixture();
  const target = f.record;
  target.project = `sv-${target.nonce}-sb`;
  target.workdir = directory;
  target.configSha256 = createHash('sha256').update(config).digest('hex');
  target.volumes = [target.volume];
  target.volume.CreatedAt = new Date().toISOString();
  f.observed.container.Config.Labels = { 'com.supabase.cli.project': target.project };
  const environment = {
    schema: 'SHIFAA-VERIFY-ENVIRONMENT/1',
    root: path.resolve(import.meta.dirname, '..'),
    parentPid: process.pid,
    nonce: target.nonce,
    startedAt: target.startedAt,
    context: 'mock',
    supabase: target,
    nativeContainers: [
      {
        id: target.container,
        image: target.image,
        created: f.observed.container.Created,
        mounts: f.observed.container.Mounts,
      },
    ],
    nativeVolumes: [target.volume],
  };
  const file = path.join(directory, 'environment.json');
  fs.writeFileSync(file, JSON.stringify(environment));
  const previous = process.env.SHIFAA_VERIFY_CONTEXT;
  process.env.SHIFAA_VERIFY_CONTEXT = file;
  const calls = [];
  let reset = false;
  t.after(() => {
    if (previous === undefined) delete process.env.SHIFAA_VERIFY_CONTEXT;
    else process.env.SHIFAA_VERIFY_CONTEXT = previous;
    t.mock.restoreAll();
    syncBuiltinESMExports();
    fs.rmSync(directory, { recursive: true });
  });
  t.mock.method(childProcess, 'execFileSync', (program, original) => {
    calls.push([program, original]);
    if (program === 'powershell.exe')
      return JSON.stringify({
        sid: 'S-1-5-21-123-1001',
        ownerSid: 'S-1-5-21-123-1001',
        protected: true,
        entries: [{ sid: 'S-1-5-21-123-1001', type: 'Allow', rights: 2 }],
      });
    if (program === process.execPath) {
      assert.ok(original.includes('--local'));
      assert.equal(original[original.indexOf('--workdir') + 1], directory);
      assert.equal(original[original.indexOf('--network-id') + 1], target.network.Id);
      reset = true;
      f.observed.container.Id = 'e'.repeat(64);
      f.observed.container.Created = new Date().toISOString();
      if (attack === 'replacement') f.observed.container.Image = 'sha256:' + 'f'.repeat(64);
      target.volume.CreatedAt = new Date().toISOString();
      return Buffer.from('mock reset');
    }
    assert.equal(program, 'docker');
    assert.equal(original[0], '--context');
    const args = original.slice(2);
    if (args[0] === 'context')
      return JSON.stringify([{ Endpoints: { docker: { Host: target.endpoint } } }]);
    if (args[0] === 'info') return JSON.stringify({ ID: target.engine });
    if (args[0] === 'inspect') return JSON.stringify([f.observed.container]);
    if (args[0] === 'volume') return JSON.stringify([target.volume]);
    if (args[0] === 'network') return JSON.stringify([target.network]);
    if (args[0] === 'ps')
      return attack === 'attachment' ? 'shared-container' : f.observed.container.Id;
    if (args[0] === 'update') {
      assert.ok(reset);
      return '';
    }
    assert.fail('Unexpected OS boundary');
  });
  syncBuiltinESMExports();
  return { file, calls };
}

test('actual guarded native reset verifies its recreated identities and updates the private run receipt', (t) => {
  const f = nativeResetFixture(t);
  runTestSupabase(['db', 'reset', '--local']);
  const updated = JSON.parse(fs.readFileSync(f.file));
  assert.equal(updated.supabase.container, 'e'.repeat(64));
  assert.equal(updated.nativeContainers[0].id, updated.supabase.container);
  assert.equal(updated.nativeResets, 1);
  assert.equal(updated.failed, undefined);
});
test('foreign volume attachment rejects native reset before invoking the CLI', (t) => {
  const f = nativeResetFixture(t, 'attachment');
  assert.throws(() => runTestSupabase(['db', 'reset', '--local']), /Foreign attachment/);
  assert.equal(f.calls.filter(([program]) => program === process.execPath).length, 0);
});
test('native reset replacement substitution preserves failed receipt and cannot permit later use', (t) => {
  const f = nativeResetFixture(t, 'replacement');
  assert.throws(() => runTestSupabase(['db', 'reset', '--local']), /preserve/);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).failed, true);
  assert.throws(() => testRuntime('supabase'), /finished or failed/);
});

for (const state of ['created', 'foreign-config', 'foreign-attachment', 'running-empty'])
  test(`network admission distinguishes Docker create/start: ${state}`, () => {
    const { record, observed } = resourceFixture();
    const c = observed.container;
    c.State.Running = state === 'running-empty';
    c.HostConfig.NetworkMode = state === 'foreign-config' ? 'foreign' : record.network.Id;
    c.HostConfig.PortBindings = structuredClone(c.NetworkSettings.Ports);
    c.NetworkSettings.Networks[record.network.Name].NetworkID =
      state === 'foreign-attachment' ? 'foreign' : '';
    if (state === 'created') assert.equal(validateTestResource(record, observed), record);
    else assert.throws(() => validateTestResource(record, observed));
  });
