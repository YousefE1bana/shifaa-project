import { defineConfig } from 'playwright/test';
import os from 'node:os';
import path from 'node:path';

const port = 18185;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '../apps/patient/test',
  testMatch: 'feature-010-chat.browser.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: { baseURL, browserName: 'chromium', trace: 'off', screenshot: 'off' },
  outputDir: path.join(os.tmpdir(), 'shifaa-f010-patient-chat-playwright-temporary'),
  webServer: {
    command: `corepack pnpm --filter @shifaa/patient exec expo start --web --port ${port} --clear`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { CI: '1', EXPO_PUBLIC_API_BASE_URL: baseURL },
  },
});
