import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    'tests/e2e/pre-011-native-clinical-composition.integration.test.ts',
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, SHIFAA_RUN_NATIVE_CLINICAL_COMPOSITION: 'true' },
    stdio: 'inherit',
    windowsHide: true,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
