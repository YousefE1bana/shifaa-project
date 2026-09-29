'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IdentityOnboardingClient } from '@shifaa/api-client';
import { createFeature010Client, Feature010ApiError } from '@shifaa/api-client/feature-010';
import {
  color,
  localizedType,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';

type Locale = 'ar-EG' | 'en-EG';
type Feature010Client = ReturnType<typeof createFeature010Client>;
type ReferralPage = Awaited<ReturnType<Feature010Client['listReferrals']>>;
type CreateReferralRequest = Parameters<Feature010Client['createReferral']>[1];
type ReferralProjection = ReferralPage['data'][number];
type ClinicReferral = {
  id: string;
  sourceEncounterId: string;
  status: 'pending' | 'accepted';
  version: number;
  targetSpecialty: string;
  targetFacilityId?: string;
  targetDoctorId?: string;
  reasonSummary: string;
  encounterType?: string;
  acceptedFieldCodes?: string[];
  resultingAppointmentId?: string;
};
type ReferralListResolution =
  | { kind: 'loading' | 'offline' | 'denied' | 'recoverable'; referrals: [] }
  | { kind: 'stale'; referrals: []; lastUpdatedAt: string }
  | { kind: 'ready'; referrals: ClinicReferral[]; lastUpdatedAt: string };

export type ReferralReviewInput = {
  sourceEncounterId: string;
  sourceEncounterConfirmed: boolean;
  targetSpecialty: string;
  targetFacilityId?: string;
  targetDoctorId?: string;
  reasonSummary: string;
  includeEncounterType: boolean;
  sourceEncounterType: string;
};
type ReferralReview =
  | {
      ok: false;
      errors: Partial<
        Record<keyof ReferralReviewInput, 'required' | 'invalid' | 'confirmation-required'>
      >;
    }
  | { ok: true; request: { encounterId: string; body: CreateReferralRequest } };

/** Builds only a reviewable request; it deliberately has no committed referral identity or status. */
export function prepareReferralReview(input: ReferralReviewInput): ReferralReview {
  const errors: Partial<
    Record<keyof ReferralReviewInput, 'required' | 'invalid' | 'confirmation-required'>
  > = {};
  const encounterId = input.sourceEncounterId.trim();
  if (!encounterId) errors.sourceEncounterId = 'required';
  else if (!isUuid(encounterId)) errors.sourceEncounterId = 'invalid';
  else if (!input.sourceEncounterConfirmed) errors.sourceEncounterId = 'confirmation-required';
  const targetSpecialty = input.targetSpecialty.trim();
  if (!targetSpecialty) errors.targetSpecialty = 'required';
  const reasonSummary = input.reasonSummary.trim();
  if (!reasonSummary) errors.reasonSummary = 'required';
  const targetFacilityId = input.targetFacilityId?.trim();
  if (targetFacilityId && !isUuid(targetFacilityId)) errors.targetFacilityId = 'invalid';
  const targetDoctorId = input.targetDoctorId?.trim();
  if (targetDoctorId && !isUuid(targetDoctorId)) errors.targetDoctorId = 'invalid';
  const encounterType = input.sourceEncounterType.trim();
  if (input.includeEncounterType && !encounterType) errors.sourceEncounterType = 'required';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    request: {
      encounterId,
      body: {
        targetSpecialty,
        reasonSummary,
        ...(targetFacilityId ? { targetFacilityId } : {}),
        ...(targetDoctorId ? { targetDoctorId } : {}),
        ...(input.includeEncounterType ? { encounterType } : {}),
      },
    },
  };
}

/** A clinic worklist accepts source-care projections only and clears content on any uncertain read. */
export function resolveClinicReferralList(input: {
  online: boolean;
  response?: { data: readonly unknown[]; meta: { lastUpdatedAt: string; stale: boolean } };
  error?: 'forbidden' | 'recoverable';
}): ReferralListResolution {
  if (!input.online) return { kind: 'offline', referrals: [] };
  if (input.error === 'forbidden') return { kind: 'denied', referrals: [] };
  if (input.error) return { kind: 'recoverable', referrals: [] };
  if (!input.response) return { kind: 'recoverable', referrals: [] };
  if (input.response.meta.stale)
    return { kind: 'stale', referrals: [], lastUpdatedAt: input.response.meta.lastUpdatedAt };
  const referrals: ClinicReferral[] = [];
  for (const raw of input.response.data) {
    if (!raw || typeof raw !== 'object') continue;
    const projection = raw as Record<string, unknown>;
    // Accepted target projections intentionally omit sourceEncounterId and are not source worklist rows.
    if (
      typeof projection.id !== 'string' ||
      typeof projection.sourceEncounterId !== 'string' ||
      typeof projection.targetSpecialty !== 'string' ||
      typeof projection.reasonSummary !== 'string' ||
      (projection.status !== 'pending' && projection.status !== 'accepted') ||
      typeof projection.version !== 'number' ||
      (projection.status === 'accepted' && typeof projection.resultingAppointmentId !== 'string')
    )
      continue;
    referrals.push({
      id: projection.id,
      sourceEncounterId: projection.sourceEncounterId,
      status: projection.status,
      version: projection.version,
      targetSpecialty: projection.targetSpecialty,
      ...(typeof projection.targetFacilityId === 'string'
        ? { targetFacilityId: projection.targetFacilityId }
        : {}),
      ...(typeof projection.targetDoctorId === 'string'
        ? { targetDoctorId: projection.targetDoctorId }
        : {}),
      reasonSummary: projection.reasonSummary,
      ...(typeof projection.encounterType === 'string'
        ? { encounterType: projection.encounterType }
        : {}),
      ...(Array.isArray(projection.acceptedFieldCodes)
        ? {
            acceptedFieldCodes: projection.acceptedFieldCodes.filter(
              (code): code is string => typeof code === 'string',
            ),
          }
        : {}),
      ...(typeof projection.resultingAppointmentId === 'string'
        ? { resultingAppointmentId: projection.resultingAppointmentId }
        : {}),
    });
  }
  return {
    kind: 'ready',
    referrals,
    lastUpdatedAt: input.response.meta.lastUpdatedAt,
  };
}

export function resolveReferralMutationFailure(
  kind: 'validation' | 'stale' | 'replay' | 'denied' | 'offline',
): { kind: typeof kind; referrals: [] } {
  return { kind, referrals: [] };
}

const words = {
  'ar-EG': {
    language: 'English',
    title: 'الإحالات',
    intro: 'إنشاء إحالات داخلية ومتابعة حالتها المعتمدة من المصدر.',
    loginTitle: 'دخول موظف العيادة',
    loginHelp: 'يلزم سياق موظف مخوّل. لا تُحفظ بيانات الدخول على هذا الجهاز.',
    handle: 'وسيلة الدخول',
    password: 'كلمة المرور',
    next: 'متابعة',
    otp: 'رمز التحقق',
    verify: 'تحقق',
    loginFailure: 'تعذّر التحقق. حاول مجددًا.',
    today: 'عمل اليوم',
    schedule: 'الجدول',
    queue: 'قائمة الانتظار',
    referrals: 'الإحالات',
    create: 'إنشاء إحالة',
    sourceId: 'معرّف الزيارة المصدر',
    sourceConfirm: 'أؤكد أنني راجعت معرّف الزيارة المصدر قبل إنشاء الإحالة.',
    specialty: 'التخصص المستهدف',
    reason: 'ملخص سبب الإحالة',
    targetFacility: 'معرّف المنشأة المستهدفة (اختياري)',
    targetDoctor: 'معرّف الطبيب المستهدف (اختياري)',
    includeType: 'تضمين نوع الزيارة المصدر ضمن المعلومات المقترح مشاركتها بعد موافقة المريض.',
    encounterType: 'نوع الزيارة المصدر',
    disclosure: 'لا تُشارك التفاصيل مع المنشأة المستهدفة إلا بعد تفويض المريض أو ممثله المخوّل.',
    review: 'مراجعة الإحالة',
    reviewTitle: 'مراجعة إحالة داخلية',
    confirm: 'إنشاء إحالة معلّقة',
    back: 'رجوع',
    source: 'الزيارة المصدر',
    required: 'هذا الحقل مطلوب.',
    invalid: 'أدخل معرّفًا صالحًا.',
    confirmRequired: 'أكّد مراجعة الزيارة المصدر أولًا.',
    loading: 'جارٍ تحميل الإحالات من المصدر الموثوق…',
    empty: 'لا توجد إحالات لعرضها.',
    denied: 'لا تملك صلاحية عرض إحالات هذا الفريق.',
    error: 'تعذّر تحديث الإحالات. أعد المحاولة قبل متابعة العمل.',
    retry: 'تحديث الإحالات',
    stale: 'قد تكون بيانات الإحالات قديمة؛ عُرضت البيانات الموثوقة فقط بعد التحديث.',
    offline: 'لا يوجد اتصال. لا تُحفظ الإحالات دون اتصال.',
    createDenied: 'تعذّر تأكيد صلاحية إنشاء الإحالة؛ لا تغييرات معروضة.',
    createValidation: 'تعذّر التحقق من بيانات الإحالة. راجع الحقول وحاول مجددًا.',
    createConflict:
      'تغيّرت حالة الطلب أو استُخدم مفتاح المحاولة سابقًا. حدّث الإحالات قبل إعادة المحاولة.',
    createOffline: 'انقطع الاتصال؛ لم تُحفظ الإحالة محليًا. أعد المحاولة عند عودة الاتصال.',
    createFailure: 'تعذّر إنشاء الإحالة. راجع الحالة الموثوقة قبل المحاولة مجددًا.',
    created: 'تم إرسال طلب الإحالة. تظهر الإحالة في القائمة بعد تأكيد القراءة الموثوقة.',
    createdRefresh: 'نجح الإرسال، لكن تعذّر تحديث القائمة. حدّث الإحالات قبل المتابعة.',
    statusPending: 'معلّقة — بانتظار تفويض المريض أو ممثله المخوّل',
    statusAccepted: 'مقبولة ومربوطة بموعد مؤكد',
    reference: 'معرّف الإحالة',
    sourceEncounter: 'معرّف الزيارة المصدر',
    specialtyLabel: 'التخصص',
    reasonLabel: 'ملخص السبب',
    facilityId: 'معرّف المنشأة المستهدفة',
    doctorId: 'معرّف الطبيب المستهدف',
    appointmentId: 'معرّف الموعد المرتبط',
    version: 'الإصدار',
    lastUpdated: 'آخر تحديث موثوق',
    acceptedFields: 'الحقول التي فُوّضت مشاركتها',
    reasonCode: 'ملخص السبب',
    typeCode: 'نوع الزيارة',
    noAccept: 'الموافقة على الإحالة وحجز الموعد من صلاحية المريض أو ممثله المخوّل.',
  },
  'en-EG': {
    language: 'العربية',
    title: 'Referrals',
    intro: 'Create internal referrals and track their authoritative status.',
    loginTitle: 'Clinic staff sign-in',
    loginHelp:
      'An authorized staff context is required. Credentials are not stored on this device.',
    handle: 'Sign-in handle',
    password: 'Password',
    next: 'Continue',
    otp: 'Verification code',
    verify: 'Verify',
    loginFailure: 'Verification failed. Try again.',
    today: 'Today',
    schedule: 'Schedule',
    queue: 'Queue',
    referrals: 'Referrals',
    create: 'Create referral',
    sourceId: 'Source encounter ID',
    sourceConfirm:
      'I confirm that I reviewed this source encounter ID before creating the referral.',
    specialty: 'Target specialty',
    reason: 'Referral reason summary',
    targetFacility: 'Target facility ID (optional)',
    targetDoctor: 'Target doctor ID (optional)',
    includeType:
      'Include source encounter type among the fields proposed for sharing after patient authorization.',
    encounterType: 'Source encounter type',
    disclosure:
      'Details are shared with the target facility only after the patient or authorized representative explicitly approves them.',
    review: 'Review referral',
    reviewTitle: 'Review internal referral',
    confirm: 'Create pending referral',
    back: 'Back',
    source: 'Source encounter',
    required: 'This field is required.',
    invalid: 'Enter a valid identifier.',
    confirmRequired: 'Confirm that you reviewed the source encounter first.',
    loading: 'Loading referrals from the authoritative source…',
    empty: 'There are no referrals to show.',
    denied: 'You are not authorized to view this team’s referrals.',
    error: 'Referrals could not be refreshed. Retry before continuing.',
    retry: 'Refresh referrals',
    stale: 'Referral data may be outdated; only authoritative refreshed data is shown.',
    offline: 'You are offline. Referrals are never queued for offline creation.',
    createDenied: 'Creation authority could not be confirmed; no change is shown.',
    createValidation: 'Referral details could not be validated. Review the fields and try again.',
    createConflict:
      'The request changed or its retry key was already used. Refresh referrals before retrying.',
    createOffline: 'The connection ended. The referral was not stored locally; retry when online.',
    createFailure:
      'The referral could not be created. Check the authoritative status before retrying.',
    created:
      'Referral submitted. It appears in the list only after an authoritative read confirms it.',
    createdRefresh:
      'Submission succeeded, but the list could not be refreshed. Refresh referrals before continuing.',
    statusPending: 'Pending — awaiting patient or authorized representative approval',
    statusAccepted: 'Accepted and linked to a confirmed appointment',
    reference: 'Referral ID',
    sourceEncounter: 'Source encounter ID',
    specialtyLabel: 'Specialty',
    reasonLabel: 'Reason summary',
    facilityId: 'Target facility ID',
    doctorId: 'Target doctor ID',
    appointmentId: 'Linked appointment ID',
    version: 'Version',
    lastUpdated: 'Last authoritative update',
    acceptedFields: 'Fields authorized for sharing',
    reasonCode: 'Reason summary',
    typeCode: 'Encounter type',
    noAccept:
      'Only the patient or authorized representative can approve a referral and book an appointment.',
  },
} as const;

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: minimumTargetSize,
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  paddingInline: spacing.sm,
  marginBlock: spacing.xs,
  background: color.surface,
  color: color.ink,
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  paddingInline: spacing.md,
  marginBlock: spacing.xs,
  cursor: 'pointer',
};
const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: color.brand,
  color: color.inverse,
};
const cardStyle: React.CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  background: color.surface,
  padding: spacing.lg,
  marginBlockEnd: spacing.md,
};

export function ReferralWorkspace() {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<ReferralListResolution>({ kind: 'loading', referrals: [] });
  const [message, setMessage] = useState('');
  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [sourceEncounterId, setSourceEncounterId] = useState('');
  const [sourceEncounterConfirmed, setSourceEncounterConfirmed] = useState(false);
  const [targetSpecialty, setTargetSpecialty] = useState('');
  const [targetFacilityId, setTargetFacilityId] = useState('');
  const [targetDoctorId, setTargetDoctorId] = useState('');
  const [reasonSummary, setReasonSummary] = useState('');
  const [includeEncounterType, setIncludeEncounterType] = useState(false);
  const [sourceEncounterType, setSourceEncounterType] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ReferralReviewInput, string>>
  >({});
  const [review, setReview] = useState<Extract<ReferralReview, { ok: true }>['request'] | null>(
    null,
  );
  const reviewFocusRef = useRef<HTMLButtonElement | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const retryRef = useRef<{ signature: string; key: string } | null>(null);
  const readGenerationRef = useRef(0);
  const apiBaseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const ar = locale === 'ar-EG';
  const copy = words[locale];
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

  const loadReferrals = useCallback(async (): Promise<ReferralListResolution> => {
    const generation = ++readGenerationRef.current;
    if (!client) return { kind: 'recoverable', referrals: [] };
    const failOffline = (): ReferralListResolution => {
      const result = resolveClinicReferralList({ online: false });
      if (generation === readGenerationRef.current) {
        readGenerationRef.current += 1;
        setOnline(false);
        setList(result);
      }
      return result;
    };
    if (!navigator.onLine) {
      return failOffline();
    }
    setList({ kind: 'loading', referrals: [] });
    try {
      const rows: ReferralProjection[] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      let finalPage: ReferralPage | undefined;
      let staleEncountered = false;
      for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
        const page = await client.listReferrals({ limit: 100, ...(cursor ? { cursor } : {}) });
        finalPage = page;
        staleEncountered ||= page.meta.stale;
        rows.push(...page.data);
        if (!page.meta.nextCursor) break;
        if (cursors.has(page.meta.nextCursor)) throw new Error('referral-cursor-loop');
        cursors.add(page.meta.nextCursor);
        cursor = page.meta.nextCursor;
        if (pageNumber === 19) throw new Error('referral-page-limit');
      }
      if (!finalPage) throw new Error('referral-page-missing');
      if (generation !== readGenerationRef.current) return { kind: 'recoverable', referrals: [] };
      if (!navigator.onLine) return failOffline();
      const result = resolveClinicReferralList({
        online: true,
        response: { data: rows, meta: { ...finalPage.meta, stale: staleEncountered } },
      });
      setList(result);
      return result;
    } catch (error) {
      if (generation !== readGenerationRef.current) return { kind: 'recoverable', referrals: [] };
      if (!navigator.onLine) return failOffline();
      const denied = error instanceof Feature010ApiError && [401, 403, 404].includes(error.status);
      const result = resolveClinicReferralList({
        online: true,
        error: denied ? 'forbidden' : 'recoverable',
      });
      setList(result);
      return result;
    }
  }, [client]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) {
        readGenerationRef.current += 1;
        setList({ kind: 'offline', referrals: [] });
      } else if (client) {
        void loadReferrals();
      }
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      readGenerationRef.current += 1;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [client, loadReferrals]);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const close = () => {
      setDialog(false);
      requestAnimationFrame(() => (reviewFocusRef.current ?? previous)?.focus());
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not([disabled]),[role="dialog"] input:not([disabled]),[role="dialog"] textarea:not([disabled])',
        ),
      );
      if (controls.length === 0) return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog]);

  const signIn = async (verify: boolean) => {
    if (!apiBaseUrl) return;
    setLoginBusy(true);
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
      setLoginBusy(false);
    }
  };

  const prepareReview = () => {
    const result = prepareReferralReview({
      sourceEncounterId,
      sourceEncounterConfirmed,
      targetSpecialty,
      targetFacilityId,
      targetDoctorId,
      reasonSummary,
      includeEncounterType,
      sourceEncounterType,
    });
    if (!result.ok) {
      const errors = result.errors;
      setFieldErrors(
        Object.fromEntries(
          Object.entries(errors).map(([key, value]) => [key, localError(copy, value)]),
        ),
      );
      return;
    }
    setFieldErrors({});
    setReview(result.request);
    setDialog(true);
  };

  const closeReview = () => {
    setDialog(false);
    requestAnimationFrame(() => reviewFocusRef.current?.focus());
  };

  const createReferral = async () => {
    if (!client || !review || busy || !online) return;
    readGenerationRef.current += 1;
    setBusy(true);
    setMessage('');
    setList({ kind: 'loading', referrals: [] });
    const signature = JSON.stringify(review);
    if (!retryRef.current || retryRef.current.signature !== signature)
      retryRef.current = { signature, key: crypto.randomUUID() };
    try {
      const created = await client.createReferral(review.encounterId, review.body, {
        idempotencyKey: retryRef.current.key,
      });
      retryRef.current = null;
      setDialog(false);
      const result = await loadReferrals();
      const found =
        result.kind === 'ready' && result.referrals.some((referral) => referral.id === created.id);
      setMessage(found ? copy.created : copy.createdRefresh);
      setReview(null);
      setCreateFormVisible(false);
      requestAnimationFrame(() => createButtonRef.current?.focus());
    } catch (error) {
      const failure = classifyMutationFailure(error, online);
      const failedMutation = resolveReferralMutationFailure(failure);
      setList(
        failure === 'denied'
          ? { kind: 'denied', referrals: failedMutation.referrals }
          : failure === 'offline'
            ? { kind: 'offline', referrals: failedMutation.referrals }
            : { kind: 'recoverable', referrals: failedMutation.referrals },
      );
      setMessage(
        failure === 'denied'
          ? copy.createDenied
          : failure === 'validation'
            ? copy.createValidation
            : failure === 'stale' || failure === 'replay'
              ? copy.createConflict
              : failure === 'offline'
                ? copy.createOffline
                : copy.createFailure,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        background: color.canvas,
        color: color.ink,
        minHeight: '100vh',
        ...localizedType(locale, 'body'),
        fontFamily: ar ? 'IBM Plex Sans Arabic' : 'Inter',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          padding: spacing.md,
          borderBlockEnd: `1px solid ${color.border}`,
          background: color.surface,
        }}
      >
        <nav
          aria-label={ar ? 'تنقل العيادة' : 'Clinic navigation'}
          style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md }}
        >
          <a
            href="/today"
            style={{
              color: color.brand,
              minHeight: minimumTargetSize,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {copy.today}
          </a>
          <a
            href="/schedule"
            style={{
              color: color.brand,
              minHeight: minimumTargetSize,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {copy.schedule}
          </a>
          <a
            href="/queue"
            style={{
              color: color.brand,
              minHeight: minimumTargetSize,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {copy.queue}
          </a>
          <a
            href="/referrals"
            aria-current="page"
            style={{
              color: color.ink,
              minHeight: minimumTargetSize,
              display: 'inline-flex',
              alignItems: 'center',
              fontWeight: 700,
            }}
          >
            {copy.referrals}
          </a>
        </nav>
        <button style={buttonStyle} onClick={() => setLocale(ar ? 'en-EG' : 'ar-EG')}>
          {copy.language}
        </button>
      </header>
      {token ? (
        <main
          style={{
            width: 'min(100% - 32px, 1440px)',
            marginInline: 'auto',
            paddingBlock: spacing.lg,
          }}
        >
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          {!online && <p role="alert">{copy.offline}</p>}
          {message && (
            <p role="status" aria-live="polite" tabIndex={-1}>
              {message}
            </p>
          )}
          <section
            style={{
              ...cardStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: spacing.md,
            }}
          >
            <div>
              <h2>{copy.referrals}</h2>
              <p>{copy.noAccept}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
              <button
                style={buttonStyle}
                onClick={() => void loadReferrals()}
                disabled={busy || !online}
              >
                {copy.retry}
              </button>
              <button
                style={primaryButtonStyle}
                ref={createButtonRef}
                onClick={() => {
                  setMessage('');
                  setSourceEncounterId('');
                  setSourceEncounterConfirmed(false);
                  setTargetSpecialty('');
                  setTargetFacilityId('');
                  setTargetDoctorId('');
                  setReasonSummary('');
                  setIncludeEncounterType(false);
                  setSourceEncounterType('');
                  setFieldErrors({});
                  setReview(null);
                  setCreateFormVisible(true);
                }}
                disabled={busy || !online}
              >
                {copy.create}
              </button>
            </div>
          </section>
          {createFormVisible && (
            <section style={cardStyle} aria-labelledby="create-referral-heading">
              <h2 id="create-referral-heading">{copy.create}</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  prepareReview();
                }}
                noValidate
              >
                <Field
                  label={copy.sourceId}
                  value={sourceEncounterId}
                  onChange={(value) => {
                    setSourceEncounterId(value);
                    setSourceEncounterConfirmed(false);
                  }}
                  error={fieldErrors.sourceEncounterId}
                  style={fieldStyle}
                  code
                />
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    minHeight: minimumTargetSize,
                    marginBlock: spacing.sm,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sourceEncounterConfirmed}
                    onChange={(event) => setSourceEncounterConfirmed(event.target.checked)}
                  />
                  {copy.sourceConfirm}
                </label>
                <Field
                  label={copy.specialty}
                  value={targetSpecialty}
                  onChange={setTargetSpecialty}
                  error={fieldErrors.targetSpecialty}
                  style={fieldStyle}
                  required
                />
                <Field
                  label={copy.reason}
                  value={reasonSummary}
                  onChange={setReasonSummary}
                  error={fieldErrors.reasonSummary}
                  style={fieldStyle}
                  multiline
                  required
                />
                <Field
                  label={copy.targetFacility}
                  value={targetFacilityId}
                  onChange={setTargetFacilityId}
                  error={fieldErrors.targetFacilityId}
                  style={fieldStyle}
                  code
                />
                <Field
                  label={copy.targetDoctor}
                  value={targetDoctorId}
                  onChange={setTargetDoctorId}
                  error={fieldErrors.targetDoctorId}
                  style={fieldStyle}
                  code
                />
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    minHeight: minimumTargetSize,
                    marginBlock: spacing.sm,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeEncounterType}
                    onChange={(event) => {
                      setIncludeEncounterType(event.target.checked);
                      if (!event.target.checked) setSourceEncounterType('');
                    }}
                  />
                  {copy.includeType}
                </label>
                {includeEncounterType && (
                  <Field
                    label={copy.encounterType}
                    value={sourceEncounterType}
                    onChange={setSourceEncounterType}
                    error={fieldErrors.sourceEncounterType}
                    style={fieldStyle}
                  />
                )}
                <p>{copy.disclosure}</p>
                <button
                  ref={reviewFocusRef}
                  type="submit"
                  style={primaryButtonStyle}
                  disabled={busy || !online}
                >
                  {copy.review}
                </button>
              </form>
            </section>
          )}
          {list.kind === 'loading' && (
            <p role="status" aria-live="polite">
              {copy.loading}
            </p>
          )}
          {list.kind === 'offline' && <p role="alert">{copy.offline}</p>}
          {list.kind === 'denied' && <p role="alert">{copy.denied}</p>}
          {list.kind === 'recoverable' && <p role="alert">{copy.error}</p>}
          {list.kind === 'stale' && (
            <p role="alert">
              {copy.stale} <bdi dir="ltr">{formatDateTime(list.lastUpdatedAt, locale)}</bdi>
            </p>
          )}
          {list.kind === 'ready' && (
            <section aria-labelledby="referral-list-heading">
              <h2 id="referral-list-heading">{copy.referrals}</h2>
              <p>
                {copy.lastUpdated}:{' '}
                <bdi dir="ltr">{formatDateTime(list.lastUpdatedAt, locale)}</bdi>
              </p>
              {list.referrals.length === 0 ? (
                <p>{copy.empty}</p>
              ) : (
                list.referrals.map((referral) => (
                  <ReferralCard key={referral.id} referral={referral} locale={locale} />
                ))
              )}
            </section>
          )}
        </main>
      ) : (
        <main style={{ maxWidth: 560, marginInline: 'auto', padding: spacing.lg }}>
          <h1>{copy.loginTitle}</h1>
          <p>{copy.loginHelp}</p>
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
                style={primaryButtonStyle}
                disabled={!apiBaseUrl || loginBusy || !handle || !password}
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
                style={primaryButtonStyle}
                disabled={!apiBaseUrl || loginBusy || otp.length !== 6}
                onClick={() => void signIn(true)}
              >
                {copy.verify}
              </button>
            </>
          )}
          {!apiBaseUrl && <p role="status">{copy.offline}</p>}
          {loginError && <p role="alert">{copy.loginFailure}</p>}
        </main>
      )}
      {dialog && review && (
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
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            style={{
              ...cardStyle,
              width: 'min(100%, 680px)',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            <h2 id="dialog-title">{copy.reviewTitle}</h2>
            <Row label={copy.source} value={review.encounterId} code />
            <Row label={copy.specialty} value={review.body.targetSpecialty} />
            <Row label={copy.reason} value={review.body.reasonSummary} />
            {review.body.targetFacilityId && (
              <Row label={copy.targetFacility} value={review.body.targetFacilityId} code />
            )}
            {review.body.targetDoctorId && (
              <Row label={copy.targetDoctor} value={review.body.targetDoctorId} code />
            )}
            {review.body.encounterType && (
              <Row label={copy.encounterType} value={review.body.encounterType} />
            )}
            <p>{copy.disclosure}</p>
            {message && (
              <p role="alert" aria-live="assertive">
                {message}
              </p>
            )}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: spacing.sm,
                marginBlockStart: spacing.md,
              }}
            >
              <button style={buttonStyle} onClick={closeReview} disabled={busy}>
                {copy.back}
              </button>
              <button
                style={primaryButtonStyle}
                onClick={() => void createReferral()}
                disabled={busy || !online}
              >
                {copy.confirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  style,
  code = false,
  multiline = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  style: React.CSSProperties;
  code?: boolean;
  multiline?: boolean;
  required?: boolean;
}) {
  const id = React.useId();
  const errorId = `${id}-error`;
  const inputProps = {
    id,
    value,
    required,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
    dir: code ? ('ltr' as const) : undefined,
    style: { ...style, ...(multiline ? { minHeight: 112, paddingBlock: spacing.sm } : {}) },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div style={{ marginBlock: spacing.sm }}>
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...inputProps} /> : <input {...inputProps} />}
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
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
        flexWrap: 'wrap',
      }}
    >
      <span>{label}</span>
      {code ? (
        <bdi dir="ltr" style={{ overflowWrap: 'anywhere' }}>
          {value}
        </bdi>
      ) : (
        <span style={{ overflowWrap: 'anywhere' }}>{value}</span>
      )}
    </div>
  );
}

function ReferralCard({ referral, locale }: { referral: ClinicReferral; locale: Locale }) {
  const copy = words[locale];
  const acceptedCodes = referral.acceptedFieldCodes ?? [];
  return (
    <article style={cardStyle}>
      <h3>{referral.status === 'accepted' ? copy.statusAccepted : copy.statusPending}</h3>
      <Row label={copy.reference} value={referral.id} code />
      <Row label={copy.sourceEncounter} value={referral.sourceEncounterId} code />
      <Row label={copy.specialtyLabel} value={referral.targetSpecialty} />
      <Row label={copy.reasonLabel} value={referral.reasonSummary} />
      {referral.encounterType && <Row label={copy.encounterType} value={referral.encounterType} />}
      {referral.targetFacilityId && (
        <Row label={copy.facilityId} value={referral.targetFacilityId} code />
      )}
      {referral.targetDoctorId && (
        <Row label={copy.doctorId} value={referral.targetDoctorId} code />
      )}
      {referral.status === 'accepted' && referral.resultingAppointmentId && (
        <Row label={copy.appointmentId} value={referral.resultingAppointmentId} code />
      )}
      {referral.status === 'accepted' && (
        <Row
          label={copy.acceptedFields}
          value={acceptedCodes
            .map((code) =>
              code === 'reason_summary'
                ? copy.reasonCode
                : code === 'encounter_type'
                  ? copy.typeCode
                  : '',
            )
            .filter(Boolean)
            .join(', ')}
        />
      )}
      <Row label={copy.version} value={String(referral.version)} code />
    </article>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function localError(copy: (typeof words)[Locale], error: string | undefined) {
  return error === 'confirmation-required'
    ? copy.confirmRequired
    : error === 'invalid'
      ? copy.invalid
      : copy.required;
}
function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
function classifyMutationFailure(
  error: unknown,
  online: boolean,
): 'validation' | 'stale' | 'replay' | 'denied' | 'offline' {
  if (!online || !navigator.onLine) return 'offline';
  if (error instanceof TypeError) return 'offline';
  if (error instanceof Feature010ApiError) {
    if ([401, 403, 404].includes(error.status)) return 'denied';
    if (error.status === 422) return 'validation';
    if (error.status === 409) {
      const code =
        error.problem && typeof error.problem === 'object' && 'code' in error.problem
          ? String((error.problem as { code: unknown }).code)
          : '';
      return code === 'idempotency-key-reused' ? 'replay' : 'stale';
    }
    if (error.status === 412) return 'stale';
  }
  return 'stale';
}
