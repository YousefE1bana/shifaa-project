'use client';

import { AuditAdminApiError, AuditAdminClient } from '@shifaa/api-client/audit-admin';
import { color, radius, spacing } from '@shifaa/design-system/tokens';
import { directionFor, isolateLtr, translate, type Locale } from '@shifaa/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  dashboardProblemState,
  dashboardStateFor,
  parseAdminSummary,
  type DashboardState,
  type SafeDashboardSummary,
} from './dashboard-model';

const noAdminAccessToken = () => undefined;

export function AdminDashboard({
  accessToken = noAdminAccessToken,
  fetcher,
}: {
  accessToken?: () => string | undefined;
  fetcher?: typeof globalThis.fetch;
}) {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [state, setState] = useState<DashboardState>('loading');
  const [summary, setSummary] = useState<SafeDashboardSummary | null>(null);
  const hasSummary = useRef(false);
  const token = accessToken();
  const client = useMemo(
    () =>
      token
        ? new AuditAdminClient({
            baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
            accessToken: token,
            acceptLanguage: locale,
            ...(fetcher ? { fetch: fetcher } : {}),
          })
        : undefined,
    [fetcher, locale, token],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionFor(locale);
  }, [locale]);

  const load = useCallback(async () => {
    if (!navigator.onLine) {
      setState(hasSummary.current ? 'stale' : 'offline');
      return;
    }
    if (!client) {
      setState('permission');
      return;
    }
    setState('loading');
    try {
      const safe = parseAdminSummary(await client.getAdminSummary());
      if (!safe) {
        setState(hasSummary.current ? 'stale' : 'error');
        return;
      }
      hasSummary.current = true;
      setSummary(safe);
      setState(dashboardStateFor(safe));
    } catch (error) {
      const status = error instanceof AuditAdminApiError ? error.status : 0;
      const code =
        error instanceof AuditAdminApiError && error.problem && typeof error.problem === 'object'
          ? String((error.problem as { code?: unknown }).code ?? '')
          : undefined;
      setState(dashboardProblemState(status, code, hasSummary.current));
    }
  }, [client]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    const offline = () => setState(hasSummary.current ? 'stale' : 'offline');
    const online = () => void load();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [load]);

  const statusMessage = dashboardStatusMessage(locale, state);
  return (
    <main lang={locale} dir={directionFor(locale)} style={styles.main}>
      <header style={styles.header}>
        <div>
          <h1>{translate(locale, 'auditAdmin.summary.title')}</h1>
          <p>{translate(locale, 'auditAdmin.summary.description')}</p>
        </div>
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        >
          {translate(locale, 'locale.switch')}
        </button>
      </header>

      <section aria-labelledby="dashboard-status" style={styles.card}>
        <h2 id="dashboard-status">{statusMessage}</h2>
        {(state === 'offline' || state === 'stale') && (
          <p role="alert">
            {translate(
              locale,
              state === 'stale' ? 'auditAdmin.summary.stale' : 'auditAdmin.summary.offline',
            )}
          </p>
        )}
        {summary && (
          <p>
            {translate(locale, 'auditAdmin.summary.lastUpdated')}:{' '}
            <bdi dir="ltr">{isolateLtr(new Date(summary.generatedAt).toLocaleString(locale))}</bdi>
          </p>
        )}
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => void load()}
          disabled={state === 'loading'}
        >
          {translate(locale, 'auditAdmin.summary.refresh')}
        </button>
      </section>

      {summary && summary.cells.length > 0 && (
        <section aria-label={translate(locale, 'auditAdmin.summary.title')} style={styles.grid}>
          {summary.cells.map((cell) => (
            <article
              key={`${cell.metricId}:${cell.period}:${JSON.stringify(cell.dimensions)}`}
              style={styles.card}
            >
              <h2>
                <bdi dir="ltr">{isolateLtr(cell.metricId)}</bdi>
              </h2>
              <p>
                <bdi dir="ltr">{isolateLtr(cell.period)}</bdi>
              </p>
              {Object.entries(cell.dimensions).map(([key, value]) => (
                <p key={key}>
                  <bdi dir="ltr">{isolateLtr(`${key}: ${value}`)}</bdi>
                </p>
              ))}
              {cell.disclosure === 'suppressed' ? (
                <p role="status" style={styles.warning}>
                  {translate(locale, 'auditAdmin.summary.suppressed')}
                </p>
              ) : (
                <p>
                  <strong>{translate(locale, 'auditAdmin.summary.released')}:</strong>{' '}
                  {cell.releasedCount}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
      <p role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>
    </main>
  );
}

function dashboardStatusMessage(locale: Locale, state: DashboardState): string {
  const keys = {
    loading: 'auditAdmin.summary.loading',
    empty: 'auditAdmin.summary.empty',
    gated: 'auditAdmin.summary.inactive',
    suppressed: 'auditAdmin.summary.suppressed',
    stale: 'auditAdmin.summary.stale',
    offline: 'auditAdmin.summary.offline',
    permission: 'auditAdmin.summary.permission',
    error: 'auditAdmin.summary.unavailable',
    success: 'auditAdmin.summary.description',
  } as const;
  return translate(locale, keys[state]);
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: 'clamp(16px,4vw,56px)',
    background: color.canvas,
    color: color.ink,
    fontFamily: "'IBM Plex Sans Arabic', Inter, system-ui, sans-serif",
    fontSize: 16,
    lineHeight: 1.5,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))',
    gap: spacing.lg,
    marginBlockStart: spacing.lg,
  },
  card: {
    border: `1px solid ${color.border}`,
    borderRadius: radius.card,
    background: color.surface,
    padding: spacing.lg,
    overflowWrap: 'anywhere',
  },
  warning: {
    borderInlineStart: `4px solid ${color.warning}`,
    paddingInlineStart: spacing.md,
    fontWeight: 700,
  },
  primaryButton: {
    minWidth: 44,
    minHeight: 44,
    paddingInline: spacing.md,
    border: 0,
    borderRadius: radius.control,
    background: color.brand,
    color: color.inverse,
    font: 'inherit',
    fontWeight: 700,
  },
  secondaryButton: {
    minWidth: 44,
    minHeight: 44,
    paddingInline: spacing.md,
    border: `2px solid ${color.brand}`,
    borderRadius: radius.control,
    background: color.surface,
    color: color.brand,
    font: 'inherit',
    fontWeight: 700,
  },
};
