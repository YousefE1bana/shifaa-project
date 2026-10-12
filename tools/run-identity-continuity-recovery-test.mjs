import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { resetFeature011NativeSupabase } from './feature-011-native-supabase-bootstrap.mjs';

function runPnpm(args, env = {}, capture = false) {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
      : ['pnpm', ...args];
  return execFileSync(command, commandArgs, {
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
    env: { ...process.env, ...env },
  });
}

await resetFeature011NativeSupabase((args, capture = false) => {
  return runPnpm(args, {}, capture);
});
runPnpm(
  [
    'exec',
    'vitest',
    'run',
    'services/api/test/identity-continuity-recovery.integration.test.ts',
    '--testTimeout=120000',
  ],
  { SHIFAA_RUN_IDENTITY_CONTINUITY_RECOVERY: 'true' },
);
runPnpm(
  [
    'exec',
    'tsx',
    '--test',
    '--test-concurrency=1',
    'tests/e2e/identity-continuity-recovery.spec.ts',
  ],
  { SHIFAA_RUN_IDENTITY_CONTINUITY_RECOVERY: 'true' },
);

process.stdout.write('Identity continuity recovery checkpoint passed.\n');
