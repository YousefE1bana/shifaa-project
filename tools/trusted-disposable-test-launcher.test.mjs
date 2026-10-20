import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import timers from 'node:timers/promises';
import path from 'node:path';
import { syncBuiltinESMExports, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fixture } from './test-resource-context.test.mjs';
import {
  createDisposableTestRun,
  runDisposableTestSuite,
  testSuiteFiles,
} from './trusted-disposable-test-launcher.mjs';
import {
  withTestLauncherSession,
  acquireTestLauncherContext,
  releaseTestLauncherContext,
  isTestLauncherContextReleased,
  trackTestLauncherClose,
} from './test-launcher-session.mjs';
import { connectTestOwner, withTestResource, guardTestHandle } from './test-resource-context.mjs';

const systemCommand = childProcess.execFileSync;
const originalPackage = systemCommand(
  'git',
  ['cat-file', 'blob', 'f205a80ae41b5507afaa1a7868fbbc8e84deb217'],
  { encoding: 'utf8', windowsHide: true },
);

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
  const imageObservation = { Id: f.manifest.image, RepoDigests: [options.imageReference] };
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
    if (executable === 'git' && args[0] === 'cat-file') return originalPackage;
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
    if (args.includes('image')) return JSON.stringify([imageObservation]);
    if (args.includes('network') && args.includes('ls')) return '';
    if (args.includes('network') && args.includes('create')) {
      effects.lifecycle.push('network.create');
      const name = args.at(-1);
      network = {
        Id: 'f'.repeat(64),
        Name: name,
        Driver: 'bridge',
        Internal: args.includes('--internal'),
        Scope: 'local',
        Options: {
          'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1',
          'com.docker.network.bridge.enable_icc': 'false',
        },
        Containers: {},
        Status: {
          IPAM: { Subnets: { '172.25.0.0/16': { IPsInUse: 2, DynamicIPsAvailable: 251 } } },
        },
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
      if (options.resourceBudget) {
        assert.equal(compose.services.postgres.cpus, 2);
        assert.equal(compose.services.postgres.mem_limit, 1024 * 1024 * 1024);
        assert.equal(compose.services.postgres.memswap_limit, 1024 * 1024 * 1024);
        Object.assign(f.current.container.HostConfig, {
          NanoCpus: compose.services.postgres.cpus * 1_000_000_000,
          Memory: compose.services.postgres.mem_limit,
          MemorySwap: compose.services.postgres.memswap_limit,
          PidsLimit: compose.services.postgres.pids_limit,
          ShmSize: compose.services.postgres.shm_size,
          LogConfig: {
            Type: compose.services.postgres.logging.driver,
            Config: compose.services.postgres.logging.options,
          },
        });
      }
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
      if (network.Internal) f.current.container.NetworkSettings.Ports = {};
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
    imageObservation,
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

test('aggregate immutable local image ID is accepted without a repository digest', async (t) => {
  const f = launcherFixture(t, 'discovery-sos');
  f.options.imageReference = f.manifest.image;
  f.imageObservation.RepoDigests = [];
  const run = await createDisposableTestRun(f.options);
  assert.ok(run.capability);
  assert.ok(f.launcherEffects.lifecycle.includes('container.start'));
});

for (const pin of ['local image ID', 'repository digest']) {
  test(`substituted ${pin} is rejected before resource creation`, async (t) => {
    const f = launcherFixture(t);
    if (pin === 'local image ID') {
      f.options.imageReference = f.manifest.image;
      f.imageObservation.Id = `sha256:${'0'.repeat(64)}`;
    } else f.imageObservation.RepoDigests = [];
    await assert.rejects(
      createDisposableTestRun(f.options),
      /immutable image not locally verified/,
    );
    assert.deepEqual(f.launcherEffects.lifecycle, []);
    assert.deepEqual(f.launcherEffects.sql, []);
    assert.equal(f.effects.clients, 0);
  });
}

test('launcher refuses a different source worktree before observing resources', async (t) => {
  const f = launcherFixture(t);
  f.options.worktree += '-substituted';
  await assert.rejects(createDisposableTestRun(f.options), /another worktree/);
  assert.deepEqual(f.launcherEffects.lifecycle, []);
  assert.equal(f.effects.clients, 0);
});

test('equivalent path spelling is canonicalized before source walks and capability binding', async (t) => {
  const f = launcherFixture(t);
  f.options.worktree += path.sep + '.' + path.sep;
  f.options.outputParent += path.sep + '.' + path.sep;
  const run = await createDisposableTestRun(f.options);
  assert.ok(run.capability);
  assert.equal(f.launcherEffects.sql.length, 1);
  const bootstrap = f.launcherEffects.sql[0];
  assert.ok(bootstrap.startsWith('DO $shifaa_bootstrap_identity$'));
  assert.ok(
    bootstrap.includes(
      `IF current_database() <> 'test_${f.nonce}' OR current_user <> 'shifaa_owner' THEN`,
    ),
  );
  assert.match(bootstrap, /RAISE EXCEPTION 'test bootstrap database or role identity mismatch'/);
  const rolesStart = bootstrap.indexOf('CREATE ROLE shifaa_api');
  assert.ok(bootstrap.indexOf('ALTER DATABASE') < rolesStart);
  assert.ok(bootstrap.indexOf("SELECT set_config('shifaa.test_run_nonce'") < rolesStart);
  assert.ok(bootstrap.indexOf("set_config('shifaa.test_source_digest'") < rolesStart);
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
  const completedBootstrap = f.launcherEffects.reports.find(
    ({ report }) => report.status === 'BOOTSTRAPPED_NOT_ACCEPTED',
  );
  assert.equal(completedBootstrap.report.bootstrapIdentityGuardPassed, true);
  assert.equal(completedBootstrap.report.database, `test_${f.nonce}`);
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
      f.network().Options['com.docker.network.bridge.host_binding_ipv4'] = '0.0.0.0';
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

test('ordinary dirty outputs are allowed while the captured source fingerprint stays exact', async (t) => {
  const f = launcherFixture(t);
  const previous = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (exe, args, options) =>
    exe === 'git' && args.includes('status') ? ' M source.ts' : previous(exe, args, options),
  );
  syncBuiltinESMExports();
  const run = await createDisposableTestRun(f.options);
  assert.ok(run);
  assert.ok(f.launcherEffects.lifecycle.length > 0);
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

for (const [field, invalid] of [
  ['NanoCpus', 0],
  ['Memory', 2 * 1024 * 1024 * 1024],
  ['MemorySwap', -1],
  ['PidsLimit', 0],
  ['ShmSize', 128 * 1024 * 1024],
  ['LogConfig', { Type: 'json-file', Config: {} }],
]) {
  test(`budget rejects unapplied ${field} before container start or SQL`, async (t) => {
    const f = launcherFixture(t);
    f.options.resourceBudget = 'SEQUENTIAL_2CPU_1GIB';
    f.mutate((_exe, args) => {
      if (args.includes('inspect') && f.launcherEffects.lifecycle.includes('container.create'))
        f.current.container.HostConfig[field] = invalid;
    });
    await assert.rejects(createDisposableTestRun(f.options), /preserve resources/);
    assert.ok(!f.launcherEffects.lifecycle.includes('container.start'));
    assert.equal(f.launcherEffects.sql.length, 0);
    assert.equal(f.effects.clients, 0);
    assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
  });
}

test('bounded run rechecks limits after admission and preserves storage quota limitation', async (t) => {
  const f = launcherFixture(t);
  f.options.resourceBudget = 'SEQUENTIAL_2CPU_1GIB';
  const run = await createDisposableTestRun(f.options);
  assert.equal(f.launcherEffects.reports.at(-1).report.storageQuotaEnforced, false);
  f.current.container.HostConfig.LogConfig.Config = { 'max-file': '2', 'max-size': '10m' };
  run.checkpoint();
  f.current.container.HostConfig.MemorySwap = -1;
  assert.throws(() => run.checkpoint(), /resource limits not applied/);
  await assert.rejects(run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`));
  assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
});

test('release receipt requires consumed capability and every registered handle close to succeed', async (t) => {
  const f = launcherFixture(t);
  const run = await createDisposableTestRun(f.options);
  assert.throws(() => releaseTestLauncherContext('family', run.capability), /unconsumed/);
  await withTestLauncherSession(
    'family',
    async () => run.capability,
    async () => {
      const context = await acquireTestLauncherContext('family');
      let failClose = true;
      const close = trackTestLauncherClose('family', context, async () => {
        if (failClose) throw new Error('mock close failure');
      });
      assert.throws(() => releaseTestLauncherContext('family', context), /handles still open/);
      await assert.rejects(close(), /mock close failure/);
      assert.throws(() => releaseTestLauncherContext('family', context), /handles still open/);
      failClose = false;
      await close();
      releaseTestLauncherContext('family', context);
      assert.equal(isTestLauncherContextReleased(context), true);
      assert.throws(() => releaseTestLauncherContext('family', context), /already released/);
    },
  );
  assert.equal(run.released, true);
  await run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`);
  assert.equal(run.closed, true);
  assert.deepEqual(f.launcherEffects.lifecycle.slice(-3), [
    'container.rm',
    'volume.rm',
    'network.rm',
  ]);
});

test('ownership failure never becomes a release receipt', async (t) => {
  const f = launcherFixture(t);
  const run = await createDisposableTestRun(f.options);
  await withTestLauncherSession(
    'family',
    async () => run.capability,
    async () => {
      await acquireTestLauncherContext('family');
      f.current.container.Id = 'e'.repeat(64);
      assert.throws(
        () => releaseTestLauncherContext('family', run.capability),
        /test-resource-denied/,
      );
      assert.equal(run.released, false);
    },
  );
  assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
});

test('session rejects concurrent acquisition while an earlier provider is unresolved', async () => {
  let finishAcquire;
  const pending = new Promise((resolve) => {
    finishAcquire = resolve;
  });
  await withTestLauncherSession(
    'family',
    async () => pending,
    async () => {
      const first = acquireTestLauncherContext('family');
      await assert.rejects(acquireTestLauncherContext('family'), /concurrent harness acquisition/);
      finishAcquire({});
      await assert.rejects(first, /test-resource-denied/);
    },
  );
});

test('aggregate budget requires explicit sequential cleanup before any effects', async (t) => {
  const f = launcherFixture(t);
  f.options.resourceBudget = 'SEQUENTIAL_2CPU_1GIB';
  await assert.rejects(runDisposableTestSuite(f.options), /explicit sequential cleanup/);
  f.options.resourceBudget = 'unapproved';
  await assert.rejects(createDisposableTestRun(f.options), /unknown resource budget/);
  assert.deepEqual(f.launcherEffects.lifecycle, []);
});

for (const events of [[], [{ type: 'test:pass' }], [{ type: 'test:fail' }]]) {
  test(`suite without a lease cannot pass with events ${JSON.stringify(events)}`, async (t) => {
    const f = launcherFixture(t);
    t.mock.method(test, 'run', () =>
      (async function* () {
        yield* events;
      })(),
    );
    const completed = await runDisposableTestSuite(f.options);
    assert.equal(completed.passed, false);
    assert.deepEqual(f.launcherEffects.lifecycle, []);
  });
}

for (const [name, event] of [
  ['skipped pass', { type: 'test:pass', data: { skip: true } }],
  ['skipped pass with empty reason', { type: 'test:pass', data: { skip: '' } }],
  ['todo pass', { type: 'test:pass', data: { todo: 'pending obligation' } }],
  ['cancelled outcome', { type: 'test:pass', data: { cancelled: true } }],
  ['canceled outcome', { type: 'test:pass', data: { canceled: true } }],
  ['cancelled event', { type: 'test:cancelled' }],
  ['failed event', { type: 'test:fail' }],
  ['skipped summary', { type: 'test:summary', data: { counts: { skipped: 1 } } }],
  ['todo summary', { type: 'test:summary', data: { counts: { todo: 1 } } }],
  ['cancelled summary', { type: 'test:summary', data: { counts: { cancelled: 1 } } }],
  ['canceled summary', { type: 'test:summary', data: { counts: { canceled: 1 } } }],
  ['failed summary', { type: 'test:summary', data: { success: false } }],
]) {
  test(`lease-backed suite cannot pass a ${name}`, async (t) => {
    const f = launcherFixture(t);
    f.options.cleanup = 'REMOVE_RELEASED_RUNS_BEFORE_NEXT_LEASE';
    t.mock.method(test, 'run', () =>
      (async function* () {
        const context = await acquireTestLauncherContext('family');
        releaseTestLauncherContext('family', context);
        yield { type: 'test:pass' };
        yield event;
      })(),
    );
    const completed = await runDisposableTestSuite(f.options);
    assert.equal(completed.passed, false);
    assert.equal(completed.passedTests, 1);
    assert.equal(completed.failedTests, event.type === 'test:fail' ? 1 : 0);
    assert.equal(completed.runs.length, 1);
    assert.equal(completed.runs[0].closed, true);
  });
}

test('actual approved aggregate SQL sources all expand before mocked engine denial', async (t) => {
  const revision = systemCommand('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const sqlFiles = [
    ...new Set(
      ['db:test', 'db:rls-test', 'test:discovery-sos:db'].flatMap((id) =>
        [
          ...JSON.parse(originalPackage).scripts[id].matchAll(
            /\/workspace\/(infra\/db\/tests\/[a-z0-9_-]+\.sql)/g,
          ),
        ].map((match) => match[1]),
      ),
    ),
  ];
  const sourceFiles = new Set();
  const gitCommands = [];
  const dockerAttempts = [];
  t.mock.method(childProcess, 'execFileSync', (exe, args, settings) => {
    if (exe === 'docker') {
      dockerAttempts.push(args);
      throw new Error('static source preparation ends before engine observation');
    }
    assert.equal(exe, 'git');
    gitCommands.push(args);
    if (args[0] === 'rev-parse' && args[1].startsWith(revision + ':'))
      sourceFiles.add(args[1].slice(41));
    return systemCommand(exe, args, settings);
  });
  syncBuiltinESMExports();
  await assert.rejects(
    createDisposableTestRun({
      execute: 'CREATE_NEW_DISPOSABLE_RESOURCES',
      approval: 'STATIC SOURCE PREPARATION ONLY; NO RESOURCES',
      worktree: process.cwd(),
      revision,
      sourceDigest: 'a'.repeat(64),
      scope: 'family',
      outputParent: path.resolve(process.cwd(), '..'),
      imageReference: `example.invalid/postgres@sha256:${'a'.repeat(64)}`,
      docker: {
        context: 'MOCK-DENIED',
        engine: 'MOCK-DENIED',
        endpoint: 'MOCK-DENIED',
        image: `sha256:${'a'.repeat(64)}`,
      },
      bootstrap: 'aggregate-baseline',
      bootstrapSqlFiles: sqlFiles,
    }),
    /command failed/,
  );
  assert.equal(
    [...sourceFiles].filter((file) => file.startsWith('supabase/migrations/')).length,
    26,
    JSON.stringify(gitCommands),
  );
  assert.ok(sourceFiles.has('infra/db/migrations/001_identity_onboarding.sql'));
  assert.ok(sqlFiles.every((file) => sourceFiles.has(file)));
  assert.ok(sourceFiles.has('infra/db/fixtures/discovery-sos.sql'));
  assert.ok(sourceFiles.has('infra/db/policies/001_identity_onboarding_rls.sql'));
  assert.equal(dockerAttempts.length, 1);
  assert.deepEqual(dockerAttempts[0], ['context', 'inspect', 'MOCK-DENIED']);
});

for (const released of [false, true]) {
  test(`sequential suite ${released ? 'removes a released final lease' : 'preserves an unreleased final lease'}`, async (t) => {
    const f = launcherFixture(t);
    f.options.resourceBudget = 'SEQUENTIAL_2CPU_1GIB';
    f.options.cleanup = 'REMOVE_RELEASED_RUNS_BEFORE_NEXT_LEASE';
    t.mock.method(test, 'run', () =>
      (async function* () {
        const context = await acquireTestLauncherContext('family');
        if (released) releaseTestLauncherContext('family', context);
        yield { type: 'test:pass' };
      })(),
    );
    if (released) {
      const completed = await runDisposableTestSuite(f.options);
      assert.equal(completed.passedTests, 1);
      assert.equal(completed.runs[0].closed, true);
      assert.deepEqual(f.launcherEffects.lifecycle.slice(-3), [
        'container.rm',
        'volume.rm',
        'network.rm',
      ]);
    } else {
      await assert.rejects(runDisposableTestSuite(f.options), /handles and lease must be released/);
      assert.ok(!f.launcherEffects.lifecycle.some((operation) => operation.endsWith('.rm')));
    }
  });
}

for (const released of [false, true]) {
  test(`next lease ${released ? 'disposes its predecessor before admission' : 'rejects while its predecessor is unreleased'}`, async (t) => {
    const f = launcherFixture(t);
    f.options.cleanup = 'REMOVE_RELEASED_RUNS_BEFORE_NEXT_LEASE';
    let admittedAgain = false;
    f.mutate((_exe, args) => {
      if (args.includes('image') && f.launcherEffects.sql.length) {
        admittedAgain = true;
        assert.deepEqual(f.launcherEffects.lifecycle.slice(-3), [
          'container.rm',
          'volume.rm',
          'network.rm',
        ]);
      }
    });
    t.mock.method(test, 'run', () =>
      (async function* () {
        const context = await acquireTestLauncherContext('family');
        if (released) releaseTestLauncherContext('family', context);
        // This single-target fixture deliberately cannot admit a second database.
        // Reaching the second admission must nevertheless follow exact disposal.
        await assert.rejects(
          acquireTestLauncherContext('family'),
          released
            ? /test-resource-denied|test-launcher-denied/
            : /handles and lease must be released/,
        );
        if (!released) releaseTestLauncherContext('family', context);
        yield { type: 'test:pass' };
      })(),
    );
    const completed = await runDisposableTestSuite(f.options);
    assert.equal(admittedAgain, released);
    assert.equal(completed.runs.length, 1);
    assert.equal(completed.runs[0].closed, true);
  });
}

test('aggregate bootstrap binds all 27 original migrations and selected SQL tests before privilege drop', async (t) => {
  const f = launcherFixture(t);
  f.options.bootstrap = 'aggregate-baseline';
  f.options.bootstrapSqlFiles = [
    'infra/db/tests/discovery-sos-schema.sql',
    'infra/db/tests/discovery-sos-rls.sql',
  ];
  const run = await createDisposableTestRun(f.options);
  assert.deepEqual(run.sqlTests, f.options.bootstrapSqlFiles);
  const sql = f.launcherEffects.sql[0];
  assert.doesNotMatch(sql, /^\\ir/m);
  assert.ok(sql.lastIndexOf('ROLLBACK;') < sql.indexOf('ALTER ROLE shifaa_owner NOSUPERUSER'));
  const completed = f.launcherEffects.reports.at(-1).report;
  assert.equal(
    completed.bootstrap.filter(({ path: file }) => file.startsWith('supabase/migrations/')).length,
    26,
  );
  assert.ok(
    completed.bootstrap.some(({ path: file }) => file === 'infra/db/fixtures/discovery-sos.sql'),
  );
  assert.equal(completed.sqlTestsBeforePrivilegeDrop, true);
  assert.deepEqual(completed.sqlTests, f.options.bootstrapSqlFiles);
  assert.equal(f.effects.clients, 0);
});

for (const files of [
  ['../../unapproved.sql'],
  ['infra/db/tests/feature-011-schema.sql'],
  [
    'infra/db/tests/identity-onboarding-schema.sql',
    'infra/db/tests/identity-onboarding-schema.sql',
  ],
]) {
  test(`aggregate rejects unapproved or duplicate SQL test list ${JSON.stringify(files)}`, async (t) => {
    const f = launcherFixture(t);
    f.options.bootstrap = 'aggregate-baseline';
    f.options.bootstrapSqlFiles = files;
    await assert.rejects(createDisposableTestRun(f.options), /unapproved or duplicate/);
    assert.deepEqual(f.launcherEffects.lifecycle, []);
    assert.deepEqual(f.launcherEffects.sql, []);
  });
}

for (const [name, source] of [
  ['escape', '\\ir ../../../../outside.sql'],
  ['cycle', '\\ir identity-onboarding-schema.sql'],
  ['command', '\\! echo forbidden'],
]) {
  test(`aggregate rejects Git-bound SQL include ${name} before creating resources`, async (t) => {
    const f = launcherFixture(t);
    f.options.bootstrap = 'aggregate-baseline';
    f.options.bootstrapSqlFiles = ['infra/db/tests/identity-onboarding-schema.sql'];
    const previous = fs.readFileSync;
    t.mock.method(fs, 'readFileSync', (file, ...args) =>
      path.resolve(String(file)) === path.resolve('infra/db/tests/identity-onboarding-schema.sql')
        ? Buffer.from(source)
        : previous(file, ...args),
    );
    syncBuiltinESMExports();
    await assert.rejects(
      createDisposableTestRun(f.options),
      /SQL include escape or cycle|unreviewed aggregate meta-command/,
    );
    assert.deepEqual(f.launcherEffects.lifecycle, []);
    assert.deepEqual(f.launcherEffects.sql, []);
  });
}

// Docker 29 internal bridges suppress the host publication needed by Node clients.
test('host E2E bridge keeps loopback publication and tolerates only live allocation counters', async (t) => {
  const f = launcherFixture(t);
  const run = await createDisposableTestRun(f.options);
  assert.equal(f.network().Internal, false);
  f.network().Status = {
    IPAM: { Subnets: { '172.25.0.0/16': { IPsInUse: 3, DynamicIPsAvailable: 250 } } },
  };
  let calls = 0;
  const handle = guardTestHandle(run.capability, 'family', { query: () => ++calls }, ['query']);
  await handle.query();
  f.network().Status.IPAM.Subnets['172.25.0.0/16'].IPsInUse++;
  await handle.query();
  assert.equal(calls, 2);
});

for (const [name, mutate] of [
  [
    'wildcard bridge',
    (n) => {
      n.Options['com.docker.network.bridge.host_binding_ipv4'] = '0.0.0.0';
    },
  ],
  [
    'inter-container sharing',
    (n) => {
      n.Options['com.docker.network.bridge.enable_icc'] = 'true';
    },
  ],
  [
    'foreign attachment',
    (n) => {
      n.Containers['e'.repeat(64)] = {};
    },
  ],
]) {
  test(`live E2E bridge rejects ${name} before SQL or teardown`, async (t) => {
    const f = launcherFixture(t);
    const run = await createDisposableTestRun(f.options);
    let calls = 0;
    const handle = guardTestHandle(run.capability, 'family', { query: () => ++calls }, ['query']);
    mutate(f.network());
    assert.throws(() => handle.query());
    assert.equal(calls, 0);
    await assert.rejects(run.teardown(`REMOVE_RUN_OWNED_RESOURCES:${run.nonce}`));
    assert.ok(!f.launcherEffects.lifecycle.some((x) => x.endsWith('.rm')));
  });
}
