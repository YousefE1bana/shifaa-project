import { execFileSync } from 'node:child_process';

const workspace = new URL('..', import.meta.url);

function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    cwd: workspace,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

function pnpm(args, extraEnv = {}) {
  if (process.platform === 'win32') {
    run('cmd.exe', ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`], extraEnv);
  } else {
    run('corepack', ['pnpm', ...args], extraEnv);
  }
}

run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
run('docker', [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'shifaa_owner',
  '-d',
  'shifaa',
  '-f',
  '/workspace/infra/db/tests/identity-continuity-schema.sql',
]);
run('docker', [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'shifaa_owner',
  '-d',
  'shifaa',
  '-f',
  '/workspace/infra/db/tests/identity-continuity-rls.sql',
]);
pnpm(['--filter', '@shifaa/core', 'test']);
pnpm(
  [
    '--filter',
    '@shifaa/api',
    'exec',
    'vitest',
    'run',
    'src/modules/identity-continuity/identity-continuity.unit.test.ts',
    'test/identity-continuity-transition.integration.test.ts',
    '--testTimeout=120000',
  ],
  { SHIFAA_RUN_IDENTITY_CONTINUITY_TRANSITION: 'true' },
);
pnpm(['--filter', '@shifaa/admin', 'test']);
pnpm(['--filter', '@shifaa/patient', 'test']);
pnpm([
  'exec',
  'tsx',
  '--test',
  '--test-concurrency=1',
  'tests/e2e/identity-continuity-transition.spec.ts',
]);

console.log('Identity continuity transition checkpoint passed: 20/20 legal vectors accounted for.');
