import { defineConfig } from 'playwright/test';
import os from 'node:os';
import path from 'node:path';

const port = 18185;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'feature-010-performance.browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: 'line',
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  outputDir: path.join(os.tmpdir(), 'shifaa-f010-performance-playwright-temporary'),
  webServer: {
    command: `corepack pnpm --filter @shifaa/patient exec expo start --web --port ${port} --clear`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { CI: '1', EXPO_PUBLIC_API_BASE_URL: baseURL },
  },
});
