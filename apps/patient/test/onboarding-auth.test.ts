import assert from 'node:assert/strict';
import test from 'node:test';
import { authStateMessage, authStates } from '../src/view-models.ts';

test('onboarding/auth defines all required recoverable states', () => {
  for (const state of ['loading', 'offline', 'rate_limited', 'error', 'success', 'otp'] as const)
    assert.ok(authStates.includes(state));
  for (const state of authStates) assert.notEqual(authStateMessage(state), undefined);
});

test('route copy uses an action instead of a generic submit label', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../app/onboarding.tsx', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(source, />\s*Submit\s*</i);
  assert.match(source, /auth\.create/);
});
