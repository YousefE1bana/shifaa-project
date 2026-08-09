import assert from 'node:assert/strict';
import test from 'node:test';
import { arEG, directionFor, enEG, isolateLtr } from './index.ts';

test('Arabic source and English catalog have exact key parity', () => {
  assert.deepEqual(Object.keys(enEG).sort(), Object.keys(arEG).sort());
  assert.ok(Object.values(arEG).every(Boolean));
  assert.ok(Object.values(enEG).every(Boolean));
});

test('direction and bidi isolation are deterministic', () => {
  assert.equal(directionFor('ar-EG'), 'rtl');
  assert.equal(directionFor('en-EG'), 'ltr');
  assert.equal(isolateLtr('***1234'), '\u2066***1234\u2069');
});
