'use client';

import React, { useEffect, useState } from 'react';
import type { ReviewCase } from './review-model';
import { loadAssignedReviews, saveReviewDecision } from './api';

const palette = {
  canvas: '#F5FAFC',
  surface: '#FFFFFF',
  ink: '#102A43',
  muted: '#486581',
  blue: '#075985',
  danger: '#B42318',
  border: '#BCCCDC',
  focus: '#A13D00',
};

const copy = {
  ar: {
    switchLocale: 'English',
    eyebrow: 'شفاء · مساحة تشغيل آمنة',
    title: 'مراجعة الهوية',
    explainer: 'تعرض هذه الصفحة الحد الأدنى اللازم لاتخاذ القرار.',
    queue: 'الحالات المكلّفة لك',
    loadFailed: 'تعذر تحميل الحالات. حاول مرة أخرى.',
    empty: 'لا توجد حالات مكلّفة لك الآن.',
    wait: 'ساعات انتظار',
    decision: 'القرار',
    identityType: 'نوع الهوية',
    maskedValue: 'الرقم المحجوب',
    status: 'الحالة',
    manualReview: 'تحتاج مراجعة بشرية',
    reason: 'سبب القرار',
    approve: 'قبول الهوية',
    reject: 'رفض الهوية',
    saved: 'تم حفظ القرار في سجل المراجعة.',
    select: 'اختر حالة من قائمة العمل.',
    aal2: 'أكمل التحقق بخطوتين لفتح الحالات.',
    purpose: 'لا توجد صلاحية مراجعة نشطة لهذه الجلسة.',
  },
  en: {
    switchLocale: 'العربية',
    eyebrow: 'SHIFAA · Secure operations workspace',
    title: 'Identity review',
    explainer: 'This page shows only the information needed to make the decision.',
    queue: 'Cases assigned to you',
    loadFailed: 'Cases could not be loaded. Try again.',
    empty: 'No cases are assigned to you now.',
    wait: 'hours waiting',
    decision: 'Decision',
    identityType: 'Identity type',
    maskedValue: 'Masked number',
    status: 'Status',
    manualReview: 'Needs manual review',
    reason: 'Decision reason',
    approve: 'Approve identity',
    reject: 'Reject identity',
    saved: 'The decision was saved in the review log.',
    select: 'Choose a case from the worklist.',
    aal2: 'Complete two-step verification to open cases.',
    purpose: 'This session has no active review permission.',
  },
} as const;
export function ReviewWorklist({
  gate = 'allowed',
}: {
  gate?: 'allowed' | 'aal2_required' | 'purpose_required';
}) {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [selected, setSelected] = useState<ReviewCase | null>(null);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const text = copy[locale];
  useEffect(() => {
    if (gate !== 'allowed') return;
    void loadAssignedReviews()
      .then((items) => {
        setCases(items);
        setSelected(items[0] ?? null);
      })
      .catch((error) => {
        console.error('Identity review worklist failed to load.', error);
        setLoadFailed(true);
      });
  }, [gate]);
  if (gate !== 'allowed')
    return (
      <main dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} style={styles.main}>
        <h1>{text.title}</h1>
        <p role="alert">{gate === 'aal2_required' ? text.aal2 : text.purpose}</p>
      </main>
    );
  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} style={styles.main}>
      <button onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} style={styles.locale}>
        {text.switchLocale}
      </button>
      <header>
        <p style={styles.eyebrow}>{text.eyebrow}</p>
        <h1 style={styles.heading}>{text.title}</h1>
        <p style={styles.muted}>{text.explainer}</p>
      </header>
      <div style={styles.grid}>
        <section aria-labelledby="queue-title" style={styles.panel}>
          <h2 id="queue-title">{text.queue}</h2>
          {loadFailed ? (
            <p role="alert">{text.loadFailed}</p>
          ) : cases.length === 0 ? (
            <p>{text.empty}</p>
          ) : (
            <ul style={styles.list}>
              {cases.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setSelected(item)}
                    style={styles.caseButton}
                    aria-current={selected?.id === item.id}
                  >
                    <b>{item.identityType}</b>
                    <span dir="ltr">{item.maskedValue}</span>
                    <span>
                      {item.ageHours} {text.wait}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="decision-title" style={styles.panel}>
          <h2 id="decision-title">{text.decision}</h2>
          {selected ? (
            <>
              <dl>
                <dt>{text.identityType}</dt>
                <dd>{selected.identityType}</dd>
                <dt>{text.maskedValue}</dt>
                <dd dir="ltr">{selected.maskedValue}</dd>
                <dt>{text.status}</dt>
                <dd>{text.manualReview}</dd>
              </dl>
              <label htmlFor="reason">
                <b>{text.reason}</b>
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                minLength={3}
                style={styles.textarea}
              />
              <div style={styles.actions}>
                <button
                  disabled={reason.trim().length < 3}
                  onClick={async () => {
                    await saveReviewDecision(selected, 'approve', reason);
                    setSaved(true);
                  }}
                  style={styles.approve}
                >
                  {text.approve}
                </button>
                <button
                  disabled={reason.trim().length < 3}
                  onClick={async () => {
                    await saveReviewDecision(selected, 'reject', reason);
                    setSaved(true);
                  }}
                  style={styles.reject}
                >
                  {text.reject}
                </button>
              </div>
              {saved ? <p role="status">{text.saved}</p> : null}
            </>
          ) : (
            <p>{text.select}</p>
          )}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    boxSizing: 'border-box',
    background: palette.canvas,
    color: palette.ink,
    padding: '32px clamp(16px, 4vw, 64px)',
    fontFamily: "Cairo, 'Noto Sans Arabic', system-ui, sans-serif",
  },
  eyebrow: { color: palette.blue, fontWeight: 700, marginBlockEnd: 4 },
  heading: { fontSize: 'clamp(2rem, 4vw, 3.5rem)', lineHeight: 1.15, marginBlock: 0 },
  muted: { color: palette.muted },
  locale: {
    minHeight: 44,
    background: 'transparent',
    color: palette.blue,
    border: `1px solid ${palette.blue}`,
    borderRadius: 10,
    paddingInline: 16,
    font: 'inherit',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: 24,
    marginBlockStart: 24,
  },
  panel: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 16,
    padding: 24,
  },
  list: { listStyle: 'none', padding: 0 },
  caseButton: {
    width: '100%',
    minHeight: 64,
    display: 'grid',
    gap: 4,
    textAlign: 'start',
    background: palette.surface,
    color: palette.ink,
    border: `2px solid ${palette.blue}`,
    borderRadius: 10,
    padding: 12,
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    minHeight: 96,
    boxSizing: 'border-box',
    marginBlock: 8,
    border: `1px solid ${palette.border}`,
    borderRadius: 10,
    padding: 12,
    font: 'inherit',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  approve: {
    minHeight: 44,
    background: palette.blue,
    color: 'white',
    border: 0,
    borderRadius: 10,
    paddingInline: 20,
    font: 'inherit',
    fontWeight: 700,
  },
  reject: {
    minHeight: 44,
    background: palette.danger,
    color: 'white',
    border: 0,
    borderRadius: 10,
    paddingInline: 20,
    font: 'inherit',
    fontWeight: 700,
  },
};
