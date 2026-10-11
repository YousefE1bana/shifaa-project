import { execFileSync } from 'node:child_process';
import { resetFeature011NativeSupabase } from './feature-011-native-supabase-bootstrap.mjs';

function runPnpm(args, extraEnv = {}, capture = false) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
      : ['pnpm', ...args];
  return execFileSync(command, commandArgs, {
    cwd: new URL('..', import.meta.url),
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

await resetFeature011NativeSupabase((args, capture = false) => {
  return runPnpm(args, {}, capture);
});

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
