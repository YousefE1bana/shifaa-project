import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screen = fs.readFileSync(new URL('../app/mfa.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/identity-continuity-api.ts', import.meta.url), 'utf8');

test('patient MFA uses generated mutations and a minimum read-only native factor port', () => {
  for (const token of [
    'beginMfaEnrollment',
    'verifyMfaEnrollment',
    'removeMfaFactor',
    'NativeFactorSummaryReader',
    '/auth/v1/user',
    'assertIdentityContinuityOnline',
  ]) {
    assert.match(`${screen}\n${api}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(
    `${screen}\n${api}`,
    /service_role|localStorage|AsyncStorage|queueMutation|backgroundSync/,
  );
});

test('patient MFA keeps one-time enrollment material in component memory and exposes accessible states', () => {
  for (const token of [
    'qrUri',
    'cachePolicy="none"',
    'isLocalQrDataUri',
    'data:image',
    'onError={() => setQrVisible(false)}',
    'mfa.qrUnavailable',
    'secret',
    'selectable',
    'accessibilityLiveRegion',
    'accessibilityRole="alert"',
    'confirmOptionalLastFactor',
    'mfa.pendingExpired',
    'mfa.pendingExisting',
    'problemStatus(error) === 410',
    'mfa.lastRequired',
    'mfa.rate',
    'mfa.offline',
    'directionFor(locale)',
    'minimumTargetSize',
    'patientPrimaryTargetSize',
  ]) {
    assert.match(screen, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(screen, /router\.(push|replace).*secret|searchParams.*secret|href=.*secret/i);
  assert.doesNotMatch(screen, /https?:\/\/.*qr|qrcode|qrserver/i);
});
