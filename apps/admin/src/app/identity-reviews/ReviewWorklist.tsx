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
  useEffect(() => {
    if (gate !== 'allowed') return;
    void loadAssignedReviews()
      .then((items) => {
        setCases(items);
        setSelected(items[0] ?? null);
      })
      .catch(() => setLoadFailed(true));
  }, [gate]);
  if (gate !== 'allowed')
    return (
      <main style={styles.main}>
        <h1>مراجعة الهوية</h1>
        <p role="alert">
          {gate === 'aal2_required'
            ? 'أكمل التحقق بخطوتين لفتح الحالات.'
            : 'لا توجد صلاحية مراجعة نشطة لهذه الجلسة.'}
        </p>
      </main>
    );
  return (
    <main style={styles.main}>
      <header>
        <p style={styles.eyebrow}>شفاء · مساحة تشغيل آمنة</p>
        <h1 style={styles.heading}>مراجعة الهوية</h1>
        <p style={styles.muted}>تعرض هذه الصفحة الحد الأدنى اللازم لاتخاذ القرار.</p>
      </header>
      <div style={styles.grid}>
        <section aria-labelledby="queue-title" style={styles.panel}>
          <h2 id="queue-title">الحالات المكلّفة لك</h2>
          {loadFailed ? (
            <p role="alert">تعذر تحميل الحالات. حاول مرة أخرى.</p>
          ) : cases.length === 0 ? (
            <p>لا توجد حالات مكلّفة لك الآن.</p>
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
                    <span>{item.ageHours} ساعات انتظار</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="decision-title" style={styles.panel}>
          <h2 id="decision-title">القرار</h2>
          {selected ? (
            <>
              <dl>
                <dt>نوع الهوية</dt>
                <dd>{selected.identityType}</dd>
                <dt>الرقم المحجوب</dt>
                <dd dir="ltr">{selected.maskedValue}</dd>
                <dt>الحالة</dt>
                <dd>تحتاج مراجعة بشرية</dd>
              </dl>
              <label htmlFor="reason">
                <b>سبب القرار</b>
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
                  قبول الهوية
                </button>
                <button
                  disabled={reason.trim().length < 3}
                  onClick={async () => {
                    await saveReviewDecision(selected, 'reject', reason);
                    setSaved(true);
                  }}
                  style={styles.reject}
                >
                  رفض الهوية
                </button>
              </div>
              {saved ? <p role="status">تم حفظ القرار في سجل المراجعة.</p> : null}
            </>
          ) : (
            <p>اختر حالة من قائمة العمل.</p>
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
