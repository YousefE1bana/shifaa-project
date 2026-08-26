import { execFileSync } from 'node:child_process';

function runPnpm(args, extraEnv = {}) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
      : ['pnpm', ...args];
  execFileSync(command, commandArgs, {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

runPnpm(['exec', 'supabase', 'db', 'reset', '--local']);

runPnpm(
  [
    '--filter',
    '@shifaa/api',
    'exec',
    'vitest',
    'run',
    'test/identity-continuity-mfa.integration.test.ts',
    '--testTimeout=120000',
  ],
  { SHIFAA_RUN_IDENTITY_CONTINUITY_MFA: 'true' },
);

runPnpm(
  [
    'exec',
    'tsx',
    '--test',
    '--test-concurrency=1',
    'tests/e2e/identity-continuity-mfa.spec.ts',
    'tests/e2e/identity-continuity-admin-step-up.spec.ts',
  ],
  { SHIFAA_RUN_IDENTITY_CONTINUITY_MFA: 'true' },
);

console.log('Identity continuity MFA checkpoint passed.');
