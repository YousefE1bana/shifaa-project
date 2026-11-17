import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionFor, feature012ActionName, feature012Copy, feature012Receipt } from './index.ts';

const approved = {
  'ar-EG': {
    direction: 'rtl',
    sourceLabels: [
      'معلومة ضمن النطاق المعلن',
      'فارغة ضمن النطاق المثبت',
      'مفقودة',
      'غير متاحة',
      'قديمة',
      'جزئية',
    ],
    freshness: 'الحداثة غير معروفة',
    emptyLimit:
      'لا توجد سجلات ضمن مجموعة العرض المصرح بها المكتملة فقط؛ هذا لا يعني عدم وجود أدوية أو حساسية.',
    sourceLimits: {
      present: 'تغطية مرتبطة بالمصدر؛ لا استنتاج سريري.',
      missing: 'لا تُستنتج معلومات من مصدر غير موجود.',
      unavailable: 'عدم الإتاحة ليس نتيجة فارغة ولا فحصاً ناجحاً.',
      stale: 'المصدر المعروض لا يثبت الصلاحية الحالية.',
      partial: 'المعلومات المتاحة لا تغطي كل النطاق المطلوب.',
    },
    withdrawn:
      'سحب الإتاحة نهائي لنفس السجل المحدد وإصداره؛ ولا يمكن إتاحته مرة أخرى، حتى يدوياً. يمنع السحب القراءات اللاحقة، لكنه لا يمكنه استرجاع معلومات سبق الكشف عنها.',
    historical: 'سجل تاريخي — غير صالح للاستخدام الحالي',
    historicalLimit:
      'تُعرض لحفظ التاريخ فقط؛ لا تستخدمها كوصفة حالية ولا كتعليمات علاج. لا يمنح رابط الاستبدال تصريحاً لعرض وصفة أخرى.',
    authorizationLimit: 'لا تُعرض تفاصيل السجل أو وجود مصادر محجوبة.',
    assessmentLimit: 'مطابقة المصدر لا تسمح بالعلاج أو التوقيع السريري.',
    blockedRelease: 'إجراءات الإتاحة محظورة.',
    blockedName: 'محظور: تأكيد إتاحة الأهداف المحددة',
    releaseName: 'تأكيد إتاحة الأهداف المحددة',
    withdrawalName: 'تأكيد سحب الهدف المحدد',
    signName: 'تأكيد التوقيع مع الاختيارات الصريحة',
    accessible: ['إيصال نتيجة تجريبية', 'محتوى السجل القابل للتمرير', 'سياق العرض'],
    fields: ['الحالة', 'المرجع', 'الوقت', 'الخطوة التالية'],
    resultNames: ['نتيجة تجريبية محفوظة', 'تم تسجيل الإتاحة', 'تم سحب الإتاحة'],
    next: 'عرض الحالة الحالية المصرّح بها',
  },
  'en-EG': {
    direction: 'ltr',
    sourceLabels: [
      'Known within declared scope',
      'Verified empty within scope',
      'Missing',
      'Unavailable',
      'Stale',
      'Partial',
    ],
    freshness: 'Freshness unknown',
    emptyLimit:
      'No records exist within this complete authorized projection scope only; this does not establish absence of medications or allergies.',
    sourceLimits: {
      present: 'Source-bound coverage; no clinical inference.',
      missing: 'No facts are inferred from a missing source.',
      unavailable: 'Unavailability is neither an empty result nor a successful check.',
      stale: 'The displayed source does not establish current eligibility.',
      partial: 'Available information does not cover the full required scope.',
    },
    withdrawn:
      'Withdrawal is terminal for the same target and revision. It cannot be released again, including manually. Withdrawal denies later reads, but cannot recall information already disclosed.',
    historical: 'Historical record — not valid for current use',
    historicalLimit:
      'Shown to preserve history only; do not use it as a current prescription or treatment instruction. A replacement link grants no access to another prescription.',
    authorizationLimit: 'Record details and hidden-source existence are not disclosed.',
    assessmentLimit: 'Source matching does not authorize treatment or clinical signing.',
    blockedRelease: 'Release actions blocked.',
    blockedName: 'Blocked: Confirm selected release',
    releaseName: 'Confirm selected release',
    withdrawalName: 'Confirm selected withdrawal',
    signName: 'Confirm signing with explicit choices',
    accessible: ['Exercise outcome receipt', 'Scrollable record content', 'Viewing context'],
    fields: ['Status', 'Reference', 'Time', 'Next step'],
    resultNames: ['Committed exercise outcome', 'Release recorded', 'Release withdrawn'],
    next: 'Read current authorized state',
  },
} as const;

const locales = ['ar-EG', 'en-EG'] as const;
const sourceStates = [
  'present',
  'verified_empty',
  'missing',
  'unavailable',
  'stale',
  'partial',
] as const;
const errorStates = [
  'denied',
  'revoked',
  'withdrawn',
  'recoverable_error',
  'fatal_error',
  'offline',
  'conflict',
  'uncertain',
  'step_up',
  'producer_failure',
] as const;
const actionKeys = [
  'confirmRelease',
  'confirmWithdrawal',
  'confirmSigning',
  'reconcileOriginalKey',
  'refreshAuthorizedState',
  'readCurrentState',
  'readAndReconcile',
  'refreshSourceState',
  'backToRecords',
] as const;

function textLeaves(value: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(value).flatMap(([key, entry]): [string, string][] => {
    const path = prefix + key;
    if (typeof entry === 'string') return [[path, entry]];
    assert.ok(entry && typeof entry === 'object' && !Array.isArray(entry), path);
    return textLeaves(entry as Record<string, unknown>, path + '.');
  });
}

test('F012 locale catalogs are Arabic-first, complete, and structurally equivalent', () => {
  assert.deepEqual(Object.keys(feature012Copy), locales);
  const [ar, en] = locales.map((locale) => textLeaves(feature012Copy[locale]));
  assert.deepEqual(ar.map(([path]) => path).sort(), en.map(([path]) => path).sort());
  for (const [path, value] of [...ar, ...en]) {
    assert.ok(value.trim(), path);
    assert.doesNotMatch(value, /\bF0?14\b|\bdispens\w*\b|الصرف|تم صرف/iu, path);
    assert.doesNotMatch(
      value,
      /\b(?:safe to (?:use|prescribe)|clinically (?:approved|cleared|verified))\b|آمن للاستخدام|معتمد سريرياً/iu,
      path,
    );
  }
  assert.ok(ar.every(([, value]) => /\p{Script=Arabic}/u.test(value)));
  assert.ok(en.every(([, value]) => /[A-Za-z]/.test(value)));
});

for (const locale of locales) {
  const expected = approved[locale];

  test(`${locale} presents six distinct source meanings and separate unknown freshness`, () => {
    const copy = feature012Copy[locale];
    assert.equal(directionFor(locale), expected.direction);
    assert.deepEqual(Object.keys(copy.sources), sourceStates);
    assert.deepEqual(
      sourceStates.map((state) => copy.sources[state].label),
      expected.sourceLabels,
    );
    assert.equal(new Set(sourceStates.map((state) => copy.sources[state].detail)).size, 6);
    assert.equal(copy.sources.verified_empty.detail, expected.emptyLimit);
    for (const state of sourceStates) {
      if (state !== 'verified_empty') {
        assert.equal(copy.sources[state].detail, expected.sourceLimits[state]);
      }
      assert.ok(copy.sources[state].next.trim(), state);
    }
    assert.equal(copy.freshnessUnknown.label, expected.freshness);
    assert.ok(
      !sourceStates.some((state) => copy.sources[state].label === copy.freshnessUnknown.label),
    );
  });

  test(`${locale} states historical non-use, terminal withdrawal and disclosure limits`, () => {
    const copy = feature012Copy[locale];
    assert.equal(copy.safety.historicalTitle, expected.historical);
    assert.equal(copy.safety.historicalDetail, expected.historicalLimit);
    assert.equal(copy.safety.withdrawalConfirmation, expected.withdrawn);
    assert.equal(copy.safety.assessmentLimit, expected.assessmentLimit);
    assert.equal(copy.errors.denied.detail, expected.authorizationLimit);
    assert.notEqual(copy.errors.withdrawn.detail, copy.safety.withdrawalConfirmation);
  });

  test(`${locale} names blocked actions, choices and accessible regions distinctly`, () => {
    const copy = feature012Copy[locale];
    assert.equal(copy.safety.releaseBlocked, expected.blockedRelease);
    assert.equal(feature012ActionName(locale, 'confirmRelease', true), expected.blockedName);
    assert.equal(feature012ActionName(locale, 'confirmRelease'), expected.releaseName);
    assert.equal(feature012ActionName(locale, 'confirmWithdrawal'), expected.withdrawalName);
    assert.equal(feature012ActionName(locale, 'confirmSigning'), expected.signName);
    assert.deepEqual(Object.values(copy.accessibleNames), expected.accessible);
    assert.equal(new Set(Object.values(copy.releaseChoices)).size, 2);
    assert.equal(
      new Set(actionKeys.map((action) => feature012ActionName(locale, action))).size,
      actionKeys.length,
    );
  });

  test(`${locale} provides distinct errors, actionable recovery and durable result labels`, () => {
    const copy = feature012Copy[locale];
    assert.equal(
      new Set(errorStates.map((state) => copy.errors[state].title)).size,
      errorStates.length,
    );
    for (const state of errorStates) {
      assert.ok(copy.errors[state].detail.trim(), state);
      assert.ok(copy.errors[state].next.trim(), state);
    }
    assert.deepEqual(Object.values(copy.results), expected.resultNames);
    assert.deepEqual(Object.values(copy.receiptFields), expected.fields);
  });

  test(`${locale} isolates only the opaque reference and time in the receipt`, () => {
    const receipt = feature012Receipt(
      locale,
      'withdrawn',
      'RX-204/A',
      '2026-11-11 12:00 UTC',
      'readCurrentState',
    );
    assert.deepEqual(receipt, {
      accessibleName: expected.accessible[0],
      fields: [
        { label: expected.fields[0], value: expected.resultNames[2] },
        { label: expected.fields[1], value: '\u2066RX-204/A\u2069' },
        { label: expected.fields[2], value: '\u20662026-11-11 12:00 UTC\u2069' },
        { label: expected.fields[3], value: expected.next },
      ],
    });
  });
}
