'use client';

import { FamilyCareApiError, FamilyCareClient } from '@shifaa/api-client/family-care';
import { IdentityContinuityApiError } from '@shifaa/api-client/identity-continuity';
import type {
  DependentTransitionWorklistItem,
  PermissionCode,
} from '@shifaa/contracts/family-care';
import { color, radius, spacing } from '@shifaa/design-system/tokens';
import { privilegedAccessState } from '@shifaa/design-system/security/privileged-access-policy';
import { translate } from '@shifaa/i18n';
import React, { useEffect, useMemo, useState } from 'react';

import { AdminTransitionApi } from '../../identity-continuity-api';

type Locale = 'ar-EG' | 'en-EG';
type CaseProjection = {
  id: string;
  relationship: {
    status: string;
    permissions: PermissionCode[];
    valid_from: string;
    version: number;
  };
  evidence_status: 'released';
  evidence_type: 'guardianship-evidence';
  submitted_at: string;
};
type UiState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'aal-required'
  | 'purpose-required'
  | 'self-denied'
  | 'conflict'
  | 'error'
  | 'success';

export function GuardianshipWorkspace() {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [cases, setCases] = useState<CaseProjection[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<UiState>('loading');
  const [transitions, setTransitions] = useState<DependentTransitionWorklistItem[]>([]);
  const [selectedTransitionId, setSelectedTransitionId] = useState('');
  const [transitionState, setTransitionState] = useState('review_required');
  const [amrAgeSeconds, setAmrAgeSeconds] = useState(300);
  const accessToken = 'synthetic-admin:support_admin:40000000-0000-4000-8000-000000000006';
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar-EG' ? 'rtl' : 'ltr';
  }, [locale]);
  const client = useMemo(
    () =>
      new FamilyCareClient({
        baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
        accessToken,
        acceptLanguage: locale,
        defaultHeaders: { 'X-AAL': '2', 'X-Purpose': 'guardianship_review' },
      }),
    [locale],
  );
  const transitionClient = useMemo(
    () =>
      new AdminTransitionApi({
        locale,
        accessToken: () => accessToken,
      }),
    [locale],
  );
  const load = async () => {
    setState('loading');
    try {
      const value = (await client.listGuardianshipCases({ status: 'pending', limit: 25 })) as {
        items: CaseProjection[];
      };
      setCases(value.items);
      setSelectedId(value.items[0]?.id ?? '');
      setState(value.items.length ? 'ready' : 'empty');
    } catch (error: unknown) {
      const status = error instanceof FamilyCareApiError ? error.status : 0;
      setState(status === 403 ? 'purpose-required' : status === 401 ? 'aal-required' : 'error');
    }
  };
  useEffect(() => {
    void load();
  }, [client]);
  const loadTransitions = async () => {
    try {
      const value = await transitionClient.listAssignedTransitions();
      setTransitions([...value.items]);
      setSelectedTransitionId(value.items[0]?.transitionCaseId ?? '');
      setTransitionState(value.items[0]?.status ?? 'review_required');
    } catch (error: unknown) {
      const status = error instanceof FamilyCareApiError ? error.status : 0;
      setTransitionState(
        status === 401 ? 'aal-required' : status === 403 ? 'purpose-required' : 'error',
      );
    }
  };
  useEffect(() => {
    void loadTransitions();
  }, [transitionClient]);
  const selected = cases.find((item) => item.id === selectedId);
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!selected || reason.trim().length < 3) return;
    try {
      await client.reviewGuardianship(
        selected.id,
        {
          decision,
          reason_code: reason,
          ...(decision === 'approved'
            ? {
                approved_permissions: selected.relationship.permissions,
                valid_until: '2027-08-11T09:00:00.000Z',
              }
            : {}),
        },
        selected.relationship.version,
        `synthetic-ui-004-review-${decision}-${Date.now()}`,
      );
      setState('success');
    } catch (error: unknown) {
      const status = error instanceof FamilyCareApiError ? error.status : 0;
      setState(status === 409 ? 'conflict' : status === 403 ? 'self-denied' : 'error');
    }
  };
  const selectedTransition = transitions.find(
    (item) => item.transitionCaseId === selectedTransitionId,
  );
  const stepUpState = privilegedAccessState({
    authAvailable: true,
    aal: 'aal2',
    amrAgeSeconds,
    purpose: 'guardianship_review',
    reason,
  });
  const decideTransition = async (decision: 'approve' | 'reject' | 'defer') => {
    if (!selectedTransition || stepUpState !== 'allowed') return;
    try {
      const result = await transitionClient.decideTransition(
        selectedTransition.relationshipId,
        { action: 'decide', decision, reasonCode: reason.trim() },
        selectedTransition.continuityCaseVersion,
      );
      setTransitionState(result.status);
      await loadTransitions();
    } catch (error: unknown) {
      if (error instanceof IdentityContinuityApiError && error.status === 409) {
        setTransitionState('version-conflict');
        await loadTransitions();
      } else {
        setTransitionState('error');
      }
    }
  };
  const stateText: Record<UiState, string> = {
    loading: translate(locale, 'state.loading'),
    ready: translate(locale, 'admin.guardianship.minimum'),
    empty: translate(locale, 'review.empty'),
    'aal-required': translate(locale, 'admin.guardianship.aal2'),
    'purpose-required': translate(locale, 'admin.guardianship.purpose'),
    'self-denied': translate(locale, 'admin.guardianship.selfReview'),
    conflict: translate(locale, 'family.problem.conflict'),
    error: translate(locale, 'state.unavailable'),
    success: translate(locale, 'state.success'),
  };
  return (
    <main dir={locale === 'ar-EG' ? 'rtl' : 'ltr'} lang={locale} style={styles.main}>
      <button
        style={styles.button}
        onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
      >
        {translate(locale, 'locale.switch')}
      </button>
      <h1>{translate(locale, 'admin.guardianships')}</h1>
      <p>{translate(locale, 'admin.guardianship.minimum')}</p>
      <label htmlFor="qa-state">
        {locale === 'ar-EG' ? 'حالة العرض الاصطناعي' : 'Synthetic display state'}
      </label>
      <select
        id="qa-state"
        value={state}
        onChange={(event) => setState(event.target.value as UiState)}
        style={styles.control}
      >
        {(
          [
            'loading',
            'ready',
            'empty',
            'aal-required',
            'purpose-required',
            'self-denied',
            'conflict',
            'error',
            'success',
          ] as const
        ).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <div style={styles.grid}>
        <section aria-labelledby="guardianship-worklist" style={styles.card}>
          <h2 id="guardianship-worklist">{locale === 'ar-EG' ? 'قائمة العمل' : 'Worklist'}</h2>
          {cases.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={styles.caseButton}
              aria-pressed={selectedId === item.id}
            >
              <b>{item.evidence_type}</b>
              <span>
                {item.evidence_status} · v{item.relationship.version}
              </span>
              <span>{item.relationship.permissions.join(' · ')}</span>
            </button>
          ))}
        </section>
        <section aria-labelledby="guardianship-decision" style={styles.card}>
          <h2 id="guardianship-decision">
            {locale === 'ar-EG' ? 'قرار مستقل' : 'Independent decision'}
          </h2>
          <label htmlFor="decision-reason">{translate(locale, 'review.reason')}</label>
          <textarea
            id="decision-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            style={styles.textarea}
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              disabled={!selected || reason.trim().length < 3}
              onClick={() => void decide('approved')}
              style={styles.button}
            >
              {translate(locale, 'admin.approve')}
            </button>
            <button
              disabled={!selected || reason.trim().length < 3}
              onClick={() => void decide('rejected')}
              style={styles.danger}
            >
              {translate(locale, 'admin.reject')}
            </button>
          </div>
          <p role="status" aria-live="polite">
            {stateText[state]}
          </p>
        </section>
      </div>
      <section
        aria-labelledby="dependent-transition-review"
        style={{ ...styles.card, marginBlockStart: spacing.lg }}
      >
        <h2 id="dependent-transition-review">
          {locale === 'ar-EG'
            ? 'مراجعة انتقال التابع المعيّنة'
            : 'Assigned dependent transition review'}
        </h2>
        <p>
          {locale === 'ar-EG'
            ? 'تعرض هذه القائمة الحالات المعيّنة لك فقط. القرار لا يقرر الأهلية القانونية.'
            : 'This worklist shows only cases assigned to you. It presents review state, not a legal conclusion.'}
        </p>
        <label htmlFor="amr-age">
          {locale === 'ar-EG' ? 'عمر تحقق AMR بالثواني' : 'AMR age in seconds'}
        </label>
        <input
          id="amr-age"
          type="number"
          min={0}
          value={amrAgeSeconds}
          onChange={(event) => setAmrAgeSeconds(Number(event.target.value))}
          style={styles.control}
        />
        <div style={styles.grid}>
          <div
            role="list"
            aria-label={
              locale === 'ar-EG' ? 'حالات الانتقال المعيّنة' : 'Assigned transition cases'
            }
          >
            {transitions.map((item) => (
              <button
                key={item.transitionCaseId}
                role="listitem"
                aria-pressed={selectedTransitionId === item.transitionCaseId}
                onClick={() => setSelectedTransitionId(item.transitionCaseId)}
                style={styles.caseButton}
              >
                <b>{item.status}</b>
                <span>
                  {item.proofState} · {item.reviewState}
                </span>
                <span>
                  {item.blockerState} · v{item.continuityCaseVersion}
                </span>
              </button>
            ))}
          </div>
          <div>
            <p>
              {selectedTransition?.status === 'human_review_required'
                ? locale === 'ar-EG'
                  ? 'مراجعة بشرية مطلوبة'
                  : 'Human review required'
                : locale === 'ar-EG'
                  ? 'مراجعة مستقلة مطلوبة'
                  : 'Independent review required'}
            </p>
            <p>
              {locale === 'ar-EG'
                ? 'حالات القرار: approved / rejected'
                : 'Decision states: approved / rejected'}
            </p>
            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              <button
                disabled={stepUpState !== 'allowed'}
                onClick={() => void decideTransition('approve')}
                style={styles.button}
              >
                {translate(locale, 'admin.approve')}
              </button>
              <button
                disabled={stepUpState !== 'allowed'}
                onClick={() => void decideTransition('reject')}
                style={styles.danger}
              >
                {translate(locale, 'admin.reject')}
              </button>
              <button
                disabled={stepUpState !== 'allowed'}
                onClick={() => void decideTransition('defer')}
                style={styles.button}
              >
                {locale === 'ar-EG' ? 'إحالة للمراجعة البشرية' : 'Defer to human review'}
              </button>
            </div>
            <p role="status" aria-live="polite">
              {transitionState} · {stepUpState}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: 'clamp(16px,4vw,56px)',
    background: color.canvas,
    color: color.ink,
    fontFamily: "'IBM Plex Sans Arabic', Inter, system-ui, sans-serif",
    fontSize: 16,
    lineHeight: '24px',
    fontWeight: 400,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))',
    gap: 24,
    marginBlockStart: 24,
  },
  card: {
    border: `1px solid ${color.border}`,
    borderRadius: radius.card,
    background: color.surface,
    padding: spacing.lg,
  },
  control: { minHeight: 44, marginInlineStart: spacing.sm },
  caseButton: {
    display: 'grid',
    width: '100%',
    gap: 6,
    minHeight: 72,
    textAlign: 'start',
    padding: 14,
    background: color.surfaceSubtle,
    border: `2px solid ${color.brand}`,
    borderRadius: radius.control,
  },
  textarea: { width: '100%', minHeight: 120, marginBlock: 10, font: 'inherit' },
  button: {
    minHeight: 48,
    paddingInline: 18,
    borderRadius: 10,
    border: 0,
    background: color.brand,
    color: color.inverse,
    font: 'inherit',
    fontWeight: 700,
  },
  danger: {
    minHeight: 48,
    paddingInline: 18,
    borderRadius: 10,
    border: `2px solid ${color.danger}`,
    background: color.surface,
    color: color.danger,
    font: 'inherit',
    fontWeight: 700,
  },
};
