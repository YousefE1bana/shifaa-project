import assert from 'node:assert/strict';
import test from 'node:test';
import { consentStateMessage, consentStates, saveableConsentChoices } from '../src/view-models.ts';

const choices = [
  { purposeCode: 'reminders', decision: 'granted' as const, version: 1 },
  { purposeCode: 'experience', decision: 'refused' as const, version: 1 },
];

test('consent choices are granular and preserve grant/refuse parity', () => {
  const result = saveableConsentChoices(choices, true);
  assert.deepEqual(
    result.saved.map(({ decision }) => decision),
    ['granted', 'refused'],
  );
  assert.ok(consentStates.includes('saved'));
  for (const state of consentStates) assert.notEqual(consentStateMessage(state), undefined);
});

test('offline consent mutation is blocked and never queued', () => {
  assert.deepEqual(saveableConsentChoices(choices, false), {
    queued: false,
    saved: [],
    reason: 'offline',
  });
});
