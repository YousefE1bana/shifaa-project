import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  nativeDockerBoundary,
  nativeStreamForwarder,
  readNativeJournal,
  currentNativeVolumes,
} from './native-supabase-docker.mjs';

async function fixture(t, streamForwarder) {
  const output = mkdtempSync(path.join(os.tmpdir(), 'shifaa-native-api-test-'));
  const nonce = 'a'.repeat(32),
    project = `sv-${nonce}-sb`;
  const image = 'sha256:' + 'd'.repeat(64),
    network = 'b'.repeat(64);
  const environment = {
    nonce,
    output,
    startedAt: Date.now() - 1000,
    postgres: {
      engine: 'engine',
      before: { containers: ['development'], volumes: ['development'], networks: ['development'] },
    },
    nativeAdmission: { project, network, networkName: project + '-net', ports: [60001] },
  };
  const requests = [],
    containers = new Map(),
    volumes = new Map();
  let rejectCreate = false,
    foreignAttachment = false,
    engine = 'engine';
  const response = (status, value, headers = {}) =>
    Object.assign(
      Readable.from([Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))]),
      { statusCode: status, headers },
    );
  const upstream = async (method, target, headers, raw) => {
    const url = new URL(target, 'http://engine'),
      route = url.pathname.replace(/^\/v\d+\.\d+/, '');
    if (route === '/info') return response(200, { ID: engine });
    if (route.startsWith('/networks/'))
      return response(200, {
        Id: network,
        Name: project + '-net',
        Driver: 'bridge',
        Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' },
        Labels: { 'shifaa.verify.nonce': nonce },
        Containers: {},
      });
    if (route === '/_ping')
      return response(200, 'OK', {
        'api-version': '1.54',
        ostype: 'linux',
        'docker-experimental': 'false',
      });
    if (route === '/version')
      return response(200, { ApiVersion: '1.54', MinAPIVersion: '1.24', Os: 'linux' });
    if (route.startsWith('/images/'))
      return response(200, { Id: image, RepoTags: [], Config: { Env: [], Volumes: {} } });
    if (method === 'POST' && route === '/volumes/create') {
      const b = JSON.parse(raw);
      requests.push({ method, route, body: b });
      const v = {
        Name: b.Name,
        Driver: 'local',
        Labels: b.Labels,
        CreatedAt: new Date().toISOString(),
      };
      volumes.set(v.Name, v);
      return response(201, v);
    }
    if (route.startsWith('/volumes/')) {
      const name = decodeURIComponent(route.split('/')[2]);
      if (method === 'DELETE') {
        requests.push({ method, route });
        volumes.delete(name);
        return response(204, '');
      }
      return volumes.has(name)
        ? response(200, volumes.get(name))
        : response(404, { message: 'No such volume' });
    }
    if (route === '/containers/json')
      return response(200, foreignAttachment ? [{ Id: 'development' }] : []);
    if (method === 'POST' && route === '/containers/create') {
      const b = JSON.parse(raw);
      requests.push({ method, route, body: b });
      if (rejectCreate) return response(500, { message: 'Intentional mocked startup failure' });
      const id = 'c'.repeat(64);
      const mounts = (b.HostConfig.Binds ?? []).map((bind) => ({
        Type: 'volume',
        Name: bind.split(':')[0],
        Destination: '/data',
      }));
      // Simulate an anonymous image-declared volume that the CLI never named.
      if (b.Volumes?.['/anonymous']) {
        const v = { Name: 'e'.repeat(64), Labels: null, CreatedAt: new Date().toISOString() };
        volumes.set(v.Name, v);
        mounts.push({ Type: 'volume', Name: v.Name, Destination: '/anonymous' });
      }
      containers.set(id, {
        Id: id,
        Image: image,
        Created: new Date().toISOString(),
        Name: '/' + url.searchParams.get('name'),
        Config: { Labels: b.Labels },
        HostConfig: b.HostConfig,
        Mounts: mounts,
        State: { Running: false },
      });
      return response(201, { Id: id, Warnings: [] });
    }
    const match = /^\/containers\/([^/]+)(?:\/(.*))?$/.exec(route);
    if (match) {
      if (match[2] === 'json')
        return containers.has(match[1])
          ? response(200, containers.get(match[1]))
          : response(404, { message: 'No such container' });
      if (match[2] === 'attach')
        return Object.assign(new Readable({ read() {} }), {
          statusCode: 200,
          headers: { 'content-type': 'application/vnd.docker.raw-stream' },
        });
      if (match[2] === 'wait') return response(200, { StatusCode: 0 });
      if (match[2] === 'exec') return response(201, { Id: 'owned-exec' });
      requests.push({ method, route });
      return response(204, '');
    }
    throw Error('Unmodelled engine request: ' + method + ' ' + route);
  };
  const upgrades = [];
  const boundary = await nativeDockerBoundary(
    environment,
    upstream,
    streamForwarder ??
      (async (req, socket) => {
        upgrades.push(req.url);
        socket.end(
          'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n',
        );
      }),
  );
  t.after(async () => {
    await boundary.close();
    rmSync(output, { recursive: true });
  });
  const send = (method, route, body) =>
    new Promise((resolve, reject) => {
      const url = new URL(boundary.host.replace('tcp:', 'http:') + route);
      const request = http.request(
        url,
        { method, headers: { 'content-type': 'application/json', ...boundary.headers } },
        async (r) => {
          const parts = [];
          for await (const part of r) parts.push(part);
          resolve({ status: r.statusCode, body: Buffer.concat(parts).toString() });
        },
      );
      request.once('error', reject);
      request.end(body === undefined ? undefined : JSON.stringify(body));
    });
  const container = () => ({
    Image: image,
    Labels: { 'com.supabase.cli.project': project },
    HostConfig: {
      NetworkMode: network,
      PortBindings: { '5432/tcp': [{ HostIp: '', HostPort: '60001' }] },
    },
  });
  return {
    boundary,
    environment,
    requests,
    send,
    container,
    containers,
    volumes,
    image,
    project,
    network,
    upgrades,
    setEngine: (value) => {
      engine = value;
    },
    rejectCreate: () => {
      rejectCreate = true;
    },
    setForeignAttachment: () => {
      foreignAttachment = true;
    },
  };
}

test('actual Docker CLI serializes create through the boundary with explicit loopback, not network defaults', async (t) => {
  const f = await fixture(t);
  const result = await new Promise((resolve, reject) => {
    // This Docker executable only contacts the fake HTTP Engine above. No local
    // Docker Engine operation, container creation or database connection occurs.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('DOCKER')),
    );
    env.DOCKER_CUSTOM_HEADERS = f.boundary.authorization;
    const p = spawn(
      'docker',
      [
        '--host',
        f.boundary.host,
        'create',
        '--pull=never',
        '--name',
        `supabase_db_${f.project}`,
        '--network',
        f.network,
        '--label',
        `com.supabase.cli.project=${f.project}`,
        '-p',
        '60001:5432',
        f.image,
      ],
      { env, windowsHide: true },
    );
    let stderr = '';
    p.stderr.on('data', (b) => {
      stderr += b;
    });
    p.stdout.resume();
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const created = f.requests.find((r) => r.route === '/containers/create');
  assert.deepEqual(created.body.HostConfig.PortBindings['5432/tcp'], [
    { HostIp: '127.0.0.1', HostPort: '60001' },
  ]);
  assert.equal(created.body.HostConfig.RestartPolicy.Name, 'no');
  assert.equal(readNativeJournal(f.environment).filter((e) => e.container).length, 1);
});

for (const [name, modify] of Object.entries({
  'IPv4 wildcard': (b) => {
    b.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0';
  },
  'IPv6 wildcard': (b) => {
    b.HostConfig.PortBindings['5432/tcp'][0].HostIp = '::';
  },
  'shared port': (b) => {
    b.HostConfig.PortBindings['5432/tcp'][0].HostPort = '5432';
  },
  'development project': (b) => {
    b.Labels['com.supabase.cli.project'] = 'development';
  },
  'foreign network': (b) => {
    b.HostConfig.NetworkMode = 'development';
  },
  'shared volume': (b) => {
    b.HostConfig.Binds = ['development:/data'];
  },
  'host bind': (b) => {
    b.HostConfig.Binds = ['C:/development:/data'];
  },
  privileged: (b) => {
    b.HostConfig.Privileged = true;
  },
}))
  test(`${name} cannot reach Docker creation`, async (t) => {
    const f = await fixture(t),
      body = f.container();
    modify(body);
    assert.equal(
      (await f.send('POST', `/containers/create?name=supabase_db_${f.project}`, body)).status,
      403,
    );
    assert.equal(f.requests.length, 0);
  });

test('partial startup journals named and anonymous volumes before a later failure, without adopting existing volumes', async (t) => {
  const f = await fixture(t),
    name = `supabase_edge_runtime_${f.project}`;
  assert.equal((await f.send('POST', '/volumes/create', { Name: name })).status, 201);
  const body = f.container();
  body.Volumes = { '/anonymous': {} };
  assert.equal(
    (await f.send('POST', `/containers/create?name=supabase_db_${f.project}`, body)).status,
    201,
  );
  assert.equal((await f.send('POST', '/containers/prune')).status, 403);
  const journal = readNativeJournal(f.environment);
  assert.ok(
    journal.some(
      (e) =>
        e.volume?.Name === name && e.volume.Labels['shifaa.verify.nonce'] === f.environment.nonce,
    ),
  );
  assert.ok(
    journal.some((e) => e.volume?.Name === 'e'.repeat(64) && e.parentContainer === 'c'.repeat(64)),
  );
  const foreign = `supabase_storage_${f.project}`;
  f.volumes.set(foreign, { Name: foreign, Labels: null });
  assert.equal((await f.send('POST', '/volumes/create', { Name: foreign })).status, 403);
  assert.equal((await f.send('DELETE', '/volumes/development')).status, 403);
});

test('foreign attachments and changed container identity prevent scoped deletion', async (t) => {
  const f = await fixture(t),
    name = `supabase_db_${f.project}`;
  await f.send('POST', '/volumes/create', { Name: name });
  const body = f.container();
  body.HostConfig.Binds = [name + ':/data'];
  await f.send('POST', `/containers/create?name=${name}`, body);
  f.setForeignAttachment();
  assert.equal((await f.send('DELETE', '/volumes/' + name)).status, 403);
  assert.equal((await f.send('DELETE', '/containers/' + 'c'.repeat(64))).status, 403);
  f.containers.get('c'.repeat(64)).Image = 'foreign';
  assert.equal((await f.send('POST', '/containers/' + 'c'.repeat(64) + '/start')).status, 403);
  assert.equal(f.requests.filter((r) => r.method === 'DELETE').length, 0);
});

test('unnamed auto-remove bootstrap jobs create and journal implicit volumes before ContainerCreate', async (t) => {
  const f = await fixture(t),
    body = f.container(),
    name = `supabase_edge_runtime_${f.project}`;
  body.HostConfig.AutoRemove = true;
  body.HostConfig.Binds = [name + ':/root/.cache/deno'];
  assert.equal((await f.send('POST', '/containers/create', body)).status, 201);
  assert.deepEqual(
    f.requests.map((r) => r.route),
    ['/volumes/create', '/containers/create'],
  );
  assert.ok(readNativeJournal(f.environment).some((e) => e.volume?.Name === name));
  assert.ok(f.containers.get('c'.repeat(64)).Name.startsWith('/supabase_bootstrap_'));
});

test('missing invocation authentication and engine substitution deny even otherwise valid creates', async (t) => {
  const f = await fixture(t);
  const r = await fetch(f.boundary.host.replace('tcp:', 'http:') + '/containers/create', {
    method: 'POST',
    body: JSON.stringify(f.container()),
  });
  assert.equal(r.status, 403);
  f.setEngine('foreign-engine');
  assert.equal(
    (await f.send('POST', `/containers/create?name=supabase_db_${f.project}`, f.container()))
      .status,
    403,
  );
  assert.equal(f.requests.length, 0);
});

test('journal recovery retains unattached volumes, ignores removed ones and rejects same-name replacements', async (t) => {
  const f = await fixture(t),
    name = `supabase_edge_runtime_${f.project}`;
  await f.send('POST', '/volumes/create', { Name: name });
  const inspect = (n) => f.volumes.get(n);
  assert.deepEqual(currentNativeVolumes(f.environment, [name], inspect), [f.volumes.get(name)]);
  assert.deepEqual(currentNativeVolumes(f.environment, [], inspect), []);
  f.volumes.set(name, { ...f.volumes.get(name), CreatedAt: 'different' });
  assert.throws(() => currentNativeVolumes(f.environment, [name], inspect), /replacement/);
  assert.throws(
    () => currentNativeVolumes(f.environment, ['development'], () => ({})),
    /Preexisting/,
  );
});

test('native exec streams require a freshly revalidated owned container and invocation authentication', async (t) => {
  const f = await fixture(t),
    id = 'c'.repeat(64);
  await f.send('POST', `/containers/create?name=supabase_db_${f.project}`, f.container());
  assert.equal((await f.send('POST', `/containers/${id}/exec`, {})).status, 201);
  const upgrade = (route, authenticated = true) =>
    new Promise((resolve, reject) => {
      const req = http.request(f.boundary.host.replace('tcp:', 'http:') + route, {
        method: 'POST',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'tcp',
          ...(authenticated ? f.boundary.headers : {}),
        },
      });
      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode);
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
  assert.equal(await upgrade('/exec/owned-exec/start'), 101);
  assert.equal(await upgrade('/exec/unknown/start'), 403);
  assert.equal(await upgrade('/exec/owned-exec/start', false), 403);
  f.containers.get(id).Image = 'substituted';
  assert.equal(await upgrade('/exec/owned-exec/start'), 403);
  assert.equal(f.upgrades.length, 1);
});

test('CLI idempotent network creation resolves only the already verified run network without a daemon mutation', async (t) => {
  const f = await fixture(t);
  const body = { Name: f.project + '-net', Labels: { 'com.supabase.cli.project': f.project } };
  assert.equal((await f.send('POST', '/networks/create', body)).status, 409);
  assert.equal(
    (await f.send('POST', '/networks/create', { ...body, Name: 'development' })).status,
    403,
  );
  assert.equal(f.requests.length, 0);
  const c = f.container();
  c.HostConfig.NetworkMode = f.project + '-net';
  assert.equal(
    (await f.send('POST', `/containers/create?name=supabase_db_${f.project}`, c)).status,
    201,
  );
  assert.equal(f.requests[0].body.HostConfig.NetworkMode, f.network);
});

test(
  'pinned Supabase CLI and real Docker CLI reach loopback ContainerCreate through a fake Engine',
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t);
    f.rejectCreate();
    const workdir = path.join(f.environment.output, 'native');
    mkdirSync(path.join(workdir, 'supabase'), { recursive: true });
    writeFileSync(
      path.join(workdir, 'supabase/config.toml'),
      `project_id = "${f.project}"\n[db]\nport = 60001\nshadow_port = 60003\nmajor_version = 17\n[db.migrations]\nenabled = false\n[db.seed]\nenabled = false\n`,
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !/^(DOCKER|COMPOSE|PG|DATABASE|SUPABASE_)/i.test(k),
      ),
    );
    env.DOCKER_HOST = f.boundary.host;
    env.DOCKER_CUSTOM_HEADERS = f.boundary.authorization;
    let diagnostic = '';
    const result = await new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [
          path.resolve(import.meta.dirname, '../node_modules/supabase/dist/supabase.js'),
          'start',
          '--workdir',
          workdir,
          '--network-id',
          f.project + '-net',
          '--exclude',
          'studio,postgres-meta,vector,logflare,supavisor,edge-runtime,imgproxy',
        ],
        { env, windowsHide: true, timeout: 15000 },
      );
      for (const stream of [p.stdout, p.stderr])
        stream.on('data', (b) => {
          diagnostic += b;
        });
      p.on('error', reject);
      p.on('close', resolve);
    });
    assert.notEqual(result, 0, 'Intentional fake-engine startup failure is not acceptance');
    const creates = f.requests.filter((r) => r.route === '/containers/create');
    assert.equal(creates.length, 1, diagnostic);
    assert.deepEqual(creates[0].body.HostConfig.PortBindings['5432/tcp'], [
      { HostIp: '127.0.0.1', HostPort: '60001' },
    ]);
    assert.equal(f.containers.size, 0, 'No actual native or mocked running resource is required');
  },
);

test('stream headers reach CLI before bootstrap starts', async (t) => {
  const f = await fixture(t),
    id = 'c'.repeat(64);
  await f.send('POST', '/containers/create?name=supabase_db_' + f.project, f.container());
  await new Promise((resolve, reject) => {
    const r = http.request(
      f.boundary.host.replace('tcp:', 'http:') + '/containers/' + id + '/attach',
      { method: 'POST', headers: f.boundary.headers },
      (res) => {
        clearTimeout(timer);
        res.destroy();
        resolve();
      },
    );
    r.on('error', reject);
    const timer = setTimeout(() => {
      r.destroy();
      reject(new Error('Attach headers withheld until container output; docker run cannot start'));
    }, 1000);
    r.end();
  });
});

for (const status of [101, 200])
  test('actual Docker CLI bootstrap forwards native pipe attach status ' + status, async (t) => {
    const socketPath =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\shifaa-native-mock-' + process.pid + '-' + status
        : path.join(os.tmpdir(), 'shifaa-native-' + process.pid + '-' + status + '.sock');
    const daemon = http.createServer(),
      sockets = new Set();
    daemon.on('connection', (s) => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    daemon.on('upgrade', (req, socket) => {
      socket.write(
        status === 101
          ? 'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n'
          : 'HTTP/1.1 200 OK\r\nContent-Type: application/vnd.docker.raw-stream\r\nConnection: close\r\n\r\n',
      );
      setTimeout(() => socket.end(), 100);
    });
    await new Promise((r) => daemon.listen(socketPath, r));
    t.after(
      () =>
        new Promise((r) => {
          daemon.close(r);
          for (const s of sockets) s.destroy();
        }),
    );
    const f = await fixture(t, nativeStreamForwarder(socketPath));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('DOCKER')),
    );
    env.DOCKER_CUSTOM_HEADERS = f.boundary.authorization;
    const result = await new Promise((resolve, reject) => {
      const p = spawn(
        'docker',
        [
          '--host',
          f.boundary.host,
          'run',
          '--rm',
          '--pull=never',
          '--network',
          f.network,
          '--label',
          'com.supabase.cli.project=' + f.project,
          f.image,
          'echo',
          'mock',
        ],
        { env, windowsHide: true, timeout: 10000 },
      );
      let diagnostic = '';
      for (const s of [p.stdout, p.stderr]) s.on('data', (b) => (diagnostic += b));
      p.on('error', reject);
      p.on('close', (code) => resolve({ code, diagnostic }));
    });
    assert.equal(result.code, 0, result.diagnostic);
    assert.ok(f.requests.some((r) => r.route.endsWith('/start')));
  });

test('Go bootstrap without AutoRemove still requires exact project/network and receives an exclusive receipt', async (t) => {
  const f = await fixture(t),
    b = f.container();
  b.HostConfig.AutoRemove = false;
  assert.equal((await f.send('POST', '/containers/create?name=', b)).status, 201);
  assert.ok(readNativeJournal(f.environment).some((e) => e.container));
  const wrong = f.container();
  wrong.Labels['com.supabase.cli.project'] = 'development';
  assert.equal((await f.send('POST', '/containers/create?name=', wrong)).status, 403);
});
test('destination-only anonymous mount is explicitly created and journaled, never treated as a host bind', async (t) => {
  const f = await fixture(t),
    b = f.container();
  b.HostConfig.Binds = ['/root/.cache/deno'];
  assert.equal((await f.send('POST', '/containers/create', b)).status, 201);
  const v = readNativeJournal(f.environment).find((e) => e.volume)?.volume;
  assert.ok(v.Name.endsWith('_' + f.project));
  assert.deepEqual(f.requests.find((r) => r.route === '/containers/create').body.HostConfig.Binds, [
    v.Name + ':/root/.cache/deno',
  ]);
  const wrong = f.container();
  wrong.HostConfig.Binds = ['/development:/root/.cache/deno'];
  assert.equal((await f.send('POST', '/containers/create', wrong)).status, 403);
});

test('denial diagnostics classify request shape without disclosing host paths or credentials', async (t) => {
  const f = await fixture(t),
    b = f.container();
  b.Env = ['PASSWORD=private-secret'];
  b.HostConfig.Binds = ['/private-sensitive-path:/workspace:ro'];
  assert.equal((await f.send('POST', '/containers/create', b)).status, 403);
  const denial = readNativeJournal(f.environment).find((e) => e.state === 'DENIED');
  assert.deepEqual(denial.shape.binds, [{ source: 'absolute', target: '/workspace' }]);
  assert.ok(!JSON.stringify(denial).includes('private-'));
});
