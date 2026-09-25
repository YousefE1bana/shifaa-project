import {
  color,
  FocusVisiblePressable,
  OfflineNoQueueBanner,
  RouteStatePanel,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import type { Appointment, PublicDoctorProjection, Slot } from '@shifaa/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  createPatientClinicSchedulingClient,
  type PatientClinicSchedulingApi,
} from '../../src/clinic-scheduling-api';
import {
  BookingAttemptGate,
  bookingResultMatchesSelection,
  bookingSuccessSnapshot,
  isUncertainBookingError,
  preservesUncertainBooking,
  validateBookingSelection,
} from '../../src/clinic-scheduling-booking';
import { findCurrentDoctorIdentity } from '../../src/clinic-scheduling-discovery';
import { bookingFailureState, reconcileBooking } from '../../src/clinic-scheduling-view-models';
import {
  ClinicSchedulingShell,
  ClinicTechnicalTimestamp,
  schedulingCopy,
  type SchedulingCopyKey,
} from '../../src/ClinicSchedulingShell';
import { patientAccessTokens } from '../../src/patient-auth-store';
import { patientOnboardingApi } from '../../src/identity-onboarding-api';
import { usePatientLocaleController } from '../../src/locale-context';

type BookingState =
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'validation'
  | 'conflict'
  | 'offline'
  | 'error-recoverable'
  | 'error-terminal'
  | 'permission-denied'
  | 'identity-unavailable'
  | 'uncertain'
  | 'success'
  | 'stale';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NewAppointmentRoute() {
  const params = useLocalSearchParams<{
    facilityId?: string;
    doctorId?: string;
    startsAt?: string;
    endsAt?: string;
    civilDate?: string;
    timezone?: string;
  }>();
  const router = useRouter();
  const { locale } = usePatientLocaleController();
  const copy = (key: SchedulingCopyKey) => schedulingCopy(locale, key);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const readApi = useMemo(() => createPatientClinicSchedulingClient({ locale }), [locale]);
  const bookingApi = useRef<PatientClinicSchedulingApi | null>(null);
  const request = useRef(0);
  const attemptGate = useRef(new BookingAttemptGate());
  const loadedSelection = useRef<string | null>(null);
  const invalidFocus = useRef<View>(null);
  const resultFocus = useRef<View>(null);
  const [state, setState] = useState<BookingState>('loading');
  const [patient, setPatient] = useState<{ id: string; displayName: string } | null>(null);
  const [doctor, setDoctor] = useState<PublicDoctorProjection | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Appointment | null>(null);
  const selected: Slot = {
    facilityId: params.facilityId ?? '',
    doctorId: params.doctorId ?? '',
    startsAt: params.startsAt ?? '',
    endsAt: params.endsAt ?? '',
    civilDate: params.civilDate ?? '',
    timezone: params.timezone ?? '',
  };
  const valid =
    uuid.test(selected.facilityId) &&
    uuid.test(selected.doctorId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(selected.civilDate) &&
    Number.isFinite(Date.parse(selected.startsAt)) &&
    Number.isFinite(Date.parse(selected.endsAt)) &&
    selected.timezone.length > 0;
  const currentSlots = () =>
    router.push({
      pathname: '/doctors/[id]',
      params: { id: selected.doctorId, facilityId: selected.facilityId },
    });
  const load = async () => {
    if (!valid) {
      setState('error-terminal');
      return;
    }
    const id = ++request.current;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return;
    }
    if (!patientAccessTokens.read()) {
      setState('permission-denied');
      return;
    }
    setState('loading');
    try {
      const [profile, page, identity] = await Promise.all([
        patientOnboardingApi.getProfile(),
        readApi.listDoctorAvailability(selected.facilityId, selected.doctorId, {
          fromDate: selected.civilDate,
          toDate: selected.civilDate,
        }),
        findCurrentDoctorIdentity(
          (cursor) =>
            readApi.searchDoctors({
              facilityId: selected.facilityId,
              ...(cursor ? { cursor } : {}),
            }),
          selected.facilityId,
          selected.doctorId,
        ),
      ]);
      if (id !== request.current) return;
      if (!uuid.test(profile.id)) {
        setState('permission-denied');
        return;
      }
      if (!identity) {
        setState('identity-unavailable');
        return;
      }
      const verdict = validateBookingSelection(page, selected);
      if (verdict !== 'ready') {
        setState(verdict === 'invalid' ? 'error-terminal' : verdict);
        return;
      }
      setPatient({ id: profile.id, displayName: profile.display_name });
      setDoctor(identity);
      setFee(page.feeMinorUnits);
      bookingApi.current = createPatientClinicSchedulingClient({
        locale,
        patientId: profile.id,
        accessToken: () => patientAccessTokens.read(),
      });
      setState('ready');
    } catch (error) {
      if (id !== request.current) return;
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status?: unknown }).status
          : null;
      setState(status === 401 || status === 403 ? 'permission-denied' : 'error-recoverable');
    }
  };
  useEffect(() => {
    const signature = JSON.stringify(selected);
    const sameUncertainSelection = preservesUncertainBooking(
      loadedSelection.current ?? '',
      signature,
      state === 'uncertain',
    );
    if (loadedSelection.current !== signature) {
      setConfirmed(false);
      setFee(null);
      setPatient(null);
      setDoctor(null);
      setResult(null);
      bookingApi.current = null;
    }
    if (!sameUncertainSelection) void load();
    loadedSelection.current = signature;
    return () => {
      request.current += 1;
    };
  }, [
    locale,
    params.facilityId,
    params.doctorId,
    params.startsAt,
    params.endsAt,
    params.civilDate,
    params.timezone,
  ]);
  useEffect(() => {
    if (state === 'validation') invalidFocus.current?.focus?.();
    if (state === 'conflict' || state === 'success' || state === 'uncertain')
      resultFocus.current?.focus?.();
  }, [state]);
  const submit = async () => {
    const submissionSignature = JSON.stringify(selected);
    const uncertainRetry = state === 'uncertain';
    if (!patient || !bookingApi.current || fee === null) {
      setState('permission-denied');
      return;
    }
    if (!confirmed) {
      setState('validation');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return;
    }
    if (!attemptGate.current.enter()) return;
    setState('submitting');
    try {
      if (!uncertainRetry) {
        const page = await readApi.listDoctorAvailability(selected.facilityId, selected.doctorId, {
          fromDate: selected.civilDate,
          toDate: selected.civilDate,
        });
        if (loadedSelection.current !== submissionSignature) return;
        const verdict = validateBookingSelection(page, selected, fee);
        if (verdict !== 'ready') {
          setState(verdict === 'invalid' ? 'error-terminal' : verdict);
          return;
        }
      }
      const booked = reconcileBooking(
        await bookingApi.current.createAppointment({
          ...selected,
          paymentMethod: 'cash_on_arrival',
        }),
      );
      if (loadedSelection.current !== submissionSignature) return;
      if (
        booked.status !== 'success' ||
        !bookingResultMatchesSelection(booked.data, selected, patient.id)
      ) {
        setState('error-terminal');
        return;
      }
      setResult(booked.data);
      setState('success');
    } catch (error) {
      if (loadedSelection.current !== submissionSignature) return;
      const failed = bookingFailureState(error);
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status?: unknown }).status
          : null;
      setState(
        status === 401 || status === 403
          ? 'permission-denied'
          : isUncertainBookingError(error)
            ? 'uncertain'
            : failed.status === 'error'
              ? 'error-recoverable'
              : failed.status,
      );
    } finally {
      attemptGate.current.leave();
    }
  };
  return (
    <ClinicSchedulingShell title="clinic.route.appointmentNew.title">
      {!valid && <RouteStatePanel title={copy('clinic.book.invalidRoute')} direction={direction} />}
      {valid && (
        <>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {copy('clinic.route.appointmentNew.description')}
          </Text>
          <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
            <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
              {copy('clinic.book.patient')}: {patient?.displayName ?? '—'}
            </Text>
            {doctor && (
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {copy('clinic.book.doctor')}: {doctor.doctorDisplayName}
              </Text>
            )}
            {doctor && (
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {copy('clinic.book.facility')}: {doctor.facilityDisplayName}
              </Text>
            )}
            <ClinicTechnicalTimestamp
              label={`${copy('clinic.book.slot')}:`}
              value={selected.startsAt}
              locale={locale}
            />
            {state !== 'success' && fee !== null && (
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {copy('clinic.discover.fee')}: {fee / 100} EGP
              </Text>
            )}
            <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
              {copy('clinic.payment.cashInstruction')}
            </Text>
          </View>
          <View
            ref={invalidFocus}
            focusable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
          >
            <FocusVisiblePressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              accessibilityLabel={copy('clinic.book.confirmPatient')}
              onPress={() => {
                setConfirmed(!confirmed);
                if (state === 'validation') setState('ready');
              }}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                {confirmed ? '☑ ' : '☐ '}
                {copy('clinic.book.confirmPatient')}
              </Text>
            </FocusVisiblePressable>
          </View>
          {(state === 'ready' || state === 'validation' || state === 'uncertain') && (
            <FocusVisiblePressable
              accessibilityRole="button"
              onPress={() => void submit()}
              style={{ ...semanticStyles.primaryAction, minHeight: 48 }}
            >
              <Text
                style={{
                  ...localizedType(locale, 'label'),
                  color: color.inverse,
                  textAlign: 'center',
                }}
              >
                {state === 'uncertain' ? copy('clinic.state.retry') : copy('clinic.book.create')}
              </Text>
            </FocusVisiblePressable>
          )}
          {state === 'loading' && (
            <RouteStatePanel title={copy('clinic.state.loading')} direction={direction} />
          )}
          {state === 'submitting' && (
            <RouteStatePanel
              title={copy('clinic.book.create')}
              detail={copy('clinic.state.loading')}
              direction={direction}
            />
          )}
          {state === 'offline' && (
            <OfflineNoQueueBanner text={copy('clinic.state.offline')} direction={direction} />
          )}
          {state === 'permission-denied' && (
            <RouteStatePanel title={copy('clinic.book.permission')} direction={direction} />
          )}
          {state === 'identity-unavailable' && (
            <RouteStatePanel
              title={copy('clinic.doctor.identityUnavailable')}
              actionLabel={copy('clinic.state.refresh')}
              onAction={() => void load()}
              direction={direction}
            />
          )}
          {state === 'stale' && (
            <RouteStatePanel
              title={copy('clinic.book.stale')}
              actionLabel={copy('clinic.state.refresh')}
              onAction={() => void load()}
              direction={direction}
            />
          )}
          {state === 'error-recoverable' && (
            <RouteStatePanel
              title={copy('clinic.state.error')}
              actionLabel={copy('clinic.state.retry')}
              onAction={() => void load()}
              direction={direction}
            />
          )}
          {state === 'error-terminal' && (
            <RouteStatePanel
              title={copy('clinic.state.errorTerminal')}
              detail={copy('clinic.state.errorTerminalHelp')}
              actionLabel={copy('clinic.state.returnHome')}
              onAction={() => router.push('/profile')}
              direction={direction}
            />
          )}
          <View ref={resultFocus} focusable accessibilityLiveRegion="polite">
            {state === 'validation' && (
              <RouteStatePanel
                title={copy('clinic.book.validation')}
                assertive
                direction={direction}
              />
            )}
            {state === 'conflict' && (
              <RouteStatePanel
                title={copy('clinic.book.conflict')}
                actionLabel={copy('clinic.book.currentSlots')}
                onAction={currentSlots}
                assertive
                direction={direction}
              />
            )}
            {state === 'uncertain' && (
              <RouteStatePanel
                title={copy('clinic.book.uncertain')}
                assertive
                direction={direction}
              />
            )}
            {state === 'success' && result && (
              <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
                <Text
                  accessibilityRole="header"
                  style={{ ...localizedType(locale, 'title'), color: color.ink }}
                >
                  {copy('clinic.book.success')}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {copy('clinic.appointment.status.confirmed')}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {bookingSuccessSnapshot(result, locale).fee}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {bookingSuccessSnapshot(result, locale).payment}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {copy('clinic.result.reference').replace('{reference}', result.id)}
                </Text>
                <ClinicTechnicalTimestamp
                  label={copy('clinic.result.time').replace('{timestamp}', '').trim()}
                  value={result.startsAt}
                  locale={locale}
                />
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {bookingSuccessSnapshot(result, locale).nextStep}
                </Text>
              </View>
            )}
          </View>
          {state !== 'success' && (
            <FocusVisiblePressable
              accessibilityRole="link"
              onPress={currentSlots}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
                {copy('clinic.book.currentSlots')}
              </Text>
            </FocusVisiblePressable>
          )}
        </>
      )}
    </ClinicSchedulingShell>
  );
}
