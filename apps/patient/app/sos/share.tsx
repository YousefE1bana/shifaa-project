import {
  OfflineNoQueueBanner,
  RouteStatePanel,
  color,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { translate } from '@shifaa/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  consumeEmergencyShareFragment,
  createPatientDiscoverySosClient,
} from '../../src/discovery-sos-api';
import { DiscoverySosShell } from '../../src/DiscoverySosShell';
import { usePatientLocaleController } from '../../src/locale-context';

export default function EmergencyShareViewerRoute() {
  const { locale } = usePatientLocaleController();
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const client = useRef(createPatientDiscoverySosClient('ar-EG')).current;
  const consumptionStarted = useRef(false);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'offline' | 'error'>('loading');
  const [profile, setProfile] = useState<{
    available_fields: Record<string, unknown>;
    unavailable_fields: string[];
  } | null>(null);
  useEffect(() => {
    if (consumptionStarted.current) return;
    consumptionStarted.current = true;
    const token = consumeEmergencyShareFragment();
    if (!token) {
      setState('gone');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setState('offline');
      return;
    }
    void client
      .viewEmergencyShare(token)
      .then((payload) => {
        const value = payload as {
          available_fields?: Record<string, unknown>;
          unavailable_fields?: string[];
        };
        setProfile({
          available_fields: value.available_fields ?? {},
          unavailable_fields: value.unavailable_fields ?? [],
        });
        setState('ready');
      })
      .catch((error: unknown) =>
        setState(
          error &&
            typeof error === 'object' &&
            'status' in error &&
            (error as { status: number }).status === 410
            ? 'gone'
            : 'error',
        ),
      );
  }, [client]);
  return (
    <DiscoverySosShell title="share.viewerTitle" emergency>
      {state === 'loading' ? (
        <RouteStatePanel title={translate(locale, 'state.loading')} direction={direction} />
      ) : null}
      {state === 'gone' ? (
        <RouteStatePanel
          title={translate(locale, 'share.expired')}
          assertive
          direction={direction}
        />
      ) : null}
      {state === 'offline' ? (
        <OfflineNoQueueBanner text={translate(locale, 'share.offline')} direction={direction} />
      ) : null}
      {state === 'error' ? (
        <RouteStatePanel
          title={translate(locale, 'state.unavailable')}
          assertive
          direction={direction}
        />
      ) : null}
      {state === 'ready' && profile ? (
        <View style={{ ...semanticStyles.card, gap: spacing.md }}>
          {Object.entries(profile.available_fields).map(([key, value]) => (
            <View key={key}>
              <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>{key}</Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </Text>
            </View>
          ))}
          {profile.unavailable_fields.length ? (
            <View accessibilityRole="alert">
              <Text style={{ ...localizedType(locale, 'body'), color: color.warning }}>
                {translate(locale, 'share.unavailable')}
              </Text>
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {profile.unavailable_fields.join(' · ')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </DiscoverySosShell>
  );
}
