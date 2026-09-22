import {
  color,
  FocusVisiblePressable,
  OfflineNoQueueBanner,
  RouteStatePanel,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import type { Appointment, QueuePosition, Slot } from '@shifaa/contracts';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { createPatientClinicSchedulingClient } from '../../src/clinic-scheduling-api';
import {
  ClinicSchedulingShell,
  schedulingCopy,
  type SchedulingCopyKey,
} from '../../src/ClinicSchedulingShell';
import { patientAccessTokens } from '../../src/patient-auth-store';
import { patientOnboardingApi } from '../../src/identity-onboarding-api';
import { usePatientLocaleController } from '../../src/locale-context';

type ViewState =
  | 'loading'
  | 'ready'
  | 'offline'
  | 'stale'
  | 'permission'
  | 'error'
  | 'terminal'
  | 'conflict'
  | 'submitting'
  | 'uncertain'
  | 'success';
type Action = 'cancel' | 'reschedule' | 'check-in';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const statusOf = (error: unknown) =>
  error && typeof error === 'object' && 'status' in error
    ? (error as { status?: unknown }).status
    : null;
const uncertain = (error: unknown) =>
  error instanceof TypeError || [408, 429, 500, 502, 503, 504].includes(Number(statusOf(error)));
function civilDateAt(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function formatInstant(locale: 'ar-EG' | 'en-EG', instant: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(instant));
}
function displayTime(value: string, locale: 'ar-EG' | 'en-EG', timezone: string): string {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return '—';
  try {
    return new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(instant);
  } catch {
    return '—';
  }
}

export default function PatientAppointmentRoute() {
  const { id, patientId: managedPatientId } = useLocalSearchParams<{
    id?: string;
    patientId?: string;
  }>();
  const { locale } = usePatientLocaleController();
  const copy = (key: SchedulingCopyKey) => schedulingCopy(locale, key);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const [state, setState] = useState<ViewState>('loading');
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [queue, setQueue] = useState<QueuePosition | null>(null);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const resultFocus = useRef<View>(null);
  const confirmFocus = useRef<View>(null);
  const actionFocus = useRef<View>(null);
  const returnFocus = useRef(false);
  const reasonFocus = useRef<TextInput>(null);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const pendingKey = useRef<{ action: Action; key: string } | null>(null);
  const api = useMemo(
    () =>
      createPatientClinicSchedulingClient({
        locale,
        ...(patientId ? { patientId } : {}),
        accessToken: () => patientAccessTokens.read(),
      }),
    [locale, patientId],
  );

  const load = async () => {
    const request = ++revision.current;
    if (!id || !uuid.test(id)) {
      setState('terminal');
      return;
    }
    if (isOffline()) {
      setState('offline');
      return;
    }
    if (!patientAccessTokens.read()) {
      setAppointment(null);
      setQueue(null);
      setState('permission');
      return;
    }
    setState('loading');
    setAppointment(null);
    setQueue(null);
    setQueueUnavailable(false);
    try {
      const profile = await patientOnboardingApi.getProfile();
      if (request !== revision.current) return;
      if (!uuid.test(profile.id)) {
        setState('permission');
        return;
      }
      const contextId = managedPatientId ?? profile.id;
      if (!uuid.test(contextId)) {
        setState('permission');
        return;
      }
      setPatientId(contextId);
      const currentApi = createPatientClinicSchedulingClient({
        locale,
        patientId: contextId,
        accessToken: () => patientAccessTokens.read(),
      });
      const item = await currentApi.getMyAppointment(id);
      if (request !== revision.current) return;
      if (item.patientId !== contextId || item.id !== id) {
        setState('permission');
        return;
      }
      setAppointment(item);
      setConfirm(null);
      setSelected(null);
      setSlots([]);
      setQueue(null);
      setQueueUnavailable(false);
      if (
        item.status === 'checked_in' ||
        item.status === 'in_queue' ||
        item.status === 'reschedule_required'
      ) {
        try {
          const own = await currentApi.getMyQueuePosition(id);
          if (request === revision.current && own.appointmentId === id) setQueue(own);
        } catch (error) {
          if (statusOf(error) === 401 || statusOf(error) === 403) {
            setAppointment(null);
            setState('permission');
            return;
          }
          if (request === revision.current) setQueueUnavailable(true);
        }
      }
      if (request === revision.current) setState('ready');
    } catch (error) {
      if (request !== revision.current) return;
      const code = statusOf(error);
      setState(code === 401 || code === 403 ? 'permission' : code === 404 ? 'terminal' : 'error');
    }
  };
  useEffect(() => {
    void load();
    return () => {
      revision.current += 1;
    };
  }, [id, managedPatientId, locale]);
  useEffect(() => {
    if (['success', 'conflict', 'uncertain', 'error'].includes(state))
      resultFocus.current?.focus?.();
  }, [state]);
  useEffect(() => {
    if (confirm && state === 'ready') {
      if (confirm === 'cancel' || confirm === 'reschedule') reasonFocus.current?.focus?.();
      else confirmFocus.current?.focus?.();
    }
  }, [confirm, state]);
  useEffect(() => {
    if (!confirm && returnFocus.current) {
      actionFocus.current?.focus?.();
      returnFocus.current = false;
    }
  }, [confirm]);
  const closeConfirm = () => {
    returnFocus.current = true;
    setConfirm(null);
    setSelected(null);
  };

  const canEdit =
    appointment?.status === 'reschedule_required' ||
    (appointment?.status === 'confirmed' && Date.parse(appointment.startsAt) > Date.now());
  const canCheckIn = appointment?.status === 'confirmed';
  const getSlots = async () => {
    if (!appointment || !canEdit || isOffline()) {
      setState('offline');
      return;
    }
    setState('loading');
    try {
      const fromDate = civilDateAt(Date.now(), appointment.timezone);
      const toDate = civilDateAt(Date.now() + 14 * 86400000, appointment.timezone);
      const page = await api.listDoctorAvailability(appointment.facilityId, appointment.doctorId, {
        fromDate,
        toDate,
      });
      setSlots(
        page.freshness !== 'fresh'
          ? []
          : page.items.filter(
              (slot) =>
                slot.facilityId === appointment.facilityId &&
                slot.doctorId === appointment.doctorId &&
                Date.parse(slot.startsAt) > Date.now(),
            ),
      );
      setState(page.freshness !== 'fresh' ? 'stale' : 'ready');
    } catch (error) {
      setState(statusOf(error) === 403 ? 'permission' : 'error');
    }
  };
  const submit = async (action: Action) => {
    if (!appointment || !patientId || inFlight.current || isOffline()) {
      if (isOffline()) setState('offline');
      return;
    }
    if ((action === 'check-in' && !canCheckIn) || (action !== 'check-in' && !canEdit)) {
      setState('stale');
      return;
    }
    if (
      action !== 'check-in' &&
      (!reason.trim() || reason.trim().length > 500 || /[\r\n\t]/.test(reason))
    ) {
      reasonFocus.current?.focus();
      return;
    }
    if (action === 'reschedule' && (!selected || Date.parse(selected.startsAt) <= Date.now()))
      return;
    inFlight.current = true;
    setState('submitting');
    const key =
      pendingKey.current?.action === action
        ? pendingKey.current.key
        : `clinic-ui-009-${action}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    pendingKey.current = { action, key };
    try {
      const result =
        action === 'cancel'
          ? await api.cancelMyAppointment(
              appointment.id,
              { reason: reason.trim() },
              appointment.version,
              key,
            )
          : action === 'reschedule'
            ? await api.rescheduleMyAppointment(
                appointment.id,
                {
                  startsAt: selected!.startsAt,
                  endsAt: selected!.endsAt,
                  timezone: selected!.timezone,
                  civilDate: selected!.civilDate,
                  reason: reason.trim(),
                },
                appointment.version,
                key,
              )
            : (await api.checkInMyAppointment(appointment.id, appointment.version, key))
                .appointment;
      pendingKey.current = null;
      if (result.id !== appointment.id || result.patientId !== patientId) {
        setState('terminal');
        return;
      }
      setAppointment(result);
      setLastAction(action);
      setConfirm(null);
      setSelected(null);
      setSlots([]);
      setQueue(null);
      setQueueUnavailable(false);
      if (action === 'check-in') {
        try {
          const own = await api.getMyQueuePosition(result.id);
          if (own.appointmentId === result.id) setQueue(own);
          else setQueueUnavailable(true);
        } catch (error) {
          if (statusOf(error) === 401 || statusOf(error) === 403) {
            setAppointment(null);
            setState('permission');
            return;
          }
          setQueueUnavailable(true);
        }
      }
      setState('success');
    } catch (error) {
      const code = statusOf(error);
      if (code === 409 || code === 412) {
        pendingKey.current = null;
        setState('conflict');
      } else if (code === 401 || code === 403) {
        pendingKey.current = null;
        setState('permission');
      } else if (uncertain(error)) setState('uncertain');
      else {
        pendingKey.current = null;
        setState('error');
      }
    } finally {
      inFlight.current = false;
    }
  };
  const label = (text: string) => (
    <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{text}</Text>
  );
  const technicalLabel = (prefix: string, value: string) => (
    <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
      {prefix}: <Text style={{ writingDirection: 'ltr' }}>{`\u2066${value}\u2069`}</Text>
    </Text>
  );
  const identifier = (title: string, value: string) => (
    <View style={{ gap: spacing.xs }} accessibilityLabel={`${title}: ${value}`}>
      {label(title)}
      <Text
        selectable
        style={{
          ...localizedType(locale, 'body'),
          color: color.ink,
          writingDirection: 'ltr',
          textAlign: 'left',
        }}
      >
        {value}
      </Text>
    </View>
  );
  const button = (text: string, onPress: () => void, primary = false) => (
    <FocusVisiblePressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      style={
        primary
          ? { ...semanticStyles.primaryAction, minHeight: 48, justifyContent: 'center' }
          : { minHeight: 48, justifyContent: 'center' }
      }
    >
      <Text
        style={{
          ...localizedType(locale, 'label'),
          color: primary ? color.inverse : color.brand,
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </FocusVisiblePressable>
  );
  return (
    <ClinicSchedulingShell title="clinic.route.appointment.title">
      {label(copy('clinic.route.appointment.description'))}
      {appointment && (
        <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
          {technicalLabel(copy('clinic.book.patient'), appointment.patientId)}
          {technicalLabel(copy('clinic.book.doctor'), appointment.doctorId)}
          {technicalLabel(copy('clinic.book.facility'), appointment.facilityId)}
          {label(
            `${copy(`clinic.appointment.status.${appointment.status}` as SchedulingCopyKey)} · ${formatInstant(locale, appointment.startsAt, appointment.timezone)}`,
          )}
          {label(
            `${copy('clinic.discover.fee')}: ${(appointment.feeMinorUnits / 100).toFixed(2)} EGP`,
          )}
          {label(copy('clinic.payment.cashInstruction'))}
          {queue && (
            <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
              {label(copy(`clinic.queue.status.${queue.state}` as SchedulingCopyKey))}
              {queue.position != null &&
                label(copy('clinic.queue.position').replace('{position}', String(queue.position)))}
              {queue.estimatedServiceAt &&
                label(
                  copy('clinic.queue.estimate').replace(
                    '{timestamp}',
                    formatInstant(locale, queue.estimatedServiceAt, appointment.timezone),
                  ),
                )}
              {label(
                copy('clinic.queue.lastUpdated').replace(
                  '{timestamp}',
                  formatInstant(locale, queue.updatedAt, appointment.timezone),
                ),
              )}
              {queue.stale && label(copy('clinic.queue.mayBeOutdated'))}
            </View>
          )}
          {queueUnavailable &&
            label(
              locale === 'ar-EG'
                ? 'موضع الانتظار غير متاح الآن. حدّث البيانات لاحقًا؛ حالة الموعد من الخادم محفوظة.'
                : 'Your queue position is unavailable right now. Refresh later; the server appointment state is retained.',
            )}
        </View>
      )}
      {state === 'loading' && (
        <RouteStatePanel title={copy('clinic.state.loading')} direction={direction} />
      )}
      {state === 'offline' && (
        <OfflineNoQueueBanner text={copy('clinic.state.offline')} direction={direction} />
      )}
      {state === 'permission' && (
        <RouteStatePanel title={copy('clinic.state.permission')} direction={direction} />
      )}
      {state === 'terminal' && (
        <RouteStatePanel title={copy('clinic.state.unavailable')} direction={direction} />
      )}
      {state === 'stale' && (
        <RouteStatePanel
          title={copy('clinic.state.stale')}
          actionLabel={copy('clinic.state.refresh')}
          onAction={() => void load()}
          direction={direction}
        />
      )}
      {state === 'submitting' && (
        <RouteStatePanel title={copy('clinic.state.loading')} direction={direction} />
      )}
      {(state === 'ready' || state === 'success') && appointment && (
        <>
          {appointment.status === 'reschedule_required' && (
            <RouteStatePanel title={copy('clinic.result.absence')} direction={direction} />
          )}
          {canEdit && !confirm && (
            <View ref={actionFocus} focusable style={{ gap: spacing.sm }}>
              {button(copy('clinic.confirm.cancelTitle'), () => setConfirm('cancel'))}
              {button(copy('clinic.confirm.rescheduleTitle'), () => {
                setConfirm('reschedule');
                void getSlots();
              })}
            </View>
          )}
          {canCheckIn &&
            !confirm &&
            button(locale === 'ar-EG' ? 'تسجيل الحضور' : 'Check in', () => setConfirm('check-in'))}
          {confirm === 'cancel' && (
            <View
              ref={confirmFocus}
              focusable
              accessibilityRole="alert"
              style={{ ...semanticStyles.card, gap: spacing.sm }}
            >
              {label(copy('clinic.confirm.cancelHelp'))}
              <TextInput
                ref={reasonFocus}
                accessibilityLabel={locale === 'ar-EG' ? 'سبب الإلغاء' : 'Cancellation reason'}
                value={reason}
                onChangeText={setReason}
                maxLength={500}
                multiline
                style={{ ...localizedType(locale, 'body'), color: color.ink, minHeight: 48 }}
              />
              {button(copy('clinic.confirm.cancelTitle'), () => void submit('cancel'), true)}
              {button(locale === 'ar-EG' ? 'العودة' : 'Back', closeConfirm)}
            </View>
          )}
          {confirm === 'reschedule' && (
            <View
              ref={confirmFocus}
              focusable
              accessibilityRole="alert"
              style={{ ...semanticStyles.card, gap: spacing.sm }}
            >
              {label(copy('clinic.confirm.rescheduleHelp'))}
              <TextInput
                ref={reasonFocus}
                accessibilityLabel={
                  locale === 'ar-EG' ? 'سبب إعادة الجدولة' : 'Rescheduling reason'
                }
                value={reason}
                onChangeText={setReason}
                maxLength={500}
                style={{ ...localizedType(locale, 'body'), color: color.ink, minHeight: 48 }}
              />
              {label(copy('clinic.result.noSlotHeld'))}
              {slots.length === 0 && label(copy('clinic.doctor.noSlots'))}
              {slots.map((slot) =>
                button(
                  `${formatInstant(locale, slot.startsAt, slot.timezone)}${selected?.startsAt === slot.startsAt ? ` · ${copy('clinic.doctor.selected')}` : ''}`,
                  () => setSelected(slot),
                ),
              )}
              {selected &&
                button(
                  copy('clinic.confirm.rescheduleTitle'),
                  () => void submit('reschedule'),
                  true,
                )}
              {button(locale === 'ar-EG' ? 'العودة' : 'Back', closeConfirm)}
            </View>
          )}
          {confirm === 'check-in' && (
            <View
              ref={confirmFocus}
              focusable
              accessibilityRole="alert"
              style={{ ...semanticStyles.card, gap: spacing.sm }}
            >
              {label(
                locale === 'ar-EG'
                  ? 'أكد تسجيل الحضور لهذا الموعد.'
                  : 'Confirm check-in for this appointment.',
              )}
              {button(
                locale === 'ar-EG' ? 'تأكيد تسجيل الحضور' : 'Confirm check-in',
                () => void submit('check-in'),
                true,
              )}
              {button(locale === 'ar-EG' ? 'العودة' : 'Back', closeConfirm)}
            </View>
          )}
          {queue && button(copy('clinic.state.refresh'), () => void load())}
        </>
      )}
      <View ref={resultFocus} focusable accessibilityLiveRegion="polite">
        {state === 'conflict' && (
          <RouteStatePanel
            title={copy('clinic.state.conflict')}
            actionLabel={copy('clinic.state.refresh')}
            onAction={() => void load()}
            assertive
            direction={direction}
          />
        )}
        {state === 'error' && (
          <RouteStatePanel
            title={copy('clinic.state.error')}
            actionLabel={copy('clinic.state.refresh')}
            onAction={() => void load()}
            assertive
            direction={direction}
          />
        )}
        {state === 'uncertain' && (
          <RouteStatePanel
            title={
              locale === 'ar-EG'
                ? 'نتيجة الإجراء غير مؤكدة؛ حدّث الموعد قبل أي إجراء جديد.'
                : 'The action outcome is uncertain. Refresh before a new action.'
            }
            actionLabel={copy('clinic.state.refresh')}
            onAction={() => void load()}
            assertive
            direction={direction}
          />
        )}
        {state === 'success' && appointment && (
          <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
            {label(copy('clinic.state.success'))}
            {label(copy(`clinic.appointment.status.${appointment.status}` as SchedulingCopyKey))}
            {label(copy('clinic.result.reference').replace('{reference}', appointment.id))}
            {label(copy('clinic.result.time').replace('{timestamp}', new Date().toISOString()))}
            {label(
              copy('clinic.result.nextStep').replace(
                '{nextStep}',
                lastAction === 'check-in'
                  ? locale === 'ar-EG'
                    ? 'تابع موضعك في الانتظار.'
                    : 'Follow your own queue position.'
                  : copy('clinic.payment.cashInstruction'),
              ),
            )}
          </View>
        )}
      </View>
    </ClinicSchedulingShell>
  );
}
