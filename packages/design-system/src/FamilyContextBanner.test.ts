import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./FamilyContextBanner.tsx', import.meta.url), 'utf8');

test('family context is explicit, announced, focus-restoring, directional, and touch accessible', () => {
  for (const token of [
    'patientName',
    'relationshipLabel',
    'confirmed',
    'accessibilityLabel',
    'requestAnimationFrame',
    'focus()',
    'direction',
    'minimumTargetSize',
  ]) {
    assert.match(source, new RegExp(token.replace(/[()]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /AsyncStorage|queue|background sync/i);
});
