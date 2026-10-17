import { randomBytes } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
import {
  beginTestRun,
  sourceFingerprint,
  verifyTestResourceContext,
  revalidateTestResourceContext,
  withTestOutputCreation,
  releaseTestResourceContext,
  verifyPrivateTestOutput,
} from './test-resource-context.mjs';
import {
  dockerCommand,
  dockerObservation,
  resourceInventory,
  resourceCommand,
  sourceBytes,
  createPrivateOutput,
  writePrivateReport,
  ResourceCommandFailure,
} from './disposable-test-resources.mjs';
import {
  withTestLauncherSession,
  isTestLauncherContextReleased,
} from './test-launcher-session.mjs';

const denied = (reason) => {
  throw new Error(`test-launcher-denied: ${reason}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = /^[a-f0-9]{64}$/;
const budgetName = 'SEQUENTIAL_2CPU_1GIB';
const sequentialCleanup = 'REMOVE_RELEASED_RUNS_BEFORE_NEXT_LEASE';
const memoryBytes = 1024 * 1024 * 1024;
const logOptions = Object.freeze({ 'max-size': '10m', 'max-file': '2' });
const baselinePackageBlob = 'f205a80ae41b5507afaa1a7868fbbc8e84deb217';

function checkBudgetAuthorization(options) {
  if (options.resourceBudget !== undefined && options.resourceBudget !== budgetName)
    denied('unknown resource budget');
  if (options.cleanup !== undefined && options.cleanup !== sequentialCleanup)
    denied('unknown cleanup authorization');
  if (options.bootstrap !== undefined && options.bootstrap !== 'aggregate-baseline')
    denied('unknown bootstrap mode');
  if (options.bootstrapSqlFiles !== undefined && options.bootstrap !== 'aggregate-baseline')
    denied('SQL test files require aggregate bootstrap');
}

function baselineSqlInventory(worktree) {
  const original = JSON.parse(
    resourceCommand('git', ['cat-file', 'blob', baselinePackageBlob], undefined, worktree),
  );
  const files = (id) =>
    original.scripts[id].split(' && ').map((command) => {
      const match =
        /^docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U shifaa_owner -d shifaa -f \/workspace\/([a-z0-9_./-]+\.sql)$/.exec(
          command,
        );
      if (!match) denied('original SQL script inventory changed');
      return match[1];
    });
  const migrationFiles = files('db:migrate');
  if (migrationFiles.length !== 27) denied('original migration count mismatch');
  return {
    migrations: migrationFiles,
    tests: new Set(['db:test', 'db:rls-test', 'test:discovery-sos:db'].flatMap(files)),
  };
}

function aggregateSources(options) {
  const inventory = baselineSqlInventory(options.worktree);
  const tests = options.bootstrapSqlFiles ?? [];
  if (
    !Array.isArray(tests) ||
    tests.some((file) => !inventory.tests.has(file)) ||
    new Set(tests).size !== tests.length
  )
    denied('unapproved or duplicate bootstrap SQL test file');
  const captured = new Map();
  const expand = (file, ancestors = []) => {
    if (
      !/^(?:infra\/db\/(?:migrations|policies|fixtures|tests)|supabase\/migrations)\/[a-z0-9_/-]+\.sql$/.test(
        file,
      ) ||
      ancestors.includes(file)
    )
      denied('SQL include escape or cycle');
    if (!captured.has(file))
      captured.set(file, sourceBytes(options.worktree, file, options.revision));
    return captured
      .get(file)
      .bytes.toString('utf8')
      .split(/\r?\n/)
      .map((line) => {
        const include = /^\\ir ([a-z0-9_./-]+\.sql)$/.exec(line);
        if (include)
          return expand(
            path.posix.normalize(path.posix.join(path.posix.dirname(file), include[1])),
            [...ancestors, file],
          );
        if (/^\s*\\/.test(line) && line !== '\\set ON_ERROR_STOP on')
          denied('unreviewed aggregate meta-command');
        return line;
      })
      .join('\n');
  };
  const sql = [...inventory.migrations, ...tests].map((file) => expand(file)).join('\n');
  return {
    sql,
    sqlTests: [...tests],
    identities: [...captured].map(([file, source]) => ({
      path: file,
      bytes: source.bytes.length,
      sha256: source.sha256,
    })),
  };
}

function assertResourceBudget(run, container) {
  if (run.options.resourceBudget !== budgetName) return;
  const host = container?.HostConfig;
  if (
    host?.NanoCpus !== 2_000_000_000 ||
    host.Memory !== memoryBytes ||
    host.MemorySwap !== memoryBytes ||
    host.PidsLimit !== 128 ||
    host.ShmSize !== 64 * 1024 * 1024 ||
    host.LogConfig?.Type !== 'local' ||
    Object.keys(host.LogConfig.Config ?? {}).length !== 2 ||
    host.LogConfig.Config['max-size'] !== logOptions['max-size'] ||
    host.LogConfig.Config['max-file'] !== logOptions['max-file']
  )
    denied('container resource limits not applied');
}
const migrations = [
  'infra/db/migrations/001_identity_onboarding.sql',
  'supabase/migrations/20260811000300_facility_onboarding_rbac.sql',
  'supabase/migrations/20260811000400_facility_onboarding_rbac_storage.sql',
  'supabase/migrations/20260811000500_family_care_relationships.sql',
  'supabase/migrations/20260811000600_family_care_storage.sql',
  'supabase/migrations/20260813000500_privacy_dsr_notifications.sql',
  'supabase/migrations/20260813000600_privacy_dsr_storage.sql',
  'supabase/migrations/20260820000600_discovery_sos_foundation.sql',
];
const suites = Object.freeze({
  'discovery-sos': [
    'discovery',
    'subject',
    'prearrival',
    'share',
    'contact',
    'worker-security',
  ].map((name) => `tests/e2e/discovery-sos-${name}.spec.ts`),
  family: ['guardianship', 'delegation', 'emergency-contact'].map(
    (name) => `tests/e2e/family-${name}.spec.ts`,
  ),
  privacy: ['dsr-subject', 'dpo-worklist', 'template-delivery', 'notification-delivery'].map(
    (name) => `tests/e2e/privacy-${name}.spec.ts`,
  ),
});

function checkAuthorization(options) {
  if (
    !options ||
    options.execute !== 'CREATE_NEW_DISPOSABLE_RESOURCES' ||
    typeof options.approval !== 'string' ||
    !options.approval.trim() ||
    !suites[options.scope] ||
    !path.isAbsolute(options.worktree ?? '') ||
    !path.isAbsolute(options.outputParent ?? '') ||
    !/^[a-f0-9]{40}$/.test(options.revision ?? '') ||
    !hex.test(options.sourceDigest ?? '') ||
    !/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(options.imageReference ?? '') ||
    !/^sha256:[a-f0-9]{64}$/.test(options.docker?.image ?? '') ||
    !options.docker?.context ||
    !options.docker.engine ||
    !options.docker.endpoint
  )
    denied('separate explicit runtime approval and immutable image identities required');
  checkBudgetAuthorization(options);
  const implementationRoot = path.resolve(import.meta.dirname, '..');
  const requestedRoot = path.resolve(options.worktree);
  if (
    (process.platform === 'win32' ? requestedRoot.toLowerCase() : requestedRoot) !==
    (process.platform === 'win32' ? implementationRoot.toLowerCase() : implementationRoot)
  )
    denied('launcher implementation belongs to another worktree');
}

function bootstrapSources(worktree, revision) {
  const policy = 'infra/db/policies/001_identity_onboarding_rls.sql';
  const sources = [...migrations, policy].map((file) => ({
    file,
    ...sourceBytes(worktree, file, revision),
  }));
  const sql = migrations
    .map((file) => {
      let text = sources.find((source) => source.file === file).bytes.toString('utf8');
      // Resolve the sole reviewed psql include without mounting the repository.
      if (file === migrations[0])
        text = text.replace(
          /^\\ir \.\.\/policies\/001_identity_onboarding_rls\.sql\r?$/m,
          sources.find((source) => source.file === policy).bytes.toString('utf8'),
        );
      if (/^\\(?!set ON_ERROR_STOP on\r?$)/m.test(text))
        denied('unreviewed bootstrap meta-command');
      return text;
    })
    .join('\n');
  return {
    sql,
    identities: sources.map(({ file, bytes, sha256 }) => ({
      path: file,
      bytes: bytes.length,
      sha256,
    })),
  };
}

function assertEngine(options) {
  const actual = dockerObservation(options.docker.context);
  if (
    !same(actual, {
      context: options.docker.context,
      engine: options.docker.engine,
      endpoint: options.docker.endpoint,
    })
  )
    denied('engine or endpoint substitution');
}

function observations(run) {
  assertEngine(run.options);
  const context = run.options.docker.context;
  const [container] = JSON.parse(dockerCommand(context, ['inspect', run.container]));
  const [volume] = JSON.parse(dockerCommand(context, ['volume', 'inspect', run.volume]));
  const [network] = JSON.parse(dockerCommand(context, ['network', 'inspect', run.network]));
  return { container, volume, network };
}

function assertCreatedResources(run, observed, running) {
  const { container, volume, network } = observed;
  assertResourceBudget(run, container);
  const owned = (labels) =>
    labels?.['com.docker.compose.project'] === run.project &&
    labels?.['shifaa.test.nonce'] === run.nonce;
  if (
    container?.Id !== run.container ||
    !hex.test(container.Id) ||
    container.Image !== run.options.docker.image ||
    container.State?.Running !== running ||
    !owned(container.Config?.Labels) ||
    container.Config.Labels['com.docker.compose.service'] !== 'postgres' ||
    container.HostConfig?.Privileged ||
    container.HostConfig?.NetworkMode === 'host' ||
    container.HostConfig?.VolumesFrom?.length ||
    container.HostConfig?.Binds?.length ||
    container.HostConfig?.PidMode ||
    !['', 'private', undefined].includes(container.HostConfig?.IpcMode) ||
    container.HostConfig?.CapAdd?.length ||
    container.HostConfig?.Devices?.length ||
    run.before.containers.includes(container.Id) ||
    Date.parse(container.Created) < run.started ||
    !Number.isFinite(Date.parse(container.Created))
  )
    denied('container creation identity or isolation');
  if (
    volume?.Name !== run.volume ||
    !owned(volume.Labels) ||
    volume.Driver !== 'local' ||
    volume.Scope !== 'local' ||
    Object.keys(volume.Options ?? {}).length ||
    run.before.volumes.includes(volume.Name) ||
    !Number.isFinite(Date.parse(volume.CreatedAt)) ||
    Date.parse(volume.CreatedAt) < run.started ||
    container.Mounts?.length !== 1 ||
    container.Mounts[0].Type !== 'volume' ||
    container.Mounts[0].Name !== volume.Name ||
    container.Mounts[0].Source !== volume.Mountpoint ||
    container.Mounts[0].Destination !== '/var/lib/postgresql/data' ||
    !container.Mounts[0].RW
  )
    denied('volume creation identity or unknown mount');
  const attachments = container.NetworkSettings?.Networks;
  if (
    network?.Id !== run.network ||
    !hex.test(network.Id) ||
    !owned(network.Labels) ||
    network.Driver !== 'bridge' ||
    network.Internal !== true ||
    network.Scope !== 'local' ||
    network.Ingress ||
    network.Attachable ||
    Object.keys(network.Options ?? {}).length ||
    Object.keys(network.Containers ?? {}).some((containerId) => containerId !== run.container) ||
    run.before.networks.includes(network.Id) ||
    !Number.isFinite(Date.parse(network.Created)) ||
    Date.parse(network.Created) < run.started ||
    ![network.Id, network.Name].includes(container.HostConfig?.NetworkMode) ||
    Object.keys(attachments ?? {}).length !== 1 ||
    !attachments[network.Name] ||
    (running
      ? attachments[network.Name].NetworkID !== network.Id
      : !['', network.Id].includes(attachments[network.Name].NetworkID))
  )
    denied('network creation identity or shared namespace');
  const bindings = container.HostConfig?.PortBindings;
  if (
    Object.keys(bindings ?? {}).length !== 1 ||
    bindings['5432/tcp']?.length !== 1 ||
    bindings['5432/tcp'][0].HostIp !== '127.0.0.1' ||
    !['', '0'].includes(bindings['5432/tcp'][0].HostPort)
  )
    denied('non-loopback or non-dynamic port configuration');
}

function report(run, status) {
  // This is deliberately an allowlist, never a spread of Docker metadata/errors.
  return {
    version: 1,
    status,
    nonce: run.nonce,
    scope: run.options.scope,
    revision: run.options.revision,
    sourceDigest: run.options.sourceDigest,
    engine: run.options.docker.engine,
    project: run.project,
    imageReference: run.options.imageReference,
    image: run.options.docker.image,
    container: run.container ?? null,
    database: `test_${run.nonce}`,
    volume: run.volume ?? null,
    network: run.network ?? null,
    bootstrap: run.sources.identities,
    bootstrapIdentityGuardPassed: run.bootstrapped === true,
    resourceBudget: run.options.resourceBudget ?? null,
    storageQuotaEnforced: false,
    sqlTests: run.bootstrapped ? (run.sources.sqlTests ?? []) : [],
    sqlTestsBeforePrivilegeDrop: run.bootstrapped && run.options.bootstrap === 'aggregate-baseline',
    realIntegrationAccepted: false,
  };
}

function journal(run, phase) {
  if (!same(run.journalParentIdentity, verifyPrivateTestOutput(run.options.outputParent)))
    denied('journal root replaced; preserve resources');
  writePrivateReport(
    path.join(run.options.outputParent, `${run.nonce}-${phase}.json`),
    report(run, phase),
  );
}

function assertSource(run) {
  if (
    sourceFingerprint(run.options.worktree) !== run.options.sourceDigest ||
    resourceCommand('git', ['rev-parse', 'HEAD'], undefined, run.options.worktree) !==
      run.options.revision ||
    resourceCommand(
      'git',
      ['-c', 'core.longpaths=true', 'status', '--porcelain', '--untracked-files=all'],
      undefined,
      run.options.worktree,
    )
  )
    denied('source drift at phase boundary');
}

function checkpoint(run) {
  if (run.failed || run.closed || run.options.signal?.aborted)
    denied('closed, interrupted or failed run');
  assertSource(run);
  const observed = observations(run);
  assertCreatedResources(run, observed, true);
  if (
    run.admitted &&
    (!same(observed.volume, run.admitted.volume) ||
      !same(observed.network, run.admitted.network) ||
      !same(observed.container.Mounts, run.admitted.container.Mounts) ||
      observed.container.Created !== run.admitted.container.Created)
  )
    denied('resource replacement');
  if (run.capability && !isTestLauncherContextReleased(run.capability))
    revalidateTestResourceContext(run.capability, run.options.scope);
  return observed;
}

function teardownCheckpoint(run) {
  if (run.failed || run.closed || run.options.signal?.aborted)
    denied('interrupted teardown; preserve resources');
  assertSource(run);
  assertEngine(run.options);
  if (!same(run.outputIdentity, verifyPrivateTestOutput(run.output)))
    denied('output ownership lost before teardown; preserve resources');
}

function createResources(run) {
  const context = run.options.docker.context;
  const labels = [
    '--label',
    `com.docker.compose.project=${run.project}`,
    '--label',
    `shifaa.test.nonce=${run.nonce}`,
  ];
  assertEngine(run.options);
  run.network = dockerCommand(context, [
    'network',
    'create',
    '--internal',
    '--driver',
    'bridge',
    ...labels,
    `${run.project}-net`,
  ]);
  if (!hex.test(run.network) || run.before.networks.includes(run.network))
    denied('network creation receipt');
  journal(run, 'network-created');
  assertEngine(run.options);
  run.volume = dockerCommand(context, [
    'volume',
    'create',
    '--driver',
    'local',
    ...labels,
    `${run.project}-data`,
  ]);
  if (run.volume !== `${run.project}-data` || run.before.volumes.includes(run.volume))
    denied('volume creation receipt');
  journal(run, 'volume-created');
  const compose = {
    name: run.project,
    services: {
      postgres: {
        image: run.options.imageReference,
        environment: {
          POSTGRES_DB: `test_${run.nonce}`,
          POSTGRES_USER: 'shifaa_owner',
          POSTGRES_PASSWORD: run.passwords.owner,
        },
        labels: { 'shifaa.test.nonce': run.nonce },
        ports: [{ target: 5432, host_ip: '127.0.0.1', published: '0', protocol: 'tcp' }],
        volumes: [
          {
            type: 'volume',
            source: 'data',
            target: '/var/lib/postgresql/data',
            volume: { nocopy: true },
          },
        ],
        networks: ['private'],
        security_opt: ['no-new-privileges:true'],
        ...(run.options.resourceBudget === budgetName
          ? {
              cpus: 2,
              mem_limit: memoryBytes,
              memswap_limit: memoryBytes,
              pids_limit: 128,
              shm_size: 64 * 1024 * 1024,
              logging: { driver: 'local', options: logOptions },
            }
          : {}),
      },
    },
    volumes: { data: { external: true, name: run.volume } },
    networks: { private: { external: true, name: run.network } },
  };
  assertSource(run);
  assertEngine(run.options);
  dockerCommand(
    context,
    [
      'compose',
      '--project-name',
      run.project,
      '-f',
      '-',
      'create',
      '--no-build',
      '--pull',
      'never',
      'postgres',
    ],
    JSON.stringify(compose),
  );
  const created = dockerCommand(context, [
    'ps',
    '-aq',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${run.project}`,
  ]).split(/\r?\n/);
  if (created.length !== 1 || !hex.test(created[0])) denied('ambiguous container creation');
  run.container = created[0];
  assertCreatedResources(run, observations(run), false);
  journal(run, 'container-created');
  assertEngine(run.options);
  dockerCommand(context, ['start', run.container]);
}

async function admitAndBootstrap(run) {
  const observed = checkpoint(run);
  const bindings = observed.container.NetworkSettings?.Ports;
  const portBindings = bindings?.['5432/tcp'];
  const port = Number(portBindings?.[0]?.HostPort);
  if (
    Object.keys(bindings ?? {}).length !== 1 ||
    portBindings.length !== 1 ||
    portBindings[0].HostIp !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    [5432, 54322, 55432].includes(port)
  )
    denied('shared or ambiguous port');
  const manifest = {
    version: 1,
    nonce: run.nonce,
    scope: run.options.scope,
    revision: run.options.revision,
    worktree: run.options.worktree,
    context: run.options.docker.context,
    engine: run.options.docker.engine,
    container: run.container,
    image: run.options.docker.image,
    database: `test_${run.nonce}`,
    host: '127.0.0.1',
    port,
    output: path.join(run.options.outputParent, run.nonce),
    mounts: observed.container.Mounts,
    volumes: [observed.volume],
    network: observed.network,
    urls: Object.fromEntries(
      ['owner', 'api', 'worker'].map((role) => [
        role,
        `postgresql://shifaa_${role}:${run.passwords[role]}@127.0.0.1:${port}/test_${run.nonce}`,
      ]),
    ),
    bootstrap: {
      nonce: run.nonce,
      sourceDigest: run.options.sourceDigest,
      exclusiveDatabase: true,
      records:
        run.options.scope === 'discovery-sos'
          ? [
              'contact:66000000-0000-4000-8000-000000000001',
              'callback:60000000-0000-4000-8000-000000000001',
            ]
          : [],
    },
  };
  run.capability = verifyTestResourceContext(run.authority, manifest);
  run.admitted = observed;
  await withTestOutputCreation(run.authority, run.capability, createPrivateOutput);
  checkpoint(run);
  // Readiness checks occur only AFTER complete out-of-band resource admission.
  for (let attempt = 0; ; attempt++) {
    checkpoint(run);
    try {
      if (
        dockerCommand(run.options.docker.context, [
          'exec',
          run.container,
          'cat',
          '/proc/1/comm',
        ]) !== 'postgres'
      ) {
        if (attempt >= 99) denied('final PostgreSQL process readiness timeout');
        await pause(250, undefined, { signal: run.options.signal });
        continue;
      }
      dockerCommand(run.options.docker.context, [
        'exec',
        run.container,
        'pg_isready',
        '--timeout=2',
        '-U',
        'shifaa_owner',
        '-d',
        manifest.database,
      ]);
      break;
    } catch (error) {
      if (
        !(error instanceof ResourceCommandFailure) ||
        error.timedOut ||
        ![1, 2].includes(error.exitCode) ||
        attempt >= 99
      )
        throw error;
      await pause(250, undefined, { signal: run.options.signal });
    }
  }
  checkpoint(run);
  // The historical migrations include seed rows. Assert the live database and
  // bootstrap role, then bind nonce/source BEFORE any of those sources execute.
  const sql = `DO $shifaa_bootstrap_identity$
BEGIN
  IF current_database() <> '${manifest.database}' OR current_user <> 'shifaa_owner' THEN
    RAISE EXCEPTION 'test bootstrap database or role identity mismatch';
  END IF;
END
$shifaa_bootstrap_identity$;
ALTER DATABASE ${manifest.database} SET shifaa.test_run_nonce='${run.nonce}';
ALTER DATABASE ${manifest.database} SET shifaa.test_source_digest='${run.options.sourceDigest}';
SELECT set_config('shifaa.test_run_nonce','${run.nonce}',false),set_config('shifaa.test_source_digest','${run.options.sourceDigest}',false);
CREATE ROLE shifaa_api LOGIN PASSWORD '${run.passwords.api}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE shifaa_worker LOGIN PASSWORD '${run.passwords.worker}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
${run.sources.sql}
-- Bootstrap privilege ends here. The fixture owner still needs RLS bypass for
-- existing fixed fixtures; it is NEVER the online API/worker connection role.
ALTER ROLE shifaa_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
`;
  dockerCommand(
    run.options.docker.context,
    [
      'exec',
      '-i',
      run.container,
      'psql',
      '--no-password',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'shifaa_owner',
      '-d',
      manifest.database,
    ],
    sql,
  );
  checkpoint(run);
  run.bootstrapped = true;
  run.output = manifest.output;
  run.outputIdentity = verifyPrivateTestOutput(run.output);
  writePrivateReport(
    path.join(run.output, 'bootstrap.json'),
    report(run, 'BOOTSTRAPPED_NOT_ACCEPTED'),
  );
}

export async function createDisposableTestRun(options) {
  checkAuthorization(options);
  const frozen = {
    ...structuredClone({ ...options, signal: undefined }),
    // Authorization already bound the requested path to this implementation.
    // Use its exact canonical spelling for source walks and capability binding.
    worktree: path.resolve(import.meta.dirname, '..'),
    outputParent: path.resolve(options.outputParent),
    signal: options.signal,
  };
  const sources =
    frozen.bootstrap === 'aggregate-baseline'
      ? aggregateSources(frozen)
      : bootstrapSources(frozen.worktree, frozen.revision);
  assertEngine(frozen);
  const [image] = JSON.parse(
    dockerCommand(frozen.docker.context, ['image', 'inspect', frozen.imageReference]),
  );
  if (image?.Id !== frozen.docker.image || !image.RepoDigests?.includes(frozen.imageReference))
    denied('immutable image not locally verified');
  const { authority, nonce } = beginTestRun(frozen);
  const run = {
    options: frozen,
    sources,
    authority,
    nonce,
    project: `shifaa-test-${nonce}`,
    started: Date.now(),
    before: resourceInventory(frozen.docker.context),
    journalParentIdentity: verifyPrivateTestOutput(frozen.outputParent),
    passwords: Object.fromEntries(
      ['owner', 'api', 'worker'].map((role) => [role, randomBytes(32).toString('hex')]),
    ),
    closed: false,
    failed: false,
  };
  try {
    if (options.signal?.aborted) denied('interrupted before creation');
    assertSource(run);
    if (
      run.before.projects.includes(run.project) ||
      run.before.networkNames.includes(`${run.project}-net`) ||
      run.before.volumes.includes(`${run.project}-data`)
    )
      denied('resource-name collision');
    journal(run, 'admitted-before-creation');
    // Docker volume timestamps can have second precision. Cross a complete
    // second AFTER admission, rather than weakening the guard's freshness check.
    await pause(1005 - (Date.now() % 1000), undefined, { signal: options.signal });
    createResources(run);
    await admitAndBootstrap(run);
  } catch {
    run.failed = true;
    // No automatic teardown, resource adoption, retry or raw error reporting.
    writePrivateReport(
      path.join(frozen.outputParent, `${nonce}-failure.json`),
      report(run, 'FAILED_PRESERVE_RESOURCES'),
    );
    throw new Error(
      `test-launcher-denied: run ${nonce} failed; preserve resources and private report`,
    );
  }
  return Object.freeze({
    capability: run.capability,
    nonce,
    sqlTests: Object.freeze([...(run.sources.sqlTests ?? [])]),
    get released() {
      return isTestLauncherContextReleased(run.capability);
    },
    get closed() {
      return run.closed;
    },
    checkpoint: () => checkpoint(run),
    teardown: async (approval) => {
      if (approval !== `REMOVE_RUN_OWNED_RESOURCES:${nonce}`)
        denied('explicit teardown approval required');
      checkpoint(run);
      try {
        // Socket handles must be closed by the suite before explicit destruction.
        if (!isTestLauncherContextReleased(run.capability))
          releaseTestResourceContext(run.capability, frozen.scope);
        teardownCheckpoint(run);
        dockerCommand(frozen.docker.context, ['rm', '-f', run.container]);
        // Never remove by project, prune, or use compose down. Revalidate each
        // surviving resource immediately before its exact-identity removal.
        teardownCheckpoint(run);
        const [volume] = JSON.parse(
          dockerCommand(frozen.docker.context, ['volume', 'inspect', run.volume]),
        );
        if (!same(volume, run.admitted.volume)) denied('volume changed before teardown');
        dockerCommand(frozen.docker.context, ['volume', 'rm', run.volume]);
        teardownCheckpoint(run);
        const [network] = JSON.parse(
          dockerCommand(frozen.docker.context, ['network', 'inspect', run.network]),
        );
        const { Containers: _previousContainers, ...previousNetwork } = run.admitted.network;
        const { Containers: connected, ...currentNetwork } = network;
        if (!same(currentNetwork, previousNetwork) || Object.keys(connected ?? {}).length)
          denied('network changed before teardown');
        dockerCommand(frozen.docker.context, ['network', 'rm', run.network]);
        run.closed = true;
        writePrivateReport(
          path.join(run.output, 'teardown.json'),
          report(run, 'REMOVED_EXACT_RUN_RESOURCES'),
        );
      } catch {
        run.failed = true;
        throw new Error('test-launcher-denied: interrupted teardown; preserve remaining resources');
      }
    },
  });
}

// Node's no-isolation runner keeps test callbacks and the provider in one
// process. Each harness acquires a NEW database, never a reused per-suite lease.
export async function runDisposableTestSuite(options) {
  checkAuthorization(options);
  if (options.resourceBudget === budgetName && options.cleanup !== sequentialCleanup)
    denied('aggregate resource budget requires explicit sequential cleanup authorization');
  if (
    options.maxRuns !== undefined &&
    (!Number.isInteger(options.maxRuns) || options.maxRuns < 1 || options.maxRuns > 32)
  )
    denied('suite lease budget must be an integer from 1 to 32');
  const runs = [];
  const { default: nodeTest } = await import('node:test');
  let failed = false;
  let passedTests = 0;
  let failedTests = 0;
  await withTestLauncherSession(
    options.scope,
    async () => {
      if (options.maxRuns !== undefined && runs.length >= options.maxRuns)
        denied('suite lease budget exhausted before resource creation');
      const previous = runs.at(-1);
      if (previous && options.cleanup === sequentialCleanup) {
        if (!previous.released) denied('previous harness handles and lease must be released');
        await previous.teardown(`REMOVE_RUN_OWNED_RESOURCES:${previous.nonce}`);
      }
      const created = await createDisposableTestRun(options);
      runs.push(created);
      return created.capability;
    },
    async () => {
      const files = suites[options.scope]?.map((file) => path.resolve(options.worktree, file));
      if (!files) denied('unknown suite');
      const stream = nodeTest.run({ files, isolation: 'none', concurrency: 1 });
      // Never pipe arbitrary test diagnostics/SQL errors to public output.
      for await (const event of stream) {
        const data = event.data ?? {};
        const incomplete =
          ['test:skip', 'test:todo', 'test:cancelled', 'test:canceled'].includes(event.type) ||
          ['skip', 'skipped', 'todo', 'cancelled', 'canceled'].some(
            (field) => data[field] !== undefined && data[field] !== false && data[field] !== 0,
          ) ||
          (event.type === 'test:summary' &&
            (data.success === false ||
              ['failed', 'skipped', 'todo', 'cancelled', 'canceled'].some(
                (field) => data.counts?.[field] !== undefined && data.counts[field] !== 0,
              )));
        if (incomplete) failed = true;
        if (event.type === 'test:pass' && !incomplete) passedTests++;
        if (event.type === 'test:fail') {
          failed = true;
          failedTests++;
        }
      }
      for (const created of runs) {
        if (created.closed) continue;
        created.checkpoint();
        if (options.cleanup === sequentialCleanup) {
          if (!created.released) denied('final harness handles and lease must be released');
          await created.teardown(`REMOVE_RUN_OWNED_RESOURCES:${created.nonce}`);
        }
      }
    },
  );
  return Object.freeze({
    passed:
      !failed &&
      passedTests > 0 &&
      runs.length > 0 &&
      (options.cleanup !== sequentialCleanup || runs.every((created) => created.closed)),
    passedTests,
    failedTests,
    runs: Object.freeze(runs),
    // Cleanup occurs only under the explicit in-process sequential authorization.
    realIntegrationAccepted: false,
  });
}

export function testSuiteFiles(scope) {
  return Object.freeze([...(suites[scope] ?? [])]);
}

// No top-level entrypoint: importing this module never creates resources. The
// later runtime authorization must call runDisposableTestSuite explicitly in a
// process with the approved tsx loader already registered.
