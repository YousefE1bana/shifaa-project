import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  sandboxArgs,
  dockerEnvironment,
  excluded,
  sourceFiles,
  copySources,
  safeSource,
  localDocker,
  dependencyInputs,
  hostExecutable,
} from './sandbox.mjs';
import { ordinary } from './profiles.mjs';

const root = resolve(import.meta.dirname, '../..');
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'shifaa-safety-test-'));
  execFileSync('git', ['init', '-q', directory]);
  const write = (file, contents) => {
    mkdirSync(join(directory, file, '..'), { recursive: true });
    writeFileSync(join(directory, file), contents);
  };
  return { directory, write };
}

test('container has no host service, credentials, writable source or retained volume authority', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shifaa-safe-source-'));
  const args = sandboxArgs(directory, `sha256:${'a'.repeat(64)}`, 'shifaa-verify-abcd');
  for (const required of [
    '--rm',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
  ])
    assert.ok(args.includes(required));
  assert.ok(args.includes(`--user=${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`));
  assert.equal(args.filter((arg) => arg === '--mount').length, 1);
  assert.ok(args.includes(`type=bind,source=${directory},target=/source,readonly`));
  assert.ok(
    !args.some((arg) =>
      /docker\.sock|--privileged|--env|--env-file|--device|network=host|type=volume/.test(arg),
    ),
  );
  assert.equal(args.at(-1), '/source/tree/tools/verification/inside.mjs');
  assert.throws(() => sandboxArgs(directory, 'node:latest'));
  assert.throws(() =>
    sandboxArgs(directory + ',target=/var/run/docker.sock', `sha256:${'a'.repeat(64)}`),
  );
});

test('host environment sanitization excludes keys, injected tools and remote Docker', () => {
  assert.deepEqual(
    dockerEnvironment({
      PATH: [dirname(process.execPath), join(root, 'node_modules/.bin'), root].join(delimiter),
      DATABASE_URL: 'retained',
      NODE_OPTIONS: '--import danger',
      DOCKER_HOST: 'tcp://remote',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    }),
    { PATH: dirname(process.execPath) },
  );
});

test('pnpm node_modules PATH entries cannot shadow the trusted host Docker executable', () => {
  const f = fixture();
  const bin = join(f.directory, 'node_modules/.bin');
  const trusted = join(f.directory, 'trusted-tools');
  const binary = process.platform === 'win32' ? 'docker.exe' : 'docker';
  f.write(`node_modules/.bin/${binary}`, 'untrusted project launcher');
  f.write(`trusted-tools/${binary}`, 'trusted fixture executable');
  assert.equal(
    hostExecutable('docker', { PATH: [bin, trusted].join(delimiter) }),
    join(trusted, binary),
  );
  assert.throws(() => hostExecutable('docker', { PATH: bin }), /unavailable/);
});

test('remote/overridden Docker and non-Linux engines fail before any run', () => {
  for (const override of [
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
  ]) {
    assert.throws(() =>
      localDocker(() => assert.fail('No Docker command permitted'), { [override]: 'set' }),
    );
  }
  const calls = [];
  const remote = (_exe, args) => {
    calls.push(args);
    return args.includes('show') ? 'default' : 'ssh://foreign';
  };
  assert.throws(() => localDocker(remote, {}));
  assert.equal(calls.length, 2);
  assert.throws(() =>
    localDocker(
      (_exe, args) =>
        args.includes('show')
          ? 'default'
          : args.includes('inspect')
            ? 'unix:///var/run/docker.sock'
            : 'windows',
      {},
    ),
  );
});

test('snapshot includes dirty tracked bytes and safe new code, excludes retained private/ignored state', () => {
  const f = fixture();
  f.write('.gitignore', '.tmp/\nnode_modules/\n');
  f.write('tools/tracked.mjs', 'original');
  execFileSync('git', ['add', '.'], { cwd: f.directory });
  f.write('tools/tracked.mjs', 'dirty bytes');
  f.write('tools/new.mjs', 'new code');
  f.write('tools/private/evidence.json', 'private');
  f.write('tools/auth-fixtures/records.json', 'unreviewed fixture');
  f.write('.tmp/data.dump', 'retained backup');
  f.write('.env', 'not exported');
  f.write('readiness/private-capture.png', 'not exported');
  const inventory = sourceFiles(f.directory);
  assert.ok(inventory.files.includes('tools/new.mjs'));
  assert.ok(!inventory.files.some((file) => /private|fixtures|dump|\.env|png/.test(file)));
  assert.ok(inventory.omitted.includes('readiness/private-capture.png'));
  const destination = mkdtempSync(join(tmpdir(), 'shifaa-copy-'));
  const check = copySources(f.directory, destination, inventory.files);
  assert.equal(readFileSync(join(destination, 'tools/tracked.mjs'), 'utf8'), 'dirty bytes');
  check();
  f.write('tools/tracked.mjs', 'changed after admission');
  assert.throws(check, /Source changed/);
});

test('path traversal, absolute paths and linked source cannot escape snapshot', (t) => {
  const f = fixture();
  f.write('tools/good.mjs', 'ok');
  for (const file of ['../secret', '/secret', 'C:/secret', 'tools/../secret', 'tools\\secret'])
    assert.throws(() => safeSource(f.directory, file));
  try {
    symlinkSync(join(f.directory, 'tools/good.mjs'), join(f.directory, 'link.mjs'));
  } catch (error) {
    if (error.code === 'EPERM') {
      t.diagnostic('Host denies symlink creation; path traversal cases still executed');
      return;
    }
    throw error;
  }
  assert.throws(() => safeSource(f.directory, 'link.mjs'), /Linked/);
});

test('sensitive file exclusion and public examples are distinct', () => {
  for (const file of [
    '.env',
    'apps/patient/.env.local',
    '.git/config',
    '.worktrees/x/package.json',
    'backup/db.dump',
    'key.pem',
    'local.sqlite',
  ])
    assert.equal(excluded(file), true, file);
  assert.equal(excluded('.env.example'), false);
  assert.equal(excluded('supabase/migrations/001.sql'), false);
});

test('all 42 legacy obligations and exact nested chains stay available', () => {
  const plan = JSON.parse(
    readFileSync(join(root, 'docs/testing/verification-v1/legacy-obligations.json')),
  );
  const original = JSON.parse(
    execFileSync('git', ['show', `${plan.baseline}:package.json`], { cwd: root }),
  );
  assert.equal(plan.original, original.scripts.verify);
  assert.equal(plan.steps.length, 42);
  assert.equal(new Set(plan.steps.map((s) => s.id)).size, 42);
  assert.deepEqual(
    plan.steps.map((s) => s.command),
    original.scripts.verify.split(' && '),
  );
  const current = JSON.parse(readFileSync(join(root, 'package.json')));
  for (const [name, command] of Object.entries(original.scripts))
    if (name !== 'verify')
      assert.equal(current.scripts[name], command, `Existing coverage changed: ${name}`);
  assert.equal(current.scripts.verify, 'node tools/verify.mjs');
  assert.ok(
    ordinary.includes('test') &&
      ordinary.includes('test:a11y') &&
      ordinary.includes('contracts:check'),
  );
});

test('required six-context workflow stays byte-identical', () => {
  const original = execFileSync(
    'git',
    ['show', '97d20c290abeebdbf223703bd19d3103ac65bd3b:.github/workflows/ci.yml'],
    { cwd: root },
  );
  assert.deepEqual(readFileSync(join(root, '.github/workflows/ci.yml')), original);
});

test('image dependency identity changes on nested workspace manifest drift', () => {
  const f = fixture();
  for (const file of [
    'package.json',
    'apps/patient/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'tools/verification/Dockerfile',
  ])
    f.write(file, '{}');
  execFileSync('git', ['add', '.'], { cwd: f.directory });
  const before = dependencyInputs(f.directory).hash;
  f.write('apps/patient/package.json', '{"scripts":{"test":"nested reset"}}');
  assert.notEqual(dependencyInputs(f.directory).hash, before);
});

test('direct comprehensive invocation refuses local execution before resource commands', () => {
  const result = spawnSync(process.execPath, ['tools/verification/comprehensive.mjs'], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot ?? '',
      GITHUB_ACTIONS: 'false',
    },
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.toString().includes('AssertionError'));
});

test('ordinary launcher has no unsafe profile override or implicit install fallback', () => {
  const result = spawnSync(process.execPath, ['tools/verify.mjs', '--unsafe'], { cwd: root });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr.toString()).status, 'BLOCKED');
  const driver = readFileSync(join(root, 'tools/verify.mjs'), 'utf8');
  assert.ok(!driver.includes('execFileSync'));
});

test('pnpm cannot run implicit pre/post hooks before the boundary', () => {
  assert.match(
    readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'),
    /^enablePrePostScripts: false$/m,
  );
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  assert.equal(pkg.scripts.preverify, undefined);
  assert.equal(pkg.scripts.postverify, undefined);
});
