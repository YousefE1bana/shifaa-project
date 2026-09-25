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
import type { DoctorSearchQuery } from '@shifaa/contracts';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  createPatientClinicSchedulingClient,
  isClinicSchedulingOffline,
} from './clinic-scheduling-api';
import {
  doctorResultPresentation,
  doctorResultStatus,
  isValidDoctorProjection,
} from './clinic-scheduling-discovery';
import {
  reconcileDiscovery,
  readFailureState,
  type DiscoveryViewState,
} from './clinic-scheduling-view-models';
import {
  ClinicTechnicalTimestamp,
  schedulingCopy,
  type SchedulingCopyKey,
} from './ClinicSchedulingShell';
import { usePatientLocaleController } from './locale-context';

export function DoctorDiscovery() {
  const { locale } = usePatientLocaleController();
  const router = useRouter();
  const api = useMemo(() => createPatientClinicSchedulingClient({ locale }), [locale]);
  const [specialty, setSpecialty] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [date, setDate] = useState('');
  const [near, setNear] = useState<string | undefined>();
  const [locationDenied, setLocationDenied] = useState(false);
  const [state, setState] = useState<DiscoveryViewState | null>(null);
  const sequence = useRef(0);
  const heading = useRef<View>(null);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const copy = (key: SchedulingCopyKey) => schedulingCopy(locale, key);
  const validDoctors =
    state && 'data' in state
      ? state.data.items.filter((item) =>
          isValidDoctorProjection(item, item.facilityId, item.doctorId),
        )
      : [];
  const search = async (position = near) => {
    const request = ++sequence.current;
    if (isClinicSchedulingOffline()) {
      setState({ status: 'offline', error: new Error('offline-no-queue') });
      return;
    }
    const query: DoctorSearchQuery = {
      ...(specialty.trim() ? { specialty: specialty.trim() } : {}),
      ...(facilityId.trim() ? { facilityId: facilityId.trim() } : {}),
      ...(date.trim() ? { date: date.trim() } : {}),
      ...(position ? { near: position } : {}),
    };
    setState({ status: 'loading' });
    try {
      const next = reconcileDiscovery(await api.searchDoctors(query));
      if (request === sequence.current) setState(next);
    } catch (error) {
      if (request === sequence.current) setState(readFailureState(error));
    } finally {
      if (request === sequence.current) heading.current?.focus?.();
    }
  };
  const useLocation = () => {
    const request = ++sequence.current;
    setState(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== sequence.current) return;
        const position = `${coords.latitude},${coords.longitude}`;
        setNear(position);
        setLocationDenied(false);
        void search(position);
      },
      () => {
        if (request === sequence.current) setLocationDenied(true);
      },
      { enableHighAccuracy: false, timeout: 8_000 },
    );
  };
  const field = (key: SchedulingCopyKey, value: string, change: (text: string) => void) => (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>{copy(key)}</Text>
      <TextInput
        accessibilityLabel={copy(key)}
        value={value}
        onChangeText={change}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: color.border,
          paddingInline: spacing.md,
          ...localizedType(locale, 'body'),
        }}
      />
    </View>
  );
  return (
    <View style={{ gap: spacing.md, direction }}>
      <Text
        accessibilityRole="header"
        style={{ ...localizedType(locale, 'title'), color: color.ink }}
      >
        {copy('clinic.route.discover.title')}
      </Text>
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
        {copy('clinic.route.discover.description')}
      </Text>
      <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
        {field('clinic.discover.specialty', specialty, setSpecialty)}
        {field('clinic.discover.facility', facilityId, setFacilityId)}
        {field('clinic.discover.date', date, setDate)}
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={() => void search()}
          style={semanticStyles.primaryAction}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.inverse, textAlign: 'center' }}
          >
            {copy('clinic.discover.search')}
          </Text>
        </FocusVisiblePressable>
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={() => {
            sequence.current += 1;
            setSpecialty('');
            setFacilityId('');
            setDate('');
            setNear(undefined);
            setLocationDenied(false);
            setState(null);
          }}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {copy('clinic.discover.clear')}
          </Text>
        </FocusVisiblePressable>
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={useLocation}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {copy('clinic.discover.useLocation')}
          </Text>
        </FocusVisiblePressable>
      </View>
      {locationDenied && (
        <RouteStatePanel title={copy('clinic.discover.locationDenied')} direction={direction} />
      )}
      <View ref={heading} focusable accessibilityRole="header">
        <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>
          {copy('clinic.discover.results')}
          {state && 'data' in state ? ` (${validDoctors.length})` : ''}
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
      {state?.status === 'error' && (
        <RouteStatePanel
          title={copy('clinic.state.error')}
          actionLabel={copy('clinic.state.retry')}
          onAction={() => void search()}
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
        <RouteStatePanel title={copy('clinic.discover.empty')} direction={direction} />
      )}
      {state && 'data' in state && state.data.items.length > 0 && validDoctors.length === 0 && (
        <RouteStatePanel
          title={copy('clinic.state.unavailable')}
          actionLabel={copy('clinic.state.refresh')}
          onAction={() => void search()}
          direction={direction}
        />
      )}
      {state &&
        'data' in state &&
        validDoctors.map((doctor) => {
          const result = doctorResultStatus(
            state.freshness,
            doctor.stale,
            doctor.nextAvailableSlot !== null,
          );
          const presentation = doctorResultPresentation(doctor, locale, state.freshness);
          if (!presentation) return null;
          return (
            <View
              key={`${doctor.facilityId}:${doctor.doctorId}`}
              style={{ ...semanticStyles.card, gap: spacing.sm }}
            >
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
                {presentation.verifiedLabel}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {presentation.feeLabel}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {presentation.paymentLabel}
              </Text>
              {result === 'available' && doctor.nextAvailableSlot ? (
                <ClinicTechnicalTimestamp
                  label={`${copy('clinic.discover.available')}:`}
                  value={doctor.nextAvailableSlot.startsAt}
                  locale={locale}
                />
              ) : (
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {presentation.availabilityLabel}
                </Text>
              )}
              <StalenessIndicator
                state={doctor.stale ? 'stale' : state.freshness}
                label={copy(
                  result === 'stale'
                    ? 'clinic.discover.stale'
                    : result === 'unknown'
                      ? 'clinic.discover.unknown'
                      : result === 'unavailable'
                        ? 'clinic.discover.unavailable'
                        : 'clinic.discover.available',
                )}
                updatedLabel={copy('clinic.discover.updated')}
                updatedAt={doctor.updatedAt}
                direction={direction}
                separateUpdatedAt
              />
              <FocusVisiblePressable
                accessibilityRole="link"
                accessibilityLabel={presentation.viewDoctorLabel}
                onPress={() =>
                  router.push({
                    pathname: '/doctors/[id]',
                    params: { id: doctor.doctorId, facilityId: doctor.facilityId },
                  })
                }
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
                  {copy('clinic.discover.viewDoctor')}
                </Text>
              </FocusVisiblePressable>
            </View>
          );
        })}
      {(state?.status === 'stale' || state?.status === 'unknown') && (
        <RouteStatePanel
          title={copy('clinic.discover.noCurrent')}
          actionLabel={copy('clinic.state.refresh')}
          onAction={() => void search()}
          direction={direction}
        />
      )}
    </View>
  );
}
