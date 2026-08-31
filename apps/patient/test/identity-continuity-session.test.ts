import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { resolvePatientApiBaseUrl } from '../src/patient-api-base-url.ts';

const source = fs.readFileSync(
  new URL('../src/identity-continuity-api.ts', import.meta.url),
  'utf8',
);

test('patient session behavior uses generated API, memory access, and secure native refresh ports', () => {
  for (const token of [
    'IdentityContinuityClient',
    'MemoryAccessTokenStore',
    'SessionContinuationController',
    'NativeSecureRefreshStorage',
    'foregroundEngaged: true',
    'offline-no-queue',
  ]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /localStorage|AsyncStorage|queueMutation|backgroundSync/);
  assert.match(source, /client: 'web'/);
  assert.doesNotMatch(source, /client: 'web'[^}]*refreshToken/s);
});

test('browser session traffic stays on the patient origin and rejects cross-origin configuration', () => {
  assert.equal(
    resolvePatientApiBaseUrl({ platform: 'web', webOrigin: 'https://patient.synthetic.test' }),
    'https://patient.synthetic.test',
  );
  assert.equal(
    resolvePatientApiBaseUrl({
      platform: 'web',
      webOrigin: 'https://patient.synthetic.test',
      configuredBaseUrl: '/api',
    }),
    'https://patient.synthetic.test/api',
  );
  assert.throws(
    () =>
      resolvePatientApiBaseUrl({
        platform: 'web',
        webOrigin: 'https://patient.synthetic.test',
        configuredBaseUrl: 'https://api.synthetic.test',
      }),
    /browser-api-origin-mismatch/,
  );
});

test('the root layout mounts the shared foreground session lifecycle', () => {
  const layout = fs.readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  const runtime = fs.readFileSync(
    new URL('../src/patient-session-runtime.tsx', import.meta.url),
    'utf8',
  );
  assert.match(layout, /PatientSessionLifecycle/);
  assert.match(runtime, /patientAccessTokens/);
  assert.match(runtime, /AppState\.addEventListener/);
  assert.match(runtime, /visibilitychange/);
  const metro = fs.readFileSync(new URL('../metro.config.cjs', import.meta.url), 'utf8');
  assert.match(metro, /request\.url\?\.startsWith\('\/v1\/'\)/);
  assert.match(metro, /SHIFAA_API_PROXY_TARGET/);
});
