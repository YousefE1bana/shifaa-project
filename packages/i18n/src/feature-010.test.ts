import assert from 'node:assert/strict';
import test from 'node:test';

// Namespace import keeps this RED test executable before the feature exports exist.
import * as i18n from './index.ts';

type Feature010CopyFamily = Record<string, string>;
type Feature010CopyBundle = Record<string, Feature010CopyFamily>;
const feature = i18n as typeof i18n & {
  feature010ArEG: Feature010CopyBundle;
  feature010EnEG: Feature010CopyBundle;
  feature010FamilyKeys: string[];
};

test('Feature 010 exposes bilingual copy bundles for its six rendered route families', () => {
  assert.equal(typeof feature.feature010ArEG, 'object');
  assert.equal(typeof feature.feature010EnEG, 'object');
  assert.deepEqual(feature.feature010FamilyKeys, [
    'patient.records',
    'patient.encounter',
    'clinic.summary',
    'clinic.encounter',
    'clinic.referrals',
    'clinic.messages',
  ]);

  const ar = feature.feature010ArEG;
  const en = feature.feature010EnEG;
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  for (const family of feature.feature010FamilyKeys) {
    assert.ok(ar[family]);
    assert.ok(en[family]);
    assert.deepEqual(
      Object.keys(ar[family]).sort(),
      Object.keys(en[family]).sort(),
      `${family} copy keys match in Arabic and English`,
    );
    assert.ok(Object.values(ar[family]).every((value) => typeof value === 'string' && value));
    assert.ok(Object.values(en[family]).every((value) => typeof value === 'string' && value));
  }
});

test('family copy retains approved wording already rendered by Feature 010 routes', () => {
  assert.equal(typeof feature.feature010ArEG, 'object', 'Arabic Feature 010 bundles are exported');
  assert.equal(typeof feature.feature010EnEG, 'object', 'English Feature 010 bundles are exported');
  if (!feature.feature010ArEG || !feature.feature010EnEG) return;
  assert.equal(feature.feature010ArEG['patient.records'].empty, 'لا توجد إحالات معلّقة.');
  assert.equal(feature.feature010EnEG['patient.records'].empty, 'There are no pending referrals.');
  assert.equal(feature.feature010ArEG['patient.encounter'].open, 'الزيارة جارية');
  assert.equal(feature.feature010EnEG['patient.encounter'].open, 'Encounter in progress');
  assert.equal(feature.feature010ArEG['clinic.summary'].title, 'ملخص المريض');
  assert.equal(feature.feature010EnEG['clinic.summary'].title, 'Patient summary');
  assert.equal(feature.feature010ArEG['clinic.encounter'].title, 'مساحة الزيارة');
  assert.equal(feature.feature010EnEG['clinic.encounter'].title, 'Encounter workspace');
  assert.equal(feature.feature010ArEG['clinic.referrals'].title, 'الإحالات');
  assert.equal(feature.feature010EnEG['clinic.referrals'].title, 'Referrals');
  assert.equal(feature.feature010ArEG['clinic.messages'].messages, 'الرسائل');
  assert.equal(feature.feature010EnEG['clinic.messages'].messages, 'Messages');
});
