import {
  Call123Action,
  FocusVisiblePressable,
  OfflineNoQueueBanner,
  RouteStatePanel,
  StalenessIndicator,
  color,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { translate, type MessageKey } from '@shifaa/i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  createPatientDiscoverySosClient,
  dataArray,
  type FacilityProjection,
} from './discovery-sos-api';
import { DiscoverySosShell } from './DiscoverySosShell';
import { usePatientLocaleController } from './locale-context';

type DiscoveryState =
  | 'idle'
  | 'loading'
  | 'results'
  | 'empty'
  | 'location-denied'
  | 'offline'
  | 'error';

const serviceLabelKeys: Readonly<Record<string, MessageKey>> = {
  emergency_care: 'discovery.service.emergency_care',
  general_hospital: 'discovery.service.general_hospital',
  primary_care: 'discovery.service.primary_care',
};

export function DiscoveryScreen({ mapMode = false }: { mapMode?: boolean }) {
  const { locale } = usePatientLocaleController();
  const client = useMemo(() => createPatientDiscoverySosClient(locale), [locale]);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const [area, setArea] = useState('Synthetic Cairo');
  const [state, setState] = useState<DiscoveryState>('idle');
  const [facilities, setFacilities] = useState<FacilityProjection[]>([]);
  const activeSearch = useRef<AbortController | null>(null);
  useEffect(() => () => activeSearch.current?.abort(), []);
  const runSearch = async (query: { area?: string; near?: string }) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
      return;
    }
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setState('loading');
    try {
      const payload = await client.searchFacilities(
        { ...query, limit: 25 },
        { signal: controller.signal },
      );
      const items = dataArray(payload).filter((item): item is FacilityProjection =>
        Boolean(
          item && typeof item === 'object' && 'facility_id' in item && 'operational_signal' in item,
        ),
      );
      setFacilities(items);
      setState(items.length ? 'results' : 'empty');
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setState('error');
    }
  };
  const search = () => runSearch({ area });
  const useLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('location-denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => void runSearch({ near: `${coords.latitude},${coords.longitude}` }),
      () => setState('location-denied'),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 8_000 },
    );
  };
  return (
    <DiscoverySosShell title="discovery.title">
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
        {translate(locale, 'discovery.intro')}
      </Text>
      {mapMode ? (
        <RouteStatePanel
          title={translate(locale, 'discovery.mapUnavailable')}
          detail={translate(locale, 'discovery.listFallback')}
          direction={direction}
        />
      ) : null}
      <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
        <Text
          nativeID="discovery-area-label"
          style={{ ...localizedType(locale, 'label'), color: color.ink }}
        >
          {translate(locale, 'discovery.manualArea')}
        </Text>
        <TextInput
          aria-labelledby="discovery-area-label"
          accessibilityLabel={translate(locale, 'discovery.manualArea')}
          value={area}
          onChangeText={setArea}
          autoComplete="off"
          style={{
            minHeight: 48,
            borderColor: color.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingInline: 12,
            ...localizedType(locale, 'body'),
          }}
        />
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={search}
          style={semanticStyles.primaryAction}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.inverse, textAlign: 'center' }}
          >
            {translate(locale, 'discovery.search')}
          </Text>
        </FocusVisiblePressable>
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={useLocation}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {translate(locale, 'discovery.useLocation')}
          </Text>
        </FocusVisiblePressable>
      </View>
      {state === 'loading' ? (
        <RouteStatePanel title={translate(locale, 'state.loading')} direction={direction} />
      ) : null}
      {state === 'empty' ? (
        <RouteStatePanel title={translate(locale, 'discovery.empty')} direction={direction} />
      ) : null}
      {state === 'location-denied' ? (
        <RouteStatePanel
          title={translate(locale, 'discovery.locationDenied')}
          direction={direction}
        />
      ) : null}
      {state === 'offline' ? (
        <OfflineNoQueueBanner text={translate(locale, 'state.offline')} direction={direction} />
      ) : null}
      {state === 'error' ? (
        <RouteStatePanel
          title={translate(locale, 'state.unavailable')}
          actionLabel={translate(locale, 'state.retry')}
          onAction={search}
          direction={direction}
        />
      ) : null}
      {state === 'results'
        ? facilities.map((facility) => (
            <View key={facility.facility_id} style={{ ...semanticStyles.card, gap: spacing.sm }}>
              <Text
                accessibilityRole="header"
                style={{ ...localizedType(locale, 'title'), color: color.ink }}
              >
                {facility.name}
              </Text>
              <Text style={{ ...localizedType(locale, 'label'), color: color.positive }}>
                {translate(locale, 'discovery.verified')}
              </Text>
              {facility.address ? (
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {facility.address}
                </Text>
              ) : null}
              <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                {translate(locale, 'discovery.services')}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {facility.services
                  .map((service) =>
                    serviceLabelKeys[service]
                      ? translate(locale, serviceLabelKeys[service])
                      : service.replaceAll('_', ' '),
                  )
                  .join(' · ')}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.mutedInk }}>
                {translate(locale, 'discovery.ratingUnavailable')}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {translate(locale, 'capacity.countBandLabel')}:{' '}
                {translate(locale, `capacity.countBand.${facility.operational_signal.count_band}`)}
              </Text>
              <StalenessIndicator
                state={facility.operational_signal.freshness}
                label={translate(locale, `capacity.${facility.operational_signal.freshness}`)}
                updatedLabel={translate(locale, 'capacity.lastUpdated')}
                updatedAt={facility.operational_signal.observed_at ?? undefined}
                direction={locale === 'ar-EG' ? 'rtl' : 'ltr'}
              />
            </View>
          ))
        : null}
      <Call123Action
        label={translate(locale, 'sos.call123')}
        hint={translate(locale, 'sos.call123Hint')}
        direction={direction}
      />
    </DiscoverySosShell>
  );
}
