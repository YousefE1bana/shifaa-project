import assert from 'node:assert/strict';
import test from 'node:test';
import {
  identityProjectionText,
  identityStateMessage,
  identityStates,
} from '../src/view-models.ts';

test('identity covers vendor, manual, quarantine and failure states', () => {
  for (const state of [
    'pending',
    'manual_review',
    'quarantine',
    'rejected',
    'failed',
    'offline',
  ] as const)
    assert.ok(identityStates.includes(state));
  for (const state of identityStates) assert.notEqual(identityStateMessage(state), undefined);
});

test('submitted identity projection renders masked value only', () => {
  // Invalid month 13 keeps this deterministic fixture impossible as an Egyptian National ID.
  const raw = '29913321234567';
  const output = identityProjectionText({
    id: 'case-1',
    identityType: 'egyptian_national_id',
    maskedValue: '**********67',
    status: 'pending',
  });
  assert.doesNotMatch(output, new RegExp(raw));
  assert.match(output, /\*{10}67/);
});
