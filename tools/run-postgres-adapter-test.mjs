import { spawnSync } from 'node:child_process';

const command = 'pnpm';
const result = spawnSync(
  command,
  [
    '--filter',
    '@shifaa/api',
    'exec',
    'vitest',
    'run',
    'test/facility-postgres.integration.test.ts',
    '--testTimeout=30000',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, SHIFAA_RUN_POSTGRES_ADAPTER: 'true' },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
