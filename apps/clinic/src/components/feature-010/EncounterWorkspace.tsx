'use client';

import { feature010ArEG, feature010CommonCopy, feature010EnEG } from '@shifaa/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { IdentityOnboardingClient } from '@shifaa/api-client';
import { createFeature010Client, Feature010ApiError } from '@shifaa/api-client/feature-010';
import {
  breakpoint,
  color,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';
import { useFeature010DocumentLocale } from './useFeature010DocumentLocale';
import { feature010WebTypography } from './feature010WebTypography';

type Locale = 'ar-EG' | 'en-EG';
type Feature010Client = ReturnType<typeof createFeature010Client>;
type EncounterProjection = Awaited<ReturnType<Feature010Client['getEncounter']>>;
type CareTeamNoteProjection = Awaited<ReturnType<Feature010Client['signEncounterNote']>>;
type EncounterCompleteResult = Awaited<ReturnType<Feature010Client['completeEncounter']>>;
type ParticipantProjection = NonNullable<EncounterProjection['participants']>[number];

const words = {
  'ar-EG': feature010ArEG['clinic.encounter'],
  'en-EG': feature010EnEG['clinic.encounter'],
} as const;

const buttonStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  maxWidth: '100%',
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  paddingInline: spacing.md,
  cursor: 'pointer',
  overflowWrap: 'anywhere',
  whiteSpace: 'normal',
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
  marginBlock: spacing.xs,
  background: color.surface,
  color: color.ink,
};
const cardStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  maxWidth: '100%',
  minWidth: 0,
  overflowWrap: 'anywhere',
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  background: color.surface,
  padding: spacing.lg,
  marginBlockEnd: spacing.md,
};

export default function EncounterWorkspace() {
  const params = useParams<{ id: string }>();
  const encounterId = params.id;
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [online, setOnline] = useState(true);
  const [data, setData] = useState<EncounterProjection | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [noteType, setNoteType] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'patient_visible' | ''>('');
  const [dialog, setDialog] = useState<
    'note' | 'participant-edit' | 'participant' | 'completion' | null
  >(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantProjection | null>(
    null,
  );
  const [summary, setSummary] = useState('');
  const [structuralConfirmation, setStructuralConfirmation] = useState(false);
  const [message, setMessage] = useState('');
  const [completionResult, setCompletionResult] = useState<EncounterCompleteResult | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogBackRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const apiBaseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const copy = words[locale];
  const common = feature010CommonCopy[locale];
  const ar = locale === 'ar-EG';
  useFeature010DocumentLocale(locale);
  const client = useMemo(
    () =>
      token && apiBaseUrl
        ? createFeature010Client({
            baseUrl: apiBaseUrl,
            accessToken: () => token,
            acceptLanguage: locale,
          })
        : null,
    [apiBaseUrl, locale, token],
  );
  const encounter = data;
  const notes = encounter?.notes ?? [];
  const participants = encounter?.participants ?? [];
  const responsibleId = encounter?.responsibleClinicianId;
  const completed = encounter?.status === 'completed';

  const loadEncounter = useCallback(async () => {
    if (!client) return;
    setLoadState('loading');
    setMessage('');
    try {
      const projection = await client.getEncounter(encounterId, {
        fields: ['notes', 'participants', 'conditions', 'observations', 'orders'],
      });
      setData(projection);
      setRefreshRequired(false);
      setLoadState('ready');
    } catch (error) {
      setLoadState(
        error instanceof Feature010ApiError && [401, 403, 404].includes(error.status)
          ? 'denied'
          : 'error',
      );
    }
  }, [client, encounterId]);
  const refreshAfterMutation = async () => {
    if (!client) return false;
    try {
      const projection = await client.getEncounter(encounterId, {
        fields: ['notes', 'participants', 'conditions', 'observations', 'orders'],
      });
      setData(projection);
      setRefreshRequired(false);
      setLoadState('ready');
      setMessage((current) => (current === copy.refreshRequired ? '' : current));
      return true;
    } catch (error) {
      setData(null);
      if (error instanceof Feature010ApiError && [401, 403, 404].includes(error.status)) {
        setRefreshRequired(false);
        setLoadState('denied');
        return false;
      }
      setRefreshRequired(true);
      return false;
    }
  };

  useEffect(() => {
    if (client) void loadEncounter();
  }, [client, loadEncounter]);
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
    if (!dialog) return;
    dialogBackRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])',
        ),
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
    // closeDialog is stable for the active dialog state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  const closeDialog = () => {
    setDialog(null);
    setSelectedParticipant(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const signIn = async (verify: boolean) => {
    if (!apiBaseUrl) return;
    setBusy(true);
    setLoginError(false);
    try {
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
        )) as { kind?: string; access_token?: string };
        if (response.kind !== 'session' || !response.access_token)
          throw new Error('session-required');
        setToken(response.access_token);
        setChallenge('');
        setOtp('');
      }
    } catch {
      setLoginError(true);
    } finally {
      setBusy(false);
    }
  };
  const signNote = async () => {
    if (
      !client ||
      !encounter ||
      completed ||
      !noteType.trim() ||
      !noteBody.trim() ||
      !visibility ||
      busy ||
      refreshRequired ||
      !online
    )
      return;
    setBusy(true);
    setMessage('');
    let signedNote: CareTeamNoteProjection;
    try {
      signedNote = await client.signEncounterNote(
        encounterId,
        { noteType: noteType.trim(), body: noteBody, visibility },
        { idempotencyKey: crypto.randomUUID() },
      );
    } catch {
      setDialog(null);
      setMessage(copy.noteError);
      setBusy(false);
      return;
    }
    setData((current) =>
      current ? { ...current, notes: [...(current.notes ?? []), signedNote] } : current,
    );
    setNoteType('');
    setNoteBody('');
    setVisibility('');
    setDialog(null);
    setMessage(copy.noteSigned);
    setRefreshRequired(true);
    requestAnimationFrame(() => triggerRef.current?.focus());
    try {
      await refreshAfterMutation();
    } catch {
      // Signing already succeeded; retain the signed response and its success state.
      setRefreshRequired(true);
    } finally {
      setBusy(false);
    }
  };
  const endParticipant = async () => {
    if (
      !client ||
      !encounter ||
      !selectedParticipant ||
      selectedParticipant.personId === responsibleId ||
      completed ||
      busy ||
      refreshRequired ||
      !online
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      await client.updateEncounter(
        encounterId,
        {
          participantIntervalsEnd: [
            {
              personId: selectedParticipant.personId,
              roleCode: selectedParticipant.roleCode,
              startedAt: selectedParticipant.startedAt,
            },
          ],
        },
        { idempotencyKey: crypto.randomUUID(), version: encounter.version },
      );
      setDialog(null);
      setSelectedParticipant(null);
      setData(null);
      setRefreshRequired(true);
      setMessage(copy.refreshRequired);
      requestAnimationFrame(() => triggerRef.current?.focus());
      const refreshed = await refreshAfterMutation();
      if (refreshed) {
        setMessage(copy.ended);
      }
    } catch {
      setDialog(null);
      setMessage(copy.endError);
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (
      !client ||
      !encounter ||
      completed ||
      !summary.trim() ||
      !structuralConfirmation ||
      busy ||
      refreshRequired ||
      !online
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const result: EncounterCompleteResult = await client.completeEncounter(
        encounterId,
        { summary: summary.trim(), structuralConfirmation: true },
        { idempotencyKey: crypto.randomUUID(), version: encounter.version },
      );
      setData(result.encounter);
      setCompletionResult(result);
      setDialog(null);
      setMessage(copy.completedSuccess);
      requestAnimationFrame(() => triggerRef.current?.focus());
    } catch {
      setDialog(null);
      setMessage(copy.completeError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      lang={locale}
      dir={ar ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100vh',
        background: color.canvas,
        color: color.ink,
        ...feature010WebTypography(locale, 'body'),
        fontFamily: ar ? 'IBM Plex Sans Arabic' : 'Inter',
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
          className="encounter-workspace"
          style={{
            minHeight: 'calc(100vh - 72px)',
          }}
        >
          <nav
            aria-label={common.primaryNavigation}
            style={{
              minWidth: 0,
              overflowWrap: 'anywhere',
              padding: spacing.md,
              borderInlineEnd: `1px solid ${color.border}`,
              background: color.surface,
            }}
          >
            <p>{common.navigationToday}</p>
            <p aria-current="page" style={{ color: color.brand, fontWeight: 700 }}>
              {copy.title}
            </p>
            <p>{common.navigationReferrals}</p>
            <p>{common.navigationMessages}</p>
          </nav>
          <main
            className="encounter-content"
            style={{
              width: 'min(100%, 1100px)',
              boxSizing: 'border-box',
              minWidth: 0,
              marginInline: 'auto',
              padding: spacing.lg,
            }}
          >
            <p style={{ color: color.brand, fontWeight: 700 }}>{common.clinicalWorkspace}</p>
            <h1
              style={{
                maxWidth: '100%',
                minWidth: 0,
                overflowWrap: 'anywhere',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {copy.title}
            </h1>
            {loadState === 'loading' && (
              <p role="status" aria-live="polite">
                {copy.loading}
              </p>
            )}
            {loadState === 'denied' && (
              <section style={cardStyle}>
                <p role="alert">{copy.denied}</p>
                <button style={buttonStyle} onClick={() => void loadEncounter()}>
                  {copy.retry}
                </button>
              </section>
            )}
            {loadState === 'error' && (
              <section style={cardStyle}>
                <p role="alert">{copy.loadError}</p>
                <button style={buttonStyle} onClick={() => void loadEncounter()}>
                  {copy.retry}
                </button>
              </section>
            )}
            {loadState === 'ready' && encounter && (
              <>
                <section aria-label={common.encounterContext} style={cardStyle}>
                  <h2>{copy.facts}</h2>
                  <Row label={copy.patient} value={encounter.patientId} code />
                  <Row label={copy.facility} value={encounter.facilityId} code />
                  <Row label={copy.appointment} value={encounter.appointmentId} code />
                  <Row label={copy.status} value={completed ? copy.completed : copy.open} />
                  <h3>{copy.conditions}</h3>
                  {encounter.conditionIds?.length ? (
                    <CodeList items={encounter.conditionIds} />
                  ) : (
                    <p>{copy.none}</p>
                  )}
                  <h3>{copy.observations}</h3>
                  {encounter.observationIds?.length ? (
                    <CodeList items={encounter.observationIds} />
                  ) : (
                    <p>{copy.none}</p>
                  )}
                  <h3>{copy.orders}</h3>
                  {encounter.orderIds?.length ? (
                    <CodeList items={encounter.orderIds} />
                  ) : (
                    <p>{copy.none}</p>
                  )}
                </section>
                <section aria-labelledby="participants-heading" style={cardStyle}>
                  <h2 id="participants-heading">{copy.participants}</h2>
                  {participants.length === 0 && <p>{copy.noParticipants}</p>}
                  {participants.map((participant) => {
                    const isResponsible = participant.personId === responsibleId;
                    const isActive = !participant.endedAt && !completed;
                    return (
                      <article
                        key={`${participant.personId}:${participant.startedAt}`}
                        style={{
                          borderBlockStart: `1px solid ${color.border}`,
                          paddingBlock: spacing.sm,
                        }}
                      >
                        <Row
                          label={
                            isResponsible
                              ? copy.responsible
                              : isActive
                                ? copy.active
                                : copy.historical
                          }
                          value={participant.personId}
                          code
                        />
                        <Row
                          label={copy.startedAt}
                          value={formatDateTime(participant.startedAt, locale)}
                        />
                        {participant.endedAt && (
                          <Row
                            label={copy.endedAt}
                            value={formatDateTime(participant.endedAt, locale)}
                          />
                        )}
                        <p>{isActive ? copy.active : copy.historical}</p>
                      </article>
                    );
                  })}
                  {!completed && participants.length > 0 && (
                    <button
                      style={buttonStyle}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setDialog('participant-edit');
                      }}
                      disabled={busy || !online || refreshRequired}
                    >
                      {copy.editParticipants}
                    </button>
                  )}
                </section>
                <section aria-labelledby="notes-heading" style={cardStyle}>
                  <h2 id="notes-heading">{copy.notes}</h2>
                  {notes.length === 0 && <p>{copy.noNotes}</p>}
                  {notes.map((note) => (
                    <Note key={note.id} note={note} copy={copy} locale={locale} />
                  ))}
                  {!completed && (
                    <div
                      style={{
                        borderBlockStart: `1px solid ${color.border}`,
                        paddingBlockStart: spacing.md,
                      }}
                    >
                      <h3>{copy.newNoteDraft}</h3>
                      <label style={{ display: 'block', minWidth: 0, maxWidth: '100%' }}>
                        {copy.noteType}
                        <input
                          style={fieldStyle}
                          value={noteType}
                          onChange={(event) => setNoteType(event.target.value)}
                        />
                      </label>
                      <label style={{ display: 'block', minWidth: 0, maxWidth: '100%' }}>
                        {copy.noteBody}
                        <textarea
                          style={{ ...fieldStyle, minHeight: 120, paddingBlock: spacing.sm }}
                          value={noteBody}
                          onChange={(event) => setNoteBody(event.target.value)}
                        />
                      </label>
                      <label style={{ display: 'block', minWidth: 0, maxWidth: '100%' }}>
                        {copy.visibility}
                        <select
                          style={fieldStyle}
                          value={visibility}
                          onChange={(event) =>
                            setVisibility(event.target.value as 'private' | 'patient_visible' | '')
                          }
                        >
                          <option value="">{copy.choose}</option>
                          <option value="private">{copy.private}</option>
                          <option value="patient_visible">{copy.visible}</option>
                        </select>
                      </label>
                      <button
                        style={{ ...buttonStyle, background: color.brand, color: color.inverse }}
                        disabled={
                          !noteType.trim() ||
                          !noteBody.trim() ||
                          !visibility ||
                          busy ||
                          !online ||
                          refreshRequired
                        }
                        onClick={(event) => {
                          triggerRef.current = event.currentTarget;
                          setDialog('note');
                        }}
                      >
                        {copy.reviewNote}
                      </button>
                    </div>
                  )}
                </section>
                {!completed ? (
                  <section style={cardStyle}>
                    <h2>{copy.completion}</h2>
                    <p>{copy.completionRequirements}</p>
                    <button
                      style={{ ...buttonStyle, background: color.brand, color: color.inverse }}
                      disabled={busy || !online || refreshRequired}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setDialog('completion');
                      }}
                    >
                      {copy.reviewCompletion}
                    </button>
                  </section>
                ) : (
                  <section style={cardStyle}>
                    <h2>{copy.completed}</h2>
                    <p role="status" aria-live="polite">
                      {copy.noWrites}
                    </p>
                    <Row label={copy.reference} value={encounter.id} code />
                    <Row label={copy.version} value={String(encounter.version)} code />
                    {completionResult && (
                      <>
                        <Row label={copy.appointmentState} value={copy.completed} />
                        <Row label={copy.queueState} value={copy.completed} />
                        <Row
                          label={copy.appointmentRef}
                          value={completionResult.appointmentId}
                          code
                        />
                        <Row
                          label={copy.appointmentVersion}
                          value={String(completionResult.appointmentVersion)}
                          code
                        />
                        <Row label={copy.queueRef} value={completionResult.queueEntryId} code />
                        <Row
                          label={copy.queueVersion}
                          value={String(completionResult.queueVersion)}
                          code
                        />
                      </>
                    )}
                  </section>
                )}
              </>
            )}
            {message && (
              <p role="status" aria-live="polite" tabIndex={-1}>
                {message}
              </p>
            )}
            {refreshRequired && loadState === 'ready' && (
              <section role="alert" style={cardStyle}>
                <p>{copy.refreshRequired}</p>
                <button
                  style={buttonStyle}
                  onClick={() => void refreshAfterMutation()}
                  disabled={busy || !online}
                >
                  {copy.refresh}
                </button>
              </section>
            )}
            {!online && <p role="alert">{copy.unavailable}</p>}
          </main>
          <style jsx>{`
            .encounter-content,
            .encounter-content section,
            .encounter-content article {
              min-width: 0;
              max-width: 100%;
              overflow-wrap: anywhere;
            }
            .encounter-content h1,
            .encounter-content h2,
            .encounter-content h3 {
              box-sizing: border-box;
              max-width: 100%;
              min-width: 0;
              overflow-wrap: anywhere;
              white-space: normal;
              word-break: break-word;
            }
            .encounter-content button {
              box-sizing: border-box;
              max-width: 100%;
              overflow-wrap: anywhere;
              white-space: normal;
            }
            .encounter-workspace {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
            }
            @media (min-width: ${breakpoint.medium}px) {
              .encounter-workspace {
                grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
              }
            }
          `}</style>
        </div>
      ) : (
        <main style={{ maxWidth: 560, marginInline: 'auto', padding: spacing.lg }}>
          <h1>{copy.signin}</h1>
          <p>{copy.signinHelp}</p>
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
                {copy.next}
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
          {loginError && <p role="alert">{copy.signinFailure}</p>}
        </main>
      )}
      {dialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
            background: color.canvas,
            display: 'grid',
            placeItems: 'center',
            padding: spacing.md,
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            style={{
              ...cardStyle,
              width: 'min(100%, 620px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            {dialog === 'note' && (
              <>
                <h2 id="dialog-title">{copy.noteReview}</h2>
                <Row label={copy.noteType} value={noteType} />
                <p>{noteBody}</p>
                <p>{visibility === 'private' ? copy.private : copy.visible}</p>
              </>
            )}
            {dialog === 'participant-edit' && (
              <>
                <h2 id="dialog-title">{copy.reviewParticipants}</h2>
                {participants.map((participant) => {
                  const isResponsible = participant.personId === responsibleId;
                  const isActive = !participant.endedAt && !completed;
                  return (
                    <article
                      key={`${participant.personId}:${participant.startedAt}`}
                      style={{
                        borderBlockStart: `1px solid ${color.border}`,
                        paddingBlock: spacing.sm,
                      }}
                    >
                      <Row
                        label={
                          isResponsible
                            ? copy.responsible
                            : isActive
                              ? copy.active
                              : copy.historical
                        }
                        value={participant.personId}
                        code
                      />
                      <Row
                        label={copy.startedAt}
                        value={formatDateTime(participant.startedAt, locale)}
                      />
                      {participant.endedAt && (
                        <Row
                          label={copy.endedAt}
                          value={formatDateTime(participant.endedAt, locale)}
                        />
                      )}
                      <p>{isActive ? copy.active : copy.historical}</p>
                      {isActive && !isResponsible && (
                        <button
                          style={buttonStyle}
                          onClick={() => {
                            setSelectedParticipant(participant);
                            setDialog('participant');
                          }}
                          disabled={busy || !online}
                        >
                          {copy.endInterval}
                        </button>
                      )}
                    </article>
                  );
                })}
              </>
            )}
            {dialog === 'participant' && (
              <>
                <h2 id="dialog-title">{copy.endTitle}</h2>
                <p>{copy.endText}</p>
                {selectedParticipant && (
                  <Row label={copy.participants} value={selectedParticipant.personId} code />
                )}
              </>
            )}
            {dialog === 'completion' && (
              <>
                <h2 id="dialog-title">{copy.completeReview}</h2>
                <label>
                  {copy.summary}
                  <textarea
                    style={{ ...fieldStyle, minHeight: 120, paddingBlock: spacing.sm }}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </label>
                <label
                  style={{
                    display: 'flex',
                    gap: spacing.sm,
                    alignItems: 'center',
                    minHeight: minimumTargetSize,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={structuralConfirmation}
                    onChange={(event) => setStructuralConfirmation(event.target.checked)}
                  />
                  {copy.structural}
                </label>
                <p>{copy.completeEffect}</p>
              </>
            )}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: spacing.sm,
                marginBlockStart: spacing.md,
              }}
            >
              <button ref={dialogBackRef} style={buttonStyle} onClick={closeDialog} disabled={busy}>
                {copy.back}
              </button>
              {dialog === 'note' && (
                <button
                  style={{ ...buttonStyle, background: color.brand, color: color.inverse }}
                  onClick={() => void signNote()}
                  disabled={busy || !online}
                >
                  {copy.sign}
                </button>
              )}
              {dialog === 'participant' && (
                <button
                  style={{ ...buttonStyle, background: color.danger, color: color.inverse }}
                  onClick={() => void endParticipant()}
                  disabled={busy || !online}
                >
                  {copy.confirmEnd}
                </button>
              )}
              {dialog === 'completion' && (
                <button
                  style={{ ...buttonStyle, background: color.brand, color: color.inverse }}
                  onClick={() => void complete()}
                  disabled={busy || !summary.trim() || !structuralConfirmation || !online}
                >
                  {copy.complete}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: spacing.md,
        borderBlockEnd: `1px solid ${color.border}`,
        paddingBlock: spacing.sm,
        minWidth: 0,
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        flexWrap: 'wrap',
      }}
    >
      <span>{label}</span>
      {code ? (
        <bdi
          dir="ltr"
          style={{
            display: 'inline-block',
            minWidth: 0,
            maxWidth: '100%',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </bdi>
      ) : (
        <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>{value}</span>
      )}
    </div>
  );
}
function CodeList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item} style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
          <bdi
            dir="ltr"
            style={{ display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }}
          >
            {item}
          </bdi>
        </li>
      ))}
    </ul>
  );
}
function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
function Note({
  note,
  copy,
  locale,
}: {
  note: CareTeamNoteProjection;
  copy: (typeof words)[Locale];
  locale: Locale;
}) {
  return (
    <article style={{ borderBlockStart: `1px solid ${color.border}`, paddingBlock: spacing.md }}>
      <h3>{note.noteType}</h3>
      <p>{note.visibility === 'private' ? copy.private : copy.visible}</p>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.body}</p>
      <Row label={copy.signedAt} value={formatDateTime(note.signedAt, locale)} />
    </article>
  );
}
