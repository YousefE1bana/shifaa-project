'use client';
import React, { useState } from 'react';
export type StaffFacilityType = 'clinic' | 'pharmacy' | 'hospital' | 'laboratory';
const labels = {
  ar: {
    switch: 'English',
    onboarding: 'تسجيل المنشأة',
    team: 'فريق المنشأة',
    intro: 'مساحة تشغيل تجريبية ببيانات اصطناعية فقط',
    create: 'إنشاء مسودة',
    upload: 'رفع مستند خاص',
    submit: 'إرسال للمراجعة',
    invite: 'دعوة عضو مرخّص',
    status: 'حالة الطلب',
    quarantine: 'المستند معزول حتى اكتمال فحص الأمان.',
    offline: 'يلزم الاتصال بالإنترنت. لا يتم حفظ القرارات دون اتصال.',
    success: 'تم حفظ الإجراء ونسبته إلى الشخص والمنشأة.',
    demoState: 'حالة العرض الاصطناعي',
    types: { clinic: 'عيادة', pharmacy: 'صيدلية', hospital: 'مستشفى', laboratory: 'معمل' },
  },
  en: {
    switch: 'العربية',
    onboarding: 'Facility onboarding',
    team: 'Facility team',
    intro: 'Seeded-synthetic operations workspace only',
    create: 'Create draft',
    upload: 'Upload private evidence',
    submit: 'Submit for review',
    invite: 'Invite licensed member',
    status: 'Application status',
    quarantine: 'Evidence is quarantined until its security scan completes.',
    offline: 'Reconnect to continue. Decisions are never queued offline.',
    success: 'The action was attributed to both person and facility.',
    demoState: 'Synthetic display state',
    types: {
      clinic: 'Clinic',
      pharmacy: 'Pharmacy',
      hospital: 'Hospital',
      laboratory: 'Laboratory',
    },
  },
} as const;
const demoStates = [
  'loading',
  'empty',
  'draft',
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
] as const;
type DemoState = (typeof demoStates)[number];
const stateMessages: Record<'ar' | 'en', Record<DemoState, string>> = {
  ar: {
    loading: 'جارٍ تحميل الحد الأدنى من البيانات…',
    empty: 'لا توجد عناصر بعد.',
    draft: 'المسودة جاهزة للتعديل.',
    quarantined: 'المستند معزول حتى اكتمال فحص الأمان.',
    released: 'اكتمل فحص المستند وأصبح جاهزًا للإرسال.',
    pending: 'الطلب قيد المراجعة.',
    rejected: 'رُفض الطلب. راجع السبب ثم أنشئ مسودة جديدة.',
    active: 'المنشأة معتمدة ونشطة.',
    suspended: 'المنشأة معلّقة؛ الإجراءات المنظمة مرفوضة.',
    invited: 'أُرسلت الدعوة إلى الشخص المسمّى.',
    ended: 'انتهت العضوية وأُزيل الوصول فورًا.',
    expired: 'انتهت صلاحية الترخيص؛ الإجراء المنظم مرفوض.',
    'license-invalid': 'الترخيص غير متحقق أو مرفوض؛ الإجراء المنظم مرفوض.',
    offline: 'يلزم الاتصال بالإنترنت. لا يتم حفظ القرارات دون اتصال.',
    permission: 'ليس لديك إذن لهذا الإجراء في هذه المنشأة.',
    conflict: 'تغيّرت النسخة. حدّث البيانات قبل إعادة المحاولة.',
    error: 'تعذر إكمال الطلب. لم تُحفظ أي نتيجة جزئية.',
    success: 'تم حفظ الإجراء ونسبته إلى الشخص والمنشأة.',
  },
  en: {
    loading: 'Loading the minimum necessary data…',
    empty: 'There are no items yet.',
    draft: 'Draft is ready to edit.',
    quarantined: 'Evidence is quarantined until its security scan completes.',
    released: 'The evidence scan completed and the application can be submitted.',
    pending: 'Application pending review.',
    rejected: 'The application was rejected. Review the reason before creating a new draft.',
    active: 'The facility is approved and active.',
    suspended: 'The facility is suspended; regulated actions are denied.',
    invited: 'The invitation was sent to the named person.',
    ended: 'The membership ended and access was removed immediately.',
    expired: 'The license expired; the regulated action is denied.',
    'license-invalid': 'The license is unverified or rejected; the regulated action is denied.',
    offline: 'Reconnect to continue. Decisions are never queued offline.',
    permission: 'You do not have permission for this action in this facility.',
    conflict: 'The version changed. Refresh before trying again.',
    error: 'The request could not complete. No partial result was saved.',
    success: 'The action was attributed to both person and facility.',
  },
};
export function StaffFacilityWorkspace({
  facilityType,
  mode,
}: {
  facilityType: StaffFacilityType;
  mode: 'onboarding' | 'team';
}) {
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [state, setState] = useState<DemoState>('draft');
  const t = labels[locale];
  return (
    <main lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} style={s.main}>
      <nav aria-label="Facility navigation" style={s.nav}>
        <b>شفاء · SHIFAA</b>
        <button onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} style={s.secondary}>
          {t.switch}
        </button>
      </nav>
      <header style={s.hero}>
        <p style={s.eyebrow}>
          {t.types[facilityType]} · {facilityType}
        </p>
        <h1>{mode === 'onboarding' ? t.onboarding : t.team}</h1>
        <p>{t.intro}</p>
      </header>
      <section aria-labelledby="workspace-title" style={s.card}>
        <h2 id="workspace-title">{mode === 'onboarding' ? t.status : t.team}</h2>
        <label htmlFor="synthetic-state">{t.demoState}</label>
        <select
          id="synthetic-state"
          value={state}
          onChange={(event) => setState(event.target.value as DemoState)}
          style={s.input}
        >
          {demoStates.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {mode === 'onboarding' ? (
          <>
            <ol>
              <li aria-current={state === 'draft'}>{t.create}</li>
              <li aria-current={state === 'quarantined'}>{t.upload}</li>
              <li aria-current={state === 'pending'}>{t.submit}</li>
            </ol>
            <div style={s.actions}>
              <button style={s.primary} onClick={() => setState('draft')}>
                {t.create}
              </button>
              <button style={s.secondary} onClick={() => setState('quarantined')}>
                {t.upload}
              </button>
              <button style={s.primary} onClick={() => setState('pending')}>
                {t.submit}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{t.invite}</p>
            <label htmlFor="member">{locale === 'ar' ? 'معرّف الشخص' : 'Person ID'}</label>
            <input id="member" dir="ltr" style={s.input} placeholder="30000000-…" />
            <button style={s.primary} onClick={() => setState('success')}>
              {t.invite}
            </button>
          </>
        )}
        <div role="status" aria-live="polite" aria-busy={state === 'loading'} style={s.status}>
          {stateMessages[locale][state]}
        </div>
      </section>
      <aside style={s.note}>
        <b>{locale === 'ar' ? 'وضع عدم الاتصال' : 'Offline state'}</b>
        <p>{t.offline}</p>
      </aside>
    </main>
  );
}
const s: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#f4faf9',
    color: '#153a3d',
    fontFamily: "Cairo, 'Noto Sans Arabic', system-ui",
    padding: 'clamp(16px,4vw,56px)',
  },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  hero: { maxWidth: 760, marginBlock: '64px 32px' },
  eyebrow: { color: '#087f72', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 },
  card: {
    maxWidth: 820,
    background: '#fff',
    border: '1px solid #9fc8c2',
    borderRadius: 24,
    padding: 'clamp(20px,4vw,40px)',
    boxShadow: '0 18px 50px rgba(21,58,61,.09)',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBlock: 24 },
  primary: {
    minHeight: 48,
    border: 0,
    borderRadius: 12,
    paddingInline: 20,
    background: '#087f72',
    color: '#fff',
    font: 'inherit',
    fontWeight: 800,
  },
  secondary: {
    minHeight: 48,
    border: '2px solid #087f72',
    borderRadius: 12,
    paddingInline: 20,
    background: '#fff',
    color: '#075e55',
    font: 'inherit',
    fontWeight: 800,
  },
  input: {
    display: 'block',
    width: '100%',
    maxWidth: 520,
    minHeight: 48,
    marginBlock: '8px 16px',
    border: '1px solid #6b9290',
    borderRadius: 10,
    paddingInline: 12,
    font: 'inherit',
  },
  status: {
    marginBlockStart: 24,
    padding: 16,
    background: '#e3f5f1',
    borderInlineStart: '5px solid #087f72',
  },
  note: {
    maxWidth: 820,
    marginBlockStart: 20,
    padding: 20,
    border: '1px dashed #6b9290',
    borderRadius: 16,
  },
};
