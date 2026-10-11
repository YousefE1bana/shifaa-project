'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feature011Client } from '@shifaa/api-client/feature-011';
import { clinicalStatusCopy } from '@shifaa/i18n';
import {
  color,
  spacing,
  radius,
  minimumTargetSize,
  type as typography,
} from '@shifaa/design-system/tokens';
import { ClinicalStatusController, type StatusState } from '../../../lib/feature-011-status';
type Locale = 'ar-EG' | 'en-EG';
export const statusControl: React.CSSProperties = {
  minHeight: minimumTargetSize,
  paddingInline: spacing.md,
  paddingBlock: spacing.sm,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  font: 'inherit',
  maxWidth: '100%',
  overflowWrap: 'anywhere',
};
export const statusLayout: React.CSSProperties = {
  maxWidth: 960,
  marginInline: 'auto',
  padding: spacing.md,
  background: color.canvas,
  color: color.ink,
  overflowWrap: 'anywhere',
};
function date(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'long',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
export function StatusView({ state, locale }: { state: StatusState; locale: Locale }) {
  const c = clinicalStatusCopy[locale];
  return (
    <section
      aria-labelledby="status-heading"
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
    >
      <h1 id="status-heading">{c.title}</h1>
      <p>{c.boundary}</p>
      <p>{c.context}</p>
      <p role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} data-status-outcome>
        {c[state.kind]}
      </p>
      {state.page?.data.map((r) => (
        <article
          key={r.releaseId}
          aria-label={c.release}
          style={{
            background: color.surface,
            padding: spacing.md,
            border: `1px solid ${color.border}`,
            borderRadius: radius.card,
            marginBlock: spacing.md,
          }}
        >
          <h2>{r.source.display}</h2>
          <p>{c[r.eligibility]}</p>
          <p>
            {c.published} · {r.initial ? c.initial : c.successor}
          </p>
          <dl>
            <dt>{c.version}</dt>
            <dd>
              <bdi dir="ltr">{r.artifactVersion}</bdi>
            </dd>
            <dt>{c.effectiveAt}</dt>
            <dd>
              <time dateTime={r.effectiveAt}>{date(r.effectiveAt, locale)}</time>
            </dd>
            <dt>{c.release}</dt>
            <dd>
              <bdi dir="ltr">{r.releaseId}</bdi>
            </dd>
            {r.supersedesReleaseId && (
              <>
                <dt>{c.predecessor}</dt>
                <dd>
                  <bdi dir="ltr">{r.supersedesReleaseId}</bdi>
                </dd>
              </>
            )}
          </dl>
          <p>{c.signatures}</p>
        </article>
      ))}
      {state.page && (
        <p>
          {c.updated}:{' '}
          <time dateTime={state.page.meta.lastUpdatedAt}>
            {date(state.page.meta.lastUpdatedAt, locale)}
          </time>
        </p>
      )}
    </section>
  );
}
export function StatusWorkspace({
  accessToken,
  locale,
  onSignOut,
}: {
  accessToken: string;
  locale: Locale;
  onSignOut: () => void;
}) {
  const [state, setState] = useState<StatusState>({ kind: 'loading', page: null });
  const [contentType, setContentType] = useState('synthetic');
  const root = useRef<HTMLDivElement>(null),
    focusRequested = useRef(false);
  const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const controller = useMemo(
    () =>
      baseUrl
        ? new ClinicalStatusController(
            new Feature011Client({
              baseUrl,
              accessToken: () => accessToken,
              purpose: process.env['NEXT_PUBLIC_FEATURE_011_PURPOSE'] ?? 'clinical.content.status',
              acceptLanguage: locale,
            }),
            setState,
          )
        : null,
    [baseUrl, accessToken, locale],
  );
  useEffect(() => {
    const offline = () => controller?.clear('offline');
    const online = () => controller?.clear('stale');
    const contextLost = () => controller?.clear('denied');
    const hidden = () => {
      if (document.hidden) controller?.clear('stale');
    };
    if (controller) void controller.load('synthetic', navigator.onLine);
    else setState({ kind: 'gated', page: null });
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('shifaa:context-changed', contextLost);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('shifaa:context-changed', contextLost);
      document.removeEventListener('visibilitychange', hidden);
      controller?.dispose();
    };
  }, [controller]);
  useEffect(() => {
    if (state.kind !== 'loading' && focusRequested.current) {
      root.current?.querySelector<HTMLElement>('[data-status-outcome]')?.focus();
      focusRequested.current = false;
    }
  }, [state]);
  const c = clinicalStatusCopy[locale];
  const refresh = (cursor?: string) => {
    focusRequested.current = true;
    void controller?.load(contentType, navigator.onLine, cursor);
  };
  return (
    <div
      ref={root}
      style={{
        ...statusLayout,
        ...typography.body,
        fontSize: '1rem',
        lineHeight: 1.5,
        fontFamily: locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter',
      }}
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
    >
      <StatusView state={state} locale={locale} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          refresh();
        }}
      >
        <label htmlFor="status-content-type">{c.contentType}</label>
        <input
          id="status-content-type"
          value={contentType}
          required
          maxLength={100}
          style={{ ...statusControl, display: 'block', width: '100%', marginBlock: spacing.sm }}
          onChange={(event) => {
            controller?.clear('stale');
            setContentType(event.target.value);
          }}
        />
        <button
          style={statusControl}
          disabled={
            !controller ||
            state.kind === 'loading' ||
            state.kind === 'offline' ||
            !contentType.trim()
          }
        >
          {c.refresh}
        </button>
      </form>
      {state.page?.meta.nextCursor && (
        <button style={statusControl} onClick={() => refresh(state.page!.meta.nextCursor!)}>
          {c.more}
        </button>
      )}
      <p>
        {c.privacy}: {c.privacyEntry}
      </p>
      <button
        style={statusControl}
        onClick={() => {
          controller?.clear();
          onSignOut();
        }}
      >
        {c.signOut}
      </button>
    </div>
  );
}
