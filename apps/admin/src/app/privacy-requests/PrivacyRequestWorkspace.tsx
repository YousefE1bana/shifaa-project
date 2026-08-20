'use client';

import {
  PrivacyDsrNotificationClient,
  PrivacyDsrNotificationApiError,
} from '@shifaa/api-client/privacy-dsr-notifications';
import type { DsrDecisionInput } from '@shifaa/contracts/privacy-dsr-notifications';
import { translate } from '@shifaa/i18n';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

type Locale = 'ar-EG' | 'en-EG';
type Item = { id: string; request_type: string; status: string; due_at: string; version: number };
type State =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'aal-required'
  | 'purpose-required'
  | 'permission'
  | 'identity-required'
  | 'stale'
  | 'offline'
  | 'error'
  | 'success';
const dpoId = '50000000-0000-4000-8000-000000000006';

export function PrivacyRequestWorkspace() {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<State>('loading');
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar-EG' ? 'rtl' : 'ltr';
  }, [locale]);
  const client = useMemo(
    () =>
      new PrivacyDsrNotificationClient({
        baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
        accessToken: `synthetic-dpo:${dpoId}`,
        acceptLanguage: locale,
      }),
    [locale],
  );
  const load = useCallback(async () => {
    if (!navigator.onLine) return setState('offline');
    setState('loading');
    try {
      const value = (await client.listAdminDsrs({ limit: 25 })) as { items: Item[] };
      setItems(value.items);
      setSelectedId(value.items[0]?.id ?? '');
      setState(value.items.length ? 'ready' : 'empty');
    } catch (error) {
      const status = error instanceof PrivacyDsrNotificationApiError ? error.status : 0;
      setState(status === 403 ? 'purpose-required' : status === 401 ? 'aal-required' : 'error');
    }
  }, [client]);
  useEffect(() => void load(), [load]);
  const selected = items.find((item) => item.id === selectedId);
  const decide = async (decision: DsrDecisionInput['decision']) => {
    if (!selected || reason.trim().length < 3 || !navigator.onLine) return setState('offline');
    try {
      await client.decideDsr(
        selected.id,
        {
          decision,
          reason_code: 'request.reviewed',
          reason_summary: reason,
          evidence_object_id: '53000000-0000-4000-8000-000000000001',
          ...(decision === 'partially_approve'
            ? {
                included_scope: { data_category_codes: ['profile'] },
                excluded_scope: { data_category_codes: ['clinical.restricted'] },
              }
            : {}),
        },
        selected.version,
        `synthetic-ui-005-decision-${decision}-${Date.now()}`,
      );
      setState('success');
      await load();
    } catch (error) {
      const status = error instanceof PrivacyDsrNotificationApiError ? error.status : 0;
      const code =
        error instanceof PrivacyDsrNotificationApiError &&
        typeof error.problem === 'object' &&
        error.problem
          ? String((error.problem as { code?: string }).code)
          : '';
      setState(
        code === 'identity-verification-required'
          ? 'identity-required'
          : status === 409
            ? 'stale'
            : status === 403
              ? 'permission'
              : 'error',
      );
    }
  };
  const fulfil = async () => {
    if (!selected || reason.trim().length < 3 || !navigator.onLine) return setState('offline');
    try {
      await client.fulfilDsr(
        selected.id,
        {
          action_codes:
            selected.request_type === 'access_export'
              ? ['export.released']
              : [`${selected.request_type}.reviewed`],
          action_summary: reason,
          evidence_object_id: '53000000-0000-4000-8000-000000000003',
          subject_notice_code: 'DSR_EXPORT_READY',
        },
        selected.version,
        `synthetic-ui-005-fulfil-${Date.now()}`,
      );
      setState('success');
      await load();
    } catch (error) {
      const status = error instanceof PrivacyDsrNotificationApiError ? error.status : 0;
      setState(status === 409 ? 'stale' : status === 403 ? 'permission' : 'error');
    }
  };
  const labels: Record<State, string> = {
    loading: translate(locale, 'state.loading'),
    ready: translate(locale, 'admin.privacy.minimum'),
    empty: translate(locale, 'review.empty'),
    'aal-required': translate(locale, 'review.aal2'),
    'purpose-required': translate(locale, 'review.purpose'),
    permission: translate(locale, 'state.permission'),
    'identity-required': translate(locale, 'admin.privacy.identityBlocked'),
    stale: translate(locale, 'privacy.requests.stale'),
    offline: translate(locale, 'privacy.requests.offline'),
    error: translate(locale, 'state.unavailable'),
    success: translate(locale, 'state.success'),
  };
  return (
    <main dir={locale === 'ar-EG' ? 'rtl' : 'ltr'} lang={locale} className="workspace">
      <button onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}>
        {translate(locale, 'locale.switch')}
      </button>
      <h1>{translate(locale, 'admin.privacyRequests')}</h1>
      <p>{translate(locale, 'admin.privacy.minimum')}</p>
      <label htmlFor="privacy-qa">
        {locale === 'ar-EG' ? 'حالة العرض التجريبي' : 'Synthetic display state'}
      </label>
      <select
        id="privacy-qa"
        value={state}
        onChange={(event) => setState(event.target.value as State)}
      >
        {(
          [
            'loading',
            'ready',
            'empty',
            'aal-required',
            'purpose-required',
            'permission',
            'identity-required',
            'stale',
            'offline',
            'error',
            'success',
          ] as const
        ).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <div className="workspace-grid">
        <section aria-labelledby="privacy-worklist" className="workspace-card">
          <h2 id="privacy-worklist">
            {locale === 'ar-EG' ? 'الطلبات المكلّف بها' : 'Assigned requests'}
          </h2>
          {items.map((item) => (
            <button
              className="work-item"
              key={item.id}
              aria-pressed={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.request_type}</strong>
              <span>
                {item.status} · v{item.version}
              </span>
              <span>{new Date(item.due_at).toLocaleDateString(locale)}</span>
            </button>
          ))}
        </section>
        <section aria-labelledby="privacy-decision" className="workspace-card">
          <h2 id="privacy-decision">
            {locale === 'ar-EG' ? 'قرار موثّق' : 'Evidence-backed decision'}
          </h2>
          <label htmlFor="privacy-reason">{translate(locale, 'review.reason')}</label>
          <textarea
            id="privacy-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="action-row">
            <button
              disabled={!selected || reason.trim().length < 3}
              onClick={() => void decide('approve')}
            >
              {translate(locale, 'admin.approve')}
            </button>
            <button
              disabled={!selected || reason.trim().length < 3}
              onClick={() => void decide('partially_approve')}
            >
              {translate(locale, 'admin.privacy.partial')}
            </button>
            <button
              className="danger"
              disabled={!selected || reason.trim().length < 3}
              onClick={() => void decide('refuse')}
            >
              {translate(locale, 'admin.reject')}
            </button>
            <button
              disabled={
                !selected ||
                !['approved', 'partially_approved'].includes(selected.status) ||
                reason.trim().length < 3
              }
              onClick={() => void fulfil()}
            >
              {translate(locale, 'admin.privacy.fulfil')}
            </button>
          </div>
          <p role="status" aria-live="polite">
            {labels[state]}
          </p>
        </section>
      </div>
    </main>
  );
}
