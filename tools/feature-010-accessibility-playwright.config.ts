import { defineConfig } from 'playwright/test';
import os from 'node:os';
import path from 'node:path';

const selectedApp = process.env['SHIFAA_F010_ACCESSIBILITY_APP'] ?? 'clinic';
if (selectedApp !== 'clinic' && selectedApp !== 'patient')
  throw new Error('SHIFAA_F010_ACCESSIBILITY_APP must be clinic or patient');

const patient = selectedApp === 'patient';
const port = patient ? 18190 : 18189;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '..',
  testMatch: patient
    ? [
        'tests/e2e/feature-010-accessibility.spec.ts',
        'apps/patient/test/feature-010-records.browser.spec.ts',
        'apps/patient/test/feature-010-encounter.browser.spec.ts',
        'apps/patient/test/feature-010-chat.browser.spec.ts',
      ]
    : [
        'tests/e2e/feature-010-accessibility.spec.ts',
        'apps/clinic/test/feature-010-referrals.browser.spec.ts',
        'apps/clinic/test/feature-010-messages.browser.spec.ts',
        'apps/clinic/test/feature-010-start.test.tsx',
        'apps/clinic/test/feature-010-encounter.test.tsx',
      ],
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: { baseURL, browserName: 'chromium', trace: 'off', screenshot: 'off' },
  outputDir: path.join(os.tmpdir(), `shifaa-f010-${selectedApp}-accessibility-temporary`),
  webServer: {
    command: patient
      ? `corepack pnpm --filter @shifaa/patient exec expo start --web --port ${port} --clear`
      : `corepack pnpm --filter @shifaa/clinic exec next dev --hostname 127.0.0.1 -p ${port}`,
    url: patient ? baseURL : `${baseURL}/patients/92000000-0000-4000-8000-000000000001/summary`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: patient
      ? { CI: '1', EXPO_PUBLIC_API_BASE_URL: baseURL, SHIFAA_F010_ACCESSIBILITY_APP: selectedApp }
      : {
          CI: '1',
          NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:18187',
          SHIFAA_F010_ACCESSIBILITY_APP: selectedApp,
        },
  },
});
