import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { securityMutationAllowed } from './SecurityReconciliation.ts';

const current = {
  online: true,
  reconciliationRequired: false,
  sessionCurrent: true,
  authorityCurrent: true,
};

test('security mutation gate denies every stale or disconnected authority state', () => {
  assert.equal(securityMutationAllowed(current), true);
  assert.equal(securityMutationAllowed({ ...current, online: false }), false);
  assert.equal(securityMutationAllowed({ ...current, reconciliationRequired: true }), false);
  assert.equal(securityMutationAllowed({ ...current, sessionCurrent: false }), false);
  assert.equal(securityMutationAllowed({ ...current, authorityCurrent: false }), false);
});

test('connection hook requires authoritative reconciliation after reconnect without persistence', () => {
  const source = fs.readFileSync(new URL('./SecurityReconciliation.ts', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('offline'/);
  assert.match(source, /addEventListener\('online'/);
  assert.match(source, /reconnectVersion !== reconciledVersion/);
  assert.doesNotMatch(source, /AsyncStorage|localStorage|queue|backgroundSync/i);
});
