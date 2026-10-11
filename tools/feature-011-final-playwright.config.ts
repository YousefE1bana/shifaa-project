import { defineConfig } from 'playwright/test';
import { resolve } from 'node:path';
const app = process.env['SHIFAA_F011_UI_APP'];
if (!['patient', 'clinic'].includes(app ?? '')) throw Error('Explicit UI app required');
const patient = app === 'patient';
const port = patient ? 18212 : 18213;
const baseURL = `http://localhost:${port}`;
export default defineConfig({
  testDir: '../tests/e2e',
  testMatch: ['feature-011-ui.spec.ts', 'feature-011-verification.spec.ts'],
  outputDir: resolve(`artifacts/feature-011/k24/${app}-browser`),
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [
    ['line'],
    [
      'json',
      {
        outputFile: resolve(
          `specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/${app}-results.json`,
        ),
      },
    ],
  ],
  use: { baseURL, browserName: 'chromium', channel: 'chrome', trace: 'off', screenshot: 'off' },
  webServer: {
    command: patient
      ? `corepack pnpm --filter @shifaa/patient exec expo start --web --port ${port}`
      : `corepack pnpm --filter @shifaa/clinic exec next dev --hostname localhost -p ${port}`,
    url: patient ? baseURL : baseURL + '/patients/f0110000-0000-4000-8000-000000000001/summary',
    timeout: 120000,
    reuseExistingServer: false,
    env: patient
      ? { CI: '1', EXPO_PUBLIC_API_BASE_URL: baseURL }
      : { CI: '1', NEXT_PUBLIC_API_BASE_URL: baseURL },
  },
});
