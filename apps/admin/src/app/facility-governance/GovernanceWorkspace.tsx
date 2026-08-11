'use client';
import React, { useState } from 'react';
const copy = {
  ar: {
    switch: 'English',
    eyebrow: 'شفاء · مراجعة مقيدة',
    minimum: 'تعرض الصفحة الحد الأدنى اللازم فقط. تتطلب الجلسة AAL2 وغرضًا صالحًا.',
    reason: 'سبب القرار',
    approve: 'اعتماد',
    reject: 'رفض',
    suspend: 'تعليق',
    saved: 'تم حفظ القرار مع هوية الشخص المنفذ.',
    empty: 'لا توجد حالات مكلّفة الآن.',
    independent: 'يجب أن يكون متخذ القرار مستقلاً عن مقدم الطلب وصاحب الصلاحية.',
    state: 'حالة العرض الاصطناعي',
    actionSummary: 'الإجراءات الدقيقة: عرض، اقتراح منح، قرار منح، اقتراح سحب، قرار سحب.',
  },
  en: {
    switch: 'العربية',
    eyebrow: 'SHIFAA · Restricted review',
    minimum:
      'This page shows the minimum necessary projection. AAL2 and a valid purpose are required.',
    reason: 'Decision reason',
    approve: 'Approve',
    reject: 'Reject',
    suspend: 'Suspend',
    saved: 'The decision was saved with authenticated-person attribution.',
    empty: 'No assigned cases are available.',
    independent: 'The decision actor must be independent from the proposer and role holder.',
    state: 'Synthetic display state',
    actionSummary:
      'Exact actions: list, propose grant, decide grant, propose revocation, decide revocation.',
  },
} as const;
const governanceStates = [
  'loading',
  'empty',
  'released',
  'quarantined',
  'pending',
  'active',
  'rejected',
  'revocation-pending',
  'revoked',
  'expired',
  'aal-required',
  'purpose-required',
  'self-denied',
  'conflict',
  'error',
  'success',
] as const;
type GovernanceState = (typeof governanceStates)[number];
const stateCopy: Record<'ar' | 'en', Record<GovernanceState, string>> = {
  ar: {
    loading: 'جارٍ تحميل أقل قدر لازم من البيانات…',
    empty: 'لا توجد حالات مكلّفة الآن.',
    released: 'الدليل مفحوص ومتاح للمراجعة.',
    quarantined: 'الدليل معزول ولا يمكن اعتماده.',
    pending: 'الطلب بانتظار قرار مستقل.',
    active: 'الصلاحية أو المنشأة نشطة.',
    rejected: 'رُفض الطلب مع حفظ السبب.',
    'revocation-pending': 'طلب السحب بانتظار قرار مستقل.',
    revoked: 'سُحبت الصلاحية وأُزيل الوصول فورًا.',
    expired: 'انتهت الصلاحية.',
    'aal-required': 'يلزم مستوى AAL2.',
    'purpose-required': 'يلزم غرض مراجعة صالح.',
    'self-denied': 'رُفض القرار الذاتي بسبب فصل المهام.',
    conflict: 'تغيّرت النسخة؛ حدّث قائمة العمل.',
    error: 'فشل الإجراء دون حفظ نتيجة جزئية.',
    success: 'تم حفظ القرار مع هوية الشخص المنفذ.',
  },
  en: {
    loading: 'Loading the minimum necessary projection…',
    empty: 'No assigned cases are available.',
    released: 'The evidence is scanned and released for review.',
    quarantined: 'Quarantined evidence cannot be approved.',
    pending: 'The proposal awaits an independent decision.',
    active: 'The role or facility is active.',
    rejected: 'The request was rejected with its reason.',
    'revocation-pending': 'Revocation awaits an independent decision.',
    revoked: 'The role was revoked and access was removed immediately.',
    expired: 'The authorization expired.',
    'aal-required': 'AAL2 is required.',
    'purpose-required': 'A valid review purpose is required.',
    'self-denied': 'Self-decision was denied by separation of duties.',
    conflict: 'The version changed; refresh the worklist.',
    error: 'The action failed without a partial result.',
    success: 'The decision was saved with authenticated-person attribution.',
  },
};
const titles = {
  facility: { ar: 'مراجعة المنشآت', en: 'Facility reviews' },
  professional: { ar: 'مراجعة التراخيص المهنية', en: 'Professional license reviews' },
  roles: { ar: 'صلاحيات الإدارة', en: 'Administrative access' },
} as const;
export function GovernanceWorkspace({ kind }: { kind: keyof typeof titles }) {
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState<GovernanceState>('pending');
  const t = copy[locale];
  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} style={s.main}>
      <button style={s.switch} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
        {t.switch}
      </button>
      <header>
        <p style={s.eyebrow}>{t.eyebrow}</p>
        <h1>{titles[kind][locale]}</h1>
        <p>{t.minimum}</p>
      </header>
      <div style={s.grid}>
        <section style={s.card} aria-labelledby="queue">
          <h2 id="queue">{locale === 'ar' ? 'قائمة العمل' : 'Worklist'}</h2>
          <label htmlFor="governance-state">{t.state}</label>
          <select
            id="governance-state"
            value={state}
            onChange={(event) => setState(event.target.value as GovernanceState)}
            style={s.select}
          >
            {governanceStates.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <article style={s.case}>
            <b>
              {kind === 'facility'
                ? 'clinic · SYN-FAC-001'
                : kind === 'professional'
                  ? 'doctor · ••••0001'
                  : 'facility_approver'}
            </b>
            <p>
              {kind === 'roles'
                ? t.independent
                : locale === 'ar'
                  ? 'مستند آمن تم فحصه · نسخة 2'
                  : 'Released scanned evidence · version 2'}
            </p>
          </article>
          {kind === 'roles' ? (
            <p>
              <b>{t.actionSummary}</b>
            </p>
          ) : null}
        </section>
        <section style={s.card} aria-labelledby="decision">
          <h2 id="decision">{locale === 'ar' ? 'القرار' : 'Decision'}</h2>
          <label htmlFor="reason">{t.reason}</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={s.textarea}
          />
          <div style={s.actions}>
            <button
              disabled={reason.trim().length < 3}
              style={s.approve}
              onClick={() => setSaved(true)}
            >
              {t.approve}
            </button>
            <button
              disabled={reason.trim().length < 3}
              style={s.reject}
              onClick={() => setSaved(true)}
            >
              {t.reject}
            </button>
            {kind === 'facility' ? (
              <button
                disabled={reason.trim().length < 3}
                style={s.reject}
                onClick={() => setSaved(true)}
              >
                {t.suspend}
              </button>
            ) : null}
          </div>
          {kind === 'roles' ? (
            <div
              style={s.actions}
              aria-label={locale === 'ar' ? 'سير فصل المهام' : 'Four-eyes workflow'}
            >
              <button style={s.approve} onClick={() => setState('pending')}>
                {locale === 'ar' ? 'اقتراح منح' : 'Propose grant'}
              </button>
              <button style={s.approve} onClick={() => setState('active')}>
                {locale === 'ar' ? 'قرار منح مستقل' : 'Independent grant decision'}
              </button>
              <button style={s.reject} onClick={() => setState('revocation-pending')}>
                {locale === 'ar' ? 'اقتراح سحب' : 'Propose revocation'}
              </button>
              <button style={s.reject} onClick={() => setState('revoked')}>
                {locale === 'ar' ? 'قرار سحب مستقل' : 'Independent revocation decision'}
              </button>
            </div>
          ) : null}
          <p role="status" aria-live="polite">
            {saved ? t.saved : stateCopy[locale][state]}
          </p>
        </section>
      </div>
    </main>
  );
}
const s: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#f5fafc',
    color: '#102a43',
    padding: 'clamp(16px,4vw,56px)',
    fontFamily: "Cairo, 'Noto Sans Arabic', system-ui",
  },
  switch: {
    minHeight: 44,
    border: '2px solid #075985',
    borderRadius: 10,
    background: '#fff',
    color: '#075985',
    paddingInline: 16,
    font: 'inherit',
    fontWeight: 700,
  },
  eyebrow: { color: '#075985', fontWeight: 800 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))',
    gap: 24,
    marginBlockStart: 28,
  },
  card: { background: '#fff', border: '1px solid #bcccdc', borderRadius: 18, padding: 24 },
  case: { borderInlineStart: '5px solid #075985', background: '#edf6fa', padding: 16 },
  textarea: {
    display: 'block',
    width: '100%',
    minHeight: 120,
    marginBlock: 8,
    border: '1px solid #829ab1',
    borderRadius: 10,
    font: 'inherit',
  },
  select: { display: 'block', width: '100%', minHeight: 44, marginBlock: 8, font: 'inherit' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBlockStart: 16 },
  approve: {
    minHeight: 48,
    border: 0,
    borderRadius: 10,
    background: '#087f5b',
    color: '#fff',
    paddingInline: 20,
    font: 'inherit',
    fontWeight: 800,
  },
  reject: {
    minHeight: 48,
    border: '2px solid #b42318',
    borderRadius: 10,
    background: '#fff',
    color: '#b42318',
    paddingInline: 20,
    font: 'inherit',
    fontWeight: 800,
  },
};
