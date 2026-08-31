import { execFileSync } from 'node:child_process';
import process from 'node:process';

function runPnpm(args, env = {}) {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
      : ['pnpm', ...args];
  execFileSync(command, commandArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

runPnpm(['exec', 'supabase', 'db', 'reset', '--local']);
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
