import { defineConfig } from 'playwright/test';
import { resolve } from 'node:path';
const app = process.env['SHIFAA_F011_UI_APP'] ?? 'patient';
if (!['patient', 'clinic'].includes(app)) throw Error('Unknown app');
const patient = app === 'patient',
  port = patient ? 18212 : 18213,
  baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: '../tests/e2e',
  testMatch: 'feature-011-verification.spec.ts',
  outputDir: resolve(`artifacts/feature-011/k14/${app}-test-results`),
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [
    ['line'],
    ['json', { outputFile: resolve(`artifacts/feature-011/k14/${app}-browser-results.json`) }],
  ],
  use: { baseURL, browserName: 'chromium', trace: 'off', screenshot: 'off' },
  webServer: {
    command: patient
      ? `corepack pnpm --filter @shifaa/patient exec expo start --web --port ${port}`
      : `corepack pnpm --filter @shifaa/clinic exec next dev --hostname 127.0.0.1 -p ${port}`,
    url: patient ? baseURL : baseURL + '/patients/f0110000-0000-4000-8000-000000000001/summary',
    timeout: 120000,
    reuseExistingServer: false,
    env: patient
      ? { CI: '1', EXPO_PUBLIC_API_BASE_URL: baseURL }
      : { CI: '1', NEXT_PUBLIC_API_BASE_URL: baseURL },
  },
});
