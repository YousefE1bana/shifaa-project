import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./EmergencyFoundation.tsx', import.meta.url), 'utf8');

test('emergency primitives expose text, live regions, freshness, and a direct 123 action', () => {
  for (const token of [
    'fresh',
    'stale',
    'unknown',
    'accessibilityLiveRegion',
    "Linking.openURL('tel:123')",
  ])
    assert.match(source, new RegExp(token.replace(/[()'.]/g, '\\$&')));
  assert.match(source, /borderRightColor/);
  assert.match(source, /borderLeftColor/);
  assert.doesNotMatch(source, /animation|transition|blur|AsyncStorage|localStorage/);
});
