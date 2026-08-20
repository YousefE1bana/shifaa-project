'use client';

import {
  PrivacyDsrNotificationClient,
  PrivacyDsrNotificationApiError,
} from '@shifaa/api-client/privacy-dsr-notifications';
import { canonicalTemplateDigest } from '@shifaa/core/privacy-dsr-notifications/policy';
import { translate } from '@shifaa/i18n';
import React, { useEffect, useMemo, useState } from 'react';

type Locale = 'ar-EG' | 'en-EG';
type Release = {
  id: string;
  templateCode: string;
  status: string;
  contentDigest: string;
  version: number;
};
type State =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'aal-required'
  | 'purpose-required'
  | 'separation-denied'
  | 'stale'
  | 'offline'
  | 'error'
  | 'success';
const author = '50000000-0000-4000-8000-000000000008';
const publisher = '50000000-0000-4000-8000-000000000009';

export function NotificationTemplateWorkspace() {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [mode, setMode] = useState<'author' | 'publisher'>('author');
  const [items, setItems] = useState<Release[]>([]);
  const [arabicBody, setArabicBody] = useState(
    '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
  );
  const [englishBody, setEnglishBody] = useState(
    '{{request_reference}} {{ready_until_label}} {{privacy_requests_path}}',
  );
  const [state, setState] = useState<State>('loading');
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar-EG' ? 'rtl' : 'ltr';
  }, [locale]);
  const client = useMemo(
    () =>
      new PrivacyDsrNotificationClient({
        baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
        accessToken: `synthetic-admin:support_admin:${mode === 'author' ? author : publisher}`,
        acceptLanguage: locale,
        defaultHeaders: {
          'X-AAL': mode === 'publisher' ? '2' : '1',
          'X-Purpose':
            mode === 'publisher' ? 'notification.template.publish' : 'notification.template.manage',
        },
      }),
    [locale, mode],
  );
  const load = async () => {
    if (!navigator.onLine) return setState('offline');
    setState('loading');
    try {
      const value = (await client.listNotificationTemplates({ code: 'DSR_EXPORT_READY' })) as {
        items: Release[];
      };
      setItems(value.items);
      setState(value.items.length ? 'ready' : 'empty');
    } catch (error) {
      const status = error instanceof PrivacyDsrNotificationApiError ? error.status : 0;
      setState(status === 403 ? 'purpose-required' : status === 401 ? 'aal-required' : 'error');
    }
  };
  useEffect(() => void load(), [client]);
  const schema = {
    privacy_requests_path: 'string' as const,
    ready_until_label: 'string' as const,
    request_reference: 'string' as const,
  };
  const required = Object.keys(schema).sort();
  const draft = async () => {
    if (!navigator.onLine) return setState('offline');
    const digest = canonicalTemplateDigest({
      templateCode: 'DSR_EXPORT_READY',
      channel: 'sms',
      arabicBody,
      englishBody,
      allowedRecipientTypes: ['patient'],
      allowedFields: schema,
      requiredFields: required,
    });
    try {
      await client.createNotificationTemplateRelease(
        'DSR_EXPORT_READY',
        {
          channel: 'sms',
          arabic_body: arabicBody,
          english_body: englishBody,
          allowed_recipient_types: ['patient'],
          allowed_field_schema: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(required.map((field) => [field, { type: 'string' }])),
            required,
          },
          content_digest: digest,
        },
        `synthetic-ui-005-template-${Date.now()}`,
      );
      setState('success');
      await load();
    } catch {
      setState('error');
    }
  };
  const publish = async (release: Release) => {
    try {
      await client.publishNotificationTemplateRelease(
        release.id,
        { approval_digest: release.contentDigest, effective_at: new Date().toISOString() },
        release.version,
        `synthetic-ui-005-publish-${Date.now()}`,
      );
      setState('success');
      await load();
    } catch (error) {
      const status = error instanceof PrivacyDsrNotificationApiError ? error.status : 0;
      setState(status === 409 ? 'stale' : status === 403 ? 'separation-denied' : 'error');
    }
  };
  const labels: Record<State, string> = {
    loading: translate(locale, 'state.loading'),
    ready: translate(locale, 'admin.notification.minimum'),
    empty: translate(locale, 'privacy.empty'),
    'aal-required': translate(locale, 'review.aal2'),
    'purpose-required': translate(locale, 'review.purpose'),
    'separation-denied': translate(locale, 'admin.independentActor'),
    stale: translate(locale, 'privacy.requests.stale'),
    offline: translate(locale, 'privacy.requests.offline'),
    error: translate(locale, 'state.unavailable'),
    success: translate(locale, 'state.success'),
  };
  return (
    <main dir={locale === 'ar-EG' ? 'rtl' : 'ltr'} lang={locale} className="workspace">
      <div className="action-row">
        <button onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}>
          {translate(locale, 'locale.switch')}
        </button>
        <button onClick={() => setMode(mode === 'author' ? 'publisher' : 'author')}>
          {mode === 'author'
            ? locale === 'ar-EG'
              ? 'وضع الناشر المستقل'
              : 'Independent publisher mode'
            : locale === 'ar-EG'
              ? 'وضع المؤلف'
              : 'Author mode'}
        </button>
      </div>
      <h1>{translate(locale, 'admin.notificationTemplates')}</h1>
      <p>{translate(locale, 'admin.notification.minimum')}</p>
      <label htmlFor="template-qa">
        {locale === 'ar-EG' ? 'حالة العرض التجريبي' : 'Synthetic display state'}
      </label>
      <select
        id="template-qa"
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
            'separation-denied',
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
        <section className="workspace-card" aria-labelledby="paired-content">
          <h2 id="paired-content">{locale === 'ar-EG' ? 'المحتوى المزدوج' : 'Paired content'}</h2>
          <label htmlFor="arabic-body">العربية</label>
          <textarea
            id="arabic-body"
            dir="rtl"
            value={arabicBody}
            onChange={(event) => setArabicBody(event.target.value)}
          />
          <label htmlFor="english-body">English</label>
          <textarea
            id="english-body"
            dir="ltr"
            value={englishBody}
            onChange={(event) => setEnglishBody(event.target.value)}
          />
          <p>{required.join(' · ')}</p>
          <button disabled={mode !== 'author'} onClick={() => void draft()}>
            {translate(locale, 'admin.notification.draft')}
          </button>
        </section>
        <section className="workspace-card" aria-labelledby="release-list">
          <h2 id="release-list">{locale === 'ar-EG' ? 'إصدارات الحوكمة' : 'Governed releases'}</h2>
          {items.map((item) => (
            <div className="work-item" key={item.id}>
              <strong>{item.templateCode}</strong>
              <span>
                {item.status} · v{item.version}
              </span>
              <code>{item.contentDigest.slice(0, 16)}…</code>
              <button
                disabled={mode !== 'publisher' || item.status !== 'draft'}
                onClick={() => void publish(item)}
              >
                {translate(locale, 'admin.notification.publish')}
              </button>
            </div>
          ))}
        </section>
      </div>
      <p role="status" aria-live="polite">
        {labels[state]}
      </p>
    </main>
  );
}
