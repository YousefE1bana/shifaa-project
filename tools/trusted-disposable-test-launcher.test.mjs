import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import timers from 'node:timers/promises';
import { syncBuiltinESMExports, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fixture } from './test-resource-context.test.mjs';
import { createDisposableTestRun, testSuiteFiles } from './trusted-disposable-test-launcher.mjs';
import { withTestLauncherSession, acquireTestLauncherContext } from './test-launcher-session.mjs';
import { connectTestOwner, withTestResource, guardTestHandle } from './test-resource-context.mjs';

function launcherFixture(t, scope = 'family') {
  const f = fixture(t, scope);
  const previousCommand = childProcess.execFileSync;
  const previousRandom = crypto.randomBytes;
  const effects = { lifecycle: [], sql: [], reports: [], directories: [], network: 0 };
  let mutate = () => {};
  let network;
  const options = {
    execute: 'CREATE_NEW_DISPOSABLE_RESOURCES',
    approval: 'MOCK ONLY; no resource authorization',
    worktree: f.manifest.worktree,
    revision: f.manifest.revision,
    sourceDigest: f.before.source,
    docker: {
      context: f.before.context,
      engine: f.before.engine,
      endpoint: f.before.endpoint,
      image: f.manifest.image,
    },
    scope,
    outputParent: f.before.output.canonical,
    imageReference: `example.invalid/postgres@sha256:${'a'.repeat(64)}`,
  };
  t.mock.method(crypto, 'randomBytes', (size) =>
    size === 16 ? Buffer.from(f.nonce, 'hex') : previousRandom(size),
  );
  t.mock.method(timers, 'setTimeout', async () => {});
  t.mock.method(fs, 'mkdirSync', (destination) => {
    effects.directories.push(destination);
    f.createdOutput();
  });
  t.mock.method(fs, 'writeFileSync', (destination, bytes, settings) => {
    assert.equal(settings.flag, 'wx');
    effects.reports.push({ destination, report: JSON.parse(bytes) });
  });
  t.mock.method(childProcess, 'execFileSync', (executable, args, settings) => {
    mutate(executable, args);
    if (executable === 'git' && args[0] === 'rev-parse' && args[1].includes(':')) {
      const source = fs.readFileSync(args[1].slice(args[1].indexOf(':') + 1));
      return crypto
        .createHash('sha1')
        .update(`blob ${source.length}\0`)
        .update(source)
        .digest('hex');
    }
    if (executable === 'git' && args.includes('status')) return '';
    if (executable !== 'docker') return previousCommand(executable, args, settings);
    if (args.includes('image'))
      return JSON.stringify([{ Id: f.manifest.image, RepoDigests: [options.imageReference] }]);
    if (args.includes('network') && args.includes('ls')) return '';
    if (args.includes('network') && args.includes('create')) {
      effects.lifecycle.push('network.create');
      const name = args.at(-1);
      network = {
        Id: 'f'.repeat(64),
        Name: name,
        Driver: 'bridge',
        Internal: true,
        Scope: 'local',
        Options: {},
        Containers: {},
        Created: new Date().toISOString(),
        Labels: f.current.container.Config.Labels,
      };
      // Docker may leave endpoint NetworkID empty until the container starts.
      // Pre-start admission must bind the configured namespace instead.
      f.current.container.HostConfig.NetworkMode = network.Id;
      f.current.container.NetworkSettings.Networks = { [name]: { NetworkID: '' } };
      return network.Id;
    }
    if (args.includes('network') && args.includes('inspect')) return JSON.stringify([network]);
    if (args.includes('volume') && args.includes('create')) {
      effects.lifecycle.push('volume.create');
      f.current.volumeMetadata[0].Name = args.at(-1);
      f.current.volumeMetadata[0].CreatedAt = new Date().toISOString();
      f.current.container.Mounts[0].Name = args.at(-1);
      return args.at(-1);
    }
    if (args.includes('compose')) {
      effects.lifecycle.push('container.create');
      const compose = JSON.parse(settings.input);
      assert.equal(compose.services.postgres.image, options.imageReference);
      assert.equal(compose.volumes.data.external, true);
      assert.equal(compose.networks.private.external, true);
      assert.equal(compose.services.postgres.ports[0].host_ip, '127.0.0.1');
      assert.equal(compose.services.postgres.ports[0].published, '0');
      f.current.container.Created = new Date().toISOString();
      f.current.container.State.Running = false;
      f.current.container.HostConfig.PortBindings = {
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }],
      };
      return '';
    }
    if (args.includes('ps') && args.includes('--filter')) return f.manifest.container;
    if (args.includes('start')) {
      effects.lifecycle.push('container.start');
      f.current.container.State.Running = true;
      f.current.container.NetworkSettings.Networks[network.Name].NetworkID = network.Id;
      network.Containers = { [f.manifest.container]: { Name: 'mock-container' } };
      return f.manifest.container;
    }
    if (args.includes('exec')) {
      if (args.includes('/proc/1/comm')) return 'postgres';
      if (args.includes('psql')) effects.sql.push(settings.input);
      else assert.ok(args.includes('pg_isready'));
      return '';
    }
    if (args.includes('rm')) {
      effects.lifecycle.push(
        args.includes('volume')
          ? 'volume.rm'
          : args.includes('network')
            ? 'network.rm'
            : 'container.rm',
      );
      if (!args.includes('volume') && !args.includes('network')) network.Containers = {};
      return '';
    }
    return previousCommand(executable, args, settings);
  });
  syncBuiltinESMExports();
  return {
    ...f,
    options,
    launcherEffects: effects,
    mutate: (callback) => {
      mutate = callback;
    },
    network: () => network,
  };
}

for (const scope of ['family', 'privacy', 'discovery-sos']) {
  test(`actual Node/tsx ${scope} entrypoints reach the in-process provider with all effects denied`, () => {
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const result = childProcess.execFileSync(
      process.execPath,
      ['--import', loader, 'tools/test-launcher-entrypoint-probe.mjs', scope],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.match(result, /"connections":0,"processes":0/);
  });
}

test('launcher rejects absent runtime approval before any resource observer or creation', async () => {
  await assert.rejects(createDisposableTestRun(), /separate explicit runtime approval/);
  await assert.rejects(acquireTestLauncherContext('family'), /trusted in-process/);
});

test('launcher refuses a different source worktree before observing resources', async (t) => {
  const f = launcherFixture(t);
  f.options.worktree += '-substituted';
  await assert.rejects(createDisposableTestRun(f.options), /another worktree/);
  assert.deepEqual(f.launcherEffects.lifecycle, []);
  assert.equal(f.effects.clients, 0);
});

test('unbound pre-start namespace rejects before container start or PostgreSQL', async (t) => {
  const f = launcherFixture(t);
  f.mutate((_executable, args) => {
    if (args.includes('inspect') && f.current.container.State.Running === false)
      f.current.container.HostConfig.NetworkMode = 'bridge';
  });
  await assert.rejects(createDisposableTestRun(f.options), /preserve resources/);
  assert.ok(!f.launcherEffects.lifecycle.includes('container.start'));
  assert.equal(f.launcherEffects.sql.length, 0);
  assert.equal(f.effects.clients, 0);
});

test('running namespace requires its resolved endpoint identity before PostgreSQL', async (t) => {
  const f = launcherFixture(t);
  f.mutate((_executable, args) => {
    if (args.includes('inspect') && f.launcherEffects.lifecycle.includes('container.start'))
      f.current.container.NetworkSettings.Networks[f.network().Name].NetworkID = '';
  });
  await assert.rejects(createDisposableTestRun(f.options), /preserve resources/);
  assert.equal(f.launcherEffects.sql.length, 0);
  assert.equal(f.effects.clients, 0);
});

test('mocked fresh launcher bootstraps only its admitted target and passes real WeakMap capability', async (t) => {
  const f = launcherFixture(t);
  const run = await createDisposableTestRun(f.options);
  assert.deepEqual(f.launcherEffects.lifecycle, [
    'network.create',
    'volume.create',
    'container.create',
    'container.start',
  ]);
  assert.equal(f.launcherEffects.sql.length, 1);
  assert.match(f.launcherEffects.sql[0], /NOBYPASSRLS/);
  assert.match(
    f.launcherEffects.sql[0],
    /ALTER ROLE shifaa_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS/,
  );
  assert.match(f.launcherEffects.sql[0], new RegExp(`test_${f.nonce}`));
  assert.doesNotMatch(f.launcherEffects.sql[0], /^\\ir/m);
  assert.equal(f.effects.clients, 0, 'bootstrap admission constructs no PostgreSQL SDK');
  await withTestLauncherSession(
    'family',
    async () => run.capability,
    async () => {
      const capability = await acquireTestLauncherContext('family');
      const owner = await connectTestOwner(capability, 'family', f.factory);
      const api = await withTestResource(capability, 'family', 'api', async (url) => ({
        inject: () => url,
        close: async () => {},
      }));
      assert.match(
        guardTestHandle(capability, 'family', api, ['inject']).inject(),
        /127.0.0.1:65433/,
      );
      await owner.end();
      await assert.rejects(acquireTestLauncherContext('privacy'), /trusted in-process/);
    },
  );
  await assert.rejects(acquireTestLauncherContext('family'), /trusted in-process/);
  const reports = JSON.stringify(f.launcherEffects.reports);
  assert.doesNotMatch(
    reports,
    /postgresql:|POSTGRES_PASSWORD|synthetic_owner|mock-only|CREATE ROLE|field_values/,
  );
  assert.equal(f.launcherEffects.reports[0].report.realIntegrationAccepted, false);
  await run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`);
  assert.deepEqual(f.launcherEffects.lifecycle.slice(-3), [
    'container.rm',
    'volume.rm',
    'network.rm',
  ]);
});

for (const [name, change] of [
  [
    'wrong engine',
    (f) => {
      f.current.engine = 'substituted';
    },
  ],
  [
    'wrong endpoint',
    (f) => {
      f.current.endpoint = 'substituted';
    },
  ],
  [
    'source drift',
    (f) => {
      f.current.source = '0'.repeat(64);
    },
  ],
  [
    'wrong image',
    (f) => {
      f.current.container.Image = `sha256:${'0'.repeat(64)}`;
    },
  ],
  [
    'inherited Compose labels',
    (f) => {
      f.current.container.Config.Labels['com.docker.compose.project'] = 'shifaa-local-postgres';
    },
  ],
  [
    'bind mount',
    (f) => {
      f.current.container.HostConfig.Binds = ['/shared:/workspace'];
    },
  ],
  [
    'host networking',
    (f) => {
      f.current.container.HostConfig.NetworkMode = 'host';
    },
  ],
  [
    'privileged',
    (f) => {
      f.current.container.HostConfig.Privileged = true;
    },
  ],
  [
    'shared volume',
    (f) => {
      f.current.volumeMetadata[0].Mountpoint = '/existing/shared';
    },
  ],
  [
    'unknown mount',
    (f) => {
      f.current.container.Mounts.push({ Type: 'bind' });
    },
  ],
  [
    'shared network',
    (f) => {
      f.network().Internal = false;
    },
  ],
  [
    'extra network',
    (f) => {
      f.current.container.NetworkSettings.Networks.extra = { NetworkID: 'shared' };
    },
  ],
  [
    'shared port 5432',
    (f) => {
      f.current.container.NetworkSettings.Ports['5432/tcp'][0].HostPort = '5432';
    },
  ],
  [
    'shared port 54322',
    (f) => {
      f.current.container.NetworkSettings.Ports['5432/tcp'][0].HostPort = '54322';
    },
  ],
  [
    'audit port 55432',
    (f) => {
      f.current.container.NetworkSettings.Ports['5432/tcp'][0].HostPort = '55432';
    },
  ],
  [
    'alternate host',
    (f) => {
      f.current.container.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
    },
  ],
]) {
  test(`launcher rejects ${name} before bootstrap with zero PostgreSQL clients`, async (t) => {
    const f = launcherFixture(t);
    let changed = false;
    f.mutate((_executable, args) => {
      if (
        !changed &&
        args.includes('inspect') &&
        !args.includes('image') &&
        f.launcherEffects.lifecycle.includes('container.start')
      ) {
        changed = true;
        change(f);
      }
    });
    await assert.rejects(createDisposableTestRun(f.options), /test-launcher-denied/);
    assert.equal(f.launcherEffects.sql.length, 0);
    assert.equal(f.effects.clients, 0);
    assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
  });
}

test('missing identity preflight performs zero Docker lifecycle or SQL', async (t) => {
  const f = launcherFixture(t);
  f.options.docker.engine = 'unknown';
  await assert.rejects(createDisposableTestRun(f.options), /engine or endpoint/);
  assert.deepEqual(f.launcherEffects.lifecycle, []);
  assert.deepEqual(f.launcherEffects.sql, []);
});

for (const boundary of ['network', 'volume', 'compose', 'start', 'pg_isready', 'psql']) {
  test(`partial failure at ${boundary} preserves resources without automatic retry/cleanup`, async (t) => {
    const f = launcherFixture(t);
    f.mutate((_executable, args) => {
      if (args.includes(boundary) && !args.includes('ls') && !args.includes('inspect'))
        throw Object.assign(new Error('secret password must never escape'), { code: 'ETIMEDOUT' });
    });
    await assert.rejects(createDisposableTestRun(f.options), /preserve resources/);
    assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
    assert.doesNotMatch(JSON.stringify(f.launcherEffects.reports), /secret password/);
  });
}

test('pre-creation abort preserves resources with zero lifecycle commands', async (t) => {
  const f = launcherFixture(t);
  f.options.signal = AbortSignal.abort();
  await assert.rejects(createDisposableTestRun(f.options), /preserve resources/);
  assert.deepEqual(f.launcherEffects.lifecycle, []);
});

for (const [name, change] of [
  [
    'container replacement',
    (f) => {
      f.current.container.Id = 'e'.repeat(64);
    },
  ],
  [
    'network ownership loss',
    (f) => {
      f.network().Labels = {};
    },
  ],
  [
    'output replacement',
    (f) => {
      f.current.output.identity.ino = '999999';
    },
  ],
  [
    'source drift',
    (f) => {
      f.current.source = '0'.repeat(64);
    },
  ],
]) {
  test(`teardown rejects ${name} without removing any resource`, async (t) => {
    const f = launcherFixture(t);
    const run = await createDisposableTestRun(f.options);
    change(f);
    await assert.rejects(run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`));
    assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
  });
}

test('forged provider output and nested session confer no authority', async () => {
  await withTestLauncherSession(
    'family',
    async () => ({}),
    async () => {
      await assert.rejects(acquireTestLauncherContext('family'), /test-resource-denied/);
      await assert.rejects(
        withTestLauncherSession(
          'family',
          () => {},
          () => {},
        ),
        /nested session/,
      );
    },
  );
});

test('suite discovery includes every existing scoped entrypoint and no unrelated test', () => {
  assert.equal(testSuiteFiles('discovery-sos').length, 6);
  assert.equal(testSuiteFiles('family').length, 3);
  assert.equal(testSuiteFiles('privacy').length, 4);
  for (const scope of ['discovery-sos', 'family', 'privacy'])
    for (const file of testSuiteFiles(scope)) assert.ok(fs.existsSync(file), file);
  assert.deepEqual(testSuiteFiles('unknown'), []);
});

test('same capability cannot be consumed by another harness or another launcher session', async (t) => {
  const f = launcherFixture(t);
  const run = await createDisposableTestRun(f.options);
  await withTestLauncherSession(
    'family',
    async () => run.capability,
    async () => {
      await acquireTestLauncherContext('family');
      await assert.rejects(acquireTestLauncherContext('family'), /reused harness/);
    },
  );
  await withTestLauncherSession(
    'family',
    async () => run.capability,
    async () => {
      await assert.rejects(acquireTestLauncherContext('family'), /reused harness/);
    },
  );
  assert.equal(f.effects.clients, 0);
});

for (const boundary of ['volume', 'network']) {
  test(`ownership loss after container removal preserves the remaining ${boundary}`, async (t) => {
    const f = launcherFixture(t);
    const run = await createDisposableTestRun(f.options);
    f.mutate((_exe, args) => {
      if (
        f.launcherEffects.lifecycle.includes('container.rm') &&
        args.includes(boundary) &&
        args.includes('inspect')
      ) {
        if (boundary === 'volume') f.current.volumeMetadata[0].Labels = {};
        else f.network().Created = new Date(0).toISOString();
      }
    });
    await assert.rejects(
      run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`),
      /preserve remaining resources/,
    );
    assert.ok(!f.launcherEffects.lifecycle.includes(`${boundary}.rm`));
    await assert.rejects(run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`));
  });
}

for (const operation of ['query', 'inject', 'processNext']) {
  test(`live ${operation} detects network substitution before its effect`, async (t) => {
    const f = launcherFixture(t);
    const run = await createDisposableTestRun(f.options);
    const owner = await connectTestOwner(run.capability, 'family', f.factory);
    let effects = 0;
    const target = guardTestHandle(
      run.capability,
      'family',
      {
        [operation]: () => {
          effects++;
        },
        close: async () => {},
      },
      [operation],
    );
    f.network().Id = 'b'.repeat(64);
    if (operation === 'query') await assert.rejects(async () => owner`select 1`);
    else assert.throws(() => target[operation]());
    assert.equal(effects, 0);
    await owner.end();
  });
}

for (const target of ['projects', 'networkNames', 'volumes']) {
  test(`preexisting ${target} collision rejects before resource creation`, async (t) => {
    const f = launcherFixture(t);
    const previous = childProcess.execFileSync;
    t.mock.method(childProcess, 'execFileSync', (exe, args, options) => {
      const match =
        target === 'projects'
          ? args.includes('{{.Label "com.docker.compose.project"}}')
          : target === 'networkNames'
            ? args.includes('{{.Name}}')
            : args.includes('volume') && args.includes('ls');
      if (exe === 'docker' && match)
        return `shifaa-test-${f.nonce}${target === 'networkNames' ? '-net' : target === 'volumes' ? '-data' : ''}`;
      return previous(exe, args, options);
    });
    syncBuiltinESMExports();
    await assert.rejects(createDisposableTestRun(f.options));
    assert.deepEqual(f.launcherEffects.lifecycle, []);
    assert.equal(f.effects.clients, 0);
  });
}

test('dirty source checkout rejects before resource creation', async (t) => {
  const f = launcherFixture(t);
  const previous = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (exe, args, options) =>
    exe === 'git' && args.includes('status') ? ' M source.ts' : previous(exe, args, options),
  );
  syncBuiltinESMExports();
  await assert.rejects(createDisposableTestRun(f.options));
  assert.deepEqual(f.launcherEffects.lifecycle, []);
});

test('captured bootstrap bytes must match the exact approved Git blob before any creation', async (t) => {
  const f = launcherFixture(t);
  const previous = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (exe, args, options) =>
    exe === 'git' && args[0] === 'rev-parse' && args[1].includes(':')
      ? '0'.repeat(40)
      : previous(exe, args, options),
  );
  syncBuiltinESMExports();
  await assert.rejects(createDisposableTestRun(f.options), /bootstrap bytes differ/);
  assert.deepEqual(f.launcherEffects.lifecycle, []);
  assert.deepEqual(f.launcherEffects.sql, []);
  assert.equal(f.effects.clients, 0);
});

test('aborted teardown preserves all resources', async (t) => {
  const f = launcherFixture(t);
  const controller = new AbortController();
  f.options.signal = controller.signal;
  const run = await createDisposableTestRun(f.options);
  controller.abort();
  await assert.rejects(run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`));
  assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
});
