import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const surfaces = ['mfa.tsx', 'recovery.tsx', 'relationships.tsx']
  .map((file) => fs.readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8'))
  .join('\n');
const api = fs.readFileSync(new URL('../src/identity-continuity-api.ts', import.meta.url), 'utf8');

test('patient security surfaces reconcile on reconnect and never queue offline mutations', () => {
  assert.match(surfaces, /useSecurityConnection/);
  assert.match(surfaces, /reconnectVersion/);
  assert.match(surfaces, /markReconciled/);
  assert.match(surfaces, /securityMutationAllowed/);
  assert.match(`${surfaces}\n${api}`, /offline-no-queue/);
  assert.doesNotMatch(
    `${surfaces}\n${api}`,
    /queueMutation|backgroundSync|AsyncStorage|localStorage/,
  );
});
