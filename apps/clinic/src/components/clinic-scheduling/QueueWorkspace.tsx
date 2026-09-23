'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  color,
  localizedType,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';
import { clinicSchedulingApi, schedulingFailure } from '../../lib/clinic-scheduling-api';
import { validQueueReorderReason } from '../../lib/queue-reason';
import { clinicSchedulingArEG, clinicSchedulingEnEG } from '@shifaa/i18n';

type Locale = 'ar-EG' | 'en-EG';
type Client = ReturnType<typeof clinicSchedulingApi>;
type Queue = Awaited<ReturnType<Client['getQueue']>>;
type Entry = Queue['entries'][number];
type Appointment = Awaited<ReturnType<Client['listAppointments']>>['items'][number];
type Mode = 'today' | 'queue';
type Failure = 'denied' | 'missing' | 'conflict' | 'recoverable' | 'terminal';
const states = ['waiting', 'called', 'in_service', 'completed', 'removed'] as const;
const stateText: Record<Entry['state'], [string, string]> = {
  waiting: ['ينتظر', 'Waiting'],
  called: ['تم النداء', 'Called'],
  in_service: ['قيد الخدمة — للعرض فقط', 'In service — read only'],
  completed: ['مكتمل', 'Completed'],
  removed: ['أزيل بسبب غياب الطبيب', 'Removed due to doctor absence'],
};
const words = {
  'ar-EG': {
    today: 'عمل اليوم في العيادة',
    queue: 'قائمة الانتظار',
    scope: 'السياق التشغيلي',
    facility: 'معرّف المنشأة',
    role: 'الدور والصلاحية',
    aal: 'مستوى التحقق',
    environment: 'البيئة',
    roleValue: 'غير متاح في استجابة القائمة؛ يتحقق الخادم من كل إجراء',
    aalValue: 'غير متاح في استجابة القائمة؛ يتحقق الخادم من الجلسة',
    environmentValue: 'بيئة بناء التطبيق',
    doctor: 'معرّف الطبيب',
    date: 'التاريخ الميلادي',
    load: 'اعرض النطاق',
    refresh: 'تحديث من الخادم',
    filters: 'اختيار الطبيب والتاريخ',
    worklist: 'قائمة المواعيد',
    details: 'تفاصيل الموعد',
    patient: 'معرّف المريض',
    time: 'الوقت',
    status: 'الحالة',
    number: 'رقم الانتظار',
    position: 'الترتيب',
    estimate: 'وقت الخدمة المتوقع',
    noEstimate: 'لا يوجد تقدير حالي',
    version: 'نسخة قائمة الانتظار',
    freshness: 'الحداثة',
    fresh: 'جديدة حسب الخادم',
    stale: 'قد تكون قديمة؛ الإجراءات غير متاحة حتى التحديث',
    unknown: 'لم يؤكد الخادم حداثة البيانات',
    delay: 'التأخير الحالي',
    delayMinutes: 'دقيقة إضافية في تقدير الخدمة فقط؛ وقت الموعد وترتيب القائمة لم يتغيرا.',
    noDelay: 'لا يوجد تأخير حالي معلن في هذه القائمة.',
    absence: 'مواعيد تتطلب إعادة الجدولة بسبب غياب الطبيب',
    noAbsence: 'لا توجد حالة غياب ظاهرة في النطاق الحالي.',
    loading: 'جارٍ تحميل البيانات…',
    empty: 'لا توجد عناصر في النطاق الحالي.',
    denied: 'ليس لديك صلاحية عرض هذا النطاق أو تنفيذ هذا الإجراء.',
    offline: 'لا يوجد اتصال. البيانات المعروضة قديمة؛ الإجراءات غير متاحة ولا تُحفظ للمزامنة.',
    error: 'تعذّر تحميل البيانات. تحقق من الاتصال وحدّث النطاق.',
    terminal: 'الاستجابة الحالية غير متسقة مع النطاق. أعد اختيار النطاق وحاول مجددًا.',
    conflict:
      'تغيّرت نسخة القائمة. أُعيد تحميل القائمة كاملة من الخادم؛ راجع الترتيب قبل إجراء جديد.',
    call: 'نداء',
    reorder: 'إعادة ترتيب',
    complete: 'إكمال',
    reason: 'سبب إعادة الترتيب المقيد',
    reasonHelp: 'سبب مطلوب، من ١ إلى ٥٠٠ حرف، دون أسطر جديدة أو علامات تحكم.',
    target: 'الموضع المستهدف',
    review: 'راجع إعادة الترتيب',
    confirm: 'تأكيد الإجراء',
    cancel: 'رجوع',
    invalid: 'راجع الموضع والسبب ثم حاول مجددًا.',
    submitting: 'جارٍ إرسال الإجراء…',
    result: 'نتيجة الإجراء',
    reference: 'مرجع الإدخال',
    observed: 'وقت التأكيد',
    next: 'الخطوة التالية: راجع القائمة الحالية القادمة من الخادم.',
    actionUncertain: 'نتيجة الإجراء غير مؤكدة. حدّث القائمة قبل أي إجراء جديد.',
    count: 'عدد العناصر',
    unavailable: 'الخدمة غير مهيأة أو لا توجد جلسة موظف.',
  },
  'en-EG': {
    today: "Today's clinic worklist",
    queue: 'Queue',
    scope: 'Operational context',
    facility: 'Facility ID',
    role: 'Role and permission',
    aal: 'Authentication level',
    environment: 'Environment',
    roleValue: 'Not in the queue response; server checks each action',
    aalValue: 'Not in the queue response; server checks the session',
    environmentValue: 'Application build environment',
    doctor: 'Doctor ID',
    date: 'Civil date',
    load: 'Show scope',
    refresh: 'Refresh from server',
    filters: 'Doctor and date selection',
    worklist: 'Appointments',
    details: 'Appointment details',
    patient: 'Patient ID',
    time: 'Time',
    status: 'Status',
    number: 'Queue number',
    position: 'Position',
    estimate: 'Estimated service time',
    noEstimate: 'No current estimate',
    version: 'Queue version',
    freshness: 'Freshness',
    fresh: 'Fresh according to server',
    stale: 'May be outdated; actions unavailable until refresh',
    unknown: 'Server did not confirm freshness',
    delay: 'Current delay',
    delayMinutes:
      'additional minutes in service estimates only; appointment time and queue order are unchanged.',
    noDelay: 'No current delay is declared on this queue.',
    absence: 'Appointments requiring rescheduling due to doctor absence',
    noAbsence: 'No absence outcome is visible in the current scope.',
    loading: 'Loading data…',
    empty: 'No items in the current scope.',
    denied: 'You are not authorized to view this scope or perform this action.',
    offline:
      'You are offline. Displayed data is stale; actions are unavailable and will not be queued.',
    error: 'Data could not be loaded. Check the connection and refresh this scope.',
    terminal: 'The response does not match this scope. Choose the scope again and retry.',
    conflict:
      'Queue version changed. The full queue was reloaded from the server; review its order before acting again.',
    call: 'Call',
    reorder: 'Reorder',
    complete: 'Complete',
    reason: 'Restricted reorder reason',
    reasonHelp: 'Required: 1 to 500 characters, without newlines or control characters.',
    target: 'Target position',
    review: 'Review reorder',
    confirm: 'Confirm action',
    cancel: 'Back',
    invalid: 'Review the position and reason, then try again.',
    submitting: 'Submitting action…',
    result: 'Action result',
    reference: 'Entry reference',
    observed: 'Confirmed at',
    next: 'Next step: review the current queue from the server.',
    actionUncertain: 'The action outcome is uncertain. Refresh the queue before any new action.',
    count: 'Entry count',
    unavailable: 'Service is not configured or a staff session is missing.',
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
};
const ltr = (value: string | number) => <bdi dir="ltr">{value}</bdi>;
export function QueueWorkspace({
  mode,
  accessToken,
  sessionAal,
  locale = 'ar-EG',
  initialFacilityId = '',
  initialDoctorId = '',
  initialDate = '',
}: {
  mode: Mode;
  accessToken?: string;
  sessionAal?: 1 | 2 | null;
  locale?: Locale;
  initialFacilityId?: string;
  initialDoctorId?: string;
  initialDate?: string;
}) {
  const t = words[locale];
  const statusCopy = locale === 'ar-EG' ? clinicSchedulingArEG : clinicSchedulingEnEG;
  const [facility, setFacility] = useState(initialFacilityId);
  const [doctor, setDoctor] = useState(initialDoctorId);
  const [date, setDate] = useState(initialDate);
  const [scope, setScope] = useState<{ facility: string; doctor: string; date: string } | null>(
    null,
  );
  const [queue, setQueue] = useState<Queue | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentFresh, setAppointmentFresh] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<{
    action: 'call' | 'reorder' | 'complete';
    entry: Entry;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [result, setResult] = useState<{ reference: string; status: string; at: string } | null>(
    null,
  );
  const [uncertain, setUncertain] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const loadSequence = useRef(0);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const client =
    accessToken && process.env['NEXT_PUBLIC_API_BASE_URL']
      ? clinicSchedulingApi(accessToken, locale)
      : null;

  const reload = useCallback(
    async (selected: { facility: string; doctor: string; date: string }) => {
      if (!client || !navigator.onLine) return false;
      const sequence = ++loadSequence.current;
      setBusy(true);
      setFailure(null);
      setQueue(null);
      setAppointments([]);
      try {
        const entries: Entry[] = [];
        const items: Appointment[] = [];
        const seen = new Set<string>();
        let cursor: string | null | undefined;
        let first: Queue | null = null;
        let queueFresh = true;
        for (let n = 0; n < 20; n += 1) {
          const page = await client.getQueue(selected.facility, {
            doctorId: selected.doctor,
            date: selected.date,
            ...(cursor ? { cursor } : {}),
          });
          if (
            page.facilityId !== selected.facility ||
            page.doctorId !== selected.doctor ||
            page.civilDate !== selected.date ||
            (first && (page.version !== first.version || page.delayMinutes !== first.delayMinutes))
          )
            throw new Error('scope-or-version-changed');
          first ??= page;
          queueFresh = queueFresh && page.freshness === 'fresh';
          if (
            page.entries.some(
              (entry) =>
                entry.facilityId !== selected.facility ||
                entry.doctorId !== selected.doctor ||
                entry.civilDate !== selected.date ||
                !states.includes(entry.state),
            )
          )
            throw new Error('queue-entry-scope');
          entries.push(...page.entries);
          cursor = page.nextCursor;
          if (!cursor) break;
          if (seen.has(cursor) || n === 19) throw new Error('queue-pagination');
          seen.add(cursor);
        }
        if (!first) throw new Error('queue-missing');
        let fresh = true;
        if (mode === 'today') {
          seen.clear();
          cursor = undefined;
          for (let n = 0; n < 20; n += 1) {
            const page = await client.listAppointments({
              facilityId: selected.facility,
              doctorId: selected.doctor,
              date: selected.date,
              ...(cursor ? { cursor } : {}),
            });
            fresh = fresh && page.freshness === 'fresh';
            if (
              page.items.some(
                (item) =>
                  item.facilityId !== selected.facility ||
                  item.doctorId !== selected.doctor ||
                  item.civilDate !== selected.date,
              )
            )
              throw new Error('appointment-scope');
            items.push(...page.items);
            cursor = page.nextCursor;
            if (!cursor) break;
            if (seen.has(cursor) || n === 19) throw new Error('appointment-pagination');
            seen.add(cursor);
          }
        }
        if (sequence !== loadSequence.current) return false;
        setQueue({
          ...first,
          entries,
          nextCursor: null,
          freshness: queueFresh ? 'fresh' : 'stale',
        });
        setAppointments(items);
        setAppointmentFresh(fresh);
        setUncertain(false);
        return true;
      } catch (error) {
        if (sequence === loadSequence.current)
          setFailure(
            error instanceof Error && /scope|pagination|missing/.test(error.message)
              ? 'terminal'
              : schedulingFailure(error),
          );
        return false;
      } finally {
        if (sequence === loadSequence.current) setBusy(false);
      }
    },
    [accessToken, locale, mode],
  );

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
    if (!offline && scope) void reload(scope);
  }, [offline]);
  useEffect(() => {
    if (failure || result || uncertain) summary.current?.focus();
  }, [failure, result, uncertain]);
  useEffect(() => {
    if (!pending) return;
    const node = dialog.current;
    const controls = () =>
      Array.from(
        node?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
        ) ?? [],
      );
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPending(null);
        returnFocus.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = controls();
      if (event.shiftKey && document.activeElement === list[0]) {
        event.preventDefault();
        list.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === list.at(-1)) {
        event.preventDefault();
        list[0]?.focus();
      }
    };
    node?.addEventListener('keydown', onKey);
    return () => node?.removeEventListener('keydown', onKey);
  }, [pending]);
  const selectScope = () => {
    const selected = { facility: facility.trim(), doctor: doctor.trim(), date };
    if (
      !/^[0-9a-f-]{36}$/i.test(selected.facility) ||
      !/^[0-9a-f-]{36}$/i.test(selected.doctor) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(selected.date)
    ) {
      setFailure('terminal');
      return;
    }
    setScope(selected);
    setResult(null);
    setPending(null);
    void reload(selected);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const fresh = queue?.freshness === 'fresh' && (mode === 'queue' || appointmentFresh);
  const canAct =
    !!client && !!scope && !!queue && fresh && !offline && !busy && !failure && !uncertain;
  const openAction = (
    action: 'call' | 'reorder' | 'complete',
    entry: Entry,
    trigger: HTMLButtonElement,
  ) => {
    returnFocus.current = trigger;
    setPending({ action, entry });
    setTarget(String(entry.position ?? ''));
    setReason('');
    setInvalid(false);
  };
  const act = async () => {
    if (!pending || !queue || !scope || !client || !canAct) return;
    const current = queue.entries.find((entry) => entry.id === pending.entry.id);
    if (
      !current ||
      current.version !== pending.entry.version ||
      current.state !== pending.entry.state ||
      (pending.action === 'complete' ? current.state !== 'called' : current.state !== 'waiting')
    )
      return;
    const position = Number(target);
    if (
      pending.action === 'reorder' &&
      (!validQueueReorderReason(reason) ||
        !Number.isInteger(position) ||
        position < 1 ||
        position > queue.entries.filter((entry) => entry.state === 'waiting').length)
    ) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    setResult(null);
    setInvalid(false);
    try {
      const key = crypto.randomUUID();
      let reference = current.id;
      let status = stateText.waiting[locale === 'ar-EG' ? 0 : 1];
      if (pending.action === 'call') {
        const response = await client.callQueueEntry(current.id, current.version, key);
        reference = response.id;
        status = stateText[response.state][locale === 'ar-EG' ? 0 : 1];
      } else if (pending.action === 'complete') {
        const response = await client.completeQueueEntry(current.id, current.version, key);
        reference = response.id;
        status = stateText[response.state][locale === 'ar-EG' ? 0 : 1];
      } else {
        await client.reorderQueueEntry(
          current.id,
          { targetPosition: position, queueVersion: queue.version, reason: reason.trim() },
          current.version,
          key,
        );
      }
      setPending(null);
      if (await reload(scope)) {
        setResult({ reference, status, at: new Date().toISOString() });
        requestAnimationFrame(() => {
          const row = document.getElementById(`queue-${reference}`);
          if (row) row.focus();
          else heading.current?.focus();
        });
      } else setUncertain(true);
    } catch (error) {
      setPending(null);
      const kind = schedulingFailure(error);
      if (kind === 'conflict') {
        if (await reload(scope)) setFailure('conflict');
        else setUncertain(true);
      } else {
        setFailure(kind);
        if (kind === 'recoverable') setUncertain(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        maxWidth: 1200,
        marginInline: 'auto',
        padding: spacing.lg,
        color: color.ink,
        background: color.canvas,
        ...localizedType(locale, 'body'),
        lineHeight: 1.5,
      }}
    >
      <h1>{mode === 'today' ? t.today : t.queue}</h1>
      <section aria-label={t.scope} style={panel}>
        <h2>{t.scope}</h2>
        <p>
          {t.facility}: {scope ? ltr(scope.facility) : '—'}
        </p>
        <p>
          {t.role}: {t.roleValue}
        </p>
        <p>
          {t.aal}: {sessionAal === 1 || sessionAal === 2 ? `AAL${sessionAal}` : t.aalValue}
        </p>
        <p>
          {t.environment}: {t.environmentValue} —{' '}
          {process.env['NODE_ENV'] === 'production' ? 'production' : 'development'}
        </p>
      </section>
      <section aria-label={t.filters} style={panel}>
        <h2>{t.filters}</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: spacing.md,
          }}
        >
          <label>
            {t.facility}
            <input
              style={field}
              value={facility}
              onChange={(event) => setFacility(event.target.value)}
            />
          </label>
          <label>
            {t.doctor}
            <input
              style={field}
              value={doctor}
              onChange={(event) => setDoctor(event.target.value)}
            />
          </label>
          <label>
            {t.date}
            <input
              type="date"
              style={field}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing.sm,
            marginBlockStart: spacing.md,
          }}
        >
          <button style={button} disabled={!client || offline || busy} onClick={selectScope}>
            {t.load}
          </button>
          <button
            style={button}
            disabled={!client || offline || busy || !scope}
            onClick={() => void reload(scope!)}
          >
            {t.refresh}
          </button>
        </div>
      </section>
      <div ref={summary} tabIndex={-1} role="status" aria-live="polite">
        {!client && <p>{t.unavailable}</p>}
        {offline && <p>{t.offline}</p>}
        {busy && <p>{t.loading}</p>}
        {failure && (
          <p>
            {failure === 'denied'
              ? t.denied
              : failure === 'conflict'
                ? t.conflict
                : failure === 'terminal'
                  ? t.terminal
                  : t.error}
          </p>
        )}
        {uncertain && <p>{t.actionUncertain}</p>}
        {result && (
          <p>
            {t.result}: {result.status}. {t.reference}: {ltr(result.reference)}. {t.observed}:{' '}
            {ltr(result.at)}. {t.next}
          </p>
        )}
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {mode === 'today' ? t.worklist : t.queue}
      </h2>
      {scope && queue && (
        <>
          <p>
            {t.doctor}: {ltr(scope.doctor)} · {t.date}: {ltr(scope.date)}
          </p>
          <p>
            {t.freshness}:{' '}
            {offline
              ? t.stale
              : fresh
                ? t.fresh
                : queue.freshness === 'stale' || (mode === 'today' && !appointmentFresh)
                  ? t.stale
                  : t.unknown}{' '}
            · {t.version}: {ltr(queue.version)}
          </p>
          <section style={panel} aria-label={t.delay}>
            <h3>{t.delay}</h3>
            <p>{queue.delayMinutes ? `${queue.delayMinutes} ${t.delayMinutes}` : t.noDelay}</p>
          </section>
        </>
      )}
      {mode === 'today' && scope && !busy && !failure && (
        <>
          <section style={panel} aria-label={t.absence}>
            <h3>{t.absence}</h3>
            <p>
              {appointments.filter((item) => item.status === 'reschedule_required').length ||
                t.noAbsence}
            </p>
          </section>
          <p>
            {t.count}: {appointments.length}
          </p>
          {appointments.length === 0 && <p>{t.empty}</p>}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {appointments.map((item) => (
              <li key={item.id} style={panel}>
                <p>
                  {t.time}: {ltr(item.startsAt)}
                </p>
                <p>
                  {t.patient}: {ltr(item.patientId)}
                </p>
                <p>
                  {t.status}: {statusCopy[`clinic.appointment.status.${item.status}`]}
                </p>
                <a href={`/appointments/${encodeURIComponent(item.id)}`}>
                  {t.details}: {ltr(item.id)}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {mode === 'queue' && scope && queue && !busy && (!failure || failure === 'conflict') && (
        <>
          <p>
            {t.count}: {queue.entries.length}
          </p>
          {queue.entries.length === 0 && <p>{t.empty}</p>}
          <ol style={{ paddingInlineStart: spacing.lg }}>
            {queue.entries.map((entry) => (
              <li id={`queue-${entry.id}`} tabIndex={-1} key={entry.id} style={panel}>
                <p>
                  {t.number}: {ltr(entry.queueNumber)} · {t.status}:{' '}
                  {stateText[entry.state][locale === 'ar-EG' ? 0 : 1]}
                </p>
                <p>
                  {t.position}: {entry.position == null ? '—' : ltr(entry.position)} · {t.estimate}:{' '}
                  {entry.estimatedServiceAt ? ltr(entry.estimatedServiceAt) : t.noEstimate}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
                  {entry.state === 'waiting' && (
                    <>
                      <button
                        style={button}
                        disabled={!canAct}
                        onClick={(event) => openAction('call', entry, event.currentTarget)}
                      >
                        {t.call} {ltr(entry.queueNumber)}
                      </button>
                      <button
                        style={button}
                        disabled={!canAct}
                        onClick={(event) => openAction('reorder', entry, event.currentTarget)}
                      >
                        {t.reorder} {ltr(entry.queueNumber)}
                      </button>
                    </>
                  )}
                  {entry.state === 'called' && (
                    <button
                      style={button}
                      disabled={!canAct}
                      onClick={(event) => openAction('complete', entry, event.currentTarget)}
                    >
                      {t.complete} {ltr(entry.queueNumber)}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {pending && (
        <section ref={dialog} role="dialog" aria-modal="true" aria-label={t.review} style={panel}>
          <h2>
            {t.review}:{' '}
            {pending.action === 'call'
              ? t.call
              : pending.action === 'complete'
                ? t.complete
                : t.reorder}{' '}
            {ltr(pending.entry.queueNumber)}
          </h2>
          {pending.action === 'reorder' && (
            <>
              <label>
                {t.target}
                <input
                  type="number"
                  min={1}
                  max={queue?.entries.filter((entry) => entry.state === 'waiting').length}
                  style={field}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </label>
              <label>
                {t.reason}
                <textarea
                  maxLength={1000}
                  style={field}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <p>{t.reasonHelp}</p>
            </>
          )}
          {invalid && <p role="alert">{t.invalid}</p>}
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <button style={button} disabled={!canAct} onClick={() => void act()}>
              {busy ? t.submitting : t.confirm}
            </button>
            <button
              style={button}
              onClick={() => {
                setPending(null);
                returnFocus.current?.focus();
              }}
            >
              {t.cancel}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
