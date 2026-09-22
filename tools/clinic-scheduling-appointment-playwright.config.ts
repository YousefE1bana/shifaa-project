import { defineConfig } from 'playwright/test';
import os from 'node:os';
import path from 'node:path';

const port = 18090;
const baseURL = `http://localhost:${port}`;
export default defineConfig({
  testDir: '../tests/e2e',
  testMatch: 'clinic-scheduling-appointment.browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'line',
  use: { baseURL, browserName: 'chromium', trace: 'off' },
  outputDir: path.join(os.tmpdir(), 'shifaa-f009-clinic-playwright'),
  webServer: {
    command: `corepack pnpm --filter @shifaa/clinic exec next dev -p ${port}`,
    url: `${baseURL}/appointments/92000000-0000-4000-8000-000000000001`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { CI: '1', NEXT_PUBLIC_API_BASE_URL: baseURL },
  },
});
