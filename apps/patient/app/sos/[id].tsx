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
import { isolateLtr, translate } from '@shifaa/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  assertDiscoverySosOnline,
  createPatientDiscoverySosClient,
  retainedMutationKey,
  type SosIncidentProjection,
} from '../../src/discovery-sos-api';
import { DiscoverySosShell } from '../../src/DiscoverySosShell';
import { usePatientLocaleController } from '../../src/locale-context';

export default function SosDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = usePatientLocaleController();
  const client = useMemo(() => createPatientDiscoverySosClient(locale), [locale]);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const activeLoad = useRef<AbortController | null>(null);
  const closeIntent = useRef<{ signature: string; key: string } | null>(null);
  const [incident, setIncident] = useState<SosIncidentProjection | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const load = async () => {
    try {
      assertDiscoverySosOnline();
      activeLoad.current?.abort();
      const controller = new AbortController();
      activeLoad.current = controller;
      setState('loading');
      const payload = (await client.getSosIncident(id, { signal: controller.signal })) as {
        incident?: SosIncidentProjection;
      };
      if (!payload.incident) throw new Error('invalid-response');
      setIncident(payload.incident);
      setState('ready');
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setState(
        error instanceof Error && error.message === 'offline-no-queue' ? 'offline' : 'error',
      );
    }
  };
  useEffect(() => {
    void load();
    return () => activeLoad.current?.abort();
  }, [id, client]);
  const close = async () => {
    if (!incident) return;
    try {
      assertDiscoverySosOnline();
      await client.closeSosIncident(
        incident.incident_id,
        { outcome_code: 'no_longer_needed' },
        incident.version,
        retainedMutationKey(closeIntent, 'close', {
          incidentId: incident.incident_id,
          version: incident.version,
          outcome: 'no_longer_needed',
        }),
      );
      await load();
    } catch (error: unknown) {
      setState(
        error instanceof Error && error.message === 'offline-no-queue' ? 'offline' : 'error',
      );
    }
  };
  const statusKey =
    incident?.status === 'accepted'
      ? 'sos.accepted'
      : incident?.status === 'closed'
        ? 'sos.closed'
        : incident?.status === 'matched'
          ? 'sos.matched'
          : 'sos.unmatched';
  const deliveryKey =
    incident?.contact_delivery && incident.contact_delivery !== 'not_requested'
      ? (`sos.contact.${incident.contact_delivery}` as const)
      : null;
  return (
    <DiscoverySosShell title="sos.title" emergency>
      <Call123Action
        label={translate(locale, 'sos.call123')}
        hint={translate(locale, 'sos.call123Hint')}
        direction={direction}
      />
      {state === 'loading' ? (
        <RouteStatePanel title={translate(locale, 'state.loading')} direction={direction} />
      ) : null}
      {state === 'offline' ? (
        <OfflineNoQueueBanner text={translate(locale, 'sos.offline')} direction={direction} />
      ) : null}
      {state === 'error' ? (
        <RouteStatePanel
          title={translate(locale, 'state.unavailable')}
          actionLabel={translate(locale, 'state.retry')}
          onAction={load}
          direction={direction}
        />
      ) : null}
      {state === 'ready' && incident ? (
        <View style={{ ...semanticStyles.card, gap: spacing.md }}>
          <Text
            accessibilityRole="header"
            style={{ ...localizedType(locale, 'title'), color: color.ink }}
          >
            {translate(locale, statusKey)}
          </Text>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {translate(locale, 'sos.informational')}
          </Text>
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.mutedInk, direction: 'ltr' }}
          >
            {isolateLtr(incident.incident_id)}
          </Text>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink, direction: 'ltr' }}>
            {isolateLtr(incident.initiated_at)}
          </Text>
          {incident.matched_facility ? (
            <>
              <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>
                {incident.matched_facility.name}
              </Text>
              <StalenessIndicator
                state={incident.matched_facility.operational_signal.freshness}
                label={translate(
                  locale,
                  `capacity.${incident.matched_facility.operational_signal.freshness}`,
                )}
                updatedLabel={translate(locale, 'capacity.lastUpdated')}
                updatedAt={incident.matched_facility.operational_signal.observed_at ?? undefined}
                direction={locale === 'ar-EG' ? 'rtl' : 'ltr'}
              />
            </>
          ) : null}
          {deliveryKey ? (
            <RouteStatePanel title={translate(locale, deliveryKey)} direction={direction} />
          ) : null}
          {incident.status !== 'closed' ? (
            <>
              <FocusVisiblePressable
                accessibilityRole="button"
                onPress={() => router.push(`/sos/${incident.incident_id}/share`)}
                style={semanticStyles.primaryAction}
              >
                <Text
                  style={{
                    ...localizedType(locale, 'label'),
                    color: color.inverse,
                    textAlign: 'center',
                  }}
                >
                  {translate(locale, 'share.title')}
                </Text>
              </FocusVisiblePressable>
              <FocusVisiblePressable
                accessibilityRole="button"
                onPress={close}
                style={semanticStyles.destructiveAction}
              >
                <Text
                  style={{
                    ...localizedType(locale, 'label'),
                    color: color.inverse,
                    textAlign: 'center',
                  }}
                >
                  {translate(locale, 'sos.closed')}
                </Text>
              </FocusVisiblePressable>
            </>
          ) : null}
        </View>
      ) : null}
    </DiscoverySosShell>
  );
}
