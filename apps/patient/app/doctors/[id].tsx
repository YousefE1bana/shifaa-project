import {
  color,
  FocusVisiblePressable,
  OfflineNoQueueBanner,
  RouteStatePanel,
  StalenessIndicator,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import type { PublicDoctorProjection, Slot } from '@shifaa/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  createPatientClinicSchedulingClient,
  isClinicSchedulingOffline,
} from '../../src/clinic-scheduling-api';
import {
  canContinueToBooking,
  findCurrentDoctorIdentity,
  slotMatchesDoctor,
} from '../../src/clinic-scheduling-discovery';
import {
  reconcileAvailability,
  readFailureState,
  type AvailabilityViewState,
} from '../../src/clinic-scheduling-view-models';
import {
  ClinicSchedulingShell,
  ClinicTechnicalTimestamp,
  schedulingCopy,
  type SchedulingCopyKey,
} from '../../src/ClinicSchedulingShell';
import { usePatientLocaleController } from '../../src/locale-context';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const todayCairo = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export default function DoctorRoute() {
  const params = useLocalSearchParams<{ id?: string; facilityId?: string }>();
  const router = useRouter();
  const { locale } = usePatientLocaleController();
  const copy = (key: SchedulingCopyKey) => schedulingCopy(locale, key);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const api = useMemo(() => createPatientClinicSchedulingClient({ locale }), [locale]);
  const [date, setDate] = useState(todayCairo);
  const [state, setState] = useState<
    AvailabilityViewState | { status: 'permission-denied' } | null
  >(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [doctor, setDoctor] = useState<PublicDoctorProjection | null>(null);
  const [identityUnavailable, setIdentityUnavailable] = useState(false);
  const [identityCurrent, setIdentityCurrent] = useState(false);
  const [online, setOnline] = useState(() => !isClinicSchedulingOffline());
  const sequence = useRef(0);
  const heading = useRef<View>(null);
  const valid = uuid.test(params.id ?? '') && uuid.test(params.facilityId ?? '');
  const load = async () => {
    if (!valid) return;
    const request = ++sequence.current;
    const connected = !isClinicSchedulingOffline();
    setOnline(connected);
    setSelected(null);
    setDoctor(null);
    setIdentityUnavailable(false);
    setIdentityCurrent(false);
    if (!connected) {
      setState({ status: 'offline', error: new Error('offline-no-queue') });
      return;
    }
    setState({ status: 'loading' });
    try {
      const [matching, availability] = await Promise.all([
        findCurrentDoctorIdentity(
          (cursor) =>
            api.searchDoctors({ facilityId: params.facilityId!, ...(cursor ? { cursor } : {}) }),
          params.facilityId!,
          params.id!,
        ),
        api.listDoctorAvailability(params.facilityId!, params.id!, {
          fromDate: date,
          toDate: date,
        }),
      ]);
      if (request === sequence.current) {
        const paymentValid =
          availability.currency === 'EGP' && availability.paymentMethod === 'cash_on_arrival';
        setDoctor(matching);
        setIdentityUnavailable(!matching || !paymentValid);
        setIdentityCurrent(Boolean(matching));
        setState(
          paymentValid
            ? reconcileAvailability(availability)
            : { status: 'error', error: new Error('invalid-payment-projection') },
        );
      }
    } catch (error) {
      if (request !== sequence.current) return;
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status?: unknown }).status
          : null;
      setState(
        status === 401 || status === 403
          ? { status: 'permission-denied' }
          : readFailureState(error),
      );
    } finally {
      if (request === sequence.current) heading.current?.focus?.();
    }
  };
  useEffect(() => {
    void load();
  }, [params.id, params.facilityId, locale]);
  const freshness = state && 'data' in state ? state.freshness : 'unknown';
  const canContinue =
    Boolean(
      doctor &&
        identityCurrent &&
        !identityUnavailable &&
        slotMatchesDoctor(selected, params.facilityId!, params.id!),
    ) && canContinueToBooking(freshness, selected !== null, online);
  return (
    <ClinicSchedulingShell title="clinic.route.doctor.title">
      <FocusVisiblePressable
        accessibilityRole="link"
        onPress={() => router.push('/discover')}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
          {copy('clinic.doctor.back')}
        </Text>
      </FocusVisiblePressable>
      {!valid ? (
        <RouteStatePanel title={copy('clinic.doctor.invalid')} direction={direction} />
      ) : (
        <>
          {doctor && (
            <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
              <Text
                accessibilityRole="header"
                style={{ ...localizedType(locale, 'title'), color: color.ink }}
              >
                {doctor.doctorDisplayName}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {doctor.specialty} · {doctor.facilityDisplayName}
              </Text>
              <Text style={{ ...localizedType(locale, 'label'), color: color.positive }}>
                {copy('clinic.discover.verified')}
              </Text>
            </View>
          )}
          {identityUnavailable && (
            <RouteStatePanel
              title={copy('clinic.doctor.identityUnavailable')}
              detail={copy('clinic.discover.noCurrent')}
              actionLabel={copy('clinic.state.refresh')}
              onAction={() => void load()}
              direction={direction}
            />
          )}
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {copy('clinic.route.doctor.description')}
          </Text>
          <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
            <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
              {copy('clinic.doctor.date')}
            </Text>
            <TextInput
              accessibilityLabel={copy('clinic.doctor.date')}
              value={date}
              onChangeText={(value) => {
                setDate(value);
                setSelected(null);
                setState(null);
              }}
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: color.border,
                paddingInline: spacing.md,
                ...localizedType(locale, 'body'),
              }}
            />
            <FocusVisiblePressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={semanticStyles.primaryAction}
            >
              <Text
                style={{
                  ...localizedType(locale, 'label'),
                  color: color.inverse,
                  textAlign: 'center',
                }}
              >
                {copy('clinic.doctor.load')}
              </Text>
            </FocusVisiblePressable>
          </View>
          <View ref={heading} focusable accessibilityRole="header">
            <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>
              {copy('clinic.doctor.slots')}
            </Text>
          </View>
          {state?.status === 'loading' && (
            <RouteStatePanel title={copy('clinic.state.loading')} direction={direction} />
          )}
          {state?.status === 'offline' && (
            <OfflineNoQueueBanner text={copy('clinic.state.offline')} direction={direction} />
          )}
          {state?.status === 'permission' && (
            <RouteStatePanel title={copy('clinic.state.permission')} direction={direction} />
          )}
          {state?.status === 'permission-denied' && (
            <RouteStatePanel title={copy('clinic.state.permission')} direction={direction} />
          )}
          {state?.status === 'error' && (
            <RouteStatePanel
              title={copy('clinic.state.error')}
              actionLabel={copy('clinic.state.retry')}
              onAction={() => void load()}
              direction={direction}
            />
          )}
          {state?.status === 'terminal' && (
            <RouteStatePanel
              title={copy('clinic.state.errorTerminal')}
              detail={copy('clinic.state.errorTerminalHelp')}
              actionLabel={copy('clinic.state.returnHome')}
              onAction={() => router.push('/profile')}
              direction={direction}
            />
          )}
          {state?.status === 'empty' && (
            <RouteStatePanel title={copy('clinic.doctor.noSlots')} direction={direction} />
          )}
          {state && 'data' in state && !identityUnavailable && (
            <>
              <StalenessIndicator
                state={state.freshness}
                label={copy(
                  state.freshness === 'fresh'
                    ? 'clinic.doctor.slots'
                    : state.freshness === 'stale'
                      ? 'clinic.discover.stale'
                      : 'clinic.discover.unknown',
                )}
                updatedLabel={copy('clinic.discover.updated')}
                updatedAt={state.data.generatedAt}
                direction={direction}
                separateUpdatedAt
              />
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {copy('clinic.discover.fee')}: {state.data.feeMinorUnits / 100} EGP
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {copy('clinic.payment.cashInstruction')}
              </Text>
              {state.data.items
                .filter((slot) => slotMatchesDoctor(slot, params.facilityId!, params.id!))
                .map((slot) => (
                  <FocusVisiblePressable
                    key={`${slot.startsAt}:${slot.endsAt}`}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: selected?.startsAt === slot.startsAt,
                      disabled: state.freshness !== 'fresh',
                    }}
                    accessibilityLabel={`${copy('clinic.doctor.choose')}: ${slot.startsAt}`}
                    disabled={state.freshness !== 'fresh'}
                    onPress={() => setSelected(slot)}
                    style={{ ...semanticStyles.card, minHeight: 48, justifyContent: 'center' }}
                  >
                    <Text
                      style={{
                        ...localizedType(locale, 'body'),
                        color: color.ink,
                        direction: 'ltr',
                        writingDirection: 'ltr',
                        textAlign: 'left',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {slot.startsAt}
                    </Text>
                  </FocusVisiblePressable>
                ))}
            </>
          )}
          {selected && (
            <View accessibilityLiveRegion="polite">
              <ClinicTechnicalTimestamp
                label={`${copy('clinic.doctor.selected')}:`}
                value={selected.startsAt}
                locale={locale}
              />
            </View>
          )}
          {(state?.status === 'stale' || state?.status === 'unknown') && (
            <RouteStatePanel
              title={copy('clinic.discover.noCurrent')}
              actionLabel={copy('clinic.state.refresh')}
              onAction={() => void load()}
              direction={direction}
            />
          )}
          <FocusVisiblePressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            disabled={!canContinue}
            onPress={() =>
              canContinue &&
              selected &&
              router.push({
                pathname: '/appointments/new',
                params: {
                  facilityId: params.facilityId!,
                  doctorId: params.id!,
                  startsAt: selected.startsAt,
                  endsAt: selected.endsAt,
                  civilDate: selected.civilDate,
                  timezone: selected.timezone,
                },
              })
            }
            style={{ ...semanticStyles.primaryAction, opacity: canContinue ? 1 : 0.6 }}
          >
            <Text
              style={{
                ...localizedType(locale, 'label'),
                color: color.inverse,
                textAlign: 'center',
              }}
            >
              {copy('clinic.doctor.continue')}
            </Text>
          </FocusVisiblePressable>
        </>
      )}
    </ClinicSchedulingShell>
  );
}
