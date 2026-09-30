'use client';

import { feature010ArEG, feature010CommonCopy, feature010EnEG } from '@shifaa/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  breakpoint,
  color,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';
import {
  createEncounterStartClients,
  encounterStartFailure,
  getEncounterStartEligibility,
  type ClinicLocale,
  type EncounterStartEligibility,
} from '../../../../lib/feature-010-api';
import { useFeature010DocumentLocale } from '../../../../components/feature-010/useFeature010DocumentLocale';
import { feature010WebTypography } from '../../../../components/feature-010/feature010WebTypography';

const words = {
  'ar-EG': feature010ArEG['clinic.summary'],
  'en-EG': feature010EnEG['clinic.summary'],
} as const;

const buttonStyle: React.CSSProperties = {
  minWidth: minimumTargetSize,
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  paddingInline: spacing.md,
  cursor: 'pointer',
};
const fieldStyle: React.CSSProperties = {
  display: 'block',
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  minHeight: minimumTargetSize,
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  paddingInline: spacing.sm,
  marginBlock: spacing.sm,
  background: color.surface,
  color: color.ink,
};
const cardStyle: React.CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  background: color.surface,
  padding: spacing.lg,
};

export default function PatientSummaryPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const router = useRouter();
  const [locale, setLocale] = useState<ClinicLocale>('ar-EG');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [aal, setAal] = useState<1 | 2 | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [online, setOnline] = useState(true);
  const [eligibility, setEligibility] = useState<EncounterStartEligibility | null>(null);
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const apiBaseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const copy = words[locale];
  const common = feature010CommonCopy[locale];
  const ar = locale === 'ar-EG';
  useFeature010DocumentLocale(locale);
  const clients = useMemo(
    () => (token && apiBaseUrl ? createEncounterStartClients(token, locale, aal) : null),
    [aal, apiBaseUrl, locale, token],
  );

  const refreshEligibility = useCallback(async () => {
    if (!clients) return;
    setEligibility(null);
    setResult(null);
    try {
      setEligibility(await getEncounterStartEligibility(clients, patientId));
    } catch {
      setEligibility({ kind: 'recoverable' });
    }
  }, [clients, patientId]);

  useEffect(() => {
    if (clients) void refreshEligibility();
  }, [clients, refreshEligibility]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!review) return;
    backRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setReview(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const controls = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'),
      );
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [review]);

  const signIn = async (verify: boolean) => {
    if (!apiBaseUrl) return;
    setBusy(true);
    setLoginError(false);
    try {
      const { IdentityOnboardingClient } = await import('@shifaa/api-client');
      const auth = new IdentityOnboardingClient({ baseUrl: apiBaseUrl, acceptLanguage: locale });
      if (!verify) {
        const response = (await auth.login({ handle, password }, crypto.randomUUID())) as {
          kind?: string;
          challenge_id?: string;
        };
        if (response.kind !== 'challenge' || !response.challenge_id)
          throw new Error('challenge-required');
        setChallenge(response.challenge_id);
        setPassword('');
      } else {
        const response = (await auth.verifyOtp(
          { challenge_id: challenge, code: otp },
          crypto.randomUUID(),
        )) as { kind?: string; access_token?: string; aal?: 1 | 2 };
        if (response.kind !== 'session' || !response.access_token)
          throw new Error('session-required');
        setToken(response.access_token);
        setAal(response.aal === 2 ? 2 : response.aal === 1 ? 1 : undefined);
        setChallenge('');
        setOtp('');
      }
    } catch {
      setLoginError(true);
    } finally {
      setBusy(false);
    }
  };

  const startEncounter = async () => {
    if (!clients || eligibility?.kind !== 'eligible' || busy) return;
    const reviewed = eligibility;
    setBusy(true);
    setResult(copy.submitting);
    try {
      const current = await getEncounterStartEligibility(clients, patientId);
      if (
        current.kind !== 'eligible' ||
        current.appointment.id !== reviewed.appointment.id ||
        current.queueEntry.id !== reviewed.queueEntry.id
      ) {
        setEligibility(current.kind === 'eligible' ? { kind: 'stale' } : current);
        setReview(false);
        setResult(words[locale][current.kind === 'eligible' ? 'stale' : current.kind]);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      const started = await clients.encounters.createEncounter(
        { appointmentId: current.appointment.id, patientId, encounterType: 'consultation' },
        { idempotencyKey: crypto.randomUUID() },
      );
      setReview(false);
      router.push(`/encounters/${encodeURIComponent(started.encounter.id)}`);
    } catch (error) {
      const failure = encounterStartFailure(error);
      setReview(false);
      setResult(words[locale][failure]);
      if (failure === 'conflict') setEligibility({ kind: 'stale' });
      if (failure === 'denied') setEligibility({ kind: 'denied' });
      requestAnimationFrame(() => triggerRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const resultCopy =
    result &&
    result !== copy.submitting &&
    result !== (eligibility && eligibility.kind !== 'eligible' ? copy[eligibility.kind] : null)
      ? result
      : null;
  const active = eligibility?.kind === 'eligible';

  return (
    <div
      lang={locale}
      dir={ar ? 'rtl' : 'ltr'}
      style={{
        background: color.canvas,
        color: color.ink,
        minHeight: '100vh',
        ...feature010WebTypography(locale, 'body'),
        fontFamily: locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: spacing.md,
          borderBlockEnd: `1px solid ${color.border}`,
          background: color.surface,
        }}
      >
        <strong>◇ SHIFAA</strong>
        <button style={buttonStyle} onClick={() => setLocale(ar ? 'en-EG' : 'ar-EG')}>
          {copy.english}
        </button>
      </header>
      {token ? (
        <div
          className="clinic-summary-workspace"
          style={{
            minHeight: 'calc(100vh - 72px)',
          }}
        >
          <nav
            aria-label={common.primaryNavigation}
            style={{
              padding: spacing.md,
              borderInlineEnd: `1px solid ${color.border}`,
              background: color.surface,
            }}
          >
            <p>{common.navigationToday}</p>
            <p aria-current="page" style={{ color: color.brand, fontWeight: 700 }}>
              {copy.title}
            </p>
            <p>{common.navigationEncounter}</p>
            <p>{common.navigationReferrals}</p>
            <p>{common.navigationMessages}</p>
          </nav>
          <main
            style={{
              boxSizing: 'border-box',
              minWidth: 0,
              overflowWrap: 'anywhere',
              width: 'min(100%, 1100px)',
              marginInline: 'auto',
              padding: spacing.lg,
            }}
          >
            <section
              aria-label={copy.currentPatient}
              style={{ ...cardStyle, marginBlockEnd: spacing.lg }}
            >
              <h2 style={{ marginBlockStart: 0 }}>{copy.patientContext}</h2>
              <p>
                {copy.facility}:{' '}
                <bdi dir="ltr">
                  {eligibility?.kind === 'eligible' ? eligibility.appointment.facilityId : '—'}
                </bdi>
              </p>
            </section>
            <p style={{ color: color.brand, fontWeight: 700 }}>{common.clinicalWorkspace}</p>
            <h1 style={{ maxWidth: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
              {copy.title}
            </h1>
            <p>{copy.subtitle}</p>
            {eligibility === null && (
              <p role="status" aria-live="polite">
                {copy.submitting}
              </p>
            )}
            {eligibility?.kind === 'eligible' && (
              <section style={cardStyle} aria-labelledby="appointment-heading">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: spacing.md,
                  }}
                >
                  <h2 id="appointment-heading" style={{ marginBlock: 0 }}>
                    {copy.summary}
                  </h2>
                  <span>{copy.eligible}</span>
                </div>
                <SummaryRow label={copy.appointment} value={eligibility.appointment.id} />
                <SummaryRow label={copy.appointmentStatus} value={copy.checkedIn} />
                <SummaryRow label={copy.queue} value={eligibility.queueEntry.id} />
                <SummaryRow label={copy.queueState} value={copy.called} />
                <div
                  style={{
                    border: `2px solid ${color.brand}`,
                    borderRadius: radius.card,
                    padding: spacing.sm,
                    marginBlockStart: spacing.md,
                  }}
                >
                  <button
                    ref={triggerRef}
                    style={{
                      ...buttonStyle,
                      minHeight: 48,
                      background: color.brand,
                      color: color.inverse,
                    }}
                    onClick={() => {
                      setResult(null);
                      setReview(true);
                    }}
                    disabled={busy}
                  >
                    {copy.start}
                  </button>
                  <p style={{ marginBlockEnd: 0 }}>{copy.apiRechecks}</p>
                </div>
              </section>
            )}
            {eligibility && eligibility.kind !== 'eligible' && (
              <section style={cardStyle}>
                <h2>{copy.summary}</h2>
                <p role="alert" aria-live="assertive">
                  {copy[eligibility.kind]}
                </p>
                <button
                  style={buttonStyle}
                  onClick={() => void refreshEligibility()}
                  disabled={busy}
                >
                  {copy.refreshFromServer}
                </button>
              </section>
            )}
            {resultCopy && (
              <p role="alert" aria-live="assertive" tabIndex={-1}>
                {resultCopy}
              </p>
            )}
            {result === copy.submitting && (
              <p role="status" aria-live="polite">
                {copy.submitting}
              </p>
            )}
            {!online && <p role="status">{copy.unavailable}</p>}
            {review && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10,
                  background: color.surface,
                  display: 'grid',
                  placeItems: 'center',
                  padding: spacing.md,
                }}
              >
                <div
                  ref={modalRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="review-title"
                  style={{
                    ...cardStyle,
                    width: 'min(100%, 620px)',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxSizing: 'border-box',
                  }}
                >
                  <h2 id="review-title">{copy.review}</h2>
                  <p>{copy.reviewText}</p>
                  <SummaryRow
                    label={copy.appointment}
                    value={eligibility?.kind === 'eligible' ? eligibility.appointment.id : '—'}
                  />
                  <SummaryRow
                    label={copy.queue}
                    value={eligibility?.kind === 'eligible' ? eligibility.queueEntry.id : '—'}
                  />
                  <SummaryRow
                    label={copy.queueState}
                    value={eligibility?.kind === 'eligible' ? copy.called : '—'}
                  />
                  <section
                    style={{
                      borderInlineStart: `3px solid ${color.brand}`,
                      paddingInlineStart: spacing.md,
                    }}
                  >
                    <h3>{copy.effect}</h3>
                    <p>{copy.effectText}</p>
                  </section>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: spacing.sm,
                      marginBlockStart: spacing.md,
                    }}
                  >
                    <button
                      ref={backRef}
                      style={buttonStyle}
                      onClick={() => {
                        setReview(false);
                        requestAnimationFrame(() => triggerRef.current?.focus());
                      }}
                      disabled={busy}
                    >
                      {copy.back}
                    </button>
                    <button
                      ref={confirmRef}
                      style={{ ...buttonStyle, background: color.brand, color: color.inverse }}
                      onClick={() => void startEncounter()}
                      disabled={busy}
                    >
                      {copy.start}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
          <style jsx>{`
            .clinic-summary-workspace {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
            }
            @media (min-width: ${breakpoint.medium}px) {
              .clinic-summary-workspace {
                grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
              }
            }
          `}</style>
        </div>
      ) : (
        <main
          style={{
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: 560,
            minWidth: 0,
            overflowWrap: 'anywhere',
            marginInline: 'auto',
            padding: spacing.lg,
          }}
        >
          <h1 style={{ maxWidth: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>{copy.signIn}</h1>
          <p>{copy.signInHelp}</p>
          {!challenge ? (
            <>
              <label>
                {copy.handle}
                <input
                  style={fieldStyle}
                  autoComplete="username"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                />
              </label>
              <label>
                {copy.password}
                <input
                  style={fieldStyle}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                style={buttonStyle}
                disabled={!apiBaseUrl || busy || !handle || !password}
                onClick={() => void signIn(false)}
              >
                {copy.continue}
              </button>
            </>
          ) : (
            <>
              <label>
                {copy.otp}
                <input
                  style={fieldStyle}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <button
                style={buttonStyle}
                disabled={!apiBaseUrl || busy || otp.length !== 6}
                onClick={() => void signIn(true)}
              >
                {copy.verify}
              </button>
            </>
          )}
          {!apiBaseUrl && <p role="status">{copy.unavailable}</p>}
          {loginError && <p role="alert">{copy.signInFailure}</p>}
        </main>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: spacing.md,
        borderBlockEnd: `1px solid ${color.border}`,
        paddingBlock: spacing.md,
        flexWrap: 'wrap',
      }}
    >
      <span>{label}</span>
      <bdi dir="ltr" style={{ overflowWrap: 'anywhere' }}>
        {value}
      </bdi>
    </div>
  );
}
