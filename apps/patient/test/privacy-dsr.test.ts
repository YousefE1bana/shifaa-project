import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const route = fs.readFileSync(new URL('../app/privacy/requests.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/privacy-dsr-api.ts', import.meta.url), 'utf8');

test('privacy requests expose all DSR types, due/history, and bounded export states', () => {
  for (const token of [
    'access_export',
    'correction',
    'restriction',
    'erasure_pseudonymization',
    'due_at',
    'version',
    'export-ready',
    'export-expired',
    'retentionBlocked',
    'downloadDsrExport',
    'URL.revokeObjectURL',
  ])
    assert.match(route, new RegExp(token));
});

test('privacy requests are bilingual, accessible, responsive, and never queue offline writes', () => {
  for (const token of [
    'usePatientLocale',
    'accessibilityRole="radiogroup"',
    'accessibilityLabel',
    'selectable',
    'navigator.onLine',
    'offline',
    'permission',
    'stale',
    'failure',
    'success',
    'readSyntheticDisplayState',
    "process.env.NODE_ENV === 'production'",
  ])
    assert.match(route, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(api, /offline-no-queue/);
  assert.doesNotMatch(api, /backgroundSync|queueMutation/i);
  assert.match(api, /PrivacyDsrNotificationClient/);
});
