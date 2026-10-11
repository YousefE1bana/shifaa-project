'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feature011Client } from '@shifaa/api-client/feature-011';
import { AllergyReportController } from '../../lib/feature-011-allergies';
import { allergyCopy, allergyDate, verificationCopy } from '@shifaa/i18n';
import { AllergyHistory } from '../../app/patients/[id]/summary/AllergyHistory';
import { color, spacing, radius, minimumTargetSize } from '@shifaa/design-system/tokens';
import { feature010WebTypography } from '../feature-010/feature010WebTypography';
type Props = {
  locale: 'ar-EG' | 'en-EG';
  managedPatientId: string;
  encounterId: string;
  token: string;
  baseUrl: string;
  reauthorize: () => Promise<void>;
};
export function AllergySummaryPanel({
  locale,
  managedPatientId,
  encounterId,
  token,
  baseUrl,
  reauthorize,
}: Props) {
  const copy = allergyCopy[locale],
    [substance, setSubstance] = useState(''),
    [source, setSource] = useState(''),
    [correctsAllergyId, setCorrectsAllergyId] = useState<string | null>(null),
    [, redraw] = useState(0),
    [history, setHistory] = useState(false);
  const outcome = useRef<HTMLDivElement>(null),
    action = useRef<HTMLButtonElement>(null);
  const makeModel = useMemo(
    () => () =>
      new AllergyReportController({
        client: new Feature011Client({
          baseUrl,
          accessToken: () => token,
          purpose: 'care',
          acceptLanguage: locale,
        }),
        patientId: managedPatientId,
        encounterId,
        role: 'CLN',
        online: () => navigator.onLine,
        idempotencyKey: () => crypto.randomUUID(),
        reauthorize,
      }),
    [locale, managedPatientId, encounterId, token, baseUrl, reauthorize],
  );
  const [model, setModel] = useState(makeModel);
  useEffect(() => {
    model.dispose();
    const fresh = makeModel();
    setModel(fresh);
    return () => fresh.dispose();
  }, [makeModel]);
  useEffect(() => {
    if (['loading', 'denied', 'stale', 'error', 'offline'].includes(model.phase)) {
      setCorrectsAllergyId(null);
      setSubstance('');
      setSource('');
    }
  }, [model, model.phase]);
  const refresh = async () => {
    const work = model.load(history ? 'history' : 'current');
    redraw((n) => n + 1);
    await work;
    redraw((n) => n + 1);
  };
  useEffect(() => {
    void refresh();
    const offline = () => void refresh();
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('offline', offline);
    };
  }, [model, history]);
  useEffect(() => {
    if (['review', 'success', 'reconciling'].includes(model.phase)) outcome.current?.focus();
  }, [model.phase]);
  const typography = {
    ...feature010WebTypography(locale, 'body'),
    fontFamily: locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter',
  };
  const style: React.CSSProperties = {
    minHeight: minimumTargetSize,
    maxWidth: '100%',
    minWidth: 0,
    padding: spacing.sm,
    border: `1px solid ${color.border}`,
    borderRadius: radius.control,
    background: color.surface,
    color: color.ink,
    ...typography,
  };
  const submit = async () => {
    const work = model.submit();
    redraw((n) => n + 1);
    await work;
    setSubstance('');
    setSource('');
    setCorrectsAllergyId(null);
    redraw((n) => n + 1);
  };
  return (
    <section
      data-testid="f011-allergy-panel"
      aria-labelledby="allergy-title"
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        padding: spacing.md,
        marginBlock: spacing.md,
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
        overflowWrap: 'anywhere',
        ...typography,
      }}
    >
      <h2 id="allergy-title">{copy.title}</h2>
      <p>{copy.boundary}</p>
      <div ref={outcome} tabIndex={-1} role="status" aria-live="polite" data-testid="f011-state">
        {model.mutationKind === 'verify' && ['review', 'success'].includes(model.phase)
          ? verificationCopy[locale][model.phase as 'review' | 'success']
          : history && model.phase === 'ready'
            ? verificationCopy[locale].history
            : copy[model.phase]}
      </div>
      {model.rows.map((row) => (
        <article key={row.revisionId}>
          <p>
            {row.substance.display} — {copy[row.status]}
          </p>
          <p>
            {copy.source}: {row.source.display}
          </p>
          {(['coding', 'reaction', 'severity', 'onset'] as const).map((key) => (
            <p key={key}>
              {copy[key]}:{' '}
              {row[key].knowledge === 'unknown'
                ? copy.unknown
                : typeof row[key].value === 'string'
                  ? row[key].value
                  : (row[key].value.display ?? <bdi dir="ltr">{row[key].value.code}</bdi>)}
            </p>
          ))}
          <p>
            {copy.time}: {allergyDate(row.recordedAt, locale)} · {copy.version}: {row.version}
          </p>
          <bdi dir="ltr">{row.revisionId}</bdi>
        </article>
      ))}
      <AllergyHistory
        key={locale + managedPatientId + encounterId + token}
        model={model}
        locale={locale}
        style={style}
        redraw={() => redraw((n) => n + 1)}
        submit={submit}
        correct={(id) => {
          setCorrectsAllergyId(id);
          requestAnimationFrame(() => document.getElementById('allergy-substance')?.focus());
        }}
      />
      {correctsAllergyId && ['ready', 'empty', 'success', 'review'].includes(model.phase) && (
        <p>
          {verificationCopy[locale].correction}: <bdi dir="ltr">{correctsAllergyId}</bdi>
        </p>
      )}
      {model.canReport && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!substance.trim() || !source.trim()) return;
            model.review({
              substance: { identity: substance, display: substance },
              source: { display: source },
              ...(correctsAllergyId ? { correctsAllergyId } : {}),
            });
            redraw((n) => n + 1);
          }}
          style={{ display: 'grid', gap: spacing.sm }}
        >
          <label htmlFor="allergy-substance">{copy.substance}</label>
          <input
            id="allergy-substance"
            value={substance}
            onChange={(e) => setSubstance(e.target.value)}
            maxLength={200}
            required
            style={style}
          />
          <label htmlFor="allergy-source">{copy.source}</label>
          <input
            id="allergy-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={200}
            required
            style={style}
          />
          <button ref={action} style={style} disabled={!substance.trim() || !source.trim()}>
            {copy.report}
          </button>
        </form>
      )}
      {model.phase === 'review' && model.mutationKind === 'report' && (
        <>
          <p>
            {substance} — {source} — {copy.self_reported}
          </p>
          <button
            style={style}
            onClick={() => {
              model.cancel();
              redraw((n) => n + 1);
              requestAnimationFrame(() => action.current?.focus());
            }}
          >
            {copy.cancel}
          </button>
          <button style={style} onClick={() => void submit()}>
            {copy.confirm}
          </button>
        </>
      )}
      {model.phase === 'reconciling' && (
        <button style={style} disabled={!navigator.onLine} onClick={() => void submit()}>
          {copy.retry}
        </button>
      )}
      {model.receipt && (
        <div>
          <p>
            {copy.reference}: <bdi dir="ltr">{model.receipt.revisionId}</bdi>
          </p>
          <p>
            {copy.time}: {allergyDate(model.receipt.recordedAt, locale)}
          </p>
          <p>{model.mutationKind === 'verify' ? verificationCopy[locale].next : copy.next}</p>
        </div>
      )}
      {!['review', 'submitting', 'reconciling'].includes(model.phase) && (
        <>
          <button style={style} onClick={() => void refresh()}>
            {copy.refresh}
          </button>
          <button style={style} onClick={() => setHistory(!history)}>
            {history ? copy.current : copy.history}
          </button>
        </>
      )}
      <p>
        {copy.privacy}:{' '}
        {locale === 'ar-EG'
          ? 'استخدم قائمة الخصوصية والموافقات الحالية في تطبيق المريض.'
          : 'Use the existing Privacy and consent menu in the patient app.'}
      </p>
    </section>
  );
}
