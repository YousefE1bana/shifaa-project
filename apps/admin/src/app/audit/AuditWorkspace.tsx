'use client';

import { AuditAdminApiError, AuditAdminClient } from '@shifaa/api-client/audit-admin';
import { color, radius, spacing } from '@shifaa/design-system/tokens';
import { directionFor, isolateLtr, translate, type Locale } from '@shifaa/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  auditProblemState,
  canQueueAuditExport,
  exportStateFromEvidence,
  parseAuditDetail,
  parseAuditPage,
  type AuditWorkspaceState,
  type ExportUiState,
  type SafeAuditEvent,
} from './audit-model';

type AuditFilters = {
  action: string;
  resourceType: string;
  outcome: '' | 'success' | 'denied' | 'failed';
  occurredFrom: string;
  occurredBefore: string;
};
const emptyFilters: AuditFilters = {
  action: '',
  resourceType: '',
  outcome: '',
  occurredFrom: '',
  occurredBefore: '',
};
const noAdminAccessToken = () => undefined;

export function AuditWorkspace({
  accessToken = noAdminAccessToken,
  aal = 1,
  factorAgeSeconds = null,
  role = null,
  fetcher,
  onStepUp = () => undefined,
}: {
  accessToken?: () => string | undefined;
  aal?: 1 | 2;
  factorAgeSeconds?: number | null;
  role?: string | null;
  fetcher?: typeof globalThis.fetch;
  onStepUp?: () => void;
}) {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [purpose, setPurpose] = useState('');
  const [state, setState] = useState<AuditWorkspaceState>('aal-required');
  const [events, setEvents] = useState<SafeAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<SafeAuditEvent | null>(null);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [online, setOnline] = useState(true);
  const [exportState, setExportState] = useState<ExportUiState>('idle');
  const [exportReference, setExportReference] = useState<{ id: string; acceptedAt: string } | null>(
    null,
  );
  const [partitionStart, setPartitionStart] = useState('');
  const [partitionEnd, setPartitionEnd] = useState('');
  const detailsRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const token = accessToken();
  const authorized = Boolean(
    token &&
      role === 'super_admin' &&
      aal === 2 &&
      factorAgeSeconds !== null &&
      factorAgeSeconds >= 0 &&
      factorAgeSeconds <= 300,
  );
  const needsStepUp = Boolean(
    token &&
      role === 'super_admin' &&
      (aal !== 2 || factorAgeSeconds === null || factorAgeSeconds < 0 || factorAgeSeconds > 300),
  );
  const client = useMemo(
    () =>
      token
        ? new AuditAdminClient({
            baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
            accessToken: token,
            acceptLanguage: locale,
            defaultHeaders: { 'X-AAL': String(aal) },
            ...(fetcher ? { fetch: fetcher } : {}),
          })
        : undefined,
    [aal, fetcher, locale, token],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionFor(locale);
  }, [locale]);
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
    if (!online) setState(events.length ? 'stale' : 'offline');
  }, [events.length, online]);

  const load = useCallback(
    async (cursor?: string) => {
      if (!online) return setState(events.length ? 'stale' : 'offline');
      if (!authorized || !client)
        return setState(!token || role !== 'super_admin' ? 'permission' : 'aal-required');
      if (purpose !== 'security.audit.review') return setState('purpose-required');
      setState('loading');
      try {
        const page = parseAuditPage(
          await client.listAuditEvents(
            {
              ...(filters.action ? { action: filters.action } : {}),
              ...(filters.resourceType ? { resource_type: filters.resourceType } : {}),
              ...(filters.outcome ? { outcome: filters.outcome } : {}),
              ...(filters.occurredFrom
                ? { occurred_from: new Date(filters.occurredFrom).toISOString() }
                : {}),
              ...(filters.occurredBefore
                ? { occurred_before: new Date(filters.occurredBefore).toISOString() }
                : {}),
              ...(cursor ? { cursor } : {}),
              limit: 25,
            },
            purpose,
          ),
        );
        if (!page) return setState(events.length ? 'stale' : 'error');
        setEvents((current) =>
          cursor
            ? [
                ...current,
                ...page.events.filter(
                  (event) => !current.some((item) => item.eventId === event.eventId),
                ),
              ]
            : [...page.events],
        );
        setNextCursor(page.nextCursor);
        setState(page.events.length || cursor ? 'success' : 'empty');
        const exportEvidence = page.events
          .map(exportStateFromEvidence)
          .find((item) => item !== null);
        if (exportEvidence) setExportState(exportEvidence);
      } catch (error) {
        const { status, code } = problem(error);
        setState(auditProblemState(status, code, events.length > 0));
      }
    },
    [aal, authorized, client, events, factorAgeSeconds, filters, online, purpose],
  );

  const openDetails = async (event: SafeAuditEvent, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    if (!client || !online || purpose !== 'security.audit.review') return;
    try {
      const detail = parseAuditDetail(await client.getAuditEvent(event.eventId, purpose));
      if (!detail) return setState('error');
      setSelected(detail);
      queueMicrotask(() => detailsRef.current?.focus());
    } catch (error) {
      const { status, code } = problem(error);
      setState(auditProblemState(status, code, events.length > 0));
    }
  };
  const closeDetails = () => {
    setSelected(null);
    queueMicrotask(() => returnFocusRef.current?.focus());
  };

  const requestExport = async () => {
    if (
      !canQueueAuditExport({
        online,
        authorized,
        purpose,
        partitionStart,
        partitionEndExclusive: partitionEnd,
      }) ||
      !client
    ) {
      if (!online) setExportState('offline');
      return;
    }
    setExportState('submitting');
    try {
      const value = await client.createAuditExport(
        { partition_start: partitionStart, partition_end_exclusive: partitionEnd },
        purpose,
        `audit-ui-${globalThis.crypto.randomUUID()}`,
      );
      if (!isAcceptedExport(value)) return setExportState('failed');
      setExportReference({ id: value.export_batch_id, acceptedAt: value.accepted_at });
      setExportState('queued');
    } catch (error) {
      const { code } = problem(error);
      const conflict =
        code === 'idempotency-key-reused' ||
        code === 'export-range-invalid' ||
        code === 'export-state-conflict';
      setExportState(conflict ? 'conflict' : 'failed');
    }
  };

  return (
    <main lang={locale} dir={directionFor(locale)} style={styles.main}>
      <header style={styles.header}>
        <div>
          <h1>{translate(locale, 'auditAdmin.audit.title')}</h1>
          <p>{translate(locale, 'auditAdmin.audit.description')}</p>
        </div>
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        >
          {translate(locale, 'locale.switch')}
        </button>
      </header>
      {!authorized && (
        <section role="alert" style={styles.alert}>
          <p>
            {translate(
              locale,
              needsStepUp ? 'auditAdmin.audit.aal2' : 'auditAdmin.audit.permission',
            )}
          </p>
          {needsStepUp && (
            <button type="button" style={styles.primaryButton} onClick={onStepUp}>
              {translate(locale, 'auditAdmin.audit.aal2')}
            </button>
          )}
        </section>
      )}
      <section aria-labelledby="audit-purpose" style={styles.card}>
        <h2 id="audit-purpose">{translate(locale, 'auditAdmin.audit.purpose')}</h2>
        <p>{translate(locale, 'auditAdmin.audit.purposeHelp')}</p>
        <select
          aria-label={translate(locale, 'auditAdmin.audit.purpose')}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          style={styles.control}
        >
          <option value="">—</option>
          <option value="security.audit.review">security.audit.review</option>
        </select>
      </section>
      <section aria-labelledby="audit-filters" style={styles.card}>
        <h2 id="audit-filters">{translate(locale, 'auditAdmin.audit.filters')}</h2>
        <div style={styles.formGrid}>
          <Field label={translate(locale, 'auditAdmin.audit.action')}>
            <input
              value={filters.action}
              onChange={(event) => setFilters({ ...filters, action: event.target.value })}
              style={styles.control}
            />
          </Field>
          <Field label={translate(locale, 'auditAdmin.audit.resourceType')}>
            <input
              value={filters.resourceType}
              onChange={(event) => setFilters({ ...filters, resourceType: event.target.value })}
              style={styles.control}
            />
          </Field>
          <Field label={translate(locale, 'auditAdmin.audit.outcome')}>
            <select
              value={filters.outcome}
              onChange={(event) =>
                setFilters({ ...filters, outcome: event.target.value as AuditFilters['outcome'] })
              }
              style={styles.control}
            >
              <option value="">—</option>
              <option value="success">success</option>
              <option value="denied">denied</option>
              <option value="failed">failed</option>
            </select>
          </Field>
          <Field label={translate(locale, 'auditAdmin.audit.from')}>
            <input
              type="datetime-local"
              value={filters.occurredFrom}
              onChange={(event) => setFilters({ ...filters, occurredFrom: event.target.value })}
              style={styles.control}
            />
          </Field>
          <Field label={translate(locale, 'auditAdmin.audit.before')}>
            <input
              type="datetime-local"
              value={filters.occurredBefore}
              onChange={(event) => setFilters({ ...filters, occurredBefore: event.target.value })}
              style={styles.control}
            />
          </Field>
        </div>
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => void load()}
          disabled={state === 'loading'}
        >
          {translate(locale, 'auditAdmin.audit.apply')}
        </button>
      </section>
      <section aria-labelledby="audit-results" style={styles.card}>
        <h2 id="audit-results">{auditStateMessage(locale, state)}</h2>
        <div role="list" style={styles.list}>
          {events.map((event) => (
            <div key={event.eventId} role="listitem">
              <button
                ref={selected?.eventId === event.eventId ? returnFocusRef : undefined}
                type="button"
                style={styles.eventButton}
                onClick={(click) => void openDetails(event, click.currentTarget)}
              >
                <bdi dir="ltr">{isolateLtr(event.actionCode)}</bdi>
                <span>
                  <bdi dir="ltr">{isolateLtr(event.resourceType)}</bdi> · {event.outcome}
                </span>
                <time dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleString(locale)}
                </time>
                <span>
                  {event.chain.verification === 'verified'
                    ? translate(locale, 'auditAdmin.audit.integrityVerified')
                    : translate(locale, 'auditAdmin.audit.integrityFailed')}
                </span>
              </button>
            </div>
          ))}
        </div>
        {nextCursor && (
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => void load(nextCursor)}
          >
            {translate(locale, 'auditAdmin.audit.loadMore')}
          </button>
        )}
      </section>
      {selected && (
        <section ref={detailsRef} tabIndex={-1} aria-labelledby="audit-detail" style={styles.card}>
          <h2 id="audit-detail">{translate(locale, 'auditAdmin.audit.eventDetails')}</h2>
          <p>{translate(locale, 'auditAdmin.audit.redacted')}</p>
          <Evidence
            label={translate(locale, 'auditAdmin.audit.reference')}
            value={selected.eventId}
          />
          <Evidence
            label={translate(locale, 'auditAdmin.audit.occurredAt')}
            value={selected.occurredAt}
          />
          <Evidence
            label={translate(locale, 'auditAdmin.audit.action')}
            value={selected.actionCode}
          />
          <Evidence
            label={translate(locale, 'auditAdmin.audit.resourceType')}
            value={selected.resourceType}
          />
          {selected.reasonCode && (
            <Evidence
              label={translate(locale, 'auditAdmin.audit.reason')}
              value={selected.reasonCode}
            />
          )}
          <Evidence
            label={translate(locale, 'auditAdmin.audit.evidenceDigest')}
            value={selected.chain.eventHash}
          />
          <p role={selected.chain.verification === 'failed' ? 'alert' : 'status'}>
            {selected.chain.verification === 'verified'
              ? translate(locale, 'auditAdmin.audit.integrityVerified')
              : translate(locale, 'auditAdmin.audit.integrityFailed')}
          </p>
          <button type="button" style={styles.secondaryButton} onClick={closeDetails}>
            {translate(locale, 'auditAdmin.audit.closeDetails')}
          </button>
        </section>
      )}
      <section aria-labelledby="audit-export" style={styles.card}>
        <h2 id="audit-export">{translate(locale, 'auditAdmin.export.title')}</h2>
        <p>{translate(locale, 'auditAdmin.export.description')}</p>
        <div style={styles.formGrid}>
          <Field label={translate(locale, 'auditAdmin.export.rangeStart')}>
            <input
              type="date"
              value={partitionStart}
              onChange={(event) => setPartitionStart(event.target.value)}
              style={styles.control}
            />
          </Field>
          <Field label={translate(locale, 'auditAdmin.export.rangeEnd')}>
            <input
              type="date"
              value={partitionEnd}
              onChange={(event) => setPartitionEnd(event.target.value)}
              style={styles.control}
            />
          </Field>
        </div>
        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => void requestExport()}
          disabled={
            !canQueueAuditExport({
              online,
              authorized,
              purpose,
              partitionStart,
              partitionEndExclusive: partitionEnd,
            }) || exportState === 'submitting'
          }
        >
          {translate(locale, 'auditAdmin.export.create')}
        </button>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p>{exportStateMessage(locale, exportState)}</p>
          {exportReference && (
            <>
              <Evidence
                label={translate(locale, 'auditAdmin.audit.reference')}
                value={exportReference.id}
              />
              <Evidence
                label={translate(locale, 'auditAdmin.audit.occurredAt')}
                value={exportReference.acceptedAt}
              />
              <p>{translate(locale, 'auditAdmin.export.nextStep')}</p>
            </>
          )}
        </div>
      </section>
      <p role="status" aria-live="polite" aria-atomic="true">
        {auditStateMessage(locale, state)}
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <strong>{label}:</strong> <bdi dir="ltr">{isolateLtr(value)}</bdi>
    </p>
  );
}
function problem(error: unknown): { status: number; code?: string } {
  if (!(error instanceof AuditAdminApiError)) return { status: 0 };
  const code =
    error.problem && typeof error.problem === 'object'
      ? String((error.problem as { code?: unknown }).code ?? '')
      : undefined;
  return { status: error.status, ...(code ? { code } : {}) };
}
function isAcceptedExport(
  value: unknown,
): value is { export_batch_id: string; status: 'queued'; accepted_at: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)['status'] === 'queued' &&
    typeof (value as Record<string, unknown>)['export_batch_id'] === 'string' &&
    typeof (value as Record<string, unknown>)['accepted_at'] === 'string'
  );
}
function auditStateMessage(locale: Locale, state: AuditWorkspaceState): string {
  const keys = {
    'aal-required': 'auditAdmin.audit.aal2',
    'purpose-required': 'auditAdmin.audit.purposeRequired',
    loading: 'auditAdmin.audit.loading',
    empty: 'auditAdmin.audit.empty',
    permission: 'auditAdmin.audit.permission',
    offline: 'auditAdmin.audit.offline',
    stale: 'auditAdmin.audit.stale',
    error: 'auditAdmin.audit.unavailable',
    success: 'auditAdmin.audit.description',
  } as const;
  return translate(locale, keys[state]);
}
function exportStateMessage(locale: Locale, state: ExportUiState): string {
  const keys = {
    idle: 'auditAdmin.export.description',
    submitting: 'auditAdmin.summary.loading',
    queued: 'auditAdmin.export.queued',
    retrying: 'auditAdmin.export.retrying',
    failed: 'auditAdmin.export.integrityFailed',
    dead_letter: 'auditAdmin.export.deadLetter',
    proven: 'auditAdmin.export.proven',
    offline: 'auditAdmin.export.offline',
    conflict: 'auditAdmin.export.conflict',
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
  card: {
    marginBlockStart: spacing.lg,
    border: `1px solid ${color.border}`,
    borderRadius: radius.card,
    background: color.surface,
    padding: spacing.lg,
    overflowWrap: 'anywhere',
  },
  alert: {
    marginBlock: spacing.lg,
    border: `2px solid ${color.warning}`,
    borderRadius: radius.card,
    background: color.surface,
    padding: spacing.lg,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))',
    gap: spacing.md,
    marginBlockEnd: spacing.md,
  },
  field: { display: 'grid', gap: spacing.xs },
  control: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 44,
    paddingInline: spacing.sm,
    font: 'inherit',
  },
  list: { display: 'grid', gap: spacing.sm, marginBlock: spacing.md },
  eventButton: {
    display: 'grid',
    width: '100%',
    minHeight: 72,
    gap: spacing.xs,
    textAlign: 'start',
    padding: spacing.md,
    border: `2px solid ${color.brand}`,
    borderRadius: radius.control,
    background: color.surfaceSubtle,
    color: color.ink,
    font: 'inherit',
    overflowWrap: 'anywhere',
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
