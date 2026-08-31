'use client';

import { FamilyCareApiError, FamilyCareClient } from '@shifaa/api-client/family-care';
import { IdentityContinuityApiError } from '@shifaa/api-client/identity-continuity';
import type {
  DependentTransitionWorklistItem,
  PermissionCode,
} from '@shifaa/contracts/family-care';
import { color, radius, spacing } from '@shifaa/design-system/tokens';
import { privilegedAccessState } from '@shifaa/design-system/security/privileged-access-policy';
import {
  securityMutationAllowed,
  useSecurityConnection,
} from '@shifaa/design-system/security/reconciliation';
import { translate } from '@shifaa/i18n';
import React, { useEffect, useMemo, useState } from 'react';

import { AdminTransitionApi } from '../../identity-continuity-api';
import { SecurityStepUpShell } from '../SecurityStepUpShell';

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

const noStaffAccessToken = () => undefined;

const arabicDisplayCodes: Readonly<Record<string, string>> = {
  loading: 'جارٍ التحميل',
  ready: 'جاهز',
  empty: 'لا توجد حالات',
  'aal-required': 'يلزم تحقق إضافي',
  'purpose-required': 'يلزم غرض مراجعة مصرح به',
  'self-denied': 'المراجعة الذاتية غير مسموحة',
  conflict: 'تعارض في النسخة',
  error: 'تعذر إكمال الإجراء',
  success: 'اكتمل الإجراء',
  released: 'دليل مُتاح للمراجعة',
  'guardianship-evidence': 'دليل وصاية',
  proof_required: 'يلزم إثبات الهوية',
  review_required: 'مطلوب مراجعة مستقلة',
  human_review_required: 'مطلوب مراجعة بشرية',
  approved: 'تمت الموافقة',
  rejected: 'تم الرفض',
  verified: 'تم التحقق',
  pending: 'قيد الانتظار',
  clear: 'لا يوجد مانع مسجل',
  blocked: 'يوجد مانع للمراجعة',
  allowed: 'مسموح بعد التحقق',
};

function displayCode(locale: Locale, code: string): string {
  if (locale === 'ar-EG') return arabicDisplayCodes[code] ?? 'حالة غير متاحة';
  return code.replaceAll('_', ' ').replaceAll('-', ' ');
}

export function GuardianshipWorkspace({
  accessToken = noStaffAccessToken,
}: {
  accessToken?: () => string | undefined;
}) {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [cases, setCases] = useState<CaseProjection[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<UiState>('loading');
  const [transitions, setTransitions] = useState<DependentTransitionWorklistItem[]>([]);
  const [selectedTransitionId, setSelectedTransitionId] = useState('');
  const [transitionState, setTransitionState] = useState('review_required');
  const [transitionAuthorized, setTransitionAuthorized] = useState(false);
  const [amrAgeSeconds, setAmrAgeSeconds] = useState(300);
  const [transitionBlockerReason, setTransitionBlockerReason] = useState<
    'interdiction' | 'court_order' | 'dispute'
  >('dispute');
  const connection = useSecurityConnection();
  const staffAccessToken = accessToken();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar-EG' ? 'rtl' : 'ltr';
  }, [locale]);
  const client = useMemo(
    () =>
      staffAccessToken
        ? new FamilyCareClient({
            baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
            accessToken: staffAccessToken,
            acceptLanguage: locale,
            defaultHeaders: { 'X-AAL': '2', 'X-Purpose': 'guardianship_review' },
          })
        : undefined,
    [locale, staffAccessToken],
  );
  const transitionClient = useMemo(
    () =>
      new AdminTransitionApi({
        locale,
        accessToken,
      }),
    [accessToken, locale],
  );
  const load = async () => {
    setState('loading');
    if (!client) return setState('aal-required');
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
    if (!staffAccessToken) {
      setTransitionAuthorized(false);
      return setTransitionState('aal-required');
    }
    try {
      const value = await transitionClient.listAssignedTransitions();
      setTransitions([...value.items]);
      setSelectedTransitionId(value.items[0]?.transitionCaseId ?? '');
      setTransitionState(value.items[0]?.status ?? 'review_required');
      setTransitionAuthorized(true);
      connection.markReconciled();
    } catch (error: unknown) {
      setTransitionAuthorized(false);
      const status = error instanceof FamilyCareApiError ? error.status : 0;
      setTransitionState(
        status === 401 ? 'aal-required' : status === 403 ? 'purpose-required' : 'error',
      );
    }
  };
  useEffect(() => {
    void loadTransitions();
  }, [transitionClient, connection.reconnectVersion]);
  const selected = cases.find((item) => item.id === selectedId);
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!client || !selected || reason.trim().length < 3) return;
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
    authAvailable: transitionAuthorized,
    aal: transitionAuthorized ? 'aal2' : 'aal1',
    amrAgeSeconds,
    purpose: transitionAuthorized ? 'guardianship_review' : null,
    reason,
  });
  const decideTransition = async (decision: 'approve' | 'reject' | 'defer') => {
    if (
      !selectedTransition ||
      stepUpState !== 'allowed' ||
      !securityMutationAllowed({
        online: connection.online,
        reconciliationRequired: connection.reconciliationRequired,
        sessionCurrent: stepUpState === 'allowed',
        authorityCurrent: transitions.some(
          (transition) => transition.transitionCaseId === selectedTransition.transitionCaseId,
        ),
      })
    )
      return;
    try {
      const result = await transitionClient.decideTransition(
        selectedTransition.relationshipId,
        {
          action: 'decide',
          decision,
          reasonCode: 'human_review.guardianship_transition',
          ...(decision === 'defer' ? { reviewRequiredReason: transitionBlockerReason } : {}),
        },
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
          <option key={value} value={value}>
            {displayCode(locale, value)}
          </option>
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
              <b>{displayCode(locale, item.evidence_type)}</b>
              <span>
                {displayCode(locale, item.evidence_status)} · v{item.relationship.version}
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
      <SecurityStepUpShell
        locale={locale}
        context={{
          authAvailable: transitionAuthorized,
          aal: transitionAuthorized ? 'aal2' : 'aal1',
          amrAgeSeconds,
          purpose: transitionAuthorized ? 'guardianship_review' : null,
          reason: reason.trim() || null,
        }}
        onLoginOrVerifyOtp={() => void loadTransitions()}
      >
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
                  <b>{displayCode(locale, item.status)}</b>
                  <span>
                    {displayCode(locale, item.proofState)} · {displayCode(locale, item.reviewState)}
                  </span>
                  <span>
                    {displayCode(locale, item.blockerState)} · v{item.continuityCaseVersion}
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
                  ? 'حالات القرار: تمت الموافقة / تم الرفض'
                  : 'Decision states: approved / rejected'}
              </p>
              <label htmlFor="transition-blocker-reason">
                {locale === 'ar-EG' ? 'سبب الإحالة للمراجعة البشرية' : 'Human-review blocker'}
              </label>
              <select
                id="transition-blocker-reason"
                value={transitionBlockerReason}
                onChange={(event) =>
                  setTransitionBlockerReason(
                    event.target.value as 'interdiction' | 'court_order' | 'dispute',
                  )
                }
                style={styles.control}
              >
                <option value="interdiction">
                  {locale === 'ar-EG' ? 'حجر قضائي' : 'Interdiction'}
                </option>
                <option value="court_order">
                  {locale === 'ar-EG' ? 'أمر محكمة' : 'Court order'}
                </option>
                <option value="dispute">{locale === 'ar-EG' ? 'نزاع' : 'Dispute'}</option>
              </select>
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
                {displayCode(locale, transitionState)} · {displayCode(locale, stepUpState)}
              </p>
            </div>
          </div>
        </section>
      </SecurityStepUpShell>
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
