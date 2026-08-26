import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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
