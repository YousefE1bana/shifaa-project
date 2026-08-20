import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@shifaa/api',
    'exec',
    'vitest',
    'run',
    'test/privacy-postgres.integration.test.ts',
    '--testTimeout=30000',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, SHIFAA_RUN_PRIVACY_POSTGRES: 'true' },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
