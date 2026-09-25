'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  color,
  localizedType,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';
import {
  clinicSchedulingApi,
  ClinicSchedulingApiError,
  schedulingFailure,
} from '../../lib/clinic-scheduling-api';

type Locale = 'ar-EG' | 'en-EG';
type Client = ReturnType<typeof clinicSchedulingApi>;
type Schedule = Awaited<ReturnType<Client['createSchedule']>>;
type ScheduleException = Awaited<ReturnType<Client['createScheduleException']>>;
type DelayResult = Awaited<ReturnType<Client['sendDoctorDelay']>>;
type CreateScheduleInput = Parameters<Client['createSchedule']>[1];
type UpdateScheduleInput = Parameters<Client['updateSchedule']>[2];
type Day = { weekday: number; windows: Array<{ start: string; end: string }> };
type Action = 'create' | 'update' | 'exception' | 'delay' | 'absence';

const copy = {
  'ar-EG': {
    title: 'إدارة جدول العيادة',
    scope: 'نطاق المنشأة والطبيب',
    facility: 'معرّف المنشأة',
    doctor: 'معرّف الطبيب',
    schedule: 'الجدول الأسبوعي',
    modeCreate: 'إنشاء جدول',
    modeUpdate: 'تحديث جدول موجود',
    scheduleId: 'معرّف الجدول الحالي',
    version: 'النسخة الحالية من مصدر موثوق',
    versionUnknown:
      'لا توفر العمليات المجمدة قراءة للجدول. أدخل المعرّف والنسخة الحالية من مصدر موثوق؛ لن نعرضهما كبيانات جرى جلبها.',
    timezone: 'منطقة زمنية بصيغة IANA',
    from: 'ساري من (تاريخ ميلادي)',
    to: 'ساري حتى (تاريخ ميلادي، شامل)',
    duration: 'مدة الموعد بالدقائق',
    fee: 'الأجر بوحدة القرش',
    currency: 'العملة ثابتة: جنيه مصري (EGP). الأجر مطلوب ويُحفظ مع نسخة الجدول.',
    status: 'حالة الجدول',
    active: 'نشط',
    paused: 'متوقف مؤقتًا',
    retired: 'متقاعد نهائيًا',
    weekdays: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
    window: 'نافذة محلية',
    start: 'من',
    end: 'إلى',
    addWindow: 'إضافة نافذة',
    weeklyHelp:
      'التكرار أسبوعي بوقت مدني ضمن المنطقة الزمنية المحددة. يبقى وقت الحائط ثابتًا عند تغيّر التوقيت الصيفي؛ لا تُنشأ أوقات محلية غير موجودة ويُستخدم التوقيت الأسبق للوقت الملتبس. يمكن ترك اليوم بلا نوافذ. لا توجد قراءة أو معاينة للجدول على هذه الشاشة.',
    validationTitle: 'راجع الحقول المحددة',
    validationField: 'راجع هذا الحقل.',
    exceptionList: 'آخر استجابة لاستثناء (ليست قائمة مجلوبة)',
    delayLatest: 'آخر استجابة لإعلان التأخير (ليست قراءة للحالة الحالية)',
    interval: 'الفترة',
    versionValue: 'النسخة',
    declaredMinutes: 'دقائق التأخير المعلنة',
    saveCreate: 'إنشاء الجدول',
    saveUpdate: 'إرسال التحديث',
    updateHelp: 'كل الحقول أعلاه هي القيم التي سترسل كتحديث؛ استخدم النسخة الحالية. التقاعد نهائي.',
    ordinary: 'استثناء عادي',
    exceptionType: 'النوع',
    blocked: 'حظر فترة',
    added: 'إتاحة إضافية',
    civilDate: 'التاريخ المدني في المنطقة الزمنية للجدول',
    startsAt: 'البداية (RFC 3339 مع إزاحة زمنية)',
    endsAt: 'النهاية (RFC 3339 مع إزاحة زمنية، غير شاملة)',
    reason: 'السبب التشغيلي المقيد',
    exceptionHelp:
      'الفترة نصف مفتوحة [البداية، النهاية). الحظر والإتاحة الإضافية عمليتان عاديتان فقط؛ التأخير والغياب لهما إجراءان مخصصان. التداخل الإيجابي من النوع نفسه يُرفض، وملامسة الحدود مسموحة.',
    addException: 'إنشاء الاستثناء',
    delay: 'إعلان تأخير الطبيب',
    delayMinutes: 'دقائق التأخير (1–1440)',
    template: 'رمز قالب منشور ومعتمد',
    vendor:
      'لا يوجد قالب Feature 009 منشور في خط الأساس. يلزم رمز قالب معتمد من دورة النشر القائمة، ويتحقق الخادم من أهلية الإرسال. تظل رسائل SMS الإنتاجية معطلة؛ هذه الشاشة لا تدعي التسليم.',
    declareDelay: 'إعلان التأخير',
    absence: 'إعلان غياب الطبيب',
    absenceHelp:
      'يحسب الخادم الأثر الذري. لا تعرض العمليات المتاحة معاينة قبل التنفيذ؛ سيظهر العدد الدقيق فقط من نتيجة الخادم.',
    reviewAbsence: 'مراجعة إعلان الغياب',
    declareAbsence: 'تأكيد إعلان الغياب',
    loading: 'جارٍ إرسال الإجراء…',
    empty: 'لا توجد نتيجة إجراء محملة. لا يعني ذلك عدم وجود جدول؛ لا تتوفر عملية قراءة له.',
    activeView: 'نشط',
    pausedView: 'متوقف مؤقتًا',
    retiredView: 'متقاعد نهائيًا — للعرض فقط',
    stale: 'الحداثة غير مؤكدة. أدخل النسخة الحالية من مصدر موثوق؛ لم تُجر قراءة تلقائية.',
    offline: 'لا يوجد اتصال. الإجراءات غير متاحة ولن تُحفظ للمزامنة.',
    denied: 'ليس لديك صلاحية لهذا النطاق أو الإجراء.',
    rejectedTitle: 'لم يُقبل الطلب',
    conflict:
      'رفض الخادم الإجراء بسبب تعارض أو نسخة قديمة. راجع النطاق والنسخة الحالية ثم أعد المحاولة بإجراء جديد.',
    rejected:
      'لم يقبل الخادم هذا الطلب. راجع الحقول والمعرّفات وأرسل إجراءً مصححًا جديدًا. لا تحدد هذه الاستجابة سبب عدم إتاحة الهدف.',
    recoverable:
      'تعذر تأكيد النتيجة. أعد المحاولة بنفس الطلب ومفتاح منع التكرار قبل بدء إجراء آخر.',
    terminal: 'استجابة الخادم لا تطابق النطاق المطلوب. أوقف الإجراء واطلب مراجعة السياق.',
    error: 'تعذر إكمال الإجراء. راجع المدخلات والاتصال ثم حاول مجددًا.',
    permission: 'سياق موظف مخوّل مطلوب. يتحقق الخادم من الصلاحية والنطاق عند كل إجراء.',
    submit: 'إرسال',
    refresh: 'إعادة تحميل الصفحة لا تجلب جدولًا؛ استخدم معرّفًا ونسخة موثوقين.',
    cancel: 'إلغاء',
    confirmTitle: 'تأكيد إجراء مؤثر',
    retireTitle: 'تأكيد التقاعد النهائي',
    retireWarning: 'سيصبح هذا الجدول نهائيًا للقراءة فقط ولن يمكن إعادة تفعيله.',
    absenceWarning:
      'سيحدد الخادم المواعيد المتأثرة ويحوّل المؤهل منها لإعادة الجدولة ويزيل عناصر الانتظار/المناداة المرتبطة ذريًا. العدد غير معروف قبل التنفيذ.',
    exceptionWarning: 'راجع الفترة والنوع والسبب؛ قد يغيّر هذا الإجراء الإتاحة ضمن نطاق الجدول.',
    delayWarning:
      'يستبدل هذا الإعلان التأخير الحالي ضمن المنشأة والطبيب والتاريخ؛ لا يغيّر وقت الموعد أو ترتيب الانتظار أو الإتاحة.',
    success: 'نتيجة الإجراء',
    reference: 'مرجع النتيجة',
    statusLabel: 'الحالة',
    observed: 'وقت ملاحظة الاستجابة من التطبيق',
    next: 'الخطوة التالية: راجع النتيجة الحالية وتأكد من النسخة قبل أي تحديث لاحق.',
    affected: 'عدد المواعيد المتأثرة حسب النتيجة المعتمدة',
    removed: 'عناصر قائمة الانتظار التي أزيلت حسب النتيجة',
    suggestions: 'اقتراحات بديلة بلا حجز',
    noDelivery: 'لم تثبت هذه النتيجة تسليم إشعار.',
    scheduleRecord: 'آخر نتيجة جدول من الخادم (ليست قراءة حديثة)',
    unknown: 'غير معلوم',
    retry: 'إعادة المحاولة بالطلب نفسه',
    retire: 'تقاعد نهائي',
    conflictState: 'تعارض/نسخة قديمة',
  },
  'en-EG': {
    title: 'Clinic schedule management',
    scope: 'Facility and doctor scope',
    facility: 'Facility ID',
    doctor: 'Doctor ID',
    schedule: 'Weekly schedule',
    modeCreate: 'Create schedule',
    modeUpdate: 'Update existing schedule',
    scheduleId: 'Current schedule ID',
    version: 'Current version from a trusted source',
    versionUnknown:
      'The frozen operations provide no schedule read. Enter the ID and current version from a trusted source; this form will not present them as fetched data.',
    timezone: 'IANA time zone',
    from: 'Valid from (Gregorian date)',
    to: 'Valid through (inclusive Gregorian date)',
    duration: 'Appointment duration in minutes',
    fee: 'Fee in minor units (piastres)',
    currency:
      'Currency is fixed to Egyptian pounds (EGP). A fee is required and stored with the schedule version.',
    status: 'Schedule status',
    active: 'Active',
    paused: 'Paused',
    retired: 'Retired permanently',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    window: 'Local window',
    start: 'From',
    end: 'To',
    addWindow: 'Add window',
    weeklyHelp:
      'Recurrence uses weekly civil time in the selected time zone. Wall-clock time survives daylight-saving changes; nonexistent local times create no slots and ambiguous times use the earlier offset. A day may have no windows. This screen cannot read or preview an existing schedule.',
    validationTitle: 'Review the marked fields',
    validationField: 'Review this field.',
    exceptionList: 'Last exception response (not a fetched list)',
    delayLatest: 'Last doctor-delay response (not a fetched current state)',
    interval: 'Interval',
    versionValue: 'Version',
    declaredMinutes: 'Declared delay minutes',
    saveCreate: 'Create schedule',
    saveUpdate: 'Submit update',
    updateHelp:
      'All fields above are sent as the updated values; use the current version. Retirement is terminal.',
    ordinary: 'Ordinary exception',
    exceptionType: 'Type',
    blocked: 'Blocked interval',
    added: 'Additional availability',
    civilDate: 'Civil date in the schedule time zone',
    startsAt: 'Start (RFC 3339 with offset)',
    endsAt: 'End (RFC 3339 with offset, exclusive)',
    reason: 'Restricted operational reason',
    exceptionHelp:
      'The interval is half-open [start, end). Only blocked and added are ordinary actions; delay and absence use dedicated operations. Positive same-type overlap is rejected; boundary touching is allowed.',
    addException: 'Create exception',
    delay: 'Declare doctor delay',
    delayMinutes: 'Delay minutes (1–1440)',
    template: 'Published, approved template code',
    vendor:
      'No Feature 009 template is published in this baseline. Use a code approved through the existing release process; the server decides notification eligibility. Production SMS remains disabled; this screen never claims delivery.',
    declareDelay: 'Declare delay',
    absence: 'Declare doctor absence',
    absenceHelp:
      'The server calculates the atomic effect. Available operations provide no pre-action preview; the exact count appears only in the server result.',
    reviewAbsence: 'Review absence declaration',
    declareAbsence: 'Confirm absence declaration',
    loading: 'Submitting action…',
    empty:
      'No mutation result is loaded. This does not mean no schedule exists; no schedule read operation is available.',
    activeView: 'Active',
    pausedView: 'Paused',
    retiredView: 'Retired permanently — read only',
    stale:
      'Freshness is unknown. Enter the current version from a trusted source; no automatic read was made.',
    offline: 'You are offline. Actions are unavailable and will not be queued.',
    denied: 'You are not authorized for this scope or action.',
    rejectedTitle: 'Request not accepted',
    conflict:
      'The server rejected the action due to a conflict or stale version. Review the scope and current version, then make a new attempt.',
    rejected:
      'The server did not accept this request. Review the fields and identifiers, then submit a corrected new action. This response does not identify why the target was unavailable.',
    recoverable:
      'The outcome could not be confirmed. Retry the same request with its idempotency key before starting another action.',
    terminal:
      'The server response does not match the requested scope. Stop and request a context review.',
    error: 'The action could not be completed. Review the inputs and connection, then retry.',
    permission:
      'An authorized staff context is required. The server checks permission and scope for every action.',
    submit: 'Submit',
    refresh: 'Reloading this page will not fetch a schedule; use a trusted ID and version.',
    cancel: 'Cancel',
    confirmTitle: 'Confirm consequential action',
    retireTitle: 'Confirm permanent retirement',
    retireWarning: 'This schedule will become permanently read only and cannot be reactivated.',
    absenceWarning:
      'The server will identify affected appointments, move eligible ones to reschedule required, and atomically remove related waiting/called entries. The count is unknown before submission.',
    exceptionWarning:
      'Review the interval, type, and reason; this action can change availability within the schedule scope.',
    delayWarning:
      'This declaration supersedes the current delay for this facility, doctor, and date; it does not change appointment times, queue order, or availability.',
    success: 'Action result',
    reference: 'Result reference',
    statusLabel: 'Status',
    observed: 'Response observed by this app at',
    next: 'Next step: review this result and confirm the version before any later update.',
    affected: 'Affected appointments in authoritative result',
    removed: 'Queue entries removed in authoritative result',
    suggestions: 'Replacement suggestions without holds',
    noDelivery: 'This result does not prove notification delivery.',
    scheduleRecord: 'Last schedule result from server (not a live read)',
    unknown: 'Unknown',
    retry: 'Retry the same request',
    retire: 'Retire permanently',
    conflictState: 'Conflict/stale version',
  },
} as const;

const panel: React.CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  padding: spacing.lg,
  marginBlock: spacing.md,
};
const field: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: minimumTargetSize,
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  paddingInline: spacing.sm,
  background: color.surface,
  color: color.ink,
};
const button: React.CSSProperties = {
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  paddingInline: spacing.md,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
  marginInlineEnd: spacing.sm,
};
const dangerButton: React.CSSProperties = { ...button, borderColor: color.danger };
const choiceLabel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: spacing.sm,
  minHeight: minimumTargetSize,
  paddingInline: spacing.sm,
  cursor: 'pointer',
};
const ltr = (value: string | number) => <bdi dir="ltr">{value}</bdi>;
const blankDays = (): Day[] =>
  Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, windows: [] }));
const parseableInstant = (value: string) =>
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const formatApiLocalTime = (value: string) => {
  if (!/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) return value;
  return `${value.length === 5 ? `${value}:00` : value}Z`;
};
const validRestrictedReason = (value: string) => {
  const trimmed = value.trim();
  return [...trimmed].length > 0 && [...trimmed].length <= 500 && !/[\p{Cc}]/u.test(value);
};
const timeSeconds = (value: string) => {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  return hours < 24 && minutes < 60 && seconds < 60
    ? hours * 3600 + minutes * 60 + seconds
    : Number.NaN;
};
const windowsValid = (days: Day[]) =>
  days.every((day) => {
    const sorted = [...day.windows].sort(
      (left, right) => timeSeconds(left.start) - timeSeconds(right.start),
    );
    return sorted.every((window, index) =>
      Boolean(
        Number.isFinite(timeSeconds(window.start)) &&
          Number.isFinite(timeSeconds(window.end)) &&
          timeSeconds(window.start) < timeSeconds(window.end) &&
          (index === 0 || timeSeconds(sorted[index - 1]!.end) <= timeSeconds(window.start)),
      ),
    );
  });

export function ScheduleWorkspace({
  accessToken,
  locale,
}: {
  accessToken: string;
  locale: Locale;
}) {
  const t = copy[locale];
  const ar = locale === 'ar-EG';
  const [facilityId, setFacilityId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [scheduleId, setScheduleId] = useState('');
  const [version, setVersion] = useState('');
  const [timezone, setTimezone] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [duration, setDuration] = useState('30');
  const [fee, setFee] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'retired'>('active');
  const [days, setDays] = useState<Day[]>(blankDays);
  const [exceptionType, setExceptionType] = useState<'blocked' | 'added'>('blocked');
  const [exceptionDate, setExceptionDate] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [delayDate, setDelayDate] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [absenceDate, setAbsenceDate] = useState('');
  const [absenceStartsAt, setAbsenceStartsAt] = useState('');
  const [absenceEndsAt, setAbsenceEndsAt] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [denied, setDenied] = useState(false);
  const [failure, setFailure] = useState<
    'conflict' | 'rejected' | 'recoverable' | 'terminal' | null
  >(null);
  const [uncertainAction, setUncertainAction] = useState<Action | null>(null);
  const [actionKeys, setActionKeys] = useState<Partial<Record<Action, string>>>({});
  const [knownSchedule, setKnownSchedule] = useState<Schedule | null>(null);
  const [latestException, setLatestException] = useState<Pick<
    ScheduleException,
    'id' | 'type' | 'startsAt' | 'endsAt' | 'civilDate' | 'version' | 'affectedAppointmentCount'
  > | null>(null);
  const [latestDelay, setLatestDelay] = useState<Pick<
    DelayResult,
    'delayId' | 'facilityId' | 'doctorId' | 'civilDate' | 'delayMinutes' | 'version'
  > | null>(null);
  const [result, setResult] = useState<{
    reference: string;
    status: string;
    observed: string;
    affected?: number;
    removed?: number;
    suggestions?: number;
    noDelivery?: boolean;
  } | null>(null);
  const [invalid, setInvalid] = useState<Action | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const actionRequests = useRef<
    Partial<
      Record<
        Action,
        {
          request: (key: string) => Promise<unknown>;
          getReference: (data: unknown) => string;
          onSuccess?: (data: unknown) => void;
        }
      >
    >
  >({});
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const validationSummary = useRef<HTMLElement>(null);
  const failureSummary = useRef<HTMLElement>(null);
  const resultRegion = useRef<HTMLElement>(null);
  const client = process.env['NEXT_PUBLIC_API_BASE_URL']
    ? clinicSchedulingApi(accessToken, locale)
    : null;

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (pending) dialog.current?.querySelector<HTMLButtonElement>('[data-dialog-cancel]')?.focus();
    else {
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
  }, [pending, result]);
  useEffect(() => {
    if (invalid) validationSummary.current?.focus();
    else if (failure || denied) failureSummary.current?.focus();
    else if (result) resultRegion.current?.focus();
  }, [invalid, failure, denied, result]);

  const clearFailure = () => {
    setFailure(null);
    setDenied(false);
    setInvalid(null);
    setInvalidFields([]);
  };
  const markInvalid = (action: Action, fields: string[]) => {
    setInvalid(action);
    setInvalidFields(fields);
    setPending(null);
  };
  const validationLabels: Record<string, string> = {
    facilityId: t.facility,
    doctorId: t.doctor,
    timezone: t.timezone,
    validFrom: t.from,
    validTo: t.to,
    duration: t.duration,
    fee: t.fee,
    windows: t.weekdays.join('، '),
    scheduleId: t.scheduleId,
    updateScheduleId: t.scheduleId,
    exceptionScheduleId: t.scheduleId,
    version: t.version,
    updateVersion: t.version,
    exceptionVersion: t.version,
    exceptionDate: t.civilDate,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    exceptionReason: t.reason,
    delayDate: t.civilDate,
    delayMinutes: t.delayMinutes,
    templateCode: t.template,
    delayReason: t.reason,
    absenceDate: t.civilDate,
    absenceStartsAt: t.startsAt,
    absenceEndsAt: t.endsAt,
    absenceReason: t.reason,
    status: t.statusLabel,
  };
  const scheduleInvalidFields = () => [
    ...(!facilityId ? ['facilityId'] : []),
    ...(!doctorId ? ['doctorId'] : []),
    ...(!timezone.trim() ? ['timezone'] : []),
    ...(!validFrom ? ['validFrom'] : []),
    ...(!validTo || (validFrom && validTo && validFrom > validTo) ? ['validTo'] : []),
    ...(!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 1440
      ? ['duration']
      : []),
    ...(fee === '' || !Number.isInteger(Number(fee)) || Number(fee) < 0 ? ['fee'] : []),
    ...(days.reduce((count, day) => count + day.windows.length, 0) < 1 ||
    days.reduce((count, day) => count + day.windows.length, 0) > 70 ||
    !windowsValid(days)
      ? ['windows']
      : []),
    ...(mode === 'update' && !scheduleId ? ['updateScheduleId'] : []),
    ...(mode === 'update' && (!Number.isInteger(Number(version)) || Number(version) < 1)
      ? ['updateVersion']
      : []),
    ...(mode === 'create' && status === 'retired' ? ['status'] : []),
  ];
  const invalidFieldsFor = (action: Action) => {
    if (action === 'create' || action === 'update') return scheduleInvalidFields();
    if (action === 'exception')
      return [
        ...(!scheduleId ? ['exceptionScheduleId'] : []),
        ...(!Number.isInteger(Number(version)) || Number(version) < 1 ? ['exceptionVersion'] : []),
        ...(!exceptionDate ? ['exceptionDate'] : []),
        ...(!parseableInstant(startsAt) ? ['startsAt'] : []),
        ...(!parseableInstant(endsAt) ||
        (parseableInstant(startsAt) &&
          parseableInstant(endsAt) &&
          Date.parse(startsAt) >= Date.parse(endsAt))
          ? ['endsAt']
          : []),
        ...(!validRestrictedReason(exceptionReason) ? ['exceptionReason'] : []),
      ];
    if (action === 'delay')
      return [
        ...(!facilityId ? ['facilityId'] : []),
        ...(!doctorId ? ['doctorId'] : []),
        ...(!delayDate ? ['delayDate'] : []),
        ...(!Number.isInteger(Number(delayMinutes)) ||
        Number(delayMinutes) < 1 ||
        Number(delayMinutes) > 1440
          ? ['delayMinutes']
          : []),
        ...(!templateCode.trim() ||
        [...templateCode.trim()].length > 120 ||
        /[\p{Cc}]/u.test(templateCode)
          ? ['templateCode']
          : []),
        ...(!validRestrictedReason(delayReason) ? ['delayReason'] : []),
      ];
    return [
      ...(!facilityId ? ['facilityId'] : []),
      ...(!doctorId ? ['doctorId'] : []),
      ...(!absenceDate ? ['absenceDate'] : []),
      ...(!parseableInstant(absenceStartsAt) ? ['absenceStartsAt'] : []),
      ...(!parseableInstant(absenceEndsAt) ||
      (parseableInstant(absenceStartsAt) &&
        parseableInstant(absenceEndsAt) &&
        Date.parse(absenceStartsAt) >= Date.parse(absenceEndsAt))
        ? ['absenceEndsAt']
        : []),
      ...(!validRestrictedReason(absenceReason) ? ['absenceReason'] : []),
    ];
  };
  const describedBy = (key: string) =>
    invalidFields.includes(key) ? 'validation-summary' : undefined;
  const invalidAttr = (key: string) => (invalidFields.includes(key) ? true : undefined);
  const scheduleIsRetiredInScope = Boolean(
    knownSchedule?.status === 'retired' &&
      knownSchedule.id === scheduleId &&
      knownSchedule.facilityId === facilityId &&
      knownSchedule.doctorId === doctorId,
  );
  const mutation = async <T,>(
    action: Action,
    request: (key: string) => Promise<T>,
    getReference: (data: T) => string,
    onSuccess?: (data: T) => void,
  ) => {
    if (!client || offline || busy) return;
    clearFailure();
    const existingKey = actionKeys[action];
    const key = existingKey ?? crypto.randomUUID();
    if (!existingKey)
      actionRequests.current[action] = {
        request,
        getReference: getReference as (data: unknown) => string,
        ...(onSuccess ? { onSuccess: onSuccess as (data: unknown) => void } : {}),
      };
    setActionKeys((previous) => ({ ...previous, [action]: key }));
    setBusy(true);
    setResult(null);
    setUncertainAction(null);
    try {
      const savedOperation = actionRequests.current[action];
      const data = (await (savedOperation?.request ?? request)(key)) as T;
      const reference = (savedOperation?.getReference ?? getReference)(data);
      if (!reference) {
        setFailure('terminal');
        delete actionRequests.current[action];
        setActionKeys((previous) => {
          const next = { ...previous };
          delete next[action];
          return next;
        });
        setPending(null);
        return;
      }
      const now = new Date().toISOString();
      const resultData = data as {
        affectedAppointmentIds?: string[];
        affectedAppointmentCount?: number;
        removedQueueEntryIds?: string[];
        replacementSuggestions?: Array<{ slots?: unknown[] }>;
      };
      setResult({
        reference,
        status: 'accepted',
        observed: now,
        ...(resultData.affectedAppointmentIds
          ? { affected: resultData.affectedAppointmentIds.length }
          : resultData.affectedAppointmentCount !== undefined
            ? { affected: resultData.affectedAppointmentCount }
            : {}),
        ...(resultData.removedQueueEntryIds
          ? { removed: resultData.removedQueueEntryIds.length }
          : {}),
        ...(resultData.replacementSuggestions
          ? {
              suggestions: resultData.replacementSuggestions.reduce(
                (count, item) => count + (item.slots?.length ?? 0),
                0,
              ),
            }
          : {}),
        ...(action === 'delay' || action === 'absence' ? { noDelivery: true } : {}),
      });
      setActionKeys((previous) => {
        const next = { ...previous };
        delete next[action];
        return next;
      });
      delete actionRequests.current[action];
      setPending(null);
      (savedOperation?.onSuccess ?? onSuccess)?.(data);
    } catch (error) {
      const kind = schedulingFailure(error);
      if (kind === 'denied') {
        setDenied(true);
        setActionKeys((previous) => {
          const next = { ...previous };
          delete next[action];
          return next;
        });
        delete actionRequests.current[action];
      } else if (kind === 'conflict') {
        setFailure('conflict');
        setActionKeys((previous) => {
          const next = { ...previous };
          delete next[action];
          return next;
        });
        delete actionRequests.current[action];
        setPending(null);
      } else if (
        kind === 'missing' ||
        (error instanceof ClinicSchedulingApiError && error.status === 400)
      ) {
        setFailure('rejected');
        setUncertainAction(null);
        setActionKeys((previous) => {
          const next = { ...previous };
          delete next[action];
          return next;
        });
        delete actionRequests.current[action];
        setPending(null);
      } else {
        setFailure('recoverable');
        setUncertainAction(action);
      }
    } finally {
      setBusy(false);
    }
  };

  const formSchedule = (): CreateScheduleInput => ({
    doctorId,
    timezone,
    validFrom,
    validTo,
    slotDurationMinutes: Number(duration),
    feeMinorUnits: Number(fee),
    status,
    windows: days.flatMap((day) =>
      day.windows.map((item) => ({
        isoWeekday: day.weekday,
        localStart: formatApiLocalTime(item.start),
        localEnd: formatApiLocalTime(item.end),
      })),
    ),
  });
  const validScheduleForm = () => scheduleInvalidFields().length === 0;
  const submitSchedule = async (operation: 'create' | 'update' = mode, retrying = false) => {
    if (!client || (!retrying && !validScheduleForm())) {
      if (!retrying) markInvalid(operation, scheduleInvalidFields());
      return;
    }
    const body = formSchedule();
    if (operation === 'create') {
      await mutation(
        'create',
        (key) => client.createSchedule(facilityId, body, key),
        (data) => {
          const schedule = data as Schedule;
          if (schedule.facilityId !== facilityId || schedule.doctorId !== doctorId || !schedule.id)
            return '';
          return schedule.id;
        },
        (data) => {
          const schedule = data as Schedule;
          setKnownSchedule(schedule);
          setScheduleId(schedule.id);
          setVersion(String(schedule.version));
        },
      );
    } else {
      const update: UpdateScheduleInput = body;
      await mutation(
        'update',
        (key) => client.updateSchedule(facilityId, scheduleId, update, Number(version), key),
        (data) => {
          const schedule = data as Schedule;
          if (
            schedule.facilityId !== facilityId ||
            schedule.doctorId !== doctorId ||
            schedule.id !== scheduleId
          )
            return '';
          return schedule.id;
        },
        (data) => {
          const schedule = data as Schedule;
          setKnownSchedule(schedule);
          setVersion(String(schedule.version));
          setStatus(schedule.status);
        },
      );
    }
  };
  const confirmMutation = async (requestedAction?: Action, retrying = false) => {
    if (!client || (!pending && !requestedAction)) return;
    const action = requestedAction ?? pending;
    if (action === 'update' && status === 'retired' && !scheduleIsRetiredInScope) {
      const result = await mutation(
        'update',
        (key) =>
          client.updateSchedule(
            facilityId,
            scheduleId,
            { status: 'retired' },
            Number(version),
            key,
          ),
        (data) => {
          const schedule = data as Schedule;
          if (
            schedule.facilityId !== facilityId ||
            schedule.doctorId !== doctorId ||
            schedule.id !== scheduleId ||
            schedule.status !== 'retired'
          )
            return '';
          return schedule.id;
        },
        (data) => {
          const schedule = data as Schedule;
          setKnownSchedule(schedule);
          setVersion(String(schedule.version));
        },
      );
      return result;
    }
    if (action === 'exception') {
      const fields = retrying ? [] : invalidFieldsFor(action);
      if (fields.length) {
        markInvalid(action, fields);
        return;
      }
      await mutation(
        'exception',
        (key) =>
          client.createScheduleException(
            facilityId,
            scheduleId,
            {
              type: exceptionType,
              startsAt,
              endsAt,
              civilDate: exceptionDate,
              reason: exceptionReason.trim(),
            },
            Number(version),
            key,
          ),
        (data) => (data as { id?: string }).id ?? '',
        (data) => {
          const item = data as ScheduleException;
          setLatestException({
            id: item.id,
            type: item.type,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            civilDate: item.civilDate,
            version: item.version,
            ...(item.affectedAppointmentCount === undefined
              ? {}
              : { affectedAppointmentCount: item.affectedAppointmentCount }),
          });
        },
      );
      return;
    }
    if (action === 'delay') {
      const fields = retrying ? [] : invalidFieldsFor(action);
      if (fields.length) {
        markInvalid(action, fields);
        return;
      }
      await mutation(
        'delay',
        (key) =>
          client.sendDoctorDelay(
            facilityId,
            doctorId,
            {
              civilDate: delayDate,
              delayMinutes: Number(delayMinutes),
              templateCode: templateCode.trim(),
              reason: delayReason.trim(),
            },
            key,
          ),
        (data) => (data as { delayId?: string }).delayId ?? '',
        (data) => {
          const item = data as DelayResult;
          setLatestDelay({
            delayId: item.delayId,
            facilityId: item.facilityId,
            doctorId: item.doctorId,
            civilDate: item.civilDate,
            delayMinutes: item.delayMinutes,
            version: item.version,
          });
        },
      );
      return;
    }
    if (action === 'absence') {
      const fields = retrying ? [] : invalidFieldsFor(action);
      if (fields.length) {
        markInvalid(action, fields);
        return;
      }
      await mutation(
        'absence',
        (key) =>
          client.declareDoctorAbsence(
            facilityId,
            doctorId,
            {
              startsAt: absenceStartsAt,
              endsAt: absenceEndsAt,
              civilDate: absenceDate,
              reason: absenceReason.trim(),
            },
            key,
          ),
        (data) => (data as { absenceId?: string }).absenceId ?? '',
      );
    }
  };

  const ask = (action: Action, buttonElement?: HTMLButtonElement | null) => {
    clearFailure();
    setUncertainAction(null);
    const fields =
      action === 'update' && status === 'retired'
        ? [
            ...(!facilityId ? ['facilityId'] : []),
            ...(!doctorId ? ['doctorId'] : []),
            ...(!scheduleId ? ['updateScheduleId'] : []),
            ...(!Number.isInteger(Number(version)) || Number(version) < 1 ? ['updateVersion'] : []),
          ]
        : invalidFieldsFor(action);
    if (fields.length) {
      markInvalid(action, fields);
      return;
    }
    setPending(action);
    returnFocus.current = buttonElement ?? null;
  };
  const retrySame = () => {
    const action = uncertainAction;
    if (!action) return;
    setFailure(null);
    setUncertainAction(null);
    if (action === 'create' || action === 'update') void submitSchedule(action, true);
    else void confirmMutation(action, true);
  };
  const canSubmit = Boolean(client && !offline && !busy && !uncertainAction);
  const canMutateThisSchedule = canSubmit && !scheduleIsRetiredInScope;

  return (
    <main
      lang={locale}
      dir={ar ? 'rtl' : 'ltr'}
      style={{
        maxWidth: 1200,
        marginInline: 'auto',
        padding: spacing.lg,
        ...localizedType(locale, 'body'),
        lineHeight: `${localizedType(locale, 'body').lineHeight}px`,
        fontFamily: locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter',
      }}
    >
      <h1 ref={heading} tabIndex={-1}>
        {t.title}
      </h1>
      <p>{t.permission}</p>
      <section aria-labelledby="scope-heading" style={panel}>
        <h2 id="scope-heading">{t.scope}</h2>
        <label>
          {t.facility}
          <input
            id="facilityId"
            aria-invalid={invalidAttr('facilityId')}
            aria-describedby={describedBy('facilityId')}
            style={field}
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            autoComplete="off"
            dir="ltr"
          />
        </label>
        <label>
          {t.doctor}
          <input
            id="doctorId"
            aria-invalid={invalidAttr('doctorId')}
            aria-describedby={describedBy('doctorId')}
            style={field}
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            autoComplete="off"
            dir="ltr"
          />
        </label>
      </section>

      <p role="status" aria-live="polite">
        {offline ? t.offline : !client ? t.permission : t.stale}
      </p>
      {(failure || denied) && (
        <section
          ref={failureSummary}
          id="failure-summary"
          role="alert"
          aria-labelledby="failure-heading"
          tabIndex={-1}
          style={panel}
        >
          <h2 id="failure-heading">
            {failure === 'conflict'
              ? t.conflictState
              : failure === 'rejected'
                ? t.rejectedTitle
                : failure === 'terminal'
                  ? t.terminal
                  : denied
                    ? t.denied
                    : t.error}
          </h2>
          <p>
            {failure === 'conflict'
              ? t.conflict
              : failure === 'rejected'
                ? t.rejected
                : failure === 'terminal'
                  ? t.terminal
                  : denied
                    ? t.denied
                    : t.recoverable}
          </p>
        </section>
      )}
      {invalid && (
        <section
          ref={validationSummary}
          id="validation-summary"
          role="alert"
          aria-labelledby="validation-heading"
          tabIndex={-1}
          style={panel}
        >
          <h2 id="validation-heading">{t.validationTitle}</h2>
          <ul>
            {invalidFields.map((key) => (
              <li key={key}>
                <a href={`#${key}`}>{validationLabels[key] ?? key}</a>: {t.validationField}
              </li>
            ))}
          </ul>
        </section>
      )}
      {failure === 'recoverable' && uncertainAction && (
        <button style={button} disabled={offline || busy} onClick={retrySame}>
          {t.retry}
        </button>
      )}

      <section aria-labelledby="schedule-heading" style={panel}>
        <h2 id="schedule-heading">{t.schedule}</h2>
        <fieldset>
          <legend>{t.schedule}</legend>
          <label style={choiceLabel}>
            <input
              type="radio"
              name="mode"
              checked={mode === 'create'}
              onChange={() => {
                setMode('create');
                clearFailure();
              }}
            />{' '}
            {t.modeCreate}
          </label>
          <label style={choiceLabel}>
            <input
              type="radio"
              name="mode"
              checked={mode === 'update'}
              onChange={() => {
                setMode('update');
                clearFailure();
              }}
            />{' '}
            {t.modeUpdate}
          </label>
        </fieldset>
        {mode === 'update' && (
          <>
            <p>{t.versionUnknown}</p>
            <label>
              {t.scheduleId}
              <input
                id="updateScheduleId"
                aria-invalid={invalidAttr('updateScheduleId')}
                aria-describedby={describedBy('updateScheduleId')}
                style={field}
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </label>
            <label>
              {t.version}
              <input
                id="updateVersion"
                aria-invalid={invalidAttr('updateVersion')}
                aria-describedby={describedBy('updateVersion')}
                style={field}
                type="number"
                min="1"
                step="1"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                dir="ltr"
              />
            </label>
          </>
        )}
        <label>
          {t.timezone}
          <input
            id="timezone"
            aria-invalid={invalidAttr('timezone')}
            aria-describedby={describedBy('timezone')}
            style={field}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Africa/Cairo"
            dir="ltr"
          />
        </label>
        <label>
          {t.from}
          <input
            id="validFrom"
            aria-invalid={invalidAttr('validFrom')}
            aria-describedby={describedBy('validFrom')}
            style={field}
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </label>
        <label>
          {t.to}
          <input
            id="validTo"
            aria-invalid={invalidAttr('validTo')}
            aria-describedby={describedBy('validTo')}
            style={field}
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
        </label>
        <label>
          {t.duration}
          <input
            id="duration"
            aria-invalid={invalidAttr('duration')}
            aria-describedby={describedBy('duration')}
            style={field}
            type="number"
            min="1"
            max="1440"
            step="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        <label>
          {t.fee}
          <input
            id="fee"
            aria-invalid={invalidAttr('fee')}
            aria-describedby={describedBy('fee')}
            style={field}
            type="number"
            min="0"
            step="1"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </label>
        <p>{t.currency}</p>
        <label>
          {t.statusLabel}
          <select
            id="status"
            aria-invalid={invalidAttr('status')}
            aria-describedby={describedBy('status')}
            style={field}
            value={status}
            disabled={scheduleIsRetiredInScope}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="active">{t.active}</option>
            <option value="paused">{t.paused}</option>
            <option value="retired" disabled={mode === 'create'}>
              {t.retired}
            </option>
          </select>
        </label>
        <h3 id="windows" tabIndex={-1}>
          {ar ? 'أيام الأسبوع والنوافذ المدنية' : 'Weekdays and civil-time windows'}
        </h3>
        <p>{t.weeklyHelp}</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: spacing.md,
          }}
        >
          {days.map((day) => (
            <fieldset
              key={day.weekday}
              aria-invalid={invalidAttr('windows')}
              aria-describedby={describedBy('windows')}
              style={{
                border: `1px solid ${color.border}`,
                borderRadius: radius.control,
                padding: spacing.md,
              }}
            >
              <legend>{t.weekdays[day.weekday - 1]}</legend>
              {day.windows.map((window, index) => (
                <div key={`${day.weekday}-${index}`}>
                  <p>
                    {t.window} {index + 1}
                  </p>
                  <label>
                    {t.start}
                    <input
                      id={`window-${day.weekday}-${index}-start`}
                      aria-invalid={invalidAttr('windows')}
                      aria-describedby={describedBy('windows')}
                      style={field}
                      type="time"
                      value={window.start}
                      onChange={(e) =>
                        setDays((old) =>
                          old.map((item) =>
                            item.weekday === day.weekday
                              ? {
                                  ...item,
                                  windows: item.windows.map((w, i) =>
                                    i === index ? { ...w, start: e.target.value } : w,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {t.end}
                    <input
                      id={`window-${day.weekday}-${index}-end`}
                      aria-invalid={invalidAttr('windows')}
                      aria-describedby={describedBy('windows')}
                      style={field}
                      type="time"
                      value={window.end}
                      onChange={(e) =>
                        setDays((old) =>
                          old.map((item) =>
                            item.weekday === day.weekday
                              ? {
                                  ...item,
                                  windows: item.windows.map((w, i) =>
                                    i === index ? { ...w, end: e.target.value } : w,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    style={button}
                    onClick={() =>
                      setDays((old) =>
                        old.map((item) =>
                          item.weekday === day.weekday
                            ? { ...item, windows: item.windows.filter((_, i) => i !== index) }
                            : item,
                        ),
                      )
                    }
                  >
                    {ar ? 'حذف النافذة' : 'Remove window'}
                  </button>
                </div>
              ))}
              <button
                type="button"
                style={button}
                disabled={days.reduce((count, item) => count + item.windows.length, 0) >= 70}
                onClick={() =>
                  setDays((old) =>
                    old.map((item) =>
                      item.weekday === day.weekday
                        ? { ...item, windows: [...item.windows, { start: '', end: '' }] }
                        : item,
                    ),
                  )
                }
              >
                {t.addWindow}
              </button>
            </fieldset>
          ))}
        </div>
        {mode === 'create' ? (
          <button
            style={button}
            disabled={!canSubmit}
            onClick={() => {
              if (!validScheduleForm()) {
                markInvalid('create', scheduleInvalidFields());
                return;
              }
              void submitSchedule();
            }}
          >
            {t.saveCreate}
          </button>
        ) : (
          <>
            <p>{t.updateHelp}</p>
            <button
              style={button}
              disabled={!canMutateThisSchedule}
              onClick={(event) =>
                status === 'retired' && !scheduleIsRetiredInScope
                  ? ask('update', event.currentTarget)
                  : validScheduleForm()
                    ? void submitSchedule()
                    : markInvalid('update', scheduleInvalidFields())
              }
            >
              {status === 'retired' ? t.retire : t.saveUpdate}
            </button>
          </>
        )}
      </section>

      <section aria-labelledby="exception-heading" style={panel}>
        <h2 id="exception-heading">{t.ordinary}</h2>
        <p>{t.exceptionHelp}</p>
        <label>
          {t.scheduleId}
          <input
            id="exceptionScheduleId"
            aria-invalid={invalidAttr('exceptionScheduleId')}
            aria-describedby={describedBy('exceptionScheduleId')}
            style={field}
            value={scheduleId}
            onChange={(e) => setScheduleId(e.target.value)}
            dir="ltr"
          />
        </label>
        <label>
          {t.version}
          <input
            id="exceptionVersion"
            aria-invalid={invalidAttr('exceptionVersion')}
            aria-describedby={describedBy('exceptionVersion')}
            style={field}
            type="number"
            min="1"
            step="1"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            dir="ltr"
          />
        </label>
        <label>
          {t.exceptionType}
          <select
            style={field}
            value={exceptionType}
            onChange={(e) => setExceptionType(e.target.value as 'blocked' | 'added')}
          >
            <option value="blocked">{t.blocked}</option>
            <option value="added">{t.added}</option>
          </select>
        </label>
        <label>
          {t.civilDate}
          <input
            id="exceptionDate"
            aria-invalid={invalidAttr('exceptionDate')}
            aria-describedby={describedBy('exceptionDate')}
            style={field}
            type="date"
            value={exceptionDate}
            onChange={(e) => setExceptionDate(e.target.value)}
          />
        </label>
        <label>
          {t.startsAt}
          <input
            id="startsAt"
            aria-invalid={invalidAttr('startsAt')}
            aria-describedby={describedBy('startsAt')}
            style={field}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            dir="ltr"
            placeholder="2026-09-24T09:00:00+03:00"
          />
        </label>
        <label>
          {t.endsAt}
          <input
            id="endsAt"
            aria-invalid={invalidAttr('endsAt')}
            aria-describedby={describedBy('endsAt')}
            style={field}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            dir="ltr"
            placeholder="2026-09-24T10:00:00+03:00"
          />
        </label>
        <label>
          {t.reason}
          <textarea
            id="exceptionReason"
            aria-invalid={invalidAttr('exceptionReason')}
            aria-describedby={describedBy('exceptionReason')}
            style={{ ...field, minHeight: 96 }}
            maxLength={1000}
            value={exceptionReason}
            onChange={(e) => setExceptionReason(e.target.value)}
          />
        </label>
        <button
          style={button}
          disabled={!canMutateThisSchedule || !scheduleId || !version}
          onClick={(event) => ask('exception', event.currentTarget)}
        >
          {t.addException}
        </button>
      </section>

      <section aria-labelledby="delay-heading" style={panel}>
        <h2 id="delay-heading">{t.delay}</h2>
        <p>{t.delayWarning}</p>
        <p>{t.vendor}</p>
        <label>
          {t.civilDate}
          <input
            id="delayDate"
            aria-invalid={invalidAttr('delayDate')}
            aria-describedby={describedBy('delayDate')}
            style={field}
            type="date"
            value={delayDate}
            onChange={(e) => setDelayDate(e.target.value)}
          />
        </label>
        <label>
          {t.delayMinutes}
          <input
            id="delayMinutes"
            aria-invalid={invalidAttr('delayMinutes')}
            aria-describedby={describedBy('delayMinutes')}
            style={field}
            type="number"
            min="1"
            max="1440"
            step="1"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(e.target.value)}
          />
        </label>
        <label>
          {t.template}
          <input
            id="templateCode"
            aria-invalid={invalidAttr('templateCode')}
            aria-describedby={describedBy('templateCode')}
            style={field}
            maxLength={240}
            value={templateCode}
            onChange={(e) => setTemplateCode(e.target.value)}
            dir="ltr"
          />
        </label>
        <label>
          {t.reason}
          <textarea
            id="delayReason"
            aria-invalid={invalidAttr('delayReason')}
            aria-describedby={describedBy('delayReason')}
            style={{ ...field, minHeight: 96 }}
            maxLength={1000}
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
          />
        </label>
        <button
          style={button}
          disabled={!canSubmit}
          onClick={(event) => ask('delay', event.currentTarget)}
        >
          {t.declareDelay}
        </button>
      </section>

      <section aria-labelledby="absence-heading" style={panel}>
        <h2 id="absence-heading">{t.absence}</h2>
        <p>{t.absenceHelp}</p>
        <p>{t.absenceWarning}</p>
        <label>
          {t.civilDate}
          <input
            id="absenceDate"
            aria-invalid={invalidAttr('absenceDate')}
            aria-describedby={describedBy('absenceDate')}
            style={field}
            type="date"
            value={absenceDate}
            onChange={(e) => setAbsenceDate(e.target.value)}
          />
        </label>
        <label>
          {t.startsAt}
          <input
            id="absenceStartsAt"
            aria-invalid={invalidAttr('absenceStartsAt')}
            aria-describedby={describedBy('absenceStartsAt')}
            style={field}
            value={absenceStartsAt}
            onChange={(e) => setAbsenceStartsAt(e.target.value)}
            dir="ltr"
            placeholder="2026-09-24T09:00:00+03:00"
          />
        </label>
        <label>
          {t.endsAt}
          <input
            id="absenceEndsAt"
            aria-invalid={invalidAttr('absenceEndsAt')}
            aria-describedby={describedBy('absenceEndsAt')}
            style={field}
            value={absenceEndsAt}
            onChange={(e) => setAbsenceEndsAt(e.target.value)}
            dir="ltr"
            placeholder="2026-09-24T15:00:00+03:00"
          />
        </label>
        <label>
          {t.reason}
          <textarea
            id="absenceReason"
            aria-invalid={invalidAttr('absenceReason')}
            aria-describedby={describedBy('absenceReason')}
            style={{ ...field, minHeight: 96 }}
            maxLength={1000}
            value={absenceReason}
            onChange={(e) => setAbsenceReason(e.target.value)}
          />
        </label>
        <button
          style={dangerButton}
          disabled={!canSubmit}
          onClick={(event) => ask('absence', event.currentTarget)}
        >
          {t.reviewAbsence}
        </button>
      </section>

      {pending && (
        <section
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-copy"
          style={{ ...panel, borderColor: color.warning }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              setPending(null);
              return;
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(
              dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
            );
            if (!controls.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <h2 id="confirm-title">{pending === 'update' ? t.retireTitle : t.confirmTitle}</h2>
          <p id="confirm-copy">
            {pending === 'update'
              ? t.retireWarning
              : pending === 'absence'
                ? t.absenceWarning
                : pending === 'delay'
                  ? t.delayWarning
                  : t.exceptionWarning}
          </p>
          <p>
            {t.facility}: {ltr(facilityId)}
          </p>
          <p>
            {t.doctor}: {ltr(doctorId)}
          </p>
          {pending === 'update' ? (
            <p>
              {t.scheduleId}: {ltr(scheduleId)}
            </p>
          ) : (
            <p>
              {t.civilDate}:{' '}
              {ltr(
                pending === 'absence'
                  ? absenceDate
                  : pending === 'delay'
                    ? delayDate
                    : exceptionDate,
              )}
            </p>
          )}
          {pending === 'exception' && (
            <p>
              {t.interval}:{' '}
              <bdi dir="ltr">
                {startsAt} – {endsAt}
              </bdi>
            </p>
          )}
          <button style={button} disabled={busy || offline} onClick={() => void confirmMutation()}>
            {pending === 'absence' ? t.declareAbsence : pending === 'update' ? t.retire : t.submit}
          </button>
          <button
            data-dialog-cancel="true"
            style={button}
            disabled={busy}
            onClick={() => setPending(null)}
          >
            {t.cancel}
          </button>
        </section>
      )}

      {busy && (
        <p role="status" aria-live="polite">
          {t.loading}
        </p>
      )}
      {result && !pending && (
        <section
          ref={resultRegion}
          tabIndex={-1}
          aria-labelledby="result-heading"
          aria-live="polite"
          style={panel}
        >
          <h2 id="result-heading">{t.success}</h2>
          <p>
            {t.statusLabel}: {result.status}
          </p>
          <p>
            {t.reference}: {ltr(result.reference)}
          </p>
          <p>
            {t.observed}: <time dir="ltr">{result.observed}</time>
          </p>
          {result.affected !== undefined && (
            <p>
              {t.affected}: {ltr(result.affected)}
            </p>
          )}
          {result.removed !== undefined && (
            <p>
              {t.removed}: {ltr(result.removed)}
            </p>
          )}
          {result.suggestions !== undefined && (
            <p>
              {t.suggestions}: {ltr(result.suggestions)}
            </p>
          )}
          {result.noDelivery && <p>{t.noDelivery}</p>}
          <p>{t.next}</p>
        </section>
      )}
      {knownSchedule && (
        <section aria-labelledby="last-result-heading" style={panel}>
          <h2 id="last-result-heading">{t.scheduleRecord}</h2>
          <p>
            {t.statusLabel}:{' '}
            {knownSchedule.status === 'active'
              ? t.activeView
              : knownSchedule.status === 'paused'
                ? t.pausedView
                : t.retiredView}
          </p>
          <p>
            {t.scheduleId}: {ltr(knownSchedule.id)}
          </p>
          <p>
            {t.version}: {ltr(knownSchedule.version)}
          </p>
          {knownSchedule.status === 'retired' && <p>{t.retiredView}</p>}
        </section>
      )}
      {latestException && (
        <section aria-labelledby="exception-result-heading" style={panel}>
          <h2 id="exception-result-heading">{t.exceptionList}</h2>
          <p>
            {ar
              ? latestException.type === 'blocked'
                ? t.blocked
                : t.added
              : latestException.type === 'blocked'
                ? t.blocked
                : t.added}
          </p>
          <p>
            {t.civilDate}: {ltr(latestException.civilDate)}
          </p>
          <p>
            {t.interval}:{' '}
            <bdi dir="ltr">
              {latestException.startsAt} – {latestException.endsAt}
            </bdi>
          </p>
          <p>
            {t.versionValue}: {ltr(latestException.version)}
          </p>
          {latestException.affectedAppointmentCount !== undefined && (
            <p>
              {t.affected}: {ltr(latestException.affectedAppointmentCount)}
            </p>
          )}
        </section>
      )}
      {latestDelay && (
        <section aria-labelledby="delay-result-heading" style={panel}>
          <h2 id="delay-result-heading">{t.delayLatest}</h2>
          <p>
            {t.facility}: {ltr(latestDelay.facilityId)}
          </p>
          <p>
            {t.doctor}: {ltr(latestDelay.doctorId)}
          </p>
          <p>
            {t.civilDate}: {ltr(latestDelay.civilDate)}
          </p>
          <p>
            {t.declaredMinutes}: {ltr(latestDelay.delayMinutes)}
          </p>
          <p>
            {t.versionValue}: {ltr(latestDelay.version)}
          </p>
          <p>{t.noDelivery}</p>
        </section>
      )}
      {!result && !knownSchedule && <p>{t.empty}</p>}
    </main>
  );
}
