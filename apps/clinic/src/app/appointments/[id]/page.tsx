'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IdentityOnboardingClient } from '@shifaa/api-client';
import {
  color,
  radius,
  spacing,
  localizedType,
  minimumTargetSize,
} from '@shifaa/design-system/tokens';
import {
  appointmentQueueProjection,
  clinicSchedulingApi,
  schedulingFailure,
} from '../../../lib/clinic-scheduling-api';
type Appointment = Awaited<ReturnType<ReturnType<typeof clinicSchedulingApi>['getAppointment']>>;
type RescheduleInput = Parameters<
  ReturnType<typeof clinicSchedulingApi>['rescheduleAppointment']
>[1];
type Availability = Awaited<
  ReturnType<ReturnType<typeof clinicSchedulingApi>['listDoctorAvailability']>
>;
type Slot = Availability['items'][number];
type QueueProjection = Awaited<ReturnType<typeof appointmentQueueProjection>>;

type Locale = 'ar-EG' | 'en-EG';
type Failure = 'denied' | 'missing' | 'conflict' | 'recoverable';
type Action = 'cancel' | 'reschedule' | 'checkIn';
const cardStyle: React.CSSProperties = {
  backgroundColor: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  padding: spacing.lg,
  marginBlock: spacing.md,
};
const buttonStyle: React.CSSProperties = {
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  backgroundColor: color.brand,
  color: color.inverse,
  paddingInline: spacing.lg,
  cursor: 'pointer',
};
const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: color.surface,
  color: color.ink,
};
const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: color.danger,
  borderColor: color.danger,
};
const fieldStyle: React.CSSProperties = {
  display: 'block',
  minHeight: minimumTargetSize,
  width: '100%',
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  marginBlock: spacing.sm,
  paddingInline: spacing.sm,
  backgroundColor: color.surface,
  color: color.ink,
};
const statusLabels: Record<Appointment['status'], [string, string]> = {
  requested: ['مطلوب — للعرض فقط', 'Requested — read only'],
  confirmed: ['مؤكد', 'Confirmed'],
  checked_in: ['تم تسجيل الحضور', 'Checked in'],
  in_queue: ['في قائمة الانتظار — للعرض فقط', 'In queue — read only'],
  in_consultation: ['قيد الاستشارة — للعرض فقط', 'In consultation — read only'],
  completed: ['مكتمل — للعرض فقط', 'Completed — read only'],
  cancelled: ['ملغى', 'Cancelled'],
  no_show: ['لم يحضر — للعرض فقط', 'No show — read only'],
  reschedule_required: ['تجب إعادة الجدولة', 'Reschedule required'],
};
const queueStateLabels: Record<
  Awaited<
    ReturnType<ReturnType<typeof clinicSchedulingApi>['getQueue']>
  >['entries'][number]['state'],
  [string, string]
> = {
  waiting: ['ينتظر', 'Waiting'],
  called: ['تم النداء', 'Called'],
  in_service: ['قيد الخدمة', 'In service'],
  completed: ['مكتمل', 'Completed'],
  removed: ['أزيل', 'Removed'],
};
const copy = {
  ar: {
    title: 'تفاصيل الموعد',
    context: 'سياق المريض المصرح به',
    facility: 'المنشأة',
    doctor: 'الطبيب',
    patient: 'معرّف المريض',
    reference: 'مرجع الموعد',
    time: 'الوقت',
    fee: 'الرسوم',
    cash: 'نقدًا عند الوصول فقط',
    status: 'الحالة',
    refresh: 'تحديث',
    cancel: 'إلغاء الموعد',
    checkIn: 'تسجيل الحضور',
    reschedule: 'إعادة الجدولة',
    reason: 'سبب الإلغاء',
    rescheduleReason: 'سبب إعادة الجدولة',
    confirm: 'تأكيد إلغاء الموعد',
    consequence: 'سيُلغى الموعد ولن يبقى هذا الحجز متاحًا للمريض.',
    back: 'العودة',
    start: 'وقت البدء الجديد',
    end: 'وقت الانتهاء الجديد',
    timezone: 'المنطقة الزمنية',
    date: 'التاريخ الميلادي الجديد',
    submit: 'تأكيد إعادة الجدولة',
    loading: 'جارٍ تحميل الموعد…',
    empty: 'لا توجد بيانات لهذا الموعد.',
    denied: 'لا تملك صلاحية عرض هذا الموعد أو تنفيذ الإجراء.',
    offline: 'أنت غير متصل. البيانات المعروضة قديمة؛ الإجراءات غير متاحة ولن تُحفظ للمزامنة.',
    stale: 'قد تكون البيانات قديمة. حدّث قبل اتخاذ إجراء.',
    conflict: 'تغيّر الموعد على الخادم. راجع الحالة الحالية قبل المحاولة مجددًا.',
    error: 'تعذّر إكمال الطلب. حدّث الموعد ثم حاول مجددًا.',
    done: 'اكتمل الإجراء',
    next: 'الخطوة التالية: راجع الحالة الحالية.',
    noActions: 'لا توجد إجراءات عادية متاحة في هذه الحالة.',
    required: 'يلزم موعد بديل مستقبلي لإعادة الجدولة؛ يمكنك الإلغاء دون بديل.',
    queue: 'قائمة الانتظار',
    queueLoading: 'جارٍ تحميل حالة قائمة الانتظار…',
    queueEmpty: 'لا يوجد إدخال لهذا الموعد في قائمة الانتظار.',
    queueDenied: 'لا تملك صلاحية عرض قائمة الانتظار.',
    queueUnavailable: 'تعذّر عرض حالة قائمة الانتظار. حدّث للمحاولة مجددًا.',
    queueStale: 'قد تكون حالة قائمة الانتظار قديمة. حدّث قبل الاعتماد عليها.',
    queueNumber: 'رقم الانتظار',
    queuePosition: 'الترتيب الحالي',
    queueEstimate: 'وقت الخدمة المتوقع',
    queueNoEstimate: 'لا يوجد تقدير متاح',
    slots: 'المواعيد البديلة الحالية',
    noSlots: 'لا توجد مواعيد بديلة متاحة في الفترة المعروضة. يمكنك تحديث القائمة أو إلغاء الموعد.',
    slotStale: 'تعذر تأكيد حداثة المواعيد البديلة. حدّث القائمة قبل الاختيار.',
    slotLoading: 'جارٍ تحميل المواعيد البديلة…',
    chooseSlot: 'اختر موعدًا بديلًا',
    submitting: 'جارٍ إرسال الإجراء…',
    invalid: 'راجع السبب أو أوقات الموعد البديل.',
    noAuth: 'يلزم تسجيل الدخول بسياق موظف مخوّل.',
    noUrl: 'خدمة المواعيد غير مهيأة.',
  },
  en: {
    title: 'Appointment details',
    context: 'Authorized patient context',
    facility: 'Facility',
    doctor: 'Doctor',
    patient: 'Patient ID',
    reference: 'Appointment reference',
    time: 'Time',
    fee: 'Fee',
    cash: 'Cash on arrival only',
    status: 'Status',
    refresh: 'Refresh',
    cancel: 'Cancel appointment',
    checkIn: 'Check in',
    reschedule: 'Reschedule',
    reason: 'Cancellation reason',
    rescheduleReason: 'Rescheduling reason',
    confirm: 'Confirm appointment cancellation',
    consequence:
      'This appointment will be cancelled and the booking will no longer be available to the patient.',
    back: 'Back',
    start: 'New start time',
    end: 'New end time',
    timezone: 'Time zone',
    date: 'New Gregorian date',
    submit: 'Confirm reschedule',
    loading: 'Loading appointment…',
    empty: 'No appointment data is available.',
    denied: 'You are not authorized to view this appointment or perform this action.',
    offline:
      'You are offline. Displayed data may be outdated; actions are unavailable and will not be queued.',
    stale: 'This data may be outdated. Refresh before acting.',
    conflict:
      'The appointment changed on the server. Review its current state before trying again.',
    error: 'The request could not be completed. Refresh and try again.',
    done: 'Action completed',
    next: 'Next step: review the current status.',
    noActions: 'No ordinary actions are available in this state.',
    required:
      'A future replacement slot is required to reschedule; cancellation needs no replacement.',
    queue: 'Queue',
    queueLoading: 'Loading queue status…',
    queueEmpty: 'No queue entry exists for this appointment.',
    queueDenied: 'You are not authorized to view the queue.',
    queueUnavailable: 'Queue status is unavailable. Refresh to try again.',
    queueStale: 'Queue status may be stale. Refresh before relying on it.',
    queueNumber: 'Queue number',
    queuePosition: 'Current position',
    queueEstimate: 'Estimated service time',
    queueNoEstimate: 'No estimate available',
    slots: 'Current replacement slots',
    noSlots:
      'No replacement slots are available in this period. Refresh the list or cancel the appointment.',
    slotStale: 'Replacement-slot freshness could not be confirmed. Refresh before selecting.',
    slotLoading: 'Loading replacement slots…',
    chooseSlot: 'Choose a replacement slot',
    submitting: 'Submitting action…',
    invalid: 'Review the reason or replacement appointment times.',
    noAuth: 'An authorized staff session is required.',
    noUrl: 'Appointment service is not configured.',
  },
};

export function ClinicAppointment({
  id,
  accessToken,
  locale = 'ar-EG',
}: {
  id: string;
  accessToken?: string;
  locale?: Locale;
}) {
  const t = copy[locale === 'ar-EG' ? 'ar' : 'en'];
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [queue, setQueue] = useState<QueueProjection | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [slotPage, setSlotPage] = useState<Availability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotError, setSlotError] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    observedAt: string;
    reference: string;
  } | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const reasonInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const client =
    accessToken && process.env['NEXT_PUBLIC_API_BASE_URL']
      ? clinicSchedulingApi(accessToken, locale)
      : null;
  const load = useCallback(async () => {
    if (!client || !id) return;
    setBusy(true);
    setQueue(null);
    try {
      const current = await client.getAppointment(id);
      setAppointment(current);
      setFailure(null);
      if (
        current.status === 'checked_in' ||
        current.status === 'in_queue' ||
        current.status === 'in_consultation'
      ) {
        setQueueLoading(true);
        setQueue(await appointmentQueueProjection(client, current));
      }
    } catch (error) {
      setFailure(schedulingFailure(error));
    } finally {
      setQueueLoading(false);
      setBusy(false);
    }
  }, [accessToken, locale, id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  useEffect(() => {
    if (failure || result) summary.current?.focus();
  }, [failure, result]);
  useEffect(() => {
    if (!pending) return;
    const element = dialog.current;
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPending(null);
        actionButton.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
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
    };
    element?.addEventListener('keydown', onKey);
    return () => {
      element?.removeEventListener('keydown', onKey);
      actionButton.current?.focus();
    };
  }, [pending]);
  const canChange =
    appointment?.status === 'confirmed' && Date.parse(appointment.startsAt) > Date.now();
  const canCancel = canChange || appointment?.status === 'reschedule_required';
  const canReschedule = canChange || appointment?.status === 'reschedule_required';
  const canCheckIn = appointment?.status === 'confirmed';
  const available = !offline && !busy && !failure && Boolean(client);
  const civilDateAt = (instant: Date, timezone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const loadSlots = async () => {
    if (!client || !appointment || offline) return;
    setSlotLoading(true);
    setSlotError(false);
    setSelectedSlot(null);
    try {
      const now = new Date();
      const page = await client.listDoctorAvailability(
        appointment.facilityId,
        appointment.doctorId,
        {
          fromDate: civilDateAt(now, appointment.timezone),
          toDate: civilDateAt(new Date(now.getTime() + 14 * 86400000), appointment.timezone),
        },
      );
      setSlotPage(page);
    } catch {
      setSlotPage(null);
      setSlotError(true);
    } finally {
      setSlotLoading(false);
    }
  };
  useEffect(() => {
    if (pending === 'reschedule') void loadSlots();
  }, [pending]);
  const act = async (action: Action) => {
    if (!client || !appointment || !available) return;
    if (
      (action === 'cancel' && !canCancel) ||
      (action === 'reschedule' && !canReschedule) ||
      (action !== 'checkIn' &&
        (!reason.trim() || reason.trim().length > 500 || /[\r\n\t]/.test(reason)))
    ) {
      reasonInput.current?.focus();
      return;
    }
    if (
      action === 'reschedule' &&
      (!canReschedule ||
        slotPage?.freshness !== 'fresh' ||
        !selectedSlot ||
        selectedSlot.facilityId !== appointment.facilityId ||
        selectedSlot.doctorId !== appointment.doctorId ||
        !slotPage.items.some(
          (slot) => slot.startsAt === selectedSlot.startsAt && slot.endsAt === selectedSlot.endsAt,
        ) ||
        Date.parse(selectedSlot.startsAt) <= Date.now())
    ) {
      setFailure('recoverable');
      return;
    }
    if (action === 'checkIn' && !canCheckIn) return;
    setBusy(true);
    setFailure(null);
    try {
      const key = crypto.randomUUID();
      const updated =
        action === 'cancel'
          ? await client.cancelAppointment(id, { reason: reason.trim() }, appointment.version, key)
          : action === 'reschedule'
            ? await client.rescheduleAppointment(
                id,
                {
                  startsAt: selectedSlot!.startsAt,
                  endsAt: selectedSlot!.endsAt,
                  timezone: selectedSlot!.timezone,
                  civilDate: selectedSlot!.civilDate,
                  reason: reason.trim(),
                } satisfies RescheduleInput,
                appointment.version,
                key,
              )
            : (await client.checkInAppointment(id, appointment.version, key)).appointment;
      setAppointment(updated);
      setQueue(null);
      if (updated.status === 'checked_in') {
        setQueueLoading(true);
        setQueue(await appointmentQueueProjection(client, updated));
        setQueueLoading(false);
      }
      setResult({
        status: updated.status,
        observedAt: new Date().toISOString(),
        reference: updated.id,
      });
      setPending(null);
      setReason('');
    } catch (error) {
      const kind = schedulingFailure(error);
      setFailure(kind);
      if (kind === 'conflict') {
        try {
          setAppointment(await client.getAppointment(id));
        } catch (refreshError) {
          setFailure(schedulingFailure(refreshError));
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const label = (value: string) => <bdi dir="ltr">{value}</bdi>;
  return (
    <main
      lang={locale}
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      style={{
        maxWidth: 1100,
        marginInline: 'auto',
        padding: spacing.lg,
        backgroundColor: color.canvas,
        color: color.ink,
        ...localizedType(locale, 'body'),
        // Native typography tokens use pixel line heights; CSS numbers are unitless multipliers.
        lineHeight: `${localizedType(locale, 'body').lineHeight}px`,
      }}
    >
      <h1>{t.title}</h1>
      <div ref={summary} tabIndex={-1} role="status" aria-live="polite">
        {!accessToken && <p>{t.noAuth}</p>}
        {accessToken && !process.env['NEXT_PUBLIC_API_BASE_URL'] && <p>{t.noUrl}</p>}
        {offline && <p>{t.offline}</p>}
        {busy && <p>{t.loading}</p>}
        {failure && (
          <p>
            {failure === 'denied'
              ? t.denied
              : failure === 'missing'
                ? t.empty
                : failure === 'conflict'
                  ? t.conflict
                  : t.error}
          </p>
        )}
        {result && (
          <p>
            {t.done}:{' '}
            {statusLabels[result.status as Appointment['status']]?.[locale === 'ar-EG' ? 0 : 1]} ·{' '}
            {t.reference}: {label(result.reference)} ·{' '}
            {locale === 'ar-EG' ? 'وقت ملاحظة النتيجة' : 'Result observed at'}:{' '}
            {label(result.observedAt)}. {t.next}
          </p>
        )}
      </div>
      {appointment && (
        <>
          <div inert={pending ? true : undefined}>
            <section aria-label={t.context} style={cardStyle}>
              <h2>{t.context}</h2>
              <p>
                {t.patient}: {label(appointment.patientId)}
              </p>
              <p>
                {t.facility}: {label(appointment.facilityId)}
              </p>
            </section>
            <section aria-label={t.title} style={cardStyle}>
              <p>
                {t.reference}: {label(appointment.id)}
              </p>
              <p>
                {t.status}: {statusLabels[appointment.status][locale === 'ar-EG' ? 0 : 1]}
              </p>
              <p>
                {t.doctor}: {label(appointment.doctorId)}
              </p>
              <p>
                {t.time}:{' '}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'full',
                  timeStyle: 'short',
                  timeZone: appointment.timezone,
                }).format(new Date(appointment.startsAt))}
              </p>
              <p>
                {t.fee}:{' '}
                {new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' }).format(
                  appointment.feeMinorUnits / 100,
                )}{' '}
                — {t.cash}
              </p>
              {appointment.status === 'reschedule_required' && <p>{t.required}</p>}
              {(appointment.status === 'checked_in' ||
                appointment.status === 'in_queue' ||
                appointment.status === 'in_consultation') && (
                <section aria-label={t.queue} aria-live="polite">
                  <h3>{t.queue}</h3>
                  {queueLoading && <p>{t.queueLoading}</p>}
                  {!queueLoading && !queue && <p>{t.queueUnavailable}</p>}
                  {!queueLoading && queue?.kind === 'empty' && <p>{t.queueEmpty}</p>}
                  {!queueLoading && queue?.kind === 'denied' && <p>{t.queueDenied}</p>}
                  {!queueLoading && queue?.kind === 'unavailable' && <p>{t.queueUnavailable}</p>}
                  {!queueLoading && queue?.kind === 'found' && (
                    <>
                      <p>
                        {t.status}:{' '}
                        {queueStateLabels[queue.entry.state][locale === 'ar-EG' ? 0 : 1]}
                      </p>
                      <p>
                        {t.queueNumber}: {queue.entry.queueNumber}
                      </p>
                      {queue.entry.position != null && (
                        <p>
                          {t.queuePosition}: {queue.entry.position}
                        </p>
                      )}
                      <p>
                        {t.queueEstimate}:{' '}
                        {queue.entry.estimatedServiceAt
                          ? new Intl.DateTimeFormat(locale, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              timeZone: appointment.timezone,
                            }).format(new Date(queue.entry.estimatedServiceAt))
                          : t.queueNoEstimate}
                      </p>
                      {queue.stale && <p>{t.queueStale}</p>}
                    </>
                  )}
                </section>
              )}
            </section>
            <nav
              aria-label={t.title}
              style={{
                display: 'flex',
                gap: spacing.md,
                flexWrap: 'wrap',
                marginBlock: spacing.md,
              }}
            >
              <button
                style={secondaryButtonStyle}
                type="button"
                onClick={() => void load()}
                disabled={busy || offline}
              >
                {t.refresh}
              </button>
              {canCheckIn && (
                <button
                  style={buttonStyle}
                  type="button"
                  disabled={!available}
                  onClick={() => void act('checkIn')}
                >
                  {t.checkIn}
                </button>
              )}
              {canReschedule && (
                <button
                  style={secondaryButtonStyle}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    actionButton.current = document.activeElement as HTMLButtonElement;
                    setPending('reschedule');
                  }}
                >
                  {t.reschedule}
                </button>
              )}
              {canCancel && (
                <button
                  style={dangerButtonStyle}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    actionButton.current = document.activeElement as HTMLButtonElement;
                    setPending('cancel');
                  }}
                >
                  {t.cancel}
                </button>
              )}
              {!canCancel && !canReschedule && !canCheckIn && <p>{t.noActions}</p>}
            </nav>
          </div>
          {pending && (
            <section
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-label={pending === 'cancel' ? t.confirm : t.reschedule}
              style={{ ...cardStyle, borderWidth: 2, borderRadius: radius.dialog }}
            >
              <h2>{pending === 'cancel' ? t.confirm : t.reschedule}</h2>
              <p>
                {t.reference}: {label(appointment.id)}
              </p>
              {pending === 'cancel' ? (
                <>
                  <p>{t.consequence}</p>
                  <label>
                    {t.reason}
                    <input
                      ref={reasonInput}
                      style={fieldStyle}
                      required
                      maxLength={500}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setFailure(null);
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {t.rescheduleReason}
                    <input
                      ref={reasonInput}
                      style={fieldStyle}
                      required
                      maxLength={500}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setFailure(null);
                      }}
                    />
                  </label>
                  <h3>{t.slots}</h3>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    disabled={slotLoading || offline}
                    onClick={() => void loadSlots()}
                  >
                    {t.refresh}
                  </button>
                  {slotLoading && <p role="status">{t.slotLoading}</p>}
                  {slotError && <p role="alert">{t.error}</p>}
                  {slotPage?.freshness !== 'fresh' && !slotLoading && !slotError && (
                    <p role="status">{t.slotStale}</p>
                  )}
                  {slotPage?.freshness === 'fresh' &&
                    !slotPage.items.some((slot) => Date.parse(slot.startsAt) > Date.now()) && (
                      <p>{t.noSlots}</p>
                    )}
                  {slotPage?.freshness === 'fresh' && (
                    <label>
                      {t.chooseSlot}
                      <select
                        style={fieldStyle}
                        value={selectedSlot?.startsAt ?? ''}
                        onChange={(event) =>
                          setSelectedSlot(
                            slotPage.items.find((slot) => slot.startsAt === event.target.value) ??
                              null,
                          )
                        }
                      >
                        <option value="">{t.chooseSlot}</option>
                        {slotPage.items
                          .filter(
                            (slot) =>
                              slot.facilityId === appointment.facilityId &&
                              slot.doctorId === appointment.doctorId &&
                              Date.parse(slot.startsAt) > Date.now(),
                          )
                          .map((slot) => (
                            <option key={`${slot.startsAt}:${slot.endsAt}`} value={slot.startsAt}>
                              {new Intl.DateTimeFormat(locale, {
                                dateStyle: 'full',
                                timeStyle: 'short',
                                timeZone: slot.timezone,
                              }).format(new Date(slot.startsAt))}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
                <button
                  style={pending === 'cancel' ? dangerButtonStyle : buttonStyle}
                  type="button"
                  disabled={
                    busy ||
                    (pending === 'reschedule' &&
                      (slotLoading || slotPage?.freshness !== 'fresh' || !selectedSlot || offline))
                  }
                  onClick={() => void act(pending)}
                >
                  {busy ? t.submitting : pending === 'cancel' ? t.confirm : t.submit}
                </button>
                <button
                  style={secondaryButtonStyle}
                  type="button"
                  onClick={() => {
                    setPending(null);
                    actionButton.current?.focus();
                  }}
                >
                  {t.back}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [authError, setAuthError] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const apiBaseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const auth = apiBaseUrl
    ? new IdentityOnboardingClient({ baseUrl: apiBaseUrl, acceptLanguage: locale })
    : null;
  const login = async () => {
    if (!auth) return;
    setAuthBusy(true);
    setAuthError(false);
    try {
      const result = (await auth.login({ handle, password }, crypto.randomUUID())) as {
        kind?: string;
        challenge_id?: string;
      };
      if (result.kind !== 'challenge' || !result.challenge_id)
        throw new Error('challenge-required');
      setChallenge(result.challenge_id);
      setPassword('');
    } catch {
      setAuthError(true);
    } finally {
      setAuthBusy(false);
    }
  };
  const verify = async () => {
    if (!auth) return;
    setAuthBusy(true);
    setAuthError(false);
    try {
      const result = (await auth.verifyOtp(
        { challenge_id: challenge, code: otp },
        crypto.randomUUID(),
      )) as { kind?: string; access_token?: string };
      if (result.kind !== 'session' || !result.access_token) throw new Error('session-required');
      setToken(result.access_token);
      setOtp('');
      setChallenge('');
    } catch {
      setAuthError(true);
    } finally {
      setAuthBusy(false);
    }
  };
  if (token)
    return (
      <>
        <div style={{ padding: spacing.md }}>
          <button
            style={secondaryButtonStyle}
            type="button"
            onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
          >
            {locale === 'ar-EG' ? 'English' : 'العربية'}
          </button>
        </div>
        <ClinicAppointment id={id} accessToken={token} locale={locale} />
      </>
    );
  return (
    <main
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        maxWidth: 560,
        marginInline: 'auto',
        padding: spacing.lg,
        backgroundColor: color.canvas,
        color: color.ink,
        ...localizedType(locale, 'body'),
        lineHeight: `${localizedType(locale, 'body').lineHeight}px`,
      }}
    >
      <button
        style={secondaryButtonStyle}
        type="button"
        onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
      >
        {locale === 'ar-EG' ? 'English' : 'العربية'}
      </button>
      <h1>{locale === 'ar-EG' ? 'دخول موظف العيادة' : 'Clinic staff sign-in'}</h1>
      <p>
        {locale === 'ar-EG'
          ? 'يلزم سياق موظف مخوّل. لا تُحفظ بيانات الدخول على هذا الجهاز.'
          : 'An authorized staff context is required. Credentials are not stored on this device.'}
      </p>
      {!challenge ? (
        <>
          <label>
            {locale === 'ar-EG' ? 'وسيلة الدخول' : 'Sign-in handle'}
            <input
              style={fieldStyle}
              autoComplete="username"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
            />
          </label>
          <label>
            {locale === 'ar-EG' ? 'كلمة المرور' : 'Password'}
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
            type="button"
            disabled={!apiBaseUrl || authBusy || !handle || !password}
            onClick={() => void login()}
          >
            {locale === 'ar-EG' ? 'متابعة' : 'Continue'}
          </button>
        </>
      ) : (
        <>
          <label>
            {locale === 'ar-EG' ? 'رمز التحقق' : 'Verification code'}
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
            type="button"
            disabled={!apiBaseUrl || authBusy || otp.length !== 6}
            onClick={() => void verify()}
          >
            {locale === 'ar-EG' ? 'تحقق' : 'Verify'}
          </button>
        </>
      )}
      {authError && (
        <p role="alert">
          {locale === 'ar-EG' ? 'تعذّر التحقق. حاول مجددًا.' : 'Verification failed. Try again.'}
        </p>
      )}
      {!apiBaseUrl && <p role="status">{copy[locale === 'ar-EG' ? 'ar' : 'en'].noUrl}</p>}
    </main>
  );
}
