import { defineConfig } from 'playwright/test';
import os from 'node:os';
import path from 'node:path';

const port = 18169;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '../apps/clinic/test',
  testMatch: 'clinic-scheduling-schedule.browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: { baseURL, browserName: 'chromium', trace: 'off', screenshot: 'off' },
  outputDir: path.join(os.tmpdir(), 'shifaa-f009-clinic-schedule-playwright-temporary'),
  webServer: {
    command: `corepack pnpm --filter @shifaa/clinic exec next dev --hostname 127.0.0.1 -p ${port}`,
    url: `${baseURL}/schedule`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { CI: '1', NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:18170' },
  },
});
