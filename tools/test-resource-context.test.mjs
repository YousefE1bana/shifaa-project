import assert from 'node:assert/strict';
import path from 'node:path';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  beginTestRun,
  verifyTestResourceContext,
  connectTestOwner,
  withTestResource,
  guardTestHandle,
  assertRunOwned,
  registerRunRecord,
  releaseTestResourceContext,
  revalidateTestResourceContext,
  withTestOutputCreation,
} from './test-resource-context.mjs';

// OS/Docker/filesystem and database boundaries are mocked. No shell, socket,
// PostgreSQL, container lifecycle, seed, migration or fixture execution occurs.
const revision = 'cbda0ac4e5b04d35b45273c76861366b60c8a72d';
const mockFiles = [
  'fixture.ts',
  'tools/test-resource-context.mjs',
  'tools/test-resource-context.test.mjs',
  'tests/e2e/test-resource-context.test.ts',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = hash(
  mockFiles
    .toSorted()
    .map((file) => `${file}\0${hash('mocked approved source')}\n`)
    .join(''),
);
const record = '10000000-0000-4000-8000-000000000001';
export function fixture(t, scope = 'discovery-sos') {
  const worktree = process.cwd();
  const outputParent = path.resolve(tmpdir());
  const acl = (canonical, absent) => ({
    canonical,
    absent,
    sid: 'S-1-5-21-123-456-789-1001',
    ownerSid: 'S-1-5-21-123-456-789-1001',
    protected: true,
    entries: [
      { sid: 'S-1-5-21-123-456-789-1001', type: 'Allow', rights: 2 },
      { sid: 'S-1-5-18', type: 'Allow', rights: 2 },
    ],
  });
  const before = {
    revision,
    source,
    context: 'mocked-dedicated-engine',
    engine: 'mocked-engine-id',
    endpoint: 'mocked-docker-endpoint',
    containers: ['d'.repeat(64)],
    volumes: ['existing-shared-volume'],
    output: acl(outputParent, false),
  };
  let current;
  const observations = { docker: 0, git: 0, powershell: 0, sourceReads: 0, otherReads: 0 };
  const read = fs.readFileSync;
  const stat = fs.lstatSync;
  const realpath = fs.realpathSync.native;
  const exists = fs.existsSync;
  t.mock.method(childProcess, 'execFileSync', (executable, args) => {
    if (executable === 'git') observations.git++;
    if (executable === 'docker') observations.docker++;
    if (executable === 'powershell.exe') observations.powershell++;
    if (executable === 'git') {
      if (args.includes('rev-parse')) return current?.revision ?? before.revision;
      if (args.includes('ls-files')) return 'fixture.ts\0';
    }
    if (executable === 'powershell.exe') return JSON.stringify(current?.output ?? before.output);
    if (executable === 'docker') {
      if (args[0] === 'context' && args[1] === 'inspect')
        return JSON.stringify([
          { Endpoints: { docker: { Host: current?.endpoint ?? before.endpoint } } },
        ]);
      if (args[0] === 'context') return current?.context ?? before.context;
      if (args.includes('info')) return JSON.stringify({ ID: current?.engine ?? before.engine });
      if (args.includes('ps')) return before.containers.join('\n');
      if (args.includes('volume') && args.includes('ls')) return before.volumes.join('\n');
      if (args.includes('volume') && args.includes('inspect'))
        return JSON.stringify(current.volumeMetadata);
      if (args.includes('inspect')) return JSON.stringify([current.container]);
    }
    throw new Error('Forbidden unmocked child process: ' + executable);
  });
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    if (mockFiles.some((name) => path.resolve(String(file)) === path.resolve(worktree, name))) {
      observations.sourceReads++;
      return Buffer.from(
        current && current.source !== source
          ? 'changed protected source'
          : 'mocked approved source',
      );
    }
    observations.otherReads++;
    return read(file, ...args);
  });
  t.mock.method(fs, 'lstatSync', (file, ...args) => {
    if (current?.replacedParent && String(file) === outputParent) {
      const replaced = stat(file, ...args);
      replaced.ino += 1n;
      return replaced;
    }
    if (current && String(file) === current.expectedOutput) {
      if (current.output.absent === false)
        return {
          isSymbolicLink: () => current.output.symlink === true,
          isDirectory: () => current.output.regularFile !== true,
          dev: BigInt(current.output.identity?.dev ?? '1'),
          ino: BigInt(current.output.identity?.ino ?? '12345'),
          birthtimeNs: BigInt(current.output.identity?.birthtimeNs ?? '1'),
        };
      if (current.output.canonical !== current.expectedOutput)
        return { isSymbolicLink: () => true };
    }
    return stat(file, ...args);
  });
  t.mock.method(fs, 'existsSync', (file) =>
    current?.output.repository && String(file) === path.join(current.expectedOutput, '.git')
      ? true
      : exists(file),
  );
  t.mock.method(fs.realpathSync, 'native', (file) =>
    current?.output.absent === false && String(file) === current.expectedOutput
      ? current.output.canonical
      : current?.junction && String(file) === outputParent
        ? path.join(outputParent, 'redirected')
        : realpath(file),
  );
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    Object.defineProperty(process, 'platform', platform);
    syncBuiltinESMExports();
  });
  const { authority, nonce } = beginTestRun({
    worktree,
    revision,
    sourceDigest: source,
    docker: {
      context: before.context,
      engine: before.engine,
      endpoint: before.endpoint,
      image: `sha256:${'c'.repeat(64)}`,
    },
    scope,
    outputParent,
    approval: 'MOCK_ONLY: 2026-10-16 P0 code-only regressions; no real resource authorization',
  });
  const project = `shifaa-test-${nonce}`;
  const labels = {
    'com.docker.compose.project': project,
    'com.docker.compose.service': 'postgres',
    'shifaa.test.nonce': nonce,
  };
  const volume = {
    Name: `test-${nonce}`,
    Driver: 'local',
    Scope: 'local',
    Options: null,
    Mountpoint: `/mock/${nonce}`,
    CreatedAt: new Date().toISOString(),
    Labels: labels,
  };
  const mounts = [
    {
      Type: 'volume',
      Name: volume.Name,
      Source: volume.Mountpoint,
      Destination: '/var/lib/postgresql/data',
      RW: true,
    },
  ];
  const manifest = {
    version: 1,
    nonce,
    scope,
    revision,
    worktree,
    context: before.context,
    engine: before.engine,
    container: 'b'.repeat(64),
    image: `sha256:${'c'.repeat(64)}`,
    host: '127.0.0.1',
    port: 65433,
    database: `test_${nonce}`,
    output: path.join(outputParent, nonce),
    mounts,
    volumes: [volume],
    urls: Object.fromEntries(
      ['owner', 'api', 'worker'].map((role) => [
        role,
        `postgresql://shifaa_${role}:mock-only@127.0.0.1:65433/test_${nonce}`,
      ]),
    ),
    bootstrap: {
      nonce,
      sourceDigest: source,
      exclusiveDatabase: true,
      records: [`incident:${record}`],
    },
  };
  current = {
    ...before,
    expectedOutput: manifest.output,
    output: acl(manifest.output, true),
    container: {
      Id: manifest.container,
      Name: `/test-${nonce}`,
      Image: manifest.image,
      Created: new Date().toISOString(),
      State: { Running: true },
      Config: { Labels: labels },
      HostConfig: { NetworkMode: project, Privileged: false },
      Mounts: mounts,
      NetworkSettings: {
        Ports: { '5432/tcp': [{ HostIp: manifest.host, HostPort: String(manifest.port) }] },
      },
    },
    volumeMetadata: [volume],
  };
  const effects = { clients: 0, mutations: 0, dockerLifecycle: 0, reads: 0, closes: 0 };
  const urls = [];
  const queries = [];
  const sql = (strings, ...values) => {
    queries.push({ text: strings.join('?'), values });
    if (/\b(insert|update|delete|alter|truncate|drop)\b/i.test(strings.join('')))
      effects.mutations++;
    else effects.reads++;
    if (strings.join('').includes('current_database()'))
      return Promise.resolve([{ database: manifest.database, nonce, source }]);
    if (strings.join('').includes('count(*)')) return Promise.resolve([{ count: 0 }]);
    if (strings.join('').includes('deliver_local_synthetic_message'))
      return Promise.resolve([{ receipt: 'mocked-durable-receipt' }]);
    return Promise.resolve([]);
  };
  sql.end = async () => {
    effects.closes++;
  };
  sql.begin = async (callback) => callback(sql);
  sql.json = (value) => value;
  sql.unsafe = async () => {
    effects.mutations++;
  };
  const factory = (url) => {
    effects.clients++;
    urls.push(url);
    return sql;
  };
  const measure = async (operation) => {
    const before = { ...observations };
    const value = await operation();
    const costs = Object.fromEntries(
      Object.entries(observations).map(([key, count]) => [key, count - before[key]]),
    );
    return { value, costs };
  };
  const createdOutput = () => {
    current.output.absent = false;
    current.output.identity = {
      dev: '1',
      ino: '12345',
      birthtimeNs: String(BigInt(Date.now()) * 1_000_000n),
    };
    return {
      path: manifest.output,
      nonce,
      exclusive: true,
      identity: structuredClone(current.output.identity),
    };
  };
  return {
    authority,
    nonce,
    before,
    manifest,
    current,
    effects,
    sql,
    factory,
    urls,
    queries,
    measure,
    createdOutput,
  };
}

const denials = [
  [
    'forged run nonce',
    (f) => {
      f.manifest.nonce = 'forged';
    },
  ],
  [
    'missing container',
    (f) => {
      delete f.manifest.container;
    },
  ],
  [
    'incorrect container',
    (f) => {
      f.current.container.Id = 'e'.repeat(64);
    },
  ],
  [
    'existing container',
    (f) => {
      f.manifest.container = f.before.containers[0];
      f.current.container.Id = f.manifest.container;
    },
  ],
  ...[5432, 54322, 55432].map((port) => [
    `shared port ${port}`,
    (f) => {
      f.manifest.port = port;
      f.current.container.NetworkSettings.Ports['5432/tcp'][0].HostPort = String(port);
    },
  ]),
  [
    'IPv6 loopback alias',
    (f) => {
      f.manifest.urls.api = f.manifest.urls.api.replace('127.0.0.1', '[::1]');
    },
  ],
  [
    'integer host alias',
    (f) => {
      f.manifest.urls.api = f.manifest.urls.api.replace('127.0.0.1', '2130706433');
    },
  ],
  [
    'percent encoded host alias',
    (f) => {
      f.manifest.urls.api = f.manifest.urls.api.replace('127.0.0.1', '%31%32%37.0.0.1');
    },
  ],
  [
    'hostname alias',
    (f) => {
      f.manifest.urls.api = f.manifest.urls.api.replace('127.0.0.1', 'localhost');
    },
  ],
  [
    'alternate loopback',
    (f) => {
      f.manifest.host = '127.0.0.2';
    },
  ],
  [
    'URL target substitution',
    (f) => {
      f.manifest.urls.worker = f.manifest.urls.worker.replace('65433', '5432');
    },
  ],
  [
    'inherited Compose labels',
    (f) => {
      f.current.container.Config.Labels['com.docker.compose.project'] = 'shifaa-local';
    },
  ],
  [
    'wrong service',
    (f) => {
      f.current.container.Config.Labels['com.docker.compose.service'] = 'other';
    },
  ],
  [
    'missing ownership label',
    (f) => {
      delete f.current.container.Config.Labels['shifaa.test.nonce'];
    },
  ],
  [
    'shared volume',
    (f) => {
      f.manifest.volumes[0].Name = f.before.volumes[0];
      f.manifest.mounts[0].Name = f.before.volumes[0];
    },
  ],
  [
    'remote or bind-backed volume',
    (f) => {
      f.manifest.volumes[0].Options = { device: '/shared', type: 'none', o: 'bind' };
    },
  ],
  [
    'nonlocal volume driver',
    (f) => {
      f.manifest.volumes[0].Driver = 'remote';
    },
  ],
  [
    'unknown mount',
    (f) => {
      f.current.container.Mounts.push({ Type: 'bind', Source: '/shared' });
    },
  ],
  [
    'unverified Docker context',
    (f) => {
      f.current.context = 'different-engine';
    },
  ],
  [
    'engine endpoint substitution',
    (f) => {
      f.current.endpoint = 'remote-unapproved';
    },
  ],
  [
    'engine substitution',
    (f) => {
      f.current.engine = 'different-engine-id';
    },
  ],
  [
    'wrong image',
    (f) => {
      f.current.container.Image = `sha256:${'e'.repeat(64)}`;
    },
  ],
  [
    'wrong revision',
    (f) => {
      f.current.revision = '0'.repeat(40);
    },
  ],
  [
    'protected F011/PR496/PR497 source drift',
    (f) => {
      f.current.source = 'f'.repeat(64);
    },
  ],
  [
    'junction ancestor',
    (f) => {
      f.current.junction = true;
    },
  ],
  [
    'shared container name',
    (f) => {
      f.current.container.Name = '/shifaa-local-postgres-postgres-1';
    },
  ],
  [
    'privileged container',
    (f) => {
      f.current.container.HostConfig.Privileged = true;
    },
  ],
  [
    'host networking',
    (f) => {
      f.current.container.HostConfig.NetworkMode = 'host';
    },
  ],
  [
    'inherited volumes',
    (f) => {
      f.current.container.HostConfig.VolumesFrom = ['shared'];
    },
  ],
  [
    'stopped container',
    (f) => {
      f.current.container.State.Running = false;
    },
  ],
  [
    'preexisting volume timestamp',
    (f) => {
      f.manifest.volumes[0].CreatedAt = '2020-01-01T00:00:00Z';
    },
  ],
  [
    'database identity substitution',
    (f) => {
      f.manifest.database = 'shifaa';
    },
  ],
  [
    'duplicate bootstrap records',
    (f) => {
      f.manifest.bootstrap.records.push(f.manifest.bootstrap.records[0]);
    },
  ],
  [
    'preexisting output',
    (f) => {
      f.current.output.absent = false;
    },
  ],
  [
    'reparse/canonical output mismatch',
    (f) => {
      f.current.output.canonical = path.join(f.manifest.output, 'junction');
    },
  ],
  [
    'public output ACL',
    (f) => {
      f.current.output.entries.push({ sid: 'S-1-1-0', type: 'Allow', rights: 2 });
    },
  ],
  [
    'unprotected inherited ACL',
    (f) => {
      f.current.output.protected = false;
    },
  ],
  [
    'foreign output owner',
    (f) => {
      f.current.output.sid = 'S-1-5-21-999-888-777-1001';
    },
  ],
  [
    'malformed bootstrap record',
    (f) => {
      f.manifest.bootstrap.records = ['contact:bogus'];
    },
  ],
  [
    'missing bootstrap ownership',
    (f) => {
      delete f.manifest.bootstrap;
    },
  ],
  [
    'shared bootstrap database',
    (f) => {
      f.manifest.bootstrap.exclusiveDatabase = false;
    },
  ],
];

test('instrumented guarded SQL sequence never invokes real resources', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
  const query = await f.measure(() => owner`select 1`);
  const sequence = await f.measure(async () => {
    for (let index = 0; index < 100; index++) await owner`select 1`;
  });
  console.log(
    'RG_COST ' + JSON.stringify({ sqlQuery: query.costs, sqlQueries100: sequence.costs }),
  );
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
  await owner.end();
});

for (const [name, change] of denials) {
  test(`${name} rejects before any client, mutation or lifecycle action`, async (t) => {
    const f = fixture(t);
    change(f);
    assert.throws(() => verifyTestResourceContext(f.authority, f.manifest), /test-resource-denied/);
    assert.deepEqual(f.effects, {
      clients: 0,
      mutations: 0,
      dockerLifecycle: 0,
      reads: 0,
      closes: 0,
    });
  });
}

test('missing/malformed manifest and forged capabilities never construct clients', async (t) => {
  const f = fixture(t);
  for (const value of [undefined, null, {}, { nonce: f.nonce }]) {
    assert.throws(() => verifyTestResourceContext({}, value));
    assert.throws(() => verifyTestResourceContext(f.authority, value));
    await assert.rejects(connectTestOwner(value, 'discovery-sos', f.factory));
    await assert.rejects(withTestResource(value, 'discovery-sos', 'worker', f.factory));
  }
  assert.equal(f.effects.clients, 0);
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
});

test('mocked isolated context propagates exact role targets and preserves unowned sentinels', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  // Caller JSON mutations after verification cannot redirect the capability.
  const approvedApi = f.manifest.urls.api;
  f.manifest.urls.api = 'postgresql://shifaa_api:mock-only@127.0.0.1:5432/shifaa';
  const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
  const app = await withTestResource(context, 'discovery-sos', 'api', (url) => ({
    url,
    inject: () => 'mocked response',
  }));
  assert.equal(app.url, approvedApi);
  assert.equal(
    guardTestHandle(context, 'discovery-sos', app, ['inject']).inject(),
    'mocked response',
  );
  for (const kind of ['callback', 'contact', 'facility'])
    assert.throws(() => assertRunOwned(context, 'discovery-sos', kind, record));
  assert.throws(() => owner`delete from platform.synthetic_message_receipts where true`);
  assert.throws(() => owner`alter table identity.emergency_contacts disable trigger user`);
  assert.throws(() => owner`update hospital.capacity_projections set signal='available'`);
  assert.throws(
    () =>
      owner`update identity.callback_contact_verifications set revoked_at=null where person_id=${'20000000-0000-4000-8000-000000000002'}`,
  );
  assert.equal(f.effects.mutations, 0);
  registerRunRecord(context, 'discovery-sos', 'contact', record);
  assert.doesNotThrow(() => assertRunOwned(context, 'discovery-sos', 'contact', record));
  await owner`update platform.outbox_events set available_at=statement_timestamp()-interval '1 second' where aggregate_id=${record}::uuid and event_type='sos.emergency_contact.requested' and state='pending'`;
  assert.equal(f.effects.mutations, 1);
  assert.equal(f.effects.dockerLifecycle, 0);
  await owner.end();
  releaseTestResourceContext(context, 'discovery-sos');
  await assert.rejects(withTestResource(context, 'discovery-sos', 'worker', f.factory));
});

test('missing/stale database handshake closes the mocked owner without seed or app', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const stale = () => Promise.resolve([{ database: f.manifest.database, nonce: 'wrong', source }]);
  stale.end = f.sql.end;
  await assert.rejects(
    connectTestOwner(context, 'discovery-sos', () => stale),
    /handshake/,
  );
  await assert.rejects(withTestResource(context, 'discovery-sos', 'api', f.factory));
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.closes, 1);
});

test('target substitution at teardown fails while releasing only the original mock socket', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
  const worker = guardTestHandle(
    context,
    'discovery-sos',
    {
      processNext: () => {
        f.effects.mutations++;
      },
      close: f.sql.end,
    },
    ['processNext'],
  );
  f.current.container.Id = 'e'.repeat(64);
  assert.throws(() => worker.processNext());
  await assert.rejects(worker.close());
  assert.throws(() => releaseTestResourceContext(context, 'discovery-sos'));
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.closes, 1);
  await owner.end();
});

test('partial startup/interrupted mock operation retains resources without broad cleanup', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
  await assert.rejects(
    withTestResource(context, 'discovery-sos', 'api', () => {
      throw new Error('interrupted');
    }),
    /interrupted/,
  );
  await owner.end();
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
});

test('closed scope, handshake, lease and handle boundaries deny hidden factories', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  assert.throws(() => verifyTestResourceContext(f.authority, f.manifest), /already leased/);
  await assert.rejects(connectTestOwner(context, 'family', f.factory), /wrong-scope/);
  await assert.rejects(
    withTestResource(context, 'discovery-sos', 'api', f.factory),
    /before handshake/,
  );
  await assert.rejects(
    withTestResource(context, 'discovery-sos', 'worker', f.factory),
    /before handshake/,
  );
  assert.equal(f.effects.clients, 0);
  const sql = await connectTestOwner(context, 'discovery-sos', f.factory);
  await assert.rejects(connectTestOwner(context, 'discovery-sos', f.factory), /already connected/);
  assert.equal(f.effects.clients, 1);
  await assert.rejects(
    withTestResource(context, 'discovery-sos', 'owner', f.factory),
    /before handshake/,
  );
  assert.throws(() => sql('delete from platform.outbox_events'));
  assert.throws(() => sql.unsafe('delete from platform.outbox_events'));
  assert.throws(() => sql.reserve);
  const handle = guardTestHandle(
    context,
    'discovery-sos',
    { inject() {}, close() {}, rawSql: sql },
    ['inject'],
  );
  assert.throws(() => handle.rawSql);
  assert.throws(() => handle.listen);
  f.current.engine = 'substituted';
  await assert.rejects(withTestResource(context, 'discovery-sos', 'worker', f.factory));
  assert.equal(f.effects.clients, 1);
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
  await sql.end();
});

const unownedMutations = [
  [
    'share cleanup',
    (sql, foreign) => sql`delete from platform.outbox_events where aggregate_id = ${foreign}::uuid`,
  ],
  [
    'retry scheduling',
    (sql, foreign) =>
      sql`update platform.outbox_events set available_at=statement_timestamp()-interval '1 second' where aggregate_id=${foreign}::uuid and event_type='sos.emergency_contact.requested' and state='pending'`,
  ],
  [
    'callback state',
    (sql, foreign) =>
      sql`update identity.callback_contact_verifications set revoked_at=${null} where person_id=${foreign}::uuid and person_id=${foreign}::uuid`,
  ],
  [
    'contact revocation',
    (sql, foreign) =>
      sql`update identity.emergency_contacts set status='revoked',revoked_by_person_id=${record}::uuid,revoked_at=statement_timestamp() where id=${foreign}::uuid and subject_patient_id=${record}::uuid`,
  ],
  [
    'facility capacity',
    (sql, foreign) =>
      sql`update hospital.capacity_projections set observed_at = statement_timestamp() where facility_id in (${record}::uuid, ${record}::uuid, ${foreign}::uuid)`,
  ],
  ['global receipt cleanup', (sql) => sql`delete from platform.synthetic_message_receipts`],
  [
    'event-wide audit cleanup',
    (sql) => sql`delete from platform.audit_events where event_type='sos.activated'`,
  ],
  [
    'event-wide outbox cleanup',
    (sql) =>
      sql`delete from platform.outbox_events where event_type='sos.emergency_contact.requested'`,
  ],
  [
    'trigger suppression',
    (sql) => sql`alter table identity.emergency_contacts disable trigger all`,
  ],
];
for (const [name, mutation] of unownedMutations) {
  test(`${name} denies unowned SQL before mutation`, async (t) => {
    const f = fixture(t);
    const context = verifyTestResourceContext(f.authority, f.manifest);
    const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
    assert.throws(
      () => mutation(owner, '20000000-0000-4000-8000-000000000002'),
      /test-resource-denied/,
    );
    assert.equal(f.effects.mutations, 0);
    assert.equal(f.effects.dockerLifecycle, 0);
    await owner.end();
  });
}

test('privacy assignment update requires a positively registered request', async (t) => {
  const f = fixture(t, 'privacy');
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const owner = await connectTestOwner(context, 'privacy', f.factory);
  assert.throws(
    () =>
      owner`update consent.data_subject_requests set status='under_review' where id=${record}::uuid returning version`,
  );
  assert.equal(f.effects.mutations, 0);
  registerRunRecord(context, 'privacy', 'request', record);
  await owner`update consent.data_subject_requests set status='under_review' where id=${record}::uuid returning version`;
  assert.equal(f.effects.mutations, 1);
  await owner.end();
});

test('launcher authorization rejects absent metadata and repository output without OS execution', (t) => {
  let commands = 0;
  t.mock.method(childProcess, 'execFileSync', () => {
    commands++;
    throw new Error('unexpected observer');
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  for (const value of [undefined, {}, { scope: 'discovery-sos', approval: 'env-only' }])
    assert.throws(() => beginTestRun(value));
  assert.throws(() =>
    beginTestRun({
      worktree: process.cwd(),
      revision,
      sourceDigest: source,
      docker: { context: 'x', engine: 'x', endpoint: 'x', image: `sha256:${'c'.repeat(64)}` },
      scope: 'discovery-sos',
      outputParent: path.join(process.cwd(), 'artifacts'),
      approval: 'mock',
    }),
  );
  assert.equal(commands, 0);
});

// P0-RG-01: simulated OS transitions only; no mkdir, artifact write or real IO.
test('trusted exclusive output creation transitions absence to pinned owned directory', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
  let calls = 0;
  const identity = await withTestOutputCreation(f.authority, context, async (request) => {
    calls++;
    assert.deepEqual(request, { path: f.manifest.output, nonce: f.nonce });
    assert.throws(() => owner`select 1`, /test-resource-denied/);
    return f.createdOutput();
  });
  assert.deepEqual(identity, f.current.output.identity);
  await owner`select 1`;
  revalidateTestResourceContext(context, 'discovery-sos');
  await assert.rejects(
    withTestOutputCreation(f.authority, context, () => {
      calls++;
      return f.createdOutput();
    }),
    /test-resource-denied/,
  );
  assert.equal(calls, 1);
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
  await owner.end();
  releaseTestResourceContext(context, 'discovery-sos');
});

test('nonce-named preexisting output cannot be adopted and forged authority cannot create it', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  let calls = 0;
  const creator = () => {
    calls++;
    return f.createdOutput();
  };
  await assert.rejects(withTestOutputCreation({}, context, creator), /test-resource-denied/);
  f.createdOutput(); // Hostile creation after admission, before the trusted callback.
  await assert.rejects(
    withTestOutputCreation(f.authority, context, creator),
    /test-resource-denied/,
  );
  assert.equal(calls, 0);
  assert.equal(f.effects.clients, 0);
  assert.equal(f.effects.mutations, 0);
});

const invalidOutputs = [
  [
    'missing exclusive receipt',
    (_, receipt) => {
      receipt.exclusive = false;
    },
  ],
  [
    'foreign nonce receipt',
    (_, receipt) => {
      receipt.nonce = 'wrong-run';
    },
  ],
  [
    'foreign path receipt',
    (_, receipt) => {
      receipt.path += '-other';
    },
  ],
  [
    'unverified identity',
    (_, receipt) => {
      delete receipt.identity;
    },
  ],
  [
    'old directory creation time',
    (f, receipt) => {
      receipt.identity.birthtimeNs = '1';
      f.current.output.identity.birthtimeNs = '1';
    },
  ],
  [
    'substituted created directory',
    (f) => {
      f.current.output.identity.ino = '98765';
    },
  ],
  [
    'public output',
    (f) => {
      f.current.output.entries.push({ sid: 'S-1-1-0', type: 'Allow', rights: 2 });
    },
  ],
  [
    'inherited ACL',
    (f) => {
      f.current.output.protected = false;
    },
  ],
  [
    'foreign filesystem owner',
    (f) => {
      f.current.output.ownerSid = 'S-1-5-18';
    },
  ],
  [
    'symlink',
    (f) => {
      f.current.output.symlink = true;
    },
  ],
  [
    'junction',
    (f) => {
      f.current.output.canonical += '-redirected';
    },
  ],
  [
    'regular file',
    (f) => {
      f.current.output.regularFile = true;
    },
  ],
  [
    'protected repository',
    (f) => {
      f.current.output.repository = true;
    },
  ],
  [
    'replaced parent',
    (f) => {
      f.current.replacedParent = true;
    },
  ],
];
for (const [name, change] of invalidOutputs) {
  test(`output transition rejects ${name} without granting client access`, async (t) => {
    const f = fixture(t);
    const context = verifyTestResourceContext(f.authority, f.manifest);
    await assert.rejects(
      withTestOutputCreation(f.authority, context, () => {
        const receipt = f.createdOutput();
        change(f, receipt);
        return receipt;
      }),
      /test-resource-denied/,
    );
    await assert.rejects(
      connectTestOwner(context, 'discovery-sos', f.factory),
      /test-resource-denied/,
    );
    assert.equal(f.effects.clients, 0);
    assert.equal(f.effects.mutations, 0);
    assert.equal(f.effects.dockerLifecycle, 0);
  });
}

for (const [name, change] of [
  [
    'directory identity replacement',
    (f) => {
      f.current.output.identity.ino = '98765';
    },
  ],
  [
    'directory disappearance',
    (f) => {
      f.current.output.absent = true;
    },
  ],
  [
    'ACL sharing',
    (f) => {
      f.current.output.entries.push({ sid: 'S-1-1-0', type: 'Allow', rights: 2 });
    },
  ],
  [
    'parent replacement',
    (f) => {
      f.current.replacedParent = true;
    },
  ],
]) {
  test(`owned output ${name} is detected before the next guarded query`, async (t) => {
    const f = fixture(t);
    const context = verifyTestResourceContext(f.authority, f.manifest);
    const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
    await withTestOutputCreation(f.authority, context, f.createdOutput);
    const before = { ...f.effects };
    change(f);
    assert.throws(() => owner`select 1`, /test-resource-denied/);
    assert.deepEqual(f.effects, before);
    await owner.end();
  });
}

test('interrupted output creation preserves the partial directory and invalidates further use', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  await assert.rejects(
    withTestOutputCreation(f.authority, context, async () => {
      f.createdOutput();
      throw new Error('simulated launcher interruption');
    }),
    /interruption/,
  );
  assert.equal(f.current.output.absent, false);
  await assert.rejects(
    withTestOutputCreation(f.authority, context, f.createdOutput),
    /test-resource-denied/,
  );
  await assert.rejects(
    connectTestOwner(context, 'discovery-sos', f.factory),
    /test-resource-denied/,
  );
  assert.equal(f.effects.clients, 0);
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
});

// P0-RG-02: full source checks are explicit phase boundaries, never a time cache.
for (const [name, checkpoint] of [
  [
    'explicit harness checkpoint',
    (context) => revalidateTestResourceContext(context, 'discovery-sos'),
  ],
  ['API factory', (context, f) => withTestResource(context, 'discovery-sos', 'api', f.factory)],
  [
    'worker factory',
    (context, f) => withTestResource(context, 'discovery-sos', 'worker', f.factory),
  ],
  ['transaction entry', (_, __, owner) => owner.begin(async () => {})],
  ['fixture execution', (_, __, owner) => owner.unsafe('not reached')],
  [
    'handle teardown',
    (context) => guardTestHandle(context, 'discovery-sos', { close: async () => {} }, []).close(),
  ],
  ['lease teardown', (context) => releaseTestResourceContext(context, 'discovery-sos')],
]) {
  test(`source drift fails closed at ${name} and cannot resume using old admission`, async (t) => {
    const f = fixture(t);
    const context = verifyTestResourceContext(f.authority, f.manifest);
    const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
    const before = { ...f.effects };
    f.current.source = 'f'.repeat(64);
    await assert.rejects(async () => checkpoint(context, f, owner), /test-resource-denied/);
    assert.throws(() => owner`select 1`, /test-resource-denied/);
    assert.deepEqual(f.effects, before);
    await owner.end();
  });
}

test('source drift before owner construction denies the factory before any connection', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  f.current.source = 'f'.repeat(64);
  await assert.rejects(
    connectTestOwner(context, 'discovery-sos', f.factory),
    /test-resource-denied/,
  );
  assert.equal(f.effects.clients, 0);
  assert.equal(f.effects.mutations, 0);
});

test('lightweight operations defer source hashing only until the next mandatory checkpoint', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
  f.current.source = 'f'.repeat(64);
  const operation = await f.measure(() => owner`select 1`);
  assert.equal(operation.costs.sourceReads, 0);
  assert.equal(operation.costs.git, 0);
  assert.throws(
    () => revalidateTestResourceContext(context, 'discovery-sos'),
    /test-resource-denied/,
  );
  assert.throws(() => owner`select 1`, /test-resource-denied/);
  await owner.end();
});

for (const [name, change] of [
  [
    'engine',
    (f) => {
      f.current.engine = 'unapproved-engine';
    },
  ],
  [
    'context',
    (f) => {
      f.current.context = 'unapproved-context';
    },
  ],
  [
    'endpoint',
    (f) => {
      f.current.endpoint = 'unapproved-endpoint';
    },
  ],
  [
    'container',
    (f) => {
      f.current.container.Id = 'e'.repeat(64);
    },
  ],
  [
    'volume',
    (f) => {
      f.current.volumeMetadata[0].Mountpoint = '/other-volume';
    },
  ],
  [
    'published target',
    (f) => {
      f.current.container.NetworkSettings.Ports['5432/tcp'][0].HostPort = '5432';
    },
  ],
]) {
  for (const operation of ['query', 'inject', 'processNext']) {
    test(`lightweight ${operation} detects ${name} substitution before effects`, async (t) => {
      const f = fixture(t);
      const context = verifyTestResourceContext(f.authority, f.manifest);
      const owner = await connectTestOwner(context, 'discovery-sos', f.factory);
      const handle = guardTestHandle(
        context,
        'discovery-sos',
        {
          inject: () => {
            f.effects.mutations++;
          },
          processNext: () => {
            f.effects.mutations++;
          },
        },
        ['inject', 'processNext'],
      );
      const before = { ...f.effects };
      change(f);
      // Each method gets a fresh context: a prior rejected query cannot mask a
      // missing identity check in the API or worker wrapper.
      if (operation === 'query') assert.throws(() => owner`select 1`, /test-resource-denied/);
      else assert.throws(() => handle[operation](), /test-resource-denied/);
      assert.throws(() => owner`select 1`, /test-resource-denied/);
      assert.throws(() => handle.inject(), /test-resource-denied/);
      assert.throws(() => handle.processNext(), /test-resource-denied/);
      assert.deepEqual(f.effects, before);
      await owner.end();
    });
  }
}

test('source drift denies output transition before the trusted creator runs', async (t) => {
  const f = fixture(t);
  const context = verifyTestResourceContext(f.authority, f.manifest);
  f.current.source = 'f'.repeat(64);
  let creations = 0;
  await assert.rejects(
    withTestOutputCreation(f.authority, context, () => {
      creations++;
      return f.createdOutput();
    }),
    /test-resource-denied/,
  );
  assert.equal(creations, 0);
  assert.equal(f.effects.clients, 0);
  assert.equal(f.effects.mutations, 0);
  assert.equal(f.effects.dockerLifecycle, 0);
});

for (const offset of [-87_100n, -1_000_001n]) {
  test(`Windows exclusive output creation respects millisecond clock precision (${offset})`, async (t) => {
    const f = fixture(t);
    const context = verifyTestResourceContext(f.authority, f.manifest);
    const now = Date.now();
    t.mock.method(Date, 'now', () => now);
    const create = () => {
      const receipt = f.createdOutput();
      receipt.identity.birthtimeNs = String(BigInt(now) * 1_000_000n + offset);
      f.current.output.identity.birthtimeNs = receipt.identity.birthtimeNs;
      return receipt;
    };
    if (process.platform === 'win32' && offset > -1_000_000n) {
      await withTestOutputCreation(f.authority, context, create);
      revalidateTestResourceContext(context, 'discovery-sos');
    } else {
      await assert.rejects(
        withTestOutputCreation(f.authority, context, create),
        /exclusive output creation receipt/,
      );
    }
    assert.equal(f.effects.clients, 0);
    assert.equal(f.effects.mutations, 0);
  });
}
