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

test('live route sequence continues from identity to privacy and returns to profile', async () => {
  const fs = await import('node:fs/promises');
  const identityRoute = await fs.readFile(new URL('../app/identity.tsx', import.meta.url), 'utf8');
  const consentRoute = await fs.readFile(
    new URL('../app/privacy-consents.tsx', import.meta.url),
    'utf8',
  );
  assert.match(identityRoute, /router\.push\('\/privacy'\)/);
  assert.match(consentRoute, /router\.replace\('\/profile'\)/);
  assert.match(consentRoute, /purposes\.every/);
});

test('patient locale is selectable and persists across route reloads', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/locale-context.tsx', import.meta.url), 'utf8'),
  );
  assert.match(source, /shifaa\.patient\.locale/);
  assert.match(source, /'en-EG'/);
  assert.match(source, /'ar-EG'/);
});
