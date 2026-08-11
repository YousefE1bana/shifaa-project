import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./StaffFacilityWorkspace.tsx', import.meta.url), 'utf8');

test('facility workspace includes every seeded acceptance state and accessible live status', () => {
  for (const state of [
    'loading',
    'empty',
    'quarantined',
    'released',
    'pending',
    'rejected',
    'active',
    'suspended',
    'invited',
    'ended',
    'expired',
    'license-invalid',
    'offline',
    'permission',
    'conflict',
    'error',
    'success',
  ])
    assert.match(source, new RegExp(`['\"]${state}['\"]`));
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-busy=/);
  assert.match(source, /dir=/);
});
