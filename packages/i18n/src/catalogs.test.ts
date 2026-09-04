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

test('family care catalog has authored parity and explicit safety consequences', () => {
  const familyKeys = Object.keys(arEG).filter((key) =>
    /^(family|admin\.guardianship)/.test(key),
  ) as (keyof typeof arEG)[];
  assert.ok(familyKeys.length >= 50);
  assert.ok(familyKeys.every((key) => arEG[key] && enEG[key]));
  assert.match(arEG['family.contact.disclosure'], /SOS/);
  assert.match(enEG['family.contact.disclosure'], /never send/i);
  assert.match(arEG['family.problem.offline'], /لم نضع/);
  assert.match(enEG['family.problem.offline'], /not queued/i);
});

test('identity continuity copy preserves security and legal boundaries', () => {
  const keys = Object.keys(arEG).filter((key) =>
    /^(security|mfa|recovery|transition)\./.test(key),
  ) as (keyof typeof arEG)[];
  assert.ok(keys.length >= 35);
  assert.ok(keys.every((key) => arEG[key] && enEG[key]));
  assert.match(enEG['transition.notEligible'], /does not transfer/i);
  assert.match(arEG['transition.notEligible'], /لا يوجد انتقال/);
  assert.match(enEG['recovery.accepted'], /same safe next-step response/i);
  assert.match(enEG['mfa.unsupported'], /not enabled/i);
});

test('audit admin copy is Arabic-first, parity-safe, and avoids raw-count disclosure', () => {
  const keys = Object.keys(arEG).filter((key) =>
    key.startsWith('auditAdmin.'),
  ) as (keyof typeof arEG)[];
  assert.ok(keys.length >= 30);
  assert.ok(keys.every((key) => arEG[key] && enEG[key]));
  assert.match(arEG['auditAdmin.summary.suppressed'], /الحد الأدنى/);
  assert.match(enEG['auditAdmin.summary.suppressed'], /minimum privacy threshold/i);
  assert.match(enEG['auditAdmin.summary.inactive'], /no approved metric/i);
  assert.match(enEG['auditAdmin.audit.purposeHelp'], /approved purpose/i);
  assert.match(enEG['auditAdmin.audit.integrityFailed'], /do not rely/i);
  assert.match(enEG['auditAdmin.export.offline'], /not queued/i);
  assert.match(enEG['auditAdmin.health.ready'], /ready/i);
  assert.ok(keys.every((key) => !/raw count|exact suppressed count/i.test(enEG[key])));
});
