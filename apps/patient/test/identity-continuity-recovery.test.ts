import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screen = fs.readFileSync(new URL('../app/recovery.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/identity-continuity-api.ts', import.meta.url), 'utf8');

test('patient recovery keeps provider OTP and case material in memory-only anonymous mutations', () => {
  for (const token of [
    'startRecovery',
    'completeRecovery',
    'caseRef',
    'recoveryOtp',
    'assertIdentityContinuityOnline',
    'recovery.accepted',
    'recovery.restricted',
    'recovery.completed',
    'recovery.expired',
    'recovery.rate',
    'state.offline',
    'directionFor(locale)',
    'useEffect',
    "setRecoveryOtp('')",
    "setNewCredential('')",
    'SecurityStatusBanner',
    'mapSecurityProblem',
    'accessibilityRole="button"',
    'accessibilityRole="link"',
    'href="/mfa"',
    'installSession(result.session)',
    "result.status === 'proof_required'",
    'proofGrantRef',
    'createRecoveryProof',
    "'Recovery-Proof-Grant'",
    'proof.verification_case.id',
    'autoComplete="one-time-code"',
  ]) {
    assert.match(`${screen}\n${api}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(
    `${screen}\n${api}`,
    /localStorage|AsyncStorage|queueMutation|backgroundSync|analytics|searchParams|router\.(push|replace).*token/i,
  );
  assert.doesNotMatch(screen, /onChangeText=\{setVerificationCaseId\}/);
  assert.match(screen, /reconnectStateRef\.current/);
  assert.match(screen, /state !== 'offline'/);
  assert.match(screen, /proofGrantRef\.current \?/);
});

test('native recovery supplies the OS-secure refresh credential store', () => {
  assert.match(screen, /patientNativeRefreshTokens/);
  assert.match(screen, /patientPlatform === 'native'/);
  assert.match(screen, /nativeRefreshTokens: patientNativeRefreshTokens/);
});
