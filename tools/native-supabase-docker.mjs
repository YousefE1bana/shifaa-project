// Short-lived Docker API boundary for the pinned native CLI. No daemon setting,
// installed binary or service image is changed. The CLI still bootstraps Auth,
// Storage and PostgreSQL; only its run-owned creation requests are constrained.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { appendFileSync, readFileSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyRunOutput } from './disposable-test-resources.mjs';

const nonceLabel = 'shifaa.verify.nonce';
const sharedPorts = new Set([5432, 54322, 55432]);
const identity = (c) => ({
  id: c.Id,
  image: c.Image,
  created: c.Created,
  mounts: c.Mounts,
});
export function readNativeJournal(environment) {
  const file = path.join(environment.output, 'native-creations.jsonl');
  if (!existsSync(file)) return [];
  assert.ok(
    !lstatSync(file).isSymbolicLink() && realpathSync.native(file) === file,
    'Linked native journal',
  );
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const entry = JSON.parse(line);
      assert.equal(entry.nonce, environment.nonce, 'Foreign native creation receipt');
      return entry;
    });
}

// Bootstrap jobs can remove their temporary volumes before the CLI returns.
// Retain their journal proof, but only schedule still-existing exact identities
// for teardown. Never adopt a replacement with the same name.
export function currentNativeVolumes(environment, names, inspect) {
  const expected = new Map((environment.nativeVolumes ?? []).map((v) => [v.Name, v]));
  for (const entry of readNativeJournal(environment))
    if (entry.volume) expected.set(entry.volume.Name, entry.volume);
  return [...new Set(names)].map((name) => {
    const actual = inspect(name);
    assert.ok(!environment.postgres.before.volumes.includes(name), 'Preexisting native volume');
    if (expected.has(name))
      assert.deepEqual(actual, expected.get(name), 'Native volume replacement');
    else assert.fail('Native volume has no creation receipt');
    return actual;
  });
}

export function verifyNativeTemplateMount(environment, mount) {
  assert.equal(mount.Type, 'bind');
  assert.equal(mount.RW, false, 'Writable template mount');
  const { Source: source, Destination: destination } = mount;
  const scope = environment.nativeAdmission;
  const expected = (scope.templateBinds ?? []).find((entry) => {
    if (entry.destination !== destination) return false;
    if (source === entry.source) return true;
    if (
      environment.postgres.endpoint !== 'npipe:////./pipe/dockerDesktopLinuxEngine' ||
      !/^[A-Za-z]:\\/.test(entry.source)
    )
      return false;
    const [drive, ...parts] = entry.source.split('\\');
    return (
      source === `/run/desktop/mnt/host/${drive[0].toLowerCase()}/${parts.join('/')}` ||
      source === `/${drive[0].toLowerCase()}/${parts.join('/')}` ||
      source === entry.source.replaceAll('\\', '/')
    );
  });
  assert.ok(expected, 'Unapproved host bind');
  assert.ok(['confirmation.html', 'recovery.html'].includes(path.basename(expected.source)));
  assert.equal(
    expected.destination,
    '/home/kong/templates/email/' + path.basename(expected.source),
  );
  assert.equal(
    path.dirname(expected.source),
    path.join(environment.output, 'native/supabase/templates'),
  );
  let cursor = expected.source;
  while (cursor !== environment.output) {
    assert.ok(!lstatSync(cursor).isSymbolicLink(), 'Linked template source');
    cursor = path.dirname(cursor);
  }
  assert.equal(realpathSync.native(expected.source), expected.source);
  assert.equal(lstatSync(expected.source).nlink, 1);
  assert.equal(
    createHash('sha256').update(readFileSync(expected.source)).digest('hex'),
    expected.sha256,
  );
  return expected;
}

// Testable HTTP boundary; tests use an in-memory Engine, never the local daemon.
export async function nativeDockerBoundary(environment, upstream, upgrade) {
  const scope = environment.nativeAdmission;
  assert.ok(scope && /^[a-f0-9]{32}$/.test(environment.nonce));
  assert.equal(scope.project, `sv-${environment.nonce}-sb`);
  assert.ok(
    scope.ports.length && scope.ports.every((p) => p > 1024 && p <= 65535 && !sharedPorts.has(p)),
  );
  const before = environment.postgres.before;
  const journal = path.join(environment.output, 'native-creations.jsonl');
  const record = (entry) =>
    appendFileSync(journal, JSON.stringify({ nonce: environment.nonce, ...entry }) + '\n', {
      mode: 0o600,
      flush: true,
    });
  const containers = new Map((environment.nativeContainers ?? []).map((c) => [c.id, c]));
  const volumes = new Map((environment.nativeVolumes ?? []).map((v) => [v.Name, v]));
  for (const entry of readNativeJournal(environment)) {
    if (entry.container) containers.set(entry.container.id, entry.container);
    if (entry.volume) volumes.set(entry.volume.Name, entry.volume);
  }
  const fetch = async (method, url, body) => {
    const r = await upstream(
      method,
      url,
      {},
      body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)),
    );
    const chunks = [];
    for await (const chunk of r) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    return { status: r.statusCode, value: raw.length ? JSON.parse(raw.toString()) : null };
  };
  const inspect = async (url) => {
    const r = await fetch('GET', url);
    assert.equal(r.status, 200, 'Resource identity unavailable');
    return r.value;
  };
  const engine = async () =>
    assert.equal((await inspect('/info')).ID, environment.postgres.engine, 'Docker engine changed');
  const ownNetwork = async () => {
    const actual = await inspect(`/networks/${scope.network}`);
    assert.equal(actual.Id, scope.network);
    assert.equal(actual.Name, scope.networkName);
    assert.equal(actual.Labels?.[nonceLabel], environment.nonce);
    assert.ok(!before.networks.includes(actual.Id));
    assert.equal(actual.Driver, 'bridge');
    assert.equal(actual.Options?.['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1');
    assert.ok(
      Object.keys(actual.Containers ?? {}).every((id) => containers.has(id)),
      'Foreign network attachment',
    );
  };
  const ownContainer = async (id) => {
    const old = containers.get(id) ?? [...containers.values()].find((c) => c.name === id);
    // CLI commands commonly address containers by their full native name.
    const c = await inspect(`/containers/${encodeURIComponent(id)}/json`);
    const expected = old ?? containers.get(c.Id);
    assert.ok(expected && !before.containers.includes(c.Id), 'Unowned native container');
    assert.deepEqual(identity(c), {
      id: expected.id,
      image: expected.image,
      created: expected.created,
      mounts: expected.mounts,
    });
    assert.equal(c.Config.Labels[nonceLabel], environment.nonce);
    assert.equal(c.Config.Labels['com.supabase.cli.project'], scope.project);
    assert.equal(c.HostConfig.NetworkMode, scope.network);
    await ownNetwork();
    assert.ok(!c.HostConfig.Privileged && !c.HostConfig.PublishAllPorts);
    for (const mount of c.Mounts.filter((m) => m.Type === 'bind')) {
      verifyNativeTemplateMount(environment, mount);
    }
    for (const bindings of Object.values(c.HostConfig.PortBindings ?? {}))
      for (const binding of bindings) {
        assert.equal(binding.HostIp, '127.0.0.1');
        assert.ok(scope.ports.includes(Number(binding.HostPort)));
      }
    return c;
  };
  const ownVolume = async (name) => {
    const old = volumes.get(name);
    assert.ok(old && !before.volumes.includes(name), 'Unowned native volume');
    assert.deepEqual(await inspect(`/volumes/${encodeURIComponent(name)}`), old);
    const attached = await inspect(
      '/containers/json?all=1&filters=' + encodeURIComponent(JSON.stringify({ volume: [name] })),
    );
    assert.ok(
      attached.every((c) => containers.has(c.Id)),
      'Foreign native volume attachment',
    );
  };
  const ensureVolume = async (name) => {
    assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/);
    assert.ok(
      name.endsWith('_' + scope.project) && !before.volumes.includes(name),
      'Foreign/preexisting volume',
    );
    const found = await fetch('GET', `/volumes/${encodeURIComponent(name)}`);
    if (found.status === 200) {
      await ownVolume(name);
      return;
    }
    assert.equal(found.status, 404, 'Volume existence unknown');
    const requestId = randomUUID();
    record({ requestId, state: 'REQUESTED', kind: 'volume', name });
    const result = await fetch('POST', '/volumes/create', {
      Name: name,
      Driver: 'local',
      Labels: { [nonceLabel]: environment.nonce },
    });
    assert.equal(result.status, 201);
    const actual = await inspect(`/volumes/${encodeURIComponent(name)}`);
    assert.equal(actual.Labels[nonceLabel], environment.nonce);
    assert.ok(Date.parse(actual.CreatedAt) >= environment.startedAt);
    volumes.set(name, actual);
    record({ requestId, state: 'CREATED', volume: actual });
  };
  const execs = new Map();
  const token = randomBytes(32).toString('hex');
  const authenticated = (req) =>
    assert.equal(req.headers['x-shifaa-invocation'], token, 'Foreign native API client');
  const server = http.createServer(async (req, res) => {
    let stage = 'invocation';
    let shape;
    try {
      authenticated(req);
      stage = 'engine';
      await engine();
      stage = 'policy';
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.replace(/^\/v\d+\.\d+/, '');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        assert.ok(size <= 32 * 1024 * 1024, 'Native API body limit');
        chunks.push(chunk);
      }
      let raw = Buffer.concat(chunks);
      let create, action, actionContainer;
      if (req.method === 'POST' && route === '/containers/create') {
        const b = JSON.parse(raw);
        // Closed diagnostic vocabulary only: never log argv, environment,
        // host paths, image credentials or request bodies.
        shape = {
          project:
            b.Labels?.['com.supabase.cli.project'] === scope.project
              ? 'own'
              : b.Labels?.['com.supabase.cli.project']
                ? 'foreign'
                : 'missing',
          service:
            ['db', 'auth', 'storage', 'kong', 'edge_runtime', 'vector', 'mailpit'].find((name) =>
              url.searchParams.get('name')?.startsWith(`supabase_${name}_`),
            ) ?? 'other',
          binds: (b.HostConfig?.Binds ?? []).map((bind) => ({
            source: bind.startsWith('/')
              ? 'absolute'
              : /^[A-Za-z]:/.test(bind)
                ? 'windows'
                : 'named',
            target:
              [
                '/var/run/docker.sock',
                '/workspace',
                '/mnt',
                '/var/lib/postgresql/data',
                '/root/.cache/deno',
              ].find((target) => bind.includes(target)) ?? 'other',
          })),
        };
        stage = 'container-project';
        assert.equal(b.Labels?.['com.supabase.cli.project'], scope.project, 'Foreign project');
        // The CLI also uses unnamed `docker run --rm` bootstrap jobs. Give
        // those an exclusive name before creation; never adopt an existing job.
        stage = 'container-name';
        if (!url.searchParams.get('name')) {
          // The Go CLI also runs one-shot jobs without AutoRemove so it can
          // inspect their exit status. Exclusive naming and the creation
          // receipt establish ownership before either form can start.
          url.searchParams.set('name', `supabase_bootstrap_${randomUUID()}_${scope.project}`);
        }
        assert.ok(
          url.searchParams.get('name')?.endsWith('_' + scope.project),
          'Foreign container name',
        );
        stage = 'container-network';
        assert.ok(
          [scope.network, scope.networkName].includes(b.HostConfig.NetworkMode),
          'Foreign network',
        );
        await ownNetwork();
        b.HostConfig.NetworkMode = scope.network;
        assert.ok(
          !b.HostConfig.Privileged &&
            !b.HostConfig.PublishAllPorts &&
            !b.HostConfig.VolumesFrom?.length,
        );
        assert.ok(
          !b.HostConfig.Mounts?.length &&
            !b.HostConfig.Devices?.length &&
            !b.HostConfig.CapAdd?.length,
        );
        for (const binds of Object.values(b.HostConfig.PortBindings ?? {}))
          for (const bind of binds) {
            assert.ok(
              !bind.HostIp || bind.HostIp === '127.0.0.1',
              'Explicit wildcard/foreign binding',
            );
            assert.ok(scope.ports.includes(Number(bind.HostPort)), 'Unallocated native port');
            bind.HostIp = '127.0.0.1';
          }
        stage = 'container-binds';
        b.HostConfig.Binds = await Promise.all(
          (b.HostConfig.Binds ?? []).map(async (bind) => {
            const host = /^(.*):([^:]+):(ro|rw)$/.exec(bind);
            if (host && (host[1].startsWith('/') || /^[A-Za-z]:/.test(host[1]))) {
              assert.ok(url.searchParams.get('name').startsWith('supabase_kong_'));
              verifyNativeTemplateMount(environment, {
                Type: 'bind',
                Source: host[1],
                Destination: host[2],
                RW: false,
              });
              return `${host[1]}:${host[2]}:ro`;
            }
            // A destination-only Docker -v argument requests an anonymous
            // volume, not a host bind. Give it a receipted run-owned identity.
            if (!bind.includes(':')) {
              assert.ok(
                bind.startsWith('/') &&
                  bind !== '/' &&
                  path.posix.normalize(bind) === bind &&
                  !bind.includes('..'),
              );
              const name = `supabase_anonymous_${randomUUID()}_${scope.project}`;
              await ensureVolume(name);
              return name + ':' + bind;
            }
            const name = bind.split(':')[0];
            // docker -v implicitly creates missing named volumes without a
            // separate VolumeCreate request. Create and journal them explicitly
            // first, so even an interrupted one-shot job leaves ownership proof.
            await ensureVolume(name);
            return bind;
          }),
        );
        const endpoints = Object.keys(b.NetworkingConfig?.EndpointsConfig ?? {});
        assert.ok(
          endpoints.every((n) => n === scope.network || n === scope.networkName),
          'Extra native network',
        );
        b.Labels[nonceLabel] = environment.nonce;
        b.HostConfig.RestartPolicy = { Name: 'no', MaximumRetryCount: 0 };
        b.HostConfig.NanoCpus = 1e9;
        b.HostConfig.Memory = url.searchParams.get('name').startsWith('supabase_db_')
          ? 1024 ** 3
          : 256 * 1024 ** 2;
        b.HostConfig.MemorySwap = b.HostConfig.Memory;
        raw = Buffer.from(JSON.stringify(b));
        create = 'container';
      } else if (req.method === 'POST' && route === '/networks/create') {
        // The pinned CLI always issues `network create`, even for an existing
        // --network-id. Resolve only this invocation's inspected network.
        const b = JSON.parse(raw);
        assert.equal(b.Name, scope.networkName);
        assert.equal(b.Labels?.['com.supabase.cli.project'], scope.project);
        await ownNetwork();
        res.writeHead(409, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ message: `network with name ${scope.networkName} already exists` }),
        );
        return;
      } else if (req.method === 'POST' && route === '/volumes/create') {
        const b = JSON.parse(raw);
        assert.ok(
          b.Name?.endsWith('_' + scope.project) && !before.volumes.includes(b.Name),
          'Foreign/preexisting volume',
        );
        assert.ok(!b.Driver || b.Driver === 'local');
        assert.equal(Object.keys(b.DriverOpts ?? {}).length, 0);
        const existing = await fetch('GET', `/volumes/${encodeURIComponent(b.Name)}`);
        if (existing.status === 200) await ownVolume(b.Name);
        else assert.equal(existing.status, 404, 'Volume existence unknown');
        b.Labels = { ...b.Labels, [nonceLabel]: environment.nonce };
        raw = Buffer.from(JSON.stringify(b));
        create = 'volume';
      } else if (!['GET', 'HEAD'].includes(req.method)) {
        const c =
          /^\/containers\/([^/]+)(?:\/(start|stop|restart|kill|wait|exec|attach|resize|update|archive))?$/.exec(
            route,
          );
        const v = /^\/volumes\/([^/]+)$/.exec(route);
        const e = /^\/exec\/([^/]+)\/(start|resize)$/.exec(route);
        if (c) {
          const actual = await ownContainer(decodeURIComponent(c[1]));
          assert.ok(
            (req.method === 'DELETE' && !c[2]) ||
              (req.method === 'POST' && c[2]) ||
              (req.method === 'PUT' && c[2] === 'archive'),
          );
          if (req.method === 'DELETE')
            for (const mount of actual.Mounts.filter((m) => m.Type === 'volume'))
              await ownVolume(mount.Name);
          if (c[2] === 'update') throw new Error('CLI resource-limit override denied');
          action = c[2];
          actionContainer = actual.Id;
        } else if (v && req.method === 'DELETE') await ownVolume(decodeURIComponent(v[1]));
        else if (e && req.method === 'POST') {
          assert.ok(execs.has(e[1]), 'Unowned exec');
          await ownContainer(execs.get(e[1]));
        } else if (route === '/images/create' && req.method === 'POST') {
          stage = 'image-pull';
          // Docker CLI sends repo + separate tag; the SDK may put the tag
          // inside fromImage. Both must remain pinned, with no registry widening.
          const image =
            /^(?:public\.ecr\.aws\/supabase|supabase)\/[a-z0-9_-]+(?::([A-Za-z0-9_][A-Za-z0-9_.-]{0,127}))?$/.exec(
              url.searchParams.get('fromImage') ?? '',
            );
          assert.ok(image, 'Foreign image registry/reference');
          const tag = url.searchParams.get('tag') || image[1];
          assert.match(tag ?? '', /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/);
          assert.ok(!image[1] || !url.searchParams.get('tag') || image[1] === tag);
          assert.ok(tag !== 'latest' && !url.searchParams.has('fromSrc'));
        } else throw new Error('Unscoped native Docker mutation denied');
      }
      const requestId = randomUUID();
      if (create)
        record({
          requestId,
          state: 'REQUESTED',
          kind: create,
          name: create === 'container' ? url.searchParams.get('name') : JSON.parse(raw).Name,
        });
      const headers = { ...req.headers, host: 'docker', 'content-length': String(raw.length) };
      delete headers['transfer-encoding'];
      delete headers['x-shifaa-invocation'];
      const response = await upstream(req.method, url.pathname + url.search, headers, raw);
      if (create || action === 'exec') {
        const parts = [];
        for await (const part of response) parts.push(part);
        const bytes = Buffer.concat(parts);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const value = JSON.parse(bytes);
          if (create === 'volume') {
            const actual = await inspect(`/volumes/${encodeURIComponent(value.Name)}`);
            assert.equal(actual.Labels[nonceLabel], environment.nonce);
            assert.ok(!before.volumes.includes(actual.Name));
            volumes.set(actual.Name, actual);
            record({ requestId, state: 'CREATED', volume: actual });
          } else if (create === 'container') {
            const actual = await inspect(`/containers/${value.Id}/json`);
            assert.equal(actual.Config.Labels[nonceLabel], environment.nonce);
            assert.ok(!actual.State.Running && !before.containers.includes(actual.Id));
            const snapshot = identity(actual);
            containers.set(actual.Id, snapshot);
            record({ requestId, state: 'CREATED', container: snapshot });
            // Docker may create anonymous image-declared volumes as part of
            // ContainerCreate. Record them before the CLI can start/remove it.
            for (const mount of actual.Mounts.filter((m) => m.Type === 'volume')) {
              if (volumes.has(mount.Name)) continue;
              assert.ok(!before.volumes.includes(mount.Name));
              const volume = await inspect(`/volumes/${encodeURIComponent(mount.Name)}`);
              assert.ok(Date.parse(volume.CreatedAt) >= environment.startedAt);
              volumes.set(volume.Name, volume);
              record({ requestId, state: 'CREATED', parentContainer: actual.Id, volume });
            }
            await ownContainer(actual.Id);
          } else execs.set(value.Id, actionContainer);
        }
        res.writeHead(response.statusCode, response.headers);
        res.end(bytes);
      } else {
        res.writeHead(response.statusCode, response.headers);
        // docker run waits for attach headers before starting the container.
        // A quiet bootstrap stream must not hold that handshake until output.
        res.flushHeaders();
        response.pipe(res);
      }
    } catch (error) {
      record({
        state: 'DENIED',
        stage,
        method: req.method,
        route: new URL(req.url, 'http://localhost').pathname,
        check: error.code === 'ERR_ASSERTION' ? error.operator : 'request',
        ...(shape ? { shape } : {}),
      });
      // Neither engine responses nor request bodies (credentials/SQL) enter logs.
      if (!res.headersSent) res.writeHead(403, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: 'Native verification Docker request denied; preserve private creation journal',
        }),
      );
    }
  });
  // docker exec/attach use HTTP hijacking for their existing binary streams.
  // Forward only an exec created through this invocation, or an owned attach.
  server.on('upgrade', async (req, socket, head) => {
    try {
      authenticated(req);
      await engine();
      const route = new URL(req.url, 'http://localhost').pathname.replace(/^\/v\d+\.\d+/, '');
      const exec = /^\/exec\/([^/]+)\/start$/.exec(route);
      const attach = /^\/containers\/([^/]+)\/attach$/.exec(route);
      assert.equal(req.method, 'POST');
      if (exec) {
        assert.ok(execs.has(exec[1]), 'Unowned exec upgrade');
        await ownContainer(execs.get(exec[1]));
      } else {
        assert.ok(attach);
        await ownContainer(decodeURIComponent(attach[1]));
      }
      assert.ok(upgrade, 'Native stream forwarding unavailable');
      await upgrade(req, socket, head);
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
  });
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  return {
    host: `tcp://127.0.0.1:${server.address().port}`,
    authorization: `X-Shifaa-Invocation=${token}`,
    headers: { 'x-shifaa-invocation': token },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        for (const socket of sockets) socket.destroy();
      }),
  };
}

export function nativeStreamForwarder(socketPath) {
  return async (req, socket, head) => {
    const length = Number(req.headers['content-length'] ?? 0);
    assert.ok(Number.isInteger(length) && length >= 0 && length <= 1024 * 1024);
    while (head.length < length) {
      const next = await new Promise((resolve, reject) => {
        socket.once('data', resolve);
        socket.once('error', reject);
      });
      head = Buffer.concat([head, next]);
    }
    const body = head.subarray(0, length);
    const pending = head.subarray(length);
    const headers = { ...req.headers };
    delete headers['x-shifaa-invocation'];
    const request = http.request({ socketPath, path: req.url, method: req.method, headers });
    request.on('error', () => socket.destroy());
    request.on('upgrade', (response, remote, remoteHead) => {
      socket.write(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
          Object.entries(response.headers)
            .map(([key, value]) => `${key}: ${value}\r\n`)
            .join('') +
          '\r\n',
      );
      if (remoteHead.length) socket.write(remoteHead);
      if (pending.length) remote.write(pending);
      remote.pipe(socket);
      socket.pipe(remote);
      socket.once('close', () => remote.destroy());
      remote.once('error', () => socket.destroy());
    });
    request.on('response', (response) => {
      // Docker permits legacy HTTP 200 attach streams as well as 101 upgrades.
      // Present a 101 handshake to current Docker clients, preserving the raw
      // duplex stream, before docker run can issue ContainerStart.
      if (response.statusCode !== 200) {
        response.resume();
        socket.destroy();
        return;
      }
      const remote = response.socket;
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n',
      );
      if (pending.length) remote.write(pending);
      response.pipe(socket);
      socket.pipe(remote);
      socket.once('close', () => remote.destroy());
      remote.once('error', () => socket.destroy());
      response.once('error', () => socket.destroy());
    });
    request.end(body);
    socket.once('close', () => request.destroy());
  };
}

export async function runNativeCli(file, args) {
  verifyRunOutput(path.dirname(file));
  const environment = JSON.parse(readFileSync(file));
  assert.equal(environment.root, path.resolve(import.meta.dirname, '..'));
  assert.equal(path.dirname(file), environment.output);
  assert.ok(!environment.finished && !environment.failed);
  process.kill(environment.parentPid, 0);
  const endpoint = environment.postgres.endpoint;
  assert.ok(
    endpoint.startsWith('unix:///') || endpoint === 'npipe:////./pipe/dockerDesktopLinuxEngine',
  );
  const socketPath = endpoint.startsWith('unix:')
    ? endpoint.slice(7)
    : '\\\\.\\pipe\\dockerDesktopLinuxEngine';
  const upstream = (method, url, headers, body) =>
    new Promise((resolve, reject) => {
      const request = http.request({ socketPath, path: url, method, headers }, resolve);
      request.on('error', reject);
      request.end(body);
    });
  const boundary = await nativeDockerBoundary(
    environment,
    upstream,
    nativeStreamForwarder(socketPath),
  );
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(DOCKER|COMPOSE|PG|DATABASE|SUPABASE_)/i.test(key),
      ),
    );
    env.DOCKER_HOST = boundary.host;
    env.DOCKER_CUSTOM_HEADERS = boundary.authorization;
    const cli = path.join(environment.root, 'node_modules/supabase/dist/supabase.js');
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], {
        env,
        windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        timeout: 285000,
      });
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    });
  } finally {
    await boundary.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runNativeCli(process.env.SHIFAA_VERIFY_CONTEXT, process.argv.slice(2));
  } catch {
    console.error('Native verification boundary failed; preserve private receipt.');
    process.exitCode = 2;
  }
}
