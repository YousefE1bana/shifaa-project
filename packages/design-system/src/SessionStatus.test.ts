import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./security/SessionStatus.tsx', import.meta.url), 'utf8');

test('session states reuse the shared accessible route-state panel', () => {
  assert.match(source, /SecurityStatusBanner/);
  assert.match(source, /expired.*degraded.*offline/);
  assert.match(source, /state === 'offline' \? 'offline' : 'danger'/);
  assert.match(source, /direction=\{direction\}/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}|localStorage|AsyncStorage|queue/i);
});
