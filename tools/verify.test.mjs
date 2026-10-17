import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { verify } from './verify.mjs';
import { verificationPlan, requiredIds, assertComplete } from './verification-plan.mjs';
import {
  validateConfig,
  validateImageProvenance,
  publicProviderFailure,
} from './verification-host.mjs';
import { executePlan, admitGuest } from './verification-guest.mjs';
import { verificationPackageProjection } from './tooling-history.mjs';
import { auditGraph } from './verification-graph.mjs';
import { runDisposableTestSuite } from './trusted-disposable-test-launcher.mjs';

const root = path.resolve(import.meta.dirname, '..');
const plan = verificationPlan(root);
test('known provider prerequisites produce specific diagnostics without raw secrets', () => {
  const reason = publicProviderFailure({ stderr: 'SECRET\nHyper-V service unavailable\nPASSWORD' });
  assert.match(reason, /Hyper-V service unavailable/);
  assert.ok(!/SECRET|PASSWORD/.test(reason));
});
test('unknown provider diagnostics are never reflected into the public result', () => {
  const reason = publicProviderFailure({ stderr: 'SECRET password row body', message: 'SECRET' });
  assert.ok(!/SECRET|password|row body/.test(reason));
});
const passed = () => requiredIds(plan).map((id) => ({ id, status: 'PASS', exitCode: 0 }));
function host(failure) {
  const effects = [];
  const h = { reason: 'Mock prerequisite failure' };
  for (const phase of [
    'admit',
    'reserve',
    'create',
    'checkpoint',
    'prepare',
    'execute',
    'teardown',
    'finalize',
    'preserve',
  ])
    h[phase] = async () => {
      effects.push(phase);
      if (phase === failure) throw new Error('SECRET must not escape');
      if (phase === 'admit') return { nonce: 'a'.repeat(32) };
      if (phase === 'execute') return passed();
    };
  return { h, effects };
}
test('all required steps and verified teardown are necessary for aggregate PASS', async () => {
  const { h, effects } = host();
  assert.equal((await verify(h, plan)).status, 'PASS');
  assert.deepEqual(effects, [
    'admit',
    'reserve',
    'create',
    'checkpoint',
    'prepare',
    'checkpoint',
    'execute',
    'checkpoint',
    'teardown',
    'finalize',
  ]);
});
for (const phase of [
  'admit',
  'reserve',
  'create',
  'checkpoint',
  'prepare',
  'execute',
  'teardown',
  'finalize',
])
  test(`failure at ${phase} fails closed without guessed cleanup`, async () => {
    const { h, effects } = host(phase);
    const r = await verify(h, plan);
    assert.equal(r.status, 'BLOCKED');
    assert.ok(!JSON.stringify(r).includes('SECRET'));
    if (['admit', 'reserve', 'create', 'checkpoint', 'prepare', 'execute'].includes(phase))
      assert.ok(!effects.includes('teardown'));
    if (phase === 'admit') assert.deepEqual(effects, ['admit']);
  });
for (const mutation of [
  (r) => r.pop(),
  (r) => r.push(r[0]),
  (r) => (r[0].status = 'SKIP'),
  (r) => (r[0].exitCode = 1),
  (r) => (r[0].id = 'unknown'),
])
  test(`coverage cannot be omitted, duplicated or mislabeled: ${mutation}`, () => {
    const r = passed();
    mutation(r);
    assert.throws(() => assertComplete(plan, r));
  });
test('FAIL and all remaining BLOCKED are distinct from successful checks', async () => {
  const { h } = host();
  h.execute = async () => {
    const r = passed();
    r[0] = { ...r[0], status: 'FAIL', exitCode: 1 };
    return r;
  };
  assert.equal((await verify(h, plan)).status, 'FAIL');
});
test('raw guest diagnostics and secret fields cannot appear in the public summary', async () => {
  const { h } = host();
  h.execute = async () => passed().map((r) => ({ ...r, stderr: 'SECRET', password: 'SECRET' }));
  const result = await verify(h, plan);
  assert.equal(result.status, 'PASS');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('guarded suites run first; every legacy check is retained; dependency predicates retained', async () => {
  const calls = [];
  const results = await executePlan(
    plan,
    async (cmd) => {
      calls.push(cmd);
      return 0;
    },
    async (scope) => {
      calls.push(scope);
      return 0;
    },
    { exitCode: 0, checkedUtc: new Date().toISOString() },
  );
  assertComplete(plan, results);
  assert.deepEqual(calls.slice(0, 3), ['discovery-sos', 'family', 'privacy']);
  assert.equal(results.length, 44);
  assert.ok(calls.includes('pnpm peers check && node tools/verify-expo-dependencies.mjs'));
  assert.ok(calls.includes('pnpm db:reset'));
});
test('guard failure runs no legacy process or remaining resources', async () => {
  let commands = 0,
    guards = 0;
  const results = await executePlan(
    plan,
    () => {
      commands++;
      return 0;
    },
    () => {
      guards++;
      return 1;
    },
    {},
  );
  assert.equal(commands, 0);
  assert.equal(guards, 1);
  assert.equal(results.filter((r) => r.status === 'BLOCKED').length, 43);
});
for (const audit of [
  { exitCode: 1, checkedUtc: new Date().toISOString() },
  { exitCode: 0, checkedUtc: '2000-01-01' },
  { exitCode: 0, checkedUtc: 'invalid' },
])
  test(`failed/missing/stale online audit blocks aggregate: ${JSON.stringify(audit)}`, async () => {
    const results = await executePlan(
      plan,
      () => 0,
      () => 0,
      audit,
    );
    assert.equal(results.find((r) => r.id === 'legacy-13').status, 'BLOCKED');
    assert.equal(results.find((r) => r.id === 'legacy-15').status, 'BLOCKED');
  });
const nonce = 'a'.repeat(32);
const config = () => ({
  schema: 'SHIFAA-VERIFY/1',
  authorize: 'CREATE_ONE_DISPOSABLE_VM_AND_REMOVE_ONLY_ITS_VERIFIED_RESOURCES',
  runNonce: nonce,
  worktree: root,
  revision: 'b'.repeat(40),
  approvedBy: 'Mock only',
  expiresUtc: new Date(Date.now() + 7200000).toISOString(),
  backend: 'hyperv-windows',
  image: {
    path: path.resolve(root, '../template.vhdx'),
    sha256: 'c'.repeat(64),
    provenancePath: path.resolve(root, '../private/image-provenance.json'),
    provenanceSha256: 'f'.repeat(64),
  },
  outputParent: path.join(os.homedir(), 'SHIFAA-verification-private'),
  credentialPath: path.resolve(root, '../private/credential.xml'),
  auditSwitchId: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12),
  postgres: {
    reference: `example.invalid/postgres@sha256:${'d'.repeat(64)}`,
    image: `sha256:${'e'.repeat(64)}`,
  },
  budget: { cpus: 2, memoryGiB: 8, diskGiB: 60, minutes: 60 },
});
test('mock valid explicit one-run authorization has no environment fallback', () =>
  assert.equal(validateConfig(config(), root, nonce).backend, 'hyperv-windows'));
const provenance = () => ({
  schema: 'SHIFAA-VERIFY-IMAGE/1',
  imageSha256: 'c'.repeat(64),
  disposition: 'APPROVED_CLEAN_SYNTHETIC_APPLIANCE',
  approvedBy: 'Mock only',
  reviewedUtc: '2026-10-17T00:00:00Z',
  sources: [
    {
      url: 'https://example.invalid/official-image',
      sha256: 'f'.repeat(64),
      purpose: 'MOCK provenance',
    },
  ],
  tools: { node: '24.18.0', pnpm: '11.13.0', supabase: '2.113.0', powershell: ['5.1', '7'] },
});
test('exact image provenance remains distinct from clinical authority', () =>
  validateImageProvenance(provenance(), config()));
for (const [name, change] of Object.entries({
  missingOrigin: (p) => (p.sources = []),
  mutableSource: (p) => (p.sources[0].sha256 = 'latest'),
  wrongImage: (p) => (p.imageSha256 = 'b'.repeat(64)),
  unapproved: (p) => (p.disposition = 'PROPOSED'),
  unattributed: (p) => (p.approvedBy = ''),
  wrongTool: (p) => (p.tools.node = '25.0.0'),
  nonHttps: (p) => (p.sources[0].url = 'file:///private'),
}))
  test(`image admission rejects ${name}`, () => {
    const p = provenance();
    change(p);
    assert.throws(() => validateImageProvenance(p, config()));
  });
const badConfigs = {
  missingAuthorization: (c) => delete c.authorize,
  forgedNonce: (c) => (c.runNonce = 'f'.repeat(32)),
  crossWorktree: (c) => (c.worktree += '-other'),
  expired: (c) => (c.expiresUtc = '2000-01-01'),
  standing: (c) => (c.expiresUtc = '2099-01-01'),
  alternateCoordinationRoot: (c) => (c.outputParent += '-other'),
  mutableImage: (c) => (c.image.sha256 = 'latest'),
  protectedOutput: (c) => (c.outputParent = root),
  insideOutput: (c) => (c.outputParent = path.join(root, 'specs')),
  unboundedCpu: (c) => (c.budget.cpus = 100),
  unboundedMemory: (c) => (c.budget.memoryGiB = 100),
  unboundedDisk: (c) => (c.budget.diskGiB = 5000),
  unboundedTime: (c) => (c.budget.minutes = 999),
  unknownBudget: (c) => (c.budget.concurrency = 10),
  missingIdentity: (c) => (c.postgres.image = 'latest'),
  missingOrigin: (c) => (c.postgres.reference = 'postgres:17'),
  unknownBackend: (c) => (c.backend = 'shared'),
  unknownSwitch: (c) => (c.auditSwitchId = 'default'),
};
for (const [name, mutate] of Object.entries(badConfigs))
  test(`authorization rejects ${name} before any provider`, () => {
    const c = config();
    mutate(c);
    assert.throws(() => validateConfig(c, root, nonce));
  });
const binding = {
  nonce,
  vmId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  revision: 'b'.repeat(40),
  authority: 'POWER_SHELL_DIRECT_FRESH_VM',
};
const observations = () => ({
  hardware: () => ({
    manufacturer: 'Microsoft Corporation',
    model: 'Virtual Machine',
    uuid: binding.vmId,
  }),
  externalAdapters: () => 0,
  revision: () => binding.revision,
  dirty: () => '',
  docker: () => ({ endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine', engine: 'mock' }),
});
test('guest hardware and source admission allow exact isolated mock only', () =>
  assert.equal(admitGuest(observations(), binding).engine, 'mock'));
for (const [name, patch] of Object.entries({
  hostHardware: { hardware: () => ({ manufacturer: 'Other', model: 'Host', uuid: binding.vmId }) },
  substitutedMachine: {
    hardware: () => ({
      manufacturer: 'Microsoft Corporation',
      model: 'Virtual Machine',
      uuid: 'different',
    }),
  },
  hostNetwork: { externalAdapters: () => 1 },
  sourceDrift: { dirty: () => ' M source' },
  revisionDrift: { revision: () => 'c'.repeat(40) },
  sharedEngine: { docker: () => ({ endpoint: 'tcp://127.0.0.1:2375', engine: 'shared' }) },
  remoteEngine: { docker: () => ({ endpoint: 'tcp://shared.example:2376', engine: 'remote' }) },
  unknownEngine: { docker: () => ({ endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine' }) },
}))
  test(`guest rejects ${name} before clients or test commands`, () =>
    assert.throws(() => admitGuest({ ...observations(), ...patch }, binding)));
const oldPackage = execFileSync(
  'git',
  ['cat-file', 'blob', 'f205a80ae41b5507afaa1a7868fbbc8e84deb217'],
  { cwd: root },
);
const currentPackage = fs.readFileSync(path.join(root, 'package.json'));
test('historical physical evidence receives exact old package; current body independently validated', () =>
  assert.deepEqual(verificationPackageProjection(currentPackage, oldPackage), oldPackage));
for (const [label, current, old] of [
  ['current corruption', Buffer.concat([currentPackage, Buffer.from(' ')]), oldPackage],
  ['historical corruption', currentPackage, Buffer.concat([oldPackage, Buffer.from(' ')])],
  [
    'unapproved semantic change',
    Buffer.from(currentPackage.toString().replace('pnpm@11.13.0', 'pnpm@99.0.0')),
    oldPackage,
  ],
])
  test(`historical projection rejects ${label}`, () =>
    assert.throws(() => verificationPackageProjection(current, old)));
test('conservative graph includes imported, SQL, worker, test and package-script hazards', () => {
  const data = {
    'package.json': currentPackage,
    'turbo.json': fs.readFileSync(path.join(root, 'turbo.json')),
    'tools/example.mjs': Buffer.from("import '../tests/example.ts'; spawn('docker');"),
    'tests/example.ts': Buffer.from('DELETE FROM notification; localhost:5432'),
    'infra/db/a.sql': Buffer.from('DROP DATABASE anything;'),
  };
  const g = auditGraph(root, Object.keys(data), (f) => data[f]);
  assert.equal(g.oldGraph.length, 42);
  assert.ok(
    g.nodes
      .find((n) => n.path === 'infra/db/a.sql')
      .risks.some((r) => r.risk === 'destructiveLifecycle'),
  );
  assert.ok(
    g.nodes.find((n) => n.path === 'tests/example.ts').risks.some((r) => r.risk === 'sharedTarget'),
  );
});
test('entrypoint modules import without process/resource/lifecycle side effects', () => {
  // All preceding tests imported these modules with no provider configured.
  const source = fs.readFileSync(path.join(root, 'tools/verify.mjs'), 'utf8');
  assert.ok(!/docker compose|db reset|new Pool/.test(source));
});
test('the sole network-enabled guest command disables lifecycle scripts and package hooks', () => {
  const provider = fs.readFileSync(path.join(root, 'tools/verification-hyperv.ps1'), 'utf8');
  const audit = provider.slice(
    provider.indexOf('Add-VMNetworkAdapter -VM $vm'),
    provider.indexOf('} finally {Get-VMNetworkAdapter'),
  );
  assert.match(audit, /ignore-pnpmfile=true`nignore-scripts=true/);
  const commands = audit.split(/\r?\n/).filter((line) => /^\s*&\s/.test(line));
  assert.equal(commands.length, 1);
  assert.match(
    commands[0],
    /& pnpm --ignore-scripts --registry=https:\/\/registry.npmjs.org --userconfig=NUL audit/,
  );
});
for (const maxRuns of [0, 33, 1.5, '2'])
  test(`invalid suite budget ${maxRuns} rejects before Docker, SQL or test discovery`, async () => {
    await assert.rejects(runDisposableTestSuite({ maxRuns }), /suite lease budget/);
  });
test('the actual CLI blocks absent configuration before resource admission', () => {
  const environment = { ...process.env };
  delete environment.SHIFAA_VERIFY_CONFIG;
  let result;
  try {
    execFileSync(process.execPath, ['tools/verify.mjs'], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.fail('Unexpected success');
  } catch (error) {
    assert.equal(error.status, 2);
    result = JSON.parse(error.stdout);
  }
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.results.length, 44);
  assert.ok(result.results.every((r) => r.status === 'BLOCKED' && r.exitCode === null));
});
